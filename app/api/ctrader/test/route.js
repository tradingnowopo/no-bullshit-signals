import WebSocket from "ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WS_URL = "wss://demo.ctraderapi.com:5036";

export async function GET() {
  const clientId = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  const accessToken = process.env.CTRADER_ACCESS_TOKEN;
  const accountId = Number(process.env.CTRADER_ACCOUNT_ID);

  const log = [];

  if (!clientId || !clientSecret || !accessToken || !accountId) {
    return Response.json({
      ok: false,
      stage: "ENV",
      error: "Missing environment variables",
      env: {
        clientId: !!clientId,
        clientSecret: !!clientSecret,
        accessToken: !!accessToken,
        accountId: !!accountId
      }
    });
  }

  return new Promise((resolve) => {
    let finished = false;

    const ws = new WebSocket(WS_URL, {
      handshakeTimeout: 10000
    });

    const finish = (body) => {
      if (finished) return;
      finished = true;

      clearTimeout(timeout);

      try {
        ws.terminate();
      } catch {}

      resolve(
        Response.json({
          ...body,
          log
        })
      );
    };

    const timeout = setTimeout(() => {
      finish({
        ok: false,
        stage: "TIMEOUT"
      });
    }, 20000);

    ws.on("open", () => {
      log.push("WEBSOCKET_OPEN");

      const message = {
        clientMsgId: "nbs_app_auth_" + Date.now(),
        payloadType: 2100,
        payload: {
          clientId,
          clientSecret
        }
      };

      log.push("SENDING_2100");

      ws.send(JSON.stringify(message), (error) => {
        if (error) {
          log.push("SEND_2100_ERROR: " + error.message);
        } else {
          log.push("2100_SENT");
        }
      });
    });

    ws.on("message", (data) => {
      const raw = data.toString();

      log.push("MESSAGE_RECEIVED");

      let msg;

      try {
        msg = JSON.parse(raw);
      } catch {
        finish({
          ok: false,
          stage: "INVALID_JSON_RESPONSE",
          raw: raw.slice(0, 500)
        });
        return;
      }

      log.push("PAYLOAD_" + msg.payloadType);

      if (msg.payloadType === 2101) {
        log.push("APP_AUTH_OK");

        const accountAuth = {
          clientMsgId: "nbs_account_auth_" + Date.now(),
          payloadType: 2102,
          payload: {
            ctidTraderAccountId: accountId,
            accessToken
          }
        };

        log.push("SENDING_2102");

        ws.send(JSON.stringify(accountAuth), (error) => {
          if (error) {
            log.push("SEND_2102_ERROR: " + error.message);
          } else {
            log.push("2102_SENT");
          }
        });

        return;
      }

      if (msg.payloadType === 2103) {
        log.push("ACCOUNT_AUTH_OK");

        finish({
          ok: true,
          stage: "ACCOUNT_AUTH_OK",
          accountId
        });

        return;
      }

      if (msg.payloadType === 50) {
        finish({
          ok: false,
          stage: "CTRADER_ERROR",
          payload: msg.payload || null
        });
        return;
      }

      log.push(
        "UNHANDLED_PAYLOAD_" + msg.payloadType
      );
    });

    ws.on("unexpected-response", (request, response) => {
      log.push(
        "UNEXPECTED_HTTP_RESPONSE_" +
        response.statusCode
      );

      finish({
        ok: false,
        stage: "WEBSOCKET_HANDSHAKE_REJECTED",
        statusCode: response.statusCode
      });
    });

    ws.on("error", (error) => {
      log.push("WS_ERROR: " + error.message);

      finish({
        ok: false,
        stage: "WEBSOCKET_ERROR",
        error: error.message
      });
    });

    ws.on("close", (code, reason) => {
      log.push(
        `WS_CLOSE_${code}_${reason.toString()}`
      );

      if (!finished) {
        finish({
          ok: false,
          stage: "CONNECTION_CLOSED",
          code,
          reason: reason.toString()
        });
      }
    });
  });
}
