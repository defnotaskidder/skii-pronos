// Trains the football model on the history in .cache/soccer (scripts/soccer-history.mjs) and writes
// lib/soccer-params.json + scripts/soccer-report.md.
//
//   node scripts/train-soccer.mjs                 # hold-out 2025-26, then a production fit on everything
//   node scripts/train-soccer.mjs --holdout 2025-07-01 --quick
//
// Everything is walk-forward: every club's attack / defence, every competition's scoring rate and home
// advantage, and the cross-league offsets are learnt game by game in date order (lib/soccer-core.js),
// exactly as the live engine keeps learning from results. The few global parameters (learning rates,
// season shrink, Dixon-Coles ρ, …) are fit by maximum likelihood of the exact scores; the market blend
// (how far the bookmaker's implied expected goals move toward the model's, by league tier) is fit on
// 1X2 log loss against the closing line, then everything is scored on a season the fit never saw.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PARAMS, blend, expectedGoals, matrix, newLeague, newTeam, outcome, overProb, scoreProb, seasonStart, update, leagueMu } from "../lib/soccer-core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : null)).filter(Boolean));
const HOLDOUT = Date.parse(args.holdout || "2025-07-01T00:00:00Z"); // games from here on are scored out-of-sample
const HOLDOUT_END = Date.parse(args.holdoutEnd || "2026-07-01T00:00:00Z"); // … up to here (later = current season)
const QUICK = !!args.quick;
const DIR = path.join(ROOT, ".cache", "soccer");
const DOMESTIC = /^[a-z]+\.\d$/;

// ---------- leagues & tiers (same rule as lib/leagues.js) ----------
const leagueSrc = fs.readFileSync(path.join(ROOT, "lib", "leagues.js"), "utf8");
const TIER = {};
for (const m of leagueSrc.matchAll(/\{ id: "([a-z0-9._-]+)",[^\n]*?tier: (\d)/g)) TIER[m[1]] = Number(m[2]);
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "soccer-leagues.json"), "utf8"));
for (const [, slug, , women] of catalog) {
  if (TIER[slug]) continue;
  TIER[slug] = women ? 5 : /ncaa|u1\d|u2\d|youth|olympic/i.test(slug) ? 6 : /friendly/.test(slug) ? 5 : (slug.match(/^[a-z]+\.(\d)$/) && Number(slug.match(/^[a-z]+\.(\d)$/)[1]) >= 2) ? 4 : 3;
}
const tierOf = (league) => TIER[league] ?? 4;

// ---------- data ----------
function loadGames() {
  const games = new Map();
  const root = path.join(DIR, "months");
  for (const league of fs.readdirSync(root)) {
    for (const f of fs.readdirSync(path.join(root, league))) {
      const d = JSON.parse(fs.readFileSync(path.join(root, league, f), "utf8"));
      for (const e of d.events || []) {
        if (!e.completed || e.state !== "post") continue;
        const H = e.competitors?.find((x) => x.homeAway === "home"), A = e.competitors?.find((x) => x.homeAway === "away");
        if (!H?.id || !A?.id || H.id === A.id) continue;
        const hs = Number(H.score), as = Number(A.score);
        if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
        if (/abandon|postpon|cancel|awarded/i.test(e.detail || "")) continue;
        games.set(e.id, { id: e.id, date: Date.parse(e.date), season: e.season || new Date(e.date).getUTCFullYear(), league, home: H.id, away: A.id, hs, as, neutral: !!e.neutral });
      }
    }
  }
  return [...games.values()].sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
}
function loadOdds() {
  const out = new Map();
  const root = path.join(DIR, "odds");
  if (!fs.existsSync(root)) return out;
  for (const f of fs.readdirSync(root)) {
    const d = JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
    for (const [id, o] of Object.entries(d.games || {})) if (o && o.h > 1 && o.d > 1 && o.a > 1) out.set(id, o);
  }
  return out;
}

