import { TIER_RANK, choose, tierFor } from "./model";

export const product = (legs) => legs.reduce((s, l) => s * (Number(l.odds) || 1), 1);
// Chance the whole slip survives (a void leg doesn't kill it).
export const hitChance = (legs) => legs.reduce((s, l) => s * (l.safe ?? l.p ?? 0.5), 1);

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

// Leg profiles for the target builder: price band per leg and the lowest win chance allowed.
export const PROFILES = {
  safe: { min: 1.15, max: 1.7, minP: 0.62 },
  balanced: { min: 1.25, max: 2.6, minP: 0.45 },
  grosse: { min: 1.45, max: 4.2, minP: 0.3 },
};

// Reach `target` odds with the highest possible chance of the whole slip landing.
// Each market's cost is the chance it gives up per unit of (log) odds: −ln(p) / ln(odds).
// Fair prices cost 1.0, value bets cost less, so the cheapest legs go in first, and the last
// leg is the one that closes the gap to the target for the smallest loss of chance.
export function buildTarget(pool, { target = 20, profile = "balanced", maxLegs = 12, perLeague = 3, exclude = [] } = {}) {
  const P = PROFILES[profile] || PROFILES.balanced;
  const skip = new Set(exclude);
  const cands = [];
  for (const { ev, analysis } of pool) {
    if (skip.has(ev.id) || !analysis?.markets?.length) continue;
    let best = null;
    for (const m of analysis.markets) {
      if (!m.odds || m.odds < P.min || m.odds > P.max || m.p < P.minP) continue;
      if (m.v > 0.001 || m.key === "X" && profile === "safe") continue; // no void-able legs: the price must pay in full
      if (m.key.startsWith("AH") && m.estimated) continue;
      const cost = (-Math.log(m.p) / Math.log(m.odds)) * (m.estimated ? 1.04 : 1);
      if (!best || cost < best.cost) best = { m, cost };
    }
    if (!best) continue;
    const m = best.m;
    const tier = tierFor(m.p, m.ev ?? 0, analysis.quality);
    cands.push({ ...legFrom(ev, { ...m, tier: tier === "Skip" ? "Low" : tier }, { quality: analysis.quality }), cost: best.cost, loss: -Math.log(m.p) });
  }
  cands.sort((a, b) => a.cost - b.cost);

  const goal = Math.log(target);
  const legs = [], used = new Set(), perL = {};
  let acc = 0;
  const near = Math.log(1.04); // within 4% of the target counts as reached
  while (acc < goal - near && legs.length < maxLegs) {
    const avail = cands.filter((c) => !used.has(c.eventId) && (perL[c.league] || 0) < perLeague);
    if (!avail.length) break;
    const rem = goal - acc;
    const cheapest = avail[0];
    const closer = avail.filter((c) => Math.log(c.odds) >= rem * 0.97).sort((a, b) => a.loss - b.loss)[0];
    // finish now with the closer if that costs less chance than continuing with cheap legs
    const take = closer && (closer.loss <= cheapest.cost * rem || Math.log(cheapest.odds) >= rem) ? closer : cheapest;
    legs.push(take); used.add(take.eventId); perL[take.league] = (perL[take.league] || 0) + 1;
    acc += Math.log(take.odds);
  }

  // Local search: drop or swap legs while the slip still reaches the target and its chance rises.
  const floor = goal - near;
  for (let improved = true, rounds = 0; improved && rounds < 40; rounds++) {
    improved = false;
    for (let i = 0; i < legs.length && !improved; i++) {
      const L = legs[i];
      if (legs.length > 1 && acc - Math.log(L.odds) >= floor) { // leg not needed at all
        legs.splice(i, 1); used.delete(L.eventId); perL[L.league]--; acc -= Math.log(L.odds); improved = true; break;
      }
      for (const c of cands) {
        if (used.has(c.eventId) || c.loss >= L.loss - 1e-9) continue;
        if (c.league !== L.league && (perL[c.league] || 0) >= perLeague) continue;
        if (acc - Math.log(L.odds) + Math.log(c.odds) < floor) continue;
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

export function couponText(c, title = "COUPON DU JOUR") {
  const lines = c.legs.map((l) => {
    const t = new Date(l.date);
    const hh = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `• ${hh} ${l.home} – ${l.away}\n   ➜ ${l.label} @ ${Number(l.odds).toFixed(2)}`;
  });
  return [
    `🔥 ${title} — Skii Pronos`,
    ...lines,
    `💰 Cote totale : ${product(c.legs).toFixed(2)} · chance estimée ~${Math.round(hitChance(c.legs) * 100)}%`,
    "Mise fixe, jamais de chasse. Aucun prono n'est garanti. 18+",
  ].join("\n");
}
