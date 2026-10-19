"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NotifyProvider, useNotify } from "./Notify";
import { AmbienceProvider } from "./Ambience";
import { AuthProvider } from "./Auth";
import { LangProvider, useT } from "./Lang";
import { useAuth } from "./Auth";
import { load, save } from "./store";
import { product, hitChance } from "../../lib/coupon";
import { settle } from "../../lib/model";

// ---------------- board data (loaded by the pages that need it) ----------------
// The full board is ~75 KB compressed. It loads only once a page asks for it (matches, live…):
// the home page reads the small /api/home instead, which keeps a phone on a slow connection fast.
const DataCtx = createContext(null);
export function useBoard() {
  const ctx = useContext(DataCtx);
  // holds the board open while this page is mounted; the polling stops once no page needs it
  useEffect(() => ctx?.want(), [ctx?.want]); // eslint-disable-line react-hooks/exhaustive-deps
  return ctx;
}
export const useData = useBoard;
// Read the board without asking for it (background watchers): empty until a page loads it.
export const useBoardPassive = () => useContext(DataCtx);

// How many games are live, for the nav badges: from the board while a page holds it, else from the
// one light poll the data provider runs (/api/live?count=1&top=1, a few hundred bytes a minute).
export function useLiveCount() {
  const ctx = useContext(DataCtx);
  return ctx?.wanted ? ctx.live.length : ctx?.lite?.live || 0;
}

// True when nothing a row displays has changed, so the previous object (and its rendered row) can be reused.
const sameEvent = (a, b) => a.state === b.state && a.detail === b.detail && a.minute === b.minute && a.postponed === b.postponed
  && a.home?.score === b.home?.score && a.away?.score === b.away?.score && a.reds?.home === b.reds?.home && a.reds?.away === b.reds?.away
  && a.odds?.home === b.odds?.home && a.odds?.draw === b.odds?.draw && a.odds?.away === b.odds?.away
  && a.a?.pick?.key === b.a?.pick?.key && a.a?.pick?.odds === b.a?.pick?.odds && a.a?.pick?.tier === b.a?.pick?.tier && a.a?.pick?.safe === b.a?.pick?.safe
  && a.a?.value?.key === b.a?.value?.key && a.a?.value?.ev === b.a?.value?.ev && a.done?.result === b.done?.result && a.done?.label === b.done?.label;

