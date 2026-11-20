"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "../../../components/Icons";
import { Top } from "../../../components/Shell";
import { useT } from "../../../components/Lang";
import { Skeleton, odds2 } from "../../../components/ui";
import { CouponLegs, chanceText } from "../../../components/Coupon";

const KIND_NAME = { safe: "Coupon du jour", x12: "Express x12.5", grosse: "Express x100", x200: "Express x200", x400: "Express x300/400", special_x: "Special x" };

// One past coupon: what was played that day, game by game, with every score and result.
export default function PastCoupon({ params }) {
  const { t, lang, locale } = useT();
  const { day, kind } = params;
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/past?day=${encodeURIComponent(day)}&kind=${encodeURIComponent(kind)}`).then((r) => r.json()).then((d) => alive && setData(d)).catch(() => alive && setData({ coupon: null }));
    return () => { alive = false; };
  }, [day, kind]);

  const c = data?.coupon;
  const title = t(KIND_NAME[kind] || kind);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }) : day;
  const legs = c?.legs || [];
  const won = legs.filter((l) => l.result === "W").length, lost = legs.filter((l) => l.result === "L").length;
  const st = c?.result === "W" ? "won" : c?.result === "L" ? "lost" : "open";
  // lost legs first on a lost coupon: the reader wants to see what broke it
  const ordered = c?.result === "L" ? [...legs].sort((a, b) => (a.result === "L" ? 0 : 1) - (b.result === "L" ? 0 : 1)) : legs;

  return (
    <>
      <Top title={title} sub={date} />
      <div className="row" style={{ marginBottom: 14 }}>
        <Link href={kind === "safe" ? "/" : "/grosse-cote"} className="link"><Icon name="back" size={14} /> {t("Back")}</Link>
        <span className="spacer" />
        <Link href="/history" className="link">{t("History")}</Link>
      </div>
      {!data ? <Skeleton rows={5} h={70} /> : !c ? (
        <div className="empty"><Icon name="ticket" />{t("This coupon is no longer in the archive.")}</div>
      ) : (
        <section className="card">
          <div className="row" style={{ flexWrap: "nowrap", marginBottom: 12 }}>
            <span className={`stat-ico ${st === "won" ? "green" : st === "lost" ? "live" : ""}`} style={{ margin: 0 }}><Icon name={kind === "safe" ? "ticket" : "bolt"} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{title}</b>
              <div className="muted" style={{ fontSize: 12 }}>{t("{n} legs · {chance}", { n: legs.length, chance: chanceText(c.chance, lang) })}</div>
            </div>
            <span className={`pill ${st === "won" ? "green" : st === "lost" ? "red" : "amber"}`}>{t(st)}</span>
            <b className="num grad-text" style={{ fontSize: 22 }}>x {odds2(c.odds)}</b>
          </div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            {t("{w} legs won", { w: won })} · {lost === 1 && c.result === "L" ? t("lost by one leg") : t("{n} legs lost", { n: lost })}{legs.length - won - lost > 0 ? ` · ${t("{n} not graded", { n: legs.length - won - lost })}` : ""}
          </div>
          <CouponLegs legs={ordered} />
        </section>
      )}
    </>
  );
}
