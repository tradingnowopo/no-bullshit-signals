import WebSocket from "ws";
import {
  getCTraderConfig,
  validateRequestedEnvironment,
} from "../../../lib/ctrader-config.js";
import {
  createSizingProof,
  verifySizingProof,
} from "../../../lib/ctrader-sizing-proof.js";
import { buildProtectedMarketOrder } from "../../../lib/ctrader-order-payload.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CTRADER = getCTraderConfig();
const WS_URL = CTRADER.wsUrl;
const WS_CONNECT_TIMEOUT_MS = 10000;
const WS_AUTH_DELAY_MS = 500;

const ACCOUNT_ID = CTRADER.accountId;
const SYMBOL_ID = CTRADER.symbolId;
const SYMBOL_NAME = CTRADER.symbolName;

// Statusy, które mogą zostać bezpiecznie ponowione.
// Warunek dodatkowy: rekord NIE może posiadać żadnego broker ID.
const SAFE_RETRY_STATUSES = new Set([
  "MARKET_CLOSED",
]);

export async function POST(request) {
  // ==================================================
  // AUTH
  // ==================================================

  const executorKey = process.env.NBS_EXECUTOR_KEY;
  const providedKey = request.headers.get("x-nbs-executor-key");

  if (!executorKey || providedKey !== executorKey) {
    return Response.json(
      {
        ok: false,
        stage: "AUTH",
        error: "Unauthorized executor request",
      },
      { status: 401 }
    );
  }

  // ==================================================
  // ENV
  // ==================================================

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const clientId = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  const accessToken = process.env.CTRADER_ACCESS_TOKEN;

  if (!clientId || !clientSecret || !accessToken) {
    return Response.json(
      {
        ok: false,
        stage: "ENV",
        error: "Missing cTrader environment variables",
      },
      { status: 500 }
    );
  }

  // ==================================================
  // BODY
  // ==================================================

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "Invalid JSON body",
      },
      { status: 400 }
    );
  }

  const direction = String(body?.direction || "").toUpperCase();
  const symbol = String(body?.symbol || "").toUpperCase();
  const signalId = String(body?.signalId || "").trim();
  const tradeReady = body?.trade_ready;
  const sizingOnly = body?.sizingOnly === true;