// ---------- market maths (same as lib/model.js) ----------
function devig(odds) {
  const inv = odds.map((o) => (o && o > 1 ? 1 / o : 0));
  if (inv.some((x) => x === 0)) return null;
  const book = inv.reduce((a, b) => a + b, 0);
  if (book <= 1) return inv.map((x) => x / book);
  let lo = 1, hi = 3;
  for (let i = 0; i < 50; i++) { const k = (lo + hi) / 2; const s = inv.reduce((a, p) => a + p ** k, 0); if (s > 1) lo = k; else hi = k; }
  const k = (lo + hi) / 2;
  return inv.map((p) => p ** k);
}
const RHO_MKT = DEFAULT_PARAMS.model.rho;
// Expected goals that reproduce the market's 1X2 (and total): ratio scan at the total's level, then a
// joint refinement — ~150 matrix builds per game instead of the live engine's 640.
function marketGoals(p1x2, over) {
  const err = (lh, la) => {
    const m = matrix(lh, la, RHO_MKT), o = outcome(m);
    let e = (o.h - p1x2.h) ** 2 + (o.d - p1x2.d) ** 2 + (o.a - p1x2.a) ** 2;
    if (over) e += 1.5 * (overProb(m, over.line) - over.p) ** 2;
    return e;
  };
  let T = 2.6;
  if (over) { // total goals whose Poisson over-probability matches the market
    let lo = 0.8, hi = 6;
    for (let i = 0; i < 30; i++) { T = (lo + hi) / 2; const p = pmf(T); let s = 0; for (let k = 0; k <= MAXG_T; k++) if (k > over.line) s += p[k]; if (s > over.p) hi = T; else lo = T; }
  }
  let best = null;
  const tryXT = (x, t) => { const lh = t * Math.exp(x) / (1 + Math.exp(x)), la = t - lh; if (lh < 0.1 || la < 0.1) return; const e = err(lh, la); if (!best || e < best.e) best = { e, lh, la, x, t }; };
  for (let x = -2; x <= 2.0001; x += 0.1) tryXT(x, T);
  if (!over) for (let t = 1.6; t <= 4.0001; t += 0.3) tryXT(best.x, t);
  const bx = best.x, bt = best.t;
  for (let x = bx - 0.1; x <= bx + 0.1001; x += 0.02) for (let t = bt - 0.24; t <= bt + 0.2401; t += 0.06) tryXT(x, t);
  const b2x = best.x, b2t = best.t;
  for (let x = b2x - 0.02; x <= b2x + 0.0201; x += 0.005) for (let t = b2t - 0.06; t <= b2t + 0.0601; t += 0.02) tryXT(x, t);
  return { lh: best.lh, la: best.la, err: best.e };
}
const MAXG_T = 20;
function pmf(l) { const p = new Array(MAXG_T + 1); p[0] = Math.exp(-l); for (let k = 1; k <= MAXG_T; k++) p[k] = p[k - 1] * l / k; return p; }

// Market view of every priced game, cached on disk (it does not depend on the model's parameters).
function marketViews(games, odds) {
  const file = path.join(DIR, "market.json");
  const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  let added = 0;
  for (const g of games) {
    const o = odds.get(g.id);
    if (!o || cache[g.id]) continue;
    const f = devig([o.h, o.d, o.a]);
    if (!f) continue;
    const p1x2 = { h: f[0], d: f[1], a: f[2] };
    let over = null;
    if (o.tl !== null && o.to > 1 && o.tu > 1) { const t = devig([o.to, o.tu]); if (t) over = { line: o.tl, p: t[0] }; }
    const mg = marketGoals(p1x2, over);
    cache[g.id] = { p: [p1x2.h, p1x2.d, p1x2.a], over: over ? [over.line, over.p] : null, lh: r(mg.lh), la: r(mg.la), prov: o.prov };
    if (++added % 2000 === 0) { fs.writeFileSync(file, JSON.stringify(cache)); process.stdout.write(`  market views ${added}\n`); }
  }
  if (added) fs.writeFileSync(file, JSON.stringify(cache));
  return cache;
}

