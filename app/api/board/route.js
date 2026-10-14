import { NextResponse } from "next/server";
import { boardForClient } from "../../../lib/board";
import { LEAGUES } from "../../../lib/leagues";

// Every league, yesterday → +2 days, each match with the model's verdict.
export async function GET(request) {
  const days = Math.min(4, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 2));
  try {
    const events = await boardForClient(days);
    return NextResponse.json({ events, leagues: LEAGUES, updated: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e.message, events: [], leagues: LEAGUES }, { status: 502 });
  }
}
