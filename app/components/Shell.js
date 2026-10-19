"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icons";
import Logo, { LogoMark } from "./Logo";
import { useLiveCount, useSlip, useTrack } from "./Providers";
import { MusicButton, MusicSwitch, SnowSwitch } from "./Ambience";
import { useNotify, NICON } from "./Notify";
import { useAuth } from "./Auth";
import { useT, LangSwitch } from "./Lang";
import { ago, odds2, pct, TeamLogo, Tier } from "./ui";
import { CountUp, MotionLayer, useFlash } from "./Motion";
import AgeGate from "./AgeGate";
import { couponText } from "../../lib/coupon";

const NAV = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/matches", label: "Matches", icon: "ball" },
  { href: "/live", label: "Live", icon: "live", live: true },
  { href: "/coupon", label: "Coupon du jour", icon: "ticket" },
  { href: "/vip", label: "VIP builds", icon: "crown" },
  { href: "/grosse-cote", label: "Grosse cote", icon: "bolt" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/record", label: "Track record", icon: "trophy" },
];
// Phone tab bar (the sketch): home, every pick, the record, the big-odds builds. The rest sits in
// the header menu.
const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/matches", label: "Picks", icon: "ball" },
  { href: "/record", label: "Stats", icon: "chart" },
  { href: "/vip", label: "VIP", icon: "crown" },
];
const ACCOUNT = [
  { href: "/notifications", label: "Notifications", icon: "bell", notif: true },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const active = (path, href) => (href === "/" ? path === "/" : path.startsWith(href));

export default function Shell({ children }) {
  const path = usePathname();
  const router = useRouter();
  const liveN = useLiveCount();
  const { unread } = useNotify();
  const auth = useAuth();
  const { t } = useT();
  const [q, setQ] = useState("");

  return (
    <div className="app">
      <MotionLayer />
      <aside className="side">
        <Link href="/" className="brand">
          <Logo size={40} sub={t("Engine · live odds · AI")} animate />
        </Link>
        <form className="search" onSubmit={(e) => { e.preventDefault(); router.push(`/matches?q=${encodeURIComponent(q)}`); }}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search team or league")} aria-label={t("Search")} />
          <span className="kbd">↵</span>
        </form>
        <SideNav path={path}>
        <div className="nav-label">{t("Navigation")}</div>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={active(path, n.href) ? "on" : ""}>
              <Icon name={n.icon} />{t(n.label)}
              {n.live && liveN > 0 && <span className="count live">{liveN}</span>}
            </Link>
          ))}
        </nav>
        <div className="nav-label">{t("Account")}</div>
        <nav className="nav">
          {ACCOUNT.map((n) => (
            <Link key={n.href} href={n.href} className={active(path, n.href) ? "on" : ""}>
              <Icon name={n.icon} />{t(n.label)}
              {n.notif && unread > 0 && <span className="count">{unread}</span>}
            </Link>
          ))}
        </nav>
        </SideNav>
        <div className="side-foot">
          <Link href={auth.user ? "/settings" : "/login"} className="me">
            <span className="avatar">{auth.user ? (auth.name || "?")[0].toUpperCase() : <Icon name="user" size={17} />}{auth.user && <span className="dot" />}</span>
            <span style={{ minWidth: 0 }}>
              <b>{auth.user ? auth.name : t("Sign in")}</b>
              <small>{auth.user ? t("Synced account") : t("Save picks across devices")}</small>
            </span>
          </Link>
          <div className="row" style={{ margin: "0 4px", gap: 8 }}>
            <LangSwitch />
            <Link href="/legal" className="note" style={{ margin: 0 }}>{t("Legal")}</Link>
          </div>
          <p className="note" style={{ margin: "0 6px" }}>{t("18+ · Bet responsibly. No pick is a guarantee.")}</p>
        </div>
      </aside>

      <main className="main">
        <div className="wrap">{children}</div>
      </main>

      <nav className="bottom-nav" aria-label={t("Navigation")}>
        {TABS.map((n) => (
          <Link key={n.href} href={n.href} className={active(path, n.href) ? "on" : ""}>
            <Icon name={n.icon} />{t(n.label)}
          </Link>
        ))}
      </nav>
      <SlipDrawer />
      <AgeGate />
    </div>
  );
}

