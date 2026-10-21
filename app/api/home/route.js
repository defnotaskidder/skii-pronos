import { NextResponse } from "next/server";
import { analysedBoard, boardForClient, remember } from "../../../lib/board";
import { allWithStatus, couponsOfTheDay, EXPRESS, KINDS } from "../../../lib/daily";
import { specialOfTheDay } from "../../../lib/special";
import { dailyGet, topPickRows } from "../../../lib/db";
import { LEAGUE_BY_ID } from "../../../lib/leagues";

export const maxDuration = 60;

// Everything the home page shows, small enough for a slow phone connection (a few KB instead of
// the full board): the day's top picks, the top-pick record, yesterday's results, the coupon du
// jour and the express builds, the live count. ?tab=weekend adds Saturday's and Sunday's picks.
const UNITS = { High: 3, "Med-High": 2, Medium: 1 };
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const dayOf = (iso) => String(iso).slice(0, 10); // UTC day, as the coupons and top picks use
const utcDay = (off = 0) => new Date(Date.now() + off * 864e5).toISOString().slice(0, 10);

function pickOf(e) {
  const p = e.top || (e.state === "post" ? e.done : null) || e.a?.pick;
  if (!p?.label || !p.odds) return null;
  const safe = p.safe ?? e.a?.pick?.safe ?? null;
  return {
    id: e.id, league: e.league, leagueName: LEAGUE_BY_ID[e.league]?.name, leagueFr: LEAGUE_BY_ID[e.league]?.fr, sport: e.sport, date: e.date,
    state: e.state, detail: e.detail, minute: e.minute, ot: e.ot,
    home: { short: e.home?.short, logo: e.home?.logo, score: e.home?.score }, away: { short: e.away?.short, logo: e.away?.logo, score: e.away?.score },
    key: p.key || e.a?.pick?.key, label: p.label, odds: p.odds, p: r3(safe), implied: r3(1 / p.odds), tier: p.tier, units: UNITS[p.tier] || 1,
    rank: e.top?.rank || null, estimated: !!(p.estimated ?? e.a?.pick?.estimated), result: e.done?.result || null,
  };
}

// The day's list: its top picks in rank order, then (if fewer than 6) the next-best priced picks.
function picksForDay(events, day) {
  const evs = events.filter((e) => dayOf(e.date) === day && !e.postponed);
  const top = evs.filter((e) => e.top).sort((a, b) => a.top.rank - b.top.rank).map(pickOf).filter(Boolean);
  if (top.length >= 6) return top;
  const more = evs.filter((e) => !e.top && e.state === "pre" && e.a?.pick && !e.a.pick.estimated && UNITS[e.a.pick.tier] && e.a.pick.ls !== "weak")
    .sort((a, b) => (b.a.pick.safe ?? 0) - (a.a.pick.safe ?? 0)).slice(0, 6 - top.length).map(pickOf).filter(Boolean);
  return [...top, ...more];
}


async function payload() {
  // the top picks' record: each day's 10 strongest priced Med-High/High picks (ranked in SQL over
  // the whole day, finished or not — the board marks them the same way), flat stakes at the price
  const [events, rows, top30] = await Promise.all([
    boardForClient(2),
    analysedBoard(2),
    topPickRows(30).catch(() => []),
  ]);
  const today = utcDay(0), tomorrow = utcDay(1), yesterday = utcDay(-1);

  const graded = top30.filter((r) => r.pick_result === "W" || r.pick_result === "L");
  const units = graded.reduce((a, r) => a + (r.pick_result === "W" ? r.pick_odds - 1 : -1), 0);
  const stats = graded.length ? {
    days: 30, n: graded.length, w: graded.filter((r) => r.pick_result === "W").length,
    rate: r3(graded.filter((r) => r.pick_result === "W").length / graded.length), units: Math.round(units * 100) / 100, roi: r3(units / graded.length),
    last10: top30.filter((r) => r.pick_result).slice(0, 10).map((r) => r.pick_result),
  } : null;

  const yest = top30.filter((r) => r.pick_result && new Date(r.kickoff).toISOString().slice(0, 10) === yesterday).slice(0, 8).map((r) => ({
    id: r.event_id, league: r.league, home: r.home, away: r.away, label: r.pick_label, odds: r.pick_odds, result: r.pick_result, score: `${r.home_score}-${r.away_score}`,
  }));
  const yCoupons = await dailyGet(yesterday).catch(() => null);

  // coupons: built on first request of the day (the AI check can take ~50 s) — don't hold the page
  let coupons = null;
  try {
    const d = await Promise.race([couponsOfTheDay(rows), new Promise((_, rej) => setTimeout(() => rej(new Error("building")), 8000))]);
    const s = allWithStatus(d, rows);
    const brief = (c, target) => (c?.legs?.length ? { odds: c.odds, n: c.legs.length, chance: c.chance, status: c.status, target: c.target ?? target, reached: c.reached } : c ? { empty: true } : null);
    coupons = { day: s.day, safe: brief(s.safe, 2), ...Object.fromEntries(EXPRESS.map((b) => [b.kind, brief(s[b.kind], b.target)])) };
  } catch { coupons = { building: true }; }

  // the special night (Champions League…): a brief for the home card; built on first request like the coupons
  let special = null;
  try {
    const sp = await Promise.race([specialOfTheDay(rows), new Promise((_, rej) => setTimeout(() => rej(new Error("building")), 8000))]);
    if (sp && !sp.none) {
      const c = sp.coupons?.special;
      special = { day: sp.day, league: sp.league, name: sp.name, fr: sp.fr, n: sp.games.length, kick: sp.games[0]?.date || null, live: sp.live, done: sp.done, reviewed: sp.reviewed,
        coupon: c?.legs?.length ? { odds: c.odds, n: c.legs.length, chance: c.chance, status: c.status } : null };
    }
  } catch { special = { building: true }; }

  return {
    updated: new Date().toISOString(),
    live: events.filter((e) => e.state === "in").length,
    special,
    stats,
    // live tab: the day's top picks in play first (by rank), then other live games with a pick
    picks: {
      today: picksForDay(events, today), tomorrow: picksForDay(events, tomorrow),
      live: events.filter((e) => e.state === "in" && (e.top || e.a?.pick))
        .sort((a, b) => (a.top ? a.top.rank : 99) - (b.top ? b.top.rank : 99)).slice(0, 10).map(pickOf).filter(Boolean),
    },
    coupons, kinds: KINDS,
    yesterday: {
      picks: yest,
      coupons: yCoupons ? Object.fromEntries(KINDS.filter((k) => yCoupons[k]).map((k) => [k, { odds: yCoupons[k].odds, result: yCoupons[k].result || null }])) : null,
    },
  };
}

// Saturday and Sunday (UTC) of the current weekend; up to six days ahead of the board.
async function weekend() {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 Sunday … 6 Saturday
  const toSun = dow === 0 ? 0 : 7 - dow;
  const events = await boardForClient(Math.min(7, Math.max(2, toSun + 1)));
  const sat = dow === 0 ? null : utcDay(toSun - 1), sun = utcDay(toSun);
  return { weekend: [...(sat ? picksForDay(events, sat) : []), ...picksForDay(events, sun)] };
}

export async function GET(request) {
  try {
    const tab = request.nextUrl.searchParams.get("tab");
    const data = tab === "weekend" ? await remember("home:weekend", 60e3, weekend) : await remember("home", 15e3, payload);
    return NextResponse.json(data, { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=60" } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
