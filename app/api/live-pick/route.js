import { NextResponse } from "next/server";
import { analysedBoard, remember } from "../../../lib/board";
import { bestLivePicks, OP_LEVELS, OP_RECORD } from "../../../lib/livecoupon";
import { bookPicks, extraLive, sameTeam } from "../../../lib/morelive";

export const maxDuration = 60;

// The OP live pick: the one best single bet among the football games in play, re-chosen every
// 20 seconds. Two kinds of candidates, ranked together by chance:
//   the site's own games, read by the live model (lib/livecoupon.js bestLivePicks): the price is an
//   estimate, the feed carries no in-play odds for them;
//   the second source's games the bookmaker prices in play (lib/morelive.js bookPicks): the price is
//   real, read a few minutes ago (never used once the reading is 15 minutes old, nor once the
//   score has moved since: the scores come fresh from the open feeds, lib/openlive.js).
//   ?level=safe|mid|bold     the estimated-odds band (≈1.25+, ≈1.50+, ≈2.00+)
//   ?exclude=id,id           games to leave out ("another one")
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const level = OP_LEVELS[sp.get("level")] ? sp.get("level") : "safe";
  const exclude = (sp.get("exclude") || "").split(",").filter(Boolean).slice(0, 100);
  try {
    const out = await remember(`livepick:${level}:${exclude.join(",")}`, 20e3, async () => {
      const rows = await analysedBoard(2);
      const own = bestLivePicks(rows, { level, exclude, max: 4 });
      // fresh scores joined to the priced reading: a game whose score moved since the prices were read has no markets left
      const x = await extraLive(rows.map((r) => r.ev)).catch(() => ({ games: [], pricesAt: null }));
      const extra = x.games;
      // a game of the main feed the bookmaker also prices in play: the real price of the engine's
      // bet goes beside its estimate (same score as when the prices were read, else it says nothing)
      for (const p of own.picks) {
        const k = (x.known || []).find((g) => `${g.hs}-${g.as}` === p.live?.score && (sameTeam(g.home, p.home) >= 1 || sameTeam(g.away, p.away) >= 1));
        const m = k?.markets.find((y) => y.key === p.key);
        if (m) p.real = { odds: m.odds, at: x.pricesAt ? new Date(x.pricesAt).toISOString() : null };
      }
      const book = bookPicks(extra, { band: OP_LEVELS[level], level, exclude, at: x.pricesAt });
      // likeliest first (to the point); between equals, the engine's worst-case chance, else the chance itself
      const picks = [...own.picks, ...book.picks].sort((a, b) => Math.round(b.p * 100) - Math.round(a.p * 100) || (b.floor ?? b.p) - (a.floor ?? a.p)).slice(0, 4);
      return { pick: picks[0] || null, next: picks.slice(1), eligible: own.eligible + book.eligible, live: own.live + extra.length, level, record: OP_RECORD[level] || null };
    });
    return NextResponse.json({ ...out, at: new Date().toISOString() }, { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
