"use client";
import { useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { CouponActions, CouponCard, useCouponOfTheDay } from "../components/Coupon";
import { Skeleton, pct } from "../components/ui";

const TARGETS = [2, 3, 5, 10, 20, 50, 100, 200];
const MODES = [["safe", "Safe", "Highest hit chance"], ["balanced", "Balanced", "Chance + price"], ["value", "Value", "Biggest edge vs the price"]];
const WINDOWS = [[24, "24 h"], [48, "48 h"], [72, "3 days"]];

export default function CouponPage() {
  const { data, error } = useCouponOfTheDay();
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
    } catch { setErr("Couldn't build the coupon."); }
    setBusy(false);
  };

  const day = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <Top title="Coupon du jour" sub={`${day} · built by the engine from every league${data?.reviewed ? ", double-checked by AI" : ""}`} />
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="grid g-match">
        <div className="stack">
          {data ? (
            <CouponCard coupon={data.safe} title="Coupon du jour" eyebrow="Safe · ~2.5 odds" footer={<CouponActions coupon={data.safe} title="Coupon du jour" />} />
          ) : <section className="card hero glow"><Skeleton rows={4} h={60} /></section>}
          {data?.dropped?.length > 0 && (
            <section className="card flat">
              <div className="card-head"><h3>Dropped by the AI check</h3></div>
              {data.dropped.map((l) => <div key={l.eventId} className="kv"><span>{l.home} – {l.away}: {l.label}</span><b style={{ fontWeight: 500, color: "var(--muted)" }}>{l.note}</b></div>)}
            </section>
          )}
          {data && (
            <CouponCard coupon={data.bold} title="Bold coupon" eyebrow="Balanced · ~8 odds" glow={false} compact footer={<CouponActions coupon={data.bold} title="Bold coupon" />} />
          )}
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="target" /></span><h2>Build your own</h2></div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Target odds</div>
            <div className="chips" style={{ flexWrap: "wrap", marginBottom: 16 }}>
              {TARGETS.map((t) => <button key={t} className={`chip ${target === t ? "on" : ""}`} onClick={() => setTarget(t)}>{t}</button>)}
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Profile</div>
            <div className="stack" style={{ gap: 8, marginBottom: 16 }}>
              {MODES.map(([k, l, d]) => (
                <button key={k} className={`chip ${mode === k ? "on" : ""}`} style={{ height: 46, justifyContent: "space-between" }} onClick={() => setMode(k)}>
                  <b>{l}</b><span className="n" style={{ fontSize: 12 }}>{d}</span>
                </button>
              ))}
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Kick-off within</div>
            <div className="seg" style={{ marginBottom: 18 }}>
              {WINDOWS.map(([h, l]) => <button key={h} className={hours === h ? "on" : ""} onClick={() => setHours(h)}>{l}</button>)}
            </div>
            <button className="btn primary block" disabled={busy} onClick={build}><Icon name="bolt" />{busy ? "Building…" : `Build ~${target} odds`}</button>
            {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
            <p className="note" style={{ marginBottom: 0 }}>One market per match, strongest legs first. Anything above ~5 is a lottery ticket: stake a tenth of a unit.</p>
          </section>
          {custom && (
            <CouponCard coupon={custom} title={`Custom ~${target}`} eyebrow={`${MODES.find((m) => m[0] === mode)[1]} · ${custom.legs.length} legs${custom.reached ? "" : " · target not reached"}`} glow={false} compact
              footer={<CouponActions coupon={custom} title={`Coupon ~${target}`} />} />
          )}
          {data && (
            <section className="card flat tight">
              <div className="kv"><span>Matches considered</span><b>{data.pool}</b></div>
              <div className="kv"><span>Safe coupon hit chance</span><b>{pct(data.safe?.chance)}</b></div>
              <div className="kv"><span>Generated</span><b>{new Date(data.generated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b></div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
