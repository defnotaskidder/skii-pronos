// Trains the hockey model on NHL history and writes lib/hockey-params.json + scripts/hockey-report.md.
//
//   node scripts/train-hockey.mjs            # uses cached months in .cache/nhl, downloads what's missing
//   node scripts/train-hockey.mjs --from 2021 --to 2026 --holdout 2026
//
// Everything is walk-forward: a game is predicted only from games played before it (season-to-date
// table and shots, last-10 form, rest days, Elo carried across seasons), exactly the information
// the live engine has from ESPN standings, team statistics and lib/ratings.js. Parameters are fit
// by maximum likelihood (regulation score matrix, OT and shootout winners, Elo win chance), then
// scored on a held-out season against naive baselines before the final fit on every season.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PARAMS, eloExpected, eloUpdate, features, leagueMu, outcomes, regMatrix, sigmoid } from "../lib/hockey-core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : null)).filter(Boolean));
const FROM = Number(args.from || 2021); // first season start year (2021 → 2021-22)
const TO = Number(args.to || 2026); // last season start year included (its games to date)
const HOLDOUT = Number(args.holdout || TO - 1); // season start year scored out-of-sample
const CACHE = args.cache || path.join(ROOT, ".cache", "nhl");
fs.mkdirSync(CACHE, { recursive: true });

// ---------- data ----------
const monthsOf = (startYear) => {
  const out = [];
  for (let m = 9; m <= 12; m++) out.push(`${startYear}${String(m).padStart(2, "0")}`);
  for (let m = 1; m <= 6; m++) out.push(`${startYear + 1}${String(m).padStart(2, "0")}`);
  return out;
};
async function month(ym) {
  const file = path.join(CACHE, `${ym}.json`);
  if (fs.existsSync(file) && fs.statSync(file).size > 100) return JSON.parse(fs.readFileSync(file, "utf8"));
  const url = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${ym}&limit=1000`;
  process.stdout.write(`  fetching ${ym}…\n`);
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; SkiiPronos/1.0)" } });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${ym}`);
  const txt = await res.text();
  fs.writeFileSync(file, txt);
  await new Promise((r) => setTimeout(r, 400));
  return JSON.parse(txt);
}

function parseGame(e) {
  const c = e.competitions?.[0];
  const st = c?.status?.type;
  if (!c || !st?.completed) return null;
  const type = e.season?.type;
  if (type !== 2 && type !== 3) return null; // regular season + playoffs only
  const H = c.competitors.find((x) => x.homeAway === "home"), A = c.competitors.find((x) => x.homeAway === "away");
  if (!H || !A) return null;
  const hs = Number(H.score), as = Number(A.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) return null;
  const detail = st.shortDetail || st.detail || "";
  const ot = /SO/.test(detail) ? "SO" : /OT/.test(detail) ? "OT" : null;
  const reg = (x) => (x.linescores || []).filter((l) => l.period <= 3).reduce((s, l) => s + (Number(l.value) || 0), 0);
  let rh = reg(H), ra = reg(A);
  if (!H.linescores?.length) { rh = ot ? Math.min(hs, as) : hs; ra = ot ? Math.min(hs, as) : as; }
  if (ot && rh !== ra) { rh = Math.min(hs, as); ra = rh; } // guard against odd linescores
  // goals that count for shots / totals: final minus the shootout credit
  const gh = ot === "SO" ? (hs > as ? hs - 1 : hs) : hs, ga = ot === "SO" ? (as > hs ? as - 1 : as) : as;
  const stat = (x, name) => { const s = (x.statistics || []).find((y) => y.name === name); return s ? Number(s.displayValue ?? s.value) : null; };
  const svH = stat(H, "saves"), svA = stat(A, "saves");
  return {
    id: e.id, date: new Date(e.date).getTime(), season: e.season.year - 1, playoff: type === 3,
    home: H.team.id, away: A.team.id, hs, as, rh, ra, ot,
    gh, ga, // goals excl. shootout credit
    shH: svA !== null ? svA + gh : null, shA: svH !== null ? svH + ga : null, // shots for each side
  };
}

async function load() {
  const games = new Map();
  for (let y = FROM; y <= TO; y++) {
    for (const ym of monthsOf(y)) {
      if (Number(ym) > Number(new Date().toISOString().slice(0, 7).replace("-", ""))) continue;
      let d;
      try { d = await month(ym); } catch (e) { console.warn(`  ${ym}: ${e.message}`); continue; }
      for (const e of d.events || []) { const g = parseGame(e); if (g) games.set(g.id, g); }
    }
  }
  return [...games.values()].sort((a, b) => a.date - b.date);
}