// ---------- walk-forward replay ----------
// Replays every game in date order and returns, per game, what the model thought before it.
function replay(games, P, { keepState = false } = {}) {
  const teams = new Map(), leagues = new Map(), offsets = new Map(); // offsets: domestic league → offset
  const rows = new Array(games.length);
  const dom = (t) => t.league; // a club's domestic league (last domestic competition it played in)
  for (let k = 0; k < games.length; k++) {
    const g = games[k];
    let L = leagues.get(g.league);
    if (!L) { L = newLeague(P, g.season); leagues.set(g.league, L); }
    else if (L.season !== g.season) { L = { ...L, muPrev: L.games >= 60 ? leagueMu(L, P) : L.muPrev, goals: 0, games: 0, season: g.season }; }
    const isDom = DOMESTIC.test(g.league);
    let H = teams.get(g.home) || newTeam(P, isDom ? g.league : null, g.season);
    let A = teams.get(g.away) || newTeam(P, isDom ? g.league : null, g.season);
    H = seasonStart(H, g.season, P); A = seasonStart(A, g.season, P);
    const cross = !!(dom(H) && dom(A) && dom(H) !== dom(A));
    const offH = cross ? offsets.get(dom(H)) || 0 : 0, offA = cross ? offsets.get(dom(A)) || 0 : 0;
    const { lh, la } = expectedGoals(H, A, L, P, { offH, offA, cross });
    rows[k] = { g, lh, la, nH: H.n, nA: A.n, lgGames: L.games, cross };
    const u = update(H, A, L, lh, la, g.hs, g.as, P, { cross, offH, offA });
    if (isDom) { u.home.league = g.league; u.away.league = g.league; }
    teams.set(g.home, u.home); teams.set(g.away, u.away); leagues.set(g.league, u.league);
    if (u.off) { offsets.set(dom(H), u.off.offH); offsets.set(dom(A), u.off.offA); }
  }
  if (keepState) { rows.teams = teams; rows.leagues = leagues; rows.offsets = offsets; }
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
const golden = (f, lo, hi, iters = 30) => {
  const gr = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi, c = b - gr * (b - a), d = a + gr * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < iters; i++) { if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); } }
  return (a + b) / 2;
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const r = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const ll3 = (p, y) => -Math.log(Math.max(p[y], 1e-9));
const ll2 = (p, y) => -(y ? Math.log(Math.max(p, 1e-9)) : Math.log(Math.max(1 - p, 1e-9)));
const res3 = (g) => (g.hs > g.as ? 0 : g.hs === g.as ? 1 : 2);

// ---------- fitting the strength model ----------
// Score likelihood over games whose clubs have some history (the warm-up games can't be judged).
function objective(rows, P, until) {
  let ll = 0, n = 0;
  for (const row of rows) {
    if (row.g.date >= until || row.nH < 3 || row.nA < 3) continue;
    ll += -Math.log(scoreProb(row.g.hs, row.g.as, row.lh, row.la, P.model.rho)); n++;
  }
  return n ? ll / n : 1e9;
}
function fitModel(games, P0, until, log) {
  const keys = ["eta", "etaNew", "kN", "shrink", "newTeam", "rho", "home", "etaHome", "kMu", "etaOff", "spread"];
  const lo = { eta: 0.005, etaNew: 0.02, kN: 2, shrink: 0.3, newTeam: -0.6, rho: -0.3, home: 0, etaHome: 0, kMu: 10, etaOff: 0, spread: 0.6 };
  const hi = { eta: 0.3, etaNew: 0.6, kN: 60, shrink: 1, newTeam: 0.3, rho: 0.1, home: 0.6, etaHome: 0.05, kMu: 600, etaOff: 0.2, spread: 1.8 };
  const unpack = (x) => { const P = clone(P0); keys.forEach((k, i) => { P.model[k] = x[i]; }); return P; };
  const f = (x) => {
    for (let i = 0; i < keys.length; i++) if (x[i] < lo[keys[i]] || x[i] > hi[keys[i]]) return 1e9;
    const P = unpack(x);
    return objective(replay(games, P), P, until);
  };
  const x0 = keys.map((k) => P0.model[k]);
  const step = [0.02, 0.05, 5, 0.1, 0.1, 0.03, 0.05, 0.003, 60, 0.01, 0.1];
  const t0 = Date.now();
  const { x, f: v } = nelderMead(f, x0, { step, iters: QUICK ? 120 : 700, tol: 1e-6 });
  const P = unpack(x);
  for (const k of keys) P.model[k] = r(P.model[k], k === "kMu" || k === "kN" ? 1 : 4);
  log(`  strength model: ${keys.map((k) => `${k}=${P.model[k]}`).join(" ")} (score nll ${r(v)}, ${Math.round((Date.now() - t0) / 1000)} s)`);
  return { P, nll: v };
}

