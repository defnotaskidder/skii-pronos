// The alert engine. `tick()` runs every minute (pg_cron / external ping) or whenever the daily
// job runs. Every call is cheap: it reads the saved schedule and announces the games kicking off
// (the kick-off wave), and reads the live feed only while a followed game is being played, for its
// kick-off / goal / red card / full-time alerts. Once per quarter of an hour it also runs the full
// pass: the board (saves picks, grades finished games), top-pick alerts, tracked coupons of linked
// accounts, value spots and odds moves, the morning coupons and the evening results, and the
// schedule the next calls read.
import webpush from "web-push";
import { board as espnBoard } from "./espn";
import { analysedBoard, topPicks } from "./board";
import { settle } from "./model";
import { product } from "./coupon";
import { dailyWithStatus } from "./daily";
import { allLinks, configGet, configSet, dailySettle, db, dbEnabled, picksFor, pushAll, pushRemove, sentMany, sentOnce, sentCleanup, subscribers, usersData, withDb } from "./db";
import { marketLabel, translate } from "./i18n";
import { LEAGUE_BY_ID } from "./leagues";
import { dueGames, waveFor, waveTag, waveText, waveWants } from "./kick";
import { SITE, TZ, couponResultMessage, dailyMessage, goalMessage, oddsMoveMessage, resultsMessage, sendTelegram, sendWhatsApp, telegramEnabled, valueMessage, whatsappEnabled } from "./messaging";

const POST_HOUR = Number(process.env.POST_HOUR ?? 8);      // morning coupons, local time (SITE_TZ)
const RESULTS_HOUR = Number(process.env.RESULTS_HOUR ?? 23); // evening results
const FULL_EVERY = 15 * 60e3; // the full pass; every other call only reads the saved schedule

const localHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
const localDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// ---------- VAPID keys live in the database, generated once ----------
export async function vapid() {
  let k = await configGet("vapid");
  if (!k) { k = webpush.generateVAPIDKeys(); await configSet("vapid", k); }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@skii-pronos.app", k.publicKey, k.privateKey);
  return k;
}

async function sendPush(row, msg) {
  try {
    await vapid();
    await webpush.sendNotification(row.subscription, JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.tag, kind: msg.kind }), { TTL: 3600 });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) await pushRemove(row.endpoint);
    return false;
  }
}
async function sendChat(link, text) {
  try {
    if (link.platform === "telegram" && telegramEnabled()) await sendTelegram(link.chat_id, text);
    else if (link.platform === "whatsapp" && whatsappEnabled()) await sendWhatsApp(link.chat_id, text);
    return true;
  } catch { return false; }
}

// Everyone who wants to hear about `eventId` for alert type `kind`. A followed game's own kick-off
// alert is left out for a device the kick-off wave already covers (the wave names that game first).
function audience(eventId, kind, ctx, sport) {
  const out = [];
  const covered = (prefs) => kind === "kickoff" && waveWants(prefs, sport);
  for (const p of ctx.push) if ((p.follows || []).includes(eventId) && p.prefs?.[kind] !== false && !covered(p.prefs)) out.push({ type: "push", row: p, lang: p.lang });
  for (const l of ctx.links) {
    const follows = ctx.follows.get(l.user_id);
    const prefs = ctx.prefs.get(l.user_id) || {};
    if (follows && follows[eventId] && prefs[kind] !== false && !covered(prefs)) out.push({ type: "chat", row: l, lang: l.lang || "fr" });
  }
  return out;
}
async function deliver(list, msg) {
  let n = 0;
  for (const a of list) {
    const ok = a.type === "push" ? await sendPush(a.row, msg(a.lang)) : await sendChat(a.row, msg(a.lang).text);
    if (ok) n++;
  }
  return n;
}

async function context() {
  const [push, links, follows, prefs, track] = await Promise.all([pushAll(), allLinks(), usersData("follows"), usersData("prefs"), usersData("track")]);
  return { push: push || [], links: links || [], follows, prefs, track };
}

