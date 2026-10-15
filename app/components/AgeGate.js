"use client";
// One-time 18+ notice per browser.
import { useEffect, useState } from "react";
import Link from "next/link";
import { load, save } from "./store";
import { useT } from "./Lang";
import { LogoMark } from "./Logo";

export default function AgeGate() {
  const { t } = useT();
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(!load("skii-18", false)); }, []);
  if (!show) return null;
  return (
    <div className="drawer-bg" style={{ zIndex: 95, display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card hero glow" style={{ maxWidth: 420, width: "100%", textAlign: "center", padding: 26 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><LogoMark size={56} /></div>
        <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>18+</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t("Skii Pronos is for adults only. Betting involves risk: never stake money you can't afford to lose.")}</p>
        <div className="row" style={{ justifyContent: "center", gap: 10 }}>
          <button className="btn primary" onClick={() => { save("skii-18", true); setShow(false); }}>{t("I'm 18 or older")}</button>
          <a className="btn soft" href="https://www.joueurs-info-service.fr/">{t("Leave")}</a>
        </div>
        <p className="note" style={{ marginBottom: 0 }}><Link href="/legal#responsible">{t("Responsible gambling")}</Link></p>
      </div>
    </div>
  );
}