// Page header: music, bell, (phone) menu and account tiles. `brand` shows "Skii Pronos" as the
// title (home page).
export function Top({ title, sub, children, brand = false }) {
  const { t } = useT();
  // the header's real height, for whatever sticks below it (--top-h)
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--top-h", `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <header className="top" ref={ref}>
      <Link href="/" className="mobile-only top-logo" aria-label={t("Skii Pronos home")}><LogoMark size={34} animate /></Link>
      <div style={{ minWidth: 0 }}>
        {brand ? <h1 className="brand-title"><span className="red">Skii</span> Pronos</h1> : <h1>{title}</h1>}
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="top-actions">
        {children}
        <span className="desktop-only" style={{ display: "contents" }}><MusicButton /></span>
        <Bell />
        <MenuButton />
        <AvatarTile />
      </div>
    </header>
  );
}

// Phone menu: every page the tab bar doesn't carry, plus the snow / music / language switches.
function MenuButton() {
  const { t } = useT();
  const path = usePathname();
  const liveN = useLiveCount();
  const auth = useAuth();
  const { unread } = useNotify();
  const [open, setOpen] = useState(false);
  const btn = useRef(null), sheet = useRef(null);
  useEffect(() => { setOpen(false); }, [path]);
  // a real modal: focus moves in, Escape closes, Tab stays inside, focus returns to the button
  useEffect(() => {
    if (!open) return undefined;
    const box = sheet.current;
    box?.querySelector("button, a")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key !== "Tab" || !box) return;
      const items = [...box.querySelectorAll("a, button, input")];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const trigger = btn.current;
    return () => { document.removeEventListener("keydown", onKey); trigger?.focus?.(); };
  }, [open]);
  const links = [
    ...NAV.filter((n) => n.href !== "/"),
    ...ACCOUNT,
    { href: auth.user ? "/settings" : "/login", label: auth.user ? "Account" : "Sign in", icon: "user" },
    { href: "/legal", label: "Legal", icon: "shield" },
  ];
  return (
    <>
      <button ref={btn} className="tile-btn mobile-only" aria-label={t("Menu")} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="menu" />
        {liveN > 0 && <span className="badge-dot live" />}
      </button>
      {open && createPortal((
        // rendered at the page root: inside the sticky header the tab bar would draw over it
        <>
          <div className="drawer-bg" onClick={() => setOpen(false)} />
          <aside ref={sheet} className="drawer menu-sheet" role="dialog" aria-modal="true" aria-label={t("Menu")}>
            <div className="row">
              <h2 style={{ margin: 0, fontSize: 19 }}><span className="red">Skii</span> Pronos</h2>
              <span className="spacer" />
              <button className="icon-btn" aria-label={t("Close")} onClick={() => setOpen(false)}><Icon name="x" /></button>
            </div>
            <nav className="menu-links">
              {links.map((n) => (
                <Link key={n.href + n.label} href={n.href} className={active(path, n.href) ? "on" : ""}>
                  <Icon name={n.icon} /><span>{t(n.label)}</span>
                  {n.live && liveN > 0 && <span className="count live">{liveN}</span>}
                  {n.notif && unread > 0 && <span className="count">{unread}</span>}
                </Link>
              ))}
            </nav>
            <div className="menu-switches">
              <SnowSwitch />
              <MusicSwitch />
              <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">{t("Language")}</span><LangSwitch /></div>
            </div>
            <p className="note" style={{ margin: "6px 2px 0" }}>{t("18+ · Bet responsibly. No pick is a guarantee.")}</p>
          </aside>
        </>
      ), document.body)}
    </>
  );
}

function AvatarTile() {
  const auth = useAuth();
  const { t } = useT();
  return (
    <Link href={auth.user ? "/settings" : "/login"} className="tile-btn desktop-only" aria-label={t("Account")}>
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
  const { t } = useT();
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
      <button className={`tile-btn ${wiggle ? "has-new" : ""}`} aria-label={t("Notifications")} onClick={() => { setOpen((o) => !o); }}>
        <Icon name="bell" />
        {n.unread > 0 && <span className="badge-dot" />}
      </button>
      {open && (
        <div className="np">
          <div className="np-head">
            <b style={{ fontSize: 15 }}>{t("Notifications")}</b>
            {n.unread > 0 && <span className="pill grad">{t("{n} new", { n: n.unread })}</span>}
            <span className="spacer" />
            <button className="btn ghost xs" onClick={n.markAllRead}>{t("Mark all read")}</button>
          </div>
          {n.items.length === 0 ? (
            <div className="empty" style={{ margin: 6, padding: 26 }}>
              <Icon name="bell" />{t("No notifications yet.")}<br /><small>{t("Follow a match with the bell to get goal alerts.")}</small>
            </div>
          ) : n.items.slice(0, 8).map((x) => (
            <Link key={x.id} href={x.href || "/notifications"} className={`nitem ${x.read ? "" : "unread"}`} onClick={() => setOpen(false)}>
              <span className={`ni ${x.kind === "goal" ? "goal" : x.kind === "red" ? "red" : ""}`}><Icon name={NICON[x.kind] || "bell"} /></span>
              <span style={{ minWidth: 0 }}><b>{x.title}</b>{x.body && <small>{x.body}</small>}</span>
              <span className="t">{ago(x.at)}</span>
            </Link>
          ))}
          <Link href="/notifications" className="btn soft sm block" style={{ marginTop: 6 }} onClick={() => setOpen(false)}>{t("See all & settings")}</Link>
        </div>
      )}
    </div>
  );
}

