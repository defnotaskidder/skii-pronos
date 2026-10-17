// Elo-style team ratings learned from every finished game (all 224 competitions). Home
// advantage, a goal-difference multiplier, and a bigger step while a team is new. The
// ratings feed the stats half of the model, which matters most where no bookmaker prices
// the game (lower leagues, cups, women's and youth football).
import { withDb } from "./db";
import { eloUpdate } from "./hockey-core";
import HOCKEY from "./hockey-params.json";

const HOME = 60; // rating points of home advantage
const kFor = (games) => (games < 10 ? 40 : games < 30 ? 28 : 20);
const expected = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));
const gdMult = (gd) => (gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8);

// `ctx` = { sport, ot }: hockey games use the Elo fitted by scripts/train-hockey.mjs (smaller K,
// less home ice, an OT/shootout decision moves ratings by its own factor).
export function ratingUpdate(home, away, hs, as, ctx = null) {
  if (ctx?.sport === "hockey") { const u = eloUpdate(home, away, hs, as, ctx.ot, HOCKEY); return { home: u.home, away: u.away }; }
  const eh = expected(home.rating + HOME, away.rating);
  const sh = hs > as ? 1 : hs === as ? 0.5 : 0;
  const k = Math.min(kFor(home.games), kFor(away.games)) * gdMult(Math.abs(hs - as));
  const d = k * (sh - eh);
  return { home: home.rating + d, away: away.rating - d };
}

// Process finished games not rated yet. `events` are normalised ESPN events with team ids.
export async function learnFromGames(events) {
  const done = events.filter((e) => e.state === "post" && e.completed && e.home?.id && e.away?.id && e.home.score !== null && e.away.score !== null && e.home.score !== undefined && !e.postponed);
  if (!done.length) return 0;
  return withDb("learnFromGames", async (sql) => {
    const ids = done.map((e) => e.id);
    const rated = new Set((await sql`select event_id from skii_rated where event_id in ${sql(ids)}`).map((r) => r.event_id));
    const todo = done.filter((e) => !rated.has(e.id)).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!todo.length) return 0;
    const teamIds = [...new Set(todo.flatMap((e) => [e.home.id, e.away.id]))];
    const rows = await sql`select team_id, rating::float, games from skii_teams where team_id in ${sql(teamIds)}`;
    const teams = new Map(rows.map((r) => [r.team_id, { rating: r.rating, games: r.games }]));
    const get = (id) => teams.get(id) || { rating: 1500, games: 0 };
    for (const e of todo) {
      const h = get(e.home.id), a = get(e.away.id);
      const next = ratingUpdate(h, a, e.home.score, e.away.score, { sport: e.sport, ot: e.ot });
      teams.set(e.home.id, { rating: next.home, games: h.games + 1, league: e.league, name: e.home.short || e.home.name });
      teams.set(e.away.id, { rating: next.away, games: a.games + 1, league: e.league, name: e.away.short || e.away.name });
    }
    for (const [id, tm] of teams) {
      await sql`insert into skii_teams (team_id, league, name, rating, games, updated_at) values (${id}, ${tm.league || null}, ${tm.name || null}, ${tm.rating}, ${tm.games}, now())
        on conflict (team_id) do update set league = coalesce(excluded.league, skii_teams.league), name = coalesce(excluded.name, skii_teams.name), rating = excluded.rating, games = excluded.games, updated_at = now()`;
    }
    for (let i = 0; i < todo.length; i += 500) {
      await sql`insert into skii_rated ${sql(todo.slice(i, i + 500).map((e) => ({ event_id: e.id })))} on conflict do nothing`;
    }
    return todo.length;
  }, 0, 60000);
}

// Ratings for a set of teams: Map(teamId → { rating, games }).
export async function ratingsFor(teamIds) {
  const ids = [...new Set(teamIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await withDb("ratingsFor", (sql) => sql`select team_id, rating::float, games from skii_teams where team_id in ${sql(ids)}`, []);
  return new Map((rows || []).map((r) => [r.team_id, { rating: r.rating, games: r.games }]));
}

export { ratingGoals } from "./model";