// ---------- walk-forward feature builder ----------
// Replays the seasons in order and returns, per game, the context the model sees before it.
function replay(games, P, { eloOnly = false } = {}) {
  const elo = new Map(); // team → { rating, games }
  const season = new Map(); // team → table (reset each season)
  const last = new Map(); // team → last game time
  let curSeason = null, regGoals = 0, teamGames = 0, muPrior = DEFAULT_PARAMS.league.mu, shots = 0, shotGames = 0, SPrior = DEFAULT_PARAMS.league.S;
  const rows = [];
  const tbl = (id) => season.get(id) || { gp: 0, gf: 0, ga: 0, sf: 0, sa: 0, sgp: 0, pts: 0, l10: [] };
  const rt = (id) => elo.get(id) || { rating: 1500, games: 0 };
  for (const g of games) {
    if (g.season !== curSeason) {
      if (curSeason !== null && teamGames > 200) { muPrior = regGoals / teamGames; if (shotGames > 200) SPrior = shots / shotGames; }
      curSeason = g.season; season.clear(); regGoals = 0; teamGames = 0; shots = 0; shotGames = 0;
    }
    const H = tbl(g.home), A = tbl(g.away), RH = rt(g.home), RA = rt(g.away);
    const rest = (id) => { const t = last.get(id); if (!t) return null; const h = (g.date - t) / 3.6e6; return h < 30 ? 0 : Math.max(1, Math.floor(h / 24)); };
    const mu = leagueMu(regGoals, teamGames, muPrior);
    const S = shotGames ? leagueMu(shots, shotGames, SPrior) : SPrior;
    const team = (T, R, id) => ({
      gp: T.gp, gf: T.gf, ga: T.ga, sf: T.sgp ? T.sf * (T.gp / T.sgp) : undefined, sa: T.sgp ? T.sa * (T.gp / T.sgp) : undefined,
      pts: T.pts, l10gp: T.l10.length, l10pts: T.l10.reduce((s, x) => s + x, 0), rating: R.rating, ratingGames: R.games, rest: rest(id),
    });
    const row = { g, home: team(H, RH, g.home), away: team(A, RA, g.away), lg: { mu, S, playoff: g.playoff }, eloExp: eloExpected(RH.rating, RA.rating, P) };
    if (!eloOnly) row.lam = features(row.home, row.away, row.lg, P);
    rows.push(row);
    // update state with the game
    const up = eloUpdate(RH, RA, g.hs, g.as, g.ot, P);
    elo.set(g.home, { rating: up.home, games: RH.games + 1 });
    elo.set(g.away, { rating: up.away, games: RA.games + 1 });
    const pts = (win, ot) => (win ? 2 : ot ? 1 : 0);
    const push = (T, gf, ga, sf, sa, win) => {
      const n = { ...T, gp: T.gp + 1, gf: T.gf + gf, ga: T.ga + ga, pts: T.pts + pts(win, g.ot), l10: [...T.l10, pts(win, g.ot)].slice(-10) };
      if (sf !== null && sa !== null) { n.sf += sf; n.sa += sa; n.sgp++; }
      return n;
    };
    season.set(g.home, push(H, g.hs, g.as, g.shH, g.shA, g.hs > g.as));
    season.set(g.away, push(A, g.as, g.hs, g.shA, g.shH, g.as > g.hs));
    regGoals += g.rh + g.ra; teamGames += 2;
    if (g.shH !== null && g.shA !== null) { shots += g.shH + g.shA; shotGames += 2; }
    last.set(g.home, g.date); last.set(g.away, g.date);
  }
  return rows;
}

