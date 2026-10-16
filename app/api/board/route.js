import { NextResponse } from "next/server";
import { boardForClient } from "../../../lib/board";
import { leagueSkillBrief } from "../../../lib/leagueform";

export const maxDuration = 60;

// Every league, yesterday → +2 days, each match with the model's verdict (and, for finished
// games, the pick the engine saved before kick-off with its result), plus what the engine has
// learned per league (strong / weak / …) for the league badges.
export async function GET(request) {
  const days = Math.min(4, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 2));
  try {
    const [events, skill] = await Promise.all([boardForClient(days), leagueSkillBrief().catch(() => ({}))]);
    return NextResponse.json({ events, skill, updated: new Date().toISOString() }, { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=45" } });
  } catch (e) {
    return NextResponse.json({ error: e.message, events: [] }, { status: 502 });
  }
}
