// Server-side: every league's fixtures + a model verdict on each match.
import { board as espnBoard, standings } from "./espn";
import { analyse } from "./model";
import { isSoccer } from "./leagues";

// Short per-process memo on top of Next's data cache. Shared by every route (globalThis),
// one in-flight computation per key, and the last good value survives an upstream outage.
const memo = globalThis.__skiiMemo || (globalThis.__skiiMemo = new Map());
async function remember(key, ttlMs, fn) {
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

export async function tablesFor(leagueIds) {
  const ids = [...new Set(leagueIds)].filter(isSoccer);
  const out = {};
  await Promise.all(ids.map(async (id) => { out[id] = await remember(`table:${id}`, 30 * 60e3, () => standings(id)); }));
  return out;
}

const brief = (a) => a && ({
  quality: a.quality, probs: a.probs, xg: a.xg || null,
  pick: a.pick && { key: a.pick.key, label: a.pick.label, odds: a.pick.odds, p: a.pick.p, safe: a.pick.safe, ev: a.pick.ev, tier: a.pick.tier, estimated: a.pick.estimated },
  value: a.value && { key: a.value.key, label: a.value.label, odds: a.value.odds, p: a.value.p, ev: a.value.ev, tier: a.value.tier },
});

// Full analyses kept server-side for the coupon builder; the client gets the brief version.
export async function analysedBoard(days = 2) {
  return remember(`board:${days}`, 20e3, async () => {
    const events = await espnBoard(days);
    const upcoming = events.filter((e) => e.state !== "post");
    const tables = await tablesFor(upcoming.map((e) => e.league));
    return events.map((ev) => ({ ev, analysis: ev.state === "post" || ev.postponed ? null : analyse(ev, tables[ev.league] || {}) }));
  });
}

export async function boardForClient(days = 2) {
  const rows = await analysedBoard(days);
  return rows.map(({ ev, analysis }) => ({ ...ev, a: brief(analysis) }));
}
