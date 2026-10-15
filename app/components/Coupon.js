"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "./Icons";
import { useSlip, useTrack } from "./Providers";
import { useNotify } from "./Notify";
import { load, save } from "./store";
import { Ring, TeamLogo, Tier, dayLabel, localTime, odds2, pct } from "./ui";
import { couponText } from "../../lib/coupon";
import { CountUp } from "./Motion";
import { LEAGUE_BY_ID } from "../../lib/leagues";

// "31%" for likely slips, "4.6% · 1 in 22" for long shots.
export function chanceText(p) {
  if (p === null || p === undefined) return "–";
  if (p >= 0.1) return `${Math.round(p * 100)}%`;
  const one = Math.max(2, Math.round(1 / Math.max(p, 1e-6)));
  return `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}% · 1 in ${one.toLocaleString()}`;
}

// Fetch the day's coupons once per page view (refresh every 2 min for live leg status);
// announce a new coupon du jour once per day.
export function useCouponOfTheDay() {
  const notify = useNotify();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true, t;
    const get = () => fetch("/api/coupon").then((r) => r.json()).then((d) => {
      if (!alive) return;
      if (d.error) { setError(d.error); return; }
      setData(d); setError("");
      if (d.safe?.legs?.length && notify?.prefs.coupon && load("skii-coupon-day", "") !== d.day) {
        save("skii-coupon-day", d.day);
        notify.push({ kind: "coupon", title: "🔥 Coupon du jour + grosse cote are ready", body: `Safe ${d.safe.legs.length} legs @ ${Number(d.safe.odds).toFixed(2)}${d.grosse?.legs?.length ? ` · grosse cote @ ${Number(d.grosse.odds).toFixed(2)}` : ""}`, href: "/coupon", dedupe: `coupon-${d.day}` });
      }
    }).catch(() => alive && setError("Couldn't load the coupon.")).finally(() => { if (alive) t = setTimeout(get, 120e3); });
    get();
    return () => { alive = false; clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error };
}

// a leg without its live status / AI note, for the slip and tracking
const bare = ({ live, note, ...l }) => l; // eslint-disable-line no-unused-vars

export function CouponActions({ coupon, title, extra }) {
  const slip = useSlip();
  const track = useTrack();
  const [copied, setCopied] = useState(false);
  const [tracked, setTracked] = useState(false);
  useEffect(() => { setTracked(false); }, [coupon]);
  if (!coupon?.legs?.length) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(couponText(coupon, title.toUpperCase())); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ }
  };
  const open = coupon.legs.filter((l) => !l.live || l.live.state === "pre");
  return (
    <div className="row">
      <button className="btn primary" disabled={!open.length} onClick={() => { slip.replace(open.map(bare)); slip.setOpen(true); }}><Icon name="ticket" />Load in my coupon</button>
      <button className="btn soft" disabled={tracked} onClick={() => { track.track({ kind: "coupon", title, legs: coupon.legs.map(bare) }); setTracked(true); }}><Icon name={tracked ? "check" : "history"} />{tracked ? "Tracking" : "Track"}</button>
      <button className="btn ghost" onClick={copy}><Icon name="copy" />{copied ? "Copied" : "Copy for Telegram"}</button>
      {extra}
    </div>
  );
}

// Live state of one leg: kick-off time, live score + minute, or the final result.
function LegStatus({ l }) {
  const r = l.result || l.live?.result;
  if (r) return <span className={`pill ${r === "W" ? "green" : r === "L" ? "red" : ""}`}>{r === "W" ? "✓ Won" : r === "L" ? "✗ Lost" : "Void"}{l.live?.score ? ` ${l.live.score}` : l.score ? ` ${l.score}` : ""}</span>;
  if (l.live?.state === "in") return <span className="pill live">{l.live.minute ? `${l.live.minute}'` : l.live.detail || "LIVE"} · {l.live.score}</span>;
  return null;
}

export function CouponLegs({ legs, compact = false }) {
  return (
    <div className="ticket-legs stagger">
      {legs.map((l) => {
        const r = l.result || l.live?.result;
        return (
          <Link key={l.eventId} href={`/match/${l.league}/${l.eventId}`} className={`leg ${r ? `res-${r}` : ""}`}>
            <span style={{ display: "flex" }}>
              <TeamLogo team={{ logo: l.homeLogo, short: l.home }} size={compact ? 28 : 32} />
              <span style={{ marginLeft: -9 }}><TeamLogo team={{ logo: l.awayLogo, short: l.away }} size={compact ? 28 : 32} /></span>
            </span>
            <span className="lg-main">
              <b>{l.label}</b>
              <small>{l.home} – {l.away} · {dayLabel(l.date)} {localTime(l.date)}{!compact && LEAGUE_BY_ID[l.league] ? ` · ${LEAGUE_BY_ID[l.league].name}` : ""}</small>
              {!compact && l.note ? <small style={{ color: "#c4b5fd" }}>AI: {l.note}</small> : null}
              <LegStatus l={l} />
            </span>
            <span className="lg-od">
              <b className="num">{l.estimated ? "≈" : ""}{odds2(l.odds)}</b>
              <small>{pct(l.safe ?? l.p)}{l.tier ? <> · <Tier t={l.tier} /></> : null}</small>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function CouponCard({ coupon, title, eyebrow, compact = false, glow = true, footer, icon }) {
  if (!coupon) return null;
  const has = coupon.legs?.length > 0;
  return (
    <section className={`card hero ticket ${glow ? "glow" : ""}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        {icon && <span className="stat-ico" style={{ margin: 0 }}><Icon name={icon} /></span>}
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2 style={{ margin: "6px 0 0", fontSize: compact ? 22 : 26, letterSpacing: "-.025em" }}>{title}</h2>
          {coupon.status === "won" && <span className="pill green" style={{ marginTop: 8 }}>✓ Coupon won</span>}
          {coupon.status === "lost" && <span className="pill red" style={{ marginTop: 8 }}>✗ Coupon lost</span>}
        </div>
        <span className="spacer" />
        {has && (
          <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
            <div style={{ textAlign: "right" }}>
              <div className="eyebrow">Total odds</div>
              <div className="total-odds num grad-text"><CountUp value={coupon.odds} decimals={2} duration={900} /></div>
              {coupon.chance < 0.1 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{chanceText(coupon.chance)}</div>}
            </div>
            <Ring value={coupon.chance} size={compact ? 62 : 70} stroke={6} label={coupon.chance < 0.1 ? `${(coupon.chance * 100).toFixed(1)}%` : undefined} fontSize={coupon.chance < 0.1 ? 14 : undefined} />
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
