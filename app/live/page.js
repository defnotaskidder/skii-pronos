"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useBoard } from "../components/Providers";
import { useT } from "../components/Lang";
import { LiveCard, MatchRow } from "../components/Match";
import { LeagueFlag, Skeleton } from "../components/ui";
import { LEAGUE_BY_ID } from "../../lib/leagues";

export default function Live() {
  const { events, live, loading, liveAt, refresh } = useBoard();
  const { t, locale } = useT();
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
  useEffect(() => { if (lg !== "all" && !leagues.some((x) => x.id === lg)) setLg("all"); }, [leagues, lg]);
  const shown = lg === "all" ? ordered : ordered.filter((e) => e.league === lg);
  const justEnded = useMemo(() => events.filter((e) => e.state === "post" && Date.now() - new Date(e.date) < 4 * 3600e3).slice(-8).reverse(), [events]);

  return (
    <>
      <Top title={t("Live")} sub={t("{n} live now · refreshes every 15s", { n: live.length }) + (liveAt ? ` · ${new Date(liveAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "")}>
        <button className="tile-btn" aria-label={t("Refresh")} onClick={refresh}><Icon name="refresh" /></button>
      </Top>

      {loading ? <Skeleton rows={3} h={150} /> : live.length === 0 ? (
        <div className="empty" style={{ marginBottom: 22 }}>
          <Icon name="live" />{t("Nothing live right now.")}<br />
          <small>{soon.length ? t("{n} matches start in the next 3 hours.", { n: soon.length }) : t("Check the upcoming list below.")}</small>
        </div>
      ) : (
        <>
          {leagues.length > 1 && (
            <div className="chips live-bar" style={{ marginBottom: 14 }} aria-label={t("Live leagues")}>
              <button className={`chip ${lg === "all" ? "on" : ""}`} onClick={() => setLg("all")}><Icon name="live" size={14} />{t("All live")}<span className="n">{live.length}</span></button>
              {leagues.map((x) => { const L = LEAGUE_BY_ID[x.id]; return (
                <button key={x.id} className={`chip ${lg === x.id ? "on" : ""}`} onClick={() => setLg(lg === x.id ? "all" : x.id)} title={L?.name}>
                  {x.top > 0 && <span aria-hidden="true">🔥</span>}<LeagueFlag league={L} size={13} />{L?.short || L?.name || x.id}<span className="n">{x.n}</span>
                </button>
              ); })}
            </div>
          )}
          {topLive > 0 && <div className="top-banner">🔥 {t("{n} of the day's top picks are live — they're highlighted and shown first.", { n: topLive })}</div>}
          <div className="grid stagger" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(268px, 1fr))", marginBottom: 26, paddingTop: 8 }}>
            {shown.map((e) => <LiveCard key={e.id} ev={e} best={e.id === bestId} />)}
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
