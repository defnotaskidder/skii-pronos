// The OP cote 2: the best way to odds 2 among the next football games, built the way a careful
// bettor builds one by hand.
//   - Only games a bookmaker prices, and only the price it really offers: a side to win, at 1.18
//     to 1.60. No estimated price, no draw, nothing that can be refunded.
//   - A leg is never credited with more chance than its own price implies. Where the engine's
//     chance beats the bookmaker's price, that is a disagreement with the market, not an edge
//     (the closing line beats every model here — scripts/soccer-report.md), so the leg is left out.
//   - Two or three legs whose odds multiply to 2 or a little more; of every such pair and treble,
//     the one with the highest chance of all landing. Each extra leg pays the margin again, so it
//     is a double more often than a treble.
// Rebuilt for each of 622 past days from closing prices (scripts/backtest/opcote.mjs, 36,913
// games, 2024–2026) this coupon was announced at 46.5% and landed 49.0% of the time (±2.0), for
// −0.6% per unit staked: the chance shown is the true one, and like any bet it does not beat the
// bookmaker's margin over time. Over/under legs were tried too: their prices carry more margin
// (−6% a leg against −2.5% for wins) and the coupon was no better with them.
import { legFrom, product, hitChance } from "./coupon";
import { tierFor } from "./model";

const MIN_ODDS = 1.18, MAX_ODDS = 1.6;
const OVER = 1.15; // a coupon may pay up to 15% more than its target
const PRICED = new Set(["market", "partial"]);
export const OP_COTE_RECORD = { days: 622, said: 0.465, won: 0.49, odds: 2.03 };

// pool: [{ ev, analysis }] of games still to start (lib/daily.js poolOf). `exclude`: games to
// leave out ("another combination"). Returns { legs, odds, chance, target, reached, pool }.
export function buildOpCote(pool, { target = 2, exclude = [], top = 40 } = {}) {
  const skip = new Set(exclude);
  const cands = [];
  for (const { ev, analysis } of pool) {
    if (ev.sport !== "soccer" || skip.has(ev.id) || !PRICED.has(analysis?.quality)) continue;
    for (const m of analysis.markets || []) {
      if ((m.key !== "1" && m.key !== "2") || m.estimated || m.info || !(m.odds >= MIN_ODDS && m.odds <= MAX_ODDS) || !(m.p > 0)) continue;
      if (m.p * m.odds > 1.005) continue;
      cands.push(legFrom(ev, { ...m, safe: m.p, tier: tierFor(m.p, m.ev ?? 0, analysis.quality) }, { quality: analysis.quality }));
    }
  }
  // the legs that give the least to the bookmaker come first; pairs and trebles are searched among them
  const c = cands.sort((a, b) => b.p * b.odds - a.p * a.odds).slice(0, top);
  const lo = target * 0.99, hi = target * OVER;
  let best = null;
  const consider = (legs) => {
    const odds = product(legs);
    if (odds < lo || odds > hi) return;
    const chance = hitChance(legs), last = Math.max(...legs.map((l) => new Date(l.date).getTime()));
    // the highest chance wins; within half a point, the coupon that is over soonest
    const score = Math.round(chance * 200);
    if (!best || score > best.score || (score === best.score && last < best.last)) best = { legs, odds, chance, score, last };
  };
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
    if (c[i].eventId === c[j].eventId) continue;
    consider([c[i], c[j]]);
    for (let k = j + 1; k < c.length; k++) if (c[k].eventId !== c[i].eventId && c[k].eventId !== c[j].eventId) consider([c[i], c[j], c[k]]);
  }
  const legs = best ? [...best.legs].sort((a, b) => new Date(a.date) - new Date(b.date)) : [];
  return { legs, odds: Math.round(product(legs) * 100) / 100, chance: legs.length ? Math.round(hitChance(legs) * 1000) / 1000 : 0, target, reached: !!best, pool: cands.length, mode: "op" };
}
