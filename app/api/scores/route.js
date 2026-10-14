export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { oddsApi } from "../../../lib/odds";

// Live + recent scores for one league. 60s server cache protects the monthly credit quota
// (each uncached call costs 2 credits on The Odds API because of daysFrom).
const cache = new Map();
const TTL = 60 * 1000;

export async function GET(request) {
  const sport = request.nextUrl.searchParams.get("sport");
  if (!sport) return NextResponse.json({ error: "sport is required" }, { status: 400 });
  const hit = cache.get(sport);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ ...hit.payload, cached: true });
  try {
    const { data, quota } = await oddsApi(`/sports/${sport}/scores`, { daysFrom: 1, dateFormat: "iso" });
    const now = Date.now();
    const games = data.map((g) => {
      const start = new Date(g.commence_time).getTime();
      const score = (name) => g.scores?.find((s) => s.name === name)?.score ?? null;
      const state = g.completed ? "finished" : start <= now ? "live" : "upcoming";
      return {
        id: g.id,
        league: g.sport_title,
        sport_key: g.sport_key,
        commence_time: g.commence_time,
        home: g.home_team,
        away: g.away_team,
        home_score: score(g.home_team),
        away_score: score(g.away_team),
        state,
        last_update: g.last_update,
      };
    });
    const payload = { games, quota, fetched_at: new Date().toISOString() };
    cache.set(sport, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: e.message, games: [] }, { status: 502 });
  }
}
