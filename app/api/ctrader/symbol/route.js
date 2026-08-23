import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WS_URL = "wss://demo.ctraderapi.com:5036";

const MAX_CONNECT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;
const ATTEMPT_TIMEOUT_MS = 8000;

const ACCOUNT_ID = 48342468;
const SPOTCRUDE_SYMBOL_ID = 250;

const DEFAULT_RISK_PERCENT = 1.0;
const DEFAULT_HARD_CAP_GBP = 10.0;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));


// ==================================================
// ONE CTRADER CONNECTION ATTEMPT
// ==================================================

function runCTraderAttempt({
  clientId,
  clientSecret,
  accessToken,
  entry,
  sl,
  riskPercent,
  hardCapGBP,
  sizingRequested,
  attemptNumber,
}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, {
  perMessageDeflate: false,
  handshakeTimeout: 15000,
});

    let finished = false;

    const log = [
      `ATTEMPT_${attemptNumber}_START`,
    ];

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
    // FINISH ATTEMPT
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
        attemptNumber,
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
          retryable: false,
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
        finish({
          ok: false,
          retryable: false,
          stage: "DEPOSIT_ASSET_NOT_FOUND",
          error: "Deposit asset not found",
          depositAssetId,
        });

        return;
      }

      if (!usdAsset) {
        finish({
          ok: false,
          retryable: false,
          stage: "USD_ASSET_NOT_FOUND",
          error: "USD asset not found",
        });

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
    // REQUEST CONVERSION SYMBOL SPEC
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
    // SUBSCRIBE GBPUSD
    // ==================================================

    const subscribeConversionQuote =
      () => {
        if (
          conversionSubscriptionSent ||
          !conversionSymbol
        ) {
          return;
        }

        conversionSubscriptionSent = true;

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


      // ==================================================
      // ACCOUNT
      // ==================================================

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


      // ==================================================
      // GBPUSD
      // ==================================================

      const gbpUsdBid =
        conversionBid;

      const gbpUsdAsk =
        conversionAsk;

      const gbpUsdMid =
        (
          gbpUsdBid +
          gbpUsdAsk
        ) / 2;


      // ==================================================
      // SPOTCRUDE SPEC
      // ==================================================

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


      if (
        !Number.isFinite(minVolume) ||
        !Number.isFinite(maxVolume) ||
        !Number.isFinite(stepVolume) ||
        !Number.isFinite(lotSize) ||
        minVolume <= 0 ||
        maxVolume <= 0 ||
        stepVolume <= 0 ||
        lotSize <= 0
      ) {
        finish({
          ok: false,
          retryable: false,
          stage: "INVALID_SYMBOL_SPEC",
          error:
            "Invalid SpotCrude volume specification",
        });

        return;
      }


      // ==================================================
      // BROKER DATA ONLY
      // ==================================================

      if (!sizingRequested) {
        finish({
          ok: true,
          retryable: false,

          stage: "BROKER_DATA_READY",

          environment: "DEMO",
          accountId: ACCOUNT_ID,

          account: {
            currency:
              depositAsset.name,

            balance:
              Number(
                accountBalanceGBP.toFixed(2)
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

            from: "USD",
            to: "GBP",

            quoteTimestamp:
              conversionTimestamp,
          },

          sizing: null,
        });

        return;
      }


      // ==================================================
      // STOP DISTANCE
      // ==================================================

      const stopDistance =
        Math.abs(
          entry - sl
        );

      if (
        !Number.isFinite(stopDistance) ||
        stopDistance <= 0
      ) {
        finish({
          ok: false,
          retryable: false,

          stage:
            "INVALID_STOP_DISTANCE",

          error:
            "Invalid stop distance",

          entry,
          sl,
        });

        return;
      }


      // ==================================================
      // RISK GBP
      // ==================================================

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


      // ==================================================
      // GBP -> USD
      // ==================================================

      const riskUSD =
        finalRiskGBP *
        gbpUsdBid;


      // ==================================================
      // BARRELS
      // ==================================================

      const rawBarrels =
        riskUSD /
        stopDistance;


      // ==================================================
      // CTRADER PROTOCOL VOLUME
      //
      // 100 protocol volume = 1 barrel
      // ==================================================

      const rawProtocolVolume =
        rawBarrels * 100;


      // Round DOWN to broker step
      let protocolVolume =
        Math.floor(
          rawProtocolVolume /
          stepVolume
        ) *
        stepVolume;


      // ==================================================
      // MIN VOLUME
      // ==================================================

      if (
        protocolVolume <
        minVolume
      ) {
        finish({
          ok: false,
          retryable: false,

          stage:
            "RISK_TOO_SMALL_FOR_MIN_VOLUME",

          risk: {
            riskPercent,

            hardCapGBP,

            finalRiskGBP:
              Number(
                finalRiskGBP.toFixed(2)
              ),

            minimumVolume:
              minVolume,
          },

          sizing: {
            rawBarrels:
              Number(
                rawBarrels.toFixed(4)
              ),

            rawProtocolVolume:
              Number(
                rawProtocolVolume.toFixed(2)
              ),
          },
        });

        return;
      }


      // ==================================================
      // MAX VOLUME
      // ==================================================

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


      // ==================================================
      // FINAL POSITION
      // ==================================================

      const barrels =
        protocolVolume / 100;

      const lots =
        protocolVolume /
        lotSize;


      // ==================================================
      // ACTUAL RISK
      // ==================================================

      const actualRiskUSD =
        barrels *
        stopDistance;

      const actualRiskGBP =
        actualRiskUSD /
        gbpUsdBid;


      // ==================================================
      // HARD SAFETY CHECK
      // ==================================================

      if (
        actualRiskGBP >
        finalRiskGBP + 0.01
      ) {
        finish({
          ok: false,
          retryable: false,

          stage:
            "RISK_CAP_SAFETY_BLOCK",

          error:
            "Calculated position exceeds requested GBP risk cap.",

          requestedRiskGBP:
            finalRiskGBP,

          actualRiskGBP,
        });

        return;
      }


      // ==================================================
      // SUCCESS
      // ==================================================

      finish({
        ok: true,
        retryable: false,

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
              accountBalanceGBP.toFixed(2)
            ),
        },

        trade: {
          entry,
          sl,

          stopDistance:
            Number(
              stopDistance.toFixed(4)
            ),
        },

        risk: {
          riskPercent,

          percentageRiskGBP:
            Number(
              percentageRiskGBP.toFixed(2)
            ),

          hardCapGBP:
            Number(
              hardCapGBP.toFixed(2)
            ),

          finalRiskGBP:
            Number(
              finalRiskGBP.toFixed(2)
            ),

          riskUSD:
            Number(
              riskUSD.toFixed(2)
            ),

          actualRiskGBP:
            Number(
              actualRiskGBP.toFixed(2)
            ),

          actualRiskUSD:
            Number(
              actualRiskUSD.toFixed(2)
            ),
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

          quoteTimestamp:
            conversionTimestamp,
        },

        position: {
          rawBarrels:
            Number(
              rawBarrels.toFixed(4)
            ),

          barrels:
            Number(
              barrels.toFixed(2)
            ),

          lots:
            Number(
              lots.toFixed(4)
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
    // ATTEMPT TIMEOUT
    // ==================================================

    const timeout =
      setTimeout(() => {
        finish({
          ok: false,
          retryable: false,

          stage: "TIMEOUT",

          error:
            "cTrader broker-data/position-size attempt timed out",

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

    // Give cTrader proxy a short moment to finish
    // routing the newly established WebSocket.
    await sleep(350);

    if (finished) {
      return;
    }

    if (
      ws.readyState !==
      WebSocket.OPEN
    ) {
      finish({
        ok: false,
        retryable: true,
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
            retryable: false,

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
        // Handle FIRST
        // ==================================================

        if (
          msg.payloadType === 2142 ||
          msg.payload?.errorCode
        ) {
          const errorCode =
            msg.payload?.errorCode ??
            "CTRADER_ERROR";

          const description =
            msg.payload?.description ??
            "Unknown cTrader error";


          // ONLY this error is automatically retryable.
          if (
            errorCode ===
            "CANT_ROUTE_REQUEST"
          ) {
            log.push(
              "CANT_ROUTE_REQUEST"
            );

            finish({
              ok: false,
              retryable: true,

              stage:
                "CTRADER_ERROR",

              errorCode,

              error:
                description,
            });

            return;
          }


          finish({
            ok: false,
            retryable: false,

            stage:
              "CTRADER_ERROR",

            errorCode,

            error:
              description,
          });

          return;
        }


        // ==================================================
        // 2101 APP AUTH
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
          msg.payloadType === 2103
        ) {
          log.push(
            "ACCOUNT_AUTH_OK"
          );


          // Trader/account
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


          // Assets
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


          // SpotCrude full specification
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
          msg.payloadType === 2122
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
          msg.payloadType === 2113
        ) {
          const assets =
            msg.payload?.asset ??
            msg.payload?.assets ??
            [];

          assetsData =
            Array.isArray(assets)
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
        // ==================================================

        if (
          msg.payloadType === 2117
        ) {
          const symbols =
            msg.payload?.symbol ??
            msg.payload?.symbols ??
            [];

          const list =
            Array.isArray(symbols)
              ? symbols
              : [symbols];


          for (
            const symbol of list
          ) {
            if (!symbol) continue;

            const id =
              Number(
                symbol?.symbolId
              );


            // SpotCrude
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


            // Conversion symbol
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
          msg.payloadType === 2119
        ) {
          const symbols =
            msg.payload?.symbol ??
            msg.payload?.symbols ??
            [];

          conversionSymbols =
            Array.isArray(symbols)
              ? symbols
              : [];


          log.push(
            "CONVERSION_CHAIN_LOADED"
          );


          if (
            conversionSymbols.length ===
            0
          ) {
            finish({
              ok: false,
              retryable: false,

              stage:
                "EMPTY_CONVERSION_CHAIN",

              error:
                "No USD to account currency conversion chain returned",
            });

            return;
          }


          conversionSymbol =
            conversionSymbols[0];


          requestConversionSymbolSpec();

          subscribeConversionQuote();

          return;
        }


        // ==================================================
        // 2128 SUBSCRIPTION ACK
        // ==================================================

        if (
          msg.payloadType === 2128
        ) {
          log.push(
            "SPOT_SUBSCRIPTION_OK"
          );

          return;
        }


        // ==================================================
        // 2131 LIVE GBPUSD QUOTE
        // ==================================================

        if (
          msg.payloadType === 2131
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
            event.bid !== undefined &&
            event.bid !== null
          ) {
            conversionBid =
              Number(event.bid) /
              100000;
          }


          if (
            event.ask !== undefined &&
            event.ask !== null
          ) {
            conversionAsk =
              Number(event.ask) /
              100000;
          }


          if (
            event.timestamp !== undefined &&
            event.timestamp !== null
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
          retryable: false,

          stage:
            "WEBSOCKET",

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
  // EXECUTOR AUTH
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
          "Unauthorized executor request",
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
  // QUERY PARAMS
  // ==================================================

  const url =
    new URL(request.url);


  const entry =
    Number(
      url.searchParams.get(
        "entry"
      )
    );


  const sl =
    Number(
      url.searchParams.get(
        "sl"
      )
    );


  const riskPercentRaw =
    Number(
      url.searchParams.get(
        "riskPercent"
      )
    );


  const hardCapGBPRaw =
    Number(
      url.searchParams.get(
        "hardCapGBP"
      )
    );


  const riskPercent =
    Number.isFinite(
      riskPercentRaw
    ) &&
    riskPercentRaw > 0
      ? riskPercentRaw
      : DEFAULT_RISK_PERCENT;


  const hardCapGBP =
    Number.isFinite(
      hardCapGBPRaw
    ) &&
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
  // RETRY LOOP
  //
  // IMPORTANT:
  // This endpoint is READ-ONLY.
  //
  // It NEVER sends an order.
  //
  // Therefore a new connection may safely be created
  // after CANT_ROUTE_REQUEST.
  // ==================================================

  const allAttemptLogs = [];


  for (
    let attempt = 1;
    attempt <= MAX_CONNECT_ATTEMPTS;
    attempt++
  ) {
    const result =
      await runCTraderAttempt({
        clientId,
        clientSecret,
        accessToken,

        entry,
        sl,

        riskPercent,
        hardCapGBP,

        sizingRequested,

        attemptNumber:
          attempt,
      });


    allAttemptLogs.push({
      attempt,
      stage:
        result.stage ?? null,

      errorCode:
        result.errorCode ?? null,

      retryable:
        result.retryable === true,

      log:
        result.log ?? [],
    });


    // ==================================================
    // SUCCESS
    // ==================================================

    if (result.ok === true) {
      const {
        retryable,
        attemptNumber,
        log,
        ...cleanResult
      } = result;


      return Response.json(
        {
          ...cleanResult,

          connectionAttempts:
            attempt,

          retried:
            attempt > 1,

          attemptHistory:
            allAttemptLogs,
        },
        {
          status: 200,
        }
      );
    }


    // ==================================================
    // NON-RETRYABLE ERROR
    // ==================================================

    if (
      result.retryable !== true
    ) {
      const {
        retryable,
        attemptNumber,
        log,
        ...cleanResult
      } = result;


      return Response.json(
        {
          ...cleanResult,

          connectionAttempts:
            attempt,

          retried:
            attempt > 1,

          attemptHistory:
            allAttemptLogs,
        },
        {
          status:
            cleanResult.stage ===
            "INVALID_STOP_DISTANCE"
              ? 400
              : 502,
        }
      );
    }


    // ==================================================
    // CANT_ROUTE_REQUEST
    //
    // Safe to retry because this endpoint performs
    // NO trading operation.
    // ==================================================

    if (
      result.errorCode ===
      "CANT_ROUTE_REQUEST" &&
      attempt <
        MAX_CONNECT_ATTEMPTS
    ) {
      await sleep(
        RETRY_DELAY_MS
      );

      continue;
    }


    // ==================================================
    // RETRIES EXHAUSTED
    // ==================================================

    return Response.json(
      {
        ok: false,

        stage:
          "CTRADER_RETRY_EXHAUSTED",

        errorCode:
          result.errorCode ??
          "CANT_ROUTE_REQUEST",

        error:
          `cTrader routing failed after ${attempt} attempts`,

        connectionAttempts:
          attempt,

        retried:
          attempt > 1,

        attemptHistory:
          allAttemptLogs,
      },
      {
        status: 502,
      }
    );
  }


  // Should never reach here.
  return Response.json(
    {
      ok: false,

      stage:
        "UNEXPECTED_RETRY_EXIT",

      error:
        "Unexpected retry loop exit",

      attemptHistory:
        allAttemptLogs,
    },
    {
      status: 500,
    }
  );
}
