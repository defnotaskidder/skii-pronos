"use client";
// Notification system: in-site bell + toasts + optional browser notifications.
// Sources: the kick-off wave (one alert each time matches kick off, read off the schedule),
// followed matches (kick-off, goals, red cards, full time), the coupon du jour, and graded picks.
// Followed matches are polled from /api/live.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { load, save } from "./store";
import Icon from "./Icons";
import { useT } from "./Lang";
import { dueGames, waveFor, waveTag, waveText, waveWants } from "../../lib/kick";

const Ctx = createContext(null);
export const useNotify = () => useContext(Ctx);

const K = { items: "skii-notifs", prefs: "skii-notif-prefs", follows: "skii-follows", starts: "skii-starts" };
// starts: the kick-off wave (off until asked for); startsSport: "all" | "soccer"
export const DEFAULT_PREFS = { starts: false, startsSport: "all", toppicks: true, kickoff: true, goals: true, cards: true, final: true, coupon: true, results: true, value: true, moves: true, browser: false };

// A notification on the computer or phone, sent by the page. Through the service worker when there
// is one: a click then opens the right page, and an alert the server pushes as well (same tag)
// shows once instead of twice.
async function osNotify(item) {
  const opts = { body: item.body || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: item.dedupe || item.id, data: { url: item.href || "/" } };
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg?.showNotification) { await reg.showNotification(item.title, opts); return; }
  } catch { /* no service worker here: the plain notification below */ }
  try {
    const x = new Notification(item.title, opts);
    x.onclick = () => { window.focus(); x.close(); if (item.href) window.location.assign(item.href); };
  } catch { /* not allowed in this browser */ }
}

