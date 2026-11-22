// How often does the live coupon change what it recommends? Finished games replayed minute by
// minute (6' to 84'), the coupon rebuilt each minute the way the Live page asks for it.
//   node --import ./lib-register.mjs livehold.mjs
// Three ways are compared for the "Safe" coupon (target 2), on one game in play and on two:
//   old    the rule before 22 Nov 2026: the bet priced closest to what the target needs, any bet
//          at 50% or more, rebuilt from nothing at each refresh
//   fresh  today's rule without memory: every leg at 62% or more, still rebuilt from nothing
//   held   today's rule as the page uses it: the legs on screen stay while they are still bets
//          worth taking (buildLiveCoupon's `keep`)
// A change is "quiet" when neither the score nor the red cards moved since the minute before.
import { loadGames, stateAt, won, mean } from "./livelib.mjs";
import { buildLiveCoupon, liveMarkets, liveOdds } from "../../lib/livecoupon.js";
import { liveAnalyse } from "../../lib/model.js";

const OPP = (a, b) => {
  const pair = (x, y) => (a === x && b === y) || (a === y && b === x);
  if (pair("BTTS_Y", "BTTS_N") || pair("1", "X2") || pair("2", "1X") || pair("X", "12")) return true;
  const ma = a.match(/^([OU])(.+)$/), mb = b.match(/^([OU])(.+)$/);
  return !!(ma && mb && ma[1] !== mb[1] && ma[2] === mb[2]);
};

// the rule before 22 Nov 2026, kept here for the comparison (one or two games, target 2)
function oldBuild(rows, target = 2) {
  const pool = rows.map(({ ev, analysis }) => { const L = liveAnalyse(ev, analysis, {}); return L?.probs ? { ev, markets: liveMarkets(ev, L).map((m) => ({ ...m, odds: liveOdds(m.p) })).filter((m) => m.p >= 0.5 && m.p <= 0.96 && m.odds >= 1.18 && m.odds <= 3.6) } : null; }).filter((g) => g?.markets.length);
  let n = Math.min(4, pool.length);
  for (let k = 1; k <= Math.min(4, pool.length); k++) if (1 / (1.07 * Math.pow(target, 1 / k)) >= 0.62) { n = k; break; }
  const legs = [], used = new Set(); let acc = 1;
  for (let k = 0; k < n; k++) {
    const want = Math.log(Math.pow(target / acc, 1 / (n - k))), last = k === n - 1;
    let best = null;
    for (const g of pool) { if (used.has(g.ev.id)) continue; for (const m of g.markets) { let d = Math.abs(Math.log(m.odds) - want); if (last && Math.log(m.odds) < want - Math.log(1.04)) d += 0.25; if (!best || d < best.d) best = { g, m, d }; } }
    if (!best) break;
    used.add(best.g.ev.id); legs.push({ eventId: best.g.ev.id, key: best.m.key, odds: best.m.odds, p: best.m.p }); acc *= best.m.odds;
  }
  return { legs };
}

const { games } = loadGames();
const rowOf = (g, m) => ({ ev: stateAt(g, m), analysis: { quality: "market", ...g.pre } });
const sig = (c) => c.legs.map((l) => `${l.eventId}:${l.key}`).sort().join("|");
const final = new Map(games.map((g) => [g.id, g]));

function run(name, sets, build) {
  let shown = 0, quiet = 0, loud = 0, opp = 0, said = 0, hit = 0, legsShown = 0, distinct = 0, odds = 0;
  for (const set of sets) {
    let prev = null, prevState = "", memory = new Map();
    const seen = new Set();
    for (let m = 6; m <= 84; m++) {
      const rows = set.map((g) => rowOf(g, m));
      const state = rows.map((r) => `${r.ev.home.score}-${r.ev.away.score}/${r.ev.reds.home}${r.ev.reds.away}`).join(" ");
      const c = build(rows, memory);
      if (!c.legs.length) { prev = null; prevState = state; continue; }
      shown++; seen.add(sig(c));
      let o = 1;
      for (const l of c.legs) { const g = final.get(l.eventId); said += l.p; hit += won(l.key, g.hs, g.as) ? 1 : 0; legsShown++; o *= l.odds; }
      odds += o;
      if (prev && sig(prev) !== sig(c)) {
        if (state === prevState) {
          quiet++;
          if (c.legs.some((l) => prev.legs.some((x) => x.eventId === l.eventId && OPP(x.key, l.key)))) opp++;
        } else loud++;
      }
      prev = c; prevState = state;
    }
    distinct += seen.size;
  }
  const per = (x) => (x / sets.length).toFixed(2);
  console.log(name.padEnd(8), `coupons shown ${String(shown).padStart(6)} | per game-set: ${per(distinct)} different coupons, ${per(quiet)} quiet changes (${per(opp)} to the opposite bet), ${per(loud)} after a goal or red card | avg odds ${(odds / shown).toFixed(2)} | legs said ${(100 * said / legsShown).toFixed(1)}% → won ${(100 * hit / legsShown).toFixed(1)}%`);
}

const fresh = (rows) => buildLiveCoupon(rows, { target: 2, maxLegs: 4 });
const held = (rows, memory) => {
  const c = buildLiveCoupon(rows, { target: 2, maxLegs: 4, keep: [...memory.values()] });
  const next = new Map();
  for (const l of c.legs) { const k = `${l.eventId}:${l.key}`; next.set(k, memory.get(k) || { eventId: l.eventId, key: l.key, odds: l.odds }); }
  memory.clear(); for (const [k, v] of next) memory.set(k, v);
  return c;
};

const singles = games.map((g) => [g]);
const pairs = []; for (let i = 0; i + 1 < games.length; i += 2) pairs.push([games[i], games[i + 1]]);
console.log(`${games.length} games replayed, minutes 6 to 84, "Safe" coupon (target 2)\n`);
console.log("ONE game in play");
run("old", singles, (rows) => oldBuild(rows));
run("fresh", singles, fresh);
run("held", singles, held);
console.log("\nTWO games in play");
run("old", pairs, (rows) => oldBuild(rows));
run("fresh", pairs, fresh);
run("held", pairs, held);
void mean;
