// NFL engine: the trained score model (lib/nfl-core.js + lib/nfl-params.json) applied to a live
// ESPN event — pre-match markets, live re-pricing and settlement.
//
// The market is the anchor: DraftKings' moneyline, spread and total are de-vigged and the game's
// margin/total locations are solved so the trained score grid reproduces them. Ten seasons of
// closing lines say a public-data model doesn't beat them (the fitted blend weight is ~0, see
// scripts/nfl-report.md), so the engine's job is pricing every other market consistently — the
// alternate spreads and totals around 3 and 7, team totals, margin bands, overtime — and showing
// its own independent line (Elo, points, yards per play, turnovers, rest) next to the market's.
// Without prices the strength model prices the game alone.
import PARAMS from "./nfl-params.json";
import { MAXF, eloRevert, fitToMarket, locFromMeans, otHome, outcomes, strength } from "./nfl-core";
import { choose, devig, enrich, tierFor } from "./model";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const s = (x) => (x > 0 ? `+${x}` : `${x}`);
const half = (x) => Math.round(x * 2) / 2;
export const nflParams = () => PARAMS;
export const isNfl = (ev) => ev?.league === "nfl";

// ---------- team context ----------
// The rating a team carries into this game: the stored Elo, regressed to the mean once per new
// season (the trainer does the same between seasons).
export function nflRating(r, season) {
  if (!r || !Number.isFinite(r.rating)) return null;
  let rating = r.rating;
  if (season && r.season && season > r.season) for (let k = r.season; k < season; k++) rating = eloRevert(rating, PARAMS);
  return { rating, games: r.games || 0 };
}

function side(ev, which, table, ratings, ctx) {
  const id = ev[which]?.id;
  const T = table?.[id] || {};
  const st = ctx?.stats?.[which] || null;
  // points per game only from the table: if the table is missing, the rates fall back to the prior
  // instead of reading "0 points in N games" (season statistics only scale plays and yards)
  const gp = T.gp || 0;
  const pri = PARAMS.priors;
  const prior = (pri?.bySeason?.[ev.season] || (pri?.season === ev.season ? pri.teams : null))?.[id] || null;
  const r = nflRating(ratings?.[which], ev.season);
  // offensive yards per play and turnovers from the season statistics; ESPN leaves yards allowed
  // empty, so the defensive side stays on last season's prior (the strength model shrinks toward it)
  const sc = st?.games > 0 && gp > 0 ? gp / st.games : 1;
  // yards allowed aren't in ESPN's season statistics: the defence stays on last season's rate,
  // exactly as the trainer fits it (scripts/train-nfl.mjs)
  return {
    gp, pf: T.gf || 0, pa: T.ga || 0,
    plays: num(st?.plays) !== null ? st.plays * sc : 0, yds: num(st?.yards) !== null ? st.yards * sc : 0,
    playsA: 0, ydsA: 0,
    give: num(st?.giveaways) !== null ? st.giveaways * sc : 0, take: num(st?.takeaways) !== null ? st.takeaways * sc : 0,
    rest: num(ctx?.rest?.[which]), rating: r?.rating, ratingGames: r?.games || 0, prior,
  };
}

function leagueRates(table, ctx) {
  const rows = Object.values(table || {}).filter((x) => x.gp > 0);
  const gp = rows.reduce((a, x) => a + x.gp, 0), pts = rows.reduce((a, x) => a + (x.gf || 0), 0);
  const st = Object.values(ctx?.allStats || {}).filter((x) => x?.plays > 0);
  const plays = st.reduce((a, x) => a + x.plays, 0), yds = st.reduce((a, x) => a + x.yards, 0);
  return {
    ppg: (pts + 60 * PARAMS.league.ppg) / (gp + 60),
    ypp: (yds + 3000 * PARAMS.league.ypp) / (plays + 3000),
  };
}

