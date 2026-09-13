export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { METHOD, eventsToPrompt } from "../../../lib/prompt";

const VALID = new Set(["High", "Med-High", "Medium", "Low", "Skip"]);

function parseArray(text) {
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if (a === -1 || b === -1) throw new Error("The engine did not return a JSON array.");
  return JSON.parse(text.slice(a, b + 1));
}

export async function POST(request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });
  const { events = [], extras = {}, mode = "safe" } = await request.json();
  if (!events.length) return NextResponse.json({ error: "No events to analyze." }, { status: 400 });

  const model = process.env.ENGINE_MODEL || "claude-sonnet-5";
  const webSearch = process.env.ENGINE_WEB_SEARCH === "true";
  const modeText = mode === "safe"
    ? "Mode: SAFE LOCKS."
    : "Mode: HIGH VALUE.";
  const body = {
    model,
    max_tokens: 4000,
    system: METHOD,
    messages: [{
      role: "user",
      content: `${modeText}${webSearch ? " You may web-search recent form, injuries and lineups before deciding." : ""}\nEvents (odds are real, decimal):\n${eventsToPrompt(events, extras)}\n\nReturn the JSON array only.`,
    }],
  };
  if (webSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || `Engine error ${res.status}` }, { status: 502 });
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const byId = new Map(events.map((e) => [e.id, e]));
    const picks = parseArray(text)
      .filter((p) => byId.has(p.event_id))
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
    return NextResponse.json({ picks, model, usage: data.usage });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
