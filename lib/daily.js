// The day's coupons (coupon du jour + grosse cote du jour): built once, stored, graded live.
import { analysedBoard } from "./board";
import { buildCoupon, buildDaily, buildTarget, product, hitChance } from "./coupon";
import { settle } from "./model";
import { aiEnabled, askJson, REVIEW_SYSTEM, REVIEW_SCHEMA } from "./ai";
import { configGet, configSet, dailyGet, dailySave, dailySettle, dbEnabled, usersData, withDb } from "./db";
import { calibrator } from "./calibration";
import { adjustP, leagueSkill } from "./leagueform";
import { LEAGUE_BY_ID } from "./leagues";

// Pre-match games kicking off between 10 minutes and `hours` from now.
export function poolOf(rows, hours = 30) {
  const now = Date.now();
  return rows.filter(({ ev, analysis }) => {
    const t = new Date(ev.date).getTime();
    return ev.state === "pre" && !ev.postponed && analysis && t > now + 10 * 60e3 && t < now + hours * 3600e3;
  });
}

// What the engine has learned so far: class calibration (priced vs estimated picks), then the
// league's own offset. `adjust(p, estimated, league)` is what the coupon builders rank with.
export async function learning() {
  const [cal, skill] = await Promise.all([calibrator().catch(() => null), leagueSkill(120).catch(() => null)]);
  const adjust = (p, est, league) => (p === null || p === undefined ? p : adjustP(cal ? cal(p, !!est) : p, league, skill));
  const weak = Object.entries(skill?.leagues || {}).filter(([, l]) => l.status === "weak").map(([id]) => id);
  return { adjust, skill, weak };
}

// Without a database the day's coupons stay stable per server instance for a few hours.
const memory = new Map();
const building = new Map(); // day → in-flight build, so parallel requests share one AI review

