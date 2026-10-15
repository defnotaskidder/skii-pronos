"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "../components/Icons";
import { useAuth } from "../components/Auth";

export default function Login() {
  const auth = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ err: "", ok: "" });

  useEffect(() => { if (auth.user) router.replace("/"); }, [auth.user, router]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ err: "", ok: "" });
    try {
      if (mode === "signin") await auth.signIn(form.email, form.password);
      else if (mode === "signup") {
        const r = await auth.signUp(form.email, form.password, form.name);
        if (r.needsConfirm) setMsg({ err: "", ok: "Check your inbox to confirm your email, then sign in." });
      } else {
        await auth.reset(form.email);
        setMsg({ err: "", ok: "Password reset link sent — check your inbox." });
      }
    } catch (err) {
      setMsg({ err: err.message || "Something went wrong.", ok: "" });
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "calc(100vh - 40px)", display: "grid", placeItems: "center", padding: "30px 0" }}>
      <div className="card hero glow" style={{ width: "100%", maxWidth: 440, padding: 28 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 22 }}>
          <span className="brand-mark">S</span>
          <span><div className="brand-name">Skii Pronos</div><div className="brand-sub">Your picks, coupons and alerts — everywhere</div></span>
        </div>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, letterSpacing: "-.025em" }}>{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset password" : "Welcome back"}</h1>
        <p className="muted" style={{ margin: "0 0 20px" }}>{mode === "signup" ? "Free. Save your history and get alerts on every device." : mode === "reset" ? "We'll email you a reset link." : "Sign in to sync your coupons and alerts."}</p>

        {!auth.ready ? (
          <div className="shimmer" style={{ height: 150 }} />
        ) : !auth.enabled ? (
          <div className="card flat tight" style={{ background: "rgba(255,255,255,.03)" }}>
            <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <Icon name="lock" size={18} style={{ color: "#c4b5fd", marginTop: 2, flex: "none" }} />
              <div>
                <b>Accounts aren't switched on yet</b>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>The sign-in backend runs on Supabase. Connect a Supabase database to this project in Vercel (Storage → Supabase) and redeploy, and this form goes live. Until then everything works without an account.</p>
              </div>
            </div>
            <Link href="/" className="btn soft block" style={{ marginTop: 14 }}>Continue without an account</Link>
          </div>
        ) : (
          <>
            {mode !== "reset" && (
              <>
                <button className="btn soft block" onClick={() => auth.google().catch((e) => setMsg({ err: e.message, ok: "" }))}>
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" /></svg>
                  Continue with Google
                </button>
                <div className="row" style={{ margin: "16px 0", flexWrap: "nowrap" }}><span className="divider" style={{ flex: 1, margin: 0 }} /><span className="dim" style={{ fontSize: 12 }}>or with email</span><span className="divider" style={{ flex: 1, margin: 0 }} /></div>
              </>
            )}
            <form onSubmit={submit}>
              {mode === "signup" && <div className="field"><label htmlFor="name">Name</label><input id="name" className="input" value={form.name} onChange={set("name")} autoComplete="name" /></div>}
              <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" required value={form.email} onChange={set("email")} autoComplete="email" /></div>
              {mode !== "reset" && <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="input" type="password" required minLength={6} value={form.password} onChange={set("password")} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></div>}
              {msg.err && <div className="error" style={{ marginBottom: 12 }}>{msg.err}</div>}
              {msg.ok && <div className="card flat tight" style={{ marginBottom: 12, borderColor: "rgba(34,197,94,.35)", color: "#bbf7d0" }}>{msg.ok}</div>}
              <button className="btn primary block" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
            </form>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 16, fontSize: 13 }}>
              {mode === "signin" ? <button className="muted" onClick={() => setMode("reset")}>Forgot password?</button> : <button className="muted" onClick={() => setMode("signin")}>Back to sign in</button>}
              {mode !== "signup" ? <button style={{ color: "#c4b5fd", fontWeight: 650 }} onClick={() => setMode("signup")}>Create an account</button> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
