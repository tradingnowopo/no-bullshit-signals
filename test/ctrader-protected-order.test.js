import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProtectedMarketOrder,
  relativeStopLossUnits,
} from "../app/lib/ctrader-order-payload.js";

test("converts the planned WTI stop distance to cTrader relative units", () => {
  assert.equal(relativeStopLossUnits(81.07, 81.3), 23000);
});

test("builds a MARKET order with broker-side SL and no TP", () => {
  const order = buildProtectedMarketOrder({
    accountId: 123,
    symbolId: 250,
    tradeSide: 2,
    volume: 100,
    label: "NBS_LIVE",
    entry: 81.07,
    stopLoss: 81.3,
  });

  assert.deepEqual(order, {
    ctidTraderAccountId: 123,
    symbolId: 250,
    orderType: 1,
    tradeSide: 2,
    volume: 100,
    label: "NBS_LIVE",
    relativeStopLoss: 23000,
  });
  assert.equal("takeProfit" in order, false);
  assert.equal("relativeTakeProfit" in order, false);
});

test("rejects a zero-distance SL", () => {
  assert.throws(() => relativeStopLossUnits(81.07, 81.07), /too small/);
});
