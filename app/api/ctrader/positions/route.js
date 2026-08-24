import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WS_URL = "wss://demo.ctraderapi.com:5036";

const ACCOUNT_ID = 48342468;
const SYMBOL_ID = 250;
const SYMBOL_NAME = "SpotCrude";

export async function GET(request) {
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

  const { searchParams } = new URL(request.url);

  const positionId =
    Number(searchParams.get("positionId"));

  if (
    !Number.isInteger(positionId) ||
    positionId <= 0
  ) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "positionId must be a positive integer",
      },
      { status: 400 }
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
        `NBS_HISTORY_APP_${Date.now()}`
      );

      log.push("2100_SEND_CALLED");
    });

    ws.on("message", (data) => {
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

      // ======================================================
      // APP AUTH
      // ======================================================

      if (msg.payloadType === 2101) {
        log.push("APP_AUTH_OK");

        send(
          2102,
          {
            ctidTraderAccountId:
              ACCOUNT_ID,

            accessToken,
          },
          `NBS_HISTORY_ACCOUNT_${Date.now()}`
        );

        log.push("2102_SEND_CALLED");

        return;
      }

      // ======================================================
      // ACCOUNT AUTH
      //
      // Pull recent deals.
      // ======================================================

      if (msg.payloadType === 2103) {
        log.push("ACCOUNT_AUTH_OK");

        const now = Date.now();

        // Enough for our Position Manager use case.
        const fromTimestamp =
          now - 48 * 60 * 60 * 1000;

        send(
          2133,
          {
            ctidTraderAccountId:
              ACCOUNT_ID,

            fromTimestamp,

            toTimestamp:
              now,

            maxRows:
              500,
          },
          `NBS_HISTORY_DEALS_${Date.now()}`
        );

        log.push("2133_SEND_CALLED");

        return;
      }

      // ======================================================
      // DEAL HISTORY
      // ======================================================

      if (msg.payloadType === 2134) {
        const deals =
          Array.isArray(
            msg.payload?.deal
          )
            ? msg.payload.deal
            : [];

        const matchingDeals =
          deals.filter(
            (deal) =>
              Number(
                deal?.positionId
              ) === positionId
          );

        if (
          matchingDeals.length === 0
        ) {
          finish({
            ok: true,

            stage:
              "POSITION_HISTORY_NOT_FOUND",

            environment:
              "DEMO",

            accountId:
              ACCOUNT_ID,

            symbol:
              SYMBOL_NAME,

            symbolId:
              SYMBOL_ID,

            positionId,

            found:
              false,

            deals:
              [],
          });

          return;
        }

        const normalizedDeals =
          matchingDeals
            .map((deal) => ({
              dealId:
                deal.dealId ??
                null,

              orderId:
                deal.orderId ??
                null,

              positionId:
                deal.positionId ??
                null,

              symbolId:
                deal.symbolId ??
                null,

              tradeSide:
                deal.tradeSide ??
                null,

              direction:
                deal.tradeSide === 1
                  ? "LONG"
                  : deal.tradeSide === 2
                    ? "SHORT"
                    : "UNKNOWN",

              volume:
                deal.volume ??
                null,

              filledVolume:
                deal.filledVolume ??
                null,

              executionPrice:
                deal.executionPrice ??
                null,

              executionTimestamp:
                deal.executionTimestamp ??
                null,

              dealStatus:
                deal.dealStatus ??
                null,

              label:
                deal.label ??
                null,

              closePositionDetail:
                deal.closePositionDetail ??
                null,
            }))
            .sort(
              (a, b) =>
                Number(
                  a.executionTimestamp || 0
                ) -
                Number(
                  b.executionTimestamp || 0
                )
            );

        const closingDeals =
          normalizedDeals.filter(
            (deal) =>
              deal.closePositionDetail != null
          );

        const closingDeal =
          closingDeals.length > 0
            ? closingDeals[
                closingDeals.length - 1
              ]
            : null;

        finish({
          ok: true,

          stage:
            closingDeal
              ? "POSITION_CLOSED_FOUND"
              : "POSITION_DEALS_FOUND",

          environment:
            "DEMO",

          accountId:
            ACCOUNT_ID,

          symbol:
            SYMBOL_NAME,

          symbolId:
            SYMBOL_ID,

          positionId,

          found:
            true,

          closed:
            closingDeal !== null,

          closingDeal,

          deals:
            normalizedDeals,
        });

        return;
      }

      // ======================================================
      // CTRADER ERROR
      // ======================================================

      if (
        msg.payloadType === 2142 ||
        msg.payload?.errorCode
      ) {
        finish(
          {
            ok: false,

            stage:
              "CTRADER_ERROR",

            errorCode:
              msg.payload
                ?.errorCode ??
              null,

            error:
              msg.payload
                ?.description ??
              msg.payload
                ?.errorMessage ??
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
