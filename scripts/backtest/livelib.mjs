// Replays finished games minute by minute through the site's own live model.
// Needs livetimes.json (livepull.mjs). Run with:  node --import ./lib-register.mjs <script>
import fs from "node:fs";
import { liveAnalyse, fitGoals } from "../../lib/model.js";
import { liveMarkets } from "../../lib/livecoupon.js";

export const CHECKS = [10, 20, 30, 40, "HT", 50, 55, 60, 65, 70, 75, 80];
const minuteOf = (c) => { const m = String(c).match(/^(\d+)'?(?:\+(\d+))?/); return m ? { base: +m[1], add: +(m[2] || 0) } : null; };

// Games whose goal list reproduces the final score, each goal on its side (an own goal is listed
// under either side depending on the feed: both readings are tried). Extra-time games are left out.
export function loadGames() {
  const raw = JSON.parse(fs.readFileSync(new URL("./livetimes.json", import.meta.url), "utf8"));
  const out = [];
  let bad = 0, et = 0;
  for (const g of raw) {
    if (!g.home || !g.away) { bad++; continue; }
    const evs = g.ev.map((e) => ({ ...e, m: minuteOf(e.c) })).filter((e) => e.m && e.p);
    if (evs.length !== g.ev.length) { bad++; continue; }
    if (evs.some((e) => e.p > 2)) { et++; continue; }
    const build = (flip) => evs.map((e) => { let side = e.team === g.home ? "h" : e.team === g.away ? "a" : null; if (side && flip && e.g && /own/i.test(e.t)) side = side === "h" ? "a" : "h"; return { ...e, side }; });
    const fits = (l) => l.every((e) => e.side) && l.filter((e) => e.g && e.side === "h").length === g.hs && l.filter((e) => e.g && e.side === "a").length === g.as;
    const list = [build(false), build(true)].find(fits);
    if (!list) { bad++; continue; }
    const f = fitGoals(g.probs, null);
    out.push({ ...g, list, pre: { xg: { home: f.lh, away: f.la } } });
  }
  return { games: out, bad, et, raw: raw.length };
}

// The game as the live feed would show it at a check point (everything before that minute).
export function stateAt(g, at) {
  const P = at === "HT" || at <= 45 ? 1 : 2, m = at === "HT" ? 99 : at;
  const before = g.list.filter((e) => e.p < P || (e.p === P && e.m.base < m));
  const n = (side, goal) => before.filter((e) => e.side === side && (goal ? e.g : !e.g)).length;
  return { id: g.id, sport: "soccer", state: "in", league: g.league, minute: at === "HT" ? 45 : at, period: at === "HT" ? 2 : P, detail: at === "HT" ? "HT" : `${at}'`,
    home: { short: "H", score: n("h", true) }, away: { short: "A", score: n("a", true) }, reds: { home: n("h", false), away: n("a", false) } };
}

export function won(key, hs, as) {
  let m;
  if (key === "1") return hs > as; if (key === "X") return hs === as; if (key === "2") return hs < as;
  if (key === "1X") return hs >= as; if (key === "X2") return hs <= as; if (key === "12") return hs !== as;
  if (key === "BTTS_Y") return hs > 0 && as > 0; if (key === "BTTS_N") return !(hs > 0 && as > 0);
  if ((m = key.match(/^([OU])(\d+(?:\.\d+)?)$/))) return m[1] === "O" ? hs + as > +m[2] : hs + as < +m[2];
  if ((m = key.match(/^([HA])O(\d+(?:\.\d+)?)$/))) return (m[1] === "H" ? hs : as) > +m[2];
  throw new Error("no grader for " + key);
}

// Every market of every replayed check point: { g, at, ev, key, group, p, y, ... }.
export function replay(games, checks = CHECKS, tune = undefined) {
  const rows = [];
  for (const g of games) for (const at of checks) {
    const ev = stateAt(g, at);
    const L = liveAnalyse(ev, g.pre, {}, tune);
    if (!L?.probs) continue;
    const hs = ev.home.score, as = ev.away.score;
    for (const m of liveMarkets(ev, L)) rows.push({ g, at, ev, key: m.key, group: m.group, p: m.p, y: won(m.key, g.hs, g.as) ? 1 : 0, lead: hs - as, total: hs + as, reds: ev.reds.home + ev.reds.away, L });
  }
  return rows;
}

export const mean = (l) => l.reduce((a, b) => a + b, 0) / (l.length || 1);
// said → happened for a set of rows, with a standard error that counts a game once (its check
// points are not independent)
export function line(rows) {
  if (!rows.length) return null;
  const by = new Map();
  for (const r of rows) { const x = by.get(r.g.id) || 0; by.set(r.g.id, x + (r.y - r.p)); }
  const se = Math.sqrt([...by.values()].reduce((a, x) => a + x * x, 0)) / rows.length;
  const p = mean(rows.map((r) => r.p)), y = mean(rows.map((r) => r.y));
  return { n: rows.length, games: by.size, p, y, gap: y - p, se };
}
export const show = (name, rows, w = 30) => { const l = line(rows); console.log(String(name).padEnd(w), l ? `n ${String(l.n).padStart(6)} games ${String(l.games).padStart(5)} | said ${(l.p * 100).toFixed(1)} → won ${(l.y * 100).toFixed(1)} | gap ${(l.gap * 100 >= 0 ? "+" : "") + (l.gap * 100).toFixed(1)} ±${(l.se * 100).toFixed(1)}` : "none"); };
