// Telegram and WhatsApp: sending, message texts in French/English, and the daily posts.
// Telegram needs TELEGRAM_BOT_TOKEN (+ TELEGRAM_CHANNEL like @skiipronos for channel posts).
// WhatsApp uses Meta's Cloud API: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN
// (+ WHATSAPP_TEMPLATE for messages sent outside the 24-hour window).
import { couponText } from "./coupon";
import { marketLabel, translate } from "./i18n";

export const SITE = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://skii-pronos.vercel.app");
export const TZ = process.env.SITE_TZ || "Africa/Abidjan";
export const telegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN;
export const whatsappEnabled = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
export const telegramBotName = () => process.env.TELEGRAM_BOT_USERNAME || null;

// ---------- Telegram ----------
export async function telegramApi(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `Telegram ${res.status}`);
  return data.result;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export async function sendTelegram(chatId, text, { buttons } = {}) {
  const body = { chat_id: chatId, text: esc(text), parse_mode: "HTML", disable_web_page_preview: true };
  if (buttons?.length) body.reply_markup = { inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))] };
  return telegramApi("sendMessage", body);
}
export async function telegramSetup() {
  const url = `${SITE}/api/telegram`;
  const info = await telegramApi("getWebhookInfo");
  if (info.url !== url) await telegramApi("setWebhook", { url, allowed_updates: ["message"], drop_pending_updates: true });
  const me = await telegramApi("getMe");
  return { username: me.username, webhook: url };
}

// ---------- WhatsApp (Meta Cloud API) ----------
export async function sendWhatsApp(to, text) {
  const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) throw new Error("WHATSAPP_TOKEN / WHATSAPP_PHONE_ID are not set");
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000), preview_url: false } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // outside the 24-hour window Meta requires an approved template
    const tpl = process.env.WHATSAPP_TEMPLATE;
    if (tpl && data?.error?.code === 131047) {
      const r2 = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: tpl, language: { code: "fr" }, components: [{ type: "body", parameters: [{ type: "text", text: text.slice(0, 1000).replace(/\n/g, " ") }] }] } }),
      });
      if (r2.ok) return r2.json();
    }
    throw new Error(data?.error?.message || `WhatsApp ${res.status}`);
  }
  return data;
}

// ---------- texts ----------
const t = (lang, k, v) => translate(lang, k, v);
const timeIn = (iso, lang) => new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

export function dailyMessage(daily, lang = "fr", kind = "both") {
  const parts = [];
  if (kind !== "grosse" && daily.safe?.legs?.length) parts.push(couponText(daily.safe, lang === "en" ? "COUPON OF THE DAY" : "COUPON DU JOUR", lang, { tz: TZ }));
  if (kind !== "safe" && daily.grosse?.legs?.length) parts.push(couponText(daily.grosse, lang === "en" ? "BIG ODDS OF THE DAY" : "GROSSE COTE DU JOUR", lang, { tz: TZ }));
  if (!parts.length) return null;
  return `${parts.join("\n\n")}\n\n${SITE}/coupon`;
}

export function resultsMessage(daily, lang = "fr") {
  const fr = lang !== "en";
  const line = (c, title) => {
    if (!c?.legs?.length) return null;
    const w = c.legs.filter((l) => l.result === "W").length, lost = c.legs.filter((l) => l.result === "L").length;
    const st = c.result === "W" ? "✅" : c.result === "L" ? "❌" : "⏳";
    const legs = c.legs.map((l) => `${l.result === "W" ? "✅" : l.result === "L" ? "❌" : l.result === "V" ? "↩️" : "⏳"} ${l.home} – ${l.away}${l.score ? ` ${l.score}` : ""} · ${marketLabel(lang, l.label)} @${Number(l.odds).toFixed(2)}`).join("\n");
    return `${st} ${title} @${Number(c.odds).toFixed(2)} — ${w}${fr ? " gagné(s)" : " won"}, ${lost}${fr ? " perdu(s)" : " lost"}\n${legs}`;
  };
  const blocks = [line(daily.safe, fr ? "Coupon du jour" : "Coupon of the day"), line(daily.grosse, fr ? "Grosse cote du jour" : "Big odds of the day")].filter(Boolean);
  if (!blocks.length) return null;
  return `📊 ${fr ? "Résultats du jour" : "Today's results"} — Skii Pronos\n\n${blocks.join("\n\n")}\n\n${fr ? "Palmarès complet" : "Full record"}: ${SITE}/record`;
}

