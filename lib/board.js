// Server-side: every league's fixtures + a model verdict on each match.
import { board as espnBoard, standings, pool } from "./espn";
import { analyse } from "./model";
import { LEAGUE_BY_ID, isSoccer } from "./leagues";
import { syncBoard, picksFor } from "./db";
import { ratingsFor } from "./ratings";
import { calibrator } from "./calibration";
import { leagueSkill, adjustP } from "./leagueform";
import { applySharp } from "./sharp";
import { tierFor } from "./model";
import { remember } from "./memo";
export { remember };

// League tables feed the stats half of the model. Fetched gently (4 at a time) and kept for
// hours; youth/college competitions are skipped.
export async function tablesFor(leagueIds) {
  const ids = [...new Set(leagueIds)].filter((id) => isSoccer(id) && (LEAGUE_BY_ID[id]?.tier ?? 9) <= 5);
  const out = {};
  await pool(ids, 4, async (id) => { out[id] = await remember(`table:${id}`, 6 * 3600e3, () => standings(id)).catch(() => ({})); });
  return out;
}

// Re-analyse a match only when its odds, form, table or ratings changed.
const cache = globalThis.__skiiAnalysis || (globalThis.__skiiAnalysis = new Map());
function analyseCached(ev, table, ratings) {
  const sig = JSON.stringify([ev.odds, ev.home?.form, ev.away?.form, ev.home?.id, ev.away?.id, Object.keys(table).length, ratings?.home?.rating, ratings?.away?.rating]);
  const hit = cache.get(ev.id);
  if (hit && hit.sig === sig) return hit.a;
  const a = analyse(ev, table, ratings);
  cache.set(ev.id, { sig, a });
  if (cache.size > 6000) cache.delete(cache.keys().next().value);
  return a;
}

const r3 = (x) => (x === null || x === undefined ? x : Math.round(x * 1000) / 1000);
const brief = (a) => a && ({
  quality: a.quality, probs: a.probs && { h: r3(a.probs.h), d: r3(a.probs.d), a: r3(a.probs.a) }, xg: a.xg || null,
  pick: a.pick && { key: a.pick.key, label: a.pick.label, odds: a.pick.odds, p: r3(a.pick.p), safe: r3(a.pick.safe), ev: r3(a.pick.ev), tier: a.pick.tier, estimated: a.pick.estimated || undefined, ls: a.pick.ls },
  value: a.value && { key: a.value.key, label: a.value.label, odds: a.value.odds, p: r3(a.value.p), ev: r3(a.value.ev), tier: a.value.tier },
});

// Learned corrections on the pick: calibration by class (priced vs stats-only picks, once enough
// are graded), then the league's learned offset (how the model has really done there). The
// cached analysis is shared, so the pick is copied, never mutated; markets stay raw.
function learned(a, league, cal, skill) {
  if (!a?.pick) return a;
  const raw = a.pick.safe ?? a.pick.p;
  const adj = adjustP(cal ? cal(raw, !!a.pick.estimated) : raw, league, skill);
  const safe = adj === raw ? raw : Math.round(adj * 1e4) / 1e4;
  const pick = { ...a.pick, raw, safe, tier: tierFor(safe, a.pick.ev ?? 0, a.quality), ls: skill?.leagues?.[league]?.status };
  return { ...a, pick, calibrated: cal ? true : undefined };
}

