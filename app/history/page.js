"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useTrack } from "../components/Providers";
import { TeamLogo, dayLabel, localTime, odds2, pct } from "../components/ui";
import { product } from "../../lib/coupon";

function status(legs) {
  if (legs.some((l) => l.result === "L")) return "lost";
  if (legs.every((l) => l.result)) return "won";
  return "pending";
}

export default function History() {
  const { entries, remove, grade, settleAll, clear } = useTrack();
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");

  const stats = useMemo(() => {
    const legs = entries.flatMap((e) => e.legs).filter((l) => l.result === "W" || l.result === "L");
    const w = legs.filter((l) => l.result === "W").length;
    const units = legs.reduce((a, l) => a + (l.result === "W" ? l.odds - 1 : -1), 0);
    const done = entries.filter((e) => status(e.legs) !== "pending");
    const cw = done.filter((e) => status(e.legs) === "won").length;
    return { legs: legs.length, hit: legs.length ? w / legs.length : 0, units, roi: legs.length ? units / legs.length : 0, coupons: done.length, couponHit: done.length ? cw / done.length : 0 };
  }, [entries]);

  const list = entries.filter((e) => filter === "all" || status(e.legs) === filter);

  return (
    <>
      <Top title="History" sub="Tracked coupons and picks, graded automatically from final scores">
        <button className="tile-btn" aria-label="Grade now" title="Grade finished games now" onClick={settleAll}><Icon name="refresh" /></button>
      </Top>

      <div className="grid g-4" style={{ marginBottom: 18 }}>
        <div className="card tight stat"><span className="stat-ico cyan"><Icon name="target" /></span><span className="big num">{pct(stats.hit)}</span><span className="lbl">Leg hit rate · {stats.legs} graded</span></div>
        <div className="card tight stat"><span className="stat-ico green"><Icon name="trophy" /></span><span className="big num">{pct(stats.couponHit)}</span><span className="lbl">Coupons won · {stats.coupons} settled</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="trend" /></span><span className="big num" style={{ color: stats.units >= 0 ? "#86efac" : "#fda4af" }}>{stats.units >= 0 ? "+" : ""}{stats.units.toFixed(2)}<small>u</small></span><span className="lbl">Flat 1u per leg</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="chart" /></span><span className="big num">{stats.roi >= 0 ? "+" : ""}{Math.round(stats.roi * 100)}<small>%</small></span><span className="lbl">ROI per leg</span></div>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <div className="seg">
          {[["all", "All"], ["pending", "Pending"], ["won", "Won"], ["lost", "Lost"]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <span className="spacer" />
        {entries.length > 0 && <button className="btn ghost sm" onClick={() => { if (confirm("Clear all history?")) clear(); }}>Clear all</button>}
      </div>

      {list.length === 0 ? (
        <div className="empty"><Icon name="history" />Nothing here yet.<br /><small>Track the <Link href="/coupon" style={{ color: "#c4b5fd" }}>coupon du jour</Link> or your own coupon and it lands here, graded automatically.</small></div>
      ) : list.map((e) => {
        const st = status(e.legs);
        const isOpen = open === e.id;
        return (
          <section key={e.id} className="card" style={{ marginBottom: 12, padding: 0 }}>
            <button className="row" style={{ width: "100%", padding: 16, flexWrap: "nowrap", textAlign: "left" }} onClick={() => setOpen(isOpen ? null : e.id)}>
              <span className={`stat-ico ${st === "won" ? "green" : st === "lost" ? "live" : ""}`} style={{ margin: 0 }}><Icon name={st === "won" ? "check" : st === "lost" ? "x" : "clock"} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>{e.title}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>{new Date(e.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {e.legs.length} legs · {e.legs.filter((l) => l.result === "W").length}W {e.legs.filter((l) => l.result === "L").length}L</div>
              </span>
              <span className={`pill ${st === "won" ? "green" : st === "lost" ? "red" : "amber"}`}>{st}</span>
              <b className="num" style={{ fontSize: 18, marginLeft: 6 }}>{product(e.legs).toFixed(2)}</b>
              <Icon name={isOpen ? "down" : "chevron"} size={16} />
            </button>
            {isOpen && (
              <div style={{ padding: "0 16px 16px" }}>
                <div className="ticket-legs" style={{ margin: "0 0 12px" }}>
                  {e.legs.map((l) => (
                    <div key={l.eventId} className={`leg res-${l.result || ""}`}>
                      <TeamLogo team={{ logo: l.homeLogo, short: l.home }} size={28} />
                      <Link href={`/match/${l.league}/${l.eventId}`} className="lg-main">
                        <b>{l.label} <span className="muted" style={{ fontWeight: 500 }}>@ {odds2(l.odds)}</span></b>
                        <small>{l.home} – {l.away} · {dayLabel(l.date)} {localTime(l.date)}{l.score ? ` · FT ${l.score}` : ""}</small>
                      </Link>
                      <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        {["W", "L", "V"].map((r) => (
                          <button key={r} className={`icon-btn ${l.result === r ? "on" : ""}`} style={{ width: 30, height: 30, fontSize: 12, fontWeight: 800 }}
                            onClick={() => grade(e.id, l.eventId, l.result === r ? null : r)}>{r}</button>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="row">
                  <span className="note">Results fill in automatically after full time. W / L / V lets you correct one by hand.</span>
                  <span className="spacer" />
                  <button className="btn ghost sm" onClick={() => remove(e.id)}>Delete</button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
