"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Icon from "../../../components/Icons";
import { Top } from "../../../components/Shell";
import { useSlip } from "../../../components/Providers";
import { FollowBtn, toLeg } from "../../../components/Match";
import { liveLabel, useNow, Form, LeagueFlag, Ring, Skeleton, StatusPill, TeamLogo, Tier, TriBar, dayLabel, localTime, odds2, pct } from "../../../components/ui";

const STAT_LABEL = {
  possessionPct: "Possession %", totalShots: "Shots", shotsOnTarget: "Shots on target", wonCorners: "Corners", foulsCommitted: "Fouls",
  yellowCards: "Yellow cards", redCards: "Red cards", saves: "Saves", offsides: "Offsides", accuratePasses: "Accurate passes",
  fieldGoalPct: "FG %", threePointFieldGoalPct: "3PT %", totalRebounds: "Rebounds", assists: "Assists", turnovers: "Turnovers",
};

export default function MatchPage({ params }) {
  const { league, id } = params;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("prono");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/match?league=${league}&id=${id}`, { cache: "no-store" });
      const d = await r.json();
      if (d.error) setError(d.error); else { setData({ ...d, event: { ...d.event, _at: Date.now() } }); setError(""); }
      return d;
    } catch { setError("Couldn't load this match."); return null; }
  }, [league, id]);

  useEffect(() => {
    let stop = false, t;
    const loop = async () => {
      const d = await load();
      if (stop) return;
      if (d?.event?.state === "in") t = setTimeout(loop, 20e3);
      else if (d?.event?.state === "pre" && new Date(d.event.date) - Date.now() < 30 * 60e3) t = setTimeout(loop, 60e3);
    };
    loop();
    return () => { stop = true; clearTimeout(t); };
  }, [load]);

  useEffect(() => { if (data?.event?.state === "in" && tab === "prono" && data.live) setTab("live"); }, [data?.event?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return (<><Top title="Match" /><div className="error">{error}</div><Link href="/matches" className="btn soft" style={{ marginTop: 14 }}>Back to matches</Link></>);
  if (!data) return (<><Top title="Loading match…" /><Skeleton rows={1} h={220} /><div className="grid g-match" style={{ marginTop: 18 }}><Skeleton rows={4} h={90} /></div></>);

  const ev = data.event, a = data.analysis;
  const tabs = [
    ["prono", "Prono"],
    ...(ev.state !== "pre" && (data.live || Object.keys(data.stats || {}).length) ? [["live", ev.state === "in" ? "Live" : "Match stats"]] : []),
    ...(a?.markets?.length ? [["markets", "All markets"]] : []),
    ["form", "Form & table"],
    ...(data.lineups?.some((l) => l.starters.length) ? [["lineups", "Lineups"]] : []),
    ["books", "Bookmakers"],
  ];

  return (
    <>
      <Top title={`${ev.home.short} vs ${ev.away.short}`} sub={<span className="row" style={{ gap: 7 }}><LeagueFlag league={data.league} size={13} />{data.league?.name} · {dayLabel(ev.date)} {localTime(ev.date)}{ev.venue ? ` · ${ev.venue}` : ""}</span>}>
        <Link href="/matches" className="tile-btn desktop-only" aria-label="Back"><Icon name="back" /></Link>
      </Top>

      <section className="card hero glow" style={{ marginBottom: 18 }}>
        <div className="row" style={{ marginBottom: 6 }}>
          <StatusPill ev={ev} />
          {ev.note && <span className="pill violet">{ev.note}</span>}
          <span className="spacer" />
          <FollowBtn ev={ev} />
        </div>
        <div className="scoreboard">
          <div className="side-t">
            <TeamLogo team={ev.home} size={68} />
            <b>{ev.home.name}</b>
            <Form form={ev.home.form} />
            {ev.home.record && <small>{ev.home.record}</small>}
          </div>
          <div className="mid">
            {ev.state === "pre" ? (
              <>
                <span className="kick">{localTime(ev.date)}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{dayLabel(ev.date)}</span>
              </>
            ) : (
              <>
                <span className="bigscore num">{ev.home.score ?? 0}<span className="dim"> : </span>{ev.away.score ?? 0}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{ev.state === "in" ? <LiveClock ev={ev} /> : ev.detail}</span>
              </>
            )}
          </div>
          <div className="side-t">
            <TeamLogo team={ev.away} size={68} />
            <b>{ev.away.name}</b>
            <Form form={ev.away.form} />
            {ev.away.record && <small>{ev.away.record}</small>}
          </div>
        </div>
        {(data.live?.probs || a?.probs) && (
          <div style={{ marginTop: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{data.live ? `Live win probability · ${data.live.minute}'` : "Win probability"}</div>
            <TriBar {...(data.live?.probs || a.probs)} labels={[ev.home.short, ev.away.short]} />
          </div>
        )}
      </section>

      <div className="grid g-match">
        <div style={{ minWidth: 0 }}>
          <Tabs tabs={tabs} tab={tab} setTab={setTab} live={ev.state === "in"} />
          {tab === "prono" && <Prono ev={ev} a={a} />}
          {tab === "live" && <LiveTab data={data} />}
          {tab === "markets" && <Markets ev={ev} a={a} />}
          {tab === "form" && <FormTab data={data} />}
          {tab === "lineups" && <Lineups data={data} />}
          {tab === "books" && <Books ev={ev} league={league} />}
        </div>
        <div className="stack">
          <AiCard data={data} />
          <section className="card flat">
            <div className="card-head"><h3>Match facts</h3></div>
            {a?.xg && <div className="kv"><span>Expected goals (model)</span><b className="num">{a.xg.home} – {a.xg.away}</b></div>}
            {ev.odds && <div className="kv"><span>{ev.odds.provider} 1X2</span><b className="num">{odds2(ev.odds.home)} / {ev.odds.draw ? odds2(ev.odds.draw) + " / " : ""}{odds2(ev.odds.away)}</b></div>}
            {ev.odds?.homeOpen && <div className="kv"><span>Opening 1X2</span><b className="num">{odds2(ev.odds.homeOpen)} / {ev.odds.drawOpen ? odds2(ev.odds.drawOpen) + " / " : ""}{odds2(ev.odds.awayOpen)}</b></div>}
            {ev.odds?.total && <div className="kv"><span>Goal line</span><b className="num">O/U {ev.odds.total.line} · {odds2(ev.odds.total.over)} / {odds2(ev.odds.total.under)}</b></div>}
            <div className="kv"><span>Data quality</span><b>{a?.quality === "market" ? "Full market" : a?.quality === "partial" ? "1X2 only" : a?.quality === "stats" ? "Table & form only" : "—"}</b></div>
            {ev.venue && <div className="kv"><span>Venue</span><b>{ev.venue}</b></div>}
          </section>
        </div>
      </div>
    </>
  );
}

