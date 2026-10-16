import { NextResponse } from "next/server";
import { results, dailyHistory, dbEnabled, pendingByLeague } from "../../../lib/db";
import { remember } from "../../../lib/memo";
import { calibrationTable } from "../../../lib/calibration";
import { leagueSkill } from "../../../lib/leagueform";
import { LEAGUE_BY_ID } from "../../../lib/leagues";

export const dynamic = "force-dynamic";

const r2 = (x) => Math.round(x * 100) / 100;
const unitsOf = (x) => (x.pick_result === "W" ? x.pick_odds - 1 : x.pick_result === "L" ? -1 : 0);

// Flat 1u summary of a list of graded (W/L) picks.
const line = (list) => {
  const n = list.length, w = list.filter((x) => x.pick_result === "W").length;
  const units = list.reduce((a, x) => a + unitsOf(x), 0);
  return { n, w, rate: n ? w / n : null, units: r2(units), roi: n ? units / n : null, avgOdds: n ? list.reduce((a, x) => a + x.pick_odds, 0) / n : null };
};
// Profit curve: cumulative units per day at flat 1u (list oldest first).
const curveOf = (list) => {
  const byDay = new Map();
  for (const x of list) {
    const d = new Date(x.kickoff).toISOString().slice(0, 10);
    const cur = byDay.get(d) || { day: d, n: 0, w: 0, units: 0 };
    cur.n++; if (x.pick_result === "W") cur.w++; cur.units += unitsOf(x);
    byDay.set(d, cur);
  }
  let acc = 0;
  return [...byDay.values()].map((d) => ({ ...d, units: r2(d.units), cum: r2((acc += d.units)) }));
};
const streakOf = (graded) => { let s = 0; for (let i = graded.length - 1; i >= 0; i--) { if (graded[i].pick_result === "W") s++; else break; } return s; };
const byTierOf = (graded) => Object.fromEntries(["High", "Med-High", "Medium", "Low"].map((t) => [t, line(graded.filter((x) => x.pick_tier === t))]));

// Every league with graded picks in the window or picks waiting to be played, with what the
// engine has learned about it (status strong / neutral / weak / learning).
function leagueRows(graded, skill, pending) {
  const byLeague = new Map();
  for (const x of graded) { if (!byLeague.has(x.league)) byLeague.set(x.league, []); byLeague.get(x.league).push(x); }
  const pend = new Map((pending || []).map((p) => [p.league, p]));
  const learned = skill?.leagues || {};
  const rows = [...new Set([...byLeague.keys(), ...pend.keys()])].map((id) => {
    const list = byLeague.get(id) || [], s = learned[id], p = pend.get(id);
    const all = line(list), pr = line(list.filter((x) => !x.pick_est));
    return {
      league: id, sport: list[0]?.sport || p?.sport || s?.sport || LEAGUE_BY_ID[id]?.sport || null,
      n: all.n, w: all.w, rate: all.rate, units: all.units, roi: all.roi,
      expRate: s?.expRate ?? null, edge: s?.edge ?? null, pPos: s?.pPos ?? null, status: (all.n && s?.status) || "learning",
      priced: { n: pr.n, w: pr.w, units: pr.units, roi: pr.roi },
      pending: Number(p?.n) || 0, next: p?.next || null,
    };
  });
  // strong first (most certain on top), then the rest of the graded leagues by sample size,
  // then leagues still waiting for their first result: big leagues first.
  const rank = (l) => (l.status === "strong" ? 0 : l.n ? 1 : 2);
  const tier = (l) => LEAGUE_BY_ID[l.league]?.tier ?? 99;
  const name = (l) => LEAGUE_BY_ID[l.league]?.name || l.league;
  return rows.sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 0 ? (b.pPos ?? 0) - (a.pPos ?? 0) : rank(a) === 1 ? b.n - a.n : 0)
    || tier(a) - tier(b) || name(a).localeCompare(name(b)));
}

// Public track record: profit curve, hit rates by tier and league, calibration, daily coupons,
// and where the model reads games best.
export async function GET(request) {
  const days = Math.min(180, Math.max(7, Number(request.nextUrl.searchParams.get("days")) || 30));
  if (!dbEnabled()) return NextResponse.json({ db: false });
  try {
    const data = await remember(`record:${days}`, 5 * 60e3, async () => {
      const [games, daily, calib, skill, pending] = await Promise.all([
        results({ days, limit: 20000 }), dailyHistory(days), calibrationTable(Math.max(days, 90)),
        leagueSkill(days).catch(() => null), pendingByLeague().catch(() => []),
      ]);
      const g = (games || []).slice().reverse(); // oldest first
      const priced = g.filter((x) => !x.pick_est);
      const graded = g.filter((x) => x.pick_result === "W" || x.pick_result === "L");
      const gradedPriced = graded.filter((x) => !x.pick_est);
      const leagues = leagueRows(graded, skill, pending);
      const dailyLine = (kind) => { const l = (daily || []).filter((c) => c.kind === kind && c.result); const w = l.filter((c) => c.result === "W").length; const units = l.reduce((a, c) => a + (c.result === "W" ? c.odds - 1 : -1), 0); return { n: l.length, w, units: r2(units) }; };
      return {
        all: line(graded), priced: line(gradedPriced), modelOnly: line(graded.filter((x) => x.pick_est)),
        byTier: byTierOf(graded), byTierPriced: byTierOf(gradedPriced),
        leagues,
        best: leagues.filter((l) => l.status === "strong").sort((a, b) => b.pPos - a.pPos).slice(0, 6),
        weak: leagues.filter((l) => l.status === "weak").sort((a, b) => a.pPos - b.pPos),
        skillReady: !!skill?.ready,
        curve: curveOf(g), curvePriced: curveOf(priced),
        calibration: calib, daily: { safe: dailyLine("safe"), grosse: dailyLine("grosse") },
        streak: streakOf(graded), streakPriced: streakOf(gradedPriced), since: g[0]?.kickoff || null,
      };
    });
    return NextResponse.json({ db: true, days, ...data }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch (e) {
    return NextResponse.json({ db: true, error: e.message }, { status: 502 });
  }
}
