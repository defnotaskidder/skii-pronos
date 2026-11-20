"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useT } from "../components/Lang";
import { CouponActions, CouponCard, CouponLegs, chanceText, useCouponOfTheDay } from "../components/Coupon";
import { Skeleton, TeamLogo, dayLabel, localTime, odds2 } from "../components/ui";
import { useSlip } from "../components/Providers";
import { load, save } from "../components/store";

const TARGETS = [10, 20, 30, 50, 100, 200, 500, 1000];
const STYLES = [
  ["grosse", "Big legs", "Fewer legs at 1.45–4.20 each"],
  ["balanced", "More legs", "Safer legs at 1.25–2.60 each"],
];
const WINDOWS = [[24, "24 h"], [48, "48 h"], [72, "3 days"]];

export default function GrosseCote() {
  const { data, error } = useCouponOfTheDay();
  const { t, lang } = useT();
  const [target, setTarget] = useState(50);
  const [custom, setCustom] = useState("");
  const [style, setStyle] = useState("grosse");
  const [hours, setHours] = useState(48);
  const [maxLegs, setMaxLegs] = useState(10);
  const [result, setResult] = useState(null);
  const [seen, setSeen] = useState([]); // legs used by earlier combinations, for "another one"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const goal = Number(custom) > 1.3 ? Number(custom) : target;

  const generate = async (again = false) => {
    setBusy(true); setErr("");
    const exclude = again && result ? [...seen, ...result.legs.map((l) => l.eventId)] : [];
    try {
      const q = new URLSearchParams({ target: String(goal), mode: style, hours: String(hours), maxLegs: String(maxLegs) });
      if (exclude.length) q.set("exclude", exclude.join(","));
      const r = await fetch(`/api/coupon?${q}`);
      const d = await r.json();
      if (d.error) setErr(d.error);
      else if (!d.coupon?.legs?.length) setErr(again ? t("No other combination reaches that target. Widen the window or lower the target.") : t("Not enough strong legs for that target right now. Widen the window or lower the target."));
      else { setResult(d.coupon); setSeen(exclude); }
    } catch { setErr(t("Couldn't generate the coupon.")); }
    setBusy(false);
  };

  return (
    <>
      <Top title={t("Grosse cote")} sub={t("The big-odds desk: every rung from x10 to x1000, value outsiders, the record")} />
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <Desk />

      <div className="sec-label">{t("GROSSE COTE DU JOUR & GENERATOR")}</div>
      <div className="grid g-match">
        <div className="stack">
          {data ? (
            <CouponCard coupon={data.grosse} title={t("Grosse cote du jour")} eyebrow={t("x100 · {n} legs", { n: data.grosse?.legs?.length || 0 }) + (data.reviewed ? t(" · AI-checked") : "")} sub={t("Same day · every sport · real bookmaker prices")} icon="bolt"
              footer={<CouponActions coupon={data.grosse} title={t("Grosse cote du jour")} />} />
          ) : <section className="card hero glow"><Skeleton rows={4} h={60} /></section>}

          {result && (
            <CouponCard coupon={result} glow={false} compact icon="sparkles"
              title={t("Grosse cote ~{t}", { t: goal })}
              eyebrow={`${t(STYLES.find((s) => s[0] === style)[1])} · ${result.legs.length} ${t("{n} legs", { n: "" }).trim()}${result.reached ? "" : t(" · target not fully reached")}`}
              footer={<CouponActions coupon={result} title={t("Grosse cote ~{t}", { t: goal })} extra={<button className="btn soft" disabled={busy} onClick={() => generate(true)}><Icon name="refresh" />{t("Another one")}</button>} />} />
          )}
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="bolt" /></span><h2>{t("Grosse cote generator")}</h2></div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{t("Target odds")}</div>
            <div className="chips" style={{ flexWrap: "wrap", marginBottom: 10 }}>
              {TARGETS.map((x) => <button key={x} className={`chip ${!custom && target === x ? "on" : ""}`} onClick={() => { setTarget(x); setCustom(""); }}>{x}</button>)}
            </div>
            <input className="input" style={{ width: "100%", marginBottom: 16 }} inputMode="decimal" placeholder={t("Or type any target, e.g. 75")} value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} aria-label={t("Custom target odds")} />

            <div className="eyebrow" style={{ marginBottom: 8 }}>{t("Style")}</div>
            <div className="stack" style={{ gap: 8, marginBottom: 16 }}>
              {STYLES.map(([k, l, d]) => (
                <button key={k} className={`chip ${style === k ? "on" : ""}`} style={{ height: 46, justifyContent: "space-between" }} onClick={() => setStyle(k)}>
                  <b>{t(l)}</b><span className="n" style={{ fontSize: 12 }}>{t(d)}</span>
                </button>
              ))}
            </div>

            <div className="eyebrow" style={{ marginBottom: 8 }}>{t("Max legs · {n}", { n: maxLegs })}</div>
            <input type="range" min={3} max={16} value={maxLegs} onChange={(e) => setMaxLegs(Number(e.target.value))} style={{ width: "100%", accentColor: "#f2553f", marginBottom: 16 }} aria-label={t("Maximum legs")} />

            <div className="eyebrow" style={{ marginBottom: 8 }}>{t("Kick-off within")}</div>
            <div className="seg" style={{ marginBottom: 18 }}>
              {WINDOWS.map(([h, l]) => <button key={h} className={hours === h ? "on" : ""} onClick={() => setHours(h)}>{t(l)}</button>)}
            </div>

            <button className="btn primary block" disabled={busy} onClick={() => generate(false)}><Icon name="bolt" />{busy ? t("Building…") : t("Generate ~{t} odds", { t: goal })}</button>
            {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
            {result && <p className="note" style={{ marginBottom: 0 }}>{t("Chance of landing:")} <b style={{ color: "var(--text)" }}>{chanceText(result.chance, lang)}</b>. {t("“Another one” builds a different combination from the remaining matches.")}</p>}
          </section>

          <section className="card flat">
            <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="shield" /></span><h3>{t("How it's built")}</h3></div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t("Every match is priced by the model. For each one the generator keeps the leg that gives up the least chance per unit of odds, then stacks the most efficient legs and finishes with the one that closes the gap to your target for the smallest loss. The result is the highest chance of landing that target, not just the shortest prices.")}
            </p>
            <p className="note" style={{ marginBottom: 0 }}>{t("Big odds mean small chances. Stake a tenth of a unit at most, never chase. 18+.")}</p>
          </section>
        </div>
      </div>
    </>
  );
}

