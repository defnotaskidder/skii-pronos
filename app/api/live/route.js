import { NextResponse } from "next/server";
import { board } from "../../../lib/espn";
import { boardForClient, remember } from "../../../lib/board";

export const revalidate = 10;

// Light, fast poll for the notification system: yesterday's and today's games, state + score only.
export async function GET(request) {
  try {
    const events = await board(0, -1);
    // ?count=1: how many games are live (the nav badges), a few bytes; &top=1 adds today's top picks
    // with their state and score (top-pick alerts on pages that don't load the board)
    const sp = request?.nextUrl?.searchParams;
    if (sp?.get("count")) {
      const live = events.filter((e) => e.state === "in").length;
      let top;
      if (sp.get("top")) {
        top = await remember("live:top", 30e3, async () => (await boardForClient(2)).filter((e) => e.top).map((e) => ({
          id: e.id, league: e.league, sport: e.sport, ot: e.ot, state: e.state,
          home: { short: e.home?.short, score: e.home?.score }, away: { short: e.away?.short, score: e.away?.score },
          top: { rank: e.top.rank, key: e.top.key, label: e.top.label, odds: e.top.odds },
        }))).catch(() => []);
      }
      return NextResponse.json({ live, ...(top ? { top } : {}) }, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } });
    }
    const games = events.map((e) => ({
      id: e.id, league: e.league, state: e.state, detail: e.detail, minute: e.minute, period: e.period, date: e.date,
      home: e.home?.short, away: e.away?.short, hs: e.home?.score, as: e.away?.score, reds: e.reds,
    }));
    return NextResponse.json({ games, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ games: [], error: e.message }, { status: 502 });
  }
}
