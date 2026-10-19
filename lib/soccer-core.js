// Football strength model — the maths, shared by the live engine (lib/soccer.js), the online
// learner (lib/ratings.js) and the trainer (scripts/train-soccer.mjs). Pure functions, no I/O.
//
// Every club carries an attack and a defence figure on a log-goals scale, updated after each game
// by one Poisson gradient step (an "online Dixon-Coles": the model never refits a season, it keeps
// moving with every result, so form, injuries and a new coach show up within a few games). Each
// competition carries its own scoring rate and home advantage, learnt the same way; a slow
// cross-league offset per domestic league makes continental ties comparable.
//
//   λ_home = μ_league · e^{home/2} · e^{att_h − def_a (+ offset gap)}
//   λ_away = μ_league · e^{−home/2} · e^{att_a − def_h (− offset gap)}
//
// The score matrix is Poisson × Dixon-Coles low-score correction (ρ). Where a bookmaker prices the
// game, the market's implied expected goals (lib/model.js fitGoals) are pulled toward the model's
// by a weight per league tier: scripts/train-soccer.mjs fits every parameter here walk-forward on
// two seasons of results and closing lines and writes lib/soccer-params.json.

export const MAXG = 10;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export const DEFAULT_PARAMS = {
  version: 0,
  model: {
    eta: 0.05, // learning rate (log goals per goal of residual) for an established club
    etaNew: 0.14, // learning rate at a club's first game, decaying toward `eta` over kN games
    kN: 12,
    shrink: 0.75, // attack/defence at the start of a new season (regression to the league mean)
    newTeam: -0.1, // attack/defence a club starts from (promoted sides are a little below average)
    rho: -0.06, // Dixon-Coles correction of 0-0 / 1-0 / 0-1 / 1-1
    home: 0.22, // home advantage (log goals) a competition starts from
    etaHome: 0.004, // learning rate of a competition's home advantage
    muPrior: 1.35, // goals per team per game a competition starts from
    kMu: 120, // pseudo-games of the prior for a competition's running scoring rate (each season)
    etaOff: 0.02, // learning rate of the domestic-league offsets (continental games only)
    spread: 1, // damping of the gap between the two expected-goal figures before pricing
    maxAbs: 1.6, // bounds on attack / defence
  },
  // market blend: weight on the model's expected goals (log space) against the bookmaker's, by
  // league tier; 0 = trust the market fully
  market: { blend: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.25, 5: 0.3 }, blendNew: 0.5 },
};

// ---------- Poisson / Dixon-Coles ----------
export function pmf(l, n = MAXG) {
  const p = new Array(n + 1);
  p[0] = Math.exp(-l);
  for (let k = 1; k <= n; k++) p[k] = p[k - 1] * l / k;
  return p;
}
const dcAdj = (i, j, lh, la, rho) => (i === 0 && j === 0 ? 1 - lh * la * rho : i === 0 && j === 1 ? 1 + lh * rho : i === 1 && j === 0 ? 1 + la * rho : i === 1 && j === 1 ? 1 - rho : 1);

// Full score matrix m[home][away] (normalised).
export function matrix(lh, la, rho) {
  const ph = pmf(lh), pa = pmf(la);
  const m = [];
  let sum = 0;
  for (let i = 0; i <= MAXG; i++) {
    const row = new Array(MAXG + 1);
    for (let j = 0; j <= MAXG; j++) { const p = Math.max(0, ph[i] * pa[j] * dcAdj(i, j, lh, la, rho)); row[j] = p; sum += p; }
    m.push(row);
  }
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) m[i][j] /= sum;
  return m;
}

// Probability of one exact score without building the matrix (the trainer's likelihood).
export function scoreProb(hs, as, lh, la, rho) {
  const i = Math.min(hs, MAXG), j = Math.min(as, MAXG);
  const ph = pmf(lh, Math.max(i, 1)), pa = pmf(la, Math.max(j, 1));
  const p00 = ph[0] * pa[0], p01 = ph[0] * (pa[1] ?? pa[0] * la), p10 = (ph[1] ?? ph[0] * lh) * pa[0], p11 = (ph[1] ?? ph[0] * lh) * (pa[1] ?? pa[0] * la);
  const norm = 1 + (-lh * la * rho) * p00 + lh * rho * p01 + la * rho * p10 - rho * p11;
  return Math.max(1e-12, ph[i] * pa[j] * dcAdj(i, j, lh, la, rho) / norm);
}

