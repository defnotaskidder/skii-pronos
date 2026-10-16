// Skii prono engine — quantitative core.
//
// 1. Market: bookmaker odds → fair probabilities (power de-vig removes the margin and the
//    favourite/long-shot bias better than plain normalisation).
// 2. Goals: fit a Dixon-Coles Poisson model (home & away expected goals) to those fair
//    probabilities, so every other market (double chance, BTTS, team totals, handicaps,
//    exact scores…) is priced consistently from one score matrix.
// 3. Stats: an independent expected-goals estimate from the league table (attack/defence
//    rates vs league average) and recent form, blended in at a small weight. Where it
//    disagrees with the market, that disagreement is the "edge".
// 4. Selection: score every market by probability and value, pick the best, grade the
//    confidence honestly. Live: re-price from the current score, minute and red cards.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

// ---------- market maths ----------
export function devig(odds) {
  const inv = odds.map((o) => (o && o > 1 ? 1 / o : 0));
  if (inv.some((x) => x === 0)) return null;
  const book = inv.reduce((a, b) => a + b, 0);
  if (book <= 1) return inv.map((x) => x / book);
  // power method: find k with sum(p_i^k) = 1
  let lo = 1, hi = 3;
  for (let i = 0; i < 50; i++) {
    const k = (lo + hi) / 2;
    const s = inv.reduce((a, p) => a + p ** k, 0);
    if (s > 1) lo = k; else hi = k;
  }
  const k = (lo + hi) / 2;
  return inv.map((p) => p ** k);
}
export const margin = (odds) => odds.reduce((a, o) => a + 1 / o, 0) - 1;

// ---------- Poisson / Dixon-Coles ----------
const MAXG = 10;

// Poisson probabilities 0..MAXG by recurrence (no pow/factorial per cell).
function pmf(l) {
  const p = new Array(MAXG + 1);
  p[0] = Math.exp(-l);
  for (let k = 1; k <= MAXG; k++) p[k] = p[k - 1] * l / k;
  return p;
}

export function matrix(lh, la, rho = -0.07) {
  const ph = pmf(lh), pa = pmf(la);
  const m = [];
  let sum = 0;
  for (let i = 0; i <= MAXG; i++) {
    const row = new Array(MAXG + 1);
    for (let j = 0; j <= MAXG; j++) {
      let p = ph[i] * pa[j];
      if (i < 2 && j < 2) {
        if (i === 0 && j === 0) p *= 1 - lh * la * rho;
        else if (i === 0) p *= 1 + lh * rho;
        else if (j === 0) p *= 1 + la * rho;
        else p *= 1 - rho;
      }
      row[j] = p > 0 ? p : 0;
      sum += row[j];
    }
    m[i] = row;
  }
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) m[i][j] /= sum;
  return m;
}

function sumWhere(m, f) {
  let s = 0;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) if (f(i, j)) s += m[i][j];
  return s;
}
const outcome = (m) => ({ h: sumWhere(m, (i, j) => i > j), d: sumWhere(m, (i, j) => i === j), a: sumWhere(m, (i, j) => i < j) });

// Find expected goals that reproduce the market's 1X2 (and total, when known).
export function fitGoals(p1x2, over) {
  const err = (lh, la) => {
    const m = matrix(lh, la);
    let h = 0, d = 0, a = 0, o = 0;
    for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
      const p = m[i][j];
      if (i > j) h += p; else if (i === j) d += p; else a += p;
      if (over && i + j > over.line) o += p;
    }
    let e = 0;
    if (p1x2) e += (h - p1x2.h) ** 2 + (d - p1x2.d) ** 2 + (a - p1x2.a) ** 2;
    if (over) e += 1.5 * (o - over.p) ** 2;
    return e;
  };
  // coarse-to-fine grid: 0.2 → 0.05 → 0.01 (≈640 evaluations instead of ≈1800)
  let best = [1.4, 1.1], be = Infinity;
  const scan = (h0, h1, a0, a1, step) => {
    for (let lh = h0; lh <= h1 + 1e-9; lh += step) for (let la = a0; la <= a1 + 1e-9; la += step) {
      if (lh <= 0.05 || la <= 0.05) continue;
      const e = err(lh, la); if (e < be) { be = e; best = [lh, la]; }
    }
  };
  scan(0.2, 4.2, 0.2, 4.2, 0.2);
  scan(best[0] - 0.2, best[0] + 0.2, best[1] - 0.2, best[1] + 0.2, 0.05);
  scan(best[0] - 0.05, best[0] + 0.05, best[1] - 0.05, best[1] + 0.05, 0.01);
  return { lh: best[0], la: best[1], fitError: be };
}

