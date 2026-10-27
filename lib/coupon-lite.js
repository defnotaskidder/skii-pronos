// The coupon helpers the browser needs (slip totals, the shareable text) — kept apart from
// lib/coupon.js, whose builders pull the whole prediction engine into the bundle.
import { marketLabel } from "./i18n";

// Total odds of a slip.
export const product = (legs) => legs.reduce((s, l) => s * (Number(l.odds) || 1), 1);
// Chance the whole slip survives (a void leg doesn't kill it).
export const hitChance = (legs) => legs.reduce((s, l) => s * (l.safe ?? l.p ?? 0.5), 1);

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
