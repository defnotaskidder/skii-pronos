// Elo-style team ratings learned from every finished game (all 224 competitions). Home
// advantage, a goal-difference multiplier, and a bigger step while a team is new. The
// ratings feed the stats half of the model, which matters most where no bookmaker prices
// the game (lower leagues, cups, women's and youth football).
//
// Hockey and the NFL use the Elo their trainers fitted (scripts/train-hockey.mjs,
// scripts/train-nfl.mjs) and start from the ratings those trainers ended on, so a team carries ten
// seasons of history from day one instead of starting at 1500.
import { withDb } from "./db";
import { eloUpdate } from "./hockey-core";
import HOCKEY from "./hockey-params.json";
import { eloRevert as nflRevert, eloUpdate as nflEloUpdate } from "./nfl-core";
import NFL from "./nfl-params.json";
import { expectedGoals, newTeam, seasonStart, update as dcUpdate } from "./soccer-core";
import { clubState, leagueState, soccerParams, soccerTrained } from "./soccer";

const DOMESTIC = /^[a-z]+\.\d$/;

const HOME = 60; // rating points of home advantage
const kFor = (games) => (games < 10 ? 40 : games < 30 ? 28 : 20);
const expected = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));
const gdMult = (gd) => (gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8);

// ESPN team ids are only unique within a sport, and outside soccer within a league (NHL team 1 is
// the Bruins, NFL team 1 the Falcons, NCAA hockey has its own numbering). Soccer keeps its plain ids
// (one club, many competitions); ids that already carry a namespace ("oa:shl:…") stay as they are.
export function ratingKey(league, sport, id) {
  if (id === null || id === undefined || id === "") return null;
  const sid = String(id);
  if (sport === "soccer" || sid.includes(":")) return sid;
  return `${league}:${sid}`;
}
const keyOf = (ev, side) => ratingKey(ev.league, ev.sport, ev[side]?.id);
export const ratingKeys = (events) => events.flatMap((e) => [keyOf(e, "home"), keyOf(e, "away")]).filter(Boolean);

// Ratings the trainers ended on: { teams: { espnId: { rating, games, season } }, season }.
const SEEDS = { nfl: NFL.elo?.seed, nhl: HOCKEY.elo?.seed };
function seedOf(league, id) {
  const S = SEEDS[league], t = S?.teams?.[String(id)];
  return t ? { rating: t.rating, games: t.games, season: t.season ?? S.season ?? null } : null;
}
// A team's rating for this event: the learned one, else the trained seed (undefined when neither).
export function teamRating(ev, side, map) {
  const k = keyOf(ev, side);
  return (k && map?.get(k)) || seedOf(ev.league, ev[side]?.id) || undefined;
}

// `ctx` = { sport, league, ot, season, neutral }.
export function ratingUpdate(home, away, hs, as, ctx = null) {
  if (ctx?.sport === "hockey") { const u = eloUpdate(home, away, hs, as, ctx.ot, HOCKEY); return { home: u.home, away: u.away }; }
  if (ctx?.league === "nfl") {
    // the NFL Elo regresses every rating part of the way to the mean at each new season
    const rev = (t) => { let r = t.rating; if (t.season && ctx.season && ctx.season > t.season) for (let k = t.season; k < ctx.season; k++) r = nflRevert(r, NFL); return { ...t, rating: r }; };
    const u = nflEloUpdate(rev(home), rev(away), hs, as, NFL, !!ctx.neutral);
    return { home: u.home, away: u.away };
  }
  const eh = expected(home.rating + HOME, away.rating);
  const sh = hs > as ? 1 : hs === as ? 0.5 : 0;
  const k = Math.min(kFor(home.games), kFor(away.games)) * gdMult(Math.abs(hs - as));
  const d = k * (sh - eh);
  return { home: home.rating + d, away: away.rating - d };
}

// Games already applied, by id. Outside soccer the ids carry a "k2:" prefix since ratings moved to
// per-league keys: games the old code rated under plain team ids get rated again for the new keys
// (those older than the trained seed are skipped below — the seed already counts them).
const ratedId = (e) => (e.sport === "soccer" ? String(e.id) : `k2:${e.id}`);
const inSeed = (e) => { const S = SEEDS[e.league]; return !!S?.asOf && new Date(e.date) <= new Date(S.asOf); };

