"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useBoard } from "../components/Providers";
import { MatchRow } from "../components/Match";
import { LeagueFlag, Skeleton, dayLabel } from "../components/ui";
import { LEAGUES, LEAGUE_BY_ID, SPORT_LABEL } from "../../lib/leagues";

const STATES = [["all", "All"], ["in", "Live"], ["pre", "Upcoming"], ["post", "Finished"]];
const SORTS = [["time", "Kick-off"], ["confidence", "Best picks"]];
const CATS = [["all", "All competitions"], ["men", "Men's"], ["women", "Women's"], ["youth", "Youth & college"]];
const catOf = (id) => { const L = LEAGUE_BY_ID[id]; return !L ? "men" : L.women ? "women" : L.tier === 6 ? "youth" : "men"; };
const PER_LEAGUE = 8; // rows shown per league before "Show all"
const RANK = { High: 4, "Med-High": 3, Medium: 2, Low: 1, Skip: 0 };
const STATE_ORDER = { in: 0, pre: 1, post: 2 };
// live → upcoming (soonest first) → finished (most recent first)
const byState = (a, b) => (STATE_ORDER[a.state] - STATE_ORDER[b.state])
  || (a.state === "post" ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date));

function Matches() {
  const params = useSearchParams();
  const { events, loading, error, updated } = useBoard();
  const [state, setState] = useState("all");
  const [day, setDay] = useState("all");
  const [sport, setSport] = useState("all");
  const [league, setLeague] = useState(params.get("league") || "all");
  const [q, setQ] = useState(params.get("q") || "");
  const [sort, setSort] = useState("time");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState({}); // leagues expanded past PER_LEAGUE
  const [flatMax, setFlatMax] = useState(120);

  useEffect(() => { setQ(params.get("q") || ""); if (params.get("league")) setLeague(params.get("league")); }, [params]);

  const days = useMemo(() => {
    const seen = new Map();
    for (const e of events) { const l = dayLabel(e.date); if (!seen.has(l)) seen.set(l, new Date(e.date)); }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([l]) => l);
  }, [events]);

  const base = useMemo(() => events.filter((e) => {
    if (sport !== "all" && e.sport !== sport) return false;
    if (cat !== "all" && catOf(e.league) !== cat) return false;
    if (day !== "all" && dayLabel(e.date) !== day) return false;
    if (q) {
      const s = q.toLowerCase();
      const L = LEAGUE_BY_ID[e.league];
      if (![e.home.name, e.away.name, e.home.short, e.away.short, L?.name].some((x) => x?.toLowerCase().includes(s))) return false;
    }
    return true;
  }), [events, sport, day, q, cat]);

  const counts = useMemo(() => ({ all: base.length, in: base.filter((e) => e.state === "in").length, pre: base.filter((e) => e.state === "pre").length, post: base.filter((e) => e.state === "post").length }), [base]);
  const leagueCounts = useMemo(() => { const c = {}; base.forEach((e) => { c[e.league] = (c[e.league] || 0) + 1; }); return c; }, [base]);

  const list = useMemo(() => {
    let l = base.filter((e) => (state === "all" || e.state === state) && (league === "all" || e.league === league));
    if (sort === "confidence") l = [...l].sort((a, b) => (RANK[b.a?.pick?.tier] || 0) - (RANK[a.a?.pick?.tier] || 0) || (b.a?.pick?.safe || 0) - (a.a?.pick?.safe || 0));
    else l = [...l].sort(byState);
    return l;
  }, [base, state, league, sort]);

  const grouped = useMemo(() => {
    if (sort !== "time") return null;
    const order = LEAGUES.map((l) => l.id);
    const g = {};
    for (const e of list) (g[e.league] = g[e.league] || []).push(e);
    // leagues with a live game first, then ones with games still to play, finished-only last
    const rank = (evs) => (evs.some((e) => e.state === "in") ? 0 : evs.some((e) => e.state === "pre") ? 1 : 2);
    return Object.entries(g).sort((a, b) => rank(a[1]) - rank(b[1]) || order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [list, sort]);

  const sports = [...new Set(events.map((e) => e.sport))];

  return (
    <>
      <Top title="Matches" sub={`${new Set(events.map((e) => e.league)).size} competitions, loaded automatically${updated ? ` · updated ${new Date(updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`} />
      <div className="stack" style={{ gap: 12, marginBottom: 18 }}>
        <div className="row">
          <div className="seg">
            {STATES.map(([k, l]) => (
              <button key={k} className={`${state === k ? "on" : ""} ${state === k && k === "in" ? "grad" : ""}`} onClick={() => setState(k)}>
                {k === "in" && <span className="pill live" style={{ padding: 0, background: "none", height: "auto" }} />}{l}<span className="n">{counts[k]}</span>
              </button>
            ))}
          </div>
          <span className="spacer" />
          <div className="search" style={{ width: 260, maxWidth: "100%" }}>
            <Icon name="search" size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team or league" aria-label="Search matches" />
            {q && <button className="dim" onClick={() => setQ("")} aria-label="Clear search"><Icon name="x" size={14} /></button>}
          </div>
          <div className="seg">
            {SORTS.map(([k, l]) => <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>)}
          </div>
        </div>
        <div className="chips">
          <button className={`chip ${day === "all" ? "on" : ""}`} onClick={() => setDay("all")}>All days</button>
          {days.map((d) => <button key={d} className={`chip ${day === d ? "on" : ""}`} onClick={() => setDay(d)}>{d}</button>)}
          <span style={{ width: 1, background: "var(--line-2)", margin: "4px 4px", flex: "none" }} />
          <button className={`chip ${sport === "all" ? "on" : ""}`} onClick={() => setSport("all")}>All sports</button>
          {sports.map((s) => <button key={s} className={`chip ${sport === s ? "on" : ""}`} onClick={() => setSport(s)}>{SPORT_LABEL[s]}</button>)}
          <span style={{ width: 1, background: "var(--line-2)", margin: "4px 4px", flex: "none" }} />
          {CATS.map(([k, l]) => <button key={k} className={`chip ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{l}</button>)}
        </div>
        <div className="chips">
          <button className={`chip ${league === "all" ? "on" : ""}`} onClick={() => setLeague("all")}>All leagues</button>
          {LEAGUES.filter((l) => leagueCounts[l.id]).map((l) => (
            <button key={l.id} className={`chip ${league === l.id ? "on" : ""}`} onClick={() => setLeague(league === l.id ? "all" : l.id)}>
              <LeagueFlag league={l} size={13} />{l.name}<span className="n">{leagueCounts[l.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}
      {loading ? <Skeleton rows={7} /> : list.length === 0 ? (
        <div className="empty"><Icon name="ball" />No matches for these filters.</div>
      ) : grouped ? grouped.map(([lid, evs]) => {
        const L = LEAGUE_BY_ID[lid];
        return (
          <section key={lid} className="league-block">
            <div className="league-head">
              <LeagueFlag league={L} size={16} /><b>{L.name}</b>
              <span className="muted">{evs.length} {evs.length === 1 ? "match" : "matches"}</span>
              {evs.some((e) => e.state === "in") && <span className="pill live">{evs.filter((e) => e.state === "in").length} live</span>}
            </div>
            {(open[lid] || league !== "all" ? evs : evs.slice(0, PER_LEAGUE)).map((e) => <MatchRow key={e.id} ev={e} />)}
            {evs.length > PER_LEAGUE && league === "all" && (
              <button className="btn ghost sm" style={{ margin: "2px 0 6px" }} onClick={() => setOpen((o) => ({ ...o, [lid]: !o[lid] }))}>
                <Icon name={open[lid] ? "down" : "chevron"} />{open[lid] ? "Show fewer" : `Show all ${evs.length} ${L.name} matches`}
              </button>
            )}
          </section>
        );
      }) : (
        <>
          {list.slice(0, flatMax).map((e) => <MatchRow key={e.id} ev={e} showLeague />)}
          {list.length > flatMax && <button className="btn soft block" onClick={() => setFlatMax((n) => n + 120)}>Show more ({list.length - flatMax} left)</button>}
        </>
      )}
    </>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Matches /></Suspense>;
}
