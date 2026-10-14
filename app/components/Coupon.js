"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "./Icons";
import { useSlip, useTrack } from "./Providers";
import { useNotify } from "./Notify";
import { load, save } from "./store";
import { Ring, TeamLogo, Tier, dayLabel, localTime, odds2, pct } from "./ui";
import { couponText } from "../../lib/coupon";
import { LEAGUE_BY_ID } from "../../lib/leagues";

// Fetch the day's coupons once per page view; announce a new one once per day.
export function useCouponOfTheDay() {
  const notify = useNotify();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/coupon").then((r) => r.json()).then((d) => {
      if (!alive) return;
      if (d.error) { setError(d.error); return; }
      setData(d);
      if (d.safe?.legs?.length && notify?.prefs.coupon && load("skii-coupon-day", "") !== d.day) {
        save("skii-coupon-day", d.day);
        notify.push({ kind: "coupon", title: "🔥 Coupon du jour is ready", body: `${d.safe.legs.length} legs @ ${d.safe.odds.toFixed(2)} · ~${Math.round(d.safe.chance * 100)}% hit chance`, href: "/coupon", dedupe: `coupon-${d.day}` });
      }
    }).catch(() => alive && setError("Couldn't load the coupon."));
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error };
}

export function CouponActions({ coupon, title }) {
  const slip = useSlip();
  const track = useTrack();
  const [copied, setCopied] = useState(false);
  const [tracked, setTracked] = useState(false);
  if (!coupon?.legs?.length) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(couponText(coupon, title.toUpperCase())); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ }
  };
  return (
    <div className="row">
      <button className="btn primary" onClick={() => { slip.replace(coupon.legs.map((l) => ({ ...l }))); slip.setOpen(true); }}><Icon name="ticket" />Load in my coupon</button>
      <button className="btn soft" disabled={tracked} onClick={() => { track.track({ kind: "coupon", title, legs: coupon.legs }); setTracked(true); }}><Icon name={tracked ? "check" : "history"} />{tracked ? "Tracking" : "Track"}</button>
      <button className="btn ghost" onClick={copy}><Icon name="copy" />{copied ? "Copied" : "Copy for Telegram"}</button>
    </div>
  );
}

export function CouponLegs({ legs, compact = false }) {
  return (
    <div className="ticket-legs">
      {legs.map((l) => (
        <Link key={l.eventId} href={`/match/${l.league}/${l.eventId}`} className="leg">
          <span style={{ display: "flex" }}>
            <TeamLogo team={{ logo: l.homeLogo, short: l.home }} size={compact ? 28 : 32} />
            <span style={{ marginLeft: -9 }}><TeamLogo team={{ logo: l.awayLogo, short: l.away }} size={compact ? 28 : 32} /></span>
          </span>
          <span className="lg-main">
            <b>{l.label}</b>
            <small>{l.home} – {l.away} · {dayLabel(l.date)} {localTime(l.date)}{!compact && LEAGUE_BY_ID[l.league] ? ` · ${LEAGUE_BY_ID[l.league].name}` : ""}</small>
            {!compact && l.note ? <small style={{ color: "#c4b5fd" }}>AI: {l.note}</small> : null}
          </span>
          <span className="lg-od">
            <b className="num">{l.estimated ? "≈" : ""}{odds2(l.odds)}</b>
            <small>{pct(l.safe ?? l.p)} · <Tier t={l.tier} /></small>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function CouponCard({ coupon, title, eyebrow, compact = false, glow = true, footer }) {
  if (!coupon) return null;
  const has = coupon.legs?.length > 0;
  return (
    <section className={`card hero ticket ${glow ? "glow" : ""}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2 style={{ margin: "6px 0 0", fontSize: compact ? 22 : 26, letterSpacing: "-.025em" }}>{title}</h2>
        </div>
        <span className="spacer" />
        {has && (
          <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
            <div style={{ textAlign: "right" }}>
              <div className="eyebrow">Total odds</div>
              <div className="total-odds num grad-text">{coupon.odds.toFixed(2)}</div>
            </div>
            <Ring value={coupon.chance} size={compact ? 62 : 70} stroke={6} />
          </div>
        )}
      </div>
      {has ? (
        <>
          <CouponLegs legs={coupon.legs} compact={compact} />
          {footer}
        </>
      ) : (
        <div className="empty" style={{ marginTop: 14 }}>No legs strong enough right now. The engine would rather skip than force a coupon.</div>
      )}
    </section>
  );
}
