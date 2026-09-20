"use client";
import { useEffect, useMemo, useState } from "react";
import { buildSlip, product, hitChance, slipText } from "../lib/slip";

const SCOPES = ["Today", "Tomorrow", "Weekend", "7 days"];
const TARGETS = [2, 3, 5, 10, 20, 50, 100, 200, 400];
const CONF_COLOR = { High: "#2E8B57", "Med-High": "#5FA36F", Medium: "#B8A33A", Low: "#8A8F8B", Skip: "#C9CFCA" };
const DEFAULT_ON = ["soccer_epl", "soccer_spain_la_liga", "soccer_germany_bundesliga", "soccer_italy_serie_a", "soccer_france_ligue_one"];
const RUNS_KEY = "skii-runs";

const fmtTime = (iso) => { const d = new Date(iso); return `${d.toISOString().slice(5, 10)} ${d.toISOString().slice(11, 16)} GMT`; };
const shortWhen = (iso) => fmtTime(iso).slice(0, 11);

function inScope(iso, scope) {
  const t = new Date(iso), now = new Date();
  const dayStart = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
  const add = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
  const today = dayStart(now);
  if (scope === "Today") return t >= today && t < add(today, 1);
  if (scope === "Tomorrow") return t >= add(today, 1) && t < add(today, 2);
  if (scope === "Weekend") { const dow = now.getUTCDay(); const sat = add(today, dow === 0 ? -1 : (6 - dow + 7) % 7); return t >= sat && t < add(sat, 2); }
  return t >= now && t < add(today, 8);
}
const load = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

