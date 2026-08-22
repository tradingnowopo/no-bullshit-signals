
import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WS_URL = "wss://demo.ctraderapi.com:5036";

const ACCOUNT_ID = 48342468;
const SYMBOL_ID = 250;
const SYMBOL_NAME = "SpotCrude";

export async function POST(request) {
    const executorKey = process.env.NBS_EXECUTOR_KEY;
  const providedKey = request.headers.get("x-nbs-executor-key");

  if (!executorKey || providedKey !== executorKey) {
    return Response.json(
      {
        ok: false,
        stage: "AUTH",
        error: "Unauthorized executor request",
      },
      { status: 401 }
    );
  }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return Response.json(
      {
        ok: false,
        stage: "ENV",
        error: "Missing Supabase executor environment variables",
      },
      { status: 500 }
    );
  }
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
    const signalId = String(body?.signalId || "").trim();
    if (!signalId) {
  return Response.json(
    {
      ok: false,
      stage: "VALIDATION",
      error: "signalId is required",
    },
    { status: 400 }
  );
}

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
const idempotencyTestOnly = body?.idempotencyTestOnly === true;

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

if (!preflightOnly) {
  const claimResponse = await fetch(
    `${supabaseUrl}/rest/v1/ctrader_signal_executions`,
    {
      method: "POST",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        signal_id: signalId,
        environment: "DEMO",
        symbol,
        direction,
        status: idempotencyTestOnly ? "CLAIMED_TEST" : "CLAIMED",
        entry: Number.isFinite(entry) ? entry : null,
        sl: Number.isFinite(sl) ? sl : null,
        tp1: Number.isFinite(tp1) ? tp1 : null,
        tp2: Number.isFinite(tp2) ? tp2 : null,
      }),
    }
  );

  if (claimResponse.status === 409) {
    return Response.json(
      {
        ok: false,
        stage: "DUPLICATE_SIGNAL_BLOCKED",
        signalId,
        orderWouldBeSent: false,
      },
      { status: 409 }
    );
  }

  if (!claimResponse.ok) {
    const claimError = await claimResponse.text();

    return Response.json(
      {
        ok: false,
        stage: "IDEMPOTENCY_ERROR",
        error: claimError,
      },
      { status: 500 }
    );
  }

  if (idempotencyTestOnly) {
    return Response.json({
      ok: true,
      stage: "IDEMPOTENCY_CLAIM_OK",
      signalId,
      environment: "DEMO",
      orderWouldBeSent: false,
    });
  }
}

async function updateExecution(status, fields = {}) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/ctrader_signal_executions?signal_id=eq.${encodeURIComponent(signalId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status,
        updated_at: new Date().toISOString(),
        ...fields,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EXECUTION_UPDATE_FAILED: ${errorText}`);
  }
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

    ws.on("message", async (data) => {
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
            try {
  await updateExecution("ORDER_FILLED", {
    position_id: p.position?.positionId ?? null,
    order_id: p.order?.orderId ?? null,
    deal_id: p.deal?.dealId ?? null,
    execution_price:
      p.deal?.executionPrice ??
      p.order?.executionPrice ??
      p.position?.price ??
      null,
    executed_volume:
      p.deal?.filledVolume ??
      p.order?.executedVolume ??
      null,
    error_code: null,
    error_message: null,
  });

  log.push("EXECUTION_DB_UPDATED");
} catch (err) {
  log.push("EXECUTION_DB_UPDATE_FAILED");
  console.error(err);
}

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
