"use client";
// Live coupons from the games in play: the engine's best one for a target, or the visitor's own,
// built leg by leg from each game's live markets. Prices are re-computed every 30 seconds from the
// score and the clock; none is a bookmaker's (no free feed carries in-play odds).
import { useEffect, useMemo, useState } from "react";
import Icon from "./Icons";
import { useT } from "./Lang";
import { useTrack } from "./Providers";
import { CouponActions, CouponCard, chanceText } from "./Coupon";
import { LeagueFlag, Skeleton, TeamLogo, odds2 } from "./ui";
import { couponText, hitChance, product } from "../../lib/coupon-lite";
import { LEAGUE_BY_ID } from "../../lib/leagues";

const TARGETS = [[2, "Safe"], [5, "x5"], [10, "x10"], [20, "x20"], [50, "x50"], [100, "x100"]];
const clock = (g) => (g.sport === "soccer" ? (/^HT$|half/i.test(g.detail) ? "HT" : g.minute ? `${g.minute}'` : g.detail) : g.detail) || "LIVE";

export default function LiveCoupon({ compact = false }) {
  const { t, lang } = useT();
  const [tab, setTab] = useState("best");
  const [target, setTarget] = useState(compact ? 20 : 2);
  const [exclude, setExclude] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const withGames = tab === "mine";

  useEffect(() => {
    let alive = true, timer;
    const get = async () => {
      if (document.visibilityState === "hidden") { timer = setTimeout(get, 30e3); return; }
      try {
        const q = new URLSearchParams({ target: String(target) });
        if (exclude.length) q.set("exclude", exclude.join(","));
        if (withGames) q.set("games", "1");
        const d = await (await fetch(`/api/live-coupon?${q}`)).json();
        if (!alive) return;
        if (d.error) setErr(d.error); else { setData((cur) => ({ ...d, games: d.games || cur?.games })); setErr(""); }
      } catch { if (alive) setErr(t("Couldn't load the live coupon.")); }
      if (alive) timer = setTimeout(get, 30e3);
    };
    get();
    return () => { alive = false; clearTimeout(timer); };
  }, [target, exclude, withGames]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = data?.coupon;
  return (
    <section className="card live-coupon">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <span className="pill live">{t("LIVE")}</span><h3 style={{ flex: 1, minWidth: 0 }}>{t("Live coupon")}</h3>
        <div className="seg">
          <button className={tab === "best" ? "on grad" : ""} onClick={() => setTab("best")}><Icon name="sparkles" size={14} />{t("Best one")}</button>
          <button className={tab === "mine" ? "on grad" : ""} onClick={() => setTab("mine")}><Icon name="plus" size={14} />{t("Build mine")}</button>
        </div>
      </div>
      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}

      {tab === "best" ? (
        <>
          <div className="chips" style={{ margin: "4px 0 12px" }}>
            {TARGETS.map(([x, label]) => <button key={x} className={`chip ${target === x ? "on" : ""}`} onClick={() => { setTarget(x); setExclude([]); setData(null); }}>{x === 2 ? t(label) : label}</button>)}
          </div>
          {!c ? <Skeleton rows={3} h={56} /> : c.legs.length ? (
            <CouponCard coupon={c} title={target === 2 ? t("Safest live coupon") : t("Live x{t}", { t: target })} compact glow={false} icon="live"
              eyebrow={t("{n} games in play · refreshes every 30 s", { n: c.live }) + ` · ${chanceText(c.chance, lang)}`}
              sub={(c.reached === false ? t("The games in play can't reach x{t}: this is the closest build.", { t: target }) + " " : "") + t("Live prices are estimates (≈): no free feed carries in-play odds. Take a leg on 1xBet only at or above the shown odds — they move every minute.")}
              footer={<CouponActions coupon={c} title={t("Live coupon")} extra={<button className="btn ghost" onClick={() => { setExclude((x) => [...x, ...c.legs.map((l) => l.eventId)]); setData((cur) => (cur ? { ...cur, coupon: null } : cur)); }}><Icon name="refresh" />{t("Another combination")}</button>} />} />
          ) : (
            <div className="empty">
              {c.live ? t("The games in play can't build x{t} right now. Try a lower target.", { t: target }) : t("No game the engine follows is in play right now.")}
              {exclude.length > 0 && <div style={{ marginTop: 10 }}><button className="btn soft sm" onClick={() => { setExclude([]); setData(null); }}><Icon name="refresh" />{t("Start over")}</button></div>}
            </div>
          )}
        </>
      ) : <Builder games={data?.games} />}
    </section>
  );
}

