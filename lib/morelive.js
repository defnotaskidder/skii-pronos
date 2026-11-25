// More live games: a second live-score source for the competitions ESPN does not carry (UEFA Youth
// League, national cups, lower divisions, reserves…). API-Football (api-sports.io) answers every
// game in play in the world in one call. Scores only: no pick on these games, never a coupon leg.
//
// The free plan allows 100 calls a day. So: one call per slot of API_FOOTBALL_MIN minutes (15 by
// default: 96 a day at most), made only when somebody asks for the list, claimed in the database
// so several server instances never call twice for the same slot, and the answer shared through
// skii_cache. Without API_FOOTBALL_KEY the whole thing is off.
import { cacheGet, cacheSet, dbEnabled, sentOnce } from "./db";

const BASE = "https://v3.football.api-sports.io";
const IN_PLAY = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);
const KEY = "af:live";
export const moreLiveEnabled = () => !!process.env.API_FOOTBALL_KEY;
const every = () => Math.min(120, Math.max(2, Number(process.env.API_FOOTBALL_MIN) || 15)) * 60e3;

// API-Football's answer → the few fields the list shows. Throws on an error answer (bad key, quota).
export function parseFixtures(d) {
  const errs = d?.errors && (Array.isArray(d.errors) ? d.errors : Object.values(d.errors));
  if (errs?.length) throw new Error(String(errs[0]).slice(0, 160));
  const out = [];
  for (const f of d?.response || []) {
    const st = f?.fixture?.status?.short;
    if (!IN_PLAY.has(st) || !f.teams?.home?.name || !f.teams?.away?.name) continue;
    out.push({
      id: `af${f.fixture.id}`, date: f.fixture.date, status: st, minute: f.fixture.status.elapsed ?? null,
      league: f.league?.name || "", country: f.league?.country || "", round: f.league?.round || "",
      home: f.teams.home.name, away: f.teams.away.name, hs: f.goals?.home ?? 0, as: f.goals?.away ?? 0,
    });
  }
  return out;
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

// ---- the call, at most one per slot, shared by every instance ----
async function fetchLive() {
  const res = await fetch(`${BASE}/fixtures?live=all`, { cache: "no-store", headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY, accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  const left = Number(res.headers.get("x-ratelimit-requests-remaining"));
  const d = await res.json().catch(() => null);
  if (!d) throw new Error(`API-Football ${res.status}`);
  return { at: Date.now(), games: parseFixtures(d), remaining: Number.isFinite(left) ? left : null };
}
const mem = () => globalThis.__skiiMoreLive || null;
const keep = (v) => (globalThis.__skiiMoreLive = v);

// Every game in play in the second source: { configured, at, games, remaining, error? }.
export async function moreLive() {
  if (!moreLiveEnabled()) return { configured: false, at: null, games: [] };
  const ttl = every(), now = Date.now();
  const fresh = (v) => v && now - v.at < ttl;
  if (fresh(mem())) return { configured: true, ...mem() };
  const snap = dbEnabled() ? (await cacheGet(KEY).catch(() => null))?.value : null; // another instance may have refreshed it
  if (fresh(snap)) return { configured: true, ...keep(snap) };
  const last = snap || mem() || { at: null, games: [] };
  // the day's budget is spent: wait for tomorrow (the counter resets at 00:00 UTC)
  if (last.remaining !== null && last.remaining !== undefined && last.remaining <= 1 && last.at && new Date(last.at).getUTCDate() === new Date(now).getUTCDate()) return { configured: true, ...last, error: "daily quota reached" };
  // one instance per slot makes the call; without a database (local) the memory copy is the only guard
  const mine = dbEnabled() ? await sentOnce(`af-live-${Math.floor(now / ttl)}`) : true;
  if (!mine) return { configured: true, ...last };
  try {
    const v = await fetchLive();
    keep(v);
    if (dbEnabled()) await cacheSet(KEY, v);
    return { configured: true, ...v };
  } catch (e) {
    console.warn(`[morelive] ${e.message}`);
    // keep showing the last list (it says how old it is); try again at the next slot
    return { configured: true, ...keep({ ...last, at: last.at, failedAt: now }), error: e.message };
  }
}
