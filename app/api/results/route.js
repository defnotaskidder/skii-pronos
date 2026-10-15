import { NextResponse } from "next/server";
import { results, dailyHistory, dailySettle, dbEnabled } from "../../../lib/db";
import { remember } from "../../../lib/board";

// History of every graded game: the engine's pre-match pick and how it did, plus the
// archive of daily coupons. ?days=1..60
export async function GET(request) {
  const days = Math.min(60, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 7));
  if (!dbEnabled()) return NextResponse.json({ db: false, games: [], daily: [], stats: null });
  try {
    const data = await remember(`results:${days}`, 60e3, async () => {
      await dailySettle();
      const [games, daily] = await Promise.all([results({ days }), dailyHistory(Math.max(days, 30))]);
      return { games: games || [], daily: daily || [] };
    });
    return NextResponse.json({ db: true, days, ...data, stats: summarise(data.games) });
  } catch (e) {
    return NextResponse.json({ db: true, error: e.message, games: [], daily: [] }, { status: 502 });
  }
}

function summarise(games) {
  const line = (list, odds) => {
    const graded = list.filter((g) => g.r === "W" || g.r === "L");
    const w = graded.filter((g) => g.r === "W").length;
    const units = list.reduce((a, g) => a + (g.r === "W" ? g.o - 1 : g.r === "L" ? -1 : 0), 0);
    return { n: graded.length, w, rate: graded.length ? w / graded.length : null, units: Math.round(units * 100) / 100, roi: graded.length ? units / graded.length : null, avgOdds: odds && graded.length ? graded.reduce((a, g) => a + g.o, 0) / graded.length : null };
  };
  const picks = games.map((g) => ({ r: g.pick_result, o: g.pick_odds, tier: g.pick_tier, league: g.league }));
  const values = games.filter((g) => g.value_key).map((g) => ({ r: g.value_result, o: g.value_odds }));
  const byTier = {};
  for (const t of ["High", "Med-High", "Medium", "Low"]) byTier[t] = line(picks.filter((p) => p.tier === t), true);
  const byLeague = {};
  for (const p of picks) (byLeague[p.league] = byLeague[p.league] || []).push(p);
  const leagues = Object.entries(byLeague).map(([league, list]) => ({ league, ...line(list, false) })).filter((l) => l.n >= 3).sort((a, b) => b.n - a.n).slice(0, 12);
  return { all: line(picks, true), value: line(values, true), byTier, leagues };
}
