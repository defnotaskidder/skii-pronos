import { analysedBoard } from "../lib/board";
import { LEAGUE_BY_ID } from "../lib/leagues";

export const revalidate = 3600;

const site = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://skii-pronos.vercel.app");

export default async function sitemap() {
  const pages = ["", "/matches", "/live", "/coupon", "/grosse-cote", "/record", "/history", "/legal"].map((p) => ({ url: `${site}${p}`, lastModified: new Date(), changeFrequency: p === "" || p === "/matches" || p === "/live" ? "hourly" : "daily", priority: p === "" ? 1 : 0.7 }));
  try {
    const rows = await analysedBoard(2);
    const matches = rows.filter((r) => r.ev.state !== "post" && (LEAGUE_BY_ID[r.ev.league]?.tier ?? 9) <= 4)
      .map((r) => ({ url: `${site}/match/${r.ev.league}/${r.ev.id}`, lastModified: new Date(), changeFrequency: "hourly", priority: LEAGUE_BY_ID[r.ev.league]?.tier === 1 ? 0.9 : 0.6 }));
    return [...pages, ...matches.slice(0, 2000)];
  } catch {
    return pages;
  }
}
