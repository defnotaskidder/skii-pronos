export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { oddsApi, regions, bookmakerPrefs, normalizeEvent } from "../../../lib/odds";

const cache = new Map(); // sport -> { at, payload } — 90s cache to protect the monthly quota
const TTL = 90 * 1000;

export async function GET(request) {
  const sport = request.nextUrl.searchParams.get("sport");
  const force = request.nextUrl.searchParams.get("refresh") === "1";
  if (!sport) return NextResponse.json({ error: "sport is required" }, { status: 400 });
  const hit = cache.get(sport);
  if (hit && !force && Date.now() - hit.at < TTL) return NextResponse.json({ ...hit.payload, cached: true });
  try {
    const { data, quota } = await oddsApi(`/sports/${sport}/odds`, {
      regions: regions(), markets: "h2h,totals,spreads", oddsFormat: "decimal", dateFormat: "iso",
    });
    const prefs = bookmakerPrefs();
    const events = data.map((ev) => normalizeEvent(ev, prefs));
    const payload = { events, quota, fetched_at: new Date().toISOString() };
    cache.set(sport, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: e.message, events: [] }, { status: 502 });
  }
}
