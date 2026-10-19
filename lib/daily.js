// The day's coupons (coupon du jour + grosse cote du jour): built once, stored, graded live.
import { analysedBoard } from "./board";
import { buildCoupon, buildDaily, buildTarget, product, hitChance, buildGrosse } from "./coupon";
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
    if (ev.state === "post" && ev.completed) live.result = l.result || settle(l.key, hs, as, { sport: ev.sport, ot: ev.ot });
    return { ...l, live };
  });
  const lost = legs.some((l) => (l.result || l.live?.result) === "L");
  // a coupon with no legs is neither won nor lost ("every leg won" is true of an empty list)
  const won = legs.length > 0 && legs.every((l) => (l.result || l.live?.result) === "W" || (l.result || l.live?.result) === "V");
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

async function restoreFirstCoupon(boardRows = []) {
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
  // 3) a game that kicked off before picks were saved (Panathinaikos, 16:45) comes from the board,
  // and gets a score-only row (no pick) so the coupon can be graded
  const scoreRows = [];
  for (const { id } of FIRST_LEGS) {
    if (tracked.has(id) || byId.has(id)) continue;
    const ev = boardRows.find((r) => r.ev?.id === id)?.ev;
    if (!ev || ev.state !== "post" || ev.home?.score == null || ev.away?.score == null) continue;
    const r = { event_id: id, league: ev.league, sport: ev.sport, kickoff: ev.date, home: ev.home.short || ev.home.name, away: ev.away.short || ev.away.name,
      home_logo: ev.home.logo || null, away_logo: ev.away.logo || null, state: "post", home_score: ev.home.score, away_score: ev.away.score, settled_at: new Date().toISOString() };
    scoreRows.push(r);
    byId.set(id, { ...r, pick_key: null, pick_p: null, pick_safe: null });
  }
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
    if (scoreRows.length) await sql`insert into skii_picks ${sql(scoreRows)} on conflict (event_id) do nothing`;
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

// 19 Oct 2026 only: today's coupons were built by the replaced logic (coin-flip and Skip-rated
// legs, then estimated legs from games with no bookmaker prices). Each one none of whose games
// has started is dropped, so it's rebuilt with the new rules. The flag is claimed in the same
// transaction, so only one instance ever does it.
async function rebuildToday() {
  const DAY = "2026-10-19", FLAG = "fix:rebuild-2026-10-19b";
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
async function oneTimeFixes(boardRows = []) {
  if (fixesDone || !dbEnabled()) return;
  if (!fixesRun && Date.now() >= fixesNext) {
    fixesNext = Date.now() + 10 * 60e3; // a failed attempt is retried at most every 10 minutes
    fixesRun = (async () => {
      const results = await Promise.all([restoreFirstCoupon(boardRows).catch(() => false), rebuildToday().catch(() => false)]);
      fixesDone = results.every(Boolean);
    })().finally(() => { fixesRun = null; });
  }
  if (fixesRun) await fixesRun;
}

// ---------- the day's coupons ----------
// The coupon du jour plus four same-day express builds. Every one is built from real bookmaker
// prices across every sport, keeps the combination with the highest chance of reaching its odds
// (lib/coupon.js buildTarget: each leg must earn its place by chance given up per unit of odds),
// leaves out leagues the model reads badly, and is stored once — the first published version counts.
// No leg the model rates Low or Skip goes in any of them (lib/coupon.js PROFILES): the high
// targets get their odds from more strong legs, so they may take more selections.
export const EXPRESS = [
  { kind: "x12", target: 12.5, profile: "balanced", maxLegs: 7, perLeague: 2, label: "Medium" },
  { kind: "grosse", target: 100, profile: "grosse", maxLegs: 12, perLeague: 3, label: "High odds" },
  { kind: "x200", target: 200, profile: "grosse", maxLegs: 14, perLeague: 3, label: "High odds" },
  { kind: "x400", target: 350, profile: "grosse", maxLegs: 16, perLeague: 3, label: "High odds" },
];
export const KINDS = ["safe", ...EXPRESS.map((b) => b.kind)];
const SAFE_TARGET = 2;

// Coupon du jour: the safest combination worth ~2.00, every leg a strong one (Med-High or High,
// 72 %+). It always publishes: when today's priced games can't make it, the next 30 hours are
// used, then estimated prices — the legs stay strong; only as a last resort do Medium legs come in.
function safestCoupon(dayPool, widePool, opts) {
  const tries = [
    [dayPool, { profile: "safe", onlyPriced: true }],
    [widePool, { profile: "safe", onlyPriced: true }],
    [dayPool, { profile: "safe", onlyPriced: false }],
    [widePool, { profile: "safe", onlyPriced: false }],
    [widePool, { profile: "balanced", onlyPriced: true }],
    [widePool, { profile: "balanced", onlyPriced: false }],
  ];
  let best = null;
  const priced = (c) => c.legs.every((l) => !l.estimated);
  const better = (c, b) => !b || (c.legs.length >= 2) - (b.legs.length >= 2) || priced(c) - priced(b) || c.odds - b.odds;
  for (const [pool, o] of tries) {
    const c = buildTarget(pool, { target: SAFE_TARGET, maxLegs: 4, minLegs: 2, perLeague: 2, ...opts, ...o });
    if (c.legs.length >= 2 && c.reached) return { ...c, mode: "safe", target: SAFE_TARGET };
    if (c.legs.length && better(c, best) > 0) best = c;
  }
  return { ...(best || { legs: [], odds: 1, chance: 1 }), mode: "safe", target: SAFE_TARGET };
}

// An express build: real prices first; if the day's priced games can't reach the odds, estimated
// prices (≈, to take only at or above) close the gap. If even that falls short, the closest build
// is published as it is (the page says so) rather than padded with weak legs.
function expressBuild(dayPool, b, opts) {
  const c = buildTarget(dayPool, { target: b.target, profile: b.profile, maxLegs: b.maxLegs, perLeague: b.perLeague, onlyPriced: true, ...opts });
  if (c.reached || !dayPool.length) return { ...c, kind: b.kind };
  const d = buildTarget(dayPool, { target: b.target, profile: b.profile, maxLegs: b.maxLegs, perLeague: b.perLeague, onlyPriced: false, ...opts });
  return { ...(d.reached || d.odds > c.odds ? d : c), kind: b.kind };
}

async function build(day, rows, stored) {
  // the day's own games for the express builds; the coupon du jour may reach into the next 30 h
  // only games the database follows: syncBoard saves a skii_picks row (which carries the final score
  // dailySettle grades on) for every analysed game with a pick — a leg without one could never settle
  const widePool = poolOf(rows, 30).filter((r) => r.analysis?.pick);
  const dayPool = widePool.filter((r) => String(r.ev.date).slice(0, 10) === day);
  const { adjust, skill, weak } = await learning();
  // one direction per game: every coupon of the day that uses a game uses the same market for it
  const lock = new Map();
  const hold = (c) => { for (const l of c?.legs || []) if (!lock.has(l.eventId)) lock.set(l.eventId, l.key); };
  const clash = (c) => (c?.legs || []).some((l) => lock.has(l.eventId) && lock.get(l.eventId) !== l.key);
  for (const k of KINDS) hold(stored?.[k]);
  const opts = { adjust, skill, skipLeagues: weak, lock };
  const buildSafe = (ex) => safestCoupon(dayPool, widePool, { ...opts, exclude: ex });
  const byKind = Object.fromEntries(EXPRESS.map((b) => [b.kind, b]));
  const buildX = (kind, extra = []) => (ex) => expressBuild(dayPool, byKind[kind], { ...opts, exclude: [...extra, ...ex] });

  // the AI sceptic checks the coupon du jour and the grosse cote (x100), in parallel; the grosse
  // is first built around the coupon du jour's games (same markets)
  const safe0 = stored?.safe ? null : buildSafe([]);
  const lock0 = new Map(lock);
  hold(safe0);
  const grosse0 = stored?.grosse ? null : buildX("grosse")([]);
  lock.clear(); for (const [k, v] of lock0) lock.set(k, v);
  const [rs, rg] = await Promise.all([safe0 ? review(safe0, rows) : null, grosse0 ? review(grosse0, rows) : null]);
  const safeRun = stored?.safe ? { coupon: stored.safe, dropped: [], reviewed: !!stored.safe.legs?.some((l) => l.note) } : applyReview(buildSafe, safe0, rs);
  const dropped = [...safeRun.dropped.map((l) => l.eventId)];
  hold(safeRun.coupon);
  // a game the AI dropped stays out of every other build too; the grosse is rebuilt if it backs
  // another market of a game the final coupon du jour uses
  const grosseRun = stored?.grosse ? { coupon: stored.grosse, dropped: [] }
    : applyReview(buildX("grosse", dropped), grosse0, rg, grosse0.legs.some((l) => dropped.includes(l.eventId)) || clash(grosse0));
  dropped.push(...grosseRun.dropped.map((l) => l.eventId));
  let safeCoupon = safeRun.coupon;
  if (!stored?.safe && safeCoupon.legs.some((l) => dropped.includes(l.eventId))) {
    const notes = new Map(safeCoupon.legs.map((l) => [l.eventId, l.note]));
    lock.clear(); for (const [k, v] of lock0) lock.set(k, v);
    hold(grosseRun.coupon);
    safeCoupon = buildSafe(dropped);
    safeCoupon.legs = safeCoupon.legs.map((l) => ({ ...l, note: notes.get(l.eventId) || "" }));
  }
  hold(safeCoupon); hold(grosseRun.coupon);
  const out = { safe: safeCoupon, grosse: grosseRun.coupon };
  for (const b of EXPRESS) {
    if (b.kind === "grosse") continue;
    out[b.kind] = stored?.[b.kind] || buildX(b.kind, dropped)([]);
    hold(out[b.kind]);
  }

  if (dbEnabled()) {
    for (const k of KINDS) if (!stored?.[k] && out[k]?.legs?.length) await dailySave(day, k, out[k]);
    const again = await dailyGet(day); // another server may have saved first — use what's stored
    if (again && KINDS.some((k) => again[k])) {
      const merged = Object.fromEntries(KINDS.map((k) => [k, again[k] || out[k] || null]));
      const mine = merged.safe?.legs?.map((l) => l.eventId).join() === safeCoupon.legs.map((l) => l.eventId).join();
      return { day, ...merged, dropped: mine ? safeRun.dropped : [], reviewed: !!merged.safe?.legs?.some((l) => l.note), pool: dayPool.length, stored: KINDS.every((k) => again[k]) };
    }
  }
  return { day, ...out, dropped: safeRun.dropped, reviewed: safeRun.reviewed || !!rs, pool: dayPool.length, generated: new Date().toISOString() };
}

// A coupon is still running while any of its games hasn't finished (a game missing from the board
// counts until 4 hours after kick-off, so a postponed one can't hold the next coupon back forever).
function stillRunning(coupon, rows) {
  const byId = new Map(rows.map((r) => [r.ev.id, r.ev]));
  return (coupon.legs || []).some((l) => {
    const ev = byId.get(l.eventId);
    if (ev) return ev.state !== "post" && !ev.postponed && Date.now() - new Date(ev.date).getTime() < 6 * 3600e3;
    return Date.now() - new Date(l.date).getTime() < 4 * 3600e3;
  });
}

export async function couponsOfTheDay(rows) {
  await oneTimeFixes(rows);
  const day = dayKey();

  // the first coupons published today are the ones that count (and stay put all day)
  const stored = dbEnabled() ? await dailyGet(day) : null;
  if (stored && KINDS.every((k) => stored[k])) {
    return { day, ...Object.fromEntries(KINDS.map((k) => [k, stored[k]])), reviewed: !!stored.safe.legs?.some((l) => l.note), stored: true };
  }
  // a new day's coupons wait until the current coupon du jour has finished
  if (!stored?.safe && dbEnabled()) {
    const prevDay = new Date(Date.parse(day) - 864e5).toISOString().slice(0, 10);
    const prev = await dailyGet(prevDay);
    // only for legs of the night (kick-off before 08:00 UTC today): a coupon du jour that had to
    // borrow a game from today mustn't hold today's coupons back until that game ends
    const lastKick = Math.max(...(prev?.safe?.legs || []).map((l) => new Date(l.date).getTime()), 0);
    if (prev?.safe && !prev.safe.result && lastKick < Date.parse(day) + 8 * 3600e3 && stillRunning(prev.safe, rows)) {
      return { day: prevDay, ...Object.fromEntries(KINDS.map((k) => [k, prev[k] || null])), reviewed: !!prev.safe.legs?.some((l) => l.note), stored: true, carried: true };
    }
  }
  const mem = memory.get(day);
  if (mem && Date.now() - mem.at < (mem.value.safe?.legs?.length ? 3 * 3600e3 : 20 * 60e3)) return mem.value;

  if (!building.has(day)) building.set(day, build(day, rows, stored).finally(() => building.delete(day)));
  const value = await building.get(day);
  if (!value.stored) memory.set(day, { at: Date.now(), value });
  return value;
}

// Every coupon of the day with live leg status (what the site and the bots show).
const TARGET_OF = { safe: SAFE_TARGET, ...Object.fromEntries(EXPRESS.map((b) => [b.kind, b.target])) };
export function allWithStatus(d, rows) {
  const one = (k) => {
    if (!d[k]) return null;
    const c = withStatus(d[k], rows), target = TARGET_OF[k];
    return { ...c, target, reached: c.legs?.length ? c.odds >= target * 0.93 : false };
  };
  return { ...d, ...Object.fromEntries(KINDS.map((k) => [k, one(k)])), db: dbEnabled() };
}
export async function dailyWithStatus() {
  const rows = await analysedBoard(2);
  return allWithStatus(await couponsOfTheDay(rows), rows);
}

export { buildCoupon, buildDaily, buildTarget, buildGrosse };