// Expected goals from a rating gap (Elo from lib/ratings.js): 400 points ≈ 85% win chance.
export function ratingGoals(home, away) {
  if (!home || !away) return null;
  const conf = Math.min(home.games, away.games) / 15; // 0..1, trust grows with games played
  if (conf < 0.2) return null;
  const diff = (home.rating + 60 - away.rating) / 400; // ±1 = big gap
  const base = 1.3;
  return { lh: base * Math.exp(0.55 * diff), la: base * Math.exp(-0.55 * diff), weight: Math.min(1, conf) * 0.35 };
}

// ---------- stats model (league table + form) ----------
const formPoints = (form) => {
  if (!form) return null;
  const f = form.slice(-5).toUpperCase().split("").filter((c) => "WDL".includes(c));
  if (!f.length) return null;
  return f.reduce((a, c) => a + (c === "W" ? 3 : c === "D" ? 1 : 0), 0) / f.length; // 0..3
};

export function statsGoals(ev, table, ratings = null) {
  const H = table?.[ev.home?.id], A = table?.[ev.away?.id];
  const rows = Object.values(table || {}).filter((r) => r.gp > 0);
  let lh = 1.45, la = 1.15, basis = "league average";
  if (H?.gp >= 3 && A?.gp >= 3 && rows.length >= 6) {
    const gp = rows.reduce((a, r) => a + r.gp, 0);
    const avg = rows.reduce((a, r) => a + r.gf, 0) / gp; // goals per team per game
    const att = (r) => (r.gf / r.gp) / avg, def = (r) => (r.ga / r.gp) / avg;
    // shrink small samples toward average
    const w = (r) => clamp(r.gp / 12, 0.25, 0.85);
    const shrink = (x, r) => 1 + (x - 1) * w(r);
    lh = avg * 1.12 * shrink(att(H), H) * shrink(def(A), A);
    la = avg * 0.89 * shrink(att(A), A) * shrink(def(H), H);
    basis = "league table";
  }
  const fh = formPoints(ev.home?.form), fa = formPoints(ev.away?.form);
  if (fh !== null && fa !== null) {
    const swing = clamp((fh - fa) * 0.06, -0.18, 0.18);
    lh *= 1 + swing; la *= 1 - swing;
    basis += " + form";
  }
  // learned team ratings (Elo from every finished game): blended in as they gain history
  const rg = ratingGoals(ratings?.home, ratings?.away);
  if (rg) {
    lh = lh * (1 - rg.weight) + rg.lh * rg.weight;
    la = la * (1 - rg.weight) + rg.la * rg.weight;
    basis += " + ratings";
  }
  return { lh: clamp(lh, 0.2, 4), la: clamp(la, 0.2, 4), basis };
}

// ---------- market table ----------
function ahProb(m, line, side) {
  // Asian handicap on `side` with handicap `line` (e.g. home -0.5). Quarter lines split.
  const frac = Math.abs(line * 4) % 2 === 1;
  if (frac) {
    const a = ahProb(m, line - 0.25, side), b = ahProb(m, line + 0.25, side);
    return { p: (a.p + b.p) / 2, v: (a.v + b.v) / 2 };
  }
  const diff = (i, j) => (side === "home" ? i - j : j - i) + line;
  return { p: sumWhere(m, (i, j) => diff(i, j) > 0), v: sumWhere(m, (i, j) => diff(i, j) === 0) };
}

