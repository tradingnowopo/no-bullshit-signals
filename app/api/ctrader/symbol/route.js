import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WS_URL = "wss://demo.ctraderapi.com:5036";

const ACCOUNT_ID = 48342468;
const SPOTCRUDE_SYMBOL_ID = 250;

// --------------------------------------------------
// DEFAULT RISK SETTINGS
// Can be overridden by query params:
// ?entry=84.47&sl=84.343&riskPercent=1&hardCapGBP=10
// --------------------------------------------------

const DEFAULT_RISK_PERCENT = 1.0;
const DEFAULT_HARD_CAP_GBP = 10.0;


// ==================================================
// GET
// ==================================================

export async function GET(request) {
  const executorKey = process.env.NBS_EXECUTOR_KEY;
  const providedKey =
    request.headers.get("x-nbs-executor-key");

  if (
    !executorKey ||
    providedKey !== executorKey
  ) {
    return Response.json(
      {
        ok: false,
        stage: "AUTH",
        error: "Unauthorized executor request",
      },
      { status: 401 }
    );
  }

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


  // ==================================================
  // QUERY PARAMS
  // ==================================================

  const url = new URL(request.url);

  const entry = Number(
    url.searchParams.get("entry")
  );

  const sl = Number(
    url.searchParams.get("sl")
  );

  const riskPercentRaw = Number(
    url.searchParams.get("riskPercent")
  );

  const hardCapGBPRaw = Number(
    url.searchParams.get("hardCapGBP")
  );

  const riskPercent =
    Number.isFinite(riskPercentRaw) &&
    riskPercentRaw > 0
      ? riskPercentRaw
      : DEFAULT_RISK_PERCENT;

  const hardCapGBP =
    Number.isFinite(hardCapGBPRaw) &&
    hardCapGBPRaw > 0
      ? hardCapGBPRaw
      : DEFAULT_HARD_CAP_GBP;

  const sizingRequested =
    Number.isFinite(entry) &&
    Number.isFinite(sl) &&
    entry > 0 &&
    sl > 0 &&
    entry !== sl;


  // ==================================================
  // RUNTIME STATE
  // ==================================================

  let traderData = null;

  let spotCrudeSymbol = null;

  let assetsData = [];

  let depositAsset = null;
  let usdAsset = null;

  let conversionSymbols = null;

  let conversionRequested = false;

  let conversionSymbol = null;

  let conversionSymbolSpec = null;

  let conversionSubscriptionSent = false;

  let conversionBid = null;
  let conversionAsk = null;

  let conversionTimestamp = null;


  // ==================================================
  // WEBSOCKET
  // ==================================================

  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);

    let finished = false;

    const log = [];


    // ==================================================
    // FINISH
    // ==================================================

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


    // ==================================================
    // SEND
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
    // ==================================================

    const requestConversionIfReady = () => {
      if (
        conversionRequested ||
        !traderData ||
        assetsData.length === 0
      ) {
        return;
      }

      const depositAssetId =
        traderData.depositAssetId;

      depositAsset =
        assetsData.find(
          (asset) =>
            Number(asset?.assetId) ===
            Number(depositAssetId)
        ) ?? null;

      usdAsset =
        assetsData.find(
          (asset) =>
            String(
              asset?.name ?? ""
            ).toUpperCase() === "USD"
        ) ?? null;

      if (!depositAsset) {
        finish(
          {
            ok: false,
            stage:
              "DEPOSIT_ASSET_NOT_FOUND",
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
          ctidTraderAccountId:
            ACCOUNT_ID,

          firstAssetId:
            usdAsset.assetId,

          lastAssetId:
            depositAsset.assetId,
        },
        `NBS_CONVERSION_${Date.now()}`
      );

      log.push(
        "2118_SEND_CALLED"
      );
    };


    // ==================================================
    // REQUEST FULL SPEC FOR CONVERSION SYMBOL
    // ==================================================

    const requestConversionSymbolSpec =
      () => {
        if (
          !conversionSymbol ||
          conversionSymbolSpec
        ) {
          return;
        }

        send(
          2116,
          {
            ctidTraderAccountId:
              ACCOUNT_ID,

            symbolId: [
              Number(
                conversionSymbol.symbolId
              ),
            ],
          },
          `NBS_CONVERSION_SYMBOL_SPEC_${Date.now()}`
        );

        log.push(
          "2116_CONVERSION_SPEC_SEND_CALLED"
        );
      };


    // ==================================================
    // SUBSCRIBE TO LIVE CONVERSION QUOTE
    // ==================================================

    const subscribeConversionQuote =
      () => {
        if (
          conversionSubscriptionSent ||
          !conversionSymbol
        ) {
          return;
        }

        conversionSubscriptionSent =
          true;

        send(
          2127,
          {
            ctidTraderAccountId:
              ACCOUNT_ID,

            symbolId: [
              Number(
                conversionSymbol.symbolId
              ),
            ],

            subscribeToSpotTimestamp:
              true,
          },
          `NBS_CONVERSION_SPOT_${Date.now()}`
        );

        log.push(
          "2127_SEND_CALLED"
        );
      };


    // ==================================================
    // FINAL CALCULATION
    // ==================================================

    const finishIfReady = () => {
      if (
        !traderData ||
        !spotCrudeSymbol ||
        !depositAsset ||
        !usdAsset ||
        !conversionSymbol ||
        !conversionSymbolSpec ||
        !Number.isFinite(conversionBid) ||
        !Number.isFinite(conversionAsk)
      ) {
        return;
      }


      // ----------------------------------------------
      // ACCOUNT BALANCE
      // ----------------------------------------------

      const moneyDigits =
        Number(
          traderData.moneyDigits ?? 2
        );

      const accountBalanceGBP =
        Number(traderData.balance) /
        Math.pow(
          10,
          moneyDigits
        );


      // ----------------------------------------------
      // GBPUSD
      //
      // GBPUSD = USD per 1 GBP
      //
      // We use BID for conservative sizing:
      //
      // riskUSD = riskGBP * GBPUSD_bid
      //
      // This avoids slightly exceeding the GBP cap
      // because of spread.
      // ----------------------------------------------

      const gbpUsdBid =
        conversionBid;

      const gbpUsdAsk =
        conversionAsk;

      const gbpUsdMid =
        (
          gbpUsdBid +
          gbpUsdAsk
        ) / 2;


      // ----------------------------------------------
      // SYMBOL SPEC
      // ----------------------------------------------

      const minVolume =
        Number(
          spotCrudeSymbol.minVolume
        );

      const maxVolume =
        Number(
          spotCrudeSymbol.maxVolume
        );

      const stepVolume =
        Number(
          spotCrudeSymbol.stepVolume
        );

      const lotSize =
        Number(
          spotCrudeSymbol.lotSize
        );


      // ==================================================
      // NO SIZING REQUEST
      // Just return broker data.
      // ==================================================

      if (!sizingRequested) {
        finish({
          ok: true,

          stage:
            "BROKER_DATA_READY",

          environment: "DEMO",

          accountId:
            ACCOUNT_ID,

          account: {
            currency:
              depositAsset.name,

            balance:
              Number(
                accountBalanceGBP.toFixed(
                  2
                )
              ),

            moneyDigits,
          },

          spotCrude: {
            symbolId:
              SPOTCRUDE_SYMBOL_ID,

            lotSize,

            minVolume,

            maxVolume,

            stepVolume,

            measurementUnits:
              spotCrudeSymbol
                .measurementUnits ??
              null,

            digits:
              spotCrudeSymbol.digits ??
              null,

            pipPosition:
              spotCrudeSymbol
                .pipPosition ??
              null,
          },

          conversion: {
            symbolId:
              conversionSymbol.symbolId,

            symbolName:
              conversionSymbol.symbolName,

            bid:
              Number(
                gbpUsdBid.toFixed(5)
              ),

            ask:
              Number(
                gbpUsdAsk.toFixed(5)
              ),

            mid:
              Number(
                gbpUsdMid.toFixed(5)
              ),

            from:
              "USD",

            to:
              "GBP",

            quoteTimestamp:
              conversionTimestamp,
          },

          sizing: null,
        });

        return;
      }


      // ==================================================
      // POSITION SIZING
      // ==================================================

      const stopDistance =
        Math.abs(
          entry - sl
        );

      if (
        !Number.isFinite(
          stopDistance
        ) ||
        stopDistance <= 0
      ) {
        finish(
          {
            ok: false,

            stage:
              "INVALID_STOP_DISTANCE",

            entry,
            sl,
          },
          400
        );

        return;
      }


      // ----------------------------------------------
      // Risk in GBP
      // ----------------------------------------------

      const percentageRiskGBP =
        accountBalanceGBP *
        (
          riskPercent / 100
        );

      const finalRiskGBP =
        Math.min(
          percentageRiskGBP,
          hardCapGBP
        );


      // ----------------------------------------------
      // GBP -> USD risk budget
      //
      // SpotCrude P/L is in USD.
      // ----------------------------------------------

      const riskUSD =
        finalRiskGBP *
        gbpUsdBid;


      // ----------------------------------------------
      // Raw barrels
      //
      // 1 barrel:
      // loss = stopDistance USD
      // ----------------------------------------------

      const rawBarrels =
        riskUSD /
        stopDistance;


      // ----------------------------------------------
      // cTrader protocol:
      //
      // volume is in cents of units.
      //
      // 100 protocol volume
      // = 1 barrel
      //
      // ----------------------------------------------

      const rawProtocolVolume =
        rawBarrels * 100;


      // ----------------------------------------------
      // Round DOWN to broker step.
      //
      // Never round upward because that
      // could exceed hard risk cap.
      // ----------------------------------------------

      let protocolVolume =
        Math.floor(
          rawProtocolVolume /
          stepVolume
        ) *
        stepVolume;


      // ----------------------------------------------
      // Min volume
      // ----------------------------------------------

      if (
        protocolVolume <
        minVolume
      ) {
        finish(
          {
            ok: false,

            stage:
              "RISK_TOO_SMALL_FOR_MIN_VOLUME",

            risk: {
              riskPercent,

              hardCapGBP,

              finalRiskGBP:
                Number(
                  finalRiskGBP.toFixed(
                    2
                  )
                ),

              minimumVolume:
                minVolume,
            },

            sizing: {
              rawBarrels:
                Number(
                  rawBarrels.toFixed(
                    4
                  )
                ),

              rawProtocolVolume:
                Number(
                  rawProtocolVolume.toFixed(
                    2
                  )
                ),
            },
          },
          400
        );

        return;
      }


      // ----------------------------------------------
      // Max broker volume
      // ----------------------------------------------

      let cappedByMaxVolume =
        false;

      if (
        protocolVolume >
        maxVolume
      ) {
        protocolVolume =
          maxVolume;

        cappedByMaxVolume =
          true;
      }


      // ----------------------------------------------
      // Final units/barrels/lots
      // ----------------------------------------------

      const barrels =
        protocolVolume / 100;

      const lots =
        protocolVolume /
        lotSize;


      // ----------------------------------------------
      // Actual risk AFTER rounding
      // ----------------------------------------------

      const actualRiskUSD =
        barrels *
        stopDistance;

      const actualRiskGBP =
        actualRiskUSD /
        gbpUsdBid;


      // ----------------------------------------------
      // Safety verification
      // ----------------------------------------------

      const exceedsRiskCap =
        actualRiskGBP >
        finalRiskGBP + 0.01;


      if (exceedsRiskCap) {
        finish(
          {
            ok: false,

            stage:
              "RISK_CAP_SAFETY_BLOCK",

            error:
              "Calculated position exceeds requested GBP risk cap.",

            requestedRiskGBP:
              finalRiskGBP,

            actualRiskGBP,
          },
          500
        );

        return;
      }


      // ==================================================
      // SUCCESS
      // ==================================================

      finish({
        ok: true,

        stage:
          "POSITION_SIZE_READY",

        environment:
          "DEMO",

        accountId:
          ACCOUNT_ID,

        account: {
          currency:
            depositAsset.name,

          balance:
            Number(
              accountBalanceGBP.toFixed(
                2
              )
            ),
        },

        trade: {
          entry,

          sl,

          stopDistance:
            Number(
              stopDistance.toFixed(
                4
              )
            ),
        },

        risk: {
          riskPercent,

          percentageRiskGBP:
            Number(
              percentageRiskGBP.toFixed(
                2
              )
            ),

          hardCapGBP:
            Number(
              hardCapGBP.toFixed(
                2
              )
            ),

          finalRiskGBP:
            Number(
              finalRiskGBP.toFixed(
                2
              )
            ),

          riskUSD:
            Number(
              riskUSD.toFixed(
                2
              )
            ),

          actualRiskGBP:
            Number(
              actualRiskGBP.toFixed(
                2
              )
            ),

          actualRiskUSD:
            Number(
              actualRiskUSD.toFixed(
                2
              )
            ),
        },

        conversion: {
          symbolId:
            conversionSymbol.symbolId,

          symbolName:
            conversionSymbol.symbolName,

          bid:
            Number(
              gbpUsdBid.toFixed(
                5
              )
            ),

          ask:
            Number(
              gbpUsdAsk.toFixed(
                5
              )
            ),

          mid:
            Number(
              gbpUsdMid.toFixed(
                5
              )
            ),

          quoteTimestamp:
            conversionTimestamp,
        },

        position: {
          rawBarrels:
            Number(
              rawBarrels.toFixed(
                4
              )
            ),

          barrels:
            Number(
              barrels.toFixed(
                2
              )
            ),

          lots:
            Number(
              lots.toFixed(
                4
              )
            ),

          protocolVolume:
            Number(
              protocolVolume
            ),

          minVolume,

          maxVolume,

          stepVolume,

          lotSize,

          cappedByMaxVolume,
        },

        broker: {
          symbol:
            "SpotCrude",

          symbolId:
            SPOTCRUDE_SYMBOL_ID,

          measurementUnits:
            spotCrudeSymbol
              .measurementUnits ??
            null,
        },
      });
    };


    // ==================================================
    // TIMEOUT
    // ==================================================

    const timeout =
      setTimeout(() => {
        finish(
          {
            ok: false,

            stage:
              "TIMEOUT",

            error:
              "cTrader broker-data/position-size request timed out",

            debug: {
              traderLoaded:
                traderData !== null,

              spotCrudeLoaded:
                spotCrudeSymbol !== null,

              assetsLoaded:
                assetsData.length > 0,

              depositAssetLoaded:
                depositAsset !== null,

              usdAssetLoaded:
                usdAsset !== null,

              conversionRequested,

              conversionChainLoaded:
                Array.isArray(
                  conversionSymbols
                ),

              conversionSymbolLoaded:
                conversionSymbol !== null,

              conversionSpecLoaded:
                conversionSymbolSpec !== null,

              spotSubscriptionSent:
                conversionSubscriptionSent,

              bidLoaded:
                Number.isFinite(
                  conversionBid
                ),

              askLoaded:
                Number.isFinite(
                  conversionAsk
                ),
            },
          },
          504
        );
      }, 15000);


    // ==================================================
    // WS OPEN
    // ==================================================

    ws.on(
      "open",
      () => {
        log.push(
          "WEBSOCKET_OPEN"
        );

        send(
          2100,
          {
            clientId,
            clientSecret,
          },
          `NBS_APP_AUTH_${Date.now()}`
        );

        log.push(
          "2100_SEND_CALLED"
        );
      }
    );


    // ==================================================
    // WS MESSAGE
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
          finish(
            {
              ok: false,

              stage:
                "PARSE",

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


        // ==================================================
        // 2101 APP AUTH
        // ==================================================

        if (
          msg.payloadType ===
          2101
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
            `NBS_ACCOUNT_AUTH_${Date.now()}`
          );

          log.push(
            "2102_SEND_CALLED"
          );

          return;
        }


        // ==================================================
        // 2103 ACCOUNT AUTH
        // ==================================================

        if (
          msg.payloadType ===
          2103
        ) {
          log.push(
            "ACCOUNT_AUTH_OK"
          );


          // Trader
          send(
            2121,
            {
              ctidTraderAccountId:
                ACCOUNT_ID,
            },
            `NBS_TRADER_${Date.now()}`
          );

          log.push(
            "2121_SEND_CALLED"
          );


          // Asset list
          send(
            2112,
            {
              ctidTraderAccountId:
                ACCOUNT_ID,
            },
            `NBS_ASSETS_${Date.now()}`
          );

          log.push(
            "2112_SEND_CALLED"
          );


          // SpotCrude spec
          send(
            2116,
            {
              ctidTraderAccountId:
                ACCOUNT_ID,

              symbolId: [
                SPOTCRUDE_SYMBOL_ID,
              ],
            },
            `NBS_SPOTCRUDE_SPEC_${Date.now()}`
          );

          log.push(
            "2116_SPOTCRUDE_SEND_CALLED"
          );

          return;
        }


        // ==================================================
        // 2122 TRADER
        // ==================================================

        if (
          msg.payloadType ===
          2122
        ) {
          traderData =
            msg.payload?.trader ??
            msg.payload ??
            null;

          log.push(
            "TRADER_DATA_LOADED"
          );

          requestConversionIfReady();
          finishIfReady();

          return;
        }


        // ==================================================
        // 2113 ASSETS
        // ==================================================

        if (
          msg.payloadType ===
          2113
        ) {
          const assets =
            msg.payload?.asset ??
            msg.payload?.assets ??
            [];

          assetsData =
            Array.isArray(
              assets
            )
              ? assets
              : [];

          log.push(
            "ASSET_DATA_LOADED"
          );

          requestConversionIfReady();
          finishIfReady();

          return;
        }


        // ==================================================
        // 2117 FULL SYMBOL
        //
        // This response is used for BOTH:
        // SpotCrude and GBPUSD specs.
        // ==================================================

        if (
          msg.payloadType ===
          2117
        ) {
          const symbols =
            msg.payload?.symbol ??
            msg.payload?.symbols ??
            [];

          const list =
            Array.isArray(
              symbols
            )
              ? symbols
              : [
                  symbols,
                ];


          for (
            const symbol
            of list
          ) {
            const id =
              Number(
                symbol?.symbolId
              );


            if (
              id ===
              SPOTCRUDE_SYMBOL_ID
            ) {
              spotCrudeSymbol =
                symbol;

              log.push(
                "SPOTCRUDE_SPEC_LOADED"
              );
            }


            if (
              conversionSymbol &&
              id ===
                Number(
                  conversionSymbol
                    .symbolId
                )
            ) {
              conversionSymbolSpec =
                symbol;

              log.push(
                "CONVERSION_SYMBOL_SPEC_LOADED"
              );
            }
          }


          finishIfReady();

          return;
        }


        // ==================================================
        // 2119 CONVERSION CHAIN
        // ==================================================

        if (
          msg.payloadType ===
          2119
        ) {
          const symbols =
            msg.payload?.symbol ??
            msg.payload?.symbols ??
            [];

          conversionSymbols =
            Array.isArray(
              symbols
            )
              ? symbols
              : [];


          log.push(
            "CONVERSION_CHAIN_LOADED"
          );


          if (
            conversionSymbols.length ===
            0
          ) {
            finish(
              {
                ok: false,

                stage:
                  "EMPTY_CONVERSION_CHAIN",
              },
              500
            );

            return;
          }


          // For this account:
          // GBPUSD should be the chain.
          conversionSymbol =
            conversionSymbols[0];


          requestConversionSymbolSpec();

          subscribeConversionQuote();

          return;
        }


        // ==================================================
        // 2128 SPOT SUBSCRIPTION ACK
        // ==================================================

        if (
          msg.payloadType ===
          2128
        ) {
          log.push(
            "SPOT_SUBSCRIPTION_OK"
          );

          return;
        }


        // ==================================================
        // 2131 LIVE SPOT EVENT
        // ==================================================

        if (
          msg.payloadType ===
          2131
        ) {
          const event =
            msg.payload ?? {};


          if (
            Number(
              event.symbolId
            ) !==
            Number(
              conversionSymbol
                ?.symbolId
            )
          ) {
            return;
          }


          if (
            event.bid !==
            undefined &&
            event.bid !==
            null
          ) {
            conversionBid =
              Number(
                event.bid
              ) /
              100000;
          }


          if (
            event.ask !==
            undefined &&
            event.ask !==
            null
          ) {
            conversionAsk =
              Number(
                event.ask
              ) /
              100000;
          }


          if (
            event.timestamp !==
            undefined &&
            event.timestamp !==
            null
          ) {
            conversionTimestamp =
              Number(
                event.timestamp
              );
          }


          log.push(
            "CONVERSION_SPOT_EVENT"
          );


          finishIfReady();

          return;
        }


        // ==================================================
        // CTRADER ERROR
        // ==================================================

        if (
          msg.payloadType ===
            2142 ||
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
                "CTRADER_ERROR",

              error:
                msg.payload
                  ?.description ??
                "Unknown cTrader error",
            },
            502
          );

          return;
        }
      }
    );


    // ==================================================
    // WS ERROR
    // ==================================================

    ws.on(
      "error",
      (err) => {
        finish(
          {
            ok: false,

            stage:
              "WEBSOCKET",

            error:
              err.message,
          },
          502
        );
      }
    );
  });
}
