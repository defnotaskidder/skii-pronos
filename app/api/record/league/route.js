import { NextResponse } from "next/server";
import { dbEnabled, leaguePicks } from "../../../../lib/db";
import { remember } from "../../../../lib/memo";
import { LEAGUE_BY_ID } from "../../../../lib/leagues";

export const dynamic = "force-dynamic";

// The picks behind one league's line on the record page: ?id=uefa.europa&days=30
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id") || "";
  const days = Math.min(180, Math.max(7, Number(sp.get("days")) || 30));
  if (!LEAGUE_BY_ID[id]) return NextResponse.json({ error: "unknown league" }, { status: 404 });
  if (!dbEnabled()) return NextResponse.json({ db: false, league: id, picks: [] });
  try {
    const rows = await remember(`leaguepicks:${id}:${days}`, 120e3, () => leaguePicks(id, days));
    const picks = rows.map((r) => ({
      id: r.event_id, date: new Date(r.kickoff).toISOString(), state: r.state, home: r.home, away: r.away, homeLogo: r.home_logo, awayLogo: r.away_logo,
      label: r.pick_label, odds: r.pick_odds, safe: r.pick_safe, tier: r.pick_tier, estimated: !!r.pick_est, result: r.pick_result, hs: r.home_score, as: r.away_score,
    }));
    return NextResponse.json({ db: true, league: id, days, picks }, { headers: { "cache-control": "public, s-maxage=120, stale-while-revalidate=300" } });
  } catch (e) {
    return NextResponse.json({ db: true, league: id, picks: [], error: e.message }, { status: 502 });
  }
}
