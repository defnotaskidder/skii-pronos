"use client";
// Accounts via Supabase Auth (email + password, Google). The client is created once the
// server reports the project's public settings (see /api/auth-config); until then the site
// works fully signed-out and the sign-in page explains what's missing.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authProviders, getSupabase } from "../../lib/supabase";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [sb, setSb] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState({});

  useEffect(() => {
    let sub, alive = true;
    getSupabase().then(async (client) => {
      if (!alive) return;
      setSb(client);
      if (client) {
        const { data } = await client.auth.getSession();
        if (!alive) return;
        setUser(data.session?.user || null);
        sub = client.auth.onAuthStateChange((_e, session) => setUser(session?.user || null)).data.subscription;
        authProviders().then((p) => alive && setProviders(p));
      }
      setReady(true);
    });
    return () => { alive = false; sub?.unsubscribe(); };
  }, []);

  const value = useMemo(() => ({
    enabled: !!sb, ready, user, providers,
    name: user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || null,
    signIn: async (email, password) => {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUp: async (email, password, name) => {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: `${location.origin}/` } });
      if (error) throw error;
      return { needsConfirm: !data.session };
    },
    google: async () => {
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/` } });
      if (error) throw error;
    },
    reset: async (email) => {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` });
      if (error) throw error;
    },
    signOut: () => sb?.auth.signOut(),
  }), [sb, ready, user, providers]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
