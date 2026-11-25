"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useBoard } from "../components/Providers";
import { useT } from "../components/Lang";
import { LiveCard, MatchRow } from "../components/Match";
import LiveCoupon from "../components/LiveCoupon";
import LiveOpPick from "../components/LiveOpPick";
import KickoffAlerts from "../components/KickoffAlerts";
import { ExtraLiveCard, extraKey, extraLeague, useMoreLive } from "../components/LiveExtra";
import { LeagueFlag, Skeleton } from "../components/ui";
import { LEAGUE_BY_ID } from "../../lib/leagues";

export default function Live() {
  const { events, live, loading, liveAt, refresh } = useBoard();
  const { t, locale } = useT();
  // the games in play the main feed does not carry (second source), shown among the others
  const more = useMoreLive();
  const soon = useMemo(() => events.filter((e) => e.state === "pre" && new Date(e.date) - Date.now() < 3 * 3600e3 && new Date(e.date) > Date.now() - 15 * 60e3), [events]);
  const ordered = useMemo(() => [...live].sort((a, b) => (a.top?.rank ?? 99) - (b.top?.rank ?? 99)), [live]);
  const topLive = ordered.filter((e) => e.top).length;
  // the single best pick playing right now: the best-ranked top pick, else the likeliest priced pick
  const bestId = useMemo(() => {
    const top = live.filter((e) => e.top).sort((a, b) => a.top.rank - b.top.rank)[0];
    if (top) return top.id;
    const withPick = live.filter((e) => e.a?.pick?.key);
    const priced = withPick.filter((e) => !e.a.pick.estimated);
    const best = (priced.length ? priced : withPick).sort((a, b) => (b.a.pick.safe ?? b.a.pick.p ?? 0) - (a.a.pick.safe ?? a.a.pick.p ?? 0))[0];
    return best?.id || null;
  }, [live]);
  // which leagues are live right now, the ones holding top picks first
  const leagues = useMemo(() => {
    const m = new Map();
    for (const e of live) { const x = m.get(e.league) || { id: e.league, n: 0, top: 0 }; x.n++; if (e.top) x.top++; m.set(e.league, x); }
    return [...m.values()].sort((a, b) => b.top - a.top || b.n - a.n || (LEAGUE_BY_ID[a.id]?.tier ?? 9) - (LEAGUE_BY_ID[b.id]?.tier ?? 9));
  }, [live]);
  const [lg, setLg] = useState("all");
  const shown = lg === "all" ? ordered : ordered.filter((e) => e.league === lg);
  // the second source's competitions, international ones first; games with a pick before the others
  const moreLeagues = useMemo(() => {
    const m = new Map();
    for (const g of more.games) { const k = extraKey(g); const x = m.get(k) || { id: k, name: extraLeague(g), world: g.country === "World", n: 0 }; x.n++; m.set(k, x); }
    return [...m.values()].sort((a, b) => (b.world ? 1 : 0) - (a.world ? 1 : 0) || b.n - a.n || a.name.localeCompare(b.name));
  }, [more.games]);
  const moreShown = useMemo(() => (lg === "all" ? more.games : more.games.filter((g) => extraKey(g) === lg)).slice().sort((a, b) => (b.pick ? 1 : 0) - (a.pick ? 1 : 0) || (a.country === "World" ? 0 : 1) - (b.country === "World" ? 0 : 1)), [more.games, lg]);
  const total = live.length + more.games.length;
  // a selected competition that is no longer in play falls back to "all"
  useEffect(() => { if (lg !== "all" && !leagues.some((x) => x.id === lg) && !moreLeagues.some((x) => x.id === lg)) setLg("all"); }, [leagues, moreLeagues, lg]);
  const justEnded = useMemo(() => events.filter((e) => e.state === "post" && Date.now() - new Date(e.date) < 4 * 3600e3).slice(-8).reverse(), [events]);

  return (
    <>
      <Top title={t("Live")} sub={t("{n} live now · refreshes every 15s", { n: total }) + (liveAt ? ` · ${new Date(liveAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "")}>
        <button className="tile-btn" aria-label={t("Refresh")} onClick={refresh}><Icon name="refresh" /></button>
      </Top>

      <div style={{ marginBottom: 18 }}><LiveOpPick /></div>
      <div style={{ marginBottom: 18 }}><KickoffAlerts /></div>

      {loading && !more.games.length ? <Skeleton rows={3} h={150} /> : total === 0 ? (
        <div className="empty" style={{ marginBottom: 22 }}>
          <Icon name="live" />{t("Nothing live right now.")}<br />
          <small>{soon.length ? t("{n} matches start in the next 3 hours.", { n: soon.length }) : t("Check the upcoming list below.")}</small>
        </div>
      ) : (
        <>
          {leagues.length + moreLeagues.length > 1 && (
            <div className="chips live-bar" style={{ marginBottom: 14 }} aria-label={t("Live leagues")}>
              <button className={`chip ${lg === "all" ? "on" : ""}`} onClick={() => setLg("all")}><Icon name="live" size={14} />{t("All live")}<span className="n">{total}</span></button>
              {leagues.map((x) => { const L = LEAGUE_BY_ID[x.id]; return (
                <button key={x.id} className={`chip ${lg === x.id ? "on" : ""}`} onClick={() => setLg(lg === x.id ? "all" : x.id)} title={L?.name}>
                  {x.top > 0 && <span aria-hidden="true">🔥</span>}<LeagueFlag league={L} size={13} />{L?.short || L?.name || x.id}<span className="n">{x.n}</span>
                </button>
              ); })}
              {moreLeagues.map((x) => (
                <button key={x.id} className={`chip ${lg === x.id ? "on" : ""}`} onClick={() => setLg(lg === x.id ? "all" : x.id)} title={x.name}>{x.name}<span className="n">{x.n}</span></button>
              ))}
            </div>
          )}
          <div style={{ marginBottom: 18 }}><LiveCoupon /></div>
          {topLive > 0 && <div className="top-banner">🔥 {t("{n} of the day's top picks are live — they're highlighted and shown first.", { n: topLive })}</div>}
          <div className="grid stagger" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(268px, 1fr))", marginBottom: 26, paddingTop: 8 }}>
            {shown.map((e) => <LiveCard key={e.id} ev={e} best={e.id === bestId} />)}
            {moreShown.map((g) => <ExtraLiveCard key={g.id} g={g} at={more.at} pricesAt={more.pricesAt} />)}
          </div>
        </>
      )}

      <div className="card flat tight" style={{ marginBottom: 22, display: "flex", gap: 12, alignItems: "center" }}>
        <span className="stat-ico" style={{ margin: 0 }}><Icon name="sparkles" /></span>
        <span style={{ flex: 1, fontSize: 13.5 }}>{t("Open any live match for the")} <b>{t("live model")}</b> {t("(win/draw/loss re-priced from score, minute, red cards and shots) and a one-tap")} <b>{t("AI live read")}</b>. {t("Tap 🔔 to get goal alerts.")}</span>
      </div>

      {soon.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div className="card-head" style={{ padding: "0 4px" }}><h2>{t("Starting soon")}</h2><Link href="/matches" className="link">{t("All matches")} <Icon name="chevron" size={14} /></Link></div>
          {[...soon].sort((a, b) => (a.top?.rank ?? 99) - (b.top?.rank ?? 99) || new Date(a.date) - new Date(b.date)).slice(0, 30).map((e) => <MatchRow key={e.id} ev={e} showLeague />)}
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
