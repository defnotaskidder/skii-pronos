// NFL model — the maths, shared by the live engine (lib/nfl.js) and the trainer
// (scripts/train-nfl.mjs). Pure functions, no I/O, parameters passed in (lib/nfl-params.json).
//
// A game is modelled as a joint distribution of the two teams' scores:
//   1. Regulation (60'): P(h, a) ∝ φ(margin) · φ(total) · v[h] · v[a] · w[|h − a|]
//      φ are normal densities around the game's margin and total "locations", v are team-score
//      weights (3, 7, 10, 13, 14, 17, 20, 21, 24, 27… are common, 1 is impossible, 2/4/5 rare) and
//      w are margin weights (the key numbers 3, 7, 10, 14 and 0). v and w are fitted on ten seasons
//      of final scores against the closing lines, so alternate spreads and totals near key numbers
//      are priced the way NFL scores actually fall.
//   2. Overtime: a tie after 60' goes to overtime; the winner adds the points the empirical
//      overtime table says (field goal, touchdown, both teams possessing under the modern rules),
//      and a fitted share of regular-season overtimes ends tied (playoffs never do).
//   3. Markets: moneyline (incl. OT, a tie voids), 60-minute 3-way, spreads (pushes on whole
//      numbers), totals, team totals, winning-margin bands, overtime, odd/even.
// The margin/total locations come either from the bookmaker (solved so the model reproduces the
// de-vigged moneyline, spread and total) or from the strength model (Elo, points, yards per play,
// turnovers, rest), whose weights the trainer fits walk-forward.

export const MAXR = 70; // regulation points per team on the grid
const N = MAXR + 1;
export const OTMAX = 9; // the most a side adds in overtime
export const MAXF = MAXR + OTMAX;
const NF = MAXF + 1;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

const sdM = (locT, P) => Math.max(7, P.dist.sM + P.dist.sM1 * (locT - 44));
const sdT = (locT, P) => Math.max(7, P.dist.sT + P.dist.sT1 * (locT - 44));

// Regulation grid R[h * N + a], normalised. `vw` = false drops the key-number weights (baseline).
export function regJoint(locM, locT, P, vw = true) {
  const sM = sdM(locT, P), sT = sdT(locT, P);
  const v = vw ? P.dist.v : null, w = vw ? P.dist.w : null;
  const fM = new Float64Array(2 * MAXR + 1), fT = new Float64Array(2 * MAXR + 1);
  for (let d = -MAXR; d <= MAXR; d++) {
    const z = (d - locM) / sM;
    // the last margin weight stands for that margin or more (the trainer pools the tail into it)
    fM[d + MAXR] = Math.exp(-0.5 * z * z) * (w ? w[Math.min(Math.abs(d), w.length - 1)] : 1);
  }
  for (let t = 0; t <= 2 * MAXR; t++) { const z = (t - locT) / sT; fT[t] = Math.exp(-0.5 * z * z); }
  const R = new Float64Array(N * N);
  let sum = 0;
  for (let h = 0; h <= MAXR; h++) {
    const vh = v ? v[h] ?? 1 : 1;
    for (let a = 0; a <= MAXR; a++) {
      const p = fM[h - a + MAXR] * fT[h + a] * vh * (v ? v[a] ?? 1 : 1);
      R[h * N + a] = p;
      sum += p;
    }
  }
  if (sum > 0) for (let i = 0; i < R.length; i++) R[i] /= sum;
  return R;
}

// Overtime: the home side's chance to win an overtime that isn't tied.
export function otHome(locM, locT, P) {
  return sigmoid(P.ot.k * locM / sdM(locT, P) + P.ot.b);
}

