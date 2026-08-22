
import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WS_URL = "wss://demo.ctraderapi.com:5036";

const ACCOUNT_ID = 48342468;
const SYMBOL_ID = 250;
const SYMBOL_NAME = "SpotCrude";

export async function POST(request) {
  const clientId = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  const accessToken = process.env.CTRADER_ACCESS_TOKEN;

  if (!clientId || !clientSecret || !accessToken) {
    return Response.json(
      {
        ok: false,
        stage: "ENV",
        error: "Missing cTrader environment variables",
      },
      { status: 500 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "Invalid JSON body",
      },
      { status: 400 }
    );
  }

  const direction = String(body?.direction || "").toUpperCase();
  const symbol = String(body?.symbol || "").toUpperCase();

  const volume = Number(body?.volume ?? 100);

  const entry = Number(body?.entry);
  const sl = Number(body?.sl);
  const tp1 = Number(body?.tp1);
  const tp2 = Number(body?.tp2);

  if (body?.environment !== "DEMO") {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "Only DEMO environment is allowed",
      },
      { status: 400 }
    );
  }

  if (symbol !== "USOIL") {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: `Unsupported symbol: ${symbol}`,
      },
      { status: 400 }
    );
  }

  if (!["LONG", "SHORT"].includes(direction)) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "direction must be LONG or SHORT",
      },
      { status: 400 }
    );
  }

  if (!Number.isFinite(volume) || volume < 100 || volume % 100 !== 0) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "volume must be >= 100 and divisible by 100",
      },
      { status: 400 }
    );
  }

  if (volume > 500000) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "volume exceeds SpotCrude maxVolume",
      },
      { status: 400 }
    );
  }

  const tradeSide = direction === "LONG" ? 1 : 2;
  const validateOnly = body?.validateOnly === true;
  const preflightOnly = body?.preflightOnly === true;