// ---------- optimiser ----------
function nelderMead(f, x0, { step = 0.1, iters = 2000, tol = 1e-7 } = {}) {
  const n = x0.length;
  const steps = Array.isArray(step) ? step : x0.map(() => step);
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += steps[i]; simplex.push(x); }
  let vals = simplex.map(f);
  const order = () => { const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]); simplex = idx.map((i) => simplex[i]); vals = idx.map((i) => vals[i]); };
  for (let it = 0; it < iters; it++) {
    order();
    if (Math.abs(vals[n] - vals[0]) < tol * (1 + Math.abs(vals[0]))) break;
    const cen = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const refl = cen.map((c, j) => c + (c - worst[j]));
    const fr = f(refl);
    if (fr < vals[0]) {
      const exp = cen.map((c, j) => c + 2 * (c - worst[j])); const fe = f(exp);
      if (fe < fr) { simplex[n] = exp; vals[n] = fe; } else { simplex[n] = refl; vals[n] = fr; }
    } else if (fr < vals[n - 1]) { simplex[n] = refl; vals[n] = fr; }
    else {
      const con = cen.map((c, j) => c + 0.5 * (worst[j] - c)); const fc = f(con);
      if (fc < vals[n]) { simplex[n] = con; vals[n] = fc; }
      else { for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((x, j) => simplex[0][j] + 0.5 * (x - simplex[0][j])); vals[i] = f(simplex[i]); } }
    }
  }
  order();
  return { x: simplex[0], f: vals[0] };
}

