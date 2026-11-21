// The OP live pick as a visitor would have seen it: every five minutes of the data's period, the
// games in play at that moment (from their real kick-off times) go through the site's own
// selector (lib/livecoupon.js bestLivePicks), and the pick it names is graded on the final score.
//   node --import ./lib-register.mjs liveop.mjs
import fs from "node:fs";
import { loadGames, stateAt, won, line } from "./livelib.mjs";
import { bestLivePicks, OP_LEVELS } from "../../lib/livecoupon.js";
const { games } = loadGames();
const kick = new Map(JSON.parse(fs.readFileSync(new URL("./picks.json", import.meta.url), "utf8")).map((p) => [p.event_id, Date.parse(p.kickoff)]));
for (const g of games) g.kick = kick.get(g.id);
const list = games.filter((g) => Number.isFinite(g.kick)).sort((a, b) => a.kick - b.kick);
// minutes since kick-off → what the feed shows: 45' + ~2 of stoppage, a 15-minute break, then the second half
const clockAt = (el) => (el < 1 ? null : el <= 45 ? Math.ceil(el) : el <= 47 ? 45 : el <= 62 ? "HT" : el <= 62 + 45 ? 45 + Math.ceil(el - 62) : null);
const analysisOf = (g) => ({ quality: g.kind === "model" ? "model" : "market", xg: g.pre.xg, probs: g.probs });
const rowAt = (g, at) => { const ev = stateAt(g, at); return { ev: { ...ev, home: { ...ev.home, name: "H" }, away: { ...ev.away, name: "A" } }, analysis: analysisOf(g) }; };
const STEP = 5 * 60e3;
const t0 = list[0].kick, t1 = list[list.length - 1].kick + 110 * 60e3;
console.log("games", list.length, "| priced or derived", list.filter((g) => g.kind !== "model").length, "| from", new Date(t0).toISOString().slice(0, 10), "to", new Date(t1).toISOString().slice(0, 10));

function run(opts, label) {
  const shown = []; let moments = 0, withPick = 0, lo = 0;
  for (let T = t0; T <= t1; T += STEP) {
    while (lo < list.length && list[lo].kick + 110 * 60e3 < T) lo++;
    const rows = [];
    for (let i = lo; i < list.length && list[i].kick <= T; i++) { const at = clockAt((T - list[i].kick) / 60e3); if (at !== null) rows.push(rowAt(list[i], at)); }
    if (!rows.length) continue;
    moments++;
    const { picks } = bestLivePicks(rows, { max: 1, ...opts });
    if (!picks.length) continue;
    withPick++;
    const k = picks[0], g = list.find((x) => x.id === k.eventId);
    shown.push({ g, key: k.key, p: k.p, floor: k.floor, odds: k.odds, y: won(k.key, g.hs, g.as) ? 1 : 0, minute: k.live.minute });
  }
  // the same bet on the same game stays on screen for several refreshes: count it once (at its first showing)
  const first = new Map(); for (const s of shown) { const id = s.g.id + "|" + s.key; if (!first.has(id)) first.set(id, s); }
  const uniq = [...first.values()], l = line(uniq), all = line(shown);
  const roi = uniq.reduce((a, s) => a + (s.y ? s.odds - 1 : -1), 0) / (uniq.length || 1);
  console.log(label.padEnd(26), `moments with football in play ${moments} | with a pick ${withPick} (${(withPick / moments * 100).toFixed(0)}%) | distinct picks ${uniq.length} on ${l?.games} games | said ${(l.p * 100).toFixed(1)} → won ${(l.y * 100).toFixed(1)} (gap ${(l.gap * 100 >= 0 ? "+" : "") + (l.gap * 100).toFixed(1)} ±${(l.se * 100).toFixed(1)}) | avg ≈odds ${(uniq.reduce((a, s) => a + s.odds, 0) / uniq.length).toFixed(2)} | at the ≈ price: ${(roi * 100 >= 0 ? "+" : "") + (roi * 100).toFixed(1)}% | every showing: said ${(all.p * 100).toFixed(1)} → won ${(all.y * 100).toFixed(1)}`);
  return uniq;
}
const fam = (k) => (/^[12]$/.test(k) ? "win" : k === "X" ? "draw" : /^(1X|X2)$/.test(k) ? "side or draw" : k === "12" ? "no draw" : /^O/.test(k) ? "over" : /^U/.test(k) ? "under" : k === "BTTS_Y" ? "btts yes" : k === "BTTS_N" ? "btts no" : "team scores again");
const VARIANTS = [["the site's rule", {}], ["draws allowed", { draws: true }], ["ranked on the worst case", { rank: "floor" }]];
for (const level of Object.keys(OP_LEVELS)) for (const [name, opt] of VARIANTS) {
  const u = run({ level, ...opt }, `${level} · ${name}`);
  if (name === "the site's rule") {
    const by = {}; for (const s of u) { const f = fam(s.key); (by[f] = by[f] || []).push(s); }
    console.log("    what it picked:", Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([f, l]) => `${f} ${l.length} (${(l.reduce((a, s) => a + s.y, 0) / l.length * 100).toFixed(0)}% won, said ${(l.reduce((a, s) => a + s.p, 0) / l.length * 100).toFixed(0)}%)`).join(" · "));
    const mins = [[6, 30], [31, 45], [46, 60], [61, 80]]; console.log("    by minute:", mins.map(([a, b]) => { const l = u.filter((s) => s.minute >= a && s.minute <= b); return `${a}–${b}': ${l.length} picks, ${l.length ? (l.reduce((x, s) => x + s.y, 0) / l.length * 100).toFixed(0) : "-"}% won (said ${l.length ? (l.reduce((x, s) => x + s.p, 0) / l.length * 100).toFixed(0) : "-"}%)`; }).join(" · "));
  }
}
