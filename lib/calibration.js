// Calibration: what the engine said (pick chance) vs what actually happened, from every graded pick.
//
// What a walk-forward test on the engine's own graded picks showed (each day forecast with what
// was learned on earlier days only — 4,527 picks, 22 Oct → 21 Nov 2026, log loss, lower is better):
//
//   the model's own chance                                  0.5760
//   chance bucket shifts + league offsets (the old scheme)  0.5822   worse, 3.4 standard errors
//   league offsets alone, any strength                      0.5760 … 0.5830   never better
//   market-family offsets, games with no bookmaker price    0.5730   better, 2.7 standard errors
//
// - A game the bookmaker prices is left alone: its chances come from the de-vigged market, which
//   was within a point of reality on every market family (36,370 closing lines), and every
//   correction learned on top made the forecast worse.
// - League "form" does not persist: leagues labelled weak went on to beat the model by 6 points,
//   leagues labelled strong by 3.5 — the labels were noise, and so were their offsets.
// - A game with no bookmaker price is read by the strength model alone, often from league
//   averages (it does not know the clubs). Reality is more lopsided than "average side against
//   average side": "no draw" landed 79% of the time where the model said 72%, a side expected to
//   score did so less often than it said. One offset per market (on the logit scale, shrunk toward
//   zero by a normal prior so twenty picks barely move it) corrects the chance shown with such a
//   pick. The pick itself is chosen as before: that is the population the test was run on.
//
// The bucket table below is still computed for the record page's chart.
import { withDb } from "./db";
import { remember } from "./memo";

export const BUCKETS = [[0.3, 0.45], [0.45, 0.55], [0.55, 0.62], [0.62, 0.68], [0.68, 0.74], [0.74, 0.8], [0.8, 0.86], [0.86, 0.95]];
const MIN_TOTAL = 150; // overall table
const MIN_CLASS = 100; // one class (priced / estimated) on its own

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : x);

// The model's raw chance of a W for a pick graded W or L. Void outcomes (draw no bet, Asian and
// whole-number lines) refund the stake, so they're taken out: P(W | not void) = p / (1 − v).
export function pickProb(row) {
  const pp = num(row?.pick_p);
  const raw = num(row?.pick_raw) ?? num(row?.pick_safe) ?? pp;
  if (raw === null) return null;
  const v = pp !== null ? Math.max(0, raw - pp) : 0;
  const p = v > 0.005 && pp !== null ? pp / Math.max(0.02, 1 - v) : pp ?? raw;
  return clamp(p, 0.02, 0.98);
}

async function load(days = 90) {
  return withDb("calibration", (sql) => sql`
    select pick_p::float, pick_safe::float, pick_raw::float, pick_est, pick_result from skii_picks
    where state = 'post' and pick_result in ('W', 'L') and kickoff > now() - make_interval(days => ${days})`, []);
}

function table(rows) {
  const buckets = BUCKETS.map(([lo, hi]) => {
    const in_ = rows.filter((x) => x.p >= lo && x.p < hi);
    const w = in_.filter((x) => x.w).length;
    return { lo, hi, n: in_.length, predicted: in_.length ? in_.reduce((a, x) => a + x.p, 0) / in_.length : (lo + hi) / 2, actual: in_.length ? w / in_.length : null };
  });
  return { total: rows.length, buckets };
}

// total/buckets/ready cover every pick (the record page's chart); classes split priced vs estimated.
export async function calibrationTable(days = 90) {
  return remember(`calib:${days}`, 30 * 60e3, async () => {
    const rows = ((await load(days)) || [])
      .map((r) => ({ p: pickProb(r), w: r.pick_result === "W", est: r.pick_est === true }))
      .filter((x) => x.p !== null);
    const cls = (list) => { const t = table(list); return { ...t, ready: t.total >= MIN_CLASS }; };
    const all = table(rows);
    return {
      ...all, ready: all.total >= MIN_TOTAL,
      classes: { priced: cls(rows.filter((x) => !x.est)), estimated: cls(rows.filter((x) => x.est)) },
    };
  });
}

