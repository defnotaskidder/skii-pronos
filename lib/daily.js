// The day's coupons (coupon du jour + grosse cote du jour): built once, stored, graded live.
import { analysedBoard } from "./board";
import { buildCoupon, buildTarget, product, hitChance } from "./coupon";
import { settle } from "./model";
import { aiEnabled, askJson, REVIEW_SYSTEM, REVIEW_SCHEMA } from "./ai";
import { dailyGet, dailySave, dbEnabled } from "./db";

// Pre-match games kicking off between 10 minutes and `hours` from now.
export function poolOf(rows, hours = 30) {
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
    const { json } = await askJson({ system: REVIEW_SYSTEM + "\nWrite each note in French (max 16 words).", user: `Coupon legs:\n${lines}`, schema: REVIEW_SCHEMA, effort: "low", maxTokens: 4000 });
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
export function withStatus(coupon, rows) {
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

export const dayKey = () => new Date().toISOString().slice(0, 10);

export async function couponsOfTheDay(rows) {
  const day = dayKey();

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

// The day's coupons with live leg status (what the site and the bots show).
export async function dailyWithStatus() {
  const rows = await analysedBoard(2);
  const d = await couponsOfTheDay(rows);
  return { ...d, safe: withStatus(d.safe, rows), grosse: withStatus(d.grosse, rows), db: dbEnabled() };
}

export { buildCoupon, buildTarget };
