"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icons";
import Logo, { LogoMark } from "./Logo";
import { useBoard, useSlip, useTrack } from "./Providers";
import { useNotify, NICON } from "./Notify";
import { useAuth } from "./Auth";
import { ago, odds2, pct, TeamLogo, Tier } from "./ui";
import { CountUp, MotionLayer, useFlash } from "./Motion";
import { couponText } from "../../lib/coupon";

const NAV = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/matches", label: "Matches", icon: "ball" },
  { href: "/live", label: "Live", icon: "live", live: true },
  { href: "/coupon", label: "Coupon du jour", icon: "ticket" },
  { href: "/grosse-cote", label: "Grosse cote", icon: "bolt" },
  { href: "/history", label: "History", icon: "history" },
];
const ACCOUNT = [
  { href: "/notifications", label: "Notifications", icon: "bell", notif: true },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const active = (path, href) => (href === "/" ? path === "/" : path.startsWith(href));

export default function Shell({ children }) {
  const path = usePathname();
  const router = useRouter();
  const { live } = useBoard();
  const { unread } = useNotify();
  const auth = useAuth();
  const [q, setQ] = useState("");

  return (
    <div className="app">
      <MotionLayer />
      <aside className="side">
        <Link href="/" className="brand">
          <Logo size={40} sub="Engine · live odds · AI" animate />
        </Link>
        <form className="search" onSubmit={(e) => { e.preventDefault(); router.push(`/matches?q=${encodeURIComponent(q)}`); }}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team or league" aria-label="Search" />
          <span className="kbd">↵</span>
        </form>
        <SideNav path={path}>
        <div className="nav-label">Navigation</div>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={active(path, n.href) ? "on" : ""}>
              <Icon name={n.icon} />{n.label}
              {n.live && live.length > 0 && <span className="count live">{live.length}</span>}
            </Link>
          ))}
        </nav>
        <div className="nav-label">Account</div>
        <nav className="nav">
          {ACCOUNT.map((n) => (
            <Link key={n.href} href={n.href} className={active(path, n.href) ? "on" : ""}>
              <Icon name={n.icon} />{n.label}
              {n.notif && unread > 0 && <span className="count">{unread}</span>}
            </Link>
          ))}
        </nav>
        </SideNav>
        <div className="side-foot">
          <Link href={auth.user ? "/settings" : "/login"} className="me">
            <span className="avatar">{auth.user ? (auth.name || "?")[0].toUpperCase() : <Icon name="user" size={17} />}{auth.user && <span className="dot" />}</span>
            <span style={{ minWidth: 0 }}>
              <b>{auth.user ? auth.name : "Sign in"}</b>
              <small>{auth.user ? "Synced account" : "Save picks across devices"}</small>
            </span>
          </Link>
          <p className="note" style={{ margin: "0 6px" }}>18+ · Bet responsibly. No pick is a guarantee.</p>
        </div>
      </aside>

      <main className="main">
        <div className="wrap">{children}</div>
      </main>

      <nav className="bottom-nav">
        {[NAV[0], NAV[1], NAV[2], NAV[3], { href: auth.user ? "/settings" : "/login", label: auth.user ? "Me" : "Sign in", icon: "user" }].map((n) => (
          <Link key={n.href} href={n.href} className={active(path, n.href) ? "on" : ""}>
            <Icon name={n.icon} />{n.label === "Coupon du jour" ? "Coupon" : n.label}
            {n.live && live.length > 0 && <span className="pip" />}
          </Link>
        ))}
      </nav>
      <SlipDrawer />
    </div>
  );
}

// Page header with the bell + avatar tiles.
export function Top({ title, sub, children }) {
  return (
    <header className="top">
      <Link href="/" className="mobile-only top-logo" aria-label="Skii Pronos home"><LogoMark size={38} animate /></Link>
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="top-actions">
        {children}
        <Bell />
        <AvatarTile />
      </div>
    </header>
  );
}

function AvatarTile() {
  const auth = useAuth();
  return (
    <Link href={auth.user ? "/settings" : "/login"} className="tile-btn desktop-only" aria-label="Account">
      {auth.user ? <b>{(auth.name || "?")[0].toUpperCase()}</b> : <Icon name="user" />}
    </Link>
  );
}

