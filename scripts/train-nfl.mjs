// Trains the NFL model and writes lib/nfl-params.json + scripts/nfl-report.md.
//
//   node scripts/nfl-history.mjs     # once: downloads results, closing lines and box scores to .cache/nfl
//   node scripts/train-nfl.mjs [--from 2015] [--holdout 2025]
//
// Everything is walk-forward: a game is predicted only from games played before it. Four fits:
//   1. Elo (K, home field, margin multiplier, regression to the mean between seasons) by log loss.
//   2. The score distribution (team-score and margin key-number weights, spreads of margin and total)
//      by maximum likelihood of every regulation score given the closing spread and total.
//   3. Overtime (tie share, who wins it, the points it adds) from every game tied after 60'.
//   4. The strength model (home field, Elo, points, yards per play, turnovers, rest) by weighted least
//      squares, scored out of sample season by season, then compared with — and blended into — the
//      closing line.
// The hold-out season is never used for fitting in the evaluation run; the production run then
// refits on every season and ships the parameters, the Elo ratings and last season's team rates.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PARAMS, MAXR, eloExpected, eloRevert, eloUpdate, fitToMarket, locFromMeans, outcomes, regJoint, sigmoid, strength } from "../lib/nfl-core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : null)).filter(Boolean));
const FROM = Number(args.from || 2015);
const HOLDOUT = Number(args.holdout || 2025);
const DIR = path.join(ROOT, ".cache", "nfl");
const N = MAXR + 1;
const clone = (o) => JSON.parse(JSON.stringify(o));
const r = (x, n = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : x);
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const logloss = (p, y) => -(y * Math.log(Math.max(p, 1e-9)) + (1 - y) * Math.log(Math.max(1 - p, 1e-9)));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const amToProb = (a) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100));

// ---------- data ----------
// ESPN ids of the 32 franchises (31/32 are AFC/NFC, 35/36 the 2015 Pro Bowl's Team Rice/Irvin)
const FRANCHISES = new Set([...Array.from({ length: 30 }, (_, i) => String(i + 1)), "33", "34"]);
function loadGames() {
  const games = new Map();
  const files = fs.readdirSync(path.join(DIR, "months")).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, "months", f), "utf8"));
    for (const e of d.events || []) {
      const c = e.competitions?.[0];
      const st = c?.status?.type;
      if (!st?.completed || ![2, 3].includes(e.season?.type) || e.season.year < FROM) continue;
      const H = c.competitors.find((x) => x.homeAway === "home"), A = c.competitors.find((x) => x.homeAway === "away");
      if (!H || !A || !FRANCHISES.has(String(H.team.id)) || !FRANCHISES.has(String(A.team.id))) continue; // Pro Bowl & all-star teams
      const hs = Number(H.score), as = Number(A.score);
      if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
      const ot = /\d*OT\b/.test(st.shortDetail || st.detail || "");
      const q = (x) => (x.linescores || []).filter((l) => l.period <= 4).reduce((s, l) => s + (Number(l.value) || 0), 0);
      let rh = q(H), ra = q(A);
      if (!H.linescores?.length || !A.linescores?.length) { if (ot) continue; rh = hs; ra = as; }
      if (ot && rh !== ra) continue; // inconsistent linescores
      if (!ot && (rh !== hs || ra !== as)) { rh = hs; ra = as; }
      games.set(e.id, {
        id: e.id, date: new Date(e.date).getTime(), season: e.season.year, playoff: e.season.type === 3, neutral: !!c.neutralSite,
        home: H.team.id, away: A.team.id, homeAbbr: H.team.abbreviation, awayAbbr: A.team.abbreviation, hs, as, rh, ra, ot,
      });
    }
  }
  return [...games.values()].sort((a, b) => a.date - b.date);
}

// Consensus closing line: median over real sportsbooks. Left out: the opening line (23), prediction
// sites (1001-1003), aggregates (1004 consensus, 37 Betradar, 24 unknown), an empty Bet365 feed
// (2000) and provider 31 "Caesars Sportsbook", whose stored lines are often in-game ones (they move
// toward the final result). A book more than 3 points from the others' median is dropped too.
const NOT_BOOKS = new Set(["23", "24", "31", "37", "1001", "1002", "1003", "1004", "2000"]);
const memo = (fn) => { const m = new Map(); return (g) => { if (!m.has(g.id)) m.set(g.id, fn(g)); return m.get(g.id); }; };
const market = memo(marketRaw);
const box = memo(boxRaw);
function marketRaw(g) {
  const f = path.join(DIR, "odds", `${g.id}.json`);
  if (!fs.existsSync(f)) return null;
  const items = JSON.parse(fs.readFileSync(f, "utf8")).filter((i) => !NOT_BOOKS.has(String(i.id)) && !/live/i.test(i.name || "") && !/numberfire|teamrankings|accuscore/i.test(i.name || ""));
  const books = [];
  for (const i of items) {
    let line = null;
    const det = (i.details || "").trim().split(/\s+/);
    if (det.length === 2 && /^[A-Z]{2,4}$/.test(det[0]) && /^[-+]?\d+(\.\d+)?$/.test(det[1])) {
      const x = Number(det[1]);
      line = det[0] === g.homeAbbr ? x : det[0] === g.awayAbbr ? -x : null;
    } else if (/^(EVEN|PK|Pick)/i.test(i.details || "")) line = 0;
    if (line === null && Number.isFinite(i.spread)) line = i.spread;
    const pair = (a, b) => { if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return null; const x = amToProb(a), y = amToProb(b); return x + y > 0.95 && x + y < 1.2 ? x / (x + y) : null; };
    books.push({
      line: line !== null && Math.abs(line) <= 30 ? line : null, total: Number.isFinite(i.total) && i.total > 20 && i.total < 80 ? i.total : null,
      ml: pair(i.mlH, i.mlA), sp: pair(i.spH, i.spA), ov: pair(i.overOdds, i.underOdds),
    });
  }
  // drop a book more than 3 points from the median of the others (spread and total separately)
  const keep = (key) => books.filter((b, k) => {
    if (b[key] === null) return false;
    const others = books.filter((x, j) => j !== k && x[key] !== null).map((x) => x[key]);
    return !others.length || Math.abs(b[key] - median(others)) <= 3;
  });
  const L = keep("line"), T = keep("total");
  if (!L.length || !T.length) return null;
  const line = median(L.map((b) => b.line)), total = median(T.map((b) => b.total));
  // the price of the consensus line itself (books at that exact line), de-vigged; 0.5 when unknown
  const sp = L.filter((b) => b.line === line && b.sp !== null).map((b) => b.sp);
  const ov = T.filter((b) => b.total === total && b.ov !== null).map((b) => b.ov);
  const ml = books.map((b) => b.ml).filter((x) => x !== null);
  return { line, total, spreadP: sp.length ? median(sp) : 0.5, overP: ov.length ? median(ov) : 0.5, ml: ml.length ? median(ml) : null, books: L.length };
}

