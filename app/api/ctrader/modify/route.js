import WebSocket from "ws";
import {
  getCTraderConfig,
  validateRequestedEnvironment,
} from "../../../lib/ctrader-config.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CTRADER = getCTraderConfig();
const WS_URL = CTRADER.wsUrl;
const ACCOUNT_ID = CTRADER.accountId;
const SYMBOL_ID = CTRADER.symbolId;
const SYMBOL_NAME = CTRADER.symbolName;

const REQUEST_TIMEOUT_MS = 15000;

// ============================================================
// HELPERS
// ============================================================

function num(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function directionFromTradeSide(tradeSide) {
  if (tradeSide === 1) return "LONG";
  if (tradeSide === 2) return "SHORT";

  return "UNKNOWN";
}

// ============================================================
// POST
// ============================================================

export async function POST(request) {
  // ==========================================================
  // AUTH
  // ==========================================================

  const executorKey =
    process.env.NBS_EXECUTOR_KEY;

  const providedKey =
    request.headers.get(
      "x-nbs-executor-key"
    );

  if (
    !executorKey ||
    providedKey !== executorKey
  ) {
    return Response.json(
      {
        ok: false,
        stage: "AUTH",
        error:
          "Unauthorized executor request",
      },
      { status: 401 }
    );
  }

  // ==========================================================
  // ENV
  // ==========================================================

  const clientId =
    process.env.CTRADER_CLIENT_ID;

  const clientSecret =
    process.env.CTRADER_CLIENT_SECRET;

  const accessToken =
    process.env.CTRADER_ACCESS_TOKEN;

  if (
    !clientId ||
    !clientSecret ||
    !accessToken
  ) {
    return Response.json(
      {
        ok: false,
        stage: "ENV",
        error:
          "Missing cTrader environment variables",
      },
      { status: 500 }
    );
  }

  // ==========================================================
  // BODY
  // ==========================================================

  let body;

  try {
    body =
      await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error:
          "Invalid JSON body",
      },
      { status: 400 }
    );
  }

  // ==========================================================
  // REQUEST VALIDATION
  // ==========================================================

  if (!validateRequestedEnvironment(body?.environment, CTRADER.environment)) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error:
          `Requested environment must match configured ${CTRADER.environment} environment`,
      },
      { status: 400 }
    );
  }

  const positionId =
    Number(body?.positionId);

  const sl =
    num(body?.sl);

  const validateOnly =
    body?.validateOnly === true;

  const dryRun = body?.dryRun === true;

  if (
    !Number.isInteger(positionId) ||
    positionId <= 0
  ) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error:
          "positionId must be a positive integer",
      },
      { status: 400 }
    );
  }

  if (
    sl === null ||
    sl <= 0
  ) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error:
          "sl must be a positive number",
      },
      { status: 400 }
    );
  }

  if (body?.tp !== undefined && body?.tp !== null && body?.tp !== "") {
    return Response.json(
      {
        ok: false,
        stage: "TAKE_PROFIT_ORDER_FORBIDDEN",
        error:
          "Broker take-profit orders are disabled. TP1/TP2 are Telegram-only.",
      },
      { status: 400 }
    );
  }

  if (
    CTRADER.live &&
    !validateOnly &&
    !dryRun &&
    (!CTRADER.liveTradingEnabled || body?.liveConfirm !== true)
  ) {
    return Response.json(
      {
        ok: false,
        stage: "LIVE_KILL_SWITCH",
        error: "LIVE modification blocked by kill switch",
        modifyWouldBeSent: false,
      },
      { status: 409 }
    );
  }

  const effectiveValidateOnly = validateOnly || dryRun;

  // ==========================================================
  // CTRADER
  // ==========================================================

  const log = [];

  return new Promise((resolve) => {
    const ws =
      new WebSocket(WS_URL);

    let finished = false;

    // Once 2110 is sent we must never blindly retry,
    // because broker state may already have changed.
    let modifySendStarted = false;

    let validatedPosition = null;

    // ========================================================
    // FINISH
    // ========================================================

    const finish = (
      data,
      status = 200
    ) => {
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

    // ========================================================
    // SEND
    // ========================================================

    const send = (
      payloadType,
      payload,
      clientMsgId
    ) => {
      ws.send(
        JSON.stringify({
          clientMsgId,
          payloadType,
          payload,
        })
      );
    };

    // ========================================================
    // TIMEOUT
    // ========================================================

    const timeout =
      setTimeout(() => {
        if (modifySendStarted) {
          finish(
            {
              ok: false,

              stage:
                "MODIFY_STATE_UNCERTAIN",

              error:
                "cTrader timed out after position modification request was sent",

              positionId,

              retryPolicy:
                "CHECK_POSITION_FIRST",

              retryAutomatically:
                false,

              safetyReason:
                "The broker may already have applied SL/TP. Check the current position before retrying.",

              modifyWouldBeSent:
                true,
            },
            504
          );

          return;
        }

        finish(
          {
            ok: false,

            stage:
              "TIMEOUT_BEFORE_MODIFY",

            error:
              "cTrader timed out before position modification was sent",

            positionId,

            retryPolicy:
              "SAFE_TO_RETRY_MANUALLY",

            retryAutomatically:
              false,

            safetyReason:
              "No 2110 modification request was sent.",

            modifyWouldBeSent:
              false,
          },
          504
        );
      }, REQUEST_TIMEOUT_MS);

    // ========================================================
    // SOCKET OPEN
    // ========================================================

    ws.on("open", () => {
      log.push(
        "WEBSOCKET_OPEN"
      );

      send(
        2100,
        {
          clientId,
          clientSecret,
        },
        `NBS_MODIFY_APP_AUTH_${Date.now()}`
      );

      log.push(
        "2100_SEND_CALLED"
      );
    });

    // ========================================================
    // SOCKET MESSAGE
    // ========================================================

    ws.on(
      "message",
      (data) => {
        let msg;

        try {
          msg =
            JSON.parse(
              data.toString()
            );
        } catch {
          finish(
            {
              ok: false,
              stage: "PARSE",
              error:
                "Invalid JSON received from cTrader",
            },
            502
          );

          return;
        }

        log.push(
          `PAYLOAD_${msg.payloadType}`
        );

        // ====================================================
        // APP AUTH OK
        // ====================================================

        if (
          msg.payloadType === 2101
        ) {
          log.push(
            "APP_AUTH_OK"
          );

          send(
            2102,
            {
              ctidTraderAccountId:
                ACCOUNT_ID,

              accessToken,
            },
            `NBS_MODIFY_ACCOUNT_AUTH_${Date.now()}`
          );

          log.push(
            "2102_SEND_CALLED"
          );

          return;
        }

        // ====================================================
        // ACCOUNT AUTH OK
        //
        // DO NOT modify yet.
        // First load real broker positions.
        // ====================================================

        if (
          msg.payloadType === 2103
        ) {
          log.push(
            "ACCOUNT_AUTH_OK"
          );

          send(
            2124,
            {
              ctidTraderAccountId:
                ACCOUNT_ID,
            },
            `NBS_MODIFY_POSITIONS_${Date.now()}`
          );

          log.push(
            "2124_SEND_CALLED"
          );

          return;
        }

        // ====================================================
        // OPEN POSITIONS
        // ====================================================

        if (
          msg.payloadType === 2125
        ) {
          const positions =
            msg.payload?.position || [];

          const position =
            positions.find(
              (p) =>
                Number(
                  p?.positionId
                ) === positionId
            );

          // ----------------------------------------------------
          // POSITION DOES NOT EXIST
          // ----------------------------------------------------

          if (!position) {
            finish(
              {
                ok: false,

                stage:
                  "POSITION_NOT_FOUND",

                error:
                  "Requested positionId is not present in open cTrader positions",

                positionId,

                modifyWouldBeSent:
                  false,
              },
              409
            );

            return;
          }

          // ----------------------------------------------------
          // POSITION MUST BE OPEN
          // ----------------------------------------------------

          if (
            position?.positionStatus !== 1
          ) {
            finish(
              {
                ok: false,

                stage:
                  "POSITION_NOT_OPEN",

                error:
                  "Position exists but is not currently open",

                positionId,

                positionStatus:
                  position?.positionStatus ??
                  null,

                modifyWouldBeSent:
                  false,
              },
              409
            );

            return;
          }

          // ----------------------------------------------------
          // SYMBOL VALIDATION
          // ----------------------------------------------------

          const positionSymbolId =
            Number(
              position?.tradeData
                ?.symbolId
            );

          if (
            positionSymbolId !==
            SYMBOL_ID
          ) {
            finish(
              {
                ok: false,

                stage:
                  "POSITION_SYMBOL_MISMATCH",

                error:
                  "Position does not belong to SpotCrude",

                positionId,

                expectedSymbolId:
                  SYMBOL_ID,

                actualSymbolId:
                  positionSymbolId,

                modifyWouldBeSent:
                  false,
              },
              409
            );

            return;
          }

          // ----------------------------------------------------
          // DIRECTION
          // ----------------------------------------------------

          const tradeSide =
            Number(
              position?.tradeData
                ?.tradeSide
            );

          const direction =
            directionFromTradeSide(
              tradeSide
            );

          if (
            direction === "UNKNOWN"
          ) {
            finish(
              {
                ok: false,

                stage:
                  "POSITION_DIRECTION_UNKNOWN",

                error:
                  "Unable to determine position direction",

                positionId,

                tradeSide,

                modifyWouldBeSent:
                  false,
              },
              409
            );

            return;
          }

          // ----------------------------------------------------
          // ENTRY PRICE
          // ----------------------------------------------------

          const entry =
            num(position?.price);

          if (
            entry === null ||
            entry <= 0
          ) {
            finish(
              {
                ok: false,

                stage:
                  "POSITION_ENTRY_INVALID",

                error:
                  "Unable to determine valid position entry price",

                positionId,

                entry,

                modifyWouldBeSent:
                  false,
              },
              409
            );

            return;
          }

          // ====================================================
          // HARD LEVEL STRUCTURE VALIDATION
          // ====================================================

          if (
            direction === "LONG"
          ) {
            if (!(sl < entry)) {
              finish(
                {
                  ok: false,

                  stage:
                    "INVALID_LONG_SL",

                  error:
                    "LONG stop loss must be below position entry",

                  positionId,
                  direction,
                  entry,
                  sl,

                  modifyWouldBeSent:
                    false,
                },
                409
              );

              return;
            }
          }

          if (
            direction === "SHORT"
          ) {
            if (!(sl > entry)) {
              finish(
                {
                  ok: false,

                  stage:
                    "INVALID_SHORT_SL",

                  error:
                    "SHORT stop loss must be above position entry",

                  positionId,
                  direction,
                  entry,
                  sl,

                  modifyWouldBeSent:
                    false,
                },
                409
              );

              return;
            }
          }

          // ----------------------------------------------------
          // POSITION IS VERIFIED
          // ----------------------------------------------------

          validatedPosition = {
            positionId,
            symbolId:
              positionSymbolId,
            direction,
            tradeSide,
            entry,
            currentVolume:
              position?.tradeData
                ?.volume ??
              null,
          };

          log.push(
            "POSITION_VALIDATED"
          );

          log.push(
            `POSITION_DIRECTION_${direction}`
          );

          // ====================================================
          // VALIDATION ONLY
          //
          // Full broker-side validation has completed,
          // but 2110 is NOT sent.
          // ====================================================

          if (effectiveValidateOnly) {
            finish({
              ok: true,

              stage:
                "VALIDATION_OK",

              validateOnly: true,

              dryRun,

              environment:
                CTRADER.environment,

              accountId:
                ACCOUNT_ID,

              symbol:
                SYMBOL_NAME,

              symbolId:
                SYMBOL_ID,

              positionId,

              direction,

              entry,

              requestedStopLoss:
                sl,

              requestedTakeProfit: null,

              positionValidated:
                true,

              modifyWouldBeSent:
                false,
            });

            return;
          }

          // ====================================================
          // SEND MODIFY
          // ====================================================

          modifySendStarted = true;

          send(
            2110,
            {
              ctidTraderAccountId:
                ACCOUNT_ID,

              positionId,

              stopLoss:
                sl,
            },
            `NBS_MODIFY_${Date.now()}`
          );

          log.push(
            "2110_SEND_CALLED"
          );

          return;
        }

        // ====================================================
        // EXECUTION EVENT / POSITION MODIFIED
        // ====================================================

        if (
          msg.payloadType === 2126
        ) {
          const p =
            msg.payload || {};

          const returnedPositionId =
            Number(
              p?.position?.positionId
            );

          // Ignore unrelated execution events.
          if (
            Number.isFinite(
              returnedPositionId
            ) &&
            returnedPositionId !==
              positionId
          ) {
            log.push(
              `IGNORED_2126_POSITION_${returnedPositionId}`
            );

            return;
          }

          const correctPosition =
            returnedPositionId ===
            positionId;

          if (
            modifySendStarted &&
            correctPosition
          ) {
            log.push(
              "POSITION_MODIFIED"
            );

            finish({
              ok: true,

              stage:
                "POSITION_MODIFIED",

              environment:
                CTRADER.environment,

              accountId:
                ACCOUNT_ID,

              symbol:
                SYMBOL_NAME,

              symbolId:
                SYMBOL_ID,

              positionId,

              direction:
                validatedPosition
                  ?.direction ??
                null,

              entry:
                validatedPosition
                  ?.entry ??
                null,

              requestedStopLoss:
                sl,

              requestedTakeProfit: null,

              position:
                p.position ??
                null,

              order:
                p.order ??
                null,

              deal:
                p.deal ??
                null,
            });

            return;
          }
        }

        // ====================================================
        // CTRADER ERROR
        // ====================================================

        if (
          msg.payloadType === 2142 ||
          msg.payload?.errorCode
        ) {
          const errorCode =
            msg.payload
              ?.errorCode ??
            "CTRADER_ERROR";

          const errorMessage =
            msg.payload
              ?.description ??
            msg.payload
              ?.errorMessage ??
            "Unknown cTrader error";

          // If 2110 was already sent,
          // never automatically retry.
          if (modifySendStarted) {
            finish(
              {
                ok: false,

                stage:
                  "MODIFY_STATE_UNCERTAIN",

                errorCode,

                error:
                  errorMessage,

                positionId,

                retryPolicy:
                  "CHECK_POSITION_FIRST",

                retryAutomatically:
                  false,

                safetyReason:
                  "cTrader returned an error after 2110 was sent. Check the position before retrying.",

                modifyWouldBeSent:
                  true,
              },
              502
            );

            return;
          }

          // Error before modify request.
          finish(
            {
              ok: false,

              stage:
                "CTRADER_ERROR_BEFORE_MODIFY",

              errorCode,

              error:
                errorMessage,

              positionId,

              retryPolicy:
                "SAFE_TO_RETRY_MANUALLY",

              retryAutomatically:
                false,

              safetyReason:
                "The error occurred before 2110 was sent.",

              modifyWouldBeSent:
                false,
            },
            502
          );

          return;
        }
      }
    );

    // ========================================================
    // WEBSOCKET ERROR
    // ========================================================

    ws.on(
      "error",
      (err) => {
        if (modifySendStarted) {
          finish(
            {
              ok: false,

              stage:
                "MODIFY_STATE_UNCERTAIN",

              error:
                err.message,

              positionId,

              retryPolicy:
                "CHECK_POSITION_FIRST",

              retryAutomatically:
                false,

              safetyReason:
                "WebSocket failed after 2110 was sent. Check current broker position before retrying.",

              modifyWouldBeSent:
                true,
            },
            502
          );

          return;
        }

        finish(
          {
            ok: false,

            stage:
              "WEBSOCKET_BEFORE_MODIFY",

            error:
              err.message,

            positionId,

            retryPolicy:
              "SAFE_TO_RETRY_MANUALLY",

            retryAutomatically:
              false,

            safetyReason:
              "WebSocket failed before 2110 was sent.",

            modifyWouldBeSent:
              false,
          },
          502
        );
      }
    );
  });
}
