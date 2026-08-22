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

  let assetsData = [];
  let depositAsset = null;
  let usdAsset = null;

  let conversionSymbols = null;
  let conversionRequested = false;

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

    // ==================================================
    // SEND HELPER
    // ==================================================

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

    // ==================================================
    // REQUEST CONVERSION CHAIN
    // only when trader + asset list are available
    // ==================================================

    const requestConversionIfReady = () => {
      if (
        conversionRequested ||
        !traderData ||
        !Array.isArray(assetsData) ||
        assetsData.length === 0
      ) {
        return;
      }

      const depositAssetId =
        traderData.depositAssetId;

      depositAsset =
        assetsData.find(
          (a) =>
            Number(a?.assetId) ===
            Number(depositAssetId)
        ) ?? null;

      usdAsset =
        assetsData.find(
          (a) =>
            String(a?.name ?? "")
              .toUpperCase() === "USD"
        ) ?? null;

      if (!depositAsset) {
        finish(
          {
            ok: false,
            stage: "DEPOSIT_ASSET_NOT_FOUND",
            depositAssetId,
          },
          500
        );

        return;
      }

      if (!usdAsset) {
        finish(
          {
            ok: false,
            stage: "USD_ASSET_NOT_FOUND",
          },
          500
        );

        return;
      }

      conversionRequested = true;

      send(
        2118,
        {
          ctidTraderAccountId: ACCOUNT_ID,
          firstAssetId: usdAsset.assetId,
          lastAssetId: depositAsset.assetId,
        },
        `NBS_CONVERSION_${Date.now()}`
      );

      log.push("2118_SEND_CALLED");
    };

    // ==================================================
    // FINAL RESPONSE
    // wait for EVERYTHING
    // ==================================================

    const finishIfReady = () => {
      if (
        !traderData ||
        !symbolData ||
        !depositAsset ||
        !usdAsset ||
        !Array.isArray(conversionSymbols)
      ) {
        return;
      }

      const moneyDigits =
        traderData.moneyDigits ?? 2;

      const accountBalance =
        Number(traderData.balance) /
        Math.pow(10, moneyDigits);

      finish({
        ok: true,
        stage: "CONVERSION_CHAIN_LOADED",

        environment: "DEMO",

        accountId: ACCOUNT_ID,
        symbolId: SYMBOL_ID,

        trader: traderData,
        symbol: symbolData,

        depositAsset,
        usdAsset,

        conversion: {
          fromAssetId: usdAsset.assetId,
          fromAsset: usdAsset.name,

          toAssetId: depositAsset.assetId,
          toAsset: depositAsset.name,

          symbols: conversionSymbols,
        },

        normalized: {
          accountCurrency:
            depositAsset.name ?? null,

          accountBalance:
            Number(accountBalance.toFixed(2)),

          moneyDigits,

          depositAssetId:
            traderData.depositAssetId ?? null,

          symbolId:
            symbolData.symbolId ?? SYMBOL_ID,

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

          conversionFrom: "USD",

          conversionTo:
            depositAsset.name ?? null,

          conversionSymbolCount:
            conversionSymbols.length,
        },
      });
    };

    // ==================================================
    // TIMEOUT
    // ==================================================

    const timeout = setTimeout(() => {
      finish(
        {
          ok: false,
          stage: "TIMEOUT",
          error:
            "cTrader symbol/account/conversion request timed out",

          debug: {
            traderLoaded:
              traderData !== null,

            symbolLoaded:
              symbolData !== null,

            assetsLoaded:
              assetsData.length > 0,

            depositAssetLoaded:
              depositAsset !== null,

            usdAssetLoaded:
              usdAsset !== null,

            conversionRequested,

            conversionLoaded:
              Array.isArray(conversionSymbols),
          },
        },
        504
      );
    }, 15000);

    // ==================================================
    // WEBSOCKET OPEN
    // ==================================================

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

    // ==================================================
    // MESSAGES
    // ==================================================

    ws.on("message", (data) => {
      let msg;

      try {
        msg = JSON.parse(data.toString());
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

      log.push(`PAYLOAD_${msg.payloadType}`);

      // ==================================================
      // APP AUTH OK
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
      // ACCOUNT AUTH OK
      // ==================================================

      if (msg.payloadType === 2103) {
        log.push("ACCOUNT_AUTH_OK");

        // Trader/account
        send(
          2121,
          {
            ctidTraderAccountId: ACCOUNT_ID,
          },
          `NBS_TRADER_${Date.now()}`
        );

        log.push("2121_SEND_CALLED");

        // Assets
        send(
          2112,
          {
            ctidTraderAccountId: ACCOUNT_ID,
          },
          `NBS_ASSETS_${Date.now()}`
        );

        log.push("2112_SEND_CALLED");

        // SpotCrude full symbol
        send(
          2116,
          {
            ctidTraderAccountId: ACCOUNT_ID,
            symbolId: [SYMBOL_ID],
          },
          `NBS_SYMBOL_${Date.now()}`
        );

        log.push("2116_SEND_CALLED");

        return;
      }

      // ==================================================
      // TRADER RESPONSE
      // ==================================================

      if (msg.payloadType === 2122) {
        traderData =
          msg.payload?.trader ??
          msg.payload ??
          null;

        log.push("TRADER_DATA_LOADED");

        requestConversionIfReady();
        finishIfReady();

        return;
      }

      // ==================================================
      // ASSET LIST RESPONSE
      // ==================================================

      if (msg.payloadType === 2113) {
        const assets =
          msg.payload?.asset ??
          msg.payload?.assets ??
          [];

        assetsData =
          Array.isArray(assets)
            ? assets
            : [];

        log.push("ASSET_DATA_LOADED");

        requestConversionIfReady();
        finishIfReady();

        return;
      }

      // ==================================================
      // FULL SYMBOL RESPONSE
      // ==================================================

      if (msg.payloadType === 2117) {
        const symbols =
          msg.payload?.symbol ??
          msg.payload?.symbols ??
          [];

        if (Array.isArray(symbols)) {
          symbolData =
            symbols.find(
              (s) =>
                Number(s?.symbolId) ===
                SYMBOL_ID
            ) ??
            symbols[0] ??
            null;
        } else {
          symbolData =
            symbols || null;
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
      // CONVERSION CHAIN RESPONSE
      // ==================================================

      if (msg.payloadType === 2119) {
        const symbols =
          msg.payload?.symbol ??
          msg.payload?.symbols ??
          [];

        conversionSymbols =
          Array.isArray(symbols)
            ? symbols
            : [];

        log.push("CONVERSION_CHAIN_LOADED");

        log.push(
          `CONVERSION_SYMBOLS_${conversionSymbols.length}`
        );

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

    // ==================================================
    // WEBSOCKET ERROR
    // ==================================================

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
