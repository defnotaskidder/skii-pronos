import { NextResponse } from "next/server";
import { analysedBoard, remember } from "../../../lib/board";
import { buildLiveCoupon, liveGames } from "../../../lib/livecoupon";

export const maxDuration = 60;

// Live coupons, re-built every 20 seconds from the games in play; every price is an estimate (no
// live odds feed).
//   ?target=20 (2–500)      the best live coupon for that target; ?exclude=id,id for another combination
//   ?keep=id:key:odds,…     the legs the visitor already sees (odds: the price when first shown): they
//                           stay while they are still worth taking, so the coupon does not change at each refresh
//   ?games=1                also the games in play with their markets, for a visitor's own live coupon
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const target = Math.min(500, Math.max(2, Number(sp.get("target")) || 20));
  const exclude = (sp.get("exclude") || "").split(",").filter(Boolean).slice(0, 100);
  const withGames = sp.get("games") === "1";
  const keep = (sp.get("keep") || "").split(",").map((x) => x.split(":")).filter((x) => x.length >= 2 && /^[\w.-]{1,24}$/.test(x[0]) && /^[\w.+-]{1,16}$/.test(x[1])).slice(0, 12)
    .map(([eventId, key, odds]) => ({ eventId, key, odds: Number(odds) || 0 }));
  try {
    const build = async () => {
      const rows = await analysedBoard(2);
      const coupon = buildLiveCoupon(rows, { target, exclude, keep, maxLegs: target > 100 ? 12 : target > 20 ? 10 : target > 4 ? 8 : 4 });
      return withGames ? { coupon, games: liveGames(rows) } : { coupon };
    };
    // a visitor's own kept legs are theirs alone: built at once (the board itself is shared), never cached
    const out = keep.length ? await build() : await remember(`livecoupon:${target}:${withGames ? 1 : 0}:${exclude.join(",")}`, 20e3, build);
    return NextResponse.json({ ...out, at: new Date().toISOString() }, { headers: { "cache-control": keep.length ? "private, no-store" : "public, s-maxage=15, stale-while-revalidate=30" } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
