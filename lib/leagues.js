// Every league the site loads automatically. `id` is the ESPN slug (free fixtures, live
// scores, form, stats and DraftKings odds). `odds` is the matching The Odds API key, used
// only for the optional multi-bookmaker comparison (1xBet, Pinnacle, …).
export const LEAGUES = [
  { id: "uefa.champions", espn: 775, sport: "soccer", name: "Champions League", short: "UCL", flag: "🇪🇺", odds: "soccer_uefa_champs_league", tier: 1 },
  { id: "eng.1", espn: 700, sport: "soccer", name: "Premier League", short: "EPL", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", odds: "soccer_epl", tier: 1 },
  { id: "esp.1", espn: 740, sport: "soccer", name: "La Liga", short: "LIGA", flag: "🇪🇸", odds: "soccer_spain_la_liga", tier: 1 },
  { id: "ita.1", espn: 730, sport: "soccer", name: "Serie A", short: "SA", flag: "🇮🇹", odds: "soccer_italy_serie_a", tier: 1 },
  { id: "ger.1", espn: 720, sport: "soccer", name: "Bundesliga", short: "BUN", flag: "🇩🇪", odds: "soccer_germany_bundesliga", tier: 1 },
  { id: "fra.1", espn: 710, sport: "soccer", name: "Ligue 1", short: "L1", flag: "🇫🇷", odds: "soccer_france_ligue_one", tier: 1 },
  { id: "uefa.europa", espn: 776, sport: "soccer", name: "Europa League", short: "UEL", flag: "🇪🇺", odds: "soccer_uefa_europa_league", tier: 2 },
  { id: "uefa.europa.conf", espn: 20296, sport: "soccer", name: "Conference League", short: "UECL", flag: "🇪🇺", odds: "soccer_uefa_europa_conference_league", tier: 2 },
  { id: "caf.champions", espn: 2391, sport: "soccer", name: "CAF Champions League", short: "CAF", flag: "🌍", odds: null, tier: 2 },
  { id: "eng.2", espn: 3914, sport: "soccer", name: "Championship", short: "EFL", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", odds: "soccer_efl_champ", tier: 2 },
  { id: "por.1", espn: 715, sport: "soccer", name: "Primeira Liga", short: "POR", flag: "🇵🇹", odds: "soccer_portugal_primeira_liga", tier: 2 },
  { id: "ned.1", espn: 725, sport: "soccer", name: "Eredivisie", short: "ERE", flag: "🇳🇱", odds: "soccer_netherlands_eredivisie", tier: 2 },
  { id: "bel.1", espn: 3901, sport: "soccer", name: "Belgian Pro League", short: "BEL", flag: "🇧🇪", odds: "soccer_belgium_first_div", tier: 2 },
  { id: "tur.1", espn: 3946, sport: "soccer", name: "Süper Lig", short: "TUR", flag: "🇹🇷", odds: "soccer_turkey_super_league", tier: 2 },
  { id: "sco.1", espn: 735, sport: "soccer", name: "Scottish Premiership", short: "SPL", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", odds: "soccer_spl", tier: 2 },
  { id: "fra.2", espn: 3926, sport: "soccer", name: "Ligue 2", short: "L2", flag: "🇫🇷", odds: "soccer_france_ligue_two", tier: 3 },
  { id: "esp.2", espn: 3921, sport: "soccer", name: "LaLiga 2", short: "LIGA2", flag: "🇪🇸", odds: "soccer_spain_segunda_division", tier: 3 },
  { id: "ita.2", espn: 3931, sport: "soccer", name: "Serie B", short: "SB", flag: "🇮🇹", odds: "soccer_italy_serie_b", tier: 3 },
  { id: "ger.2", espn: 3927, sport: "soccer", name: "2. Bundesliga", short: "BUN2", flag: "🇩🇪", odds: "soccer_germany_bundesliga2", tier: 3 },
  { id: "ksa.1", espn: 21231, sport: "soccer", name: "Saudi Pro League", short: "SPL", flag: "🇸🇦", odds: null, tier: 3 },
  { id: "usa.1", espn: 770, sport: "soccer", name: "MLS", short: "MLS", flag: "🇺🇸", odds: "soccer_usa_mls", tier: 3 },
  { id: "mex.1", espn: 760, sport: "soccer", name: "Liga MX", short: "LMX", flag: "🇲🇽", odds: "soccer_mexico_ligamx", tier: 3 },
  { id: "bra.1", espn: 630, sport: "soccer", name: "Brasileirão", short: "BRA", flag: "🇧🇷", odds: "soccer_brazil_campeonato", tier: 3 },
  { id: "arg.1", espn: 745, sport: "soccer", name: "Liga Profesional", short: "ARG", flag: "🇦🇷", odds: "soccer_argentina_primera_division", tier: 3 },
  { id: "nba", sport: "basketball", name: "NBA", short: "NBA", flag: "🏀", odds: "basketball_nba", tier: 1 },
  { id: "wnba", sport: "basketball", name: "WNBA", short: "WNBA", flag: "🏀", odds: "basketball_wnba", tier: 3 },
  { id: "nfl", sport: "football", name: "NFL", short: "NFL", flag: "🏈", odds: "americanfootball_nfl", tier: 2 },
  { id: "nhl", sport: "hockey", name: "NHL", short: "NHL", flag: "🏒", odds: "icehockey_nhl", tier: 3 },
  { id: "mlb", sport: "baseball", name: "MLB", short: "MLB", flag: "⚾", odds: "baseball_mlb", tier: 3 },
];

export const LEAGUE_BY_ESPN = Object.fromEntries(LEAGUES.filter((l) => l.espn).map((l) => [String(l.espn), l.id]));
export const LEAGUE_BY_ID = Object.fromEntries(LEAGUES.map((l) => [l.id, l]));
export const SPORT_LABEL = { soccer: "Football", basketball: "Basketball", football: "American football", hockey: "Hockey", baseball: "Baseball" };
export const isSoccer = (leagueId) => LEAGUE_BY_ID[leagueId]?.sport === "soccer";
