"use client";
// Home (the sketch): record tiles, the day's top picks by tab, the coupon du jour and the express
// builds, yesterday's results, the channel and bonus cards. Reads only /api/home (a few KB) so it
// opens fast on a phone; the full board loads on the pages that need it.
import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "./components/Icons";
import { Top } from "./components/Shell";
import { useT } from "./components/Lang";
import { useSlip } from "./components/Providers";
import { toLeg } from "./components/Match";
import { chanceText, CouponActions, CouponCard } from "./components/Coupon";
import { Skeleton, TeamLogo, dayLabel, localTime, odds2 } from "./components/ui";
import { leagueName } from "../lib/leagues";

const CHANNEL = process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL || "";
const BONUS_CODE = process.env.NEXT_PUBLIC_BONUS_CODE || "";
const BONUS_URL = process.env.NEXT_PUBLIC_BONUS_URL || "";
const BUILDS = [
  { kind: "x12", title: "Medium", target: "x 12.5" },
  { kind: "grosse", title: "High odds", target: "x 100" },
  { kind: "x200", title: "High odds", target: "x 200" },
  { kind: "x400", title: "High odds", target: "x 300 / 400" },
];
const TABS = [["today", "Today"], ["tomorrow", "Tomorrow"], ["weekend", "Weekend"], ["live", "Live"]];

function useHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true, timer;
    const get = async () => {
      if (document.visibilityState === "hidden") { timer = setTimeout(get, 30e3); return; }
      try {
        const r = await fetch("/api/home");
        const d = await r.json();
        if (!alive) return;
        if (d.error) setError(d.error); else { setData(d); setError(""); }
        timer = setTimeout(get, d.live ? 30e3 : 90e3);
      } catch {
        if (alive) { setError("offline"); timer = setTimeout(get, 30e3); }
      }
    };
    get();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return { data, error };
}

export default function Home() {
  const { data, error } = useHome();
  const { t, lang } = useT();
  const [tab, setTab] = useState("today");
  const [weekend, setWeekend] = useState(null);
  useEffect(() => {
    if (tab !== "weekend" || weekend) return;
    fetch("/api/home?tab=weekend").then((r) => r.json()).then((d) => setWeekend(d.weekend || [])).catch(() => setWeekend([]));
  }, [tab, weekend]);
  const picks = tab === "weekend" ? weekend : data?.picks?.[tab];

  return (
    <div className="home">
      <Top brand />
      <p className="tagline">{t("Every pick posted before kickoff. Every result public.")}</p>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error === "offline" ? t("Couldn't reach the server — retrying.") : error}</div>}

      <SafeCoupon s={data?.safe} coupons={data?.coupons} loading={!data} />

      <Stats s={data?.stats} loading={!data} />

      <TodayGames g={data?.games} loading={!data} />

      <div className="tabs-row" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
            {t(label)}{k === "live" && data?.live > 0 && <span className="n">{data.live}</span>}
          </button>
        ))}
      </div>

      <div className="sec-label">{t("TOP PICKS")} · {t("local times")}</div>
      {!picks ? <Skeleton rows={3} h={92} /> : picks.length ? (
        <div className="pick-cards">{picks.map((p) => <PickCard key={p.id} p={p} />)}</div>
      ) : (
        <div className="empty">{tab === "live" ? t("No top pick is playing right now.") : t("No strong priced pick for this day yet — prices usually appear 1–2 days before kick-off.")}</div>
      )}
      <Link href="/matches" className="see-all">{t("See all picks")} <Icon name="chevron" size={15} /></Link>

      <WonCoupons w={data?.won} />

      {data?.special && <SpecialCard s={data.special} />}

      <div className="sec-label">{t("EXPRESS BUILDS")} · {t("same day")}</div>
      <div className="builds">
        {BUILDS.map((b) => {
          const c = data?.coupons?.[b.kind];
          return (
            <Link key={b.kind} href={`/vip#${b.kind}`} className="build">
              <span className="b-title">
                <span className="ell">{t(b.title)}</span>{b.kind === "x200" || b.kind === "x400" ? <Icon name="crown" size={13} /> : null}
                {c?.status && c.status !== "open" && <span className={`b-state ${c.status}`}>{c.status === "won" ? t("pick.won") : t("pick.lost")}</span>}
              </span>
              <b className="b-odds num">{c?.n ? `x ${odds2(c.odds)}` : b.target}</b>
              <span className="b-sub">{!data ? "…" : c?.n ? `${t("{n} selections", { n: c.n })} · ${chanceText(c.chance, lang)}` : data.coupons?.building ? t("Being built…") : c?.empty ? t("Today's games are over — next builds tomorrow morning") : t("Not published yet today.")}</span>
            </Link>
          );
        })}
      </div>
      <Link href="/vip#live" className="live-gc">
        <span className="pill live">{t("LIVE")}</span>
        <span style={{ minWidth: 0 }}><b>{t("Live grosse cote")}</b><small>{!data ? "…" : data.live ? t("Built from the {n} games in play", { n: data.live }) : t("Opens when games are in play")}</small></span>
        <Icon name="chevron" />
      </Link>

      <Yesterday y={data?.yesterday} />

      {CHANNEL ? (
        <a className="cta" href={CHANNEL} target="_blank" rel="noopener noreferrer">
          <b>{t("Join the free WhatsApp channel")}</b><span>{t("Picks and coupons before kickoff")}</span><span className="cta-btn">{t("Join now")}</span>
        </a>
      ) : (
        <Link className="cta" href="/notifications">
          <b>{t("Get the picks before kickoff")}</b><span>{t("Alerts for the coupon du jour, the top picks and your matches")}</span><span className="cta-btn">{t("Turn on alerts")}</span>
        </Link>
      )}
      {BONUS_CODE && (
        <a className="bonus" href={BONUS_URL || undefined} target="_blank" rel="noopener noreferrer sponsored">
          <Icon name="gift" size={18} /><span><b>{t("Bonus code")}</b> · {t("1xBet promo and sign-up link")}</span><code>{BONUS_CODE}</code>
        </a>
      )}
      <p className="note center">{t("18+ only. No pick is guaranteed. Bet responsibly.")}</p>
    </div>
  );
}

