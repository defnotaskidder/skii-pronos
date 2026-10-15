"use client";
import { useEffect, useState } from "react";
import Icon from "./Icons";
import { useNotify } from "./Notify";
import { useT } from "./Lang";
import { usePush } from "./Push";

const ROWS = [
  ["kickoff", "Kick-off", "When a followed match starts"],
  ["goals", "Goals", "Every goal in followed matches"],
  ["cards", "Red cards", "Sendings-off in followed matches"],
  ["final", "Full time", "Final score of followed matches"],
  ["coupon", "Coupon du jour", "Once a day when the new coupon is ready"],
  ["results", "Results", "When a tracked coupon is won or lost"],
  ["value", "Value alerts", "When a strong value spot appears"],
  ["moves", "Odds moves", "When the odds move sharply on a followed match"],
];

export default function NotificationSettings() {
  const n = useNotify();
  const { t } = useT();
  const push = usePush();
  const [perm, setPerm] = useState("default");
  useEffect(() => { setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission); }, []);
  const toggleBrowser = async () => {
    if (n.prefs.browser) { n.setPref("browser", false); return; }
    const p = await n.requestBrowser();
    setPerm(p);
  };
  return (
    <section className="card">
      <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="bell" /></span><h3>{t("Alerts")}</h3></div>
      <div className="setting">
        <div style={{ flex: 1 }}>
          <b>{t("Push on this device")}</b>
          <small>{push.supported ? t("Alerts reach this phone or computer even with the site closed") : t("Not supported in this browser")}</small>
        </div>
        <button className={`switch ${push.enabled ? "on" : ""}`} aria-label={t("Push on this device")} disabled={!push.supported || push.busy} onClick={push.toggle} />
      </div>
      <div className="setting">
        <div style={{ flex: 1 }}>
          <b>{t("Browser notifications")}</b>
          <small>{perm === "unsupported" ? t("Not supported in this browser") : perm === "denied" ? t("Blocked — allow notifications for this site in your browser settings") : t("Pop-ups even when this tab is in the background")}</small>
        </div>
        <button className={`switch ${n.prefs.browser ? "on" : ""}`} aria-label={t("Browser notifications")} disabled={perm === "unsupported" || perm === "denied"} onClick={toggleBrowser} />
      </div>
      {ROWS.map(([k, l, d]) => (
        <div key={k} className="setting">
          <div style={{ flex: 1 }}><b>{t(l)}</b><small>{t(d)}</small></div>
          <button className={`switch ${n.prefs[k] ? "on" : ""}`} aria-label={t(l)} onClick={() => n.setPref(k, !n.prefs[k])} />
        </div>
      ))}
      <button className="btn soft sm" style={{ marginTop: 12 }} onClick={() => n.push({ kind: "goal", title: t("⚽ Test alert"), body: t("This is what a goal alert looks like."), href: "/notifications" })}>{t("Send a test alert")}</button>
    </section>
  );
}
