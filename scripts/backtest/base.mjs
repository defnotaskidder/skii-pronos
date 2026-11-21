// How well does the production score matrix (fit to 1X2 + total, Poisson × DC rho) price every
// market the site sells? Predicted vs actual per market, overall and where it matters (p >= 0.6).
import { loadGames, matrix, fit, MAXG, HOLD, ll } from "./load.mjs";
const S = JSON.parse(process.argv[2] || '{"rho":-0.07}');
const all = loadGames();
const det = {}; for (const g of all) det[g.detail] = (det[g.detail] || 0) + 1;
console.log("details", JSON.stringify(det));
const games = all.filter((g) => !/AET|Pen|ET/i.test(g.detail) && g.over);
console.log("priced games", all.length, "regulation with a total line", games.length, "lines", JSON.stringify(games.reduce((a, g) => { a[g.over.line] = (a[g.over.line] || 0) + 1; return a; }, {})));

const MK = {
  "1": (i, j) => i > j, X: (i, j) => i === j, "2": (i, j) => i < j, "1X": (i, j) => i >= j, X2: (i, j) => i <= j, "12": (i, j) => i !== j,
  "O0.5": (i, j) => i + j > 0, "O1.5": (i, j) => i + j > 1, "O2.5": (i, j) => i + j > 2, "O3.5": (i, j) => i + j > 3, "O4.5": (i, j) => i + j > 4,
  BTTS: (i, j) => i > 0 && j > 0,
  "HO0.5": (i) => i > 0, "HO1.5": (i) => i > 1, "HO2.5": (i) => i > 2, "AO0.5": (i, j) => j > 0, "AO1.5": (i, j) => j > 1, "AO2.5": (i, j) => j > 2,
  "1_O1.5": (i, j) => i > j && i + j > 1, "2_O1.5": (i, j) => j > i && i + j > 1, "1_O2.5": (i, j) => i > j && i + j > 2, "2_O2.5": (i, j) => j > i && i + j > 2,
  "1X_U3.5": (i, j) => i >= j && i + j < 4, "X2_U3.5": (i, j) => j >= i && i + j < 4, "1X_O1.5": (i, j) => i >= j && i + j > 1, "X2_O1.5": (i, j) => j >= i && i + j > 1,
  "12_O1.5": (i, j) => i !== j && i + j > 1, "12_U4.5": (i, j) => i !== j && i + j < 5, "1X_U4.5": (i, j) => i >= j && i + j < 5, "X2_U4.5": (i, j) => j >= i && i + j < 5,
  "1_BTTSY": (i, j) => i > j && j > 0, "2_BTTSY": (i, j) => j > i && i > 0, "1X_BTTSY": (i, j) => i >= j && i > 0 && j > 0, "X2_BTTSY": (i, j) => j >= i && i > 0 && j > 0,
  "1_BTTSN": (i, j) => i > j && j === 0, "2_BTTSN": (i, j) => j > i && i === 0, "1X_BTTSN": (i, j) => i >= j && !(i > 0 && j > 0), "X2_BTTSN": (i, j) => j >= i && !(i > 0 && j > 0),
  "BTTSY_O2.5": (i, j) => i > 0 && j > 0 && i + j > 2, "BTTSN_U2.5": (i, j) => !(i > 0 && j > 0) && i + j < 3,
  TG0: (i, j) => i + j === 0, TG1: (i, j) => i + j === 1, TG2: (i, j) => i + j === 2, TG3: (i, j) => i + j === 3, TG4: (i, j) => i + j === 4, "TG5+": (i, j) => i + j >= 5,
  ODD: (i, j) => (i + j) % 2 === 1, "WM1-1": (i, j) => i - j === 1, "WM1-2": (i, j) => i - j === 2, "WM1-3": (i, j) => i - j >= 3, "WM2-1": (i, j) => j - i === 1, "WM2-2": (i, j) => j - i === 2, "WM2-3": (i, j) => j - i >= 3,
};
const keys = Object.keys(MK);
const acc = Object.fromEntries(keys.map((k) => [k, { n: 0, sp: 0, sy: 0, ll: 0, hn: 0, hp: 0, hy: 0, cn: 0, cp: 0, cy: 0 }]));
let nllScore = 0, n = 0, fitErr = 0;
const t0 = Date.now();
for (const g of games) {
  const f = fit(g, S);
  const m = matrix(f.lh, f.la, S);
  fitErr += f.e; n++;
  nllScore += -Math.log(Math.max(1e-9, m[Math.min(g.hs, MAXG)][Math.min(g.as, MAXG)]));
  for (const k of keys) {
    const fn = MK[k]; let p = 0;
    for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) if (fn(i, j)) p += m[i][j];
    const y = fn(g.hs, g.as) ? 1 : 0, a = acc[k];
    // both sides of the market: the bet as named, and its opposite
    for (const [pp, yy] of [[p, y], [1 - p, 1 - y]]) {
      if (pp >= 0.6 && pp < 0.75) { a.hn++; a.hp += pp; a.hy += yy; }
      if (pp >= 0.75) { a.cn++; a.cp += pp; a.cy += yy; }
    }
    a.n++; a.sp += p; a.sy += y; a.ll += ll(p, y);
  }
}
console.log(`shape ${JSON.stringify(S)} · ${n} games · score nll ${(nllScore / n).toFixed(4)} · mean fit error ${(fitErr / n).toExponential(2)} · ${Date.now() - t0} ms`);
console.log("market      pred   actual  diff   | logloss | p 60-75%: n     pred  actual diff  | p >=75%: n     pred  actual diff");
for (const k of keys) {
  const a = acc[k]; const f = (x) => (x * 100).toFixed(1).padStart(5);
  console.log(k.padEnd(11), f(a.sp / a.n), f(a.sy / a.n), ((a.sy - a.sp) / a.n * 100).toFixed(1).padStart(5), " |", (a.ll / a.n).toFixed(4), "|", String(a.hn).padStart(14), a.hn ? f(a.hp / a.hn) + f(a.hy / a.hn) + ((a.hy - a.hp) / a.hn * 100).toFixed(1).padStart(6) : "", " |", String(a.cn).padStart(12), a.cn ? f(a.cp / a.cn) + f(a.cy / a.cn) + ((a.cy - a.cp) / a.cn * 100).toFixed(1).padStart(6) : "");
}
