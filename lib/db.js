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
  `alter table skii_picks add column if not exists home_id text, add column if not exists away_id text,
    add column if not exists odds_home numeric, add column if not exists odds_draw numeric, add column if not exists odds_away numeric`,
  // the model's own pick chance before calibration / league adjustment (what the learning fits on)
  `alter table skii_picks add column if not exists pick_raw numeric`,
  // hockey: how the game ended (null = regulation, 'OT', 'SO'); totals and 60-minute markets need it
  `alter table skii_picks add column if not exists ot text`,
  // small key/value store: generated secrets (VAPID keys, tick secret), live snapshot, daily post state
  `create table if not exists skii_config (key text primary key, value jsonb not null, updated_at timestamptz not null default now())`,
  // per-user synced state (follows, tracked coupons, prefs, slip, lang); the API verifies the Supabase JWT
  `create table if not exists skii_user_data (user_id text not null, key text not null, value jsonb not null, updated_at timestamptz not null default now(), primary key (user_id, key))`,
  // Telegram / WhatsApp chats linked to an account (alerts for followed matches, tracked coupons)
  `create table if not exists skii_links (platform text not null, chat_id text not null, user_id text, lang text default 'fr', name text, created_at timestamptz not null default now(), primary key (platform, chat_id))`,
  `create index if not exists skii_links_user on skii_links (user_id)`,
  // one-time codes shown on the site to link a chat
  `create table if not exists skii_link_codes (code text primary key, user_id text not null, platform text not null, expires_at timestamptz not null)`,
  // anyone who pressed Start / sent a message: gets the daily coupons (prefs: coupon, grosse, results, value)
  `create table if not exists skii_subscribers (platform text not null, chat_id text not null, lang text default 'fr', prefs jsonb not null default '{}'::jsonb, name text, active boolean not null default true, created_at timestamptz not null default now(), primary key (platform, chat_id))`,
  // web push subscriptions (one row per device)
  `create table if not exists skii_push (endpoint text primary key, subscription jsonb not null, user_id text, device text, prefs jsonb not null default '{}'::jsonb, follows jsonb not null default '[]'::jsonb, lang text default 'fr', updated_at timestamptz not null default now())`,
  // dedupe for every alert and post ever sent
  `create table if not exists skii_sent (key text primary key, at timestamptz not null default now())`,
  // Elo-style team ratings learned from every finished game
  `create table if not exists skii_teams (team_id text primary key, league text, name text, rating numeric not null default 1500, games int not null default 0, updated_at timestamptz not null default now())`,
  `create table if not exists skii_rated (event_id text primary key, at timestamptz not null default now())`,
  // snapshots of expensive results (the client board, the home payload) shared by every server instance
  `create table if not exists skii_cache (key text primary key, value jsonb not null, at timestamptz not null default now())`,
  // season of a team's last rated game (the NFL Elo regresses to the mean between seasons)
  `alter table skii_teams add column if not exists season int`,
  // football strength model (lib/soccer-core.js): a club's attack / defence, games behind them, its
  // domestic league and season, when they were last updated
  `alter table skii_teams add column if not exists att numeric, add column if not exists def numeric, add column if not exists n_dc int,
    add column if not exists dc_league text, add column if not exists dc_season int, add column if not exists dc_at timestamptz`,
  // a competition's running scoring rate, home advantage and cross-league offset, learnt from results
  `create table if not exists skii_leagues (league text primary key, mu_goals numeric not null default 0, mu_games int not null default 0, mu_prev numeric,
    home numeric, off numeric not null default 0, season int, updated_at timestamptz not null default now())`,
  // closing line value: the bookmaker's closing price on the pick's market and how far the pick beat it
  `alter table skii_picks add column if not exists close_odds numeric, add column if not exists clv numeric, add column if not exists close_at timestamptz`,
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
        pick_raw: a.pick.raw ?? a.pick.safe ?? a.pick.p, pick_tier: a.pick.tier, pick_est: !!a.pick.estimated,
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
            pick_safe = excluded.pick_safe, pick_raw = excluded.pick_raw, pick_tier = excluded.pick_tier, pick_est = excluded.pick_est,
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
    const ctx = { sport: e.sport, ot: e.ot ?? null };
    await sql`
      update skii_picks set state = 'post', home_score = ${hs}, away_score = ${as}, ot = ${e.ot ?? null},
        pick_result = ${r.pick_key ? settle(r.pick_key, hs, as, ctx) : null},
        value_result = ${r.value_key ? settle(r.value_key, hs, as, ctx) : null},
        settled_at = now()
      where event_id = ${r.event_id}`;
  }
}

// Finished games with the engine's pick and how it did, newest first.
export async function results({ days = 7, limit = 1500 } = {}) {
  return safely("results", (sql) => sql`
    select event_id, league, sport, kickoff, home, away, home_logo, away_logo,
      pick_key, pick_label, pick_odds::float, pick_p::float, pick_safe::float, pick_raw::float, pick_tier, pick_est,
      value_key, value_label, value_odds::float, value_p::float, value_ev::float,
      home_score, away_score, pick_result, value_result, close_odds::float, clv::float
    from skii_picks
    where state = 'post' and settled_at is not null and kickoff > now() - make_interval(days => ${days})
    order by kickoff desc limit ${limit}`, null);
}

