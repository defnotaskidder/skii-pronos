// Calibration: what the engine said (pick chance) vs what actually happened, from every graded
// pick. Once there's enough history the correction is applied to displayed chances and tiers,
// so "76%" means 76% in practice, not on paper. Priced picks (bookmaker odds) and estimated ones
// (stats only) are calibrated separately: stats-only overconfidence in obscure leagues must not
// drag down picks the market has priced.
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

// Per-bucket correction, shrunk by sample size so small buckets barely move.
const shifts = (tbl) => tbl.buckets.map((b) => (!b.n || b.actual === null ? 0 : (b.actual - b.predicted) * Math.min(1, b.n / 80)));

// (p, estimated) → calibrated p. Each class uses its own table once it has 100 graded picks,
// else the overall table once that has 150, else p is left alone. null while nothing is ready.
export async function calibrator(days = 90) {
  const tbl = await calibrationTable(days);
  const { priced, estimated } = tbl.classes || {};
  if (!tbl.ready && !priced?.ready && !estimated?.ready) return null;
  const all = tbl.ready ? shifts(tbl) : null;
  const adj = { priced: priced?.ready ? shifts(priced) : all, estimated: estimated?.ready ? shifts(estimated) : all };
  return (p, est = false) => {
    if (p === null || p === undefined) return p;
    const a = adj[est ? "estimated" : "priced"];
    const i = a ? BUCKETS.findIndex(([lo, hi]) => p >= lo && p < hi) : -1;
    if (i === -1) return p;
    return clamp(p + a[i], 0.05, 0.97);
  };
}
