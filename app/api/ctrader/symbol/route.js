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

  let traderData = null;
  let symbolData = null;
  let depositAsset = null;

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

    const finishIfReady = () => {
      if (!traderData || !symbolData || !depositAsset) {
  return;
}

      finish({
        ok: true,
        stage: "SYMBOL_AND_ACCOUNT_LOADED",

        environment: "DEMO",

        accountId: ACCOUNT_ID,
        symbolId: SYMBOL_ID,

        trader: traderData,
        symbol: symbolData,
        depositAsset,

        normalized: {
          symbolId:
            symbolData.symbolId ?? SYMBOL_ID,
          accountCurrency:
  depositAsset?.name ??
  depositAsset?.displayName ??
  null,

accountBalance:
  traderData?.balance !== null &&
  traderData?.balance !== undefined
    ? traderData.balance /
      Math.pow(10, traderData.moneyDigits ?? 2)
    : null,

moneyDigits:
  traderData?.moneyDigits ?? null,

          symbolName:
            symbolData.symbolName ??
            symbolData.name ??
            null,

          lotSize:
            symbolData.lotSize ?? null,

          minVolume:
            symbolData.minVolume ?? null,

          maxVolume:
            symbolData.maxVolume ?? null,

          stepVolume:
            symbolData.stepVolume ?? null,

          digits:
            symbolData.digits ?? null,

          pipPosition:
            symbolData.pipPosition ?? null,

          measurementUnits:
            symbolData.measurementUnits ?? null,

          balance:
            traderData.balance ?? null,

          depositAssetId:
            traderData.depositAssetId ?? null,
        },
      });
    };

    const timeout = setTimeout(() => {
      finish(
        {
          ok: false,
          stage: "TIMEOUT",
          error: "cTrader symbol/account request timed out",
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
          `NBS_SYMBOL_ACCOUNT_AUTH_${Date.now()}`
        );

        log.push("2102_SEND_CALLED");
        return;
      }

      // ==================================================
      // ACCOUNT AUTH
      // ==================================================

      if (msg.payloadType === 2103) {
  log.push("ACCOUNT_AUTH_OK");

  // 1. Trader/account info
  send(
    2121,
    {
      ctidTraderAccountId: ACCOUNT_ID,
    },
    `NBS_TRADER_${Date.now()}`
  );

  log.push("2121_SEND_CALLED");

  // 2. Asset list
  send(
    2112,
    {
      ctidTraderAccountId: ACCOUNT_ID,
    },
    `NBS_ASSETS_${Date.now()}`
  );

  log.push("2112_SEND_CALLED");

  // 3. Full SpotCrude symbol specification
  send(
    2116,
    {
      ctidTraderAccountId: ACCOUNT_ID,
      symbolId: [SYMBOL_ID],
    },
    `NBS_SYMBOL_BY_ID_${Date.now()}`
  );

  log.push("2116_SEND_CALLED");

  return;
}
      // ==================================================
      // TRADER / ACCOUNT RESPONSE
      // ==================================================

      if (msg.payloadType === 2122) {
        traderData =
          msg.payload?.trader ??
          msg.payload ??
          null;

        log.push("TRADER_DATA_LOADED");

        finishIfReady();
        return;
      }

      // ==================================================
      // FULL SYMBOL RESPONSE
      // ==================================================
    if (msg.payloadType === 2113) {
  const assets =
    msg.payload?.asset ??
    msg.payload?.assets ??
    [];

  const depositAssetId =
    traderData?.depositAssetId ?? 6;

  depositAsset =
    Array.isArray(assets)
      ? assets.find(
          a => Number(a?.assetId) === Number(depositAssetId)
        ) ?? null
      : null;

  log.push("ASSET_DATA_LOADED");

  finishIfReady();
  return;
}
      if (msg.payloadType === 2117) {
        const symbols =
          msg.payload?.symbol ??
          msg.payload?.symbols ??
          [];

        if (Array.isArray(symbols)) {
          symbolData =
            symbols.find(
              (s) =>
                Number(s?.symbolId) === SYMBOL_ID
            ) ??
            symbols[0] ??
            null;
        } else {
          symbolData = symbols || null;
        }

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

        log.push("SYMBOL_DATA_LOADED");

        finishIfReady();
        return;
      }

      // ==================================================
      // CTRADER ERROR
      // ==================================================

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
              "CTRADER_ERROR",

            error:
              msg.payload?.description ??
              "Unknown cTrader error",
          },
          502
        );

        return;
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
