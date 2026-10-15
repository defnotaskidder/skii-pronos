import { createClient } from "@supabase/supabase-js";

// Browser client, created once. Settings come from /api/auth-config so any env-var naming
// the Vercel integration uses works. Resolves to null while accounts aren't configured.
let config, client;

function loadConfig() {
  if (!config) {
    config = fetch("/api/auth-config", { cache: "no-store" })
      .then((r) => r.json())
      .then(({ url, key }) => (url && key ? { url, key } : null))
      .catch(() => { config = undefined; return null; });
  }
  return config;
}

export function getSupabase() {
  if (!client) {
    client = loadConfig().then((c) => (c ? createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null));
  }
  return client;
}

// Which sign-in methods the Supabase project has switched on (public endpoint).
export async function authProviders() {
  const c = await loadConfig();
  if (!c) return {};
  try {
    const r = await fetch(`${c.url}/auth/v1/settings`, { headers: { apikey: c.key } });
    const d = await r.json();
    return { email: !!d.external?.email, google: !!d.external?.google, signup: !d.disable_signup };
  } catch {
    return { email: true, google: false, signup: true };
  }
}
