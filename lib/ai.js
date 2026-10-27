// Claude layer: reads the model's numbers plus the match data and writes the analysis.
// Optional — everything else on the site works without ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";
import { noteText } from "./i18n";

// One main key (ANTHROPIC_API_KEY) plus optional backups (ANTHROPIC_API_KEYS, comma-separated —
// another account's key, a key on a different billing). When a key is out of credits, invalid or
// rate-limited, the next one takes over and the spent key rests (6 hours for credits/auth
// problems, 2 minutes for rate limits). ENGINE_MODEL_FALLBACK (optional) names a second model
// tried when the main one is unavailable or overloaded.
const keys = () => [process.env.ANTHROPIC_API_KEY, ...(process.env.ANTHROPIC_API_KEYS || "").split(",")]
  .map((k) => (k || "").trim()).filter((k, i, all) => k && all.indexOf(k) === i);
const resting = globalThis.__skiiAiResting || (globalThis.__skiiAiResting = new Map()); // key → until (ms)
export const aiEnabled = () => keys().length > 0;
export const engineModel = () => process.env.ENGINE_MODEL || "claude-opus-5-5";
const fallbackModel = () => (process.env.ENGINE_MODEL_FALLBACK || "").trim() || null;
const webSearchOn = () => process.env.ENGINE_WEB_SEARCH === "true";
// Server-side refusal fallback is available on these models (Claude API).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

// Keys in the order to try: rested ones first, resting ones (recently failed) last.
function keyOrder() {
  const now = Date.now();
  const all = keys();
  return [...all.filter((k) => !(resting.get(k) > now)), ...all.filter((k) => resting.get(k) > now)];
}
// What a failure means for the key / the model: "key" → move to the next key (and rest this one),
// "model" → try the fallback model on the same key, "fatal" → stop (a request problem).
function classify(e) {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { kind: "key", rest: 6 * 3600e3 };
  if (e instanceof Anthropic.RateLimitError) return { kind: "key", rest: 2 * 60e3 };
  if (e instanceof Anthropic.NotFoundError) return { kind: "model" };
  if (e instanceof Anthropic.APIError) {
    if (e.status === 402 || e.type === "billing_error") return { kind: "key", rest: 6 * 3600e3 }; // out of credits
    if (e.status === 529 || e.status >= 500 || e.type === "overloaded_error") return { kind: "model" };
  }
  if (e instanceof Anthropic.APIConnectionError) return { kind: "model" };
  return { kind: "fatal" };
}
// Which key and model are serving right now (for the status readout).
export function aiStatus() {
  const now = Date.now();
  const all = keys();
  return { keys: all.length, resting: all.filter((k) => resting.get(k) > now).length, model: engineModel(), fallback: fallbackModel() };
}

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
  if (e instanceof Anthropic.BadRequestError) return `The AI request was rejected (400): ${String(e.message || "").replace(/^d+s*/, "").slice(0, 240)}`; // say why: it is the owner's to fix
  if (e instanceof Anthropic.APIError) return `AI service error (${e.status ?? "unknown"}). Try again.`;
  return e?.message || "AI request failed.";
}

// One JSON answer from the engine. `web` true forces web search (null follows ENGINE_WEB_SEARCH);
// `timeoutMs` is a hard wall-clock limit for the whole call (no SDK retries inside it).
export async function askJson({ system, user, schema, effort = "medium", maxTokens = 16000, web = null, maxUses = 5, timeoutMs = null }) {
  const order = keyOrder();
  if (!order.length) throw new Error("ANTHROPIC_API_KEY is not set.");
  const models = [engineModel(), ...(fallbackModel() && fallbackModel() !== engineModel() ? [fallbackModel()] : [])];
  let last = null;
  for (const key of order) {
    for (const model of models) {
      try {
        return await askOnce({ client: new Anthropic({ apiKey: key }), model, system, user, schema, effort, maxTokens, web, maxUses, timeoutMs });
      } catch (e) {
        if (!e?.raw) throw e; // not an API failure (the reply couldn't be read, the engine declined)
        last = e;
        const c = classify(e.raw);
        if (c.kind === "fatal") throw e;
        if (c.kind === "key") { resting.set(key, Date.now() + c.rest); console.warn(`[ai] key ${order.indexOf(key) + 1}/${order.length} set aside (${e.raw.status ?? e.raw.name}): ${e.message}`); break; }
        console.warn(`[ai] ${model} unavailable (${e.raw.status ?? e.raw.name})${models.indexOf(model) < models.length - 1 ? ", trying the fallback model" : ""}`);
      }
    }
  }
  throw new Error(order.length > 1 ? `Every AI key failed — last: ${last.message}` : last.message);
}

