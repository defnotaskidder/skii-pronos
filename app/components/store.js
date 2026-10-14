// localStorage helpers that never throw (private mode, quota, SSR).
export const load = (k, f) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; }
};
export const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota or private mode */ }
};
