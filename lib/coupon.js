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
