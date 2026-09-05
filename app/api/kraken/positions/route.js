import {
  getKrakenExecutionConfig,
  krakenPrivate,
} from "../../../lib/kraken-client.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const CONFIG = getKrakenExecutionConfig();

export async function GET(request) {
  const executorKey = process.env.NBS_EXECUTOR_KEY;
  const providedKey = request.headers.get("x-nbs-executor-key");

  if (!executorKey || providedKey !== executorKey) {
    return Response.json({ ok: false, stage: "AUTH", error: "Unauthorized executor request" }, { status: 401 });
  }

  try {
    const result = await krakenPrivate("OpenPositions", {
      docalcs: true,
      consolidation: "market",
    });

    const positions = Object.entries(result || {})
      .filter(([, item]) => /XBT|BTC|ETH/i.test(String(item?.pair || "")))
      .map(([positionId, item]) => ({
        positionId,
        environment: CONFIG.environment,
        pair: item.pair,
        direction: item.type === "buy" ? "LONG" : "SHORT",
        volume: Number(item.vol || 0) - Number(item.vol_closed || 0),
        entry: Number(item.cost || 0) / Math.max(Number(item.vol || 0), Number.EPSILON),
        marginGBP: Number(item.margin || 0),
        valueGBP: Number(item.value || 0),
        pnlGBP: Number(item.net || 0),
        status: item.posstatus,
      }));

    return Response.json({ ok: true, environment: CONFIG.environment, positions });
  } catch (error) {
    return Response.json({ ok: false, stage: "KRAKEN_POSITIONS", error: error.message }, { status: 502 });
  }
}
