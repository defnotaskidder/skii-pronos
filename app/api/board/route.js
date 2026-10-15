import { NextResponse } from "next/server";
import { boardForClient } from "../../../lib/board";

export const maxDuration = 60;

// Every league, yesterday → +2 days, each match with the model's verdict (and, for finished
// games, the pick the engine saved before kick-off with its result).
export async function GET(request) {
  const days = Math.min(4, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 2));
  try {
    const events = await boardForClient(days);
    return NextResponse.json({ events, updated: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e.message, events: [] }, { status: 502 });
  }
}