function boxRaw(g) {
  const f = path.join(DIR, "box", `${g.id}.json`);
  if (!fs.existsSync(f)) return null;
  const b = JSON.parse(fs.readFileSync(f, "utf8"));
  const H = b[g.home], A = b[g.away];
  const net = (x) => (Number.isFinite(x?.netPassingYards) && Number.isFinite(x?.rushingYards) ? x.netPassingYards + x.rushingYards : x?.totalYards);
  const ok = (x) => x && x.totalOffensivePlays > 20 && Number.isFinite(net(x));
  if (!ok(H) || !ok(A)) return null;
  const give = (x) => (x.interceptions || 0) + (x.fumblesLost || 0);
  return { home: { plays: H.totalOffensivePlays, yds: net(H), give: give(H) }, away: { plays: A.totalOffensivePlays, yds: net(A), give: give(A) } };
}

// ---------- walk-forward replay ----------
// Returns one row per game with everything known before kick-off.
function replay(games, P) {
  const elo = new Map(); // team → { rating, games, season }
  const tables = new Map(); // team → season-to-date sums
  const finals = new Map(); // season → Map(team → per-game rates)
  const last = new Map(); // team → last game time
  let season = null, lgPts = 0, lgGames = 0, lgYds = 0, lgPlays = 0, priorPpg = P.league.ppg, priorYpp = P.league.ypp;
  // league scoring/yards of games that kick off at the same time are added once the batch is done
  let batchAt = null, pend = { pts: 0, games: 0, yds: 0, plays: 0 };
  const flush = () => { lgPts += pend.pts; lgGames += pend.games; lgYds += pend.yds; lgPlays += pend.plays; pend = { pts: 0, games: 0, yds: 0, plays: 0 }; };
  const rows = [];
  const tbl = (id) => tables.get(id) || { gp: 0, pf: 0, pa: 0, plays: 0, yds: 0, playsA: 0, ydsA: 0, give: 0, take: 0, bgp: 0 };
  const closeSeason = () => {
    if (season === null) return;
    flush();
    const m = new Map();
    for (const [id, t] of tables) {
      if (!t.gp) continue;
      m.set(id, { pf: t.pf / t.gp, pa: t.pa / t.gp, ypp: t.plays ? t.yds / t.plays : null, yppA: t.playsA ? t.ydsA / t.playsA : null, to: t.bgp ? (t.take - t.give) / t.bgp : null });
    }
    finals.set(season, m);
    if (lgGames > 100) priorPpg = lgPts / lgGames;
    if (lgPlays > 1000) priorYpp = lgYds / lgPlays;
  };
  for (const g of games) {
    if (g.date !== batchAt) { flush(); batchAt = g.date; }
    if (g.season !== season) {
      closeSeason();
      season = g.season; tables.clear(); lgPts = 0; lgGames = 0; lgYds = 0; lgPlays = 0;
      for (const [id, e] of elo) elo.set(id, { ...e, rating: eloRevert(e.rating, P) });
    }
    const prevFinal = finals.get(season - 1);
    const lg = {
      ppg: (lgPts + 60 * priorPpg) / (lgGames + 60),
      ypp: (lgYds + 3000 * priorYpp) / (lgPlays + 3000),
    };
    const side = (id) => {
      const t = tbl(id), e = elo.get(id) || { rating: P.elo.mean, games: 0 };
      const lt = last.get(id);
      const restDays = lt ? (g.date - lt) / 864e5 : null;
      // box sums are scaled to the games they cover (a missing box score doesn't dilute the rates)
      const sc = t.bgp ? t.gp / t.bgp : 0;
      // yards allowed stay out of the season-to-date rates: ESPN's season statistics (what the site
      // serves) don't carry them, so the defence is last season's rate until the model is told more
      return {
        gp: t.gp, pf: t.pf, pa: t.pa, plays: t.plays * sc, yds: t.yds * sc, playsA: 0, ydsA: 0, give: t.give * sc, take: t.take * sc,
        rest: restDays !== null && restDays <= 20 ? Math.round(restDays) : null, rating: e.rating, ratingGames: e.games,
        prior: prevFinal?.get(id) || null,
      };
    };
    const home = side(g.home), away = side(g.away);
    const row = { g, home, away, ctx: { lg, neutral: g.neutral, playoff: g.playoff }, eloExp: eloExpected(home.rating, away.rating, P, g.neutral), mkt: market(g) };
    rows.push(row);
    // update
    const eh = elo.get(g.home) || { rating: P.elo.mean, games: 0 }, ea = elo.get(g.away) || { rating: P.elo.mean, games: 0 };
    const up = eloUpdate(eh, ea, g.hs, g.as, P, g.neutral);
    elo.set(g.home, { rating: up.home, games: eh.games + 1, season });
    elo.set(g.away, { rating: up.away, games: ea.games + 1, season });
    const b = box(g);
    const add = (id, pf, pa, mine, theirs) => {
      const t = { ...tbl(id) };
      t.gp++; t.pf += pf; t.pa += pa;
      if (mine && theirs) { t.bgp++; t.plays += mine.plays; t.yds += mine.yds; t.playsA += theirs.plays; t.ydsA += theirs.yds; t.give += mine.give; t.take += theirs.give; }
      tables.set(id, t);
    };
    add(g.home, g.hs, g.as, b?.home, b?.away);
    add(g.away, g.as, g.hs, b?.away, b?.home);
    pend.pts += g.hs + g.as; pend.games += 2;
    if (b) { pend.yds += b.home.yds + b.away.yds; pend.plays += b.home.plays + b.away.plays; }
    last.set(g.home, g.date); last.set(g.away, g.date);
  }
  closeSeason();
  return { rows, elo, finals, lastSeason: season };
}

