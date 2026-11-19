// The analysis behind a leg, before any percentage: both teams' last games (results, goals
// scored and conceded, home or away) read from ESPN's match summary, and one plain question —
// did this bet actually land in those games? A leg the recent games don't support never enters a
// coupon, whatever the model's number says; the facts travel with the leg so the reader sees them.
//
// How a leg is checked: the market is settled on each of the home side's last games as if that
// side were at home (its goals first) and on each of the away side's as if it were away. "Away
// team under 1.5" is thus checked on what the away team really scored; "home win & over 1.5" on
// how often the home side won that way and how often the away side lost that way.
import { pool, summary } from "./espn";
import { settle, EXTRA_KEY } from "./settle";
import { remember } from "./memo";

const MIN_GAMES = 3; // per team; fewer than that and there is nothing to read (the leg passes)
const NEED = 0.5; // share of those games the bet must have landed in

function teamFacts(games) {
  const last = (games || []).filter((g) => Number.isFinite(g.gf) && Number.isFinite(g.ga)).slice(0, 5);
  const n = last.length, sum = (f) => last.reduce((a, g) => a + f(g), 0);
  return {
    n, last,
    form: last.map((g) => (g.gf > g.ga ? "W" : g.gf < g.ga ? "L" : "D")).reverse().join(""), // oldest → newest
    gf: n ? Math.round((sum((g) => g.gf) / n) * 10) / 10 : null, ga: n ? Math.round((sum((g) => g.ga) / n) * 10) / 10 : null,
    scored: sum((g) => (g.gf > 0 ? 1 : 0)), clean: sum((g) => (g.ga === 0 ? 1 : 0)), over25: sum((g) => (g.gf + g.ga > 2.5 ? 1 : 0)),
  };
}

// Both teams' recent games for one match (30 min per server instance).
export function dossierOf(league, eventId) {
  return remember(`dossier:${eventId}`, 30 * 60e3, async () => {
    const s = await summary(league, eventId, false);
    return { home: teamFacts(s.form?.home), away: teamFacts(s.form?.away) };
  });
}

// Is the leg backed by the recent games? Returns the verdict and the facts shown with the leg.
export function checkLeg(leg, dos) {
  if (!dos || leg.sport !== "soccer") return { ok: true, facts: null };
  const { home, away } = dos;
  const brief = (t) => ({ form: t.form, gf: t.gf, ga: t.ga, n: t.n });
  const facts = { home: brief(home), away: brief(away) };
  if (EXTRA_KEY.test(leg.key) || home.n < MIN_GAMES || away.n < MIN_GAMES) return { ok: true, facts };
  let hits = 0, n = 0;
  for (const g of home.last) { const r = settle(leg.key, g.gf, g.ga, { sport: "soccer" }); if (r) { n++; if (r === "W") hits++; } }
  for (const g of away.last) { const r = settle(leg.key, g.ga, g.gf, { sport: "soccer" }); if (r) { n++; if (r === "W") hits++; } }
  if (!n) return { ok: true, facts };
  facts.hits = hits; facts.of = n;
  return { ok: hits / n >= NEED, facts };
}

// Check every leg of a coupon; the facts are attached to the legs. Returns the event ids that failed.
export async function vetLegs(coupon) {
  const legs = coupon?.legs || [];
  const bad = [];
  await pool(legs, 4, async (l) => {
    if (l.sport !== "soccer") return;
    const dos = await dossierOf(l.league, l.eventId).catch(() => null);
    const v = checkLeg(l, dos);
    if (v.facts) l.facts = v.facts;
    if (!v.ok) bad.push(l.eventId);
  });
  return bad;
}

// Build, check, rebuild without the games whose leg failed — up to `rounds` times. `build(veto)`
// returns a coupon; `veto` (shared between calls when passed in) collects the rejected games.
export async function vetted(build, { rounds = 3, veto = [] } = {}) {
  let c = build(veto);
  for (let i = 0; i < rounds; i++) {
    const bad = await vetLegs(c);
    if (!bad.length) break;
    veto.push(...bad);
    c = build(veto);
    if (i === rounds - 1) await vetLegs(c); // facts on the final version too
  }
  return c;
}
