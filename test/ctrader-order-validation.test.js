import assert from "node:assert/strict";
import test from "node:test";

process.env.NBS_EXECUTOR_KEY = "test-executor-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.CTRADER_CLIENT_ID = "test-client";
process.env.CTRADER_CLIENT_SECRET = "test-secret";
process.env.CTRADER_ACCESS_TOKEN = "test-token";

const { createSizingProof } = await import("../app/lib/ctrader-sizing-proof.js");
const { POST } = await import("../app/api/ctrader/order/route.js");

function payload(volume = 100) {
  const issuedAt = Date.now();
  const proofPayload = {
    environment: "DEMO",
    accountId: 48342468,
    symbolId: 250,
    direction: "LONG",
    volume: 100,
    entry: 70,
    sl: 69.5,
    actualMarginGBP: 10,
    effectiveLeverage: 5,
    issuedAt,
  };

  return {
    trade_ready: true,
    validateOnly: true,
    environment: "DEMO",
    symbol: "USOIL",
    direction: "LONG",
    signalId: "test-wti-signal",
    volume,
    entry: 70,
    sl: 69.5,
    marketPrice: 70.01,
    actualMarginGBP: 10,
    effectiveLeverage: 5,
    signalTimestamp: new Date().toISOString(),
    sizingProof: {
      issuedAt,
      signature: createSizingProof(
        proofPayload,
        process.env.NBS_EXECUTOR_KEY
      ),
    },
  };
}

async function callOrder(body) {
  return POST(new Request("http://localhost/api/ctrader/order", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nbs-executor-key": process.env.NBS_EXECUTOR_KEY,
    },
    body: JSON.stringify(body),
  }));
}

test("WTI validation accepts an exact signed sizing result", async () => {
  const result = await callOrder(payload());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).stage, "VALIDATION_OK");
});

test("WTI validation blocks volume changed after sizing", async () => {
  const result = await callOrder(payload(200));
  assert.equal(result.status, 409);
  assert.equal((await result.json()).stage, "SIZING_PROOF_BLOCK");
});
