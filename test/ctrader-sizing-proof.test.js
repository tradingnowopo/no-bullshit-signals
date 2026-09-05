import assert from "node:assert/strict";
import test from "node:test";

import {
  createSizingProof,
  verifySizingProof,
} from "../app/lib/ctrader-sizing-proof.js";

const secret = "test-executor-secret";
const payload = {
  environment: "LIVE",
  accountId: 48449226,
  symbolId: 250,
  direction: "LONG",
  volume: 100,
  entry: 70,
  sl: 69.5,
  actualMarginGBP: 10,
  effectiveLeverage: 5.38,
  issuedAt: Date.now(),
};

test("accepts a fresh exact cTrader sizing proof", () => {
  const signature = createSizingProof(payload, secret);
  assert.equal(verifySizingProof(payload, signature, secret), true);
});

test("rejects a proof if volume changes", () => {
  const signature = createSizingProof(payload, secret);
  assert.equal(
    verifySizingProof({ ...payload, volume: 200 }, signature, secret),
    false
  );
});

test("rejects an expired proof", () => {
  const expired = { ...payload, issuedAt: Date.now() - 120000 };
  const signature = createSizingProof(expired, secret);
  assert.equal(verifySizingProof(expired, signature, secret), false);
});
