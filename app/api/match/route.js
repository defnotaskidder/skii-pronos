import { NextResponse } from "next/server";
import { summary } from "../../../lib/espn";
import { analysedBoard, tablesFor } from "../../../lib/board";
import { analyse, liveAnalyse } from "../../../lib/model";
import { LEAGUE_BY_ID } from "../../../lib/leagues";

// Everything about one match: live state, stats, timeline, form, table, lineups,
// the full market table from the model, and (when live) re-priced live probabilities.
export async function GET(request) {
  const league = request.nextUrl.searchParams.get("league");
  const id = request.nextUrl.searchParams.get("id");
  if (!league || !id || !LEAGUE_BY_ID[league]) return NextResponse.json({ error: "league and id are required" }, { status: 400 });
  try {
    const rows = await analysedBoard(2).catch(() => []);
    const row = rows.find((r) => r.ev.id === id);
    const sum = await summary(league, id, row?.ev?.state === "in");
    // scoreboard event has the richer odds block; summary has the freshest score/clock
    const ev = row ? mergeLive(row.ev, sum.event) : sum.event;
    const tables = await tablesFor([league]);
    let analysis = row?.analysis;
    if (!analysis) {
      // finished or outside the board window: price it from the pre-match odds we have
      analysis = analyse({ ...ev, state: "pre" }, tables[league] || {});
    }
    const live = liveAnalyse(ev, analysis, sum.stats);
    return NextResponse.json({ event: ev, analysis, live, ...strip(sum), league: LEAGUE_BY_ID[league] });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

const mergeLive = (base, fresh) => ({
  ...base,
  state: fresh.state || base.state, completed: fresh.completed, detail: fresh.detail || base.detail,
  clock: fresh.clock || base.clock, minute: fresh.minute || base.minute, period: fresh.period || base.period,
  home: { ...base.home, score: fresh.home?.score ?? base.home?.score },
  away: { ...base.away, score: fresh.away?.score ?? base.away?.score },
  odds: base.odds || fresh.odds,
});
const strip = ({ event, ...rest }) => rest; // eslint-disable-line no-unused-vars
