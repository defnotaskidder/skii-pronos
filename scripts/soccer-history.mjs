// Downloads the football history the soccer trainer needs into .cache/soccer (resumable, gentle on ESPN):
//   months/<league>/<YYYYMM>.json   one month of a league's scoreboard (results, form, season, neutral site)
//   odds/<league>.json              per finished game, the closing (and opening) line ESPN kept — DraftKings
//                                   this season, ESPN BET before — 1X2, total, spread. The core API keeps
//                                   them after the game, unlike the scoreboard.
//
//   node scripts/soccer-history.mjs [--from 202407] [--odds false] [--concurrency 4] [--leagues eng.1,esp.1]
//
// Leagues: every domestic league in lib/leagues.js (tier ≤ 4) plus the continental club competitions and
// the main domestic cups. National-team competitions, youth and women's football are left out (the
// trainer's online strength model is for clubs with a steady schedule).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : null)).filter(Boolean));
const FROM = String(args.from || "202407");
const ODDS = args.odds !== "false";
const CONC = Math.max(1, Number(args.concurrency || 4));
const DIR = path.join(ROOT, ".cache", "soccer");
fs.mkdirSync(path.join(DIR, "months"), { recursive: true });
fs.mkdirSync(path.join(DIR, "odds"), { recursive: true });
const UA = { accept: "application/json", "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (compatible; SkiiPronos/1.0)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowYm = new Date().toISOString().slice(0, 7).replace("-", "");

// ---------- which leagues ----------
const CUPS = new Set([
  "uefa.champions", "uefa.europa", "uefa.europa.conf", "conmebol.libertadores", "conmebol.sudamericana", "concacaf.champions",
  "caf.champions", "afc.champions", "eng.fa", "eng.league_cup", "esp.copa_del_rey", "ger.dfb_pokal", "ita.coppa_italia",
  "fra.coupe_de_france", "por.taca.portugal", "ned.cup", "bra.copa_do_brazil", "arg.copa", "usa.open", "concacaf.leagues.cup",
]);
function leagueList() {
  if (args.leagues) return String(args.leagues).split(",").map((s) => s.trim()).filter(Boolean);
  const src = fs.readFileSync(path.join(ROOT, "lib", "leagues.js"), "utf8");
  const curated = [...src.matchAll(/\{ id: "([a-z0-9._]+)", espn: \d+, sport: "soccer"/g)].map((m) => m[1]);
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "soccer-leagues.json"), "utf8"));
  const domestic = catalog.filter(([, slug, , women]) => !women && /^[a-z]+\.\d$/.test(slug) && !/^(usa\.ncaa|fifa|uefa|nonfifa)/.test(slug)).map(([, slug]) => slug);
  const cups = catalog.filter(([, slug]) => CUPS.has(slug)).map(([, slug]) => slug);
  return [...new Set([...curated, ...domestic, ...cups])];
}

// ---------- fetching ----------
async function get(url, tries = 6) {
  let wait = 1500;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return await res.json();
      if (res.status === 404 || res.status === 400) return null;
      if (res.status !== 403 && res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    } catch (e) { if (i === tries - 1) throw e; }
    await sleep(wait); wait *= 2; // Akamai throttles bursts: back off
  }
  throw new Error(`gave up on ${url}`);
}
async function pool(items, n, fn, label) {
  let i = 0, done = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      try { await fn(items[k]); } catch (e) { console.warn(`  ${label} ${JSON.stringify(items[k]).slice(0, 60)}: ${e.message}`); }
      if (++done % 250 === 0) console.log(`  ${label} ${done}/${items.length}`);
      await sleep(100);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

// ---------- months ----------
function monthsFrom(from) {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(4, 6));
  while (`${y}${String(m).padStart(2, "0")}` <= nowYm) { out.push(`${y}${String(m).padStart(2, "0")}`); if (++m > 12) { m = 1; y++; } }
  return out;
}
async function month(league, ym) {
  const dir = path.join(DIR, "months", league);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${ym}.json`);
  // the current month and the one before it are refreshed (late results, postponed games replayed)
  const fresh = ym >= monthsFrom(FROM).at(-2);
  if (fs.existsSync(file) && fs.statSync(file).size > 50 && !fresh) return;
  const d = await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${ym}&limit=1000`);
  // keep only what the trainer reads (a month of a big league is 300 KB raw)
  const events = (d?.events || []).map((e) => {
    const c = e.competitions?.[0] || {};
    const st = c.status?.type || {};
    return {
      id: e.id, date: e.date, season: e.season?.year, seasonType: e.season?.type, name: e.name,
      state: st.state, completed: !!st.completed, detail: st.shortDetail || st.detail || "", neutral: !!c.neutralSite,
      competitors: (c.competitors || []).map((x) => ({ id: x.team?.id, name: x.team?.displayName, homeAway: x.homeAway, score: x.score, form: x.form, winner: x.winner })),
    };
  });
  fs.writeFileSync(file, JSON.stringify({ league, ym, events }));
}

