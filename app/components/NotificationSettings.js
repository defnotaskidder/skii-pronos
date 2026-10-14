"use client";
import { useEffect, useState } from "react";
import Icon from "./Icons";
import { useNotify } from "./Notify";

const ROWS = [
  ["kickoff", "Kick-off", "When a followed match starts"],
  ["goals", "Goals", "Every goal in followed matches"],
  ["cards", "Red cards", "Sendings-off in followed matches"],
  ["final", "Full time", "Final score of followed matches"],
  ["coupon", "Coupon du jour", "Once a day when the new coupon is ready"],
  ["results", "Results", "When a tracked coupon is won or lost"],
];

export default function NotificationSettings() {
  const n = useNotify();
  const [perm, setPerm] = useState("default");
  useEffect(() => { setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission); }, []);
  const toggleBrowser = async () => {
    if (n.prefs.browser) { n.setPref("browser", false); return; }
    const p = await n.requestBrowser();
    setPerm(p);
  };
  return (
    <section className="card">
      <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="bell" /></span><h3>Alerts</h3></div>
      <div className="setting">
        <div style={{ flex: 1 }}>
          <b>Browser notifications</b>
          <small>{perm === "unsupported" ? "Not supported in this browser" : perm === "denied" ? "Blocked — allow notifications for this site in your browser settings" : "Pop-ups even when this tab is in the background"}</small>
        </div>
        <button className={`switch ${n.prefs.browser ? "on" : ""}`} aria-label="Browser notifications" disabled={perm === "unsupported" || perm === "denied"} onClick={toggleBrowser} />
      </div>
      {ROWS.map(([k, l, d]) => (
        <div key={k} className="setting">
          <div style={{ flex: 1 }}><b>{l}</b><small>{d}</small></div>
          <button className={`switch ${n.prefs[k] ? "on" : ""}`} aria-label={l} onClick={() => n.setPref(k, !n.prefs[k])} />
        </div>
      ))}
      <button className="btn soft sm" style={{ marginTop: 12 }} onClick={() => n.push({ kind: "goal", title: "⚽ Test alert", body: "This is what a goal alert looks like.", href: "/notifications" })}>Send a test alert</button>
    </section>
  );
}

