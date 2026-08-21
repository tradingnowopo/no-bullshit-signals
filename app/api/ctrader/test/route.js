import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WS_URL = "wss://demo.ctraderapi.com:5036";

function send(ws, payloadType, payload, clientMsgId) {
  ws.send(
    JSON.stringify({
      clientMsgId,
      payloadType,
      payload,
    })
  );
}

export async function GET() {
  const clientId = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  const accessToken = process.env.CTRADER_ACCESS_TOKEN;
  const accountId = Number(process.env.CTRADER_ACCOUNT_ID);

  if (!clientId || !clientSecret || !accessToken || !accountId) {
    return Response.json(
      {
        ok: false,
        error: "Missing cTrader environment variables",
      },
      { status: 500 }
    );
  }

  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);

    let finished = false;

    const finish = (body, status = 200) => {
      if (finished) return;
      finished = true;

      clearTimeout(timeout);

      try {
        ws.close();
      } catch {}

      resolve(Response.json(body, { status }));
    };

    const timeout = setTimeout(() => {
      finish(
        {
          ok: false,
          stage: "TIMEOUT",
          error: "cTrader did not complete authentication in time",
        },
        504
      );
    }, 12000);

    ws.on("open", () => {
      send(
        ws,
        2100,
        {
          clientId,
          clientSecret,
        },
        "nbs_app_auth"
      );
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Application authorization successful
        if (msg.payloadType === 2101) {
          send(
            ws,
            2102,
            {
              ctidTraderAccountId: accountId,
              accessToken,
            },
            "nbs_account_auth"
          );

          return;
        }

        // Account authorization successful
        if (msg.payloadType === 2103) {
          finish({
            ok: true,
            stage: "ACCOUNT_AUTH_OK",
            accountId,
            message: "cTrader DEMO connection and authentication successful",
          });

          return;
        }

        // cTrader error response
        if (
          msg.payloadType === 50 ||
          msg.payload?.errorCode ||
          msg.payload?.description
        ) {
          finish(
            {
              ok: false,
              stage: "CTRADER_ERROR",
              errorCode: msg.payload?.errorCode || null,
              description: msg.payload?.description || null,
              payloadType: msg.payloadType,
            },
            400
          );
        }
      } catch (error) {
        finish(
          {
            ok: false,
            stage: "PARSE_ERROR",
            error: error.message,
          },
          500
        );
      }
    });

    ws.on("error", (error) => {
      finish(
        {
          ok: false,
          stage: "WEBSOCKET_ERROR",
          error: error.message,
        },
        500
      );
    });

    ws.on("close", (code, reason) => {
      if (!finished) {
        finish(
          {
            ok: false,
            stage: "CONNECTION_CLOSED",
            code,
            reason: reason.toString(),
          },
          500
        );
      }
    });
  });
}
