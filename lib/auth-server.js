// Server-side check of a Supabase session token sent as "Authorization: Bearer <jwt>".
import { createClient } from "@supabase/supabase-js";

function find(re) {
  for (const [k, v] of Object.entries(process.env)) if (v && re.test(k)) return v;
  return null;
}
export function supabasePublic() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || find(/SUPABASE_URL$/);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || find(/SUPABASE_(ANON|PUBLISHABLE)_KEY$/) || find(/SUPABASE_PUBLISHABLE_DEFAULT_KEY$/);
  return url && /^https:\/\//.test(url) && key ? { url, key } : null;
}

const cache = new Map(); // token -> { user, at }

export async function userFromRequest(request) {
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.user;
  const cfg = supabasePublic();
  if (!cfg) return null;
  try {
    const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return null;
    const user = { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name || data.user.user_metadata?.full_name || data.user.email?.split("@")[0] };
    if (cache.size > 500) cache.clear();
    cache.set(token, { user, at: Date.now() });
    return user;
  } catch {
    return null;
  }
}