export function soccerMarkets(m, names, rates = null) {
  const { h, d, a } = outcome(m);
  const H = names.home, A = names.away;
  const mk = (key, group, label, p, v = 0) => ({ key, group, label, p: round(p, 4), v: round(v, 4) });
  const list = [
    mk("1", "1X2", `${H} win`, h), mk("X", "1X2", "Draw", d), mk("2", "1X2", `${A} win`, a),
    mk("1X", "Double chance", `${H} or draw`, h + d), mk("X2", "Double chance", `${A} or draw`, a + d), mk("12", "Double chance", "No draw", h + a),
    mk("DNB1", "Draw no bet", `${H} (DNB)`, h, d), mk("DNB2", "Draw no bet", `${A} (DNB)`, a, d),
  ];
  for (const L of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    const o = sumWhere(m, (i, j) => i + j > L);
    list.push(mk(`O${L}`, "Goals", `Over ${L}`, o), mk(`U${L}`, "Goals", `Under ${L}`, 1 - o));
  }
  const btts = sumWhere(m, (i, j) => i > 0 && j > 0);
  list.push(mk("BTTS_Y", "Both teams score", "BTTS — Yes", btts), mk("BTTS_N", "Both teams score", "BTTS — No", 1 - btts));
  for (const L of [0.5, 1.5]) {
    const ho = sumWhere(m, (i) => i > L), ao = sumWhere(m, (_, j) => j > L);
    list.push(mk(`HO${L}`, "Team goals", `${H} over ${L}`, ho), mk(`AO${L}`, "Team goals", `${A} over ${L}`, ao));
  }
  list.push(
    mk("H_CS", "Clean sheet", `${H} clean sheet`, sumWhere(m, (_, j) => j === 0)),
    mk("A_CS", "Clean sheet", `${A} clean sheet`, sumWhere(m, (i) => i === 0)),
    mk("1_O1.5", "Combo", `${H} win & over 1.5`, sumWhere(m, (i, j) => i > j && i + j > 1)),
    mk("2_O1.5", "Combo", `${A} win & over 1.5`, sumWhere(m, (i, j) => j > i && i + j > 1)),
    mk("1X_U3.5", "Combo", `${H} or draw & under 3.5`, sumWhere(m, (i, j) => i >= j && i + j < 4)),
    mk("X2_U3.5", "Combo", `${A} or draw & under 3.5`, sumWhere(m, (i, j) => j >= i && i + j < 4)),
  );
  for (const line of [-1.5, -1, -0.5, 0.5, 1, 1.5]) {
    const hp = ahProb(m, line, "home"), ap = ahProb(m, -line, "away");
    const s = (x) => (x > 0 ? `+${x}` : `${x}`);
    list.push(mk(`AH1${s(line)}`, "Handicap", `${H} ${s(line)}`, hp.p, hp.v), mk(`AH2${s(-line)}`, "Handicap", `${A} ${s(-line)}`, ap.p, ap.v));
  }
  // team totals: unders and a third line
  for (const L of [0.5, 1.5]) list.push(mk(`HU${L}`, "Team goals", `${H} under ${L}`, sumWhere(m, (i) => i < L)), mk(`AU${L}`, "Team goals", `${A} under ${L}`, sumWhere(m, (_, j) => j < L)));
  list.push(mk("HO2.5", "Team goals", `${H} over 2.5`, sumWhere(m, (i) => i > 2.5)), mk("AO2.5", "Team goals", `${A} over 2.5`, sumWhere(m, (_, j) => j > 2.5)));
  // exact number of goals, odd/even total
  for (let n = 0; n <= 4; n++) list.push(mk(`TG${n}`, "Exact goals", `Exactly ${n} goals`, sumWhere(m, (i, j) => i + j === n)));
  list.push(mk("TG5+", "Exact goals", "5+ goals", sumWhere(m, (i, j) => i + j >= 5)));
  const odd = sumWhere(m, (i, j) => (i + j) % 2 === 1);
  list.push(mk("ODD", "Odd/Even", "Odd goals", odd), mk("EVEN", "Odd/Even", "Even goals", 1 - odd));
  // winning margin
  for (const [side, nm] of [["1", H], ["2", A]]) {
    const mg = (f) => sumWhere(m, (i, j) => f(side === "1" ? i - j : j - i));
    list.push(mk(`WM${side}-1`, "Winning margin", `${nm} by 1`, mg((x) => x === 1)), mk(`WM${side}-2`, "Winning margin", `${nm} by 2`, mg((x) => x === 2)), mk(`WM${side}-3`, "Winning margin", `${nm} by 3+`, mg((x) => x >= 3)));
  }
  // correct score: the 12 likeliest
  const cs = [];
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) cs.push([i, j, m[i][j]]);
  cs.sort((x, y) => y[2] - x[2]);
  for (const [i, j, p] of cs.slice(0, 12)) list.push(mk(`CS${i}-${j}`, "Correct score", `Correct score ${i}-${j}`, p));
  // goal order, half-time and HT/FT. Shown for analysis only (info): grading them needs the
  // half-time score or the order of goals, which the results feed doesn't keep.
  if (rates?.lh > 0 && rates?.la > 0) {
    const { lh, la } = rates, none = m[0][0], share = (x) => (1 - none) * x / (lh + la);
    const info = (o) => ({ ...o, info: true });
    list.push(info(mk("FG1", "First goal", `${H} scores first`, share(lh))), info(mk("FG2", "First goal", `${A} scores first`, share(la))), info(mk("FGN", "First goal", "No goal", none)));
    list.push(info(mk("LG1", "Last goal", `${H} scores last`, share(lh))), info(mk("LG2", "Last goal", `${A} scores last`, share(la))));
    // about 45% of goals come before the break; the halves are treated as independent
    const K = 7, h1 = pmf(lh * 0.45), a1 = pmf(la * 0.45), h2 = pmf(lh * 0.55), a2 = pmf(la * 0.55);
    const res = (x) => (x > 0 ? 0 : x === 0 ? 1 : 2);
    const ht = [0, 0, 0], hf = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
      const p1 = h1[i] * a1[j];
      ht[res(i - j)] += p1;
      for (let k = 0; k < K; k++) for (let l = 0; l < K; l++) hf[res(i - j)][res(i + k - j - l)] += p1 * h2[k] * a2[l];
    }
    list.push(info(mk("HT1", "Half-time", `${H} win (HT)`, ht[0])), info(mk("HTX", "Half-time", "Draw (HT)", ht[1])), info(mk("HT2", "Half-time", `${A} win (HT)`, ht[2])));
    const who = [H, "X", A];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) list.push(info(mk(`HF${"1X2"[x]}${"1X2"[y]}`, "Half-time/Full-time", `${who[x]} / ${who[y]} (HT/FT)`, hf[x][y])));
  }
  const scores = [];
  for (let i = 0; i <= 5; i++) for (let j = 0; j <= 5; j++) scores.push({ score: `${i}-${j}`, p: round(m[i][j], 4) });
  scores.sort((x, y) => y.p - x.p);
  return { list, scores: scores.slice(0, 6) };
}

