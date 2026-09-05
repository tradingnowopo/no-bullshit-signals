const ALLOWED_ENVIRONMENTS = new Set(["DEMO", "LIVE"]);

function positiveInteger(value, fallback = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getCTraderConfig() {
  const environment = String(
    process.env.CTRADER_ENVIRONMENT || "DEMO"
  ).trim().toUpperCase();

  if (!ALLOWED_ENVIRONMENTS.has(environment)) {
    throw new Error("CTRADER_ENVIRONMENT must be DEMO or LIVE");
  }

  const live = environment === "LIVE";
  const accountId = positiveInteger(
    process.env.CTRADER_ACCOUNT_ID,
    live ? null : 48342468
  );
  const symbolId = positiveInteger(
    process.env.CTRADER_WTI_SYMBOL_ID,
    live ? null : 250
  );

  if (!accountId) {
    throw new Error("CTRADER_ACCOUNT_ID is required for LIVE");
  }

  if (!symbolId) {
    throw new Error("CTRADER_WTI_SYMBOL_ID is required for LIVE");
  }

  return {
    environment,
    live,
    wsUrl: live
      ? "wss://live.ctraderapi.com:5036"
      : "wss://demo.ctraderapi.com:5036",
    accountId,
    symbolId,
    symbolName: process.env.CTRADER_WTI_SYMBOL_NAME || "SpotCrude",
    liveTradingEnabled:
      process.env.NBS_LIVE_TRADING_ENABLED === "true",
    targetMarginGBP: 10,
    marginToleranceGBP: 0.01,
    maxEffectiveLeverage: 10,
  };
}

export function validateRequestedEnvironment(requested, configured) {
  return String(requested || "").trim().toUpperCase() === configured;
}
