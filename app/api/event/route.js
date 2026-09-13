export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { oddsApi, regions, bookmakerPrefs, normalizeExtraMarkets, SOCCER_EXTRA_MARKETS } from "../../../lib/odds";

// Extra markets for one event (BTTS, draw no bet, team totals, alternate totals, scorer props where offered).
export async function GET(request) {
  const sport = request.nextUrl.searchParams.get("sport");
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!sport || !eventId) return NextResponse.json({ error: "sport and eventId are required" }, { status: 400 });
  try {
    const { data, quota } = await oddsApi(`/sports/${sport}/events/${eventId}/odds`, {
      regions: regions(), markets: SOCCER_EXTRA_MARKETS.join(","), oddsFormat: "decimal", dateFormat: "iso",
    });
    return NextResponse.json({ markets: normalizeExtraMarkets(data, bookmakerPrefs()), quota });
  } catch (e) {
    return NextResponse.json({ error: e.message, markets: {} }, { status: 502 });
  }
}