// One attempt with one key and one model.
async function askOnce({ client, model, system, user, schema, effort, maxTokens, web, maxUses, timeoutMs }) {
  const useWeb = web === null ? webSearchOn() : !!web;
  const body = {
    model,
    max_tokens: maxTokens,
    // structured output guarantees the JSON shape, but it can't be combined with the citations web
    // search produces (400), so with search the schema goes in the prompt and the reply is parsed tolerantly
    system: useWeb ? `${system}\nReply with one JSON object matching this schema and nothing else:\n${JSON.stringify(schema)}` : system,
    messages: [{ role: "user", content: user }],
    output_config: useWeb ? { effort } : { effort, format: { type: "json_schema", schema } },
  };
  if (useWeb) body.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: maxUses }];
  const deadline = timeoutMs ? Date.now() + timeoutMs : null;
  const send = (b) => {
    const opts = deadline ? { timeout: Math.max(1000, deadline - Date.now()), maxRetries: 0 } : undefined;
    return FALLBACK_MODELS.has(model)
      ? client.beta.messages.create({ ...b, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, opts)
      : client.messages.create(b, opts);
  };
  const contents = [];
  let res;
  try {
    res = await send(body);
    contents.push(res.content);
    // the server-side search loop can pause a long turn: send it back as is and it resumes
    for (let i = 0; i < 2 && res.stop_reason === "pause_turn"; i++) {
      if (deadline && deadline - Date.now() < 3000) break;
      body.messages = [...body.messages, { role: "assistant", content: res.content }];
      res = await send(body);
      contents.push(res.content);
    }
  } catch (e) {
    const err = new Error(friendly(e, model));
    err.raw = e; // lets askJson decide whether another key or model is worth trying
    throw err;
  }
  if (res.stop_reason === "refusal") throw new Error("The engine declined to analyse this request.");
  // citations split the answer into several text blocks: join them without separators
  const textOf = (content) => content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const json = parseJson(textOf(res.content)) || parseJson(contents.map(textOf).join(""));
  if (!json) throw new Error(res.stop_reason === "max_tokens" ? "The analysis was cut off — try again." : res.stop_reason === "pause_turn" ? "The engine ran out of time searching." : "The engine reply could not be read.");
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
    // shapes differ by sport: football has no draw and no "next goal", hockey/NFL carry overtime
    const res = live.probs?.d !== undefined ? `${pct(live.probs.h)} / ${pct(live.probs.d)} / ${pct(live.probs.a)}` : `${pct(live.probs?.h)} / ${pct(live.probs?.a)}`;
    const next = live.nextGoal ? ` · next goal home ${pct(live.nextGoal.home)} away ${pct(live.nextGoal.away)} none ${pct(live.nextGoal.none)}` : "";
    const ot = live.toOT !== undefined && live.toOT < 1 ? ` · overtime ${pct(live.toOT)}` : "";
    lines.push(`Live model at ${live.label || `${live.minute}'`}: final result ${res}${next}${ot} · ` + (live.overs || []).map((x) => `over ${x.line} ${pct(x.p)}`).join(", "));
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

export const REVIEW_SYSTEM = `You are the sceptical second opinion on Skii Pronos' daily coupons — accumulators picked by a quantitative model from real bookmaker prices; readers bet them on 1xBet. Your job is to drop legs with hidden risk, not to be agreeable.

Before judging, search the web for each leg's team news: injured or suspended key players, likely rotation (a European or cup game just before or after), motivation (title race, relegation fight, dead rubber, a tie already decided) and the weather when it could matter. One search often covers several games of the same league or matchday — search efficiently.

Then judge each leg against the facts: drop it for rotation, key absences, a derby, a first leg, a short favourite in poor form, or any reason the facts don't support the market. Keep a leg only if you would put it in your own slip. Each note is in French, at most 16 words, and names the concrete reason (who is out, what is at stake). Return one review per leg.`;

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
