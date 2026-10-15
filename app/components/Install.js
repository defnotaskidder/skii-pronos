"use client";
// "Add to home screen" card: uses the browser's install prompt when it offers one, otherwise
// explains the manual step (iPhone has no prompt).
import { useEffect, useState } from "react";
import Icon from "./Icons";
import { useT } from "./Lang";

export default function InstallCard() {
  const { t } = useT();
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return (
    <section className="card">
      <div className="card-head"><span className="stat-ico cyan" style={{ margin: 0 }}><Icon name="bolt" /></span><h3>{t("Install the app")}</h3></div>
      <p className="muted" style={{ marginTop: 0 }}>{t("Add Skii Pronos to your home screen for a full-screen app with its own icon.")}</p>
      {installed ? <span className="pill green">{t("Installed")}</span>
        : prompt ? <button className="btn primary" onClick={async () => { prompt.prompt(); const r = await prompt.userChoice; if (r.outcome === "accepted") setInstalled(true); setPrompt(null); }}><Icon name="plus" />{t("Install")}</button>
        : <p className="note" style={{ margin: 0 }}>{ios ? t("On iPhone: Share → Add to Home Screen.") : t("On iPhone: Share → Add to Home Screen.")}</p>}
    </section>
  );
}
