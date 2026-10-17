// Second fixtures source: The Odds API, for the hockey leagues ESPN doesn't carry (SHL,
// HockeyAllsvenskan, Liiga, Mestis, AHL…). Each league entry in lib/leagues.js with
// `source: "oddsapi"` names the sport keys to look for; this module turns the feed's
// /odds (upcoming games with prices) and /scores (results of the last three days) into events
// of the same shape lib/espn.js produces, so the board, the hockey engine, the database and
// the ratings treat them like NHL games. Every call costs credits, so:
//   • /sports (free) tells which leagues are in season — nothing is fetched for the others;
//   • prices are cached ODDS_HOCKEY_MIN minutes (default ODDS_CACHE_MIN = 30), 1 credit per
//     market per call (ODDS_HOCKEY_MARKETS, default h2h,totals → 2 credits);
//   • results (2 credits) are fetched every ODDS_SCORES_MIN minutes (default 15) while a game
//     that has started still waits for its final score, else every ODDS_SWEEP_MIN (default 360)
//     so every finished game still reaches the ratings;
//   • a failing call never breaks the board (the last good answer is kept).
// The results feed gives final scores only — how a game ended (regulation, OT, shootout) is
// unknown, so 60-minute and overtime markets are shown for information and never picked.
import { oddsApi, oddsEnabled, regions, bookmakerPrefs, lastQuota } from "./odds";
import { LEAGUES, LEAGUE_BY_ID } from "./leagues";
import { remember } from "./memo";
import { withDb, dbEnabled } from "./db";

export const OA_LEAGUES = LEAGUES.filter((l) => l.source === "oddsapi");
export const isOddsApiLeague = (id) => LEAGUE_BY_ID[id]?.source === "oddsapi";

const minutes = (name, dflt) => Math.max(5, Number(process.env[name]) || dflt);
const oddsTtl = () => minutes("ODDS_HOCKEY_MIN", Number(process.env.ODDS_CACHE_MIN) || 30) * 60; // seconds
const scoresTtl = () => minutes("ODDS_SCORES_MIN", 15) * 60;
const sweepTtl = () => minutes("ODDS_SWEEP_MIN", 360) * 60; // results sweep when nothing is pending (finished games feed the ratings)
const marketList = () => (process.env.ODDS_HOCKEY_MARKETS || "h2h,totals").replace(/\s+/g, "");
const DAYS_BACK = 3; // the /scores endpoint keeps results this long

export function enabledLeagues() {
  if (!oddsEnabled()) return [];
  const env = (process.env.ODDS_HOCKEY_LEAGUES || "").split(",").map((s) => s.trim()).filter(Boolean);
  return env.length ? OA_LEAGUES.filter((l) => env.includes(l.id)) : OA_LEAGUES;
}

// Sport keys the feed has in season right now (/sports costs nothing; kept six hours).
async function activeKeys() {
  return remember("oa:sports", 6 * 3600e3, async () => {
    const { data } = await oddsApi("/sports", {}, { ttl: 6 * 3600 });
    const keys = new Set((Array.isArray(data) ? data : []).filter((s) => s.active && !s.has_outrights).map((s) => s.key));
    const known = new Set(OA_LEAGUES.flatMap((l) => l.oa || [l.odds]));
    const extra = [...keys].filter((k) => k.startsWith("icehockey_") && !known.has(k) && k !== "icehockey_nhl");
    if (extra.length) console.warn(`[oddsapi] hockey leagues on the feed but not in lib/leagues.js: ${extra.join(", ")}`);
    return keys;
  });
}
async function sportKey(l) {
  const keys = await activeKeys();
  return (l.oa || [l.odds]).find((k) => keys.has(k)) || null;
}