// ---------- top picks: kick-off and result of the day's 10 best picks (on unless switched off) ----------
function topAudience(ctx) {
  const out = [];
  for (const p of ctx.push) if (p.prefs?.toppicks !== false) out.push({ type: "push", row: p, lang: p.lang });
  for (const l of ctx.links) if ((ctx.prefs.get(l.user_id) || {}).toppicks !== false) out.push({ type: "chat", row: l, lang: l.lang || "fr" });
  return out;
}
const topMessage = (ev, tp, kind, res) => (lang) => {
  const fr = lang !== "en";
  const teams = `${ev.home.short} – ${ev.away.short}`;
  const pick = `${marketLabel(lang, tp.label)} @ ${Number(tp.odds).toFixed(2)}`;
  const title = kind === "ko" ? (fr ? `🔥 Top prono #${tp.rank} en direct : ${teams}` : `🔥 Top pick #${tp.rank} live: ${teams}`)
    : res === "W" ? (fr ? `✅ Top prono gagné : ${teams}` : `✅ Top pick won: ${teams}`)
    : res === "L" ? (fr ? `❌ Top prono perdu : ${teams}` : `❌ Top pick lost: ${teams}`)
    : (fr ? `↩️ Top prono remboursé : ${teams}` : `↩️ Top pick void: ${teams}`);
  const body = kind === "ko" ? pick : `${ev.home.score ?? 0}-${ev.away.score ?? 0} · ${pick}`;
  const url = `${SITE}/match/${ev.league}/${ev.id}`;
  return { title, body, url, text: `${title}\n${body}\n${url}`, tag: `top-${kind}-${ev.id}`, kind: "top" };
};
async function topPickAlerts(ctx, rows, top) {
  const list = topAudience(ctx);
  if (!list.length) return 0;
  let sent = 0;
  for (const { ev } of rows) {
    const tp = top.get(ev.id);
    if (!tp) continue;
    const age = Date.now() - new Date(ev.date).getTime();
    const kind = ev.state === "in" && age < 30 * 60e3 ? "ko" : ev.state === "post" && ev.completed && age < 5 * 3600e3 ? "ft" : null;
    if (!kind || !(await sentOnce(`top-${kind}-${ev.id}`))) continue;
    const res = kind === "ft" ? settle(tp.key, ev.home.score, ev.away.score, { sport: ev.sport, ot: ev.ot }) : null;
    sent += await deliver(list, topMessage(ev, tp, kind, res));
  }
  return sent;
}

// ---------- live alerts ----------
async function liveAlerts(ctx) {
  const events = await espnBoard(0, -1);
  const prev = (await configGet("live-snap")) || {};
  const next = {};
  let sent = 0;
  for (const e of events) {
    if (e.postponed) continue;
    const cur = { s: e.state, h: e.home?.score ?? null, a: e.away?.score ?? null, rh: e.reds?.home || 0, ra: e.reds?.away || 0 };
    if (e.state === "in" || e.state === "post") next[e.id] = cur;
    const p = prev[e.id];
    if (!p) continue;
    const g = { id: e.id, league: e.league, home: e.home.short, away: e.away.short, hs: cur.h, as: cur.a, minute: e.minute };
    const fire = async (kind, key, scorer) => {
      if (!(await sentOnce(key))) return;
      const list = audience(e.id, kind === "red" ? "cards" : kind, ctx, e.sport);
      if (!list.length) return;
      sent += await deliver(list, (lang) => ({ ...goalMessage({ ...g, scorer }, lang, kind), tag: key, kind }));
    };
    if (p.s === "pre" && cur.s === "in") await fire("kickoff", `ko-${e.id}`);
    if (cur.h > (p.h ?? 0)) await fire("goal", `g-${e.id}-${cur.h}-${cur.a}`, e.home.short);
    if (cur.a > (p.a ?? 0)) await fire("goal", `g-${e.id}-${cur.h}-${cur.a}`, e.away.short);
    if (cur.rh > p.rh) await fire("red", `r-${e.id}-${cur.rh}-${cur.ra}`, e.home.short);
    if (cur.ra > p.ra) await fire("red", `r-${e.id}-${cur.rh}-${cur.ra}`, e.away.short);
    if (p.s !== "post" && cur.s === "post" && e.completed) await fire("final", `ft-${e.id}`);
  }
  // first run or new games: remember current state without alerting
  for (const e of events) if (!prev[e.id] && (e.state === "in" || e.state === "pre")) next[e.id] = { s: e.state, h: e.home?.score ?? null, a: e.away?.score ?? null, rh: e.reds?.home || 0, ra: e.reds?.away || 0 };
  await configSet("live-snap", next);
  return { events, sent };
}

