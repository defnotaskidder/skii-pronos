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
    // the library (~60 KB) is fetched only now, never on a plain visit
    client = loadConfig().then(async (c) => {
      if (!c) return null;
      const { createClient } = await import("@supabase/supabase-js");
      return createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    });
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

// Should the auth client load on this page view? Only for a stored session (Supabase keeps it as
// sb-<project>-auth-token), a sign-in link coming back (tokens or a code in the URL) or /login.
export function authWanted() {
  try {
    if (location.pathname.startsWith("/login")) return true;
    if (/access_token=|refresh_token=|[?&]code=|type=recovery/.test(location.href)) return true;
    return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k));
  } catch { return false; }
}