// Logistic regression y ~ σ(k·x + b) by Newton's method.
function logisticFit(xs, ys, { ridge = 1e-3 } = {}) {
  let k = 0, b = 0;
  for (let it = 0; it < 50; it++) {
    let gk = -ridge * k, gb = 0, hkk = ridge, hkb = 0, hbb = 0;
    for (let i = 0; i < xs.length; i++) {
      const p = sigmoid(k * xs[i] + b), w = p * (1 - p);
      gk += (ys[i] - p) * xs[i]; gb += ys[i] - p;
      hkk += w * xs[i] * xs[i]; hkb += w * xs[i]; hbb += w;
    }
    const det = hkk * hbb - hkb * hkb;
    if (Math.abs(det) < 1e-12) break;
    const dk = (hbb * gk - hkb * gb) / det, db = (hkk * gb - hkb * gk) / det;
    k += dk; b += db;
    if (Math.abs(dk) + Math.abs(db) < 1e-8) break;
  }
  return { k, b };
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const r = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;
const logloss = (p, y) => -(y ? Math.log(Math.max(p, 1e-9)) : Math.log(Math.max(1 - p, 1e-9)));
const brier = (p, y) => (p - y) ** 2;

// ---------- fitting ----------
function fitElo(games, P0) {
  const f = (x) => {
    const P = clone(P0);
    P.elo.K = [2 * x[0], 1.4 * x[0], x[0]]; P.elo.home = x[1]; P.elo.otMult = x[2]; P.elo.gd = x[3];
    if (x[0] <= 1 || x[2] < 0.1 || x[2] > 1.5 || x[3] < 0 || x[3] > 1) return 1e9;
    const rows = replay(games, P, { eloOnly: true });
    let ll = 0, n = 0;
    for (const row of rows) { if (row.home.ratingGames >= 10 && row.away.ratingGames >= 10) { ll += logloss(row.eloExp, row.g.hs > row.g.as ? 1 : 0); n++; } }
    return ll / n;
  };
  const { x, f: v } = nelderMead(f, [P0.elo.K[2], P0.elo.home, P0.elo.otMult, P0.elo.gd], { step: [3, 15, 0.2, 0.1], iters: 400 });
  const P = clone(P0);
  P.elo.K = [r(2 * x[0], 2), r(1.4 * x[0], 2), r(x[0], 2)]; P.elo.home = r(x[1], 1); P.elo.otMult = r(x[2], 3); P.elo.gd = r(x[3], 3);
  return { P, logloss: v };
}

// Joint likelihood of the regulation score matrix under the strength model.
function goalsObjective(rows, P, which) {
  let ll = 0, n = 0;
  for (const row of rows) {
    if (which === "full" && !row.lam.shots) continue;
    const m = regMatrix(row.lam.lh, row.lam.la, P.goals.tau);
    const i = Math.min(row.g.rh, 12), j = Math.min(row.g.ra, 12);
    ll += -Math.log(Math.max(m[i][j], 1e-12)); n++;
  }
  return ll / n;
}

function fitGoals(games, P0, which) {
  // which = "full" (goal + shot rates) or "noShots" (goal rates only — what college hockey gets)
  const unpack = (x, P) => {
    P.goals.home = x[0]; P.goals.kG = Math.max(1, x[1]); P.goals.kS = Math.max(1, x[2]); P.goals.tau = Math.max(-0.2, x[3]); P.goals.playoff = x[4];
    P.goals.form = x[5]; P.goals.elo = x[6]; P.goals.rest.att = x[7]; P.goals.rest.def = x[8];
    const W = P.goals[which]; W.aG = x[9]; W.dG = x[10];
    if (which === "full") { W.aS = x[11]; W.dS = x[12]; } else { W.aS = 0; W.dS = 0; }
  };
  const strip = (P) => { // force the variant under test (so shot-less rows don't leak the other weights)
    const Q = clone(P);
    if (which === "noShots") Q.goals.full = Q.goals.noShots; else Q.goals.noShots = Q.goals.full;
    return Q;
  };
  const f = (x) => {
    const P = clone(P0); unpack(x, P);
    if (P.goals.kG > 200 || P.goals.kS > 200) return 1e9;
    return goalsObjective(replay(games, strip(P)), P, which);
  };
  const g = P0.goals, W = g[which];
  const x0 = [g.home, g.kG, g.kS, g.tau, g.playoff, g.form, g.elo, g.rest.att, g.rest.def, W.aG, W.dG, ...(which === "full" ? [W.aS, W.dS] : [])];
  const step = [0.05, 10, 10, 0.05, 0.05, 0.2, 0.2, 0.03, 0.03, 0.2, 0.2, ...(which === "full" ? [0.2, 0.2] : [])];
  const { x, f: v } = nelderMead(f, x0, { step, iters: 1500 });
  const P = clone(P0); unpack(x, P);
  for (const k of ["home", "kG", "kS", "tau", "playoff", "form", "elo"]) P.goals[k] = r(P.goals[k]);
  P.goals.rest.att = r(P.goals.rest.att); P.goals.rest.def = r(P.goals.rest.def);
  for (const k of Object.keys(P.goals[which])) P.goals[which][k] = r(P.goals[which][k]);
  return { P, logloss: v };
}

function fitOT(rows, P0) {
  const P = clone(P0);
  const tied = rows.filter((x) => x.g.ot);
  const reg = tied.filter((x) => !x.g.playoff);
  P.ot.q = r(reg.filter((x) => x.g.ot === "OT").length / Math.max(1, reg.length));
  const x = (row) => Math.log(row.lam.lh / row.lam.la);
  const otg = tied.filter((t) => t.g.ot === "OT");
  const so = tied.filter((t) => t.g.ot === "SO");
  const a = logisticFit(otg.map(x), otg.map((t) => (t.g.hs > t.g.as ? 1 : 0)));
  const b = logisticFit(so.map(x), so.map((t) => (t.g.hs > t.g.as ? 1 : 0)));
  P.ot.k = r(a.k); P.ot.b = r(a.b); P.ot.so.k = r(b.k); P.ot.so.b = r(b.b);
  return { P, counts: { tied: tied.length, otGoal: otg.length, shootout: so.length } };
}

// Damping of the strength gap: the value ≤ 1 that minimises walk-forward moneyline + 60-minute log
// loss (never sharpened beyond the goals model: favourites already land a little less often than
// the raw model says in some seasons).
function fitSpread(rows, P0) {
  let best = 1, bv = Infinity;
  for (let s = 0.5; s <= 1.0001; s += 0.02) {
    const P = clone(P0); P.goals.spread = s;
    let v = 0, n = 0;
    for (const row of rows) {
      if (row.home.gp < 5 || row.away.gp < 5) continue;
      const o = outcomes(row.lam.lh, row.lam.la, P, { playoff: row.g.playoff });
      const y = row.g.hs > row.g.as ? 1 : 0;
      v += logloss(o.ml.h, y) - Math.log(Math.max(row.g.ot ? o.reg.d : y ? o.reg.h : o.reg.a, 1e-9)); n++;
    }
    if (v / n < bv) { bv = v / n; best = s; }
  }
  const P = clone(P0); P.goals.spread = r(best, 2);
  return { P, value: bv };
}

function fitAll(games, P0, log) {
  let P = clone(P0);
  const e = fitElo(games, P); P = e.P; log(`  Elo: K=${P.elo.K.join("/")} home=${P.elo.home} otMult=${P.elo.otMult} gd=${P.elo.gd} (log loss ${r(e.logloss)})`);
  const g1 = fitGoals(games, P, "full"); P = g1.P; log(`  goals (full): home=${P.goals.home} kG=${P.goals.kG} kS=${P.goals.kS} tau=${P.goals.tau} playoff=${P.goals.playoff} form=${P.goals.form} elo=${P.goals.elo} rest=${P.goals.rest.att}/${P.goals.rest.def} W=${JSON.stringify(P.goals.full)} (nll ${r(g1.logloss)})`);
  const g2 = fitGoals(games, P, "noShots"); // refit only the goal-rate weights with shots removed
  P.goals.noShots = g2.P.goals.noShots; log(`  goals (no shots): W=${JSON.stringify(P.goals.noShots)} (nll ${r(g2.logloss)})`);
  const rows = replay(games, P);
  const o = fitOT(rows, P); P = o.P; log(`  OT: q=${P.ot.q} k=${P.ot.k} b=${P.ot.b} shootout k=${P.ot.so.k} b=${P.ot.so.b} (${JSON.stringify(o.counts)})`);
  const sp = fitSpread(rows, P); P = sp.P; log(`  spread damping: ${P.goals.spread} (ML + 60-min log loss ${r(sp.value)})`);
  // league constants from the data: long-run regulation rate, shots per game, regulation share of standings goals
  const regG = games.reduce((s, g) => s + g.rh + g.ra, 0), allG = games.reduce((s, g) => s + g.hs + g.as, 0);
  const sh = games.filter((g) => g.shH !== null && g.shA !== null);
  P.league = { mu: r(regG / (2 * games.length), 3), S: r(sh.reduce((s, g) => s + g.shH + g.shA, 0) / (2 * sh.length), 2), regShare: r(regG / allG) };
  return P;
}

// ---------- evaluation ----------
function evaluate(rows, P, trainRows) {
  const homeRate = mean(trainRows.map((x) => (x.g.hs > x.g.as ? 1 : 0)));
  const regFreq = ["h", "d", "a"].map((k) => mean(trainRows.map((x) => (k === "d" ? x.g.ot : k === "h" ? !x.g.ot && x.g.hs > x.g.as : !x.g.ot && x.g.hs < x.g.as) ? 1 : 0)));
  const totals = (list) => (line) => mean(list.map((x) => (x.g.gh + x.g.ga > line ? 1 : 0)));
  const trainOver = totals(trainRows), trainPuck = mean(trainRows.map((x) => (x.g.rh - x.g.ra >= 2 ? 1 : 0)));
  const acc = { n: 0, ml: { ll: 0, br: 0, acc: 0, llBase: 0, brBase: 0, llElo: 0, brElo: 0 }, reg: { ll: 0, llBase: 0 }, tot: {}, puck: { br: 0, brBase: 0 }, meanPred: 0, meanAct: 0, cal: Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 })), picks: { n: 0, p: 0, y: 0 } };
  for (const L of [5.5, 6.5]) acc.tot[L] = { br: 0, brBase: 0, ll: 0, llBase: 0 };
  for (const row of rows) {
    const o = outcomes(row.lam.lh, row.lam.la, P, { playoff: row.g.playoff });
    const y = row.g.hs > row.g.as ? 1 : 0;
    acc.n++;
    acc.ml.ll += logloss(o.ml.h, y); acc.ml.br += brier(o.ml.h, y); acc.ml.acc += (o.ml.h >= 0.5) === (y === 1) ? 1 : 0;
    acc.ml.llBase += logloss(homeRate, y); acc.ml.brBase += brier(homeRate, y);
    acc.ml.llElo += logloss(row.eloExp, y); acc.ml.brElo += brier(row.eloExp, y);
    const regY = row.g.ot ? 1 : y ? 0 : 2;
    acc.reg.ll += -Math.log(Math.max([o.reg.h, o.reg.d, o.reg.a][regY], 1e-9)); acc.reg.llBase += -Math.log(regFreq[regY]);
    const tot = row.g.gh + row.g.ga;
    for (const L of [5.5, 6.5]) {
      const p = o.total(L).p, yy = tot > L ? 1 : 0;
      acc.tot[L].br += brier(p, yy); acc.tot[L].brBase += brier(trainOver(L), yy); acc.tot[L].ll += logloss(p, yy); acc.tot[L].llBase += logloss(trainOver(L), yy);
    }
    const pk = o.puck("home", -1.5).p, py = row.g.rh - row.g.ra >= 2 ? 1 : 0;
    acc.puck.br += brier(pk, py); acc.puck.brBase += brier(trainPuck, py);
    acc.meanPred += row.lam.lh + row.lam.la + o.otGoal; acc.meanAct += tot;
    const b = Math.min(9, Math.floor(o.ml.h * 10)); acc.cal[b].n++; acc.cal[b].p += o.ml.h; acc.cal[b].y += y;
    const fav = Math.max(o.ml.h, o.ml.a);
    if (fav >= 0.6) { acc.picks.n++; acc.picks.p += fav; acc.picks.y += (o.ml.h >= o.ml.a ? y : 1 - y); }
  }
  const n = acc.n;
  return {
    games: n,
    moneyline: { logloss: r(acc.ml.ll / n), brier: r(acc.ml.br / n), accuracy: r(acc.ml.acc / n), baseline: { logloss: r(acc.ml.llBase / n), brier: r(acc.ml.brBase / n), homeRate: r(homeRate) }, eloOnly: { logloss: r(acc.ml.llElo / n), brier: r(acc.ml.brElo / n) } },
    regulation3way: { logloss: r(acc.reg.ll / n), baseline: r(acc.reg.llBase / n) },
    totals: Object.fromEntries(Object.entries(acc.tot).map(([L, t]) => [L, { brier: r(t.br / n), baselineBrier: r(t.brBase / n), logloss: r(t.ll / n), baselineLogloss: r(t.llBase / n) }])),
    puckLineHomeMinus15: { brier: r(acc.puck.br / n), baselineBrier: r(acc.puck.brBase / n) },
    meanTotal: { predicted: r(acc.meanPred / n, 3), actual: r(acc.meanAct / n, 3) },
    calibration: acc.cal.map((c, i) => ({ bucket: `${i * 10}–${i * 10 + 10}%`, n: c.n, predicted: c.n ? r(c.p / c.n, 3) : null, actual: c.n ? r(c.y / c.n, 3) : null })).filter((c) => c.n),
    favourites60: { n: acc.picks.n, predicted: r(acc.picks.p / Math.max(1, acc.picks.n), 3), actual: r(acc.picks.y / Math.max(1, acc.picks.n), 3) },
  };
}