export function outcome(m) {
  let h = 0, d = 0, a = 0;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) { if (i > j) h += m[i][j]; else if (i === j) d += m[i][j]; else a += m[i][j]; }
  return { h, d, a };
}
export function overProb(m, line) {
  let o = 0;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) if (i + j > line) o += m[i][j];
  return o;
}

// ---------- strength model ----------
export const newTeam = (P, league = null, season = null) => ({ att: P.model.newTeam, def: P.model.newTeam, n: 0, league, season });
export const newLeague = (P, season = null) => ({ mu: P.model.muPrior, home: P.model.home, off: 0, goals: 0, games: 0, season, muPrev: P.model.muPrior });

// Learning rate after n games.
export const etaOf = (P, n) => P.model.eta + (P.model.etaNew - P.model.eta) / (1 + n / P.model.kN);

// Running scoring rate of a competition this season, shrunk toward last season's.
export const leagueMu = (L, P) => (L.goals + P.model.kMu * (L.muPrev ?? P.model.muPrior)) / (L.games + P.model.kMu);

// Expected goals of a game. `cross` = the two clubs' domestic leagues differ (continental cup):
// their league offsets then enter. `offH`/`offA` are those offsets.
export function expectedGoals(home, away, L, P, { offH = 0, offA = 0, cross = false } = {}) {
  const base = Math.log(leagueMu(L, P));
  const gap = cross ? offH - offA : 0;
  let lh = Math.exp(base + L.home / 2 + home.att - away.def + gap);
  let la = Math.exp(base - L.home / 2 + away.att - home.def - gap);
  const s = P.model.spread ?? 1;
  if (s !== 1) { const T = lh + la, x = Math.log(lh / la) * s; lh = T * Math.exp(x) / (1 + Math.exp(x)); la = T - lh; }
  return { lh: clamp(lh, 0.15, 5), la: clamp(la, 0.15, 5) };
}

// A club's state at the start of a game: season change → shrink toward the league mean.
export function seasonStart(t, season, P) {
  if (!season || t.season === season) return t;
  if (t.season === null || t.season === undefined) return { ...t, season };
  return { ...t, att: t.att * P.model.shrink, def: t.def * P.model.shrink, season };
}

// One gradient step on both clubs, the competition and (continental games) the domestic offsets.
// Returns the new states; nothing is mutated.
export function update(home, away, L, lh, la, hs, as, P, { cross = false, offH = 0, offA = 0 } = {}) {
  const rh = hs - lh, ra = as - la;
  const eh = etaOf(P, home.n), ea = etaOf(P, away.n), M = P.model.maxAbs;
  const h = { ...home, att: clamp(home.att + eh * rh, -M, M), def: clamp(home.def - eh * ra, -M, M), n: home.n + 1 };
  const a = { ...away, att: clamp(away.att + ea * ra, -M, M), def: clamp(away.def - ea * rh, -M, M), n: away.n + 1 };
  const lg = { ...L, home: clamp(L.home + P.model.etaHome * (rh - ra) / 2, -0.3, 0.8), goals: L.goals + hs + as, games: L.games + 2 };
  const off = cross ? { offH: clamp(offH + P.model.etaOff * (rh - ra) / 2, -1, 1), offA: clamp(offA - P.model.etaOff * (rh - ra) / 2, -1, 1) } : null;
  return { home: h, away: a, league: lg, off };
}

// ---------- market blend ----------
// log-space blend of the bookmaker's implied expected goals with the model's, weight by tier and
// reduced while a club is new (few games behind its figures).
export function blend(mkt, model, { tier = 3, nMin = 0 }, P) {
  const w0 = P.market.blend[tier] ?? P.market.blend[3] ?? 0.2;
  const w = w0 * (nMin >= P.model.kN ? 1 : P.market.blendNew + (1 - P.market.blendNew) * nMin / P.model.kN);
  return {
    lh: Math.exp((1 - w) * Math.log(mkt.lh) + w * Math.log(model.lh)),
    la: Math.exp((1 - w) * Math.log(mkt.la) + w * Math.log(model.la)),
    w,
  };
}