// ---------- raw feed calls (one per league per cache window) ----------
// The last ODDS_RESERVE credits (default 100) are kept for the bookmaker comparison panel: once
// the feed reports fewer, these leagues stop refreshing (the last good answer stays on show).
function guardCredits() {
  const left = Number(lastQuota()?.remaining);
  const reserve = Math.max(0, Number(process.env.ODDS_RESERVE ?? 100));
  if (Number.isFinite(left) && left < reserve) throw new Error(`credit reserve reached (${left} left, reserve ${reserve})`);
}
// Upcoming games with every bookmaker's prices. Also serves the bookmaker comparison panel.
export async function rawOdds(leagueId) {
  const l = LEAGUE_BY_ID[leagueId];
  if (!l?.source) return [];
  const key = await sportKey(l);
  if (!key) return [];
  const ttl = oddsTtl();
  return remember(`oa:odds:${leagueId}`, ttl * 1000, async () => {
    guardCredits();
    const { data, quota } = await oddsApi(`/sports/${key}/odds`, { regions: regions(), markets: marketList(), oddsFormat: "decimal", dateFormat: "iso" }, { ttl });
    const list = Array.isArray(data) ? data : [];
    console.log(`[oddsapi] ${leagueId}: ${list.length} priced games · ${quota.remaining ?? "?"} credits left`);
    return list;
  });
}
// Results of the last three days plus live and upcoming games (no prices). Refreshed every
// ODDS_SCORES_MIN while a started game awaits its score, else every ODDS_SWEEP_MIN.
async function rawScores(leagueId, pending) {
  const l = LEAGUE_BY_ID[leagueId];
  const key = await sportKey(l);
  if (!key) return [];
  const ttl = pending ? scoresTtl() : sweepTtl();
  return remember(`oa:scores:${leagueId}`, ttl * 1000, async () => {
    guardCredits();
    const { data, quota } = await oddsApi(`/sports/${key}/scores`, { daysFrom: DAYS_BACK, dateFormat: "iso" }, { ttl });
    const list = Array.isArray(data) ? data : [];
    console.log(`[oddsapi] ${leagueId}: ${list.filter((s) => s.completed).length} results · ${quota.remaining ?? "?"} credits left`);
    return list;
  });
}

// Games that have started and aren't known to be over: remembered per process (ids seen in the
// odds list) and, across instances, as open picks in the database. While there is one, the
// results feed is worth its credits every few minutes; otherwise only the slow sweep runs.
const started = globalThis.__skiiOaStarted || (globalThis.__skiiOaStarted = new Map()); // league → Map(event id → start ms)
const lastOdds = globalThis.__skiiOaLastOdds || (globalThis.__skiiOaLastOdds = new Map()); // event id → last prices seen (games drop off /odds once under way)
const openPicks = () => remember("oa:open", 5 * 60e3, async () => {
  if (!dbEnabled()) return new Map();
  const rows = await withDb("oaOpen", (sql) => sql`select league, count(*)::int as n from skii_picks
    where event_id like 'oa:%' and state <> 'post' and kickoff < now() and kickoff > now() - interval '3 days' group by league`, []);
  return new Map((rows || []).map((r) => [r.league, r.n]));
});
async function scoresNeeded(leagueId) {
  const now = Date.now();
  for (const [id, t] of started.get(leagueId) || []) {
    if (t < now - DAYS_BACK * 86400e3) started.get(leagueId).delete(id);
    else if (t <= now) return true;
  }
  return ((await openPicks().catch(() => new Map())).get(leagueId) || 0) > 0;
}

// ---------- normalisation to the ESPN event shape ----------
const r3 = (x) => Math.round(x * 1000) / 1000;
const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const SUFFIX = new Set(["hc", "if", "ik", "bk", "hk", "hf", "sk", "aik", "ihc", "ehc", "hockey", "club"]);
// "Frölunda HC" → "Frölunda", "IK Oskarshamn" → "Oskarshamn"; names without a club tag stay
function shortOf(name) {
  const w = String(name).trim().split(/\s+/);
  if (w.length >= 2 && SUFFIX.has(w.at(-1).toLowerCase())) return w.slice(0, -1).join(" ");
  if (w.length >= 2 && SUFFIX.has(w[0].toLowerCase())) return w.slice(1).join(" ");
  return name;
}
const abbrOf = (short) => slug(short).replace(/-/g, "").slice(0, 3).toUpperCase();
// Stable team ids from the name (the feed has no team ids): the ratings learn on them.
export const teamId = (leagueId, name) => `oa:${leagueId}:${slug(name)}`;
function team(leagueId, name, score, winner) {
  const short = shortOf(name);
  return { id: teamId(leagueId, name), name, short, abbr: abbrOf(short), logo: null, color: null, score, form: "", record: "", winner: !!winner };
}

