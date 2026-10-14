"use client";
// Accounts via Supabase Auth (email + password, Google). Turned on by setting
// NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY; until then the site works
// fully signed-out and the sign-in page explains what's missing.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSupabase } from "../../lib/supabase";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const sb = getSupabase();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!sb);

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => { setUser(data.session?.user || null); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const value = useMemo(() => ({
    enabled: !!sb, ready, user,
    name: user?.user_metadata?.name || user?.email?.split("@")[0] || null,
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
  }), [sb, ready, user]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
