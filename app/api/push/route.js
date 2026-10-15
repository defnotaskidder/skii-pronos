import { NextResponse } from "next/server";
import { vapid } from "../../../lib/alerts";
import { pushRemove, pushUpsert, dbEnabled } from "../../../lib/db";
import { userFromRequest } from "../../../lib/auth-server";

export const dynamic = "force-dynamic";

// Public VAPID key for the browser.
export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ key: null, reason: "no database" });
  try { const k = await vapid(); return NextResponse.json({ key: k.publicKey }); } catch (e) { return NextResponse.json({ key: null, reason: e.message }); }
}

// Save / update this device's subscription with what it wants to hear about.
export async function POST(request) {
  if (!dbEnabled()) return NextResponse.json({ ok: false }, { status: 503 });
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const sub = b?.subscription;
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint)) return NextResponse.json({ ok: false }, { status: 400 });
  const user = await userFromRequest(request);
  await pushUpsert({ endpoint: sub.endpoint, subscription: sub, user_id: user?.id || null, device: String(b.device || "").slice(0, 32),
    prefs: b.prefs && typeof b.prefs === "object" ? b.prefs : {}, follows: Array.isArray(b.follows) ? b.follows.slice(0, 500).map(String) : [], lang: b.lang === "en" ? "en" : "fr" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ ok: true }); }
  if (b?.endpoint) await pushRemove(String(b.endpoint));
  return NextResponse.json({ ok: true });
}
