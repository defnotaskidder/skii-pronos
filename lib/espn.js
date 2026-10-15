// ESPN public sports feed: fixtures, live state, scores, form, standings, match stats and
// DraftKings odds for every league in lib/leagues.js. Free and keyless. Responses go through
// Next's data cache (`revalidate`) so many visitors share one upstream call.
import { LEAGUES, LEAGUE_BY_ID, LEAGUE_BY_ESPN } from "./leagues";

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
export function etDay(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts.replace(/-/g, "");
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

export function normalizeEvent(ev, leagueId) {
  const c = ev.competitions?.[0] || {};
  const home = c.competitors?.find((x) => x.homeAway === "home") || c.competitors?.[0];
  const away = c.competitors?.find((x) => x.homeAway === "away") || c.competitors?.[1];
  const st = ev.status || c.status || {};
  const type = st.type || {};
  const reds = { home: 0, away: 0 };
  for (const d of c.details || []) {
    if (d.redCard) { if (d.team?.id === home?.team?.id) reds.home++; else reds.away++; }
  }
  return {
    id: ev.id,
    league: leagueId,
    sport: LEAGUE_BY_ID[leagueId].sport,
    date: ev.date,
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
  const d = await getJson(`${SITE}/${path(leagueId)}/scoreboard?dates=${day}`, ttlFor(day));
  return (d.events || []).map((e) => normalizeEvent(e, leagueId));
}

// Every soccer league in one call per day; keeps only the leagues in lib/leagues.js.
export async function soccerDay(day) {
  const d = await getJson(`${SITE}/soccer/all/scoreboard?dates=${day}&limit=1000`, ttlFor(day));
  const out = [];
  for (const e of d.events || []) {
    const id = LEAGUE_BY_ESPN[(e.uid || "").match(/~l:(\d+)/)?.[1]];
    if (id) out.push(normalizeEvent(e, id));
  }
  return out;
}

// Every league, yesterday through `days` ahead: one soccer call per day plus one per
// other-sport league per day (~24 upstream calls). One failing call never breaks the board.
export async function board(days = 2, from = -1) {
  const tasks = [];
  for (let i = from; i <= days; i++) {
    const day = etDay(i);
    tasks.push(["soccer", day]);
    for (const l of LEAGUES) if (l.sport !== "soccer") tasks.push([l.id, day]);
  }
  const failed = [];
  const results = await pool(tasks, 6, ([id, day]) => (id === "soccer" ? soccerDay(day) : scoreboard(id, day))
    .catch((e) => { failed.push(`${id}/${day}: ${e.message}`); return []; }));
  if (failed.length) console.warn(`[espn] ${failed.length}/${tasks.length} scoreboard calls failed, e.g. ${failed.slice(0, 3).join(" | ")}`);
  if (failed.length > tasks.length / 2) throw new Error(`ESPN feed unavailable (${failed[0]})`);
  const seen = new Map();
  for (const list of results) for (const e of list) seen.set(e.id, e);
  return [...seen.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

// League table → goals for/against per game, used by the stats half of the model.
export async function standings(leagueId) {
  try {
    const d = await getJson(`${V2}/${path(leagueId)}/standings`, 3600);
    const groups = d.children?.length ? d.children : [d];
    const table = {};
    for (const g of groups) {
      for (const e of g.standings?.entries || []) {
        const s = Object.fromEntries((e.stats || []).map((x) => [x.name, x.value]));
        table[e.team?.id] = {
          name: e.team?.displayName, gp: s.gamesPlayed || 0, w: s.wins || 0, d: s.ties || 0, l: s.losses || 0,
          gf: s.pointsFor || 0, ga: s.pointsAgainst || 0, pts: s.points || 0, rank: s.rank || null,
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
      spread: null,
    };
    if (!ev.odds.home && !ev.odds.away && !ev.odds.total) ev.odds = null;
  }

  const box = d.boxscore?.teams || [];
  const side = (id) => box.find((t) => t.team?.id === id);
  const stats = {};
  const keys = ["possessionPct", "totalShots", "shotsOnTarget", "wonCorners", "foulsCommitted", "yellowCards", "redCards", "saves", "offsides", "accuratePasses", "totalPasses",
    "fieldGoalPct", "threePointFieldGoalPct", "totalRebounds", "assists", "turnovers"];
  for (const k of keys) {
    const h = statOf(side(ev.home?.id), k), a = statOf(side(ev.away?.id), k);
    if (h !== null || a !== null) stats[k] = { home: h, away: a };
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