// Process finished games not rated yet. `events` are normalised ESPN events with team ids.
export async function learnFromGames(events) {
  const done = events.filter((e) => e.state === "post" && e.completed && e.home?.id && e.away?.id && e.home.score !== null && e.away.score !== null && e.home.score !== undefined && !e.postponed);
  if (!done.length) return 0;
  return withDb("learnFromGames", async (sql) => {
    const ids = done.map(ratedId);
    const rated = new Set((await sql`select event_id from skii_rated where event_id in ${sql(ids)}`).map((r) => r.event_id));
    const fresh = done.filter((e) => !rated.has(ratedId(e)));
    // NFL preseason games (starters sit; the trainer never saw them) and games the trained seed
    // already includes are marked done without moving any rating
    const skip = fresh.filter((e) => inSeed(e) || (e.league === "nfl" && e.seasonType === 1));
    const todo = fresh.filter((e) => !skip.includes(e)).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (skip.length) await sql`insert into skii_rated ${sql(skip.map((e) => ({ event_id: ratedId(e) })))} on conflict do nothing`;
    if (!todo.length) return 0;
    const keys = [...new Set(ratingKeys(todo))];
    const rows = await sql`select team_id, rating::float, games, season, att::float, def::float, n_dc, dc_league, dc_season, dc_at from skii_teams where team_id in ${sql(keys)}`;
    const teams = new Map(rows.map((r) => [r.team_id, dcRow(r)]));
    const get = (e, side) => teams.get(keyOf(e, side)) || seedOf(e.league, e[side].id) || { rating: e.league === "nfl" ? NFL.elo.mean : 1500, games: 0, season: null };
    for (const e of todo) {
      const h = get(e, "home"), a = get(e, "away");
      const next = ratingUpdate(h, a, e.home.score, e.away.score, { sport: e.sport, league: e.league, ot: e.ot, season: e.season, neutral: e.neutral });
      const season = e.season || h.season || null;
      teams.set(keyOf(e, "home"), { ...teams.get(keyOf(e, "home")), rating: next.home, games: h.games + 1, league: e.league, name: e.home.short || e.home.name, season });
      teams.set(keyOf(e, "away"), { ...teams.get(keyOf(e, "away")), rating: next.away, games: a.games + 1, league: e.league, name: e.away.short || e.away.name, season: e.season || a.season || null });
    }
    // football strength model: one gradient step per finished game after the trained seed's cut-off
    const leagues = await learnSoccer(sql, todo, teams);
    for (const [id, tm] of teams) {
      if (!tm.league) continue; // loaded but not touched by these games
      await sql`insert into skii_teams (team_id, league, name, rating, games, season, att, def, n_dc, dc_league, dc_season, dc_at, updated_at)
        values (${id}, ${tm.league || null}, ${tm.name || null}, ${tm.rating}, ${tm.games}, ${tm.season ?? null}, ${tm.att ?? null}, ${tm.def ?? null}, ${tm.nDc ?? null}, ${tm.dcLeague ?? null}, ${tm.dcSeason ?? null}, ${tm.dcAt ?? null}, now())
        on conflict (team_id) do update set league = coalesce(excluded.league, skii_teams.league), name = coalesce(excluded.name, skii_teams.name), rating = excluded.rating, games = excluded.games,
          season = coalesce(excluded.season, skii_teams.season),
          att = coalesce(excluded.att, skii_teams.att), def = coalesce(excluded.def, skii_teams.def), n_dc = coalesce(excluded.n_dc, skii_teams.n_dc),
          dc_league = coalesce(excluded.dc_league, skii_teams.dc_league), dc_season = coalesce(excluded.dc_season, skii_teams.dc_season), dc_at = coalesce(excluded.dc_at, skii_teams.dc_at), updated_at = now()`;
    }
    for (const [league, L] of leagues) {
      if (!L.touched) continue;
      await sql`insert into skii_leagues (league, mu_goals, mu_games, mu_prev, home, off, season, updated_at) values (${league}, ${L.goals}, ${L.games}, ${L.muPrev ?? null}, ${L.home}, ${L.off || 0}, ${L.season ?? null}, now())
        on conflict (league) do update set mu_goals = excluded.mu_goals, mu_games = excluded.mu_games, mu_prev = excluded.mu_prev, home = excluded.home, off = excluded.off, season = excluded.season, updated_at = now()`;
    }
    for (let i = 0; i < todo.length; i += 500) {
      await sql`insert into skii_rated ${sql(todo.slice(i, i + 500).map((e) => ({ event_id: ratedId(e) })))} on conflict do nothing`;
    }
    return todo.length;
  }, 0, 60000);
}