// ---------- markets ----------
export function nflMarkets(o, names, main = {}) {
  const H = names.home, A = names.away;
  const mk = (key, group, label, p, v = 0) => ({ key, group, label, p: round(p, 4), v: round(v, 4) });
  const list = [
    mk("1", "Winner", `${H} win (incl. OT)`, o.ml.h, o.ml.tie), mk("2", "Winner", `${A} win (incl. OT)`, o.ml.a, o.ml.tie),
    mk("R1", "Regulation time", `${H} win (60 min)`, o.reg.h), mk("RX", "Regulation time", "Tie (60 min)", o.reg.d), mk("R2", "Regulation time", `${A} win (60 min)`, o.reg.a),
    mk("R1X", "Regulation time", `${H} or tie (60 min)`, o.reg.h + o.reg.d), mk("RX2", "Regulation time", `${A} or tie (60 min)`, o.reg.a + o.reg.d),
  ];
  // spreads: the book's line, one point either side, and the key-number lines around the game
  const fav = -o.locM; // home line a fair book would hang
  const lines = new Set();
  const mainLine = num(main.spread) ?? half(fav);
  for (const d of [0, -1, 1, -3, 3, -7, 7]) lines.add(mainLine + d);
  for (const k of [1.5, 2.5, 3.5, 6.5, 7.5, 10.5, 13.5]) { lines.add(k); lines.add(-k); }
  for (const line of [...lines].filter((x) => x !== 0).sort((a, b) => a - b)) {
    const h = o.spread("home", line), a = o.spread("away", -line);
    if (h.p + h.v < 0.06 || h.p > 0.94) continue;
    list.push(mk(`AH1${s(line)}`, "Spread", `${H} ${s(line)}`, h.p, h.v), mk(`AH2${s(-line)}`, "Spread", `${A} ${s(-line)}`, a.p, a.v));
  }
  // totals: the book's line and ±3.5 / ±7 around it
  const T0 = num(main.total) ?? half(o.mean.t);
  for (const L of [...new Set([T0 - 7, T0 - 3.5, T0, T0 + 3.5, T0 + 7])].sort((a, b) => a - b)) {
    const t = o.total(L);
    list.push(mk(`O${L}`, "Total", `Over ${L} pts`, t.p, t.v), mk(`U${L}`, "Total", `Under ${L} pts`, 1 - t.p - t.v, t.v));
  }
  // team totals around each side's expected points
  for (const [sd, nm, k] of [["home", H, "H"], ["away", A, "A"]]) {
    const base = Math.floor(sd === "home" ? o.mean.h : o.mean.a) + 0.5;
    for (const L of [base - 3, base, base + 3]) {
      if (L < 3) continue;
      const t = o.team(sd, L);
      list.push(mk(`${k}O${L}`, "Team points", `${nm} over ${L} pts`, t.p, t.v), mk(`${k}U${L}`, "Team points", `${nm} under ${L} pts`, 1 - t.p - t.v, t.v));
    }
  }
  for (const [k, nm, sd] of [["1", H, "home"], ["2", A, "away"]]) {
    list.push(mk(`WMR${k}-1-6`, "Victory margin", `${nm} by 1-6`, o.margin(sd, 1, 6)), mk(`WMR${k}-7-12`, "Victory margin", `${nm} by 7-12`, o.margin(sd, 7, 12)), mk(`WMR${k}-13+`, "Victory margin", `${nm} by 13+`, o.margin(sd, 13, 2 * MAXF)));
  }
  list.push(mk("OTY", "Overtime", "Goes to overtime", o.toOT), mk("OTN", "Overtime", "Decided in regulation", 1 - o.toOT));
  const odd = o.odd();
  list.push(mk("ODD", "Odd/Even", "Odd total", odd), mk("EVEN", "Odd/Even", "Even total", 1 - odd));
  return { list, scores: o.scores(6).map((x) => ({ score: x.score, p: round(x.p, 4) })) };
}

function attachBook(list, odds) {
  if (!odds) return;
  const set = (key, price) => { const m = list.find((x) => x.key === key); if (m && price > 1) { m.odds = price; m.book = odds.provider; } };
  set("1", odds.home); set("2", odds.away);
  if (odds.total?.line !== undefined) { set(`O${odds.total.line}`, odds.total.over); set(`U${odds.total.line}`, odds.total.under); }
  if (odds.spread?.line !== undefined && odds.spread.line !== 0) { set(`AH1${s(odds.spread.line)}`, odds.spread.home); set(`AH2${s(-odds.spread.line)}`, odds.spread.away); }
}

