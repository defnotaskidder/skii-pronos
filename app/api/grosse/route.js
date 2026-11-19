import { NextResponse } from "next/server";
import { analysedBoard, remember } from "../../../lib/board";
import { buildTarget, legFrom } from "../../../lib/coupon";
import { learning, poolOf } from "../../../lib/daily";
import { dailyHistory } from "../../../lib/db";
import { tierFor } from "../../../lib/model";
import { LEAGUE_BY_ID } from "../../../lib/leagues";

export const maxDuration = 60;

// The grosse cote desk, in one call:
//   • ladder — the best build at every rung (x10 … x1000) from the next 48 hours, with its real
//     chance, the fair odds that chance is worth and the gap to the price (the bookmaker's cut
//     compounds with every leg: the page shows it instead of hiding it);
//   • outsiders — single bets at 2.50+ with a real price where the model sees an edge;
//   • record — every big-odds coupon of the last 60 days: won, lost, lost by one leg, units.
const RUNGS = [
  { target: 10, maxLegs: 8 }, { target: 25, maxLegs: 10 }, { target: 50, maxLegs: 12 }, { target: 100, maxLegs: 14 },
  { target: 250, maxLegs: 16 }, { target: 500, maxLegs: 18 }, { target: 1000, maxLegs: 20 },
];
const BIG_KINDS = ["x12", "grosse", "x200", "x400", "special_x"];
const r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4;
const THIN = new Set(["stats", "blind", "none"]);

function outsiders(pool, adjust, weak) {
  const out = [];
  for (const { ev, analysis } of pool) {
    if (!analysis?.markets?.length || THIN.has(analysis.quality) || weak.has(ev.league)) continue;
    let best = null;
    for (const m of analysis.markets) {
      if (m.info || m.estimated || !m.odds || m.odds < 2.5 || m.odds > 15 || m.v > 0.01) continue;
      const p = adjust(m.p, false, ev.league);
      const edge = p * m.odds - 1;
      if (!(p >= 0.08) || edge < 0.02) continue;
      const score = edge * Math.sqrt(p);
      if (!best || score > best.score) best = { m, p, edge, score };
    }
    if (!best) continue;
    out.push({ ...legFrom(ev, { ...best.m, p: r4(best.p), safe: r4(best.p), ev: r4(best.edge), tier: tierFor(best.p, best.edge, analysis.quality) }), fair: r2(1 / best.p), leagueName: LEAGUE_BY_ID[ev.league]?.name, score: best.score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10).map(({ score, ...l }) => l); // eslint-disable-line no-unused-vars
}

function record(hist) {
  const rows = (hist || []).filter((c) => BIG_KINDS.includes(c.kind) && (c.result === "W" || c.result === "L"));
  const lostBy = (c) => (c.legs || []).filter((l) => l.result === "L").length;
  const won = rows.filter((c) => c.result === "W");
  const units = rows.reduce((a, c) => a + (c.result === "W" ? c.odds - 1 : -1), 0);
  const brief = (c) => ({ day: c.day, kind: c.kind, odds: c.odds, n: c.legs?.length || 0, result: c.result, lostBy: c.result === "L" ? lostBy(c) : 0 });
  return {
    days: 60, n: rows.length, w: won.length, units: r2(units),
    best: won.length ? brief(won.reduce((a, c) => (c.odds > a.odds ? c : a))) : null,
    near: rows.filter((c) => c.result === "L" && lostBy(c) === 1).length,
    last: rows.slice(0, 12).map(brief),
  };
}

async function payload() {
  const rows = await analysedBoard(2);
  const pool = poolOf(rows, 48);
  const { adjust, skill, weak } = await learning();
  const ladder = RUNGS.map(({ target, maxLegs }) => {
    const c = buildTarget(pool, { target, profile: "grosse", maxLegs, perLeague: 3, adjust, skill, skipLeagues: weak });
    if (!c?.legs?.length) return { target, empty: true };
    const fair = c.chance > 0 ? 1 / c.chance : null;
    return {
      target, odds: c.odds, chance: c.chance, reached: c.odds >= target * 0.9, legs: c.legs,
      fair: fair ? r2(fair) : null, edge: fair ? r4(c.odds * c.chance - 1) : null, // expected return per unit staked
      estimated: c.legs.filter((l) => l.estimated).length,
    };
  });
  const hist = await dailyHistory(60).catch(() => null);
  return { updated: new Date().toISOString(), games: pool.length, ladder, outsiders: outsiders(pool, adjust, new Set(weak)), record: record(hist) };
}

export async function GET() {
  try {
    const data = await remember("grosse:desk", 60e3, payload);
    return NextResponse.json(data, { headers: { "cache-control": "public, s-maxage=45, stale-while-revalidate=120" } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
