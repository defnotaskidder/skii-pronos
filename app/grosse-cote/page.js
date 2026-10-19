"use client";
import { useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useT } from "../components/Lang";
import { CouponActions, CouponCard, chanceText, useCouponOfTheDay } from "../components/Coupon";
import { Skeleton } from "../components/ui";

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
      <Top title={t("Grosse cote")} sub={t("Big-odds coupons, built for the best possible chance at each target")} />
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

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
