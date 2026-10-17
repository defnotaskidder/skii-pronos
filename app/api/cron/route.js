import { NextResponse } from "next/server";
import { board } from "../../../lib/espn";
import { oaBoard } from "../../../lib/oddsapi-leagues";
import { analysedBoard } from "../../../lib/board";
import { syncBoard, dailySettle, dbEnabled } from "../../../lib/db";
import { learnFromGames } from "../../../lib/ratings";
import { tick } from "../../../lib/alerts";
import { telegramEnabled, telegramSetup } from "../../../lib/messaging";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Scheduled by vercel.json: morning (coupons + posts) and evening (results). Also a safety net:
// snapshot picks for the next two days, grade the last three, update team ratings, make sure
// the Telegram webhook is registered.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!dbEnabled()) return NextResponse.json({ ok: false, db: false });
  const started = Date.now();
  const when = request.nextUrl.searchParams.get("when") || "morning";
  const rows = await analysedBoard(2);
  await syncBoard(rows); // even if the board came from the short memo: save picks, grade yesterday/today
  const older = [...(await board(-2, -3).catch(() => [])), ...(await oaBoard(-2, -3).catch(() => []))]; // 3 and 2 days ago, both feeds
  await syncBoard(older.filter((e) => e.state === "post").map((ev) => ({ ev, analysis: null })));
  const rated = await learnFromGames([...rows.map((r) => r.ev), ...older]);
  const coupons = await dailySettle();
  let telegram = null;
  if (telegramEnabled()) { try { telegram = await telegramSetup(); } catch (e) { telegram = { error: e.message }; } }
  const alerts = await tick({ force: when === "evening" ? "evening" : "morning" }).catch((e) => ({ error: e.message }));
  return NextResponse.json({ ok: true, when, games: rows.length, older: older.length, rated, couponsChecked: coupons, telegram, alerts, ms: Date.now() - started });
}
