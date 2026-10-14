// The Odds API (optional): multi-bookmaker prices (1xBet, Pinnacle, Bet365 …) for the
// comparison panel. Every call costs credits, so responses sit in Next's data cache for
// ODDS_CACHE_MIN minutes (default 30), shared by all visitors.
const BASE = "https://api.the-odds-api.com/v4";

export const oddsEnabled = () => !!process.env.ODDS_API_KEY;

export function regions() {
  return (process.env.ODDS_REGIONS || "eu").trim();
}

export function bookmakerPrefs() {
  return (process.env.ODDS_BOOKMAKERS || "onexbet,pinnacle,bet365,unibet_eu,williamhill,betclic")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

export async function oddsApi(path, params = {}) {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("ODDS_API_KEY is not set.");
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && url.searchParams.set(k, v));
  url.searchParams.set("apiKey", key);
  const ttl = Math.max(5, Number(process.env.ODDS_CACHE_MIN) || 30) * 60;
  const res = await fetch(url.toString(), { next: { revalidate: ttl } });
  const quota = { remaining: res.headers.get("x-requests-remaining"), used: res.headers.get("x-requests-used") };
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Odds API ${res.status}: ${body.slice(0, 200)}`);
  }
  return { data: await res.json(), quota };
}

// Team names differ between feeds ("Man United" vs "Manchester United FC"): compare tokens.
const STOP = new Set(["fc", "cf", "afc", "sc", "ac", "as", "cd", "ud", "sd", "rc", "fk", "sk", "if", "bk", "club", "de", "the", "calcio", "1", "04", "05"]);
const tokens = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));
const ALIAS = { utd: "united", man: "manchester", st: "saint", inter: "internazionale", psg: "paris" };
function similar(a, b) {
  const A = tokens(a).map((t) => ALIAS[t] || t), B = tokens(b).map((t) => ALIAS[t] || t);
  if (!A.length || !B.length) return 0;
  let hit = 0;
  for (const t of A) if (B.some((u) => u === t || (t.length >= 4 && (u.startsWith(t) || t.startsWith(u))))) hit++;
  return hit / Math.min(A.length, B.length);
}

export function findEvent(list, ev) {
  const t = new Date(ev.date).getTime();
  let best = null, score = 0;
  for (const o of list) {
    if (Math.abs(new Date(o.commence_time).getTime() - t) > 6 * 3600e3) continue;
    const s = Math.min(similar(o.home_team, ev.home.name), similar(o.away_team, ev.away.name));
    if (s > score) { score = s; best = o; }
  }
  return score >= 0.5 ? best : null;
}

// Every book's prices for one event, plus the best price per outcome.
export function compareBooks(o) {
  const prefs = bookmakerPrefs();
  const rows = (o.bookmakers || []).map((bk) => {
    const get = (mk) => bk.markets.find((m) => m.key === mk);
    const h2h = get("h2h"), tot = get("totals");
    const price = (m, name, point) => m?.outcomes.find((x) => x.name === name && (point === undefined || x.point === point))?.price ?? null;
    const line = tot?.outcomes.find((x) => x.point === 2.5) ? 2.5 : tot?.outcomes[0]?.point;
    return {
      key: bk.key, title: bk.title, preferred: prefs.indexOf(bk.key),
      home: price(h2h, o.home_team), draw: price(h2h, "Draw"), away: price(h2h, o.away_team),
      line: line ?? null, over: price(tot, "Over", line), under: price(tot, "Under", line),
    };
  });
  rows.sort((a, b) => (a.preferred === -1 ? 99 : a.preferred) - (b.preferred === -1 ? 99 : b.preferred) || a.title.localeCompare(b.title));
  const best = {};
  for (const f of ["home", "draw", "away", "over", "under"]) {
    const top = rows.filter((r) => r[f]).sort((a, b) => b[f] - a[f])[0];
    if (top) best[f] = { price: top[f], book: top.title };
  }
  return { rows, best };
}
