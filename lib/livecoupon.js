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
import { liveAnalyse, LIVE_TUNE } from "./model";
import { product, hitChance } from "./coupon";
import { LEAGUE_BY_ID } from "./leagues";

const LIVE_MARGIN = 0.07; // in-play books run fatter margins than pre-match
const MIN_ODDS = 1.18, MAX_ODDS = 3.6, MAX_P = 0.96; // a leg of the built coupon (its lowest chance depends on the target)
// A leg already on the visitor's screen stays while it is still a bet worth taking: still open, its
// chance no more than 7 points under the floor, its price no lower than four fifths of what it
// was when first shown (and 1.10).
const KEEP_SLACK = 0.07, KEEP_DECAY = 0.8, KEEP_MIN_ODDS = 1.1;
const LIST_MIN_P = 0.06, LIST_MAX_P = 0.94; // a market offered to the visitor's own coupon
const THIN = new Set(["stats", "blind", "none"]);
const PRICED = new Set(["market", "partial"]);
const round2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const WIN = { hockey: " win (incl. OT & SO)", football: " win (incl. OT)" };
export const liveOdds = (p) => round2((1 / p) / (1 + LIVE_MARGIN));

// Markets of one live game, each { key, label, group, p }. Keys are the ones settle() grades.
export function liveMarkets(ev, L) {
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
  // a market of the second source carries the bookmaker's real in-play price (m.real), not an estimate
  key: m.key, label: m.label, group: m.group, odds: m.odds, p: r4(m.p), safe: r4(m.p), estimated: !m.real, quality,
  ...(ev.leagueName ? { leagueName: ev.leagueName, source: "book", readAt: ev.readAt || null } : {}),
  live: { state: "in", minute: ev.minute, period: ev.period ?? null, detail: ev.detail, score: `${ev.home.score ?? 0}-${ev.away.score ?? 0}` },
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
// they are. Every leg is a likely one (62% or more for a x2–x3 slip, 55% above) and the number of
// legs is the smallest that allows it; the legs are then taken one at a time, each time the game
// whose best market sits closest to what the remaining target still needs. When too few games
// are in play the coupon stays short of its target rather than take a coin flip: before 22 Nov
// 2026 a single game gave the "Safe" coupon whichever bet stood nearest 50%, and it jumped to the
// opposite bet as the clock ran (scripts/backtest/livehold.mjs).
//
// `keep`: the legs the visitor already sees, [{ eventId, key, odds }] (odds: the price when first
// shown). The coupon is not rebuilt from nothing at each refresh: a leg stays while it is still a
// bet worth taking, and only a leg that is not is replaced (`dropped` says which and why: "closed"
// = no longer offered, "weak" = the game turned against it, "short" = its price fell too low).
// `extra`: the second source's games in play with their real in-play prices (lib/morelive.js
// bookPool), in the pool beside the site's own; their legs keep that real price.
// rows: [{ ev, analysis }] from the analysed board.
// Returns { legs, odds, chance, target, reached, live, kept, dropped }.
export function buildLiveCoupon(rows, { target = 20, maxLegs = 8, exclude = [], keep = [], extra = [] } = {}) {
  const skip = new Set(exclude);
  const games = [...priced(rows), ...extra];
  const floor = target <= 3 ? 0.62 : 0.55;
  const all = games.filter((g) => !skip.has(g.ev.id)).map((g) => ({ ...g, markets: g.markets.map((m) => ({ ...m, odds: m.real ? m.odds : liveOdds(m.p) })) }));
  const pool = all.map((g) => ({ ...g, markets: g.markets.filter((m) => m.p >= floor && m.p <= MAX_P && m.odds >= MIN_ODDS && m.odds <= MAX_ODDS) })).filter((g) => g.markets.length);
  const legs = [], used = new Set(), dropped = [];
  let acc = 1;
  for (const k of keep) {
    if (legs.length >= maxLegs || used.has(k.eventId)) continue;
    const g = all.find((x) => x.ev.id === k.eventId), m = g?.markets.find((x) => x.key === k.key);
    const why = !m ? "closed" : m.p < floor - KEEP_SLACK ? "weak" : m.odds < Math.max(KEEP_MIN_ODDS, (Number(k.odds) || 0) * KEEP_DECAY) ? "short" : null;
    if (why) { dropped.push({ eventId: k.eventId, key: k.key, why }); continue; }
    used.add(g.ev.id);
    legs.push(legOf(g.ev, m, g.quality));
    acc *= m.odds;
  }
  const kept = legs.length;
  let n = Math.min(maxLegs, pool.length);
  for (let k = 1; k <= Math.min(maxLegs, pool.length); k++) if (1 / ((1 + LIVE_MARGIN) * Math.pow(target, 1 / k)) >= floor) { n = k; break; }
  // a kept coupon that still carries most of its target is left alone; legs are added only to fill
  // the places a dropped leg left, or when the kept ones have fallen well short
  if (kept && acc >= target * KEEP_DECAY) n = kept;
  for (let k = legs.length; k < n; k++) {
    const want = Math.log(Math.pow(target / acc, 1 / (n - k))), last = k === n - 1;
    let best = null;
    for (const g of pool) {
      if (used.has(g.ev.id)) continue;
      for (const m of g.markets) {
        // distance to the odds this leg should carry; the last leg should not fall short of the target,
        // and a game no bookmaker priced before kick-off comes after the others
        let d = Math.abs(Math.log(m.odds) - want);
        if (last && Math.log(m.odds) < want - Math.log(1.04)) d += 0.25;
        if (!PRICED.has(g.quality) && g.quality !== "book") d += 0.08;
        if (!best || d < best.d) best = { g, m, d };
      }
    }
    if (!best) break;
    used.add(best.g.ev.id);
    legs.push(legOf(best.g.ev, best.m, best.g.quality));
    acc *= best.m.odds;
  }
  const odds = product(legs);
  return { legs, odds: round2(odds), chance: r4(hitChance(legs)), target, reached: odds >= target * 0.93, live: games.length, mode: "live", kept, dropped };
}

// ---------- the OP live pick: the one best single bet in play ----------
// Not a coupon: one bet on one game. Every live price here is the engine's chance less the same
// margin, so no bet is "better value" than another; what the engine can honestly rank is how
// likely a bet is. So the OP pick is, among the bets whose estimated price is still worth taking
// (a band per level), the likeliest one. Between two bets as likely as each other (to the point),
// the one whose chance moves least if the engine's goal rates are 15% off comes first. Ranking on
// that worst case alone was tried: its picks won no more often than their stated chance either,
// and that chance was a point lower.
//
// Only where the live model has been checked against real games (scripts/backtest/live*.mjs:
// finished games replayed minute by minute): football, on a game a bookmaker priced before
// kick-off, between the 6th and the 80th minute.
export const OP_LEVELS = { safe: [1.25, 1.5], mid: [1.5, 2], bold: [2, 2.8] }; // estimated odds: from (included) to (excluded)
// What the selector would have shown, every five minutes of 15 October – 21 November 2026, over
// the 1,837 bookmaker-priced games of its test replayed from their real kick-off times, graded on
// the final scores (scripts/backtest/liveop.mjs): distinct picks, the chance they carried, how
// often they won. At the estimated price these picks lose the bookmaker's margin, like any bet:
// what the test shows is that the chance on the card is the true one.
export const OP_RECORD = {
  safe: { games: 1391, picks: 3490, said: 0.734, won: 0.735 },
  mid: { games: 1438, picks: 4043, said: 0.605, won: 0.602 },
  bold: { games: 1447, picks: 4178, said: 0.451, won: 0.458 },
};
const OP_FROM = 6, OP_TO = 80;
const OP_SWING = 0.15;
const swing = (f) => ({ ...LIVE_TUNE, level: LIVE_TUNE.level * f, ahead1: LIVE_TUNE.ahead1 * f, ahead2: LIVE_TUNE.ahead2 * f, behind1: LIVE_TUNE.behind1 * f, behind2: LIVE_TUNE.behind2 * f });
const isBreak = (ev) => /^HT$|half.?time/i.test(String(ev.detail || ""));

// What the pick rests on, as plain facts the page words in the visitor's language.
function opFacts(ev, L, m, analysis) {
  const hs = ev.home.score ?? 0, as = ev.away.score ?? 0, total = hs + as;
  const f = { xgLeft: round2((L.remainingXg?.home || 0) + (L.remainingXg?.away || 0)), reds: (ev.reds?.home || 0) + (ev.reds?.away || 0) };
  const pr = analysis.probs;
  const pre = pr && { 1: pr.h, X: pr.d, 2: pr.a, "1X": pr.h + pr.d, X2: pr.a + pr.d, 12: pr.h + pr.a }[m.key];
  if (Number.isFinite(pre)) f.pre = r4(pre);
  let x;
  if (m.key === "1" || m.key === "1X") { f.side = "home"; f.lead = hs - as; }
  else if (m.key === "2" || m.key === "X2") { f.side = "away"; f.lead = as - hs; }
  else if ((x = m.key.match(/^O(\d+(?:\.\d+)?)$/))) f.need = Math.floor(Number(x[1])) + 1 - total;
  else if ((x = m.key.match(/^U(\d+(?:\.\d+)?)$/))) f.room = Math.floor(Number(x[1])) - total;
  else if ((x = m.key.match(/^([HA])O/))) { f.side = x[1] === "H" ? "home" : "away"; f.need = 1; f.xgSide = round2(L.remainingXg?.[f.side] || 0); }
  else if (m.key === "BTTS_Y") f.missing = hs > 0 ? "away" : as > 0 ? "home" : "both";
  else if (m.key === "BTTS_N") f.blank = hs === 0 && as === 0 ? "both" : hs === 0 ? "home" : "away";
  return f;
}

// rows: [{ ev, analysis }] from the analysed board. Returns { picks: [best, then the next ones,
// one per game], eligible: games that qualify, live: football games in play }.
export function bestLivePicks(rows, { level = "safe", exclude = [], max = 4, rank = "chance", draws = false } = {}) {
  const [lo, hi] = OP_LEVELS[level] || OP_LEVELS.safe;
  const skip = new Set(exclude);
  const tier = (ev) => LEAGUE_BY_ID[ev.league]?.tier ?? 9;
  const out = [];
  let eligible = 0, live = 0;
  for (const { ev, analysis } of rows) {
    if (ev.state !== "in" || ev.sport !== "soccer" || !ev.home || !ev.away) continue;
    live++;
    if (!analysis || !PRICED.has(analysis.quality)) continue;
    const minute = ev.minute ?? null;
    if (!isBreak(ev) && (minute === null || minute < OP_FROM || minute > OP_TO)) continue;
    let L = null, Lo = null, Hi = null;
    try { L = liveAnalyse(ev, analysis, {}); Lo = liveAnalyse(ev, analysis, {}, swing(1 - OP_SWING)); Hi = liveAnalyse(ev, analysis, {}, swing(1 + OP_SWING)); } catch { L = null; }
    if (!L?.probs || !Lo?.probs || !Hi?.probs) continue;
    eligible++;
    if (skip.has(ev.id)) continue;
    const lows = new Map(liveMarkets(ev, Lo).map((m) => [m.key, m.p])), highs = new Map(liveMarkets(ev, Hi).map((m) => [m.key, m.p]));
    let best = null;
    for (const m of liveMarkets(ev, L)) {
      if (m.key === "X" && !draws) continue; // the plain draw is the one bet the replay found over-rated (said 58–64%, won 42–49%)
      const odds = liveOdds(m.p);
      if (!(odds >= lo && odds < hi)) continue;
      const floor = Math.min(m.p, lows.get(m.key) ?? m.p, highs.get(m.key) ?? m.p);
      const score = rank === "floor" ? floor : Math.round(m.p * 100) + floor / 10; // whole points of chance, then the worst case
      if (!best || score > best.score) best = { m: { ...m, odds }, floor, score };
    }
    if (best) out.push({ ev, analysis, L, ...best });
  }
  out.sort((a, b) => b.score - a.score || b.m.p - a.m.p || tier(a.ev) - tier(b.ev));
  // `fair`: the price at which the bet breaks even; the estimated bookmaker price sits below it
  const picks = out.slice(0, max).map(({ ev, analysis, L, m, floor }) => ({ ...legOf(ev, m, analysis.quality), floor: r4(floor), fair: round2(1 / m.p), level, facts: opFacts(ev, L, m, analysis) }));
  return { picks, eligible, live, level };
}
