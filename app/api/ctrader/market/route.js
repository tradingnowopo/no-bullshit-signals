import WebSocket from "ws";
import { getCTraderConfig } from "../../../lib/ctrader-config.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ==================================================
// CTRADER - READ ONLY MARKET DATA
// ==================================================

const CTRADER = getCTraderConfig();
const WS_URL = CTRADER.wsUrl;
const ACCOUNT_ID = CTRADER.accountId;
const SPOTCRUDE_SYMBOL_ID = CTRADER.symbolId;

const ATTEMPT_TIMEOUT_MS = 25000;
const CTRADER_OPEN_DELAY_MS = 2000;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));


// ==================================================
// READ LIVE SPOTCRUDE QUOTE
// ==================================================

function getSpotCrudeQuote({
  clientId,
  clientSecret,
  accessToken,
}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, {
      perMessageDeflate: false,
      handshakeTimeout: 15000,
    });

    let finished = false;

    let bid = null;
    let ask = null;
    let quoteTimestamp = null;

    const log = [];


// ==================================================
// FINISH
// ==================================================

    const finish = (result) => {
      if (finished) return;

      finished = true;

      clearTimeout(timeout);

      try {
        ws.terminate();
      } catch {}

      resolve({
        ...result,
        log,
      });
    };


// ==================================================
// SEND
// ==================================================

    const send = (
      payloadType,
      payload,
      clientMsgId
    ) => {
      if (
        ws.readyState !==
        WebSocket.OPEN
      ) {
        finish({
          ok: false,
          stage: "WEBSOCKET_NOT_OPEN",
          error: "WebSocket is not open",
        });

        return;
      }

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

    const timeout =
      setTimeout(() => {
        finish({
          ok: false,
          stage: "TIMEOUT",
          error:
            "Timed out waiting for SpotCrude live quote",
          debug: {
            bidLoaded:
              Number.isFinite(bid),

            askLoaded:
              Number.isFinite(ask),

            timestampLoaded:
              Number.isFinite(
                quoteTimestamp
              ),
          },
        });
      }, ATTEMPT_TIMEOUT_MS);


// ==================================================
// WEBSOCKET OPEN
// ==================================================

    ws.on(
      "open",
      async () => {
        log.push(
          "WEBSOCKET_OPEN"
        );

        // Allow cTrader routing to settle.
        await sleep(
          CTRADER_OPEN_DELAY_MS
        );

        if (finished) {
          return;
        }

        if (
          ws.readyState !==
          WebSocket.OPEN
        ) {
          finish({
            ok: false,

            stage:
              "WEBSOCKET_NOT_OPEN_AFTER_DELAY",

            error:
              "WebSocket closed before application authentication",
          });

          return;
        }

        log.push(
          "CTRADER_ROUTING_DELAY_OK"
        );


// ==================================================
// APP AUTH
// payloadType 2100
// ==================================================

        send(
          2100,
          {
            clientId,
            clientSecret,
          },
          `NBS_MARKET_APP_AUTH_${Date.now()}`
        );

        log.push(
          "2100_SEND_CALLED"
        );
      }
    );


// ==================================================
// MESSAGE
// ==================================================

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
          finish({
            ok: false,
            stage: "PARSE",
            error:
              "Invalid JSON received from cTrader",
          });

          return;
        }

        log.push(
          `PAYLOAD_${msg.payloadType}`
        );


// ==================================================
// CTRADER ERROR
// ==================================================

        if (
          msg.payloadType === 2142 ||
          msg.payload?.errorCode
        ) {
          finish({
            ok: false,

            stage:
              "CTRADER_ERROR",

            errorCode:
              msg.payload?.errorCode ??
              "CTRADER_ERROR",

            error:
              msg.payload?.description ??
              "Unknown cTrader error",
          });

          return;
        }


// ==================================================
// APP AUTH OK
// payloadType 2101
// ==================================================

        if (
          msg.payloadType === 2101
        ) {
          log.push(
            "APP_AUTH_OK"
          );


// ==================================================
// ACCOUNT AUTH
// payloadType 2102
// ==================================================

          send(
            2102,
            {
              ctidTraderAccountId:
                ACCOUNT_ID,

              accessToken,
            },
            `NBS_MARKET_ACCOUNT_AUTH_${Date.now()}`
          );

          log.push(
            "2102_SEND_CALLED"
          );

          return;
        }


