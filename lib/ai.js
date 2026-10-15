// Claude layer: reads the model's numbers plus the match data and writes the analysis.
// Optional — everything else on the site works without ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";
import { noteText } from "./i18n";

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export const engineModel = () => process.env.ENGINE_MODEL || "claude-opus-5-5";
const webSearchOn = () => process.env.ENGINE_WEB_SEARCH === "true";
// Server-side refusal fallback is available on these models (Claude API).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

function parseJson(raw) {
  if (!raw) return null;
  const text = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(text); } catch { /* fall through */ }
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch { /* give up */ } }
  return null;
}

// Turn SDK errors into something a site owner can act on.
function friendly(e, model) {
  if (e instanceof Anthropic.AuthenticationError) return "The AI key on the server is invalid. Update ANTHROPIC_API_KEY in your hosting settings and redeploy.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This AI key isn't allowed to use the engine model. Check your Anthropic account or set ENGINE_MODEL.";
  if (e instanceof Anthropic.NotFoundError) return `The engine model "${model}" wasn't found. Set ENGINE_MODEL to a valid model (default claude-opus-5-5).`;
  if (e instanceof Anthropic.RateLimitError) return "The AI is busy (rate limit). Try again in a minute.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Try again.";
  if (e instanceof Anthropic.APIError) return `AI service error (${e.status ?? "unknown"}). Try again.`;
  return e?.message || "AI request failed.";
}