function LiveClock({ ev }) {
  const now = useNow(15000);
  const label = liveLabel(ev, now);
  return <>{label}{ev.detail && ev.detail !== label && !/^\d+'/.test(ev.detail) ? ` · ${ev.detail}` : ""}</>;
}

// Tab bar with a gradient underline that slides to the active tab.
function Tabs({ tabs, tab, setTab, live }) {
  const ref = useRef(null);
  const [ind, setInd] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector("button.on");
    if (el) setInd({ x: el.offsetLeft + 10, w: el.offsetWidth - 20 });
  }, [tab, tabs.length]);
  return (
    <div className="tabs" role="tablist" ref={ref}>
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
          {k === "live" && live && <span className="pill live" style={{ background: "none", padding: 0 }} />}{l}
        </button>
      ))}
      {ind && <span className="tab-ind" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} />}
    </div>
  );
}

function BigPick({ ev, m, title, accent }) {
  const slip = useSlip();
  if (!m) return null;
  const on = slip.has(ev.id, m.key);
  return (
    <section className={`card ${accent ? "glow" : ""}`} style={{ marginBottom: 14 }}>
      <div className="row" style={{ flexWrap: "nowrap", gap: 16 }}>
        <Ring value={m.safe ?? m.p} size={76} stroke={7} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="eyebrow">{title}</div>
          <div style={{ fontSize: 21, fontWeight: 750, letterSpacing: "-.02em", margin: "4px 0" }}>{m.label}</div>
          <div className="row" style={{ gap: 8 }}>
            <span className="num" style={{ fontWeight: 800, fontSize: 17 }}>{m.estimated ? "≈ " : "@ "}{odds2(m.odds)}</span>
            <Tier t={m.tier} />
            {m.ev !== null && m.ev !== undefined && !m.estimated && <span className={`pill ${m.ev > 0 ? "green" : ""}`}>EV {m.ev > 0 ? "+" : ""}{Math.round(m.ev * 100)}%</span>}
            {m.v > 0 && <span className="pill">void {pct(m.v)}</span>}
          </div>
        </div>
        <button className={`btn ${on ? "soft" : "primary"} sm`} onClick={() => slip.toggle(toLeg(ev, m))}><Icon name={on ? "check" : "plus"} />{on ? "Added" : "Add"}</button>
      </div>
      {m.estimated && <p className="note" style={{ margin: "12px 0 0" }}>No live price for this market on the feed: fair odds are {odds2(m.fair)}. Take it on 1xBet only at <b>{odds2(m.odds)}</b> or better.</p>}
    </section>
  );
}