export default function Page() {
  const [sports, setSports] = useState([]);
  const [selected, setSelected] = useState(DEFAULT_ON);
  const [scope, setScope] = useState("Weekend");
  const [mode, setMode] = useState("safe");
  const [events, setEvents] = useState([]);
  const [extras, setExtras] = useState({});
  const [picks, setPicks] = useState({});
  const [stars, setStars] = useState([]);
  const [starInfo, setStarInfo] = useState(null);
  const [slip, setSlip] = useState([]);
  const [target, setTarget] = useState(5);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [quota, setQuota] = useState(null);
  const [runs, setRuns] = useState([]);
  const [openRun, setOpenRun] = useState(null);
  const [tab, setTab] = useState("board");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRuns(load(RUNS_KEY, []));
    fetch("/api/sports").then((r) => r.json()).then((d) => { setSports(d.sports || []); if (d.quota?.remaining) setQuota(d.quota); }).catch(() => {});
  }, []);

  const saveRuns = (next) => { setRuns(next); save(RUNS_KEY, next); };
  const toggle = (k) => setSelected((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  const recordRun = (kind, list) => {
    if (!list.length) return;
    const run = {
      id: `${kind}-${Date.now()}`, kind, at: new Date().toISOString(),
      scope, mode, leagues: [...new Set(list.map((p) => p.league))],
      picks: list.map((p) => ({ ...p, result: null })),
    };
    saveRuns([run, ...load(RUNS_KEY, [])].slice(0, 60));
    setOpenRun(run.id);
  };

  const loadOdds = async (refresh = false) => {
    if (!selected.length) { setError("Pick at least one league."); return; }
    setBusy(true); setLoadingOdds(true); setError(""); setStatus("Loading live odds…");
    const all = [];
    for (const key of selected) {
      try {
        const r = await fetch(`/api/odds?sport=${encodeURIComponent(key)}${refresh ? "&refresh=1" : ""}`);
        const d = await r.json();
        if (d.error) setError((p) => `${p ? p + " " : ""}${key}: ${d.error}`);
        if (d.quota?.remaining) setQuota(d.quota);
        all.push(...(d.events || []));
      } catch (e) { setError((p) => `${p ? p + " " : ""}${key}: ${e.message}`); }
    }
    all.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));
    setEvents(all); setPicks({}); setStars([]); setStarInfo(null); setSlip([]);
    setStatus(`${all.length} events loaded.`); setBusy(false); setLoadingOdds(false);
  };

  const visible = useMemo(() => events.filter((e) => inScope(e.commence_time, scope)), [events, scope]);

  const analyze = async () => {
    if (!visible.length) { setError("Load odds first."); return; }
    setBusy(true); setError(""); setStatus("Engine is reading the odds and rating every match…");
    const chunks = []; for (let i = 0; i < visible.length; i += 8) chunks.push(visible.slice(i, i + 8));
    const next = { ...picks }; const fresh = [];
    for (let i = 0; i < chunks.length; i++) {
      setStatus(`Rating batch ${i + 1} of ${chunks.length}…`);
      try {
        const r = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: chunks[i], extras, mode }) });
        const d = await r.json();
        if (d.error) { setError(d.error); continue; }
        (d.picks || []).forEach((p) => { next[p.event_id] = p; fresh.push(p); });
        setPicks({ ...next });
      } catch (e) { setError(e.message); }
    }
    recordRun("engine", fresh);
    setStatus(`Engine done — ${fresh.length} matches rated and saved to history.`); setBusy(false);
  };

  const runStars = async () => {
    if (!visible.length) { setError("Load odds first."); return; }
    setBusy(true); setError(""); setStars([]); setStarInfo(null);
    setStatus("Star pass 1 of 2 — rating every match…");
    try {
      const r = await fetch("/api/star", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: visible, extras, mode }) });
      setStatus("Star pass 2 of 2 — verifying the strongest candidates…");
      const d = await r.json();
      if (d.error) { setError(d.error); setBusy(false); return; }
      setStars(d.stars || []);
      setStarInfo({ rated: d.rated, candidates: d.candidates, rejected: d.rejected, message: d.message });
      if (d.stars?.length) { setSlip(d.stars.map((s) => ({ ...s }))); recordRun("star", d.stars); setTab("stars"); }
      setStatus(d.stars?.length ? `${d.stars.length} star picks confirmed out of ${d.candidates} candidates.` : (d.message || "No star picks today."));
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const legFor = (e, market, selection, odds, confidence) => ({
    event_id: e.id, match: `${e.home} vs ${e.away}`, league: e.league, when: shortWhen(e.commence_time),
    commence_time: e.commence_time, market, selection, odds: Number(odds), confidence: confidence || picks[e.id]?.confidence || "Medium",
  });
  const inSlip = (id, selection) => slip.some((l) => l.event_id === id && l.selection === selection);
  const addLeg = (leg) => {
    if (!leg.odds) return;
    if (inSlip(leg.event_id, leg.selection)) { setSlip(slip.filter((l) => !(l.event_id === leg.event_id && l.selection === leg.selection))); return; }
    setSlip([...slip.filter((l) => l.event_id !== leg.event_id), leg]);
  };

  const moreMarkets = async (e) => {
    setStatus(`Loading extra markets for ${e.home} vs ${e.away}…`);
    try {
      const r = await fetch(`/api/event?sport=${encodeURIComponent(e.sport_key)}&eventId=${encodeURIComponent(e.id)}`);
      const d = await r.json();
      if (d.error) setError(d.error);
      if (d.quota?.remaining) setQuota(d.quota);
      setExtras((x) => ({ ...x, [e.id]: d.markets || {} })); setStatus("");
    } catch (err) { setError(err.message); }
  };

  const buildTarget = () => {
    const legs = buildSlip(Object.values(picks), target);
    setSlip(legs);
    setError(product(legs) < target * 0.9 ? `Not enough rated legs for ~${target}. Rate more leagues or switch to High value.` : "");
  };

  const copy = async (legs, label) => {
    try { await navigator.clipboard.writeText(slipText(legs, label)); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Copy failed — select the text manually."); }
  };

  const gradeInRun = (runId, eventId, result) => {
    saveRuns(runs.map((r) => r.id !== runId ? r : { ...r, picks: r.picks.map((p) => p.event_id === eventId ? { ...p, result } : p) }));
  };
  const runStats = (r) => {
    const s = r.picks.filter((p) => p.result === "W" || p.result === "L");
    const w = s.filter((p) => p.result === "W").length;
    const units = s.reduce((a, p) => a + (p.result === "W" ? p.odds - 1 : -1), 0);
    return { w, l: s.length - w, pending: r.picks.length - s.length, units: units.toFixed(2) };
  };
  const overall = useMemo(() => {
    const all = runs.flatMap((r) => r.picks).filter((p) => p.result === "W" || p.result === "L");
    const w = all.filter((p) => p.result === "W").length;
    const units = all.reduce((a, p) => a + (p.result === "W" ? p.odds - 1 : -1), 0);
    const starAll = runs.filter((r) => r.kind === "star").flatMap((r) => r.picks).filter((p) => p.result === "W" || p.result === "L");
    const starW = starAll.filter((p) => p.result === "W").length;
    return {
      bets: all.length, hit: all.length ? Math.round((w / all.length) * 100) : 0, units: units.toFixed(2),
      roi: all.length ? Math.round((units / all.length) * 100) : 0,
      starBets: starAll.length, starHit: starAll.length ? Math.round((starW / starAll.length) * 100) : 0,
    };
  }, [runs]);

  const groups = useMemo(() => { const g = {}; sports.forEach((s) => { (g[s.group] = g[s.group] || []).push(s); }); return g; }, [sports]);
  const starIds = useMemo(() => new Set(stars.map((s) => s.event_id)), [stars]);

  return (
    <>
      <div className="hero">
        <div className="hero-in">
          <div className="brand">
            <div className="orb">⚡</div>
            <div>
              <div className="title">Skii Pronos Engine</div>
              <div className="sub">Live odds · best market per match · verified star picks</div>
            </div>
          </div>
          <div className="row" style={{ alignItems: "center" }}>
            <div className="tabs">
              <button className={`tab ${tab === "board" ? "on" : ""}`} onClick={() => setTab("board")}>Board</button>
              <button className={`tab ${tab === "stars" ? "on" : ""}`} onClick={() => setTab("stars")}>★ Star picks{stars.length ? ` (${stars.length})` : ""}</button>
              <button className={`tab ${tab === "history" ? "on" : ""}`} onClick={() => setTab("history")}>History ({runs.length})</button>
            </div>
            {quota?.remaining && <span className="quota">{quota.remaining} credits</span>}
          </div>
        </div>
      </div>

      <div className="wrap">
        {tab === "history" && (
          <div>
            <div className="stats">
              <div className="stat"><small>Graded bets</small><b className="num">{overall.bets}</b></div>
              <div className="stat"><small>Hit rate</small><b className="num">{overall.hit}%</b></div>
              <div className="stat"><small>Units</small><b className={`num ${Number(overall.units) >= 0 ? "pos" : "neg"}`}>{overall.units}</b></div>
              <div className="stat"><small>★ Star hit rate</small><b className="num">{overall.starBets ? `${overall.starHit}%` : "—"}</b></div>
            </div>
            <p className="note" style={{ marginBottom: 14 }}>Every engine run is saved here. Grade each pick after the games — the losses are what make the record worth publishing.</p>
            {runs.length === 0 ? <div className="empty">No runs yet. Rate a board or pull star picks and it lands here automatically.</div> : runs.map((r, i) => {
              const s = runStats(r); const open = openRun === r.id;
              return (
                <div className="run" key={r.id} style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}>
                  <button className="run-head" onClick={() => setOpenRun(open ? null : r.id)}>
                    <div>
                      <div className="run-when">{r.kind === "star" ? "★ Star picks" : "Engine run"} · {new Date(r.at).toLocaleString()}</div>
                      <div className="run-meta">{r.scope} · {r.mode === "safe" ? "safe locks" : "high value"} · {r.picks.length} picks · {r.leagues.slice(0, 3).join(", ")}{r.leagues.length > 3 ? "…" : ""}</div>
                    </div>
                    <div className="run-score">
                      {s.w > 0 && <span className="pillW">{s.w}W</span>}
                      {s.l > 0 && <span className="pillL">{s.l}L</span>}
                      {s.pending > 0 && <span className="pillP">{s.pending} pending</span>}
                      <span className={Number(s.units) >= 0 ? "" : ""} style={{ color: Number(s.units) >= 0 ? "#6FD39A" : "#FF8B8B" }}>{Number(s.units) >= 0 ? "+" : ""}{s.units}u</span>
                    </div>
                  </button>
                  {open && (
                    <div className="run-body">
                      {r.picks.map((p) => (
                        <div className="rec" key={p.event_id + p.selection}>
                          <span>{p.when} · {p.match} — <b>{p.selection}</b> @ <span className="num">{Number(p.odds).toFixed(2)}</span></span>
                          <span className="rec-grade">
                            <button className={p.result === "W" ? "w" : ""} onClick={() => gradeInRun(r.id, p.event_id, p.result === "W" ? null : "W")}>W</button>
                            <button className={p.result === "L" ? "l" : ""} onClick={() => gradeInRun(r.id, p.event_id, p.result === "L" ? null : "L")}>L</button>
                            <button className={p.result === "V" ? "v" : ""} onClick={() => gradeInRun(r.id, p.event_id, p.result === "V" ? null : "V")}>V</button>
                          </span>
                        </div>
                      ))}
                      <div className="row" style={{ marginTop: 8 }}>
                        <button className="secondary" onClick={() => copy(r.picks, `${r.kind === "star" ? "★ star picks" : "engine run"} · ${new Date(r.at).toLocaleDateString()}`)}>Copy this run</button>
                        <button className="ghost" onClick={() => saveRuns(runs.filter((x) => x.id !== r.id))}>Delete run</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {runs.length > 0 && <button className="ghost" style={{ marginTop: 10 }} onClick={() => saveRuns([])}>Clear all history</button>}
          </div>
        )}

        {tab === "stars" && (
          <div>
            <div className="star-head">
              <h2>★ Star picks</h2>
              <span className="star-pill">two-pass verified</span>
              {starInfo && <span className="quota">{starInfo.rated} rated · {starInfo.candidates} candidates · {starInfo.rejected} rejected</span>}
            </div>
            {stars.length === 0 ? (
              <div className="empty">
                {starInfo?.message || "No star picks yet. Load odds on the Board, then press “Build star picks”."}
                <div style={{ marginTop: 14 }}><button className="star-btn" style={{ width: "auto", padding: "10px 18px" }} disabled={busy || !visible.length} onClick={runStars}>{busy ? "Working…" : "Build star picks"}</button></div>
              </div>
            ) : (
              <>
                <p className="note" style={{ marginTop: 0, marginBottom: 14 }}>
                  Pass one rates every match; pass two attacks the shortlist and throws out anything soft. What survives is below — and it is already loaded into your slip.
                </p>
                {stars.map((s, i) => (
                  <div className="card starred" key={s.event_id} style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="meta">{s.when} GMT · {s.league} <span className="badge" style={{ background: "var(--star)" }}>★ STAR</span></div>
                    <div className="teams">{s.match}</div>
                    <div className="pick star">
                      <b>{s.selection} @ <span className="num">{s.odds.toFixed(2)}</span></b>
                      <span className="badge" style={{ background: CONF_COLOR[s.confidence] }}>{s.confidence}</span>
                      <div className="why">{s.note || s.reason}</div>
                      {s.risk && <div className="why"><b>Risk:</b> {s.risk}</div>}
                    </div>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="secondary" onClick={() => copy(stars, `★ STAR PICKS · ${scope}`)}>{copied ? "Copied" : "Copy star slip for Telegram"}</button>
                  <button className="ghost" onClick={() => setSlip(stars.map((s) => ({ ...s })))}>Reload into slip</button>
                  <button className="ghost" disabled={busy} onClick={runStars}>Run again</button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "board" && (
          <div className="grid">
            <div className="side">
              <div className="panel">
                {Object.entries(groups).map(([group, list]) => (
                  <div key={group}>
                    <div className="label">{group}</div>
                    <div className="row">
                      {list.map((s) => (
                        <button key={s.key} className={`chip ${selected.includes(s.key) ? "on" : ""} ${s.active === false ? "dim" : ""}`} onClick={() => toggle(s.key)} title={s.active === false ? "Not in season" : ""}>{s.title}</button>
                      ))}
                    </div>
                  </div>
                ))}
                {sports.length === 0 && <div className="status"><span className="dot" />Loading leagues…</div>}
                <div className="label">When</div>
                <div className="row">{SCOPES.map((s) => <button key={s} className={`chip ${scope === s ? "on" : ""}`} onClick={() => setScope(s)}>{s}</button>)}</div>
                <div className="label">Risk</div>
                <div className="row">
                  <button className={`chip ${mode === "safe" ? "on" : ""}`} onClick={() => setMode("safe")}>Safe locks</button>
                  <button className={`chip ${mode === "value" ? "on" : ""}`} onClick={() => setMode("value")}>High value</button>
                </div>
                <button className="primary" disabled={busy} onClick={() => loadOdds(false)}>{busy && loadingOdds ? "Loading…" : "Load live odds"}</button>
                <button className="star-btn" disabled={busy || !visible.length} onClick={runStars}>★ Build star picks</button>
                <div className="row" style={{ marginTop: 9 }}>
                  <button className="secondary" disabled={busy || !visible.length} onClick={analyze}>Rate every match</button>
                  <button className="ghost" disabled={busy || !events.length} onClick={() => loadOdds(true)}>Refresh odds</button>
                </div>
                {status && <div className="status">{busy && <span className="dot" />}{status}</div>}
                {error && <div className="error">{error}</div>}
                <p className="note">Odds come from your configured feed (1xBet when listed, otherwise the next preferred book). Prices move — confirm in the app. Locks are strongest edges, never guarantees.</p>
              </div>
            </div>

            <div>
              {loadingOdds && visible.length === 0 && [0, 1, 2, 3].map((i) => <div className="skel" key={i} style={{ animationDelay: `${i * 90}ms` }} />)}
              {!loadingOdds && visible.length === 0 ? (
                <div className="empty">{events.length ? `No events in “${scope}” — try another window.` : "Choose leagues, then load live odds. Tap any price to add it to the slip."}</div>
              ) : visible.map((e, i) => {
                const p = picks[e.id]; const ex = extras[e.id];
                const main = e.totals.find((t) => t.point === 2.5) || e.totals[0];
                const sp = e.spreads[0];
                const isStar = starIds.has(e.id);
                return (
                  <div className={`card ${isStar ? "starred" : ""} ${slip.some((l) => l.event_id === e.id) ? "picked" : ""}`} key={e.id} style={{ animationDelay: `${Math.min(i * 35, 400)}ms` }}>
                    <div className="meta">{fmtTime(e.commence_time)} · {e.league}{e.bookmaker ? ` · ${e.bookmaker}` : ""}{e.books > 1 ? ` (+${e.books - 1})` : ""}{isStar && <span className="badge" style={{ background: "var(--star)" }}>★ STAR</span>}</div>
                    <div className="teams">{e.home} vs {e.away}</div>
                    {e.h2h ? (
                      <div className="odds-row">
                        {[["W1", e.home, e.h2h.home, e.best_h2h.home], ["X", "Draw", e.h2h.draw, e.best_h2h.draw], ["W2", e.away, e.h2h.away, e.best_h2h.away]].map(([k, name, price, best]) => price ? (
                          <button key={k} className={`odd num ${inSlip(e.id, `${name} ${k}`) ? "on" : ""}`} onClick={() => addLeg(legFor(e, `1X2 ${k}`, `${name} ${k}`, price))}>
                            <small>{k}{best && best.price > price ? ` · best ${best.price.toFixed(2)} ${best.book}` : ""}</small><b>{price.toFixed(2)}</b>
                          </button>
                        ) : null)}
                      </div>
                    ) : <div className="meta">No 1X2 price from the configured books yet.</div>}
                    {(main || sp) && (
                      <div className="odds-row" style={{ marginTop: 6 }}>
                        {main?.over && <button className={`odd num ${inSlip(e.id, `Over ${main.point}`) ? "on" : ""}`} onClick={() => addLeg(legFor(e, `Over ${main.point}`, `Over ${main.point}`, main.over))}><small>Over {main.point}</small><b>{main.over.toFixed(2)}</b></button>}
                        {main?.under && <button className={`odd num ${inSlip(e.id, `Under ${main.point}`) ? "on" : ""}`} onClick={() => addLeg(legFor(e, `Under ${main.point}`, `Under ${main.point}`, main.under))}><small>Under {main.point}</small><b>{main.under.toFixed(2)}</b></button>}
                        {sp?.home && <button className={`odd num ${inSlip(e.id, `${e.home} ${sp.home_point}`) ? "on" : ""}`} onClick={() => addLeg(legFor(e, `Spread ${sp.home_point}`, `${e.home} ${sp.home_point}`, sp.home))}><small>{e.home} {sp.home_point > 0 ? "+" : ""}{sp.home_point}</small><b>{sp.home.toFixed(2)}</b></button>}
                        {sp?.away && <button className={`odd num ${inSlip(e.id, `${e.away} ${sp.away_point}`) ? "on" : ""}`} onClick={() => addLeg(legFor(e, `Spread ${sp.away_point}`, `${e.away} ${sp.away_point}`, sp.away))}><small>{e.away} {sp.away_point > 0 ? "+" : ""}{sp.away_point}</small><b>{sp.away.toFixed(2)}</b></button>}
                      </div>
                    )}
                    {p && (
                      <div className="pick">
                        <b>{p.confidence === "Skip" ? "Skip — no edge" : `${p.selection} @ ${p.odds.toFixed(2)}`}</b>
                        <span className="badge" style={{ background: CONF_COLOR[p.confidence] }}>{p.confidence}</span>
                        {p.confidence !== "Skip" && <button className="secondary" style={{ marginLeft: 8, padding: "3px 9px", fontSize: 12 }} onClick={() => addLeg({ ...p, when: shortWhen(e.commence_time) })}>{inSlip(e.id, p.selection) ? "Remove" : "Add"}</button>}
                        <div className="why">{p.reason}{p.alt ? ` · Alt: ${p.alt}${p.alt_odds ? ` @ ${p.alt_odds.toFixed(2)}` : ""}` : ""}</div>
                      </div>
                    )}
                    {ex && (
                      <div className="extra">
                        {Object.keys(ex).length === 0 && <div className="meta">No extra markets offered for this match.</div>}
                        {Object.entries(ex).map(([mk, v]) => (
                          <div key={mk}>
                            <div className="mk">{mk.replace(/_/g, " ")} · {v.bookmaker}</div>
                            <div className="odds-row">
                              {v.outcomes.slice(0, 12).map((o, idx) => {
                                const label = `${o.description ? o.description + " " : ""}${o.name}${o.point !== undefined ? " " + o.point : ""}`;
                                return <button key={idx} className={`odd num ${inSlip(e.id, label) ? "on" : ""}`} onClick={() => addLeg(legFor(e, mk, label, o.price))}><small>{label}</small><b>{Number(o.price).toFixed(2)}</b></button>;
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="tools">
                      {!ex && e.sport_key.startsWith("soccer_") && <button onClick={() => moreMarkets(e)}>+ BTTS, DNB, scorers</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {(tab === "board" || tab === "stars") && (
        <div className="drawer">
          <div className="inner">
            <div className="bar">
              <div className="row" style={{ alignItems: "center" }}>
                <b style={{ fontSize: 12.5 }}>Cote</b>
                {TARGETS.map((t) => <button key={t} className={`chip ${target === t ? "on" : ""}`} onClick={() => setTarget(t)}>{t}</button>)}
                <button className="secondary" disabled={!Object.keys(picks).length} onClick={buildTarget}>Build ~{target}</button>
              </div>
              <div className="row" style={{ alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div className="total num">{slip.length ? product(slip).toFixed(2) : "—"}</div>
                  <div className="fine">{slip.length} legs · hits ~{slip.length ? Math.round(hitChance(slip) * 100) : 0}%</div>
                </div>
                <button className="secondary" disabled={!slip.length} onClick={() => copy(slip, `${scope} · ${mode === "safe" ? "safe locks" : "high value"}`)}>{copied ? "Copied" : "Copy"}</button>
                <button className="ghost" disabled={!slip.length} onClick={() => setSlip([])}>Clear</button>
              </div>
            </div>
            {slip.length > 0 && <div className="legs">{slip.map((l) => <div className={`leg ${l.star ? "star" : ""}`} key={l.event_id + l.selection}>{l.star ? "★ " : ""}{l.match.split(" vs ")[0]} · {l.selection} · <b className="num">{Number(l.odds).toFixed(2)}</b></div>)}</div>}
            <div className="fine">Slips over ~5 are lottery tickets: a tenth of a unit, never chased. 18+.</div>
          </div>
        </div>
      )}
    </>
  );
}
