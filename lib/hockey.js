// Hockey engine: the trained strength model (lib/hockey-core.js + lib/hockey-params.json) applied
// to a live ESPN event — pre-match markets, live re-pricing and settlement. The market half works
// like football: DraftKings' moneyline, total and puck line are de-vigged and expected goals are
// solved so the model reproduces them; the strength model then nudges those figures. Without
// prices (college hockey, tournaments) the strength model stands alone.
import PARAMS from "./hockey-params.json";
import { damp, features, fitToMarket, leagueMu, outcomes, pmf } from "./hockey-core";
import { choose, devig, enrich, tierFor } from "./model";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
export const hockeyParams = () => PARAMS;

// "6-1-1" → { gp: 8, pts: 13 }
function lastTen(s) {
  const m = String(s || "").match(/^(\d+)-(\d+)-(\d+)/);
  if (!m) return null;
  const w = +m[1], l = +m[2], o = +m[3];
  return { gp: w + l + o, pts: 2 * w + o };
}

// The context the strength model wants for one side, from the standings row, the core-API team
// statistics (shots), the Elo rating and the schedule.
function side(ev, which, table, ratings, ctx, goals = true) {
  const t = ev[which];
  const T = goals ? table?.[t?.id] || {} : {}; // a table without goal data is no table for the strength model
  const st = ctx?.stats?.[which];
  const l10 = lastTen(T.l10);
  const gp = T.gp || 0;
  // shots are season totals from a feed whose game count can lag the table by a day: scale to gp
  const sc = st?.games > 0 && gp > 0 ? gp / st.games : 1;
  return {
    gp, gf: T.gf || 0, ga: T.ga || 0, pts: num(T.pts) ?? (T.w !== undefined ? 2 * T.w + (T.otl || 0) : undefined),
    sf: st && num(st.shotsFor) !== null ? st.shotsFor * sc : undefined,
    sa: st && num(st.shotsAgainst) !== null ? st.shotsAgainst * sc : undefined,
    l10gp: l10?.gp, l10pts: l10?.pts,
    rating: num(ratings?.[which]?.rating) ?? undefined, ratingGames: ratings?.[which]?.games || 0,
    rest: num(ctx?.rest?.[which]),
  };
}

// League scoring and shot rates this season, from the table (shrunk toward the long-run NHL rate, or
// the league's own rate `ctx.mu` for the leagues that come without a table).
function leagueContext(table, ctx, playoff) {
  const rows = Object.values(table || {}).filter((r) => r.gp > 0);
  const gp = rows.reduce((a, r) => a + r.gp, 0), gf = rows.reduce((a, r) => a + r.gf, 0);
  // college standings list games and points but no goals: then only the league rate, Elo and rest apply
  const goals = rows.length >= 6 && gf > 0 && gf / gp > 1;
  const prior = num(ctx?.mu) || PARAMS.league.mu;
  const mu = goals ? leagueMu(gf * PARAMS.league.regShare, gp, prior) : prior; // standings goals include OT and shootout credits
  let S = PARAMS.league.S;
  const sh = Object.values(ctx?.allStats || {}).filter((s) => s?.games > 0 && num(s.shotsFor) !== null);
  if (sh.length >= 6) S = leagueMu(sh.reduce((a, s) => a + s.shotsFor, 0), sh.reduce((a, s) => a + s.games, 0), PARAMS.league.S);
  return { mu, S, playoff, tableReady: goals };
}

const s = (x) => (x > 0 ? `+${x}` : `${x}`);

