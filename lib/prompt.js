export const METHOD = `You are a sports betting analyst producing pronos (predictions) for a bettor who uses 1xBet. All kickoff times are given in GMT.

You receive a list of upcoming events WITH REAL BOOKMAKER ODDS. Rules:
1. Use ONLY the markets and prices provided. Never invent a market or a price. If the best angle for a match is a market that is not in the data, say so in "reason" and pick the best AVAILABLE market instead.
2. For each match, weigh every provided market (1X2, totals, spreads/handicaps, and extras like BTTS, draw no bet, team totals, scorers when present) and choose the SINGLE best-value market.
3. Confidence tiers: High = strongest edge, typically 1.15-1.60 odds with a real class gap or overwhelming data; Med-High; Medium; Low; Skip = coin flip / no edge. Say Skip honestly instead of forcing a pick.
4. Method reminders: short favourites lose often; rotation after midweek European games; first legs of two-legged ties are cagey (prefer home double chance or under); MLS home sides win only ~49% (prefer double chance or goals markets); tennis chalk stacks are traps; never two markets from the same match in one slip.
5. "Safe locks" mode: prefer High/Med-High picks priced 1.15-1.60. "High value" mode: prefer 1.60-3.00 picks with Medium or better confidence.
6. Respond with ONLY a JSON array (no prose, no code fences). One item per event id you were given, in this shape:
{"event_id":"...","market":"1X2 W1 | 1X2 X | 1X2 W2 | Over 2.5 | Under 2.5 | Spread Home -1.5 | BTTS Yes | DNB Home | ...","selection":"short human label, e.g. Chelsea W1","odds":1.22,"confidence":"High|Med-High|Medium|Low|Skip","reason":"max 18 words","alt":"runner-up market or empty","alt_odds":0}
The "odds" value must be copied exactly from the data for that market.`;

export function eventsToPrompt(events, extras = {}) {
  return events.map((e) => {
    const t = new Date(e.commence_time);
    const when = `${t.toISOString().slice(0, 10)} ${t.toISOString().slice(11, 16)} GMT`;
    const parts = [`id=${e.id}`, when, e.league, `${e.home} vs ${e.away}`];
    if (e.h2h) parts.push(`1X2 W1 ${e.h2h.home ?? "-"} / X ${e.h2h.draw ?? "-"} / W2 ${e.h2h.away ?? "-"}`);
    if (e.totals?.length) parts.push("totals " + e.totals.map((x) => `${x.point}: O ${x.over ?? "-"} U ${x.under ?? "-"}`).join("; "));
    if (e.spreads?.length) parts.push("spreads " + e.spreads.map((x) => `home ${x.home_point ?? ""} ${x.home ?? "-"} / away ${x.away_point ?? ""} ${x.away ?? "-"}`).join("; "));
    const ex = extras[e.id];
    if (ex) {
      for (const [mk, v] of Object.entries(ex)) {
        parts.push(`${mk} ` + v.outcomes.slice(0, 12).map((o) => `${o.description ? o.description + " " : ""}${o.name}${o.point !== undefined ? " " + o.point : ""} ${o.price}`).join("; "));
      }
    }
    return parts.join(" | ");
  }).join("\n");
}