// The top picks of the last `days`: each UTC day's 10 strongest priced Med-High/High picks (ranked
// over every saved pick of that day, finished or not — the board marks them the same way).
export async function topPickRows(days = 30) {
  const rows = await safely("topPickRows", (sql) => sql`
    select * from (
      select event_id, league, sport, kickoff, home, away, pick_key, pick_label, pick_odds::float, pick_safe::float, pick_tier,
        state, home_score, away_score, pick_result,
        row_number() over (partition by (kickoff at time zone 'UTC')::date order by pick_safe desc nulls last, pick_odds desc) as rk
      from skii_picks
      where pick_key is not null and pick_est = false and pick_tier in ('High', 'Med-High') and kickoff > now() - make_interval(days => ${days})
    ) t where rk <= 10
    order by kickoff desc`, null, 10000);
  return rows || [];
}

// Picks saved for games not finished yet, per league (what's coming up where).
// One league's picks for the record page: graded ones and the upcoming ones, newest first.
export async function leaguePicks(league, days = 30) {
  const rows = await safely("leaguePicks", (sql) => sql`
    select event_id, kickoff, state, home, away, home_logo, away_logo, pick_label, pick_odds::float, pick_safe::float, pick_tier, pick_est, pick_result, home_score, away_score
    from skii_picks where league = ${league} and pick_key is not null and kickoff > now() - make_interval(days => ${days})
    order by kickoff desc limit 300`, []);
  return rows || [];
}

