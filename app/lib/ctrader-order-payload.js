const RELATIVE_PRICE_SCALE = 100000;

export function relativeStopLossUnits(entry, stopLoss) {
  const entryPrice = Number(entry);
  const stopPrice = Number(stopLoss);

  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(stopPrice) ||
    stopPrice <= 0
  ) {
    throw new Error("entry and stopLoss must be positive numbers");
  }

  const units = Math.round(
    Math.abs(entryPrice - stopPrice) * RELATIVE_PRICE_SCALE
  );

  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new Error("Stop Loss distance is too small or invalid");
  }

  return units;
}

export function buildProtectedMarketOrder({
  accountId,
  symbolId,
  tradeSide,
  volume,
  label,
  entry,
  stopLoss,
}) {
  return {
    ctidTraderAccountId: accountId,
    symbolId,
    orderType: 1,
    tradeSide,
    volume,
    label,

    // cTrader does not support an absolute SL on a MARKET request.
    // A relative SL is accepted and creates broker-side protection with
    // the fill, avoiding an unprotected position between order and amend.
    relativeStopLoss: relativeStopLossUnits(entry, stopLoss),
  };
}
