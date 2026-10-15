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

const logo = (url) => (url ? `https://a.espncdn.com/combiner/i?img=${url.replace(/^https?:\/\/a\.espncdn\.com/, "")}&w=220&h=220` : null);

// Link-preview image per match: logos, kick-off, and the engine's pick when the board is warm.
export default async function Image({ params }) {
  const { league, id } = params;
  const L = LEAGUE_BY_ID[league];
  let ev = null, pick = null;
  try { ev = (await summary(league, id, false)).event; } catch { /* generic card */ }
  try {
    const rows = await Promise.race([analysedBoard(2), new Promise((_, r) => setTimeout(() => r(new Error("slow")), 6000))]);
    const row = rows.find((r) => r.ev.id === id);
    pick = row?.analysis?.pick || null;
    if (!ev && row) ev = row.ev;
  } catch { /* no pick on the card */ }
  const when = ev ? new Date(ev.date).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: process.env.SITE_TZ || "Africa/Abidjan" }) : "";
  const score = ev && ev.state !== "pre" ? `${ev.home.score ?? 0} – ${ev.away.score ?? 0}` : "VS";
  // the site's font (TTF: the image renderer doesn't read woff2)
  const fonts = [];
  try { fonts.push({ name: "Outfit", data: await readFile(path.join(process.cwd(), "public", "fonts", "outfit-bold.ttf")), weight: 700, style: "normal" }); } catch { /* default font */ }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(160deg, #0b0d1c 0%, #05060c 60%)", color: "#f3f4fb", fontFamily: "Outfit, sans-serif", position: "relative" }}>
        <div style={{ position: "absolute", right: -120, top: -160, width: 520, height: 520, borderRadius: 999, background: "rgba(236,72,153,.22)", display: "flex" }} />
        <div style={{ position: "absolute", left: -180, bottom: -220, width: 560, height: 560, borderRadius: 999, background: "rgba(124,58,237,.28)", display: "flex" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "44px 64px 0" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#7c3aed,#c026d3 55%,#ec4899)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 32, fontWeight: 800 }}>S</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, fontWeight: 800 }}>Skii Pronos</div>
            <div style={{ fontSize: 20, color: "#9097b3" }}>{L ? `${L.name} · ${when}` : "Pronos & cotes"}</div>
          </div>
        </div>
        {ev ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", padding: "36px 64px 0", flex: 1 }}>
            {[ev.home, ev.away].map((tm, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: 360 }}>
                {logo(tm.logo) ? <img src={logo(tm.logo)} width={150} height={150} style={{ objectFit: "contain" }} /> : <div style={{ width: 150, height: 150, borderRadius: 999, background: "rgba(255,255,255,.08)", display: "flex" }} />}
                <div style={{ fontSize: 34, fontWeight: 800, textAlign: "center" }}>{tm.short}</div>
              </div>
            ))}
            <div style={{ position: "absolute", left: 0, right: 0, top: 236, display: "flex", justifyContent: "center", fontSize: ev.state !== "pre" ? 84 : 56, fontWeight: 800, color: ev.state !== "pre" ? "#fff" : "#5f6584" }}>{score}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 800 }}>Pronos, coupon du jour, grosse cote</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "0 64px 44px", padding: "18px 24px", borderRadius: 22, background: "rgba(124,58,237,.16)", border: "2px solid rgba(168,85,247,.5)" }}>
          {pick ? (
            <>
              <div style={{ fontSize: 16, letterSpacing: 3, color: "#c4b5fd", fontWeight: 700 }}>PRONO</div>
              <div style={{ fontSize: 30, fontWeight: 800, flex: 1 }}>{marketLabel("fr", pick.label)}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "#f472b6" }}>{pick.estimated ? "≈ " : "@ "}{Number(pick.odds).toFixed(2)}</div>
              <div style={{ fontSize: 22, color: "#9097b3" }}>{Math.round((pick.safe ?? pick.p) * 100)}%</div>
            </>
          ) : (
            <div style={{ fontSize: 24, color: "#c4b5fd" }}>Pronostic, probabilités, cotes et analyse IA</div>
          )}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
