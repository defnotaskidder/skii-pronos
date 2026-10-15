"use client";
import Link from "next/link";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import NotificationSettings from "../components/NotificationSettings";
import MessagingLinks from "../components/Messaging";
import InstallCard from "../components/Install";
import { useAuth } from "../components/Auth";
import { useT, LangSwitch } from "../components/Lang";
import { LANGS } from "../../lib/i18n";

export default function Settings() {
  const auth = useAuth();
  const { t, lang, setLang, locale } = useT();
  return (
    <>
      <Top title={t("Settings")} sub={t("Account, alerts and preferences")} />
      <div className="grid g-2">
        <section className="card">
          <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="user" /></span><h3>{t("Account")}</h3></div>
          {auth.user ? (
            <>
              <div className="row" style={{ marginBottom: 14 }}>
                <span className="avatar" style={{ width: 52, height: 52, fontSize: 20 }}>{(auth.name || "?")[0].toUpperCase()}</span>
                <div><b style={{ fontSize: 16 }}>{auth.name}</b><div className="muted">{auth.user.email}</div></div>
              </div>
              <div className="kv"><span>{t("Member since")}</span><b>{new Date(auth.user.created_at).toLocaleDateString(locale)}</b></div>
              <div className="kv"><span>{t("Sync")}</span><b>{t("Your history, followed matches, coupon and alerts are synced to your account.")}</b></div>
              <button className="btn soft" style={{ marginTop: 14 }} onClick={auth.signOut}><Icon name="logout" />{t("Sign out")}</button>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>{t("You're using Skii Pronos without an account. Your history, coupon and alerts are saved in this browser.")}</p>
              <Link href="/login" className="btn primary"><Icon name="user" />{t("Sign in or create an account")}</Link>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="settings" /></span><h3>{t("Language")}</h3></div>
          <div className="stack" style={{ gap: 8 }}>
            {Object.entries(LANGS).map(([k, label]) => (
              <button key={k} className={`chip ${lang === k ? "on" : ""}`} style={{ height: 46, justifyContent: "space-between" }} onClick={() => setLang(k)}>
                <b>{label}</b><span className="n">{k.toUpperCase()}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}><LangSwitch /></div>
        </section>

        <NotificationSettings />
        <MessagingLinks />
        <InstallCard />

        <section className="card">
          <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="shield" /></span><h3>{t("Play it safe")}</h3></div>
          <p className="muted" style={{ marginTop: 0 }}>{t("Flat stakes, one unit per bet. Coupons above ~5 odds are lottery tickets: stake a tenth of a unit. Never chase losses. 18+.")}</p>
          <p className="note">{t("Probabilities are estimates from bookmaker prices and team data. No pick is a guarantee.")}</p>
          <div className="row" style={{ gap: 8 }}>
            <Link href="/legal#responsible" className="btn soft sm">{t("Responsible gambling")}</Link>
            <Link href="/legal#privacy" className="btn ghost sm">{t("Privacy policy")}</Link>
            <Link href="/legal#terms" className="btn ghost sm">{t("Terms of use")}</Link>
          </div>
        </section>
      </div>
    </>
  );
}