// The special night (Champions League…): one card to the full page.
function SpecialCard({ s }) {
  const { t, lang } = useT();
  const name = (lang === "fr" && s.fr) || s.name || "";
  const c = s.coupon;
  return (
    <Link href="/special" className="special-card">
      <span className="sp-star"><Icon name="star" size={20} /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="eyebrow" style={{ color: "#ffd0cc" }}>{t("SPECIAL")}{s.building ? "" : ` · ${t("{n} games tonight", { n: s.n })}`}</span>
        <b className="ell" style={{ display: "block", marginTop: 2 }}>{s.building ? t("Special night being built…") : name}</b>
        <small className="muted">{s.building ? t("Every game analysed, team news checked by the AI") : c ? `${t("The night's coupon")} · x ${odds2(c.odds)} · ${chanceText(c.chance, lang)}${c.status === "won" ? ` · ${t("pick.won")}` : c.status === "lost" ? ` · ${t("pick.lost")}` : ""}` : s.done >= s.n ? t("Tonight's games are over") : t("Every game analysed, team news checked by the AI")}</small>
      </span>
      <Icon name="chevron" />
    </Link>
  );
}

function Stats({ s, loading }) {
  const { t } = useT();
  if (loading) return <div className="stat-grid"><Skeleton rows={1} h={74} /><Skeleton rows={1} h={74} /><Skeleton rows={1} h={74} /><Skeleton rows={1} h={74} /></div>;
  if (!s) return null;
  const sign = (x) => (x > 0 ? "+" : "");
  return (
    <div className="stat-grid">
      <div className="stat-tile"><span>{t("Win rate ({d} days)", { d: s.days })}</span><b className="num">{Math.round(s.rate * 100)}%</b><small>{t("{w} of {n} top picks", { w: s.w, n: s.n })}</small></div>
      <div className="stat-tile"><span>ROI</span><b className={`num ${s.roi >= 0 ? "pos" : "neg"}`}>{sign(s.roi)}{(s.roi * 100).toFixed(1)}%</b><small>{t("flat stakes at the listed odds")}</small></div>
      <div className="stat-tile"><span>{t("Profit")}</span><b className={`num ${s.units >= 0 ? "pos" : "neg"}`}>{sign(s.units)}{s.units.toFixed(1)} {t("units")}</b><small>{t("1 unit per pick")}</small></div>
      <div className="stat-tile"><span>{t("Last 10")}</span>
        <span className="dots">{s.last10.map((r, i) => <i key={i} className={`r-${r}`} title={r === "W" ? t("pick.won") : r === "L" ? t("pick.lost") : t("pick.void")} />)}</span>
      </div>
    </div>
  );
}

