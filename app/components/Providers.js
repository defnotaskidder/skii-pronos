"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NotifyProvider, useNotify } from "./Notify";
import { AuthProvider } from "./Auth";
import { load, save } from "./store";
import { product, hitChance } from "../../lib/coupon";

// ---------------- board data (shared by every page) ----------------
const DataCtx = createContext(null);
export const useBoard = () => useContext(DataCtx);

function DataProvider({ children }) {
  const [state, setState] = useState({ events: [], leagues: [], loading: true, error: "", updated: null });
  const timer = useRef(null);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/board", { cache: "no-store" });
      const d = await r.json();
      setState({ events: d.events || [], leagues: d.leagues || [], loading: false, error: d.error || "", updated: d.updated || new Date().toISOString() });
      return d.events || [];
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: "Couldn't reach the server — retrying." }));
      return null;
    }
  }, []);
  useEffect(() => {
    let stop = false;
    const loop = async () => {
      const ev = await refresh();
      if (stop) return;
      const live = (ev || []).some((e) => e.state === "in");
      timer.current = setTimeout(loop, live ? 30e3 : 90e3);
    };
    loop();
    return () => { stop = true; clearTimeout(timer.current); };
  }, [refresh]);
  const value = useMemo(() => {
    const live = state.events.filter((e) => e.state === "in");
    return { ...state, live, refresh };
  }, [state, refresh]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

// ---------------- my slip ----------------
const SlipCtx = createContext(null);
export const useSlip = () => useContext(SlipCtx);

function SlipProvider({ children }) {
  const [legs, setLegs] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { setLegs(load("skii-slip", [])); }, []);
  const set = (fn) => setLegs((cur) => { const n = typeof fn === "function" ? fn(cur) : fn; save("skii-slip", n); return n; });
  const has = useCallback((eventId, key) => legs.some((l) => l.eventId === eventId && (!key || l.key === key)), [legs]);
  const toggle = useCallback((leg) => set((cur) => {
    if (cur.some((l) => l.eventId === leg.eventId && l.key === leg.key)) return cur.filter((l) => !(l.eventId === leg.eventId && l.key === leg.key));
    return [...cur.filter((l) => l.eventId !== leg.eventId), leg]; // one market per match
  }), []);
  const value = useMemo(() => ({
    legs, open, setOpen, has, toggle,
    remove: (eventId) => set((cur) => cur.filter((l) => l.eventId !== eventId)),
    replace: (list) => set(list),
    clear: () => set([]),
    odds: product(legs), chance: hitChance(legs),
  }), [legs, open, has, toggle]);
  return <SlipCtx.Provider value={value}>{children}</SlipCtx.Provider>;
}

// ---------------- tracked picks & coupons (history) ----------------
const TrackCtx = createContext(null);
export const useTrack = () => useContext(TrackCtx);

function TrackProvider({ children }) {
  const notify = useNotify();
  const [entries, setEntries] = useState([]);
  const busy = useRef(false);
  useEffect(() => { setEntries(load("skii-track", [])); }, []);
  const set = useCallback((fn) => setEntries((cur) => { const n = typeof fn === "function" ? fn(cur) : fn; save("skii-track", n); return n; }), []);

  const track = useCallback((entry) => {
    const e = { id: `${entry.kind || "slip"}-${Date.now()}`, at: new Date().toISOString(), kind: "slip", ...entry, legs: entry.legs.map((l) => ({ ...l, result: null })) };
    set((cur) => [e, ...cur].slice(0, 100));
    notify?.followMany(e.legs.map((l) => ({ id: l.eventId, league: l.league, home: l.home, away: l.away, date: l.date })));
    notify?.push({ kind: "coupon", title: `Tracking “${e.title}”`, body: `${e.legs.length} legs @ ${product(e.legs).toFixed(2)} — results are graded automatically.`, href: "/history", toastOnly: true });
    return e.id;
  }, [set, notify]);

  // grade pending legs from final scores
  const settleAll = useCallback(async () => {
    if (busy.current) return;
    const pending = entries.flatMap((e) => e.legs.filter((l) => !l.result && new Date(l.date).getTime() < Date.now() - 100 * 60e3));
    if (!pending.length) return;
    busy.current = true;
    try {
      const r = await fetch("/api/settle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ picks: pending.map((l) => ({ eventId: l.eventId, league: l.league, date: l.date, key: l.key })) }) });
      const d = await r.json();
      const res = new Map((d.results || []).filter((x) => x.result).map((x) => [`${x.eventId}|${x.key}`, x]));
      if (!res.size) return;
      set((cur) => cur.map((e) => {
        const legs = e.legs.map((l) => { const x = res.get(`${l.eventId}|${l.key}`); return x && !l.result ? { ...l, result: x.result, score: x.score } : l; });
        const was = e.legs.every((l) => l.result), now = legs.every((l) => l.result);
        if (!was && now && notify?.prefs.results) {
          const lost = legs.some((l) => l.result === "L");
          notify.push({ kind: "result", title: lost ? `❌ “${e.title}” lost` : `✅ “${e.title}” won!`, body: lost ? "One or more legs failed." : `Paid @ ${product(legs.filter((l) => l.result === "W")).toFixed(2)}`, href: "/history", dedupe: `res-${e.id}` });
        }
        return { ...e, legs };
      }));
    } catch { /* retry later */ } finally { busy.current = false; }
  }, [entries, set, notify]);

  useEffect(() => {
    settleAll();
    const t = setInterval(settleAll, 5 * 60e3);
    return () => clearInterval(t);
  }, [settleAll]);

  const value = useMemo(() => ({
    entries, track, settleAll,
    remove: (id) => set((cur) => cur.filter((e) => e.id !== id)),
    grade: (id, eventId, result) => set((cur) => cur.map((e) => e.id !== id ? e : { ...e, legs: e.legs.map((l) => l.eventId === eventId ? { ...l, result } : l) })),
    clear: () => set([]),
  }), [entries, track, settleAll, set]);
  return <TrackCtx.Provider value={value}>{children}</TrackCtx.Provider>;
}

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <NotifyProvider>
        <DataProvider>
          <SlipProvider>
            <TrackProvider>{children}</TrackProvider>
          </SlipProvider>
        </DataProvider>
      </NotifyProvider>
    </AuthProvider>
  );
}
