"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useTrack } from "../components/Providers";
import { LeagueFlag, Skeleton, TeamLogo, Tier, dayLabel, localTime, odds2, pct } from "../components/ui";
import { chanceText } from "../components/Coupon";
import { product } from "../../lib/coupon";
import { LEAGUE_BY_ID } from "../../lib/leagues";
import { CountUp } from "../components/Motion";

const TABS = [["games", "All games"], ["daily", "Daily coupons"], ["mine", "My coupons"]];

export default function History() {
  const [tab, setTab] = useState("games");
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const track = useTrack();

  useEffect(() => {
    let alive = true;
    setData(null); setErr("");
    fetch(`/api/results?days=${days}`).then((r) => r.json()).then((d) => { if (alive) { if (d.error) setErr(d.error); setData(d); } })
      .catch(() => alive && setErr("Couldn't load the history."));
    return () => { alive = false; };
  }, [days]);

  return (
    <>
      <Top title="History" sub="Every game the engine picked, graded from final scores">
        {tab === "mine" && <button className="tile-btn" aria-label="Grade now" title="Grade finished games now" onClick={track.settleAll}><Icon name="refresh" /></button>}
      </Top>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="seg">
          {TABS.map(([k, l]) => <button key={k} className={tab === k ? "on grad" : ""} onClick={() => setTab(k)}>{l}{k === "mine" && track.entries.length ? <span className="n">{track.entries.length}</span> : null}</button>)}
        </div>
        <span className="spacer" />
        {tab !== "mine" && (
          <div className="seg">
            {[[1, "24 h"], [3, "3 days"], [7, "7 days"], [30, "30 days"]].map(([d, l]) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{l}</button>)}
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
  return (
    <div className="empty">
      <Icon name="history" />The game history needs the database.<br />
      <small>Connect Supabase to this project in Vercel (Storage) and redeploy. From then on every pick is saved before kick-off and graded at full time.</small>
    </div>
  );
}

function AllGames({ data }) {
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
        <div className="card tight stat"><span className="stat-ico cyan"><Icon name="target" /></span><span className="big num">{s?.all.rate !== null && s?.all.rate !== undefined ? <CountUp value={s.all.rate * 100} suffix="%" /> : "—"}</span><span className="lbl">Engine hit rate · {s?.all.n || 0} games</span></div>
        <div className="card tight stat"><span className="stat-ico green"><Icon name="check" /></span><span className="big num"><CountUp value={s?.all.w || 0} /></span><span className="lbl">Picks won</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="trend" /></span><span className="big num" style={{ color: (s?.all.units || 0) >= 0 ? "#86efac" : "#fda4af" }}><CountUp value={s?.all.units || 0} decimals={1} prefix={(s?.all.units || 0) >= 0 ? "+" : ""} /><small>u</small></span><span className="lbl">Flat 1u at the pick odds</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="sparkles" /></span><span className="big num">{s?.value.rate !== null && s?.value.rate !== undefined ? <CountUp value={s.value.rate * 100} suffix="%" /> : "—"}</span><span className="lbl">Value picks · {s?.value.n || 0} graded</span></div>
      </div>

      {s?.all.n > 0 && (
        <div className="grid g-2" style={{ marginBottom: 18 }}>
          <section className="card">
            <div className="card-head"><h3>By confidence</h3></div>
            {Object.entries(s.byTier).filter(([, v]) => v.n).map(([t, v]) => (
              <div key={t} style={{ marginBottom: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><Tier t={t} /><span className="muted" style={{ fontSize: 12.5 }}>{v.w}/{v.n} · avg @{odds2(v.avgOdds)} · <b style={{ color: v.units >= 0 ? "#86efac" : "#fda4af" }}>{v.units >= 0 ? "+" : ""}{v.units}u</b></span></div>
                <div className="bar"><i style={{ width: `${(v.rate || 0) * 100}%` }} /></div>
              </div>
            ))}
          </section>
          <section className="card">
            <div className="card-head"><h3>By league</h3></div>
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
          {[["all", "All"], ["W", "Won"], ["L", "Lost"]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <span className="spacer" />
        <div className="search" style={{ width: 240, maxWidth: "100%" }}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team or league" aria-label="Search history" />
        </div>
      </div>

      {games.length === 0 ? (
        <div className="empty"><Icon name="history" />No graded games in this window yet.<br /><small>Picks are saved before kick-off and graded at full time, so the record fills up as games finish.</small></div>
      ) : byDay.map(([d, list]) => (
        <section key={d} style={{ marginBottom: 16 }}>
          <div className="league-head"><b>{d}</b><span className="muted">{list.length} games · {list.filter((g) => g.pick_result === "W").length} won</span></div>
          {list.map((g) => (
            <Link key={g.event_id} href={`/match/${g.league}/${g.event_id}`} className="mrow fade-in">
              <div className="when"><span className="pill ft">FT</span><small>{localTime(g.kickoff)}</small></div>
              <div className="teams">
                {[["home", g.home, g.home_logo, g.home_score], ["away", g.away, g.away_logo, g.away_score]].map(([k, n, logo, sc]) => (
                  <div key={k} className="team"><TeamLogo team={{ logo, short: n }} size={22} /><span className="nm">{n}</span><span className="sc num">{sc}</span></div>
                ))}
              </div>
              <div className="odds3" />
              <div className="pickbox">
                <span className="txt">
                  <b>{g.pick_label}</b>
                  <small>{g.pick_est ? "≈ " : "@ "}{odds2(g.pick_odds)} · <LeagueFlag league={LEAGUE_BY_ID[g.league]} size={10} /> {LEAGUE_BY_ID[g.league]?.short || g.league}</small>
                </span>
                <span className={`result-badge r-${g.pick_result || "P"}`}>{g.pick_result === "W" ? "✓" : g.pick_result === "L" ? "✗" : g.pick_result || "…"}</span>
              </div>
            </Link>
          ))}
        </section>
      ))}
      {games.length > shown && <button className="btn soft block" onClick={() => setShown((n) => n + 150)}>Show more ({games.length - shown} left)</button>}
    </>
  );
}

function DailyCoupons({ data }) {
  if (!data) return <Skeleton rows={4} h={90} />;
  if (!data.db) return <NoDb />;
  const byDay = {};
  for (const c of data.daily || []) (byDay[c.day] = byDay[c.day] || {})[c.kind] = c;
  const daysList = Object.keys(byDay).sort().reverse();
  const all = (data.daily || []).filter((c) => c.result);
  const rate = (kind) => { const l = all.filter((c) => c.kind === kind); return l.length ? `${l.filter((c) => c.result === "W").length}/${l.length}` : "—"; };
  if (!daysList.length) return <div className="empty"><Icon name="ticket" />No daily coupons archived yet.<br /><small>The coupon du jour and grosse cote du jour are saved the first time they're published each day.</small></div>;
  return (
    <>
      <div className="grid g-2 stagger" style={{ marginBottom: 18 }}>
        <div className="card tight stat"><span className="stat-ico green"><Icon name="ticket" /></span><span className="big num">{rate("safe")}</span><span className="lbl">Coupons du jour won</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="bolt" /></span><span className="big num">{rate("grosse")}</span><span className="lbl">Grosses cotes won</span></div>
      </div>
      {daysList.map((d) => (
        <section key={d} className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>{new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</h3></div>
          <div className="grid g-2" style={{ gap: 14 }}>
            {[["safe", "Coupon du jour", "ticket"], ["grosse", "Grosse cote du jour", "bolt"]].map(([k, title, icon]) => {
              const c = byDay[d][k];
              if (!c) return <div key={k} className="empty" style={{ padding: 20 }}>No {title.toLowerCase()} that day.</div>;
              const st = c.result === "W" ? "won" : c.result === "L" ? "lost" : "open";
              return (
                <div key={k} className="card flat tight" style={{ background: "rgba(255,255,255,.02)" }}>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <span className={`stat-ico ${st === "won" ? "green" : st === "lost" ? "live" : ""}`} style={{ margin: 0 }}><Icon name={icon} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}><b>{title}</b><div className="muted" style={{ fontSize: 12 }}>{c.legs.length} legs · {chanceText(c.chance)}</div></div>
                    <span className={`pill ${st === "won" ? "green" : st === "lost" ? "red" : "amber"}`}>{st}</span>
                    <b className="num grad-text" style={{ fontSize: 20 }}>{odds2(c.odds)}</b>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {c.legs.map((l) => (
                      <div key={l.eventId} className="kv" style={{ alignItems: "center" }}>
                        <span style={{ minWidth: 0 }}><b style={{ color: "var(--text)", fontWeight: 600 }}>{l.label}</b> <span className="dim">@{odds2(l.odds)}</span><br /><small>{l.home} – {l.away}{l.score ? ` · ${l.score}` : ""}</small></span>
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

function MyCoupons() {
  const { entries, remove, grade, clear } = useTrack();
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");

  const stats = useMemo(() => {
    const legs = entries.flatMap((e) => e.legs).filter((l) => l.result === "W" || l.result === "L");
    const w = legs.filter((l) => l.result === "W").length;
    const units = legs.reduce((a, l) => a + (l.result === "W" ? l.odds - 1 : -1), 0);
    const done = entries.filter((e) => status(e.legs) !== "pending");
    const cw = done.filter((e) => status(e.legs) === "won").length;
    return { legs: legs.length, hit: legs.length ? w / legs.length : 0, units, roi: legs.length ? units / legs.length : 0, coupons: done.length, couponHit: done.length ? cw / done.length : 0 };
  }, [entries]);

  const list = entries.filter((e) => filter === "all" || status(e.legs) === filter);

  return (
    <>
      <div className="grid g-4 stagger" style={{ marginBottom: 18 }}>
        <div className="card tight stat"><span className="stat-ico cyan"><Icon name="target" /></span><span className="big num"><CountUp value={stats.hit * 100} suffix="%" /></span><span className="lbl">Leg hit rate · {stats.legs} graded</span></div>
        <div className="card tight stat"><span className="stat-ico green"><Icon name="trophy" /></span><span className="big num"><CountUp value={stats.couponHit * 100} suffix="%" /></span><span className="lbl">Coupons won · {stats.coupons} settled</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="trend" /></span><span className="big num" style={{ color: stats.units >= 0 ? "#86efac" : "#fda4af" }}><CountUp value={stats.units} decimals={2} prefix={stats.units >= 0 ? "+" : ""} /><small>u</small></span><span className="lbl">Flat 1u per leg</span></div>
        <div className="card tight stat"><span className="stat-ico"><Icon name="chart" /></span><span className="big num"><CountUp value={stats.roi * 100} prefix={stats.roi >= 0 ? "+" : ""} /><small>%</small></span><span className="lbl">ROI per leg</span></div>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <div className="seg">
          {[["all", "All"], ["pending", "Pending"], ["won", "Won"], ["lost", "Lost"]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <span className="spacer" />
        {entries.length > 0 && <button className="btn ghost sm" onClick={() => { if (confirm("Clear all your tracked coupons?")) clear(); }}>Clear all</button>}
      </div>

      {list.length === 0 ? (
        <div className="empty"><Icon name="history" />Nothing here yet.<br /><small>Track the <Link href="/coupon" style={{ color: "#c4b5fd" }}>coupon du jour</Link>, a <Link href="/grosse-cote" style={{ color: "#c4b5fd" }}>grosse cote</Link> or your own coupon and it lands here, graded automatically.</small></div>
      ) : list.map((e) => {
        const st = status(e.legs);
        const isOpen = open === e.id;
        return (
          <section key={e.id} className="card" style={{ marginBottom: 12, padding: 0 }}>
            <button className="row" style={{ width: "100%", padding: 16, flexWrap: "nowrap", textAlign: "left" }} onClick={() => setOpen(isOpen ? null : e.id)}>
              <span className={`stat-ico ${st === "won" ? "green" : st === "lost" ? "live" : ""}`} style={{ margin: 0 }}><Icon name={st === "won" ? "check" : st === "lost" ? "x" : "clock"} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>{e.title}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>{new Date(e.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {e.legs.length} legs · {e.legs.filter((l) => l.result === "W").length}W {e.legs.filter((l) => l.result === "L").length}L</div>
              </span>
              <span className={`pill ${st === "won" ? "green" : st === "lost" ? "red" : "amber"}`}>{st}</span>
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
                        <b>{l.label} <span className="muted" style={{ fontWeight: 500 }}>@ {odds2(l.odds)}</span></b>
                        <small>{l.home} – {l.away} · {dayLabel(l.date)} {localTime(l.date)}{l.score ? ` · FT ${l.score}` : ""}</small>
                      </Link>
                      <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        {["W", "L", "V"].map((r) => (
                          <button key={r} className={`icon-btn ${l.result === r ? "on" : ""}`} style={{ width: 30, height: 30, fontSize: 12, fontWeight: 800 }}
                            onClick={() => grade(e.id, l.eventId, l.result === r ? null : r)}>{r}</button>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="row">
                  <span className="note">Results fill in automatically after full time. W / L / V lets you correct one by hand.</span>
                  <span className="spacer" />
                  <button className="btn ghost sm" onClick={() => remove(e.id)}>Delete</button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
