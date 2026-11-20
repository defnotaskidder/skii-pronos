import { NextResponse } from "next/server";
import { dailyOne, dbEnabled } from "../../../lib/db";

export const dynamic = "force-dynamic";

// One archived coupon of the day with its legs, scores and results. ?day=YYYY-MM-DD&kind=grosse
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const day = q.get("day") || "", kind = q.get("kind") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[a-z0-9_]{1,20}$/.test(kind)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (!dbEnabled()) return NextResponse.json({ db: false, coupon: null });
  const coupon = await dailyOne(day, kind);
  return NextResponse.json({ db: true, coupon: coupon || null }, { status: coupon ? 200 : 404 });
}
