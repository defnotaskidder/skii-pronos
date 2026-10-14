import { NextResponse } from "next/server";
import { scoreboard } from "../../../lib/espn";
import { settle } from "../../../lib/model";
import { LEAGUE_BY_ID } from "../../../lib/leagues";

// Auto-grade saved picks from final scores. Body: { picks: [{ eventId, league, date, key }] }
export async function POST(request) {
  let picks = [];
  try { ({ picks = [] } = await request.json()); } catch { /* empty */ }
  picks = picks.filter((p) => p && LEAGUE_BY_ID[p.league] && p.eventId && p.date).slice(0, 200);
  const etDay = (iso, off) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(new Date(iso).getTime() + off * 86400000)).replace(/-/g, "");
  const wanted = new Set();
  for (const p of picks) { wanted.add(`${p.league}|${etDay(p.date, 0)}`); wanted.add(`${p.league}|${etDay(p.date, -1)}`); }
  const events = new Map();
  await Promise.all([...wanted].map(async (k) => {
    const [league, day] = k.split("|");
    for (const e of await scoreboard(league, day).catch(() => [])) events.set(e.id, e);
  }));
  const results = picks.map((p) => {
    const e = events.get(p.eventId);
    if (!e) return { eventId: p.eventId, key: p.key, result: null };
    if (e.postponed) return { eventId: p.eventId, key: p.key, result: "V", score: null };
    if (!e.completed) return { eventId: p.eventId, key: p.key, result: null, state: e.state };
    return { eventId: p.eventId, key: p.key, result: settle(p.key, e.home.score, e.away.score), score: `${e.home.score}-${e.away.score}` };
  });
  return NextResponse.json({ results });
}
