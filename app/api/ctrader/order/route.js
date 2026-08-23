import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WS_URL = "wss://demo.ctraderapi.com:5036";
const WS_CONNECT_TIMEOUT_MS = 10000;
const WS_AUTH_DELAY_MS = 500;

const ACCOUNT_ID = 48342468;
const SYMBOL_ID = 250;
const SYMBOL_NAME = "SpotCrude";

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

  if (!supabaseUrl || !supabaseServiceKey) {
    return Response.json(
      {
        ok: false,
        stage: "ENV",
        error: "Missing Supabase executor environment variables",
      },
      { status: 500 }
    );
  }

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

  const entry = Number(body?.entry);
  const sl = Number(body?.sl);
  const tp1 = Number(body?.tp1);
  const tp2 = Number(body?.tp2);

  if (body?.environment !== "DEMO") {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "Only DEMO environment is allowed",
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

  // ==================================================
  // VALIDATION ONLY
  // ==================================================

  if (validateOnly) {
    return Response.json({
      ok: true,
      stage: "VALIDATION_OK",
      validateOnly: true,
      environment: "DEMO",
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

  async function getExecution() {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/ctrader_signal_executions?signal_id=eq.${encodeURIComponent(
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
    const response = await fetch(
      `${supabaseUrl}/rest/v1/ctrader_signal_executions?signal_id=eq.${encodeURIComponent(
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
          ...fields,
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

  if (!preflightOnly) {
    const claimResponse = await fetch(
      `${supabaseUrl}/rest/v1/ctrader_signal_executions`,
      {
        method: "POST",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          signal_id: signalId,
          environment: "DEMO",
          symbol,
          direction,
          status: idempotencyTestOnly
            ? "CLAIMED_TEST"
            : "CLAIMED",
          entry: Number.isFinite(entry) ? entry : null,
          sl: Number.isFinite(sl) ? sl : null,
          tp1: Number.isFinite(tp1) ? tp1 : null,
          tp2: Number.isFinite(tp2) ? tp2 : null,
          error_code: null,
          error_message: null,
        }),
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
        environment: "DEMO",
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

    const finish = (data, status = 200) => {
      if (finished) return;

      finished = true;

      clearTimeout(timeout);

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
      if (!preflightOnly) {
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

    ws.on("open", () => {
  log.push("WEBSOCKET_OPEN");

  setTimeout(() => {
    if (finished) return;

    send(
      2100,
      {
        clientId,
        clientSecret,
      },
      `NBS_APP_AUTH_${Date.now()}`
    );

    log.push("2100_SEND_CALLED");
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

          if (!preflightOnly) {
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
              environment: "DEMO",
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

        if (preflightOnly) {
          log.push("PREFLIGHT_OK");

          finish({
            ok: true,
            stage: "PREFLIGHT_OK",
            environment: "DEMO",
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
          {
            ctidTraderAccountId:
              ACCOUNT_ID,

            symbolId:
              SYMBOL_ID,

            orderType: 1,

            tradeSide,

            volume,

            label:
              "NBS_DEMO",
          },
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

            environment: "DEMO",

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
          "Unknown cTrader error";

        // ==================================================
        // ERROR BEFORE 2106
        // ==================================================

        if (!orderSendStarted) {
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

          if (!preflightOnly) {
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

        if (!preflightOnly) {
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
        !preflightOnly &&
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
