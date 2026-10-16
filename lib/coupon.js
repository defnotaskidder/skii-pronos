import { TIER_RANK, choose, tierFor } from "./model";
import { marketLabel } from "./i18n";

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
// Options for the daily grosse cote: onlyPriced, sports (e.g. ["soccer"]), adjust, skipLeagues, skill.
export function buildTarget(pool, { target = 20, profile = "balanced", maxLegs = 12, perLeague = 3, exclude = [], onlyPriced = false, sports = null, adjust = same, skipLeagues = [], skill = null } = {}) {
  const P = PROFILES[profile] || PROFILES.balanced;
  const skip = new Set(exclude);
  const skipL = new Set(skipLeagues);
  const cands = [];
  for (const { ev, analysis } of pool) {
    if (skip.has(ev.id) || skipL.has(ev.league) || (sports && !sports.includes(ev.sport)) || !analysis?.markets?.length) continue;
    let best = null;
    for (const m of analysis.markets) {
      if (!m.odds || m.odds < P.min || m.odds > P.max || (onlyPriced && m.estimated)) continue;
      if (m.v > 0.001 || m.key === "X" && profile === "safe") continue; // no void-able legs: the price must pay in full
      if (m.key.startsWith("AH") && m.estimated) continue;
      const p = adjust(m.p, m.estimated, ev.league);
      if (!(p >= P.minP)) continue;
      const cost = (-Math.log(p) / Math.log(m.odds)) * (m.estimated ? 1.04 : 1);
      if (!best || cost < best.cost) best = { m, p, cost };
    }
    if (!best) continue;
    const { m, p } = best;
    const tier = tierFor(p, m.ev ?? 0, analysis.quality);
    const pr = Math.round(p * 1e4) / 1e4;
    cands.push({ ...legFrom(ev, { ...m, p: pr, safe: pr, tier: tier === "Skip" ? "Low" : tier }, { quality: analysis.quality, ...leagueInfo(ev.league, skill) }), cost: best.cost, loss: -Math.log(p) });
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

// Plain-text version of a coupon for Telegram / WhatsApp / clipboard, in French or English.
export function couponText(c, title = "COUPON DU JOUR", lang = "fr", { tz = "Africa/Abidjan", link = "" } = {}) {
  const fr = lang !== "en";
  const lines = c.legs.map((l) => {
    const t = new Date(l.date);
    const hh = t.toLocaleTimeString(fr ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
    const res = l.result || l.live?.result;
    const mark = res === "W" ? " ✅" : res === "L" ? " ❌" : res === "V" ? " ↩️" : "";
    return `• ${hh} ${l.home} – ${l.away}\n   ➜ ${marketLabel(lang, l.label)} @ ${Number(l.odds).toFixed(2)}${mark}`;
  });
  const chance = hitChance(c.legs);
  const chanceTxt = chance >= 0.1 ? `~${Math.round(chance * 100)}%` : `~${(chance * 100).toFixed(1)}% (1 ${fr ? "sur" : "in"} ${Math.round(1 / Math.max(chance, 1e-6))})`;
  return [
    `🔥 ${title} — Skii Pronos`,
    ...lines,
    fr ? `💰 Cote totale : ${product(c.legs).toFixed(2)} · chance estimée ${chanceTxt}` : `💰 Total odds: ${product(c.legs).toFixed(2)} · estimated chance ${chanceTxt}`,
    fr ? "Mise fixe, jamais de chasse. Aucun prono n'est garanti. 18+" : "Flat stakes, never chase. No pick is a guarantee. 18+",
    ...(link ? [link] : []),
  ].join("\n");
}