// Prices from the preferred bookmakers (ODDS_BOOKMAKERS order, 1xBet first), each market from
// the first book that lists it. Hockey "h2h" on the feed is the moneyline incl. overtime and
// shootout at most books (Pinnacle, 888sport, Betsson…) but the 60-minute 1X2 at 1xBet and the
// French books (a Draw outcome): the moneyline comes from the first 2-way book; a 3-way book is
// used only when no 2-way one lists the game, its prices kept for the 60-minute markets and a
// derived moneyline guiding the fit only.
function readOdds(o) {
  const books = o.bookmakers || [];
  if (!books.length) return null;
  const prefs = bookmakerPrefs();
  const rank = (b) => { const i = prefs.indexOf(b.key); return i === -1 ? 99 : i; };
  const sorted = [...books].sort((a, b) => rank(a) - rank(b) || (b.markets?.length || 0) - (a.markets?.length || 0));
  const first = (mk, ok = () => true) => { for (const b of sorted) { const m = b.markets?.find((x) => x.key === mk && x.outcomes?.length && ok(x)); if (m) return { b, m }; } return null; };
  const out = { provider: sorted[0].title, home: null, away: null, draw: null, homeOpen: null, awayOpen: null, drawOpen: null, total: null, spread: null, books: books.length };
  const h2h = first("h2h", (m) => !m.outcomes.some((x) => x.name === "Draw")) || first("h2h");
  if (h2h) {
    const p = (name) => { const x = h2h.m.outcomes.find((y) => y.name === name)?.price; return x > 1 ? x : null; };
    const home = p(o.home_team), away = p(o.away_team), draw = p("Draw");
    out.provider = h2h.b.title;
    if (home && away && !draw) { out.home = home; out.away = away; }
    else if (home && away && draw) {
      out.extra = { R1: { price: home, book: h2h.b.title }, RX: { price: draw, book: h2h.b.title }, R2: { price: away, book: h2h.b.title } };
      const inv = [1 / home, 1 / draw, 1 / away], s = inv[0] + inv[1] + inv[2];
      const ph = inv[0] / s, pd = inv[1] / s, pa = inv[2] / s;
      const mh = ph + pd * (ph / (ph + pa)); // ties go to the stronger side in proportion
      out.home = r3(1 / (mh * 1.05)); out.away = r3(1 / ((1 - mh) * 1.05)); out.synthetic = true;
    }
  }
  const tot = first("totals");
  if (tot) {
    let best = null; // the main line: over and under priced closest to each other
    for (const pt of new Set(tot.m.outcomes.map((x) => x.point).filter(Number.isFinite))) {
      const over = tot.m.outcomes.find((x) => x.name === "Over" && x.point === pt)?.price, under = tot.m.outcomes.find((x) => x.name === "Under" && x.point === pt)?.price;
      if (over > 1 && under > 1 && (!best || Math.abs(over - under) < best.gap)) best = { line: pt, over, under, gap: Math.abs(over - under) };
    }
    if (best) out.total = { line: best.line, over: best.over, under: best.under, book: tot.b.title };
  }
  const sp = first("spreads");
  if (sp) {
    const hs = sp.m.outcomes.filter((x) => x.name === o.home_team), as = sp.m.outcomes.filter((x) => x.name === o.away_team);
    const h = hs.find((x) => Math.abs(x.point) === 1.5) || hs[0], a = h && as.find((x) => x.point === -h.point);
    if (h && a && h.price > 1 && a.price > 1) out.spread = { line: h.point, home: h.price, away: a.price, book: sp.b.title };
  }
  if (!out.home && !out.away && !out.total) return null;
  return out;
}

function normalize(leagueId, o, sc, now) {
  const src = sc || o;
  const t = new Date(src.commence_time).getTime();
  const completed = !!sc?.completed;
  const scoreOf = (name) => { const s = sc?.scores?.find((x) => x.name === name); const n = s ? Number(s.score) : NaN; return Number.isFinite(n) ? n : null; };
  const hs = scoreOf(src.home_team), as = scoreOf(src.away_team);
  let state = completed ? "post" : t <= now ? "in" : "pre";
  if (state === "in" && now - t > 5 * 3600e3) state = "post"; // never marked final by the feed: shown as over, without a result, not graded
  const done = completed && hs !== null && as !== null;
  return {
    id: `oa:${src.id}`, league: leagueId, sport: "hockey", source: "oddsapi", date: src.commence_time,
    season: undefined, seasonType: undefined,
    ot: null, endingKnown: false, // the results feed gives the final score only
    state, completed: done, detail: done ? "Final" : state === "in" ? "Live" : "", clock: "", minute: null, period: 0, postponed: false,
    home: team(leagueId, src.home_team, hs, done && hs > as), away: team(leagueId, src.away_team, as, done && as > hs),
    reds: { home: 0, away: 0 }, venue: "", note: "",
    odds: (o ? readOdds(o) : null) || lastOdds.get(src.id) || null,
  };
}

// Rest days from the games we know (results of the last three days, upcoming fixtures): 0 = the
// side played within 30 hours; null when its previous game is older than the feed shows.
function attachRest(evs) {
  const byTeam = new Map();
  for (const e of evs) for (const sd of ["home", "away"]) { const id = e[sd].id; if (!byTeam.has(id)) byTeam.set(id, []); byTeam.get(id).push(new Date(e.date).getTime()); }
  for (const list of byTeam.values()) list.sort((a, b) => a - b);
  for (const e of evs) {
    const t = new Date(e.date).getTime(), rest = {};
    for (const sd of ["home", "away"]) {
      const prev = byTeam.get(e[sd].id).filter((x) => x < t).at(-1);
      const h = prev === undefined ? null : (t - prev) / 3.6e6;
      rest[sd] = h === null ? null : h < 30 ? 0 : Math.max(1, Math.floor(h / 24));
    }
    e.rest = rest;
  }
}

