const BASE = "https://api.the-odds-api.com/v4";

// Leagues shown by default (sport keys from The Odds API). The /api/sports route
// adds anything else that is currently in season.
export const DEFAULT_SPORTS = [
  { key: "soccer_epl", title: "Premier League", group: "Soccer" },
  { key: "soccer_spain_la_liga", title: "La Liga", group: "Soccer" },
  { key: "soccer_germany_bundesliga", title: "Bundesliga", group: "Soccer" },
  { key: "soccer_italy_serie_a", title: "Serie A", group: "Soccer" },
  { key: "soccer_france_ligue_one", title: "Ligue 1", group: "Soccer" },
  { key: "soccer_uefa_champs_league", title: "Champions League", group: "Soccer" },
  { key: "soccer_uefa_europa_league", title: "Europa League", group: "Soccer" },
  { key: "soccer_usa_mls", title: "MLS", group: "Soccer" },
  { key: "soccer_netherlands_eredivisie", title: "Eredivisie", group: "Soccer" },
  { key: "soccer_portugal_primeira_liga", title: "Primeira Liga", group: "Soccer" },
  { key: "soccer_brazil_campeonato", title: "Brazil Série A", group: "Soccer" },
  { key: "soccer_argentina_primera_division", title: "Argentina", group: "Soccer" },
  { key: "basketball_nba", title: "NBA", group: "Basketball" },
  { key: "basketball_wnba", title: "WNBA", group: "Basketball" },
  { key: "baseball_mlb", title: "MLB", group: "Baseball" },
  { key: "americanfootball_nfl", title: "NFL", group: "American Football" },
];

// Additional (per-event) markets to try for soccer. Missing ones are simply absent.
export const SOCCER_EXTRA_MARKETS = [
  "btts", "draw_no_bet", "team_totals", "alternate_totals",
  "player_goal_scorer_anytime", "player_shots_on_target",
];

export function regions() {
  return (process.env.ODDS_REGIONS || "eu").trim();
}

export function bookmakerPrefs() {
  return (process.env.ODDS_BOOKMAKERS || "onexbet,pinnacle,bet365,unibet_eu,williamhill,betclic")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

export async function oddsApi(path, params = {}) {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("ODDS_API_KEY is not set. Add it to .env.local or your Vercel environment.");
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && url.searchParams.set(k, v));
  url.searchParams.set("apiKey", key);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Odds API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return { data, quota: { remaining, used } };
}

function pickBookmaker(bookmakers, prefs, needMarket = "h2h") {
  for (const p of prefs) {
    const b = bookmakers.find((bk) => bk.key === p && bk.markets.some((m) => m.key === needMarket));
    if (b) return b;
  }
  return bookmakers.find((bk) => bk.markets.some((m) => m.key === needMarket)) || bookmakers[0] || null;
}

function bestPrices(bookmakers, marketKey, matchOutcome) {
  // best price across all books for outcomes of a market, keyed by name(+point)
  const best = {};
  for (const bk of bookmakers) {
    const m = bk.markets.find((x) => x.key === marketKey);
    if (!m) continue;
    for (const o of m.outcomes) {
      if (!matchOutcome(o)) continue;
      const id = o.point !== undefined ? `${o.name}@${o.point}` : o.name;
      if (!best[id] || o.price > best[id].price) best[id] = { price: o.price, book: bk.title };
    }
  }
  return best;
}

// Turn one raw Odds API event into the compact shape the UI and the engine use.
export function normalizeEvent(ev, prefs) {
  const bookmakers = ev.bookmakers || [];
  const book = pickBookmaker(bookmakers, prefs);
  const out = {
    id: ev.id,
    sport_key: ev.sport_key,
    league: ev.sport_title,
    commence_time: ev.commence_time,
    home: ev.home_team,
    away: ev.away_team,
    bookmaker: book ? book.title : null,
    books: bookmakers.length,
    h2h: null, totals: [], spreads: [],
    best_h2h: {},
  };
  if (!book) return out;
  const h2h = book.markets.find((m) => m.key === "h2h");
  if (h2h) {
    const get = (name) => h2h.outcomes.find((o) => o.name === name)?.price ?? null;
    out.h2h = { home: get(ev.home_team), draw: get("Draw"), away: get(ev.away_team) };
    const best = bestPrices(bookmakers, "h2h", () => true);
    out.best_h2h = {
      home: best[ev.home_team] || null, draw: best["Draw"] || null, away: best[ev.away_team] || null,
    };
  }
  const totals = book.markets.find((m) => m.key === "totals");
  if (totals) {
    const byPoint = {};
    for (const o of totals.outcomes) {
      byPoint[o.point] = byPoint[o.point] || { point: o.point, over: null, under: null };
      if (o.name === "Over") byPoint[o.point].over = o.price;
      if (o.name === "Under") byPoint[o.point].under = o.price;
    }
    out.totals = Object.values(byPoint).sort((a, b) => a.point - b.point);
  }
  const spreads = book.markets.find((m) => m.key === "spreads");
  if (spreads) {
    const byPoint = {};
    for (const o of spreads.outcomes) {
      const k = Math.abs(o.point);
      byPoint[k] = byPoint[k] || { line: k, home: null, away: null, home_point: null, away_point: null };
      if (o.name === ev.home_team) { byPoint[k].home = o.price; byPoint[k].home_point = o.point; }
      if (o.name === ev.away_team) { byPoint[k].away = o.price; byPoint[k].away_point = o.point; }
    }
    out.spreads = Object.values(byPoint).sort((a, b) => a.line - b.line);
  }
  return out;
}

// Extra markets for one event (from the per-event odds endpoint).
export function normalizeExtraMarkets(ev, prefs) {
  const bookmakers = ev.bookmakers || [];
  const result = {};
  for (const mk of SOCCER_EXTRA_MARKETS) {
    const book = pickBookmaker(bookmakers, prefs, mk);
    const m = book?.markets.find((x) => x.key === mk);
    if (!m) continue;
    result[mk] = {
      bookmaker: book.title,
      outcomes: m.outcomes.map((o) => ({
        name: o.name, price: o.price, point: o.point, description: o.description,
      })),
    };
  }
  return result;
}
