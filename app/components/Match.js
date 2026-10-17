"use client";
import Link from "next/link";
import { memo } from "react";
import Icon from "./Icons";
import { useSlip } from "./Providers";
import { useNotify } from "./Notify";
import { useT } from "./Lang";
import { LEAGUE_BY_ID, leagueName } from "../../lib/leagues";
import { settle } from "../../lib/model";
import { useFlash } from "./Motion";
import { LeagueFlag, Ring, StatusPill, TeamLogo, Tier, dayLabel, liveLabel, localTime, odds2, pct, useNow } from "./ui";

export const href = (ev) => `/match/${ev.league}/${ev.id}`;
// Moneyline labels as the engine words them (lib/model.js): hockey, basketball and NFL prices include overtime.
const WIN = { hockey: " win (incl. OT & SO)", basketball: " win (incl. OT)", football: " win (incl. OT)" };

// A market from the model (or a raw 1X2 price) → slip leg.
export function toLeg(ev, m) {
  return {
    eventId: ev.id, league: ev.league, sport: ev.sport, date: ev.date,
    home: ev.home?.short, away: ev.away?.short, homeLogo: ev.home?.logo, awayLogo: ev.away?.logo,
    key: m.key, label: m.label, odds: m.odds, p: m.p, safe: m.safe ?? m.p, ev: m.ev ?? null, tier: m.tier || null, estimated: !!m.estimated,
  };
}

// A score that flashes when it changes (goal!).
function Score({ v, className = "" }) {
  const f = useFlash(v);
  return <span className={`${className} num ${f ? "flash" : ""}`}>{v ?? "–"}</span>;
}

const stop = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); };

export function FollowBtn({ ev, small }) {
  const n = useNotify();
  const { t } = useT();
  if (ev.state === "post") return null;
  const on = n.isFollowed(ev.id);
  return (
    <button className={`icon-btn ${on ? "on" : ""}`} style={small ? { width: 30, height: 30 } : undefined} aria-label={on ? t("Unfollow match") : t("Follow match")}
      title={on ? t("Alerts on") : t("Get goal alerts")} onClick={stop(() => n.toggleFollow(ev))}>
      <Icon name="bell" />
    </button>
  );
}

