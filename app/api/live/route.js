import { NextResponse } from "next/server";
import { board } from "../../../lib/espn";

export const revalidate = 10;

// Light, fast poll for the notification system: yesterday's and today's games, state + score only.
export async function GET() {
  try {
    const events = await board(0, -1);
    const games = events.map((e) => ({
      id: e.id, league: e.league, state: e.state, detail: e.detail, minute: e.minute, period: e.period, date: e.date,
      home: e.home?.short, away: e.away?.short, hs: e.home?.score, as: e.away?.score, reds: e.reds,
    }));
    return NextResponse.json({ games, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ games: [], error: e.message }, { status: 502 });
  }
}
