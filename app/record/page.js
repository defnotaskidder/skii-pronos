"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useT } from "../components/Lang";
import { LeagueFlag, Skeleton, TeamLogo, Tier, dayLabel, localTime, odds2, pct } from "../components/ui";
import { CountUp } from "../components/Motion";
import { LEAGUE_BY_ID, SPORT_LABEL } from "../../lib/leagues";

// learned league status → label, pill colour, explanation
const STATUS = {
  strong: ["Strong", "green", "Picks here win more often than the engine expected"],
  neutral: ["Neutral", "", "In line with what the engine expected"],
  weak: ["Weak", "red", "Picks here win less often than the engine expected"],
  learning: ["Learning", "violet", "Fewer than 8 results so far"],
};
const SPORTS = ["soccer", "basketball", "hockey", "football", "baseball"];
const GREEN = "#86efac", RED = "#fda4af";
const signed = (x, d = 0) => `${x >= 0 ? "+" : ""}${Number(x).toFixed(d)}`;
const roiText = (roi) => (roi === null || roi === undefined ? "–" : `${signed(roi * 100)}%`);
const leagueName = (id) => LEAGUE_BY_ID[id]?.name || id;
const sportOf = (l) => l.sport || LEAGUE_BY_ID[l.league]?.sport || "soccer";
const norm = (s) => (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function Record() {
  const { t, locale } = useT();
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState("priced"); // real bookmaker prices only, or every pick
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);
  const [openLeague, setOpenLeague] = useState(null); // league whose picks are shown in the drawer
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
  const pricedOn = mode === "priced" && !!d?.priced;
  const cur = pricedOn ? d.priced : all;
  const mo = d?.modelOnly;
  const calib = pricedOn ? d.calibration?.classes?.priced || d.calibration : d?.calibration;
  return (
    <>
      <Top title={t("The engine's record")} sub={t("Every pick saved before kick-off, graded at full time. Nothing hidden.")}>
        <button className="tile-btn" aria-label={t("Share this page")} onClick={share}><Icon name={copied ? "check" : "send"} /></button>
      </Top>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="seg">{[7, 30, 90].map((n) => <button key={n} className={days === n ? "on" : ""} onClick={() => setDays(n)}>{t("{n} days", { n })}</button>)}</div>
        <span className="spacer" />
        <div className="seg">
          {[["priced", "Priced picks", "Picks with a real bookmaker price: what you can actually bet", d?.priced?.n], ["all", "All picks", "Includes model-only picks without a bookmaker price", all?.n]].map(([k, l, tip, n]) => (
            <button key={k} className={mode === k ? "on grad" : ""} title={t(tip)} onClick={() => setMode(k)}>{t(l)}{n ? <span className="n">{n}</span> : null}</button>
          ))}
        </div>
      </div>
      {!d ? <Skeleton rows={4} h={90} /> : !d.db ? (
        <div className="empty"><Icon name="trophy" />{t("The game history needs the database.")}</div>
      ) : !all?.n ? (
        <div className="empty"><Icon name="trophy" />{t("The record starts filling from the first graded games. Come back after tonight's matches.")}</div>
      ) : (
        <>
          <div className="grid g-4 stagger" style={{ marginBottom: mo?.n ? 10 : 18 }}>
            <div className="card tight stat"><span className="stat-ico cyan"><Icon name="target" /></span><span className="big num">{cur.n ? <CountUp value={cur.rate * 100} suffix="%" /> : "—"}</span><span className="lbl">{t("Engine hit rate · {n} games", { n: cur.n })}</span></div>
            <div className="card tight stat"><span className="stat-ico"><Icon name="trend" /></span><span className="big num" style={{ color: cur.units >= 0 ? GREEN : RED }}><CountUp value={cur.units} decimals={1} prefix={cur.units >= 0 ? "+" : ""} /><small>u</small></span><span className="lbl">{t("Flat 1u at the pick odds")}</span></div>
            <div className="card tight stat"><span className="stat-ico green"><Icon name="chart" /></span><span className="big num"><CountUp value={(cur.roi || 0) * 100} prefix={(cur.roi || 0) >= 0 ? "+" : ""} /><small>%</small></span><span className="lbl">{t("ROI per leg")}</span></div>
            <div className="card tight stat"><span className="stat-ico"><Icon name="bolt" /></span><span className="big num"><CountUp value={pricedOn ? d.streakPriced ?? d.streak : d.streak} /></span><span className="lbl">{t("Winning streak")}</span></div>
          </div>
          {mo?.n > 0 && <p className="note" style={{ margin: "0 0 18px" }}>{t("Model-only picks have no bookmaker price (≈ odds), so they can't be bet at that price: {w}/{n} won, {u}u. Only “All picks” counts them.", { w: mo.w, n: mo.n, u: signed(mo.units, 1) })}</p>}

          <section className="card" style={{ marginBottom: 18 }} data-reveal>
            <Head title={t("Where the model is strongest")} sub={`${t(STATUS.strong[2])} · ${t("Tap a league to see its picks")}`} />
            {d.best?.length ? (
              <div className="grid g-3" style={{ gap: 12 }}>{d.best.map((l) => <LeagueCard key={l.league} l={l} onOpen={setOpenLeague} />)}</div>
            ) : (
              <div className="empty" style={{ padding: 24 }}><Icon name="sparkles" />{t("Still learning — a league needs 8+ results and a clear edge to stand out.")}</div>
            )}
          </section>

          {d.weak?.length > 0 && (
            <section className="card" style={{ marginBottom: 18, borderColor: "rgba(244,63,94,.22)" }} data-reveal>
              <Head title={t("Leagues to avoid")} sub={t(STATUS.weak[2])} />
              <div className="grid g-3" style={{ gap: 12 }}>{d.weak.map((l) => <LeagueCard key={l.league} l={l} weak onOpen={setOpenLeague} />)}</div>
              <p className="note" style={{ margin: "12px 0 0" }}>{t("Weak leagues are left out of the coupon du jour.")}</p>
            </section>
          )}

          <section className="card" style={{ marginBottom: 18 }} data-reveal>
            <Head title={t("Profit curve")} sub={`${t("Cumulative units at flat 1u stakes")}${pricedOn ? ` · ${t("Priced picks")}` : ""}`} />
            <ProfitChart curve={pricedOn ? d.curvePriced || d.curve : d.curve} locale={locale} />
          </section>

          <div className="grid g-2" style={{ marginBottom: 18 }} data-reveal>
            <section className="card">
              <div className="card-head"><h3>{t("By confidence")}</h3></div>
              {Object.entries((pricedOn && d.byTierPriced) || d.byTier).filter(([, v]) => v.n).map(([tier, v]) => (
                <div key={tier} style={{ marginBottom: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><Tier t={tier} /><span className="muted" style={{ fontSize: 12.5 }}>{t("{w}/{n} · avg @{o} · ", { w: v.w, n: v.n, o: odds2(v.avgOdds) })}<b style={{ color: v.units >= 0 ? GREEN : RED }}>{v.units >= 0 ? "+" : ""}{v.units}u</b></span></div>
                  <div className="bar"><i style={{ width: `${(v.rate || 0) * 100}%` }} /></div>
                </div>
              ))}
              <div className="divider" />
              <div className="kv"><span>{t("Coupons du jour won")}</span><b>{d.daily.safe.n ? `${d.daily.safe.w}/${d.daily.safe.n} · ${d.daily.safe.units >= 0 ? "+" : ""}${d.daily.safe.units}u` : "—"}</b></div>
              <div className="kv"><span>{t("Grosses cotes won")}</span><b>{d.daily.grosse.n ? `${d.daily.grosse.w}/${d.daily.grosse.n} · ${d.daily.grosse.units >= 0 ? "+" : ""}${d.daily.grosse.units}u` : "—"}</b></div>
              {d.daily.special?.n > 0 && <div className="kv"><span>{t("Special nights won")}</span><b>{`${d.daily.special.w}/${d.daily.special.n} · ${d.daily.special.units >= 0 ? "+" : ""}${d.daily.special.units}u`}</b></div>}
              {d.clv?.n > 0 && (
                <>
                  <div className="kv" title={t("Pick odds vs the bookmaker's closing odds on the same market. Positive = our price was better than the close: the sign of an edge that holds over the long run.")}>
                    <span>{t("Closing line value")}</span>
                    <b style={{ color: d.clv.avg >= 0 ? GREEN : RED }}>{signed(d.clv.avg * 100, 1)}% · {t("beat the close {w}/{n}", { w: d.clv.beat, n: d.clv.n })}</b>
                  </div>
                  <p className="note" style={{ margin: "8px 0 0" }}>{t("Pick odds vs the bookmaker's closing odds on the same market. Positive = our price was better than the close: the sign of an edge that holds over the long run.")}</p>
                </>
              )}
            </section>
            <section className="card">
              <Head h="h3" title={t("Calibration")} sub={t("What the engine said vs what happened")} />
              <CalibrationChart calib={calib} need={calib === d.calibration ? 150 : 100} t={t} />
            </section>
          </div>

          {d.leagues?.length > 0 && <LeagueTable leagues={d.leagues} onOpen={setOpenLeague} />}
        </>
      )}
      {openLeague && <LeagueDrawer league={openLeague} days={days} onClose={() => setOpenLeague(null)} />}
    </>
  );
}

// Section title with its explanation underneath (side by side gets cramped on phones).
function Head({ title, sub, h: H = "h2" }) {
  return <div className="card-head"><div style={{ minWidth: 0 }}><H>{title}</H>{sub && <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{sub}</div>}</div></div>;
}

function SkillPill({ s }) {
  const { t } = useT();
  const [label, cls, tip] = STATUS[s] || STATUS.learning;
  return <span className={`pill ${cls}`} title={t(tip)}>{t(label)}</span>;
}

// "Aujourd'hui" → "aujourd'hui" mid-sentence (French dates are lowercase anyway; English only for relative days).
function useDayWord() {
  const { lang } = useT();
  return (iso) => { const s = dayLabel(iso); return lang === "fr" || /^(Today|Tomorrow|Yesterday)$/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; };
}

// A league where the engine is clearly better (or worse) than it expects: record, hit rate vs
// expected, how sure we are it's not luck, and the learned shift applied to its probabilities.
function LeagueCard({ l, weak, onOpen }) {
  const { t } = useT();
  const m = LEAGUE_BY_ID[l.league];
  const conf = weak ? 1 - (l.pPos ?? 0.5) : l.pPos ?? 0.5;
  const pts = Math.round((l.edge || 0) * 100);
  const tone = weak ? RED : GREEN;
  return (
    <button type="button" className="card flat tight league-card" onClick={() => onOpen?.(l)} title={t("Tap a league to see its picks")} style={{ background: weak ? "rgba(244,63,94,.06)" : "rgba(34,197,94,.05)", borderColor: weak ? "rgba(244,63,94,.25)" : "rgba(34,197,94,.22)" }}>
      <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
        <LeagueFlag league={m} size={14} />
        <b style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leagueName(l.league)}</b>
        <SkillPill s={l.status} />
      </div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", margin: "10px 0" }}>
        <span className="num" style={{ fontSize: 28, fontWeight: 750, letterSpacing: "-.02em", lineHeight: 1, color: tone }}>{l.w}/{l.n}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>{t("Hit {a} · expected {b}", { a: pct(l.rate), b: pct(l.expRate) })}</span>
      </div>
      <div className="row" style={{ justifyContent: "space-between", fontSize: 12, marginBottom: 5 }} title={t(weak ? "Chance the engine really does worse here than it expects, not just bad luck" : "Chance the engine really does better here than it expects, not just luck")}>
        <span className="muted">{t("Confidence")}</span><b className="num">{pct(conf)}</b>
      </div>
      <div className="bar"><i style={{ width: `${conf * 100}%`, background: weak ? "linear-gradient(90deg, #f5b03b, #f43f5e)" : undefined }} /></div>
      <div className="row" style={{ gap: 6, marginTop: 10 }}>
        <span className={`pill ${weak ? "red" : "green"}`} title={t("What the engine learned about this league: its chances here are shifted by this much. Kept small until there are more results.")}>{t("Learned shift {x} pts", { x: signed(pts) })}</span>
        {l.priced?.n > 0 && <span className="pill">{t("Priced ROI {x}", { x: roiText(l.priced.roi) })}</span>}
        {l.pending > 0 && <span className="pill cyan">{t("{n} upcoming", { n: l.pending })}</span>}
      </div>
    </button>
  );
}

// Every league with results or upcoming picks: search, sport chips, status, record, priced ROI.
function LeagueTable({ leagues, onOpen }) {
  const { t } = useT();
  const dayWord = useDayWord();
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("all");
  const [shown, setShown] = useState(25);
  const sports = SPORTS.map((s) => [s, leagues.filter((l) => sportOf(l) === s).length]).filter(([, n]) => n);
  const nq = norm(q.trim());
  const list = leagues.filter((l) => (sport === "all" || sportOf(l) === sport)
    && (!nq || [LEAGUE_BY_ID[l.league]?.name, LEAGUE_BY_ID[l.league]?.short, l.league].some((x) => norm(x).includes(nq))));
  const upcoming = leagues.filter((l) => l.pending > 0).length;
  const pick = (fn) => (v) => { fn(v); setShown(25); };
  return (
    <section className="card" data-reveal>
      <Head title={t("All leagues")} sub={`${t("{n} leagues · {m} with upcoming picks", { n: leagues.length, m: upcoming })} · ${t("Tap a league to see its picks")}`} />
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="search" style={{ flex: "1 1 220px", maxWidth: 340 }}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => pick(setQ)(e.target.value)} placeholder={t("Search a league")} aria-label={t("Search")} />
          {q && <button aria-label={t("Clear search")} onClick={() => pick(setQ)("")}><Icon name="x" size={15} /></button>}
        </div>
        {sports.length > 1 && (
          <div className="chips" style={{ flex: "1 1 auto", minWidth: 0 }}>
            {[["all", "All", leagues.length], ...sports.map(([s, n]) => [s, SPORT_LABEL[s] || s, n])].map(([k, l, n]) => (
              <button key={k} className={`chip ${sport === k ? "on" : ""}`} onClick={() => pick(setSport)(k)}>{t(l)}<span className="n">{n}</span></button>
            ))}
          </div>
        )}
      </div>
      {!list.length ? <div className="empty" style={{ padding: 24 }}>{t("No league matches.")}</div> : list.slice(0, shown).map((l) => {
        const info = [];
        if (l.n && l.expRate !== null) info.push(t("expected {x}", { x: pct(l.expRate) }));
        if (l.priced?.n) info.push(t("Priced ROI {x}", { x: roiText(l.priced.roi) }));
        if (l.pending) info.push(t("{n} upcoming", { n: l.pending }));
        if (l.next) info.push(l.n ? t("from {when}", { when: `${dayWord(l.next)} ${localTime(l.next)}` }) : t("first results {date}", { date: dayWord(l.next) }));
        const color = l.status === "strong" ? GREEN : l.status === "weak" ? RED : "var(--text)";
        return (
          <button type="button" key={l.league} className="league-row" onClick={() => onOpen?.(l)} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <LeagueFlag league={LEAGUE_BY_ID[l.league]} size={13} />
                <b style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leagueName(l.league)}</b>
              </div>
              <div className="row muted" style={{ gap: 6, fontSize: 12, marginTop: 4 }}><SkillPill s={l.status} />{info.length > 0 && <span>{info.join(" · ")}</span>}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <b className="num" style={{ fontSize: 15, color }}>{l.n ? pct(l.rate) : "—"}</b>
              {l.n > 0 && <div className="dim num" style={{ fontSize: 11.5 }}>{l.w}/{l.n}</div>}
            </div>
          </button>
        );
      })}
      {list.length > shown && <button className="btn soft block" style={{ marginTop: 12 }} onClick={() => setShown((n) => n + 50)}>{t("Show more ({n} left)", { n: list.length - shown })}</button>}
    </section>
  );
}

