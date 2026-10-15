// Server-side: every league's fixtures + a model verdict on each match.
import { board as espnBoard, standings, pool } from "./espn";
import { analyse } from "./model";
import { LEAGUE_BY_ID, isSoccer } from "./leagues";
import { syncBoard, picksFor } from "./db";

// Short per-process memo on top of Next's data cache. Shared by every route (globalThis),
// one in-flight computation per key, and the last good value survives an upstream outage.
const memo = globalThis.__skiiMemo || (globalThis.__skiiMemo = new Map());
export async function remember(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit?.value !== undefined && Date.now() - hit.at < ttlMs) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = (async () => {
    try {
      const value = await fn();
      memo.set(key, { at: Date.now(), value });
      return value;
    } catch (e) {
      if (hit?.value !== undefined) { memo.set(key, { at: Date.now() - ttlMs / 2, value: hit.value }); return hit.value; }
      memo.delete(key);
      throw e;
    }
  })();
  memo.set(key, { ...hit, pending });
  return pending;
}

// League tables feed the stats half of the model. Fetched gently (4 at a time) and kept for
// hours; youth/college competitions are skipped.
export async function tablesFor(leagueIds) {
  const ids = [...new Set(leagueIds)].filter((id) => isSoccer(id) && (LEAGUE_BY_ID[id]?.tier ?? 9) <= 5);
  const out = {};
  await pool(ids, 4, async (id) => { out[id] = await remember(`table:${id}`, 6 * 3600e3, () => standings(id)).catch(() => ({})); });
  return out;
}

// Re-analyse a match only when its odds, form or table changed.
const cache = globalThis.__skiiAnalysis || (globalThis.__skiiAnalysis = new Map());
function analyseCached(ev, table) {
  const sig = JSON.stringify([ev.odds, ev.home?.form, ev.away?.form, ev.home?.id, ev.away?.id, Object.keys(table).length]);
  const hit = cache.get(ev.id);
  if (hit && hit.sig === sig) return hit.a;
  const a = analyse(ev, table);
  cache.set(ev.id, { sig, a });
  if (cache.size > 6000) cache.delete(cache.keys().next().value);
  return a;
}

const brief = (a) => a && ({
  quality: a.quality, probs: a.probs, xg: a.xg || null,
  pick: a.pick && { key: a.pick.key, label: a.pick.label, odds: a.pick.odds, p: a.pick.p, safe: a.pick.safe, ev: a.pick.ev, tier: a.pick.tier, estimated: a.pick.estimated },
  value: a.value && { key: a.value.key, label: a.value.label, odds: a.value.odds, p: a.value.p, ev: a.value.ev, tier: a.value.tier },
});

// Full analyses kept server-side for the coupon builder; the client gets the brief version.
// Each refresh also saves pre-match picks to the database and grades finished games.
export async function analysedBoard(days = 2) {
  return remember(`board:${days}`, 20e3, async () => {
    const events = await espnBoard(days);
    const upcoming = events.filter((e) => e.state !== "post");
    const tables = await tablesFor(upcoming.map((e) => e.league));
    const rows = events.map((ev) => ({ ev, analysis: ev.state === "post" || ev.postponed ? null : analyseCached(ev, tables[ev.league] || {}) }));
    await syncBoard(rows);
    return rows;
  });
}

// Light event shape for the browser (no venue/colours/records).
const slim = (ev) => ({
  id: ev.id, league: ev.league, sport: ev.sport, date: ev.date, state: ev.state, completed: ev.completed, detail: ev.detail,
  clock: ev.clock, minute: ev.minute, period: ev.period, postponed: ev.postponed, reds: ev.reds, note: ev.note || undefined,
  home: ev.home && { id: ev.home.id, name: ev.home.name, short: ev.home.short, abbr: ev.home.abbr, logo: ev.home.logo, score: ev.home.score, form: ev.home.form },
  away: ev.away && { id: ev.away.id, name: ev.away.name, short: ev.away.short, abbr: ev.away.abbr, logo: ev.away.logo, score: ev.away.score, form: ev.away.form },
  odds: ev.odds && { provider: ev.odds.provider, home: ev.odds.home, draw: ev.odds.draw, away: ev.odds.away },
});

export async function boardForClient(days = 2) {
  const rows = await analysedBoard(days);
  // finished games: show the pick the engine saved before kick-off, with its result
  const saved = await remember("finishedPicks", 60e3, () => picksFor(rows.filter((r) => r.ev.state === "post").map((r) => r.ev.id)));
  return rows.map(({ ev, analysis }) => {
    const out = { ...slim(ev), a: brief(analysis) };
    const s = ev.state === "post" && saved.get(ev.id);
    if (s) out.done = { label: s.pick_label, odds: s.pick_odds, tier: s.pick_tier, estimated: s.pick_est, result: s.pick_result };
    return out;
  });
}
