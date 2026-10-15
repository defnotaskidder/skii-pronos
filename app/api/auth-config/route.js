import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public Supabase settings for the browser. Vercel's Supabase integration names its variables
// with an optional prefix (SUPABASE_URL, STORAGE_SUPABASE_URL, NEXT_PUBLIC_…), so look them up
// by suffix at runtime instead of hard-coding one name. Only the project URL and the public
// anon/publishable key are ever returned — never the service-role key or database URLs.
function find(re) {
  for (const [k, v] of Object.entries(process.env)) if (v && re.test(k)) return v;
  return null;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || find(/SUPABASE_URL$/);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || find(/SUPABASE_(ANON|PUBLISHABLE)_KEY$/) || find(/SUPABASE_PUBLISHABLE_DEFAULT_KEY$/);
  const ok = !!url && /^https:\/\//.test(url) && !!key;
  return NextResponse.json(ok ? { url, key } : { url: null, key: null }, { headers: { "cache-control": "no-store" } });
}