// ---------- pre-match ----------
// ctx: { stats: { home, away } (season statistics), allStats, rest: { home, away } }
export function nflAnalyse(ev, table = {}, ratings = null, ctx = null) {
  const names = { home: ev.home?.short || ev.home?.name || "Home", away: ev.away?.short || ev.away?.name || "Away" };
  // preseason: starters sit and the trainer never saw these games — no price, no pick
  if (ev.seasonType === 1) return { quality: "none", sport: "football", markets: [], pick: null, value: null, probs: null, notes: [{ k: "Preseason game: starters sit, so Skii doesn't price it." }] };
  const playoff = ev.seasonType === 3, neutral = !!ev.neutral;
  const lg = leagueRates(table, ctx);
  const home = side(ev, "home", table, ratings, ctx), away = side(ev, "away", table, ratings, ctx);
  const st = strength(home, away, { lg, neutral, playoff }, PARAMS);
  const sLoc = locFromMeans(st.m, st.t, PARAMS, { playoff });

  const o = ev.odds;
  const target = {};
  if (o?.home && o?.away) { const f = devig([o.home, o.away]); if (f) target.ml = f[0]; }
  if (o?.spread?.home && o?.spread?.away && Number.isFinite(o.spread.line)) { const f = devig([o.spread.home, o.spread.away]); if (f) target.spread = { line: o.spread.line, p: f[0] }; }
  if (o?.total?.over && o?.total?.under) { const f = devig([o.total.over, o.total.under]); if (f) target.total = { line: o.total.line, p: f[0] }; }
  else if (Number.isFinite(o?.total?.line)) target.total = { line: o.total.line, p: 0.5 };
  let quality = "stats", locM = sLoc.locM, locT = sLoc.locT, fitError = null;
  const hasMargin = !!(target.ml || target.spread);
  if (hasMargin || target.total) {
    // a missing book total (or margin) is taken from the strength model, and the solve happens at
    // that same value, so the book's own lines price back to their book probabilities
    const fit = fitToMarket(target, PARAMS, { playoff, locT: sLoc.locT, locM: sLoc.locM });
    fitError = fit.fitError;
    quality = hasMargin && target.total ? "market" : "partial";
    const wM = PARAMS.market.blendM || 0, wT = PARAMS.market.blendT || 0;
    locM = hasMargin ? (1 - wM) * fit.locM + wM * sLoc.locM : sLoc.locM;
    locT = target.total ? (1 - wT) * fit.locT + wT * sLoc.locT : sLoc.locT;
  }
  const out = outcomes(locM, locT, PARAMS, { playoff });
  const { list, scores } = nflMarkets(out, names, { spread: o?.spread?.line, total: o?.total?.line });
  attachBook(list, o);
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
  // the independent line, shown next to the market's
  const model = { line: round(-st.m, 1), total: round(st.t, 1) };
  if (target.spread) {
    const gap = model.line - target.spread.line;
    if (Math.abs(gap) >= 3) notes.push({ k: "Skii's own line: {team} {line} (market {market}) — a gap this size has not beaten the closing line historically.", v: { team: names.home, line: s(model.line), market: s(target.spread.line) } });
  }
  if (home.rest !== null && home.rest >= 12) notes.push({ k: "{team} comes off a bye week.", v: { team: names.home } });
  if (away.rest !== null && away.rest >= 12) notes.push({ k: "{team} comes off a bye week.", v: { team: names.away } });
  if (home.rest !== null && home.rest <= 5) notes.push({ k: "{team} plays on a short week.", v: { team: names.home } });
  if (away.rest !== null && away.rest <= 5) notes.push({ k: "{team} plays on a short week.", v: { team: names.away } });
  if (playoff) notes.push({ k: "Playoff game: overtime until someone wins (no ties)." });
  if (quality === "stats") notes.push({ k: "No bookmaker prices yet — the line comes from Skii's NFL strength model only." });

  const parts = [];
  if (hasMargin || target.total) parts.push(`${o.provider} odds (de-vigged)`);
  parts.push("NFL score model (key numbers)");
  if (quality === "stats") { parts.push("Elo ratings"); if (home.gp || away.gp) parts.push("points & yards per play"); if (home.rest !== null || away.rest !== null) parts.push("rest days"); }

  const grade = (p) => (p ? { ...p, tier: tierFor(p.safe ?? p.p, p.ev ?? 0, quality) } : null);
  const gradeValue = (p) => { const g = grade(p); if (g && g.tier === "Skip") g.tier = "Low"; return g; };
  const noTie = out.ml.h + out.ml.a || 1;
  return {
    quality, sport: "football",
    xg: { home: round(out.mean.h, 1), away: round(out.mean.a, 1) }, unit: "pts",
    loc: { m: round(locM, 3), t: round(locT, 3) }, model,
    probs: { h: round(out.ml.h / noTie, 4), a: round(out.ml.a / noTie, 4) },
    reg: { h: round(out.reg.h, 4), d: round(out.reg.d, 4), a: round(out.reg.a, 4) }, otChance: round(out.toOT, 4), tie: round(out.ml.tie, 4),
    basis: parts.join(" + "), fitError: fitError !== null ? round(fitError, 6) : null,
    markets, scores, pick: grade(pickSafe), value: gradeValue(pickValue && (pickValue.ev ?? 0) > 0.01 ? pickValue : null), notes,
  };
}

