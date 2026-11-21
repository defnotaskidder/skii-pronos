// Are estimated picks in leagues the bookmaker prices (derived markets of a priced game) different
// from estimated picks in leagues it never prices (model-only games)?
import { rows, fitAdd, K, run, mean, days } from "./wlib.mjs";
const byL = new Map(); for (const r of rows) { const x = byL.get(r.league) || { n: 0, pr: 0 }; x.n++; if (!r.est) x.pr++; byL.set(r.league, x); }
const share = (lg) => { const x = byL.get(lg); return x.pr / x.n; };
for (const r of rows) r.kind = !r.est ? "priced" : share(r.league) >= 0.15 ? "derived" : "model";
const cnt = {}; for (const r of rows) cnt[r.kind] = (cnt[r.kind] || 0) + 1; console.log(cnt);
console.log("\n-- by kind × family: n, raw p → hit, gap, roi at shown odds");
const g = new Map(); for (const r of rows) { const k = r.kind + ":" + r.fam; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
for (const [k, l] of [...g].sort((x, y) => x[0].localeCompare(y[0]))) { if (l.length < 15) continue; const mp = mean(l.map((r) => r.p)), hit = mean(l.map((r) => r.y)); const se = Math.sqrt(mp * (1 - mp) / l.length); console.log(k.padEnd(18), String(l.length).padStart(5), (mp * 100).toFixed(1), "→", (hit * 100).toFixed(1), ((hit - mp) * 100).toFixed(1).padStart(6), `(±${(se * 100).toFixed(1)})`, "| odds", mean(l.map((r) => r.odds)).toFixed(2), "roi", (mean(l.map((r) => (r.y ? r.odds - 1 : -1))) * 100).toFixed(1) + "%"); }
for (const kd of ["priced", "derived", "model"]) { const l = rows.filter((r) => r.kind === kd); console.log(kd.padEnd(8), l.length, (mean(l.map((r) => r.p)) * 100).toFixed(1), "→", (mean(l.map((r) => r.y)) * 100).toFixed(1)); }
const kindFam = (r) => r.kind + ":" + r.fam, modelFam = (r) => (r.kind === "model" ? r.fam : null), nonPricedFam = (r) => (r.kind === "priced" ? null : r.kind + ":" + r.fam);
const { out, test } = run({
  raw: () => (r) => r.p,
  shown: () => (r) => r.shown,
  "estFam τ.15": (tr) => fitAdd(tr, [{ key: K.estFam, tau: 0.15 }]),
  "kindFam τ.15": (tr) => fitAdd(tr, [{ key: kindFam, tau: 0.15 }]),
  "kindFam τ.2": (tr) => fitAdd(tr, [{ key: kindFam, tau: 0.2 }]),
  "modelFam τ.15": (tr) => fitAdd(tr, [{ key: modelFam, tau: 0.15 }]),
  "modelFam τ.25": (tr) => fitAdd(tr, [{ key: modelFam, tau: 0.25 }]),
  "nonPricedFam τ.15": (tr) => fitAdd(tr, [{ key: nonPricedFam, tau: 0.15 }]),
  "nonPricedFam τ.2": (tr) => fitAdd(tr, [{ key: nonPricedFam, tau: 0.2 }]),
  "modelFam.2+derivedFam.1": (tr) => fitAdd(tr, [{ key: modelFam, tau: 0.2 }, { key: (r) => (r.kind === "derived" ? r.fam : null), tau: 0.1 }]),
  "modelFam.2+model.league.1": (tr) => fitAdd(tr, [{ key: modelFam, tau: 0.2 }, { key: (r) => (r.kind === "model" ? r.league : null), tau: 0.1 }]),
});
// stability: by week, by kind
const ll = (p, y) => -Math.log(y ? p : 1 - p);
console.log("\n-- log loss by week (test set)");
const wk = (r) => Math.floor((r.t - test[0].t) / (7 * 86400e3));
for (const n of ["raw", "shown", "estFam τ.15", "kindFam τ.15", "modelFam τ.25"]) console.log(n.padEnd(18), [0, 1, 2, 3, 4].map((w) => { const idx = test.map((r, i) => (wk(r) === w ? i : -1)).filter((i) => i >= 0); return idx.length ? `${mean(idx.map((i) => ll(out[n][i], test[i].y))).toFixed(4)} (${idx.length})` : "-"; }).join("  "));
console.log("\n-- log loss by kind (test set)");
for (const n of ["raw", "shown", "estFam τ.15", "kindFam τ.15", "modelFam τ.25", "nonPricedFam τ.15"]) console.log(n.padEnd(18), ["priced", "derived", "model"].map((k) => { const idx = test.map((r, i) => (r.kind === k ? i : -1)).filter((i) => i >= 0); return `${k} ${mean(idx.map((i) => ll(out[n][i], test[i].y))).toFixed(4)} (${idx.length})`; }).join("  "));
