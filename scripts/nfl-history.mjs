// Downloads the NFL history the trainer needs into .cache/nfl (resumable, gentle on ESPN):
//   months/<YYYYMM>.json  scoreboards (results, quarters, OT flag)
//   odds/<eventId>.json   every pre-game line ESPN kept (spread, total, moneylines per book)
//   box/<eventId>.json    both teams' box score (plays, yards, turnovers, sacks, drives…)
//
//   node scripts/nfl-history.mjs [--from 2015] [--to 2026] [--box false] [--concurrency 4]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : null)).filter(Boolean));
// default end: the NFL season under way (a season starts in August and carries its start year)
const now = new Date();
const FROM = Number(args.from || 2015), TO = Number(args.to || (now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1));
const FRANCHISES = new Set([...Array.from({ length: 30 }, (_, i) => String(i + 1)), "33", "34"]); // ESPN ids of the 32 teams
const BOX = args.box !== "false";
const CONC = Math.max(1, Number(args.concurrency || 4));
const DIR = path.join(ROOT, ".cache", "nfl");
for (const d of ["months", "odds", "box"]) fs.mkdirSync(path.join(DIR, d), { recursive: true });
const UA = { accept: "application/json", "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (compatible; SkiiPronos/1.0)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 6) {
  let wait = 1500;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      if (res.status !== 403 && res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    } catch (e) { if (i === tries - 1) throw e; }
    await sleep(wait); wait *= 2; // Akamai throttles bursts: back off
  }
  throw new Error(`gave up on ${url}`);
}

async function pool(items, n, fn) {
  let i = 0, done = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      try { await fn(items[k]); } catch (e) { console.warn(`  ${items[k].id || items[k]}: ${e.message}`); }
      if (++done % 200 === 0) console.log(`  ${done}/${items.length}`);
      await sleep(120);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

// ---------- months ----------
const months = [];
for (let y = FROM; y <= TO; y++) {
  for (const m of [8, 9, 10, 11, 12]) months.push(`${y}${String(m).padStart(2, "0")}`);
  for (const m of [1, 2]) months.push(`${y + 1}${String(m).padStart(2, "0")}`);
}
const nowYm = new Date().toISOString().slice(0, 7).replace("-", "");
const games = new Map();
for (const ym of months) {
  if (ym > nowYm) continue;
  const file = path.join(DIR, "months", `${ym}.json`);
  const legacy = path.join(DIR, `${ym}.json`); // first downloads sat at the top level
  if (!fs.existsSync(file) && fs.existsSync(legacy)) fs.renameSync(legacy, file);
  let d;
  // the current month changes every week: always refresh it
  if (fs.existsSync(file) && ym !== nowYm) d = JSON.parse(fs.readFileSync(file, "utf8"));
  else { d = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${ym}&limit=1000`); fs.writeFileSync(file, JSON.stringify(d)); await sleep(400); }
  for (const e of d?.events || []) {
    const c = e.competitions?.[0];
    if (!c?.status?.type?.completed || ![2, 3].includes(e.season?.type)) continue;
    if (c.competitors.some((x) => !FRANCHISES.has(String(x.team?.id)))) continue; // Pro Bowl & all-star teams
    games.set(e.id, { id: e.id, teams: c.competitors.map((x) => x.team.id) });
  }
}
console.log(`${games.size} games ${FROM}-${TO}`);

// ---------- closing lines ----------
const num = (x) => (x === null || x === undefined || x === "" ? null : Number(x));
const amer = (x) => { if (x === null || x === undefined) return null; const v = typeof x === "object" ? x.american ?? x.alternateDisplayValue : x; if (v === undefined || v === null) return null; if (/even/i.test(String(v))) return 100; const n = parseFloat(String(v).replace("+", "")); return Number.isFinite(n) ? n : null; };
function compactOdds(d) {
  return (d?.items || []).map((it) => ({
    id: it.provider?.id, name: it.provider?.name, details: it.details || null,
    spread: num(it.spread), total: num(it.overUnder), overOdds: num(it.overOdds), underOdds: num(it.underOdds),
    homeFav: it.homeTeamOdds?.favorite ?? null,
    mlH: num(it.homeTeamOdds?.moneyLine), mlA: num(it.awayTeamOdds?.moneyLine),
    spH: num(it.homeTeamOdds?.spreadOdds), spA: num(it.awayTeamOdds?.spreadOdds),
    open: it.homeTeamOdds?.open ? { mlH: amer(it.homeTeamOdds.open.moneyLine), mlA: amer(it.awayTeamOdds?.open?.moneyLine), spread: num(String(it.homeTeamOdds.open.pointSpread?.american ?? "").replace("+", "")) } : null,
  })).filter((x) => x.spread !== null || x.total !== null || x.mlH !== null);
}
const todoOdds = [...games.values()].filter((g) => !fs.existsSync(path.join(DIR, "odds", `${g.id}.json`)));
console.log(`odds: ${todoOdds.length} to fetch`);
await pool(todoOdds, CONC, async (g) => {
  const d = await get(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${g.id}/competitions/${g.id}/odds?limit=50`);
  fs.writeFileSync(path.join(DIR, "odds", `${g.id}.json`), JSON.stringify(compactOdds(d)));
});

// ---------- box scores ----------
const KEEP = ["totalOffensivePlays", "totalYards", "netPassingYards", "rushingYards", "passingAttempts", "rushingAttempts", "interceptions", "fumblesLost",
  "sacks", "firstDowns", "totalDrives", "possessionTimeSeconds", "thirdDownConvPct", "totalPenaltiesYards", "netYardsPerPassAttempt", "yardsPerRushAttempt"];
if (BOX) {
  const todoBox = [...games.values()].filter((g) => !fs.existsSync(path.join(DIR, "box", `${g.id}.json`)));
  console.log(`box scores: ${todoBox.length} to fetch`);
  await pool(todoBox, CONC, async (g) => {
    const out = {};
    for (const t of g.teams) {
      const d = await get(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${g.id}/competitions/${g.id}/competitors/${t}/statistics`);
      const s = {};
      for (const c of d?.splits?.categories || []) for (const x of c.stats || []) if (KEEP.includes(x.name) && s[x.name] === undefined && x.value !== undefined) s[x.name] = x.value;
      // offensive interceptions live under "passing", defensive ones under "defensiveInterceptions": keep passing's
      for (const c of d?.splits?.categories || []) if (c.name === "passing") for (const x of c.stats || []) if (x.name === "interceptions") s.interceptions = x.value;
      out[t] = s;
    }
    fs.writeFileSync(path.join(DIR, "box", `${g.id}.json`), JSON.stringify(out));
  });
}
console.log("done");