// The visitor's own live coupon: one market per game, re-priced at every refresh.
function Builder({ games }) {
  const { t, tm, lang } = useT();
  const track = useTrack();
  const [picked, setPicked] = useState({}); // eventId → market key
  const [frozen, setFrozen] = useState({}); // eventId → last known leg, for a market that has closed since
  const [lg, setLg] = useState("all");
  const [copied, setCopied] = useState(false);
  const [tracked, setTracked] = useState(false);

  const byId = useMemo(() => new Map((games || []).map((g) => [g.eventId, g])), [games]);
  const legOf = (g, m) => ({ eventId: g.eventId, league: g.league, sport: g.sport, date: g.date, home: g.home, away: g.away, homeLogo: g.homeLogo, awayLogo: g.awayLogo,
    key: m.key, label: m.label, group: m.group, odds: m.odds, p: m.p, safe: m.p, estimated: true });
  // the selection at today's prices; a market that is no longer offered keeps its last price and is marked closed
  const legs = useMemo(() => Object.entries(picked).map(([id, key]) => {
    const g = byId.get(id), m = g?.markets.find((x) => x.key === key);
    return m ? { ...legOf(g, m), open: true, clock: clock(g), score: g.score } : frozen[id] ? { ...frozen[id], open: false } : null;
  }).filter(Boolean), [picked, byId, frozen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFrozen((f) => { const next = { ...f }; let changed = false; for (const l of legs) if (l.open && (next[l.eventId]?.odds !== l.odds || next[l.eventId]?.key !== l.key)) { next[l.eventId] = l; changed = true; } return changed ? next : f; }); }, [legs]);
  useEffect(() => { setTracked(false); }, [picked]);

  const leagues = useMemo(() => { const m = new Map(); for (const g of games || []) m.set(g.league, (m.get(g.league) || 0) + 1); return [...m.entries()].sort((a, b) => (LEAGUE_BY_ID[a[0]]?.tier ?? 9) - (LEAGUE_BY_ID[b[0]]?.tier ?? 9) || b[1] - a[1]); }, [games]);
  useEffect(() => { if (lg !== "all" && !leagues.some(([id]) => id === lg)) setLg("all"); }, [leagues, lg]);

  if (!games) return <Skeleton rows={4} h={64} />;
  if (!games.length) return <div className="empty">{t("No game the engine follows is in play right now.")}</div>;
  const toggle = (g, m) => setPicked((cur) => { const next = { ...cur }; if (next[g.eventId] === m.key) delete next[g.eventId]; else next[g.eventId] = m.key; return next; });
  const shown = lg === "all" ? games : games.filter((g) => g.league === lg);
  const coupon = { legs, odds: product(legs), chance: hitChance(legs) };
  const copy = async () => { try { await navigator.clipboard.writeText(couponText(coupon, t("Live coupon").toUpperCase(), lang, { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } };

  return (
    <>
      <p className="muted" style={{ fontSize: 12.5, margin: "2px 0 10px" }}>{t("Tap one bet per game. Prices are the engine's live estimates (≈) from the score and the clock: take a leg on 1xBet only at or above the shown odds.")}</p>
      <div className={`lc-slip ${legs.length ? "has" : ""}`}>
        {legs.length ? (
          <>
            <div className="lc-legs">
              {legs.map((l) => (
                <div key={l.eventId} className={`lc-leg ${l.open ? "" : "closed"}`}>
                  <span style={{ minWidth: 0 }}><b>{tm(l.label)}</b><small>{l.home} – {l.away}{l.open ? ` · ${l.clock} · ${l.score}` : ` · ${t("closed")}`}</small></span>
                  <b className="num">≈{odds2(l.odds)}</b>
                  <button className="icon-btn" aria-label={t("Remove")} onClick={() => setPicked((cur) => { const next = { ...cur }; delete next[l.eventId]; return next; })}><Icon name="x" size={14} /></button>
                </div>
              ))}
            </div>
            <div className="row" style={{ alignItems: "center", marginTop: 10 }}>
              <div><div className="eyebrow">{t("{n} legs", { n: legs.length })} · {chanceText(coupon.chance, lang)}</div><b className="num grad-text" style={{ fontSize: 24 }}>≈ x {odds2(coupon.odds)}</b></div>
              <span className="spacer" />
              <button className="btn primary" disabled={tracked} onClick={() => { track.track({ kind: "coupon", title: t("Live coupon"), legs: legs.map(({ open, clock: _c, score: _s, ...l }) => l) }); setTracked(true); }}>{/* eslint-disable-line no-unused-vars */}<Icon name={tracked ? "check" : "history"} />{tracked ? t("Tracking") : t("Track")}</button>
              <button className="btn ghost" onClick={copy}><Icon name="copy" />{copied ? t("Copied") : t("Copy for Telegram")}</button>
              <button className="btn ghost" onClick={() => setPicked({})}><Icon name="x" />{t("Clear")}</button>
            </div>
          </>
        ) : <div className="muted" style={{ fontSize: 13 }}>{t("Your live coupon is empty: tap a bet above.")}</div>}
      </div>

      {leagues.length > 1 && (
        <div className="chips" style={{ marginBottom: 10 }}>
          <button className={`chip ${lg === "all" ? "on" : ""}`} onClick={() => setLg("all")}>{t("All live")}<span className="n">{games.length}</span></button>
          {leagues.map(([id, n]) => { const L = LEAGUE_BY_ID[id]; return <button key={id} className={`chip ${lg === id ? "on" : ""}`} onClick={() => setLg(lg === id ? "all" : id)} title={L?.name}><LeagueFlag league={L} size={13} />{L?.short || L?.name || id}<span className="n">{n}</span></button>; })}
        </div>
      )}
      <div className="lc-games">
        {shown.map((g) => (
          <div key={g.eventId} className={`lc-game ${picked[g.eventId] ? "on" : ""}`}>
            <div className="lc-head">
              <span className="pill live">{clock(g)}</span>
              <span className="lc-teams"><TeamLogo team={{ logo: g.homeLogo, short: g.home }} size={20} /><b>{g.home}</b><span className="num lc-score">{g.score.replace("-", " : ")}</span><b>{g.away}</b><TeamLogo team={{ logo: g.awayLogo, short: g.away }} size={20} /></span>
              {g.quality !== "market" && g.quality !== "partial" ? <span className="pill amber" title={t("No bookmaker priced this game before kick-off: the engine reads it from its strength model alone.")}>{t("model only")}</span> : null}
            </div>
            <div className="chips lc-markets">
              {g.markets.map((m) => (
                <button key={m.key} className={`chip lc-m ${picked[g.eventId] === m.key ? "on" : ""}`} onClick={() => toggle(g, m)}>
                  <span>{tm(m.label)}</span><b className="num">≈{odds2(m.odds)}</b><small>{Math.round(m.p * 100)}%</small>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

    </>
  );
}
