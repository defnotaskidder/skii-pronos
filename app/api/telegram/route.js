import { NextResponse } from "next/server";
import { dailyWithStatus } from "../../../lib/daily";
import { linkCodeUse, subscriberGet, subscriberUpsert, dbEnabled } from "../../../lib/db";
import { dailyMessage, helpText, resultsMessage, sendTelegram, telegramEnabled, telegramSetup } from "../../../lib/messaging";
import { tickAllowed } from "../../../lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET ?key=<secret>: register the webhook. Telegram POSTs updates here.
export async function GET(request) {
  if (!telegramEnabled()) return NextResponse.json({ enabled: false });
  if (!(await tickAllowed(request))) return NextResponse.json({ enabled: true });
  try { return NextResponse.json({ enabled: true, ...(await telegramSetup()) }); } catch (e) { return NextResponse.json({ enabled: true, error: e.message }, { status: 502 }); }
}

export async function POST(request) {
  if (!telegramEnabled()) return NextResponse.json({ ok: true });
  let update;
  try { update = await request.json(); } catch { return NextResponse.json({ ok: true }); }
  const msg = update?.message;
  const text = (msg?.text || "").trim();
  const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
  if (!chatId || !text) return NextResponse.json({ ok: true });
  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || msg.chat?.title || null;
  const sub = dbEnabled() ? await subscriberGet("telegram", chatId) : null;
  const lang = sub?.lang || (msg.from?.language_code?.startsWith("en") ? "en" : "fr");
  const say = (t) => sendTelegram(chatId, t).catch(() => {});
  const [cmdRaw, ...args] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@.*$/, "");

  try {
    if (cmd === "/start") {
      await subscriberUpsert("telegram", chatId, { lang, name, active: true });
      const code = args[0];
      if (code && /^[A-Z0-9]{6}$/i.test(code)) {
        const userId = await linkCodeUse(code, "telegram", chatId, name, lang);
        await say(userId ? (lang === "en" ? "✅ Linked to your Skii Pronos account. You'll get goal alerts for the matches you follow and results for your tracked coupons." : "✅ Compte Skii Pronos lié. Tu recevras les alertes de buts de tes matchs suivis et les résultats de tes coupons.") : (lang === "en" ? "That code has expired. Get a new one in Settings → Telegram." : "Ce code a expiré. Génère-en un nouveau dans Paramètres → Telegram."));
      } else {
        await say(lang === "en" ? "Welcome to Skii Pronos 🔥 You'll get the coupon du jour and the grosse cote every morning, and the results at night." : "Bienvenue sur Skii Pronos 🔥 Tu recevras le coupon du jour et la grosse cote chaque matin, et les résultats le soir.");
      }
      await say(helpText(lang));
    } else if (cmd === "/link" && args[0]) {
      const userId = await linkCodeUse(args[0], "telegram", chatId, name, lang);
      await say(userId ? (lang === "en" ? "✅ Account linked." : "✅ Compte lié.") : (lang === "en" ? "Unknown or expired code." : "Code inconnu ou expiré."));
    } else if (cmd === "/coupon" || cmd === "/grosse" || cmd === "/today") {
      const d = await dailyWithStatus();
      await say(dailyMessage(d, lang, cmd === "/grosse" ? "grosse" : cmd === "/coupon" ? "safe" : "both") || (lang === "en" ? "No coupon yet today — try again in a bit." : "Pas encore de coupon aujourd'hui, réessaie dans un moment."));
    } else if (cmd === "/results" || cmd === "/resultats") {
      const d = await dailyWithStatus();
      await say(resultsMessage(d, lang) || (lang === "en" ? "No results yet." : "Pas encore de résultats."));
    } else if (cmd === "/lang") {
      const l = args[0]?.toLowerCase() === "en" ? "en" : "fr";
      await subscriberUpsert("telegram", chatId, { lang: l, name });
      await say(l === "en" ? "Language set to English." : "Langue : français.");
    } else if (cmd === "/alerts") {
      const on = !(sub?.prefs?.coupon === false);
      await subscriberUpsert("telegram", chatId, { prefs: { coupon: !on, grosse: !on, results: !on }, name });
      await say(!on ? (lang === "en" ? "🔔 Daily alerts on." : "🔔 Alertes quotidiennes activées.") : (lang === "en" ? "🔕 Daily alerts off. /alerts to turn them back on." : "🔕 Alertes quotidiennes désactivées. /alerts pour les réactiver."));
    } else if (cmd === "/stop") {
      await subscriberUpsert("telegram", chatId, { active: false, name });
      await say(lang === "en" ? "Unsubscribed. /start to come back." : "Désabonné. /start pour revenir.");
    } else {
      await say(helpText(lang));
    }
  } catch (e) {
    console.warn("[telegram]", e.message);
  }
  return NextResponse.json({ ok: true });
}