// Attach real bookmaker prices to model markets.
function attachBook(list, odds) {
  if (!odds) return;
  const set = (key, price, src = odds.provider) => {
    const m = list.find((x) => x.key === key);
    if (m && price > 1) { m.odds = price; m.book = src; }
  };
  set("1", odds.home); set("X", odds.draw); set("2", odds.away);
  if (odds.total?.line !== undefined) { set(`O${odds.total.line}`, odds.total.over); set(`U${odds.total.line}`, odds.total.under); }
  if (odds.spread?.line !== undefined) {
    const s = (x) => (x > 0 ? `+${x}` : `${x}`);
    set(`AH1${s(odds.spread.line)}`, odds.spread.home); set(`AH2${s(-odds.spread.line)}`, odds.spread.away);
    // DraftKings soccer "spread +0.5" is the same bet as double chance
    if (odds.spread.line === 0.5) set("1X", odds.spread.home);
    if (odds.spread.line === -0.5) set("X2", odds.spread.away);
  }
  for (const [k, v] of Object.entries(odds.extra || {})) set(k, v.price, v.book);
}

// ---------- evaluation ----------
const ASSUMED_MARGIN = 0.06; // when no book price is known, assume a typical 6% book margin
export function enrich(mkt) {
  // fair price: p·odds + void = 1  →  odds = (1 − void) / p
  const fair = mkt.p > 0 ? (1 - (mkt.v || 0)) / Math.max(mkt.p, 1e-6) : null;
  const est = !mkt.odds;
  const odds = mkt.odds || (fair ? Math.max(1.01, round(fair / (1 + ASSUMED_MARGIN), 2)) : null);
  // expected value per unit: win pays odds, void returns stake
  const ev = odds ? mkt.p * odds + mkt.v - 1 : null;
  // probability of not losing the stake (void counts as safe)
  const safe = mkt.p + mkt.v;
  return { ...mkt, fair: fair ? round(fair, 2) : null, odds: odds ? round(odds, 2) : null, estimated: est, ev: ev !== null ? round(ev, 4) : null, safe: round(safe, 4) };
}