// ---------- optimisers ----------
function nelderMead(f, x0, { step = 0.1, iters = 400, tol = 1e-8 } = {}) {
  const n = x0.length, steps = Array.isArray(step) ? step : x0.map(() => step);
  let S = [x0.slice()];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += steps[i]; S.push(x); }
  let V = S.map(f);
  const order = () => { const idx = V.map((_, i) => i).sort((a, b) => V[a] - V[b]); S = idx.map((i) => S[i]); V = idx.map((i) => V[i]); };
  for (let it = 0; it < iters; it++) {
    order();
    if (Math.abs(V[n] - V[0]) < tol * (1 + Math.abs(V[0]))) break;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
    const W = S[n], R = c.map((x, j) => x + (x - W[j])), fr = f(R);
    if (fr < V[0]) { const E = c.map((x, j) => x + 2 * (x - W[j])), fe = f(E); if (fe < fr) { S[n] = E; V[n] = fe; } else { S[n] = R; V[n] = fr; } }
    else if (fr < V[n - 1]) { S[n] = R; V[n] = fr; }
    else { const C = c.map((x, j) => x + 0.5 * (W[j] - x)), fc = f(C); if (fc < V[n]) { S[n] = C; V[n] = fc; } else for (let i = 1; i <= n; i++) { S[i] = S[i].map((x, j) => S[0][j] + 0.5 * (x - S[0][j])); V[i] = f(S[i]); } }
  }
  order();
  return { x: S[0], f: V[0] };
}

// Weighted least squares with a small ridge (columns already centred enough for these features).
function wls(X, y, w, ridge = 1e-3) {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) for (let j = 0; j < p; j++) { b[j] += w[i] * X[i][j] * y[i]; for (let k = 0; k < p; k++) A[j][k] += w[i] * X[i][j] * X[i][k]; }
  for (let j = 0; j < p; j++) A[j][j] += ridge;
  // Gaussian elimination
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < p; c++) {
    let piv = c; for (let i = c + 1; i < p; i++) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let i = 0; i < p; i++) if (i !== c) { const f = M[i][c] / M[c][c]; for (let k = c; k <= p; k++) M[i][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[p] / row[i]);
}
function logisticFit(xs, ys) {
  let k = 0, b = 0;
  for (let it = 0; it < 60; it++) {
    let gk = -1e-3 * k, gb = 0, hkk = 1e-3, hkb = 0, hbb = 1e-9;
    for (let i = 0; i < xs.length; i++) { const p = sigmoid(k * xs[i] + b), w = p * (1 - p); gk += (ys[i] - p) * xs[i]; gb += ys[i] - p; hkk += w * xs[i] ** 2; hkb += w * xs[i]; hbb += w; }
    const det = hkk * hbb - hkb * hkb; if (Math.abs(det) < 1e-12) break;
    const dk = (hbb * gk - hkb * gb) / det, db = (hkk * gb - hkb * gk) / det; k += dk; b += db;
    if (Math.abs(dk) + Math.abs(db) < 1e-9) break;
  }
  return { k, b };
}

// ---------- 1. Elo ----------
function fitElo(games, P0, seasonsTo) {
  const train = games.filter((g) => g.season < seasonsTo);
  // K and the margin multiplier's scale only act through their product, so the scale stays at 1
  const f = (x) => {
    if (x[0] < 2 || x[0] > 80 || x[2] < 0 || x[2] > 0.9) return 1e9;
    const P = clone(P0); P.elo.K = x[0]; P.elo.home = x[1]; P.elo.mov = 1; P.elo.revert = x[2];
    const { rows } = replay(train, P);
    let ll = 0, n = 0;
    for (const row of rows) { if (row.g.season === FROM) continue; ll += logloss(row.eloExp, row.g.hs > row.g.as ? 1 : row.g.hs === row.g.as ? 0.5 : 0); n++; }
    return ll / n;
  };
  const { x, f: v } = nelderMead(f, [P0.elo.K, P0.elo.home, P0.elo.revert], { step: [5, 15, 0.1], iters: 250 });
  const P = clone(P0);
  P.elo.K = r(x[0], 2); P.elo.home = r(x[1], 1); P.elo.mov = 1; P.elo.revert = r(x[2], 3);
  return { P, logloss: v };
}

