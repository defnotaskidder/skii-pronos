import { NextResponse } from "next/server";
import { analysedBoard } from "../../../lib/board";
import { buildCoupon, buildTarget, product, hitChance } from "../../../lib/coupon";
import { settle } from "../../../lib/model";
import { aiEnabled, askJson, REVIEW_SYSTEM, REVIEW_SCHEMA } from "../../../lib/ai";
import { dailyGet, dailySave, dbEnabled } from "../../../lib/db";

export const maxDuration = 60;

// Pre-match games kicking off between 10 minutes and `hours` from now.
function poolOf(rows, hours = 30) {
  const now = Date.now();
  return rows.filter(({ ev, analysis }) => {
    const t = new Date(ev.date).getTime();
    return ev.state === "pre" && !ev.postponed && analysis && t > now + 10 * 60e3 && t < now + hours * 3600e3;
  });
}

// Without a database the day's coupons stay stable per server instance for a few hours.
const memory = new Map();

async function review(coupon, rows) {
  if (!aiEnabled() || process.env.COUPON_AI === "false" || !coupon.legs.length) return null;
  const byId = new Map(rows.map((r) => [r.ev.id, r]));
  const lines = coupon.legs.map((l) => {
    const ev = byId.get(l.eventId)?.ev;
    return `eventId=${l.eventId} | ${new Date(l.date).toISOString().slice(0, 16)}Z | ${l.league} | ${l.home} vs ${l.away} | form ${ev?.home?.form || "?"} vs ${ev?.away?.form || "?"} | leg: ${l.label} @ ${l.odds} | model chance ${Math.round((l.safe ?? l.p) * 100)}%${ev?.note ? ` | ${ev.note}` : ""}`;
  }).join("\n");
  try {
    const { json } = await askJson({ system: REVIEW_SYSTEM, user: `Coupon legs:\n${lines}`, schema: REVIEW_SCHEMA, effort: "low", maxTokens: 4000 });
    return json.reviews || [];
  } catch {
    return null;
  }
}

// Build a coupon, let the AI sceptic drop risky legs, rebuild without them.
async function reviewed(build, rows, exclude = []) {
  let c = build(exclude);
  const reviews = await review(c, rows);
  if (!reviews?.length) return { coupon: c, dropped: [], reviewed: false };
  const drop = reviews.filter((r) => r.verdict === "drop").map((r) => r.eventId);
  const dropped = c.legs.filter((l) => drop.includes(l.eventId)).map((l) => ({ ...l, note: reviews.find((r) => r.eventId === l.eventId)?.note }));
  if (drop.length) c = build([...exclude, ...drop]);
  const notes = new Map(reviews.map((r) => [r.eventId, r.note]));
  c.legs = c.legs.map((l) => ({ ...l, note: notes.get(l.eventId) || "" }));
  return { coupon: c, dropped, reviewed: true };
}

// Attach each leg's live state / final result so the coupon can be followed during the day.
function withStatus(coupon, rows) {
  if (!coupon?.legs) return coupon;
  const byId = new Map(rows.map((r) => [r.ev.id, r.ev]));
  const legs = coupon.legs.map((l) => {
    const ev = byId.get(l.eventId);
    if (!ev) return l;
    const hs = ev.home?.score, as = ev.away?.score;
    const live = { state: ev.state, minute: ev.minute, detail: ev.detail, score: ev.state === "pre" ? null : `${hs ?? 0}-${as ?? 0}` };
    if (ev.state === "post" && ev.completed) live.result = l.result || settle(l.key, hs, as);
    return { ...l, live };
  });
  const lost = legs.some((l) => (l.result || l.live?.result) === "L");
  const won = legs.every((l) => (l.result || l.live?.result) === "W" || (l.result || l.live?.result) === "V");
  return { ...coupon, legs, odds: coupon.odds ?? Math.round(product(legs) * 100) / 100, chance: coupon.chance ?? hitChance(legs), status: lost ? "lost" : won ? "won" : "open" };
}

async function couponsOfTheDay(rows) {
  const day = new Date().toISOString().slice(0, 10);

  // the first coupons published today are the ones that count (and stay put all day)
  const stored = dbEnabled() ? await dailyGet(day) : null;
  if (stored?.safe && stored?.grosse) {
    return { day, safe: stored.safe, grosse: stored.grosse, reviewed: !!stored.safe.legs?.some((l) => l.note), stored: true };
  }
  const mem = memory.get(day);
  if (mem && Date.now() - mem.at < 3 * 3600e3) return mem.value;

  const pool = poolOf(rows, 30);
  const safeRun = await reviewed((ex) => buildTarget(pool, { target: 2.5, profile: "safe", maxLegs: 5, perLeague: 2, exclude: ex }), rows);
  const used = safeRun.coupon.legs.map((l) => l.eventId);
  const grosseRun = await reviewed((ex) => buildTarget(pool, { target: 30, profile: "grosse", maxLegs: 8, perLeague: 2, exclude: [...used, ...ex] }), rows);

  if (dbEnabled()) {
    await dailySave(day, "safe", safeRun.coupon);
    await dailySave(day, "grosse", grosseRun.coupon);
    const again = await dailyGet(day); // another server may have saved first — use what's stored
    if (again?.safe && again?.grosse) return { day, safe: again.safe, grosse: again.grosse, dropped: safeRun.dropped, reviewed: safeRun.reviewed, pool: pool.length, stored: true };
  }
  const value = { day, safe: safeRun.coupon, grosse: grosseRun.coupon, dropped: safeRun.dropped, reviewed: safeRun.reviewed, pool: pool.length, generated: new Date().toISOString() };
  if (value.safe.legs.length) memory.set(day, { at: Date.now(), value });
  return value;
}

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  try {
    const rows = await analysedBoard(2);
    // generator: any target, any profile; `exclude` gives a different combination each time
    if (sp.get("target")) {
      const target = Math.min(5000, Math.max(1.3, Number(sp.get("target")) || 3));
      const mode = ["safe", "balanced", "grosse", "value"].includes(sp.get("mode")) ? sp.get("mode") : "balanced";
      const hours = Math.min(96, Math.max(3, Number(sp.get("hours")) || 30));
      const exclude = (sp.get("exclude") || "").split(",").filter(Boolean).slice(0, 200);
      const maxLegs = Math.min(20, Math.max(2, Number(sp.get("maxLegs")) || (target > 200 ? 14 : target > 50 ? 11 : target > 10 ? 8 : 6)));
      const pool = poolOf(rows, hours);
      const c = mode === "value"
        ? buildCoupon(pool.filter((r) => !exclude.includes(r.ev.id)), { target, mode, maxLegs, minTier: "Low", perLeague: 3 })
        : buildTarget(pool, { target, profile: mode, maxLegs, perLeague: 3, exclude });
      return NextResponse.json({ coupon: c, pool: pool.length });
    }
    const d = await couponsOfTheDay(rows);
    return NextResponse.json({ ...d, safe: withStatus(d.safe, rows), grosse: withStatus(d.grosse, rows), db: dbEnabled() });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