export function tierFor(p, ev, quality) {
  let t = p >= 0.82 && ev >= -0.03 ? "High" : p >= 0.72 ? "Med-High" : p >= 0.6 ? "Medium" : p >= 0.45 ? "Low" : "Skip";
  if (quality === "stats") t = { High: "Medium", "Med-High": "Medium", Medium: "Low", Low: "Low", Skip: "Skip" }[t];
  if (quality === "partial" && t === "High") t = "Med-High";
  return t;
}
export const TIER_RANK = { High: 4, "Med-High": 3, Medium: 2, Low: 1, Skip: 0 };

// Choose the best market for a profile. `safe` = highest chance at a playable price,
// `value` = biggest edge with a fair chance, `balanced` = blend.
export function choose(markets, mode = "safe", { onlyPriced = false } = {}) {
  const pool = markets.filter((m) => {
    if (!m.odds || m.info || (onlyPriced && m.estimated)) return false;
    if (m.key.startsWith("AH") && m.estimated) return false; // handicaps only with a real price
    if (m.key === "X") return mode === "value"; // a draw is never a "safe" pick
    return true;
  });
  const score = (m) => {
    const ev = m.ev ?? 0;
    const pricePenalty = m.estimated ? 0.015 : 0;
    if (mode === "safe") {
      if (m.odds < 1.2 || m.safe < 0.66) return -Infinity;
      return m.safe + 0.9 * ev + 0.05 * Math.log(m.odds) - pricePenalty;
    }
    if (mode === "value") {
      if (m.p < 0.4 || m.odds < 1.5 || m.odds > 4.5 || m.estimated) return -Infinity;
      return ev * Math.sqrt(m.p);
    }
    if (m.odds < 1.35 || m.p < 0.55) return -Infinity;
    return m.p * 0.6 + ev + 0.08 * Math.log(m.odds) - pricePenalty;
  };
  const ranked = pool.map((m) => ({ m, s: score(m) })).filter((x) => x.s > -Infinity).sort((a, b) => b.s - a.s);
  return ranked.map((x) => x.m);
}