// ---------- market blend ----------
function probs3(lh, la, rho) { const o = outcome(matrix(lh, la, rho)); return [o.h, o.d, o.a]; }
function fitBlend(rows, mkt, P0, until, log) {
  const P = clone(P0);
  const tiers = [1, 2, 3, 4, 5];
  for (const t of tiers) {
    const list = rows.filter((row) => row.g.date < until && tierOf(row.g.league) === t && mkt[row.g.id] && row.nH >= 3 && row.nA >= 3);
    if (list.length < 150) { log(`  tier ${t}: ${list.length} priced games — weight kept at ${P.market.blend[t]}`); continue; }
    const f = (w) => { const Q = clone(P); Q.market.blend[t] = w; let s = 0; for (const row of list) { const m = mkt[row.g.id]; const b = blend({ lh: m.lh, la: m.la }, { lh: row.lh, la: row.la }, { tier: t, nMin: Math.min(row.nH, row.nA) }, Q); s += ll3(probs3(b.lh, b.la, Q.model.rho), res3(row.g)); } return s / list.length; };
    const w = r(golden(f, 0, 0.9, 20), 3);
    P.market.blend[t] = w;
    log(`  tier ${t}: ${list.length} priced games, model weight ${w} (1X2 log loss ${r(f(w))} · market alone ${r(f(0))} · model alone ${r(f(1))})`);
  }
  // how much a new club's figures count (fraction of the tier weight at zero games)
  const list = rows.filter((row) => row.g.date < until && mkt[row.g.id] && Math.min(row.nH, row.nA) < P.model.kN && row.nH >= 1 && row.nA >= 1);
  if (list.length >= 200) {
    const f = (b) => { const Q = clone(P); Q.market.blendNew = b; let s = 0; for (const row of list) { const m = mkt[row.g.id]; const bl = blend({ lh: m.lh, la: m.la }, { lh: row.lh, la: row.la }, { tier: tierOf(row.g.league), nMin: Math.min(row.nH, row.nA) }, Q); s += ll3(probs3(bl.lh, bl.la, Q.model.rho), res3(row.g)); } return s / list.length; };
    P.market.blendNew = r(golden(f, 0, 1, 16), 3);
    log(`  new clubs (${list.length} games): blend factor at zero games ${P.market.blendNew}`);
  }
  return P;
}

