// Closing line value: for every priced pick, the bookmaker's closing price on the same market and
// how far the pick's price beat it (pick odds / closing odds − 1). Beating the close consistently
// is the one sign of a model that wins over the long run; hit rate alone can't tell. Filled in after
// the games by the cron (lib/espn.js closingLine), a few dozen games per run.
import { closingLine, pool } from "./espn";
import { withDb } from "./db";

// The closing price of the pick's market, from a closing line record (lib/espn.js parseClosing).
export function closeFor(key, c) {
  if (!c || !key) return null;
  if (key === "1") return c.h;
  if (key === "2") return c.a;
  if (key === "X") return c.d;
  let m;
  if ((m = key.match(/^O([\d.]+)$/))) return c.tl === +m[1] ? c.to : null;
  if ((m = key.match(/^U([\d.]+)$/))) return c.tl === +m[1] ? c.tu : null;
  if ((m = key.match(/^AH1([+-][\d.]+)$/))) return c.sl === +m[1] ? c.sh : null;
  if ((m = key.match(/^AH2([+-][\d.]+)$/))) return c.sl === -+m[1] ? c.sa : null;
  // DraftKings' football spread ±0.5 is the double chance
  if (key === "1X") return c.sl === 0.5 ? c.sh : null;
  if (key === "X2") return c.sl === -0.5 ? c.sa : null;
  return null;
}

// Look up the closing line of up to `limit` recently graded priced picks that don't have one yet.
export async function clvSweep(limit = 120) {
  const rows = await withDb("clv", (sql) => sql`
    select event_id, league, pick_key, pick_odds::float from skii_picks
    where state = 'post' and pick_est = false and pick_key is not null and close_at is null and kickoff > now() - interval '6 days'
    order by kickoff desc limit ${limit}`, []);
  let checked = 0, withClose = 0;
  await pool(rows || [], 4, async (r) => {
    const c = await closingLine(r.league, r.event_id);
    const close = closeFor(r.pick_key, c);
    const clv = close > 1 && r.pick_odds > 1 ? Math.round((r.pick_odds / close - 1) * 1e4) / 1e4 : null;
    await withDb("clv:save", (sql) => sql`update skii_picks set close_odds = ${close ?? null}, clv = ${clv}, close_at = now() where event_id = ${r.event_id}`);
    checked++; if (close) withClose++;
  });
  return { checked, withClose };
}
