"use client";
// The games in play that the main feed does not carry (UEFA Youth League, national cups, lower
// divisions…), from the second live-score source (lib/morelive.js). They are shown among the
// site's own live games, as cards of the same shape. A game the bookmaker prices in play carries
// a pick read off those real prices; the others show their score only. No match page behind them.
// Scores are collected by the site itself every 20 seconds (lib/openlive.js); the in-play prices
// come from API-Football every few minutes (a daily call budget), so a pick says when its price
// was read, and it is withdrawn as soon as the score moves after that reading.
import { memo, useEffect, useState } from "react";
import { useT } from "./Lang";
import { TeamLogo, odds2, useNow } from "./ui";

// { games, at }: empty while the second source is not configured or has nothing to add
export function useMoreLive() {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true, timer;
    const get = async () => {
      if (document.visibilityState !== "hidden") {
        try { const r = await (await fetch("/api/live-extra")).json(); if (alive && r && Array.isArray(r.games)) setD(r); } catch { /* next round */ }
      }
      if (alive) timer = setTimeout(get, 30e3);
    };
    get();
    // a tab that comes back reads the list at once instead of waiting for the next round
    const wake = () => { if (document.visibilityState === "visible") { clearTimeout(timer); get(); } };
    document.addEventListener("visibilitychange", wake);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); };
  }, []);
  return { games: d?.configured ? d.games : NONE, at: d?.at ? new Date(d.at).getTime() : null, pricesAt: d?.pricesAt ? new Date(d.pricesAt).getTime() : null };
}
const NONE = []; // the same empty list at every render

export const extraKey = (g) => `x:${g.country}|${g.league}`;
export const extraLeague = (g) => `${g.country && g.country !== "World" ? `${g.country} · ` : ""}${g.league}`;
const CAP = { "1H": 45, "2H": 90, ET: 120 };

function ExtraLiveCardInner({ g, at, pricesAt }) {
  const { t, tm, locale } = useT();
  const now = useNow();
  // a game only the priced reading has carries its own (older) reading time
  const read = (g.at ? new Date(g.at).getTime() : at) || now;
  const hm = (x) => new Date(x).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const clock = g.status === "HT" || g.status === "BT" ? t("HT") : g.status === "P" ? t("Pens")
    : g.minute == null || !CAP[g.status] ? t("LIVE") : `${Math.min(CAP[g.status], g.minute + Math.max(0, Math.floor((now - read) / 60e3)))}'`;
  const fit = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div className="lcard extra">
      <div className="row" style={{ gap: 8 }}>
        <span className="pill live">{clock}</span>
        <span className="muted" style={{ fontSize: 12, minWidth: 0, flex: 1, ...fit }}>{extraLeague(g)}</span>
      </div>
      <div className="score">
        <span className="t"><TeamLogo team={{ logo: g.homeLogo, short: g.home }} size={40} /><span>{g.redsHome > 0 ? "🟥 " : ""}{g.home}</span></span>
        <span className="s">{g.hs}<span className="dim"> : </span>{g.as}</span>
        <span className="t"><TeamLogo team={{ logo: g.awayLogo, short: g.away }} size={40} /><span>{g.redsAway > 0 ? "🟥 " : ""}{g.away}</span></span>
      </div>
      {g.pick ? (
        <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5, gap: 8, flexWrap: "nowrap" }}>
          <span className="muted" style={{ flex: "none" }}>{t("Live pick")}</span>
          <b style={{ minWidth: 0, ...fit }}>{tm(g.pick.label)} <span className="num">@ {odds2(g.pick.odds)}</span></b>
        </div>
      ) : <div className="muted" style={{ fontSize: 12.5 }}>{g.stale ? t("A goal or a red card came after the prices were read: next pick at the next reading") : g.priced ? t("No pick at this price right now") : t("No bookmaker price on this game")}</div>}
      {g.pick ? <div className="muted lx-read">{t("Real in-play price read at {time}: check it on 1xBet", { time: hm(pricesAt || read) })}</div>
        : now - read > 120e3 ? <div className="muted lx-read">{t("Score read at {time}", { time: hm(read) })}</div> : null}
    </div>
  );
}
export const ExtraLiveCard = memo(ExtraLiveCardInner);
