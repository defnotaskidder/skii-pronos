export const CONF_P = { High: 0.8, "Med-High": 0.7, Medium: 0.6, Low: 0.5, Skip: 0 };
export const CONF_RANK = { High: 4, "Med-High": 3, Medium: 2, Low: 1, Skip: 0 };

export const product = (legs) => legs.reduce((s, l) => s * (Number(l.odds) || 1), 1);

// Honest hit chance: min of the confidence-tier estimate and the market-implied probability.
export function legProb(leg) {
  const implied = leg.odds > 1 ? Math.min(0.97, 0.94 / leg.odds) : 0.5;
  const conf = CONF_P[leg.confidence] ?? implied;
  return Math.min(conf, implied + 0.08);
}
export const hitChance = (legs) => legs.reduce((s, l) => s * legProb(l), 1);

// Greedy: strongest confidence first, cheapest odds first, one market per event.
export function buildSlip(picks, target) {
  const pool = picks
    .filter((p) => p.confidence !== "Skip" && Number(p.odds) > 1.01)
    .sort((a, b) => (CONF_RANK[b.confidence] - CONF_RANK[a.confidence]) || (a.odds - b.odds));
  const legs = []; const used = new Set(); let prod = 1;
  for (const p of pool) {
    if (prod >= target * 0.9) break;
    if (used.has(p.event_id)) continue;
    legs.push(p); used.add(p.event_id); prod *= p.odds;
  }
  return legs;
}

export function slipText(legs, label) {
  const lines = legs.map((l) => `• ${l.when || ""} ${l.match} — ${l.selection} @ ${Number(l.odds).toFixed(2)} (${l.confidence || "pick"})`);
  return [
    `PRONOS — ${label}`,
    ...lines,
    `Total odds: ${product(legs).toFixed(2)} · honest hit chance ~${Math.round(hitChance(legs) * 100)}%`,
    "One flat stake. No pick is a guarantee. Verify odds in-app. 18+.",
  ].join("\n");
}
