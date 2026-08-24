import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WS_URL = "wss://demo.ctraderapi.com:5036";

const ACCOUNT_ID = 48342468;
const SYMBOL_ID = 250;
const SYMBOL_NAME = "SpotCrude";

export async function GET() {
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

  const log = [];

  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);

    let finished = false;

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
          error: "cTrader request timed out",
        },
        504
      );
    }, 15000);

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

    ws.on("open", () => {
      log.push("WEBSOCKET_OPEN");

      send(
        2100,
        {
          clientId,
          clientSecret,
        },
        `NBS_APP_AUTH_${Date.now()}`
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

      if (msg.payloadType === 2125) {
        const positions =
          msg.payload?.position || [];

        const spotCrudePositions =
          positions
            .filter(
              (p) =>
                p?.tradeData?.symbolId ===
                SYMBOL_ID
            )
            .map((p) => ({
              positionId:
                p.positionId,

              symbolId:
                p.tradeData?.symbolId ??
                null,

              symbol:
                SYMBOL_NAME,

              direction:
                p.tradeData?.tradeSide === 1
                  ? "LONG"
                  : p.tradeData?.tradeSide === 2
                    ? "SHORT"
                    : "UNKNOWN",

              tradeSide:
                p.tradeData?.tradeSide ??
                null,

              volume:
                p.tradeData?.volume ??
                null,

              entryPrice:
                p.price ??
                null,

              stopLoss:
                p.stopLoss ??
                null,

              takeProfit:
                p.takeProfit ??
                null,

              hasStopLoss:
                p.stopLoss !== undefined &&
                p.stopLoss !== null &&
                Number(p.stopLoss) > 0,

              hasTakeProfit:
                p.takeProfit !== undefined &&
                p.takeProfit !== null &&
                Number(p.takeProfit) > 0,

              protected:
                p.stopLoss !== undefined &&
                p.stopLoss !== null &&
                Number(p.stopLoss) > 0 &&
                p.takeProfit !== undefined &&
                p.takeProfit !== null &&
                Number(p.takeProfit) > 0,

              positionStatus:
                p.positionStatus ??
                null,

              label:
                p.tradeData?.label ??
                null,

              openTimestamp:
                p.tradeData?.openTimestamp ??
                null,

              usedMargin:
                p.usedMargin ??
                null,

              swap:
                p.swap ??
                null,
            }));

        finish({
          ok: true,
          stage: "POSITIONS_OK",
          environment: "DEMO",
          accountId: ACCOUNT_ID,
          symbol: SYMBOL_NAME,
          symbolId: SYMBOL_ID,
          count: spotCrudePositions.length,
          positions: spotCrudePositions,
        });

        return;
      }

      if (
        msg.payloadType === 2142 ||
        msg.payload?.errorCode
      ) {
        finish(
          {
            ok: false,
            stage: "CTRADER_ERROR",
            errorCode:
              msg.payload?.errorCode ??
              null,
            error:
              msg.payload?.description ??
              msg.payload?.errorMessage ??
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
