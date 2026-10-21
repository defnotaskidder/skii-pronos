// Spécial matchday. When a big competition plays today (Champions League first), every game of the
// slate gets the full treatment — real bookmaker prices, the trained model, the line's movement since
// it opened, and one AI pass with web search over the whole slate (line-ups, injuries, suspensions,
// rotation, what is at stake) — and the slate's best combinations are published once: "special"
// (the night's coupon, ~x2) and "special_x" (the night's grosse cote, ~x10), stored in skii_daily
// next to the daily coupons and graded with them. The dossier itself is kept for the day in
// skii_config, so what readers saw before kick-off is what stays up.
import { buildTarget } from "./coupon";
import { pickable } from "./model";
import { aiEnabled, askJson } from "./ai";
import { configGet, configSet, dailyGet, dailySave, dbEnabled } from "./db";
import { dayKey, learning, poolOf, withStatus } from "./daily";
import { LEAGUE_BY_ID } from "./leagues";

// Competitions that get a special night, in order of priority, with the number of games a day needs.
export const SPECIAL = [
  { id: "uefa.champions", min: 3, fr: "Ligue des Champions" },
  { id: "uefa.europa", min: 4, fr: "Ligue Europa" },
  { id: "uefa.europa.conf", min: 4, fr: "Ligue Conférence" },
  { id: "fifa.world", min: 2, fr: "Coupe du monde" },
  { id: "uefa.euro", min: 2, fr: "Euro" },
  { id: "conmebol.america", min: 2, fr: "Copa América" },
  { id: "caf.nations", min: 2, fr: "CAN" },
  { id: "fifa.cwc", min: 2, fr: "Coupe du monde des clubs" },
  { id: "conmebol.libertadores", min: 4, fr: "Copa Libertadores" },
];
export const KINDS = ["special", "special_x"];
const TARGETS = { special: 2, special_x: 10 };

const r3 = (x) => (x === null || x === undefined ? x : Math.round(x * 1000) / 1000);
const utcDay = (iso) => String(iso).slice(0, 10);

// Today's slate: the first competition (in SPECIAL order) with enough games today.
export function slateOf(rows, day = dayKey()) {
  for (const s of SPECIAL) {
    const games = rows.filter(({ ev }) => ev.league === s.id && utcDay(ev.date) === day && !ev.postponed);
    if (games.length >= s.min) return { league: s.id, games, fr: s.fr, name: LEAGUE_BY_ID[s.id]?.name || s.id };
  }
  return null;
}

// ---------- one game's dossier ----------
const chanceOf = (m) => (m.p ?? 0) + 0.5 * (m.v || 0); // a refund counts as half a win
const brief = (m) => m && ({ key: m.key, label: m.label, odds: m.odds, p: r3(m.safe ?? m.p), v: r3(m.v || 0), tier: m.tier, estimated: !!m.estimated });

function dossier({ ev, analysis: a }) {
  const o = ev.odds || {};
  const imp = (x) => (x > 1 ? 1 / x : null);
  // the line since it opened: which side the money went to (implied probability, in points)
  let move = null;
  if (o.homeOpen && o.home && o.awayOpen && o.away) {
    // the side the market shortened (implied probability up since the open); a drift shows nothing
    const dh = imp(o.home) - imp(o.homeOpen), da = imp(o.away) - imp(o.awayOpen);
    const side = dh >= da ? "home" : "away";
    const d = Math.max(dh, da);
    if (d >= 0.015) move = { side, from: side === "home" ? o.homeOpen : o.awayOpen, to: side === "home" ? o.home : o.away, pts: r3(d) };
  }
  const pick = a?.pick ? brief(a.pick) : null;
  // the other playable markets, real prices first, likeliest first
  const alts = (a?.markets || [])
    .filter((m) => pickable(m) && m.key !== "X" && m.key !== pick?.key && chanceOf(m) >= 0.55 && m.odds >= (m.estimated ? 1.3 : 1.1))
    .sort((x, y) => (x.estimated - y.estimated) || (chanceOf(y) - chanceOf(x)))
    .slice(0, 4).map(brief);
  const side = (t) => t && ({ id: t.id, short: t.short || t.name, name: t.name, logo: t.logo || null, form: t.form || "", score: t.score ?? null });
  return {
    eventId: ev.id, league: ev.league, date: ev.date, state: ev.state, detail: ev.detail || "",
    home: side(ev.home), away: side(ev.away),
    odds: o.home ? { provider: o.provider, h: o.home, d: o.draw ?? null, a: o.away, total: o.total || null, spread: o.spread || null } : null,
    probs: a?.probs || null, xg: a?.xg || null, model: a?.model ? { home: a.model.home, away: a.model.away, games: a.model.games } : null, quality: a?.quality || null,
    move, pick, alts,
  };
}

