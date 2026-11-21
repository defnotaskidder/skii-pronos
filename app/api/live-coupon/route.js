import { NextResponse } from "next/server";
import { analysedBoard, remember } from "../../../lib/board";
import { buildLiveCoupon, liveGames } from "../../../lib/livecoupon";

export const maxDuration = 60;

// Live coupons, re-built every 20 seconds from the games in play; every price is an estimate (no
// live odds feed).
//   ?target=20 (2–500)      the best live coupon for that target; ?exclude=id,id for another combination
//   ?games=1                also the games in play with their markets, for a visitor's own live coupon
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const target = Math.min(500, Math.max(2, Number(sp.get("target")) || 20));
  const exclude = (sp.get("exclude") || "").split(",").filter(Boolean).slice(0, 100);
  const withGames = sp.get("games") === "1";
  try {
    const out = await remember(`livecoupon:${target}:${withGames ? 1 : 0}:${exclude.join(",")}`, 20e3, async () => {
      const rows = await analysedBoard(2);
      const coupon = buildLiveCoupon(rows, { target, exclude, maxLegs: target > 100 ? 12 : target > 20 ? 10 : target > 4 ? 8 : 4 });
      return withGames ? { coupon, games: liveGames(rows) } : { coupon };
    });
    return NextResponse.json({ ...out, at: new Date().toISOString() }, { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
