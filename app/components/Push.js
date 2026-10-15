"use client";
// Web push: alerts that reach the phone or computer with the site closed. The browser's
// subscription is stored server-side (/api/push) and the tick job sends the messages.
import { useCallback, useEffect, useState } from "react";
import { load, save } from "./store";
import { useNotify } from "./Notify";
import { useAuth } from "./Auth";

const b64ToU8 = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...b].map((c) => c.charCodeAt(0))); };

export function usePush() {
  const notify = useNotify();
  const auth = useAuth();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.register("/sw.js").then((reg) => reg.pushManager.getSubscription()).then((s) => setEnabled(!!s)).catch(() => {});
  }, []);

  // keep the server copy of what this device wants to hear about
  const sync = useCallback(async (sub, prefs, follows) => {
    const token = auth.user ? await auth.token?.() : null;
    await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ subscription: sub, prefs, follows: Object.keys(follows || {}), lang: load("skii-lang", "fr"), device: load("skii-device", "") }) });
  }, [auth]);

  const toggle = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const cur = await reg.pushManager.getSubscription();
      if (cur) {
        await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: cur.endpoint }) }).catch(() => {});
        await cur.unsubscribe();
        setEnabled(false);
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
        const { key } = await fetch("/api/push").then((r) => r.json());
        if (!key) return;
        let device = load("skii-device", "");
        if (!device) { device = Math.random().toString(36).slice(2, 10); save("skii-device", device); }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
        await sync(sub.toJSON(), notify.prefs, notify.follows);
        setEnabled(true);
      }
    } catch { /* permission or network */ } finally { setBusy(false); }
  }, [supported, busy, notify.prefs, notify.follows, sync]);

  // whenever prefs or follows change on an enabled device, tell the server
  useEffect(() => {
    if (!enabled || !supported) return;
    const tmr = setTimeout(async () => {
      try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sync(sub.toJSON(), notify.prefs, notify.follows); } catch { /* ignore */ }
    }, 1500);
    return () => clearTimeout(tmr);
  }, [enabled, supported, notify.prefs, notify.follows, sync]);

  return { supported, enabled, busy, toggle };
}
