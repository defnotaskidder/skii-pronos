// What earns an AI call. The numeric engine runs on every match for free; the AI analyst (and its
// web searches) is expensive, so it is kept for the matches readers actually care about:
//   • the big competitions (AI_LEAGUES, default: Champions / Europa League, the top-five European
//     leagues, World Cup, Euros, Club World Cup),
//   • NBA / NFL / NHL playoff games,
//   • and never a finished match.
// On top of that: every analysis is cached (a popular match is analysed once, not once per visitor)
// and a daily cap (AI_DAILY_MAX, default 30 analyses) stops a busy day from emptying the key.
import { LEAGUE_BY_ID } from "./leagues";
import { withDb, dbEnabled } from "./db";

const DEFAULT_LEAGUES = [
  "uefa.champions", "uefa.europa", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "fifa.world", "uefa.euro", "fifa.cwc",
];
const PLAYOFF_SPORTS = new Set(["nba", "nfl", "nhl"]);

const leagueSet = () => {
  const env = (process.env.AI_LEAGUES || "").split(",").map((s) => s.trim()).filter(Boolean);
  return new Set(env.length ? env : DEFAULT_LEAGUES);
};

// Is a league one of the crucial ones (used for coupon reviews and the special night)?
export const crucialLeague = (leagueId) => leagueSet().has(leagueId);

// Is this match worth an AI analysis? `ev` needs league, state and (for playoffs) seasonType.
export function aiWorthy(ev) {
  if (!ev || !LEAGUE_BY_ID[ev.league] || ev.state === "post" || ev.postponed) return false;
  if (crucialLeague(ev.league)) return true;
  return PLAYOFF_SPORTS.has(ev.league) && ev.seasonType === 3;
}

// Why not, in the visitor's language.
export const gatedMessage = (lang = "fr") => (lang === "en"
  ? "The AI analyst is kept for the big matches (Champions League, Europa League, top-five leagues, playoffs, World Cup). The model's numbers above cover this one."
  : "L'analyse IA est réservée aux grands matchs (Ligue des champions, Ligue Europa, grands championnats, playoffs, Coupe du monde). Les chiffres du modèle ci-dessus couvrent ce match.");

// Daily cap, shared by every server instance through the database (in memory without one).
const memCount = globalThis.__skiiAiCount || (globalThis.__skiiAiCount = new Map());
export async function takeBudget(scope = "insight") {
  const max = Math.max(1, Number(process.env.AI_DAILY_MAX) || 30);
  const key = `ai-count:${scope}:${new Date().toISOString().slice(0, 10)}`;
  let n = null;
  if (dbEnabled()) {
    const rows = await withDb("aiBudget", (sql) => sql`
      insert into skii_config (key, value, updated_at) values (${key}, ${sql.json({ n: 1 })}, now())
      on conflict (key) do update set value = jsonb_build_object('n', coalesce((skii_config.value->>'n')::int, 0) + 1), updated_at = now()
      returning (value->>'n')::int as n`, null);
    n = rows?.[0]?.n ?? null;
  }
  if (n === null) { n = (memCount.get(key) || 0) + 1; memCount.set(key, n); }
  return n <= max;
}
