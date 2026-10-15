"use client";
import Link from "next/link";
import Icon from "./Icons";
import { useSlip } from "./Providers";
import { useNotify } from "./Notify";
import { LEAGUE_BY_ID } from "../../lib/leagues";
import { LeagueFlag, Ring, StatusPill, TeamLogo, Tier, dayLabel, localTime, odds2, pct } from "./ui";

export const href = (ev) => `/match/${ev.league}/${ev.id}`;

// A market from the model (or a raw 1X2 price) → slip leg.
export function toLeg(ev, m) {
  return {
    eventId: ev.id, league: ev.league, sport: ev.sport, date: ev.date,
    home: ev.home?.short, away: ev.away?.short, homeLogo: ev.home?.logo, awayLogo: ev.away?.logo,
    key: m.key, label: m.label, odds: m.odds, p: m.p, safe: m.safe ?? m.p, ev: m.ev ?? null, tier: m.tier || null, estimated: !!m.estimated,
  };
}

const stop = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); };

export function FollowBtn({ ev, small }) {
  const n = useNotify();
  if (ev.state === "post") return null;
  const on = n.isFollowed(ev.id);
  return (
    <button className={`icon-btn ${on ? "on" : ""}`} style={small ? { width: 30, height: 30 } : undefined} aria-label={on ? "Unfollow match" : "Follow match"}
      title={on ? "Alerts on" : "Get goal alerts"} onClick={stop(() => n.toggleFollow(ev))}>
      <Icon name="bell" />
    </button>
  );
}

export function MatchRow({ ev, showLeague = false }) {
  const slip = useSlip();
  const a = ev.a;
  const pick = a?.pick;
  const o = ev.odds;
  const isSoccer = ev.sport === "soccer";
  const prices = o ? [
    ["1", o.home, `${ev.home.short} win`, a?.probs?.h],
    ...(isSoccer ? [["X", o.draw, "Draw", a?.probs?.d]] : []),
    ["2", o.away, `${ev.away.short} win`, a?.probs?.a],
  ].filter((x) => x[1]) : [];
  const done = ev.state === "post";
  const hs = ev.home.score, as = ev.away.score;
  const L = LEAGUE_BY_ID[ev.league];

  return (
    <Link href={href(ev)} className={`mrow fade-in ${ev.state === "in" ? "live" : ""}`}>
      <div className="when">
        <StatusPill ev={ev} />
        <small>{ev.state === "pre" ? dayLabel(ev.date) : showLeague ? L?.short : ""}{ev.state === "pre" && showLeague ? ` · ${L?.short}` : ""}</small>
      </div>
      <div className="teams">
        {["home", "away"].map((s) => {
          const t = ev[s];
          const lost = done && ((s === "home" && hs < as) || (s === "away" && as < hs));
          return (
            <div key={s} className={`team ${lost ? "lost" : ""}`}>
              <TeamLogo team={t} size={24} />
              <span className="nm">{t.short}</span>
              {ev.reds?.[s] > 0 && <span className="rc" title="Red card" />}
              {ev.state !== "pre" && <span className="sc num">{t.score ?? "–"}</span>}
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
              <b>{pick.label}</b>
              <small>{pick.estimated ? "≈ " : "@ "}{odds2(pick.odds)} · <Tier t={pick.tier} /></small>
            </span>
            <Ring value={pick.safe ?? pick.p} size={46} stroke={4.5} />
            <button className={`icon-btn ${slip.has(ev.id, pick.key) ? "on" : ""}`} aria-label="Add pick to coupon" onClick={stop(() => slip.toggle(toLeg(ev, pick)))}>
              <Icon name={slip.has(ev.id, pick.key) ? "check" : "plus"} />
            </button>
          </>
        ) : (
          <span className="txt"><small>{done ? "Final" : ev.postponed ? "Postponed" : "No prices yet"}</small></span>
        )}
        <FollowBtn ev={ev} />
      </div>
    </Link>
  );
}

export function LiveCard({ ev }) {
  const L = LEAGUE_BY_ID[ev.league];
  return (
    <Link href={href(ev)} className="lcard">
      <div className="row" style={{ gap: 8 }}>
        <span className="pill live">{ev.minute ? `${ev.minute}'` : ev.detail || "LIVE"}</span>
        <span className="muted row" style={{ fontSize: 12, gap: 6, flexWrap: "nowrap", minWidth: 0, flex: 1 }}><LeagueFlag league={L} size={12} /><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{L?.name}</span></span>
        <FollowBtn ev={ev} small />
      </div>
      <div className="score">
        <span className="t"><TeamLogo team={ev.home} size={40} /><span>{ev.home.short}</span></span>
        <span className="s num">{ev.home.score ?? 0}<span className="dim"> : </span>{ev.away.score ?? 0}</span>
        <span className="t"><TeamLogo team={ev.away} size={40} /><span>{ev.away.short}</span></span>
      </div>
      {ev.a?.pick ? (
        <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5 }}>
          <span className="muted">Pre-match pick</span>
          <b style={{ maxWidth: 150, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.a.pick.label}</b>
        </div>
      ) : <div className="muted" style={{ fontSize: 12.5 }}>{ev.sport === "soccer" ? "Tap for live analysis" : ev.detail}</div>}
    </Link>
  );
}

export function PickItem({ ev, m, right }) {
  const slip = useSlip();
  const on = slip.has(ev.id, m.key);
  return (
    <Link href={href(ev)} className="pitem">
      <span className="logos"><TeamLogo team={ev.home} size={32} /><TeamLogo team={ev.away} size={32} /></span>
      <span className="mid">
        <b>{m.label}</b>
        <small>{ev.home.short} – {ev.away.short} · {dayLabel(ev.date)} {localTime(ev.date)}</small>
      </span>
      {right}
      <span style={{ textAlign: "right" }}>
        <div className="od num">{m.estimated ? "≈" : ""}{odds2(m.odds)}</div>
        <Tier t={m.tier} />
      </span>
      <button className={`icon-btn ${on ? "on" : ""}`} aria-label="Add to coupon" onClick={stop(() => slip.toggle(toLeg(ev, m)))}>
        <Icon name={on ? "check" : "plus"} />
      </button>
    </Link>
  );
}

export { pct };
