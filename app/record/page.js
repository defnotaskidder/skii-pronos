"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useT } from "../components/Lang";
import { LeagueFlag, Skeleton, Tier, odds2, pct } from "../components/ui";
import { CountUp } from "../components/Motion";
import { LEAGUE_BY_ID } from "../../lib/leagues";

export default function Record() {
  const { t, locale } = useT();
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    setD(null);
    fetch(`/api/record?days=${days}`).then((r) => r.json()).then((x) => alive && setD(x)).catch(() => alive && setD({ error: true }));
    return () => { alive = false; };
  }, [days]);
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: "Skii Pronos", url: location.href }); else { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } } catch { /* cancelled */ }
  };
  const all = d?.all;
  return (
    <>
      <Top title={t("The engine's record")} sub={t("Every pick saved before kick-off, graded at full time. Nothing hidden.")}>
        <button className="tile-btn" aria-label={t("Share this page")} onClick={share}><Icon name={copied ? "check" : "send"} /></button>
      </Top>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="seg">{[7, 30, 90].map((n) => <button key={n} className={days === n ? "on" : ""} onClick={() => setDays(n)}>{t("Last {n} days", { n })}</button>)}</div>
      </div>
      {!d ? <Skeleton rows={4} h={90} /> : !d.db ? (
        <div className="empty"><Icon name="trophy" />{t("The game history needs the database.")}</div>
      ) : !all?.n ? (
        <div className="empty"><Icon name="trophy" />{t("The record starts filling from the first graded games. Come back after tonight's matches.")}</div>
      ) : (
        <>
          <div className="grid g-4 stagger" style={{ marginBottom: 18 }}>
            <div className="card tight stat"><span className="stat-ico cyan"><Icon name="target" /></span><span className="big num"><CountUp value={all.rate * 100} suffix="%" /></span><span className="lbl">{t("Engine hit rate · {n} games", { n: all.n })}</span></div>
            <div className="card tight stat"><span className="stat-ico"><Icon name="trend" /></span><span className="big num" style={{ color: all.units >= 0 ? "#86efac" : "#fda4af" }}><CountUp value={all.units} decimals={1} prefix={all.units >= 0 ? "+" : ""} /><small>u</small></span><span className="lbl">{t("Flat 1u at the pick odds")}</span></div>
            <div className="card tight stat"><span className="stat-ico green"><Icon name="chart" /></span><span className="big num"><CountUp value={(all.roi || 0) * 100} prefix={(all.roi || 0) >= 0 ? "+" : ""} /><small>%</small></span><span className="lbl">{t("ROI per leg")}</span></div>
            <div className="card tight stat"><span className="stat-ico"><Icon name="bolt" /></span><span className="big num"><CountUp value={d.streak} /></span><span className="lbl">{t("Won")} · streak</span></div>
          </div>

          <section className="card" style={{ marginBottom: 18 }} data-reveal>
            <div className="card-head"><h2>{t("Profit curve")}</h2><span className="link muted">{t("Cumulative units at flat 1u stakes")}</span></div>
            <ProfitChart curve={d.curve} locale={locale} />
          </section>

          <div className="grid g-2" style={{ marginBottom: 18 }} data-reveal>
            <section className="card">
              <div className="card-head"><h3>{t("By confidence")}</h3></div>
              {Object.entries(d.byTier).filter(([, v]) => v.n).map(([tier, v]) => (
                <div key={tier} style={{ marginBottom: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><Tier t={tier} /><span className="muted" style={{ fontSize: 12.5 }}>{t("{w}/{n} · avg @{o} · ", { w: v.w, n: v.n, o: odds2(v.avgOdds) })}<b style={{ color: v.units >= 0 ? "#86efac" : "#fda4af" }}>{v.units >= 0 ? "+" : ""}{v.units}u</b></span></div>
                  <div className="bar"><i style={{ width: `${(v.rate || 0) * 100}%` }} /></div>
                </div>
              ))}
              <div className="divider" />
              <div className="kv"><span>{t("Coupons du jour won")}</span><b>{d.daily.safe.n ? `${d.daily.safe.w}/${d.daily.safe.n} · ${d.daily.safe.units >= 0 ? "+" : ""}${d.daily.safe.units}u` : "—"}</b></div>
              <div className="kv"><span>{t("Grosses cotes won")}</span><b>{d.daily.grosse.n ? `${d.daily.grosse.w}/${d.daily.grosse.n} · ${d.daily.grosse.units >= 0 ? "+" : ""}${d.daily.grosse.units}u` : "—"}</b></div>
            </section>
            <section className="card">
              <div className="card-head"><h3>{t("Calibration")}</h3><span className="link muted">{t("What the engine said vs what happened")}</span></div>
              <CalibrationChart calib={d.calibration} t={t} />
            </section>
          </div>

          {d.leagues.length > 0 && (
            <section className="card" data-reveal>
              <div className="card-head"><h3>{t("By league")}</h3></div>
              <div className="grid g-2" style={{ gap: 4 }}>
                {d.leagues.map((l) => (
                  <div key={l.league} className="kv" style={{ alignItems: "center" }}>
                    <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}><LeagueFlag league={LEAGUE_BY_ID[l.league]} size={13} />{LEAGUE_BY_ID[l.league]?.name || l.league}</span>
                    <b>{pct(l.rate)} <span className="muted" style={{ fontWeight: 500 }}>({l.w}/{l.n}) · {l.units >= 0 ? "+" : ""}{l.units}u</span></b>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

// One series, 2px line + soft area, crosshair tooltip on hover, text in text tokens.
function ProfitChart({ curve, locale }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 220, P = { l: 44, r: 12, t: 14, b: 28 };
  const pts = useMemo(() => {
    if (!curve?.length) return [];
    const xs = curve.map((_, i) => i), ys = curve.map((c) => c.cum);
    const minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys) || 1;
    const x = (i) => P.l + (xs.length > 1 ? (i / (xs.length - 1)) * (W - P.l - P.r) : (W - P.l - P.r) / 2);
    const y = (v) => P.t + (1 - (v - minY) / (maxY - minY || 1)) * (H - P.t - P.b);
    return curve.map((c, i) => ({ ...c, x: x(i), y: y(c.cum), y0: y(0) }));
  }, [curve]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pts.length) return <div className="empty">—</div>;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${pts[0].y0.toFixed(1)} L${pts[0].x.toFixed(1)},${pts[0].y0.toFixed(1)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => P.t + f * (H - P.t - P.b));
  const minY = Math.min(0, ...pts.map((p) => p.cum)), maxY = Math.max(0, ...pts.map((p) => p.cum)) || 1;
  const h = hover !== null ? pts[hover] : null;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - px) < Math.abs(pts[best].x - px)) best = i;
    setHover(best);
  };
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchMove={(e) => onMove(e.touches[0] ? { currentTarget: e.currentTarget, clientX: e.touches[0].clientX } : e)} role="img" aria-label="Cumulative profit">
        <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a855f7" stopOpacity=".35" /><stop offset="1" stopColor="#a855f7" stopOpacity="0" /></linearGradient></defs>
        {ticks.map((y, i) => <line key={i} x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="rgba(255,255,255,.06)" />)}
        {ticks.map((y, i) => <text key={i} x={P.l - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#9097b3">{(maxY - (i / 4) * (maxY - minY)).toFixed(0)}u</text>)}
        <line x1={P.l} x2={W - P.r} y1={pts[0].y0} y2={pts[0].y0} stroke="rgba(255,255,255,.18)" strokeDasharray="3 4" />
        <path d={area} fill="url(#pf)" />
        <path d={line} fill="none" stroke="#a855f7" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {[pts[0], pts[pts.length - 1]].map((p, i) => <text key={i} x={p.x} y={H - 8} textAnchor={i ? "end" : "start"} fontSize="11" fill="#9097b3">{new Date(p.day + "T12:00:00Z").toLocaleDateString(locale, { day: "numeric", month: "short" })}</text>)}
        {h && (<>
          <line x1={h.x} x2={h.x} y1={P.t} y2={H - P.b} stroke="rgba(255,255,255,.25)" />
          <circle cx={h.x} cy={h.y} r="5" fill="#a855f7" stroke="#12152a" strokeWidth="2" />
        </>)}
      </svg>
      {h && (
        <div className="card flat tight" style={{ position: "absolute", top: 6, left: `${Math.min(80, Math.max(0, (h.x / W) * 100))}%`, transform: "translateX(-20%)", pointerEvents: "none", fontSize: 12.5, padding: "8px 10px" }}>
          <b>{new Date(h.day + "T12:00:00Z").toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}</b>
          <div className="muted">{h.w}/{h.n} · {h.units >= 0 ? "+" : ""}{h.units}u · <b style={{ color: h.cum >= 0 ? "#86efac" : "#fda4af" }}>{h.cum >= 0 ? "+" : ""}{h.cum}u</b></div>
        </div>
      )}
    </div>
  );
}

// Predicted chance (hollow marker) vs actual hit rate (bar) per bucket; n under each.
function CalibrationChart({ calib, t }) {
  const b = (calib?.buckets || []).filter((x) => x.n > 0);
  if (!b.length) return <div className="muted">{t("The record starts filling from the first graded games. Come back after tonight's matches.")}</div>;
  return (
    <div>
      {b.map((x) => (
        <div key={x.lo} style={{ marginBottom: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span className="muted">{Math.round(x.lo * 100)}–{Math.round(x.hi * 100)}% · {x.n} {t("games")}</span>
            <span><span className="muted">{t("Predicted")} {pct(x.predicted)}</span> · <b style={{ color: x.actual >= x.predicted - 0.03 ? "#86efac" : "#fda4af" }}>{t("Actual")} {pct(x.actual)}</b></span>
          </div>
          <div className="bar" style={{ position: "relative" }}>
            <i style={{ width: `${x.actual * 100}%` }} />
            <span style={{ position: "absolute", left: `${x.predicted * 100}%`, top: -3, width: 2, height: 14, background: "#fff", borderRadius: 2, transform: "translateX(-1px)" }} />
          </div>
        </div>
      ))}
      <p className="note" style={{ marginBottom: 0 }}>{calib.ready ? "✓ " : ""}{calib.total} {t("games")}{calib.ready ? "" : ` · ${t("Calibration")} ≥ 150`}</p>
    </div>
  );
}