// ---------- odds ----------
// The closing line of one finished game, from the book that has one (DraftKings this season, ESPN BET
// earlier). Decimal prices. null when no book kept a 1X2 line.
const dec = (x) => (x && Number.isFinite(x.decimal) ? x.decimal : null);
export function parseOdds(d) {
  const items = d?.items || [];
  const rank = (p) => (/draftkings$/i.test(p) ? 0 : /^espn bet$/i.test(p) ? 1 : /live/i.test(p) ? 9 : 5);
  const cands = items.filter((i) => i.provider?.name && dec(i.homeTeamOdds?.close?.moneyLine) && dec(i.awayTeamOdds?.close?.moneyLine) && dec(i.close?.draw))
    .sort((a, b) => rank(a.provider.name) - rank(b.provider.name));
  const i = cands[0];
  if (!i) return null;
  const h = i.homeTeamOdds, a = i.awayTeamOdds;
  const line = (x) => { const v = Number(x?.american ?? x?.alternateDisplayValue); return Number.isFinite(v) ? v : null; };
  return {
    prov: i.provider.name,
    h: dec(h.close.moneyLine), d: dec(i.close.draw), a: dec(a.close.moneyLine),
    ho: dec(h.open?.moneyLine), do: dec(i.open?.draw), ao: dec(a.open?.moneyLine),
    tl: line(i.close?.total) ?? (Number.isFinite(Number(i.overUnder)) ? Number(i.overUnder) : null), to: dec(i.close?.over), tu: dec(i.close?.under),
    tlo: line(i.open?.total), too: dec(i.open?.over), tuo: dec(i.open?.under),
    sl: line(h.close?.pointSpread), sh: dec(h.close?.spread), sa: dec(a.close?.spread),
  };
}

function gamesOf(league) {
  const dir = path.join(DIR, "months", league);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const e of d.events || []) if (e.completed) out.push(e);
  }
  return out;
}

async function oddsFor(league) {
  const file = path.join(DIR, "odds", `${league}.json`);
  const store = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { league, probed: false, priced: null, games: {} };
  const games = gamesOf(league).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!games.length) return;
  const url = (id) => `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${league}/events/${id}/competitions/${id}/odds`;
  // probe: does any book keep a closing 1X2 line for this league? (three recent games)
  if (!store.probed) {
    let hits = 0;
    for (const g of games.slice(0, 3)) { const o = parseOdds(await get(url(g.id))); store.games[g.id] = o; if (o) hits++; await sleep(150); }
    store.probed = true; store.priced = hits > 0;
    fs.writeFileSync(file, JSON.stringify(store));
  }
  if (!store.priced) return;
  const todo = games.filter((g) => !(g.id in store.games));
  let n = 0;
  await pool(todo, CONC, async (g) => {
    store.games[g.id] = parseOdds(await get(url(g.id)));
    if (++n % 100 === 0) fs.writeFileSync(file, JSON.stringify(store));
  }, `odds ${league}`);
  fs.writeFileSync(file, JSON.stringify(store));
  const priced = Object.values(store.games).filter(Boolean).length;
  console.log(`  ${league}: ${priced}/${Object.keys(store.games).length} games with a closing line`);
}

// ---------- main ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const leagues = leagueList();
  const months = monthsFrom(FROM);
  console.log(`${leagues.length} leagues × ${months.length} months from ${FROM}`);
  const t0 = Date.now();
  const jobs = leagues.flatMap((l) => months.map((ym) => ({ l, ym })));
  await pool(jobs, Math.min(CONC, 3), ({ l, ym }) => month(l, ym), "months");
  console.log(`months done in ${Math.round((Date.now() - t0) / 1000)} s`);
  if (ODDS) {
    // curated (big) leagues first, so a partial run already covers what matters most
    for (const l of leagues) await oddsFor(l);
    console.log(`odds done in ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  console.log("done");
}
