// Postgres (Supabase) persistence: the engine's pick on every game, saved before kick-off and
// graded at full time, plus the daily coupons. Optional — with no database configured every
// function quietly does nothing and the site runs as before.
import postgres from "postgres";
import { settle } from "./model";

let client;
let schemaReady;

// Vercel's Supabase integration names the variable with an optional prefix (POSTGRES_URL,
// STORAGE_POSTGRES_URL…). Prefer the pooled URL; strip query params postgres.js doesn't know.
function connectionUrl() {
  const env = Object.entries(process.env);
  const pick = (re) => env.find(([k, v]) => v && re.test(k))?.[1];
  const raw = pick(/(^|_)POSTGRES_URL$/) || pick(/(^|_)POSTGRES_URL_NON_POOLING$/) || pick(/(^|_)DATABASE_URL$/);
  if (!raw) return null;
  try { const u = new URL(raw); u.search = ""; return u.toString(); } catch { return null; }
}

export function db() {
  if (client !== undefined) return client;
  const url = connectionUrl();
  const local = url && /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  client = url ? postgres(url, { ssl: local ? false : "require", prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 }) : null;
  return client;
}
export const dbEnabled = () => !!db();

const SCHEMA = [
  `create table if not exists skii_picks (
    event_id text primary key,
    league text not null,
    sport text,
    kickoff timestamptz not null,
    home text, away text, home_logo text, away_logo text,
    pick_key text, pick_label text, pick_odds numeric, pick_p numeric, pick_safe numeric, pick_tier text, pick_est boolean,
    value_key text, value_label text, value_odds numeric, value_p numeric, value_ev numeric,
    probs jsonb,
    state text not null default 'pre',
    home_score int, away_score int,
    pick_result text, value_result text,
    updated_at timestamptz not null default now(),
    settled_at timestamptz
  )`,
  `create index if not exists skii_picks_kickoff on skii_picks (kickoff desc)`,
  `create index if not exists skii_picks_open on skii_picks (state) where settled_at is null`,
  `create table if not exists skii_daily (
    day date not null,
    kind text not null,
    legs jsonb not null,
    odds numeric, chance numeric,
    result text,
    created_at timestamptz not null default now(),
    settled_at timestamptz,
    primary key (day, kind)
  )`,
];

async function ready() {
  const sql = db();
  if (!sql) return null;
  if (!schemaReady) {
    schemaReady = (async () => { for (const q of SCHEMA) await sql.unsafe(q); })().catch((e) => { schemaReady = null; throw e; });
  }
  await schemaReady;
  return sql;
}