// The picks behind one league: won / lost / void with scores, and the upcoming ones.
function LeagueDrawer({ league: l, days, onClose }) {
  const { t } = useT();
  const [d, setD] = useState(null);
  const [f, setF] = useState("all");
  useEffect(() => {
    let alive = true;
    setD(null);
    fetch(`/api/record/league?id=${encodeURIComponent(l.league)}&days=${days}`).then((r) => r.json()).then((x) => alive && setD(x)).catch(() => alive && setD({ picks: [] }));
    return () => { alive = false; };
  }, [l.league, days]);
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = ""; };
  }, [onClose]);
  const picks = d?.picks || [];
  const graded = picks.filter((p) => p.result);
  const upcoming = picks.filter((p) => !p.result).sort((a, b) => new Date(a.date) - new Date(b.date));
  const won = graded.filter((p) => p.result === "W").length, lost = graded.filter((p) => p.result === "L").length;
  const units = graded.reduce((a, p) => a + (p.result === "W" ? p.odds - 1 : p.result === "L" ? -1 : 0), 0);
  const list = f === "all" ? graded : graded.filter((p) => p.result === (f === "won" ? "W" : "L"));
  const m = LEAGUE_BY_ID[l.league];
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer league-drawer" role="dialog" aria-label={leagueName(l.league)}>
        <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
          <LeagueFlag league={m} size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 17, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leagueName(l.league)}</b>
            <span className="row muted" style={{ fontSize: 12.5, gap: 6 }}>{t("{n} days", { n: days })}<SkillPill s={l.status} /></span>
          </div>
          <button className="icon-btn" aria-label={t("Close")} onClick={onClose}><Icon name="x" /></button>
        </div>
        {!d ? <div style={{ marginTop: 14 }}><Skeleton rows={5} h={62} /></div> : (
          <>
            <div className="grid g-3 stagger" style={{ gap: 8, margin: "14px 0 12px" }}>
              {[[t("Won"), won, GREEN], [t("Lost"), lost, RED], [t("Units"), `${signed(units, 1)}u`, units >= 0 ? GREEN : RED]].map(([k, v, c]) => (
                <div key={k} className="card flat tight" style={{ padding: "10px 12px" }}><span className="dim" style={{ fontSize: 11.5 }}>{k}</span><div className="num" style={{ fontSize: 22, fontWeight: 750, letterSpacing: "-.02em", color: c }}>{v}</div></div>
              ))}
            </div>
            <div className="seg" style={{ alignSelf: "flex-start" }}>
              {[["all", "All", graded.length], ["won", "Won", won], ["lost", "Lost", lost]].map(([k, lab, n]) => (
                <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{t(lab)}<span className="n">{n}</span></button>
              ))}
            </div>
            <div className="legs-scroll">
              {list.length ? list.map((p) => <PickRow key={p.id} p={p} league={l.league} />) : <div className="empty" style={{ padding: 22, marginTop: 10 }}>{t("No results in this window yet.")}</div>}
              {upcoming.length > 0 && (
                <>
                  <div className="nav-label" style={{ margin: "16px 0 10px" }}>{t("Upcoming")} · {upcoming.length}</div>
                  {upcoming.map((p) => <PickRow key={p.id} p={p} league={l.league} />)}
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function PickRow({ p, league }) {
  const { tm } = useT();
  const r = p.result;
  const scored = p.hs !== null && p.hs !== undefined && p.as !== null && p.as !== undefined;
  return (
    <Link href={`/match/${league}/${p.id}`} className="pick-row">
      <span className={`result-badge sm r-${r || "P"}`}>{r === "W" ? "✓" : r === "L" ? "✗" : r === "V" ? "V" : "…"}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="row" style={{ gap: 6, flexWrap: "nowrap", fontWeight: 600, fontSize: 13.5 }}>
          <TeamLogo team={{ logo: p.homeLogo, short: p.home }} size={16} /><span className="ell">{p.home}</span>
          <span className="dim">–</span>
          <TeamLogo team={{ logo: p.awayLogo, short: p.away }} size={16} /><span className="ell">{p.away}</span>
          {scored && <b className="num" style={{ marginLeft: "auto", flex: "none" }}>{p.hs}-{p.as}</b>}
        </span>
        <span className="muted" style={{ fontSize: 12, display: "block", marginTop: 2 }}>{tm(p.label)} {p.estimated ? "≈" : "@"} {odds2(p.odds)} · {dayLabel(p.date)} {localTime(p.date)}</span>
      </span>
    </Link>
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
  useEffect(() => setHover(null), [curve]);
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
        <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff6b6b" stopOpacity=".35" /><stop offset="1" stopColor="#ff6b6b" stopOpacity="0" /></linearGradient></defs>
        {ticks.map((y, i) => <line key={i} x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="rgba(255,255,255,.06)" />)}
        {ticks.map((y, i) => <text key={i} x={P.l - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#a1a1aa">{(maxY - (i / 4) * (maxY - minY)).toFixed(0)}u</text>)}
        <line x1={P.l} x2={W - P.r} y1={pts[0].y0} y2={pts[0].y0} stroke="rgba(255,255,255,.18)" strokeDasharray="3 4" />
        <path d={area} fill="url(#pf)" />
        <path d={line} fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {[pts[0], pts[pts.length - 1]].map((p, i) => <text key={i} x={p.x} y={H - 8} textAnchor={i ? "end" : "start"} fontSize="11" fill="#a1a1aa">{new Date(p.day + "T12:00:00Z").toLocaleDateString(locale, { day: "numeric", month: "short" })}</text>)}
        {h && (<>
          <line x1={h.x} x2={h.x} y1={P.t} y2={H - P.b} stroke="rgba(255,255,255,.25)" />
          <circle cx={h.x} cy={h.y} r="5" fill="#ff6b6b" stroke="#1c1c20" strokeWidth="2" />
        </>)}
      </svg>
      {h && (
        <div className="card flat tight" style={{ position: "absolute", top: 6, left: `${Math.min(80, Math.max(0, (h.x / W) * 100))}%`, transform: "translateX(-20%)", pointerEvents: "none", fontSize: 12.5, padding: "8px 10px" }}>
          <b>{new Date(h.day + "T12:00:00Z").toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}</b>
          <div className="muted">{h.w}/{h.n} · {h.units >= 0 ? "+" : ""}{h.units}u · <b style={{ color: h.cum >= 0 ? GREEN : RED }}>{h.cum >= 0 ? "+" : ""}{h.cum}u</b></div>
        </div>
      )}
    </div>
  );
}

// Predicted chance (hollow marker) vs actual hit rate (bar) per bucket; n under each.
function CalibrationChart({ calib, need = 150, t }) {
  const b = (calib?.buckets || []).filter((x) => x.n > 0);
  if (!b.length) return <div className="muted">{t("The record starts filling from the first graded games. Come back after tonight's matches.")}</div>;
  return (
    <div>
      {b.map((x) => (
        <div key={x.lo} style={{ marginBottom: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span className="muted">{Math.round(x.lo * 100)}–{Math.round(x.hi * 100)}% · {x.n} {t("games")}</span>
            <span><span className="muted">{t("Predicted")} {pct(x.predicted)}</span> · <b style={{ color: x.actual >= x.predicted - 0.03 ? GREEN : RED }}>{t("Actual")} {pct(x.actual)}</b></span>
          </div>
          <div className="bar" style={{ position: "relative" }}>
            <i style={{ width: `${x.actual * 100}%` }} />
            <span style={{ position: "absolute", left: `${x.predicted * 100}%`, top: -3, width: 2, height: 14, background: "#fff", borderRadius: 2, transform: "translateX(-1px)" }} />
          </div>
        </div>
      ))}
      <p className="note" style={{ marginBottom: 0 }}>{calib.ready ? "✓ " : ""}{calib.total} {t("games")}{calib.ready ? "" : ` · ${t("Calibration")} ≥ ${need}`}</p>
    </div>
  );
}
