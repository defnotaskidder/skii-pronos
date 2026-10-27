import { TIER_RANK, choose, pickable, settle, tierFor } from "./model";
import { marketLabel } from "./i18n";
import { product, hitChance, couponText } from "./coupon-lite";
export { product, hitChance, couponText };


export function legFrom(ev, mk, extra = {}) {
  return {
    eventId: ev.id, league: ev.league, sport: ev.sport, date: ev.date,
    home: ev.home?.short || ev.home?.name, away: ev.away?.short || ev.away?.name,
    homeLogo: ev.home?.logo || null, awayLogo: ev.away?.logo || null,
    key: mk.key, label: mk.label, group: mk.group, odds: mk.odds, p: mk.p, safe: mk.safe ?? mk.p, ev: mk.ev,
    tier: mk.tier, estimated: !!mk.estimated, book: mk.book || null, ...extra,
  };
}

// Pick one leg per match and stack them toward the target price, strongest first.
// `pool` is [{ ev, analysis }] for pre-match games only.
export function buildCoupon(pool, { target = 2.5, mode = "safe", maxLegs = 6, minTier = "Medium", perLeague = 2 } = {}) {
  const cands = [];
  for (const { ev, analysis } of pool) {
    if (!analysis?.markets?.length) continue;
    const best = choose(analysis.markets, mode)[0];
    if (!best) continue;
    const graded = { ...best, tier: tierFor(best.safe ?? best.p, best.ev ?? 0, analysis.quality) };
    if (TIER_RANK[graded.tier] < TIER_RANK[minTier]) continue;
    cands.push(legFrom(ev, graded, { quality: analysis.quality }));
  }
  // priced legs first, then by survival chance, then by price
  cands.sort((a, b) => (a.estimated - b.estimated) || (TIER_RANK[b.tier] - TIER_RANK[a.tier]) || (b.safe - a.safe) || (b.odds - a.odds));

  const legs = [];
  const leagueCount = {};
  for (const c of cands) {
    if (product(legs) >= target * 0.95 || legs.length >= maxLegs) break;
    if ((leagueCount[c.league] || 0) >= perLeague) continue;
    // don't overshoot wildly with the last leg
    if (legs.length && product(legs) * c.odds > target * 1.8) continue;
    legs.push(c);
    leagueCount[c.league] = (leagueCount[c.league] || 0) + 1;
  }
  return { legs, odds: Math.round(product(legs) * 100) / 100, chance: Math.round(hitChance(legs) * 1000) / 1000, target, mode, reached: product(legs) >= target * 0.9 };
}

const same = (p) => p;
// The league's learned record, captured on daily legs for the badges (skill from leagueSkill()).
const leagueInfo = (league, skill) => {
  const l = skill?.leagues?.[league];
  return l ? { leagueStatus: l.status, leagueRecord: { w: l.w, n: l.n } } : {};
};

// Coupon du jour: the strongest legs of the day, stacked toward ~2.5. Football only, real
// bookmaker prices only, no draws, nothing that can be voided, no league the model reads badly.
// `adjust(p, estimated, league)` applies the learned calibration + league offset.
export function buildDaily(pool, { adjust = same, skill = null, target = 2.5, maxLegs = 5, perLeague = 2, minTier = "Med-High", minOdds = 1.15, maxOdds = 1.6, exclude = [] } = {}) {
  const skip = new Set(exclude);
  const cands = [];
  for (const { ev, analysis } of pool) {
    if (ev.sport !== "soccer" || skip.has(ev.id) || !analysis?.markets?.length) continue;
    if (skill?.leagues?.[ev.league]?.status === "weak") continue;
    let best = null;
    for (const m of analysis.markets) {
      if (m.info) continue;
      if (!m.odds || m.estimated || m.key === "X" || m.key.startsWith("AH") || m.v > 0.001) continue;
      if (m.odds < minOdds || m.odds > maxOdds) continue;
      const safe = adjust(m.safe ?? m.p, m.estimated, ev.league);
      if (!(safe > 0)) continue;
      // the original "safe" score: chance first, then the market's own value, a nudge toward the
      // longer price (value stays the model's, so a league boost doesn't push toward long legs)
      const score = safe + 0.9 * (m.ev ?? 0) + 0.05 * Math.log(m.odds);
      if (!best || score > best.score) best = { m, safe, score };
    }
    if (!best) continue;
    const { m, safe } = best;
    const tier = tierFor(safe, m.ev ?? 0, analysis.quality);
    if (TIER_RANK[tier] < TIER_RANK[minTier]) continue;
    cands.push(legFrom(ev, { ...m, safe: Math.round(safe * 1e4) / 1e4, p: m.p, tier }, { quality: analysis.quality, ...leagueInfo(ev.league, skill) }));
  }
  cands.sort((a, b) => (TIER_RANK[b.tier] - TIER_RANK[a.tier]) || (b.safe - a.safe) || (b.odds - a.odds));

  const legs = [];
  const leagueCount = {};
  for (const c of cands) {
    if (product(legs) >= target * 0.95 || legs.length >= maxLegs) break;
    if ((leagueCount[c.league] || 0) >= perLeague) continue;
    if (legs.length && product(legs) * c.odds > target * 1.8) continue; // don't overshoot with the last leg
    legs.push(c);
    leagueCount[c.league] = (leagueCount[c.league] || 0) + 1;
  }
  legs.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { legs, odds: Math.round(product(legs) * 100) / 100, chance: Math.round(hitChance(legs) * 1000) / 1000, target, mode: "safe", reached: product(legs) >= target * 0.9 };
}

