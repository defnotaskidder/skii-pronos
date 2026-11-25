// More live games: a second live-score source for the competitions ESPN does not carry (UEFA Youth
// League, national cups such as the Russian Cup, lower divisions, reserves…). API-Football
// (api-sports.io) answers every game in play in the world in one call, and in a second call the
// bookmaker's in-play prices for the games it prices (about half of them). The Live page shows these
// games among its own; a game with in-play prices gets a pick read off those real prices.
// They are not in the engine: no match page, never a coupon leg.
//
// The free plan allows 100 calls a day (the count resets at 00:00 UTC), and a refresh costs two.
// A refresh happens only when somebody asks for the list, and a reading is kept for as long as the
// day's budget allows: the calls left today spread over the time left today, never under 3 minutes.
// API_FOOTBALL_MIN sets a fixed number of minutes instead. A refresh is claimed in the database so
// several server instances never make it twice, and the answer is shared through skii_cache.
// Without API_FOOTBALL_KEY it is all off.
import { cacheGet, cacheSet, dbEnabled, sentOnce } from "./db";

const BASE = "https://v3.football.api-sports.io";
const IN_PLAY = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);
const KEY = "af:live2";
const MIN_GAP = 3 * 60e3, DAY_CALLS = 100, PER_REFRESH = 2;
export const moreLiveEnabled = () => !!process.env.API_FOOTBALL_KEY;
const sameUtcDay = (a, b) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

// How long the last reading is kept before a new one is worth two of the day's calls.
export function paceFor(last, now) {
  const fixed = Number(process.env.API_FOOTBALL_MIN);
  if (fixed > 0) return Math.min(120, Math.max(2, fixed)) * 60e3;
  // calls left: what the source said with its last answer, or a fresh day's worth
  const left = last?.at && sameUtcDay(last.at, now) && Number.isFinite(last.remaining) ? last.remaining : DAY_CALLS;
  const end = new Date(now); end.setUTCHours(24, 0, 0, 0);
  const refreshes = Math.max(1, (left - 6) / PER_REFRESH); // six calls kept in hand
  return Math.min(60 * 60e3, Math.max(MIN_GAP, (end.getTime() - now) / refreshes));
}

// Under-17 tournaments are left out (asked for on 25 Nov 2026: the Live page is for games people bet on)
const U17 = /\bu-?17\b|under[- ]?17/i;

// API-Football's answer → the few fields the page shows. Throws on an error answer (bad key, quota).
export function parseFixtures(d) {
  const errs = d?.errors && (Array.isArray(d.errors) ? d.errors : Object.values(d.errors));
  if (errs?.length) throw new Error(String(errs[0]).slice(0, 160));
  const out = [];
  for (const f of d?.response || []) {
    const st = f?.fixture?.status?.short;
    if (!IN_PLAY.has(st) || !f.teams?.home?.name || !f.teams?.away?.name) continue;
    if (U17.test(`${f.league?.name} ${f.teams.home.name} ${f.teams.away.name}`)) continue;
    out.push({
      id: `af${f.fixture.id}`, date: f.fixture.date, status: st, minute: f.fixture.status.elapsed ?? null,
      league: f.league?.name || "", country: f.league?.country || "", round: f.league?.round || "",
      home: f.teams.home.name, away: f.teams.away.name, homeLogo: f.teams.home.logo || null, awayLogo: f.teams.away.logo || null,
      hs: f.goals?.home ?? 0, as: f.goals?.away ?? 0,
    });
  }
  return out;
}