// Both sidebar menus share one gradient pill that slides to the active link.
function SideNav({ path, children }) {
  const ref = useRef(null);
  const [ind, setInd] = useState(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      const box = ref.current, el = box?.querySelector(".nav a.on");
      const b = el?.getBoundingClientRect();
      if (!b?.height) { setInd(null); return; } // no active link, or sidebar hidden on small screens
      setInd({ y: b.top - box.getBoundingClientRect().top, h: b.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [path]);
  useEffect(() => { if (ind && !ready) requestAnimationFrame(() => setReady(true)); }, [ind, ready]);
  return (
    <div ref={ref} className="navs">
      <span className="nav-ind" style={{ transform: `translateY(${ind?.y ?? 0}px)`, height: ind?.h ?? 42, opacity: ind ? 1 : 0, transition: ready ? undefined : "none" }} />
      {children}
    </div>
  );
}

function Bell() {
  const n = useNotify();
  const wiggle = useFlash(n.unread) && n.unread > 0;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className={`tile-btn ${wiggle ? "has-new" : ""}`} aria-label="Notifications" onClick={() => { setOpen((o) => !o); }}>
        <Icon name="bell" />
        {n.unread > 0 && <span className="badge-dot" />}
      </button>
      {open && (
        <div className="np">
          <div className="np-head">
            <b style={{ fontSize: 15 }}>Notifications</b>
            {n.unread > 0 && <span className="pill grad">{n.unread} new</span>}
            <span className="spacer" />
            <button className="btn ghost xs" onClick={n.markAllRead}>Mark all read</button>
          </div>
          {n.items.length === 0 ? (
            <div className="empty" style={{ margin: 6, padding: 26 }}>
              <Icon name="bell" />No notifications yet.<br /><small>Follow a match with the bell to get goal alerts.</small>
            </div>
          ) : n.items.slice(0, 8).map((x) => (
            <Link key={x.id} href={x.href || "/notifications"} className={`nitem ${x.read ? "" : "unread"}`} onClick={() => setOpen(false)}>
              <span className={`ni ${x.kind === "goal" ? "goal" : x.kind === "red" ? "red" : ""}`}><Icon name={NICON[x.kind] || "bell"} /></span>
              <span style={{ minWidth: 0 }}><b>{x.title}</b>{x.body && <small>{x.body}</small>}</span>
              <span className="t">{ago(x.at)}</span>
            </Link>
          ))}
          <Link href="/notifications" className="btn soft sm block" style={{ marginTop: 6 }} onClick={() => setOpen(false)}>See all & settings</Link>
        </div>
      )}
    </div>
  );
}

function SlipDrawer() {
  const slip = useSlip();
  const track = useTrack();
  const [copied, setCopied] = useState(false);
  const bump = useFlash(slip.legs.length, 600);
  if (!slip.legs.length && !slip.open) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(couponText({ legs: slip.legs }, "MON COUPON")); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <>
      {!slip.open && slip.legs.length > 0 && (
        <button className={`slip-fab ${bump ? "bump" : ""}`} onClick={() => slip.setOpen(true)}>
          <span className="n">{slip.legs.length}</span>
          <span style={{ textAlign: "left", lineHeight: 1.15 }}>My coupon<br /><small style={{ opacity: .8, fontWeight: 600 }}>@ {slip.odds.toFixed(2)}</small></span>
        </button>
      )}
      {slip.open && (
        <>
          <div className="drawer-bg" onClick={() => slip.setOpen(false)} />
          <aside className="drawer" role="dialog" aria-label="My coupon">
            <div className="row">
              <div><div className="eyebrow">Bet slip</div><h2 style={{ margin: "2px 0 0", fontSize: 20 }}>My coupon</h2></div>
              <span className="spacer" />
              <button className="icon-btn" aria-label="Close" onClick={() => slip.setOpen(false)}><Icon name="x" /></button>
            </div>
            <div className="legs-scroll">
              {slip.legs.length === 0 ? <div className="empty">Your coupon is empty. Tap any pick or price to add it.</div> : (
                <div className="ticket-legs" style={{ margin: 0 }}>
                  {slip.legs.map((l) => (
                    <div className="leg" key={l.eventId}>
                      <span style={{ display: "flex" }}><TeamLogo team={{ logo: l.homeLogo, short: l.home }} size={26} /></span>
                      <span className="lg-main"><b>{l.label}</b><small>{l.home} – {l.away}</small></span>
                      <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <span className="lg-od"><b className="num">{odds2(l.odds)}</b><small>{pct(l.safe ?? l.p)}</small></span>
                        <button className="icon-btn" aria-label="Remove" onClick={() => slip.remove(l.eventId)}><Icon name="x" /></button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card flat tight" style={{ marginBottom: 12 }}>
              <div className="row">
                <div><div className="eyebrow">Total odds</div><div className="total-odds num"><CountUp value={slip.odds} decimals={2} /></div></div>
                <span className="spacer" />
                <div style={{ textAlign: "right" }}><div className="eyebrow">Hit chance</div><div style={{ fontSize: 22, fontWeight: 800 }}>{pct(slip.chance)}</div></div>
              </div>
              {slip.legs.some((l) => l.estimated) && <p className="note" style={{ margin: "10px 0 0" }}>≈ prices are estimates — take them only at or above the shown odds on 1xBet.</p>}
            </div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <button className="btn primary" style={{ flex: 1 }} disabled={!slip.legs.length} onClick={() => { track.track({ kind: "slip", title: "My coupon", legs: slip.legs }); slip.clear(); slip.setOpen(false); }}>
                <Icon name="check" />Track it
              </button>
              <button className="btn soft" disabled={!slip.legs.length} onClick={copy}><Icon name="copy" />{copied ? "Copied" : "Copy"}</button>
              <button className="btn ghost" disabled={!slip.legs.length} onClick={slip.clear}>Clear</button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

export { Tier };