// Full outcome object: final-score grid (regulation + overtime) and the summaries markets need.
export function outcomes(locM, locT, P, { playoff = false } = {}) {
  const R = regJoint(locM, locT, P);
  const F = new Float64Array(NF * NF);
  let rh = 0, rd = 0, ra = 0;
  const tieShare = playoff ? 0 : clamp(P.ot.tie, 0, 0.3);
  const pH = otHome(locM, locT, P);
  for (let h = 0; h <= MAXR; h++) for (let a = 0; a <= MAXR; a++) {
    const p = R[h * N + a];
    if (!p) continue;
    if (h > a) { rh += p; F[h * NF + a] += p; }
    else if (h < a) { ra += p; F[h * NF + a] += p; }
    else {
      rd += p;
      for (const x of P.ot.add) {
        const wi = Math.min(h + x.w, MAXF), li = Math.min(h + x.l, MAXF);
        F[wi * NF + li] += p * (1 - tieShare) * pH * x.p;
        F[li * NF + wi] += p * (1 - tieShare) * (1 - pH) * x.p;
      }
      for (const x of P.ot.tieAdd) { const s = Math.min(h + x.a, MAXF); F[s * NF + s] += p * tieShare * x.p; }
    }
  }
  // marginals
  const M = new Float64Array(2 * MAXF + 1), T = new Float64Array(2 * MAXF + 1), Hs = new Float64Array(NF), As = new Float64Array(NF);
  let fh = 0, fa = 0, ft = 0, mh = 0, ma = 0;
  for (let h = 0; h <= MAXF; h++) for (let a = 0; a <= MAXF; a++) {
    const p = F[h * NF + a];
    if (!p) continue;
    M[h - a + MAXF] += p; T[h + a] += p; Hs[h] += p; As[a] += p;
    if (h > a) fh += p; else if (h < a) fa += p; else ft += p;
    mh += h * p; ma += a * p;
  }
  const cum = (arr, pred) => { let s = 0; for (let i = 0; i < arr.length; i++) if (pred(i)) s += arr[i]; return s; };
  return {
    F, R, locM, locT, sM: sdM(locT, P), sT: sdT(locT, P),
    ml: { h: fh, a: fa, tie: ft }, reg: { h: rh, d: rd, a: ra }, toOT: rd, otHome: pH,
    mean: { h: mh, a: ma, m: mh - ma, t: mh + ma },
    // home line `line` (e.g. −3.5): covers when margin + line > 0, pushes when it is 0
    spread(side, line) {
      const sg = side === "home" ? 1 : -1;
      return { p: cum(M, (i) => sg * (i - MAXF) + line > 0), v: cum(M, (i) => sg * (i - MAXF) + line === 0) };
    },
    total(line) { return { p: cum(T, (i) => i > line), v: cum(T, (i) => i === line) }; },
    team(side, line) { const arr = side === "home" ? Hs : As; return { p: cum(arr, (i) => i > line), v: cum(arr, (i) => i === line) }; },
    margin(side, lo, hi) { const sg = side === "home" ? 1 : -1; return cum(M, (i) => { const x = sg * (i - MAXF); return x >= lo && x <= hi; }); },
    exactMargin(d) { return M[d + MAXF] || 0; },
    odd() { return cum(T, (i) => i % 2 === 1); },
    medianTeam(side) { const arr = side === "home" ? Hs : As; let s = 0; for (let i = 0; i < arr.length; i++) { s += arr[i]; if (s >= 0.5) return i; } return 0; },
    medianTotal() { let s = 0; for (let i = 0; i < T.length; i++) { s += T[i]; if (s >= 0.5) return i; } return 0; },
    scores(k = 6) {
      const out = [];
      for (let h = 0; h <= MAXF; h++) for (let a = 0; a <= MAXF; a++) { const p = F[h * NF + a]; if (p > 0.004) out.push({ score: `${h}-${a}`, p }); }
      return out.sort((x, y) => y.p - x.p).slice(0, k);
    },
  };
}

