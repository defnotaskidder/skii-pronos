"use client";
// The OP card. The OP live pick: the one best single bet among the football games in play
// (lib/livecoupon.js bestLivePicks), apart from the pre-match picks that happen to be live. And the
// OP cote 2: the best pair or treble of priced favourites among the next games (lib/opcote.js),
// shown first when no football is in play. Re-chosen every 30
// seconds; a pick stays on screen while it still qualifies, so the card does not jump from game
// to game at every refresh. Its price is the engine's estimate (≈): no free feed carries in-play odds.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icons";
import { useT } from "./Lang";
import { useTrack } from "./Providers";
import { CouponActions, CouponCard, chanceText } from "./Coupon";
import { LeagueFlag, Ring, Skeleton, TeamLogo, odds2 } from "./ui";
import { couponText } from "../../lib/coupon-lite";
import { LEAGUE_BY_ID } from "../../lib/leagues";

const LEVELS = [["safe", "Safe", "1.25"], ["mid", "Balanced", "1.50"], ["bold", "Bold", "2.00"]];
const atBreak = (l) => /^HT$|half/i.test(l.live?.detail || "");
// the feed's own clock when it has one ("45'+3'": its minute counter would say 48'), else the minute
const clock = (l, t) => (atBreak(l) ? t("HT") : /^\d+'/.test(l.live?.detail || "") ? l.live.detail : l.live?.minute ? `${l.live.minute}'` : l.live?.detail || t("LIVE"));
// minutes of normal time still to play (first-half stoppage time is still 45 minutes from the end)
const minutesLeft = (l) => (atBreak(l) || (l.live?.period === 1 && (l.live?.minute || 0) >= 45) ? 45 : Math.max(1, 90 - (l.live?.minute || 0)));
const same = (a, b) => a && b && a.eventId === b.eventId && a.key === b.key;

// The facts behind a pick, worded for the visitor.
function reasons(l, t, lang) {
  const f = l.facts || {}, out = [];
  const team = f.side === "home" ? l.home : f.side === "away" ? l.away : null;
  const left = minutesLeft(l);
  const xg = (x) => Number(x || 0).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 1 });
  if (f.need !== undefined && team) out.push(t("{team} need one more goal: the engine expects {x} from them before the end.", { team, x: xg(f.xgSide) }));
  else if (f.need !== undefined) out.push(f.need <= 1 ? t("One more goal wins it: the engine expects {x} before the end.", { x: xg(f.xgLeft) }) : t("Needs {n} more goals: the engine expects {x} before the end.", { n: f.need, x: xg(f.xgLeft) }));
  else if (f.room !== undefined) out.push(f.room <= 0 ? t("Wins if no more goal is scored: the engine expects {x} before the end.", { x: xg(f.xgLeft) }) : f.room === 1 ? t("Still wins with one more goal: the engine expects {x} before the end.", { x: xg(f.xgLeft) }) : t("Still wins with {n} more goals: the engine expects {x} before the end.", { n: f.room, x: xg(f.xgLeft) }));
  else if (team && f.lead > 0) out.push(f.lead === 1 ? t("{team} lead by one goal with about {m} minutes left.", { team, m: left }) : t("{team} lead by {n} goals with about {m} minutes left.", { team, n: f.lead, m: left }));
  else if (team && f.lead === 0) out.push(/^(1X|X2)$/.test(l.key) ? t("Level score: {team} only have to avoid defeat, about {m} minutes left.", { team, m: left }) : t("Level score: {team} still need the winning goal, about {m} minutes left.", { team, m: left }));
  else if (team && f.lead < 0) out.push(t("{team} are behind and have about {m} minutes to turn it around.", { team, m: left }));
  else if (l.key === "12") out.push(t("Wins unless the game ends level: the engine expects {x} more goals.", { x: xg(f.xgLeft) }));
  else if (l.key === "X") out.push(t("Wins if the score is level at the end: the engine expects {x} more goals.", { x: xg(f.xgLeft) }));
  else if (l.key === "BTTS_Y") out.push(f.missing === "both" ? t("Both sides still have to score: the engine expects {x} more goals.", { x: xg(f.xgLeft) }) : t("{team} still have to score.", { team: f.missing === "home" ? l.home : l.away }));
  else if (l.key === "BTTS_N") out.push(f.blank === "both" ? t("Neither side has scored: wins unless both do.", {}) : t("{team} have not scored: wins if it stays that way.", { team: f.blank === "home" ? l.home : l.away }));
  if (f.pre !== undefined) out.push(t("Before kick-off, the bookmaker's odds gave this bet {x}%.", { x: Math.round(f.pre * 100) }));
  if (f.reds > 0) out.push(t("A red card has been shown: it is counted in the chance."));
  if (l.floor !== undefined && l.floor < l.p - 0.004) out.push(t("If the engine's goal rates were 15% off, the chance would still be {x}% or more.", { x: Math.floor(l.floor * 100) }));
  return out.slice(0, 3);
}

// The OP cote 2: a coupon of two or three priced favourites among the next games.
function OpCote() {
  const { t, lang } = useT();
  const [hours, setHours] = useState(24);
  const [exclude, setExclude] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true, timer;
    const get = async () => {
      if (document.visibilityState !== "hidden") {
        try {
          const d = await (await fetch(`/api/op-cote?hours=${hours}${exclude.length ? `&exclude=${exclude.join(",")}` : ""}`)).json();
          if (!alive) return;
          if (d.error) setErr(d.error); else { setData(d); setErr(""); }
        } catch { if (alive) setErr(t("Couldn't load the cote 2.")); }
      }
      if (alive) timer = setTimeout(get, 120e3);
    };
    get();
    return () => { alive = false; clearTimeout(timer); };
  }, [exclude, hours]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = data?.coupon, rec = data?.record;
  const windows = (
    <div className="chips op-windows" role="group" aria-label={t("Kick-off within")}>
      {[[6, "Next 6 hours"], [24, "Next 24 hours"]].map(([h, label]) => <button key={h} className={`chip ${hours === h ? "on" : ""}`} onClick={() => { if (h !== hours) { setHours(h); setExclude([]); setData(null); } }} aria-pressed={hours === h}>{t(label)}</button>)}
    </div>
  );
  const pc = (x) => (x * 100).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (err && !c) return <div className="error">{err}</div>;
  if (!c) return <>{windows}<Skeleton rows={2} h={70} /></>;
  if (!c.legs.length) return (
    <>
      {windows}
      <div className="empty" style={{ padding: "26px 16px" }}>
        {t("No pair or treble of priced favourites reaches odds 2 in the next {h} hours.", { h: hours })}
        {exclude.length > 0 && <div style={{ marginTop: 10 }}><button className="btn soft sm" onClick={() => { setExclude([]); setData(null); }}><Icon name="refresh" />{t("Start over")}</button></div>}
      </div>
    </>
  );
  return (
    <>
      {windows}
      <CouponCard coupon={c} title={t("OP cote 2")} compact glow={false} icon="target"
        eyebrow={t("{n} legs · real bookmaker prices", { n: c.legs.length }) + ` · ${chanceText(c.chance, lang)}`}
        sub={t("Football games of the next {h} hours that a bookmaker prices: the two or three wins whose odds reach 2 with the highest chance of all landing. No estimated price, no draw.", { h: hours })}
        footer={<CouponActions coupon={c} title={t("OP cote 2")} extra={<button className="btn ghost" onClick={() => { setExclude((x) => [...x, ...c.legs.map((l) => l.eventId)]); setData(null); }}><Icon name="refresh" />{t("Another combination")}</button>} />} />
      {rec ? <p className="note" style={{ margin: "12px 0 0" }}>{t("Rebuilt for each of {n} past days from closing prices, this coupon was announced at {s}% and landed {w}% of the time. Prices move: check each one on 1xBet before you play.", { n: rec.days, s: pc(rec.said), w: pc(rec.won) })}</p> : null}
    </>
  );
}

export default function LiveOpPick() {
  const { t, tm, lang } = useT();
  const track = useTrack();
  const [level, setLevel] = useState("safe");
  const [exclude, setExclude] = useState([]);
  const [data, setData] = useState(null);
  const [shown, setShown] = useState(null); // the pick on screen
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [tracked, setTracked] = useState(false);
  const keep = useRef(null);
  keep.current = shown;
  const touched = useRef(false); // the visitor chose a level: no automatic switch after that
  const cote = level === "cote";

  useEffect(() => {
    if (level === "cote") return undefined;
    let alive = true, timer;
    const get = async () => {
      if (document.visibilityState === "hidden") { timer = setTimeout(get, 30e3); return; }
      try {
        const q = new URLSearchParams({ level });
        if (exclude.length) q.set("exclude", exclude.join(","));
        const d = await (await fetch(`/api/live-pick?${q}`)).json();
        if (!alive) return;
        if (d.error) setErr(d.error);
        else if (!d.live && !touched.current) { setErr(""); setLevel("cote"); return; } // no football in play: the cote 2 of the next games
        else {
          // stay on the pick already shown while it still qualifies (with its fresh numbers)
          const still = [d.pick, ...(d.next || [])].find((p) => same(p, keep.current));
          setData(d); setShown(still || d.pick || null); setErr("");
        }
      } catch { if (alive) setErr(t("Couldn't load the live pick.")); }
      if (alive) timer = setTimeout(get, 30e3);
    };
    get();
    return () => { alive = false; clearTimeout(timer); };
  }, [level, exclude]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTracked(false); }, [shown?.eventId, shown?.key]);

  const pick = shown, L = pick ? LEAGUE_BY_ID[pick.league] : null;
  const others = pick ? [data?.pick, ...(data?.next || [])].filter((p) => p && !same(p, pick)).slice(0, 3) : [];
  const choose = (lv) => { touched.current = true; if (lv === level) return; setLevel(lv); setExclude([]); setData(null); setShown(null); setErr(""); };
  const another = () => { setExclude((x) => [...x, pick.eventId]); setShown(null); setData(null); };
  const leg = pick && (({ facts, floor, fair, level: _l, ...l }) => l)(pick); // eslint-disable-line no-unused-vars
  const pc = (x) => (x * 100).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const copy = async () => { try { await navigator.clipboard.writeText(couponText({ legs: [leg], odds: leg.odds, chance: leg.p }, t("OP live pick").toUpperCase(), lang, { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } };
  const rec = data?.record;

  return (
    <section className="card op-pick">
      <div className="op-head">
        <span className="op-badge"><Icon name="bolt" size={14} />{cote ? t("OP cote 2") : t("OP live pick")}</span>
        <span className="muted op-sub">{cote ? t("The best way to odds 2 on the next games") : t("The one best single bet in play right now")}</span>
        <span className="spacer" />
        <div className="chips op-levels" role="group" aria-label={t("Risk level")}>
          {LEVELS.map(([id, label, from]) => <button key={id} className={`chip ${level === id ? "on" : ""}`} onClick={() => choose(id)} aria-pressed={level === id}>{t(label)}<span className="n">≈{from}+</span></button>)}
          <button className={`chip ${cote ? "on" : ""}`} onClick={() => choose("cote")} aria-pressed={cote}>{t("Cote 2")}<span className="n">{t("coupon")}</span></button>
        </div>
      </div>
      {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}

      {cote ? <OpCote /> : !data ? <Skeleton rows={1} h={150} /> : !pick ? (
        <div className="empty" style={{ padding: "26px 16px" }}>
          {!data.live ? t("No football game is in play right now.") : !data.eligible ? t("None of the {n} football games in play qualifies right now: the OP pick only comes from a game a bookmaker priced, between the 6th and the 80th minute.", { n: data.live }) : t("No bet in play sits in this price range right now. Try another level.")}
          {exclude.length > 0 && <div style={{ marginTop: 10 }}><button className="btn soft sm" onClick={() => { setExclude([]); setData(null); }}><Icon name="refresh" />{t("Start over")}</button></div>}
        </div>
      ) : (
        <>
          <div className="op-body">
            <div className="op-game">
              <div className="op-meta"><span className="pill live">{clock(pick, t)}</span><span className="muted op-league"><LeagueFlag league={L} size={12} /><span>{L?.short || L?.name || pick.league}</span></span></div>
              <Link href={`/match/${pick.league}/${pick.eventId}`} className="op-teams">
                <span className="op-team"><TeamLogo team={{ logo: pick.homeLogo, short: pick.home }} size={34} /><b>{pick.home}</b></span>
                <span className="num op-score">{(pick.live?.score || "0-0").replace("-", " : ")}</span>
                <span className="op-team"><TeamLogo team={{ logo: pick.awayLogo, short: pick.away }} size={34} /><b>{pick.away}</b></span>
              </Link>
            </div>
            <div className="op-bet">
              <Ring value={pick.p} size={64} stroke={6} label={`${Math.round(pick.p * 100)}%`} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="eyebrow">{t("The bet")}</div>
                <div className="op-label">{tm(pick.label)}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{t("{x}% chance by the live model", { x: Math.round(pick.p * 100) })}</div>
              </div>
              <div className="op-odds"><small>{t("est. odds")}</small><b className="num grad-text">≈{odds2(pick.odds)}</b>{pick.fair ? <small className="op-fair" title={t("The price at which this bet breaks even over time. A bookmaker usually offers a little less: anything above it is in your favour.")}>{t("fair {x}", { x: odds2(pick.fair) })}</small> : null}</div>
            </div>
          </div>
          <ul className="op-why">{reasons(pick, t, lang).map((r, i) => <li key={i}><Icon name="check" size={13} />{r}</li>)}</ul>
          <div className="row op-actions">
            <button className="btn primary" disabled={tracked} onClick={() => { track.track({ kind: "coupon", title: t("OP live pick"), legs: [leg] }); setTracked(true); }}><Icon name={tracked ? "check" : "history"} />{tracked ? t("Tracking") : t("Track")}</button>
            <button className="btn ghost" onClick={copy}><Icon name="copy" />{copied ? t("Copied") : t("Copy for Telegram")}</button>
            <button className="btn ghost" onClick={another}><Icon name="refresh" />{t("Another one")}</button>
            <span className="spacer" />
            <Link href={`/match/${pick.league}/${pick.eventId}`} className="link">{t("Live analysis")} <Icon name="chevron" size={14} /></Link>
          </div>
          {others.length > 0 && (
            <div className="op-next">
              <div className="eyebrow" style={{ marginBottom: 6 }}>{t("Next best")}</div>
              {others.map((o) => (
                <button key={o.eventId + o.key} className="op-row" onClick={() => setShown(o)}>
                  <span className="pill live">{clock(o, t)}</span>
                  <span className="op-row-main"><b>{tm(o.label)}</b><small>{o.home} {(o.live?.score || "").replace("-", " : ")} {o.away}</small></span>
                  <span className="num muted">{Math.round(o.p * 100)}%</span>
                  <b className="num">≈{odds2(o.odds)}</b>
                </button>
              ))}
            </div>
          )}
          <p className="note" style={{ margin: "12px 0 0" }}>
            {rec ? t("Tested on {g} finished games replayed minute by minute: the {n} picks chosen this way won {w}% of the time (the engine had said {s}%).", { g: rec.games.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB"), n: rec.picks.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB"), w: pc(rec.won), s: pc(rec.said) }) + " " : ""}
            {t("The price is an estimate (≈): no free feed carries in-play odds. Take it on 1xBet only at or above the shown odds, it moves every minute. At the fair price or better, the bet is in your favour.")}
          </p>
        </>
      )}
    </section>
  );
}
