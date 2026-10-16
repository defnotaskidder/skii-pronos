import { NextResponse } from "next/server";
import { analysedBoard } from "../../../lib/board";
import { buildCoupon, buildTarget } from "../../../lib/coupon";
import { couponsOfTheDay, learning, poolOf, withStatus } from "../../../lib/daily";
import { dbEnabled } from "../../../lib/db";

export const maxDuration = 90; // the first build of the day waits for the AI review (web search, ≤ 55 s)

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  try {
    const rows = await analysedBoard(2);
    // generator: any target, any profile; `exclude` gives a different combination each time
    if (sp.get("target")) {
      const target = Math.min(5000, Math.max(1.3, Number(sp.get("target")) || 3));
      const mode = ["safe", "balanced", "grosse", "value"].includes(sp.get("mode")) ? sp.get("mode") : "balanced";
      const hours = Math.min(96, Math.max(3, Number(sp.get("hours")) || 30));
      const exclude = (sp.get("exclude") || "").split(",").filter(Boolean).slice(0, 200);
      const maxLegs = Math.min(20, Math.max(2, Number(sp.get("maxLegs")) || (target > 200 ? 14 : target > 50 ? 11 : target > 10 ? 8 : 6)));
      const pool = poolOf(rows, hours);
      const { adjust } = await learning(); // learned calibration + league form, every sport allowed
      const c = mode === "value"
        ? buildCoupon(pool.filter((r) => !exclude.includes(r.ev.id)), { target, mode, maxLegs, minTier: "Low", perLeague: 3 })
        : buildTarget(pool, { target, profile: mode, maxLegs, perLeague: 3, exclude, adjust });
      return NextResponse.json({ coupon: c, pool: pool.length });
    }
    const d = await couponsOfTheDay(rows);
    return NextResponse.json({ ...d, safe: withStatus(d.safe, rows), grosse: withStatus(d.grosse, rows), db: dbEnabled() });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