// Grosse cote: the best-rated value bets first (real price, clear edge on the adjusted chance);
// when they don't reach the target, the safest remaining legs close the gap — each step takes the
// most likely leg whose price still keeps the slip on course for the target in the slots left.
const r4 = (x) => Math.round(x * 1e4) / 1e4;
export function buildGrosse(pool, { target = 30, maxLegs = 8, perLeague = 2, adjust = same, skill = null, skipLeagues = [], exclude = [] } = {}) {
  const skip = new Set(exclude), weak = new Set(skipLeagues);
  const value = [], safe = [];
  for (const { ev, analysis } of pool) {
    if (ev.sport !== "soccer" || skip.has(ev.id) || weak.has(ev.league) || !analysis?.markets?.length) continue;
    const extra = { quality: analysis.quality, ...leagueInfo(ev.league, skill) };
    const leg = (m, p, kind) => legFrom(ev, { ...m, p: r4(p), safe: r4(p), ev: r4(p * m.odds - 1), tier: tierFor(p, p * m.odds - 1, analysis.quality) }, { ...extra, kind });
    let best = null;
    for (const m of analysis.markets) {
      if (m.info || !m.odds || m.estimated || m.v > 0.001 || m.key === "X") continue;
      const p = adjust(m.p, m.estimated, ev.league);
      if (!(p > 0)) continue;
      const edge = p * m.odds - 1;
      if (m.odds >= 1.5 && m.odds <= 4.5 && p >= 0.3 && edge >= 0.03 && (!best || edge * Math.sqrt(p) > best.score)) best = { m, p, score: edge * Math.sqrt(p) };
      if (m.odds >= 1.25 && m.odds <= 3 && p >= 0.4) safe.push({ leg: leg(m, p, "safe"), p });
    }
    if (best) value.push({ leg: leg(best.m, best.p, "value"), score: best.score });
  }
  value.sort((a, b) => b.score - a.score);
  const legs = [], used = new Set(), perL = {};
  const fits = (l) => !used.has(l.eventId) && (perL[l.league] || 0) < perLeague;
  const add = (l) => { legs.push(l); used.add(l.eventId); perL[l.league] = (perL[l.league] || 0) + 1; };
  const done = () => product(legs) >= target * 0.95 || legs.length >= maxLegs;
  for (const { leg } of value) {
    if (done()) break;
    if (fits(leg) && !(legs.length && product(legs) * leg.odds > target * 2)) add(leg);
  }
  while (!done()) {
    const need = Math.pow((target * 0.95) / product(legs), 1 / (maxLegs - legs.length)); // price per leg still needed
    const fitsAll = safe.filter((x) => fits(x.leg));
    if (!fitsAll.length) break;
    const tame = fitsAll.filter((x) => product(legs) * x.leg.odds <= target * 1.5); // no big overshoot with the last leg
    const open = tame.length ? tame : fitsAll;
    const onCourse = open.filter((x) => x.leg.odds >= need * 0.97).sort((a, b) => b.p - a.p);
    add((onCourse[0] || open.sort((a, b) => b.leg.odds - a.leg.odds)[0]).leg);
  }
  legs.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { legs, odds: Math.round(product(legs) * 100) / 100, chance: Math.round(hitChance(legs) * 10000) / 10000, target, mode: "grosse", reached: product(legs) >= target * 0.9 };
}

