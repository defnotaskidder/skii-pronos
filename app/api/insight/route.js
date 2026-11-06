import { NextResponse } from "next/server";
import { aiEnabled, askJson, matchBrief, INSIGHT_SYSTEM, INSIGHT_SCHEMA, engineModel } from "../../../lib/ai";
import { aiWorthy, gatedMessage, takeBudget } from "../../../lib/ai-gate";
import { rememberShared } from "../../../lib/memo";

export const maxDuration = 60;

// One AI analysis of one match.
async function analyse(data, lang, live) {
  const brief = matchBrief(data);
  const { json, model } = await askJson({
    system: INSIGHT_SYSTEM + (lang === "fr" ? "\nWrite every text field in French (tutoiement, vocabulaire des parieurs francophones : cote, prono, double chance, remboursé si nul)." : "\nWrite every text field in English."),
    user: `${live ? "LIVE ANALYSIS — the match is in progress." : "FULL PRE-MATCH ANALYSIS."}\n\n${brief}`,
    schema: INSIGHT_SCHEMA,
    effort: live ? "low" : "medium",
  });
  return { insight: json, model: model || engineModel(), live, at: new Date().toISOString() };
}

// Full (or live) AI analysis of one match. The client posts what /api/match returned, so the
// engine reads exactly what the visitor is looking at. To keep the key's tokens for what matters:
// only big matches get one (lib/ai-gate.js), one analysis is shared by every visitor of a match
// (3 h before kick-off, 5 min while live) and a daily cap applies.
export async function POST(request) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "AI analysis is off: add ANTHROPIC_API_KEY to the server environment. The model numbers above still work without it." }, { status: 503 });
  }
  let data;
  try { data = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  if (!data?.event?.home || !data?.event?.away) return NextResponse.json({ error: "Match data missing" }, { status: 400 });
  const live = data.event.state === "in";
  const lang = data.lang === "en" ? "en" : "fr";
  if (!aiWorthy(data.event)) return NextResponse.json({ error: gatedMessage(lang), gated: true }, { status: 403 });
  const ttl = (live ? 5 * 60 : 3 * 3600) * 1000;
  const key = `insight:${data.event.id}:${lang}:${live ? "live" : "pre"}`;
  try {
    const out = await rememberShared(key, ttl, async () => {
      if (!(await takeBudget("insight"))) {
        const e = new Error(lang === "en" ? "Today's AI budget is used up — back tomorrow. The model numbers above still work." : "Le budget IA du jour est épuisé — retour demain. Les chiffres du modèle ci-dessus restent valables.");
        e.budget = true;
        throw e;
      }
      return analyse(data, lang, live);
    }, { stale: ttl });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e.message, ...(e.budget ? { budget: true } : {}) }, { status: e.budget ? 429 : 502 });
  }
}
