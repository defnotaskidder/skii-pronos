import { summary } from "../../../../lib/espn";
import { LEAGUE_BY_ID } from "../../../../lib/leagues";

// Server-side title/description per match (search engines, Telegram/WhatsApp link previews).
export async function generateMetadata({ params }) {
  const { league, id } = params;
  const L = LEAGUE_BY_ID[league];
  const base = { title: "Match · Skii Pronos", description: "Pronostic, cotes et analyse du match." };
  if (!L) return base;
  try {
    const s = await summary(league, id, false);
    const ev = s.event;
    const when = new Date(ev.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: process.env.SITE_TZ || "Africa/Abidjan" });
    const title = `${ev.home.short} vs ${ev.away.short} — prono, cotes et analyse | Skii Pronos`;
    const description = `${L.name} · ${when}. Pronostic du moteur Skii Pronos, probabilités, cotes 1X2, forme, classement et analyse IA pour ${ev.home.name} – ${ev.away.name}.`;
    return {
      title, description,
      alternates: { canonical: `/match/${league}/${id}` },
      openGraph: { title, description, type: "article", locale: "fr_FR" },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return base;
  }
}

export default function MatchLayout({ children }) {
  return children;
}
