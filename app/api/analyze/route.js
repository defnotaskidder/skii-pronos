export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { METHOD, eventsToPrompt } from "../../../lib/prompt";

const VALID = new Set(["High", "Med-High", "Medium", "Low", "Skip"]);

// Tolerant parser: handles prose around the JSON, code fences, and arrays cut off
// mid-stream by max_tokens (it salvages every complete object it can find).
function parsePicks(raw) {
  if (!raw) return [];
  let text = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("[");
  if (start !== -1) text = text.slice(start);
  const end = text.lastIndexOf("]");
  if (end !== -1) {
    try { return JSON.parse(text.slice(0, end + 1)); } catch { /* fall through to salvage */ }
  }
  // Salvage: pull out each balanced {...} block and parse it on its own.
  const picks = [];
  let depth = 0, objStart = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") { if (depth === 0) objStart = i; depth++; }
    else if (c === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try { picks.push(JSON.parse(text.slice(objStart, i + 1))); } catch { /* skip broken object */ }
        objStart = -1;
      }
    }
  }
  return picks;
}

async function callEngine(key, body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Engine error ${res.status}`);
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { text, usage: data.usage };
}

export async function POST(request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
  const { events = [], extras = {}, mode = "safe" } = await request.json();
  if (!events.length) return NextResponse.json({ error: "No events to analyze." }, { status: 400 });

  const model = process.env.ENGINE_MODEL || "claude-sonnet-5";
  const webSearch = process.env.ENGINE_WEB_SEARCH === "true";
  const modeText = mode === "safe" ? "Mode: SAFE LOCKS." : "Mode: HIGH VALUE.";

  const makeBody = (strict) => {
    const body = {
      model,
      max_tokens: 8000,
      system: METHOD + (strict ? "\nCRITICAL: output the JSON array and nothing else. No preamble, no explanation, no code fences." : ""),
      messages: [
        { role: "user", content: `${modeText}${webSearch ? " You may web-search recent form, injuries and lineups before deciding." : ""}\nEvents (odds are real, decimal):\n${eventsToPrompt(events, extras)}\n\nReturn the JSON array only.` },
        // Prefilling the assistant turn with "[" forces the reply to start as JSON.
        { role: "assistant", content: "[" },
      ],
    };
    if (webSearch) { body.tools = [{ type: "web_search_20250305", name: "web_search" }]; body.messages.pop(); }
    return body;
  };

  try {
    let text, usage, prefilled = !webSearch;
    ({ text, usage } = await callEngine(key, makeBody(false)));
    let parsed = parsePicks(prefilled ? "[" + text : text);
    if (!parsed.length) {
      ({ text, usage } = await callEngine(key, makeBody(true)));
      parsed = parsePicks(prefilled ? "[" + text : text);
    }
    if (!parsed.length) {
      return NextResponse.json({ error: "The engine replied but no picks could be read. Try fewer leagues, or switch ENGINE_WEB_SEARCH off.", picks: [] }, { status: 200 });
    }

    const byId = new Map(events.map((e) => [e.id, e]));
    const picks = parsed
      .filter((p) => p && byId.has(p.event_id))
      .map((p) => {
        const e = byId.get(p.event_id);
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
          confidence: VALID.has(p.confidence) ? p.confidence : "Medium",
          reason: String(p.reason || ""),
          alt: String(p.alt || ""),
          alt_odds: Number(p.alt_odds) || 0,
        };
      });

    const missing = events.length - picks.length;
    return NextResponse.json({
      picks, model, usage,
      note: missing > 0 ? `${picks.length} of ${events.length} matches rated — press the button again to fill the rest.` : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message, picks: [] }, { status: 502 });
  }
}