// ---------- 2. score distribution ----------
// loc from the closing line: margin = −spread, total = total + cT
function regLogLik(rows, P, vw = true) {
  let ll = 0;
  for (const row of rows) {
    const R = regJoint(-row.mkt.line, row.mkt.total + P.dist.cT, P, vw);
    ll += Math.log(Math.max(R[Math.min(row.g.rh, MAXR) * N + Math.min(row.g.ra, MAXR)], 1e-12));
  }
  return ll / rows.length;
}
function fitDist(rows, P0, log) {
  const P = clone(P0);
  P.dist.cT = P.dist.cT ?? 0;
  const VT = 50, WT = 30; // tail pools: one weight for team scores >= VT, one for margins >= WT
  const vg = (s) => Math.min(s, VT), wg = (d) => Math.min(d, WT);
  const WL = P.dist.w.length; // regJoint reads the last margin cell as ">= WL-1"
  const ipf = (iters) => {
    const obsV = new Float64Array(VT + 1), obsW = new Float64Array(WT + 1);
    for (const row of rows) {
      obsV[vg(Math.min(row.g.rh, MAXR))]++; obsV[vg(Math.min(row.g.ra, MAXR))]++;
      obsW[wg(Math.abs(row.g.rh - row.g.ra))]++;
    }
    for (let it = 0; it < iters; it++) {
      const expV = new Float64Array(VT + 1), expW = new Float64Array(WT + 1);
      for (const row of rows) {
        const R = regJoint(-row.mkt.line, row.mkt.total + P.dist.cT, P);
        for (let h = 0; h <= MAXR; h++) for (let a = 0; a <= MAXR; a++) {
          const p = R[h * N + a]; if (p < 1e-12) continue;
          expV[vg(h)] += p; expV[vg(a)] += p;
          expW[wg(Math.abs(h - a))] += p;
        }
      }
      let delta = 0;
      const move = (old, f, lo) => { const nv = Math.min(50, Math.max(lo, old * f)); delta = Math.max(delta, Math.abs(Math.log(nv / old))); return nv; };
      for (let g = 0; g <= VT; g++) {
        if (g === 1) continue;
        const f = Math.pow((obsV[g] + 2) / (expV[g] + 2), 0.6);
        if (g < VT) P.dist.v[g] = move(P.dist.v[g], f, 1e-4);
        else { const nv = move(P.dist.v[VT], f, 1e-4); for (let s2 = VT; s2 < N; s2++) P.dist.v[s2] = nv; }
      }
      P.dist.v[1] = 1e-6; // a team can't score exactly 1
      for (let g = 0; g <= WT; g++) {
        const f = Math.pow((obsW[g] + 2) / (expW[g] + 2), 0.6);
        if (g < WT) P.dist.w[g] = move(P.dist.w[g], f, 1e-3);
        else { const nv = move(P.dist.w[WT], f, 1e-3); for (let d = WT; d < WL; d++) P.dist.w[d] = nv; }
      }
      // fix the scale: team-score weights average 1 over the usual range 10–40
      let sc = 0; for (let s = 10; s <= 40; s++) sc += P.dist.v[s]; sc /= 31;
      for (let s = 0; s < N; s++) P.dist.v[s] /= sc;
      if (delta < 0.002) break;
    }
  };
  const grid = (key, values) => {
    let best = P.dist[key], bv = -Infinity;
    for (const x of values) { P.dist[key] = x; const v = regLogLik(rows, P); if (v > bv) { bv = v; best = x; } }
    P.dist[key] = best;
    return bv;
  };
  const span = (c, h, st) => { const out = []; for (let x = c - h; x <= c + h + 1e-9; x += st) out.push(Math.round(x * 1000) / 1000); return out; };
  for (let round = 0; round < 3; round++) {
    ipf(round === 0 ? 40 : 15);
    grid("sM", span(P.dist.sM, round ? 0.5 : 1.5, round ? 0.125 : 0.25));
    grid("sT", span(P.dist.sT, round ? 0.5 : 1.5, round ? 0.125 : 0.25));
    grid("sM1", span(P.dist.sM1, 0.1, round ? 0.02 : 0.05));
    grid("sT1", span(P.dist.sT1, 0.1, round ? 0.02 : 0.05));
    const v = grid("cT", span(P.dist.cT, 1, round ? 0.125 : 0.25));
    log(`    round ${round + 1}: sM=${P.dist.sM} sM1=${P.dist.sM1} sT=${P.dist.sT} sT1=${P.dist.sT1} cT=${P.dist.cT} loglik=${r(v, 5)}`);
  }
  ipf(20);
  P.dist.v = P.dist.v.map((x) => r(x, 5)); P.dist.w = P.dist.w.map((x) => r(x, 5));
  return P;
}

// ---------- 3. overtime ----------
function fitOT(rows, P0) {
  const P = clone(P0);
  const ties = rows.filter((x) => x.g.ot && x.g.season >= 2017);
  const reg = ties.filter((x) => !x.g.playoff);
  P.ot.tie = r(reg.filter((x) => x.g.hs === x.g.as).length / Math.max(1, reg.length));
  const decided = ties.filter((x) => x.g.hs !== x.g.as && x.mkt);
  const lr = logisticFit(decided.map((x) => -x.mkt.line / P.dist.sM), decided.map((x) => (x.g.hs > x.g.as ? 1 : 0)));
  P.ot.k = r(lr.k); P.ot.b = r(lr.b);
  const modern = (g) => (g.playoff ? g.season >= 2022 : g.season >= 2025);
  const tables = (list) => {
    const addC = new Map(), tieC = new Map();
    for (const x of list) {
      const g = x.g, base = g.rh;
      if (g.hs === g.as) { const a = Math.min(9, g.hs - base); tieC.set(a, (tieC.get(a) || 0) + 1); continue; }
      const wa = Math.min(9, Math.max(g.hs, g.as) - base), la = Math.min(9, Math.min(g.hs, g.as) - base);
      if (wa <= 0 || la < 0) continue;
      const k = `${wa}|${la}`; addC.set(k, (addC.get(k) || 0) + 1);
    }
    return { addC, tieC };
  };
  const all = tables(ties), now = tables(ties.filter((x) => modern(x.g)));
  const blend = (cAll, cNow, lambda = 15) => {
    const nAll = [...cAll.values()].reduce((s, x) => s + x, 0), nNow = [...cNow.values()].reduce((s, x) => s + x, 0);
    if (!nAll) return null;
    const keys = new Set([...cAll.keys(), ...cNow.keys()]);
    return [...keys].map((k) => [k, ((cNow.get(k) || 0) + lambda * (cAll.get(k) || 0) / nAll) / (nNow + lambda)]);
  };
  const add = blend(all.addC, now.addC), tie = blend(all.tieC, now.tieC);
  if (add) P.ot.add = add.map(([k, p]) => { const [w, l] = k.split("|").map(Number); return { w, l, p: r(p) }; }).sort((a, b) => b.p - a.p);
  if (tie) P.ot.tieAdd = tie.map(([a, p]) => ({ a: Number(a), p: r(p) })).sort((a, b) => b.p - a.p);
  const modernDecided = ties.filter((x) => modern(x.g) && x.g.hs !== x.g.as).length;
  return { P, counts: { ties: ties.length, regularSeason: reg.length, endedTied: reg.filter((x) => x.g.hs === x.g.as).length, decidedWithLine: decided.length, decidedUnderTodaysRules: modernDecided } };
}