// ==================================================
// ACCOUNT AUTH OK
// payloadType 2103
// ==================================================

        if (
          msg.payloadType === 2103
        ) {
          log.push(
            "ACCOUNT_AUTH_OK"
          );


// ==================================================
// SUBSCRIBE LIVE SPOTCRUDE
// payloadType 2127
//
// READ ONLY.
// This only subscribes to market prices.
// NO ORDER IS SENT.
// ==================================================

          send(
            2127,
            {
              ctidTraderAccountId:
                ACCOUNT_ID,

              symbolId: [
                SPOTCRUDE_SYMBOL_ID,
              ],

              subscribeToSpotTimestamp:
                true,
            },
            `NBS_SPOTCRUDE_MARKET_${Date.now()}`
          );

          log.push(
            "2127_SPOTCRUDE_SEND_CALLED"
          );

          return;
        }


// ==================================================
// SUBSCRIPTION ACK
// payloadType 2128
// ==================================================

        if (
          msg.payloadType === 2128
        ) {
          log.push(
            "SPOTCRUDE_SUBSCRIPTION_OK"
          );

          return;
        }


// ==================================================
// LIVE SPOT EVENT
// payloadType 2131
// ==================================================

        if (
          msg.payloadType === 2131
        ) {
          const event =
            msg.payload ?? {};


// ==================================================
// ONLY SPOTCRUDE
// ==================================================

          if (
            Number(
              event.symbolId
            ) !==
            SPOTCRUDE_SYMBOL_ID
          ) {
            return;
          }


// ==================================================
// BID
//
// cTrader spot prices use 1/100000
// representation in ProtoOA.
// ==================================================

          if (
            event.bid !== undefined &&
            event.bid !== null
          ) {
            bid =
              Number(event.bid) /
              100000;
          }


// ==================================================
// ASK
// ==================================================

          if (
            event.ask !== undefined &&
            event.ask !== null
          ) {
            ask =
              Number(event.ask) /
              100000;
          }


// ==================================================
// TIMESTAMP
// ==================================================

          if (
            event.timestamp !==
              undefined &&
            event.timestamp !==
              null
          ) {
            quoteTimestamp =
              Number(
                event.timestamp
              );
          }

          log.push(
            "SPOTCRUDE_SPOT_EVENT"
          );


// ==================================================
// WAIT UNTIL BOTH BID + ASK ARE AVAILABLE
// ==================================================

          if (
            !Number.isFinite(bid) ||
            !Number.isFinite(ask)
          ) {
            return;
          }


// ==================================================
// MID
// ==================================================

          const mid =
            (bid + ask) / 2;

          const spread =
            ask - bid;


// ==================================================
// SUCCESS
// ==================================================

          finish({
            ok: true,

            stage:
              "SPOTCRUDE_MARKET_READY",

            environment:
              CTRADER.environment,

            accountId:
              ACCOUNT_ID,

            market: {
              symbol:
                "SpotCrude",

              symbolId:
                SPOTCRUDE_SYMBOL_ID,

              bid:
                Number(
                  bid.toFixed(5)
                ),

              ask:
                Number(
                  ask.toFixed(5)
                ),

              mid:
                Number(
                  mid.toFixed(5)
                ),

              spread:
                Number(
                  spread.toFixed(5)
                ),

              timestamp:
                quoteTimestamp,

              timestampISO:
                Number.isFinite(
                  quoteTimestamp
                )
                  ? new Date(
                      quoteTimestamp
                    ).toISOString()
                  : null,
            },

            readOnly: true,
            orderSent: false,
          });

          return;
        }
      }
    );


// ==================================================
// WEBSOCKET ERROR
// ==================================================

    ws.on(
      "error",
      (err) => {
        finish({
          ok: false,

          stage:
            "WEBSOCKET",

          errorCode:
            "WEBSOCKET_ERROR",

          error:
            err.message,
        });
      }
    );
  });
}


// ==================================================
// GET
//
// Endpoint:
// /api/ctrader/market
//
// READ ONLY
// ==================================================

export async function GET(request) {


// ==================================================
// AUTH
// Same protection as existing cTrader endpoint.
// ==================================================

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
          "Unauthorized market-data request",
      },
      {
        status: 401,
      }
    );
  }


// ==================================================
// ENV
// ==================================================

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
      {
        status: 500,
      }
    );
  }


// ==================================================
// GET LIVE MARKET QUOTE
// ==================================================

  const result =
    await getSpotCrudeQuote({
      clientId,
      clientSecret,
      accessToken,
    });


// ==================================================
// SUCCESS
// ==================================================

  if (result.ok === true) {
    return Response.json(
      result,
      {
        status: 200,
      }
    );
  }


// ==================================================
// ERROR
// ==================================================

  return Response.json(
    result,
    {
      status:
        result.stage === "AUTH"
          ? 401
          : 502,
    }
  );
}
