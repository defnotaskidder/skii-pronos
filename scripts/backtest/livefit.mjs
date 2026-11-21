// Fits the live model's game-state multipliers (and the weight of the goals seen so far) on half
// of the replayed games, then scores every candidate on the other half: log loss over every market
// at every check point, against the settings the site runs now.
//   node --import ./lib-register.mjs livefit.mjs [priced|all] ['[{"level":1,"ahead1":1,"ahead2":1,"behind1":1.15,"behind2":1.15}]']
// (the last argument: other settings to score alongside)
import { loadGames, stateAt, replay, show, CHECKS } from "./livelib.mjs";
import { liveAnalyse, LIVE_TUNE } from "../../lib/model.js";
const which = process.argv[2] || "priced";
const { games: all } = loadGames();
const games = which === "all" ? all : all.filter((g) => g.kind !== "model");
const isTrain = (g) => Number(g.id) % 2 === 0;
const train = games.filter(isTrain), test = games.filter((g) => !isTrain(g));
console.log("games", games.length, which, "| train", train.length, "| test", test.length, "| site now", JSON.stringify(LIVE_TUNE));
const STATES = ["level", "ahead1", "ahead2", "behind1", "behind2"];
const stateOf = (lead) => (lead === 0 ? "level" : lead === 1 ? "ahead1" : lead > 1 ? "ahead2" : lead === -1 ? "behind1" : "behind2");
const r3 = (x) => Math.round(x * 1000) / 1000;

// multipliers that make expected = scored in each state, on games without a red card
function fit(set, tempo, split = null) {
  const neutral = { level: 1, ahead1: 1, ahead2: 1, behind1: 1, behind2: 1, tempo };
  const E = {}, A = {};
  for (const g of set) for (const at of CHECKS) {
    const ev = stateAt(g, at);
    if (ev.reds.home || ev.reds.away) continue;
    const L = liveAnalyse(ev, g.pre, {}, neutral);
    const hs = ev.home.score, as = ev.away.score;
    for (const [side, lead, exp, act] of [["home", hs - as, L.remainingXg.home, g.hs - hs], ["away", as - hs, L.remainingXg.away, g.as - as]]) {
      const k = stateOf(lead) + (split ? split(at) : "");
      E[k] = (E[k] || 0) + exp; A[k] = (A[k] || 0) + act;
    }
  }
  const out = { tempo };
  for (const k of Object.keys(E)) out[k] = r3(A[k] / E[k]);
  return out;
}
const clip = (p) => Math.min(0.995, Math.max(0.005, p));
const ll = (r) => -(r.y ? Math.log(clip(r.p)) : Math.log(1 - clip(r.p)));
function score(set, tune) {
  const rows = replay(set, CHECKS, tune);
  const by = new Map(); let sum = 0;
  for (const r of rows) { const l = ll(r); sum += l; by.set(r.g.id + "|" + r.at + "|" + r.key, l); }
  return { rows, mean: sum / rows.length, by };
}
function compare(name, set, tune, base) {
  const s = score(set, tune);
  // paired difference with the site's settings, a game counted once
  const d = new Map(); let n = 0;
  for (const r of s.rows) { const k = r.g.id + "|" + r.at + "|" + r.key; if (!base.by.has(k)) continue; n++; d.set(r.g.id, (d.get(r.g.id) || 0) + (s.by.get(k) - base.by.get(k))); }
  const tot = [...d.values()].reduce((a, x) => a + x, 0), se = Math.sqrt([...d.values()].reduce((a, x) => a + x * x, 0)) / n;
  console.log(name.padEnd(30), `log loss ${s.mean.toFixed(5)} | vs site ${(tot / n >= 0 ? "+" : "") + (tot / n).toFixed(5)} ±${se.toFixed(5)}`, JSON.stringify(tune));
  return s;
}

const cands = [["site now", LIVE_TUNE]];
for (const tempo of [0, 4, 8, 16, 32]) cands.push([`fitted states, tempo ${tempo}`, fit(train, tempo)]);
const f0 = fit(train, 0);
const scale = r3(STATES.reduce((a, k) => a + f0[k], 0) / STATES.length);
cands.push(["site × one scale", { level: scale, ahead1: r3(0.9 * scale), ahead2: r3(0.9 * scale), behind1: r3(1.15 * scale), behind2: r3(1.15 * scale), tempo: 0 }]);
cands.push(["no state effect", { level: 1, ahead1: 1, ahead2: 1, behind1: 1, behind2: 1, tempo: 0 }]);
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : []; // settings given on the command line
extra.forEach((t, i) => cands.push([`given ${i + 1}`, { tempo: 0, ...t }]));
console.log("\n-- TRAIN half");
const baseTr = score(train, LIVE_TUNE);
for (const [n, t] of cands) compare(n, train, t, baseTr);
console.log("\n-- TEST half (never used to fit)");
const baseTe = score(test, LIVE_TUNE);
for (const [n, t] of cands) compare(n, test, t, baseTe);
console.log("\n-- ALL games (the fitted candidates have seen half of them)");
const baseAll = score(games, LIVE_TUNE);
for (const [n, t] of cands) compare(n, games, t, baseAll);
console.log("\n-- multipliers fitted on the other half instead (stability)");
for (const tempo of [0, 8, 16]) console.log("tempo", tempo, JSON.stringify(fit(test, tempo)));
console.log("\n-- multipliers fitted on all games");
for (const tempo of [0, 8, 16]) console.log("tempo", tempo, JSON.stringify(fit(games, tempo)));
console.log("\n-- by half of the game (tempo 0), all games");
console.log(JSON.stringify(fit(games, 0, (at) => (at !== "HT" && at <= 45 ? ":1st" : ":2nd"))));

const pick = extra.length ? { tempo: 0, ...extra[extra.length - 1] } : cands[1][1];
console.log("\n-- TEST half, said → won, markets at 55–85%:", JSON.stringify(pick));
const fam = (r) => (/^[12]$/.test(r.key) ? "win" : r.key === "X" ? "draw" : /^(1X|X2)$/.test(r.key) ? "side or draw" : r.key === "12" ? "no draw" : /^O/.test(r.key) ? "over" : /^U/.test(r.key) ? "under" : r.key === "BTTS_Y" ? "btts yes" : r.key === "BTTS_N" ? "btts no" : "team scores again");
for (const [label, tune] of [["site now", LIVE_TUNE], ["candidate", pick]]) {
  const mid = replay(test, CHECKS, tune).filter((r) => r.p >= 0.55 && r.p <= 0.85);
  console.log(label);
  show("  all", mid);
  for (const f of ["win", "side or draw", "no draw", "over", "under", "btts yes", "btts no", "team scores again"]) show("  " + f, mid.filter((r) => fam(r) === f));
  for (const [h, t] of [["1st half", (r) => r.at !== "HT" && r.at <= 45], ["HT–65", (r) => r.at === "HT" || (r.at > 45 && r.at <= 65)], ["70–80", (r) => r.at !== "HT" && r.at >= 70]]) show("  " + h, mid.filter(t));
}
