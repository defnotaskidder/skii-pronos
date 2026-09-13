export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { DEFAULT_SPORTS, oddsApi } from "../../../lib/odds";

// Lists leagues: the curated defaults plus anything currently in season at the Odds API.
export async function GET() {
  try {
    const { data, quota } = await oddsApi("/sports");
    const live = new Map(data.map((s) => [s.key, s]));
    const curated = DEFAULT_SPORTS.map((s) => ({ ...s, active: live.has(s.key) }));
    const extra = data
      .filter((s) => !DEFAULT_SPORTS.some((d) => d.key === s.key) && !s.has_outrights)
      .map((s) => ({ key: s.key, title: s.title, group: s.group, active: true }));
    return NextResponse.json({ sports: [...curated, ...extra], quota });
  } catch (e) {
    return NextResponse.json({ sports: DEFAULT_SPORTS.map((s) => ({ ...s, active: true })), error: e.message }, { status: 200 });
  }
}
