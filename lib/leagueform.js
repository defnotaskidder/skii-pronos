// League form: in which leagues does the model read games well? Every graded pick's chance is
// compared with what happened, league by league. A logistic offset δ (shrunk toward 0 by a
// normal prior, so 8/8 is a hint and 40/40 is proof) says how far reality sits above or below the
// model there; it adjusts probabilities, steers the coupons and badges leagues on the site.
import { withDb, dbEnabled } from "./db";
import { remember } from "./memo";
import { calibrator, pickProb } from "./calibration";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sig = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));
const r4 = (x) => (x === null || x === undefined ? x : Math.round(x * 1e4) / 1e4);

// Standard normal CDF via erf (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7).
function phi(x) {
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// MAP of δ in  y ~ Bernoulli(σ(logit p + δ)),  δ ~ N(0, τ²)  — Newton on a concave objective.
// sd from the curvature at the optimum; pPos = P(δ > 0).
export function fitOffset(rows, tau = 0.6) {
  if (!rows?.length) return { delta: 0, sd: tau, pPos: 0.5 };
  const z = rows.map((r) => logit(clamp(r.p, 0.02, 0.98)));
  const prec = 1 / (tau * tau);
  const curve = (d) => {
    let g = -d * prec, h = prec;
    for (let i = 0; i < z.length; i++) { const q = sig(z[i] + d); g += rows[i].y - q; h += q * (1 - q); }
    return { g, h };
  };
  let delta = 0;
  for (let it = 0; it < 25; it++) {
    const { g, h } = curve(delta);
    const step = clamp(g / h, -1, 1); // damped: never jump more than one logit unit
    delta += step;
    if (Math.abs(step) < 1e-6) break;
  }
  const sd = 1 / Math.sqrt(curve(delta).h);
  return { delta, sd, pPos: phi(delta / sd) };
}

const empty = () => ({ ready: false, updated: new Date().toISOString(), leagues: {}, sports: {} });
const statusOf = (n, pPos) => (n < 8 ? "learning" : pPos >= 0.75 ? "strong" : pPos <= 0.25 ? "weak" : "neutral");

async function compute(days) {
  if (!dbEnabled()) return empty();
  // both reads at once: the board waits on this, so a slow database costs one timeout, not two
  const [rows, cal] = await Promise.all([
    withDb("leagueSkill", (sql) => sql`
      select league, sport, pick_key, pick_odds::float, pick_p::float, pick_safe::float, pick_raw::float, pick_est, pick_result
      from skii_picks
      where state = 'post' and pick_result in ('W', 'L') and kickoff > now() - make_interval(days => ${days})`, null),
    calibrator(days).catch(() => null),
  ]);
  if (!rows) throw new Error("leagueSkill: database unavailable"); // keeps the last good value
  if (!rows.length) return empty();
  const graded = [];
  for (const r of rows) {
    const p0 = pickProb(r);
    if (p0 === null) continue;
    const est = r.pick_est === true;
    graded.push({ league: r.league, sport: r.sport, est, odds: r.pick_odds, y: r.pick_result === "W" ? 1 : 0, p: cal ? cal(p0, est) : p0 });
  }
  const group = (key) => { const m = new Map(); for (const x of graded) { const k = x[key] || "?"; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };

  const leagues = {};
  for (const [league, list] of group("league")) {
    const n = list.length, w = list.filter((x) => x.y).length;
    const { delta, sd, pPos } = fitOffset(list);
    const expRate = list.reduce((a, x) => a + x.p, 0) / n;
    const adjRate = list.reduce((a, x) => a + sig(logit(clamp(x.p, 0.02, 0.98)) + delta), 0) / n;
    const priced = list.filter((x) => !x.est);
    const units = priced.reduce((a, x) => a + (x.y ? (x.odds || 1) - 1 : -1), 0);
    leagues[league] = {
      league, sport: list[0].sport, n, w, rate: r4(w / n), expRate: r4(expRate), edge: r4(adjRate - expRate),
      delta: r4(delta), sd: r4(sd), pPos: r4(pPos), status: statusOf(n, pPos),
      priced: { n: priced.length, w: priced.filter((x) => x.y).length, units: Math.round(units * 100) / 100, roi: priced.length ? r4(units / priced.length) : null },
      est: { n: n - priced.length, w: list.filter((x) => x.est && x.y).length },
    };
  }
  const sports = {};
  for (const [sport, list] of group("sport")) {
    const { delta, pPos } = fitOffset(list);
    sports[sport] = { n: list.length, w: list.filter((x) => x.y).length, delta: r4(delta), pPos: r4(pPos) };
  }
  return { ready: true, updated: new Date().toISOString(), leagues, sports };
}

// Learned per-league skill over the last `days` (graded W/L picks). Never throws: with no
// database, no history or a failed query (and nothing cached yet) every league is unknown.
const failedAt = globalThis.__skiiSkillFail || (globalThis.__skiiSkillFail = new Map());
export async function leagueSkill(days = 120) {
  if (Date.now() - (failedAt.get(days) || 0) < 120e3) return empty(); // don't hammer a sick database
  try {
    return await remember(`leagueskill:${days}`, 30 * 60e3, () => compute(days));
  } catch {
    failedAt.set(days, Date.now());
    return empty();
  }
}

// p shifted by the league's learned offset (unknown league or no p → unchanged).
export function adjustP(p, league, skill) {
  const l = skill?.leagues?.[league];
  if (!l || p === null || p === undefined || Number.isNaN(p)) return p;
  return clamp(sig(logit(clamp(p, 0.02, 0.98)) + (l.delta || 0)), 0.03, 0.97);
}

export const leagueStatus = (league, skill) => skill?.leagues?.[league] || null;

// Small version for the browser: { [league]: { s: status, n, w, e: edge } }.
export async function leagueSkillBrief(days = 120) {
  const skill = await leagueSkill(days);
  return Object.fromEntries(Object.values(skill.leagues).map((l) => [l.league, { s: l.status, n: l.n, w: l.w, e: Math.round(l.edge * 1000) / 1000 }]));
}
