"use client";
import Link from "next/link";
import { useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useT } from "../components/Lang";
import { CouponActions, CouponCard, chanceText, useCouponOfTheDay } from "../components/Coupon";
import { Skeleton, pct } from "../components/ui";

const TARGETS = [1.5, 2, 2.5, 3, 4, 5, 7, 10];
const MODES = [["safe", "Safe", "Short, likely legs"], ["balanced", "Balanced", "Chance + price"], ["value", "Value", "Biggest edge vs the price"]];
const WINDOWS = [[24, "24 h"], [48, "48 h"], [72, "3 days"]];

export default function CouponPage() {
  const { data, error } = useCouponOfTheDay();
  const { t, lang, locale } = useT();
  const [target, setTarget] = useState(5);
  const [mode, setMode] = useState("balanced");
  const [hours, setHours] = useState(24);
  const [custom, setCustom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const build = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/coupon?target=${target}&mode=${mode}&hours=${hours}`);
      const d = await r.json();
      if (d.error) setErr(d.error); else setCustom(d.coupon);
    } catch { setErr(t("Couldn't build the coupon.")); }
    setBusy(false);
  };

  const day = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <Top title={t("Coupon du jour")} sub={t("{day} · built by the engine from every league", { day }) + (data?.reviewed ? t(", double-checked by AI") : "")} />
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="grid g-match">
        <div className="stack">
          {data ? (
            <CouponCard coupon={data.safe} title={t("Coupon du jour")} eyebrow={t("Safe · ~2.5 odds")}
              sub={data.reviewed ? t("The day's safest picks · football only · real bookmaker prices · checked by AI") : t("The day's safest picks · football only · real bookmaker prices")}
              footer={<CouponActions coupon={data.safe} title={t("Coupon du jour")} />} />
          ) : <section className="card hero glow"><Skeleton rows={4} h={60} /></section>}
          {data?.dropped?.length > 0 && (
            <section className="card flat">
              <div className="card-head"><h3>{t("Dropped by the AI check")}</h3></div>
              {data.dropped.map((l) => <div key={l.eventId} className="kv"><span>{l.home} – {l.away}: {l.label}</span><b style={{ fontWeight: 500, color: "var(--muted)" }}>{l.note}</b></div>)}
            </section>
          )}
          {data?.grosse && (
            <CouponCard coupon={data.grosse} title={t("Grosse cote du jour")} eyebrow={t("~30 odds · {chance}", { chance: chanceText(data.grosse.chance, lang) })} sub={t("Football only · real bookmaker prices")} glow={false} compact icon="bolt"
              footer={<CouponActions coupon={data.grosse} title={t("Grosse cote du jour")} extra={<Link href="/grosse-cote" className="btn soft"><Icon name="bolt" />{t("Grosse cote generator")}</Link>} />} />
          )}
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="target" /></span><h2>{t("Build your own")}</h2></div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{t("Target odds")}</div>
            <div className="chips" style={{ flexWrap: "wrap", marginBottom: 16 }}>
              {TARGETS.map((x) => <button key={x} className={`chip ${target === x ? "on" : ""}`} onClick={() => setTarget(x)}>{x}</button>)}
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{t("Profile")}</div>
            <div className="stack" style={{ gap: 8, marginBottom: 16 }}>
              {MODES.map(([k, l, d]) => (
                <button key={k} className={`chip ${mode === k ? "on" : ""}`} style={{ height: 46, justifyContent: "space-between" }} onClick={() => setMode(k)}>
                  <b>{t(l)}</b><span className="n" style={{ fontSize: 12 }}>{t(d)}</span>
                </button>
              ))}
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{t("Kick-off within")}</div>
            <div className="seg" style={{ marginBottom: 18 }}>
              {WINDOWS.map(([h, l]) => <button key={h} className={hours === h ? "on" : ""} onClick={() => setHours(h)}>{t(l)}</button>)}
            </div>
            <button className="btn primary block" disabled={busy} onClick={build}><Icon name="bolt" />{busy ? t("Building…") : t("Build ~{t} odds", { t: target })}</button>
            {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
            <p className="note" style={{ marginBottom: 0 }}>{t("One market per match, built for the highest chance at your target. Want 10, 50, 1000? Use the")} <Link href="/grosse-cote" style={{ color: "#c4b5fd" }}>{t("grosse cote generator")}</Link>.</p>
          </section>
          {custom && (
            <CouponCard coupon={custom} title={t("Custom ~{t}", { t: target })} eyebrow={t("{profile} · {n} legs", { profile: t(MODES.find((m) => m[0] === mode)[1]), n: custom.legs.length }) + (custom.reached ? "" : t(" · target not reached"))} glow={false} compact
              footer={<CouponActions coupon={custom} title={t("Coupon ~{t}", { t: target })} />} />
          )}
          {data && (
            <section className="card flat tight">
              {data.pool ? <div className="kv"><span>{t("Matches considered")}</span><b>{data.pool}</b></div> : null}
              <div className="kv"><span>{t("Safe coupon hit chance")}</span><b>{pct(data.safe?.chance)}</b></div>
              <div className="kv"><span>{t("Grosse cote hit chance")}</span><b>{chanceText(data.grosse?.chance, lang)}</b></div>
              <div className="kv"><span>{t("Saved for the day")}</span><b>{data.stored ? t("Yes, archived in History") : t("This session")}</b></div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
