"use client";
import { useEffect, useMemo, useRef, useState } from "react";

const ORDER = { live: 0, upcoming: 1, finished: 2 };
const gmt = (iso) => { const d = new Date(iso); return `${d.toISOString().slice(5, 10)} ${d.toISOString().slice(11, 16)} GMT`; };
const ago = (iso) => {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
};

export default function LiveScores({ selected, sports, onQuota }) {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [auto, setAuto] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [, tick] = useState(0);
  const timer = useRef(null);

  const titleOf = (k) => sports.find((s) => s.key === k)?.title || k;

  const load = async (onlyLive = false) => {
    if (!selected.length) { setError("Pick at least one league on the Board tab."); return; }
    setBusy(true); setError("");
    // When auto-refreshing, only re-poll leagues that currently have a live game (saves credits).
    const liveLeagues = new Set(games.filter((g) => g.state === "live").map((g) => g.sport_key));
    const keys = onlyLive && liveLeagues.size ? selected.filter((k) => liveLeagues.has(k)) : selected;
    const fresh = [];
    for (const key of keys) {
      try {
        const r = await fetch(`/api/scores?sport=${encodeURIComponent(key)}`);
        const d = await r.json();
        if (d.error) setError((p) => `${p ? p + " " : ""}${titleOf(key)}: ${d.error}`);
        if (d.quota?.remaining && onQuota) onQuota(d.quota);
        fresh.push(...(d.games || []));
      } catch (e) { setError((p) => `${p ? p + " " : ""}${titleOf(key)}: ${e.message}`); }
    }
    setGames((old) => {
      const keep = onlyLive ? old.filter((g) => !keys.includes(g.sport_key)) : [];
      return [...keep, ...fresh];
    });
    setFetchedAt(new Date().toISOString());
    setBusy(false);
  };

  useEffect(() => { load(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    clearInterval(timer.current);
    if (auto) timer.current = setInterval(() => load(true), 120000);
    return () => clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, games]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15000); return () => clearInterval(t); }, []);

  const sorted = useMemo(() => {
    const dayAgo = Date.now() - 36 * 3600 * 1000;
    return games
      .filter((g) => g.state !== "finished" || new Date(g.commence_time).getTime() > dayAgo)
      .sort((a, b) => ORDER[a.state] - ORDER[b.state] || new Date(a.commence_time) - new Date(b.commence_time));
  }, [games]);
  const liveCount = sorted.filter((g) => g.state === "live").length;

  return (
    <div>
      <div className="star-head">
        <h2>Live scores</h2>
        <span className="star-pill">{liveCount} live</span>
        {fetchedAt && <span className="quota">updated {ago(fetchedAt)}</span>}
      </div>
      <div className="row" style={{ marginBottom: 12, alignItems: "center" }}>
        <button className="secondary" disabled={busy} onClick={() => load(false)}>{busy ? "Loading…" : "Refresh now"}</button>
        <button className={`chip ${auto ? "on" : ""}`} onClick={() => setAuto((a) => !a)}>Auto every 2 min {auto ? "ON" : "OFF"}</button>
        <span className="note" style={{ margin: 0 }}>Leagues come from your Board selection. Each refresh costs credits — auto only re-polls leagues with a live game.</span>
      </div>
      {error && <div className="error">{error}</div>}
      {sorted.length === 0 && !busy ? (
        <div className="empty">No games in the last day or upcoming for your selected leagues.</div>
      ) : sorted.map((g, i) => (
        <div className={`card ${g.state === "live" ? "starred" : ""}`} key={g.id} style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
          <div className="meta">
            {gmt(g.commence_time)} · {g.league}
            {g.state === "live" && <span className="badge" style={{ background: "var(--red)" }}>● LIVE</span>}
            {g.state === "finished" && <span className="badge" style={{ background: "var(--muted)" }}>FT</span>}
            {g.state === "live" && g.last_update && <span>· score {ago(g.last_update)}</span>}
          </div>
          <div className="teams" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 0 }}>
            <span>{g.home} vs {g.away}</span>
            <b className="num" style={{ fontSize: 20 }}>{g.home_score ?? "–"} : {g.away_score ?? "–"}</b>
          </div>
        </div>
      ))}
      <p className="note">Scores come from the same odds feed (no match minute is provided — check the clock against kickoff). A game shows "live" once kickoff has passed and it isn't marked finished.</p>
    </div>
  );
}
