"use client";
import { useEffect, useId, useState } from "react";
import { CountUp } from "./Motion";
import { translate } from "../../lib/i18n";

// Set by LangProvider; every date/time helper and fixed label below follows it.
let locale = "fr-FR";
export const setLocale = (l) => { locale = l || "fr-FR"; };
export const currentLang = () => locale.slice(0, 2);
const tt = (key, vars) => translate(currentLang(), key, vars);

export const pct = (x) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)}%`);
export const odds2 = (x) => (x ? Number(x).toFixed(2) : "–");

export function localTime(iso) {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}
export function dayLabel(iso) {
  const d = new Date(iso), now = new Date();
  const key = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const t = new Date(now); const y = new Date(now); const tm = new Date(now);
  y.setDate(now.getDate() - 1); tm.setDate(now.getDate() + 1);
  if (key(d) === key(t)) return tt("Today");
  if (key(d) === key(tm)) return tt("Tomorrow");
  if (key(d) === key(y)) return tt("Yesterday");
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}
export function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// League flag: a real image (flag emoji don't render on Windows), emoji for the rest.
export function LeagueFlag({ league, size = 18 }) {
  if (!league) return null;
  if (!league.cc) return <span className="lflag emoji" style={{ fontSize: size * 0.9 }} aria-hidden="true">{league.flag}</span>;
  return <img className="lflag" src={`https://flagcdn.com/w40/${league.cc}.png`} alt="" width={Math.round(size * 1.33)} height={size} loading="lazy" />;
}

// ESPN's logos are 500px (~150 KB each); its resizer serves the same logo at the size shown (~5 KB).
export const logoSrc = (url, size) => (/^https?:\/\/a\.espncdn\.com\/i\//.test(url || "")
  ? `https://a.espncdn.com/combiner/i?img=${url.replace(/^https?:\/\/a\.espncdn\.com/, "")}&w=${size * 2}&h=${size * 2}`
  : url);

export function TeamLogo({ team, size = 28 }) {
  const [broken, setBroken] = useState(false);
  const initials = (team?.abbr || team?.short || team?.name || "?").slice(0, 3).toUpperCase();
  return (
    <span className="logo" style={{ width: size, height: size }}>
      {team?.logo && !broken ? <img src={logoSrc(team.logo, size)} alt="" loading="lazy" decoding="async" width={size} height={size} onError={() => setBroken(true)} /> : initials}
    </span>
  );
}

// Circular progress like the reference "15" dial.
export function Ring({ value = 0, size = 52, stroke = 5, label, fontSize }) {
  const id = useId().replace(/:/g, "");
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, value || 0));
  // start empty, then sweep to the value (the CSS transition does the easing)
  const [v, setV] = useState(0);
  useEffect(() => { const r = requestAnimationFrame(() => setV(target)); return () => cancelAnimationFrame(r); }, [target]);
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#ff5f5f" />
            <stop offset="100%" stopColor="#ff7043" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#g${id})`} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset .6s cubic-bezier(.22,.61,.36,1)" }} />
      </svg>
      <span className="val" style={{ fontSize: fontSize || Math.round(size * 0.27) }}>{label ?? <CountUp value={target * 100} suffix="%" duration={1000} />}</span>
    </span>
  );
}

export function Tier({ t }) {
  if (!t) return null;
  return <span className={`tier tier-${t}`}>{tt(t === "Med-High" ? "Med-high" : t)}</span>;
}

export function Form({ form }) {
  if (!form) return null;
  return <span className="form">{form.slice(-5).split("").map((c, i) => <i key={i} className={c}>{c}</i>)}</span>;
}

export function TriBar({ h, d, a, labels }) {
  const total = (h || 0) + (d || 0) + (a || 0) || 1;
  return (
    <div>
      <div className="tri">
        <i className="h" style={{ width: `${(h / total) * 100}%` }} />
        {d ? <i className="d" style={{ width: `${(d / total) * 100}%` }} /> : null}
        <i className="a" style={{ width: `${(a / total) * 100}%` }} />
      </div>
      <div className="tri-legend">
        <span><b>{pct(h)}</b>{labels?.[0]}</span>
        {d ? <span><b>{pct(d)}</b>{tt("Draw")}</span> : null}
        <span><b>{pct(a)}</b>{labels?.[1]}</span>
      </div>
    </div>
  );
}

// Re-render every 15 s (live minutes keep ticking between data refreshes). One shared timer
// for the whole page, however many live rows there are.
const tickers = new Set();
let tickTimer = null;
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const fn = () => setNow(Date.now());
    tickers.add(fn);
    if (!tickTimer) tickTimer = setInterval(() => tickers.forEach((f) => f()), 15000);
    return () => { tickers.delete(fn); if (!tickers.size) { clearInterval(tickTimer); tickTimer = null; } };
  }, []);
  return now;
}

// Live clock label: HT, 45+2', 67'… For football the minute keeps counting from the last update
// (`_at`) so it never looks frozen; other sports show the feed's own detail (Q3 5:12, 2nd…).
export function liveLabel(ev, now = Date.now()) {
  const d = ev.detail || "";
  if (/^HT$|half ?time/i.test(d)) return tt("HT");
  if (ev.sport !== "soccer" || !ev.minute) return d || tt("LIVE");
  if (/pen|shootout|break|end of/i.test(d)) return d;
  const cap = ev.period >= 4 ? 120 : ev.period === 3 ? 105 : ev.period === 2 ? 90 : 45;
  if (ev.minute > cap) return `${cap}+${ev.minute - cap}'`;
  const m = ev.minute + (ev._at ? Math.max(0, Math.floor((now - ev._at) / 60000)) : 0);
  return m > cap ? `${cap}+'` : `${m}'`;
}

function LivePill({ ev }) {
  const now = useNow();
  return <span className="pill live">{liveLabel(ev, now)}</span>;
}

export function StatusPill({ ev }) {
  if (ev.postponed) return <span className="pill amber">{tt("PPD")}</span>;
  if (ev.state === "in") return <LivePill ev={ev} />;
  if (ev.state === "post") return <span className="pill ft">{/^FT$/i.test(ev.detail || "") || !ev.detail ? tt("FT") : ev.detail}</span>;
  return <span className="pill">{localTime(ev.date)}</span>;
}

export function Skeleton({ rows = 4, h = 76 }) {
  return Array.from({ length: rows }).map((_, i) => <div key={i} className="shimmer skel" style={{ height: h, animationDelay: `${i * 80}ms` }} />);
}