// ---------- 2-way sports (NBA, NFL, NHL, MLB) ----------
function twoWayMarkets(ev, names) {
  const o = ev.odds;
  const list = [];
  // labels say what the price covers: these moneylines include overtime (and the NHL shootout),
  // unlike the default regulation-time 1X2 on 1xBet
  const win = { hockey: " win (incl. OT & SO)", basketball: " win (incl. OT)", football: " win (incl. OT)" }[ev.sport] || " win";
  const unit = ev.sport === "basketball" ? " pts" : "";
  if (o?.home && o?.away) {
    const f = devig([o.home, o.away]);
    if (f) list.push({ key: "1", group: "Winner", label: `${names.home}${win}`, p: round(f[0], 4), v: 0, odds: o.home, book: o.provider },
      { key: "2", group: "Winner", label: `${names.away}${win}`, p: round(f[1], 4), v: 0, odds: o.away, book: o.provider });
  }
  if (o?.total?.over && o?.total?.under) {
    const f = devig([o.total.over, o.total.under]);
    if (f) list.push({ key: `O${o.total.line}`, group: "Total", label: `Over ${o.total.line}${unit}`, p: round(f[0], 4), v: 0, odds: o.total.over, book: o.provider },
      { key: `U${o.total.line}`, group: "Total", label: `Under ${o.total.line}${unit}`, p: round(f[1], 4), v: 0, odds: o.total.under, book: o.provider });
  }
  if (o?.spread?.home && o?.spread?.away) {
    const f = devig([o.spread.home, o.spread.away]);
    const s = (x) => (x > 0 ? `+${x}` : `${x}`);
    if (f) list.push({ key: `AH1${s(o.spread.line)}`, group: "Spread", label: `${names.home} ${s(o.spread.line)}`, p: round(f[0], 4), v: 0, odds: o.spread.home, book: o.provider },
      { key: `AH2${s(-o.spread.line)}`, group: "Spread", label: `${names.away} ${s(-o.spread.line)}`, p: round(f[1], 4), v: 0, odds: o.spread.away, book: o.provider });
  }
  return list;
}