// Full analyses kept server-side for the coupon builder; the client gets the brief version.
// Each refresh also saves pre-match picks to the database and grades finished games.
export async function analysedBoard(days = 2) {
  return remember(`board:${days}`, 20e3, async () => {
    const events = await espnBoard(days);
    const upcoming = events.filter((e) => e.state !== "post");
    await applySharp(upcoming).catch(() => 0);
    const [tables, ratings, cal, skill] = await Promise.all([
      tablesFor(upcoming.map((e) => e.league)),
      remember("ratings:all", 10 * 60e3, () => ratingsFor(upcoming.flatMap((e) => [e.home?.id, e.away?.id]))).catch(() => new Map()),
      calibrator().catch(() => null),
      leagueSkill(120).catch(() => null),
    ]);
    const rows = events.map((ev) => {
      if (ev.state === "post" || ev.postponed) return { ev, analysis: null };
      const r = ratings.size ? { home: ratings.get(ev.home?.id), away: ratings.get(ev.away?.id) } : null;
      return { ev, analysis: learned(analyseCached(ev, tables[ev.league] || {}, r), ev.league, cal, skill), ratings: r };
    });
    await syncBoard(rows);
    return rows;
  });
}

// Light event shape for the browser (no venue/colours/records).
const slim = (ev) => ({
  id: ev.id, league: ev.league, sport: ev.sport, date: ev.date, state: ev.state, completed: ev.completed || undefined, detail: ev.detail,
  minute: ev.minute ?? undefined, period: ev.state === "in" ? ev.period : undefined, postponed: ev.postponed || undefined,
  reds: ev.reds?.home || ev.reds?.away ? ev.reds : undefined, note: ev.note || undefined,
  home: ev.home && { id: ev.home.id, name: ev.home.name, short: ev.home.short, abbr: ev.home.abbr, logo: ev.home.logo, score: ev.home.score, form: ev.home.form },
  away: ev.away && { id: ev.away.id, name: ev.away.name, short: ev.away.short, abbr: ev.away.abbr, logo: ev.away.logo, score: ev.away.score, form: ev.away.form },
  odds: ev.state !== "post" && ev.odds ? { provider: ev.odds.provider, home: ev.odds.home, draw: ev.odds.draw, away: ev.odds.away } : undefined,
});

// The day's top picks: the 10 strongest priced picks of each day (weak leagues left out), ranked
// by chance of landing. Live and finished games keep the pick saved before kick-off, so a top pick
// stays the same pick once the match is under way.
export const TOP_PER_DAY = 10;
export function topPicks(rows, saved = new Map()) {
  const byDay = new Map();
  for (const { ev, analysis } of rows) {
    if (ev.postponed) continue;
    const s = ev.state !== "pre" ? saved.get(ev.id) : null;
    const p = s ? { key: s.pick_key, label: s.pick_label, odds: s.pick_odds, safe: s.pick_safe, tier: s.pick_tier, estimated: s.pick_est } : analysis?.pick;
    if (!p?.key || p.estimated || !p.odds || !(p.tier === "High" || p.tier === "Med-High") || p.ls === "weak") continue;
    const day = String(ev.date).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push({ id: ev.id, p });
  }
  const top = new Map();
  for (const list of byDay.values()) {
    list.sort((a, b) => (b.p.safe ?? 0) - (a.p.safe ?? 0) || b.p.odds - a.p.odds);
    list.slice(0, TOP_PER_DAY).forEach(({ id, p }, i) => top.set(id, { key: p.key, label: p.label, odds: p.odds, safe: r3(p.safe), tier: p.tier, rank: i + 1 }));
  }
  return top;
}

export async function boardForClient(days = 2) {
  const rows = await analysedBoard(days);
  // live and finished games: the pick the engine saved before kick-off (with its result)
  const saved = await remember("savedPicks", 60e3, () => picksFor(rows.filter((r) => r.ev.state !== "pre").map((r) => r.ev.id)));
  const top = topPicks(rows, saved);
  return rows.map(({ ev, analysis }) => {
    const out = { ...slim(ev), a: brief(analysis) };
    if (top.has(ev.id)) out.top = top.get(ev.id);
    const s = ev.state === "post" && saved.get(ev.id);
    if (s) out.done = { label: s.pick_label, odds: s.pick_odds, tier: s.pick_tier, estimated: s.pick_est, result: s.pick_result };
    return out;
  });
}