// ---------- main ----------
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };
const t0 = Date.now();
log(`# Hockey model training report\n`);
log(`Generated ${new Date().toISOString()} · seasons ${FROM}-${String(FROM + 1).slice(2)} → ${TO}-${String(TO + 1).slice(2)} · hold-out ${HOLDOUT}-${String(HOLDOUT + 1).slice(2)}\n`);
const games = await load();
const bySeason = {};
for (const g of games) bySeason[g.season] = (bySeason[g.season] || 0) + 1;
log(`Games: ${games.length} (${Object.entries(bySeason).map(([s, n]) => `${s}-${String(Number(s) + 1).slice(2)}: ${n}`).join(", ")})`);
log(`Regulation ties: ${r(mean(games.map((g) => (g.ot ? 1 : 0))), 3)} · decided in OT ${games.filter((g) => g.ot === "OT").length} · shootout ${games.filter((g) => g.ot === "SO").length} · home win rate ${r(mean(games.map((g) => (g.hs > g.as ? 1 : 0))), 3)}\n`);

// 1) hold-out run: fit on seasons before HOLDOUT, score HOLDOUT (and anything after it)
log(`## Hold-out fit (train < ${HOLDOUT}-${String(HOLDOUT + 1).slice(2)})`);
const train = games.filter((g) => g.season < HOLDOUT);
const Ph = fitAll(train, DEFAULT_PARAMS, log);
const rowsAll = replay(games, Ph); // walk-forward over everything so the hold-out starts with learnt Elo
const testRows = rowsAll.filter((x) => x.g.season === HOLDOUT);
const trainRows = rowsAll.filter((x) => x.g.season < HOLDOUT);
const ev = evaluate(testRows, Ph, trainRows);
log(`\n### Out-of-sample: ${HOLDOUT}-${String(HOLDOUT + 1).slice(2)} (${ev.games} games)\n`);
log(`| Market | Model | Baseline |\n|---|---|---|`);
log(`| Moneyline log loss | ${ev.moneyline.logloss} | ${ev.moneyline.baseline.logloss} (home rate ${ev.moneyline.baseline.homeRate}) · Elo only ${ev.moneyline.eloOnly.logloss} |`);
log(`| Moneyline Brier | ${ev.moneyline.brier} | ${ev.moneyline.baseline.brier} · Elo only ${ev.moneyline.eloOnly.brier} |`);
log(`| Moneyline accuracy | ${ev.moneyline.accuracy} | ${ev.moneyline.baseline.homeRate} |`);
log(`| 60-minute 1X2 log loss | ${ev.regulation3way.logloss} | ${ev.regulation3way.baseline} |`);
for (const [L, t] of Object.entries(ev.totals)) log(`| Over ${L} Brier / log loss | ${t.brier} / ${t.logloss} | ${t.baselineBrier} / ${t.baselineLogloss} |`);
log(`| Puck line −1.5 Brier | ${ev.puckLineHomeMinus15.brier} | ${ev.puckLineHomeMinus15.baselineBrier} |`);
log(`| Mean total goals | ${ev.meanTotal.predicted} | actual ${ev.meanTotal.actual} |`);
log(`\nCalibration of the home moneyline chance (hold-out):\n\n| Bucket | Games | Predicted | Actual |\n|---|---|---|---|`);
for (const c of ev.calibration) log(`| ${c.bucket} | ${c.n} | ${c.predicted} | ${c.actual} |`);
log(`\nFavourites the model puts at ≥60%: ${ev.favourites60.n} games, predicted ${ev.favourites60.predicted}, actual ${ev.favourites60.actual}\n`);
const later = rowsAll.filter((x) => x.g.season > HOLDOUT);
if (later.length) {
  const ev2 = evaluate(later, Ph, trainRows);
  log(`### Current season to date (${later.length} games, same hold-out parameters)\n`);
  log(`Moneyline log loss ${ev2.moneyline.logloss} (baseline ${ev2.moneyline.baseline.logloss}, Elo only ${ev2.moneyline.eloOnly.logloss}) · accuracy ${ev2.moneyline.accuracy} · mean total predicted ${ev2.meanTotal.predicted} vs actual ${ev2.meanTotal.actual}\n`);
}

