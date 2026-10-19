// Football engine: the trained online strength model (lib/soccer-core.js + lib/soccer-params.json)
// applied to a live ESPN event. Each club's learnt attack and defence and the competition's
// scoring rate and home advantage give the model's expected goals; where a bookmaker prices the
// game, the market's implied expected goals (lib/model.js fitGoals) are pulled toward them by the
// weight the trainer fitted for that league tier. lib/model.js then prices every market from the
// one score matrix. The database copy of the state (lib/ratings.js, updated after every result)
// comes first; the trained seed stands in for clubs and competitions it has not seen yet.
import PARAMS from "./soccer-params.json";
import { DEFAULT_PARAMS, blend, expectedGoals, newLeague, seasonStart } from "./soccer-core";
import { LEAGUE_BY_ID } from "./leagues";

export const soccerParams = () => (PARAMS?.version ? PARAMS : DEFAULT_PARAMS);
export const soccerTrained = () => !!PARAMS?.version;
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

// A club's attack / defence: the database's online copy when it is newer than the trained seed,
// else the seed; null for a club the model has never seen.
export function clubState(id, dbRow) {
  const P = soccerParams();
  const seed = P.teams?.[String(id)] || null;
  const db = dbRow && num(dbRow.att) !== null && num(dbRow.def) !== null ? dbRow : null;
  if (db && (!seed || !P.asOf || !db.dcAt || new Date(db.dcAt) >= new Date(P.asOf))) {
    return { att: db.att, def: db.def, n: db.nDc || 0, league: db.dcLeague || seed?.league || null, season: db.dcSeason ?? seed?.season ?? null };
  }
  return seed ? { att: seed.att, def: seed.def, n: seed.n, league: seed.league || null, season: seed.season ?? null } : null;
}

// A competition's scoring rate / home advantage / offset: database row, else the trained seed, else
// the model's priors.
export function leagueState(league, dbRow) {
  const P = soccerParams();
  const seed = P.leagues?.[league];
  if (dbRow && (!seed || !P.asOf || !dbRow.updatedAt || new Date(dbRow.updatedAt) >= new Date(P.asOf))) return dbRow;
  if (seed) return { mu: seed.mu, muPrev: seed.muPrev, home: seed.home, off: seed.off || 0, goals: seed.goals || 0, games: seed.games || 0, season: seed.season ?? null };
  return newLeague(P);
}

// The model's expected goals for an event. `ratings.home/away` carry the database rows (lib/ratings.js
// teamRating), `leagues` is a Map(league → state) from the database (may be empty).
export function modelGoals(ev, ratings, leagues = null) {
  if (ev.sport !== "soccer") return null;
  const P = soccerParams();
  const H = clubState(ev.home?.id, ratings?.home), A = clubState(ev.away?.id, ratings?.away);
  if (!H || !A) return null;
  const L = leagueState(ev.league, leagues?.get?.(ev.league) || null);
  const h = seasonStart(H, ev.season, P), a = seasonStart(A, ev.season, P);
  const cross = !!(h.league && a.league && h.league !== a.league);
  const off = (lg) => leagueState(lg, leagues?.get?.(lg) || null).off || 0;
  const { lh, la } = expectedGoals(h, a, L, P, { cross, offH: cross ? off(h.league) : 0, offA: cross ? off(a.league) : 0 });
  return { lh, la, nMin: Math.min(h.n, a.n), n: { home: h.n, away: a.n }, cross, home: { att: h.att, def: h.def }, away: { att: a.att, def: a.def } };
}

// Market-implied expected goals pulled toward the model's, by league tier (and less while a club is new).
export function blendGoals(mkt, model, league) {
  return blend(mkt, model, { tier: LEAGUE_BY_ID[league]?.tier ?? 3, nMin: model.nMin }, soccerParams());
}