// ---------- the AI pass over the slate ----------
const SPECIAL_SYSTEM = `You are the head analyst of Skii Pronos on a big European night. Readers bet on 1xBet. You get every game of tonight's slate with real bookmaker prices, a calibrated model's probabilities (they track the market closely, so trust them unless the facts say otherwise) and the engine's pick for each game.

Before judging, search the web for tonight's team news: confirmed or expected line-ups, injured and suspended players, rotation (a big league game at the weekend), what is at stake in the table, the first-leg score when it is a tie. Search efficiently — one search can cover several games ("Champions League team news tonight"), one per game at most.

Then give your verdict on the engine's pick for each game: "banker" when nothing in the news goes against a 70 %+ pick, "pick" for a normal-risk one, "avoid" when the facts undermine it (key absences, rotation, a dead rubber, a derby, an underdog in form, a line moving the other way). When one of the listed alternatives is clearly better, name it in "alt" exactly as listed. Each note is in French, at most 24 words, and states the concrete facts (who is out, who is rested, what is at stake). No hype, no guarantees. One entry per game.`;
const SPECIAL_SCHEMA = {
  type: "object", additionalProperties: false, required: ["games"],
  properties: {
    games: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["eventId", "verdict", "risk", "note"],
        properties: {
          eventId: { type: "string" }, verdict: { type: "string", enum: ["banker", "pick", "avoid"] },
          risk: { type: "string", enum: ["low", "medium", "high"] }, note: { type: "string", description: "French, max 24 words" }, alt: { type: "string", description: "one of the listed alternatives, verbatim, or omitted" },
        },
      },
    },
  },
};
const pct = (x) => (x === null || x === undefined ? "-" : `${Math.round(x * 100)}%`);
const priceOf = (m) => `${m.estimated ? "≈" : ""}${m.odds} (${pct(m.p)})`;

function within(ms, p) {
  let timer;
  return Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout after ${ms} ms`)), ms); })]).finally(() => clearTimeout(timer));
}

async function slateReview(name, games) {
  if (!aiEnabled() || process.env.COUPON_AI === "false" || !games.length) return null;
  const lines = games.map((g) => {
    const o = g.odds;
    const odds = o ? `${o.provider} 1 ${o.h} / X ${o.d ?? "-"} / 2 ${o.a}${o.total ? ` · O/U ${o.total.line} ${o.total.over}/${o.total.under}` : ""}` : "no bookmaker price";
    const moved = g.move ? ` · line moved toward ${g.move.side === "home" ? g.home.short : g.away.short} (${g.move.from} → ${g.move.to})` : "";
    const model = g.probs ? `model ${pct(g.probs.h)}/${pct(g.probs.d)}/${pct(g.probs.a)}${g.xg ? `, xG ${g.xg.home}-${g.xg.away}` : ""}` : "";
    const form = g.home.form || g.away.form ? ` · form ${g.home.form || "?"} vs ${g.away.form || "?"}` : "";
    return `eventId=${g.eventId} | ${new Date(g.date).toISOString().slice(11, 16)}Z | ${g.home.name} vs ${g.away.name} | ${odds}${moved} | ${model}${form} | engine pick: ${g.pick ? `${g.pick.label} @${priceOf(g.pick)}` : "none"} | alternatives: ${g.alts.map((m) => `${m.label} @${priceOf(m)}`).join("; ") || "none"}`;
  }).join("\n");
  const user = `Today is ${new Date().toISOString().slice(0, 10)}. ${name}, tonight's slate (≈ = estimated price, take only at or above):\n${lines}`;
  try {
    const { json } = await within(85e3, askJson({ system: SPECIAL_SYSTEM, user, schema: SPECIAL_SCHEMA, web: true, effort: "high", maxTokens: 20000, maxUses: 10, timeoutMs: 80e3 }));
    const list = (Array.isArray(json?.games) ? json.games : []).map((g) => ({ ...g, eventId: String(g.eventId) }));
    if (!list.length) console.warn("[special] empty AI reply, publishing unreviewed");
    return list.length ? list : null;
  } catch (e) {
    console.warn(`[special] ${e.message} — publishing unreviewed`);
    return null;
  }
}

