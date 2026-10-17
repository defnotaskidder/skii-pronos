// Hockey model — the maths, shared by the live engine (lib/hockey.js) and the trainer
// (scripts/train-hockey.mjs). Pure functions, no I/O, parameters passed in.
//
// A game is modelled in three stages:
//   1. Regulation (60'): home and away goals ~ Poisson with a small diagonal inflation (ties happen
//      a little more often than independence says: teams protect a tie late).
//   2. Overtime: a tie goes to 3-on-3 OT; a share `ot.q` of those is decided by a goal, the rest go
//      to a shootout. The stronger side (by expected goals) wins OT more often; the shootout is
//      close to a coin flip.
//   3. Markets: moneyline (incl. OT & SO), 60-minute result, puck line (±1.5), totals (OT goal
//      counts, the shootout goal does not), team totals, margins, exact regulation scores.
// Expected goals themselves come from a log-linear strength model (league scoring rate, home ice,
// goals-for/against rates, shot volumes, recent form, Elo gap, rest) whose weights the trainer
// fits on five seasons of NHL results (lib/hockey-params.json).

export const MAXG = 12;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function pmf(l, n = MAXG) {
  const p = new Array(n + 1);
  p[0] = Math.exp(-l);
  for (let k = 1; k <= n; k++) p[k] = p[k - 1] * l / k;
  return p;
}

// Regulation score matrix m[home][away]; `tau` inflates the diagonal (ties) before renormalising.
export function regMatrix(lh, la, tau = 0) {
  const ph = pmf(lh), pa = pmf(la);
  const m = [];
  let sum = 0;
  for (let i = 0; i <= MAXG; i++) {
    const row = new Array(MAXG + 1);
    for (let j = 0; j <= MAXG; j++) {
      const p = ph[i] * pa[j] * (i === j ? 1 + tau : 1);
      row[j] = p;
      sum += p;
    }
    m.push(row);
  }
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) m[i][j] /= sum;
  return m;
}

// Overtime / shootout chances given the two sides' expected goals.
export function otProbs(lh, la, P, playoff = false) {
  const x = Math.log(lh / la);
  const q = playoff ? 1 : clamp(P.ot.q, 0.3, 0.95); // playoff OT always ends with a goal
  return {
    pOT: q, // P(decided in OT | tie after 60')
    pHomeOT: sigmoid(P.ot.k * x + P.ot.b),
    pHomeSO: sigmoid(P.ot.so.k * x + P.ot.so.b),
  };
}

// Teams are not quite as different as their season rates say (goalies rotate, lines change), so
// the gap between the two expected-goal figures is damped by `spread` (< 1) before pricing,
// keeping the total the same. Fitted on walk-forward moneyline log loss.
export function damp(lh, la, P) {
  const s = P.goals.spread ?? 1;
  if (s === 1) return [lh, la];
  const T = lh + la, x = Math.log(lh / la) * s;
  const h = T * Math.exp(x) / (1 + Math.exp(x));
  return [h, T - h];
}

