"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useTrack } from "../components/Providers";
import { useT } from "../components/Lang";
import { LeagueFlag, Skeleton, TeamLogo, Tier, dayLabel, localTime, odds2, pct } from "../components/ui";
import { chanceText } from "../components/Coupon";
import { product } from "../../lib/coupon";
import { LEAGUE_BY_ID } from "../../lib/leagues";
import { CountUp } from "../components/Motion";
import { load, save } from "../components/store";

const TABS = [["games", "All games"], ["daily", "Daily coupons"], ["mine", "My coupons"]];

export default function History() {
  const { t } = useT();
  const [tab, setTab] = useState("games");
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const track = useTrack();

  useEffect(() => {
    let alive = true;
    setData(null); setErr("");
    fetch(`/api/results?days=${days}`).then((r) => r.json()).then((d) => { if (alive) { if (d.error) setErr(d.error); setData(d); } })
      .catch(() => alive && setErr(t("Couldn't load the history.")));
    return () => { alive = false; };
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Top title={t("History")} sub={t("Every game the engine picked, graded from final scores")}>
        {tab === "mine" && <button className="tile-btn" aria-label={t("Grade now")} title={t("Grade finished games now")} onClick={track.settleAll}><Icon name="refresh" /></button>}
      </Top>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="seg">
          {TABS.map(([k, l]) => <button key={k} className={tab === k ? "on grad" : ""} onClick={() => setTab(k)}>{t(l)}{k === "mine" && track.entries.length ? <span className="n">{track.entries.length}</span> : null}</button>)}
        </div>
        <span className="spacer" />
        {tab !== "mine" && (
          <div className="seg">
            {[[1, "24 h"], [3, "3 days"], [7, "7 days"], [30, "30 days"]].map(([d, l]) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{t(l)}</button>)}
          </div>
        )}
      </div>
      {err && <div className="error" style={{ marginBottom: 14 }}>{err}</div>}
      {tab === "games" && <AllGames data={data} />}
      {tab === "daily" && <DailyCoupons data={data} />}
      {tab === "mine" && <MyCoupons />}
    </>
  );
}

function NoDb() {
  const { t } = useT();
  return (
    <div className="empty">
      <Icon name="history" />{t("The game history needs the database.")}<br />
      <small>{t("Connect Supabase to this project in Vercel (Storage) and redeploy. From then on every pick is saved before kick-off and graded at full time.")}</small>
    </div>
  );
}

function AllGames({ data }) {
  const { t, tm } = useT();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(150);
  if (!data) return <Skeleton rows={6} h={64} />;
  if (!data.db) return <NoDb />;
  const s = data.stats;
  const games = data.games.filter((g) => (filter === "all" || g.pick_result === filter)
    && (!q || [g.home, g.away, LEAGUE_BY_ID[g.league]?.name].some((x) => x?.toLowerCase().includes(q.toLowerCase()))));
  const byDay = [];
  for (const g of games.slice(0, shown)) {
    const d = dayLabel(g.kickoff);
    if (!byDay.length || byDay[byDay.length - 1][0] !== d) byDay.push([d, []]);
    byDay[byDay.length - 1][1].push(g);
  }

  return (
    <>
      <div className="grid g-4 stagger" style={{ marginBottom: 18 }}>
        <div className="card tight stat"><span className="stat-ico cyan"><Icon name="target" /></span><span className="big num">{s?.all.rate !== null && s?.all.rate !== undefined ? <CountUp value={s.all.rate * 100} suffix="%" /> : "—"}</span><span className="lbl">{t("Engine hit rate · {n} games", { n: s?.all.n || 0 })}</span></div>
        <div className="card tight stat"><span className="stat-ico green"><Icon name="check" /></span><span className="big num"><CountUp value={s?.all.w || 0} /></span><span className="lbl">{t("Picks won")}</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="trend" /></span><span className="big num" style={{ color: (s?.all.units || 0) >= 0 ? "#86efac" : "#fda4af" }}><CountUp value={s?.all.units || 0} decimals={1} prefix={(s?.all.units || 0) >= 0 ? "+" : ""} /><small>u</small></span><span className="lbl">{t("Flat 1u at the pick odds")}</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="sparkles" /></span><span className="big num">{s?.value.rate !== null && s?.value.rate !== undefined ? <CountUp value={s.value.rate * 100} suffix="%" /> : "—"}</span><span className="lbl">{t("Value picks · {n} graded", { n: s?.value.n || 0 })}</span></div>
      </div>

      {s?.all.n > 0 && (
        <div className="grid g-2" style={{ marginBottom: 18 }}>
          <section className="card">
            <div className="card-head"><h3>{t("By confidence")}</h3><Link href="/record" className="link">{t("Track record")} <Icon name="chevron" size={14} /></Link></div>
            {Object.entries(s.byTier).filter(([, v]) => v.n).map(([tier, v]) => (
              <div key={tier} style={{ marginBottom: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><Tier t={tier} /><span className="muted" style={{ fontSize: 12.5 }}>{t("{w}/{n} · avg @{o} · ", { w: v.w, n: v.n, o: odds2(v.avgOdds) })}<b style={{ color: v.units >= 0 ? "#86efac" : "#fda4af" }}>{v.units >= 0 ? "+" : ""}{v.units}u</b></span></div>
                <div className="bar"><i style={{ width: `${(v.rate || 0) * 100}%` }} /></div>
              </div>
            ))}
          </section>
          <section className="card">
            <div className="card-head"><h3>{t("By league")}</h3></div>
            {s.leagues.map((l) => (
              <div key={l.league} className="kv" style={{ alignItems: "center" }}>
                <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}><LeagueFlag league={LEAGUE_BY_ID[l.league]} size={13} />{LEAGUE_BY_ID[l.league]?.name || l.league}</span>
                <b>{pct(l.rate)} <span className="muted" style={{ fontWeight: 500 }}>({l.w}/{l.n})</span></b>
              </div>
            ))}
          </section>
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          {[["all", "All"], ["W", "Won"], ["L", "Lost"]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{t(l)}</button>)}
        </div>
        <span className="spacer" />
        <div className="search" style={{ width: 240, maxWidth: "100%" }}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Team or league")} aria-label={t("Search")} />
        </div>
      </div>

      {games.length === 0 ? (
        <div className="empty"><Icon name="history" />{t("No graded games in this window yet.")}<br /><small>{t("Picks are saved before kick-off and graded at full time, so the record fills up as games finish.")}</small></div>
      ) : byDay.map(([d, list]) => (
        <section key={d} style={{ marginBottom: 16 }}>
          <div className="league-head"><b>{d}</b><span className="muted">{t("{n} games · {w} won", { n: list.length, w: list.filter((g) => g.pick_result === "W").length })}</span></div>
          {list.map((g) => (
            <Link key={g.event_id} href={`/match/${g.league}/${g.event_id}`} className="mrow fade-in">
              <div className="when"><span className="pill ft">{t("FT")}</span><small>{localTime(g.kickoff)}</small></div>
              <div className="teams">
                {[["home", g.home, g.home_logo, g.home_score], ["away", g.away, g.away_logo, g.away_score]].map(([k, n, logo, sc]) => (
                  <div key={k} className="team"><TeamLogo team={{ logo, short: n }} size={22} /><span className="nm">{n}</span><span className="sc num">{sc}</span></div>
                ))}
              </div>
              <div className="odds3" />
              <div className="pickbox">
                <span className="txt">
                  <b>{tm(g.pick_label)}</b>
                  <small>{g.pick_est ? "≈ " : "@ "}{odds2(g.pick_odds)} · <LeagueFlag league={LEAGUE_BY_ID[g.league]} size={10} /> {LEAGUE_BY_ID[g.league]?.short || g.league}</small>
                </span>
                <span className={`result-badge r-${g.pick_result || "P"}`}>{g.pick_result === "W" ? "✓" : g.pick_result === "L" ? "✗" : g.pick_result || "…"}</span>
              </div>
            </Link>
          ))}
        </section>
      ))}
      {games.length > shown && <button className="btn soft block" onClick={() => setShown((n) => n + 150)}>{t("Show more ({n} left)", { n: games.length - shown })}</button>}
    </>
  );
}

function DailyCoupons({ data }) {
  const { t, tm, lang, locale } = useT();
  if (!data) return <Skeleton rows={4} h={90} />;
  if (!data.db) return <NoDb />;
  const byDay = {};
  for (const c of data.daily || []) (byDay[c.day] = byDay[c.day] || {})[c.kind] = c;
  const daysList = Object.keys(byDay).sort().reverse();
  const all = (data.daily || []).filter((c) => c.result);
  const rate = (kind) => { const l = all.filter((c) => c.kind === kind); return l.length ? `${l.filter((c) => c.result === "W").length}/${l.length}` : "—"; };
  if (!daysList.length) return <div className="empty"><Icon name="ticket" />{t("No daily coupons archived yet.")}<br /><small>{t("The coupon du jour and grosse cote du jour are saved the first time they're published each day.")}</small></div>;
  return (
    <>
      <div className="grid g-2 stagger" style={{ marginBottom: 18 }}>
        <div className="card tight stat"><span className="stat-ico green"><Icon name="ticket" /></span><span className="big num">{rate("safe")}</span><span className="lbl">{t("Coupons du jour won")}</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="bolt" /></span><span className="big num">{rate("grosse")}</span><span className="lbl">{t("Grosses cotes won")}</span></div>
      </div>
      {daysList.map((d) => (
        <section key={d} className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>{new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}</h3></div>
          <div className="grid g-2" style={{ gap: 14 }}>
            {[["safe", "Coupon du jour", "ticket"], ["grosse", "Grosse cote du jour", "bolt"]].map(([k, title, icon]) => {
              const c = byDay[d][k];
              if (!c) return <div key={k} className="empty" style={{ padding: 20 }}>{t("No {title} that day.", { title: t(title).toLowerCase() })}</div>;
              const st = c.result === "W" ? "won" : c.result === "L" ? "lost" : "open";
              return (
                <div key={k} className="card flat tight" style={{ background: "rgba(255,255,255,.02)" }}>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <span className={`stat-ico ${st === "won" ? "green" : st === "lost" ? "live" : ""}`} style={{ margin: 0 }}><Icon name={icon} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}><b>{t(title)}</b><div className="muted" style={{ fontSize: 12 }}>{t("{n} legs · {chance}", { n: c.legs.length, chance: chanceText(c.chance, lang) })}</div></div>
                    <span className={`pill ${st === "won" ? "green" : st === "lost" ? "red" : "amber"}`}>{t(st)}</span>
                    <b className="num grad-text" style={{ fontSize: 20 }}>{odds2(c.odds)}</b>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {c.legs.map((l) => (
                      <div key={l.eventId} className="kv" style={{ alignItems: "center" }}>
                        <span style={{ minWidth: 0 }}><b style={{ color: "var(--text)", fontWeight: 600 }}>{tm(l.label)}</b> <span className="dim">@{odds2(l.odds)}</span><br /><small>{l.home} – {l.away}{l.score ? ` · ${l.score}` : ""}</small></span>
                        <span className={`result-badge sm r-${l.result || "P"}`}>{l.result === "W" ? "✓" : l.result === "L" ? "✗" : l.result || "…"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

function status(legs) {
  if (legs.some((l) => l.result === "L")) return "lost";
  if (legs.every((l) => l.result)) return "won";
  return "pending";
}
// Return on a coupon at its stake: void legs pay 1.0.
const payout = (e) => product(e.legs.map((l) => (l.result === "V" ? { odds: 1 } : l)));

function MyCoupons() {
  const { t, tm, locale } = useT();
  const { entries, remove, grade, clear, setStake } = useTrack();
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");
  const [unit, setUnit] = useState(1);
  useEffect(() => { setUnit(load("skii-unit", 1)); }, []);
  const changeUnit = (v) => { const n = Math.max(0, Number(v) || 0); setUnit(n); save("skii-unit", n); };

  const stats = useMemo(() => {
    const legs = entries.flatMap((e) => e.legs).filter((l) => l.result === "W" || l.result === "L");
    const w = legs.filter((l) => l.result === "W").length;
    const units = legs.reduce((a, l) => a + (l.result === "W" ? l.odds - 1 : -1), 0);
    const done = entries.filter((e) => status(e.legs) !== "pending");
    const cw = done.filter((e) => status(e.legs) === "won").length;
    const staked = done.reduce((a, e) => a + (e.stake ?? 1), 0);
    const returned = done.reduce((a, e) => a + (status(e.legs) === "won" ? (e.stake ?? 1) * payout(e) : 0), 0);
    return { legs: legs.length, hit: legs.length ? w / legs.length : 0, units, roi: legs.length ? units / legs.length : 0, coupons: done.length, couponHit: done.length ? cw / done.length : 0, staked, profit: returned - staked };
  }, [entries]);

  const list = entries.filter((e) => filter === "all" || status(e.legs) === filter);
  const money = (u) => (unit > 0 ? ` (${(u * unit).toLocaleString(locale, { maximumFractionDigits: 0 })})` : "");

  return (
    <>
      <div className="grid g-4 stagger" style={{ marginBottom: 18 }}>
        <div className="card tight stat"><span className="stat-ico cyan"><Icon name="target" /></span><span className="big num"><CountUp value={stats.hit * 100} suffix="%" /></span><span className="lbl">{t("Leg hit rate · {n} graded", { n: stats.legs })}</span></div>
        <div className="card tight stat"><span className="stat-ico green"><Icon name="trophy" /></span><span className="big num"><CountUp value={stats.couponHit * 100} suffix="%" /></span><span className="lbl">{t("Coupons won · {n} settled", { n: stats.coupons })}</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="trend" /></span><span className="big num" style={{ color: stats.profit >= 0 ? "#86efac" : "#fda4af" }}><CountUp value={stats.profit} decimals={2} prefix={stats.profit >= 0 ? "+" : ""} /><small>u</small></span><span className="lbl">{t("Profit with your stakes")}{money(stats.profit)}</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="chart" /></span><span className="big num"><CountUp value={stats.roi * 100} prefix={stats.roi >= 0 ? "+" : ""} /><small>%</small></span><span className="lbl">{t("ROI per leg")}</span></div>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <div className="seg">
          {[["all", "All"], ["pending", "Pending"], ["won", "Won"], ["lost", "Lost"]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{t(l)}</button>)}
        </div>
        <span className="spacer" />
        <label className="row" style={{ gap: 8, fontSize: 12.5 }}><span className="muted">{t("Unit size")}</span><input className="input" style={{ height: 34, width: 90 }} inputMode="decimal" value={unit} onChange={(e) => changeUnit(e.target.value)} aria-label={t("Unit size")} /></label>
        {entries.length > 0 && <button className="btn ghost sm" onClick={() => { if (confirm(t("Clear all your tracked coupons?"))) clear(); }}>{t("Clear all")}</button>}
      </div>

      {list.length === 0 ? (
        <div className="empty"><Icon name="history" />{t("Nothing here yet.")}<br /><small>{t("Track the")} <Link href="/coupon" style={{ color: "#c4b5fd" }}>{t("Coupon du jour").toLowerCase()}</Link>, {t("a")} <Link href="/grosse-cote" style={{ color: "#c4b5fd" }}>{t("Grosse cote").toLowerCase()}</Link> {t("or your own coupon and it lands here, graded automatically.")}</small></div>
      ) : list.map((e) => {
        const st = status(e.legs);
        const isOpen = open === e.id;
        const stake = e.stake ?? 1;
        return (
          <section key={e.id} className="card" style={{ marginBottom: 12, padding: 0 }}>
            <button className="row" style={{ width: "100%", padding: 16, flexWrap: "nowrap", textAlign: "left" }} onClick={() => setOpen(isOpen ? null : e.id)}>
              <span className={`stat-ico ${st === "won" ? "green" : st === "lost" ? "live" : ""}`} style={{ margin: 0 }}><Icon name={st === "won" ? "check" : st === "lost" ? "x" : "clock"} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>{e.title}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>{new Date(e.at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })} · {t("{n} legs · {w}W {l}L", { n: e.legs.length, w: e.legs.filter((l) => l.result === "W").length, l: e.legs.filter((l) => l.result === "L").length })} · {t("Stake")} {stake}u</div>
              </span>
              <span className={`pill ${st === "won" ? "green" : st === "lost" ? "red" : "amber"}`}>{t(st)}</span>
              <b className="num" style={{ fontSize: 18, marginLeft: 6 }}>{product(e.legs).toFixed(2)}</b>
              <Icon name={isOpen ? "down" : "chevron"} size={16} />
            </button>
            {isOpen && (
              <div style={{ padding: "0 16px 16px" }}>
                <div className="ticket-legs" style={{ margin: "0 0 12px" }}>
                  {e.legs.map((l) => (
                    <div key={l.eventId} className={`leg res-${l.result || ""}`}>
                      <TeamLogo team={{ logo: l.homeLogo, short: l.home }} size={28} />
                      <Link href={`/match/${l.league}/${l.eventId}`} className="lg-main">
                        <b>{tm(l.label)} <span className="muted" style={{ fontWeight: 500 }}>@ {odds2(l.odds)}</span></b>
                        <small>{l.home} – {l.away} · {dayLabel(l.date)} {localTime(l.date)}{l.score ? ` · ${t("FT {score}", { score: l.score })}` : ""}</small>
                      </Link>
                      <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        {["W", "L", "V"].map((r) => (
                          <button key={r} className={`icon-btn ${l.result === r ? "on" : ""}`} style={{ width: 30, height: 30, fontSize: 12, fontWeight: 800 }}
                            onClick={() => grade(e.id, l.eventId, l.result === r ? null : r)}>{t(r === "V" ? "Void" : r).slice(0, 1)}</button>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="row">
                  <label className="row" style={{ gap: 8, fontSize: 12.5 }}><span className="muted">{t("Stake")}</span><input className="input" style={{ height: 34, width: 80 }} inputMode="decimal" value={stake} onChange={(ev) => setStake(e.id, ev.target.value)} aria-label={t("Stake")} /><span className="muted">u{money(stake)}</span></label>
                  {st !== "pending" && <span className="pill" style={{ color: st === "won" ? "#86efac" : "#fda4af" }}>{t("Profit")}: {st === "won" ? "+" : "-"}{(st === "won" ? stake * payout(e) - stake : stake).toFixed(2)}u{money(st === "won" ? stake * payout(e) - stake : -stake)}</span>}
                  <span className="spacer" />
                  <button className="btn ghost sm" onClick={() => remove(e.id)}>{t("Delete")}</button>
                </div>
                <p className="note" style={{ marginBottom: 0 }}>{t("Results fill in automatically after full time. W / L / V lets you correct one by hand.")}</p>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