// ---------- full analysis of one event ----------
export function analyse(ev, table = {}, ratings = null) {
  const names = { home: ev.home?.short || ev.home?.name || "Home", away: ev.away?.short || ev.away?.name || "Away" };
  if (!ev.home || !ev.away) return null;

  if (ev.sport !== "soccer") {
    const list = twoWayMarkets(ev, names).map(enrich);
    if (!list.length) return { quality: "none", markets: [], pick: null, value: null };
    const pick = choose(list, "safe")[0] || choose(list, "balanced")[0] || null;
    const fav = list.filter((m) => m.group === "Winner").sort((a, b) => b.p - a.p)[0];
    return {
      quality: "market", probs: fav ? { h: list.find((m) => m.key === "1")?.p, a: list.find((m) => m.key === "2")?.p } : null,
      markets: list, pick: pick ? { ...pick, tier: tierFor(pick.p, pick.ev ?? 0, "market") } : null,
      value: null, notes: [],
    };
  }

  const o = ev.odds;
  let mkt = null, over = null, quality = "stats";
  if (o?.home && o?.draw && o?.away) {
    const f = devig([o.home, o.draw, o.away]);
    if (f) { mkt = { h: f[0], d: f[1], a: f[2] }; quality = "partial"; }
  }
  if (o?.total?.over && o?.total?.under) {
    const f = devig([o.total.over, o.total.under]);
    if (f) { over = { line: o.total.line, p: f[0] }; if (mkt) quality = "market"; }
  }

  const stats = statsGoals(ev, table, ratings);
  let lh = stats.lh, la = stats.la, fitError = null;
  if (mkt) {
    const fit = fitGoals(mkt, over);
    fitError = fit.fitError;
    // markets are sharp; the stats model nudges, it does not override
    const w = stats.basis.startsWith("league table") ? 0.18 : 0.08;
    lh = fit.lh * (1 - w) + stats.lh * w;
    la = fit.la * (1 - w) + stats.la * w;
  }
  const m = matrix(lh, la);
  const { list, scores } = soccerMarkets(m, names, { lh, la });
  attachBook(list, o);
  const markets = list.map(enrich);
  const probs = outcome(m);

  const pickSafe = choose(markets, "safe")[0] || choose(markets, "balanced")[0] || null;
  const pickValue = choose(markets, "value")[0] || null;
  const notes = [];
  // line movement on 1X2 (opening → current): money following a side is real information
  if (o?.homeOpen && o?.home && o?.awayOpen && o?.away) {
    const dh = o.homeOpen - o.home, da = o.awayOpen - o.away;
    if (Math.abs(dh) >= 0.08 || Math.abs(da) >= 0.08) {
      const side = dh > da ? names.home : names.away;
      notes.push({ k: "Market moved toward {side} ({from} → {to}).", v: { side, from: (dh > da ? o.homeOpen : o.awayOpen).toFixed(2), to: (dh > da ? o.home : o.away).toFixed(2) } });
    }
  }
  if (quality === "stats") notes.push({ k: "No bookmaker prices yet — probabilities come from the league table and form only." });
  if (ev.reds?.home || ev.reds?.away) notes.push({ k: "Red card in this match." });

  const grade = (p) => (p ? { ...p, tier: tierFor(p.safe ?? p.p, p.ev ?? 0, quality) } : null);
  // a value pick has a real edge by definition, so it is at least "Low" (a long shot), never "Skip"
  const gradeValue = (p) => { const g = grade(p); if (g && g.tier === "Skip") g.tier = "Low"; return g; };
  return {
    quality, xg: { home: round(lh, 2), away: round(la, 2) }, probs: { h: round(probs.h, 4), d: round(probs.d, 4), a: round(probs.a, 4) },
    basis: mkt ? `${o.provider} odds (de-vigged) + ${stats.basis}` : stats.basis,
    fitError: fitError !== null ? round(fitError, 5) : null,
    markets, scores, pick: grade(pickSafe), value: gradeValue(pickValue && (pickValue.ev ?? 0) > 0.01 ? pickValue : null), notes,
  };
}

// ---------- live re-pricing ----------
// Remaining goals ~ Poisson(pre-match rate × time left × game-state adjustments).
export function liveAnalyse(ev, pre, stats = {}) {
  if (ev.sport !== "soccer" || ev.state !== "in" || !pre?.xg) return null;
  const minute = clamp(ev.minute ?? (ev.period >= 2 ? 60 : 25), 0, 95);
  const left = clamp((93 - minute) / 93, 0.01, 1);
  let rh = pre.xg.home * left, ra = pre.xg.away * left;
  const hs = ev.home.score ?? 0, as = ev.away.score ?? 0;
  // game state: trailing sides push, leaders sit back a little
  if (hs > as) { rh *= 0.9; ra *= 1.15; } else if (as > hs) { ra *= 0.9; rh *= 1.15; }
  // red cards
  const rH = ev.reds?.home || stats.redCards?.home || 0, rA = ev.reds?.away || stats.redCards?.away || 0;
  rh *= 0.72 ** rH * 1.22 ** rA; ra *= 0.72 ** rA * 1.22 ** rH;
  // pressure: shots on target share, softly
  const sh = stats.shotsOnTarget?.home, sa = stats.shotsOnTarget?.away;
  if (sh !== null && sh !== undefined && sa !== null && sa !== undefined && sh + sa >= 4) {
    const share = sh / (sh + sa);
    const tilt = clamp((share - 0.5) * 0.5, -0.2, 0.2);
    rh *= 1 + tilt; ra *= 1 - tilt;
  }
  const m = matrix(Math.max(rh, 0.01), Math.max(ra, 0.01), 0);
  const fin = (f) => sumWhere(m, (i, j) => f(hs + i, as + j));
  const total = hs + as;
  const lines = [0.5, 1.5, 2.5, 3.5, 4.5].filter((L) => L > total).slice(0, 3);
  const pNoGoal = m[0][0];
  const nextHome = (1 - pNoGoal) * rh / (rh + ra);
  return {
    minute, remainingXg: { home: round(rh, 2), away: round(ra, 2) },
    probs: { h: round(fin((i, j) => i > j), 4), d: round(fin((i, j) => i === j), 4), a: round(fin((i, j) => i < j), 4) },
    overs: lines.map((L) => ({ line: L, p: round(fin((i, j) => i + j > L), 4) })),
    nextGoal: { home: round(nextHome, 4), away: round(1 - pNoGoal - nextHome, 4), none: round(pNoGoal, 4) },
    btts: round(fin((i, j) => i > 0 && j > 0), 4),
  };
}

