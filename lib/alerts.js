// The alert engine. `tick()` runs every minute (pg_cron / external ping) or whenever the daily
// job runs: it diffs live games against the last snapshot and sends kick-off / goal / red card /
// full-time alerts to every device, Telegram chat and WhatsApp number that follows the match;
// grades tracked coupons for linked accounts; sends value spots and odds moves; and publishes
// the morning coupons and the evening results.
import webpush from "web-push";
import { board as espnBoard } from "./espn";
import { analysedBoard, topPicks } from "./board";
import { settle } from "./model";
import { product } from "./coupon";
import { dailyWithStatus } from "./daily";
import { allLinks, configGet, configSet, dailySettle, dbEnabled, picksFor, pushAll, pushRemove, sentOnce, sentCleanup, subscribers, usersData, withDb } from "./db";
import { marketLabel } from "./i18n";
import { SITE, TZ, couponResultMessage, dailyMessage, goalMessage, oddsMoveMessage, resultsMessage, sendTelegram, sendWhatsApp, telegramEnabled, valueMessage, whatsappEnabled } from "./messaging";

const POST_HOUR = Number(process.env.POST_HOUR ?? 8);      // morning coupons, local time (SITE_TZ)
const RESULTS_HOUR = Number(process.env.RESULTS_HOUR ?? 23); // evening results

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

// Everyone who wants to hear about `eventId` for alert type `kind`.
function audience(eventId, kind, ctx) {
  const out = [];
  for (const p of ctx.push) if ((p.follows || []).includes(eventId) && p.prefs?.[kind] !== false) out.push({ type: "push", row: p, lang: p.lang });
  for (const l of ctx.links) {
    const follows = ctx.follows.get(l.user_id);
    const prefs = ctx.prefs.get(l.user_id) || {};
    if (follows && follows[eventId] && prefs[kind] !== false) out.push({ type: "chat", row: l, lang: l.lang || "fr" });
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
async function topPickAlerts(ctx, rows) {
  const list = topAudience(ctx);
  if (!list.length) return 0;
  const saved = await picksFor(rows.filter((r) => r.ev.state !== "pre").map((r) => r.ev.id));
  const top = topPicks(rows, saved);
  let sent = 0;
  for (const { ev } of rows) {
    const tp = top.get(ev.id);
    if (!tp) continue;
    const age = Date.now() - new Date(ev.date).getTime();
    const kind = ev.state === "in" && age < 30 * 60e3 ? "ko" : ev.state === "post" && ev.completed && age < 5 * 3600e3 ? "ft" : null;
    if (!kind || !(await sentOnce(`top-${kind}-${ev.id}`))) continue;
    const res = kind === "ft" ? settle(tp.key, ev.home.score, ev.away.score) : null;
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
      const list = audience(e.id, kind === "red" ? "cards" : kind, ctx);
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
        if (e?.state === "post" && e.completed) return { ...x, result: settle(x.key, e.home.score, e.away.score), score: `${e.home.score}-${e.away.score}` };
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
  if ((force === "morning" || hour >= POST_HOUR) && (await sentOnce(`post-coupon-${day}`))) {
    const d = await dailyWithStatus();
    if (d.safe?.legs?.length) out.morning = await broadcast("coupon", (lang) => dailyMessage(d, lang));
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
  const { events, sent: liveSent } = await liveAlerts(ctx);
  const rows = await analysedBoard(2); // also saves picks + grades finished games
  const topSent = await topPickAlerts(ctx, rows).catch(() => 0);
  const couponSent = await couponResults(ctx, events);
  const marketSent = await marketAlerts(ctx, rows);
  const posts = await dailyPosts(force);
  if (Math.random() < 0.02) await sentCleanup();
  const out = { ok: true, top: topSent, live: liveSent, coupons: couponSent, market: marketSent, posts, followers: ctx.links.length + ctx.push.length, ms: Date.now() - started };
  await configSet("last_tick", { at: new Date().toISOString(), ms: out.ms, live: liveSent, posts }); // health marker for /api/tick?health
  return out;
}

// Public health check: when the scheduler last called the tick (no secrets).
export async function tickHealth() {
  const last = await configGet("last_tick");
  const ageMs = last?.at ? Date.now() - Date.parse(last.at) : null;
  return { lastTick: last?.at || null, ageSeconds: ageMs === null ? null : Math.round(ageMs / 1000), running: ageMs !== null && ageMs < 5 * 60 * 1000, ms: last?.ms ?? null };
}

// Tick secret: generated once and kept in the database so the pg_cron job can read it there.
export async function tickSecret() {
  let s = await configGet("tick_secret");
  if (!s) { s = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join(""); await configSet("tick_secret", s); }
  return s;
}
export const tickAllowed = async (request) => {
  const key = request.nextUrl.searchParams.get("key") || (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (process.env.TICK_SECRET && key === process.env.TICK_SECRET) return true;
  if (process.env.CRON_SECRET && key === process.env.CRON_SECRET) return true;
  return !!key && key === (await tickSecret());
};