// Every probability the markets need, from expected regulation goals.
export function outcomes(lh0, la0, P, { playoff = false } = {}) {
  const [lh, la] = damp(lh0, la0, P);
  const m = regMatrix(lh, la, P.goals.tau);
  const ot = otProbs(lh, la, P, playoff);
  let h = 0, d = 0, a = 0;
  const diag = new Array(MAXG + 1).fill(0);
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    if (i > j) h += m[i][j]; else if (i < j) a += m[i][j]; else { d += m[i][j]; diag[i] = m[i][j]; }
  }
  // tie → OT goal (home or away) or shootout (home or away)
  const otH = d * ot.pOT * ot.pHomeOT, otA = d * ot.pOT * (1 - ot.pHomeOT);
  const soH = d * (1 - ot.pOT) * ot.pHomeSO, soA = d * (1 - ot.pOT) * (1 - ot.pHomeSO);
  const sum = (f) => { let s = 0; for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) if (f(i, j)) s += m[i][j]; return s; };
  // tie → an extra goal for the OT winner with probability pOT (shootout: no goal counted)
  const tieSplit = (f) => { let s = 0; for (let i = 0; i <= MAXG; i++) s += diag[i] * (ot.pOT * f(i, true) + (1 - ot.pOT) * f(i, false)); return s; };
  return {
    m, lh, la, ot,
    reg: { h, d, a },
    ml: { h: h + otH + soH, a: a + otA + soA },
    toOT: d, otGoal: d * ot.pOT, shootout: d * (1 - ot.pOT),
    // total goals (OT goal counts, shootout doesn't): P(over), P(push) for whole-number lines
    total(line) {
      const over = sum((i, j) => i !== j && i + j > line) + tieSplit((i, otg) => (2 * i + (otg ? 1 : 0) > line ? 1 : 0));
      const push = sum((i, j) => i !== j && i + j === line) + tieSplit((i, otg) => (2 * i + (otg ? 1 : 0) === line ? 1 : 0));
      return { p: over, v: push };
    },
    // puck line: home −1.5 = wins regulation by 2+; home +1.5 = anything but losing regulation by 2+
    puck(side, line) {
      const own = (i, j) => (side === "home" ? i - j : j - i);
      if (line < 0) return { p: sum((i, j) => own(i, j) + line > 0), v: sum((i, j) => own(i, j) + line === 0) };
      return { p: 1 - sum((i, j) => own(i, j) + line < 0), v: sum((i, j) => own(i, j) + line === 0) };
    },
    // a side's goals including its OT winner (shootout goal excluded)
    teamOver(side, line) {
      const g = (i, j) => (side === "home" ? i : j);
      const pWinOT = side === "home" ? ot.pHomeOT : 1 - ot.pHomeOT;
      return sum((i, j) => i !== j && g(i, j) > line) + tieSplit((i, otg) => (otg ? pWinOT * (i + 1 > line ? 1 : 0) + (1 - pWinOT) * (i > line ? 1 : 0) : i > line ? 1 : 0));
    },
    // winning margin incl. OT/SO: every tie after 60' is a 1-goal win for someone
    margin(side, n) {
      const own = (i, j) => (side === "home" ? i - j : j - i);
      const win = side === "home" ? otH + soH : otA + soA;
      if (n === 1) return sum((i, j) => own(i, j) === 1) + win;
      if (n === 2) return sum((i, j) => own(i, j) === 2);
      return sum((i, j) => own(i, j) >= 3);
    },
    sum,
  };
}

// ---------- strength model: expected regulation goals from team context ----------
// `t` (home / away): { gp, gf, ga, sf, sa, pts, l10gp, l10pts, rating, ratingGames, rest }
// `lg`: { mu (league regulation goals per team per game), S (shots per team per game), playoff }
const rate = (x, n, k, base) => (base > 0 && n + k > 0 ? Math.log((x + k * base) / (n + k) / base) : 0);
const has = (v) => typeof v === "number" && Number.isFinite(v);

export function features(home, away, lg, P) {
  const G = P.goals, k = G.kG, kS = G.kS;
  const shots = has(home.sf) && has(home.sa) && has(away.sf) && has(away.sa) && lg.S > 0 && (home.gp || 0) > 0 && (away.gp || 0) > 0;
  const W = shots ? G.full : G.noShots;
  const f = (t) => {
    const gp = t.gp || 0;
    return {
      attG: gp ? rate(t.gf || 0, gp, k, lg.mu) : 0, defG: gp ? rate(t.ga || 0, gp, k, lg.mu) : 0,
      attS: shots ? rate(t.sf, gp, kS, lg.S) : 0, defS: shots ? rate(t.sa, gp, kS, lg.S) : 0,
      form: gp >= 15 && (t.l10gp || 0) >= 10 && has(t.pts) ? t.l10pts / (2 * t.l10gp) - t.pts / (2 * gp) : 0,
      b2b: t.rest === 0 ? 1 : 0,
    };
  };
  const H = f(home), A = f(away);
  const elo = has(home.rating) && has(away.rating) && Math.min(home.ratingGames || 0, away.ratingGames || 0) >= P.elo.minGames ? (home.rating - away.rating) / 400 : 0;
  const base = Math.log(lg.mu) + (lg.playoff ? G.playoff : 0);
  const lh = base + G.home / 2 + W.aG * H.attG + W.aS * H.attS + W.dG * A.defG + W.dS * A.defS + G.form * (H.form - A.form) + G.elo * elo + G.rest.att * H.b2b + G.rest.def * A.b2b;
  const la = base - G.home / 2 + W.aG * A.attG + W.aS * A.attS + W.dG * H.defG + W.dS * H.defS - G.form * (H.form - A.form) - G.elo * elo + G.rest.att * A.b2b + G.rest.def * H.b2b;
  return { lh: clamp(Math.exp(lh), 0.6, 6.5), la: clamp(Math.exp(la), 0.6, 6.5), shots, elo: elo !== 0 };
}

