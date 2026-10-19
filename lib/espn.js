// ESPN public sports feed: fixtures, live state, scores, form, standings, match stats and
// DraftKings odds for every league in lib/leagues.js. Free and keyless. Responses go through
// Next's data cache (`revalidate`) so many visitors share one upstream call.
import { LEAGUES, LEAGUE_BY_ID, LEAGUE_BY_ESPN } from "./leagues";
import { remember } from "./memo";
import { isOddsApiLeague, oaDay, oaSummary } from "./oddsapi-leagues";

const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const V2 = "https://site.api.espn.com/apis/v2/sports";
const path = (leagueId) => `${LEAGUE_BY_ID[leagueId].sport === "soccer" ? "soccer/" + leagueId : sportPath(leagueId)}`;
function sportPath(leagueId) {
  const l = LEAGUE_BY_ID[leagueId];
  const s = { basketball: "basketball", football: "football", hockey: "hockey", baseball: "baseball" }[l.sport];
  return `${s}/${leagueId}`;
}

async function getJson(url, revalidate) {
  const res = await fetch(url, {
    next: { revalidate },
    headers: { accept: "application/json", "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (compatible; SkiiPronos/1.0)" },
  });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}

// ESPN groups days by US Eastern time.
const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etOf = (date) => ET.format(date).replace(/-/g, "");
export function etDay(offsetDays = 0) {
  return etOf(new Date(Date.now() + offsetDays * 86400000));
}

export function amToDec(a) {
  if (a === null || a === undefined || a === "") return null;
  if (typeof a === "string") {
    if (/even/i.test(a)) return 2;
    a = parseFloat(a.replace("+", ""));
  }
  if (!Number.isFinite(a) || a === 0) return null;
  const d = a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
  return Math.round(d * 1000) / 1000;
}

function readOdds(c) {
  const o = c.odds?.[0];
  if (!o) return null;
  const ml = o.moneyline || {};
  const close = (side) => amToDec(ml[side]?.close?.odds ?? ml[side]?.current?.odds);
  const open = (side) => amToDec(ml[side]?.open?.odds);
  const out = {
    provider: o.provider?.name || "DraftKings",
    home: close("home") ?? amToDec(o.homeTeamOdds?.moneyLine),
    away: close("away") ?? amToDec(o.awayTeamOdds?.moneyLine),
    draw: close("draw") ?? amToDec(o.drawOdds?.moneyLine),
    homeOpen: open("home"), awayOpen: open("away"), drawOpen: open("draw"),
    total: null, spread: null,
  };
  const line = Number(o.overUnder);
  if (Number.isFinite(line)) {
    out.total = {
      line,
      over: amToDec(o.total?.over?.close?.odds ?? o.overOdds),
      under: amToDec(o.total?.under?.close?.odds ?? o.underOdds),
    };
  }
  const ps = o.pointSpread;
  if (ps?.home?.close?.line) {
    out.spread = {
      line: parseFloat(ps.home.close.line), // home handicap, e.g. +0.5
      home: amToDec(ps.home.close.odds),
      away: amToDec(ps.away?.close?.odds),
    };
  }
  if (!out.home && !out.away && !out.total) return null;
  return out;
}

function team(cmp) {
  const t = cmp.team || {};
  const rec = cmp.records?.find((r) => r.type === "total")?.summary || cmp.records?.[0]?.summary || "";
  return {
    id: t.id, name: t.displayName || t.name, short: t.shortDisplayName || t.name, abbr: t.abbreviation,
    logo: t.logo || t.logos?.[0]?.href || null, color: t.color ? `#${t.color}` : null,
    score: cmp.score !== undefined && cmp.score !== "" ? Number(cmp.score) : null,
    form: cmp.form || "", record: rec, winner: !!cmp.winner,
  };
}

