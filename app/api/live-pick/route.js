import { NextResponse } from "next/server";
import { analysedBoard, remember } from "../../../lib/board";
import { bestLivePicks, OP_LEVELS, OP_RECORD } from "../../../lib/livecoupon";

export const maxDuration = 60;

// The OP live pick: the one best single bet among the football games in play, re-chosen every
// 20 seconds (lib/livecoupon.js bestLivePicks). Its price is an estimate: no free feed carries
// in-play odds.
//   ?level=safe|mid|bold     the estimated-odds band (≈1.25+, ≈1.50+, ≈2.00+)
//   ?exclude=id,id           games to leave out ("another one")
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const level = OP_LEVELS[sp.get("level")] ? sp.get("level") : "safe";
  const exclude = (sp.get("exclude") || "").split(",").filter(Boolean).slice(0, 100);
  try {
    const out = await remember(`livepick:${level}:${exclude.join(",")}`, 20e3, async () => {
      const rows = await analysedBoard(2);
      const { picks, eligible, live } = bestLivePicks(rows, { level, exclude, max: 4 });
      return { pick: picks[0] || null, next: picks.slice(1), eligible, live, level, record: OP_RECORD[level] || null };
    });
    return NextResponse.json({ ...out, at: new Date().toISOString() }, { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
