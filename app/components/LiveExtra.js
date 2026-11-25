"use client";
// The games in play that the main feed does not carry (UEFA Youth League, national cups, lower
// divisions…), from the second live-score source (lib/morelive.js). They are shown among the
// site's own live games, as cards of the same shape. A game the bookmaker prices in play carries
// a pick read off those real prices; the others show their score only. No match page behind them.
// The source is refreshed every few minutes (a daily call budget), so each card says when it was
// read, and the minute shown is that reading plus the time gone by since.
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
      if (alive) timer = setTimeout(get, 90e3);
    };
    get();
    // a tab that comes back reads the list at once instead of waiting for the next round
    const wake = () => { if (document.visibilityState === "visible") { clearTimeout(timer); get(); } };
    document.addEventListener("visibilitychange", wake);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); };
  }, []);
  return { games: d?.configured ? d.games : NONE, at: d?.at ? new Date(d.at).getTime() : null };
}
const NONE = []; // the same empty list at every render

export const extraKey = (g) => `x:${g.country}|${g.league}`;
export const extraLeague = (g) => `${g.country && g.country !== "World" ? `${g.country} · ` : ""}${g.league}`;
const CAP = { "1H": 45, "2H": 90, ET: 120 };

function ExtraLiveCardInner({ g, at }) {
  const { t, tm, locale } = useT();
  const now = useNow();
  const read = at || now;
  const clock = g.status === "HT" || g.status === "BT" ? t("HT") : g.status === "P" ? t("Pens")
    : g.minute == null || !CAP[g.status] ? t("LIVE") : `${Math.min(CAP[g.status], g.minute + Math.max(0, Math.floor((now - read) / 60e3)))}'`;
  const time = new Date(read).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const fit = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div className="lcard extra">
      <div className="row" style={{ gap: 8 }}>
        <span className="pill live">{clock}</span>
        <span className="muted" style={{ fontSize: 12, minWidth: 0, flex: 1, ...fit }}>{extraLeague(g)}</span>
      </div>
      <div className="score">
        <span className="t"><TeamLogo team={{ logo: g.homeLogo, short: g.home }} size={40} /><span>{g.home}</span></span>
        <span className="s">{g.hs}<span className="dim"> : </span>{g.as}</span>
        <span className="t"><TeamLogo team={{ logo: g.awayLogo, short: g.away }} size={40} /><span>{g.away}</span></span>
      </div>
      {g.pick ? (
        <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5, gap: 8, flexWrap: "nowrap" }}>
          <span className="muted" style={{ flex: "none" }}>{t("Live pick")}</span>
          <b style={{ minWidth: 0, ...fit }}>{tm(g.pick.label)} <span className="num">@ {odds2(g.pick.odds)}</span></b>
        </div>
      ) : <div className="muted" style={{ fontSize: 12.5 }}>{g.priced ? t("No pick at this price right now") : t("No bookmaker price on this game")}</div>}
      <div className="muted lx-read">{g.pick ? t("Real in-play price read at {time}: check it on 1xBet", { time }) : t("Score read at {time}", { time })}</div>
    </div>
  );
}
export const ExtraLiveCard = memo(ExtraLiveCardInner);
