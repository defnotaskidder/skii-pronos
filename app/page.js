"use client";
import Link from "next/link";
import { useMemo } from "react";
import Icon from "./components/Icons";
import { Top } from "./components/Shell";
import { useBoard, useTrack } from "./components/Providers";
import { CouponActions, CouponCard, chanceText, useCouponOfTheDay } from "./components/Coupon";
import { LiveCard, MatchRow, PickItem } from "./components/Match";
import { Skeleton, pct } from "./components/ui";
import { CountUp } from "./components/Motion";
import { LEAGUE_BY_ID } from "../lib/leagues";

const TIER_RANK = { High: 4, "Med-High": 3, Medium: 2, Low: 1, Skip: 0 };

export default function Dashboard() {
  const { events, live, loading, error } = useBoard();
  const { data: coupon, error: couponError } = useCouponOfTheDay();
  const { entries } = useTrack();

  const now = Date.now();
  const next24 = useMemo(() => events.filter((e) => e.state === "pre" && new Date(e.date) - now < 24 * 3600e3 && new Date(e.date) > now), [events]); // eslint-disable-line react-hooks/exhaustive-deps
  const topPicks = useMemo(() => next24.filter((e) => e.a?.pick && TIER_RANK[e.a.pick.tier] >= 3)
    .sort((a, b) => (TIER_RANK[b.a.pick.tier] - TIER_RANK[a.a.pick.tier]) || (b.a.pick.safe - a.a.pick.safe)).slice(0, 6), [next24]);
  const values = useMemo(() => events.filter((e) => e.state === "pre" && e.a?.value).sort((a, b) => b.a.value.ev - a.a.value.ev).slice(0, 6), [events]);
  const bigGames = useMemo(() => next24.filter((e) => LEAGUE_BY_ID[e.league]?.tier === 1).slice(0, 6), [next24]);
  const leaguesToday = new Set(next24.map((e) => e.league)).size;

  const record = useMemo(() => {
    const week = Date.now() - 7 * 86400e3;
    const legs = entries.filter((e) => new Date(e.at) > week).flatMap((e) => e.legs).filter((l) => l.result === "W" || l.result === "L");
    const w = legs.filter((l) => l.result === "W").length;
    return { n: legs.length, w, rate: legs.length ? w / legs.length : 0 };
  }, [entries]);

  const today = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <Top title="Dashboard" sub={`${today} · ${next24.length} matches in the next 24h across ${leaguesToday} leagues`} />
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="grid g-dash">
        <div className="stack">
          {coupon ? (
            <CouponCard coupon={coupon.safe} title="Coupon du jour" eyebrow={`Safest legs today${coupon.reviewed ? " · AI-checked" : ""}`}
              footer={<CouponActions coupon={coupon.safe} title="Coupon du jour" />} />
          ) : (
            <section className="card hero glow">
              <div className="eyebrow">Coupon du jour</div>
              {couponError ? <div className="error" style={{ marginTop: 12 }}>{couponError}</div> : <div style={{ marginTop: 14 }}><Skeleton rows={3} h={58} /></div>}
            </section>
          )}

          {live.length > 0 && (
            <section>
              <div className="card-head" style={{ padding: "0 4px" }}>
                <span className="pill live">LIVE</span><h2>Live now</h2>
                <Link href="/live" className="link">All {live.length} <Icon name="chevron" size={14} /></Link>
              </div>
              <div className="hscroll stagger">{live.map((e) => <LiveCard key={e.id} ev={e} />)}</div>
            </section>
          )}
        </div>

        <div className="stack">
          <div className="grid g-2 stagger" style={{ gap: 14 }}>
            <Link href="/live" className="card tight stat">
              <span className="stat-ico live"><Icon name="live" /></span>
              <span className="big num"><CountUp value={live.length} /></span><span className="lbl">Live now</span>
            </Link>
            <Link href="/matches" className="card tight stat">
              <span className="stat-ico cyan"><Icon name="ball" /></span>
              <span className="big num"><CountUp value={next24.length} /></span><span className="lbl">Next 24 hours</span>
            </Link>
            <div className="card tight stat">
              <span className="stat-ico green"><Icon name="shield" /></span>
              <span className="big num"><CountUp value={next24.filter((e) => TIER_RANK[e.a?.pick?.tier] >= 3).length} /></span><span className="lbl">Strong picks</span>
            </div>
            <div className="card tight stat">
              <span className="stat-ico"><Icon name="trend" /></span>
              <span className="big num"><CountUp value={values.length} /></span><span className="lbl">Value spots</span>
            </div>
          </div>

          <section className="card">
            <div className="card-head">
              <h3>Your record<br /><span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Last 7 days</span></h3>
              <span className="link" style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{record.n ? pct(record.rate) : "—"}</span>
            </div>
            <div className="bar"><i style={{ width: `${record.rate * 100}%` }} /></div>
            <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
              <span className="muted" style={{ fontSize: 13 }}>{record.n ? `${record.w} won of ${record.n} graded legs` : "Track a coupon to start your record."}</span>
              <Link href="/history" className="btn soft sm">History</Link>
            </div>
          </section>

          <Link href="/grosse-cote" className="card" style={{ display: "block" }}>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <span className="stat-ico" style={{ margin: 0 }}><Icon name="bolt" /></span>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>Grosse cote du jour</b>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {coupon?.grosse?.legs?.length ? `${coupon.grosse.legs.length} legs · ${chanceText(coupon.grosse.chance)}` : "Big odds, best chance · generator inside"}
                </div>
              </div>
              <span className="spacer" />
              {coupon?.grosse?.legs?.length > 0 && <span className="total-odds num grad-text" style={{ fontSize: 30 }}><CountUp value={coupon.grosse.odds} decimals={2} /></span>}
            </div>
          </Link>
        </div>
      </div>

      <div className="grid g-2" style={{ marginTop: 18 }} data-reveal>
        <section className="card">
          <div className="card-head"><h2>Top picks today</h2><Link href="/matches" className="link">All matches <Icon name="chevron" size={14} /></Link></div>
          {loading ? <Skeleton rows={4} h={58} /> : topPicks.length ? (
            <div className="plist stagger">{topPicks.map((e) => <PickItem key={e.id} ev={e} m={e.a.pick} />)}</div>
          ) : <div className="empty">No high-confidence picks in the next 24 hours.</div>}
        </section>
        <section className="card">
          <div className="card-head"><h2>Value spots</h2><span className="pill violet" style={{ marginLeft: "auto" }}>model beats the price</span></div>
          {loading ? <Skeleton rows={4} h={58} /> : values.length ? (
            <div className="plist stagger">{values.map((e) => <PickItem key={e.id} ev={e} m={e.a.value} right={<span className="pill green">+{Math.round(e.a.value.ev * 100)}%</span>} />)}</div>
          ) : <div className="empty">No price beats the model right now. That's normal, value is rare.</div>}
        </section>
      </div>

      {bigGames.length > 0 && (
        <section style={{ marginTop: 22 }} data-reveal>
          <div className="card-head" style={{ padding: "0 4px" }}><h2>Big games</h2><Link href="/matches" className="link">See all <Icon name="chevron" size={14} /></Link></div>
          {bigGames.map((e) => <MatchRow key={e.id} ev={e} showLeague />)}
        </section>
      )}
      <p className="note" style={{ marginTop: 24 }}>Probabilities come from bookmaker odds with the margin removed, blended with a league-table and form model. “≈” prices are estimates: take them on 1xBet only at or above the shown odds. 18+, bet responsibly.</p>
    </>
  );
}