// Every market the model prices, from the outcome object.
export function hockeyMarkets(o, names, lhla) {
  const H = names.home, A = names.away;
  const mk = (key, group, label, p, v = 0, extra = {}) => ({ key, group, label, p: round(p, 4), v: round(v, 4), ...extra });
  const list = [
    mk("1", "Winner", `${H} win (incl. OT & SO)`, o.ml.h), mk("2", "Winner", `${A} win (incl. OT & SO)`, o.ml.a),
    mk("R1", "Regulation time", `${H} win (60 min)`, o.reg.h), mk("RX", "Regulation time", "Tie (60 min)", o.reg.d), mk("R2", "Regulation time", `${A} win (60 min)`, o.reg.a),
    mk("R1X", "Regulation time", `${H} or tie (60 min)`, o.reg.h + o.reg.d), mk("RX2", "Regulation time", `${A} or tie (60 min)`, o.reg.a + o.reg.d),
  ];
  for (const line of [-1.5, 1.5]) {
    const h = o.puck("home", line), a = o.puck("away", -line);
    list.push(mk(`AH1${s(line)}`, "Puck line", `${H} ${s(line)}`, h.p, h.v), mk(`AH2${s(-line)}`, "Puck line", `${A} ${s(-line)}`, a.p, a.v));
  }
  for (const L of [4.5, 5, 5.5, 6, 6.5, 7, 7.5]) {
    const t = o.total(L);
    list.push(mk(`O${L}`, "Total", `Over ${L}`, t.p, t.v), mk(`U${L}`, "Total", `Under ${L}`, 1 - t.p - t.v, t.v));
  }
  for (const L of [1.5, 2.5, 3.5]) {
    const ho = o.teamOver("home", L), ao = o.teamOver("away", L);
    list.push(mk(`HO${L}`, "Team goals", `${H} over ${L}`, ho), mk(`AO${L}`, "Team goals", `${A} over ${L}`, ao));
    if (L === 2.5) list.push(mk(`HU${L}`, "Team goals", `${H} under ${L}`, 1 - ho), mk(`AU${L}`, "Team goals", `${A} under ${L}`, 1 - ao));
  }
  list.push(mk("OTY", "Overtime", "Goes to overtime", o.toOT), mk("OTN", "Overtime", "Decided in regulation", 1 - o.toOT));
  for (const [key, nm, sd] of [["1", H, "home"], ["2", A, "away"]]) {
    list.push(mk(`WM${key}-1`, "Winning margin", `${nm} by 1`, o.margin(sd, 1)), mk(`WM${key}-2`, "Winning margin", `${nm} by 2`, o.margin(sd, 2)), mk(`WM${key}-3`, "Winning margin", `${nm} by 3+`, o.margin(sd, 3)));
  }
  const odd = o.sum((i, j) => i !== j && (i + j) % 2 === 1) + o.toOT * (o.ot.pOT); // ties: 2i even, +1 OT goal → odd
  list.push(mk("ODD", "Odd/Even", "Odd goals", odd), mk("EVEN", "Odd/Even", "Even goals", 1 - odd));
  // regulation correct score: the 8 likeliest
  const cs = [];
  for (let i = 0; i <= 7; i++) for (let j = 0; j <= 7; j++) cs.push([i, j, o.m[i][j]]);
  cs.sort((x, y) => y[2] - x[2]);
  for (const [i, j, p] of cs.slice(0, 8)) list.push(mk(`RCS${i}-${j}`, "Correct score", `Correct score ${i}-${j} (60 min)`, p));
  // first period, for analysis only (the results feed keeps no period scores)
  if (lhla) {
    const [lh, la] = lhla, ph = pmf(lh / 3, 8), pa = pmf(la / 3, 8);
    let h = 0, d = 0, a = 0, o15 = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { const p = ph[i] * pa[j]; if (i > j) h += p; else if (i < j) a += p; else d += p; if (i + j > 1.5) o15 += p; }
    const info = (x) => ({ ...x, info: true });
    list.push(info(mk("P1H", "Period 1", `${H} wins period 1`, h)), info(mk("P1X", "Period 1", "Period 1 tied", d)), info(mk("P1A", "Period 1", `${A} wins period 1`, a)),
      info(mk("P1O1.5", "Period 1", "Over 1.5 in period 1", o15)), info(mk("P1U1.5", "Period 1", "Under 1.5 in period 1", 1 - o15)));
  }
  const scores = [];
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) scores.push({ score: `${i}-${j}`, p: round(o.m[i][j], 4) });
  scores.sort((x, y) => y.p - x.p);
  return { list, scores: scores.slice(0, 6) };
}

function attachBook(list, odds) {
  if (!odds) return;
  const set = (key, price, book = odds.provider) => { const m = list.find((x) => x.key === key); if (m && price > 1) { m.odds = price; m.book = book; } };
  if (!odds.synthetic) { set("1", odds.home); set("2", odds.away); } // a moneyline derived from 60-minute prices guides the fit only
  if (odds.total?.line !== undefined) { set(`O${odds.total.line}`, odds.total.over, odds.total.book); set(`U${odds.total.line}`, odds.total.under, odds.total.book); }
  if (odds.spread?.line !== undefined) { set(`AH1${s(odds.spread.line)}`, odds.spread.home, odds.spread.book); set(`AH2${s(-odds.spread.line)}`, odds.spread.away, odds.spread.book); }
  for (const [k, v] of Object.entries(odds.extra || {})) set(k, v.price, v.book); // e.g. real 60-minute 1X2 prices
}