function statusOf(p, t) {
  if (p.state === "in") return ["live", p.detail || t("LIVE")];
  if (p.state === "post") return p.result === "W" ? ["won", t("pick.won")] : p.result === "L" ? ["lost", t("pick.lost")] : p.result === "V" ? ["void", t("pick.void")] : ["done", t("Final")];
  return ["up", t("Upcoming")];
}

function PickCard({ p }) {
  const { t, tm, lang } = useT();
  const slip = useSlip();
  const [cls, label] = statusOf(p, t);
  const on = slip.has(p.id, p.key);
  const ev = { id: p.id, league: p.league, sport: p.sport, date: p.date, home: p.home, away: p.away };
  return (
    <div className={`pick-card ${p.rank ? "is-top" : ""}`}>
      <Link href={`/match/${p.league}/${p.id}`} className="pc-main">
        <div className="pc-head">
          <span className="ell">{leagueName({ name: p.leagueName, fr: p.leagueFr }, lang)} · {localTime(p.date)}</span>
          <span className={`pc-state ${cls}`}>{label}</span>
        </div>
        <div className="pc-teams">
          <TeamLogo team={p.home} size={20} /><b className="ell">{p.home.short}</b>
          {p.state !== "pre" ? <b className="num pc-score">{p.home.score ?? 0} – {p.away.score ?? 0}</b> : <span className="dim">vs</span>}
          <b className="ell">{p.away.short}</b><TeamLogo team={p.away} size={20} />
        </div>
        <div className="pc-pick">{tm(p.label)}</div>
        {Number.isFinite(p.p) && <div className="pc-model">{t("Model {m}% vs odds {o}%", { m: Math.round(p.p * 100), o: Math.round(p.implied * 100) })}</div>}
      </Link>
      <div className="pc-side">
        <b className="num">{p.estimated ? "≈" : "@ "}{odds2(p.odds)}</b>
        <small>{p.units === 1 ? t("1 unit") : t("{n} units", { n: p.units })}</small>
        {p.state === "pre" && (
          <button className={`icon-btn ${on ? "on" : ""}`} aria-label={t("Add to coupon")} onClick={() => slip.toggle(toLeg(ev, { key: p.key, label: p.label, odds: p.odds, p: p.p, safe: p.p, estimated: p.estimated }))}>
            <Icon name={on ? "check" : "plus"} />
          </button>
        )}
      </div>
    </div>
  );
}

const KIND_NAME = { safe: "Coupon du jour", x12: "Express x12.5", grosse: "Express x100", x200: "Express x200", x400: "Express x300/400" };

// The dashboard's main card: the day's safe coupon with every leg and its live status.
function SafeCoupon({ s, coupons, loading }) {
  const { t, lang } = useT();
  if (loading) return <Skeleton rows={1} h={230} />;
  if (!s?.legs?.length) {
    return (
      <div className="safe-empty">
        <b>{t("Safe coupon")}</b>
        <small>{coupons?.building ? t("Safe coupon being built — back in a minute.") : coupons?.safe?.empty ? t("Today's games are over — tomorrow's safe coupon comes in the morning.") : t("No legs strong enough right now. The engine would rather skip than force a coupon.")}</small>
      </div>
    );
  }
  return (
    <CouponCard coupon={s} title={t("Safe coupon")} eyebrow={`${t("SAFE COUPON OF THE DAY")} · ${dayLabel(s.legs[0].date)}`} compact icon="ticket"
      sub={`${t("{n} legs", { n: s.legs.length })} · ${t("hit chance")} ${chanceText(s.chance, lang)}`}
      footer={<CouponActions coupon={s} title={t("Coupon du jour")} extra={<Link href="/coupon" className="btn soft"><Icon name="ticket" />{t("Open the full coupon")}</Link>} />} />
  );
}

