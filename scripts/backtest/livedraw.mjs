// Where the live model is weakest: the draw, and the bets that hold only if few goals come.
// Is it the game state, the clock, or the pre-match goal expectation it starts from (rebuilt here
// from the 1X2 alone, with no total line)?
//   node --import ./lib-register.mjs livedraw.mjs
import { loadGames, replay, show } from "./livelib.mjs";
const { games: all } = loadGames();
const games = all.filter((g) => g.kind !== "model");
const rows = replay(games);
console.log("games", games.length);
console.log("\n-- the draw, by the chance the model gives it");
const X = rows.filter((r) => r.key === "X");
for (const [lo, hi] of [[0.05, 0.2], [0.2, 0.3], [0.3, 0.4], [0.4, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 0.85]]) show(`${lo}–${hi}`, X.filter((r) => r.p >= lo && r.p < hi));
console.log("-- the draw at 30% or more, by state and minute");
const X3 = X.filter((r) => r.p >= 0.3);
show("level score", X3.filter((r) => r.lead === 0));
show("not level", X3.filter((r) => r.lead !== 0));
for (const [n, f] of [["1st half", (r) => r.at !== "HT" && r.at <= 45], ["HT–65", (r) => r.at === "HT" || (r.at > 45 && r.at <= 65)], ["70–80", (r) => r.at !== "HT" && r.at >= 70]]) show("level · " + n, X3.filter((r) => r.lead === 0 && f(r)));
show("level 0-0", X3.filter((r) => r.lead === 0 && r.total === 0));
show("level 1-1 or more", X3.filter((r) => r.lead === 0 && r.total > 0));

// pre-match: does the goal expectation rebuilt from the 1X2 alone stretch too far? (low ones too low, high ones too high)
console.log("\n-- pre-match expected goals (rebuilt from the 1X2 alone) against goals scored, by level of expectation");
const sorted = [...games].sort((a, b) => (a.pre.xg.home + a.pre.xg.away) - (b.pre.xg.home + b.pre.xg.away));
const q = 5;
for (let i = 0; i < q; i++) {
  const l = sorted.slice(Math.floor(i * sorted.length / q), Math.floor((i + 1) * sorted.length / q));
  const e = l.reduce((a, g) => a + g.pre.xg.home + g.pre.xg.away, 0) / l.length, s = l.reduce((a, g) => a + g.hs + g.as, 0) / l.length;
  const sd = Math.sqrt(l.reduce((a, g) => a + (g.hs + g.as - s) ** 2, 0) / l.length) / Math.sqrt(l.length);
  console.log(`fifth ${i + 1}: games ${l.length} | expected ${e.toFixed(2)} | scored ${s.toFixed(2)} ±${sd.toFixed(2)} | ratio ${(s / e).toFixed(3)} | draws: said ${(l.reduce((a, g) => a + g.probs.d, 0) / l.length * 100).toFixed(1)}% → ${(l.filter((g) => g.hs === g.as).length / l.length * 100).toFixed(1)}%`);
}
const slope = (() => { const xs = games.map((g) => g.pre.xg.home + g.pre.xg.away), ys = games.map((g) => g.hs + g.as); const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length; let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; } return { b: sxy / sxx, mx, my, se: Math.sqrt(ys.reduce((a, y, i) => a + (y - my - (sxy / sxx) * (xs[i] - mx)) ** 2, 0) / (xs.length - 2) / sxx) }; })();
console.log(`goals scored = ${slope.my.toFixed(2)} + ${slope.b.toFixed(3)} (±${slope.se.toFixed(3)}) × (expected − ${slope.mx.toFixed(2)})   — a slope of 1 means the expectation is not stretched`);

console.log("\n-- live, markets at 55–85%, by fifth of pre-match expected goals: under and BTTS no / over and BTTS yes");
const cut = [0.2, 0.4, 0.6, 0.8].map((f) => { const g = sorted[Math.floor(f * sorted.length)]; return g.pre.xg.home + g.pre.xg.away; });
const fifth = (g) => { const t = g.pre.xg.home + g.pre.xg.away; return cut.filter((c) => t >= c).length; };
const mid = rows.filter((r) => r.p >= 0.55 && r.p <= 0.85);
for (let i = 0; i < 5; i++) { show(`fifth ${i + 1} · few goals`, mid.filter((r) => fifth(r.g) === i && (/^U/.test(r.key) || r.key === "BTTS_N" || r.key === "X"))); show(`fifth ${i + 1} · more goals`, mid.filter((r) => fifth(r.g) === i && (/^O/.test(r.key) || r.key === "BTTS_Y" || /^[HA]O/.test(r.key)))); }