// ---- the pick of a game with in-play prices ----
// Real bookmaker prices, read with the score: 1X2, double chance, total goals (half-lines), both
// teams to score. Each market's chances are its own prices with the margin taken out. The pick is
// the likeliest bet priced between 1.25 and 1.65 (the band of the OP "safe" pick), from the 5th to
// the 80th minute; no pick when the bookmaker has stopped the game or nothing sits in the band.
const BAND = [1.25, 1.65];
export function livePick(o, g) {
  if (!o || o.status?.stopped || o.status?.blocked || o.status?.finished) return null;
  if (!["1H", "HT", "2H"].includes(g.status) || !(g.minute >= 5 && g.minute <= 80)) return null;
  const market = (name) => (o.odds || []).find((m) => m.name === name);
  const price = (m, value) => { const v = (m?.values || []).find((x) => x.value === value); const n = v && !v.suspended ? Number(v.odd) : NaN; return n > 1 ? n : null; };
  const c = [];
  const ft = market("Fulltime Result"), H = price(ft, "Home"), D = price(ft, "Draw"), A = price(ft, "Away");
  if (H && D && A) {
    const s = 1 / H + 1 / D + 1 / A, ph = 1 / H / s, pd = 1 / D / s, pa = 1 / A / s;
    c.push({ key: "1", label: `${g.home} win`, odds: H, p: ph }, { key: "2", label: `${g.away} win`, odds: A, p: pa });
    const dc = market("Double Chance");
    for (const [value, key, label, p] of [["Home or Draw", "1X", `${g.home} or draw`, ph + pd], ["Away or Draw", "X2", `${g.away} or draw`, pa + pd], ["Home or Away", "12", "No draw", ph + pa]]) {
      const odds = price(dc, value);
      if (odds) c.push({ key, label, odds, p });
    }
  }
  // total goals: every half-line offered (2.5, 3.5…), over and under read as a pair
  const lines = new Map();
  for (const m of [market("Over/Under Line"), market("Match Goals")]) for (const v of m?.values || []) {
    const line = Number(v.handicap), odds = Number(v.odd);
    if (!Number.isFinite(line) || Math.abs(line % 1) !== 0.5 || v.suspended || !(odds > 1)) continue;
    const k = lines.get(line) || {};
    if (!k[v.value]) k[v.value] = odds;
    lines.set(line, k);
  }
  for (const [line, k] of lines) if (k.Over && k.Under) {
    const s = 1 / k.Over + 1 / k.Under;
    c.push({ key: `O${line}`, label: `Over ${line}`, odds: k.Over, p: 1 / k.Over / s }, { key: `U${line}`, label: `Under ${line}`, odds: k.Under, p: 1 / k.Under / s });
  }
  const bt = market("Both Teams to Score"), Y = price(bt, "Yes"), N = price(bt, "No");
  if (Y && N) { const s = 1 / Y + 1 / N; c.push({ key: "BTTS_Y", label: "BTTS — Yes", odds: Y, p: 1 / Y / s }, { key: "BTTS_N", label: "BTTS — No", odds: N, p: 1 / N / s }); }
  const best = c.filter((x) => x.odds >= BAND[0] && x.odds <= BAND[1]).sort((a, b) => b.p - a.p)[0];
  return best ? { key: best.key, label: best.label, odds: Math.round(best.odds * 100) / 100, p: Math.round(best.p * 1000) / 1000 } : null;
}
// The in-play prices joined to the games: sets `priced` and `pick` on each game the bookmaker prices.
export function withPicks(games, oddsAnswer) {
  const errs = oddsAnswer?.errors && (Array.isArray(oddsAnswer.errors) ? oddsAnswer.errors : Object.values(oddsAnswer.errors));
  if (!oddsAnswer || errs?.length) return games;
  const byId = new Map((oddsAnswer.response || []).map((o) => [`af${o.fixture?.id}`, o]));
  return games.map((g) => { const o = byId.get(g.id); return o ? { ...g, priced: true, pick: livePick(o, g) } : g; });
}

