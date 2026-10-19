import { NextResponse } from "next/server";
import { analysedBoard, remember } from "../../../lib/board";
import { buildLiveCoupon } from "../../../lib/livecoupon";

export const maxDuration = 60;

// Live grosse cote: ?target=20 (3–500), ?exclude=id,id for another combination. Re-built every
// 20 seconds from the games in play; every price is an estimate (no live odds feed).
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const target = Math.min(500, Math.max(3, Number(sp.get("target")) || 20));
  const exclude = (sp.get("exclude") || "").split(",").filter(Boolean).slice(0, 100);
  try {
    const coupon = await remember(`livecoupon:${target}:${exclude.join(",")}`, 20e3, async () => {
      const rows = await analysedBoard(2);
      return buildLiveCoupon(rows, { target, exclude, maxLegs: target > 100 ? 12 : target > 20 ? 10 : 8 });
    });
    return NextResponse.json({ coupon, at: new Date().toISOString() }, { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
