"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useBoard } from "../components/Providers";
import { useT } from "../components/Lang";
import { MatchRow } from "../components/Match";
import { LeagueFlag, Skeleton, dayLabel, localTime } from "../components/ui";
import { LEAGUES, LEAGUE_BY_ID, SPORT_LABEL } from "../../lib/leagues";

const STATES = [["all", "All"], ["in", "Live"], ["pre", "Upcoming"], ["post", "Finished"]];
const SORTS = [["time", "Kick-off"], ["confidence", "Best picks"]];
const CATS = [["all", "All competitions"], ["men", "Men's"], ["women", "Women's"], ["youth", "Youth & college"]];
const catOf = (id) => { const L = LEAGUE_BY_ID[id]; return !L ? "men" : L.women ? "women" : L.tier === 6 || /college/.test(id) ? "youth" : "men"; };
// quick filters for the leagues people bet on most (shown when they have matches)
const TOP = ["uefa.champions", "eng.1", "esp.1", "ger.1", "ita.1", "fra.1", "uefa.europa", "rus.1", "nba", "nhl"];
// league order: by tier, then the curated order (top flights before college and youth competitions)
const ORDERED = LEAGUES.map((l, i) => [l, i]).sort((a, b) => a[0].tier - b[0].tier || a[1] - b[1]).map(([l]) => l);
const ORDER = Object.fromEntries(ORDERED.map((l, i) => [l.id, i]));
const PER_LEAGUE = 10; // rows shown per minor league before "Show all" (top leagues always show every game)
const RANK = { High: 4, "Med-High": 3, Medium: 2, Low: 1, Skip: 0 };
const STATE_ORDER = { in: 0, pre: 1, post: 2 };
// live → upcoming (soonest first) → finished (most recent first)
const byState = (a, b) => (STATE_ORDER[a.state] - STATE_ORDER[b.state])
  || (a.state === "post" ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date));

