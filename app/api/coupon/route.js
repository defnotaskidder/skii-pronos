import { NextResponse } from "next/server";
import { analysedBoard } from "../../../lib/board";
import { buildCoupon } from "../../../lib/coupon";
import { aiEnabled, askJson, REVIEW_SYSTEM, REVIEW_SCHEMA } from "../../../lib/ai";

export const maxDuration = 60;

// Pre-match games kicking off between 10 minutes and `hours` from now.
async function pool(hours = 30) {
  const rows = await analysedBoard(2);
  const now = Date.now();
  return rows.filter(({ ev, analysis }) => {
    const t = new Date(ev.date).getTime();
    return ev.state === "pre" && !ev.postponed && analysis && t > now + 10 * 60e3 && t < now + hours * 3600e3;
  });
}

// The day's coupons stay stable for a few hours on each server instance so they don't
// reshuffle every time odds tick. (Persisted per day once the database is connected.)
const daily = new Map();

async function review(coupon, rows) {
  if (!aiEnabled() || process.env.COUPON_AI === "false" || !coupon.legs.length) return null;
  const byId = new Map(rows.map((r) => [r.ev.id, r]));
  const lines = coupon.legs.map((l) => {
    const ev = byId.get(l.eventId)?.ev;
    return `eventId=${l.eventId} | ${new Date(l.date).toISOString().slice(0, 16)}Z | ${l.league} | ${l.home} vs ${l.away} | form ${ev?.home?.form || "?"} vs ${ev?.away?.form || "?"} | leg: ${l.label} @ ${l.odds} | model chance ${Math.round(l.safe * 100)}%${ev?.note ? ` | ${ev.note}` : ""}`;
  }).join("\n");
  try {
    const { json } = await askJson({ system: REVIEW_SYSTEM, user: `Coupon legs:\n${lines}`, schema: REVIEW_SCHEMA, effort: "low", maxTokens: 4000 });
    return json.reviews || [];
  } catch {
    return null;
  }
}

async function couponOfTheDay() {
  const day = new Date().toISOString().slice(0, 10);
  const hit = daily.get(day);
  if (hit && Date.now() - hit.at < 3 * 3600e3) return hit.value;

  const rows = await pool(30);
  let safe = buildCoupon(rows, { target: 2.5, mode: "safe", minTier: "Med-High", maxLegs: 5 });
  if (safe.legs.length < 2) safe = buildCoupon(rows, { target: 2.2, mode: "safe", minTier: "Medium", maxLegs: 5 });

  // AI sceptic: drop flagged legs, refill from the rest of the pool
  const reviews = await review(safe, rows);
  let dropped = [];
  if (reviews?.length) {
    const drop = new Set(reviews.filter((r) => r.verdict === "drop").map((r) => r.eventId));
    dropped = safe.legs.filter((l) => drop.has(l.eventId)).map((l) => ({ ...l, note: reviews.find((r) => r.eventId === l.eventId)?.note }));
    if (drop.size) {
      safe = buildCoupon(rows.filter((r) => !drop.has(r.ev.id)), { target: 2.5, mode: "safe", minTier: "Medium", maxLegs: 5 });
    }
    const notes = new Map(reviews.map((r) => [r.eventId, r.note]));
    safe.legs = safe.legs.map((l) => ({ ...l, note: notes.get(l.eventId) || "" }));
  }

  const used = new Set(safe.legs.map((l) => l.eventId));
  const bold = buildCoupon(rows.filter((r) => !used.has(r.ev.id)), { target: 8, mode: "balanced", minTier: "Medium", maxLegs: 6, perLeague: 2 });

  const value = { day, safe, bold, dropped, reviewed: !!reviews, pool: rows.length, generated: new Date().toISOString() };
  if (safe.legs.length) daily.set(day, { at: Date.now(), value });
  return value;
}

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  try {
    // custom builder: any target, any profile
    if (sp.get("target")) {
      const target = Math.min(1000, Math.max(1.3, Number(sp.get("target")) || 3));
      const mode = ["safe", "balanced", "value"].includes(sp.get("mode")) ? sp.get("mode") : "balanced";
      const hours = Math.min(96, Math.max(3, Number(sp.get("hours")) || 30));
      const rows = await pool(hours);
      const maxLegs = target > 50 ? 14 : target > 10 ? 10 : 7;
      const c = buildCoupon(rows, { target, mode, maxLegs, minTier: mode === "value" ? "Low" : "Medium", perLeague: 3 });
      return NextResponse.json({ coupon: c, pool: rows.length });
    }
    return NextResponse.json(await couponOfTheDay());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