export async function pendingByLeague() {
  const rows = await safely("pendingByLeague", (sql) => sql`
    select league, max(sport) as sport, count(*)::int as n, min(kickoff) as next
    from skii_picks
    where state <> 'post' and pick_key is not null and kickoff > now() - interval '4 hours'
    group by league order by min(kickoff)`, []);
  return (rows || []).map((r) => ({ league: r.league, sport: r.sport, n: r.n, next: r.next ? new Date(r.next).toISOString() : null }));
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

// Replace a coupon that hasn't started (the special night's, after the AI pass): legs, odds, chance.
export async function dailyReplace(day, kind, coupon) {
  if (!coupon?.legs?.length) return;
  await safely("dailyReplace", (sql) => sql`
    insert into skii_daily (day, kind, legs, odds, chance) values (${day}, ${kind}, ${sql.json(coupon.legs)}, ${coupon.odds}, ${coupon.chance})
    on conflict (day, kind) do update set legs = excluded.legs, odds = excluded.odds, chance = excluded.chance, result = null, settled_at = null, created_at = now()`);
}

// Grade daily coupons whose games are all finished (scores come from skii_picks).
export async function dailySettle() {
  return safely("dailySettle", async (sql) => {
    const open = await sql`select day, kind, legs from skii_daily where result is null and day > now() - interval '30 days'`;
    for (const c of open) {
      const ids = c.legs.map((l) => l.eventId);
      const games = await sql`select event_id, state, sport, home_score, away_score, ot from skii_picks where event_id in ${sql(ids)}`;
      const g = new Map(games.map((x) => [x.event_id, x]));
      const legs = c.legs.map((l) => {
        const x = g.get(l.eventId);
        return x?.state === "post" ? { ...l, result: settle(l.key, x.home_score, x.away_score, { sport: x.sport || l.sport, ot: x.ot }), score: `${x.home_score}-${x.away_score}` } : l;
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

// Raw SQL access for the modules that own their own tables (alerts, ratings, calibration).
export const withDb = (label, fn, fallback = null, ms = 8000) => safely(label, fn, fallback, ms);

// ---- shared snapshots (lib/memo.js rememberShared) ----
export async function cacheGet(key) {
  const rows = await safely("cacheGet", (sql) => sql`select value, at from skii_cache where key = ${key}`, [], 4000);
  const r = rows?.[0];
  return r ? { value: r.value, at: new Date(r.at).getTime() } : null;
}
export async function cacheSet(key, value) {
  await safely("cacheSet", (sql) => sql`insert into skii_cache (key, value, at) values (${key}, ${sql.json(value)}, now())
    on conflict (key) do update set value = excluded.value, at = now()`, null, 12000);
}

// ---- key/value config ----
export async function configGet(key, fallback = null) {
  const rows = await safely("configGet", (sql) => sql`select value from skii_config where key = ${key}`, []);
  return rows?.[0]?.value ?? fallback;
}
export async function configSet(key, value) {
  await safely("configSet", (sql) => sql`insert into skii_config (key, value, updated_at) values (${key}, ${sql.json(value)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`);
}

// ---- per-user synced state ----
export async function userDataGet(userId) {
  const rows = await safely("userDataGet", (sql) => sql`select key, value, updated_at from skii_user_data where user_id = ${userId}`, []);
  return Object.fromEntries((rows || []).map((r) => [r.key, { value: r.value, at: r.updated_at }]));
}
export async function userDataSet(userId, entries) {
  const list = Object.entries(entries || {}).filter(([k]) => /^[a-z]{2,20}$/.test(k)).slice(0, 20);
  if (!list.length) return;
  await safely("userDataSet", async (sql) => {
    for (const [key, value] of list) {
      await sql`insert into skii_user_data (user_id, key, value, updated_at) values (${userId}, ${key}, ${sql.json(value)}, now())
        on conflict (user_id, key) do update set value = excluded.value, updated_at = now()`;
    }
  });
}

// ---- messaging links & subscribers ----
export async function linkCodeCreate(userId, platform) {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  await safely("linkCodeCreate", (sql) => sql`insert into skii_link_codes (code, user_id, platform, expires_at) values (${code}, ${userId}, ${platform}, now() + interval '30 minutes')`);
  return code;
}
export async function linkCodeUse(code, platform, chatId, name, lang) {
  return safely("linkCodeUse", async (sql) => {
    const rows = await sql`delete from skii_link_codes where code = ${code.toUpperCase()} and platform = ${platform} and expires_at > now() returning user_id`;
    if (!rows.length) return null;
    const userId = rows[0].user_id;
    await sql`insert into skii_links (platform, chat_id, user_id, name, lang) values (${platform}, ${chatId}, ${userId}, ${name || null}, ${lang || "fr"})
      on conflict (platform, chat_id) do update set user_id = excluded.user_id, name = excluded.name, lang = excluded.lang`;
    return userId;
  });
}
export async function linksFor(userId) {
  return safely("linksFor", (sql) => sql`select platform, chat_id, name, lang, created_at from skii_links where user_id = ${userId}`, []);
}
export async function linkRemove(userId, platform) {
  await safely("linkRemove", (sql) => sql`delete from skii_links where user_id = ${userId} and platform = ${platform}`);
}
export async function subscriberUpsert(platform, chatId, patch = {}) {
  await safely("subscriberUpsert", (sql) => sql`insert into skii_subscribers (platform, chat_id, lang, prefs, name, active)
    values (${platform}, ${chatId}, ${patch.lang || "fr"}, ${sql.json(patch.prefs || { coupon: true, grosse: true, results: true })}, ${patch.name || null}, ${patch.active ?? true})
    on conflict (platform, chat_id) do update set
      lang = coalesce(${patch.lang || null}, skii_subscribers.lang),
      prefs = case when ${patch.prefs ? 1 : 0} = 1 then ${sql.json(patch.prefs || {})} else skii_subscribers.prefs end,
      name = coalesce(${patch.name || null}, skii_subscribers.name),
      active = coalesce(${patch.active ?? null}, skii_subscribers.active)`);
}
export async function subscribers(platform, pref) {
  const rows = await safely("subscribers", (sql) => sql`select chat_id, lang, prefs, name from skii_subscribers where platform = ${platform} and active`, []);
  return (rows || []).filter((r) => !pref || r.prefs?.[pref] !== false);
}
export async function subscriberGet(platform, chatId) {
  const rows = await safely("subscriberGet", (sql) => sql`select chat_id, lang, prefs, name, active from skii_subscribers where platform = ${platform} and chat_id = ${chatId}`, []);
  return rows?.[0] || null;
}

// ---- web push ----
export async function pushUpsert(row) {
  await safely("pushUpsert", (sql) => sql`insert into skii_push (endpoint, subscription, user_id, device, prefs, follows, lang, updated_at)
    values (${row.endpoint}, ${sql.json(row.subscription)}, ${row.user_id || null}, ${row.device || null}, ${sql.json(row.prefs || {})}, ${sql.json(row.follows || [])}, ${row.lang || "fr"}, now())
    on conflict (endpoint) do update set subscription = excluded.subscription, user_id = coalesce(excluded.user_id, skii_push.user_id), device = excluded.device,
      prefs = excluded.prefs, follows = excluded.follows, lang = excluded.lang, updated_at = now()`);
}
export async function pushRemove(endpoint) {
  await safely("pushRemove", (sql) => sql`delete from skii_push where endpoint = ${endpoint}`);
}
export async function pushAll() {
  return safely("pushAll", (sql) => sql`select endpoint, subscription, user_id, prefs, follows, lang from skii_push where updated_at > now() - interval '90 days'`, []);
}

// ---- dedupe ----
export async function sentOnce(key) {
  const rows = await safely("sentOnce", (sql) => sql`insert into skii_sent (key) values (${key}) on conflict (key) do nothing returning key`, null);
  return rows ? rows.length > 0 : false; // false also when the database is off: never spam
}
export async function sentCleanup() {
  await safely("sentCleanup", (sql) => sql`delete from skii_sent where at < now() - interval '14 days'`);
}

// Followed matches / tracked coupons of every linked user, for alerts (one query each).
export async function usersData(key) {
  const rows = await safely("usersData", (sql) => sql`select user_id, value from skii_user_data where key = ${key}`, []);
  return new Map((rows || []).map((r) => [r.user_id, r.value]));
}
export async function allLinks() {
  return safely("allLinks", (sql) => sql`select platform, chat_id, user_id, lang from skii_links where user_id is not null`, []);
}