if (tradeReady !== true) {
  return Response.json(
    {
      ok: false,
      stage: "TRADE_NOT_READY",
      error: "trade_ready must be true",
      signalId,
      orderWouldBeSent: false,
    },
    { status: 409 }
  );
}

  if (!signalId) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "signalId is required",
      },
      { status: 400 }
    );
  }

  const volume = Number(body?.volume ?? 100);
  const sizingVolumes = Array.from({ length: 200 }, (_, index) => (index + 1) * 100);

  const entry = Number(body?.entry);
  const sl = Number(body?.sl);
  const tp1 = Number(body?.tp1);
  const tp2 = Number(body?.tp2);
  const marketPrice = Number(body?.marketPrice);
  const actualMarginGBP = Number(
    body?.executionPolicy?.actualMarginGBP ??
    body?.positionSizing?.actualMarginGBP ??
    body?.actualMarginGBP
  );
  const effectiveLeverage = Number(
    body?.executionPolicy?.leverage ??
    body?.positionSizing?.effectiveLeverage ??
    body?.effectiveLeverage
  );
  const signalTimestampMs = Date.parse(
    body?.signalTimestamp ?? body?.signal_time ?? ""
  );
  const sizingProofIssuedAt = Number(body?.sizingProof?.issuedAt);

  if (!validateRequestedEnvironment(body?.environment, CTRADER.environment)) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: `Requested environment must match configured ${CTRADER.environment} environment`,
      },
      { status: 400 }
    );
  }

  if (symbol !== "USOIL") {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: `Unsupported symbol: ${symbol}`,
      },
      { status: 400 }
    );
  }

  if (!["LONG", "SHORT"].includes(direction)) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "direction must be LONG or SHORT",
      },
      { status: 400 }
    );
  }

  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(sl) || sl <= 0) {
    return Response.json(
      { ok: false, stage: "SL_REQUIRED", error: "Valid entry and SL are mandatory" },
      { status: 400 }
    );
  }

  if (
    (direction === "LONG" && sl >= entry) ||
    (direction === "SHORT" && sl <= entry)
  ) {
    return Response.json(
      { ok: false, stage: "INVALID_SL_STRUCTURE", error: "SL is on the wrong side of entry" },
      { status: 400 }
    );
  }

  if (
    !sizingOnly &&
    (!Number.isFinite(actualMarginGBP) ||
      actualMarginGBP <= 0 ||
      actualMarginGBP > CTRADER.targetMarginGBP + CTRADER.marginToleranceGBP)
  ) {
    return Response.json(
      {
        ok: false,
        stage: "MARGIN_ATTESTATION_BLOCK",
        error: "Order requires broker sizing proof for positive margin not exceeding £10",
        orderWouldBeSent: false,
      },
      { status: 409 }
    );
  }

  if (
    !sizingOnly &&
    (!Number.isFinite(effectiveLeverage) ||
      effectiveLeverage <= 0 ||
      effectiveLeverage > CTRADER.maxEffectiveLeverage + CTRADER.leverageTolerance)
  ) {
    return Response.json(
      {
        ok: false,
        stage: "LEVERAGE_ATTESTATION_BLOCK",
        error: "Order requires broker sizing proof for leverage no greater than 10x",
        orderWouldBeSent: false,
      },
      { status: 409 }
    );
  }

  const proofPayload = {
    environment: CTRADER.environment,
    accountId: ACCOUNT_ID,
    symbolId: SYMBOL_ID,
    direction,
    volume,
    entry,
    sl,
    actualMarginGBP,
    effectiveLeverage,
    issuedAt: sizingProofIssuedAt,
  };

  if (!sizingOnly && !verifySizingProof(
    proofPayload,
    body?.sizingProof?.signature,
    executorKey,
    60000
  )) {
    return Response.json(
      {
        ok: false,
        stage: "SIZING_PROOF_BLOCK",
        error: "Missing, stale, or mismatched broker sizing proof",
        orderWouldBeSent: false,
      },
      { status: 409 }
    );
  }

  const maxSignalAgeMs = Number(process.env.NBS_MAX_SIGNAL_AGE_MS || 180000);
  if (
    !Number.isFinite(signalTimestampMs) ||
    Date.now() - signalTimestampMs < -30000 ||
    Date.now() - signalTimestampMs > maxSignalAgeMs
  ) {
    return Response.json(
      {
        ok: false,
        stage: "STALE_SIGNAL_BLOCK",
        error: "Signal timestamp is missing, in the future, or stale",
        orderWouldBeSent: false,
      },
      { status: 409 }
    );
  }

  const stopDistance = Math.abs(entry - sl);
  const maxEntryDrift = Math.min(0.08, Math.max(0.02, stopDistance * 0.25));
  if (
    !Number.isFinite(marketPrice) ||
    Math.abs(marketPrice - entry) > maxEntryDrift
  ) {
    return Response.json(
      {
        ok: false,
        stage: "ENTRY_DRIFT_BLOCK",
        error: "Live market price moved too far from planned entry",
        entry,
        marketPrice: Number.isFinite(marketPrice) ? marketPrice : null,
        maxEntryDrift,
        orderWouldBeSent: false,
      },
      { status: 409 }
    );
  }

  if (
    !Number.isFinite(volume) ||
    volume < 100 ||
    volume % 100 !== 0
  ) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "volume must be >= 100 and divisible by 100",
      },
      { status: 400 }
    );
  }

  if (volume > 500000) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "volume exceeds SpotCrude maxVolume",
      },
      { status: 400 }
    );
  }

  const tradeSide = direction === "LONG" ? 1 : 2;

  const validateOnly = body?.validateOnly === true;
  const preflightOnly = body?.preflightOnly === true;
  const idempotencyTestOnly = body?.idempotencyTestOnly === true;
  const dryRun = body?.dryRun === true;

  if (
    CTRADER.live &&
    !validateOnly &&
    !preflightOnly &&
    !idempotencyTestOnly &&
    !dryRun &&
    (!CTRADER.liveTradingEnabled || body?.liveConfirm !== true)
  ) {
    return Response.json(
      {
        ok: false,
        stage: "LIVE_KILL_SWITCH",
        error:
          "LIVE order blocked. Enable NBS_LIVE_TRADING_ENABLED and send liveConfirm=true.",
        environment: CTRADER.environment,
        orderWouldBeSent: false,
      },
      { status: 409 }
    );
  }

  const effectivePreflightOnly = preflightOnly || dryRun || sizingOnly;

  // Supabase is an execution/idempotency dependency, not a read-only
  // validation or broker-preflight dependency. This permits an isolated LIVE
  // connectivity check while the kill switch remains closed.
  if (
    !validateOnly &&
    !effectivePreflightOnly &&
    (!supabaseUrl || !supabaseServiceKey)
  ) {
    return Response.json(
      {
        ok: false,
        stage: "ENV",
        error: "Missing Supabase executor environment variables",
        orderWouldBeSent: false,
      },
      { status: 500 }
    );
  }

  // ==================================================
  // VALIDATION ONLY
  // ==================================================

  if (validateOnly) {
    return Response.json({
      ok: true,
      stage: "VALIDATION_OK",
      validateOnly: true,
      environment: CTRADER.environment,
      accountId: ACCOUNT_ID,
      symbol: SYMBOL_NAME,
      symbolId: SYMBOL_ID,
      direction,
      tradeSide,
      volume,
      signalPlan: {
        entry: Number.isFinite(entry) ? entry : null,
        sl: Number.isFinite(sl) ? sl : null,
        tp1: Number.isFinite(tp1) ? tp1 : null,
        tp2: Number.isFinite(tp2) ? tp2 : null,
      },
      orderWouldBeSent: false,
    });
  }

  // ==================================================
  // SUPABASE HELPERS
  // ==================================================

  const executionTable = CTRADER.live
    ? "signal_execution_guard"
    : "ctrader_signal_executions";

  async function getExecution() {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${executionTable}?signal_id=eq.${encodeURIComponent(
        signalId
      )}&select=*`,
      {
        method: "GET",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `EXECUTION_READ_FAILED: ${errorText}`
      );
    }

    const rows = await response.json();

    return Array.isArray(rows) && rows.length > 0
      ? rows[0]
      : null;
  }

  async function updateExecution(status, fields = {}) {
    const liveFields = CTRADER.live
      ? {
          ...(fields.position_id !== undefined
            ? { position_id: fields.position_id === null ? null : String(fields.position_id) }
            : {}),
          ...(fields.order_id !== undefined
            ? { order_id: fields.order_id === null ? null : String(fields.order_id) }
            : {}),
          ...(fields.error_message !== undefined || fields.error_code !== undefined
            ? { failure_reason: fields.error_message ?? fields.error_code ?? null }
            : {}),
        }
      : fields;

    const response = await fetch(
      `${supabaseUrl}/rest/v1/${executionTable}?signal_id=eq.${encodeURIComponent(
        signalId
      )}`,
      {
        method: "PATCH",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status,
          updated_at: new Date().toISOString(),
          ...liveFields,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `EXECUTION_UPDATE_FAILED: ${errorText}`
      );
    }
  }

  // ==================================================
  // IDEMPOTENCY CLAIM
  // ==================================================

  if (!effectivePreflightOnly) {
    const claimPayload = CTRADER.live
      ? {
          signal_id: signalId,
          environment: CTRADER.environment,
          symbol,
          direction,
          status: idempotencyTestOnly ? "CLAIMED_TEST" : "CLAIMED",
          failure_reason: null,
        }
      : {
          signal_id: signalId,
          environment: CTRADER.environment,
          symbol,
          direction,
          status: idempotencyTestOnly ? "CLAIMED_TEST" : "CLAIMED",
          entry: Number.isFinite(entry) ? entry : null,
          sl: Number.isFinite(sl) ? sl : null,
          tp1: Number.isFinite(tp1) ? tp1 : null,
          tp2: Number.isFinite(tp2) ? tp2 : null,
          error_code: null,
          error_message: null,
        };

    const claimResponse = await fetch(
      `${supabaseUrl}/rest/v1/${executionTable}`,
      {
        method: "POST",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(claimPayload),
      }
    );

    // ==================================================
    // SIGNAL ALREADY EXISTS
    // ==================================================

    if (claimResponse.status === 409) {
      let existing;

      try {
        existing = await getExecution();
      } catch (err) {
        return Response.json(
          {
            ok: false,
            stage: "IDEMPOTENCY_READ_ERROR",
            error: err.message,
            signalId,
            orderWouldBeSent: false,
          },
          { status: 500 }
        );
      }

      if (!existing) {
        return Response.json(
          {
            ok: false,
            stage: "IDEMPOTENCY_STATE_ERROR",
            error:
              "Duplicate conflict occurred but execution row could not be loaded",
            signalId,
            orderWouldBeSent: false,
          },
          { status: 500 }
        );
      }

      const hasBrokerIdentity =
        existing.position_id !== null &&
        existing.position_id !== undefined
          ? true
          : existing.order_id !== null &&
            existing.order_id !== undefined
          ? true
          : existing.deal_id !== null &&
            existing.deal_id !== undefined;

      const existingStatus = String(
        existing.status || ""
      ).toUpperCase();

      const safeRetry =
        SAFE_RETRY_STATUSES.has(existingStatus) &&
        !hasBrokerIdentity;

      // ----------------------------------------------
      // SAFE RECLAIM
      // ----------------------------------------------

      if (safeRetry) {
        try {
          await updateExecution("CLAIMED", {
            error_code: null,
            error_message: null,

            // Important: old failed attempt must not
            // leave stale broker identifiers.
            position_id: null,
            order_id: null,
            deal_id: null,
            execution_price: null,
            executed_volume: null,
          });
        } catch (err) {
          return Response.json(
            {
              ok: false,
              stage: "IDEMPOTENCY_RECLAIM_ERROR",
              error: err.message,
              signalId,
              previousStatus: existingStatus,
              orderWouldBeSent: false,
            },
            { status: 500 }
          );
        }
      } else {
        return Response.json(
          {
            ok: false,
            stage: "DUPLICATE_SIGNAL_BLOCKED",
            signalId,
            previousStatus: existingStatus,
            brokerIdentityPresent: hasBrokerIdentity,
            positionId: existing.position_id ?? null,
            orderId: existing.order_id ?? null,
            dealId: existing.deal_id ?? null,
            orderWouldBeSent: false,
          },
          { status: 409 }
        );
      }
    } else if (!claimResponse.ok) {
      const claimError = await claimResponse.text();

      return Response.json(
        {
          ok: false,
          stage: "IDEMPOTENCY_ERROR",
          error: claimError,
          signalId,
          orderWouldBeSent: false,
        },
        { status: 500 }
      );
    }

    if (idempotencyTestOnly) {
      return Response.json({
        ok: true,
        stage: "IDEMPOTENCY_CLAIM_OK",
        signalId,
        environment: CTRADER.environment,
        orderWouldBeSent: false,
      });
    }
  }

  // ==================================================
  // CTRADER
  // ==================================================

  const log = [];

  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);

    let finished = false;

    // Critical safety state:
    // false = we know 2106 has NOT been called.
    // true  = order request has been sent to websocket.
    let orderSendStarted = false;

    // App-auth routing can transiently fail with 2142/CANT_ROUTE_REQUEST.
    // Retry the 2100 application-auth request on the same socket before
    // touching execution state. This is safe because 2106 has not been sent.
    let appAuthAttempts = 0;
    let brokerEffectiveLeverage = null;
    const MAX_APP_AUTH_ATTEMPTS = 3;
    const APP_AUTH_RETRY_DELAY_MS = 2000;
    let appAuthRetryTimer = null;

    const finish = (data, status = 200) => {
      if (finished) return;

      finished = true;

      clearTimeout(timeout);
      if (appAuthRetryTimer) {
        clearTimeout(appAuthRetryTimer);
        appAuthRetryTimer = null;
      }

      try {
        ws.terminate();
      } catch {}

      resolve(
        Response.json(
          {
            ...data,
            log,
          },
          { status }
        )
      );
    };

    const send = (payloadType, payload, clientMsgId) => {
      ws.send(
        JSON.stringify({
          clientMsgId,
          payloadType,
          payload,
        })
      );
    };

    // ==================================================
    // TIMEOUT
    // ==================================================

    const timeout = setTimeout(async () => {
      if (!effectivePreflightOnly) {
        try {
          const timeoutStatus = orderSendStarted
            ? "ORDER_STATE_UNCERTAIN"
            : "TIMEOUT_BEFORE_ORDER";

          await updateExecution(timeoutStatus, {
            error_code: "TIMEOUT",
            error_message: orderSendStarted
              ? "Timeout occurred after order send started"
              : "Timeout occurred before order send started",
          });

          log.push(
            `EXECUTION_DB_${timeoutStatus}_UPDATED`
          );
        } catch (err) {
          log.push("EXECUTION_DB_UPDATE_FAILED");
          console.error(err);
        }
      }

      if (orderSendStarted) {
        finish(
          {
            ok: false,
            stage: "ORDER_STATE_UNCERTAIN",
            error:
              "cTrader timed out after order send started",
            retryPolicy: "CHECK_POSITION_FIRST",
            retryAutomatically: false,
            safetyReason:
              "The broker may have received or executed the order. Check open positions before retrying.",
          },
          504
        );

        return;
      }

      finish(
        {
          ok: false,
          stage: "TIMEOUT_BEFORE_ORDER",
          error:
            "cTrader timed out before the order was sent",
          retryPolicy: "SAFE_TO_RETRY_MANUALLY",
          retryAutomatically: false,
          safetyReason:
            "No 2106 order request was sent during this attempt.",
        },
        504
      );
    }, 15000);

    // ==================================================
    // OPEN
    // ==================================================

    const sendAppAuth = () => {
      if (finished) return;
      if (ws.readyState !== WebSocket.OPEN) return;

      appAuthAttempts += 1;
      log.push(`APP_AUTH_ATTEMPT_${appAuthAttempts}`);

      const clientMsgId = `NBS_APP_AUTH_${Date.now()}_${appAuthAttempts}`;

      send(
        2100,
        {
          clientId,
          clientSecret,
        },
        clientMsgId
      );

      log.push("2100_SEND_CALLED");
      log.push(`2100_CLIENT_MSG_ID_${clientMsgId}`);
    };

    ws.on("open", () => {
      log.push("WEBSOCKET_OPEN");

      setTimeout(() => {
        sendAppAuth();
      }, WS_AUTH_DELAY_MS);
    });

    // ==================================================
    // MESSAGE
    // ==================================================

    ws.on("message", async (data) => {
      let msg;

      try {
        msg = JSON.parse(data.toString());
      } catch {
        finish(
          {
            ok: false,
            stage: "PARSE",
            error: "Invalid JSON received from cTrader",
          },
          502
        );

        return;
      }

      log.push(`PAYLOAD_${msg.payloadType}`);

      // ==================================================
      // APP AUTH
      // ==================================================

      if (msg.payloadType === 2101) {
        log.push("APP_AUTH_OK");

        send(
          2102,
          {
            ctidTraderAccountId: ACCOUNT_ID,
            accessToken,
          },
          `NBS_ACCOUNT_AUTH_${Date.now()}`
        );

        log.push("2102_SEND_CALLED");
        return;
      }

      // ==================================================
      // ACCOUNT AUTH
      // ==================================================

      if (msg.payloadType === 2103) {
        log.push("ACCOUNT_AUTH_OK");

        if (sizingOnly) {
          send(
            2121,
            {
              ctidTraderAccountId: ACCOUNT_ID,
            },
            `NBS_TRADER_${Date.now()}`
          );
          log.push("2121_TRADER_SEND_CALLED");
          return;
        }

        send(
          2124,
          {
            ctidTraderAccountId: ACCOUNT_ID,
          },
          `NBS_POSITIONS_${Date.now()}`
        );

        log.push("2124_SEND_CALLED");
        return;
      }

      if (msg.payloadType === 2122 && sizingOnly) {
        brokerEffectiveLeverage = Number(msg.payload?.trader?.leverageInCents) / 100;

        if (
          !Number.isFinite(brokerEffectiveLeverage) ||
          brokerEffectiveLeverage <= 0 ||
          brokerEffectiveLeverage > CTRADER.maxEffectiveLeverage + CTRADER.leverageTolerance
        ) {
          log.push("LEVERAGE_CAP_BLOCK");
          finish({
            ok: false,
            stage: "LEVERAGE_CAP_BLOCK",
            brokerEffectiveLeverage: Number.isFinite(brokerEffectiveLeverage)
              ? brokerEffectiveLeverage
              : null,
            maxEffectiveLeverage: CTRADER.maxEffectiveLeverage,
            orderWouldBeSent: false,
            payload2106Sent: false,
          }, 409);
          return;
        }

        log.push("BROKER_LEVERAGE_VERIFIED");
        send(
          2139,
          {
            ctidTraderAccountId: ACCOUNT_ID,
            symbolId: SYMBOL_ID,
            volume: sizingVolumes,
          },
          `NBS_EXPECTED_MARGIN_${Date.now()}`
        );
        log.push("2139_EXPECTED_MARGIN_SEND_CALLED");
        return;
      }

      // ==================================================
      // BROKER EXPECTED MARGIN (READ-ONLY)
      // ==================================================

      if (msg.payloadType === 2140 && sizingOnly) {
        const moneyDigits = Number(msg.payload?.moneyDigits ?? 0);
        const divisor = 10 ** moneyDigits;
        const sideField = direction === "LONG" ? "buyMargin" : "sellMargin";
        const estimates = (msg.payload?.margin || [])
          .map((item) => ({
            volume: Number(item?.volume),
            marginGBP: Number(item?.[sideField]) / divisor,
          }))
          .filter(
            (item) =>
              Number.isFinite(item.volume) &&
              Number.isFinite(item.marginGBP) &&
              item.volume > 0 &&
              item.marginGBP >= 0
          );

        const ranked = estimates
          .filter(
            (item) =>
              item.marginGBP <= CTRADER.targetMarginGBP + CTRADER.marginToleranceGBP
          )
          .map((item) => ({
            ...item,
            differenceGBP: CTRADER.targetMarginGBP - item.marginGBP,
          }))
          .sort((a, b) => a.differenceGBP - b.differenceGBP);
        const selected = ranked[0] || null;
        const proofIssuedAt = Date.now();
        const sizingProof = selected
          ? {
              issuedAt: proofIssuedAt,
              signature: createSizingProof(
                {
                  environment: CTRADER.environment,
                  accountId: ACCOUNT_ID,
                  symbolId: SYMBOL_ID,
                  direction,
                  volume: selected.volume,
                  entry,
                  sl,
                  actualMarginGBP: selected.marginGBP,
                  effectiveLeverage: brokerEffectiveLeverage,
                  issuedAt: proofIssuedAt,
                },
                executorKey
              ),
            }
          : null;

        log.push("EXPECTED_MARGIN_RECEIVED");
        log.push(selected ? "SAFE_MARGIN_SELECTED" : "SAFE_MARGIN_UNAVAILABLE");

        finish({
          ok: Boolean(selected),
          stage: selected ? "SAFE_MARGIN_SELECTED" : "SAFE_MARGIN_UNAVAILABLE",
          environment: CTRADER.environment,
          accountId: ACCOUNT_ID,
          symbol: SYMBOL_NAME,
          symbolId: SYMBOL_ID,
          direction,
          targetMarginGBP: CTRADER.targetMarginGBP,
          toleranceGBP: CTRADER.marginToleranceGBP,
          selected,
          brokerEffectiveLeverage,
          sizingProof,
          checkedVolumes: estimates.length,
          orderWouldBeSent: false,
          payload2106Sent: false,
        }, selected ? 200 : 409);
        return;
      }

      // ==================================================
      // OPEN POSITIONS
      // ==================================================

      if (msg.payloadType === 2125) {
        const positions =
          msg.payload?.position || [];

        const openSpotCrude = positions.filter(
          (p) =>
            p?.tradeData?.symbolId === SYMBOL_ID &&
            p?.positionStatus === 1 &&
            Number(p?.tradeData?.volume || 0) > 0
        );

        if (openSpotCrude.length > 0) {
          log.push("DUPLICATE_BLOCKED");

          if (!effectivePreflightOnly) {
            try {
              await updateExecution(
                "DUPLICATE_POSITION",
                {
                  error_code:
                    "DUPLICATE_POSITION",
                  error_message:
                    "An open SpotCrude position already exists",
                }
              );

              log.push(
                "EXECUTION_DB_DUPLICATE_UPDATED"
              );
            } catch (err) {
              log.push(
                "EXECUTION_DB_UPDATE_FAILED"
              );
              console.error(err);
            }
          }

          finish(
            {
              ok: false,
              stage: "DUPLICATE_BLOCKED",
              environment: CTRADER.environment,
              accountId: ACCOUNT_ID,
              symbol: SYMBOL_NAME,
              symbolId: SYMBOL_ID,

              retryPolicy: "DO_NOT_RETRY",
              retryAutomatically: false,

              safetyReason:
                "An open SpotCrude position already exists. Do not open another position automatically.",

              existingPositions:
                openSpotCrude.map((p) => ({
                  positionId:
                    p.positionId,

                  direction:
                    p.tradeData?.tradeSide === 1
                      ? "LONG"
                      : p.tradeData?.tradeSide === 2
                      ? "SHORT"
                      : "UNKNOWN",

                  volume:
                    p.tradeData?.volume ?? null,

                  entryPrice:
                    p.price ?? null,

                  label:
                    p.tradeData?.label ?? null,
                })),

              orderWouldBeSent: false,
            },
            409
          );

          return;
        }

        log.push(
          "NO_OPEN_SPOTCRUDE_POSITION"
        );

        // ==================================================
        // PREFLIGHT
        // ==================================================

        if (effectivePreflightOnly) {
          log.push("PREFLIGHT_OK");

          finish({
            ok: true,
            stage: "PREFLIGHT_OK",
            environment: CTRADER.environment,
            accountId: ACCOUNT_ID,
            symbol: SYMBOL_NAME,
            symbolId: SYMBOL_ID,
            direction,
            tradeSide,
            volume,
            openSpotCrudeCount: 0,

            signalPlan: {
              entry:
                Number.isFinite(entry)
                  ? entry
                  : null,

              sl:
                Number.isFinite(sl)
                  ? sl
                  : null,

              tp1:
                Number.isFinite(tp1)
                  ? tp1
                  : null,

              tp2:
                Number.isFinite(tp2)
                  ? tp2
                  : null,
            },

            orderWouldBeSent: false,
          });

          return;
        }

        // ==================================================
        // DURABLE ORDER-SEND BARRIER
        //
        // DB is marked BEFORE 2106.
        // If DB update fails, DO NOT send the order.
        // ==================================================

        try {
          await updateExecution(
            "ORDER_SEND_STARTED",
            {
              error_code: null,
              error_message: null,
            }
          );

          log.push(
            "EXECUTION_DB_ORDER_SEND_STARTED"
          );
        } catch (err) {
          log.push(
            "EXECUTION_DB_UPDATE_FAILED"
          );

          finish(
            {
              ok: false,
              stage:
                "ORDER_SEND_BARRIER_FAILED",

              error:
                err.message,

              retryPolicy:
                "SAFE_TO_RETRY_MANUALLY",

              retryAutomatically:
                false,

              safetyReason:
                "Database barrier failed before cTrader order transmission. 2106 was not sent.",

              orderWouldBeSent:
                false,
            },
            500
          );

          return;
        }

        // ==================================================
        // SEND MARKET ORDER
        // ==================================================

        orderSendStarted = true;

        send(
          2106,
          buildProtectedMarketOrder({
            accountId: ACCOUNT_ID,
            symbolId: SYMBOL_ID,
            tradeSide,
            volume,
            label: CTRADER.live ? "NBS_LIVE" : "NBS_DEMO",
            entry,
            stopLoss: sl,
          }),
          `NBS_ORDER_${Date.now()}`
        );

        log.push("2106_SEND_CALLED");

        return;
      }

      // ==================================================
      // EXECUTION EVENT
      // ==================================================

      if (msg.payloadType === 2126) {
        const p = msg.payload || {};

        if (p.executionType === 2) {
          log.push("ORDER_ACCEPTED");
          return;
        }

        if (
          p.executionType === 3 &&
          p.deal
        ) {
          log.push("ORDER_FILLED");

          try {
            await updateExecution(
              "ORDER_FILLED",
              {
                position_id:
                  p.position?.positionId ??
                  null,

                order_id:
                  p.order?.orderId ??
                  null,

                deal_id:
                  p.deal?.dealId ??
                  null,

                execution_price:
                  p.deal?.executionPrice ??
                  p.order?.executionPrice ??
                  p.position?.price ??
                  null,

                executed_volume:
                  p.deal?.filledVolume ??
                  p.order?.executedVolume ??
                  null,

                error_code: null,
                error_message: null,
              }
            );

            log.push(
              "EXECUTION_DB_UPDATED"
            );
          } catch (err) {
            log.push(
              "EXECUTION_DB_UPDATE_FAILED"
            );
            console.error(err);
          }

          finish({
            ok: true,
            stage: "ORDER_FILLED",

            environment: CTRADER.environment,

            accountId: ACCOUNT_ID,

            symbol: SYMBOL_NAME,
            symbolId: SYMBOL_ID,

            direction,
            tradeSide,

            requestedVolume: volume,

            positionId:
              p.position?.positionId ??
              null,

            orderId:
              p.order?.orderId ??
              null,

            dealId:
              p.deal?.dealId ??
              null,

            executedVolume:
              p.deal?.filledVolume ??
              p.order?.executedVolume ??
              null,

            executionPrice:
              p.deal?.executionPrice ??
              p.order?.executionPrice ??
              p.position?.price ??
              null,

            signalPlan: {
              entry:
                Number.isFinite(entry)
                  ? entry
                  : null,

              sl:
                Number.isFinite(sl)
                  ? sl
                  : null,

              tp1:
                Number.isFinite(tp1)
                  ? tp1
                  : null,

              tp2:
                Number.isFinite(tp2)
                  ? tp2
                  : null,
            },
          });

          return;
        }
      }

      // ==================================================
      // CTRADER ERROR
      // ==================================================

      if (
        msg.payloadType === 2142 ||
        msg.payload?.errorCode
      ) {
        const errorCode =
          msg.payload?.errorCode ??
          "CTRADER_ERROR";

        const errorMessage =
          msg.payload?.description ??
          msg.payload?.errorMessage ??
          "Unknown cTrader error";

        // Full safe diagnostic for cTrader routing/auth errors.
        // Never log clientSecret or accessToken.
        if (msg.payloadType === 2142) {
          log.push(
            `CTRADER_2142_PAYLOAD_${JSON.stringify({
              payloadType: msg.payloadType,
              clientMsgId: msg.clientMsgId ?? null,
              errorCode: msg.payload?.errorCode ?? null,
              description: msg.payload?.description ?? null,
              errorMessage: msg.payload?.errorMessage ?? null,
              payloadKeys: msg.payload
                ? Object.keys(msg.payload)
                : [],
            })}`
          );
        }

        // ==================================================
        // ERROR BEFORE 2106
        // ==================================================

        if (!orderSendStarted) {
          // A transient routing failure can happen on the 2100 app-auth
          // request. Retry authentication before marking the execution as
          // failed. No 2106 order request has been sent yet.
          if (errorCode === "CANT_ROUTE_REQUEST") {
            log.push("CTRADER_2142_NO_SAME_SOCKET_RETRY");
          }

          let executionStatus =
            "CTRADER_ERROR_BEFORE_ORDER";

          let retryPolicy =
            "SAFE_TO_RETRY_MANUALLY";

          if (
            errorCode ===
            "MARKET_CLOSED"
          ) {
            executionStatus =
              "MARKET_CLOSED";

            // MARKET_CLOSED is explicitly
            // reclaimable on the next request.
            retryPolicy =
              "RETRY_WHEN_MARKET_OPENS";
          }

          if (!effectivePreflightOnly) {
            try {
              await updateExecution(
                executionStatus,
                {
                  error_code:
                    errorCode,

                  error_message:
                    errorMessage,
                }
              );

              log.push(
                `EXECUTION_DB_${executionStatus}_UPDATED`
              );
            } catch (err) {
              log.push(
                "EXECUTION_DB_UPDATE_FAILED"
              );
              console.error(err);
            }
          }

          finish(
            {
              ok: false,
              stage:
                executionStatus,

              errorCode,
              error:
                errorMessage,

              retryPolicy,
              retryAutomatically:
                false,

              safetyReason:
                "The error occurred before 2106 was sent, so no order request was transmitted during this attempt.",

              orderWouldBeSent:
                false,
            },
            502
          );

          return;
        }

        // ==================================================
        // ERROR AFTER 2106
        //
        // Never automatically retry.
        // ==================================================

        if (!effectivePreflightOnly) {
          try {
            await updateExecution(
              "ORDER_STATE_UNCERTAIN",
              {
                error_code:
                  errorCode,

                error_message:
                  errorMessage,
              }
            );

            log.push(
              "EXECUTION_DB_ORDER_STATE_UNCERTAIN_UPDATED"
            );
          } catch (err) {
            log.push(
              "EXECUTION_DB_UPDATE_FAILED"
            );
            console.error(err);
          }
        }

        finish(
          {
            ok: false,

            stage:
              "ORDER_STATE_UNCERTAIN",

            errorCode,

            error:
              errorMessage,

            retryPolicy:
              "CHECK_POSITION_FIRST",

            retryAutomatically:
              false,

            safetyReason:
              "cTrader returned an error after the 2106 order request was sent. The order must not be resent until broker positions/orders are checked.",

            orderWouldBeSent:
              true,
          },
          502
        );

        return;
      }
    });

    // ==================================================
    // WEBSOCKET ERROR
    // ==================================================

    ws.on("error", async (err) => {
      if (
        !effectivePreflightOnly &&
        orderSendStarted
      ) {
        try {
          await updateExecution(
            "ORDER_STATE_UNCERTAIN",
            {
              error_code:
                "WEBSOCKET_ERROR",

              error_message:
                err.message,
            }
          );
        } catch (updateErr) {
          console.error(updateErr);
        }
      }

      finish(
        {
          ok: false,

          stage:
            orderSendStarted
              ? "ORDER_STATE_UNCERTAIN"
              : "WEBSOCKET_BEFORE_ORDER",

          error:
            err.message,

          retryPolicy:
            orderSendStarted
              ? "CHECK_POSITION_FIRST"
              : "SAFE_TO_RETRY_MANUALLY",

          retryAutomatically:
            false,

          safetyReason:
            orderSendStarted
              ? "WebSocket failed after 2106 was sent. Check broker state before retrying."
              : "WebSocket failed before 2106 was sent.",
        },
        502
      );
    });
  });
}
