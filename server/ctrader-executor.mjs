import fs from "node:fs";
import http from "node:http";

const PORT = Number(process.env.PORT || 8091);
const HOST = process.env.HOST || "127.0.0.1";
const ENV_FILE = process.env.NBS_ENV_FILE || "/root/.nbs-ctrader-env";
const MAX_BODY_BYTES = 1024 * 1024;

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;

  const text = fs.readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(ENV_FILE);

// Environment must be loaded before the route reads its cTrader configuration.
const { POST } = await import("../app/api/ctrader/order/route.js");

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("REQUEST_TOO_LARGE"), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;

  if (request.method === "GET" && pathname === "/ctrader/health") {
    return sendJson(response, 200, {
      ok: true,
      service: "NBS_CTRADER_EXECUTOR",
      environment: String(process.env.CTRADER_ENVIRONMENT || "").toUpperCase() || null,
      liveTradingEnabled: process.env.NBS_LIVE_TRADING_ENABLED === "true",
    });
  }

  if (
    request.method !== "POST" ||
    !["/ctrader/preflight", "/ctrader/order"].includes(pathname)
  ) {
    return sendJson(response, 404, { ok: false, error: "NOT_FOUND" });
  }

  try {
    const body = await readBody(request);
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) headers.set(name, value.join(", "));
      else if (value !== undefined) headers.set(name, value);
    }

    const payload = body.length ? JSON.parse(body.toString("utf8")) : {};

    // The legacy endpoint is permanently non-executing, irrespective of input.
    if (pathname === "/ctrader/preflight") {
      payload.preflightOnly = true;
      payload.dryRun = true;
      payload.liveConfirm = false;
    }

    const routeResponse = await POST(
      new Request(`http://localhost${pathname}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      })
    );

    const responseBody = Buffer.from(await routeResponse.arrayBuffer());
    response.writeHead(routeResponse.status, {
      "content-type": routeResponse.headers.get("content-type") || "application/json",
    });
    response.end(responseBody);
  } catch (error) {
    const status = Number(error?.status) || (error instanceof SyntaxError ? 400 : 500);
    sendJson(response, status, {
      ok: false,
      stage: status === 400 ? "VALIDATION" : "SERVER_ADAPTER",
      error: status === 400 ? "INVALID_JSON" : error?.message || "INTERNAL_ERROR",
      orderWouldBeSent: false,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`NBS_CTRADER_EXECUTOR_LISTENING_${HOST}:${PORT}`);
});
