import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.PORT || 8098);
const HOST = "127.0.0.1";
const MAX_BODY = 1024 * 1024;

function loadEnvFile(path) {
  const text = fs.readFileSync(path, "utf8");

  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);

    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile("/root/.nbs-ctrader-env");
loadEnvFile("/root/.nbs-kraken-env");

const [{ POST: orderPost }, { GET: positionsGet }] = await Promise.all([
  import("../app/api/kraken/order/route.js"),
  import("../app/api/kraken/positions/route.js"),
]);

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;

    if (body.length > MAX_BODY) {
      throw new Error("REQUEST_TOO_LARGE");
    }
  }

  return body;
}

async function forwardResponse(res, response) {
  const headers = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/kraken/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "NBS_KRAKEN_EXECUTOR",
        environment: "LIVE",
        credentialsConfigured: Boolean(
          process.env.KRAKEN_API_KEY &&
          process.env.KRAKEN_API_SECRET
        ),
        liveTradingEnabled:
          process.env.NBS_KRAKEN_LIVE_TRADING_ENABLED === "true",
      });
    }

    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }

    if (req.method === "POST" && req.url === "/kraken/order") {
      const body = await readBody(req);
      const request = new Request("http://localhost/kraken/order", {
        method: "POST",
        headers,
        body,
      });

      return forwardResponse(res, await orderPost(request));
    }

    if (req.method === "GET" && req.url === "/kraken/positions") {
      const request = new Request("http://localhost/kraken/positions", {
        method: "GET",
        headers,
      });

      return forwardResponse(res, await positionsGet(request));
    }

    return sendJson(res, 404, {
      ok: false,
      error: "NOT_FOUND",
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      stage: "SERVER",
      error: error.message,
      orderWouldBeSent: false,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`NBS_KRAKEN_EXECUTOR_LISTENING_${HOST}:${PORT}`);
});