// ---------- kick-off waves: one alert each time games kick off, from the saved schedule ----------
// The schedule: every game from four hours ago (still being played) to 36 hours ahead.
async function savePlan(rows, top) {
  const now = Date.now();
  const games = [];
  for (const { ev } of rows) {
    const d = new Date(ev.date).getTime();
    if (ev.postponed || ev.state === "post" || !(d > now - 4 * 3600e3 && d < now + 36 * 3600e3) || !ev.home?.short || !ev.away?.short) continue;
    games.push({ id: ev.id, l: ev.league, s: ev.sport, d, h: ev.home.short, a: ev.away.short, r: top.get(ev.id)?.rank, tier: LEAGUE_BY_ID[ev.league]?.tier });
  }
  await configSet("kick-plan", { at: now, games });
  return games.length;
}
async function kickoffWaves(ctx, plan, now) {
  const wanted = ctx.push.some((p) => p.prefs?.starts === true) || ctx.links.some((l) => (ctx.prefs.get(l.user_id) || {}).starts === true);
  if (!wanted || !plan?.games?.length) return 0;
  const recent = dueGames(plan.games, 0, now); // kicked off in the last ten minutes
  if (!recent.length) return 0;
  // each game is announced once: claimed in the database in one statement, so a call that overlaps
  // another never repeats it, and a game whose claim fails (database slow) is simply tried again
  // by the next call, for ten minutes
  const mine = new Set(await sentMany(recent.map((g) => `kick-${g.id}`)));
  const due = recent.filter((g) => mine.has(`kick-${g.id}`));
  if (!due.length) return 0;
  const url = `${SITE}/live`;
  let sent = 0;
  const send = async (type, row, prefs, follows, lang) => {
    const list = waveFor(due, prefs, follows);
    if (!list.length) return;
    const { title, body } = waveText(list, (k, v) => translate(lang, k, v));
    const ok = type === "push" ? await sendPush(row, { title, body, url, tag: waveTag(list), kind: "kickoff" }) : await sendChat(row, `${title}\n${body}\n${url}`);
    if (ok) sent++;
  };
  for (const p of ctx.push) await send("push", p, p.prefs, p.follows, p.lang === "en" ? "en" : "fr");
  for (const l of ctx.links) await send("chat", l, ctx.prefs.get(l.user_id), Object.keys(ctx.follows.get(l.user_id) || {}), l.lang === "en" ? "en" : "fr");
  return sent;
}
// Is a followed game being played? Only then do the calls between two full passes read the live feed.
function followedLive(ctx, plan, now) {
  const ids = new Set();
  for (const p of ctx.push) for (const id of p.follows || []) ids.add(String(id));
  for (const l of ctx.links) for (const id of Object.keys(ctx.follows.get(l.user_id) || {})) ids.add(id);
  if (!ids.size) return false;
  return (plan?.games || []).some((g) => ids.has(g.id) && now > g.d - 3 * 60e3 && now < g.d + (g.s === "soccer" ? 2.5 : 4.5) * 3600e3);
}

// ---------- tracked coupons of linked accounts ----------
async function couponResults(ctx, events) {
  const byId = new Map(events.map((e) => [e.id, e]));
  let sent = 0;
  for (const l of ctx.links) {
    const entries = ctx.track.get(l.user_id);
    const prefs = ctx.prefs.get(l.user_id) || {};
    if (!Array.isArray(entries) || prefs.results === false) continue;
    for (const entry of entries) {
      if (!entry?.legs?.length) continue;
      const legs = entry.legs.map((x) => {
        if (x.result) return x;
        const e = byId.get(x.eventId);
        if (e?.state === "post" && e.completed) return { ...x, result: settle(x.key, e.home.score, e.away.score, { sport: e.sport, ot: e.ot }), score: `${e.home.score}-${e.away.score}` };
        return x;
      });
      if (!legs.every((x) => x.result)) continue;
      if (!(await sentOnce(`cr-${l.platform}-${l.chat_id}-${entry.id}`))) continue;
      sent += (await sendChat(l, couponResultMessage({ ...entry, legs }, l.lang || "fr").text)) ? 1 : 0;
    }
  }
  return sent;
}

