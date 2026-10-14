"use client";
import Link from "next/link";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useNotify, NICON } from "../components/Notify";
import { ago, dayLabel, localTime } from "../components/ui";
import NotificationSettings from "../components/NotificationSettings";

export default function Notifications() {
  const n = useNotify();
  const follows = Object.values(n.follows).sort((a, b) => new Date(a.date) - new Date(b.date));
  return (
    <>
      <Top title="Notifications" sub={`${n.unread} unread · ${follows.length} followed matches`} />
      <div className="grid g-match">
        <section className="card">
          <div className="card-head">
            <h2>Inbox</h2>
            <span className="link" style={{ gap: 8 }}>
              <button className="btn ghost xs" onClick={n.markAllRead}>Mark all read</button>
              <button className="btn ghost xs" onClick={n.clear}>Clear</button>
            </span>
          </div>
          {n.items.length === 0 ? (
            <div className="empty"><Icon name="bell" />No notifications yet.<br /><small>Follow a match (🔔) or track a coupon to get alerts.</small></div>
          ) : n.items.map((x) => (
            <Link key={x.id} href={x.href || "#"} className={`nitem ${x.read ? "" : "unread"}`}>
              <span className={`ni ${x.kind === "goal" ? "goal" : x.kind === "red" ? "red" : ""}`}><Icon name={NICON[x.kind] || "bell"} /></span>
              <span style={{ minWidth: 0 }}><b>{x.title}</b>{x.body && <small>{x.body}</small>}</span>
              <span className="t">{ago(x.at)}</span>
            </Link>
          ))}
        </section>
        <div className="stack">
          <NotificationSettings />
          <section className="card">
            <div className="card-head"><h3>Followed matches</h3></div>
            {follows.length === 0 ? <div className="muted">None yet. Tap 🔔 on any match.</div> : follows.map((f) => (
              <div key={f.id} className="kv" style={{ alignItems: "center" }}>
                <Link href={`/match/${f.league}/${f.id}`}><b style={{ fontWeight: 600 }}>{f.home} – {f.away}</b><br /><span className="muted" style={{ fontSize: 12 }}>{f.date ? `${dayLabel(f.date)} ${localTime(f.date)}` : ""}</span></Link>
                <button className="btn ghost xs" onClick={() => n.unfollow(f.id)}>Unfollow</button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