const dcRow = (r) => ({ rating: r.rating, games: r.games, season: r.season ?? null, att: r.att ?? null, def: r.def ?? null, nDc: r.n_dc ?? null, dcLeague: r.dc_league ?? null, dcSeason: r.dc_season ?? null, dcAt: r.dc_at ? new Date(r.dc_at).toISOString() : null });
const lgRow = (r) => ({ goals: Number(r.mu_goals) || 0, games: r.mu_games || 0, muPrev: r.mu_prev === null || r.mu_prev === undefined ? null : Number(r.mu_prev), home: Number(r.home), off: Number(r.off) || 0, season: r.season ?? null, updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null });

// Football: apply the finished games (date order) to both clubs' attack / defence and to the
// competition's state. Clubs and competitions the database doesn't hold start from the trained seed
// (lib/soccer.js); games the seed already includes are skipped. Returns the league states touched.
async function learnSoccer(sql, todo, teams) {
  const P = soccerParams();
  const asOf = soccerTrained() && P.asOf ? new Date(P.asOf).getTime() : 0;
  const games = todo.filter((e) => e.sport === "soccer" && new Date(e.date).getTime() > asOf);
  const leagues = new Map();
  if (!games.length) return leagues;
  const rows = await sql`select league, mu_goals, mu_games, mu_prev, home, off, season, updated_at from skii_leagues`;
  for (const r of rows) leagues.set(r.league, lgRow(r));
  const lg = (id) => { const cur = leagues.get(id); const L = leagueState(id, cur || null); if (!cur || L !== cur) leagues.set(id, { ...L, touched: false }); return leagues.get(id); };
  const now = new Date().toISOString();
  for (const e of games) {
    const kh = keyOf(e, "home"), ka = keyOf(e, "away");
    const isDom = DOMESTIC.test(e.league);
    const H0 = clubState(e.home.id, teams.get(kh)) || newTeam(P, isDom ? e.league : null, e.season ?? null);
    const A0 = clubState(e.away.id, teams.get(ka)) || newTeam(P, isDom ? e.league : null, e.season ?? null);
    const H = seasonStart(H0, e.season ?? null, P), A = seasonStart(A0, e.season ?? null, P);
    const L = lg(e.league);
    if (e.season && L.season !== e.season && L.season !== null && L.season !== undefined) Object.assign(L, { muPrev: L.games >= 60 ? (L.goals + P.model.kMu * (L.muPrev ?? P.model.muPrior)) / (L.games + P.model.kMu) : L.muPrev, goals: 0, games: 0, season: e.season });
    if (L.season === null || L.season === undefined) L.season = e.season ?? null;
    const cross = !!(H.league && A.league && H.league !== A.league);
    const offH = cross ? lg(H.league).off || 0 : 0, offA = cross ? lg(A.league).off || 0 : 0;
    const { lh, la } = expectedGoals(H, A, L, P, { cross, offH, offA });
    const u = dcUpdate(H, A, L, lh, la, e.home.score, e.away.score, P, { cross, offH, offA });
    const save = (key, t, side) => teams.set(key, { ...(teams.get(key) || { rating: 1500, games: 0, season: null }), league: teams.get(key)?.league || e.league, name: teams.get(key)?.name || e[side].short || e[side].name,
      att: Math.round(t.att * 1e4) / 1e4, def: Math.round(t.def * 1e4) / 1e4, nDc: t.n, dcLeague: isDom ? e.league : t.league || null, dcSeason: e.season ?? t.season ?? null, dcAt: now });
    save(kh, u.home, "home"); save(ka, u.away, "away");
    Object.assign(L, { goals: u.league.goals, games: u.league.games, home: u.league.home, touched: true });
    if (u.off) { Object.assign(lg(H.league), { off: u.off.offH, touched: true }); Object.assign(lg(A.league), { off: u.off.offA, touched: true }); }
  }
  return leagues;
}

// Ratings for a set of rating keys (ratingKey): Map(key → { rating, games, season, att, def, … }).
export async function ratingsFor(keys) {
  const ids = [...new Set(keys.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await withDb("ratingsFor", (sql) => sql`select team_id, rating::float, games, season, att::float, def::float, n_dc, dc_league, dc_season, dc_at from skii_teams where team_id in ${sql(ids)}`, []);
  return new Map((rows || []).map((r) => [r.team_id, dcRow(r)]));
}

// Every competition's learnt state: Map(league → { goals, games, muPrev, home, off, season, updatedAt }).
export async function leagueStates() {
  const rows = await withDb("leagueStates", (sql) => sql`select league, mu_goals, mu_games, mu_prev, home, off, season, updated_at from skii_leagues`, []);
  return new Map((rows || []).map((r) => [r.league, lgRow(r)]));
}

export { ratingGoals } from "./model";
