import { NextResponse } from "next/server";
import { dailyWithStatus } from "../../../lib/daily";
import { linkCodeUse, subscriberGet, subscriberUpsert, dbEnabled } from "../../../lib/db";
import { dailyMessage, helpText, resultsMessage, sendWhatsApp, whatsappEnabled } from "../../../lib/messaging";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Meta verifies the webhook with a GET (hub.challenge) using WHATSAPP_VERIFY_TOKEN.
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  if (sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") && sp.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(sp.get("hub.challenge") || "", { status: 200 });
  }
  return NextResponse.json({ enabled: whatsappEnabled(), number: process.env.WHATSAPP_NUMBER || null });
}

// Incoming messages: "coupon", "grosse", "résultats", "stop", "start", "lang en", "link CODE".
export async function POST(request) {
  if (!whatsappEnabled()) return NextResponse.json({ ok: true });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: true }); }
  const change = body?.entry?.[0]?.changes?.[0]?.value;
  const m = change?.messages?.[0];
  const from = m?.from;
  const text = (m?.text?.body || m?.button?.text || m?.interactive?.button_reply?.title || "").trim();
  if (!from || !text) return NextResponse.json({ ok: true });
  const name = change?.contacts?.[0]?.profile?.name || null;
  const sub = dbEnabled() ? await subscriberGet("whatsapp", from) : null;
  const lang = sub?.lang || "fr";
  const say = (t) => sendWhatsApp(from, t).catch(() => {});
  const low = text.toLowerCase().replace(/^\//, "");
  const [cmd, ...args] = low.split(/\s+/);

  try {
    if (["start", "salut", "bonjour", "hello", "hi", "menu", "aide", "help"].includes(cmd)) {
      await subscriberUpsert("whatsapp", from, { lang, name, active: true });
      await say(lang === "en" ? "Welcome to Skii Pronos 🔥 You'll get the coupon of the day and the big odds every morning, and the results at night.\n\nCommands: coupon · grosse · results · alerts · lang en · link CODE · stop" : "Bienvenue sur Skii Pronos 🔥 Tu recevras le coupon du jour et la grosse cote chaque matin, et les résultats le soir.\n\nCommandes : coupon · grosse · résultats · alertes · lang en · lien CODE · stop");
    } else if ((cmd === "link" || cmd === "lien") && args[0]) {
      const userId = await linkCodeUse(args[0], "whatsapp", from, name, lang);
      await say(userId ? (lang === "en" ? "✅ Linked to your Skii Pronos account." : "✅ Compte Skii Pronos lié.") : (lang === "en" ? "Unknown or expired code. Get a new one in Settings → WhatsApp." : "Code inconnu ou expiré. Génère-en un nouveau dans Paramètres → WhatsApp."));
    } else if (/^[a-z0-9]{6}$/i.test(text) && !sub) {
      const userId = await linkCodeUse(text, "whatsapp", from, name, lang);
      await subscriberUpsert("whatsapp", from, { lang, name, active: true });
      await say(userId ? (lang === "en" ? "✅ Linked to your Skii Pronos account." : "✅ Compte Skii Pronos lié.") : helpText(lang));
    } else if (cmd === "coupon" || cmd === "grosse" || cmd === "today" || cmd === "aujourd'hui") {
      const d = await dailyWithStatus();
      await say(dailyMessage(d, lang, cmd === "grosse" ? "grosse" : cmd === "coupon" ? "safe" : "both") || (lang === "en" ? "No coupon yet today." : "Pas encore de coupon aujourd'hui."));
    } else if (cmd.startsWith("r") && /^r(esult|ésult)/.test(cmd)) {
      const d = await dailyWithStatus();
      await say(resultsMessage(d, lang) || (lang === "en" ? "No results yet." : "Pas encore de résultats."));
    } else if (cmd === "lang" || cmd === "langue") {
      const l = args[0] === "en" ? "en" : "fr";
      await subscriberUpsert("whatsapp", from, { lang: l, name });
      await say(l === "en" ? "Language set to English." : "Langue : français.");
    } else if (cmd === "alerts" || cmd === "alertes") {
      const on = !(sub?.prefs?.coupon === false);
      await subscriberUpsert("whatsapp", from, { prefs: { coupon: !on, grosse: !on, results: !on }, name });
      await say(!on ? (lang === "en" ? "🔔 Daily alerts on." : "🔔 Alertes quotidiennes activées.") : (lang === "en" ? "🔕 Daily alerts off." : "🔕 Alertes quotidiennes désactivées."));
    } else if (cmd === "stop") {
      await subscriberUpsert("whatsapp", from, { active: false, name });
      await say(lang === "en" ? "Unsubscribed. Send 'start' to come back." : "Désabonné. Envoie « start » pour revenir.");
    } else {
      await say(helpText(lang).replace(/\/(\w+)/g, "$1"));
    }
  } catch (e) {
    console.warn("[whatsapp]", e.message);
  }
  return NextResponse.json({ ok: true });
}
