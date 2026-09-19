"use client";
import { useEffect, useMemo, useState } from "react";
import { buildSlip, product, hitChance, slipText } from "../lib/slip";

const SCOPES = ["Today", "Tomorrow", "Weekend", "7 days"];
const TARGETS = [2, 3, 5, 10, 20, 50, 100, 200, 400];
const CONF_COLOR = { High: "#2E8B57", "Med-High": "#5FA36F", Medium: "#B8A33A", Low: "#8A8F8B", Skip: "#C9CFCA" };
const DEFAULT_ON = ["soccer_epl", "soccer_spain_la_liga", "soccer_germany_bundesliga", "soccer_italy_serie_a", "soccer_france_ligue_one"];

const fmtTime = (iso) => {
  const d = new Date(iso);
  const gmt = d.toISOString().slice(11, 16);
  const day = d.toISOString().slice(5, 10);
  return `${day} ${gmt} GMT`;
};

function inScope(iso, scope) {
  const t = new Date(iso); const now = new Date();
  const dayStart = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
  const add = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
  const today = dayStart(now);
  if (scope === "Today") return t >= today && t < add(today, 1);
  if (scope === "Tomorrow") return t >= add(today, 1) && t < add(today, 2);
  if (scope === "Weekend") {
    const dow = now.getUTCDay(); const toSat = (6 - dow + 7) % 7;
    const sat = add(today, dow === 0 ? -1 : toSat); return t >= sat && t < add(sat, 2);
  }
  return t >= now && t < add(today, 8);
}

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked */ } }

