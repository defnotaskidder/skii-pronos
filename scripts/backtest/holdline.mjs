// One replayed game, minute by minute: what the "Safe" live coupon showed before 22 Nov 2026 (the
// bet nearest the target's odds, rebuilt at each refresh) and what the held coupon shows now.
//   node --import ./lib-register.mjs holdline.mjs [gameIndex]
import { loadGames, stateAt } from "./livelib.mjs";
import { buildLiveCoupon, liveMarkets, liveOdds } from "../../lib/livecoupon.js";
import { liveAnalyse } from "../../lib/model.js";

const { games } = loadGames();
// by default: the first game still 0-0 at half-time, so the clock alone moves the prices
const g = process.argv[2] ? games[Number(process.argv[2])] : games.find((x) => { const e = stateAt(x, "HT"); return e.home.score + e.away.score === 0 && x.hs + x.as >= 1; });
console.log(`${g.home} – ${g.away}, final ${g.hs}-${g.as}\n`);
const oldPick = (ev) => {
  const L = liveAnalyse(ev, g.pre, {});
  const ms = liveMarkets(ev, L).map((m) => ({ ...m, odds: liveOdds(m.p) })).filter((m) => m.p >= 0.5 && m.p <= 0.96 && m.odds >= 1.18 && m.odds <= 3.6);
  return ms.sort((a, b) => Math.abs(Math.log(a.odds) - Math.log(2)) - Math.abs(Math.log(b.odds) - Math.log(2)))[0] || null;
};
let memory = new Map(), lastOld = "", lastNew = "", oldChanges = 0, newChanges = 0;
for (let m = 6; m <= 84; m++) {
  const ev = stateAt(g, m);
  const o = oldPick(ev);
  const c = buildLiveCoupon([{ ev, analysis: { quality: "market", ...g.pre } }], { target: 2, maxLegs: 4, keep: [...memory.values()] });
  const next = new Map();
  for (const l of c.legs) { const k = `${l.eventId}:${l.key}`; next.set(k, memory.get(k) || { eventId: l.eventId, key: l.key, odds: l.odds }); }
  memory = next;
  const a = o ? `${o.label} ≈${o.odds.toFixed(2)}` : "—", b = c.legs[0] ? `${c.legs[0].label} ≈${c.legs[0].odds.toFixed(2)}` : "—";
  const ak = o?.key || "", bk = c.legs[0]?.key || "";
  const mark = (changed) => (changed ? "  ← changed" : "");
  const oc = lastOld && ak !== lastOld, nc = lastNew && bk !== lastNew;
  if (oc) oldChanges++; if (nc) newChanges++;
  if (m === 6 || oc || nc || m % 10 === 0) console.log(`${String(m).padStart(2)}' ${ev.home.score}-${ev.away.score}  before: ${(a + mark(oc)).padEnd(34)} now: ${b}${mark(nc)}${c.dropped?.length ? ` (${c.dropped[0].why})` : ""}`);
  lastOld = ak; lastNew = bk;
}
console.log(`\nchanges over the game — before: ${oldChanges}, now: ${newChanges}`);