// ---------- fitting locations to a bookmaker's prices ----------
// target: { ml: P(home | no tie), spread: { line (home), p: P(home covers | no push) },
//           total: { line, p: P(over | no push) } } — any subset.
const ex = (r) => (r.v < 1 ? r.p / (1 - r.v) : 0.5);
export function fitToMarket(target, P, opts = {}) {
  // with no book total the margin is solved at the total the caller will price with (opts.locT),
  // and with no book margin the total is solved at the caller's margin (opts.locM)
  let locT = target.total?.line ?? opts.locT ?? P.league.total;
  let locM = target.spread ? -target.spread.line : target.ml ? 2 * P.dist.sM * (target.ml - 0.5) * 1.15 : opts.locM ?? P.strength.hfa;
  const marginErr = (lm) => {
    const o = outcomes(lm, locT, P, opts);
    let e = 0, w = 0;
    if (target.spread) { e += 2 * (ex(o.spread("home", target.spread.line)) - target.spread.p); w += 2; }
    if (target.ml) { e += (o.ml.h / Math.max(1e-9, o.ml.h + o.ml.a) - target.ml); w += 1; }
    return w ? e / w : 0;
  };
  const totalErr = (lt) => ex(outcomes(locM, lt, P, opts).total(target.total.line)) - target.total.p;
  const bisect = (f, lo, hi) => {
    let flo = f(lo), fhi = f(hi);
    if (flo > 0 && fhi > 0) return lo; // monotone increasing: clamp at the ends
    if (flo < 0 && fhi < 0) return hi;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2, fm = f(mid); if (fm > 0) hi = mid; else lo = mid; }
    return (lo + hi) / 2;
  };
  for (let round = 0; round < 3; round++) {
    if (target.spread || target.ml) locM = bisect(marginErr, locM - 14, locM + 14);
    if (target.total) locT = bisect(totalErr, Math.max(20, locT - 14), Math.min(75, locT + 14));
  }
  const o = outcomes(locM, locT, P, opts);
  let err = 0;
  if (target.spread) err += (ex(o.spread("home", target.spread.line)) - target.spread.p) ** 2;
  if (target.ml) err += (o.ml.h / (o.ml.h + o.ml.a) - target.ml) ** 2;
  if (target.total) err += (ex(o.total(target.total.line)) - target.total.p) ** 2;
  return { locM, locT, fitError: err };
}

// Locations whose outcome means are the given expected margin and total (strength model output).
export function locFromMeans(EM, ET, P, opts = {}) {
  let locM = EM, locT = ET;
  for (let i = 0; i < 6; i++) {
    const o = outcomes(locM, locT, P, opts);
    locM += EM - o.mean.m;
    locT += ET - o.mean.t;
  }
  return { locM, locT };
}

// ---------- Elo (538 flavour, fitted) ----------
export function eloExpected(rh, ra, P, neutral = false) {
  return 1 / (1 + 10 ** (-(rh - ra + (neutral ? 0 : P.elo.home)) / 400));
}
export function eloUpdate(home, away, hs, as, P, neutral = false) {
  const diff = home.rating - away.rating + (neutral ? 0 : P.elo.home);
  const e = 1 / (1 + 10 ** (-diff / 400));
  const s = hs > as ? 1 : hs === as ? 0.5 : 0;
  const mov = Math.abs(hs - as);
  const winDiff = hs > as ? diff : hs < as ? -diff : 0;
  // margin-of-victory multiplier with autocorrelation damping (big favourites winning big learn less)
  const mult = mov === 0 ? 1 : (Math.log(mov + 1) * 2.2) / (winDiff * 0.001 + 2.2) * P.elo.mov;
  const d = P.elo.K * mult * (s - e);
  return { home: home.rating + d, away: away.rating - d, expected: e };
}
export const eloRevert = (rating, P) => P.elo.mean + (rating - P.elo.mean) * (1 - P.elo.revert);

