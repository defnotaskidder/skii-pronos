// Live grosse cote: an accumulator built from games in play. Every live game the engine follows
// (football, hockey, NFL) is re-priced from its pre-match numbers, the score and the clock
// (lib/model.js liveAnalyse); each market's chance becomes a fair price minus a typical in-play
// margin. No free feed carries live bookmaker odds, so every price here is an estimate (≈): take a
// leg on 1xBet only at or above the shown odds. Legs are chosen like the daily builds: the cheapest
// chance per unit of odds first, one market per game, until the target is reached.
import { liveAnalyse } from "./model";
import { product, hitChance } from "./coupon";

const LIVE_MARGIN = 0.07; // in-play books run fatter margins than pre-match
const MIN_ODDS = 1.18, MAX_ODDS = 3.6, MIN_P = 0.5, MAX_P = 0.96;
const round2 = (x) => Math.round(x * 100) / 100;
const WIN = { hockey: " win (incl. OT & SO)", football: " win (incl. OT)" };

// Markets of one live game, each { key, label, group, p }. Keys are the ones settle() grades.
function liveMarkets(ev, L) {
  const H = ev.home.short || ev.home.name, A = ev.away.short || ev.away.name;
  const out = [];
  const add = (key, group, label, p) => { if (Number.isFinite(p)) out.push({ key, group, label, p }); };
  const minuteOk = ev.sport !== "soccer" || (ev.minute ?? 0) < 85; // too late for a fresh leg
  if (!minuteOk) return out;
  if (ev.sport === "soccer") {
    const { h, d, a } = L.probs || {};
    add("1", "1X2", `${H} win`, h); add("X", "1X2", "Draw", d); add("2", "1X2", `${A} win`, a);
    add("1X", "Double chance", `${H} or draw`, h + d); add("X2", "Double chance", `${A} or draw`, a + d);
    if (Number.isFinite(L.btts)) { add("BTTS_Y", "Both teams score", "BTTS — Yes", L.btts); add("BTTS_N", "Both teams score", "BTTS — No", 1 - L.btts); }
    for (const o of L.overs || []) { add(`O${o.line}`, "Goals", `Over ${o.line}`, o.p); add(`U${o.line}`, "Goals", `Under ${o.line}`, 1 - o.p); }
  } else {
    const w = WIN[ev.sport] || " win";
    const { h, a } = L.probs || {};
    // NFL: a final tie voids the moneyline; the chance shown is with ties set aside
    add("1", "Winner", `${H}${w}`, h); add("2", "Winner", `${A}${w}`, a);
    const unit = ev.sport === "football" ? " pts" : "";
    for (const o of L.overs || []) { add(`O${o.line}`, "Total", `Over ${o.line}${unit}`, o.p); add(`U${o.line}`, "Total", `Under ${o.line}${unit}`, 1 - o.p); }
  }
  return out;
}

// rows: [{ ev, analysis }] from the analysed board. Returns { legs, odds, chance, target, live }.
export function buildLiveCoupon(rows, { target = 20, maxLegs = 8, exclude = [] } = {}) {
  const skip = new Set(exclude);
  const cands = [];
  let live = 0;
  for (const { ev, analysis } of rows) {
    if (ev.state !== "in" || skip.has(ev.id) || !ev.home || !ev.away || !analysis) continue;
    if (!["soccer", "hockey", "football"].includes(ev.sport)) continue;
    let L = null;
    try { L = liveAnalyse(ev, analysis, {}); } catch { L = null; }
    if (!L?.probs) continue;
    live++;
    let best = null;
    for (const m of liveMarkets(ev, L)) {
      if (m.p < MIN_P || m.p > MAX_P) continue;
      const odds = round2((1 / m.p) / (1 + LIVE_MARGIN));
      if (odds < MIN_ODDS || odds > MAX_ODDS) continue;
      const cost = -Math.log(m.p) / Math.log(odds); // chance given up per unit of log-odds
      if (!best || cost < best.cost) best = { ...m, odds, cost };
    }
    if (!best) continue;
    cands.push({
      eventId: ev.id, league: ev.league, sport: ev.sport, date: ev.date,
      home: ev.home.short || ev.home.name, away: ev.away.short || ev.away.name, homeLogo: ev.home.logo || null, awayLogo: ev.away.logo || null,
      key: best.key, label: best.label, group: best.group, odds: best.odds, p: Math.round(best.p * 1e4) / 1e4, safe: Math.round(best.p * 1e4) / 1e4,
      estimated: true, cost: best.cost,
      live: { state: "in", minute: ev.minute, detail: ev.detail, score: `${ev.home.score ?? 0}-${ev.away.score ?? 0}` },
    });
  }
  cands.sort((a, b) => a.cost - b.cost);
  const goal = Math.log(target);
  const legs = [];
  let acc = 0;
  for (const c of cands) {
    if (acc >= goal - Math.log(1.04) || legs.length >= maxLegs) break;
    const rem = goal - acc;
    // don't overshoot wildly with the last leg
    if (legs.length && Math.log(c.odds) > rem * 2.2 && cands.some((x) => !legs.includes(x) && x !== c && Math.log(x.odds) >= rem * 0.9 && Math.log(x.odds) <= rem * 1.6)) continue;
    legs.push(c);
    acc += Math.log(c.odds);
  }
  const clean = legs.map(({ cost, ...l }) => l); // eslint-disable-line no-unused-vars
  const odds = product(clean);
  return { legs: clean, odds: round2(odds), chance: Math.round(hitChance(clean) * 1e4) / 1e4, target, reached: odds >= target * 0.93, live, mode: "live" };
}
