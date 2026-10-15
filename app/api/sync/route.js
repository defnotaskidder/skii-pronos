import { NextResponse } from "next/server";
import { userFromRequest } from "../../../lib/auth-server";
import { dbEnabled, userDataGet, userDataSet } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Account sync: follows, tracked coupons, alert prefs, slip, language, unit size.
export async function GET(request) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ data: {}, db: false });
  return NextResponse.json({ data: await userDataGet(user.id), db: true, user: { id: user.id, name: user.name } });
}

export async function PUT(request) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ ok: false, db: false });
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (JSON.stringify(b).length > 400_000) return NextResponse.json({ ok: false, error: "too large" }, { status: 413 });
  await userDataSet(user.id, b?.data || {});
  return NextResponse.json({ ok: true });
}