// ---------- evaluation ----------
function evaluate(rows, mkt, P, trainRows) {
  // baseline: league 1X2 frequencies from the training rows (league average when a league is new)
  const freq = new Map(); const all = [0, 0, 0];
  for (const row of trainRows) { const f = freq.get(row.g.league) || [0, 0, 0]; f[res3(row.g)]++; freq.set(row.g.league, f); all[res3(row.g)]++; }
  const base = (league) => { const f = freq.get(league); const src = f && f[0] + f[1] + f[2] >= 60 ? f : all; const n = src[0] + src[1] + src[2]; return src.map((x) => (x + 1) / (n + 3)); };
  const over25Base = mean(trainRows.map((row) => (row.g.hs + row.g.as > 2.5 ? 1 : 0)));
  const acc = { n: 0, model: 0, baseline: 0, priced: 0, mModel: 0, mMarket: 0, mBlend: 0, mDevig: 0, o25: { model: 0, market: 0, blend: 0, base: 0, n: 0 }, byTier: {}, cal: Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 })), bets: {} };
  const EDGES = [0, 0.03, 0.06];
  for (const e of EDGES) acc.bets[e] = { n: 0, units: 0, byMarket: {} };
  acc.safe = { n: 0, w: 0, units: 0, p: 0 };
  acc.safeByKey = {};
  acc.calModel = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  acc.calModelSettled = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (const row of rows) {
    if (row.nH < 3 || row.nA < 3) continue;
    const y = res3(row.g);
    const pm = probs3(row.lh, row.la, P.model.rho);
    acc.n++; acc.model += ll3(pm, y); acc.baseline += ll3(base(row.g.league), y);
    { // model alone: favourite outcome, every game / clubs with a season of history
      const fav = Math.max(...pm), fi = pm.indexOf(fav), bk = Math.min(9, Math.floor(fav * 10));
      acc.calModel[bk].n++; acc.calModel[bk].p += fav; acc.calModel[bk].y += fi === y ? 1 : 0;
      if (Math.min(row.nH, row.nA) >= 30) { acc.calModelSettled[bk].n++; acc.calModelSettled[bk].p += fav; acc.calModelSettled[bk].y += fi === y ? 1 : 0; }
    }
    const m = mkt[row.g.id];
    if (!m) continue;
    const t = tierOf(row.g.league);
    const b = blend({ lh: m.lh, la: m.la }, { lh: row.lh, la: row.la }, { tier: t, nMin: Math.min(row.nH, row.nA) }, P);
    const pMkt = probs3(m.lh, m.la, P.model.rho), pBl = probs3(b.lh, b.la, P.model.rho);
    acc.priced++; acc.mModel += ll3(pm, y); acc.mMarket += ll3(pMkt, y); acc.mBlend += ll3(pBl, y); acc.mDevig += ll3(m.p, y);
    const T = acc.byTier[t] || (acc.byTier[t] = { n: 0, model: 0, market: 0, blend: 0, devig: 0 });
    T.n++; T.model += ll3(pm, y); T.market += ll3(pMkt, y); T.blend += ll3(pBl, y); T.devig += ll3(m.p, y);
    if (m.over && m.over[0] === 2.5) {
      const yo = row.g.hs + row.g.as > 2.5 ? 1 : 0;
      acc.o25.n++; acc.o25.model += ll2(overProb(matrix(row.lh, row.la, P.model.rho), 2.5), yo); acc.o25.market += ll2(m.over[1], yo);
      acc.o25.blend += ll2(overProb(matrix(b.lh, b.la, P.model.rho), 2.5), yo); acc.o25.base += ll2(over25Base, yo);
    }
    const fav = Math.max(...pBl), fi = pBl.indexOf(fav);
    const bk = Math.min(9, Math.floor(fav * 10)); acc.cal[bk].n++; acc.cal[bk].p += fav; acc.cal[bk].y += fi === y ? 1 : 0;
    // betting at the closing price: every 1X2 side and (when the line is 2.5) over/under; 1 unit when
    // blend chance × odds clears the edge
    const o = ODDS.get(row.g.id);
    const mb = matrix(b.lh, b.la, P.model.rho);
    const cands = [["1", pBl[0], o.h, y === 0], ["X", pBl[1], o.d, y === 1], ["2", pBl[2], o.a, y === 2]];
    if (m.over && m.over[0] === 2.5 && o.to > 1 && o.tu > 1) { const po = overProb(mb, 2.5), yo = row.g.hs + row.g.as > 2.5; cands.push(["O2.5", po, o.to, yo], ["U2.5", 1 - po, o.tu, !yo]); }
    for (const e of EDGES) {
      const B = acc.bets[e];
      for (const [k, p, odds, won] of cands) {
        if (!(odds > 1) || p * odds < 1 + e) continue;
        B.n++; B.units += won ? odds - 1 : -1;
        const M = B.byMarket[k] || (B.byMarket[k] = { n: 0, units: 0 }); M.n++; M.units += won ? odds - 1 : -1;
      }
    }
    // the site's "safe pick" at a real price: the most likely of those sides when it clears 72 %
    const safe = cands.filter(([, p, odds]) => odds > 1 && p >= 0.72).sort((x, z) => z[1] - x[1])[0];
    if (safe) {
      acc.safe.n++; acc.safe.p += safe[1]; acc.safe.w += safe[3] ? 1 : 0; acc.safe.units += safe[3] ? safe[2] - 1 : -1;
      const S = acc.safeByKey[safe[0]] || (acc.safeByKey[safe[0]] = { n: 0, w: 0, units: 0 }); S.n++; S.w += safe[3] ? 1 : 0; S.units += safe[3] ? safe[2] - 1 : -1;
    }
  }
  const n = Math.max(1, acc.n), p = Math.max(1, acc.priced);
  return {
    games: acc.n, priced: acc.priced,
    all1x2: { model: r(acc.model / n), baseline: r(acc.baseline / n) },
    priced1x2: { model: r(acc.mModel / p), market: r(acc.mMarket / p), devig: r(acc.mDevig / p), blend: r(acc.mBlend / p) },
    byTier: Object.fromEntries(Object.entries(acc.byTier).map(([t, T]) => [t, { n: T.n, model: r(T.model / T.n), market: r(T.market / T.n), devig: r(T.devig / T.n), blend: r(T.blend / T.n) }])),
    over25: acc.o25.n ? { n: acc.o25.n, model: r(acc.o25.model / acc.o25.n), market: r(acc.o25.market / acc.o25.n), blend: r(acc.o25.blend / acc.o25.n), baseline: r(acc.o25.base / acc.o25.n) } : null,
    calibration: acc.cal.map((c, i) => ({ bucket: `${i * 10}–${i * 10 + 10}%`, n: c.n, predicted: c.n ? r(c.p / c.n, 3) : null, actual: c.n ? r(c.y / c.n, 3) : null })).filter((c) => c.n),
    calibrationModel: acc.calModel.map((c, i) => ({ bucket: `${i * 10}–${i * 10 + 10}%`, n: c.n, predicted: c.n ? r(c.p / c.n, 3) : null, actual: c.n ? r(c.y / c.n, 3) : null, settled: acc.calModelSettled[i].n ? { n: acc.calModelSettled[i].n, predicted: r(acc.calModelSettled[i].p / acc.calModelSettled[i].n, 3), actual: r(acc.calModelSettled[i].y / acc.calModelSettled[i].n, 3) } : null })).filter((c) => c.n),
    bets: Object.fromEntries(Object.entries(acc.bets).map(([e, B]) => [e, { n: B.n, units: r(B.units, 1), roi: B.n ? r(B.units / B.n, 3) : null, byMarket: Object.fromEntries(Object.entries(B.byMarket).map(([k, M]) => [k, { n: M.n, roi: r(M.units / M.n, 3) }])) }])),
    safe: { n: acc.safe.n, predicted: acc.safe.n ? r(acc.safe.p / acc.safe.n, 3) : null, actual: acc.safe.n ? r(acc.safe.w / acc.safe.n, 3) : null, roi: acc.safe.n ? r(acc.safe.units / acc.safe.n, 3) : null, byKey: Object.fromEntries(Object.entries(acc.safeByKey).map(([k, S]) => [k, { n: S.n, hit: r(S.w / S.n, 3), roi: r(S.units / S.n, 3) }])) },
  };
}

