"use client";
// VIP: the day's big-odds builds in one place — the coupon du jour, the four same-day express builds
// (x12.5, x100, x200, x300/400) and the live grosse cote built from the games in play.
import Link from "next/link";
import { useEffect, useRef } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useT } from "../components/Lang";
import { CouponActions, CouponCard, chanceText, useCouponOfTheDay } from "../components/Coupon";
import { Skeleton } from "../components/ui";
import LiveCoupon from "../components/LiveCoupon";

const BUILDS = [
  { kind: "safe", title: "Coupon du jour", eyebrow: "~2.00 · safest legs of the day", icon: "ticket" },
  { kind: "x12", title: "Express x12.5", eyebrow: "Medium · same day", icon: "target" },
  { kind: "grosse", title: "Express x100", eyebrow: "Grosse cote du jour · same day", icon: "bolt" },
  { kind: "x200", title: "Express x200", eyebrow: "High odds · same day", icon: "crown" },
  { kind: "x400", title: "Express x300 / 400", eyebrow: "High odds · same day", icon: "crown" },
];

export default function Vip() {
  const { data, error } = useCouponOfTheDay();
  const { t, lang } = useT();
  // a link from home (/vip#grosse…) lands before the cards have their real height: jump again once
  const jumped = useRef(false);
  useEffect(() => {
    if (!data || jumped.current || !location.hash) return;
    jumped.current = true;
    setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" }), 60);
  }, [data]);
  return (
    <>
      <Top title={t("VIP builds")} sub={t("Best chance at each odds · real prices")} />
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}
      <nav className="tabs-row jump">
        {BUILDS.map((b) => <a key={b.kind} href={`#${b.kind}`} className="chip">{t(b.title)}</a>)}
        <a href="#live" className="chip"><span className="live-dot" />{t("Live")}</a>
      </nav>
      <div className="stack">
        {BUILDS.map((b) => (
          <div key={b.kind} id={b.kind} className="anchor">
            {data ? (
              data[b.kind]?.legs?.length ? (
                <CouponCard coupon={data[b.kind]} title={t(b.title)} icon={b.icon} compact glow={b.kind === "safe"}
                  eyebrow={t(b.eyebrow) + (data[b.kind]?.legs?.length ? ` · ${chanceText(data[b.kind].chance, lang)}` : "")}
                  sub={data[b.kind]?.reached === false ? t("Today's remaining games can't reach the full target with real prices: this is the closest build.") : data[b.kind]?.legs?.some((l) => l.estimated) ? t("≈ prices are estimates — take them only at or above the shown odds on 1xBet.") : null}
                  footer={<CouponActions coupon={data[b.kind]} title={t(b.title)} />} />
              ) : <section className="card"><h3 style={{ margin: 0 }}>{t(b.title)}</h3><div className="empty" style={{ marginTop: 10 }}>{data[b.kind] ? t("Today's games are over — next builds tomorrow morning") : t("Not published yet today.")}</div></section>
            ) : <section className="card"><Skeleton rows={3} h={56} /></section>}
          </div>
        ))}
        <div id="live" className="anchor"><LiveCoupon compact /></div>
        <Link href="/grosse-cote" className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="stat-ico" style={{ margin: 0 }}><Icon name="sparkles" /></span>
          <span style={{ minWidth: 0 }}><b>{t("Grosse cote generator")}</b><div className="muted" style={{ fontSize: 12.5 }}>{t("Any target, any window — another combination on demand")}</div></span>
          <span className="spacer" /><Icon name="chevron" />
        </Link>
      </div>
      <p className="note">{t("Long odds land rarely: a x100 build wins about 1 time in 100 even when every leg is priced right. Stake small, flat, and never chase. 18+.")}</p>
    </>
  );
}
