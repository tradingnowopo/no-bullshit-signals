import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WS_URL = "wss://demo.ctraderapi.com:5036";

const ACCOUNT_ID = 48342468;
const SPOTCRUDE_SYMBOL_ID = 250;

const OPEN_DELAY_MS = 2000;
const TIMEOUT_MS = 30000;

const PERIODS = [
  { name: "M5", value: 5 },
  { name: "M15", value: 7 },
  { name: "H1", value: 9 },
  { name: "H4", value: 10 },
  { name: "D1", value: 12 },
];

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));


// ==================================================
// NORMALIZE CTRADER BAR
// ==================================================

function normalizeBar(bar) {
  const lowRaw =
    Number(bar.low ?? 0);

  const openRaw =
    lowRaw +
    Number(bar.deltaOpen ?? 0);

  const highRaw =
    lowRaw +
    Number(bar.deltaHigh ?? 0);

  const closeRaw =
    lowRaw +
    Number(bar.deltaClose ?? 0);

  const timestamp =
    Number(
      bar.utcTimestampInMinutes ?? 0
    ) *
    60 *
    1000;

  return {
    timestamp,

    timestampISO:
      Number.isFinite(timestamp) &&
      timestamp > 0
        ? new Date(
            timestamp
          ).toISOString()
        : null,

    open:
      Number(
        (
          openRaw /
          100000
        ).toFixed(5)
      ),

    high:
      Number(
        (
          highRaw /
          100000
        ).toFixed(5)
      ),

    low:
      Number(
        (
          lowRaw /
          100000
        ).toFixed(5)
      ),

    close:
      Number(
        (
          closeRaw /
          100000
        ).toFixed(5)
      ),

    volume:
      Number(
        bar.volume ?? 0
      ),
  };
}


// ==================================================
// GET CTRADER BARS
// ==================================================

function getBars({
  clientId,
  clientSecret,
  accessToken,
  count,
}) {
  return new Promise((resolve) => {
    const ws =
      new WebSocket(
        WS_URL,
        {
          perMessageDeflate: false,
          handshakeTimeout: 15000,
        }
      );

    let finished = false;

    const results = {};

    const log = [];


// ==================================================
// FINISH
// ==================================================

    const finish = (result) => {
      if (finished) {
        return;
      }

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

          stage:
            "WEBSOCKET_NOT_OPEN",

          error:
            "WebSocket is not open",
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

          stage:
            "TIMEOUT",

          error:
            "Timed out waiting for cTrader trendbars",

          receivedPeriods:
            Object.keys(results),

          partialResults:
            results,
        });
      }, TIMEOUT_MS);


// ==================================================
// WEBSOCKET OPEN
// ==================================================

    ws.on(
      "open",
      async () => {
        log.push(
          "WEBSOCKET_OPEN"
        );

        await sleep(
          OPEN_DELAY_MS
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
// ==================================================

        send(
          2100,
          {
            clientId,
            clientSecret,
          },
          `NBS_BARS_APP_AUTH_${Date.now()}`
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

            stage:
              "PARSE",

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
// ==================================================

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
            `NBS_BARS_ACCOUNT_AUTH_${Date.now()}`
          );

          log.push(
            "2102_SEND_CALLED"
          );

          return;
        }


// ==================================================
// ACCOUNT AUTH OK
// ==================================================

        if (
          msg.payloadType === 2103
        ) {
          log.push(
            "ACCOUNT_AUTH_OK"
          );

          const now =
            Date.now();


// ==================================================
// REQUEST M5 / M15 / H1 / H4 / D1
// ==================================================

          for (
  const period of PERIODS
) {
  send(
    2137,
    {
      ctidTraderAccountId:
        ACCOUNT_ID,

      symbolId:
        SPOTCRUDE_SYMBOL_ID,

      period:
        period.value,

      count,

      toTimestamp:
        now,
    },
    `NBS_BARS_${period.name}_${Date.now()}`
  );

  log.push(
    `2137_${period.name}_SEND_CALLED`
  );
}

          return;
        }


// ==================================================
// TREND BARS RESPONSE
// ==================================================

        if (
          msg.payloadType === 2138
        ) {
          const payload =
            msg.payload ?? {};

          const periodValue =
  Number(payload.period);

const periodConfig =
  PERIODS.find(
    (p) =>
      p.value === periodValue
  );

if (!periodConfig) {
  log.push(
    `UNKNOWN_PERIOD_${periodValue}`
  );

  return;
}

const period =
  periodConfig.name;

const trendbars =
  Array.isArray(
    payload.trendbar
  )
    ? payload.trendbar
    : [];

results[period] =
  trendbars
              .map(
                normalizeBar
              )
              .sort(
                (a, b) =>
                  a.timestamp -
                  b.timestamp
              );

          log.push(
            `BARS_${period}_READY_${trendbars.length}`
          );


// ==================================================
// WAIT FOR ALL 4 TIMEFRAMES
// ==================================================

          const ready =
  PERIODS.every(
    (p) =>
      Array.isArray(
        results[p.name]
      )
  );

          if (!ready) {
            return;
          }


// ==================================================
// SUCCESS
// ==================================================

          finish({
            ok: true,

            stage:
              "CTRADER_BARS_READY",

            environment:
              "DEMO",

            accountId:
              ACCOUNT_ID,

            symbol:
              "SpotCrude",

            symbolId:
              SPOTCRUDE_SYMBOL_ID,

            timeframeCount:
              PERIODS.length,

            bars: {
  M5: results.M5 ?? [],
  M15: results.M15 ?? [],
  H1: results.H1 ?? [],
  H4: results.H4 ?? [],
  D1: results.D1 ?? [],
},

            readOnly:
              true,

            orderSent:
              false,
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
// ==================================================

export async function GET(request) {


// ==================================================
// AUTH
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

        stage:
          "AUTH",

        error:
          "Unauthorized bars request",
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

        stage:
          "ENV",

        error:
          "Missing cTrader environment variables",
      },
      {
        status: 500,
      }
    );
  }


// ==================================================
// COUNT
// ==================================================

  const url =
    new URL(
      request.url
    );

  const countRaw =
    Number(
      url.searchParams.get(
        "count"
      )
    );

  const count =
    Number.isFinite(
      countRaw
    ) &&
    countRaw >= 20 &&
    countRaw <= 500
      ? Math.floor(
          countRaw
        )
      : 200;


// ==================================================
// READ CTRADER DATA
// ==================================================

  const result =
    await getBars({
      clientId,
      clientSecret,
      accessToken,
      count,
    });


// ==================================================
// RESPONSE
// ==================================================

  return Response.json(
    result,
    {
      status:
        result.ok === true
          ? 200
          : 502,
    }
  );
}