// Every game of one league the feed knows about: priced fixtures, live games, recent results.
async function leagueEvents(l) {
  const now = Date.now();
  const odds = await rawOdds(l.id).catch((e) => { console.warn(`[oddsapi] ${l.id} odds: ${e.message}`); return []; });
  if (!started.has(l.id)) started.set(l.id, new Map());
  for (const o of odds) started.get(l.id).set(o.id, new Date(o.commence_time).getTime());
  const pending = await scoresNeeded(l.id);
  const scores = await rawScores(l.id, pending).catch((e) => { console.warn(`[oddsapi] ${l.id} scores: ${e.message}`); return []; });
  for (const s of scores) if (s.completed) started.get(l.id).delete(s.id);
  const byId = new Map();
  for (const s of scores) byId.set(s.id, { sc: s, o: null });
  for (const o of odds) { const x = byId.get(o.id); if (x) x.o = o; else byId.set(o.id, { sc: null, o }); }
  const evs = [...byId.values()].map(({ o, sc }) => normalize(l.id, o, sc, now)).filter((e) => e.home.name && e.away.name);
  for (const e of evs) if (e.odds && e.state === "pre") lastOdds.set(e.id.slice(3), e.odds);
  if (lastOdds.size > 2000) lastOdds.delete(lastOdds.keys().next().value);
  attachRest(evs);
  return evs.sort((a, b) => new Date(a.date) - new Date(b.date));
}
const leagueCache = (l) => remember(`oa:league:${l.id}`, 60e3, () => leagueEvents(l));

// ESPN groups days by US Eastern time; the board window is expressed in those days.
const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etOf = (date) => ET.format(date).replace(/-/g, "");
const etDay = (offset) => etOf(new Date(Date.now() + offset * 86400000));

// Every Odds API league, `from` (yesterday) through `days` ahead — the same window lib/espn.js
// board() covers. Empty when no key is set.
export async function oaBoard(days = 2, from = -1) {
  const leagues = enabledLeagues();
  if (!leagues.length) return [];
  const lo = etDay(from), hi = etDay(days);
  const lists = await Promise.all(leagues.map((l) => leagueCache(l).catch((e) => { console.warn(`[oddsapi] ${l.id}: ${e.message}`); return []; })));
  return lists.flat().filter((e) => { const d = etOf(new Date(e.date)); return d >= lo && d <= hi; }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// One league, one ET day (for the settlement route).
export async function oaDay(leagueId, day) {
  const l = LEAGUE_BY_ID[leagueId];
  if (!l?.source || !oddsEnabled()) return [];
  return (await leagueCache(l)).filter((e) => etOf(new Date(e.date)) === day);
}

// The match page's summary: the event alone (the feed has no stats, lineups or tables). A game
// no longer on the feed comes back from its saved pick.
export async function oaSummary(leagueId, eventId) {
  const l = LEAGUE_BY_ID[leagueId];
  let ev = l?.source && oddsEnabled() ? (await leagueCache(l).catch(() => [])).find((e) => e.id === eventId) : null;
  if (!ev) {
    const rows = await withDb("oaPick", (sql) => sql`select event_id, league, kickoff, state, home, away, home_id, away_id, home_score, away_score from skii_picks where event_id = ${eventId}`, []);
    const r = rows?.[0];
    if (!r) throw new Error("Match not found on the feed");
    const done = r.state === "post" && r.home_score !== null;
    const side = (name, id, score) => ({ id: id || teamId(leagueId, name), name, short: name, abbr: abbrOf(name), logo: null, color: null, score, form: "", record: "", winner: false });
    ev = {
      id: r.event_id, league: leagueId, sport: "hockey", source: "oddsapi", date: new Date(r.kickoff).toISOString(), ot: null, endingKnown: false,
      state: r.state, completed: done, detail: done ? "Final" : "", clock: "", minute: null, period: 0, postponed: false,
      home: side(r.home, r.home_id, r.home_score), away: side(r.away, r.away_id, r.away_score), reds: { home: 0, away: 0 }, venue: "", note: "", odds: null,
    };
  }
  return { event: ev, stats: {}, timeline: [], form: { home: [], away: [] }, table: [], lineups: [], h2h: [], commentary: [], news: [] };
}
