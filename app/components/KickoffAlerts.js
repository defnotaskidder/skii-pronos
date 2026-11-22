"use client";
// One button for the kick-off alerts: an alert on this device each time matches kick off.
// Turning it on asks the browser's permission once, then switches on everything that can carry
// the alert here: push (site closed) where the browser has it, and notifications from the page
// (while a tab is open). It says honestly which of the two is working.
import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "./Icons";
import { useNotify } from "./Notify";
import { usePush } from "./Push";
import { useT } from "./Lang";

export default function KickoffAlerts() {
  const n = useNotify();
  const push = usePush();
  const { t } = useT();
  const [perm, setPerm] = useState("default");
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState(false); // is the every-minute alert job running?
  const on = !!n.prefs.starts;
  useEffect(() => { setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission); }, []);
  useEffect(() => {
    if (!on) return;
    fetch("/api/tick?health").then((r) => r.json()).then((d) => setServer(!!d.running)).catch(() => {});
  }, [on]);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      n.setPref("starts", true);
      const p = await n.requestBrowser();
      setPerm(p);
      if (p === "granted") {
        if (push.supported && !push.enabled) await push.toggle();
        n.push({ kind: "kickoff", title: t("Kick-off alerts are on"), body: t("You'll get one alert each time matches kick off."), href: "/live", dedupe: "starts-on", os: true });
      }
    } finally { setBusy(false); }
  };

  // "on" only when something really carries the alert to this device: allowed by the browser, and
  // either the page's notifications or push switched on (allowing again after a block lands on "ask")
  const delivering = perm === "granted" && (n.prefs.browser || push.enabled);
  const state = !on ? "off" : perm === "unsupported" ? "site" : perm === "denied" ? "blocked" : delivering ? "on" : "ask";
  const sub = {
    off: t("Get an alert on this device each time matches kick off."),
    on: push.enabled && server ? t("They reach this device even with the site closed.") : t("They arrive while the site is open in a tab, even in the background."),
    blocked: t("Notifications are blocked for this site. Allow them from the padlock next to the address, then turn this on again."),
    site: t("This browser can't show notifications: the alerts stay on the site."),
    ask: t("One more step: allow notifications for this site."),
  }[state];

  return (
    <div className={`card flat tight kick-strip ${state === "on" ? "is-on" : ""}`}>
      <span className="stat-ico" style={{ margin: 0 }}><Icon name="bell" /></span>
      <span className="kick-txt">
        <b>{state === "on" || state === "site" ? t("Kick-off alerts are on") : t("Kick-off alerts")}</b>
        <small>{sub}</small>
      </span>
      {state === "off" || state === "ask" ? (
        <button className="btn sm" disabled={busy} onClick={enable}>{state === "ask" ? t("Allow notifications") : t("Turn on")}</button>
      ) : (
        <span className="kick-act">
          <Link href="/notifications" className="btn ghost xs">{t("Settings")}</Link>
          <button className="btn ghost xs" onClick={() => n.setPref("starts", false)}>{t("Turn off")}</button>
        </span>
      )}
    </div>
  );
}
