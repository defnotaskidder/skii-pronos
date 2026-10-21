"use client";
// Spécial matchday: the night's two coupons, then every game of the slate with the engine's pick,
// the market's move, the model's expected goals and the AI's verdict with team news.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import { useT } from "../components/Lang";
import { CouponActions, CouponCard, chanceText } from "../components/Coupon";
import { Skeleton, TeamLogo, Tier, TriBar, liveLabel, localTime, odds2, pct, useNow } from "../components/ui";

function useSpecial() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const kicked = useRef(false); // the AI pass is asked for once per page view while it is still pending
  useEffect(() => {
    let alive = true, timer;
    const get = async () => {
      if (document.visibilityState === "hidden") { timer = setTimeout(get, 30e3); return; }
      try {
        const r = await fetch("/api/special");
        const d = await r.json();
        if (!alive) return;
        if (d.error) setError(d.error); else { setData(d); setError(""); }
        if (!d.error && !d.none && !d.reviewed && !d.reviewing && !kicked.current && d.games?.some((g) => g.state === "pre")) {
          kicked.current = true;
          fetch("/api/special?review=1").then((x) => x.json()).then((x) => { if (alive && x?.games) setData(x); }).catch(() => {});
        }
      } catch { if (alive) setError("offline"); }
      if (alive) timer = setTimeout(get, 120e3);
    };
    get();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return { data, error };
}

const VERDICT = { banker: ["Banker", "green"], pick: ["Pick", ""], avoid: ["Avoid", "red"] };

export default function SpecialPage() {
  const { data, error } = useSpecial();
  const { t, lang } = useT();
  const name = data ? (lang === "fr" && data.fr) || data.name : "";
  const title = data?.none ? t("Special night") : `${t("Special")} ${name}`;
  return (
    <>
      <Top title={title} sub={data?.none ? t("No big competition plays today.") : data ? t("{n} games · every game analysed: real prices, trained model, line movement, team news checked by the AI", { n: data.games.length }) + (data.reviewed ? "" : ` · ${t("AI check pending")}`) : "…"} />
      {error && <div className="error" style={{ marginBottom: 16 }}>{error === "offline" ? t("Couldn't reach the server — retrying.") : error}</div>}
      {!data ? <Skeleton rows={4} h={90} /> : data.none ? (
        <div className="empty"><Icon name="star" />{t("No special night today. The Champions League, Europa League and the big tournaments get one on their matchdays.")}<div style={{ marginTop: 12 }}><Link href="/" className="btn soft">{t("Back")}</Link></div></div>
      ) : (
        <>
          <div className="grid g-match">
            <div className="stack">
              <CouponCard coupon={data.coupons.special} title={t("The night's coupon")} eyebrow={`${name} · ${t("safest · ~2.00 odds")}`}
                sub={data.coupons.special?.reached === false ? t("Tonight's games can't make x2 with strong legs only: this is the closest build.") : t("The slate's strongest legs, real bookmaker prices, games the AI flagged left out")}
                footer={<CouponActions coupon={data.coupons.special} title={`${t("Special")} ${name}`} />} />
            </div>
            <div className="stack">
              <CouponCard coupon={data.coupons.special_x} title={t("The night's grosse cote")} eyebrow={`x10 · ${chanceText(data.coupons.special_x?.chance, lang)}`}
                sub={t("Same slate, longer odds · ≈ prices are estimates, take them at or above")} glow={false} compact icon="bolt"
                footer={<CouponActions coupon={data.coupons.special_x} title={`${t("Special")} ${name} x10`} />} />
            </div>
          </div>
          <div className="sec-label" style={{ marginTop: 18 }}>{t("GAME BY GAME")} · {t("local times")}</div>
          <div className="grid g-2 stagger">{data.games.map((g) => <GameCard key={g.eventId} g={g} />)}</div>
          <p className="note center" style={{ marginTop: 14 }}>{t("18+ only. No pick is guaranteed. Bet responsibly.")}</p>
        </>
      )}
    </>
  );
}

function GameCard({ g }) {
  const { t, tm } = useT();
  const now = useNow();
  const pick = g.aiPick || g.pick;
  const [vLabel, vCls] = VERDICT[g.verdict] || [];
  const ev = { state: g.state, date: g.date, detail: g.detail, minute: g.minute };
  const score = g.state !== "pre" && g.home.score !== null && g.home.score !== undefined ? `${g.home.score} – ${g.away.score}` : null;
  const result = pick && g.state === "post" && pick.result ? pick.result : null;
  return (
    <section className={`card ${g.verdict === "avoid" ? "flat" : ""}`} data-reveal>
      <div className="row" style={{ alignItems: "center", gap: 10 }}>
        <span style={{ display: "flex" }}>
          <TeamLogo team={{ logo: g.home.logo, short: g.home.short }} size={30} />
          <span style={{ marginLeft: -8 }}><TeamLogo team={{ logo: g.away.logo, short: g.away.short }} size={30} /></span>
        </span>
        <span style={{ minWidth: 0 }}>
          <b className="ell" style={{ display: "block" }}>{g.home.short} – {g.away.short}</b>
          <small className="muted">{g.state === "pre" ? localTime(g.date) : liveLabel(ev, now)}{score ? ` · ${score}` : ""}</small>
        </span>
        <span className="spacer" />
        {vLabel && <span className={`pill ${vCls}`}>{t(vLabel)}</span>}
        {g.state === "in" && <span className="pill live">{t("LIVE")}</span>}
      </div>
      {pick ? (
        <Link href={`/match/${g.league}/${g.eventId}`} className="kv" style={{ marginTop: 10, textDecoration: "none" }}>
          <span><b>{tm(pick.label)}</b>{g.aiPick ? <small className="muted"> · {t("AI's choice")}</small> : null}</span>
          <b className="num">{pick.estimated ? "≈" : ""}{odds2(pick.odds)} <small className="muted">· {pct(pick.p)}</small> {pick.tier ? <Tier t={pick.tier} /> : null}{result ? <span className={`pill ${result === "W" ? "green" : result === "L" ? "red" : ""}`} style={{ marginLeft: 6 }}>{result === "W" ? t("✓ Won") : result === "L" ? t("✗ Lost") : t("Void")}</span> : null}</b>
        </Link>
      ) : <div className="muted" style={{ marginTop: 10 }}>{t("No playable pick in this game.")}</div>}
      {g.probs && <div style={{ marginTop: 10 }}><TriBar h={g.probs.h} d={g.probs.d} a={g.probs.a} labels={[g.home.short, t("Draw"), g.away.short]} /></div>}
      <div className="muted" style={{ fontSize: 12.5, marginTop: 8, display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
        {g.odds && <span>{g.odds.provider} {odds2(g.odds.h)} / {g.odds.d ? `${odds2(g.odds.d)} / ` : ""}{odds2(g.odds.a)}</span>}
        {g.xg && <span>{t("Expected goals")} {g.xg.home} – {g.xg.away}</span>}
        {g.move && <span style={{ color: "#ffd0cc" }}>{t("Money on {side}: {from} → {to}", { side: g.move.side === "home" ? g.home.short : g.away.short, from: odds2(g.move.from), to: odds2(g.move.to) })}</span>}
      </div>
      {g.note && <p className="note" style={{ margin: "8px 0 0", color: g.verdict === "avoid" ? "#fda4af" : undefined }}>{t("AI:")} {g.note}{g.risk && g.risk !== "low" ? ` · ${t("risk {r}", { r: t(g.risk) })}` : ""}</p>}
    </section>
  );
}
