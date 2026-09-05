import WebSocket from "ws";
import { getCTraderConfig } from "../../../lib/ctrader-config.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CTRADER = getCTraderConfig();
const WS_URL = CTRADER.wsUrl;

export async function GET() {
  const clientId = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  const accessToken = process.env.CTRADER_ACCESS_TOKEN;
  const accountId = CTRADER.accountId;

  const log = [];

  if (!clientId || !clientSecret || !accessToken || !accountId) {
    return Response.json({
      ok: false,
      stage: "ENV",
      error: "Missing environment variables"
    });
  }

  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let finished = false;

    const finish = (data) => {
      if (finished) return;
      finished = true;

      clearTimeout(timeout);

      try {
        ws.terminate();
      } catch {}

      resolve(Response.json({
        ...data,
        log
      }));
    };

    const timeout = setTimeout(() => {
      finish({
        ok: false,
        stage: "TIMEOUT"
      });
    }, 20000);

    ws.on("open", () => {
      log.push("WEBSOCKET_OPEN");

      const appAuth = JSON.stringify({
        clientMsgId: "nbs_app_auth_" + Date.now(),
        payloadType: 2100,
        payload: {
          clientId: clientId,
          clientSecret: clientSecret
        }
      });

      log.push("ABOUT_TO_SEND_2100");

      try {
        ws.send(appAuth);

        // Nie czekamy na callback ws.send()
        log.push("2100_SEND_CALLED");
      } catch (error) {
        finish({
          ok: false,
          stage: "SEND_2100_EXCEPTION",
          error: error.message
        });
      }
    });

    ws.on("message", (data) => {
      log.push("MESSAGE_RECEIVED");

      let msg;

      try {
        msg = JSON.parse(data.toString());
      } catch (error) {
        finish({
          ok: false,
          stage: "INVALID_JSON",
          raw: data.toString().slice(0, 500)
        });
        return;
      }

      log.push("PAYLOAD_" + msg.payloadType);

      if (msg.payloadType === 2101) {
        log.push("APP_AUTH_OK");

        const accountAuth = JSON.stringify({
          clientMsgId: "nbs_account_auth_" + Date.now(),
          payloadType: 2102,
          payload: {
            ctidTraderAccountId: accountId,
            accessToken: accessToken
          }
        });

        try {
          ws.send(accountAuth);
          log.push("2102_SEND_CALLED");
        } catch (error) {
          finish({
            ok: false,
            stage: "SEND_2102_EXCEPTION",
            error: error.message
          });
        }

        return;
      }

      if (msg.payloadType === 2103) {
        log.push("ACCOUNT_AUTH_OK");

        finish({
          ok: true,
          stage: "ACCOUNT_AUTH_OK",
          accountId,
          environment: CTRADER.environment,
        });

        return;
      }

      // OA error
      if (msg.payloadType === 2142 || msg.payloadType === 50) {
        finish({
          ok: false,
          stage: "CTRADER_ERROR",
          response: msg
        });
        return;
      }

      log.push("UNHANDLED_" + msg.payloadType);
    });

    ws.on("error", (error) => {
      finish({
        ok: false,
        stage: "WEBSOCKET_ERROR",
        error: error.message
      });
    });

    ws.on("close", (code, reason) => {
      if (!finished) {
        finish({
          ok: false,
          stage: "CLOSED",
          code,
          reason: reason.toString()
        });
      }
    });
  });
}