// Leg profiles for the target builder: price band per leg and the lowest win chance allowed.
// Every leg of every coupon must be one the model itself rates at least `minTier` (tierFor: the
// adjusted chance, the edge and how much team data is behind it). No coin flips in the coupon du
// jour (Med-High: 72 %+ with full team data), and no Low / Skip leg in any build: a long-odds
// slip gets its odds from more strong legs, not from underdogs.
export const PROFILES = {
  safe: { min: 1.12, max: 1.6, minP: 0.72, minTier: "Med-High" },
  balanced: { min: 1.25, max: 2.4, minP: 0.58, minTier: "Medium" },
  grosse: { min: 1.35, max: 3.0, minP: 0.58, minTier: "Medium" },
  special: { min: 1.12, max: 2.2, minP: 0.64, minTier: "Medium" }, // a big night's slate: favourites at 1.2–1.3 for 70 %
};

// Two markets of the same game contradict each other when no final score wins both (e.g.
// "Rodez or draw" and "Montpellier win"). Checked on a score grid for football, hockey and the
// NFL; elsewhere only the very same market counts as compatible.
const THIN = new Set(["stats", "blind", "none"]);
const compatMemo = new Map();
const GRID = { soccer: 8, hockey: 9, football: 59 };
export function compatible(a, b, sport) {
  if (!a || !b || a === b) return true;
  const R = GRID[sport];
  if (!R) return false;
  const k = `${sport}|${a}|${b}`;
  if (compatMemo.has(k)) return compatMemo.get(k);
  let ok = false;
  for (let h = 0; h <= R && !ok; h++) {
    for (let w = 0; w <= R && !ok; w++) {
      const ctx = { sport, ot: false };
      if (settle(a, h, w, ctx) === "W" && settle(b, h, w, ctx) === "W") ok = true;
    }
  }
  if (compatMemo.size > 5000) compatMemo.clear();
  compatMemo.set(k, ok);
  return ok;
}