export function NotifyProvider({ children }) {
  const { t } = useT();
  const [items, setItems] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [follows, setFollows] = useState({}); // id -> { id, league, home, away, date }
  const [toasts, setToasts] = useState([]);
  const snap = useRef({}); // id -> last seen { state, hs, as, reds }

  useEffect(() => {
    setItems(load(K.items, []));
    setPrefs({ ...DEFAULT_PREFS, ...load(K.prefs, {}) });
    setFollows(load(K.follows, {}));
  }, []);

  const persist = (key, setter) => (fn) => setter((cur) => { const next = typeof fn === "function" ? fn(cur) : fn; save(key, next); return next; });
  const setItemsP = useCallback(persist(K.items, setItems), []); // eslint-disable-line react-hooks/exhaustive-deps
  const setPrefsP = useCallback(persist(K.prefs, setPrefs), []); // eslint-disable-line react-hooks/exhaustive-deps
  const setFollowsP = useCallback(persist(K.follows, setFollows), []); // eslint-disable-line react-hooks/exhaustive-deps

  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  const push = useCallback((n) => {
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), read: false, kind: "info", ...n };
    if (!n.toastOnly) setItemsP((cur) => [item, ...cur.filter((x) => !(n.dedupe && x.dedupe === n.dedupe))].slice(0, 80));
    setToasts((t) => [...t, item].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== item.id)), 6000);
    // n.os: shown on the device whatever the switch says (the confirmation right after allowing)
    if (!n.toastOnly && (prefsRef.current.browser || n.os) && typeof Notification !== "undefined" && Notification.permission === "granted") osNotify(item);
  }, [setItemsP]);

  const markAllRead = () => setItemsP((cur) => cur.map((x) => ({ ...x, read: true })));
  const clear = () => setItemsP([]);
  const remove = (id) => setItemsP((cur) => cur.filter((x) => x.id !== id));

  const isFollowed = useCallback((id) => !!follows[id], [follows]);
  const follow = useCallback((ev) => setFollowsP((cur) => ({ ...cur, [ev.id]: { id: ev.id, league: ev.league, home: ev.home?.short || ev.home, away: ev.away?.short || ev.away, date: ev.date } })), [setFollowsP]);
  const unfollow = useCallback((id) => setFollowsP((cur) => { const n = { ...cur }; delete n[id]; return n; }), [setFollowsP]);
  const toggleFollow = useCallback((ev) => {
    if (follows[ev.id]) unfollow(ev.id);
    else {
      follow(ev);
      push({ kind: "follow", title: t("Following {home} – {away}", { home: ev.home?.short || ev.home, away: ev.away?.short || ev.away }), body: t("You'll get kick-off, goal and full-time alerts."), href: `/match/${ev.league}/${ev.id}`, toastOnly: true });
    }
  }, [follows, follow, unfollow, push, t]);
  const followMany = useCallback((list) => setFollowsP((cur) => {
    const n = { ...cur };
    for (const ev of list) n[ev.id] = { id: ev.id, league: ev.league, home: ev.home, away: ev.away, date: ev.date };
    return n;
  }), [setFollowsP]);

  const requestBrowser = async () => {
    if (typeof Notification === "undefined") return "unsupported";
    const p = await Notification.requestPermission();
    setPrefsP((c) => ({ ...c, browser: p === "granted" }));
    return p;
  };

  // ---- live poller for followed matches ----
  useEffect(() => {
    const ids = Object.keys(follows);
    if (!ids.length) return;
    let stop = false, timer;
    const tick = async () => {
      let soon = false;
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        const d = await r.json();
        const byId = new Map((d.games || []).map((g) => [g.id, g]));
        const pf = prefsRef.current;
        for (const id of ids) {
          const g = byId.get(id);
          if (!g) continue;
          const prev = snap.current[id];
          const label = `${g.home} ${g.hs ?? 0}–${g.as ?? 0} ${g.away}`;
          const href = `/match/${g.league}/${g.id}`;
          if (g.state === "in" || (g.state === "pre" && new Date(g.date) - Date.now() < 20 * 60e3)) soon = true;
          if (prev) {
            if (prev.state === "pre" && g.state === "in" && pf.kickoff && !waveWants(pf, g.sport)) push({ kind: "kickoff", title: t("Kick-off: {home} – {away}", { home: g.home, away: g.away }), body: t("The match has started."), href, dedupe: `ko-${id}` });
            const goalH = (g.hs ?? 0) > (prev.hs ?? 0), goalA = (g.as ?? 0) > (prev.as ?? 0);
            if ((goalH || goalA) && pf.goals) push({ kind: "goal", title: t("⚽ Goal {team}!", { team: goalH ? g.home : g.away }), body: `${label}${g.minute ? ` · ${g.minute}'` : ""}`, href, dedupe: `g-${id}-${g.hs}-${g.as}` });
            const rH = g.reds?.home || 0, rA = g.reds?.away || 0;
            if ((rH > (prev.reds?.home || 0) || rA > (prev.reds?.away || 0)) && pf.cards) push({ kind: "red", title: t("🟥 Red card — {team}", { team: rH > (prev.reds?.home || 0) ? g.home : g.away }), body: label, href, dedupe: `r-${id}-${rH}-${rA}` });
            if (prev.state !== "post" && g.state === "post" && pf.final) push({ kind: "final", title: t("Full time: {label}", { label }), body: t("Check your picks in History."), href, dedupe: `ft-${id}` });
          }
          snap.current[id] = { state: g.state, hs: g.hs, as: g.as, reds: g.reds };
        }
      } catch { /* offline — try again next tick */ }
      if (!stop) timer = setTimeout(tick, soon ? 30e3 : 120e3);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [follows, push, t]);

  // ---- kick-off waves: one alert each time games kick off, read off the schedule ----
  // The schedule comes from /api/live every five minutes; a timer fires at the next kick-off (a
  // hidden tab's timers run up to a minute late, which the window below absorbs). Nothing that
  // kicked off before this page opened is announced, and nothing older than ten minutes.
  const followsRef = useRef(follows);
  useEffect(() => { followsRef.current = follows; }, [follows]);
  useEffect(() => {
    if (!prefs.starts) return undefined;
    let stop = false, timer, busy = false, games = [], fetched = 0, since = Date.now();
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        if (Date.now() - fetched > 5 * 60e3) {
          try {
            const d = await (await fetch("/api/live", { cache: "no-store" })).json();
            if (d.games?.length) {
              games = d.games.filter((g) => g.state !== "post" && !g.pp).map((g) => ({ id: g.id, d: new Date(g.date).getTime(), s: g.sport, h: g.home, a: g.away, tier: g.tier }));
              fetched = Date.now();
            }
          } catch { /* offline: the schedule already loaded still serves */ }
        }
        if (stop) return;
        const now = Date.now();
        const done = new Set(load(K.starts, [])); // shared by every tab of the site
        const list = waveFor(dueGames(games, since, now).filter((g) => !done.has(g.id)), prefsRef.current, Object.keys(followsRef.current));
        since = now;
        if (list.length) {
          save(K.starts, [...done, ...list.map((g) => g.id)].slice(-400));
          const { title, body } = waveText(list, t);
          push({ kind: "kickoff", title, body, href: "/live", dedupe: waveTag(list) });
        }
        const next = games.reduce((m, g) => (g.d > now && g.d < m ? g.d : m), now + 5 * 60e3);
        clearTimeout(timer);
        timer = setTimeout(check, Math.max(1000, next - Date.now() + 1500));
      } finally { busy = false; }
    };
    check();
    // a tab coming back, or the computer waking up, checks at once
    const wake = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", wake);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); };
  }, [prefs.starts, push, t]);

  // drop follows for games more than a day old
  useEffect(() => {
    const old = Object.values(follows).filter((f) => f.date && Date.now() - new Date(f.date) > 36 * 3600e3);
    if (old.length) setFollowsP((cur) => { const n = { ...cur }; old.forEach((f) => delete n[f.id]); return n; });
  }, [follows, setFollowsP]);

  const value = useMemo(() => ({
    items, unread: items.filter((x) => !x.read).length, push, markAllRead, clear, remove,
    prefs, setPref: (k, v) => setPrefsP((c) => ({ ...c, [k]: v })), requestBrowser,
    follows, isFollowed, toggleFollow, followMany, unfollow,
    replacePrefs: (p) => setPrefsP({ ...DEFAULT_PREFS, ...(p || {}) }), replaceFollows: (f) => setFollowsP(f && typeof f === "object" ? f : {}),
  }), [items, push, prefs, follows, isFollowed, toggleFollow, followMany, unfollow]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <a key={t.id} className="toast" href={t.href || "#"} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            <span className={`ni ${t.kind === "goal" ? "goal" : t.kind === "red" ? "red" : ""}`}><Icon name={NICON[t.kind] || "bell"} /></span>
            <span><b>{t.title}</b>{t.body && <small>{t.body}</small>}</span>
          </a>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const NICON = { top: "sparkles", goal: "ball", kickoff: "clock", final: "check", red: "x", coupon: "ticket", result: "trophy", follow: "bell", info: "bell" };