// Markets that need to know how the game ended (60 minutes, overtime, regulation score) can't be
// graded from a final score alone: shown for information only when the results feed says no more.
const NEEDS_ENDING = /^(R|OT)/;

// ---------- pre-match ----------
// ctx: { stats: { home, away } (core-API season statistics), allStats, rest: { home, away } }
export function hockeyAnalyse(ev, table = {}, ratings = null, ctx = null) {
  const names = { home: ev.home?.short || ev.home?.name || "Home", away: ev.away?.short || ev.away?.name || "Away" };
  const playoff = ev.seasonType === 3;
  const lg = leagueContext(table, ctx, playoff);
  const home = side(ev, "home", table, ratings, ctx, lg.tableReady), away = side(ev, "away", table, ratings, ctx, lg.tableReady);
  const st = features(home, away, lg, PARAMS);

  const o = ev.odds;
  let quality = "stats", lh = st.lh, la = st.la, fitError = null;
  const target = {};
  if (o?.home && o?.away) { const f = devig([o.home, o.away]); if (f) { target.ml = f[0]; quality = "partial"; } }
  if (o?.total?.over && o?.total?.under) { const f = devig([o.total.over, o.total.under]); if (f) target.total = { line: o.total.line, p: f[0] }; }
  if (o?.spread?.home && o?.spread?.away && Math.abs(o.spread.line) === 1.5) { const f = devig([o.spread.home, o.spread.away]); if (f) target.puck = { line: o.spread.line, p: f[0] }; }
  if (target.ml) {
    const fit = fitToMarket(target, PARAMS, { playoff });
    fitError = fit.fitError;
    if (target.total) quality = "market";
    // the market is sharp; the strength model nudges (less when the table is still empty)
    const w = lg.tableReady && home.gp >= 5 && away.gp >= 5 ? PARAMS.market.statsWeight : PARAMS.market.statsWeight / 2;
    lh = Math.exp((1 - w) * Math.log(fit.lh) + w * Math.log(st.lh));
    la = Math.exp((1 - w) * Math.log(fit.la) + w * Math.log(st.la));
  }
  const out = outcomes(lh, la, PARAMS, { playoff });
  const { list, scores } = hockeyMarkets(out, names, damp(lh, la, PARAMS));
  attachBook(list, o);
  if (ev.endingKnown === false) for (const m of list) if (NEEDS_ENDING.test(m.key)) m.info = true;
  const markets = list.map(enrich);

  const pickSafe = choose(markets, "safe")[0] || choose(markets, "balanced")[0] || null;
  const pickValue = choose(markets, "value")[0] || null;
  const notes = [];
  if (o?.homeOpen && o?.home && o?.awayOpen && o?.away) {
    const dh = o.homeOpen - o.home, da = o.awayOpen - o.away;
    if (Math.abs(dh) >= 0.08 || Math.abs(da) >= 0.08) {
      const sd = dh > da ? names.home : names.away;
      notes.push({ k: "Market moved toward {side} ({from} → {to}).", v: { side: sd, from: (dh > da ? o.homeOpen : o.awayOpen).toFixed(2), to: (dh > da ? o.home : o.away).toFixed(2) } });
    }
  }
  if (home.rest === 0 && away.rest !== 0) notes.push({ k: "{team} plays on back-to-back nights.", v: { team: names.home } });
  if (away.rest === 0 && home.rest !== 0) notes.push({ k: "{team} plays on back-to-back nights.", v: { team: names.away } });
  if (playoff) notes.push({ k: "Playoff game: tighter scoring, overtime until a goal (no shootout)." });
  if (ev.endingKnown === false) notes.push({ k: "The results feed gives final scores only: 60-minute and overtime markets are shown for information, never picked." });
  // nothing team-specific yet (no prices, no goals in the table, no shots, no ratings): league averages only
  const blind = !target.ml && !lg.tableReady && !st.shots && !st.elo;
  if (blind) { quality = "blind"; notes.push({ k: "No team data yet (prices, goals, ratings): league averages only — treat as a coin flip." }); }
  else if (quality === "stats") notes.push({ k: "No bookmaker prices yet — probabilities come from the hockey strength model only." });

  const parts = [];
  if (target.ml) parts.push(`${o.provider} odds (de-vigged)`);
  parts.push(lg.tableReady ? "hockey strength model" : "league average");
  if (st.shots) parts.push("shot volumes");
  if (st.elo) parts.push("ratings");
  if (home.rest !== null || away.rest !== null) parts.push("rest days");

  const grade = (p) => (p ? { ...p, tier: tierFor(p.safe ?? p.p, p.ev ?? 0, quality) } : null);
  const gradeValue = (p) => { const g = grade(p); if (g && g.tier === "Skip") g.tier = "Low"; return g; };
  return {
    quality, sport: "hockey", xg: { home: round(lh, 2), away: round(la, 2) },
    probs: { h: round(out.ml.h, 4), a: round(out.ml.a, 4) }, reg: { h: round(out.reg.h, 4), d: round(out.reg.d, 4), a: round(out.reg.a, 4) }, otChance: round(out.toOT, 4),
    basis: parts.join(" + "), fitError: fitError !== null ? round(fitError, 5) : null,
    markets, scores, pick: grade(pickSafe), value: gradeValue(pickValue && (pickValue.ev ?? 0) > 0.01 ? pickValue : null), notes,
  };
}