// ---------- value spots & odds moves ----------
async function marketAlerts(ctx, rows) {
  let sent = 0;
  const now = Date.now();
  // value: strong edge on a game in the next 36 h, once per game
  for (const { ev, analysis } of rows) {
    const v = analysis?.value;
    if (!v || ev.state !== "pre" || (v.ev ?? 0) < 0.05 || new Date(ev.date) - now > 36 * 3600e3) continue;
    const list = [
      ...ctx.push.filter((p) => p.prefs?.value !== false && p.prefs?.valueAll).map((p) => ({ type: "push", row: p, lang: p.lang })),
      ...ctx.links.filter((l) => (ctx.prefs.get(l.user_id) || {}).value !== false && (ctx.prefs.get(l.user_id) || {}).valueAll).map((l) => ({ type: "chat", row: l, lang: l.lang || "fr" })),
      ...audience(ev.id, "value", ctx),
    ];
    if (!list.length) continue;
    if (!(await sentOnce(`val-${ev.id}-${v.key}`))) continue;
    sent += await deliver(list, (lang) => ({ ...valueMessage(ev, v, lang), tag: `val-${ev.id}`, kind: "value" }));
  }
  // odds moves on followed games: compare with the odds saved at the last snapshot
  const snap = (await configGet("odds-snap")) || {};
  const next = {};
  for (const { ev } of rows) {
    if (ev.state !== "pre" || !ev.odds?.home || !ev.odds?.away) continue;
    const cur = { home: ev.odds.home, draw: ev.odds.draw ?? null, away: ev.odds.away };
    next[ev.id] = snap[ev.id] || cur; // the reference stays until a move is reported
    const ref = snap[ev.id];
    if (!ref) continue;
    const move = Math.max(Math.abs(cur.home - ref.home) / ref.home, Math.abs(cur.away - ref.away) / ref.away);
    if (move < 0.12) continue;
    const list = audience(ev.id, "moves", ctx);
    if (list.length && (await sentOnce(`mv-${ev.id}-${Math.round(cur.home * 100)}-${Math.round(cur.away * 100)}`))) {
      sent += await deliver(list, (lang) => ({ ...oddsMoveMessage(ev, ref, cur, lang), tag: `mv-${ev.id}`, kind: "moves" }));
    }
    next[ev.id] = cur;
  }
  await configSet("odds-snap", next);
  return sent;
}

// ---------- daily posts ----------
async function broadcast(kind, textFor, { channel = true } = {}) {
  let n = 0;
  if (telegramEnabled()) {
    const ch = process.env.TELEGRAM_CHANNEL;
    if (channel && ch) { try { await sendTelegram(ch, textFor("fr")); n++; } catch (e) { console.warn("[telegram channel]", e.message); } }
    for (const s of await subscribers("telegram", kind)) { try { await sendTelegram(s.chat_id, textFor(s.lang || "fr")); n++; } catch { /* blocked the bot */ } }
  }
  if (whatsappEnabled()) {
    for (const s of await subscribers("whatsapp", kind)) { try { await sendWhatsApp(s.chat_id, textFor(s.lang || "fr")); n++; } catch { /* window closed, no template */ } }
  }
  for (const p of (await pushAll()) || []) {
    if (p.prefs?.coupon === false) continue;
    const txt = textFor(p.lang || "fr");
    if (!txt) continue;
    await sendPush(p, { title: kind === "results" ? (p.lang === "en" ? "📊 Today's results" : "📊 Résultats du jour") : (p.lang === "en" ? "🔥 Coupon of the day is ready" : "🔥 Le coupon du jour est prêt"), body: txt.split("\n").slice(1, 4).join(" · ").slice(0, 160), url: `${SITE}/coupon`, tag: `${kind}-${localDay()}`, kind: "coupon" });
    n++;
  }
  return n;
}

async function dailyPosts(force = null) {
  const day = localDay(), hour = localHour();
  const out = {};
  if (force === "morning" || hour >= POST_HOUR) {
    // check first, claim after: yesterday's coupon still being played (carried) must not use up
    // today's post — today's goes out on the next tick once it is built
    const d = await dailyWithStatus();
    if (!d.carried && d.safe?.legs?.length && (await sentOnce(`post-coupon-${day}`))) {
      out.morning = await broadcast("coupon", (lang) => dailyMessage(d, lang));
    }
  }
  if ((force === "evening" || hour >= RESULTS_HOUR) && (await sentOnce(`post-results-${day}`))) {
    await dailySettle();
    const d = await dailyWithStatus();
    const txt = (lang) => resultsMessage(d, lang);
    if (txt("fr")) out.evening = await broadcast("results", txt);
  }
  return out;
}

