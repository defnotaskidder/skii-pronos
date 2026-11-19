// Corners and yellow cards for football: a count model on each team's season figures from ESPN's
// core API (corners won / conceded, yellow cards, games played). No bookmaker feed prices these
// markets for free, so every price here is an estimate (fair odds minus a typical margin, shown
// with ≈) — take one on 1xBet only at or above it. Kept to the bigger competitions (tier ≤ 2),
// where ESPN records the figures for every game, and to teams with enough games behind them.
import { LEAGUE_BY_ID } from "./leagues";
import { remember } from "./memo";
import { enrich } from "./model";
export { extraStats, EXTRA_KEY } from "./settle";

const UA = { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; SkiiPronos/1.0)" };
const MIN_GAMES = 5;
const PRIOR = { corners: 5.0, yellow: 2.0 }; // per team per game, the long-run European average
const K = 6; // games of prior: early-season figures are pulled toward the average
const DISP = { corners: 1.25, yellow: 1.2 }; // variance / mean (counts are a little wider than Poisson)

export const extrasLeague = (leagueId) => { const l = LEAGUE_BY_ID[leagueId]; return !!l && l.sport === "soccer" && !l.source && (l.tier ?? 9) <= 2; };

// One team's season figures (12 h cache). null when ESPN has none.
export async function teamExtras(leagueId, teamId, season) {
  if (!teamId || !season) return null;
  return remember(`extras:${leagueId}:${teamId}:${season}`, 12 * 3600e3, async () => {
    for (const type of [1, 2]) {
      try {
        const res = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueId}/seasons/${season}/types/${type}/teams/${teamId}/statistics`, { next: { revalidate: 12 * 3600 }, headers: UA });
        if (!res.ok) continue;
        const d = await res.json();
        const v = {};
        for (const c of d.splits?.categories || []) for (const s of c.stats || []) v[s.name] = s.value;
        if (!(v.appearances >= 1) || v.wonCorners === undefined) continue;
        return { games: v.appearances, cf: v.wonCorners, ca: v.lostCorners ?? null, yc: v.yellowCards ?? null };
      } catch { /* next type */ }
    }
    return null;
  });
}

// Figures for every upcoming game of the covered leagues: Map(eventId → { home, away }).
export async function extrasContext(events, pool) {
  const evs = events.filter((e) => e.state === "pre" && extrasLeague(e.league) && e.season && e.home?.id && e.away?.id);
  const keys = [...new Set(evs.flatMap((e) => [`${e.league}|${e.home.id}|${e.season}`, `${e.league}|${e.away.id}|${e.season}`]))];
  const got = new Map();
  await pool(keys, 4, async (k) => { const [lg, id, season] = k.split("|"); got.set(k, await teamExtras(lg, id, season).catch(() => null)); });
  const out = new Map();
  for (const e of evs) {
    const home = got.get(`${e.league}|${e.home.id}|${e.season}`), away = got.get(`${e.league}|${e.away.id}|${e.season}`);
    if (home?.games >= MIN_GAMES && away?.games >= MIN_GAMES) out.set(e.id, { home, away });
  }
  return out;
}

// ---- the count model ----
const rate = (total, games, prior) => ((total ?? prior * games) + prior * K) / (games + K);
// negative binomial pmf with mean m and variance d·m
function pmf(m, d, max) {
  const out = new Array(max + 1).fill(0);
  if (d <= 1.001) { let p = Math.exp(-m); for (let k = 0; k <= max; k++) { out[k] = p; p *= m / (k + 1); } return out; }
  const r = m / (d - 1), q = 1 / d; // success prob q, P(k) = C(k+r-1,k) q^r (1-q)^k
  let p = Math.pow(q, r);
  for (let k = 0; k <= max; k++) { out[k] = p; p *= ((k + r) / (k + 1)) * (1 - q); }
  return out;
}
const tail = (dist, line) => dist.reduce((a, p, k) => a + (k > line ? p : 0), 0);
const conv = (a, b) => { const out = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; })); return out; };

export function extrasExpect(ex) {
  const { home: h, away: a } = ex;
  // corners: a side's own rate met with what its opponent concedes; home sides take a few more
  const ch = (rate(h.cf, h.games, PRIOR.corners) + rate(a.ca, a.games, PRIOR.corners)) / 2 * 1.06;
  const ca = (rate(a.cf, a.games, PRIOR.corners) + rate(h.ca, h.games, PRIOR.corners)) / 2 * 0.94;
  // yellow cards: each side's own rate; away sides are booked a little more
  const yh = rate(h.yc, h.games, PRIOR.yellow) * 0.95, ya = rate(a.yc, a.games, PRIOR.yellow) * 1.05;
  return { ch, ca, yh, ya };
}

// The extra markets of one game, enriched like the engine's own (fair odds, ≈ price, EV).
export function extraMarkets(ex, names) {
  const { ch, ca, yh, ya } = extrasExpect(ex);
  const H = names.home, A = names.away;
  const mk = (key, group, label, p) => enrich({ key, group, label, p: Math.round(p * 1e4) / 1e4, v: 0 });
  const dh = pmf(ch, DISP.corners, 22), da = pmf(ca, DISP.corners, 22), dc = conv(dh, da);
  const list = [];
  for (const L of [7.5, 8.5, 9.5, 10.5, 11.5]) { const o = tail(dc, L); list.push(mk(`CRO${L}`, "Corners", `Over ${L} corners`, o), mk(`CRU${L}`, "Corners", `Under ${L} corners`, 1 - o)); }
  for (const L of [3.5, 4.5, 5.5]) list.push(mk(`CRHO${L}`, "Corners", `${H} over ${L} corners`, tail(dh, L)), mk(`CRAO${L}`, "Corners", `${A} over ${L} corners`, tail(da, L)));
  let hw = 0, aw = 0;
  dh.forEach((x, i) => da.forEach((y, j) => { if (i > j) hw += x * y; else if (j > i) aw += x * y; }));
  // "most corners" as double chance (the tie loses nothing to the other side): home or level, away or level
  list.push(mk("CR1X", "Corners", `${H} most corners or level`, 1 - aw), mk("CRX2", "Corners", `${A} most corners or level`, 1 - hw));
  if (ex.home.yc !== null && ex.away.yc !== null) {
    const dy = conv(pmf(yh, DISP.yellow, 12), pmf(ya, DISP.yellow, 12));
    for (const L of [2.5, 3.5, 4.5, 5.5]) { const o = tail(dy, L); list.push(mk(`YCO${L}`, "Cards", `Over ${L} yellow cards`, o), mk(`YCU${L}`, "Cards", `Under ${L} yellow cards`, 1 - o)); }
  }
  return { list, expect: { corners: { home: Math.round(ch * 10) / 10, away: Math.round(ca * 10) / 10 }, yellow: { home: Math.round(yh * 10) / 10, away: Math.round(ya * 10) / 10 } } };
}

// Add the extra markets to an analysis (a copy: the cached analysis is shared).
export function withExtras(analysis, ev, ex) {
  if (!analysis?.markets?.length || !ex) return analysis;
  const names = { home: ev.home?.short || ev.home?.name || "Home", away: ev.away?.short || ev.away?.name || "Away" };
  const { list, expect } = extraMarkets(ex, names);
  return { ...analysis, markets: [...analysis.markets, ...list], extras: expect };
}