function Prono({ ev, a }) {
  if (!a || (!a.pick && !a.markets?.length)) return <div className="empty">No prices or table data for this match yet. Check back closer to kick-off.</div>;
  return (
    <div className="fade-in">
      <BigPick ev={ev} m={a.pick} title={ev.state === "pre" ? "Engine pick · safest playable market" : "Pre-match pick"} accent />
      {a.value && a.value.key !== a.pick?.key && <BigPick ev={ev} m={a.value} title="Value pick · model beats the price" />}
      {a.scores?.length > 0 && (
        <section className="card flat" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Likeliest scores</h3></div>
          <div className="row">
            {a.scores.map((s) => (
              <div key={s.score} className="card tight flat" style={{ minWidth: 86, textAlign: "center", background: "rgba(255,255,255,.03)" }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{s.score}</div>
                <div className="muted" style={{ fontSize: 12 }}>{pct(s.p)}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      {a.notes?.length > 0 && (
        <section className="card flat" style={{ marginBottom: 14 }}>
          {a.notes.map((n, i) => <div key={i} className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", marginBottom: 6 }}><Icon name="trend" size={16} style={{ color: "var(--purple)", marginTop: 2 }} /><span>{n}</span></div>)}
        </section>
      )}
      <p className="note">Model: {a.basis}. Probabilities are calibrated to the market; the pick is the market with the best balance of hit chance and price (minimum ~1.20).</p>
    </div>
  );
}

function Markets({ ev, a }) {
  const slip = useSlip();
  const groups = useMemo(() => {
    const g = {};
    for (const m of a.markets) (g[m.group] = g[m.group] || []).push(m);
    return Object.entries(g);
  }, [a.markets]);
  return (
    <div className="fade-in" style={{ overflowX: "auto" }}>
      {groups.map(([group, list]) => (
        <div key={group}>
          <div className="mgroup">{group}</div>
          <table className="mtable">
            <thead><tr><th>Market</th><th className="r">Chance</th><th className="r">Fair</th><th className="r">Price</th><th className="r">EV</th><th /></tr></thead>
            <tbody>
              {list.map((m) => {
                const on = slip.has(ev.id, m.key);
                return (
                  <tr key={m.key} className={a.pick?.key === m.key ? "best" : ""}>
                    <td><b style={{ fontWeight: 600 }}>{m.label}</b>{a.pick?.key === m.key && <span className="pill grad" style={{ marginLeft: 8 }}>pick</span>}</td>
                    <td className="r num">{pct(m.p)}{m.v > 0 ? <span className="dim"> +{pct(m.v)}v</span> : null}</td>
                    <td className="r num muted">{odds2(m.fair)}</td>
                    <td className="r num"><b>{m.estimated ? <span className="dim">≈{odds2(m.odds)}</span> : odds2(m.odds)}</b></td>
                    <td className={`r num ${m.ev > 0 && !m.estimated ? "ev-pos" : "ev-neg"}`}>{m.estimated ? "—" : `${m.ev > 0 ? "+" : ""}${Math.round(m.ev * 100)}%`}</td>
                    <td><button className={`icon-btn ${on ? "on" : ""}`} style={{ marginLeft: "auto", width: 30, height: 30 }} aria-label="Add to coupon" onClick={() => slip.toggle(toLeg(ev, { ...m, tier: null }))}><Icon name={on ? "check" : "plus"} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <p className="note">Chance = model probability (v = void, stake returned). Fair = break-even price. Price is the bookmaker's when known; ≈ marks an estimate (fair minus a typical 6% margin).</p>
    </div>
  );
}

function StatBar({ label, h, a }) {
  const hv = Number(h) || 0, av = Number(a) || 0, tot = hv + av || 1;
  return (
    <div className="sbar">
      <div className="lab"><b className="num">{h ?? "–"}</b><span>{label}</span><b className="num">{a ?? "–"}</b></div>
      <div className="tw"><i className="l" style={{ width: `${(hv / tot) * 100}%` }} /><i className="r" style={{ width: `${(av / tot) * 100}%` }} /></div>
    </div>
  );
}

function LiveTab({ data }) {
  const { event: ev, live, stats, timeline, commentary } = data;
  return (
    <div className="stagger stack" style={{ gap: 14 }}>
      {live && (
        <section className="card">
          <div className="card-head"><span className="pill live">LIVE MODEL</span><h3>{live.minute}' re-pricing</h3></div>
          <div className="grid g-3" style={{ gap: 12 }}>
            <div className="card tight flat" style={{ textAlign: "center", background: "rgba(255,255,255,.03)" }}>
              <div className="eyebrow">Next goal</div>
              <div style={{ fontSize: 15, fontWeight: 750, marginTop: 6 }}>{ev.home.short} {pct(live.nextGoal.home)}</div>
              <div style={{ fontSize: 15, fontWeight: 750 }}>{ev.away.short} {pct(live.nextGoal.away)}</div>
              <div className="muted" style={{ fontSize: 12 }}>No more goals {pct(live.nextGoal.none)}</div>
            </div>
            {live.overs.map((o) => (
              <div key={o.line} className="card tight flat" style={{ display: "grid", placeItems: "center", gap: 6, background: "rgba(255,255,255,.03)" }}>
                <Ring value={o.p} size={60} stroke={5} />
                <span className="muted" style={{ fontSize: 12.5 }}>Over {o.line} (final)</span>
              </div>
            ))}
          </div>
          <div className="kv" style={{ marginTop: 10 }}><span>Both teams score (final)</span><b>{pct(live.btts)}</b></div>
          <div className="kv"><span>Goals still expected</span><b className="num">{live.remainingXg.home} – {live.remainingXg.away}</b></div>
        </section>
      )}
      {Object.keys(stats || {}).length > 0 && (
        <section className="card">
          <div className="card-head"><h3>Stats</h3><span className="link">{ev.home.short} · {ev.away.short}</span></div>
          {Object.entries(stats).map(([k, v]) => <StatBar key={k} label={STAT_LABEL[k] || k} h={v.home} a={v.away} />)}
        </section>
      )}
      {timeline?.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>Key moments</h3></div>
          <div className="timeline">
            {timeline.map((t, i) => (
              <div key={i} className={`tl ${t.goal ? "goal" : /red/i.test(t.type) ? "red" : ""}`}>
                <span className="m">{t.minute}</span>
                <span className="x"><b style={{ fontSize: 12.5 }}>{t.goal ? "⚽ " : /red/i.test(t.type) ? "🟥 " : /yellow/i.test(t.type) ? "🟨 " : ""}{t.type}</b><br /><span className="muted">{t.text}</span></span>
              </div>
            ))}
          </div>
        </section>
      )}
      {commentary?.length > 0 && (
        <section className="card flat">
          <div className="card-head"><h3>Commentary</h3></div>
          {commentary.map((c, i) => <div key={i} className="kv" style={{ justifyContent: "flex-start" }}><span style={{ minWidth: 44 }}>{c.minute}</span><span style={{ color: "var(--text)" }}>{c.text}</span></div>)}
        </section>
      )}
    </div>
  );
}

function FormTab({ data }) {
  const { event: ev, form, table, h2h } = data;
  return (
    <div className="fade-in stack" style={{ gap: 14 }}>
      <div className="grid g-2" style={{ gap: 14 }}>
        {["home", "away"].map((s) => (
          <section key={s} className="card">
            <div className="card-head"><TeamLogo team={ev[s]} size={30} /><h3>{ev[s].short}</h3><span className="link"><Form form={ev[s].form} /></span></div>
            {(form?.[s] || []).length === 0 ? <div className="muted">No recent games.</div> : form[s].map((g, i) => (
              <div key={i} className="kv">
                <span><span className={`form`}><i className={g.result}>{g.result}</i></span> {g.at === "@" ? "at" : "vs"} {g.opponent}</span>
                <b className="num">{g.score}</b>
              </div>
            ))}
          </section>
        ))}
      </div>
      {h2h?.length > 0 && (
        <section className="card flat">
          <div className="card-head"><h3>Head to head</h3></div>
          {h2h.map((g, i) => <div key={i} className="kv"><span>{g.date ? new Date(g.date).toLocaleDateString() : ""}</span><b className="num">{g.score}</b></div>)}
        </section>
      )}
      {table?.length > 0 && (
        <section className="card" style={{ overflowX: "auto" }}>
          <div className="card-head"><h3>Table</h3></div>
          <table className="tbl">
            <thead><tr><th>#</th><th>Team</th><th className="r">P</th><th className="r">W</th><th className="r">D</th><th className="r">L</th><th className="r">GD</th><th className="r">Pts</th></tr></thead>
            <tbody>
              {table.map((r, i) => {
                const hl = r.id === ev.home.id || r.id === ev.away.id || r.team === ev.home.name || r.team === ev.away.name;
                return (
                  <tr key={i} className={hl ? "hl" : ""}>
                    <td className="muted">{r.rank ?? i + 1}</td><td><b style={{ fontWeight: hl ? 750 : 500 }}>{r.team}</b></td>
                    <td className="r num">{r.gp}</td><td className="r num">{r.w}</td><td className="r num">{r.d}</td><td className="r num">{r.l}</td>
                    <td className="r num">{(r.gf ?? 0) - (r.ga ?? 0)}</td><td className="r num"><b>{r.pts}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Lineups({ data }) {
  const { event: ev, lineups } = data;
  return (
    <div className="fade-in grid g-2" style={{ gap: 14 }}>
      {lineups.map((l) => {
        const t = l.teamId === ev.home.id ? ev.home : ev.away;
        return (
          <section key={l.teamId} className="card">
            <div className="card-head"><TeamLogo team={t} size={30} /><h3>{t.short}</h3>{l.formation && <span className="link pill violet">{l.formation}</span>}</div>
            {l.starters.map((p, i) => <div key={i} className="kv"><span>{p.jersey ? `#${p.jersey}` : ""} {p.pos}</span><b style={{ fontWeight: 600 }}>{p.name}</b></div>)}
          </section>
        );
      })}
    </div>
  );
}

function Books({ ev, league }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams({ league, date: ev.date, home: ev.home.name, away: ev.away.name });
    fetch(`/api/books?${q}`).then((r) => r.json()).then(setD).catch(() => setD({ error: "Couldn't load bookmakers." }));
  }, [league, ev.date, ev.home.name, ev.away.name]);
  if (!d) return <Skeleton rows={4} h={44} />;
  if (d.enabled === false) return (
    <div className="card flat fade-in">
      <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="chart" /></span><h3>Compare 1xBet, Pinnacle, Bet365…</h3></div>
      <p className="muted" style={{ marginTop: 0 }}>Bookmaker comparison uses The Odds API. Add <code>ODDS_API_KEY</code> to the server environment to switch it on. Everything else on the site works without it.</p>
    </div>
  );
  if (d.error || !d.rows?.length) return <div className="empty fade-in">{d.error || d.message || "No bookmaker prices for this match."}</div>;
  const best = d.best || {};
  const cell = (v, f) => <td className={`r num ${v && best[f]?.price === v ? "ev-pos" : ""}`}>{odds2(v)}</td>;
  return (
    <div className="fade-in" style={{ overflowX: "auto" }}>
      <table className="tbl">
        <thead><tr><th>Bookmaker</th><th className="r">1</th>{ev.sport === "soccer" && <th className="r">X</th>}<th className="r">2</th><th className="r">Over</th><th className="r">Under</th></tr></thead>
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.key} className={r.key === "onexbet" ? "hl" : ""}>
              <td><b style={{ fontWeight: 600 }}>{r.title}</b>{r.line !== null && <span className="dim"> · {r.line}</span>}</td>
              {cell(r.home, "home")}{ev.sport === "soccer" && cell(r.draw, "draw")}{cell(r.away, "away")}{cell(r.over, "over")}{cell(r.under, "under")}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">Green = best price available. Prices refresh every 30 minutes to protect your Odds API credits{d.quota?.remaining ? ` (${d.quota.remaining} left)` : ""}.</p>
    </div>
  );
}

function AiCard({ data }) {
  const [state, setState] = useState({ busy: false, res: null, err: "" });
  const live = data.event.state === "in";
  const run = async () => {
    setState({ busy: true, res: null, err: "" });
    try {
      const r = await fetch("/api/insight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const d = await r.json();
      setState({ busy: false, res: d.error ? null : d, err: d.error || "" });
    } catch { setState({ busy: false, res: null, err: "The analyst didn't answer — try again." }); }
  };
  const i = state.res?.insight;
  return (
    <section className="card">
      <div className="card-head">
        <span className="stat-ico" style={{ margin: 0 }}><Icon name="sparkles" /></span>
        <div><h3>AI analyst</h3><div className="muted" style={{ fontSize: 12 }}>{live ? "Live read from score, minute & stats" : "Full analysis: odds, model, form, table, lineups"}</div></div>
      </div>
      {!i && !state.busy && (
        <button className="btn primary block" onClick={run}><Icon name="sparkles" />{live ? "Live analysis" : "Full analysis"}</button>
      )}
      {state.busy && <div className="stack" style={{ gap: 8 }}><div className="shimmer" style={{ height: 22, width: "70%" }} /><div className="shimmer" style={{ height: 64 }} /><div className="shimmer" style={{ height: 44 }} /></div>}
      {state.err && <div className="error" style={{ marginTop: 10 }}>{state.err}</div>}
      {i && (
        <div className="ai-box fade-in">
          <h3>{i.headline}</h3>
          <div className="ai-best">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow">Best bet</div>
              <b style={{ fontSize: 16 }}>{i.best_bet.selection}</b>
            </div>
            <span className="num" style={{ fontWeight: 800, fontSize: 18 }}>{odds2(i.best_bet.odds)}</span>
            <Tier t={i.best_bet.confidence} />
          </div>
          <p>{i.best_bet.reasoning}</p>
          {i.live_read && <><div className="eyebrow">Live read</div><p>{i.live_read}</p></>}
          <p>{i.verdict}</p>
          {i.key_factors?.length > 0 && <><div className="eyebrow">Key factors</div><ul>{i.key_factors.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
          {i.risks?.length > 0 && <><div className="eyebrow">Risks</div><ul>{i.risks.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
          {i.alternatives?.length > 0 && <><div className="eyebrow">Alternatives</div><ul>{i.alternatives.map((x, k) => <li key={k}><b>{x.selection}</b> @ {odds2(x.odds)} — {x.reasoning}</li>)}</ul></>}
          {i.score_prediction && <div className="kv"><span>Score call</span><b>{i.score_prediction}</b></div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn soft sm" onClick={run}><Icon name="refresh" />Re-run</button>
            <span className="note" style={{ marginLeft: "auto" }}>{state.res.model}</span>
          </div>
        </div>
      )}
    </section>
  );
}