// ---------- the desk: record, odds ladder, value outsiders ----------
const KIND_NAME = { x12: "Express x12.5", grosse: "Express x100", x200: "Express x200", x400: "Express x300/400", special_x: "Special x" };

function useDesk() {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true, timer;
    const get = () => fetch("/api/grosse").then((r) => r.json()).then((x) => { if (alive && !x.error) setD(x); }).catch(() => {}).finally(() => { if (alive) timer = setTimeout(get, 120e3); });
    get();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return d;
}

function Desk() {
  const { t, tm, lang } = useT();
  const d = useDesk();
  const slip = useSlip();
  const [open, setOpen] = useState(100);
  const [bank, setBank] = useState("");
  useEffect(() => { setBank(String(load("skii-bank", "") || "")); }, []);
  const bankroll = Number(bank) > 0 ? Number(bank) : 0;
  // stake rule for long shots: the bigger the odds, the smaller the slice of the bankroll
  const share = (odds) => (odds >= 250 ? 0.0025 : odds >= 50 ? 0.005 : 0.01);
  const money = (x) => Math.max(1, Math.round(x)).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB");
  if (!d) return <Skeleton rows={3} h={90} />;
  const r = d.record;
  const rung = d.ladder.find((x) => x.target === open && !x.empty) || d.ladder.find((x) => !x.empty);
  return (
    <div className="gc-desk">
      <div className="stat-grid gc-stats">
        <div className="stat-tile"><span>{t("Big coupons won ({d} days)", { d: r.days })}</span><b className="num">{r.w}<small> / {r.n}</small></b><small>{r.n ? t("1 win every {n} coupons", { n: r.w ? Math.round(r.n / r.w) : "∞" }) : t("First results after tonight's games")}</small></div>
        <div className="stat-tile"><span>{t("Biggest hit")}</span><b className="num pos">{r.best ? `x ${odds2(r.best.odds)}` : "–"}</b><small>{r.best ? `${dayLabel(r.best.day)} · ${t(KIND_NAME[r.best.kind] || r.best.kind)}` : t("Still waiting for the first one")}</small></div>
        <div className="stat-tile"><span>{t("Profit, 1 unit each")}</span><b className={`num ${r.units >= 0 ? "pos" : "neg"}`}>{r.units > 0 ? "+" : ""}{r.units.toFixed(1)}</b><small>{t("units over {n} coupons", { n: r.n })}</small></div>
        <div className="stat-tile"><span>{t("Lost by one leg")}</span><b className="num">{r.near}</b><small>{t("the price of long odds")}</small></div>
      </div>

      <div className="sec-head"><div className="sec-label">{t("THE ODDS LADDER")}</div><span className="muted" style={{ fontSize: 12.5 }}>{t("best build per rung · next 48 h · {n} games", { n: d.games })}</span></div>
      <div className="gc-ladder">
        {d.ladder.map((x) => (
          <button key={x.target} className={`gc-rung ${rung && rung.target === x.target ? "on" : ""}`} disabled={x.empty} onClick={() => setOpen(x.target)}>
            <span className="gc-t">x{x.target}</span>
            {x.empty ? <small>{t("no build")}</small> : (<>
              <b className="num">{odds2(x.odds)}</b>
              <small>{chanceText(x.chance, lang).split(" · ")[0]} · {t("{n} legs", { n: x.legs.length })}</small>
              <span className="gc-bar"><i style={{ width: `${Math.min(100, Math.max(3, Math.sqrt(x.chance) * 100))}%` }} /></span>
            </>)}
          </button>
        ))}
      </div>
      {rung ? (
        <section className="card gc-open">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="eyebrow">{t("Best build for x{t}", { t: rung.target })}{rung.reached ? "" : t(" · target not fully reached")}</div>
              <div className="total-odds num grad-text" style={{ marginTop: 4 }}>{odds2(rung.odds)}</div>
            </div>
            <span className="spacer" />
            <div className="gc-facts">
              <div><span>{t("Chance")}</span><b>{chanceText(rung.chance, lang)}</b></div>
              <div><span>{t("Fair odds")}</span><b className="num">{rung.fair ? odds2(rung.fair) : "–"}</b></div>
              <div><span>{t("Expected return")}</span><b className={rung.edge >= 0 ? "pos" : "neg"}>{rung.edge >= 0 ? "+" : ""}{Math.round(rung.edge * 100)}%</b></div>
            </div>
          </div>
          <CouponLegs legs={rung.legs} compact />
          <div className="gc-stake">
            <label className="muted" htmlFor="gc-bank">{t("Your bankroll")}</label>
            <input id="gc-bank" className="input" inputMode="numeric" placeholder="50 000" value={bank} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setBank(v); save("skii-bank", v); }} />
            <span>{bankroll ? <>{t("Stake")} <b className="num">{money(bankroll * share(rung.odds))}</b> → {t("returns")} <b className="num pos">{money(bankroll * share(rung.odds) * rung.odds)}</b></> : t("Type it to get the stake for this rung ({p}% of the bankroll)", { p: share(rung.odds) * 100 })}</span>
          </div>
          <CouponActions coupon={rung} title={`Grosse cote x${rung.target}`} />
          {rung.estimated > 0 && <p className="note" style={{ marginBottom: 0 }}>{t("≈ prices are estimates — take them only at or above the shown odds on 1xBet.")}</p>}
        </section>
      ) : <div className="empty">{t("Not enough strong legs for that target right now. Widen the window or lower the target.")}</div>}

      <div className="sec-head"><div className="sec-label">{t("VALUE OUTSIDERS")}</div><span className="muted" style={{ fontSize: 12.5 }}>{t("singles at 2.50+ where the model beats the price")}</span></div>
      {d.outsiders.length ? (
        <div className="g-list">
          {d.outsiders.map((l) => {
            const on = slip.has(l.eventId, l.key);
            const href = `/match/${l.league}/${l.eventId}`;
            return (
              <div key={l.eventId} className="g-row gc-out">
                <Link href={href} className="g-when"><b className="num">{localTime(l.date)}</b><small>{dayLabel(l.date)}</small></Link>
                <Link href={href} className="g-teams">
                  <span className="g-team"><TeamLogo team={{ logo: l.homeLogo, short: l.home }} size={18} /><span className="ell">{l.home} – {l.away}</span></span>
                  <span className="gc-pick ell">{tm(l.label)} · <span className="muted">{l.leagueName}</span></span>
                  <span className="gc-edge">{t("Model {m}% · price says {o}% · edge +{e}%", { m: Math.round(l.p * 100), o: Math.round(100 / l.odds), e: Math.round(l.ev * 100) })}</span>
                </Link>
                <span className="g-pick"><b className="num">@ {odds2(l.odds)}</b><small>{t("fair {f}", { f: odds2(l.fair) })}</small>
                  <button className={`icon-btn ${on ? "on" : ""}`} aria-label={t("Add to coupon")} onClick={() => slip.toggle(l)}><Icon name={on ? "check" : "plus"} /></button>
                </span>
              </div>
            );
          })}
        </div>
      ) : <div className="empty">{t("No outsider beats its price right now — the engine would rather show none than force one.")}</div>}

      {r.last.length > 0 && (<>
        <div className="sec-head"><div className="sec-label">{t("LAST BIG COUPONS")}</div><Link href="/history" className="link">{t("History")}</Link></div>
        <div className="won-strip">
          {r.last.map((c) => (
            <Link key={`${c.day}-${c.kind}`} href={`/coupon/${c.day}/${c.kind}`} className={`won-card ${c.result === "W" ? "" : "lost"}`}>
              <span className="w-head"><span className="ell">{t(KIND_NAME[c.kind] || c.kind)}</span><span className={`pill ${c.result === "W" ? "green" : "red"}`}>{c.result === "W" ? t("pick.won") : t("pick.lost")}</span></span>
              <b className="w-odds num">x {odds2(c.odds)}</b>
              <small className="muted">{dayLabel(c.day)} · {t("{n} legs", { n: c.n })}{c.result === "L" && c.lostBy ? " · " + (c.lostBy === 1 ? t("lost by one leg") : t("{n} legs lost", { n: c.lostBy })) : ""}</small>
            </Link>
          ))}
        </div>
      </>)}

      <section className="card flat gc-rules">
        <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="shield" /></span><h3>{t("The specialist's rules")}</h3></div>
        <ol>
          <li>{t("Every leg is checked against both teams' last five games (form, goals for–against per game): “landed 7/10” means this exact bet won in 7 of their last 10 games. A leg under 5/10 is left out.")}</li>
          <li>{t("Every leg costs the bookmaker's margin once more: ten legs at 5% margin give back about 60% of what the odds promise. Fewer, better legs beat many short ones.")}</li>
          <li>{t("Look at “expected return”: the closer to 0%, the fairer the coupon. A positive one is rare and worth more than a bigger number.")}</li>
          <li>{t("Stake by the rung: 1% of the bankroll up to x25, 0.5% up to x100, 0.25% beyond. A x100 lands about once in a hundred tries even when every leg is right.")}</li>
          <li>{t("Never chase a lost coupon with a bigger one, and never add a leg just to reach a round number.")}</li>
        </ol>
      </section>
    </div>
  );
}