// ---------- settlement ----------
export function settle(key, hs, as) {
  if (hs === null || as === null || hs === undefined || as === undefined) return null;
  const d = hs - as, t = hs + as;
  const ah = (line, side) => { const x = (side === "home" ? d : -d) + line; return x > 0 ? "W" : x === 0 ? "V" : "L"; };
  let m;
  if (key === "1") return d > 0 ? "W" : "L";
  if (key === "X") return d === 0 ? "W" : "L";
  if (key === "2") return d < 0 ? "W" : "L";
  if (key === "1X") return d >= 0 ? "W" : "L";
  if (key === "X2") return d <= 0 ? "W" : "L";
  if (key === "12") return d !== 0 ? "W" : "L";
  if (key === "DNB1") return d > 0 ? "W" : d === 0 ? "V" : "L";
  if (key === "DNB2") return d < 0 ? "W" : d === 0 ? "V" : "L";
  if (key === "BTTS_Y") return hs > 0 && as > 0 ? "W" : "L";
  if (key === "BTTS_N") return hs > 0 && as > 0 ? "L" : "W";
  if (key === "H_CS") return as === 0 ? "W" : "L";
  if (key === "A_CS") return hs === 0 ? "W" : "L";
  if (key === "1_O1.5") return d > 0 && t > 1 ? "W" : "L";
  if (key === "2_O1.5") return d < 0 && t > 1 ? "W" : "L";
  if (key === "1X_U3.5") return d >= 0 && t < 4 ? "W" : "L";
  if (key === "X2_U3.5") return d <= 0 && t < 4 ? "W" : "L";
  if ((m = key.match(/^O([\d.]+)$/))) return t > +m[1] ? "W" : t === +m[1] ? "V" : "L";
  if ((m = key.match(/^U([\d.]+)$/))) return t < +m[1] ? "W" : t === +m[1] ? "V" : "L";
  if ((m = key.match(/^HO([\d.]+)$/))) return hs > +m[1] ? "W" : "L";
  if ((m = key.match(/^AO([\d.]+)$/))) return as > +m[1] ? "W" : "L";
  if ((m = key.match(/^HU([\d.]+)$/))) return hs < +m[1] ? "W" : "L";
  if ((m = key.match(/^AU([\d.]+)$/))) return as < +m[1] ? "W" : "L";
  if (key === "TG5+") return t >= 5 ? "W" : "L";
  if ((m = key.match(/^TG(\d+)$/))) return t === +m[1] ? "W" : "L";
  if (key === "ODD") return t % 2 === 1 ? "W" : "L";
  if (key === "EVEN") return t % 2 === 0 ? "W" : "L";
  if ((m = key.match(/^WM([12])-(\d)$/))) { const x = m[1] === "1" ? d : -d; return (+m[2] === 3 ? x >= 3 : x === +m[2]) ? "W" : "L"; }
  if ((m = key.match(/^CS(\d+)-(\d+)$/))) return hs === +m[1] && as === +m[2] ? "W" : "L";
  if ((m = key.match(/^AH1([+-][\d.]+)$/))) return ah(+m[1], "home");
  if ((m = key.match(/^AH2([+-][\d.]+)$/))) return ah(+m[1], "away");
  return null;
}
