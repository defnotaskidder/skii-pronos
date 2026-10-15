import { NextResponse } from "next/server";
import { results, dailyHistory, dbEnabled } from "../../../lib/db";
import { remember } from "../../../lib/board";
import { calibrationTable } from "../../../lib/calibration";

export const dynamic = "force-dynamic";

// Public track record: profit curve, hit rates by tier and league, calibration, daily coupons.
export async function GET(request) {
  const days = Math.min(180, Math.max(7, Number(request.nextUrl.searchParams.get("days")) || 30));
  if (!dbEnabled()) return NextResponse.json({ db: false });
  try {
    const data = await remember(`record:${days}`, 5 * 60e3, async () => {
      const [games, daily, calib] = await Promise.all([results({ days, limit: 20000 }), dailyHistory(days), calibrationTable(Math.max(days, 90))]);
      const g = (games || []).slice().reverse(); // oldest first
      // profit curve: cumulative units per day at flat 1u on every pick
      const byDay = new Map();
      for (const x of g) {
        const d = new Date(x.kickoff).toISOString().slice(0, 10);
        const u = x.pick_result === "W" ? x.pick_odds - 1 : x.pick_result === "L" ? -1 : 0;
        const cur = byDay.get(d) || { day: d, n: 0, w: 0, units: 0 };
        cur.n++; if (x.pick_result === "W") cur.w++; cur.units += u;
        byDay.set(d, cur);
      }
      let acc = 0;
      const curve = [...byDay.values()].map((d) => ({ ...d, units: Math.round(d.units * 100) / 100, cum: Math.round((acc += d.units) * 100) / 100 }));
      const line = (list) => { const n = list.length, w = list.filter((x) => x.pick_result === "W").length; const units = list.reduce((a, x) => a + (x.pick_result === "W" ? x.pick_odds - 1 : -1), 0); return { n, w, rate: n ? w / n : null, units: Math.round(units * 100) / 100, roi: n ? units / n : null, avgOdds: n ? list.reduce((a, x) => a + x.pick_odds, 0) / n : null }; };
      const graded = g.filter((x) => x.pick_result === "W" || x.pick_result === "L");
      const byTier = {};
      for (const t of ["High", "Med-High", "Medium", "Low"]) byTier[t] = line(graded.filter((x) => x.pick_tier === t));
      const byLeague = {};
      for (const x of graded) (byLeague[x.league] = byLeague[x.league] || []).push(x);
      const leagues = Object.entries(byLeague).map(([league, list]) => ({ league, ...line(list) })).filter((l) => l.n >= 5).sort((a, b) => b.n - a.n).slice(0, 15);
      const dailyLine = (kind) => { const l = (daily || []).filter((c) => c.kind === kind && c.result); const w = l.filter((c) => c.result === "W").length; const units = l.reduce((a, c) => a + (c.result === "W" ? c.odds - 1 : -1), 0); return { n: l.length, w, units: Math.round(units * 100) / 100 }; };
      const streak = (() => { let s = 0; for (let i = graded.length - 1; i >= 0; i--) { if (graded[i].pick_result === "W") s++; else break; } return s; })();
      return { all: line(graded), byTier, leagues, curve, calibration: calib, daily: { safe: dailyLine("safe"), grosse: dailyLine("grosse") }, streak, since: g[0]?.kickoff || null };
    });
    return NextResponse.json({ db: true, days, ...data }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch (e) {
    return NextResponse.json({ db: true, error: e.message }, { status: 502 });
  }
}