// ---------- 4. strength model ----------
const FEATS = ["home", "elo", "pd", "ypp", "to", "short", "bye"];
const SETS = { "home field only": ["home"], "+ Elo": ["home", "elo"], "+ points": ["home", "elo", "pd"], "+ yards per play": ["home", "elo", "pd", "ypp"], "+ turnovers": ["home", "elo", "pd", "ypp", "to"], "+ rest (full)": FEATS };
function design(rows, P, feats) {
  const X = [], y = [], T = [], yt = [];
  for (const row of rows) {
    const s = strength(row.home, row.away, row.ctx, P);
    X.push(feats.map((f) => s.x[f]));
    y.push(row.g.hs - row.g.as);
    T.push([1, s.tx.pts, s.tx.ypp, s.x.playoff]);
    yt.push(row.g.hs + row.g.as - 2 * row.ctx.lg.ppg);
  }
  return { X, y, T, yt };
}
const ageW = (season, ref, decay) => Math.pow(decay, Math.max(0, ref - season));
function fitStrength(rows, P, feats, ref, decay = 0.85) {
  const use = rows.filter((x) => x.g.season > FROM); // the first season has no priors
  const { X, y, T, yt } = design(use, P, feats);
  const w = use.map((x) => ageW(x.g.season, ref, decay));
  const b = wls(X, y, w, 1);
  const bt = wls(T, yt, w, 1);
  const Q = clone(P);
  const S = Q.strength;
  const set = (f, v) => { const map = { home: "hfa", elo: "bElo", pd: "bPd", ypp: "bYpp", to: "bTo", short: "bShort", bye: "bBye" }; S[map[f]] = r(v); };
  for (const f of FEATS) set(f, 0);
  feats.forEach((f, i) => set(f, b[i]));
  S.tBase = r(bt[0]); S.tPts = r(bt[1]); S.tYpp = r(bt[2]); S.tPlayoff = r(bt[3]);
  return Q;
}
// Out-of-sample predictions: each season predicted by a model fitted on the seasons before it.
function oosStrength(games, P, feats, firstEval) {
  const { rows } = replay(games, P);
  const out = [];
  for (let s = firstEval; s <= Math.max(...games.map((g) => g.season)); s++) {
    const train = rows.filter((x) => x.g.season < s);
    if (!train.length) continue;
    const Q = fitStrength(train, P, feats, s);
    for (const row of rows.filter((x) => x.g.season === s)) {
      const st = strength(row.home, row.away, row.ctx, Q);
      out.push({ row, m: st.m, t: st.t, Q });
    }
  }
  return out;
}
function tuneStrength(games, P0, log) {
  let best = null;
  for (const k of [2, 4, 7]) for (const priorR of [0.3, 0.5, 0.7]) for (const kPlays of [150, 400]) for (const kTo of [6, 16]) {
    const P = clone(P0); Object.assign(P.strength, { k, priorR, kPlays, kTo });
    const pred = oosStrength(games.filter((g) => g.season < HOLDOUT), P, FEATS, FROM + 2);
    const mse = mean(pred.map((x) => (x.row.g.hs - x.row.g.as - x.m) ** 2));
    if (!best || mse < best.mse) best = { mse, k, priorR, kPlays, kTo };
  }
  log(`  shrinkage: k=${best.k} games, prior weight ${best.priorR}, kPlays=${best.kPlays}, kTo=${best.kTo} (out-of-sample margin RMSE ${r(Math.sqrt(best.mse), 3)})`);
  const P = clone(P0); Object.assign(P.strength, { k: best.k, priorR: best.priorR, kPlays: best.kPlays, kTo: best.kTo });
  return P;
}