// Soccer clock: "36'", "45'+2'", "HT". Other sports count down by period, so no minute.
function liveMinute(st, sport) {
  if (sport !== "soccer") return null;
  const m = String(st.displayClock || "").match(/^(\d+)'?(?:\+(\d+))?/);
  if (m) return Number(m[1]) + Number(m[2] || 0);
  if (/half/i.test(st.type?.detail || "")) return 45;
  return st.clock ? Math.round(st.clock / 60) : null;
}

// Hockey / NFL: how a finished game ended — null (regulation), "OT" or "SO". ESPN credits the
// shootout winner with one goal in the final score, so settlement needs this flag; NFL 60-minute and
// overtime markets need to know a game went past regulation.
function hockeyEnding(type) {
  if (!type.completed) return null;
  const d = `${type.shortDetail || ""} ${type.detail || ""}`;
  return /\bSO\b|shootout/i.test(d) ? "SO" : /\b\d*OT\b|overtime/i.test(d) ? "OT" : null; // "OT", "2OT", "3OT"
}

export function normalizeEvent(ev, leagueId) {
  const c = ev.competitions?.[0] || {};
  const home = c.competitors?.find((x) => x.homeAway === "home") || c.competitors?.[0];
  const away = c.competitors?.find((x) => x.homeAway === "away") || c.competitors?.[1];
  const st = ev.status || c.status || {};
  const type = st.type || {};
  const sport = LEAGUE_BY_ID[leagueId].sport;
  const reds = { home: 0, away: 0 };
  for (const d of c.details || []) {
    if (d.redCard) { if (d.team?.id === home?.team?.id) reds.home++; else reds.away++; }
  }
  return {
    id: ev.id,
    league: leagueId,
    sport,
    date: ev.date,
    season: ev.season?.year || undefined, // ESPN's season id (2027 = 2026-27)
    seasonType: ev.season?.type || undefined, // 1 preseason, 2 regular season, 3 playoffs
    ot: sport === "hockey" || sport === "football" ? hockeyEnding(type) : undefined, // NFL: "Final/OT"
    neutral: c.neutralSite ? true : undefined,
    state: type.state || "pre", // pre | in | post
    completed: !!type.completed,
    detail: type.shortDetail || type.detail || "",
    clock: st.displayClock || "",
    minute: type.state === "in" ? liveMinute(st, LEAGUE_BY_ID[leagueId].sport) : null,
    period: st.period || 0,
    postponed: /postpon|cancel|abandon/i.test(type.name || ""),
    home: home ? team(home) : null,
    away: away ? team(away) : null,
    reds,
    venue: c.venue?.fullName || "",
    note: c.notes?.[0]?.headline || "",
    odds: readOdds(c),
  };
}

// Run `fn` over `items` with at most `n` in flight (ESPN throttles big bursts).
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

// Cache lifetime by day: live days refresh fast, future fixtures rarely change.
const ttlFor = (day) => (day === etDay(0) ? 10 : day === etDay(-1) ? 20 : day === etDay(1) ? 300 : 1800);

// One league, one ET day.
export async function scoreboard(leagueId, day) {
  if (isOddsApiLeague(leagueId)) return oaDay(leagueId, day);
  const d = await getJson(`${SITE}/${path(leagueId)}/scoreboard?dates=${day}`, ttlFor(day));
  return (d.events || []).map((e) => normalizeEvent(e, leagueId));
}

// Every soccer league in one call per day; keeps only the leagues in lib/leagues.js. The raw
// response can top 4 MB (above Next's 2 MB fetch-cache limit), so it's memoised here instead.
export async function soccerDay(day) {
  return remember(`soccer:${day}`, ttlFor(day) * 1000, async () => {
    const res = await fetch(`${SITE}/soccer/all/scoreboard?dates=${day}&limit=1000`, { cache: "no-store", headers: { accept: "application/json", "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (compatible; SkiiPronos/1.0)" } });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    const d = await res.json();
    const out = [];
    for (const e of d.events || []) {
      const id = LEAGUE_BY_ESPN[(e.uid || "").match(/~l:(\d+)/)?.[1]];
      if (id) out.push(normalizeEvent(e, id));
    }
    return out;
  });
}

// One league, one calendar month (YYYYMM) → Map(ET day → events). ESPN answers 400 to day
// ranges (dates=A-B), but a whole month is one call of ≤ 300 KB (fits Next's fetch cache);
// parsed once per process every 10 min.
const monthOf = (leagueId, ym) => remember(`month:${leagueId}:${ym}`, 10 * 60e3, async () => {
  const d = await getJson(`${SITE}/${path(leagueId)}/scoreboard?dates=${ym}&limit=1000`, 1800);
  const byDay = new Map();
  for (const e of d.events || []) {
    if (!e.date) continue;
    const day = etOf(new Date(e.date));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(normalizeEvent(e, leagueId));
  }
  return byDay;
});
// "20261030", "20261102" → ["202610", "202611"]
function monthsBetween(fromDay, toDay) {
  const out = [];
  let y = Number(fromDay.slice(0, 4)), m = Number(fromDay.slice(4, 6));
  while (out.length < 4) {
    const ym = `${y}${String(m).padStart(2, "0")}`;
    out.push(ym);
    if (ym >= toDay.slice(0, 6)) break;
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

const prevMonth = (ym) => { let y = Number(ym.slice(0, 4)), m = Number(ym.slice(4, 6)) - 1; if (m < 1) { m = 12; y--; } return `${y}${String(m).padStart(2, "0")}`; };

// One league, every ET day from `fromDay` to `toDay` (YYYYMMDD), from the month calls (30 min cache).
export async function scoreboardRange(leagueId, fromDay, toDay) {
  const out = [];
  for (const ym of monthsBetween(fromDay, toDay)) {
    for (const [day, evs] of await monthOf(leagueId, ym)) if (day >= fromDay && day <= toDay) out.push(...evs);
  }
  return out;
}

// Every league, `from` (yesterday) through `days` ahead. Football: one call per day. Other
// sports: one month call per league covers the other days and shows which games around today
// aren't final yet; only those leagues get fresh per-day calls for yesterday/today (live
// scores). One failing call never breaks the board; more than half failing does.
export async function board(days = 2, from = -1) {
  const failed = [];
  let calls = 0;
  const attempt = (label, fn) => { calls++; return fn().catch((e) => { failed.push(`${label}: ${e.message}`); return null; }); };
  const fresh = [];
  for (let i = Math.max(from, -1); i <= Math.min(days, 0); i++) fresh.push(i);
  const lo = etDay(from), hi = etDay(days);
  // months for the window plus a day either side of the fresh days
  const months = monthsBetween(etDay(Math.min(from, fresh.length ? fresh[0] - 1 : from)), etDay(Math.max(days, fresh.length ? fresh.at(-1) + 1 : days)));

  const leagueWindow = async (id) => {
    const byDay = new Map();
    let complete = true;
    // NFL teams play weekly: the month before the window gives every team's previous game (rest
    // days, bye weeks) when the window starts early in a month
    const own = LEAGUE_BY_ID[id]?.sport === "football" ? [prevMonth(months[0]), ...months] : months;
    for (const ym of own) {
      const m = await attempt(`${id}/${ym}`, () => monthOf(id, ym));
      if (m) for (const [d, evs] of m) byDay.set(d, evs); else complete = false;
    }
    const out = new Map();
    for (const [d, evs] of byDay) if (d >= lo && d <= hi) for (const e of evs) out.set(e.id, e);
    attachRest([...byDay.values()].flat(), out);
    const live = [];
    for (const i of fresh) {
      // no call needed when every game that day is already final, or nothing is scheduled
      // within a day of it (off-season, rest day)
      const evs = byDay.get(etDay(i)) || [];
      if (complete && (evs.length ? evs.every((e) => e.completed) : ![i - 1, i + 1].some((k) => byDay.has(etDay(k))))) continue;
      const list = await attempt(`${id}/${etDay(i)}`, () => scoreboard(id, etDay(i)));
      if (list) live.push([etDay(i), list]); // on failure the month copy of that day stays
    }
    // fresh days replace their (up to 30 min old) month copy (keeping the schedule context)
    for (const [d] of live) for (const e of byDay.get(d) || []) out.delete(e.id);
    for (const [, list] of live) for (const e of list) { const prev = [...byDay.values()].flat().find((x) => x.id === e.id); if (prev?.rest) e.rest = prev.rest; out.set(e.id, e); }
    return [...out.values()];
  };

  const tasks = [];
  for (let i = from; i <= days; i++) tasks.push(["soccer", etDay(i)]);
  for (const l of LEAGUES) if (l.sport !== "soccer" && !l.source) tasks.push([l.id]); // Odds API leagues: lib/oddsapi-leagues.js
  const results = await pool(tasks, 6, ([id, day]) => (id === "soccer" ? attempt(`soccer/${day}`, () => soccerDay(day)) : leagueWindow(id)));
  if (failed.length) console.warn(`[espn] ${failed.length}/${calls} scoreboard calls failed, e.g. ${failed.slice(0, 3).join(" | ")}`);
  if (failed.length > calls / 2) throw new Error(`ESPN feed unavailable (${failed[0]})`);
  const seen = new Map();
  for (const list of results) for (const e of list || []) if (e.home && e.away) seen.set(e.id, e);
  return [...seen.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Rest days for every game in `window` (Map id → event) from the league's schedule `all`: days
// between a side's previous game and this one (0 = back-to-back, within 30 hours). Unknown when the
// loaded months hold no earlier game for that team.
function attachRest(all, window) {
  const byTeam = new Map();
  for (const e of all) {
    if (e.postponed || (e.sport === "football" && e.seasonType === 1)) continue; // NFL preseason: not a real previous game
    for (const sd of ["home", "away"]) { const id = e[sd]?.id; if (!id) continue; if (!byTeam.has(id)) byTeam.set(id, []); byTeam.get(id).push(e); }
  }
  for (const list of byTeam.values()) list.sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const e of window.values()) {
    const t = new Date(e.date).getTime();
    const rest = {};
    for (const sd of ["home", "away"]) {
      const list = byTeam.get(e[sd]?.id) || [];
      let prev = null;
      for (const g of list) { const gt = new Date(g.date).getTime(); if (gt < t && g.id !== e.id) prev = gt; else if (gt >= t) break; }
      const h = prev === null ? null : (t - prev) / 3.6e6;
      rest[sd] = h === null || (e.sport === "football" && h > 20 * 24) ? null : h < 30 ? 0 : Math.max(1, Math.floor(h / 24));
    }
    e.rest = rest;
  }
}

// The closing line ESPN kept for a finished game (core API: DraftKings this season, ESPN BET before).
// Decimal prices: moneyline / 1X2 (h, d, a), the total (tl line, to over, tu under), the home spread
// (sl line, sh / sa) and the opening moneyline (ho, do, ao). null when no book kept a closing price.
const decOf = (x) => (x && Number.isFinite(x.decimal) ? x.decimal : null);
export function parseClosing(d) {
  const items = d?.items || [];
  const rank = (p) => (/draftkings$/i.test(p) ? 0 : /^espn bet$/i.test(p) ? 1 : /live/i.test(p) ? 9 : 5);
  const cands = items.filter((i) => i.provider?.name && decOf(i.homeTeamOdds?.close?.moneyLine) && decOf(i.awayTeamOdds?.close?.moneyLine))
    .sort((a, b) => rank(a.provider.name) - rank(b.provider.name));
  const i = cands[0];
  if (!i) return null;
  const h = i.homeTeamOdds, a = i.awayTeamOdds;
  const line = (x) => { const v = Number(x?.american ?? x?.alternateDisplayValue); return Number.isFinite(v) ? v : null; };
  return {
    provider: i.provider.name,
    h: decOf(h.close.moneyLine), d: decOf(i.close?.draw), a: decOf(a.close.moneyLine),
    ho: decOf(h.open?.moneyLine), do: decOf(i.open?.draw), ao: decOf(a.open?.moneyLine),
    tl: line(i.close?.total) ?? (Number.isFinite(Number(i.overUnder)) ? Number(i.overUnder) : null), to: decOf(i.close?.over), tu: decOf(i.close?.under),
    sl: line(h.close?.pointSpread), sh: decOf(h.close?.spread), sa: decOf(a.close?.spread),
  };
}
export async function closingLine(league, eventId) {
  const l = LEAGUE_BY_ID[league];
  if (!l || isOddsApiLeague(league)) return null;
  try {
    const d = await getJson(`https://sports.core.api.espn.com/v2/sports/${l.sport}/leagues/${league}/events/${eventId}/competitions/${eventId}/odds`, 6 * 3600);
    return parseClosing(d);
  } catch {
    return null;
  }
}

// Season statistics of one team (hockey): shots for/against, special teams, goaltending. From
// ESPN's core API; `season` is ESPN's season id (2027 = 2026-27). Cached for six hours.
export async function teamStats(leagueId, teamId, season) {
  const l = LEAGUE_BY_ID[leagueId];
  if (!l || !season) return null;
  return remember(`tstats:${leagueId}:${teamId}:${season}`, 6 * 3600e3, async () => {
    try {
      const d = await getJson(`https://sports.core.api.espn.com/v2/sports/${l.sport}/leagues/${leagueId}/seasons/${season}/types/2/teams/${teamId}/statistics`, 6 * 3600);
      const cats = {};
      // first occurrence wins: NFL repeats totalYards in several categories, and "interceptions"
      // means thrown under passing but made under defensiveInterceptions
      for (const c of d.splits?.categories || []) for (const s of c.stats || []) if (cats[s.name] === undefined) cats[s.name] = s.value;
      const games = cats.games ?? cats.gamesPlayed ?? cats.teamGamesPlayed;
      if (!(games > 0)) return null;
      if (l.sport === "football") {
        return { games, plays: cats.totalOffensivePlays ?? null, yards: cats.netTotalYards ?? cats.totalYards ?? null, giveaways: cats.totalGiveaways ?? null, takeaways: cats.totalTakeaways ?? null, points: cats.totalPoints ?? null };
      }
      return {
        games, shotsFor: cats.shotsTotal ?? null, shotsAgainst: cats.shotsAgainst ?? null,
        shootingPct: cats.shootingPct ?? null, savePct: cats.savePct ?? null, ppPct: cats.powerPlayPct ?? null, pkPct: cats.penaltyKillPct ?? null,
      };
    } catch {
      return null;
    }
  });
}

// League table → goals for/against per game, used by the stats half of the model. Hockey rows also
// carry OT losses and the last-ten record ("6-1-1") for the strength model's form term.
export async function standings(leagueId) {
  if (isOddsApiLeague(leagueId)) return {}; // the feed has no tables
  try {
    const d = await getJson(`${V2}/${path(leagueId)}/standings`, 3600);
    const groups = [];
    const walk = (g) => { if (g.standings?.entries) groups.push(g); for (const c of g.children || []) walk(c); };
    walk(d);
    const table = {};
    for (const g of groups) {
      for (const e of g.standings?.entries || []) {
        const s = Object.fromEntries((e.stats || []).map((x) => [x.name, x.value]));
        const dv = Object.fromEntries((e.stats || []).map((x) => [x.name, x.displayValue]));
        table[e.team?.id] = {
          name: e.team?.displayName, gp: s.gamesPlayed ?? (s.wins || 0) + (s.losses || 0) + (s.ties || 0) + (s.otLosses ?? s.OTLosses ?? 0), // NFL tables list no games played
          w: s.wins || 0, d: s.ties || 0, l: s.losses || 0,
          gf: s.pointsFor || 0, ga: s.pointsAgainst || 0, pts: s.points || 0, rank: s.rank || null,
          otl: s.otLosses ?? s.OTLosses ?? 0, l10: dv["Last Ten Games"] || null,
        };
      }
    }
    return table;
  } catch {
    return {};
  }
}

const statOf = (team, name) => {
  const s = team?.statistics?.find((x) => x.name === name);
  return s ? Number(s.displayValue ?? s.value) : null;
};

// Full match page: live stats, timeline, recent results, standings, lineups.
export async function summary(leagueId, eventId, live = false) {
  if (isOddsApiLeague(leagueId)) return oaSummary(leagueId, eventId);
  const d = await getJson(`${SITE}/${path(leagueId)}/summary?event=${eventId}`, live ? 15 : 300);
  const comp = d.header?.competitions?.[0] || {};
  const ev = normalizeEvent({ id: eventId, date: comp.date, status: comp.status, competitions: [{ ...comp, odds: d.pickcenter?.length ? null : comp.odds }] }, leagueId);
  // pickcenter has the same DraftKings odds in a flatter shape
  if (!ev.odds && d.pickcenter?.[0]) {
    const p = d.pickcenter[0];
    ev.odds = {
      provider: p.provider?.name || "DraftKings",
      home: amToDec(p.homeTeamOdds?.moneyLine), away: amToDec(p.awayTeamOdds?.moneyLine), draw: amToDec(p.drawOdds?.moneyLine),
      homeOpen: amToDec(p.homeTeamOdds?.open?.moneyLine?.american ?? p.homeTeamOdds?.open?.moneyLine),
      awayOpen: amToDec(p.awayTeamOdds?.open?.moneyLine?.american ?? p.awayTeamOdds?.open?.moneyLine),
      drawOpen: null,
      total: Number.isFinite(Number(p.overUnder)) ? { line: Number(p.overUnder), over: amToDec(p.overOdds), under: amToDec(p.underOdds) } : null,
      // pickcenter's spread is the home team's line ("JAX -2.5" at home → -2.5); it stays during play
      spread: Number.isFinite(Number(p.spread)) && p.homeTeamOdds?.spreadOdds && p.awayTeamOdds?.spreadOdds
        ? { line: Number(p.spread), home: amToDec(p.homeTeamOdds.spreadOdds), away: amToDec(p.awayTeamOdds.spreadOdds) } : null,
    };
    if (!ev.odds.home && !ev.odds.away && !ev.odds.total) ev.odds = null;
  }

  const box = d.boxscore?.teams || [];
  const side = (id) => box.find((t) => t.team?.id === id);
  const stats = {};
  const keys = ["possessionPct", "totalShots", "shotsOnTarget", "wonCorners", "foulsCommitted", "yellowCards", "redCards", "saves", "offsides", "accuratePasses", "totalPasses",
    "fieldGoalPct", "threePointFieldGoalPct", "totalRebounds", "assists", "turnovers",
    "shotsTotal", "hits", "blockedShots", "powerPlayGoals", "powerPlayOpportunities", "faceoffsWon", "penaltyMinutes", "giveaways", "takeaways",
    "firstDowns", "totalOffensivePlays", "totalYards", "yardsPerPlay", "netPassingYards", "rushingYards", "turnovers"];
  for (const k of keys) {
    const h = statOf(side(ev.home?.id), k), a = statOf(side(ev.away?.id), k);
    if (h !== null || a !== null) stats[k === "shotsTotal" ? "shots" : k] = { home: h, away: a };
  }

  const timeline = (d.keyEvents || [])
    .filter((k) => k.type?.text && !/delay|kickoff|halftime|end|start/i.test(k.type.text) || k.scoringPlay)
    .map((k) => ({
      minute: k.clock?.displayValue || "",
      type: k.type?.text || "",
      text: k.text || k.shortText || "",
      side: k.team?.id === ev.home?.id ? "home" : k.team?.id === ev.away?.id ? "away" : null,
      goal: !!k.scoringPlay,
    }));

  const lastFive = (d.lastFiveGames || []).map((t) => ({
    teamId: t.team?.id,
    games: (t.events || []).map((g) => ({ result: g.gameResult, score: g.score, opponent: g.opponent?.displayName, at: g.atVs, date: g.gameDate })),
  }));
  const formOf = (id) => lastFive.find((t) => t.teamId === id)?.games || [];

  const table = [];
  for (const g of d.standings?.groups || []) {
    for (const e of g.standings?.entries || []) {
      const s = Object.fromEntries((e.stats || []).map((x) => [x.name, x.value]));
      table.push({ id: e.id, team: e.team, gp: s.gamesPlayed, w: s.wins, d: s.ties, l: s.losses, gf: s.pointsFor, ga: s.pointsAgainst, pts: s.points, rank: s.rank });
    }
  }

  const lineups = (d.rosters || []).map((r) => ({
    teamId: r.team?.id, formation: r.formation || "",
    starters: (r.roster || []).filter((p) => p.starter).map((p) => ({ name: p.athlete?.displayName, pos: p.position?.abbreviation, jersey: p.jersey })),
  }));

  const h2h = (d.headToHeadGames?.[0]?.events || []).slice(0, 6).map((g) => ({ date: g.gameDate, score: g.score, result: g.gameResult, home: g.homeTeamId, away: g.awayTeamId }));
  const commentary = (d.commentary || []).slice(-12).reverse().map((c) => ({ minute: c.time?.displayValue || "", text: c.text }));

  return {
    event: ev, stats, timeline, form: { home: formOf(ev.home?.id), away: formOf(ev.away?.id) },
    table, lineups, h2h, commentary,
    news: (d.news?.articles || []).slice(0, 3).map((a) => ({ headline: a.headline, link: a.links?.web?.href })),
  };
}
