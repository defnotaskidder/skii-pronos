import { NextResponse } from "next/server";
import { analysedBoard } from "../../../lib/board";
import { specialOfTheDay } from "../../../lib/special";

export const maxDuration = 120; // the first call of a special night waits for the AI pass (web search, ≤ 85 s)

// The special night: every game of today's big competition analysed, the AI's verdicts and the
// night's two coupons (lib/special.js). { none: true } when no big competition plays today.
export async function GET() {
  try {
    const rows = await analysedBoard(2);
    const d = await specialOfTheDay(rows);
    return NextResponse.json(d, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
