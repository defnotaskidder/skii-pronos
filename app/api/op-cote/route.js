import { NextResponse } from "next/server";
import { analysedBoard, remember } from "../../../lib/board";
import { poolOf } from "../../../lib/daily";
import { buildOpCote, OP_COTE_RECORD } from "../../../lib/opcote";

export const maxDuration = 60;

// The OP cote 2: the pair or treble of bookmaker-priced football favourites, among the games of
// the next hours, that reaches odds 2 with the highest chance (lib/opcote.js).
//   ?hours=24 (3–48)   how far ahead the games may kick off
//   ?exclude=id,id     games to leave out, for another combination
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const exclude = (sp.get("exclude") || "").split(",").filter(Boolean).slice(0, 100);
  const hours = Math.min(48, Math.max(3, Number(sp.get("hours")) || 24));
  try {
    const out = await remember(`opcote:${hours}:${exclude.join(",")}`, 60e3, async () => {
      const rows = await analysedBoard(2);
      return { coupon: buildOpCote(poolOf(rows, hours), { target: 2, exclude }), hours, record: OP_COTE_RECORD };
    });
    return NextResponse.json({ ...out, at: new Date().toISOString() }, { headers: { "cache-control": "public, s-maxage=45, stale-while-revalidate=60" } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
