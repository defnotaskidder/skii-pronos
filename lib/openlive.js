// Live scores collected by the site itself, from feeds that answer a plain request: the JSON the
// live-score sites serve to their own pages (365Scores first, LiveScore when it fails). No key, no
// daily count, read at most every 20 seconds and only while somebody is looking.
//
// What this is, plainly: these feeds are not offered to third parties. Nothing is circumvented (a
// site that refuses robots or asks for a check is left alone: SofaScore, FotMob), but either
// feed can change or be closed to this site without notice, and their terms do not allow reuse.
// The owner asked for it on 25 Nov 2026 knowing that. When both fail, the Live page falls back on
// the API-Football reading (lib/morelive.js). OPEN_LIVE=off switches it all off.
//
// A game here has the shape of lib/morelive.js's: { id, date, status ("1H" | "HT" | "2H" | "ET" |
// "P"), minute, league, country, home, away, hs, as }. Scores only: these feeds carry no prices.
import { remember } from "./memo";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const U17 = /\bu-?17\b|under[- ]?17/i; // left out, as in lib/morelive.js
export const openLiveEnabled = () => process.env.OPEN_LIVE !== "off";

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store", headers: { "user-agent": UA, accept: "application/json, text/plain, */*", "accept-language": "en-US,en;q=0.9" }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json().catch(() => null);
  if (!d) throw new Error("not JSON");
  return d;
}

// ---- 365Scores: every game of the day with its state; statusGroup 3 = in play ----
const S365 = { "1st Half": "1H", Halftime: "HT", "2nd Half": "2H", "Extra Time": "ET", "Extra Time Halftime": "BT", Penalties: "P" };
export function parse365(d) {
  const comps = new Map((d?.competitions || []).map((c) => [c.id, c])), countries = new Map((d?.countries || []).map((c) => [c.id, c.name]));
  const out = [];
  for (const g of d?.games || []) {
    if (g.statusGroup !== 3 || g.sportId !== 1 || !g.homeCompetitor?.name || !g.awayCompetitor?.name) continue;
    const c = comps.get(g.competitionId), country = countries.get(c?.countryId) || "", league = c?.name || g.competitionDisplayName || "";
    if (U17.test(`${league} ${g.homeCompetitor.name} ${g.awayCompetitor.name}`)) continue;
    const hs = Number(g.homeCompetitor.score), as = Number(g.awayCompetitor.score);
    out.push({
      id: `s365-${g.id}`, date: g.startTime, status: S365[g.statusText] || "LIVE", minute: Number.isFinite(g.gameTime) && g.gameTime >= 0 ? Math.round(g.gameTime) : null,
      league, country: /^(international|europe|asia|africa|south america|north & central america|world)$/i.test(country) ? "World" : country, round: g.roundName || "",
      home: g.homeCompetitor.name, away: g.awayCompetitor.name, hs: hs >= 0 ? hs : 0, as: as >= 0 ? as : 0,
    });
  }
  return out;
}

// ---- LiveScore: the games in play, by stage; Eps is the clock ("72'", "HT"), Esd the kick-off (UTC) ----
export function parseLiveScore(d) {
  const out = [];
  for (const s of d?.Stages || []) for (const e of s.Events || []) {
    const eps = String(e.Eps || ""), m = eps.match(/^(\d+)/);
    const status = eps === "HT" ? "HT" : /^ET|AET/i.test(eps) ? "ET" : /^Pen/i.test(eps) ? "P" : m ? (Number(m[1]) > 45 ? "2H" : "1H") : null;
    const home = e.T1?.[0]?.Nm, away = e.T2?.[0]?.Nm;
    if (!status || !home || !away) continue;
    const league = s.CompN || s.Snm || "", country = s.Cnm || "";
    if (U17.test(`${league} ${s.Snm || ""} ${country} ${home} ${away}`)) continue;
    const t = String(e.Esd || ""), date = /^\d{14}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:00Z` : null;
    // a competition filed under itself ("UEFA Youth League · Champions League Path") or under a continent is international
    const world = /^(asia|africa|europe|world|international|south america|north america|concacaf|uefa|fifa)/i.test(country) || /uefa|fifa|afc|caf |conmebol|concacaf/i.test(country);
    out.push({ id: `sls-${e.Eid}`, date, status, minute: status === "HT" ? 45 : m ? Number(m[1]) : null, league: world && !/uefa|afc|caf|fifa/i.test(league) ? `${country} ${league}`.trim() : league, country: world ? "World" : country, round: "", home, away, hs: Number(e.Tr1) || 0, as: Number(e.Tr2) || 0 });
  }
  return out;
}

const FEEDS = [
  ["365scores", "https://webws.365scores.com/web/games/current/?appTypeId=5&langId=1&timezoneName=UTC&userCountryId=1&sports=1&onlyLiveGames=true", parse365],
  ["livescore", "https://prod-public-api.livescore.com/v1/api/app/live/soccer/0?locale=en&MD=1", parseLiveScore],
];

// { at, source, games, errors }: the first feed that answers; an empty answer is trusted only
// when the other feed agrees (a feed that changed its format must not empty the page).
export async function openLive() {
  if (!openLiveEnabled()) return { at: null, source: null, games: [], errors: { off: "OPEN_LIVE=off" } };
  return remember("openlive", 20e3, async () => {
    const errors = {};
    let empty = null;
    for (const [name, url, parse] of FEEDS) {
      try {
        const games = parse(await getJson(url));
        if (games.length) return { at: Date.now(), source: name, games, errors };
        empty = empty || { at: Date.now(), source: name, games: [], errors };
      } catch (e) { errors[name] = e.message; }
    }
    if (empty) return empty;
    throw new Error(Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(" | ") || "no feed");
  });
}
