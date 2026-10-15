// Optional sharper base prices: Pinnacle's odds (the market-making book) from The Odds API for
// the top leagues. Switched on with ODDS_SHARP=true; each league costs 2 credits per refresh,
// so the refresh interval (ODDS_SHARP_MIN, default 240 minutes) is generous. On the free plan
// (500 credits/month) that is ~7 leagues × 2 × 6/day ≈ 2,500/month — use a paid plan or a
// shorter list via ODDS_SHARP_LEAGUES=eng.1,esp.1.
import { oddsApi, oddsEnabled, regions, findEvent } from "./odds";
import { LEAGUES, LEAGUE_BY_ID } from "./leagues";
import { remember } from "./memo";

export const sharpEnabled = () => oddsEnabled() && process.env.ODDS_SHARP === "true";

function leagues() {
  const env = (process.env.ODDS_SHARP_LEAGUES || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ids = env.length ? env : LEAGUES.filter((l) => l.tier === 1 && l.sport === "soccer").map((l) => l.id);
  return ids.map((id) => LEAGUE_BY_ID[id]).filter((l) => l?.odds);
}

async function leagueOdds(l) {
  const ttl = Math.max(30, Number(process.env.ODDS_SHARP_MIN) || 240) * 60e3;
  return remember(`sharp:${l.id}`, ttl, async () => {
    const { data } = await oddsApi(`/sports/${l.odds}/odds`, { regions: regions(), markets: "h2h,totals", oddsFormat: "decimal", dateFormat: "iso", bookmakers: "pinnacle" });
    return data || [];
  }).catch(() => []);
}

// Replace DraftKings prices with Pinnacle's where Pinnacle lists the match.
export async function applySharp(events) {
  if (!sharpEnabled()) return 0;
  let n = 0;
  for (const l of leagues()) {
    const evs = events.filter((e) => e.league === l.id && e.state === "pre");
    if (!evs.length) continue;
    const list = await leagueOdds(l);
    for (const ev of evs) {
      const m = findEvent(list, ev);
      const bk = m?.bookmakers?.find((b) => b.key === "pinnacle");
      if (!bk) continue;
      const h2h = bk.markets.find((x) => x.key === "h2h"), tot = bk.markets.find((x) => x.key === "totals");
      const price = (mk, name, point) => mk?.outcomes.find((o) => o.name === name && (point === undefined || o.point === point))?.price ?? null;
      const home = price(h2h, m.home_team), draw = price(h2h, "Draw"), away = price(h2h, m.away_team);
      if (!home || !away) continue;
      const line = tot?.outcomes.find((o) => o.point === 2.5) ? 2.5 : tot?.outcomes[0]?.point;
      ev.odds = {
        ...(ev.odds || {}), provider: "Pinnacle", home, draw, away,
        total: line !== undefined && price(tot, "Over", line) ? { line, over: price(tot, "Over", line), under: price(tot, "Under", line) } : ev.odds?.total || null,
      };
      n++;
    }
  }
  return n;
}