export function goalMessage(g, lang, kind) {
  const label = `${g.home} ${g.hs ?? 0}–${g.as ?? 0} ${g.away}`;
  const url = `${SITE}/match/${g.league}/${g.id}`;
  const body = {
    kickoff: t(lang, "Kick-off: {home} – {away}", { home: g.home, away: g.away }),
    goal: `${t(lang, "⚽ Goal {team}!", { team: g.scorer })}\n${label}${g.minute ? ` · ${g.minute}'` : ""}`,
    red: `${t(lang, "🟥 Red card — {team}", { team: g.scorer })}\n${label}`,
    final: t(lang, "Full time: {label}", { label }),
  }[kind];
  return { title: body.split("\n")[0], body: body.split("\n").slice(1).join("\n"), text: `${body}\n${url}`, url };
}

export function couponResultMessage(entry, lang) {
  const lost = entry.legs.some((l) => l.result === "L");
  const title = lost ? t(lang, "❌ “{title}” lost", { title: entry.title }) : t(lang, "✅ “{title}” won!", { title: entry.title });
  const legs = entry.legs.map((l) => `${l.result === "W" ? "✅" : l.result === "L" ? "❌" : "↩️"} ${l.home} – ${l.away}${l.score ? ` ${l.score}` : ""} · ${marketLabel(lang, l.label)}`).join("\n");
  return { title, body: legs, text: `${title}\n${legs}\n${SITE}/history`, url: `${SITE}/history` };
}

export function valueMessage(ev, m, lang) {
  const fr = lang !== "en";
  const title = fr ? `💎 Cote de valeur : ${marketLabel("fr", m.label)} @${m.odds}` : `💎 Value spot: ${m.label} @${m.odds}`;
  const body = `${ev.home.short} – ${ev.away.short} · ${timeIn(ev.date, lang)} · EV +${Math.round(m.ev * 100)}%`;
  return { title, body, text: `${title}\n${body}\n${SITE}/match/${ev.league}/${ev.id}`, url: `${SITE}/match/${ev.league}/${ev.id}` };
}

export function oddsMoveMessage(ev, from, to, lang) {
  const fr = lang !== "en";
  const title = fr ? `📈 La cote bouge : ${ev.home.short} – ${ev.away.short}` : `📈 Odds moved: ${ev.home.short} – ${ev.away.short}`;
  const body = `1X2 ${from.home}/${from.draw ?? "-"}/${from.away} → ${to.home}/${to.draw ?? "-"}/${to.away}`;
  return { title, body, text: `${title}\n${body}\n${SITE}/match/${ev.league}/${ev.id}`, url: `${SITE}/match/${ev.league}/${ev.id}` };
}

export function helpText(lang = "fr", botName) {
  return lang === "en"
    ? `Skii Pronos bot 🤖\n\n/coupon — today's coupon\n/grosse — today's big-odds coupon\n/results — today's results\n/alerts — alerts on/off\n/lang fr|en — language\n/link CODE — link your Skii Pronos account (Settings → Telegram) to get goal alerts for followed matches and results for your tracked coupons\n/stop — unsubscribe\n\n${SITE}`
    : `Bot Skii Pronos 🤖\n\n/coupon — le coupon du jour\n/grosse — la grosse cote du jour\n/results — les résultats du jour\n/alerts — activer/désactiver les alertes\n/lang fr|en — langue\n/link CODE — lier ton compte Skii Pronos (Paramètres → Telegram) pour recevoir les alertes de buts de tes matchs suivis et les résultats de tes coupons\n/stop — se désabonner\n\n${SITE}`;
}
