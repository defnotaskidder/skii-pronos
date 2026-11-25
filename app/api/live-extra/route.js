import { NextResponse } from "next/server";
import { board } from "../../../lib/espn";
import { extraLive, moreLive } from "../../../lib/morelive";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The games in play that the main feed does not carry: scores read seconds ago from the open feeds
// (lib/openlive.js), joined to the priced reading of API-Football (lib/morelive.js).
//   { configured, games: [{ id, date, status, minute, league, country, home, away, hs, as, priced?, pick?, stale?, at? }],
//     at (scores), pricesAt (in-play prices), source }
//   ?status=1   only the state of the sources (no list): which feed answered, the key, the calls left today
export async function GET(request) {
  try {
    const events = await board(0, -1).catch(() => []);
    const x = await extraLive(events);
    const iso = (t) => (t ? new Date(t).toISOString() : null);
    if (request.nextUrl.searchParams.get("status")) {
      const af = await moreLive().catch(() => null);
      return NextResponse.json({
        inPlay: x.games.length, withPick: x.games.filter((g) => g.pick).length, scoresFrom: x.source, scoresAt: iso(x.at), scoresAgeSeconds: x.at ? Math.round((Date.now() - x.at) / 1000) : null,
        openFeeds: x.open, prices: { configured: !!af?.configured, at: iso(af?.at), ageSeconds: af?.at ? Math.round((Date.now() - af.at) / 1000) : null, remainingToday: af?.remaining ?? null, error: af?.error || null },
      }, { headers: { "cache-control": "no-store" } });
    }
    if (!x.configured) return NextResponse.json({ configured: false, games: [] }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" } });
    const games = x.games.map(({ markets, ...g }) => (g.at ? { ...g, at: iso(g.at) } : g)); // eslint-disable-line no-unused-vars
    return NextResponse.json({ configured: true, games, at: iso(x.at), pricesAt: iso(x.pricesAt), source: x.source }, { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" } });
  } catch (e) {
    return NextResponse.json({ configured: true, games: [], error: e.message }, { status: 502 });
  }
}