// ---------- evaluation ----------
function ci(w, n) { const p = w / n, s = Math.sqrt(p * (1 - p) / n); return `${(100 * p).toFixed(1)}% ± ${(196 * s).toFixed(1)}`; }
function evaluate(pred, P, label, log) {
  const withMkt = pred.filter((x) => x.row.mkt);
  const y = (x) => (x.row.g.hs > x.row.g.as ? 1 : x.row.g.hs === x.row.g.as ? 0.5 : 0);
  const pFrom = (locM, locT, x) => { const o = outcomes(locM, locT, P, { playoff: x.row.g.playoff }); return o.ml.h / (o.ml.h + o.ml.a); };
  const res = { games: withMkt.length };
  const acc = { mkt: [], stats: [], blend: [], elo: [], mlMkt: [] };
  const mseM = { mkt: [], stats: [], blend: [], naive: [] }, mseT = { mkt: [], stats: [], blend: [] };
  const wM = P.market.blendM, wT = P.market.blendT;
  for (const x of withMkt) {
    const g = x.row.g, m = x.row.mkt;
    const loc = fitToMarket({ spread: { line: m.line, p: m.spreadP ?? 0.5 }, total: { line: m.total, p: m.overP ?? 0.5 }, ...(m.ml ? { ml: m.ml } : {}) }, P, { playoff: g.playoff });
    const sLoc = locFromMeans(x.m, x.t, P, { playoff: g.playoff });
    const bM = (1 - wM) * loc.locM + wM * sLoc.locM, bT = (1 - wT) * loc.locT + wT * sLoc.locT;
    acc.mkt.push(logloss(pFrom(loc.locM, loc.locT, x), y(x)));
    acc.stats.push(logloss(pFrom(sLoc.locM, sLoc.locT, x), y(x)));
    acc.blend.push(logloss(pFrom(bM, bT, x), y(x)));
    acc.elo.push(logloss(x.row.eloExp, y(x)));
    if (m.ml) acc.mlMkt.push(logloss(m.ml, y(x)));
    const margin = g.hs - g.as, total = g.hs + g.as;
    mseM.mkt.push((margin + m.line) ** 2); mseM.stats.push((margin - x.m) ** 2); mseM.blend.push((margin - ((1 - wM) * -m.line + wM * x.m)) ** 2); mseM.naive.push((margin - (g.neutral ? 0 : P.strength.hfa)) ** 2);
    mseT.mkt.push((total - m.total) ** 2); mseT.stats.push((total - x.t) ** 2); mseT.blend.push((total - ((1 - wT) * m.total + wT * x.t)) ** 2);
  }
  res.logloss = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, r(mean(v))]));
  res.rmseMargin = Object.fromEntries(Object.entries(mseM).map(([k, v]) => [k, r(Math.sqrt(mean(v)), 3)]));
  res.rmseTotal = Object.fromEntries(Object.entries(mseT).map(([k, v]) => [k, r(Math.sqrt(mean(v)), 3)]));
  // against the spread: does the strength model's disagreement with the line pick covers?
  res.ats = [2, 3, 4].map((edge) => {
    let w = 0, n = 0;
    for (const x of withMkt) {
      const d = x.m + x.row.mkt.line; // > 0: model likes home more than the line
      if (Math.abs(d) < edge) continue;
      const cover = x.row.g.hs - x.row.g.as + x.row.mkt.line;
      if (cover === 0) continue;
      n++; if ((cover > 0) === (d > 0)) w++;
    }
    return { edge, n, w, rate: n ? ci(w, n) : "—" };
  });
  res.ou = [2, 3, 4].map((edge) => {
    let w = 0, n = 0;
    for (const x of withMkt) {
      const d = x.t - x.row.mkt.total; if (Math.abs(d) < edge) continue;
      const o = x.row.g.hs + x.row.g.as - x.row.mkt.total; if (o === 0) continue;
      n++; if ((o > 0) === (d > 0)) w++;
    }
    return { edge, n, w, rate: n ? ci(w, n) : "—" };
  });
  log(`\n### ${label} (${res.games} games with a closing line)\n`);
  log(`| | Market (closing line) | Strength model | Blend | Elo only |\n|---|---|---|---|---|`);
  log(`| Moneyline log loss | ${res.logloss.mkt} (book ML ${res.logloss.mlMkt}) | ${res.logloss.stats} | ${res.logloss.blend} | ${res.logloss.elo} |`);
  log(`| Margin RMSE | ${res.rmseMargin.mkt} | ${res.rmseMargin.stats} | ${res.rmseMargin.blend} | home field only ${res.rmseMargin.naive} |`);
  log(`| Total RMSE | ${res.rmseTotal.mkt} | ${res.rmseTotal.stats} | ${res.rmseTotal.blend} | |`);
  log(`\nAgainst the spread when the strength model disagrees with the closing line: ${res.ats.map((a) => `≥${a.edge} pts: ${a.w}/${a.n} = ${a.rate}`).join(" · ")}`);
  log(`Totals when it disagrees with the closing total: ${res.ou.map((a) => `≥${a.edge} pts: ${a.w}/${a.n} = ${a.rate}`).join(" · ")}`);
  return res;
}

// Key-number and push calibration of the score distribution (market locations).
function distCheck(rows, P, label, log) {
  const keys = [0, 1, 2, 3, 4, 6, 7, 10, 14];
  const pred = Object.fromEntries(keys.map((k) => [k, 0])), act = Object.fromEntries(keys.map((k) => [k, 0]));
  const predB = Object.fromEntries(keys.map((k) => [k, 0]));
  let pushP = 0, pushA = 0, pushN = 0, tpP = 0, tpA = 0, tpN = 0, llFit = 0, llBase = 0;
  for (const row of rows) {
    const g = row.g, m = row.mkt;
    const o = outcomes(-m.line, m.total + P.dist.cT, P, { playoff: g.playoff });
    const B = clone(P); B.dist.v = B.dist.v.map((x, i) => (i === 1 ? 1e-6 : 1)); B.dist.w = B.dist.w.map(() => 1);
    const ob = outcomes(-m.line, m.total + P.dist.cT, B, { playoff: g.playoff });
    const fm = Math.abs(g.hs - g.as);
    for (const k of keys) {
      pred[k] += k === 0 ? o.exactMargin(0) : o.exactMargin(k) + o.exactMargin(-k);
      predB[k] += k === 0 ? ob.exactMargin(0) : ob.exactMargin(k) + ob.exactMargin(-k);
      if (fm === k) act[k]++;
    }
    if (Number.isInteger(m.line)) { pushN++; pushP += o.spread("home", m.line).v; if (g.hs - g.as + m.line === 0) pushA++; }
    if (Number.isInteger(m.total)) { tpN++; tpP += o.total(m.total).v; if (g.hs + g.as === m.total) tpA++; }
    const R = regJoint(-m.line, m.total + P.dist.cT, P), RB = regJoint(-m.line, m.total + P.dist.cT, P, false);
    llFit += Math.log(Math.max(R[Math.min(g.rh, MAXR) * N + Math.min(g.ra, MAXR)], 1e-12));
    llBase += Math.log(Math.max(RB[Math.min(g.rh, MAXR) * N + Math.min(g.ra, MAXR)], 1e-12));
  }
  const n = rows.length;
  log(`\n#### Score distribution — ${label} (${n} games)\n`);
  log(`Exact 60-minute score log-likelihood per game: key-number model ${r(llFit / n, 4)} vs plain normal grid ${r(llBase / n, 4)}\n`);
  log(`| Final margin | Actual | Model | Plain normal |\n|---|---|---|---|`);
  for (const k of keys) log(`| ${k === 0 ? "tie" : `±${k}`} | ${(100 * act[k] / n).toFixed(1)}% | ${(100 * pred[k] / n).toFixed(1)}% | ${(100 * predB[k] / n).toFixed(1)}% |`);
  log(`\nPushes on whole-number spreads: ${pushA}/${pushN} actual (${(100 * pushA / Math.max(1, pushN)).toFixed(1)}%) vs model ${(100 * pushP / Math.max(1, pushN)).toFixed(1)}% · on whole-number totals: ${tpA}/${tpN} (${(100 * tpA / Math.max(1, tpN)).toFixed(1)}%) vs model ${(100 * tpP / Math.max(1, tpN)).toFixed(1)}%`);
  return { llFit: r(llFit / n, 4), llBase: r(llBase / n, 4), pushes: { spread: [pushA, pushN, r(pushP / Math.max(1, pushN), 4)], total: [tpA, tpN, r(tpP / Math.max(1, tpN), 4)] } };
}

