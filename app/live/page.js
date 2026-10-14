"use client";
import Link from "next/link";
import { useMemo } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useBoard } from "../components/Providers";
import { LiveCard, MatchRow } from "../components/Match";
import { Skeleton } from "../components/ui";

export default function Live() {
  const { events, live, loading, updated, refresh } = useBoard();
  const soon = useMemo(() => events.filter((e) => e.state === "pre" && new Date(e.date) - Date.now() < 3 * 3600e3 && new Date(e.date) > Date.now() - 15 * 60e3), [events]);
  const justEnded = useMemo(() => events.filter((e) => e.state === "post" && Date.now() - new Date(e.date) < 4 * 3600e3).slice(-8).reverse(), [events]);

  return (
    <>
      <Top title="Live" sub={`${live.length} live now · refreshes every 30s${updated ? ` · ${new Date(updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}`}>
        <button className="tile-btn" aria-label="Refresh" onClick={refresh}><Icon name="refresh" /></button>
      </Top>

      {loading ? <Skeleton rows={3} h={150} /> : live.length === 0 ? (
        <div className="empty" style={{ marginBottom: 22 }}>
          <Icon name="live" />Nothing live right now.<br />
          <small>{soon.length ? `${soon.length} matches start in the next 3 hours.` : "Check the upcoming list below."}</small>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(268px, 1fr))", marginBottom: 26 }}>
          {live.map((e) => <LiveCard key={e.id} ev={e} />)}
        </div>
      )}

      <div className="card flat tight" style={{ marginBottom: 22, display: "flex", gap: 12, alignItems: "center" }}>
        <span className="stat-ico" style={{ margin: 0 }}><Icon name="sparkles" /></span>
        <span style={{ flex: 1, fontSize: 13.5 }}>Open any live match for the <b>live model</b> (win/draw/loss re-priced from score, minute, red cards and shots) and a one-tap <b>AI live read</b>. Tap 🔔 to get goal alerts.</span>
      </div>

      {soon.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div className="card-head" style={{ padding: "0 4px" }}><h2>Starting soon</h2><Link href="/matches" className="link">All matches <Icon name="chevron" size={14} /></Link></div>
          {soon.map((e) => <MatchRow key={e.id} ev={e} showLeague />)}
        </section>
      )}
      {justEnded.length > 0 && (
        <section>
          <div className="card-head" style={{ padding: "0 4px" }}><h2>Just finished</h2></div>
          {justEnded.map((e) => <MatchRow key={e.id} ev={e} showLeague />)}
        </section>
      )}
    </>
  );
}
