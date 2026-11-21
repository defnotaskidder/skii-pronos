// The live model's goal rates against what happened: goals each side still scored after a check
// point, divided by what the model expected, by minute and by game state.
//   node --import ./lib-register.mjs liverate.mjs [priced|all]
import { loadGames, stateAt, CHECKS } from "./livelib.mjs";
import { liveAnalyse } from "../../lib/model.js";
const which = process.argv[2] || "priced";
const { games: all } = loadGames();
const games = which === "all" ? all : all.filter((g) => g.kind !== "model");
console.log("games", games.length, which);
console.log("pre-match: expected goals", (games.reduce((a, g) => a + g.pre.xg.home + g.pre.xg.away, 0) / games.length).toFixed(3), "actual", (games.reduce((a, g) => a + g.hs + g.as, 0) / games.length).toFixed(3),
  "| home exp", (games.reduce((a, g) => a + g.pre.xg.home, 0) / games.length).toFixed(3), "act", (games.reduce((a, g) => a + g.hs, 0) / games.length).toFixed(3), "| away exp", (games.reduce((a, g) => a + g.pre.xg.away, 0) / games.length).toFixed(3), "act", (games.reduce((a, g) => a + g.as, 0) / games.length).toFixed(3));
// one row per side per check point
const rows = [];
for (const g of games) for (const at of CHECKS) {
  const ev = stateAt(g, at), L = liveAnalyse(ev, g.pre, {});
  if (!L) continue;
  const hs = ev.home.score, as = ev.away.score;
  for (const side of ["home", "away"]) {
    const lead = side === "home" ? hs - as : as - hs;
    const own = side === "home" ? ev.reds.home : ev.reds.away, opp = side === "home" ? ev.reds.away : ev.reds.home;
    rows.push({ g, at, side, lead, own, opp, exp: L.remainingXg[side], act: (side === "home" ? g.hs - hs : g.as - as), fav: g.pre.xg[side] >= g.pre.xg[side === "home" ? "away" : "home"] });
  }
}
const ratio = (name, l) => {
  if (l.length < 30) return console.log(name.padEnd(34), `(${l.length})`);
  const E = l.reduce((a, r) => a + r.exp, 0), A = l.reduce((a, r) => a + r.act, 0);
  const by = new Map(); for (const r of l) by.set(r.g.id, (by.get(r.g.id) || 0) + (r.act - r.exp * A / E));
  const se = Math.sqrt([...by.values()].reduce((a, x) => a + x * x, 0)) / E;
  console.log(name.padEnd(34), `n ${String(l.length).padStart(6)} | expected ${E.toFixed(0).padStart(6)} | scored ${String(A).padStart(6)} | ratio ${(A / E).toFixed(3)} ±${se.toFixed(3)}`);
};
const clean = rows.filter((r) => r.own === 0 && r.opp === 0);
console.log("\n-- no red card: level score, by minute (tests the clock)");
for (const at of CHECKS) ratio(String(at), clean.filter((r) => r.at === at && r.lead === 0));
console.log("\n-- no red card: by state (the model multiplies a leader by 0.90 and a side behind by 1.15)");
for (const [n, f] of [["level", (r) => r.lead === 0], ["ahead by 1", (r) => r.lead === 1], ["ahead by 2+", (r) => r.lead >= 2], ["behind by 1", (r) => r.lead === -1], ["behind by 2+", (r) => r.lead <= -2]]) {
  ratio(n, clean.filter(f));
  for (const [h, t] of [["  1st half", (r) => r.at !== "HT" && r.at <= 45], ["  HT–65", (r) => r.at === "HT" || (r.at > 45 && r.at <= 65)], ["  70–80", (r) => r.at !== "HT" && r.at >= 70]]) ratio(n + h, clean.filter((r) => f(r) && t(r)));
}
console.log("\n-- no red card: favourite / outsider by state");
for (const [n, f] of [["favourite level", (r) => r.fav && r.lead === 0], ["outsider level", (r) => !r.fav && r.lead === 0], ["favourite ahead", (r) => r.fav && r.lead > 0], ["outsider ahead", (r) => !r.fav && r.lead > 0], ["favourite behind", (r) => r.fav && r.lead < 0], ["outsider behind", (r) => !r.fav && r.lead < 0]]) ratio(n, clean.filter(f));
console.log("\n-- by minute, all states, no red card");
for (const at of CHECKS) ratio(String(at), clean.filter((r) => r.at === at));
console.log("\n-- red cards (the model multiplies the side a man down by 0.72 and the other by 1.22)");
ratio("a man down", rows.filter((r) => r.own > r.opp));
ratio("a man up", rows.filter((r) => r.opp > r.own));
