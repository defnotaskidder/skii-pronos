import { NextResponse } from "next/server";
import { analysedBoard } from "../../../lib/board";
import { reviewSpecial, specialOfTheDay } from "../../../lib/special";

export const maxDuration = 300; // ?review=1 runs the AI pass over the slate (web search, up to 4 minutes)

// The special night: every game of today's big competition analysed, the AI's verdicts and the
// night's two coupons (lib/special.js). { none: true } when no big competition plays today.
// ?review=1 runs (or re-runs with &force=1) the AI team-news pass on the published slate.
export async function GET(request) {
  try {
    const rows = await analysedBoard(2);
    const sp = request.nextUrl.searchParams;
    if (sp.get("review")) {
      const d = await reviewSpecial(rows, { force: sp.get("force") === "1" });
      return NextResponse.json(d || { none: true }, { headers: { "cache-control": "no-store" } });
    }
    const d = await specialOfTheDay(rows);
    return NextResponse.json(d, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