// ---------- live ----------
// Remaining scoring is drive by drive: each side has its share of the ~11 possessions a team gets
// in a game left (fractional at the end), and each drive scores a field goal, a touchdown (+1 or
// +2 or none) or a safety with a chance set so the side's expected remaining points match the
// pre-game margin and total scaled by the time left. Scores therefore move by 2, 3, 6, 7 or 8 —
// never 1 — nothing can happen at 0:00, and a tie after 60' goes to the trained overtime stage,
// whose points count in the totals (as they do when the bets are graded).
const POSS = 11; // possessions per team per game
const DRIVE = [[3, 0.41], [7, 0.53], [6, 0.03], [8, 0.02], [2, 0.01]]; // points of a scoring drive
const DRIVE_MEAN = DRIVE.reduce((t, [x, q]) => t + x * q, 0);
function remainingPts(mu, poss, max = 70) {
  const out = new Float64Array(max + 1);
  if (!(poss > 1e-6) || !(mu > 1e-6)) { out[0] = 1; return out; }
  const p = clamp(mu / (poss * DRIVE_MEAN), 0, 0.95);
  const step = (pmf) => {
    const nx = new Float64Array(max + 1);
    for (let i = 0; i <= max; i++) {
      if (!pmf[i]) continue;
      nx[i] += pmf[i] * (1 - p);
      for (const [x, q] of DRIVE) if (i + x <= max) nx[i + x] += pmf[i] * p * q;
    }
    return nx;
  };
  const n0 = Math.floor(poss), fr = poss - n0;
  let cur = new Float64Array(max + 1); cur[0] = 1;
  for (let k = 0; k < n0; k++) cur = step(cur);
  const extra = fr > 1e-9 ? step(cur) : cur;
  for (let i = 0; i <= max; i++) out[i] = (1 - fr) * cur[i] + fr * extra[i];
  return out;
}
const overLines = (proj, cur) => [...new Set([Math.floor(proj - 7) + 0.5, Math.floor(proj) + 0.5, Math.floor(proj + 7) + 0.5])].filter((L) => L > cur);

