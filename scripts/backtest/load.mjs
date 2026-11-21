// Shared loader + maths for the market backtests. Needs the history in .cache/soccer
// (node scripts/soccer-history.mjs, then node scripts/train-soccer.mjs once to write market.json).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, ".cache", "soccer");
export const MAXG = 10;
export const HOLD = Date.parse("2025-07-01T00:00:00Z");

export function loadGames() {
  const games = new Map();
  const root = path.join(DIR, "months");
  for (const league of fs.readdirSync(root)) for (const f of fs.readdirSync(path.join(root, league))) {
    const d = JSON.parse(fs.readFileSync(path.join(root, league, f), "utf8"));
    for (const e of d.events || []) {
      if (!e.completed || e.state !== "post") continue;
      const H = e.competitors?.find((x) => x.homeAway === "home"), A = e.competitors?.find((x) => x.homeAway === "away");
      if (!H?.id || !A?.id || H.id === A.id) continue;
      const hs = Number(H.score), as = Number(A.score);
      if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
      if (/abandon|postpon|cancel|awarded/i.test(e.detail || "")) continue;
      games.set(e.id, { id: e.id, date: Date.parse(e.date), league, hs, as, detail: e.detail || "" });
    }
  }
  const mk = JSON.parse(fs.readFileSync(path.join(DIR, "market.json"), "utf8"));
  const out = [];
  for (const g of games.values()) { const m = mk[g.id]; if (m?.p) out.push({ ...g, p: { h: m.p[0], d: m.p[1], a: m.p[2] }, over: m.over ? { line: m.over[0], p: m.over[1] } : null, lh0: m.lh, la0: m.la }); }
  return out.sort((a, b) => a.date - b.date);
}

export function pmf(l, n = MAXG) { const p = new Array(n + 1); p[0] = Math.exp(-l); for (let k = 1; k <= n; k++) p[k] = p[k - 1] * l / k; return p; }
// negative binomial with mean l and variance l(1 + l·phi)   (phi → 0 is Poisson)
export function nb(l, phi, n = MAXG) {
  if (phi < 1e-6) return pmf(l, n);
  const r = 1 / phi, q = r / (r + l); const p = new Array(n + 1); p[0] = Math.pow(q, r);
  for (let k = 1; k <= n; k++) p[k] = p[k - 1] * ((k - 1 + r) / k) * (1 - q);
  return p;
}
// shape: { rho, phi, kappa }  rho = Dixon-Coles low scores, phi = overdispersion of each side's goals,
// kappa = extra weight on every draw cell
export function matrix(lh, la, S) {
  // common shock (bivariate Poisson): both sides share a Poisson(l3) component, l3 = c3 · min(lh, la)
  if (S.c3) {
    const l3 = S.c3 * Math.min(lh, la), pu = pmf(lh - l3), pv = pmf(la - l3), pw = pmf(l3), rho = S.rho || 0;
    const m = []; let sum = 0;
    for (let i = 0; i <= MAXG; i++) { const row = new Array(MAXG + 1).fill(0); m.push(row); }
    for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
      let p = 0; const K = Math.min(i, j);
      for (let k = 0; k <= K; k++) p += pu[i - k] * pv[j - k] * pw[k];
      if (rho && i < 2 && j < 2) p *= i === 0 && j === 0 ? 1 - lh * la * rho : i === 0 ? 1 + lh * rho : j === 0 ? 1 + la * rho : 1 - rho;
      if (S.kappa && i === j) p *= 1 + S.kappa;
      m[i][j] = p > 0 ? p : 0; sum += m[i][j];
    }
    for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) m[i][j] /= sum;
    return m;
  }
  const ph = S.phi ? nb(lh, S.phi) : pmf(lh), pa = S.phi ? nb(la, S.phi) : pmf(la), rho = S.rho || 0, k = S.kappa || 0;
  const m = []; let sum = 0;
  for (let i = 0; i <= MAXG; i++) {
    const row = new Array(MAXG + 1);
    for (let j = 0; j <= MAXG; j++) {
      let p = ph[i] * pa[j];
      if (i < 2 && j < 2) p *= i === 0 && j === 0 ? 1 - lh * la * rho : i === 0 ? 1 + lh * rho : j === 0 ? 1 + la * rho : 1 - rho;
      if (k && i === j) p *= 1 + k;
      row[j] = p > 0 ? p : 0; sum += row[j];
    }
    m.push(row);
  }
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) m[i][j] /= sum;
  return m;
}
export function sums(m, line) {
  let h = 0, d = 0, a = 0, o = 0;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) { const p = m[i][j]; if (i > j) h += p; else if (i === j) d += p; else a += p; if (line !== null && i + j > line) o += p; }
  return { h, d, a, o };
}
// Expected goals that reproduce the market's 1X2 (and total) under a shape. wOver as in production (1.5).
export function fit(g, S, wOver = 1.5) {
  const line = g.over ? g.over.line : null;
  const err = (lh, la) => { const s = sums(matrix(lh, la, S), line); let e = (s.h - g.p.h) ** 2 + (s.d - g.p.d) ** 2 + (s.a - g.p.a) ** 2; if (g.over) e += wOver * (s.o - g.over.p) ** 2; return e; };
  let best = null;
  const tryXT = (x, t) => { const lh = t * Math.exp(x) / (1 + Math.exp(x)), la = t - lh; if (lh < 0.08 || la < 0.08) return; const e = err(lh, la); if (!best || e < best.e) best = { e, lh, la, x, t }; };
  const T0 = (g.lh0 || 1.4) + (g.la0 || 1.1), x0 = Math.log((g.lh0 || 1.4) / (g.la0 || 1.1));
  for (let x = x0 - 0.3; x <= x0 + 0.3001; x += 0.1) for (let t = T0 - 0.45; t <= T0 + 0.4501; t += 0.15) tryXT(x, t);
  for (let rnd = 0, sx = 0.04, st = 0.06; rnd < 3; rnd++, sx /= 3, st /= 3) { const bx = best.x, bt = best.t; for (let x = bx - 2 * sx; x <= bx + 2 * sx + 1e-9; x += sx) for (let t = bt - 2 * st; t <= bt + 2 * st + 1e-9; t += st) tryXT(x, t); }
  return best;
}
export const ll = (p, y) => -Math.log(Math.max(1e-9, y ? p : 1 - p));