// ---- is this game already on the site (ESPN's feed)? Team names differ between the two sources ----
const strip = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// a youth, reserve or women's side is never the same team as the senior one
const marker = (s) => { const m = strip(s).match(/\b(u ?\d{2}|ii|iii|women|reserves?|youth)\b|\s(w|b)$/); return m ? m[0].replace(/\s/g, "") : ""; };
const STOP = new Set(["afc", "the", "del", "des", "der", "van", "den", "los", "las", "club"]);
const GENERIC = new Set(["real", "city", "united", "sporting", "athletic", "atletico", "deportivo", "inter", "dynamo", "dinamo", "olympique", "racing", "union", "national", "nacional", "sport", "rovers", "town", "county", "saint", "san", "santa", "royal", "young", "boys", "stars", "rangers", "wanderers", "academy", "football"]);
const toks = (s) => strip(s).split(" ").filter((t) => t.length >= 3 && !STOP.has(t) && !/^u\d{2}$/.test(t));
// 0 = different, 1 = probably the same, 2 = the same
export function sameTeam(a, b) {
  if (marker(a) !== marker(b)) return 0;
  const A = toks(a), B = toks(b);
  const like = (t, u) => t === u || (t.length >= 5 && u.length >= 5 && t.slice(0, 5) === u.slice(0, 5));
  const shared = A.filter((t) => B.some((u) => like(t, u)));
  const own = shared.filter((t) => !GENERIC.has(t));
  if (own.some((t) => t.length >= 5)) return 2;
  if (own.length) return 1;
  return shared.length >= 2 ? 1 : 0;
}
// The games of `games` that are not on the board (`events`: ESPN events with date, home, away).
export function withoutKnown(games, events) {
  const known = (events || []).filter((e) => e?.home && e?.away && e.date).map((e) => ({ t: new Date(e.date).getTime(), h: [e.home.name, e.home.short], a: [e.away.name, e.away.short] }));
  const best = (name, list) => Math.max(0, ...list.filter(Boolean).map((x) => sameTeam(name, x)));
  // one side alone settles it only when it is the very same name (Manchester City is not Manchester United)
  const exact = (name, list) => list.filter(Boolean).some((x) => marker(name) === marker(x) && toks(name).sort().join(" ") === toks(x).sort().join(" ") && toks(name).length > 0);
  return games.filter((g) => {
    const t = new Date(g.date).getTime();
    return !known.some((k) => {
      if (Math.abs(k.t - t) > 20 * 60e3) return false; // same kick-off, give or take
      return (best(g.home, k.h) >= 1 && best(g.away, k.a) >= 1) || exact(g.home, k.h) || exact(g.away, k.a);
    });
  });
}

// ---- the refresh: two calls, at most once per reading, shared by every instance ----
async function call(path) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY, accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  const left = Number(res.headers.get("x-ratelimit-requests-remaining"));
  const d = await res.json().catch(() => null);
  if (!d) throw new Error(`API-Football ${res.status}`);
  return { d, left: Number.isFinite(left) ? left : null };
}
async function fetchLive() {
  // the prices are a bonus: without them the games still show, with no pick
  const [fx, od] = await Promise.all([call("/fixtures?live=all"), call("/odds/live").catch(() => null)]);
  const games = withPicks(parseFixtures(fx.d), od?.d);
  const lefts = [fx.left, od?.left].filter((x) => Number.isFinite(x));
  return { at: Date.now(), games, remaining: lefts.length ? Math.min(...lefts) : null };
}
const mem = () => globalThis.__skiiMoreLive || null;
const keep = (v) => (globalThis.__skiiMoreLive = v);

// Every game in play in the second source: { configured, at, games, remaining, error? }.
export async function moreLive() {
  if (!moreLiveEnabled()) return { configured: false, at: null, games: [] };
  const now = Date.now();
  const fresh = (v) => v?.at && now - v.at < paceFor(v, now);
  if (fresh(mem())) return { configured: true, ...mem() };
  const snap = dbEnabled() ? (await cacheGet(KEY).catch(() => null))?.value : null; // another instance may have refreshed it
  if (fresh(snap)) return { configured: true, ...keep(snap) };
  const last = snap || mem() || { at: null, games: [] };
  // the day's budget is spent: wait for tomorrow
  if (Number.isFinite(last.remaining) && last.remaining <= PER_REFRESH && last.at && sameUtcDay(last.at, now)) return { configured: true, ...last, error: "daily quota reached" };
  // one instance makes the refresh (never two within three minutes); without a database (local) the memory copy is the only guard
  const mine = dbEnabled() ? await sentOnce(`af-live-${Math.floor(now / MIN_GAP)}`) : true;
  if (!mine) return { configured: true, ...last };
  try {
    const v = await fetchLive();
    keep(v);
    if (dbEnabled()) await cacheSet(KEY, v);
    return { configured: true, ...v };
  } catch (e) {
    console.warn(`[morelive] ${e.message}`);
    // keep showing the last list (it says how old it is); try again later
    return { configured: true, ...keep({ ...last, failedAt: now }), error: e.message };
  }
}
