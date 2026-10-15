import { createClient } from "@supabase/supabase-js";

// Browser client, created once. Settings come from /api/auth-config so any env-var naming
// the Vercel integration uses works. Resolves to null while accounts aren't configured.
let pending;
export function getSupabase() {
  if (!pending) {
    pending = fetch("/api/auth-config", { cache: "no-store" })
      .then((r) => r.json())
      .then(({ url, key }) => (url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null))
      .catch(() => { pending = undefined; return null; });
  }
  return pending;
}
