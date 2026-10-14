import { NextResponse } from "next/server";
import { aiEnabled, askJson, matchBrief, INSIGHT_SYSTEM, INSIGHT_SCHEMA, engineModel } from "../../../lib/ai";

export const maxDuration = 60;

// Full (or live) AI analysis of one match. The client posts what /api/match returned,
// so the engine reads exactly what the visitor is looking at.
export async function POST(request) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "AI analysis is off: add ANTHROPIC_API_KEY to the server environment. The model numbers above still work without it." }, { status: 503 });
  }
  let data;
  try { data = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  if (!data?.event?.home || !data?.event?.away) return NextResponse.json({ error: "Match data missing" }, { status: 400 });
  const live = data.event.state === "in";
  try {
    const brief = matchBrief(data);
    const { json, model } = await askJson({
      system: INSIGHT_SYSTEM,
      user: `${live ? "LIVE ANALYSIS — the match is in progress." : "FULL PRE-MATCH ANALYSIS."}\n\n${brief}`,
      schema: INSIGHT_SCHEMA,
      effort: live ? "low" : "medium",
    });
    return NextResponse.json({ insight: json, model: model || engineModel(), live, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
