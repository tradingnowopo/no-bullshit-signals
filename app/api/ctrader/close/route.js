import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WS_URL = "wss://demo.ctraderapi.com:5036";

const ACCOUNT_ID = 48342468;
const SYMBOL_ID = 250;

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
  const volume = Number(body?.volume ?? 100);
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

  if (validateOnly) {
    return Response.json({
      ok: true,
      stage: "VALIDATION_OK",
      validateOnly: true,
      environment: "DEMO",
      accountId: ACCOUNT_ID,
      symbolId: SYMBOL_ID,
      positionId,
      volume,
      closeWouldBeSent: false,
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
          2111,
          {
            ctidTraderAccountId: ACCOUNT_ID,
            positionId,
            volume,
          },
          `NBS_CLOSE_${Date.now()}`
        );

        log.push("2111_SEND_CALLED");
        return;
      }

      if (msg.payloadType === 2126) {
        const p = msg.payload || {};

        if (p.executionType === 2) {
          log.push("CLOSE_ACCEPTED");
          return;
        }

        if (p.executionType === 3 && p.deal) {
          log.push("POSITION_CLOSED");

          finish({
            ok: true,
            stage: "POSITION_CLOSED",
            environment: "DEMO",
            accountId: ACCOUNT_ID,
            positionId,
            requestedVolume: volume,

            orderId: p.order?.orderId ?? null,
            dealId: p.deal?.dealId ?? null,

            executedVolume:
              p.deal?.filledVolume ??
              p.order?.executedVolume ??
              null,

            executionPrice:
              p.deal?.executionPrice ??
              p.order?.executionPrice ??
              null,

            remainingVolume:
              p.position?.tradeData?.volume ?? null,

            positionStatus:
              p.position?.positionStatus ?? null,

            closePositionDetail:
              p.deal?.closePositionDetail ?? null,
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
