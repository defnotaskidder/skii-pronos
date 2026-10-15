import { NextResponse } from "next/server";
import { userFromRequest } from "../../../lib/auth-server";
import { dbEnabled, linkCodeCreate, linkRemove, linksFor } from "../../../lib/db";
import { telegramBotName, telegramEnabled, whatsappEnabled } from "../../../lib/messaging";

export const dynamic = "force-dynamic";

const info = () => ({
  telegram: { enabled: telegramEnabled(), bot: telegramBotName() },
  whatsapp: { enabled: whatsappEnabled(), number: process.env.WHATSAPP_NUMBER || null },
});

// Public: which messaging apps are set up. With a session: the user's links too.
export async function GET(request) {
  const user = await userFromRequest(request);
  const links = user && dbEnabled() ? await linksFor(user.id) : [];
  return NextResponse.json({ ...info(), links: links || [] });
}

// Create a one-time code to link a chat (platform: telegram | whatsapp).
export async function POST(request) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ error: "no database" }, { status: 503 });
  const { platform } = await request.json().catch(() => ({}));
  if (!["telegram", "whatsapp"].includes(platform)) return NextResponse.json({ error: "platform" }, { status: 400 });
  const code = await linkCodeCreate(user.id, platform);
  const bot = telegramBotName();
  return NextResponse.json({ code, url: platform === "telegram" && bot ? `https://t.me/${bot}?start=${code}` : platform === "whatsapp" && process.env.WHATSAPP_NUMBER ? `https://wa.me/${process.env.WHATSAPP_NUMBER.replace(/\D/g, "")}?text=${encodeURIComponent(`link ${code}`)}` : null });
}

export async function DELETE(request) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { platform } = await request.json().catch(() => ({}));
  if (platform) await linkRemove(user.id, platform);
  return NextResponse.json({ ok: true });
}