// Reach `target` odds with the highest possible chance of the whole slip landing.
// Each market's cost is the chance it gives up per unit of (log) odds: −ln(p) / ln(odds).
// Fair prices cost 1.0, value bets cost less, so the cheapest legs go in first, and the last
// leg is the one that closes the gap to the target for the smallest loss of chance.
// Options for the daily grosse cote: onlyPriced, sports (e.g. ["soccer"]), adjust, skipLeagues, skill.
// `lock` (eventId → market key): a game another coupon of the day already uses may only come back
// with that same market, so the site never backs both sides of one game. A leg must also agree
// with the game's own pick (it can't contradict what the match page recommends).
// `maxEstimated`: how many legs may carry an estimated (≈) price — a third of the slip by default,
// so a thin day gives a shorter build rather than one made of guessed prices.
export function buildTarget(pool, { target = 20, profile = "balanced", maxLegs = 12, minLegs = 1, perLeague = 3, exclude = [], onlyPriced = false, sports = null, adjust = same, skipLeagues = [], skill = null, lock = null, minTier = null, maxEstimated = null } = {}) {
  const P = PROFILES[profile] || PROFILES.balanced;
  const estCap = onlyPriced ? 0 : maxEstimated ?? Math.ceil(maxLegs / 3);
  const tierFloor = TIER_RANK[minTier || P.minTier || "Low"] ?? 1;
  const skip = new Set(exclude);
  const skipL = new Set(skipLeagues);
  const cands = [];
  for (const { ev, analysis } of pool) {
    if (skip.has(ev.id) || skipL.has(ev.league) || (sports && !sports.includes(ev.sport)) || !analysis?.markets?.length) continue;
    // only games the model reads against a bookmaker's prices: "stats" (league table and form
    // only, e.g. a youth World Cup) and "blind" games never go in a coupon
    if (THIN.has(analysis.quality)) continue;
    let best = null;
    const locked = lock?.get?.(ev.id) || null, own = analysis.pick?.key || null;
    for (const m of analysis.markets) {
      if (m.info) continue;
      if (locked && m.key !== locked) continue;
      if (own && !compatible(m.key, own, ev.sport)) continue;
      if (!m.odds || m.odds < P.min || m.odds > P.max || (onlyPriced && m.estimated)) continue;
      if (!pickable(m)) continue; // estimated prices only on the standard markets
      // no void-able legs (draw no bet, whole-number handicaps): the price must pay in full. An NFL
      // moneyline's tiny tie chance (~0.3%, a refund) is allowed.
      if (m.v > 0.01 || m.key === "X" && profile === "safe") continue;
      if (m.key.startsWith("AH") && m.estimated) continue;
      const p = adjust(m.p, m.estimated, ev.league);
      if (!(p >= P.minP)) continue;
      // the model's own grade of this leg (adjusted chance, edge, data behind it) must clear the bar
      const tier = tierFor(p, m.ev ?? 0, analysis.quality);
      if ((TIER_RANK[tier] ?? 0) < tierFloor) continue;
      const cost = (-Math.log(p) / Math.log(m.odds)) * (m.estimated ? 1.08 : 1);
      if (!best || cost < best.cost) best = { m, p, cost, tier };
    }
    if (!best) continue;
    const { m, p, tier } = best;
    const pr = Math.round(p * 1e4) / 1e4;
    cands.push({ ...legFrom(ev, { ...m, p: pr, safe: pr, tier }, { quality: analysis.quality, ...leagueInfo(ev.league, skill) }), cost: best.cost, loss: -Math.log(p) });
  }
  cands.sort((a, b) => a.cost - b.cost);

  const goal = Math.log(target);
  const legs = [], used = new Set(), perL = {};
  let acc = 0, nEst = 0;
  const fits = (c) => !c.estimated || nEst < estCap;
  // within 7% of the target counts as reached (as the pages show it): a strong two-leg x1.90 beats
  // a three-leg x2.40 with a lower chance
  const near = Math.log(1 / 0.93);
  while ((acc < goal - near || legs.length < minLegs) && legs.length < maxLegs) {
    const avail = cands.filter((c) => !used.has(c.eventId) && (perL[c.league] || 0) < perLeague && fits(c));
    if (!avail.length) break;
    const rem = goal - acc;
    const cheapest = avail[0];
    const closer = avail.filter((c) => Math.log(c.odds) >= rem * 0.97).sort((a, b) => a.loss - b.loss)[0];
    // finish now with the closer if that costs less chance than continuing with cheap legs
    // a closer may only finish the slip once it has its minimum number of legs
    const canClose = legs.length + 1 >= minLegs;
    const take = canClose && closer && (closer.loss <= cheapest.cost * rem || Math.log(cheapest.odds) >= rem) ? closer : cheapest;
    legs.push(take); used.add(take.eventId); perL[take.league] = (perL[take.league] || 0) + 1;
    if (take.estimated) nEst++;
    acc += Math.log(take.odds);
  }

  // Local search: drop or swap legs while the slip still reaches the target and its chance rises.
  const floor = goal - near;
  for (let improved = true, rounds = 0; improved && rounds < 40; rounds++) {
    improved = false;
    for (let i = 0; i < legs.length && !improved; i++) {
      const L = legs[i];
      if (legs.length > Math.max(1, minLegs) && acc - Math.log(L.odds) >= floor) { // leg not needed at all
        legs.splice(i, 1); used.delete(L.eventId); perL[L.league]--; acc -= Math.log(L.odds); if (L.estimated) nEst--; improved = true; break;
      }
      for (const c of cands) {
        if (used.has(c.eventId) || c.loss >= L.loss - 1e-9) continue;
        if (c.league !== L.league && (perL[c.league] || 0) >= perLeague) continue;
        if (c.estimated && !L.estimated && nEst >= estCap) continue;
        if (acc - Math.log(L.odds) + Math.log(c.odds) < floor) continue;
        if (c.estimated !== L.estimated) nEst += c.estimated ? 1 : -1;
        legs[i] = c; used.delete(L.eventId); used.add(c.eventId);
        perL[L.league]--; perL[c.league] = (perL[c.league] || 0) + 1;
        acc += Math.log(c.odds) - Math.log(L.odds); improved = true; break;
      }
    }
  }
  legs.sort((a, b) => new Date(a.date) - new Date(b.date));
  const clean = legs.map(({ cost, loss, ...l }) => l); // eslint-disable-line no-unused-vars
  const odds = product(clean);
  return { legs: clean, odds: Math.round(odds * 100) / 100, chance: Math.round(hitChance(clean) * 10000) / 10000, target, mode: profile, reached: odds >= target * 0.93 };
}

