import { NextResponse } from "next/server";
import { board } from "../../../lib/espn";
import { moreLive, withoutKnown } from "../../../lib/morelive";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The games in play that the main feed does not carry (lib/morelive.js): scores only.
//   { configured, games: [{ id, date, status, minute, league, country, round, home, away, hs, as }], at, ageSeconds }
//   ?status=1   only the state of the second source (no list): is the key set, when it last answered, what it said
export async function GET(request) {
  try {
    const d = await moreLive();
    const age = d.at ? Math.round((Date.now() - d.at) / 1000) : null;
    if (request.nextUrl.searchParams.get("status")) {
      return NextResponse.json({ configured: d.configured, at: d.at ? new Date(d.at).toISOString() : null, ageSeconds: age, inPlay: d.games.length, remainingToday: d.remaining ?? null, error: d.error || null }, { headers: { "cache-control": "no-store" } });
    }
    if (!d.configured) return NextResponse.json({ configured: false, games: [] }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
    const events = await board(0, -1).catch(() => []);
    const games = withoutKnown(d.games, events).map(({ markets, ...g }) => g); // eslint-disable-line no-unused-vars
    return NextResponse.json({ configured: true, games, total: d.games.length, at: d.at ? new Date(d.at).toISOString() : null, ageSeconds: age, ...(d.error ? { error: d.error } : {}) }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch (e) {
    return NextResponse.json({ configured: true, games: [], error: e.message }, { status: 502 });
  }
}