export function nflLive(ev, pre) {
  if (ev.state !== "in" || !pre?.loc) return null;
  const period = ev.period || 1;
  const m = String(ev.clock || "").match(/^(\d+):(\d+)/);
  const playoff = ev.seasonType === 3;
  const otLen = playoff ? 15 : 10;
  const left = m ? clamp(Number(m[1]) + Number(m[2]) / 60, 0, 15) : period >= 5 ? otLen / 2 : 7.5;
  const hs = ev.home.score ?? 0, as = ev.away.score ?? 0, cur = hs + as;
  const label = period <= 4 ? `Q${period} · ${m ? m[0] : ""}`.trim() : `OT · ${m ? m[0] : ""}`.trim();
  const base = { period, label, score: { home: hs, away: as } };
  const { m: locM, t: locT } = pre.loc;
  const pOtHome = otHome(locM, locT, PARAMS);
  const tieShare = playoff ? 0 : clamp(PARAMS.ot.tie, 0, 0.3);
  const otAddMean = PARAMS.ot.add.reduce((t, x) => t + (x.w + x.l) * x.p, 0);

  if (period >= 5) {
    // overtime: a constant scoring hazard fitted so a full overtime stays scoreless `ot.tie` of the
    // time; with `left` minutes to go nobody scores with chance tie^(left / length) (→ 1 at 0:00)
    const pNone = playoff ? 0 : Math.pow(clamp(PARAMS.ot.tie, 1e-4, 0.5), left / otLen);
    const lead = hs - as;
    let pH, pA, extra; // extra: distribution of the overtime points still to come
    if (lead === 0) {
      pH = (1 - pNone) * pOtHome; pA = (1 - pNone) * (1 - pOtHome);
      extra = [[0, pNone], ...PARAMS.ot.add.map((x) => [x.w + x.l, (1 - pNone) * x.p])];
    } else {
      // a side scored first; the other gets its possession and answers about a third of the time
      const ans = (1 - pNone) * 0.35, trailHome = lead < 0;
      pH = trailHome ? ans * pOtHome : 1 - ans * (1 - pOtHome);
      pA = trailHome ? 1 - ans * pOtHome : ans * (1 - pOtHome);
      extra = [[0, 1 - ans], [3, ans * 0.45], [7, ans * 0.55]];
    }
    const tie = Math.max(0, 1 - pH - pA);
    const proj = cur + extra.reduce((t, [x, q]) => t + x * q, 0);
    const overs = overLines(proj, cur).map((L) => ({ line: L, p: round(extra.reduce((t, [x, q]) => t + (cur + x > L ? q : 0), 0), 4) }));
    return { ...base, minute: 60 + round(otLen - left, 1), remainingXg: { home: round(3 * pOtHome * (1 - pNone), 1), away: round(3 * (1 - pOtHome) * (1 - pNone), 1) }, probs: { h: round(pH / (pH + pA || 1), 4), a: round(pA / (pH + pA || 1), 4) }, tie: round(tie, 4), overs, toOT: 1 };
  }

  const elapsed = (period - 1) * 15 + (15 - left);
  const f = clamp((60 - elapsed) / 60, 0, 1);
  // kick-off, still 0-0: the pre-game grid itself (keeps the key numbers and overtime chance exact)
  if (hs === 0 && as === 0 && elapsed < 0.5) {
    const o = outcomes(locM, locT, PARAMS, { playoff });
    const noTie = o.ml.h + o.ml.a || 1;
    return {
      ...base, minute: Math.round(elapsed), remainingXg: { home: round(o.mean.h, 1), away: round(o.mean.a, 1) },
      probs: { h: round(o.ml.h / noTie, 4), a: round(o.ml.a / noTie, 4) }, reg: { h: round(o.reg.h, 4), d: round(o.reg.d, 4), a: round(o.reg.a, 4) }, toOT: round(o.toOT, 4), tie: round(o.ml.tie, 4),
      overs: overLines(o.mean.t, 0).map((L) => ({ line: L, p: round(o.total(L).p, 4) })),
    };
  }
  const fullH = Math.max(0, (locT + locM) / 2), fullA = Math.max(0, (locT - locM) / 2);
  const muH = fullH * f, muA = fullA * f;
  const RH = remainingPts(muH, POSS * f), RA = remainingPts(muA, POSS * f);
  // NFL games finish level after 60' more often than independent drives say (teams play for the
  // tying field goal): tie outcomes get a weight k^f, k set so that at kick-off the drive model's
  // tie chance equals the trained grid's (pre.otChance); it fades to 1 as the clock runs out
  let kTie = 1;
  if (pre.otChance > 0 && pre.otChance < 1) {
    const FH = remainingPts(fullH, POSS), FA = remainingPts(fullA, POSS);
    let t0 = 0; for (let x = 0; x < FH.length; x++) t0 += FH[x] * FA[x];
    if (t0 > 1e-6 && t0 < 1) kTie = clamp((pre.otChance / (1 - pre.otChance)) / (t0 / (1 - t0)), 0.5, 4);
  }
  const wTie = Math.pow(kTie, f);
  let H = 0, D = 0, A = 0, Z = 0;
  const T = new Map(); // final total (overtime included) → probability (normalised by Z below)
  const addT = (t, p) => T.set(t, (T.get(t) || 0) + p);
  for (let a = 0; a < RH.length; a++) {
    if (RH[a] < 1e-12) continue;
    for (let b = 0; b < RA.length; b++) {
      const fh = hs + a, fa = as + b;
      const p = RH[a] * RA[b] * (fh === fa ? wTie : 1);
      if (p < 1e-12) continue;
      Z += p;
      if (fh > fa) { H += p; addT(fh + fa, p); }
      else if (fh < fa) { A += p; addT(fh + fa, p); }
      else {
        D += p;
        for (const x of PARAMS.ot.add) addT(2 * fh + x.w + x.l, p * (1 - tieShare) * x.p);
        for (const x of PARAMS.ot.tieAdd) addT(2 * fh + 2 * x.a, p * tieShare * x.p);
      }
    }
  }
  if (Z > 0) { H /= Z; D /= Z; A /= Z; for (const [t, p] of T) T.set(t, p / Z); }
  const pH = H + D * (1 - tieShare) * pOtHome, pA = A + D * (1 - tieShare) * (1 - pOtHome);
  const proj = cur + muH + muA + D * otAddMean;
  const overs = overLines(proj, cur).map((L) => { let q = 0; for (const [t, p] of T) if (t > L) q += p; return { line: L, p: round(q, 4) }; });
  return {
    ...base, minute: Math.round(elapsed),
    remainingXg: { home: round(muH, 1), away: round(muA, 1) },
    probs: { h: round(pH / (pH + pA || 1), 4), a: round(pA / (pH + pA || 1), 4) }, reg: { h: round(H, 4), d: round(D, 4), a: round(A, 4) }, toOT: round(D, 4), tie: round(D * tieShare, 4),
    overs,
  };
}

export { nflSettle } from "./settle";
