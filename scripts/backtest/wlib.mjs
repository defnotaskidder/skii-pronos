// Shared pieces of the walk-forward study on the site's graded picks.
import fs from "node:fs";
const all = JSON.parse(fs.readFileSync(new URL("./picks.json", import.meta.url), "utf8")).filter((g) => (g.pick_result === "W" || g.pick_result === "L") && g.pick_p != null);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const logit = (p) => Math.log(p / (1 - p)), sig = (x) => 1 / (1 + Math.exp(-x));
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
export const fam = (k) => (/_/.test(k) && !/^BTTS_/.test(k) ? "combo" : /^AH/.test(k) ? "ah" : /^(O|U)\d/.test(k) ? "goals" + k[0] : /^(H|A)(O|U)/.test(k) ? "team" + k[1] : /^BTTS/.test(k) ? "btts" : /^DNB/.test(k) ? "dnb" : k === "12" ? "12" : /^(1X|X2)$/.test(k) ? "dc" : "win");
export const rows = all.map((g) => {
  const pp = g.pick_p, raw = g.pick_raw ?? g.pick_p, v = Math.max(0, raw - pp);
  const p = clamp(v > 0.005 ? pp / Math.max(0.02, 1 - v) : pp, 0.02, 0.98);
  const shownWin = (g.pick_safe ?? raw) - v;
  return { id: g.event_id, t: Date.parse(g.kickoff), day: g.kickoff.slice(0, 10), p, z: logit(p), y: g.pick_result === "W" ? 1 : 0, est: !!g.pick_est, cls: g.pick_est ? "est" : "priced", league: g.league, sport: g.sport, fam: fam(g.pick_key),
    shown: clamp(v > 0.005 ? shownWin / Math.max(0.02, 1 - v) : shownWin, 0.02, 0.98), odds: g.pick_odds, key: g.pick_key, tier: g.pick_tier, probs: g.probs, hs: g.home_score, as: g.away_score, clv: g.clv, close: g.close_odds, void: v };
}).sort((a, b) => a.t - b.t);
export const days = [...new Set(rows.map((r) => r.day))];

// additive logit offsets, one normal prior (tau) per factor; optional slope on logit p (ridge toward 1)
export function fitAdd(train, factors, { slope = false, tauB = 0.15 } = {}) {
  const off = factors.map(() => new Map());
  let b = 1;
  const lin = (r) => b * r.z + factors.reduce((a, f, i) => a + (off[i].get(f.key(r)) || 0), 0);
  for (let it = 0; it < 12; it++) {
    factors.forEach((f, i) => {
      const groups = new Map();
      for (const r of train) { const k = f.key(r); if (k === null) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
      const prec = 1 / (f.tau * f.tau);
      for (const [k, list] of groups) {
        let d = off[i].get(k) || 0;
        for (let n = 0; n < 4; n++) {
          let g = -d * prec, h = prec;
          for (const r of list) { const q = sig(lin(r) - (off[i].get(k) || 0) + d); g += r.y - q; h += q * (1 - q); }
          d += clamp(g / h, -0.5, 0.5);
        }
        off[i].set(k, d);
      }
    });
    if (slope) {
      let g = -(b - 1) / (tauB * tauB), h = 1 / (tauB * tauB);
      for (const r of train) { const q = sig(lin(r)); g += (r.y - q) * r.z; h += q * (1 - q) * r.z * r.z; }
      b += clamp(g / h, -0.2, 0.2);
    }
  }
  const f = (r) => clamp(sig(lin(r)), 0.02, 0.98);
  f.off = off; f.b = b;
  return f;
}
export const K = { cls: (r) => r.cls, league: (r) => r.league, sport: (r) => r.sport, fam: (r) => r.fam, estLeague: (r) => (r.est ? r.league : null), clsFam: (r) => r.cls + ":" + r.fam, estFam: (r) => (r.est ? r.fam : null) };
export const ll = (p, y) => -Math.log(y ? p : 1 - p);

export function run(schemes, { warm = 7 } = {}) {
  const names = Object.keys(schemes);
  const out = Object.fromEntries(names.map((n) => [n, []]));
  const test = [];
  for (let d = warm; d < days.length; d++) {
    const start = Date.parse(days[d] + "T00:00:00Z");
    const train = rows.filter((r) => r.t < start - 3 * 3600e3), today = rows.filter((r) => r.day === days[d]);
    if (!today.length) continue;
    for (const n of names) { const f = schemes[n](train); for (const r of today) out[n].push(f(r)); }
    test.push(...today);
  }
  console.log(`walk-forward: ${test.length} test picks (${days[warm]} → ${days.at(-1)}), priced ${test.filter((r) => !r.est).length}, estimated ${test.filter((r) => r.est).length}; hit rate ${(mean(test.map((r) => r.y)) * 100).toFixed(1)}%`);
  console.log("scheme".padEnd(28), "logloss   Δ vs first (±se)    | priced   | estimated | mean p | top 20% picks: p → hit | p≥74%: n, p → hit");
  const base = out[names[0]].map((p, i) => ll(p, test[i].y));
  for (const n of names) {
    const l = out[n].map((p, i) => ll(p, test[i].y));
    const diff = l.map((x, i) => x - base[i]); const md = mean(diff), se = Math.sqrt(mean(diff.map((x) => (x - md) ** 2)) / diff.length);
    const sub = (f) => mean(test.map((r, i) => (f(r) ? i : -1)).filter((i) => i >= 0).map((i) => l[i])).toFixed(4);
    const order = out[n].map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]).slice(0, Math.round(test.length * 0.2));
    const hi = out[n].map((p, i) => [p, i]).filter(([p]) => p >= 0.74);
    console.log(n.padEnd(28), mean(l).toFixed(4), ((md >= 0 ? "+" : "") + md.toFixed(4)).padStart(8), `(±${se.toFixed(4)})`.padEnd(11), "|", sub((r) => !r.est), "|", sub((r) => r.est), " |", (mean(out[n]) * 100).toFixed(1), " |", (mean(order.map(([p]) => p)) * 100).toFixed(1), "→", (mean(order.map(([, i]) => test[i].y)) * 100).toFixed(1), "      |", String(hi.length).padStart(4), hi.length ? (mean(hi.map(([p]) => p)) * 100).toFixed(1) + " → " + (mean(hi.map(([, i]) => test[i].y)) * 100).toFixed(1) : "");
  }
  return { out, test };
}
