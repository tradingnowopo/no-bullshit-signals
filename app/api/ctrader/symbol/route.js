import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WS_URL = "wss://demo.ctraderapi.com:5036";

const ACCOUNT_ID = 48342468;
const SYMBOL_ID = 250;

export async function GET(request) {
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

  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);

    let finished = false;
    const log = [];

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

    const timeout = setTimeout(() => {
      finish(
        {
          ok: false,
          stage: "TIMEOUT",
          error: "cTrader symbol request timed out",
        },
        504
      );
    }, 15000);

    const send = (payloadType, payload, clientMsgId) => {
      ws.send(
        JSON.stringify({
          clientMsgId,
          payloadType,
          payload,
        })
      );
    };

    ws.on("open", () => {
      log.push("WEBSOCKET_OPEN");

      send(
        2100,
        {
          clientId,
          clientSecret,
        },
        `NBS_SYMBOL_APP_AUTH_${Date.now()}`
      );

      log.push("2100_SEND_CALLED");
    });

    ws.on("message", (data) => {
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

      // Application authenticated
      if (msg.payloadType === 2101) {
        log.push("APP_AUTH_OK");

        send(
          2102,
          {
            ctidTraderAccountId: ACCOUNT_ID,
            accessToken,
          },
          `NBS_SYMBOL_ACCOUNT_AUTH_${Date.now()}`
        );

        log.push("2102_SEND_CALLED");
        return;
      }

      // Account authenticated
      if (msg.payloadType === 2103) {
        log.push("ACCOUNT_AUTH_OK");

        send(
          2114,
          {
            ctidTraderAccountId: ACCOUNT_ID,
            symbolId: [SYMBOL_ID],
          },
          `NBS_SYMBOL_BY_ID_${Date.now()}`
        );

        log.push("2114_SEND_CALLED");
        return;
      }

      // Symbol response
      if (msg.payloadType === 2115) {
        const symbols =
          msg.payload?.symbol ??
          msg.payload?.symbols ??
          [];

        const symbolData = Array.isArray(symbols)
          ? symbols[0]
          : symbols;

        if (!symbolData) {
          finish(
            {
              ok: false,
              stage: "SYMBOL_NOT_FOUND",
              symbolId: SYMBOL_ID,
            },
            404
          );
          return;
        }

        finish({
          ok: true,
          stage: "SYMBOL_LOADED",
          environment: "DEMO",
          accountId: ACCOUNT_ID,
          symbolId: SYMBOL_ID,

          symbol: symbolData,

          normalized: {
            symbolId: symbolData.symbolId ?? SYMBOL_ID,
            symbolName:
              symbolData.symbolName ??
              symbolData.name ??
              null,

            lotSize:
              symbolData.lotSize ??
              null,

            minVolume:
              symbolData.minVolume ??
              null,

            maxVolume:
              symbolData.maxVolume ??
              null,

            stepVolume:
              symbolData.stepVolume ??
              null,

            digits:
              symbolData.digits ??
              null,

            pipPosition:
              symbolData.pipPosition ??
              null,
          },
        });

        return;
      }

      if (msg.payloadType === 2142 || msg.payload?.errorCode) {
        finish(
          {
            ok: false,
            stage: "CTRADER_ERROR",
            errorCode:
              msg.payload?.errorCode ??
              "CTRADER_ERROR",
            error:
              msg.payload?.description ??
              "Unknown cTrader error",
          },
          502
        );
      }
    });

    ws.on("error", (err) => {
      finish(
        {
          ok: false,
          stage: "WEBSOCKET",
          error: err.message,
        },
        502
      );
    });
  });
}
