import assert from "node:assert/strict";
import test from "node:test";

process.env.NBS_EXECUTOR_KEY = "test-live-executor-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.CTRADER_CLIENT_ID = "test-client";
process.env.CTRADER_CLIENT_SECRET = "test-secret";
process.env.CTRADER_ACCESS_TOKEN = "test-token";
process.env.CTRADER_ENVIRONMENT = "LIVE";
process.env.CTRADER_ACCOUNT_ID = "48449226";
process.env.CTRADER_WTI_SYMBOL_ID = "250";
process.env.NBS_LIVE_TRADING_ENABLED = "false";

const { createSizingProof } = await import("../app/lib/ctrader-sizing-proof.js");
const { POST } = await import("../app/api/ctrader/order/route.js");

test("LIVE WTI validation remains dry and accepts signed £10 sizing", async () => {
  const issuedAt = Date.now();
  const proofPayload = {
    environment: "LIVE",
    accountId: 48449226,
    symbolId: 250,
    direction: "SHORT",
    volume: 100,
    entry: 70,
    sl: 70.5,
    actualMarginGBP: 10,
    effectiveLeverage: 5,
    issuedAt,
  };
  const body = {
    trade_ready: true,
    validateOnly: true,
    dryRun: true,
    environment: "LIVE",
    symbol: "USOIL",
    direction: "SHORT",
    signalId: "test-live-wti-signal",
    volume: 100,
    entry: 70,
    sl: 70.5,
    marketPrice: 69.99,
    actualMarginGBP: 10,
    effectiveLeverage: 5,
    signalTimestamp: new Date().toISOString(),
    sizingProof: {
      issuedAt,
      signature: createSizingProof(proofPayload, process.env.NBS_EXECUTOR_KEY),
    },
  };

  const result = await POST(new Request("http://localhost/api/ctrader/order", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nbs-executor-key": process.env.NBS_EXECUTOR_KEY,
    },
    body: JSON.stringify(body),
  }));

  const json = await result.json();
  assert.equal(result.status, 200);
  assert.equal(json.environment, "LIVE");
  assert.equal(json.stage, "VALIDATION_OK");
  assert.equal(json.orderWouldBeSent, false);
});