function SlipDrawer() {
  const slip = useSlip();
  const track = useTrack();
  const { t, tm, lang } = useT();
  const [copied, setCopied] = useState(false);
  const bump = useFlash(slip.legs.length, 600);
  if (!slip.legs.length && !slip.open) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(couponText({ legs: slip.legs }, t("MY COUPON"), lang)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <>
      {!slip.open && slip.legs.length > 0 && (
        <button className={`slip-fab ${bump ? "bump" : ""}`} onClick={() => slip.setOpen(true)}>
          <span className="n">{slip.legs.length}</span>
          <span style={{ textAlign: "left", lineHeight: 1.15 }}>{t("My coupon")}<br /><small style={{ opacity: .8, fontWeight: 600 }}>@ {slip.odds.toFixed(2)}</small></span>
        </button>
      )}
      {slip.open && (
        <>
          <div className="drawer-bg" onClick={() => slip.setOpen(false)} />
          <aside className="drawer" role="dialog" aria-label={t("My coupon")}>
            <div className="row">
              <div><div className="eyebrow">{t("Bet slip")}</div><h2 style={{ margin: "2px 0 0", fontSize: 20 }}>{t("My coupon")}</h2></div>
              <span className="spacer" />
              <button className="icon-btn" aria-label={t("Close")} onClick={() => slip.setOpen(false)}><Icon name="x" /></button>
            </div>
            <div className="legs-scroll">
              {slip.legs.length === 0 ? <div className="empty">{t("Your coupon is empty. Tap any pick or price to add it.")}</div> : (
                <div className="ticket-legs" style={{ margin: 0 }}>
                  {slip.legs.map((l) => (
                    <div className="leg" key={l.eventId}>
                      <span style={{ display: "flex" }}><TeamLogo team={{ logo: l.homeLogo, short: l.home }} size={26} /></span>
                      <span className="lg-main"><b>{tm(l.label)}</b><small>{l.home} – {l.away}</small></span>
                      <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <span className="lg-od"><b className="num">{odds2(l.odds)}</b><small>{pct(l.safe ?? l.p)}</small></span>
                        <button className="icon-btn" aria-label={t("Remove")} onClick={() => slip.remove(l.eventId)}><Icon name="x" /></button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card flat tight" style={{ marginBottom: 12 }}>
              <div className="row">
                <div><div className="eyebrow">{t("Total odds")}</div><div className="total-odds num"><CountUp value={slip.odds} decimals={2} /></div></div>
                <span className="spacer" />
                <div style={{ textAlign: "right" }}><div className="eyebrow">{t("Hit chance")}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{pct(slip.chance)}</div></div>
              </div>
              {slip.legs.some((l) => l.estimated) && <p className="note" style={{ margin: "10px 0 0" }}>{t("≈ prices are estimates — take them only at or above the shown odds on 1xBet.")}</p>}
            </div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <button className="btn primary" style={{ flex: 1 }} disabled={!slip.legs.length} onClick={() => { track.track({ kind: "slip", title: t("My coupon"), legs: slip.legs }); slip.clear(); slip.setOpen(false); }}>
                <Icon name="check" />{t("Track it")}
              </button>
              <button className="btn soft" disabled={!slip.legs.length} onClick={copy}><Icon name="copy" />{copied ? t("Copied") : t("Copy")}</button>
              <button className="btn ghost" disabled={!slip.legs.length} onClick={slip.clear}>{t("Clear")}</button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

export { Tier };