// ---------- games without a bookmaker price: one learned offset per market family ----------
export const MODEL_ONLY = new Set(["model", "stats", "blind"]); // analysis.quality of a game no bookmaker prices
const TAU = 0.2; // prior sd of a family's offset (logit): 0.15–0.25 all tested alike, 0.4 was worse
const MIN_PICKS = 200; // graded model-only picks before anything is applied
const MAX_SHIFT = 0.6; // an offset never exceeds this (about 12 points at 70%)
const logit = (p) => Math.log(p / (1 - p)), sig = (x) => 1 / (1 + Math.exp(-x));

// The family a pick's market belongs to: the market with its line, home and away folded together
// ("HO1.5" and "AO1.5" are one family, "1X" and "X2" another). Other sports keep their own.
export function pickFamily(key, sport = "soccer") {
  const f = String(key || "").replace(/^(H|A)(O|U)/, "T$2").replace(/^(H|A)_CS$/, "T_CS").replace(/^(1X|X2)(?=$|_)/, "DC").replace(/^(1|2)(?=$|_)/, "W").replace(/^DNB[12]$/, "DNB").replace(/^AH[12]/, "AH");
  return sport && sport !== "soccer" ? `${sport}:${f}` : f;
}

// MAP of δ in  y ~ Bernoulli(σ(logit p + δ)),  δ ~ N(0, τ²).
function offsetOf(list, tau = TAU) {
  const prec = 1 / (tau * tau);
  let d = 0;
  for (let it = 0; it < 25; it++) {
    let g = -d * prec, h = prec;
    for (const r of list) { const q = sig(r.z + d); g += r.y - q; h += q * (1 - q); }
    const step = clamp(g / h, -0.5, 0.5);
    d += step;
    if (Math.abs(step) < 1e-6) break;
  }
  return clamp(d, -MAX_SHIFT, MAX_SHIFT);
}

async function loadModelOnly(days) {
  return withDb("modelCalibration", (sql) => sql`
    select league, sport, pick_key, pick_p::float, pick_safe::float, pick_raw::float, pick_est, pick_result, probs->>'q' as q from skii_picks
    where state = 'post' and pick_result in ('W', 'L') and kickoff > now() - make_interval(days => ${days})`, []);
}

// { ready, n, families: { family: { n, w, predicted, delta } } } from the graded picks of games no
// bookmaker priced. A pick saved before the quality was stored counts as model-only when its
// league was (almost) never priced in the window.
export async function modelFamilies(days = 90) {
  return remember(`modelfam:${days}`, 30 * 60e3, async () => {
    const rows = (await loadModelOnly(days)) || [];
    const lg = new Map();
    for (const r of rows) { const x = lg.get(r.league) || { n: 0, priced: 0 }; x.n++; if (r.pick_est !== true) x.priced++; lg.set(r.league, x); }
    const groups = new Map();
    let n = 0;
    for (const r of rows) {
      const only = r.q ? MODEL_ONLY.has(r.q) : r.pick_est === true && lg.get(r.league).priced / lg.get(r.league).n < 0.15;
      const p = only ? pickProb(r) : null;
      if (p === null) continue;
      const f = pickFamily(r.pick_key, r.sport);
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f).push({ z: logit(p), p, y: r.pick_result === "W" ? 1 : 0 });
      n++;
    }
    const families = {};
    for (const [f, list] of groups) families[f] = { n: list.length, w: list.filter((x) => x.y).length, predicted: list.reduce((a, x) => a + x.p, 0) / list.length, delta: Math.round(offsetOf(list) * 1e4) / 1e4 };
    return { ready: n >= MIN_PICKS, n, families };
  });
}

// (p, market key, sport) → corrected chance of a win, for a game no bookmaker prices.
// null while there is not enough history (callers then leave p alone).
export async function modelCalibrator(days = 90) {
  const t = await modelFamilies(days);
  if (!t.ready) return null;
  return (p, key, sport = "soccer") => {
    if (p === null || p === undefined || Number.isNaN(p) || p <= 0 || p >= 1) return p;
    const d = t.families[pickFamily(key, sport)]?.delta || 0;
    return d ? clamp(sig(logit(clamp(p, 0.02, 0.98)) + d), 0.03, 0.97) : p;
  };
}
