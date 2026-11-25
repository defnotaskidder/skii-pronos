"use client";
// The games in play that the main feed does not carry (UEFA Youth League, national cups, lower
// divisions…), from the second live-score source (lib/morelive.js). Scores only: no pick, no link
// to a match page. The source is refreshed every 15 minutes or so, so the list says when its
// scores were read, and the minute shown is that reading plus the time gone by since.
// Nothing is shown while the second source is not configured or has nothing more to add.
import { useEffect, useMemo, useState } from "react";
import Icon from "./Icons";
import { useT } from "./Lang";

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const CAP = { "1H": 45, "2H": 90, ET: 120 };

export default function LiveExtra() {
  const { t, locale } = useT();
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true, timer;
    const get = async () => {
      if (document.visibilityState !== "hidden") {
        try { const r = await (await fetch("/api/live-extra")).json(); if (alive && r && Array.isArray(r.games)) setD({ ...r, got: Date.now() }); } catch { /* next round */ }
      }
      if (alive) timer = setTimeout(get, 120e3);
    };
    get();
    // a tab that comes back reads the list at once instead of waiting for the next round
    const wake = () => { if (document.visibilityState === "visible") { clearTimeout(timer); get(); } };
    document.addEventListener("visibilitychange", wake);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); };
  }, []);

  const at = d?.at ? new Date(d.at).getTime() : null;
  const clock = (g) => {
    if (g.status === "HT" || g.status === "BT") return t("HT");
    if (g.status === "P") return t("Pens");
    const cap = CAP[g.status];
    if (g.minute == null || !cap) return t("LIVE");
    const now = Math.min(cap, g.minute + Math.max(0, Math.floor((Date.now() - (at || Date.now())) / 60e3)));
    return `${now}'`;
  };
  const groups = useMemo(() => {
    const needle = norm(q.trim());
    const m = new Map();
    for (const g of d?.games || []) {
      if (needle && !norm(`${g.home} ${g.away} ${g.league} ${g.country}`).includes(needle)) continue;
      const k = `${g.country}|${g.league}`;
      if (!m.has(k)) m.set(k, { key: k, country: g.country, league: g.league, games: [] });
      m.get(k).games.push(g);
    }
    // international competitions first, then by country
    return [...m.values()].sort((a, b) => (a.country === "World" ? 0 : 1) - (b.country === "World" ? 0 : 1) || a.country.localeCompare(b.country) || a.league.localeCompare(b.league));
  }, [d, q]);

  if (!d?.configured || !d.games?.length) return null;
  const shown = all || q ? groups : groups.slice(0, 8);
  const time = at ? new Date(at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <section className="card live-extra" style={{ marginBottom: 22 }}>
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <span className="pill live">{t("LIVE")}</span>
        <h3 style={{ flex: 1, minWidth: 0 }}>{t("More live games")} <span className="lx-n">{d.games.length}</span></h3>
        <input className="lx-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Team or competition")} aria-label={t("Team or competition")} />
      </div>
      <p className="muted lx-note">{t("Scores only, from a second source · read at {time}", { time })}. {t("No picks on these games: the engine has no prices for them.")}</p>
      {shown.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>{t("Nothing matches.")}</div> : shown.map((grp) => (
        <div key={grp.key} className="lx-group">
          <div className="lx-league">{grp.country && grp.country !== "World" ? `${grp.country} · ` : ""}{grp.league}</div>
          {grp.games.map((g) => (
            <div key={g.id} className="lx-row">
              <span className="lx-clock">{clock(g)}</span>
              <span className="lx-team">{g.home}</span>
              <b className="num lx-score">{g.hs} : {g.as}</b>
              <span className="lx-team away">{g.away}</span>
            </div>
          ))}
        </div>
      ))}
      {!all && !q && groups.length > shown.length && (
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setAll(true)}><Icon name="chevron" size={14} />{t("Show all {n} competitions", { n: groups.length })}</button>
      )}
    </section>
  );
}
