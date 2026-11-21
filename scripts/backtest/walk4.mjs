// Do "strong" / "weak" league labels predict anything? Each test day's labels come from earlier days only.
import { rows, days, mean, clamp, logit, sig } from "./wlib.mjs";
function phi(x) { const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z); const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z); return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2; }
function status(list, tau = 0.6) {
  if (list.length < 8) return "learning";
  const prec = 1 / (tau * tau); let d = 0;
  const curve = (dd) => { let g = -dd * prec, h = prec; for (const r of list) { const q = sig(r.z + dd); g += r.y - q; h += q * (1 - q); } return { g, h }; };
  for (let it = 0; it < 25; it++) { const { g, h } = curve(d); d += clamp(g / h, -1, 1); }
  const pPos = phi(d / (1 / Math.sqrt(curve(d).h)));
  return pPos >= 0.75 ? "strong" : pPos <= 0.25 ? "weak" : "neutral";
}
const acc = {};
for (let d = 7; d < days.length; d++) {
  const start = Date.parse(days[d] + "T00:00:00Z");
  const train = rows.filter((r) => r.t < start - 3 * 3600e3), today = rows.filter((r) => r.day === days[d]);
  const byL = new Map(); for (const r of train) { if (!byL.has(r.league)) byL.set(r.league, []); byL.get(r.league).push(r); }
  for (const r of today) { const s = byL.has(r.league) ? status(byL.get(r.league)) : "learning"; for (const k of [s, s + (r.est ? " (est)" : " (priced)")]) { const a = acc[k] || (acc[k] = []); a.push(r); } }
}
console.log("label              picks  model p → hit   gap (±se)     roi at shown odds");
for (const k of Object.keys(acc).sort()) { const l = acc[k]; const mp = mean(l.map((r) => r.p)), hit = mean(l.map((r) => r.y)); console.log(k.padEnd(18), String(l.length).padStart(5), " ", (mp * 100).toFixed(1), "→", (hit * 100).toFixed(1), " ", ((hit - mp) * 100).toFixed(1).padStart(5), `(±${(Math.sqrt(mp * (1 - mp) / l.length) * 100).toFixed(1)})`, "  ", (mean(l.map((r) => (r.y ? r.odds - 1 : -1))) * 100).toFixed(1) + "%"); }
