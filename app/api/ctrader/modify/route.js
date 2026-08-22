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

  const positionId = Number(body?.positionId);
  const sl = Number(body?.sl);
  const tp = Number(body?.tp);
  const validateOnly = body?.validateOnly === true;

  if (!Number.isInteger(positionId) || positionId <= 0) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "positionId must be a positive integer",
      },
      { status: 400 }
    );
  }

  if (!Number.isFinite(sl) || sl <= 0) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "sl must be a positive number",
      },
      { status: 400 }
    );
  }

  if (!Number.isFinite(tp) || tp <= 0) {
    return Response.json(
      {
        ok: false,
        stage: "VALIDATION",
        error: "tp must be a positive number",
      },
      { status: 400 }
    );
  }

  if (validateOnly) {
    return Response.json({
      ok: true,
      stage: "VALIDATION_OK",
      validateOnly: true,
      environment: "DEMO",
      accountId: ACCOUNT_ID,
      symbol: SYMBOL_NAME,
      symbolId: SYMBOL_ID,
      positionId,
      sl,
      tp,
      modifyWouldBeSent: false,
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
          2110,
          {
            ctidTraderAccountId: ACCOUNT_ID,
            positionId,
            stopLoss: sl,
            takeProfit: tp,
          },
          `NBS_MODIFY_${Date.now()}`
        );

        log.push("2110_SEND_CALLED");
        return;
      }

      if (msg.payloadType === 2126) {
        const p = msg.payload || {};

        if (p.executionType === 4 || p.position) {
          log.push("POSITION_MODIFIED");

          finish({
            ok: true,
            stage: "POSITION_MODIFIED",
            environment: "DEMO",
            accountId: ACCOUNT_ID,
            symbol: SYMBOL_NAME,
            symbolId: SYMBOL_ID,
            positionId,
            requestedStopLoss: sl,
            requestedTakeProfit: tp,
            position: p.position ?? null,
            order: p.order ?? null,
            deal: p.deal ?? null,
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