// Full board (fixtures + picks + learned league skill) every 60–120 s; while anything is live or
// about to start, a light live feed (/api/live) is merged in every 15 s so scores, minutes and
// states stay current.
function DataProvider({ children }) {
  const [state, setState] = useState({ events: [], skill: {}, loading: true, error: "", updated: null, liveAt: null });
  // pages holding the board open (reference count): the full board polls only while one is mounted
  const [holders, setHolders] = useState(0);
  const want = useCallback(() => { setHolders((n) => n + 1); return () => setHolders((n) => Math.max(0, n - 1)); }, []);
  const wanted = holders > 0;
  // without the board: live count + today's top picks (id, state, score) for the badges and alerts
  const [lite, setLite] = useState({ live: 0, top: [] });
  useEffect(() => {
    if (wanted) return undefined;
    let stop = false, timer;
    const tick = async () => {
      if (document.visibilityState !== "hidden") {
        try {
          const r = await fetch("/api/live?count=1&top=1");
          const d = await r.json();
          if (!stop && Number.isFinite(d.live)) setLite({ live: d.live, top: Array.isArray(d.top) ? d.top : [] });
        } catch { /* next tick */ }
      }
      if (!stop) timer = setTimeout(tick, 60e3);
    };
    tick();
    const wake = () => { if (document.visibilityState === "visible") { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", wake);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); };
  }, [wanted]);
  const eventsRef = useRef([]);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/board", { cache: "no-store" });
      const d = await r.json();
      const now = new Date().toISOString();
      const at = Date.now();
      const prev = new Map(eventsRef.current.map((e) => [e.id, e]));
      eventsRef.current = (d.events || []).map((e) => { const p = prev.get(e.id); return p && sameEvent(p, e) ? p : { ...e, _at: at }; });
      // league skill { [league]: { s, n, w, e } }: kept (same object) when unchanged or missing
      setState((s) => ({
        ...s, events: eventsRef.current, loading: false, error: d.error || "", updated: d.updated || now, liveAt: now,
        skill: d.skill && typeof d.skill === "object" && JSON.stringify(d.skill) !== JSON.stringify(s.skill) ? d.skill : s.skill,
      }));
      return eventsRef.current;
    } catch {
      setState((s) => ({ ...s, loading: false, error: "offline" }));
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
    if (!wanted) return undefined;
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
  }, [refresh, refreshLive, wanted]);

  const value = useMemo(() => {
    const live = state.events.filter((e) => e.state === "in");
    return { ...state, live, refresh, want, wanted, lite };
  }, [state, refresh, want, wanted, lite]);
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
  const { t } = useT();
  const [entries, setEntries] = useState([]);
  const busy = useRef(false);
  useEffect(() => { setEntries(load("skii-track", [])); }, []);
  const set = useCallback((fn) => setEntries((cur) => { const n = typeof fn === "function" ? fn(cur) : fn; save("skii-track", n); return n; }), []);

  const track = useCallback((entry) => {
    const e = { id: `${entry.kind || "slip"}-${Date.now()}`, at: new Date().toISOString(), kind: "slip", ...entry, legs: entry.legs.map((l) => ({ ...l, result: null })) };
    set((cur) => [e, ...cur].slice(0, 100));
    notify?.followMany(e.legs.map((l) => ({ id: l.eventId, league: l.league, home: l.home, away: l.away, date: l.date })));
    notify?.push({ kind: "coupon", title: t("Tracking “{title}”", { title: e.title }), body: t("{n} legs @ {o} — results are graded automatically.", { n: e.legs.length, o: product(e.legs).toFixed(2) }), href: "/history", toastOnly: true });
    return e.id;
  }, [set, notify, t]);

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
          notify.push({ kind: "result", title: lost ? t("❌ “{title}” lost", { title: e.title }) : t("✅ “{title}” won!", { title: e.title }), body: lost ? t("One or more legs failed.") : t("Paid @ {o}", { o: product(e.legs.filter((l) => l.result === "W")).toFixed(2) }), href: "/history", dedupe: `res-${e.id}` });
        }
      }
    } catch { /* retry later */ } finally { busy.current = false; }
  }, [entries, set, notify, t]);

  useEffect(() => {
    settleAll();
    const t = setInterval(settleAll, 5 * 60e3);
    return () => clearInterval(t);
  }, [settleAll]);

  const value = useMemo(() => ({
    entries, track, settleAll,
    remove: (id) => set((cur) => cur.filter((e) => e.id !== id)),
    grade: (id, eventId, result) => set((cur) => cur.map((e) => e.id !== id ? e : { ...e, legs: e.legs.map((l) => l.eventId === eventId ? { ...l, result } : l) })),
    setStake: (id, stake) => set((cur) => cur.map((e) => e.id !== id ? e : { ...e, stake: Math.max(0, Number(stake) || 0) })),
    replaceAll: (list) => set(Array.isArray(list) ? list.slice(0, 100) : []),
    clear: () => set([]),
  }), [entries, track, settleAll, set]);
  return <TrackCtx.Provider value={value}>{children}</TrackCtx.Provider>;
}

