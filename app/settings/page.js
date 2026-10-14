"use client";
import Link from "next/link";
import Icon from "../components/Icons";
import { Top } from "../components/Shell";
import NotificationSettings from "../components/NotificationSettings";
import { useAuth } from "../components/Auth";

export default function Settings() {
  const auth = useAuth();
  return (
    <>
      <Top title="Settings" sub="Account, alerts and preferences" />
      <div className="grid g-2">
        <section className="card">
          <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="user" /></span><h3>Account</h3></div>
          {auth.user ? (
            <>
              <div className="row" style={{ marginBottom: 14 }}>
                <span className="avatar" style={{ width: 52, height: 52, fontSize: 20 }}>{(auth.name || "?")[0].toUpperCase()}</span>
                <div><b style={{ fontSize: 16 }}>{auth.name}</b><div className="muted">{auth.user.email}</div></div>
              </div>
              <div className="kv"><span>Member since</span><b>{new Date(auth.user.created_at).toLocaleDateString()}</b></div>
              <div className="kv"><span>Sync</span><b>History & alerts sync is coming next</b></div>
              <button className="btn soft" style={{ marginTop: 14 }} onClick={auth.signOut}><Icon name="logout" />Sign out</button>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>You're using Skii Pronos without an account. Your history, coupon and alerts are saved in this browser.</p>
              <Link href="/login" className="btn primary"><Icon name="user" />Sign in or create an account</Link>
            </>
          )}
        </section>
        <NotificationSettings />
        <section className="card">
          <div className="card-head"><span className="stat-ico" style={{ margin: 0 }}><Icon name="shield" /></span><h3>Play it safe</h3></div>
          <p className="muted" style={{ marginTop: 0 }}>Flat stakes, one unit per bet. Coupons above ~5 odds are lottery tickets: stake a tenth of a unit. Never chase losses. 18+.</p>
          <p className="note">Probabilities are estimates from bookmaker prices and team data. No pick is a guarantee.</p>
        </section>
      </div>
    </>
  );
}
