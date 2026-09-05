import crypto from "node:crypto";

function canonicalPayload(payload) {
  return JSON.stringify({
    environment: String(payload.environment),
    accountId: Number(payload.accountId),
    symbolId: Number(payload.symbolId),
    direction: String(payload.direction).toUpperCase(),
    volume: Number(payload.volume),
    entry: Number(payload.entry),
    sl: Number(payload.sl),
    actualMarginGBP: Number(payload.actualMarginGBP),
    effectiveLeverage: Number(payload.effectiveLeverage),
    issuedAt: Number(payload.issuedAt),
  });
}

export function createSizingProof(payload, secret) {
  if (!secret) throw new Error("Sizing proof secret is required");

  return crypto
    .createHmac("sha256", secret)
    .update(canonicalPayload(payload))
    .digest("hex");
}

export function verifySizingProof(payload, signature, secret, maxAgeMs = 60000) {
  if (!signature || !secret) return false;

  const issuedAt = Number(payload.issuedAt);
  const age = Date.now() - issuedAt;
  if (!Number.isFinite(issuedAt) || age < -5000 || age > maxAgeMs) return false;

  const expected = createSizingProof(payload, secret);
  const actualBuffer = Buffer.from(String(signature), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
