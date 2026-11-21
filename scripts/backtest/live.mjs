// Is the live model's chance the truth? Every market it prices, at every replayed check point,
// against the final score: by kind of game, by market, by minute, by game state, by chance level.
//   node --import ./lib-register.mjs live.mjs
import { loadGames, replay, show, CHECKS } from "./livelib.mjs";
const { games, bad, et, raw } = loadGames();
console.log(`games ${raw} | replayable ${games.length} | timeline doesn't match the score ${bad} | extra time ${et}`, JSON.stringify(games.reduce((a, g) => { a[g.kind] = (a[g.kind] || 0) + 1; return a; }, {})));
const rows = replay(games);
const priced = rows.filter((r) => r.g.kind !== "model");
console.log("\n-- by kind of game (all markets)");
for (const k of ["priced", "derived", "model"]) show(k, rows.filter((r) => r.g.kind === k));
const band = (r) => (r.p < 0.5 ? null : r.p < 0.6 ? "50-60" : r.p < 0.7 ? "60-70" : r.p < 0.8 ? "70-80" : r.p < 0.9 ? "80-90" : "90+");
for (const [name, set] of [["BOOKMAKER-PRICED GAMES (priced + derived)", priced], ["MODEL-ONLY GAMES", rows.filter((r) => r.g.kind === "model")]]) {
  console.log(`\n===== ${name}`);
  console.log("-- by chance level (markets at 50% or more)");
  for (const b of ["50-60", "60-70", "70-80", "80-90", "90+"]) show(b, set.filter((r) => band(r) === b));
  console.log("-- by market, chance 55–85%");
  const mid = set.filter((r) => r.p >= 0.55 && r.p <= 0.85);
  const fam = (r) => (/^[12X]$/.test(r.key) ? (r.key === "X" ? "draw" : "win") : /^(1X|X2)$/.test(r.key) ? "side or draw" : r.key === "12" ? "no draw" : /^O/.test(r.key) ? "over" : /^U/.test(r.key) ? "under" : r.key === "BTTS_Y" ? "btts yes" : r.key === "BTTS_N" ? "btts no" : "team scores again");
  for (const f of ["win", "draw", "side or draw", "no draw", "over", "under", "btts yes", "btts no", "team scores again"]) show(f, mid.filter((r) => fam(r) === f));
  console.log("-- by minute, chance 55–85%");
  for (const at of CHECKS) show(at, mid.filter((r) => r.at === at));
  console.log("-- by state, chance 55–85%: result markets (win / side or draw / no draw)");
  const res = mid.filter((r) => ["win", "side or draw", "no draw"].includes(fam(r)));
  const backs = (r) => (r.key === "1" || r.key === "1X" ? 1 : r.key === "2" || r.key === "X2" ? -1 : 0); // which side the bet is on
  show("on the side in front", res.filter((r) => backs(r) * r.lead > 0));
  show("on a side, level score", res.filter((r) => backs(r) !== 0 && r.lead === 0));
  show("on the side behind", res.filter((r) => backs(r) * r.lead < 0));
  show("with a red card in the game", res.filter((r) => r.reds > 0));
  console.log("-- family × half, chance 55–85%");
  for (const f of ["win", "side or draw", "no draw", "over", "under", "btts yes", "btts no", "team scores again"]) for (const [h, t] of [["1st half", (r) => r.at !== "HT" && r.at <= 45], ["HT–65", (r) => r.at === "HT" || (r.at > 45 && r.at <= 65)], ["70–80", (r) => r.at !== "HT" && r.at >= 70]]) show(`${f} · ${h}`, mid.filter((r) => fam(r) === f && t(r)));
}