// ---------- main ----------
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };
const t0 = Date.now();
const fmtDay = (ms) => new Date(ms).toISOString().slice(0, 10);
log(`# Football model training report\n`);
log(`Generated ${new Date().toISOString()} · hold-out ${fmtDay(HOLDOUT)} → ${fmtDay(HOLDOUT_END)}\n`);
const GAMES = loadGames();
const ODDS = loadOdds();
const bySeason = {};
for (const g of GAMES) { const k = g.date < HOLDOUT ? "before hold-out" : g.date < HOLDOUT_END ? "hold-out" : "current"; bySeason[k] = (bySeason[k] || 0) + 1; }
log(`Games: ${GAMES.length} in ${new Set(GAMES.map((g) => g.league)).size} competitions (${Object.entries(bySeason).map(([k, n]) => `${k}: ${n}`).join(", ")}) · ${ODDS.size} with a closing 1X2 line`);
log(`Home win rate ${r(mean(GAMES.map((g) => (g.hs > g.as ? 1 : 0))), 3)} · draws ${r(mean(GAMES.map((g) => (g.hs === g.as ? 1 : 0))), 3)} · goals per game ${r(mean(GAMES.map((g) => g.hs + g.as)), 3)}\n`);
process.stdout.write("market views…\n");
const MKT = marketViews(GAMES, ODDS);

