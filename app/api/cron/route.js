import { NextResponse } from "next/server";
import { board } from "../../../lib/espn";
import { analysedBoard } from "../../../lib/board";
import { syncBoard, dailySettle, dbEnabled } from "../../../lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily backstop (vercel.json): snapshot picks for the next two days and grade the last three,
// even if nobody opened the site. Visitors keep both up to date the rest of the time.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!dbEnabled()) return NextResponse.json({ ok: false, db: false });
  const started = Date.now();
  const rows = await analysedBoard(2);
  await syncBoard(rows); // even if the board came from the short memo: save picks, grade yesterday/today
  const older = await board(-2, -3).catch(() => []); // 3 and 2 days ago
  await syncBoard(older.filter((e) => e.state === "post").map((ev) => ({ ev, analysis: null })));
  const coupons = await dailySettle();
  return NextResponse.json({ ok: true, games: rows.length, older: older.length, couponsChecked: coupons, ms: Date.now() - started });
}