// ---------- live ----------
// Periods count down ("12:34" left in period `period`); 4 = overtime, 5 = shootout.
export function hockeyLive(ev, pre) {
  if (ev.state !== "in" || !pre?.xg) return null;
  if (!ev.period && !ev.clock) return null; // no clock on this feed (Odds API leagues): nothing to re-price from
  const period = ev.period || 1;
  const m = String(ev.clock || "").match(/^(\d+):(\d+)/);
  const leftInPeriod = m ? clamp(Number(m[1]) + Number(m[2]) / 60, 0, 20) : 10;
  const hs = ev.home.score ?? 0, as = ev.away.score ?? 0;
  const [xh, xa] = damp(pre.xg.home, pre.xg.away, PARAMS);
  const label = period <= 3 ? `P${period} · ${m ? m[0] : ""}`.trim() : period === 4 ? `OT · ${m ? m[0] : ""}`.trim() : "SO";
  const base = { period, label, score: { home: hs, away: as } };

  if (period >= 5 || (period === 4 && hs !== as)) {
    // shootout, or an OT winner already scored
    const done = hs !== as;
    const pH = done ? (hs > as ? 1 : 0) : outcomes(xh, xa, PARAMS).ot.pHomeSO;
    return { ...base, minute: 65, remainingXg: { home: 0, away: 0 }, probs: { h: round(pH, 4), a: round(1 - pH, 4) }, overs: [], nextGoal: { home: 0, away: 0, none: 1 }, toOT: 1 };
  }
  if (period === 4) {
    // 3-on-3 overtime: goal rate from the share of ties decided in 5 minutes, strength tilts the scorer
    const ot = outcomes(xh, xa, PARAMS, { playoff: ev.seasonType === 3 }).ot;
    const rate = -Math.log(1 - clamp(PARAMS.ot.q, 0.3, 0.95)) / 5; // per minute
    const pGoal = ev.seasonType === 3 ? 1 : 1 - Math.exp(-rate * leftInPeriod);
    const pH = pGoal * ot.pHomeOT + (1 - pGoal) * ot.pHomeSO;
    const tot = hs + as;
    return {
      ...base, minute: 60 + round(5 - leftInPeriod, 1), remainingXg: { home: round(pGoal * ot.pHomeOT, 2), away: round(pGoal * (1 - ot.pHomeOT), 2) },
      probs: { h: round(pH, 4), a: round(1 - pH, 4) }, reg: { h: 0, d: 1, a: 0 },
      overs: [tot + 0.5].map((L) => ({ line: L, p: round(pGoal, 4) })),
      nextGoal: { home: round(pGoal * ot.pHomeOT, 4), away: round(pGoal * (1 - ot.pHomeOT), 4), none: round(1 - pGoal, 4) }, toOT: 1,
    };
  }
  const elapsed = (period - 1) * 20 + (20 - leftInPeriod);
  const left = clamp((60 - elapsed) / 60, 0.005, 1);
  let rh = xh * left, ra = xa * left;
  // game state: the side that trails opens up (and pulls its goalie late), so both rates rise a little
  if (hs !== as) {
    const lead = Math.abs(hs - as);
    const push = 1 + (elapsed > 50 ? 0.25 : 0.08) * Math.min(lead, 2), sit = 1 + (elapsed > 50 ? 0.18 : 0.02) * Math.min(lead, 2);
    if (hs > as) { ra *= push; rh *= sit; } else { rh *= push; ra *= sit; }
  }
  const ph = pmf(rh, 8), pa = pmf(ra, 8);
  const ot = outcomes(xh, xa, PARAMS, { playoff: ev.seasonType === 3 }).ot;
  let H = 0, D = 0, A = 0, btts = 0;
  const overs = {};
  const lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5].filter((L) => L > hs + as).slice(0, 3);
  for (const L of lines) overs[L] = 0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const p = ph[i] * pa[j], fh = hs + i, fa = as + j;
    if (fh > fa) H += p; else if (fh < fa) A += p; else D += p;
    if (fh > 0 && fa > 0) btts += p;
    for (const L of lines) if (fh + fa > L) overs[L] += p; else if (fh === fa && fh + fa + 1 > L) overs[L] += p * ot.pOT; // OT goal
  }
  const pH = H + D * (ot.pOT * ot.pHomeOT + (1 - ot.pOT) * ot.pHomeSO);
  const none = ph[0] * pa[0];
  return {
    ...base, minute: Math.round(elapsed), remainingXg: { home: round(rh, 2), away: round(ra, 2) },
    probs: { h: round(pH, 4), a: round(1 - pH, 4) }, reg: { h: round(H, 4), d: round(D, 4), a: round(A, 4) }, toOT: round(D, 4),
    overs: lines.map((L) => ({ line: L, p: round(overs[L], 4) })),
    nextGoal: { home: round((1 - none) * rh / (rh + ra), 4), away: round((1 - none) * ra / (rh + ra), 4), none: round(none, 4) },
  };
}