function within(ms, p) {
  let timer;
  return Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${ms} ms`)), ms); })]).finally(() => clearTimeout(timer));
}

// AI sceptic with live team news (web search). Never blocks publishing: any failure → null.
async function review(coupon, rows) {
  if (!aiEnabled() || process.env.COUPON_AI === "false" || !coupon?.legs?.length) return null;
  try {
    const byId = new Map(rows.map((r) => [r.ev.id, r]));
    const lines = coupon.legs.map((l) => {
      const ev = byId.get(l.eventId)?.ev;
      return `eventId=${l.eventId} | ${new Date(l.date).toISOString().slice(0, 16)}Z | ${LEAGUE_BY_ID[l.league]?.name || l.league} | ${l.home} vs ${l.away} | form ${ev?.home?.form || "?"} vs ${ev?.away?.form || "?"} | leg: ${l.label} @ ${l.odds} | model chance ${Math.round((l.safe ?? l.p) * 100)}%${ev?.note ? ` | ${ev.note}` : ""}`;
    }).join("\n");
    const { json } = await within(55e3, askJson({
      system: REVIEW_SYSTEM, user: `Today is ${new Date().toISOString().slice(0, 10)}. Coupon legs:\n${lines}`, schema: REVIEW_SCHEMA,
      web: true, effort: "medium", maxTokens: 16000, timeoutMs: 50e3,
    }));
    const reviews = (Array.isArray(json?.reviews) ? json.reviews : []).map((r) => ({ ...r, eventId: String(r.eventId) }));
    if (!reviews.length) console.warn("[review] empty reply, publishing unreviewed");
    return reviews;
  } catch (e) {
    console.warn(`[review] ${e.message} — publishing unreviewed`);
    return null;
  }
}

// Apply the AI verdicts to the reviewed coupon `first`: drop flagged legs, rebuild without them,
// attach the notes. `rebuild` forces a fresh build (e.g. the safe coupon took one of its games).
function applyReview(build, first, reviews, rebuild = false) {
  if (!reviews?.length) return { coupon: rebuild ? build([]) : first, dropped: [], reviewed: false };
  const notes = new Map(reviews.map((r) => [r.eventId, r.note]));
  const drop = reviews.filter((r) => r.verdict === "drop").map((r) => r.eventId);
  const dropped = first.legs.filter((l) => drop.includes(l.eventId)).map((l) => ({ ...l, note: notes.get(l.eventId) }));
  const c = !rebuild && !drop.length ? first : build(drop);
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

// ---------- one-time corrections (flag-guarded, idempotent, safe on several instances) ----------

// The first coupon du jour of 15 Oct 2026, as published that morning by the original logic.
// It was never stored (storage arrived later that day and rebuilt it), so the record was wrong.
const FIRST_DAY = "2026-10-15";
const FIRST_AT = "2026-10-15T05:20:00Z";
const FIRST_LEGS = [
  { id: "401915856", team: "Panathinaikos", odds: 1.24 },
  { id: "401915571", team: "Bournemouth", odds: 1.2 },
  { id: "401915851", team: "Twente", odds: 1.21 },
  { id: "401915562", team: "Benfica", odds: 1.22 },
  { id: "401892516", team: "Golden Knights", odds: 1.33 },
];
const LEG_FIELDS = ["eventId", "league", "sport", "date", "home", "away", "homeLogo", "awayLogo", "key", "label", "group", "odds", "p", "safe", "ev", "tier", "estimated", "book", "quality"];
const pickFields = (l) => Object.fromEntries(LEG_FIELDS.filter((k) => l[k] !== undefined).map((k) => [k, l[k]]));

async function restoreFirstCoupon() {
  const FLAG = "fix:restore-2026-10-15";
  if (await configGet(FLAG)) return true;
  const ids = FIRST_LEGS.map((x) => x.id);
  // 1) a tracked copy of it in someone's synced history (exactly what was shown on the site)
  const tracked = new Map();
  const users = await usersData("track");
  const entries = [...users.values()].flatMap((v) => (Array.isArray(v) ? v : []))
    .filter((e) => Array.isArray(e?.legs) && ["401915571", "401892516"].every((id) => e.legs.some((l) => String(l?.eventId) === id)));
  const hits = (e) => ids.filter((id) => e.legs.some((l) => String(l?.eventId) === id)).length;
  entries.sort((a, b) => (hits(b) - hits(a)) || String(a.at || "").localeCompare(String(b.at || ""))); // fullest, earliest copy first
  const teamOf = new Map(FIRST_LEGS.map((x) => [x.id, x.team.toLowerCase()]));
  for (const e of entries) {
    for (const l of e.legs) {
      const id = String(l?.eventId);
      const label = String(l?.label || "").toLowerCase();
      // only the published market: "<team> win"
      if (teamOf.has(id) && !tracked.has(id) && label.endsWith(" win") && label.includes(teamOf.get(id))) tracked.set(id, { ...pickFields(l), eventId: id });
    }
  }
  // 2) otherwise rebuild the leg from the saved pick row
  const rows = await withDb("fix:restore", (sql) => sql`
    select event_id, league, sport, kickoff, home, away, home_logo, away_logo, pick_key, pick_p::float, pick_safe::float
    from skii_picks where event_id in ${sql(ids)}`, []);
  const byId = new Map((rows || []).map((r) => [r.event_id, r]));
  const legs = FIRST_LEGS.map(({ id, team, odds }) => {
    if (tracked.has(id)) return tracked.get(id);
    const r = byId.get(id);
    if (!r) return null;
    const has = (name) => String(name || "").toLowerCase().includes(team.toLowerCase());
    const key = !has(r.home) && has(r.away) ? "2" : "1";
    const own = r.pick_key === key;
    return {
      eventId: id, league: r.league, sport: r.sport, date: new Date(r.kickoff).toISOString(),
      home: r.home, away: r.away, homeLogo: r.home_logo || null, awayLogo: r.away_logo || null,
      key, label: `${key === "1" ? r.home : r.away} win`, group: r.sport === "soccer" ? "1X2" : "Winner",
      odds, p: own ? r.pick_p : null, safe: own ? r.pick_safe : null, tier: "Med-High", estimated: false,
    };
  }).filter(Boolean);
  if (legs.length < FIRST_LEGS.length) return false; // try again later
  legs.sort((a, b) => new Date(a.date) - new Date(b.date));
  const odds = Math.round(product(legs) * 100) / 100;
  const chance = legs.every((l) => typeof l.safe === "number") ? Math.round(hitChance(legs) * 1000) / 1000 : null;
  const ok = await withDb("fix:restore", async (sql) => {
    await sql`
      insert into skii_daily (day, kind, legs, odds, chance, created_at) values (${FIRST_DAY}, 'safe', ${sql.json(legs)}, ${odds}, ${chance}, ${new Date(FIRST_AT)})
      on conflict (day, kind) do update set legs = excluded.legs, odds = excluded.odds, chance = excluded.chance,
        created_at = excluded.created_at, result = null, settled_at = null`;
    return true;
  }, false);
  if (!ok) return false;
  await dailySettle(); // grade it from the saved scores
  await configSet(FLAG, { at: new Date().toISOString(), legs: legs.length, odds, source: tracked.size ? "tracked" : "picks" });
  console.warn(`[daily] restored the first coupon of ${FIRST_DAY} (${legs.length} legs @ ${odds})`);
  return true;
}

// 16 Oct 2026 only: today's coupons were built by the replaced logic. If none of their games has
// started, drop them so they're rebuilt with the new one. The flag is claimed in the same
// transaction, so only one instance ever does it.
async function rebuildToday() {
  const DAY = "2026-10-16", FLAG = "fix:rebuild-2026-10-16";
  if (dayKey() !== DAY) return true;
  if (await configGet(FLAG)) return true;
  return withDb("fix:rebuild", (sql) => sql.begin(async (tx) => {
    const claim = await tx`insert into skii_config (key, value, updated_at) values (${FLAG}, ${sql.json({ at: new Date().toISOString() })}, now())
      on conflict (key) do nothing returning key`;
    if (!claim.length) return true; // another instance did it
    const soon = Date.now() + 10 * 60e3;
    const stored = await tx`select kind, legs from skii_daily where day = ${DAY} for update`;
    const removed = [];
    for (const c of stored) {
      if ((c.legs || []).some((l) => new Date(l.date).getTime() < soon)) continue;
      await tx`delete from skii_daily where day = ${DAY} and kind = ${c.kind}`;
      removed.push(c.kind);
    }
    await tx`update skii_config set value = ${sql.json({ at: new Date().toISOString(), removed })} where key = ${FLAG}`;
    if (removed.length) console.warn(`[daily] rebuilding ${DAY}: ${removed.join(", ")}`);
    return true;
  }), false);
}

let fixesDone = false, fixesNext = 0, fixesRun = null;
async function oneTimeFixes() {
  if (fixesDone || !dbEnabled()) return;
  if (!fixesRun && Date.now() >= fixesNext) {
    fixesNext = Date.now() + 10 * 60e3; // a failed attempt is retried at most every 10 minutes
    fixesRun = (async () => {
      const results = await Promise.all([restoreFirstCoupon().catch(() => false), rebuildToday().catch(() => false)]);
      fixesDone = results.every(Boolean);
    })().finally(() => { fixesRun = null; });
  }
  if (fixesRun) await fixesRun;
}

// ---------- the day's coupons ----------

async function build(day, rows, stored) {
  const pool = poolOf(rows, 30);
  const { adjust, skill, weak } = await learning();
  // coupon du jour: strongest legs first; if fewer than 2 qualify, the original softer fallback
  const buildSafe = (ex) => {
    const c = buildDaily(pool, { adjust, skill, exclude: ex });
    return c.legs.length >= 2 ? c : buildDaily(pool, { adjust, skill, exclude: ex, target: 2.2, minTier: "Medium" });
  };
  const buildGrosse = (used) => (ex) => buildTarget(pool, {
    target: 30, profile: "grosse", maxLegs: 8, perLeague: 2, exclude: [...used, ...ex],
    onlyPriced: true, sports: ["soccer"], adjust, skipLeagues: weak, skill,
  });

  // both reviews run in parallel so the slower one bounds the wait, not their sum
  const safe0 = stored?.safe ? null : buildSafe([]);
  const used0 = (stored?.safe || safe0).legs.map((l) => l.eventId);
  const grosse0 = stored?.grosse ? null : buildGrosse(used0)([]);
  const [rs, rg] = await Promise.all([safe0 ? review(safe0, rows) : null, grosse0 ? review(grosse0, rows) : null]);

  const safeRun = stored?.safe
    ? { coupon: stored.safe, dropped: [], reviewed: !!stored.safe.legs?.some((l) => l.note) }
    : applyReview(buildSafe, safe0, rs);
  let grosseRun = { coupon: stored?.grosse, dropped: [], reviewed: false };
  if (!stored?.grosse) {
    const used = safeRun.coupon.legs.map((l) => l.eventId);
    const clash = grosse0.legs.some((l) => used.includes(l.eventId)); // the safe rebuild took one of its games
    // a game the AI dropped from the safe coupon stays out of the grosse cote too
    grosseRun = applyReview(buildGrosse([...used, ...safeRun.dropped.map((l) => l.eventId)]), grosse0, rg, clash);
  }

  if (dbEnabled()) {
    if (!stored?.safe) await dailySave(day, "safe", safeRun.coupon);
    if (!stored?.grosse) await dailySave(day, "grosse", grosseRun.coupon);
    const again = await dailyGet(day); // another server may have saved first — use what's stored
    if (again?.safe || again?.grosse) {
      const safe = again.safe || safeRun.coupon;
      const mine = safe.legs.map((l) => l.eventId).join() === safeRun.coupon.legs.map((l) => l.eventId).join();
      return { day, safe, grosse: again.grosse || grosseRun.coupon, dropped: mine ? safeRun.dropped : [], reviewed: !!safe.legs?.some((l) => l.note), pool: pool.length, stored: !!(again.safe && again.grosse) };
    }
  }
  return { day, safe: safeRun.coupon, grosse: grosseRun.coupon, dropped: safeRun.dropped, reviewed: safeRun.reviewed, pool: pool.length, generated: new Date().toISOString() };
}

export async function couponsOfTheDay(rows) {
  await oneTimeFixes();
  const day = dayKey();

  // the first coupons published today are the ones that count (and stay put all day)
  const stored = dbEnabled() ? await dailyGet(day) : null;
  if (stored?.safe && stored?.grosse) {
    return { day, safe: stored.safe, grosse: stored.grosse, reviewed: !!stored.safe.legs?.some((l) => l.note), stored: true };
  }
  const mem = memory.get(day);
  if (mem && Date.now() - mem.at < (mem.value.safe?.legs?.length ? 3 * 3600e3 : 20 * 60e3)) return mem.value;

  if (!building.has(day)) building.set(day, build(day, rows, stored).finally(() => building.delete(day)));
  const value = await building.get(day);
  if (!value.stored) memory.set(day, { at: Date.now(), value });
  return value;
}

// The day's coupons with live leg status (what the site and the bots show).
export async function dailyWithStatus() {
  const rows = await analysedBoard(2);
  const d = await couponsOfTheDay(rows);
  return { ...d, safe: withStatus(d.safe, rows), grosse: withStatus(d.grosse, rows), db: dbEnabled() };
}

export { buildCoupon, buildDaily, buildTarget };
