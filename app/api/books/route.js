import { NextResponse } from "next/server";
import { oddsApi, oddsEnabled, regions, findEvent, compareBooks, lastQuota } from "../../../lib/odds";
import { LEAGUE_BY_ID } from "../../../lib/leagues";
import { rawOdds } from "../../../lib/oddsapi-leagues";

// Bookmaker comparison for one match (1xBet first when listed). Body-less GET:
// ?league=eng.1&date=ISO&home=Name&away=Name
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const league = LEAGUE_BY_ID[sp.get("league")];
  if (!oddsEnabled()) return NextResponse.json({ enabled: false });
  if (!league?.odds) return NextResponse.json({ enabled: true, rows: [], message: "This league isn't on the bookmaker feed." });
  try {
    // leagues fed by The Odds API reuse the board's cached call (no extra credits)
    const { data, quota } = league.source === "oddsapi" ? { data: await rawOdds(league.id), quota: lastQuota() } : await oddsApi(`/sports/${league.odds}/odds`, {
      regions: regions(), markets: "h2h,totals", oddsFormat: "decimal", dateFormat: "iso",
    });
    const ev = { date: sp.get("date"), home: { name: sp.get("home") }, away: { name: sp.get("away") } };
    const match = findEvent(data, ev);
    if (!match) return NextResponse.json({ enabled: true, rows: [], quota, message: "Bookmakers haven't listed this match yet." });
    return NextResponse.json({ enabled: true, ...compareBooks(match), quota });
  } catch (e) {
    return NextResponse.json({ enabled: true, rows: [], error: e.message }, { status: 200 });
  }
}