// Never let the database slow a page down or break it.
async function safely(label, fn, fallback = null, ms = 6000) {
  try {
    const sql = await ready();
    if (!sql) return fallback;
    return await Promise.race([fn(sql), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  } catch (e) {
    console.warn(`[db] ${label}: ${e.message}`);
    return fallback;
  }
}

const seen = globalThis.__skiiPickSig || (globalThis.__skiiPickSig = new Map()); // event → last saved signature

// Called with the analysed board on every refresh: save changed pre-match picks, lock games that
// kicked off, grade games that finished.
export async function syncBoard(rows) {
  if (!dbEnabled()) return;
  const pre = [], live = [], done = [];
  for (const { ev, analysis: a } of rows) {
    if (ev.postponed) continue;
    if (ev.state === "pre" && a?.pick) {
      const r = {
        event_id: ev.id, league: ev.league, sport: ev.sport, kickoff: ev.date,
        home: ev.home?.short || ev.home?.name, away: ev.away?.short || ev.away?.name,
        home_logo: ev.home?.logo || null, away_logo: ev.away?.logo || null,
        pick_key: a.pick.key, pick_label: a.pick.label, pick_odds: a.pick.odds, pick_p: a.pick.p, pick_safe: a.pick.safe ?? a.pick.p,
        pick_tier: a.pick.tier, pick_est: !!a.pick.estimated,
        value_key: a.value?.key || null, value_label: a.value?.label || null, value_odds: a.value?.odds ?? null, value_p: a.value?.p ?? null, value_ev: a.value?.ev ?? null,
        probs: a.probs || null,
      };
      const sig = `${r.pick_key}|${r.pick_odds}|${r.value_key}|${r.value_odds}|${r.kickoff}`;
      if (seen.get(ev.id) !== sig) { pre.push(r); seen.set(ev.id, sig); }
    } else if (ev.state === "in") live.push(ev.id);
    else if (ev.state === "post" && ev.completed) done.push(ev);
  }
  await safely("syncBoard", async (sql) => {
    if (pre.length) {
      for (let i = 0; i < pre.length; i += 400) {
        const chunk = pre.slice(i, i + 400).map((r) => ({ ...r, probs: r.probs ? sql.json(r.probs) : null })); // objects need sql.json
        await sql`
          insert into skii_picks ${sql(chunk)}
          on conflict (event_id) do update set
            league = excluded.league, kickoff = excluded.kickoff, home = excluded.home, away = excluded.away,
            home_logo = excluded.home_logo, away_logo = excluded.away_logo,
            pick_key = excluded.pick_key, pick_label = excluded.pick_label, pick_odds = excluded.pick_odds, pick_p = excluded.pick_p,
            pick_safe = excluded.pick_safe, pick_tier = excluded.pick_tier, pick_est = excluded.pick_est,
            value_key = excluded.value_key, value_label = excluded.value_label, value_odds = excluded.value_odds,
            value_p = excluded.value_p, value_ev = excluded.value_ev, probs = excluded.probs, updated_at = now()
          where skii_picks.state = 'pre'`;
      }
    }
    if (live.length) await sql`update skii_picks set state = 'in' where state = 'pre' and event_id in ${sql(live)}`;
    if (done.length) await gradeFinished(sql, done);
  });
}

async function gradeFinished(sql, events) {
  const open = await sql`select event_id, pick_key, value_key from skii_picks where settled_at is null and event_id in ${sql(events.map((e) => e.id))}`;
  if (!open.length) return;
  const byId = new Map(events.map((e) => [e.id, e]));
  for (const r of open) {
    const e = byId.get(r.event_id);
    const hs = e.home?.score, as = e.away?.score;
    if (hs === null || hs === undefined || as === null || as === undefined) continue;
    await sql`
      update skii_picks set state = 'post', home_score = ${hs}, away_score = ${as},
        pick_result = ${r.pick_key ? settle(r.pick_key, hs, as) : null},
        value_result = ${r.value_key ? settle(r.value_key, hs, as) : null},
        settled_at = now()
      where event_id = ${r.event_id}`;
  }
}

// Finished games with the engine's pick and how it did, newest first.
export async function results({ days = 7, limit = 1500 } = {}) {
  return safely("results", (sql) => sql`
    select event_id, league, sport, kickoff, home, away, home_logo, away_logo,
      pick_key, pick_label, pick_odds::float, pick_p::float, pick_safe::float, pick_tier, pick_est,
      value_key, value_label, value_odds::float, value_p::float, value_ev::float,
      home_score, away_score, pick_result, value_result
    from skii_picks
    where state = 'post' and settled_at is not null and kickoff > now() - make_interval(days => ${days})
    order by kickoff desc limit ${limit}`, null);
}

// Saved picks for a set of games (to show the pre-match pick on finished rows).
export async function picksFor(ids) {
  if (!ids.length) return new Map();
  const rows = await safely("picksFor", (sql) => sql`
    select event_id, pick_key, pick_label, pick_odds::float, pick_safe::float, pick_tier, pick_est, pick_result
    from skii_picks where event_id in ${sql(ids)}`, []);
  return new Map(rows.map((r) => [r.event_id, r]));
}

// ---- daily coupons: the first one published each day is the one that counts ----
export async function dailyGet(day) {
  const rows = await safely("dailyGet", (sql) => sql`select kind, legs, odds::float, chance::float, result, created_at from skii_daily where day = ${day}`, null);
  if (!rows) return null;
  return Object.fromEntries(rows.map((r) => [r.kind, r]));
}

export async function dailySave(day, kind, coupon) {
  if (!coupon?.legs?.length) return;
  await safely("dailySave", (sql) => sql`
    insert into skii_daily (day, kind, legs, odds, chance) values (${day}, ${kind}, ${sql.json(coupon.legs)}, ${coupon.odds}, ${coupon.chance})
    on conflict (day, kind) do nothing`);
}

// Grade daily coupons whose games are all finished (scores come from skii_picks).
export async function dailySettle() {
  return safely("dailySettle", async (sql) => {
    const open = await sql`select day, kind, legs from skii_daily where result is null and day > now() - interval '30 days'`;
    for (const c of open) {
      const ids = c.legs.map((l) => l.eventId);
      const games = await sql`select event_id, state, home_score, away_score from skii_picks where event_id in ${sql(ids)}`;
      const g = new Map(games.map((x) => [x.event_id, x]));
      const legs = c.legs.map((l) => {
        const x = g.get(l.eventId);
        return x?.state === "post" ? { ...l, result: settle(l.key, x.home_score, x.away_score), score: `${x.home_score}-${x.away_score}` } : l;
      });
      const lost = legs.some((l) => l.result === "L");
      const allDone = legs.every((l) => l.result);
      const result = lost ? "L" : allDone ? "W" : null;
      await sql`update skii_daily set legs = ${sql.json(legs)}, result = ${result}, settled_at = ${result ? sql`now()` : null} where day = ${c.day} and kind = ${c.kind}`;
    }
    return open.length;
  }, 0, 15000);
}

export async function dailyHistory(days = 30) {
  return safely("dailyHistory", (sql) => sql`
    select to_char(day, 'YYYY-MM-DD') as day, kind, legs, odds::float, chance::float, result
    from skii_daily where day > now() - make_interval(days => ${days}) order by day desc, kind`, null);
}