if (validateOnly) {
  return Response.json({
    ok: true,
    stage: "VALIDATION_OK",
    validateOnly: true,
    environment: "DEMO",

    accountId: ACCOUNT_ID,

    symbol: SYMBOL_NAME,
    symbolId: SYMBOL_ID,

    direction,
    tradeSide,
    volume,

    signalPlan: {
      entry: Number.isFinite(entry) ? entry : null,
      sl: Number.isFinite(sl) ? sl : null,
      tp1: Number.isFinite(tp1) ? tp1 : null,
      tp2: Number.isFinite(tp2) ? tp2 : null,
    },

    orderWouldBeSent: false,
  });
}

  const log = [];

  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let finished = false;

    const finish = (data, status = 200) => {
      if (finished) return;
      finished = true;

      clearTimeout(timeout);

      try {
        ws.terminate();
      } catch {}

      resolve(
        Response.json(
          {
            ...data,
            log,
          },
          { status }
        )
      );
    };

    const timeout = setTimeout(() => {
      finish(
        {
          ok: false,
          stage: "TIMEOUT",
          error: "cTrader request timed out",
        },
        504
      );
    }, 15000);

    const send = (payloadType, payload, clientMsgId) => {
      ws.send(
        JSON.stringify({
          clientMsgId,
          payloadType,
          payload,
        })
      );
    };

    ws.on("open", () => {
      log.push("WEBSOCKET_OPEN");

      send(
        2100,
        {
          clientId,
          clientSecret,
        },
        `NBS_APP_AUTH_${Date.now()}`
      );

      log.push("2100_SEND_CALLED");
    });

    ws.on("message", (data) => {
      let msg;

      try {
        msg = JSON.parse(data.toString());
      } catch {
        finish(
          {
            ok: false,
            stage: "PARSE",
            error: "Invalid JSON received from cTrader",
          },
          502
        );
        return;
      }

      log.push(`PAYLOAD_${msg.payloadType}`);

      if (msg.payloadType === 2101) {
        log.push("APP_AUTH_OK");

        send(
          2102,
          {
            ctidTraderAccountId: ACCOUNT_ID,
            accessToken,
          },
          `NBS_ACCOUNT_AUTH_${Date.now()}`
        );

        log.push("2102_SEND_CALLED");
        return;
      }

     if (msg.payloadType === 2103) {
  log.push("ACCOUNT_AUTH_OK");

  send(
    2124,
    {
      ctidTraderAccountId: ACCOUNT_ID,
    },
    `NBS_POSITIONS_${Date.now()}`
  );

  log.push("2124_SEND_CALLED");
  return;
}

if (msg.payloadType === 2125) {
  const positions = msg.payload?.position || [];

  const openSpotCrude = positions.filter((p) =>
    p?.tradeData?.symbolId === SYMBOL_ID &&
    p?.positionStatus === 1 &&
    Number(p?.tradeData?.volume || 0) > 0
  );

  if (openSpotCrude.length > 0) {
    log.push("DUPLICATE_BLOCKED");

    finish(
      {
        ok: false,
        stage: "DUPLICATE_BLOCKED",
        environment: "DEMO",
        accountId: ACCOUNT_ID,
        symbol: SYMBOL_NAME,
        symbolId: SYMBOL_ID,
        existingPositions: openSpotCrude.map((p) => ({
          positionId: p.positionId,
          direction:
            p.tradeData?.tradeSide === 1
              ? "LONG"
              : p.tradeData?.tradeSide === 2
              ? "SHORT"
              : "UNKNOWN",
          volume: p.tradeData?.volume ?? null,
          entryPrice: p.price ?? null,
          label: p.tradeData?.label ?? null,
        })),
        orderWouldBeSent: false,
      },
      409
    );

    return;
  }

  log.push("NO_OPEN_SPOTCRUDE_POSITION");
  if (preflightOnly) {
  log.push("PREFLIGHT_OK");

  finish({
  ok: true,
  stage: "PREFLIGHT_OK",
  environment: "DEMO",
  accountId: ACCOUNT_ID,
  symbol: SYMBOL_NAME,
  symbolId: SYMBOL_ID,
  direction,
  tradeSide,
  volume,
  openSpotCrudeCount: 0,

  signalPlan: {
    entry: Number.isFinite(entry) ? entry : null,
    sl: Number.isFinite(sl) ? sl : null,
    tp1: Number.isFinite(tp1) ? tp1 : null,
    tp2: Number.isFinite(tp2) ? tp2 : null,
  },

  orderWouldBeSent: false,
});

  return;
}

  send(
    2106,
    {
      ctidTraderAccountId: ACCOUNT_ID,
      symbolId: SYMBOL_ID,
      orderType: 1,
      tradeSide,
      volume,
      label: "NBS_DEMO",
    },
    `NBS_ORDER_${Date.now()}`
  );

  log.push("2106_SEND_CALLED");
  return;
}

      if (msg.payloadType === 2126) {
        const p = msg.payload || {};

        if (p.executionType === 2) {
          log.push("ORDER_ACCEPTED");
          return;
        }

        if (p.executionType === 3 && p.deal) {
          log.push("ORDER_FILLED");

          finish({
            ok: true,
            stage: "ORDER_FILLED",

            environment: "DEMO",

            accountId: ACCOUNT_ID,

            symbol: SYMBOL_NAME,
            symbolId: SYMBOL_ID,

            direction,
            tradeSide,

            requestedVolume: volume,

            positionId: p.position?.positionId ?? null,
            orderId: p.order?.orderId ?? null,
            dealId: p.deal?.dealId ?? null,

            executedVolume:
              p.deal?.filledVolume ??
              p.order?.executedVolume ??
              null,

            executionPrice:
              p.deal?.executionPrice ??
              p.order?.executionPrice ??
              p.position?.price ??
              null,

            signalPlan: {
              entry: Number.isFinite(entry) ? entry : null,
              sl: Number.isFinite(sl) ? sl : null,
              tp1: Number.isFinite(tp1) ? tp1 : null,
              tp2: Number.isFinite(tp2) ? tp2 : null,
            },
          });

          return;
        }
      }

      if (msg.payloadType === 2142 || msg.payload?.errorCode) {
        finish(
          {
            ok: false,
            stage: "CTRADER_ERROR",
            errorCode: msg.payload?.errorCode ?? null,
            error: msg.payload?.description ?? "Unknown cTrader error",
          },
          502
        );
      }
    });

    ws.on("error", (err) => {
      finish(
        {
          ok: false,
          stage: "WEBSOCKET",
          error: err.message,
        },
        502
      );
    });
  });
}