// Blend weights on out-of-sample predictions: how far to move the market toward the model.
function fitBlend(pred, P) {
  const rows = pred.filter((x) => x.row.mkt);
  const best = { m: 0, t: 0 };
  let bm = Infinity, bt = Infinity;
  for (let w = 0; w <= 0.5001; w += 0.025) {
    const em = mean(rows.map((x) => (x.row.g.hs - x.row.g.as - ((1 - w) * -x.row.mkt.line + w * x.m)) ** 2));
    const et = mean(rows.map((x) => (x.row.g.hs + x.row.g.as - ((1 - w) * x.row.mkt.total + w * x.t)) ** 2));
    if (em < bm) { bm = em; best.m = r(w, 3); }
    if (et < bt) { bt = et; best.t = r(w, 3); }
  }
  return best;
}

// ---------- main ----------
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };
const t0 = Date.now();
const games = loadGames();
const withLine = games.filter((g) => market(g)).length;
const withBox = games.filter((g) => box(g)).length;
const seasons = [...new Set(games.map((g) => g.season))].sort();
log(`# NFL model training report\n`);
log(`Seasons ${seasons[0]}–${seasons.at(-1)} (ESPN season years; ${seasons.at(-1)} is the current season to date) · hold-out ${HOLDOUT}\n`);
log(`Games: ${games.length} (regular season + playoffs) · with a closing line: ${withLine} · with both box scores: ${withBox}`);
log(`Ties after 60': ${games.filter((g) => g.ot).length} (${(100 * mean(games.map((g) => (g.ot ? 1 : 0)))).toFixed(1)}%) · final ties: ${games.filter((g) => g.hs === g.as).length} · home win rate ${r(mean(games.filter((g) => !g.neutral).map((g) => (g.hs > g.as ? 1 : g.hs === g.as ? 0.5 : 0))), 3)}\n`);

function fitAll(gamesIn, P0, seasonsTo, tag) {
  log(`## ${tag}`);
  let P = clone(P0);
  const e = fitElo(gamesIn, P, seasonsTo); P = e.P;
  log(`  Elo: K=${P.elo.K} home=${P.elo.home} mov=${P.elo.mov} revert=${P.elo.revert} (log loss ${r(e.logloss)})`);
  const { rows } = replay(gamesIn.filter((g) => g.season < seasonsTo), P);
  const mk = rows.filter((x) => x.mkt);
  log(`  score distribution on ${mk.length} games with a closing line:`);
  P = fitDist(mk, P, log);
  const o = fitOT(rows, P); P = o.P;
  log(`  overtime: ${JSON.stringify(o.counts)} · tie share ${P.ot.tie} · home OT win k=${P.ot.k} b=${P.ot.b} · adds ${P.ot.add.slice(0, 5).map((x) => `+${x.w}/+${x.l} ${(100 * x.p).toFixed(0)}%`).join(", ")}`);
  P = tuneStrength(gamesIn.filter((g) => g.season < seasonsTo), P, log);
  const regs = gamesIn.filter((g) => !g.neutral && g.season < seasonsTo);
  P.league.total = r(mean(gamesIn.filter((g) => g.season >= seasonsTo - 3 && g.season < seasonsTo).map((g) => g.hs + g.as)), 2);
  log(`  long-run total (last 3 seasons): ${P.league.total} · home margin all seasons ${r(mean(regs.map((g) => g.hs - g.as)), 2)}`);
  return P;
}

