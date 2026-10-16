import { NextResponse } from "next/server";
import { tick, tickAllowed, tickHealth } from "../../../lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called every minute (Supabase pg_cron or any pinger) with ?key=<tick secret>.
export async function GET(request) {
  if (request.nextUrl.searchParams.has("health")) return NextResponse.json(await tickHealth(), { headers: { "cache-control": "no-store" } });
  if (!(await tickAllowed(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await tick());
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}