// ---------- the night's coupons ----------
function buildCoupons(pool, opts) {
  const special = buildTarget(pool, { target: TARGETS.special, profile: "special", minLegs: 2, maxLegs: 4, perLeague: 20, onlyPriced: true, ...opts });
  const x = buildTarget(pool, { target: TARGETS.special_x, profile: "special", minLegs: 3, maxLegs: 7, perLeague: 20, onlyPriced: false, maxEstimated: 2, ...opts });
  return { special: { ...special, kind: "special", target: TARGETS.special }, special_x: { ...x, kind: "special_x", target: TARGETS.special_x } };
}

const memory = new Map(); // day → dossier (without a database)
const building = new Map(); // day → in-flight build

async function build(day, slate, rows) {
  const games = slate.games.filter((r) => r.analysis).map(dossier).sort((a, b) => new Date(a.date) - new Date(b.date));
  const { adjust, skill } = await learning();
  const pool = poolOf(rows, 30).filter((r) => r.ev.league === slate.league && utcDay(r.ev.date) === day && r.analysis?.pick);
  const review = await slateReview(slate.name, games);
  const byId = new Map((review || []).map((g) => [g.eventId, g]));
  for (const g of games) {
    const v = byId.get(g.eventId);
    if (!v) continue;
    g.verdict = v.verdict; g.risk = v.risk; g.note = v.note || "";
    if (v.alt) { const alt = g.alts.find((m) => m.label === v.alt); if (alt) g.aiPick = alt; }
  }
  const avoid = games.filter((g) => g.verdict === "avoid").map((g) => g.eventId);
  const coupons = buildCoupons(pool, { adjust, skill, exclude: avoid });
  for (const c of Object.values(coupons)) c.legs = c.legs.map((l) => ({ ...l, note: byId.get(l.eventId)?.note || "" }));
  const out = { day, league: slate.league, name: slate.name, fr: slate.fr, games, reviewed: !!review, avoided: avoid.length, coupons, generated: new Date().toISOString() };
  if (dbEnabled()) {
    await configSet(`special:${day}`, out);
    for (const k of KINDS) if (coupons[k]?.legs?.length) await dailySave(day, k, coupons[k]);
  } else {
    memory.set(day, out);
  }
  return out;
}

// The stored dossier with today's live state: scores and results on the games, leg status on the coupons.
async function withLive(d, rows) {
  const byId = new Map(rows.map((r) => [r.ev.id, r.ev]));
  const games = (d.games || []).map((g) => {
    const ev = byId.get(g.eventId);
    if (!ev) return g;
    return { ...g, state: ev.state, detail: ev.detail || "", minute: ev.minute ?? null, home: { ...g.home, score: ev.home?.score ?? null }, away: { ...g.away, score: ev.away?.score ?? null } };
  });
  const stored = dbEnabled() ? await dailyGet(d.day) : null; // graded legs (results) once the games finish
  const coupons = Object.fromEntries(KINDS.map((k) => {
    const c = stored?.[k] ? { ...d.coupons?.[k], legs: stored[k].legs, odds: stored[k].odds, chance: stored[k].chance, result: stored[k].result } : d.coupons?.[k];
    if (!c) return [k, null];
    const s = withStatus(c, rows);
    return [k, { ...s, target: TARGETS[k], reached: s.legs?.length ? s.odds >= TARGETS[k] * 0.93 : false }];
  }));
  return { ...d, games, coupons, live: games.filter((g) => g.state === "in").length, done: games.filter((g) => g.state === "post").length };
}

// Today's special night, or { none: true } when no big competition plays today.
export async function specialOfTheDay(rows) {
  const day = dayKey();
  const stored = dbEnabled() ? await configGet(`special:${day}`) : memory.get(day) || null;
  if (stored?.games) return withLive(stored, rows);
  const slate = slateOf(rows, day);
  if (!slate) return { day, none: true };
  if (!building.has(day)) building.set(day, build(day, slate, rows).finally(() => building.delete(day)));
  return withLive(await building.get(day), rows);
}
