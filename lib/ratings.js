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
    const rows = await sql`select team_id, rating::float, games, season from skii_teams where team_id in ${sql(keys)}`;
    const teams = new Map(rows.map((r) => [r.team_id, { rating: r.rating, games: r.games, season: r.season ?? null }]));
    const get = (e, side) => teams.get(keyOf(e, side)) || seedOf(e.league, e[side].id) || { rating: e.league === "nfl" ? NFL.elo.mean : 1500, games: 0, season: null };
    for (const e of todo) {
      const h = get(e, "home"), a = get(e, "away");
      const next = ratingUpdate(h, a, e.home.score, e.away.score, { sport: e.sport, league: e.league, ot: e.ot, season: e.season, neutral: e.neutral });
      const season = e.season || h.season || null;
      teams.set(keyOf(e, "home"), { rating: next.home, games: h.games + 1, league: e.league, name: e.home.short || e.home.name, season });
      teams.set(keyOf(e, "away"), { rating: next.away, games: a.games + 1, league: e.league, name: e.away.short || e.away.name, season: e.season || a.season || null });
    }
    for (const [id, tm] of teams) {
      if (!tm.league) continue; // loaded but not touched by these games
      await sql`insert into skii_teams (team_id, league, name, rating, games, season, updated_at) values (${id}, ${tm.league || null}, ${tm.name || null}, ${tm.rating}, ${tm.games}, ${tm.season ?? null}, now())
        on conflict (team_id) do update set league = coalesce(excluded.league, skii_teams.league), name = coalesce(excluded.name, skii_teams.name), rating = excluded.rating, games = excluded.games,
          season = coalesce(excluded.season, skii_teams.season), updated_at = now()`;
    }
    for (let i = 0; i < todo.length; i += 500) {
      await sql`insert into skii_rated ${sql(todo.slice(i, i + 500).map((e) => ({ event_id: ratedId(e) })))} on conflict do nothing`;
    }
    return todo.length;
  }, 0, 60000);
}

// Ratings for a set of rating keys (ratingKey): Map(key → { rating, games, season }).
export async function ratingsFor(keys) {
  const ids = [...new Set(keys.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await withDb("ratingsFor", (sql) => sql`select team_id, rating::float, games, season from skii_teams where team_id in ${sql(ids)}`, []);
  return new Map((rows || []).map((r) => [r.team_id, { rating: r.rating, games: r.games, season: r.season ?? null }]));
}

export { ratingGoals } from "./model";