// 1) evaluation run: nothing from the hold-out season or later is used for fitting
const Ph = fitAll(games, DEFAULT_PARAMS, HOLDOUT, `Hold-out fit (train < ${HOLDOUT})`);
log(`\n## Strength model feature sets (out of sample, seasons ${FROM + 2}–${HOLDOUT - 1})\n`);
log(`| Features | Margin RMSE | Total RMSE |\n|---|---|---|`);
// keep the feature set with the lowest out-of-sample margin error (a feature that only adds noise
// is dropped rather than shipped with a coefficient fitted to that noise)
let BEST = FEATS, bestRmse = Infinity, bestName = "";
for (const [name, feats] of Object.entries(SETS)) {
  const pred = oosStrength(games.filter((g) => g.season < HOLDOUT), Ph, feats, FROM + 2);
  const rm = Math.sqrt(mean(pred.map((x) => (x.row.g.hs - x.row.g.as - x.m) ** 2)));
  if (rm < bestRmse - 1e-9) { bestRmse = rm; BEST = feats; bestName = name; }
  log(`| ${name} | ${r(rm, 3)} | ${r(Math.sqrt(mean(pred.map((x) => (x.row.g.hs + x.row.g.as - x.t) ** 2))), 3)} |`);
}
log(`\nKept: **${bestName}** (${BEST.join(", ")}).`);
const predTrain = oosStrength(games.filter((g) => g.season < HOLDOUT), Ph, BEST, FROM + 2);
Ph.market = fitBlend(predTrain, Ph);
Ph.market = { blendM: Ph.market.m, blendT: Ph.market.t };
log(`\nBlend weights fitted out of sample (${FROM + 2}–${HOLDOUT - 1}): margin ${Ph.market.blendM}, total ${Ph.market.blendT} — the share of the strength model mixed into the market's numbers.`);
const QH = fitStrength(replay(games.filter((g) => g.season < HOLDOUT), Ph).rows, Ph, BEST, HOLDOUT);
const predAll = (() => { const { rows } = replay(games, QH); return rows.map((row) => { const st = strength(row.home, row.away, row.ctx, QH); return { row, m: st.m, t: st.t }; }); })();
const hold = predAll.filter((x) => x.row.g.season === HOLDOUT);
const evH = evaluate(hold, QH, `Hold-out season ${HOLDOUT}`, log);
const dH = distCheck(hold.map((x) => x.row).filter((x) => x.mkt), QH, `hold-out ${HOLDOUT}`, log);
const cur = predAll.filter((x) => x.row.g.season > HOLDOUT);
const evC = cur.length ? evaluate(cur, QH, `Current season to date (${cur.length} games, hold-out parameters)`, log) : null;
log(`\nCoefficients of the hold-out strength model: ${JSON.stringify(QH.strength)}`);

// 2) production fit on everything
const last = seasons.at(-1);
const P = fitAll(games, Ph, last + 1, "Production fit (all seasons)");
const predProd = oosStrength(games, P, BEST, FROM + 2);
const bl = fitBlend(predProd.filter((x) => x.row.g.season < last), P);
P.market = { blendM: bl.m, blendT: bl.t };
const fin = replay(games, P);
const Q = fitStrength(fin.rows, P, BEST, last);
Q.market = P.market;
log(`\nProduction blend weights: margin ${Q.market.blendM}, total ${Q.market.blendT}`);
log(`Production strength coefficients: ${JSON.stringify(Q.strength)}`);
const dP = distCheck(fin.rows.filter((x) => x.mkt && x.g.season >= last - 2), Q, `last three seasons, production parameters`, log);

// shipped state: Elo ratings as of the last game, and last completed season's team rates as priors
const lastGame = games.at(-1);
Q.elo.seed = { asOf: new Date(lastGame.date).toISOString(), season: last, teams: Object.fromEntries([...fin.elo.entries()].map(([id, e]) => [id, { rating: r(e.rating, 1), games: e.games, season: e.season }])) };
const ratesOf = (season) => Object.fromEntries([...(fin.finals.get(season) || new Map()).entries()].map(([id, x]) => [id, Object.fromEntries(Object.entries(x).map(([k, v]) => [k, r(v, 3)]))]));
// priors by the season they serve: this season starts from last season's final rates; next season
// (if the parameters are still in use then) from this season's
Q.priors = { bySeason: { [last]: ratesOf(last - 1), [last + 1]: ratesOf(last) } };
const recent = games.filter((g) => g.season >= last - 2 && g.season < last);
Q.league.ppg = r(mean(recent.map((g) => (g.hs + g.as) / 2)), 2);
const rb = recent.map((g) => box(g)).filter(Boolean);
Q.league.ypp = r(rb.reduce((s, b) => s + b.home.yds + b.away.yds, 0) / Math.max(1, rb.reduce((s, b) => s + b.home.plays + b.away.plays, 0)), 3);
Q.version = 1;
Q.trainedAt = new Date().toISOString();
Q.trained = { seasons: seasons.map(String), games: games.length, withLine, withBox, holdout: String(HOLDOUT) };
Q.metrics = { holdout: evH, holdoutDist: dH, current: evC, productionDist: dP };
fs.writeFileSync(path.join(ROOT, "lib", "nfl-params.json"), JSON.stringify(Q, null, 1) + "\n");
log(`\nParameters written to lib/nfl-params.json · ${Math.round((Date.now() - t0) / 1000)} s`);
log(`\n## How to read the parameters\n
- \`dist.v\` (team score 0–70) and \`dist.w\` (absolute margin 0–40): multiplicative weights on the regulation score grid — the key numbers. \`dist.sM\`/\`dist.sT\` (+ slopes \`sM1\`/\`sT1\` per point of total above 44): spreads of margin and total; \`dist.cT\`: closing total minus the regulation total location.
- \`ot\`: share of regular-season overtimes ending tied, logistic tilt of the overtime winner toward the stronger side, and the points overtime adds (winner/loser).
- \`elo\`: K, home field in rating points, margin-of-victory scale, share of each rating regressed to the mean between seasons; \`elo.seed\`: every team's rating after the last game trained on (lib/ratings.js starts from it).
- \`strength\`: points of expected margin per unit of each feature (home field, Elo gap /25, points differential per game, yards-per-play differential, turnover margin per game, short week, bye), shrinkage (pseudo-games toward the prior), and the total model.
- \`priors\`: last completed season's per-game team rates, the starting point of this season's rates.
- \`market.blendM\`/\`blendT\`: share of the strength model mixed into the bookmaker's margin and total (fitted out of sample; the closing line is very hard to beat).`);
fs.writeFileSync(path.join(here, "nfl-report.md"), lines.join("\n") + "\n");