// Today's games in the main leagues: live ones first, score, the engine's pick and its price.
function TodayGames({ g, loading }) {
  const { t, tm } = useT();
  if (loading) return <><div className="sec-label">{t("TODAY'S GAMES")}</div><Skeleton rows={4} h={64} /></>;
  if (!g) return null;
  const res = (r) => (r === "W" ? <span className="res won">{t("pick.won")}</span> : r === "L" ? <span className="res lost">{t("pick.lost")}</span> : r === "V" ? <span className="res void">{t("pick.void")}</span> : null);
  return (
    <>
      <div className="sec-head">
        <div className="sec-label">{t("TODAY'S GAMES")}</div>
        <span className="muted" style={{ fontSize: 12.5 }}>{g.live ? t("{n} games today · {l} live", { n: g.n, l: g.live }) : t("{n} games today", { n: g.n })}</span>
      </div>
      {g.list.length ? (
        <div className="g-list">
          {g.list.map((e) => {
            const done = e.state === "post";
            const hw = done && e.home.score > e.away.score, aw = done && e.away.score > e.home.score;
            return (
              <Link key={e.id} href={`/match/${e.league}/${e.id}`} className="g-row">
                <span className="g-when">
                  {e.state === "in" ? <span className="pill live">{e.minute ? `${e.minute}'` : e.detail || t("LIVE")}</span> : done ? <b className="muted">{t("FT")}</b> : <b className="num">{localTime(e.date)}</b>}
                  <small>{e.short}</small>
                </span>
                <span className="g-teams">
                  <span className={`g-team ${hw ? "win" : ""}`}><TeamLogo team={e.home} size={18} /><span className="ell">{e.home.short}</span>{e.state !== "pre" && <b className="num">{e.home.score ?? 0}</b>}</span>
                  <span className={`g-team ${aw ? "win" : ""}`}><TeamLogo team={e.away} size={18} /><span className="ell">{e.away.short}</span>{e.state !== "pre" && <b className="num">{e.away.score ?? 0}</b>}</span>
                </span>
                <span className="g-pick">
                  {e.pick ? (<>
                    <small>{e.pick.top ? "🔥 " : ""}{tm(e.pick.label)}</small>
                    <b className="num">{e.pick.estimated ? "≈" : "@ "}{odds2(e.pick.odds)}</b>
                    {res(e.pick.result)}
                  </>) : <small className="dim">{t("No pick")}</small>}
                </span>
              </Link>
            );
          })}
        </div>
      ) : <div className="empty">{t("No game in the top leagues today.")}</div>}
      {g.n > g.list.length && <Link href="/matches" className="g-more">{t("See all {n} games", { n: g.n })} <Icon name="chevron" size={15} /></Link>}
    </>
  );
}

// Coupons won in the last 30 days, newest first, with the coupon record.
function WonCoupons({ w }) {
  const { t } = useT();
  if (!w) return null;
  return (
    <>
      <div className="sec-head">
        <div className="sec-label">{t("WON COUPONS")}</div>
        <Link href="/history" className="link">{t("History")}</Link>
      </div>
      {w.list.length ? (
        <div className="won-strip">
          {w.list.map((c, i) => (
            <Link key={`${c.day}-${c.kind}`} href="/history" className="won-card fade-in" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="w-head"><Icon name="trophy" size={14} /><span className="ell">{t(KIND_NAME[c.kind] || c.kind)}</span><span className="pill green">{t("pick.won")}</span></span>
              <b className="w-odds num">x {odds2(c.odds)}</b>
              <small className="muted">{dayLabel(c.day)} · {t("{n} legs", { n: c.n })}</small>
              <span className="w-legs">{c.legs.join(" · ")}</span>
            </Link>
          ))}
        </div>
      ) : <div className="empty">{t("No coupon won yet — the first results land after tonight's games.")}</div>}
      {w.total > 0 && <div className="won-rec"><Icon name="trophy" size={14} /><span>{t("{w} coupons won out of {n} graded in {d} days", { w: w.n, n: w.total, d: w.days })}</span></div>}
    </>
  );
}

function Yesterday({ y }) {
  const { t, tm } = useT();
  const rows = y?.picks || [];
  const coupons = Object.entries(y?.coupons || {}).filter(([, c]) => c.result);
  if (!rows.length && !coupons.length) return null;
  const NAME = { safe: "Coupon du jour", x12: "Express x12.5", grosse: "Express x100", x200: "Express x200", x400: "Express x300/400" };
  const res = (r) => (r === "W" ? <span className="res won">{t("pick.won")}</span> : r === "L" ? <span className="res lost">{t("pick.lost")}</span> : <span className="res void">{t("pick.void")}</span>);
  return (
    <>
      <div className="sec-label">{t("YESTERDAY'S RESULTS")}</div>
      <div className="yest">
        {coupons.map(([k, c]) => <div key={k} className="y-row"><span className="ell"><b>{t(NAME[k] || k)}</b> · @ {odds2(c.odds)}</span>{res(c.result)}</div>)}
        {rows.map((r) => <Link key={r.id} href={`/match/${r.league}/${r.id}`} className="y-row"><span className="ell">{r.home} – {r.away} · {tm(r.label)} <span className="dim">{r.score}</span></span>{res(r.result)}</Link>)}
      </div>
    </>
  );
}
