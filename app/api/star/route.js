export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { METHOD, eventsToPrompt } from "../../../lib/prompt";

const VALID = new Set(["High", "Med-High", "Medium", "Low", "Skip"]);

function parseJson(raw) {
  if (!raw) return [];
  let text = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("[");
  if (start !== -1) text = text.slice(start);
  const end = text.lastIndexOf("]");
  if (end !== -1) { try { return JSON.parse(text.slice(0, end + 1)); } catch { /* salvage below */ } }
  const out = []; let depth = 0, s = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") { if (depth === 0) s = i; depth++; }
    else if (c === "}") { depth--; if (depth === 0 && s !== -1) { try { out.push(JSON.parse(text.slice(s, i + 1))); } catch { /* skip */ } s = -1; } }
  }
  return out;
}

async function call(key, body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Engine error ${res.status}`);
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

const VERIFY = `You are the second opinion on a betting card — the sceptic whose job is to REJECT weak picks, not to be agreeable.

You receive candidate picks with their real odds and the reason given. For each one decide:
- "star": a genuinely strong edge. Reserve this for picks where the data is overwhelming: a real class gap, a decisive form or injury angle, or a price clearly below what the matchup deserves. Typically 1.15-1.75.
- "keep": fine bet, not a star.
- "reject": coin flip dressed up as an edge, a short price with hidden risk (rotation after midweek European games, a defensively solid underdog, a first leg of a two-legged tie, a derby, an MLS home side, a tennis favourite), or a reason that does not actually support the market.

Be strict. A normal day has 0-4 stars across an entire card. If nothing qualifies, return no stars — that is a valid, useful answer. Never invent odds; copy them from the input.

Respond with ONLY a JSON array:
[{"event_id":"...","verdict":"star|keep|reject","confidence":"High|Med-High|Medium","note":"max 16 words on why it is or is not a star","risk":"the single biggest thing that could kill it, max 12 words"}]`;

export async function POST(request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
  const { events = [], extras = {}, mode = "safe" } = await request.json();
  if (!events.length) return NextResponse.json({ error: "No events to analyze." }, { status: 400 });

  const model = process.env.ENGINE_MODEL || "claude-sonnet-5";
  const webSearch = process.env.ENGINE_WEB_SEARCH === "true";
  const byId = new Map(events.map((e) => [e.id, e]));

  try {
    // PASS 1 — rate everything (batched so replies never hit the token ceiling)
    const rated = [];
    for (let i = 0; i < events.length; i += 8) {
      const batch = events.slice(i, i + 8);
      const body = {
        model, max_tokens: 8000,
        system: METHOD + "\nCRITICAL: output the JSON array and nothing else.",
        messages: [{ role: "user", content: `Mode: ${mode === "safe" ? "SAFE LOCKS" : "HIGH VALUE"}.\nEvents (odds are real, decimal):\n${eventsToPrompt(batch, extras)}\n\nReturn the JSON array only.` }],
      };
      if (webSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
      const picks = parseJson(await call(key, body)).filter((p) => p && byId.has(p.event_id));
      rated.push(...picks);
    }
    if (!rated.length) return NextResponse.json({ error: "The engine could not rate these matches. Try fewer leagues.", stars: [], rated: 0 }, { status: 200 });

    // Candidates for the second pass: the strongest tiers only
    const candidates = rated
      .filter((p) => ["High", "Med-High"].includes(p.confidence) && Number(p.odds) > 1.05)
      .sort((a, b) => (a.confidence === "High" ? -1 : 1) - (b.confidence === "High" ? -1 : 1) || a.odds - b.odds)
      .slice(0, 14);
    if (!candidates.length) {
      return NextResponse.json({ stars: [], rated: rated.length, candidates: 0, message: "No pick reached star standard today. That is a real answer — skip the slip." });
    }

    // PASS 2 — verify each candidate, reject the soft ones
    const lines = candidates.map((p) => {
      const e = byId.get(p.event_id);
      const t = new Date(e.commence_time);
      return `id=${p.event_id} | ${t.toISOString().slice(0, 10)} ${t.toISOString().slice(11, 16)} GMT | ${e.league} | ${e.home} vs ${e.away} | pick: ${p.selection} (${p.market}) @ ${p.odds} | tier: ${p.confidence} | reason: ${p.reason}`;
    }).join("\n");
    const vBody = {
      model, max_tokens: 4000, system: VERIFY,
      messages: [{ role: "user", content: `Candidate picks:\n${lines}\n\nReturn the JSON array only.` }],
    };
    if (webSearch) vBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const verdicts = new Map(parseJson(await call(key, vBody)).filter((v) => v && v.event_id).map((v) => [v.event_id, v]));

    const stars = candidates
      .filter((p) => verdicts.get(p.event_id)?.verdict === "star")
      .map((p) => {
        const e = byId.get(p.event_id);
        const v = verdicts.get(p.event_id);
        const t = new Date(e.commence_time);
        return {
          event_id: p.event_id,
          match: `${e.home} vs ${e.away}`,
          league: e.league,
          when: `${t.toISOString().slice(5, 10)} ${t.toISOString().slice(11, 16)}`,
          commence_time: e.commence_time,
          market: String(p.market || ""),
          selection: String(p.selection || p.market || ""),
          odds: Number(p.odds) || 0,
          confidence: VALID.has(v.confidence) ? v.confidence : p.confidence,
          reason: String(p.reason || ""),
          note: String(v.note || ""),
          risk: String(v.risk || ""),
          star: true,
        };
      })
      .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));

    return NextResponse.json({
      stars, rated: rated.length, candidates: candidates.length,
      rejected: candidates.length - stars.length,
      message: stars.length ? undefined : "Every candidate failed verification today. No star slip — that is the honest call.",
    });
  } catch (e) {
    return NextResponse.json({ error: e.message, stars: [] }, { status: 502 });
  }
}
