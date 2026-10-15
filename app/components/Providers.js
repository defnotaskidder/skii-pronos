"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NotifyProvider, useNotify } from "./Notify";
import { AuthProvider } from "./Auth";
import { load, save } from "./store";
import { product, hitChance } from "../../lib/coupon";

// ---------------- board data (shared by every page) ----------------
const DataCtx = createContext(null);
export const useBoard = () => useContext(DataCtx);

// Full board (fixtures + picks) every 60–120 s; while anything is live or about to start, a
// light live feed (/api/live) is merged in every 15 s so scores, minutes and states stay current.
function DataProvider({ children }) {
  const [state, setState] = useState({ events: [], loading: true, error: "", updated: null, liveAt: null });
  const eventsRef = useRef([]);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/board", { cache: "no-store" });
      const d = await r.json();
      const now = new Date().toISOString();
      const at = Date.now();
      eventsRef.current = (d.events || []).map((e) => ({ ...e, _at: at }));
      setState({ events: eventsRef.current, loading: false, error: d.error || "", updated: d.updated || now, liveAt: now });
      return eventsRef.current;
    } catch {
      setState((s) => ({ ...s, loading: false, error: "Couldn't reach the server — retrying." }));
      return null;
    }
  }, []);

  const refreshLive = useCallback(async () => {
    try {
      const r = await fetch("/api/live", { cache: "no-store" });
      const d = await r.json();
      if (!d.games?.length) return;
      const byId = new Map(d.games.map((g) => [g.id, g]));
      let changed = false;
      const next = eventsRef.current.map((e) => {
        const g = byId.get(e.id);
        if (!g) return e;
        if (g.state === e.state && g.hs === e.home?.score && g.as === e.away?.score && g.minute === e.minute && g.detail === e.detail) return e;
        changed = true;
        return {
          ...e, state: g.state, detail: g.detail, minute: g.minute, period: g.period ?? e.period, reds: g.reds || e.reds, completed: g.state === "post" ? true : e.completed, _at: Date.now(),
          home: { ...e.home, score: g.hs }, away: { ...e.away, score: g.as },
        };
      });
      eventsRef.current = next;
      setState((s) => ({ ...s, ...(changed ? { events: next } : {}), liveAt: d.at || new Date().toISOString() }));
    } catch { /* next tick */ }
  }, []);

  useEffect(() => {
    let stop = false, tBoard, tLive;
    const busy = () => eventsRef.current.some((e) => e.state === "in" || (e.state === "pre" && new Date(e.date) - Date.now() < 15 * 60e3 && new Date(e.date) > Date.now() - 30 * 60e3));
    const boardLoop = async () => {
      await refresh();
      if (!stop) tBoard = setTimeout(boardLoop, busy() ? 60e3 : 120e3);
    };
    const liveLoop = async () => {
      if (busy() && document.visibilityState !== "hidden") await refreshLive();
      if (!stop) tLive = setTimeout(liveLoop, 15e3);
    };
    boardLoop();
    tLive = setTimeout(liveLoop, 15e3);
    const wake = () => { if (document.visibilityState === "visible") refreshLive(); };
    document.addEventListener("visibilitychange", wake);
    return () => { stop = true; clearTimeout(tBoard); clearTimeout(tLive); document.removeEventListener("visibilitychange", wake); };
  }, [refresh, refreshLive]);

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
      const apply = (e) => ({ ...e, legs: e.legs.map((l) => { const x = res.get(`${l.eventId}|${l.key}`); return x && !l.result ? { ...l, result: x.result, score: x.score } : l; }) });
      // work out which coupons just finished before updating state, then notify outside the updater
      const finished = entries.map(apply).filter((e, i) => !entries[i].legs.every((l) => l.result) && e.legs.every((l) => l.result));
      set((cur) => cur.map(apply));
      if (notify?.prefs.results) {
        for (const e of finished) {
          const lost = e.legs.some((l) => l.result === "L");
          notify.push({ kind: "result", title: lost ? `❌ “${e.title}” lost` : `✅ “${e.title}” won!`, body: lost ? "One or more legs failed." : `Paid @ ${product(e.legs.filter((l) => l.result === "W")).toFixed(2)}`, href: "/history", dedupe: `res-${e.id}` });
        }
      }
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