function Matches() {
  const params = useSearchParams();
  const { events, loading, error, updated, skill } = useBoard();
  const { t } = useT();
  const [state, setState] = useState("all");
  const [day, setDay] = useState("all");
  const [sport, setSport] = useState("all");
  const [league, setLeague] = useState(params.get("league") || "all");
  const [q, setQ] = useState(params.get("q") || "");
  const [sort, setSort] = useState("time");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState({}); // leagues expanded past PER_LEAGUE
  const [flatMax, setFlatMax] = useState(120);
  const [shownLeagues, setShownLeagues] = useState(12); // more leagues render as you scroll
  const moreRef = useRef(null);
  useEffect(() => { setShownLeagues(12); setFlatMax(120); }, [state, day, sport, league, q, cat, sort]);
  useEffect(() => {
    const el = moreRef.current;
    if (!el) return;
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) setShownLeagues((n) => n + 12); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  });

  useEffect(() => { setQ(params.get("q") || ""); if (params.get("league")) setLeague(params.get("league")); }, [params]);

  const days = useMemo(() => {
    const seen = new Map();
    for (const e of events) { const l = dayLabel(e.date); if (!seen.has(l)) seen.set(l, new Date(e.date)); }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([l]) => l);
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const g = {};
    for (const e of list) (g[e.league] = g[e.league] || []).push(e);
    // leagues with a live game first, then ones with games still to play, finished-only last
    const rank = (evs) => (evs.some((e) => e.state === "in") ? 0 : evs.some((e) => e.state === "pre") ? 1 : 2);
    return Object.entries(g).sort((a, b) => rank(a[1]) - rank(b[1]) || (ORDER[a[0]] ?? 1e4) - (ORDER[b[0]] ?? 1e4));
  }, [list, sort]);

  const sports = [...new Set(events.map((e) => e.sport))];

  return (
    <>
      <Top title={t("Matches")} sub={t("{n} competitions, loaded automatically", { n: new Set(events.map((e) => e.league)).size }) + (updated ? t(" · updated {time}", { time: localTime(updated) }) : "")} />
      <div className="stack" style={{ gap: 12, marginBottom: 18 }}>
        <div className="row">
          <div className="seg">
            {STATES.map(([k, l]) => (
              <button key={k} className={`${state === k ? "on" : ""} ${state === k && k === "in" ? "grad" : ""}`} onClick={() => setState(k)}>
                {k === "in" && <span className="pill live" style={{ padding: 0, background: "none", height: "auto" }} />}{t(l)}<span className="n">{counts[k]}</span>
              </button>
            ))}
          </div>
          <span className="spacer" />
          <div className="search" style={{ width: 260, maxWidth: "100%" }}>
            <Icon name="search" size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Team or league")} aria-label={t("Search")} />
            {q && <button className="dim" onClick={() => setQ("")} aria-label={t("Clear search")}><Icon name="x" size={14} /></button>}
          </div>
          <div className="seg">
            {SORTS.map(([k, l]) => <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{t(l)}</button>)}
          </div>
        </div>
        <div className="chips">
          <button className={`chip ${day === "all" ? "on" : ""}`} onClick={() => setDay("all")}>{t("All days")}</button>
          {days.map((d) => <button key={d} className={`chip ${day === d ? "on" : ""}`} onClick={() => setDay(d)}>{d}</button>)}
          <span style={{ width: 1, background: "var(--line-2)", margin: "4px 4px", flex: "none" }} />
          <button className={`chip ${sport === "all" ? "on" : ""}`} onClick={() => setSport("all")}>{t("All sports")}</button>
          {sports.map((s) => <button key={s} className={`chip ${sport === s ? "on" : ""}`} onClick={() => setSport(s)}>{t(SPORT_LABEL[s])}</button>)}
          <span style={{ width: 1, background: "var(--line-2)", margin: "4px 4px", flex: "none" }} />
          {CATS.map(([k, l]) => <button key={k} className={`chip ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{t(l)}</button>)}
        </div>
        {TOP.some((id) => leagueCounts[id] || league === id) && (
          <div className="chips" role="group" aria-label={t("Top leagues")}>
            <span className="muted" style={{ flex: "none", alignSelf: "center", fontSize: 12, fontWeight: 700, paddingRight: 2 }}>⭐ {t("Top leagues")}</span>
            {TOP.filter((id) => leagueCounts[id] || league === id).map((id) => {
              const L = LEAGUE_BY_ID[id];
              return (
                <button key={id} className={`chip ${league === id ? "on" : ""}`} onClick={() => setLeague(league === id ? "all" : id)}>
                  <LeagueFlag league={L} size={13} />{L.name}<span className="n">{leagueCounts[id] || 0}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="chips">
          <button className={`chip ${league === "all" ? "on" : ""}`} onClick={() => setLeague("all")}>{t("All leagues")}</button>
          {ORDERED.filter((l) => leagueCounts[l.id]).map((l) => (
            <button key={l.id} className={`chip ${league === l.id ? "on" : ""}`} onClick={() => setLeague(league === l.id ? "all" : l.id)}>
              <LeagueFlag league={l} size={13} />{l.name}<span className="n">{leagueCounts[l.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 14 }}>{error === "offline" ? t("Couldn't reach the server — retrying.") : error}</div>}
      {loading ? <Skeleton rows={7} /> : list.length === 0 ? (
        <div className="empty"><Icon name="ball" />{t("No matches for these filters.")}</div>
      ) : grouped ? grouped.slice(0, shownLeagues).map(([lid, evs]) => {
        const L = LEAGUE_BY_ID[lid];
        const cap = (L?.tier ?? 9) <= 2 ? Infinity : PER_LEAGUE;
        return (
          <section key={lid} className="league-block">
            <div className="league-head" style={{ flexWrap: "wrap", rowGap: 6 }}>
              <LeagueFlag league={L} size={16} /><b>{L.name}</b>
              <span className="muted">{evs.length === 1 ? t("{n} match", { n: 1 }) : t("{n} matches", { n: evs.length })}</span>
              {evs.some((e) => e.state === "in") && <span className="pill live">{t("{n} live", { n: evs.filter((e) => e.state === "in").length })}</span>}
              <SkillBadge s={skill?.[lid]} />
            </div>
            {(open[lid] || league !== "all" ? evs : evs.slice(0, cap)).map((e) => <MatchRow key={e.id} ev={e} />)}
            {evs.length > cap && league === "all" && (
              <button className="btn ghost sm" style={{ margin: "2px 0 6px" }} onClick={() => setOpen((o) => ({ ...o, [lid]: !o[lid] }))}>
                <Icon name={open[lid] ? "down" : "chevron"} />{open[lid] ? t("Show fewer") : t("Show all {n} {league} matches", { n: evs.length, league: L.name })}
              </button>
            )}
          </section>
        );
      }).concat(grouped.length > shownLeagues ? [<div key="more" ref={moreRef} style={{ height: 1 }} />] : []) : (
        <>
          {list.slice(0, flatMax).map((e) => <MatchRow key={e.id} ev={e} showLeague />)}
          {list.length > flatMax && <button className="btn soft block" onClick={() => setFlatMax((n) => n + 120)}>{t("Show more ({n} left)", { n: list.length - flatMax })}</button>}
        </>
      )}
    </>
  );
}

// What the engine has learned about a league from its graded picks: only clear verdicts show.
function SkillBadge({ s }) {
  const { t } = useT();
  if (s?.s === "strong") return <span className="pill green" title={t("Picks here win more often than the engine expected")}>🔥 {t("Strong here · {w}/{n}", { w: s.w, n: s.n })}</span>;
  if (s?.s === "weak") return <span className="pill red" title={t("Picks here win less often than the engine expected")}>⚠ {t("Weak here")}</span>;
  return null;
}

export default function Page() {
  return <Suspense fallback={null}><Matches /></Suspense>;
}
