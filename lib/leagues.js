import CATALOG from "./soccer-leagues.json";

// Every league the site loads automatically. `id` is the ESPN slug (free fixtures, live
// scores, form, stats and DraftKings odds). `odds` is the matching The Odds API key, used
// only for the optional multi-bookmaker comparison (1xBet, Pinnacle, …). `cc` picks the
// flag image (Windows can't draw flag emoji); leagues without one show their emoji.
const CURATED = [
  { id: "uefa.champions", espn: 775, sport: "soccer", name: "Champions League", short: "UCL", flag: "🇪🇺", cc: "eu", odds: "soccer_uefa_champs_league", tier: 1 },
  { id: "eng.1", espn: 700, sport: "soccer", name: "Premier League", short: "EPL", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", cc: "gb-eng", odds: "soccer_epl", tier: 1 },
  { id: "esp.1", espn: 740, sport: "soccer", name: "La Liga", short: "LIGA", flag: "🇪🇸", cc: "es", odds: "soccer_spain_la_liga", tier: 1 },
  { id: "ita.1", espn: 730, sport: "soccer", name: "Serie A", short: "SA", flag: "🇮🇹", cc: "it", odds: "soccer_italy_serie_a", tier: 1 },
  { id: "ger.1", espn: 720, sport: "soccer", name: "Bundesliga", short: "BUN", flag: "🇩🇪", cc: "de", odds: "soccer_germany_bundesliga", tier: 1 },
  { id: "fra.1", espn: 710, sport: "soccer", name: "Ligue 1", short: "L1", flag: "🇫🇷", cc: "fr", odds: "soccer_france_ligue_one", tier: 1 },
  { id: "uefa.europa", espn: 776, sport: "soccer", name: "Europa League", short: "UEL", flag: "🇪🇺", cc: "eu", odds: "soccer_uefa_europa_league", tier: 2 },
  { id: "uefa.europa.conf", espn: 20296, sport: "soccer", name: "Conference League", short: "UECL", flag: "🇪🇺", cc: "eu", odds: "soccer_uefa_europa_conference_league", tier: 2 },
  { id: "caf.champions", espn: 2391, sport: "soccer", name: "CAF Champions League", short: "CAF", flag: "🌍", odds: null, tier: 2 },
  { id: "eng.2", espn: 3914, sport: "soccer", name: "Championship", short: "EFL", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", cc: "gb-eng", odds: "soccer_efl_champ", tier: 2 },
  { id: "por.1", espn: 715, sport: "soccer", name: "Primeira Liga", short: "POR", flag: "🇵🇹", cc: "pt", odds: "soccer_portugal_primeira_liga", tier: 2 },
  { id: "ned.1", espn: 725, sport: "soccer", name: "Eredivisie", short: "ERE", flag: "🇳🇱", cc: "nl", odds: "soccer_netherlands_eredivisie", tier: 2 },
  { id: "bel.1", espn: 3901, sport: "soccer", name: "Belgian Pro League", short: "BEL", flag: "🇧🇪", cc: "be", odds: "soccer_belgium_first_div", tier: 2 },
  { id: "tur.1", espn: 3946, sport: "soccer", name: "Süper Lig", short: "TUR", flag: "🇹🇷", cc: "tr", odds: "soccer_turkey_super_league", tier: 2 },
  { id: "sco.1", espn: 735, sport: "soccer", name: "Scottish Premiership", short: "SPL", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", cc: "gb-sct", odds: "soccer_spl", tier: 2 },
  { id: "fra.2", espn: 3926, sport: "soccer", name: "Ligue 2", short: "L2", flag: "🇫🇷", cc: "fr", odds: "soccer_france_ligue_two", tier: 3 },
  { id: "esp.2", espn: 3921, sport: "soccer", name: "LaLiga 2", short: "LIGA2", flag: "🇪🇸", cc: "es", odds: "soccer_spain_segunda_division", tier: 3 },
  { id: "ita.2", espn: 3931, sport: "soccer", name: "Serie B", short: "SB", flag: "🇮🇹", cc: "it", odds: "soccer_italy_serie_b", tier: 3 },
  { id: "ger.2", espn: 3927, sport: "soccer", name: "2. Bundesliga", short: "BUN2", flag: "🇩🇪", cc: "de", odds: "soccer_germany_bundesliga2", tier: 3 },
  { id: "ksa.1", espn: 21231, sport: "soccer", name: "Saudi Pro League", short: "SPL", flag: "🇸🇦", cc: "sa", odds: null, tier: 3 },
  { id: "usa.1", espn: 770, sport: "soccer", name: "MLS", short: "MLS", flag: "🇺🇸", cc: "us", odds: "soccer_usa_mls", tier: 3 },
  { id: "mex.1", espn: 760, sport: "soccer", name: "Liga MX", short: "LMX", flag: "🇲🇽", cc: "mx", odds: "soccer_mexico_ligamx", tier: 3 },
  { id: "bra.1", espn: 630, sport: "soccer", name: "Brasileirão", short: "BRA", flag: "🇧🇷", cc: "br", odds: "soccer_brazil_campeonato", tier: 3 },
  { id: "arg.1", espn: 745, sport: "soccer", name: "Liga Profesional", short: "ARG", flag: "🇦🇷", cc: "ar", odds: "soccer_argentina_primera_division", tier: 3 },
  { id: "nba", sport: "basketball", name: "NBA", short: "NBA", flag: "🏀", odds: "basketball_nba", tier: 1 },
  { id: "wnba", sport: "basketball", name: "WNBA", short: "WNBA", flag: "🏀", odds: "basketball_wnba", tier: 3 },
  { id: "nfl", sport: "football", name: "NFL", short: "NFL", flag: "🏈", odds: "americanfootball_nfl", tier: 2 },
  { id: "nhl", sport: "hockey", name: "NHL", short: "NHL", flag: "🏒", odds: "icehockey_nhl", tier: 3 },
  { id: "mlb", sport: "baseball", name: "MLB", short: "MLB", flag: "⚾", odds: "baseball_mlb", tier: 3 },
  // every other basketball / hockey competition ESPN covers (fixtures and scores; picks only where it has odds)
  { id: "nbl", sport: "basketball", name: "NBL (Australia)", short: "NBL", flag: "🏀", cc: "au", odds: "basketball_nbl", tier: 3 },
  { id: "fiba", sport: "basketball", name: "FIBA", short: "FIBA", flag: "🏀", odds: null, tier: 4 },
  { id: "nba-development", sport: "basketball", name: "G League", short: "GL", flag: "🏀", odds: null, tier: 4 },
  { id: "mens-college-basketball", sport: "basketball", name: "NCAA Basketball", short: "NCAAB", flag: "🏀", odds: "basketball_ncaab", tier: 4 },
  { id: "womens-college-basketball", sport: "basketball", name: "NCAA Women's Basketball", short: "NCAAW", flag: "🏀", odds: null, tier: 5, women: true },
  { id: "mens-college-hockey", sport: "hockey", name: "NCAA Hockey", short: "NCAAH", flag: "🏒", odds: null, tier: 4 },
  { id: "womens-college-hockey", sport: "hockey", name: "NCAA Women's Hockey", short: "NCAAWH", flag: "🏒", odds: null, tier: 5, women: true },
  // tournaments (active only in their windows): ESPN carries no other hockey league — KHL, SHL,
  // Liiga, DEL… have no free fixtures/scores feed, so they can't be loaded yet
  { id: "hockey-world-cup", sport: "hockey", name: "World Cup of Hockey", short: "WCH", flag: "🏒", odds: null, tier: 4 },
  { id: "olympics-mens-ice-hockey", sport: "hockey", name: "Olympic Hockey (men)", short: "OLY", flag: "🏒", odds: null, tier: 4 },
  { id: "olympics-womens-ice-hockey", sport: "hockey", name: "Olympic Hockey (women)", short: "OLYW", flag: "🏒", odds: null, tier: 5, women: true },
];

// Every other football competition ESPN covers (219 in lib/soccer-leagues.json: [espnId, slug,
// name, women]) is added automatically after the curated ones, so no league is ever missing.
const CC = {
  eng: "gb-eng", sco: "gb-sct", wal: "gb-wls", nir: "gb-nir", esp: "es", ger: "de", ita: "it", fra: "fr", por: "pt", ned: "nl", bel: "be",
  tur: "tr", ksa: "sa", usa: "us", mex: "mx", bra: "br", arg: "ar", bol: "bo", col: "co", ecu: "ec", per: "pe", uru: "uy", par: "py",
  chi: "cl", ven: "ve", jpn: "jp", aus: "au", aut: "at", hon: "hn", rsa: "za", rus: "ru", slv: "sv", swe: "se", gre: "gr", nor: "no",
  crc: "cr", ind: "in", chn: "cn", can: "ca", den: "dk", gua: "gt", sui: "ch", pol: "pl", cze: "cz", cro: "hr", srb: "rs", ukr: "ua",
  rou: "ro", irl: "ie", isr: "il", egy: "eg", mar: "ma", nga: "ng", kor: "kr", uae: "ae", qat: "qa", uefa: "eu",
};
const REGION_FLAG = { caf: "🌍", afc: "🌏", aff: "🌏", concacaf: "🌎", conmebol: "🌎", campeones: "🌎", fifa: "🌐", club: "🌐", friendly: "🤝", global: "🌐", nonfifa: "🌐" };
const tierOf = (slug, women) => {
  if (women) return 5;
  if (/ncaa|u1\d|u2\d|youth|olympic/i.test(slug)) return 6;
  if (/friendly/.test(slug)) return 5;
  const n = slug.match(/^[a-z]+\.(\d)$/);
  return n && Number(n[1]) >= 2 ? 4 : 3;
};
// "AFC Champions League Two" → "AFC CL Two", "English League One" → "League One"
const shortName = (name) => {
  const s = name
    .replace(/\bChampions League\b/, "CL").replace(/\bConfederation Cup\b/, "Confed Cup")
    .replace(/\bDivision\b/, "Div").replace(/\bPrimera\b/, "Pr.").replace(/\bPremier League\b/, "PL")
    .replace(/^(English|Spanish|German|Italian|French|Dutch|Portuguese|Scottish|Argentine|Brazilian|Mexican|Japanese|Chinese|Australian|Belgian|Turkish|Russian|Greek|Swedish|Norwegian|Danish|Austrian|Swiss|Colombian|Peruvian|Chilean|Bolivian|Paraguayan|Venezuelan|Uruguayan|Ecuadorian|Honduran|Guatemalan|Salvadoran|Costa Rican|Indian|Saudi|South African|American) /, "");
  return s.length > 18 ? `${s.slice(0, 17)}…` : s;
};
const CURATED_BY_SLUG = new Set(CURATED.map((l) => l.id));
const EXTRA = CATALOG.filter(([, slug]) => !CURATED_BY_SLUG.has(slug)).map(([espn, slug, name, women]) => {
  const pre = slug.split(".")[0];
  return {
    id: slug, espn: Number(espn), sport: "soccer", name, short: shortName(name), cc: CC[pre] || null,
    flag: REGION_FLAG[pre] || "🏆", odds: null, tier: tierOf(slug, women), women: !!women,
  };
}).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

export const LEAGUES = [...CURATED, ...EXTRA];
export const LEAGUE_BY_ESPN = Object.fromEntries(LEAGUES.filter((l) => l.espn).map((l) => [String(l.espn), l.id]));
export const LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map((l) => [l.id, l]));
export const CURATED_LEAGUES = CURATED;
export const SPORT_LABEL = { soccer: "Football", basketball: "Basketball", football: "American football", hockey: "Hockey", baseball: "Baseball" };
export const isSoccer = (leagueId) => LEAGUE_BY_ID[leagueId]?.sport === "soccer";
