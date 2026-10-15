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
