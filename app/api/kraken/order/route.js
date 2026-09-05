import crypto from "node:crypto";
import {
  buildKrakenMarginPlan,
  getKrakenExecutionConfig,
  krakenPrivate,
  krakenPublic,
  resolveKrakenMarket,
  selectPairResult,
} from "../../../lib/kraken-client.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CONFIG = getKrakenExecutionConfig();

function response(data, status = 200) {
  return Response.json(data, { status });
}

function shortClientOrderId(signalId) {
  return `nbs-${crypto.createHash("sha256").update(signalId).digest("hex").slice(0, 14)}`;
}

export async function POST(request) {
  const executorKey = process.env.NBS_EXECUTOR_KEY;
  const providedKey = request.headers.get("x-nbs-executor-key");

  if (!executorKey || providedKey !== executorKey) {
    return response({ ok: false, stage: "AUTH", error: "Unauthorized executor request" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return response({ ok: false, stage: "VALIDATION", error: "Invalid JSON body" }, 400);
  }

  const direction = String(body?.direction || "").toUpperCase();
  const signalId = String(body?.signalId || "").trim();
  const entry = Number(body?.entry);
  const sl = Number(body?.sl);
  const signalTimestampMs = Date.parse(body?.signalTimestamp ?? body?.signal_time ?? "");
  const dryRun = body?.dryRun !== false;
  const liveConfirm = body?.liveConfirm === true;
  const marketMatch = resolveKrakenMarket(body?.symbol);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (String(body?.environment || "").toUpperCase() !== "LIVE") {
    return response({ ok: false, stage: "ENVIRONMENT_BLOCK", error: "Kraken executor accepts LIVE explicitly only" }, 400);
  }

  if (body?.trade_ready !== true || !signalId || !marketMatch) {
    return response({ ok: false, stage: "VALIDATION", error: "trade_ready, signalId and BTC/ETH symbol are required" }, 400);
  }

  if (!["LONG", "SHORT"].includes(direction)) {
    return response({ ok: false, stage: "VALIDATION", error: "direction must be LONG or SHORT" }, 400);
  }

  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(sl) || sl <= 0) {
    return response({ ok: false, stage: "SL_REQUIRED", error: "Valid entry and SL are mandatory" }, 400);
  }

  if ((direction === "LONG" && sl >= entry) || (direction === "SHORT" && sl <= entry)) {
    return response({ ok: false, stage: "INVALID_SL_STRUCTURE", error: "SL is on the wrong side of entry" }, 400);
  }

  const ageMs = Date.now() - signalTimestampMs;
  if (!Number.isFinite(signalTimestampMs) || ageMs < -30000 || ageMs > CONFIG.maxSignalAgeMs) {
    return response({ ok: false, stage: "STALE_SIGNAL_BLOCK", error: "Signal timestamp is missing, future, or stale" }, 409);
  }

  if (!dryRun && (!CONFIG.liveTradingEnabled || !liveConfirm)) {
    return response({ ok: false, stage: "LIVE_KILL_SWITCH", error: "Kraken LIVE order blocked by kill switch", orderWouldBeSent: false }, 409);
  }

  const [, market] = marketMatch;
  const executionSignalId = `kraken:${signalId}`;
  let pairSpec;
  let pairKey;
  let ticker;
  let openPositions;

  try {
    const [pairResult, tickerResult, positionsResult] = await Promise.all([
      krakenPublic("AssetPairs", { pair: market.pair }),
      krakenPublic("Ticker", { pair: market.pair }),
      krakenPrivate("OpenPositions", { docalcs: true, consolidation: "market" }),
    ]);
    const selectedPair = selectPairResult(pairResult, market.pair);
    const selectedTicker = selectPairResult(tickerResult, market.pair);
    pairKey = selectedPair?.[0];
    pairSpec = selectedPair?.[1];
    ticker = selectedTicker?.[1];
    openPositions = positionsResult || {};
  } catch (error) {
    return response({ ok: false, stage: "KRAKEN_PREFLIGHT", error: error.message, orderWouldBeSent: false }, 502);
  }

  if (!pairSpec || pairSpec.status !== "online") {
    return response({ ok: false, stage: "MARKET_NOT_ONLINE", pair: market.pair, orderWouldBeSent: false }, 409);
  }

  const bid = Number(ticker?.b?.[0]);
  const ask = Number(ticker?.a?.[0]);
  const marketPrice = direction === "LONG" ? ask : bid;
  const mid = (bid + ask) / 2;
  const spreadBps = ((ask - bid) / mid) * 10000;

  if (![bid, ask, marketPrice, spreadBps].every(Number.isFinite) || bid <= 0 || ask <= bid) {
    return response({ ok: false, stage: "STALE_MARKET_DATA", error: "Invalid Kraken bid/ask", orderWouldBeSent: false }, 409);
  }

  if (spreadBps > CONFIG.maxSpreadBps) {
    return response({ ok: false, stage: "SPREAD_BLOCK", spreadBps, maxSpreadBps: CONFIG.maxSpreadBps, orderWouldBeSent: false }, 409);
  }

  const maxEntryDrift = Math.min(entry * 0.0025, Math.abs(entry - sl) * 0.25);
  if (Math.abs(marketPrice - entry) > maxEntryDrift) {
    return response({ ok: false, stage: "ENTRY_DRIFT_BLOCK", entry, marketPrice, maxEntryDrift, orderWouldBeSent: false }, 409);
  }

  const duplicate = Object.entries(openPositions).find(([, position]) => {
    const pair = String(position?.pair || "").toUpperCase();
    return [pairKey, pairSpec.altname, pairSpec.wsname?.replace("/", "")]
      .filter(Boolean)
      .map((value) => String(value).toUpperCase())
      .includes(pair);
  });

  if (duplicate) {
    return response({ ok: false, stage: "DUPLICATE_POSITION_BLOCK", positionId: duplicate[0], pair: market.pair, orderWouldBeSent: false }, 409);
  }

  const plan = buildKrakenMarginPlan({
    price: marketPrice,
    pairSpec,
    direction,
    targetMarginGBP: CONFIG.targetMarginGBP,
    requestedLeverage: CONFIG.requestedLeverage,
    toleranceGBP: CONFIG.marginToleranceGBP,
  });

  if (!plan.ok) {
    return response({ ok: false, ...plan, pair: market.pair, orderWouldBeSent: false }, 409);
  }

  const order = {
    pair: market.pair,
    type: direction === "LONG" ? "buy" : "sell",
    ordertype: "market",
    volume: plan.volume,
    leverage: String(plan.leverage),
    "close[ordertype]": "stop-loss",
    "close[price]": String(sl),
    cl_ord_id: shortClientOrderId(signalId),
    deadline: new Date(Date.now() + 15000).toISOString(),
    validate: dryRun ? "true" : "false",
  };

  if (dryRun) {
    try {
      const validation = await krakenPrivate("AddOrder", order);
      return response({
        ok: true,
        stage: "DRY_RUN_VALIDATED",
        environment: "LIVE",
        pair: market.pair,
        direction,
        signalId,
        orderWouldBeSent: false,
        brokerValidation: validation,
        plan: {
          ...plan,
          plannedMarginGBP: Number(plan.plannedMarginGBP.toFixed(4)),
          exposureGBP: Number(plan.exposureGBP.toFixed(4)),
          entry,
          marketPrice,
          sl,
          tpOrders: false,
        },
      });
    } catch (error) {
      return response({ ok: false, stage: "KRAKEN_VALIDATE_REJECTED", error: error.message, orderWouldBeSent: false, plan }, 409);
    }
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return response({ ok: false, stage: "IDEMPOTENCY_ENV", error: "Missing Supabase executor environment variables", orderWouldBeSent: false }, 500);
  }

  const executionTable = "signal_execution_guard";
  const claimResponse = await fetch(`${supabaseUrl}/rest/v1/${executionTable}`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      signal_id: executionSignalId,
      environment: "LIVE",
      symbol: market.pair,
      direction,
      status: "CLAIMED",
      failure_reason: null,
    }),
  });

  if (claimResponse.status === 409) {
    return response({ ok: false, stage: "DUPLICATE_SIGNAL_BLOCKED", signalId, orderWouldBeSent: false }, 409);
  }

  if (!claimResponse.ok) {
    return response({ ok: false, stage: "IDEMPOTENCY_ERROR", error: await claimResponse.text(), orderWouldBeSent: false }, 500);
  }

  try {
    const placed = await krakenPrivate("AddOrder", order);
    const txids = Array.isArray(placed?.txid) ? placed.txid : [];
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/${executionTable}?signal_id=eq.${encodeURIComponent(executionSignalId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "ORDER_SUBMITTED",
          updated_at: new Date().toISOString(),
          order_id: txids.length ? txids.join(",") : null,
          failure_reason: null,
        }),
      }
    );

    if (!updateResponse.ok) {
      return response({ ok: false, stage: "ORDER_STATE_UNCERTAIN", error: "Order submitted but durable status update failed", retryAutomatically: false, orderWouldBeSent: true, result: placed }, 502);
    }

    return response({ ok: true, stage: "ORDER_SUBMITTED", environment: "LIVE", signalId, pair: market.pair, orderWouldBeSent: true, result: placed });
  } catch (error) {
    await fetch(
      `${supabaseUrl}/rest/v1/${executionTable}?signal_id=eq.${encodeURIComponent(executionSignalId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "ORDER_STATE_UNCERTAIN",
          updated_at: new Date().toISOString(),
          failure_reason: `${error.code || "KRAKEN_ORDER_ERROR"}: ${error.message}`,
        }),
      }
    ).catch(() => null);
    return response({ ok: false, stage: "ORDER_STATE_UNCERTAIN", error: error.message, retryAutomatically: false, orderWouldBeSent: true }, 502);
  }
}