// ---------- settlement ----------
// `ot`: null (regulation), "OT" or "SO". ESPN credits the shootout winner with one goal in the
// final score; totals and team totals leave it out, the moneyline and puck line keep it.
export function hockeySettle(key, hs, as, ot = null) {
  if (hs === null || as === null || hs === undefined || as === undefined) return null;
  const so = ot === "SO";
  const gh = so && hs > as ? hs - 1 : hs, ga = so && as > hs ? as - 1 : as; // goals that count
  const rh = ot ? Math.min(hs, as) : hs, ra = ot ? Math.min(hs, as) : as; // after 60 minutes
  const d = hs - as, t = gh + ga;
  const W = (c) => (c ? "W" : "L");
  let m;
  if (key === "1") return W(d > 0);
  if (key === "2") return W(d < 0);
  if (key === "R1") return W(!ot && d > 0);
  if (key === "RX") return W(!!ot);
  if (key === "R2") return W(!ot && d < 0);
  if (key === "R1X") return W(!!ot || d > 0);
  if (key === "RX2") return W(!!ot || d < 0);
  if (key === "OTY") return W(!!ot);
  if (key === "OTN") return W(!ot);
  if ((m = key.match(/^O([\d.]+)$/))) return t > +m[1] ? "W" : t === +m[1] ? "V" : "L";
  if ((m = key.match(/^U([\d.]+)$/))) return t < +m[1] ? "W" : t === +m[1] ? "V" : "L";
  if ((m = key.match(/^HO([\d.]+)$/))) return W(gh > +m[1]);
  if ((m = key.match(/^AO([\d.]+)$/))) return W(ga > +m[1]);
  if ((m = key.match(/^HU([\d.]+)$/))) return W(gh < +m[1]);
  if ((m = key.match(/^AU([\d.]+)$/))) return W(ga < +m[1]);
  if (key === "ODD") return W(t % 2 === 1);
  if (key === "EVEN") return W(t % 2 === 0);
  if ((m = key.match(/^WM([12])-(\d)$/))) { const x = m[1] === "1" ? d : -d; return W(+m[2] === 3 ? x >= 3 : x === +m[2]); }
  if ((m = key.match(/^RCS(\d+)-(\d+)$/))) return W(rh === +m[1] && ra === +m[2]);
  if ((m = key.match(/^AH([12])([+-][\d.]+)$/))) { const x = (m[1] === "1" ? d : -d) + +m[2]; return x > 0 ? "W" : x === 0 ? "V" : "L"; }
  return null;
}