// League scoring rate: regulation goals per team per game so far this season, shrunk toward the
// long-run rate while the sample is small. `teamGames` = Σ games played over all teams.
export function leagueMu(regGoals, teamGames, prior, k = 150) {
  return (regGoals + k * prior) / (teamGames + k);
}

// ---------- Elo (hockey flavour) ----------
// Win incl. OT/SO scores 1; an OT/SO decision moves ratings less (`otMult`); a regulation win by
// 2+ moves them a little more. Home ice is `home` rating points.
export function eloExpected(rh, ra, P) {
  return 1 / (1 + 10 ** ((ra - rh - P.elo.home) / 400));
}
export function eloUpdate(home, away, hs, as, ot, P) {
  const e = eloExpected(home.rating, away.rating, P);
  const s = hs > as ? 1 : 0;
  const games = Math.min(home.games || 0, away.games || 0);
  const kBase = games < 10 ? P.elo.K[0] : games < 30 ? P.elo.K[1] : P.elo.K[2];
  const gd = Math.abs(hs - as);
  const mult = ot ? P.elo.otMult : 1 + P.elo.gd * Math.min(Math.max(gd - 1, 0), 2);
  const delta = kBase * mult * (s - e);
  return { home: home.rating + delta, away: away.rating - delta, expected: e };
}

// ---------- fitting expected goals to a bookmaker's prices ----------
// Finds (lh, la) whose model probabilities match the de-vigged moneyline (incl. OT/SO), total and
// puck line. Coarse-to-fine grid, ~700 evaluations.
export function fitToMarket(target, P, opts = {}) {
  const err = (lh, la) => {
    const o = outcomes(lh, la, P, opts);
    let e = 0;
    if (target.ml) e += 3 * (o.ml.h - target.ml) ** 2;
    if (target.total) { const t = o.total(target.total.line); e += 1.5 * (t.p / Math.max(1e-9, 1 - t.v) - target.total.p) ** 2; }
    if (target.puck) { const pk = o.puck("home", target.puck.line); e += (pk.p / Math.max(1e-9, 1 - pk.v) - target.puck.p) ** 2; }
    return e;
  };
  let best = [3, 2.8], be = Infinity;
  const scan = (h0, h1, a0, a1, step) => {
    for (let lh = h0; lh <= h1 + 1e-9; lh += step) for (let la = a0; la <= a1 + 1e-9; la += step) {
      if (lh < 0.8 || la < 0.8) continue;
      const e = err(lh, la);
      if (e < be) { be = e; best = [lh, la]; }
    }
  };
  scan(1.4, 5, 1.4, 5, 0.2);
  scan(best[0] - 0.2, best[0] + 0.2, best[1] - 0.2, best[1] + 0.2, 0.05);
  scan(best[0] - 0.05, best[0] + 0.05, best[1] - 0.05, best[1] + 0.05, 0.01);
  return { lh: best[0], la: best[1], fitError: be };
}

// Default parameters: what the model uses before the trainer has run, and the starting point of
// the fit. Values are the long-run NHL rates; weights are conservative.
export const DEFAULT_PARAMS = {
  version: 0,
  league: { mu: 3.0, S: 29.5, regShare: 0.955 },
  goals: {
    home: 0.10, kG: 25, kS: 15, tau: 0.08, playoff: -0.05, form: 0.3, elo: 0.4, spread: 1,
    full: { aG: 0.5, aS: 0.3, dG: 0.5, dS: 0.3 },
    noShots: { aG: 0.7, aS: 0, dG: 0.7, dS: 0 },
    rest: { att: -0.04, def: 0.04 },
  },
  ot: { q: 0.68, k: 0.5, b: 0.0, so: { k: 0.15, b: 0.0 } },
  elo: { K: [16, 11, 8], home: 35, otMult: 0.6, gd: 0.15, minGames: 5 },
  market: { statsWeight: 0.2 },
};
