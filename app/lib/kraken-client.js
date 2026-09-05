import crypto from "node:crypto";

const KRAKEN_BASE_URL = "https://api.kraken.com";

let lastNonce = 0;
let privateRequestQueue = Promise.resolve();

function nextNonce() {
  const now = Date.now() * 1000;
  lastNonce = Math.max(now, lastNonce + 1);
  return String(lastNonce);
}

function assertKrakenResponse(data, endpoint) {
  const errors = Array.isArray(data?.error) ? data.error : [];

  if (errors.length > 0) {
    const error = new Error(`Kraken ${endpoint}: ${errors.join(", ")}`);
    error.code = errors[0];
    error.krakenErrors = errors;
    throw error;
  }

  return data?.result ?? null;
}

export async function krakenPublic(endpoint, params = {}) {
  const url = new URL(`/0/public/${endpoint}`, KRAKEN_BASE_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data) {
    throw new Error(`Kraken public ${endpoint} HTTP ${response.status}`);
  }

  return assertKrakenResponse(data, endpoint);
}

export function createKrakenSignature(path, payload, secret) {
  const encoded = new URLSearchParams(payload).toString();
  const nonce = String(payload.nonce);
  const digest = crypto
    .createHash("sha256")
    .update(nonce + encoded)
    .digest();

  return crypto
    .createHmac("sha512", Buffer.from(secret, "base64"))
    .update(Buffer.concat([Buffer.from(path), digest]))
    .digest("base64");
}

export function krakenPrivate(endpoint, params = {}) {
  const execute = async () => {
    const apiKey = process.env.KRAKEN_API_KEY;
    const apiSecret = process.env.KRAKEN_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error("Missing KRAKEN_API_KEY or KRAKEN_API_SECRET");
    }

    const path = `/0/private/${endpoint}`;
    const payload = { nonce: nextNonce(), ...params };
    const encoded = new URLSearchParams(payload).toString();
    const signature = createKrakenSignature(path, payload, apiSecret);

    const response = await fetch(`${KRAKEN_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "API-Key": apiKey,
        "API-Sign": signature,
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: encoded,
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      throw new Error(`Kraken private ${endpoint} HTTP ${response.status}`);
    }

    return assertKrakenResponse(data, endpoint);
  };

  const pending = privateRequestQueue.then(execute, execute);
  privateRequestQueue = pending.then(
    () => undefined,
    () => undefined
  );
  return pending;
}

export function getKrakenExecutionConfig() {
  return {
    environment: "LIVE",
    liveTradingEnabled:
      process.env.NBS_KRAKEN_LIVE_TRADING_ENABLED === "true",
    targetMarginGBP: 10,
    marginToleranceGBP: 0.01,
    requestedLeverage: 10,
    maxSignalAgeMs: Number(process.env.NBS_MAX_SIGNAL_AGE_MS || 180000),
    maxSpreadBps: Number(process.env.NBS_KRAKEN_MAX_SPREAD_BPS || 20),
  };
}

export const KRAKEN_MARKETS = Object.freeze({
  BTC: {
    pair: "XBTGBP",
    aliases: ["BTC", "BTCGBP", "BTCUSD", "XBT", "XBTGBP", "XBTUSD"],
  },
  ETH: { pair: "ETHGBP", aliases: ["ETH", "ETHGBP", "ETHUSD"] },
});

export function resolveKrakenMarket(symbol) {
  const normalized = String(symbol || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  return Object.entries(KRAKEN_MARKETS).find(([, market]) =>
    market.aliases.includes(normalized)
  ) ?? null;
}

export function selectPairResult(result, requestedPair) {
  const entries = Object.entries(result || {});
  return entries.find(([, value]) =>
    [value?.altname, value?.wsname?.replace("/", "")]
      .filter(Boolean)
      .map((item) => String(item).toUpperCase())
      .includes(String(requestedPair).toUpperCase())
  ) ?? entries[0] ?? null;
}

export function floorToDecimals(value, decimals) {
  const factor = 10 ** decimals;
  return Math.floor((value + Number.EPSILON) * factor) / factor;
}

export function buildKrakenMarginPlan({
  price,
  pairSpec,
  direction,
  targetMarginGBP = 10,
  requestedLeverage = 10,
  toleranceGBP = 0.01,
}) {
  const leverageList = direction === "LONG"
    ? pairSpec?.leverage_buy
    : pairSpec?.leverage_sell;

  const leverage = Array.isArray(leverageList)
    ? Math.max(
        0,
        ...leverageList.filter(
          (value) =>
            Number.isFinite(Number(value)) &&
            Number(value) <= requestedLeverage
        )
      )
    : 0;

  if (leverage <= 0) {
    return {
      ok: false,
      stage: "LEVERAGE_NOT_AVAILABLE",
      availableLeverage: Array.isArray(leverageList) ? leverageList : [],
    };
  }

  const lotDecimals = Number(pairSpec?.lot_decimals);
  const orderMin = Number(pairSpec?.ordermin);
  const costMin = Number(pairSpec?.costmin || 0);
  const exposureGBP = targetMarginGBP * leverage;
  const volume = floorToDecimals(exposureGBP / price, lotDecimals);
  const actualExposureGBP = volume * price;
  const plannedMarginGBP = actualExposureGBP / leverage;

  if (!Number.isFinite(volume) || volume <= 0 || volume < orderMin) {
    return { ok: false, stage: "MIN_VOLUME_BLOCK", volume, orderMin };
  }

  if (actualExposureGBP < costMin) {
    return {
      ok: false,
      stage: "MIN_COST_BLOCK",
      actualExposureGBP,
      costMin,
    };
  }

  if (Math.abs(plannedMarginGBP - targetMarginGBP) > toleranceGBP) {
    return {
      ok: false,
      stage: "EXACT_MARGIN_UNAVAILABLE",
      targetMarginGBP,
      plannedMarginGBP,
      toleranceGBP,
    };
  }

  return {
    ok: true,
    volume: volume.toFixed(lotDecimals),
    volumeNumber: volume,
    targetMarginGBP,
    plannedMarginGBP,
    exposureGBP: actualExposureGBP,
    leverage,
  };
}
