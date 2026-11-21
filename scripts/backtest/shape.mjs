// Compare score-matrix shapes: each is fitted per game to the market's 1X2 + total exactly as
// production does, then judged on what really happened (train < 2025-07, hold-out after).
import { loadGames, matrix, fit, MAXG, HOLD, ll } from "./load.mjs";
const shapes = JSON.parse(process.argv[2]);
const step = Number(process.argv[3] || 1);
const games = loadGames().filter((g) => !/AET|Pen|ET/i.test(g.detail) && g.over).filter((_, i) => i % step === 0);
const G = {
  x12: [["1", (i, j) => i > j], ["X", (i, j) => i === j], ["2", (i, j) => i < j]],
  btts: [["BTTS", (i, j) => i > 0 && j > 0]],
  goals: [["O0.5", (i, j) => i + j > 0], ["O1.5", (i, j) => i + j > 1], ["O2.5", (i, j) => i + j > 2], ["O3.5", (i, j) => i + j > 3], ["O4.5", (i, j) => i + j > 4]],
  team: [["HO0.5", (i) => i > 0], ["HO1.5", (i) => i > 1], ["HO2.5", (i) => i > 2], ["AO0.5", (i, j) => j > 0], ["AO1.5", (i, j) => j > 1], ["AO2.5", (i, j) => j > 2]],
  combo: [["1_O1.5", (i, j) => i > j && i + j > 1], ["2_O1.5", (i, j) => j > i && i + j > 1], ["1X_U3.5", (i, j) => i >= j && i + j < 4], ["X2_U3.5", (i, j) => j >= i && i + j < 4], ["1X_O1.5", (i, j) => i >= j && i + j > 1], ["X2_O1.5", (i, j) => j >= i && i + j > 1], ["12_O1.5", (i, j) => i !== j && i + j > 1], ["1X_BTTSY", (i, j) => i >= j && i > 0 && j > 0], ["X2_BTTSY", (i, j) => j >= i && i > 0 && j > 0], ["1X_BTTSN", (i, j) => i >= j && !(i > 0 && j > 0)], ["X2_BTTSN", (i, j) => j >= i && !(i > 0 && j > 0)], ["BTTSY_O2.5", (i, j) => i > 0 && j > 0 && i + j > 2], ["BTTSN_U2.5", (i, j) => !(i > 0 && j > 0) && i + j < 3], ["1_O2.5", (i, j) => i > j && i + j > 2], ["12_U4.5", (i, j) => i !== j && i + j < 5]],
  margin: [["WM1-1", (i, j) => i - j === 1], ["WM1-2", (i, j) => i - j === 2], ["WM1-3", (i, j) => i - j >= 3], ["WM2-1", (i, j) => j - i === 1], ["WM2-2", (i, j) => j - i === 2], ["AH1-1.5", (i, j) => i - j > 1.5], ["AH2-1.5", (i, j) => j - i > 1.5]],
  odd: [["ODD", (i, j) => (i + j) % 2 === 1]],
};
const fams = Object.keys(G);
console.log(`${games.length} games (step ${step})`);
console.log("shape".padEnd(44), "| set  | scoreNLL |", fams.map((f) => f.padStart(7)).join(" "), "| fitErr   | bias BTTS  O0.5  ODD   WM1");
for (const S of shapes) {
  const A = { tr: { n: 0, nll: 0, fe: 0, f: Object.fromEntries(fams.map((f) => [f, 0])), b: {} }, ho: { n: 0, nll: 0, fe: 0, f: Object.fromEntries(fams.map((f) => [f, 0])), b: {} } };
  const t0 = Date.now();
  for (const g of games) {
    const f = fit(g, S), m = matrix(f.lh, f.la, S), a = g.date < HOLD ? A.tr : A.ho;
    a.n++; a.fe += f.e; a.nll += -Math.log(Math.max(1e-9, m[Math.min(g.hs, MAXG)][Math.min(g.as, MAXG)]));
    for (const fam of fams) {
      let s = 0;
      for (const [k, fn] of G[fam]) {
        let p = 0; for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) if (fn(i, j)) p += m[i][j];
        const y = fn(g.hs, g.as) ? 1 : 0; s += ll(p, y);
        if (k === "BTTS" || k === "O0.5" || k === "ODD" || k === "WM1-1") { a.b[k] = (a.b[k] || 0) + (y - p); }
      }
      a.f[fam] += s / G[fam].length;
    }
  }
  for (const [nm, a] of Object.entries(A)) console.log((nm === "tr" ? JSON.stringify(S) : "").padEnd(44), "|", nm === "tr" ? "train" : "hold ", "|", (a.nll / a.n).toFixed(4), " |", fams.map((f) => (a.f[f] / a.n).toFixed(4).padStart(7)).join(" "), "|", (a.fe / a.n).toExponential(1), "|", ["BTTS", "O0.5", "ODD", "WM1-1"].map((k) => ((a.b[k] / a.n) * 100).toFixed(1).padStart(5)).join(" "), nm === "ho" ? ` (${Date.now() - t0} ms)` : "");
}
