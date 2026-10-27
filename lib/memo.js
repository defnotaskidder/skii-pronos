// Short per-process memo on top of Next's data cache. Shared by every route (globalThis),
// one in-flight computation per key, and the last good value survives an upstream outage.
const memo = globalThis.__skiiMemo || (globalThis.__skiiMemo = new Map());

export async function remember(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit?.value !== undefined && Date.now() - hit.at < ttlMs) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = (async () => {
    try {
      const value = await fn();
      memo.set(key, { at: Date.now(), value });
      return value;
    } catch (e) {
      if (hit?.value !== undefined) { memo.set(key, { at: Date.now() - ttlMs / 2, value: hit.value }); return hit.value; }
      memo.delete(key);
      throw e;
    }
  })();
  memo.set(key, { ...hit, pending });
  return pending;
}

// Snapshot layer on top of the memo. The last value is also kept in the database (skii_cache), so a
// fresh server instance — every cold start on Vercel — answers from that snapshot at once instead
// of rebuilding it (the full board means 20 MB of ESPN feeds and a thousand analyses, 10–20 s).
// A snapshot younger than `ttlMs` is simply used; one younger than `stale` is served once and
// the next call rebuilds; older ones are ignored. Each rebuilt value is written back, at most one
// write per `write` ms per key. Without a database this is exactly `remember`.
let dbMod = null;
const db = () => dbMod || (dbMod = import("./db")); // lazy: db.js pulls the model in, memo.js must stay light
// Snapshots are per deployment: a new build never serves a payload shaped by the previous one.
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev").slice(0, 12);
export async function rememberShared(key, ttlMs, fn, { stale = 15 * 60e3, write = 60e3 } = {}) {
  const hit = memo.get(key);
  if (hit?.value !== undefined && Date.now() - hit.at < ttlMs) return hit.value;
  if (hit?.pending) return hit.pending;
  const dbKey = `${key}@${BUILD}`;
  if (hit?.value === undefined) {
    const snap = await db().then((m) => m.cacheGet(dbKey)).catch(() => null);
    if (snap && Date.now() - snap.at < stale) {
      memo.set(key, { at: snap.at, value: snap.value, written: snap.at });
      return snap.value; // fresh, or stale-but-usable (the next call after ttlMs rebuilds)
    }
  }
  const value = await remember(key, ttlMs, fn);
  const h = memo.get(key);
  if (h && h.value === value && !(h.written >= h.at) && Date.now() - (h.written || 0) >= write) {
    h.written = Date.now();
    db().then((m) => m.cacheSet(dbKey, value)).catch(() => {});
  }
  return value;
}
