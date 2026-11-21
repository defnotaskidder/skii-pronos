// The OP cote 2, rebuilt for every day of the closing-line history: football games a bookmaker
// priced, legs at their real closing price, each counted at the chance its own price implies
// (margin removed), 2–3 legs whose odds multiply to 2 or a little more — the combination with the
// highest chance. Does it land as often as that chance says?
//   node opcote.mjs
import fs from "node:fs";
import path from "node:path";
import { loadGames, ROOT, HOLD } from "./load.mjs";
const DIR = path.join(ROOT, ".cache", "soccer", "odds");
const raw = new Map();
for (const f of fs.readdirSync(DIR)) { const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); for (const [id, o] of Object.entries(d.games || {})) raw.set(id, o); }
const games = loadGames();
const MIN = 1.18, MAX = 1.6, LO = 1.98, HI = 2.3;
// legs of a game: the favourite to win at its closing price; over / under at theirs (pair de-vigged)
function legsOf(g) {
  const o = raw.get(g.id); if (!o) return [];
  const et = /AET|Pen|ET/i.test(g.detail); // settled at 90': a game that went to extra time was level
  const out = [];
  for (const [side, odds, p] of [["1", o.h, g.p.h], ["2", o.a, g.p.a]]) if (odds >= MIN && odds <= MAX) out.push({ id: g.id, kind: "win", odds, p, y: et ? 0 : (side === "1" ? g.hs > g.as : g.as > g.hs) ? 1 : 0 });
  if (!et && o.tl && o.to > 1 && o.tu > 1) {
    const po = (1 / o.to) / (1 / o.to + 1 / o.tu), tot = g.hs + g.as;
    if (Number.isInteger(o.tl * 2) && !Number.isInteger(o.tl)) for (const [odds, p, y] of [[o.to, po, tot > o.tl ? 1 : 0], [o.tu, 1 - po, tot < o.tl ? 1 : 0]]) if (odds >= MIN && odds <= MAX) out.push({ id: g.id, kind: "total", odds, p, y });
  }
  return out.filter((l) => l.p * l.odds <= 1.005);
}
const days = new Map();
for (const g of games) { const d = new Date(g.date).toISOString().slice(0, 10); if (!days.has(d)) days.set(d, []); days.get(d).push(...legsOf(g)); }

// rule(cands) → legs
const best = (cands, { sizes = [2, 3], kinds = null, maxLeg = MAX, top = 40 } = {}) => {
  const c = cands.filter((l) => (!kinds || kinds.includes(l.kind)) && l.odds <= maxLeg).sort((a, b) => b.p * b.odds - a.p * a.odds).slice(0, top);
  let win = null;
  const tryIt = (legs) => { if (new Set(legs.map((l) => l.id)).size < legs.length) return; const o = legs.reduce((a, l) => a * l.odds, 1); if (o < LO || o > HI) return; const p = legs.reduce((a, l) => a * l.p, 1); if (!win || p > win.p) win = { legs, o, p }; };
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) { if (sizes.includes(2)) tryIt([c[i], c[j]]); if (sizes.includes(3)) for (let k = j + 1; k < c.length; k++) tryIt([c[i], c[j], c[k]]); }
  return win;
};
const RULES = {
  "the site's rule (2–3 legs, wins)": (c) => best(c, { kinds: ["win"] }),
  "wins and totals": (c) => best(c),
  "two legs only, wins": (c) => best(c, { sizes: [2], kinds: ["win"] }),
  "three legs only, wins": (c) => best(c, { sizes: [3], kinds: ["win"] }),
  "three short favourites (≤1.35)": (c) => best(c, { sizes: [3], kinds: ["win"], maxLeg: 1.35 }),
};
const fmt = (x) => (x * 100).toFixed(1);
for (const [name, rule] of Object.entries(RULES)) {
  console.log("\n== " + name);
  for (const [label, test] of [["all days", () => true], ["before July 2025", (d) => Date.parse(d) < HOLD], ["since July 2025", (d) => Date.parse(d) >= HOLD]]) {
    let n = 0, sp = 0, sy = 0, roi = 0, so = 0, legs = 0, varsum = 0;
    for (const [d, cands] of days) {
      if (!test(d) || cands.length < 2) continue;
      const w = rule(cands); if (!w) continue;
      const y = w.legs.every((l) => l.y) ? 1 : 0;
      n++; sp += w.p; sy += y; so += w.o; roi += y ? w.o - 1 : -1; legs += w.legs.length; varsum += w.p * (1 - w.p);
    }
    if (!n) { console.log(label.padEnd(18), "none"); continue; }
    console.log(label.padEnd(18), `days with a coupon ${String(n).padStart(4)} | avg odds ${(so / n).toFixed(2)} | legs ${(legs / n).toFixed(2)} | said ${fmt(sp / n)} → won ${fmt(sy / n)} (gap ${(sy - sp) / n >= 0 ? "+" : ""}${fmt((sy - sp) / n)} ±${fmt(Math.sqrt(varsum) / n)}) | return per unit staked ${(roi / n * 100 >= 0 ? "+" : "") + (roi / n * 100).toFixed(1)}%`);
  }
}
// the legs themselves, by price: is a favourite's chance the truth?
console.log("\n== single legs, by closing price (said → won)");
const all = [...days.values()].flat();
for (const kind of ["win", "total"]) for (const [lo, hi] of [[1.18, 1.25], [1.25, 1.33], [1.33, 1.42], [1.42, 1.5], [1.5, 1.6]]) { const l = all.filter((x) => x.kind === kind && x.odds >= lo && x.odds < hi); if (l.length) console.log(kind.padEnd(6), `${lo}–${hi}`.padEnd(10), `n ${String(l.length).padStart(5)} | said ${fmt(l.reduce((a, x) => a + x.p, 0) / l.length)} → won ${fmt(l.reduce((a, x) => a + x.y, 0) / l.length)} | return ${(l.reduce((a, x) => a + (x.y ? x.odds - 1 : -1), 0) / l.length * 100).toFixed(1)}%`); }