// ---------------- account sync ----------------
// Signed in: follows, tracked coupons, alert prefs, language and unit size live in the account.
// On sign-in the server copy is merged with this browser's, then every change is written back.
function SyncProvider({ children }) {
  const auth = useAuth();
  const notify = useNotify();
  const track = useTrack();
  const { lang, setLang } = useT();
  const sig = useRef("");
  const ready = useRef(false);
  const userId = auth.user?.id || null;

  useEffect(() => {
    ready.current = false;
    if (!userId) return;
    let alive = true;
    (async () => {
      const token = await auth.token();
      if (!token) return;
      const r = await fetch("/api/sync", { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
      const d = r && r.ok ? await r.json() : null;
      if (!alive || !d?.data) { ready.current = true; return; }
      const s = d.data;
      // merge: union of follows and coupons, server wins for prefs / language / unit
      const follows = { ...(s.follows?.value || {}), ...notify.follows };
      const byId = new Map([...(s.track?.value || []), ...track.entries].map((e) => [e.id, e]));
      for (const e of track.entries) { const srv = (s.track?.value || []).find((x) => x.id === e.id); if (srv) byId.set(e.id, srv.legs.filter((l) => l.result).length >= e.legs.filter((l) => l.result).length ? { ...e, ...srv } : { ...srv, ...e }); }
      const entries = [...byId.values()].sort((a, b) => new Date(b.at) - new Date(a.at));
      notify.replaceFollows(follows);
      track.replaceAll(entries);
      if (s.prefs?.value) notify.replacePrefs(s.prefs.value);
      if (s.lang?.value && s.lang.value !== lang) setLang(s.lang.value);
      if (s.unit?.value !== undefined) save("skii-unit", s.unit.value);
      sig.current = JSON.stringify([follows, entries, s.prefs?.value || notify.prefs, s.lang?.value || lang]);
      ready.current = true;
      // write the merged state so the other devices get this browser's additions
      await fetch("/api/sync", { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data: { follows, track: entries, prefs: s.prefs?.value || notify.prefs, lang: s.lang?.value || lang, unit: load("skii-unit", 1) } }) }).catch(() => {});
    })();
    return () => { alive = false; };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // push changes (debounced)
  useEffect(() => {
    if (!userId || !ready.current) return;
    const next = JSON.stringify([notify.follows, track.entries, notify.prefs, lang]);
    if (next === sig.current) return;
    const tmr = setTimeout(async () => {
      const token = await auth.token();
      if (!token) return;
      sig.current = next;
      await fetch("/api/sync", { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ data: { follows: notify.follows, track: track.entries, prefs: notify.prefs, lang, unit: load("skii-unit", 1) } }) }).catch(() => {});
    }, 2000);
    return () => clearTimeout(tmr);
  }, [userId, notify.follows, track.entries, notify.prefs, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return children;
}

// While the site is open: a toast (and browser notification) when one of the day's top picks
// kicks off, and when it is won or lost. Games already live when the page opens don't alert.
function TopPickWatcher() {
  // the board when a page holds it, else today's top picks from the light poll
  const ctx = useBoardPassive();
  const events = ctx.wanted ? ctx.events : ctx.lite.top;
  const { push, prefs } = useNotify();
  const { t, tm } = useT();
  const seen = useRef(null);
  useEffect(() => {
    if (!events.length) return;
    const cur = {};
    for (const e of events) if (e.top) cur[e.id] = e.state;
    const prev = seen.current;
    seen.current = cur;
    if (!prev || prefs.toppicks === false) return;
    for (const e of events) {
      if (!e.top || !prev[e.id] || prev[e.id] === e.state) continue;
      const teams = `${e.home.short} – ${e.away.short}`;
      const pick = `${tm(e.top.label)} @ ${Number(e.top.odds).toFixed(2)}`;
      const href = `/match/${e.league}/${e.id}`;
      if (e.state === "in") push({ kind: "top", title: t("🔥 Top pick #{n} live: {teams}", { n: e.top.rank, teams }), body: pick, href, dedupe: `top-ko-${e.id}` });
      if (e.state === "post") {
        const r = settle(e.top.key, e.home.score, e.away.score, { sport: e.sport, ot: e.ot });
        const title = r === "W" ? t("✅ Top pick won: {teams}", { teams }) : r === "L" ? t("❌ Top pick lost: {teams}", { teams }) : t("↩️ Top pick void: {teams}", { teams });
        push({ kind: "result", title, body: `${e.home.score ?? 0}-${e.away.score ?? 0} · ${pick}`, href, dedupe: `top-ft-${e.id}` });
      }
    }
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Service worker: push alerts + "add to home screen".
function ServiceWorker() {
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
  return null;
}

export default function Providers({ children }) {
  return (
    <LangProvider>
    <AuthProvider>
      <NotifyProvider>
        <DataProvider>
          <SlipProvider>
            <TrackProvider><SyncProvider><AmbienceProvider>{children}</AmbienceProvider></SyncProvider><ServiceWorker /><TopPickWatcher /></TrackProvider>
          </SlipProvider>
        </DataProvider>
      </NotifyProvider>
    </AuthProvider>
    </LangProvider>
  );
}
