import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";
import { summary } from "../../../../lib/espn";
import { LEAGUE_BY_ID } from "../../../../lib/leagues";
import { analysedBoard } from "../../../../lib/board";
import { marketLabel } from "../../../../lib/i18n";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Logos are fetched here (with a timeout) and inlined, so the renderer never waits on ESPN.
async function dataUri(url) {
  if (!url) return null;
  try {
    const u = `https://a.espncdn.com/combiner/i?img=${url.replace(/^https?:\/\/a\.espncdn\.com/, "")}&w=220&h=220`;
    const r = await fetch(u, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return `data:${r.headers.get("content-type") || "image/png"};base64,${b.toString("base64")}`;
  } catch {
    return null;
  }
}
// The renderer needs a font it can read. The file ships next to this route (bundled), with the
// copy in public/fonts as a fallback.
let fontCache = null;
async function fontData() {
  if (fontCache) return fontCache;
  try {
    fontCache = await fetch(new URL("./outfit-bold.ttf", import.meta.url)).then((r) => r.arrayBuffer());
  } catch {
    const site = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://skii-pronos.vercel.app");
    fontCache = await fetch(`${site}/fonts/outfit-bold.ttf`).then((r) => r.arrayBuffer());
  }
  return fontCache;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), ms))]);

// Link-preview image per match: logos, kick-off, and the engine's pick when the board is warm.
export default async function Image({ params }) {
  const { league, id } = params;
  const L = LEAGUE_BY_ID[league];
  let ev = null, pick = null, fonts = [], home = null, away = null;
  try { ev = (await withTimeout(summary(league, id, false), 6000)).event; } catch { /* generic card */ }
  try {
    const rows = await withTimeout(analysedBoard(2), 6000);
    const row = rows.find((r) => r.ev.id === id);
    pick = row?.analysis?.pick || null;
    if (!ev && row) ev = row.ev;
  } catch { /* no pick on the card */ }
  fonts = [{ name: "Outfit", data: await fontData(), weight: 700, style: "normal" }];
  if (ev) [home, away] = await Promise.all([dataUri(ev.home?.logo), dataUri(ev.away?.logo)]);

  const tz = process.env.SITE_TZ || "Africa/Abidjan";
  const when = ev ? new Date(ev.date).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }) : "";
  const score = ev && ev.state !== "pre" ? `${ev.home.score ?? 0} – ${ev.away.score ?? 0}` : "VS";
  const font = "Outfit";

  const team = (tm, uri) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 360 }}>
      {uri ? <img src={uri} width={150} height={150} style={{ objectFit: "contain" }} /> : (
        <div style={{ width: 150, height: 150, borderRadius: 999, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, color: "#9097b3" }}>{(tm.abbr || tm.short || "?").slice(0, 3)}</div>
      )}
      <div style={{ display: "flex", fontSize: 34, marginTop: 14 }}>{tm.short}</div>
    </div>
  );

  // Render inside try/catch: a failure shows its cause with ?debug=1 and otherwise serves the site card.
  const debug = false;
  try {
  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#07091a", color: "#f3f4fb", fontFamily: font, fontWeight: 700 }}>
        <div style={{ display: "flex", alignItems: "center", padding: "44px 64px 0" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #7c3aed, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 32, marginRight: 18 }}>S</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 30 }}>Skii Pronos</div>
            <div style={{ display: "flex", fontSize: 20, color: "#9097b3" }}>{L ? `${L.name} · ${when}` : "Pronos & cotes"}</div>
          </div>
        </div>
        {ev ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "36px 64px 0", flexGrow: 1 }}>
            {team(ev.home, home)}
            <div style={{ display: "flex", fontSize: ev.state !== "pre" ? 84 : 56, color: ev.state !== "pre" ? "#ffffff" : "#5f6584" }}>{score}</div>
            {team(ev.away, away)}
          </div>
        ) : (
          <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center", fontSize: 44 }}>Pronos, coupon du jour, grosse cote</div>
        )}
        <div style={{ display: "flex", alignItems: "center", margin: "0 64px 44px", padding: "18px 24px", borderRadius: 22, background: "rgba(124,58,237,.18)", border: "2px solid rgba(168,85,247,.5)" }}>
          {pick ? (
            <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
              <div style={{ display: "flex", fontSize: 16, letterSpacing: 3, color: "#c4b5fd", marginRight: 18 }}>PRONO</div>
              <div style={{ display: "flex", fontSize: 30, flexGrow: 1 }}>{marketLabel("fr", pick.label)}</div>
              <div style={{ display: "flex", fontSize: 30, color: "#f472b6", marginRight: 16 }}>{`${pick.estimated ? "≈ " : "@ "}${Number(pick.odds).toFixed(2)}`}</div>
              <div style={{ display: "flex", fontSize: 22, color: "#9097b3" }}>{`${Math.round((pick.safe ?? pick.p) * 100)}%`}</div>
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 24, color: "#c4b5fd" }}>Pronostic, probabilités, cotes et analyse IA</div>
          )}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
  const buf = await img.arrayBuffer();
  return new Response(buf, { headers: { "content-type": "image/png", "cache-control": "public, max-age=600, s-maxage=600" } });
  } catch (e) {
    console.error("[og]", e?.stack || e);
    if (debug || process.env.OG_DEBUG === "true") return new Response(`OG error: ${e?.stack || e}`, { status: 200, headers: { "content-type": "text/plain" } });
    try { return new Response(await readFile(path.join(process.cwd(), "public", "og-default.png")), { headers: { "content-type": "image/png" } }); } catch { return new Response("", { status: 500 }); }
  }
}