// 2) production fit on every season
log(`## Production fit (all seasons)`);
const P = fitAll(games, Ph, log);
P.version = 1;
P.trainedAt = new Date().toISOString();
P.trained = { seasons: Object.keys(bySeason).map((s) => `${s}-${String(Number(s) + 1).slice(2)}`), games: games.length, holdout: `${HOLDOUT}-${String(HOLDOUT + 1).slice(2)}` };
P.market = DEFAULT_PARAMS.market;
P.elo.minGames = DEFAULT_PARAMS.elo.minGames;
P.metrics = { holdout: ev };
const inRows = replay(games, P);
const evIn = evaluate(inRows.filter((x) => x.g.season >= FROM + 1), P, inRows);
log(`\nIn-sample (seasons after the first): moneyline log loss ${evIn.moneyline.logloss} (baseline ${evIn.moneyline.baseline.logloss}) · over 6.5 Brier ${evIn.totals["6.5"].brier} (baseline ${evIn.totals["6.5"].baselineBrier})`);

fs.writeFileSync(path.join(ROOT, "lib", "hockey-params.json"), JSON.stringify(P, null, 2) + "\n");
log(`\nParameters written to lib/hockey-params.json · ${Math.round((Date.now() - t0) / 1000)} s`);
log(`\n## How to read the parameters\n
- \`goals.home\`: home-ice edge in log goals (split half/half between the two sides).
- \`goals.kG\` / \`goals.kS\`: pseudo-games of league-average goals / shots a team's season rates are shrunk toward (early-season humility).
- \`goals.full\` / \`goals.noShots\`: weights on goals-for, shot-volume, goals-against and shots-against rates — the second set is used where the feed has no shot data (college hockey).
- \`goals.form\`: weight on last-10 points% minus season points%; \`goals.elo\`: weight on the Elo gap (per 400 points); \`goals.rest\`: back-to-back effects on own scoring and own defence.
- \`goals.tau\`: extra probability mass on regulation ties beyond independent Poisson.
- \`goals.spread\`: damping of the gap between the two expected-goal figures before pricing (teams are less different game to game than their season rates say).
- \`ot\`: share of ties decided in overtime (regular season) and how strength tilts the OT and shootout winners.
- \`elo\`: hockey Elo (K by experience, home-ice points, OT/SO damping, margin bonus) used by lib/ratings.js for hockey games.
- \`market.statsWeight\`: how far the live model pulls DraftKings' implied expected goals toward its own estimate (not fitted: no historical prices).`);
fs.writeFileSync(path.join(here, "hockey-report.md"), lines.join("\n") + "\n");
