// Live coupons: accumulators built from games in play. Every live game the engine follows
// (football, hockey, NFL) is re-priced from its pre-match numbers, the score and the clock
// (lib/model.js liveAnalyse); each market's chance becomes a fair price minus a typical in-play
// margin. No free feed carries live bookmaker odds, so every price here is an estimate (≈): take a
// leg on 1xBet only at or above the shown odds.
//
// Two uses of the same priced games: the best live coupon for a target (legs chosen like the daily
// builds: the cheapest chance per unit of odds first, one market per game, until the target is
// reached) and the list of games with their markets, from which a visitor builds their own.
//
// Only games the engine can stand behind: football needs the bookmaker's pre-match read (kept in
// memory, or rebuilt from the chances saved before kick-off — lib/board.js) or the trained
// strength model on clubs it knows; a game read from league averages is left out.
import { liveAnalyse } from "./model";
import { product, hitChance } from "./coupon";
import { LEAGUE_BY_ID } from "./leagues";

const LIVE_MARGIN = 0.07; // in-play books run fatter margins than pre-match
const MIN_ODDS = 1.18, MAX_ODDS = 3.6, MIN_P = 0.5, MAX_P = 0.96; // a leg of the built coupon
const LIST_MIN_P = 0.06, LIST_MAX_P = 0.94; // a market offered to the visitor's own coupon
const THIN = new Set(["stats", "blind", "none"]);
const PRICED = new Set(["market", "partial"]);
const round2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const WIN = { hockey: " win (incl. OT & SO)", football: " win (incl. OT)" };
export const liveOdds = (p) => round2((1 / p) / (1 + LIVE_MARGIN));

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
    add("1X", "Double chance", `${H} or draw`, h + d); add("X2", "Double chance", `${A} or draw`, a + d); add("12", "Double chance", "No draw", h + a);
    for (const o of L.overs || []) { add(`O${o.line}`, "Goals", `Over ${o.line}`, o.p); add(`U${o.line}`, "Goals", `Under ${o.line}`, 1 - o.p); }
    if (Number.isFinite(L.btts)) { add("BTTS_Y", "Both teams score", "BTTS — Yes", L.btts); add("BTTS_N", "Both teams score", "BTTS — No", 1 - L.btts); }
    const t = L.teamOver;
    if (t?.home) add(`HO${t.home.line}`, "Team goals", `${H} over ${t.home.line}`, t.home.p);
    if (t?.away) add(`AO${t.away.line}`, "Team goals", `${A} over ${t.away.line}`, t.away.p);
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

// Every live game the engine can price, with its markets: [{ ev, quality, markets }].
function priced(rows) {
  const out = [];
  for (const { ev, analysis } of rows) {
    if (ev.state !== "in" || !ev.home || !ev.away || !analysis) continue;
    if (!["soccer", "hockey", "football"].includes(ev.sport) || THIN.has(analysis.quality)) continue;
    let L = null;
    try { L = liveAnalyse(ev, analysis, {}); } catch { L = null; }
    if (!L?.probs) continue;
    const markets = liveMarkets(ev, L);
    if (markets.length) out.push({ ev, quality: analysis.quality, markets });
  }
  return out;
}

const legOf = (ev, m, quality) => ({
  eventId: ev.id, league: ev.league, sport: ev.sport, date: ev.date,
  home: ev.home.short || ev.home.name, away: ev.away.short || ev.away.name, homeLogo: ev.home.logo || null, awayLogo: ev.away.logo || null,
  key: m.key, label: m.label, group: m.group, odds: m.odds, p: r4(m.p), safe: r4(m.p), estimated: true, quality,
  live: { state: "in", minute: ev.minute, detail: ev.detail, score: `${ev.home.score ?? 0}-${ev.away.score ?? 0}` },
});

// The games in play with the markets a visitor can put in their own live coupon (biggest
// competitions first, 60 games at most).
export function liveGames(rows, { max = 60 } = {}) {
  const tier = (g) => LEAGUE_BY_ID[g.ev.league]?.tier ?? 9;
  return priced(rows)
    .sort((a, b) => (PRICED.has(b.quality) ? 1 : 0) - (PRICED.has(a.quality) ? 1 : 0) || tier(a) - tier(b) || new Date(a.ev.date) - new Date(b.ev.date))
    .slice(0, max)
    .map(({ ev, quality, markets }) => ({
      eventId: ev.id, league: ev.league, sport: ev.sport, date: ev.date, quality,
      home: ev.home.short || ev.home.name, away: ev.away.short || ev.away.name, homeLogo: ev.home.logo || null, awayLogo: ev.away.logo || null,
      minute: ev.minute ?? null, detail: ev.detail || "", score: `${ev.home.score ?? 0}-${ev.away.score ?? 0}`,
      markets: markets.filter((m) => m.p >= LIST_MIN_P && m.p <= LIST_MAX_P).map((m) => ({ key: m.key, group: m.group, label: m.label, p: r4(m.p), odds: liveOdds(m.p) })).filter((m) => m.odds >= 1.05),
    }))
    .filter((g) => g.markets.length);
}

// The best live coupon for a target. Every live price is the model's chance less the same margin,
// so a coupon's chance is 1 / (target × margin^legs): what makes one build better than another is
// reaching the target with as few legs as possible and without overshooting it — not which legs
// they are. The number of legs is the smallest for which each leg can still be a likely one
// (62% or more for a x2–x3 slip, 55% above); the legs are then taken one at a time, each time
// the game whose best market sits closest to what the remaining target still needs.
// rows: [{ ev, analysis }] from the analysed board. Returns { legs, odds, chance, target, live }.
export function buildLiveCoupon(rows, { target = 20, maxLegs = 8, exclude = [] } = {}) {
  const skip = new Set(exclude);
  const games = priced(rows);
  const pool = games.filter((g) => !skip.has(g.ev.id)).map((g) => ({ ...g, markets: g.markets.map((m) => ({ ...m, odds: liveOdds(m.p) })).filter((m) => m.p >= MIN_P && m.p <= MAX_P && m.odds >= MIN_ODDS && m.odds <= MAX_ODDS) })).filter((g) => g.markets.length);
  const floor = target <= 3 ? 0.62 : 0.55;
  let n = Math.min(maxLegs, pool.length);
  for (let k = 1; k <= Math.min(maxLegs, pool.length); k++) if (1 / ((1 + LIVE_MARGIN) * Math.pow(target, 1 / k)) >= floor) { n = k; break; }
  const legs = [], used = new Set();
  let acc = 1;
  for (let k = 0; k < n; k++) {
    const want = Math.log(Math.pow(target / acc, 1 / (n - k))), last = k === n - 1;
    let best = null;
    for (const g of pool) {
      if (used.has(g.ev.id)) continue;
      for (const m of g.markets) {
        // distance to the odds this leg should carry; the last leg should not fall short of the target,
        // and a game no bookmaker priced before kick-off comes after the others
        let d = Math.abs(Math.log(m.odds) - want);
        if (last && Math.log(m.odds) < want - Math.log(1.04)) d += 0.25;
        if (!PRICED.has(g.quality)) d += 0.08;
        if (!best || d < best.d) best = { g, m, d };
      }
    }
    if (!best) break;
    used.add(best.g.ev.id);
    legs.push(legOf(best.g.ev, best.m, best.g.quality));
    acc *= best.m.odds;
  }
  const odds = product(legs);
  return { legs, odds: round2(odds), chance: r4(hitChance(legs)), target, reached: odds >= target * 0.93, live: games.length, mode: "live" };
}
