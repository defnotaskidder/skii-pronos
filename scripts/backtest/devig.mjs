// Which way of removing the bookmaker's margin gives the truest 1X2 and over/under chances?
import fs from "node:fs";
import path from "node:path";
import { loadGames, HOLD } from "./load.mjs";
import { ROOT } from "./load.mjs";
const DIR = path.join(ROOT, ".cache", "soccer", "odds");
const odds = new Map();
for (const f of fs.readdirSync(DIR)) { const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); for (const [id, o] of Object.entries(d.games || {})) if (o && o.h > 1 && o.d > 1 && o.a > 1) odds.set(id, o); }
const games = loadGames().filter((g) => !/AET|Pen|ET/i.test(g.detail) && odds.has(g.id));
const bisect = (f, lo, hi) => { for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; } return (lo + hi) / 2; };
const M = {
  basic: (q) => { const s = q.reduce((a, b) => a + b, 0); return q.map((x) => x / s); },
  power: (q) => { const k = bisect((k) => q.reduce((a, p) => a + p ** k, 0) - 1, 1, 4); return q.map((p) => p ** k); },
  shin: (q) => { const S = q.reduce((a, b) => a + b, 0); const pz = (z) => q.map((x) => (Math.sqrt(z * z + 4 * (1 - z) * x * x / S) - z) / (2 * (1 - z))); const z = bisect((z) => pz(z).reduce((a, b) => a + b, 0) - 1, 0, 0.4); return pz(z); },
  additive: (q) => { const e = (q.reduce((a, b) => a + b, 0) - 1) / q.length; const p = q.map((x) => Math.max(1e-4, x - e)); const s = p.reduce((a, b) => a + b, 0); return p.map((x) => x / s); },
  // odds ratio: one constant c with  p/(1-p) = q/(1-q) / c
  oddsratio: (q) => { const f = (c) => q.map((x) => x / (c + x - c * x)); const c = bisect((c) => f(c).reduce((a, b) => a + b, 0) - 1, 1, 3); return f(c); },
};
const names = Object.keys(M);
const acc = Object.fromEntries(names.map((n) => [n, { tr: [0, 0], ho: [0, 0], fav: { n: 0, p: 0, y: 0 }, mid: { n: 0, p: 0, y: 0 }, dog: { n: 0, p: 0, y: 0 }, ou: [0, 0], ouHi: { n: 0, p: 0, y: 0 } }]));
let margin = 0;
for (const g of games) {
  const o = odds.get(g.id), q = [1 / o.h, 1 / o.d, 1 / o.a], res = g.hs > g.as ? 0 : g.hs === g.as ? 1 : 2;
  margin += q[0] + q[1] + q[2] - 1;
  const ouOk = o.tl !== null && o.tl !== undefined && o.to > 1 && o.tu > 1 && g.hs + g.as !== o.tl;
  for (const n of names) {
    const p = M[n](q), a = acc[n], set = g.date < HOLD ? a.tr : a.ho;
    set[0] += -Math.log(Math.max(1e-9, p[res])); set[1]++;
    p.forEach((x, i) => { const b = x >= 0.75 ? a.fav : x >= 0.45 ? a.mid : x < 0.15 ? a.dog : null; if (b) { b.n++; b.p += x; b.y += res === i ? 1 : 0; } });
    if (ouOk) { const t = M[n]([1 / o.to, 1 / o.tu]); const y = g.hs + g.as > o.tl ? 0 : 1; a.ou[0] += -Math.log(Math.max(1e-9, t[y])); a.ou[1]++; t.forEach((x, i) => { if (x >= 0.62) { a.ouHi.n++; a.ouHi.p += x; a.ouHi.y += y === i ? 1 : 0; } }); }
  }
}
console.log(games.length, "games with a closing 1X2 · mean margin", (margin / games.length * 100).toFixed(2) + "%");
console.log("method".padEnd(10), "1X2 logloss train | hold-out  | p≥75%: n pred→actual | 45–75%: pred→actual | <15%: n pred→actual | O/U logloss | O/U side ≥62%: n pred→actual");
const f = (b) => `${String(b.n).padStart(5)} ${(b.p / b.n * 100).toFixed(1)}→${(b.y / b.n * 100).toFixed(1)}`;
for (const n of names) { const a = acc[n]; console.log(n.padEnd(10), (a.tr[0] / a.tr[1]).toFixed(5).padStart(12), "     |", (a.ho[0] / a.ho[1]).toFixed(5), " |", f(a.fav), "    |", f(a.mid), " |", f(a.dog), " |", (a.ou[0] / a.ou[1]).toFixed(5), "  |", f(a.ouHi)); }
