// For each market derived from the market-fitted score matrix: would a constant shift (and slope)
// on the logit scale, fitted on the training seasons, make it truer on the hold-out season?
import { loadGames, matrix, fit, MAXG, HOLD } from "./load.mjs";
const S = { rho: -0.07 };
const games = loadGames().filter((g) => !/AET|Pen|ET/i.test(g.detail) && g.over);
const R = { "1": (i, j) => i > j, "2": (i, j) => j > i, "1X": (i, j) => i >= j, X2: (i, j) => j >= i, "12": (i, j) => i !== j };
const MK = {
  "O0.5": (i, j) => i + j > 0, "O1.5": (i, j) => i + j > 1, "O2.5": (i, j) => i + j > 2, "O3.5": (i, j) => i + j > 3, "O4.5": (i, j) => i + j > 4,
  BTTS_Y: (i, j) => i > 0 && j > 0, "HO0.5": (i) => i > 0, "HO1.5": (i) => i > 1, "HO2.5": (i) => i > 2, "AO0.5": (i, j) => j > 0, "AO1.5": (i, j) => j > 1, "AO2.5": (i, j) => j > 2,
  "1X": R["1X"], X2: R.X2, "12": R["12"],
  "BTTSY_O2.5": (i, j) => i > 0 && j > 0 && i + j > 2, "BTTSN_U2.5": (i, j) => !(i > 0 && j > 0) && i + j < 3,
};
for (const [rk, rf] of Object.entries(R)) {
  for (const [gk, gf] of [["O1.5", (t) => t > 1.5], ["O2.5", (t) => t > 2.5], ["U3.5", (t) => t < 3.5], ["U4.5", (t) => t < 4.5]]) MK[`${rk}_${gk}`] = (i, j) => rf(i, j) && gf(i + j);
  MK[`${rk}_BTTSY`] = (i, j) => rf(i, j) && i > 0 && j > 0;
  if (rk !== "12") MK[`${rk}_BTTSN`] = (i, j) => rf(i, j) && !(i > 0 && j > 0);
}
const keys = Object.keys(MK);
const data = Object.fromEntries(keys.map((k) => [k, { tr: [], ho: [] }]));
for (const g of games) {
  const f = fit(g, S), m = matrix(f.lh, f.la, S);
  for (const k of keys) {
    if (/^O[\d.]+$/.test(k) && Number(k.slice(1)) === g.over.line) continue; // the fitted line itself is the bookmaker's
    const fn = MK[k]; let p = 0;
    for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) if (fn(i, j)) p += m[i][j];
    p = Math.min(0.995, Math.max(0.005, p));
    data[k][g.date < HOLD ? "tr" : "ho"].push([Math.log(p / (1 - p)), fn(g.hs, g.as) ? 1 : 0]);
  }
}
const sig = (x) => 1 / (1 + Math.exp(-x));
const nll = (list, a, b) => list.reduce((s, [z, y]) => { const q = sig(a + b * z); return s - Math.log(y ? q : 1 - q); }, 0) / list.length;
function fitAB(list, slope) {
  let a = 0, b = 1;
  for (let it = 0; it < 40; it++) {
    let ga = 0, gb = 0, haa = 1e-9, hab = 0, hbb = 1e-9;
    for (const [z, y] of list) { const q = sig(a + b * z), w = q * (1 - q); ga += y - q; gb += (y - q) * z; haa += w; hab += w * z; hbb += w * z * z; }
    if (!slope) { a += ga / haa; continue; }
    const det = haa * hbb - hab * hab; a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det;
  }
  return [a, b];
}
console.log("market        train n | bias tr  hold (pts) | shift a  | hold logloss raw → shifted (Δ ± se)        | + slope: a, b → Δ");
let tot = 0, totS = 0, totN = 0;
for (const k of keys) {
  const { tr, ho } = data[k];
  const bias = (l) => (l.reduce((s, [z, y]) => s + y - sig(z), 0) / l.length * 100).toFixed(1).padStart(5);
  const [a] = fitAB(tr, false), [a2, b2] = fitAB(tr, true);
  const raw = nll(ho, 0, 1), sh = nll(ho, a, 1), sl = nll(ho, a2, b2);
  const d = ho.map(([z, y]) => { const q0 = sig(z), q1 = sig(a + z); return -Math.log(y ? q1 : 1 - q1) + Math.log(y ? q0 : 1 - q0); }); const md = d.reduce((x, y) => x + y, 0) / d.length; const se = Math.sqrt(d.reduce((x, y) => x + (y - md) ** 2, 0) / d.length / d.length);
  tot += raw * ho.length; totS += sh * ho.length; totN += ho.length;
  console.log(k.padEnd(12), String(tr.length).padStart(7), " |", bias(tr), bias(ho), "      |", a.toFixed(3).padStart(7), " |", raw.toFixed(5), "→", sh.toFixed(5), `(${md >= 0 ? "+" : ""}${md.toFixed(5)} ± ${se.toFixed(5)})`.padEnd(24), md < -2 * se ? "✔" : md > 2 * se ? "✘" : " ", "|", a2.toFixed(3), b2.toFixed(3), "→", (sl - raw >= 0 ? "+" : "") + (sl - raw).toFixed(5));
}
console.log("all markets, hold-out mean log loss:", (tot / totN).toFixed(5), "→", (totS / totN).toFixed(5));
