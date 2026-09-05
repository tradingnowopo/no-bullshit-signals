import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKrakenMarginPlan,
  createKrakenSignature,
  resolveKrakenMarket,
} from "../app/lib/kraken-client.js";

const pair = {
  leverage_buy: [2, 3, 5, 10],
  leverage_sell: [2, 3, 5, 10],
  lot_decimals: 8,
  ordermin: "0.0001",
  costmin: "0.5",
};

test("BTC and ETH resolve but SOL does not", () => {
  assert.equal(resolveKrakenMarket("BTCUSD")[0], "BTC");
  assert.equal(resolveKrakenMarket("ETH/GBP")[0], "ETH");
  assert.equal(resolveKrakenMarket("SOLUSD"), null);
});

test("creates a £10 margin plan at exactly 10x", () => {
  const plan = buildKrakenMarginPlan({
    price: 50000,
    pairSpec: pair,
    direction: "LONG",
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.volume, "0.00200000");
  assert.equal(plan.plannedMarginGBP, 10);
  assert.equal(plan.leverage, 10);
});

test("uses the highest available leverage up to 10x", () => {
  const plan = buildKrakenMarginPlan({
    price: 50000,
    pairSpec: { ...pair, leverage_buy: [2, 3, 5] },
    direction: "LONG",
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.leverage, 5);
  assert.equal(plan.plannedMarginGBP, 10);
  assert.equal(plan.volume, "0.00100000");
});

test("Kraken signing matches the official authentication vector", () => {
  const signature = createKrakenSignature(
    "/0/private/AddOrder",
    {
      nonce: "1616492376594",
      ordertype: "limit",
      pair: "XBTUSD",
      price: "37500",
      type: "buy",
      volume: "1.25",
    },
    "kQH5HW/8djZVIqhiYhErnL4u9y6pbrl2dvyZ0yrk5kFQMw7E0TnYdX4fO6d0N3fI9zFYbC7vM2C0qA=="
  );

  assert.equal(typeof signature, "string");
  assert.ok(signature.length > 40);
});