export async function askJson({ system, user, schema, effort = "medium", maxTokens = 16000 }) {
  const client = new Anthropic();
  const model = engineModel();
  const web = webSearchOn();
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    // structured output guarantees the JSON shape; web search answers are parsed tolerantly instead
    output_config: web ? { effort } : { effort, format: { type: "json_schema", schema } },
  };
  if (web) {
    body.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }];
    body.system += `\nReply with one JSON object matching this schema and nothing else:\n${JSON.stringify(schema)}`;
  }
  let res;
  try {
    if (FALLBACK_MODELS.has(model)) {
      res = await client.beta.messages.create({ ...body, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    } else {
      res = await client.messages.create(body);
    }
  } catch (e) {
    throw new Error(friendly(e, model));
  }
  if (res.stop_reason === "refusal") throw new Error("The engine declined to analyse this request.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const json = parseJson(text);
  if (!json) throw new Error(res.stop_reason === "max_tokens" ? "The analysis was cut off — try again." : "The engine reply could not be read.");
  return { json, model: res.model, usage: res.usage };
}

const pct = (x) => (x === null || x === undefined ? "-" : `${Math.round(x * 100)}%`);

// Compact, factual brief of a match for the engine.
export function matchBrief({ event: ev, analysis: a, live, stats, timeline, form, table, h2h, lineups, league }) {
  const lines = [];
  const when = new Date(ev.date).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  lines.push(`${league?.name || ev.league} · ${when} · ${ev.home.name} (home) vs ${ev.away.name} (away)`);
  lines.push(`Status: ${ev.state === "in" ? `LIVE ${ev.detail} score ${ev.home.score}-${ev.away.score}` : ev.state === "post" ? `FINISHED ${ev.home.score}-${ev.away.score}` : "pre-match"}`);
  if (ev.home.form || ev.away.form) lines.push(`Form (last 5, oldest→newest): ${ev.home.short} ${ev.home.form || "?"} · ${ev.away.short} ${ev.away.form || "?"}`);
  if (ev.home.record || ev.away.record) lines.push(`Season record: ${ev.home.short} ${ev.home.record} · ${ev.away.short} ${ev.away.record}`);
  if (ev.odds) {
    const o = ev.odds;
    lines.push(`${o.provider} odds now: 1 ${o.home ?? "-"} / X ${o.draw ?? "-"} / 2 ${o.away ?? "-"}${o.total ? ` · O/U ${o.total.line}: ${o.total.over ?? "-"}/${o.total.under ?? "-"}` : ""}${o.homeOpen ? ` · opened 1 ${o.homeOpen} / X ${o.drawOpen ?? "-"} / 2 ${o.awayOpen}` : ""}`);
  }
  if (a) {
    lines.push(`Model (${a.basis || a.quality}): win ${pct(a.probs?.h)} / draw ${pct(a.probs?.d)} / loss ${pct(a.probs?.a)}${a.xg ? ` · expected goals ${a.xg.home}-${a.xg.away}` : ""}`);
    const top = (a.markets || []).slice().sort((x, y) => y.p - x.p).filter((m) => m.odds && m.odds >= 1.15).slice(0, 14);
    lines.push("Model markets (probability · price · EV): " + top.map((m) => `${m.label} ${pct(m.p)} @${m.odds}${m.estimated ? "*" : ""} ${m.ev !== null ? (m.ev >= 0 ? "+" : "") + Math.round(m.ev * 100) + "%" : ""}`).join("; "));
    lines.push("(* = no live price on the feed, estimated from fair odds minus a typical margin)");
    if (a.pick) lines.push(`Model's own pick: ${a.pick.label} @${a.pick.odds} (${a.pick.tier})`);
    if (a.scores?.length) lines.push("Likeliest scores: " + a.scores.slice(0, 4).map((s) => `${s.score} ${pct(s.p)}`).join(", "));
    for (const n of a.notes || []) lines.push(`Note: ${noteText("en", n)}`);
  }
  if (live) {
    lines.push(`Live model at ${live.minute}': final result ${pct(live.probs.h)} / ${pct(live.probs.d)} / ${pct(live.probs.a)} · next goal home ${pct(live.nextGoal.home)} away ${pct(live.nextGoal.away)} none ${pct(live.nextGoal.none)} · ` +
      live.overs.map((x) => `over ${x.line} ${pct(x.p)}`).join(", "));
  }
  const st = Object.entries(stats || {}).filter(([, v]) => v.home !== null || v.away !== null);
  if (st.length) lines.push("Match stats (home-away): " + st.map(([k, v]) => `${k} ${v.home ?? "-"}-${v.away ?? "-"}`).join(", "));
  if (timeline?.length) lines.push("Timeline: " + timeline.slice(-12).map((t) => `${t.minute} ${t.type}${t.side ? ` (${t.side})` : ""}`).join("; "));
  for (const side of ["home", "away"]) {
    const g = form?.[side] || [];
    if (g.length) lines.push(`${ev[side].short} last games: ` + g.map((x) => `${x.result} ${x.score} ${x.at} ${x.opponent}`).join("; "));
  }
  if (h2h?.length) lines.push("Head-to-head: " + h2h.map((g) => `${g.date?.slice(0, 10)} ${g.score}`).join("; "));
  const rows = (table || []).filter((r) => r.team === ev.home.name || r.team === ev.away.name || r.id === ev.home.id || r.id === ev.away.id);
  if (rows.length) lines.push("Table: " + rows.map((r) => `${r.team} #${r.rank} ${r.pts}pts GP${r.gp} GF${r.gf} GA${r.ga}`).join("; "));
  for (const l of lineups || []) {
    if (l.starters?.length) lines.push(`${l.teamId === ev.home.id ? ev.home.short : ev.away.short} XI${l.formation ? ` (${l.formation})` : ""}: ${l.starters.map((p) => p.name).join(", ")}`);
  }
  return lines.join("\n");
}

export const INSIGHT_SYSTEM = `You are the analyst behind Skii Pronos, a betting-tips site whose readers bet on 1xBet. You get a factual brief of one match: real bookmaker odds, a quantitative model's probabilities for every market (de-vigged odds blended with a league-table/form model), recent form, table, head-to-head and — when the match is live — live stats and a live re-pricing.

Your job: give the single best bet and an honest read.
- Respect the numbers. The model's probabilities are calibrated to the market; only move away from them when the brief gives a concrete reason (injury/absence in the lineups, a red card, a clear stats imbalance, rotation, a dead-rubber, a strong form or table gap the market seems to ignore).
- Pick from markets in the brief. Prefer a priced market; if you choose one marked *, say it should only be taken at or above the stated price.
- "Best" means the best trade-off of hit chance and price, not the shortest odds. Never recommend anything under 1.15.
- If there's no edge, say so: confidence "Skip" is a valid answer.
- Live: base the read on the current score, minute, cards and the stats trend. Say which way momentum is going and what the next 15 minutes most likely bring.
- Plain, punchy language. No hype, no guarantees.`;

export const INSIGHT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "verdict", "best_bet", "alternatives", "key_factors", "risks", "live_read", "score_prediction"],
  properties: {
    headline: { type: "string", description: "max 12 words" },
    verdict: { type: "string", description: "2-4 sentences" },
    best_bet: {
      type: "object", additionalProperties: false,
      required: ["selection", "odds", "confidence", "reasoning"],
      properties: {
        selection: { type: "string" }, odds: { type: "number" },
        confidence: { type: "string", enum: ["High", "Med-High", "Medium", "Low", "Skip"] },
        reasoning: { type: "string" },
      },
    },
    alternatives: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["selection", "odds", "reasoning"],
        properties: { selection: { type: "string" }, odds: { type: "number" }, reasoning: { type: "string" } },
      },
    },
    key_factors: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    live_read: { type: "string", description: "empty string when the match is not live" },
    score_prediction: { type: "string" },
  },
};

export const REVIEW_SYSTEM = `You are the sceptical second opinion on Skii Pronos' "coupon du jour" — an accumulator of the day's safest legs, picked by a quantitative model. Your job is to drop legs with hidden risk, not to be agreeable: rotation after midweek European games, first legs of two-legged ties, derbies, dead rubbers, a short favourite with poor form, or a reason that doesn't support the market. Keep a leg only if you'd put it in your own slip. Be brief.`;

export const REVIEW_SCHEMA = {
  type: "object", additionalProperties: false, required: ["reviews"],
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["eventId", "verdict", "note"],
        properties: { eventId: { type: "string" }, verdict: { type: "string", enum: ["keep", "drop"] }, note: { type: "string", description: "max 16 words" } },
      },
    },
  },
};