function MatchRowInner({ ev, showLeague = false }) {
  const slip = useSlip();
  const { t, tm } = useT();
  const a = ev.a;
  const pick = a?.pick;
  const o = ev.odds;
  const isSoccer = ev.sport === "soccer";
  const prices = o ? [
    ["1", o.home, `${ev.home.short}${WIN[ev.sport] || " win"}`, a?.probs?.h],
    ...(isSoccer ? [["X", o.draw, "Draw", a?.probs?.d]] : []),
    ["2", o.away, `${ev.away.short}${WIN[ev.sport] || " win"}`, a?.probs?.a],
  ].filter((x) => x[1]) : [];
  const done = ev.state === "post";
  const hs = ev.home.score, as = ev.away.score;
  const L = LEAGUE_BY_ID[ev.league];
  const goal = useFlash(`${hs}-${as}`, 1600) && ev.state === "in";

  return (
    <Link href={href(ev)} className={`mrow fade-in ${ev.state === "in" ? "live" : ""} ${goal ? "goal" : ""} ${ev.top ? "top" : ""}`}>
      <div className="when">
        <StatusPill ev={ev} />
        {ev.top && <span className="top-badge" title={t("One of the day's top 10 picks")}>🔥 #{ev.top.rank}</span>}
        <small>{ev.state === "pre" ? dayLabel(ev.date) : showLeague ? L?.short : ""}{ev.state === "pre" && showLeague ? ` · ${L?.short}` : ""}</small>
      </div>
      <div className="teams">
        {["home", "away"].map((s) => {
          const tm_ = ev[s];
          const lost = done && ((s === "home" && hs < as) || (s === "away" && as < hs));
          return (
            <div key={s} className={`team ${lost ? "lost" : ""}`}>
              <TeamLogo team={tm_} size={24} />
              <span className="nm">{tm_.short}</span>
              {ev.reds?.[s] > 0 && <span className="rc" title={t("Red card")} />}
              {ev.state !== "pre" && <Score v={tm_.score} className="sc" />}
            </div>
          );
        })}
      </div>
      {prices.length > 0 && ev.state === "pre" ? (
        <div className="odds3">
          {prices.map(([k, price, label, p]) => {
            const on = slip.has(ev.id, k);
            return (
              <button key={k} className={`odd ${on ? "on" : ""}`} onClick={stop(() => slip.toggle(toLeg(ev, { key: k, label, odds: price, p })))}>
                <small>{k}</small><b className="num">{odds2(price)}</b>
              </button>
            );
          })}
        </div>
      ) : <div className="odds3" />}
      <div className="pickbox">
        {pick && !done ? (
          <>
            <span className="txt">
              <b>{tm(pick.label)}</b>
              <small>{pick.estimated ? "≈ " : "@ "}{odds2(pick.odds)} · <Tier t={pick.tier} /></small>
            </span>
            <Ring value={pick.safe ?? pick.p} size={46} stroke={4.5} />
            <button className={`icon-btn ${slip.has(ev.id, pick.key) ? "on" : ""}`} aria-label={t("Add pick to coupon")} onClick={stop(() => slip.toggle(toLeg(ev, pick)))}>
              <Icon name={slip.has(ev.id, pick.key) ? "check" : "plus"} />
            </button>
          </>
        ) : done && ev.done ? (
          <>
            <span className="txt">
              <b>{tm(ev.done.label)}</b>
              <small>{t("Engine pick")} {ev.done.estimated ? "≈ " : "@ "}{odds2(ev.done.odds)}</small>
            </span>
            <span className={`result-badge r-${ev.done.result || "P"}`}>{ev.done.result === "W" ? "✓" : ev.done.result === "L" ? "✗" : ev.done.result === "V" ? "V" : "…"}</span>
          </>
        ) : (
          <span className="txt"><small>{done ? t("Final") : ev.postponed ? t("Postponed") : t("No prices yet")}</small></span>
        )}
        <FollowBtn ev={ev} />
      </div>
    </Link>
  );
}

function LiveCardInner({ ev, best = false }) {
  const { t, tm, lang } = useT();
  const L = LEAGUE_BY_ID[ev.league];
  const goal = useFlash(`${ev.home.score}-${ev.away.score}`, 1600);
  const now = useNow();
  // the locked pre-match pick shown on the card: the top pick, or the engine pick when this is the best live one
  const tp = ev.top || (best && ev.a?.pick?.key ? { key: ev.a.pick.key, label: ev.a.pick.label, odds: ev.a.pick.odds } : null);
  return (
    <Link href={href(ev)} className={`lcard ${goal ? "goal" : ""} ${ev.top ? "top" : ""} ${best ? "best" : ""}`}>
      {best && <span className="best-ribbon"><span className="fire" aria-hidden="true">🔥</span>{t("Best live pick")}</span>}
      <div className="row" style={{ gap: 8 }}>
        <span className="pill live">{liveLabel(ev, now)}</span>
        <span className="muted row" style={{ fontSize: 12, gap: 6, flexWrap: "nowrap", minWidth: 0, flex: 1 }}><LeagueFlag league={L} size={12} /><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{leagueName(L, lang)}</span></span>
        <FollowBtn ev={ev} small />
      </div>
      <div className="score">
        <span className="t"><TeamLogo team={ev.home} size={40} /><span>{ev.home.short}</span></span>
        <span className="s"><Score v={ev.home.score ?? 0} /><span className="dim"> : </span><Score v={ev.away.score ?? 0} /></span>
        <span className="t"><TeamLogo team={ev.away} size={40} /><span>{ev.away.short}</span></span>
      </div>
      {tp ? <TopLive ev={ev} tp={tp} best={best} /> : ev.a?.pick ? (
        <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5 }}>
          <span className="muted">{t("Pre-match pick")}</span>
          <b style={{ maxWidth: 150, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tm(ev.a.pick.label)}</b>
        </div>
      ) : <div className="muted" style={{ fontSize: 12.5 }}>{ev.sport === "soccer" ? t("Tap for live analysis") : ev.detail}</div>}
    </Link>
  );
}

// A live top pick: the locked pre-match pick and where it stands at the current score.
function TopLive({ ev, tp, best }) {
  const { t, tm } = useT();
  const r = settle(tp.key, ev.home.score ?? 0, ev.away.score ?? 0, { sport: ev.sport, ot: ev.ot });
  const [cls, txt] = r === "W" ? ["ok", t("On track")] : r === "V" ? ["mid", t("Void for now")] : ["risk", t("At risk")];
  return (
    <div className="top-live">
      {tp.rank && !best ? <span className="top-badge">🔥 {t("Top pick #{n}", { n: tp.rank })}</span> : null}
      <b>{tm(tp.label)} <span className="muted">@ {odds2(tp.odds)}</span></b>
      <span className={`top-state ${cls}`}>{txt}</span>
    </div>
  );
}

function PickItemInner({ ev, m, right }) {
  const slip = useSlip();
  const { t, tm } = useT();
  const on = slip.has(ev.id, m.key);
  return (
    <Link href={href(ev)} className="pitem">
      <span className="logos"><TeamLogo team={ev.home} size={32} /><TeamLogo team={ev.away} size={32} /></span>
      <span className="mid">
        <b>{tm(m.label)}</b>
        <small>{ev.home.short} – {ev.away.short} · {dayLabel(ev.date)} {localTime(ev.date)}</small>
      </span>
      {right}
      <span style={{ textAlign: "right" }}>
        <div className="od num">{m.estimated ? "≈" : ""}{odds2(m.odds)}</div>
        <Tier t={m.tier} />
      </span>
      <button className={`icon-btn ${on ? "on" : ""}`} aria-label={t("Add to coupon")} onClick={stop(() => slip.toggle(toLeg(ev, m)))}>
        <Icon name={on ? "check" : "plus"} />
      </button>
    </Link>
  );
}

// Rows only re-render when their own event object changes (DataProvider keeps unchanged
// events identical between refreshes), so a board refresh doesn't redraw 800 rows.
export const MatchRow = memo(MatchRowInner);
export const LiveCard = memo(LiveCardInner);
export const PickItem = memo(PickItemInner);
export { pct };
