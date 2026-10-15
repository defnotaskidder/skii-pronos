// Calibration: what the engine said (pick chance) vs what actually happened, from every graded
// pick. Once there's enough history the correction is applied to displayed chances and tiers,
// so "76%" means 76% in practice, not on paper.
import { withDb } from "./db";
import { remember } from "./memo";

export const BUCKETS = [[0.3, 0.45], [0.45, 0.55], [0.55, 0.62], [0.62, 0.68], [0.68, 0.74], [0.74, 0.8], [0.8, 0.86], [0.86, 0.95]];
const MIN_TOTAL = 150;

async function load(days = 90) {
  return withDb("calibration", (sql) => sql`
    select pick_safe::float as p, pick_result as r, pick_tier as tier from skii_picks
    where state = 'post' and pick_result in ('W', 'L') and kickoff > now() - make_interval(days => ${days})`, []);
}

export async function calibrationTable(days = 90) {
  return remember(`calib:${days}`, 30 * 60e3, async () => {
    const rows = (await load(days)) || [];
    const buckets = BUCKETS.map(([lo, hi]) => {
      const in_ = rows.filter((x) => x.p >= lo && x.p < hi);
      const w = in_.filter((x) => x.r === "W").length;
      return { lo, hi, n: in_.length, predicted: in_.length ? in_.reduce((a, x) => a + x.p, 0) / in_.length : (lo + hi) / 2, actual: in_.length ? w / in_.length : null };
    });
    return { total: rows.length, buckets, ready: rows.length >= MIN_TOTAL };
  });
}

// p → calibrated p. Shrinks each bucket's correction by its sample size so small buckets barely move.
export async function calibrator(days = 90) {
  const tbl = await calibrationTable(days);
  if (!tbl.ready) return null;
  const adj = tbl.buckets.map((b) => {
    if (!b.n || b.actual === null) return 0;
    const trust = Math.min(1, b.n / 80);
    return (b.actual - b.predicted) * trust;
  });
  return (p) => {
    if (p === null || p === undefined) return p;
    let i = BUCKETS.findIndex(([lo, hi]) => p >= lo && p < hi);
    if (i === -1) return p;
    return Math.max(0.05, Math.min(0.97, p + adj[i]));
  };
}
