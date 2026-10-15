"use client";
import Link from "next/link";
import { useMemo } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useBoard } from "../components/Providers";
import { useT } from "../components/Lang";
import { LiveCard, MatchRow } from "../components/Match";
import { Skeleton } from "../components/ui";

export default function Live() {
  const { events, live, loading, liveAt, refresh } = useBoard();
  const { t, locale } = useT();
  const soon = useMemo(() => events.filter((e) => e.state === "pre" && new Date(e.date) - Date.now() < 3 * 3600e3 && new Date(e.date) > Date.now() - 15 * 60e3), [events]);
  const justEnded = useMemo(() => events.filter((e) => e.state === "post" && Date.now() - new Date(e.date) < 4 * 3600e3).slice(-8).reverse(), [events]);

  return (
    <>
      <Top title={t("Live")} sub={t("{n} live now · refreshes every 15s", { n: live.length }) + (liveAt ? ` · ${new Date(liveAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "")}>
        <button className="tile-btn" aria-label={t("Refresh")} onClick={refresh}><Icon name="refresh" /></button>
      </Top>

      {loading ? <Skeleton rows={3} h={150} /> : live.length === 0 ? (
        <div className="empty" style={{ marginBottom: 22 }}>
          <Icon name="live" />{t("Nothing live right now.")}<br />
          <small>{soon.length ? t("{n} matches start in the next 3 hours.", { n: soon.length }) : t("Check the upcoming list below.")}</small>
        </div>
      ) : (
        <div className="grid stagger" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(268px, 1fr))", marginBottom: 26 }}>
          {live.map((e) => <LiveCard key={e.id} ev={e} />)}
        </div>
      )}

      <div className="card flat tight" style={{ marginBottom: 22, display: "flex", gap: 12, alignItems: "center" }}>
        <span className="stat-ico" style={{ margin: 0 }}><Icon name="sparkles" /></span>
        <span style={{ flex: 1, fontSize: 13.5 }}>{t("Open any live match for the")} <b>{t("live model")}</b> {t("(win/draw/loss re-priced from score, minute, red cards and shots) and a one-tap")} <b>{t("AI live read")}</b>. {t("Tap 🔔 to get goal alerts.")}</span>
      </div>

      {soon.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div className="card-head" style={{ padding: "0 4px" }}><h2>{t("Starting soon")}</h2><Link href="/matches" className="link">{t("All matches")} <Icon name="chevron" size={14} /></Link></div>
          {soon.slice(0, 30).map((e) => <MatchRow key={e.id} ev={e} showLeague />)}
        </section>
      )}
      {justEnded.length > 0 && (
        <section>
          <div className="card-head" style={{ padding: "0 4px" }}><h2>{t("Just finished")}</h2></div>
          {justEnded.map((e) => <MatchRow key={e.id} ev={e} showLeague />)}
        </section>
      )}
    </>
  );
}