// ---------- strength model ----------
// Per team (season to date): { gp, pf, pa, plays, yds, playsA, ydsA, give, take, rest }, plus
// `prior`: last season's per-game rates { pf, pa, ypp, yppA, to } (or null). `lg` = league rates
// this season { ppg, ypp, to }. Returns the expected margin (home − away) and total.
const shr = (sum, n, prior, k) => (n + k > 0 ? (sum + k * prior) / (n + k) : prior);
export function teamRates(t, lg, P) {
  const S = P.strength, r = S.priorR;
  const pr = t.prior || {};
  const prior = (x, mean) => (Number.isFinite(x) ? r * x + (1 - r) * mean : mean);
  const gp = t.gp || 0;
  const pf = shr(t.pf || 0, gp, prior(pr.pf, lg.ppg), S.k);
  const pa = shr(t.pa || 0, gp, prior(pr.pa, lg.ppg), S.k);
  const playsPg = t.plays && gp ? t.plays / gp : 0;
  const yppO = t.plays > 0 ? shr(t.yds, t.plays, prior(pr.ypp, lg.ypp), S.kPlays) : prior(pr.ypp, lg.ypp);
  const yppD = t.playsA > 0 ? shr(t.ydsA, t.playsA, prior(pr.yppA, lg.ypp), S.kPlays) : prior(pr.yppA, lg.ypp);
  const to = shr((t.take || 0) - (t.give || 0), gp, prior(pr.to, 0), S.kTo);
  return { pf, pa, yppO, yppD, to, playsPg };
}
export function strength(home, away, ctx, P) {
  const S = P.strength, lg = ctx.lg;
  const H = teamRates(home, lg, P), A = teamRates(away, lg, P);
  const eloPts = Number.isFinite(home.rating) && Number.isFinite(away.rating) ? (home.rating - away.rating) / 25 : 0;
  const short = (t) => (t.rest !== null && t.rest !== undefined && t.rest <= 5 ? 1 : 0);
  const bye = (t) => (t.rest !== null && t.rest !== undefined && t.rest >= 12 ? 1 : 0);
  const x = {
    home: ctx.neutral ? 0 : 1,
    elo: eloPts,
    pd: (H.pf - H.pa) - (A.pf - A.pa),
    ypp: (H.yppO - H.yppD) - (A.yppO - A.yppD),
    to: H.to - A.to,
    short: short(home) - short(away),
    bye: bye(home) - bye(away),
    playoff: ctx.playoff ? 1 : 0,
  };
  const m = S.hfa * x.home + S.bElo * x.elo + S.bPd * x.pd + S.bYpp * x.ypp + S.bTo * x.to + S.bShort * x.short + S.bBye * x.bye;
  const tx = {
    pts: (H.pf + A.pa + A.pf + H.pa) / 2 - 2 * lg.ppg,
    ypp: (H.yppO + A.yppD + A.yppO + H.yppD) / 2 - 2 * lg.ypp,
  };
  const t = 2 * lg.ppg + S.tBase + S.tPts * tx.pts + S.tYpp * tx.ypp + S.tPlayoff * x.playoff;
  return { m, t: clamp(t, 25, 75), x, tx, rates: { home: H, away: A } };
}

// Default parameters before the trainer has run (and its starting point).
const flat = (n, f = () => 1) => Array.from({ length: n }, (_, i) => f(i));
export const DEFAULT_PARAMS = {
  version: 0,
  league: { total: 44.5, ppg: 22.2, ypp: 5.4 },
  dist: { sM: 13.2, sM1: 0.08, sT: 13.5, sT1: 0.1, v: flat(N, (i) => (i === 1 ? 1e-6 : 1)), w: flat(41) },
  ot: { tie: 0.08, k: 1.2, b: 0, add: [{ w: 3, l: 0, p: 0.45 }, { w: 6, l: 0, p: 0.4 }, { w: 6, l: 3, p: 0.1 }, { w: 9, l: 6, p: 0.05 }], tieAdd: [{ a: 0, p: 0.7 }, { a: 3, p: 0.3 }] },
  elo: { K: 20, home: 48, mov: 1, revert: 1 / 3, mean: 1505 },
  strength: { hfa: 1.8, bElo: 0.6, bPd: 0.15, bYpp: 1.5, bTo: 0.3, bShort: -0.5, bBye: 0.8, k: 4, kPlays: 300, kTo: 8, priorR: 0.5, tBase: 0, tPts: 0.5, tYpp: 1, tPlayoff: -1 },
  market: { blendM: 0.1, blendT: 0.1 },
};