// 1) hold-out: fit on everything before HOLDOUT, score HOLDOUT (the replay runs through from the start,
// so the hold-out season begins with what the model had learnt by then)
log(`## Hold-out fit (games before ${fmtDay(HOLDOUT)})`);
const fit = fitModel(GAMES, DEFAULT_PARAMS, HOLDOUT, log);
let Ph = fit.P;
let rows = replay(GAMES, Ph);
Ph = fitBlend(rows, MKT, Ph, HOLDOUT, log);
const trainRows = rows.filter((x) => x.g.date < HOLDOUT), testRows = rows.filter((x) => x.g.date >= HOLDOUT && x.g.date < HOLDOUT_END);
const ev = evaluate(testRows, MKT, Ph, trainRows);
const table = (ev, title) => {
  log(`\n### ${title}: ${ev.games} games, ${ev.priced} with a closing line\n`);
  log(`| 1X2 log loss (lower is better) | Model alone | Market (de-vigged) | Market (score matrix) | Blend | Baseline |\n|---|---|---|---|---|---|`);
  log(`| every game | ${ev.all1x2.model} | — | — | — | ${ev.all1x2.baseline} (league frequencies) |`);
  log(`| priced games | ${ev.priced1x2.model} | ${ev.priced1x2.devig} | ${ev.priced1x2.market} | **${ev.priced1x2.blend}** | |`);
  for (const [t, T] of Object.entries(ev.byTier)) log(`| tier ${t} (${T.n}) | ${T.model} | ${T.devig} | ${T.market} | ${T.blend} | |`);
  if (ev.over25) log(`\nOver 2.5 log loss (${ev.over25.n} games at that line): model ${ev.over25.model} · market ${ev.over25.market} · blend ${ev.over25.blend} · baseline ${ev.over25.baseline}`);
  log(`\nCalibration of the blend's favourite outcome:\n\n| Bucket | Games | Predicted | Actual |\n|---|---|---|---|`);
  for (const c of ev.calibration) log(`| ${c.bucket} | ${c.n} | ${c.predicted} | ${c.actual} |`);
  log(`\nModel alone (no price), favourite outcome over every game — and over games where both clubs have 30+ games behind their figures:\n\n| Bucket | Games | Predicted | Actual | Settled clubs: games | Predicted | Actual |\n|---|---|---|---|---|---|---|`);
  for (const c of ev.calibrationModel) log(`| ${c.bucket} | ${c.n} | ${c.predicted} | ${c.actual} | ${c.settled?.n ?? "—"} | ${c.settled?.predicted ?? "—"} | ${c.settled?.actual ?? "—"} |`);
  log(`\nBetting every 1X2 side and over/under 2.5 at the closing price when blend chance × odds clears the edge (flat 1 unit):\n\n| Edge | Bets | Units | ROI | By market |\n|---|---|---|---|---|`);
  for (const [e, B] of Object.entries(ev.bets)) log(`| ≥ ${e} | ${B.n} | ${B.units} | ${B.roi === null ? "—" : `${r(B.roi * 100, 1)}%`} | ${Object.entries(B.byMarket).map(([k, M]) => `${k} ${M.n} (${r(M.roi * 100, 1)}%)`).join(", ")} |`);
  log(`\nSafe picks at a real price (blend chance ≥ 72% on a 1X2 side or the 2.5 line): ${ev.safe.n} picks, predicted ${ev.safe.predicted}, actual ${ev.safe.actual}, ROI ${ev.safe.roi === null ? "—" : `${r(ev.safe.roi * 100, 1)}%`} — ${Object.entries(ev.safe.byKey).map(([k, S]) => `${k}: ${S.n} (hit ${S.hit}, ROI ${r(S.roi * 100, 1)}%)`).join(", ")}`);
};
table(ev, `Out-of-sample ${fmtDay(HOLDOUT)} → ${fmtDay(HOLDOUT_END)}`);
const later = rows.filter((x) => x.g.date >= HOLDOUT_END);
if (later.length > 200) table(evaluate(later, MKT, Ph, trainRows), `Current season to date (same hold-out parameters)`);