// ---------- the tick ----------
export async function tick({ force = null } = {}) {
  if (!dbEnabled()) return { ok: false, db: false };
  const started = Date.now();
  const ctx = await context();
  const plan = await configGet("kick-plan");
  const waves = await kickoffWaves(ctx, plan, started).catch(() => 0);
  // the full pass: asked for by the daily jobs, else once per quarter of an hour (claimed, so two
  // calls that overlap run it once; a schedule that could not be read waits for the next one)
  const full = (await sentOnce(`full-${Math.floor(started / FULL_EVERY)}`)) || !!force;
  let out;
  if (full) {
    const { events, sent: liveSent } = await liveAlerts(ctx);
    const rows = await analysedBoard(2); // also saves picks + grades finished games
    const top = topPicks(rows, (await picksFor(rows.filter((r) => r.ev.state !== "pre").map((r) => r.ev.id))) || new Map());
    const topSent = await topPickAlerts(ctx, rows, top).catch(() => 0);
    const couponSent = await couponResults(ctx, events);
    const marketSent = await marketAlerts(ctx, rows);
    const posts = await dailyPosts(force);
    const planned = await savePlan(rows, top);
    if (Math.random() < 0.3) await sentCleanup();
    out = { ok: true, full: true, waves, top: topSent, live: liveSent, coupons: couponSent, market: marketSent, posts, planned, followers: ctx.links.length + ctx.push.length, ms: Date.now() - started };
  } else {
    const liveSent = followedLive(ctx, plan, started) ? (await liveAlerts(ctx)).sent : 0;
    out = { ok: true, full: false, waves, live: liveSent, ms: Date.now() - started };
  }
  await configSet("last_tick", { at: new Date().toISOString(), ms: out.ms, live: out.live, waves, full, ...(out.posts ? { posts: out.posts } : {}) }); // health marker for /api/tick?health
  return out;
}

// Public health check: when the scheduler last called the tick (no secrets).
export async function tickHealth() {
  const last = await configGet("last_tick");
  const ageMs = last?.at ? Date.now() - Date.parse(last.at) : null;
  return { lastTick: last?.at || null, ageSeconds: ageMs === null ? null : Math.round(ageMs / 1000), running: ageMs !== null && ageMs < 5 * 60 * 1000, ms: last?.ms ?? null, full: last?.full ?? null, waves: last?.waves ?? null };
}

// Tick secret: generated once and kept in the database so the pg_cron job can read it there.
export async function tickSecret() {
  let s = await configGet("tick_secret");
  if (!s) { s = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join(""); await configSet("tick_secret", s); }
  return s;
}
// ---------- the every-minute caller, installed in the database itself ----------
// pg_cron + pg_net call /api/tick once a minute: what supabase/tick.sql does by hand, done by the
// site with its own connection (the database password cannot be read outside Vercel). Installed
// once, by the daily job of the production deployment; skii_config.scheduler records it, so a job
// unscheduled by hand (select cron.unschedule('skii-tick')) does not come back the next day.
// TICK_SCHEDULER=off skips it altogether. The job holds no secret: it reads the tick secret from
// skii_config each time it runs.
export async function ensureScheduler() {
  const sql = db();
  if (!sql) return { ok: false, db: false };
  if (process.env.TICK_SCHEDULER === "off") return { ok: false, skipped: "TICK_SCHEDULER=off" };
  if (process.env.VERCEL_ENV !== "production") return { ok: false, skipped: "not the production deployment" };
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(SITE)) return { ok: false, skipped: "site address" };
  const done = await configGet("scheduler");
  if (done?.at) return { ok: true, already: done.at };
  await tickSecret(); // created now if it never was: the job reads it from skii_config
  const call = `select net.http_get(url := '${SITE}/api/tick?key=' || (select value #>> '{}' from public.skii_config where key = 'tick_secret'), timeout_milliseconds := 30000);`;
  const steps = [
    ["pg_cron", "create extension if not exists pg_cron"],
    ["pg_net", "create extension if not exists pg_net"],
    ["skii-tick", `select cron.schedule('skii-tick', '* * * * *', $job$ ${call} $job$)`],
    // keep the cron log small (pg_net drops its own responses after 6 hours)
    ["skii-tick-cleanup", "select cron.schedule('skii-tick-cleanup', '0 3 * * *', $job$ delete from cron.job_run_details where end_time < now() - interval '7 days' $job$)"],
  ];
  const out = { ok: true, steps: {} };
  for (const [name, text] of steps) {
    try { await sql.unsafe(text); out.steps[name] = "ok"; } catch (e) { out.steps[name] = e.message; out.ok = false; break; }
  }
  try { out.jobs = (await sql.unsafe("select jobname, schedule, active from cron.job order by jobid")).map((j) => `${j.jobname} [${j.schedule}] ${j.active ? "active" : "off"}`); } catch (e) { out.jobs = e.message; }
  if (out.ok) await configSet("scheduler", { at: new Date().toISOString(), site: SITE });
  return out;
}

export const tickAllowed = async (request) => {
  const key = request.nextUrl.searchParams.get("key") || (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (process.env.TICK_SECRET && key === process.env.TICK_SECRET) return true;
  if (process.env.CRON_SECRET && key === process.env.CRON_SECRET) return true;
  return !!key && key === (await tickSecret());
};