export default function Page() {
  const [sports, setSports] = useState([]);
  const [selected, setSelected] = useState(DEFAULT_ON);
  const [scope, setScope] = useState("Weekend");
  const [mode, setMode] = useState("safe");
  const [events, setEvents] = useState([]);
  const [extras, setExtras] = useState({});
  const [picks, setPicks] = useState({}); // event_id -> pick
  const [slip, setSlip] = useState([]);
  const [target, setTarget] = useState(5);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState(null);
  const [record, setRecord] = useState([]);
  const [tab, setTab] = useState("board");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRecord(load("skii-record", []));
    fetch("/api/sports").then((r) => r.json()).then((d) => { setSports(d.sports || []); if (d.quota?.remaining) setQuota(d.quota); }).catch(() => {});
  }, []);

  const toggle = (k) => setSelected((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  const loadOdds = async (refresh = false) => {
    if (!selected.length) { setError("Pick at least one league."); return; }
    setBusy(true); setError(""); setStatus("Loading live odds…");
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
    setEvents(all); setPicks({}); setSlip([]);
    setStatus(`${all.length} events loaded.`);
    setBusy(false);
  };

  const visible = useMemo(() => events.filter((e) => inScope(e.commence_time, scope)), [events, scope]);

  const analyze = async () => {
    if (!visible.length) { setError("Load odds first."); return; }
    setBusy(true); setError(""); setStatus("Engine is reading the odds and picking one market per match…");
    const chunks = []; for (let i = 0; i < visible.length; i += 8) chunks.push(visible.slice(i, i + 8));
    const next = { ...picks };
    for (const c of chunks) {
      try {
        const r = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: c, extras, mode }) });
        const d = await r.json();
        if (d.error) { setError(d.error); continue; }
        if (d.note) setStatus(d.note);
        d.picks.forEach((p) => { next[p.event_id] = p; });
        setPicks({ ...next });
      } catch (e) { setError(e.message); }
    }
    setStatus(`Engine done — ${Object.keys(next).length} matches rated.`);
    setBusy(false);
  };

  const moreMarkets = async (e) => {
    setStatus(`Loading extra markets for ${e.home} vs ${e.away}…`);
    try {
      const r = await fetch(`/api/event?sport=${encodeURIComponent(e.sport_key)}&eventId=${encodeURIComponent(e.id)}`);
      const d = await r.json();
      if (d.error) setError(d.error);
      if (d.quota?.remaining) setQuota(d.quota);
      setExtras((x) => ({ ...x, [e.id]: d.markets || {} }));
      setStatus("");
    } catch (err) { setError(err.message); }
  };

  const legFor = (e, market, selection, odds, confidence) => ({
    event_id: e.id, match: `${e.home} vs ${e.away}`, league: e.league, when: fmtTime(e.commence_time).slice(0, 11),
    market, selection, odds: Number(odds), confidence: confidence || picks[e.id]?.confidence || "Medium",
  });
  const inSlip = (id, selection) => slip.some((l) => l.event_id === id && l.selection === selection);
  const addLeg = (leg) => {
    if (inSlip(leg.event_id, leg.selection)) { setSlip(slip.filter((l) => !(l.event_id === leg.event_id && l.selection === leg.selection))); return; }
    if (!leg.odds) return;
    setSlip([...slip.filter((l) => l.event_id !== leg.event_id), leg]); // one market per match
  };

  const buildTarget = () => {
    const legs = buildSlip(Object.values(picks), target);
    setSlip(legs);
    setError(product(legs) < target * 0.9 ? `Not enough rated legs for ~${target}. Analyze more leagues or switch to High value.` : "");
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(slipText(slip, `${scope} · ${mode === "safe" ? "safe locks" : "high value"}`)); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Copy failed — select the text manually."); }
  };

  const grade = (p, result) => {
    const next = [...record.filter((r) => r.event_id !== p.event_id), { ...p, result, graded_at: new Date().toISOString() }];
    setRecord(next); save("skii-record", next);
  };
  const resultOf = (id) => record.find((r) => r.event_id === id)?.result;
  const stats = useMemo(() => {
    const settled = record.filter((r) => r.result === "W" || r.result === "L");
    const wins = settled.filter((r) => r.result === "W").length;
    const units = settled.reduce((s, r) => s + (r.result === "W" ? r.odds - 1 : -1), 0);
    return { bets: settled.length, wins, hit: settled.length ? Math.round((wins / settled.length) * 100) : 0, units: units.toFixed(2), roi: settled.length ? Math.round((units / settled.length) * 100) : 0 };
  }, [record]);

  const groups = useMemo(() => {
    const g = {}; sports.forEach((s) => { (g[s.group] = g[s.group] || []).push(s); }); return g;
  }, [sports]);

  return (
    <div className="wrap">
      <div className="top">
        <div>
          <div className="title">Skii Pronos Engine</div>
          <div className="sub">Live odds from your bookmaker feed, one best market per match, honest confidence. Times in GMT.</div>
        </div>
        <div className="row">
          <button className={`chip ${tab === "board" ? "on" : ""}`} onClick={() => setTab("board")}>Board</button>
          <button className={`chip ${tab === "record" ? "on" : ""}`} onClick={() => setTab("record")}>Track record ({stats.bets})</button>
          {quota?.remaining && <span className="quota">API credits left: {quota.remaining}</span>}
        </div>
      </div>

      {tab === "record" ? (
        <div>
          <div className="stats">
            {[["Bets", stats.bets], ["Hit rate", `${stats.hit}%`], ["Units", stats.units], ["ROI", `${stats.roi}%`]].map(([k, v]) => (
              <div className="stat" key={k}><small>{k}</small><b className="num">{v}</b></div>
            ))}
          </div>
          <p className="note">Flat one-unit stakes. Publish this table with the losses in it — that is what earns a channel trust.</p>
          {record.length === 0 ? <div className="empty">No graded picks yet. Rate matches on the board, then mark each pick Won or Lost after the game.</div> : (
            <div>
              {[...record].reverse().map((r) => (
                <div className="rec" key={r.event_id}>
                  <span>{r.when} {r.match} — {r.selection} @ {Number(r.odds).toFixed(2)}</span>
                  <b style={{ color: r.result === "W" ? "var(--green)" : r.result === "L" ? "var(--red)" : "var(--muted)" }}>{r.result}</b>
                </div>
              ))}
              <button className="ghost" onClick={() => { setRecord([]); save("skii-record", []); }}>Clear record</button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid">
          <div>
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
            {sports.length === 0 && <div className="status">Loading leagues…</div>}
            <div className="label">When</div>
            <div className="row">{SCOPES.map((s) => <button key={s} className={`chip ${scope === s ? "on" : ""}`} onClick={() => setScope(s)}>{s}</button>)}</div>
            <div className="label">Risk</div>
            <div className="row">
              <button className={`chip ${mode === "safe" ? "on" : ""}`} onClick={() => setMode("safe")}>Safe locks (1.15–1.60)</button>
              <button className={`chip ${mode === "value" ? "on" : ""}`} onClick={() => setMode("value")}>High value (1.60–3.00)</button>
            </div>
            <button className="primary" disabled={busy} onClick={() => loadOdds(false)}>{busy ? "Working…" : "Load live odds"}</button>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="secondary" disabled={busy || !visible.length} onClick={analyze}>Rate every match (engine)</button>
              <button className="ghost" disabled={busy || !events.length} onClick={() => loadOdds(true)}>Refresh odds</button>
            </div>
            {status && <div className="status">{status}</div>}
            {error && <div className="error">{error}</div>}
            <p className="note">Odds come from the bookmaker feed you configured (1xBet when listed, otherwise the next preferred book). Prices move — confirm in the app before you bet. Locks are strongest edges, never guarantees.</p>
          </div>

          <div>
            {visible.length === 0 ? (
              <div className="empty">{events.length ? `No events in “${scope}” — try another window.` : "Choose leagues, then load live odds. Tap any price to add it to the slip, or let the engine rate every match."}</div>
            ) : visible.map((e) => {
              const p = picks[e.id]; const r = resultOf(e.id); const ex = extras[e.id];
              const main = e.totals.find((t) => t.point === 2.5) || e.totals[0];
              const sp = e.spreads[0];
              return (
                <div className={`card ${slip.some((l) => l.event_id === e.id) ? "picked" : ""}`} key={e.id}>
                  <div className="meta">{fmtTime(e.commence_time)} · {e.league}{e.bookmaker ? ` · ${e.bookmaker}` : ""}{e.books > 1 ? ` (+${e.books - 1} books)` : ""}</div>
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
                      <b>{p.confidence === "Skip" ? "Skip" : `Engine: ${p.selection} @ ${p.odds.toFixed(2)}`}</b>
                      <span className="badge" style={{ background: CONF_COLOR[p.confidence] }}>{p.confidence}</span>
                      {p.confidence !== "Skip" && <button className="secondary" style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }} onClick={() => addLeg({ ...p, when: fmtTime(e.commence_time).slice(0, 11) })}>{inSlip(e.id, p.selection) ? "Remove" : "Add to slip"}</button>}
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
                            {v.outcomes.slice(0, 12).map((o, i) => {
                              const label = `${o.description ? o.description + " " : ""}${o.name}${o.point !== undefined ? " " + o.point : ""}`;
                              return <button key={i} className={`odd num ${inSlip(e.id, label) ? "on" : ""}`} onClick={() => addLeg(legFor(e, mk, label, o.price))}><small>{label}</small><b>{Number(o.price).toFixed(2)}</b></button>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="tools">
                    {!ex && e.sport_key.startsWith("soccer_") && <button onClick={() => moreMarkets(e)}>More markets (BTTS, DNB, scorers)</button>}
                    {p && p.confidence !== "Skip" && (<>
                      <span style={{ color: "var(--muted)" }}>Grade:</span>
                      <button className={r === "W" ? "w" : ""} onClick={() => grade(p, "W")}>Won</button>
                      <button className={r === "L" ? "l" : ""} onClick={() => grade(p, "L")}>Lost</button>
                      <button className={r === "V" ? "v" : ""} onClick={() => grade(p, "V")}>Void</button>
                    </>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "board" && (
        <div className="drawer">
          <div className="inner">
            <div className="bar">
              <div className="row" style={{ alignItems: "center" }}>
                <b style={{ fontSize: 13 }}>Cote generator</b>
                {TARGETS.map((t) => <button key={t} className={`chip ${target === t ? "on" : ""}`} onClick={() => setTarget(t)}>{t}</button>)}
                <button className="secondary" disabled={!Object.keys(picks).length} onClick={buildTarget}>Build ~{target}</button>
              </div>
              <div className="row" style={{ alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div className="total num">{slip.length ? product(slip).toFixed(2) : "—"}</div>
                  <div className="fine">{slip.length} legs · hits ~{slip.length ? Math.round(hitChance(slip) * 100) : 0}%</div>
                </div>
                <button className="secondary" disabled={!slip.length} onClick={copy}>{copied ? "Copied" : "Copy for Telegram"}</button>
                <button className="ghost" disabled={!slip.length} onClick={() => setSlip([])}>Clear</button>
              </div>
            </div>
            {slip.length > 0 && <div className="legs">{slip.map((l) => <div className="leg" key={l.event_id + l.selection}>{l.match.split(" vs ")[0]} · {l.selection} · <b className="num">{Number(l.odds).toFixed(2)}</b></div>)}</div>}
            <div className="fine">Slips over ~5 are lottery tickets: a tenth of a unit, never chased. 18+.</div>
          </div>
        </div>
      )}
    </div>
  );
}