// 2) production fit on everything
log(`\n## Production fit (every game)`);
const fit2 = fitModel(GAMES, Ph, Infinity, log);
let P = fit2.P;
rows = replay(GAMES, P, { keepState: true });
P = fitBlend(rows, MKT, P, Infinity, log);
P.version = 1;
P.trainedAt = new Date().toISOString();
P.trained = { games: GAMES.length, priced: ODDS.size, competitions: new Set(GAMES.map((g) => g.league)).size, from: fmtDay(GAMES[0].date), to: fmtDay(GAMES.at(-1).date), holdout: `${fmtDay(HOLDOUT)} → ${fmtDay(HOLDOUT_END)}` };
P.metrics = { holdout: ev };
// what every competition and club looks like after the last game: the live engine starts from here
P.asOf = new Date(GAMES.at(-1).date).toISOString();
P.leagues = Object.fromEntries([...rows.leagues.entries()].map(([id, L]) => [id, { mu: r(leagueMu(L, P), 3), muPrev: r(L.muPrev ?? P.model.muPrior, 3), home: r(L.home, 3), season: L.season, games: L.games, goals: L.goals, off: r(rows.offsets.get(id) || 0, 3) }]));
P.teams = Object.fromEntries([...rows.teams.entries()].filter(([, t]) => t.n >= 1).map(([id, t]) => [id, { att: r(t.att, 3), def: r(t.def, 3), n: t.n, league: t.league, season: t.season }]));
fs.writeFileSync(path.join(ROOT, "lib", "soccer-params.json"), JSON.stringify(P, null, 1) + "\n");
log(`\nParameters written to lib/soccer-params.json: ${Object.keys(P.teams).length} clubs, ${Object.keys(P.leagues).length} competitions · ${Math.round((Date.now() - t0) / 1000)} s`);
log(`\n## How to read the parameters\n
- \`model.eta\` / \`etaNew\` / \`kN\`: how far a club's attack and defence move per goal of surprise — fast for a new club, settling to \`eta\` after ~\`kN\` games.
- \`model.shrink\`: a club's figures at the start of a new season (1 = keep them, 0 = back to the league average); \`newTeam\`: where a club with no history starts.
- \`model.rho\`: Dixon-Coles correction of the low scores (negative = fewer 0-0 / 1-1 than independent Poisson).
- \`model.home\` / \`etaHome\`: a competition's starting home advantage (log goals) and how fast its own value is learnt; \`muPrior\` / \`kMu\`: the scoring-rate prior and its weight each season.
- \`model.etaOff\`: how fast a domestic league's strength offset moves after a continental or cup game against a club from another league.
- \`model.spread\`: damping of the gap between the two expected-goal figures before pricing.
- \`market.blend\`: weight on the model's expected goals against the bookmaker's implied ones, by league tier (0 = market only); \`blendNew\`: fraction of that weight for a club with no games yet.
- \`leagues\` / \`teams\`: the state after the last game trained on — lib/ratings.js keeps updating it from every result.`);
fs.writeFileSync(path.join(here, "soccer-report.md"), lines.join("\n") + "\n");
