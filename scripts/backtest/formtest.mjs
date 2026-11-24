// Does recent form tell anything the closing price does not already say?
// For every priced game of the history with a clear favourite (60% or more once the margin is
// removed), the favourite's and the underdog's last five games (any competition in the history,
// within 75 days) — then, group by group: the chance the price gave the favourite against how
// often it won.
//   node formtest.mjs
// A coupon builder that "checks the last matches" is only better than the price if the groups in
// good form win MORE than their price says, and the ones in poor form less.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./load.mjs";
const DIR = path.join(ROOT, ".cache", "soccer");
const mk = JSON.parse(fs.readFileSync(path.join(DIR, "market.json"), "utf8"));
const all = [];
const root = path.join(DIR, "months");
const seen = new Set();
for (const league of fs.readdirSync(root)) for (const f of fs.readdirSync(path.join(root, league))) {
  const d = JSON.parse(fs.readFileSync(path.join(root, league, f), "utf8"));
  for (const e of d.events || []) {
    if (seen.has(e.id) || !e.completed || e.state !== "post") continue;
    const H = e.competitors?.find((x) => x.homeAway === "home"), A = e.competitors?.find((x) => x.homeAway === "away");
    if (!H?.id || !A?.id || H.id === A.id) continue;
    const hs = Number(H.score), as = Number(A.score);
    if (!Number.isFinite(hs) || !Number.isFinite(as) || /abandon|postpon|cancel|awarded/i.test(e.detail || "")) continue;
    seen.add(e.id);
    all.push({ id: e.id, date: Date.parse(e.date), league, h: H.id, a: A.id, hs, as, et: /AET|Pen|ET/i.test(e.detail || "") });
  }
}
all.sort((x, y) => x.date - y.date);
// each team's results in order
const hist = new Map();
const lastFive = (team, before) => { const l = (hist.get(team) || []).filter((r) => r.date < before && before - r.date < 75 * 86400e3).slice(-5); return l.length === 5 ? l : null; };
const rows = [];
for (const g of all) {
  const m = mk[g.id];
  if (m?.p) {
    const [ph, , pa] = m.p;
    const favHome = ph >= pa, p = favHome ? ph : pa;
    if (p >= 0.6) {
      const f = lastFive(favHome ? g.h : g.a, g.date), u = lastFive(favHome ? g.a : g.h, g.date);
      if (f && u) {
        const won = g.et ? 0 : favHome ? (g.hs > g.as ? 1 : 0) : (g.as > g.hs ? 1 : 0);
        const cnt = (l, r) => l.filter((x) => x.r === r).length;
        rows.push({ p, won, fw: cnt(f, "W"), fl: cnt(f, "L"), uw: cnt(u, "W"), ul: cnt(u, "L"), fgd: f.reduce((s, x) => s + x.gd, 0), favHome, league: g.league, date: g.date });
      }
    }
  }
  const push = (team, gf, ga) => { if (!hist.has(team)) hist.set(team, []); hist.get(team).push({ date: g.date, r: gf > ga ? "W" : gf < ga ? "L" : "D", gd: gf - ga }); };
  push(g.h, g.hs, g.as); push(g.a, g.as, g.hs);
}
const line = (name, l) => {
  if (!l.length) { console.log(name.padEnd(56), "none"); return; }
  const said = l.reduce((s, r) => s + r.p, 0) / l.length, won = l.reduce((s, r) => s + r.won, 0) / l.length;
  const se = Math.sqrt(l.reduce((s, r) => s + r.p * (1 - r.p), 0)) / l.length;
  const gap = won - said;
  console.log(name.padEnd(56), `n ${String(l.length).padStart(5)} | price said ${(said * 100).toFixed(1)}% → won ${(won * 100).toFixed(1)}% | gap ${(gap >= 0 ? "+" : "") + (gap * 100).toFixed(1)} ±${(se * 100).toFixed(1)}${Math.abs(gap) > 2 * se ? "  *" : ""}`);
};
console.log(`${all.length} games in the history, ${rows.length} with a favourite at 60%+ and five recent games for both sides\n`);
line("ALL favourites at 60%+", rows);
console.log("\nby the favourite's wins in its last five:");
for (const k of [5, 4, 3, 2]) line(`  ${k === 2 ? "2 or fewer" : k} wins`, rows.filter((r) => (k === 2 ? r.fw <= 2 : r.fw === k)));
console.log("\nby the favourite's losses in its last five:");
for (const k of [0, 1, 2]) line(`  ${k === 2 ? "2 or more" : k} losses`, rows.filter((r) => (k === 2 ? r.fl >= 2 : r.fl === k)));
console.log("\nby the underdog's last five:");
line("  underdog won 0 or 1", rows.filter((r) => r.uw <= 1));
line("  underdog won 2", rows.filter((r) => r.uw === 2));
line("  underdog won 3 or more (in form)", rows.filter((r) => r.uw >= 3));
line("  underdog lost 3 or more", rows.filter((r) => r.ul >= 3));
console.log("\nthe screen (favourite won 4+ of five AND underdog won at most 1):");
line("  passes the screen", rows.filter((r) => r.fw >= 4 && r.uw <= 1));
line("  favourite in poor form (2 or fewer wins)", rows.filter((r) => r.fw <= 2));
line("  poor-form favourite against an in-form underdog", rows.filter((r) => r.fw <= 2 && r.uw >= 3));
console.log("\nsame, favourites at 70%+ only (odds about 1.35 and under):");
const big = rows.filter((r) => r.p >= 0.7);
line("  all", big);
line("  favourite won 4+ of five", big.filter((r) => r.fw >= 4));
line("  favourite won 2 or fewer", big.filter((r) => r.fw <= 2));
line("  passes the screen", big.filter((r) => r.fw >= 4 && r.uw <= 1));
console.log("\nEuropean competitions only (Champions League, Europa League, Conference League):");
const eu = rows.filter((r) => /^uefa\./.test(r.league));
line("  all", eu);
line("  favourite won 4+ of five", eu.filter((r) => r.fw >= 4));
line("  favourite won 3 or fewer", eu.filter((r) => r.fw <= 3));
console.log("\nhome and away favourites:");
line("  favourite at home", rows.filter((r) => r.favHome));
line("  favourite away", rows.filter((r) => !r.favHome));
