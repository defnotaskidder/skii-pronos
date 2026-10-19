# Skii Pronos

Football predictions in French (English on request): every competition ESPN covers loads by itself, every match gets a model pick with an honest hit chance, there's a **coupon du jour** and a **grosse cote du jour** every day plus a big-odds generator, live and full AI analysis on any match, goal alerts in the browser / Telegram / WhatsApp, a public track record, and accounts that sync everything.

## Pages

| Page | What it does |
|---|---|
| **Accueil / Dashboard** | Coupon du jour, grosse cote, live now, top picks for the next 24 h, value spots, your 7-day record |
| **Matchs** | 224 football competitions + NBA / NFL / NHL / MLB + European hockey (SHL, Liiga… via The Odds API), yesterday → +2 days. Filters: live / upcoming / finished, day, sport, men's / women's / youth, league, search |
| **En direct** | Everything in play, scores and minutes refreshed every 15 s |
| **Coupon du jour** | The safest coupon (~2.5) and the grosse cote (~30), AI-checked, plus a builder for any target 1.5 → 10 |
| **Grosse cote** | Generator for 10 → 1000 (or any number): best possible chance at the target, "another one" for new combinations |
| **Match page** | Engine pick + value pick, every market with chance / fair odds / price / EV, live model, stats, key moments, form, table, lineups, bookmaker comparison, **AI analyst**, team strength |
| **Historique** | Every game the engine picked (graded automatically), the daily coupons archive, and your own tracked coupons with stakes and profit |
| **Palmarès (/record)** | Public track record: profit curve, hit rate by confidence and league, calibration, daily-coupon record |
| **Notifications** | In-site inbox, push alerts (site closed), Telegram / WhatsApp link, followed matches |
| **Paramètres** | Account, language, alerts, install as an app, legal |

## How the prono engine works

1. **Market** — bookmaker odds (DraftKings via ESPN; Pinnacle optional) with the margin removed.
2. **Goals model** — a Dixon-Coles Poisson model fitted to those fair odds prices every market consistently.
3. **Stats model** — league table, recent form, and **Elo-style team ratings** learned from every finished game, blended in. Disagreement with the price = a **value** spot.
4. **Calibration** — once 150+ picks are graded, displayed chances and tiers are corrected by what actually happened to picks with the same stated chance.
5. **Pick** — the market with the best balance of hit chance and price (minimum ~1.20) with a confidence tier. Markets without a live price show the minimum odds worth taking (marked ≈).
6. **Coupons** — the grosse-cote optimizer keeps, for each match, the leg that gives up the least chance per unit of odds and finishes with the leg that closes the gap for the smallest loss.
7. **Live** — remaining goals re-priced from minute, score, red cards and shots.

### Hockey

Hockey has its own engine (`lib/hockey.js`, maths in `lib/hockey-core.js`): regulation goals as a Poisson pair with a fitted tie inflation, then overtime (3-on-3, decided by a goal about two thirds of the time) and the shootout. Expected goals come from a strength model — league scoring rate, home ice, goals-for/against and shot volumes (ESPN team statistics), last-ten form, the hockey Elo gap and rest days (back-to-backs) — whose weights `scripts/train-hockey.mjs` fits on five NHL seasons walk-forward (`npm run train:hockey`, report in `scripts/hockey-report.md`, parameters in `lib/hockey-params.json`). Where DraftKings prices the game, expected goals are solved from the de-vigged moneyline, total and puck line and the strength model nudges them; college and tournament games run on the strength model alone. Markets: moneyline (incl. OT & SO), 60-minute 1X2 and double chance, puck line ±1.5, totals 4.5–7.5 (OT goal counts, shootout goal doesn't), team totals, overtime yes/no, winning margins, exact regulation scores. Settlement knows how each game ended (ESPN's `Final/OT`, `Final/SO`).

ESPN carries only the NHL, NCAA hockey, the Olympics and the World Cup of Hockey. The European leagues come from **The Odds API** instead (`lib/oddsapi-leagues.js`, same `ODDS_API_KEY`): SHL, HockeyAllsvenskan, Liiga, Mestis and the AHL today, plus KHL / DEL / Swiss National League / Czech Extraliga the day the feed lists them (`lib/leagues.js`, entries with `source: "oddsapi"`). Fixtures and prices come from `/odds` (moneyline incl. OT & SO from the first 2-way book in `ODDS_BOOKMAKERS` order — on this feed 1xBet and the French books price the 60 minutes with a draw, Pinnacle / 888sport / Betsson the full game; main total from the first book listing it; `ODDS_HOCKEY_MARKETS=h2h,totals,spreads` adds the puck line for a third credit — untested whether the `eu` books return it), results from `/scores` (three days back). Without a puck line most picks on these leagues are totals at an estimated price (shown with ≈), which keeps them out of the top picks and the coupons; the NHL gets priced picks from DraftKings' puck line. Those games get the same hockey engine — no table there, so expected goals are solved from the prices and nudged by the league's scoring rate, the Elo ratings (learned on stable `oa:<league>:<team>` ids) and rest days — and the same saving/grading in the database. The results feed gives final scores only (no OT / shootout flag), so 60-minute and overtime markets are shown for information and never picked, and a shootout goal counts in the total. Credits: `/sports` is free and decides which leagues are in season; each league in season costs one credit per market (`h2h,totals` → 2) every `ODDS_HOCKEY_MIN` minutes (default `ODDS_CACHE_MIN` = 30) while the site is being visited, and 2 credits for results every `ODDS_SCORES_MIN` minutes (default 15) while a started game awaits its final score, else every `ODDS_SWEEP_MIN` (default 360, so finished games still feed the ratings). In October five leagues are in season, so the defaults spend up to ~500 credits a day — a paid plan (20 000/month) keeps them comfortably. The free plan (500/month ≈ 16 a day) fits one league refreshed four times a day: `ODDS_HOCKEY_LEAGUES=shl`, `ODDS_HOCKEY_MIN=360`, `ODDS_SCORES_MIN=60`, `ODDS_SWEEP_MIN=720`. Whatever the plan, the last `ODDS_RESERVE` credits (default 100) are never spent on these leagues, so the bookmaker comparison panel keeps working; the leagues then show their last fetched prices until the month resets.

### NFL

The NFL has its own engine (`lib/nfl.js`, maths in `lib/nfl-core.js`, parameters in `lib/nfl-params.json`, report in `scripts/nfl-report.md`). `npm run train:nfl` downloads every game since 2015 with ESPN's kept closing lines and both box scores (`scripts/nfl-history.mjs`, resumable, into `.cache/nfl`) and fits, walk-forward:

1. **Score grid** — the 60-minute score is a grid over (home, away) points: normal densities around the game's margin and total, times fitted weights per team score (3, 7, 10, 13, 14, 17, 20, 21, 24… common; 1 impossible) and per margin (the key numbers 3, 7, 10, 14). Fitted by maximum likelihood of every regulation score given the closing spread and total (team scores of 50+ and margins of 30+ share one pooled weight each). On the held-out 2025 season it gave a 3-point final margin 14.9% (actual 16.1% of 285 games; a plain normal curve says 7.4%) and improved the exact-score log-likelihood from −7.19 to −6.79 per game. Pushes on whole-number spreads matched in the fitted seasons (6.8% predicted, 4 of 58 games); the hold-out had none in 24 such games (1.7 expected), too few to say more.
2. **Overtime** — share of regular-season overtimes that end tied, a tilt of the winner toward the stronger side, and the points overtime adds (field goal, touchdown, both teams possessing).
3. **Elo** (538 style: K ≈ 20, home field, margin-of-victory multiplier, a share regressed to the mean each season) — `lib/ratings.js` starts every team from the ratings the trainer ended on.
4. **Strength model** — home field, Elo gap, points and yards-per-play differentials (turnovers and rest are tested and dropped when they don't help out of sample), and a total model.

The closing line is the consensus of real sportsbooks (prediction sites, aggregates and one provider whose stored lines are in-game ones left out; a book more than 3 points off the others dropped), solved with its own juice. On the held-out 2025 season it beats the strength model (margin error 12.19 vs 12.83 points; moneyline log loss 0.610 vs 0.633) and disagreeing with it didn't win against the spread (35–47% at 2–4 point gaps), so the fitted blend weight is ~0: the engine solves the game's margin and total from DraftKings' de-vigged moneyline, spread and total, then prices every market from the grid — moneyline (a tie voids), 60-minute 3-way, the book's spread ± 1/3/7 and the key-number lines, totals ± 3.5/7, team totals, winning-margin bands, overtime yes/no, odd/even. Skii's own line is shown next to the market's on the match page; without prices it prices the game alone. Overtime points come from today's rules (both teams possess: playoffs since 2022, regular season since 2025), shrunk toward the 2017+ table. Live: drive by drive — each side's remaining share of ~11 possessions scores field goals, touchdowns (with or without the extra point, or two) or safeties at the rate that matches the pre-game margin and total scaled by the time left, so the score never moves by 1 and nothing happens at 0:00; a calibrated tie tendency starts the live model exactly at the pre-game overtime chance, and overtime points count in the live totals. Preseason games are neither priced nor rated. The strength model's defence uses last season's yards allowed (ESPN's season statistics have no yards allowed; the trainer fits the same thing), and offense uses net yards (sacks taken off). Settlement handles ties and ESPN's `Final/OT`, `Final/2OT`. Re-run `npm run train:nfl` once a year (before week 1): the parameters carry priors for the season under way and the next one, and fresh Elo seeds.

Team ratings are stored per league for every sport except soccer (`nhl:1`, `nfl:1`): ESPN reuses team ids across sports, so before this the NHL's Bruins and the NFL's Falcons shared one rating. NHL and NFL teams start from the Elo their trainers ended on (`elo.seed` in the params files); games after the seed's date are applied on top (tracked in `skii_rated` as `k2:<event id>` outside soccer, so games the old code rated under shared ids are rated again under the new keys).

## Daily coupons, express builds, live grosse cote

- **Coupon du jour** — the combination of at least two real-priced legs (every sport) with the highest chance of landing at ~2.00 (`lib/coupon.js` buildTarget, `lib/daily.js`). It always publishes: the next 30 h, softer legs, then estimated prices are tried in turn. No coupon is certain; it's the best chance the prices allow.
- **Express builds, same day** — x12.5, x100 (the grosse cote du jour), x200 and x300/400, each the highest-chance combination of the day's priced legs; stored and graded like the coupon du jour (`skii_daily` kinds `x12`, `grosse`, `x200`, `x400`).
- **Live grosse cote** — `/api/live-coupon?target=20`, built from the games in play with the live models; prices are estimates (no free live odds feed).

The phone layout follows the sketch: four tabs (Accueil, Pronos, Stats, VIP), a header menu with every other page, snow (switchable) and the Juice WRLD music player (Spotify's official embed, switchable — songs can't be hosted). The home page reads only `/api/home`; the full board loads on the pages that need it.

## Alerts, bots and the daily posts

- **In the browser**: toasts + optional pop-ups while the site is open; **push** alerts with the site closed (Settings → Alerts).
- **Telegram**: create a bot with @BotFather, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`; make the bot an admin of your channel and set `TELEGRAM_CHANNEL` (e.g. `@skiipronos`). The webhook registers itself on the next daily run (or open `/api/telegram?key=<CRON_SECRET>`). Commands: `/start`, `/coupon`, `/grosse`, `/results`, `/alerts`, `/lang en`, `/link CODE`, `/stop`.
- **WhatsApp**: Meta Cloud API (developers.facebook.com → WhatsApp). Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_NUMBER`, `WHATSAPP_VERIFY_TOKEN`, point the webhook at `/api/whatsapp`, and (for messages sent outside the 24-hour window) an approved template name in `WHATSAPP_TEMPLATE`. Users write `start`, `coupon`, `grosse`, `résultats`, `lien CODE`, `stop`.
- **Linking an account**: Settings → Telegram / WhatsApp gives a one-time code; after `/start CODE` the chat gets goal alerts for the matches that account follows and results for its tracked coupons.
- **Daily posts**: coupon du jour + grosse cote at `POST_HOUR` (default 08:00 `SITE_TZ`) to the channel, subscribers and push devices; results at `RESULTS_HOUR` (23:00).
- **The tick** (`/api/tick?key=…`): the alert engine. Run it every minute from Supabase (`pg_cron` + `pg_net`) or any pinger; the two Vercel crons in `vercel.json` run it at least twice a day. The key is `TICK_SECRET`, `CRON_SECRET`, or the secret the app generates in `skii_config` (`tick_secret`).

## Settings (all optional)

See `.env.example`. Fixtures, scores, stats, form, standings and the main odds come from ESPN's public feed and need no key. Accounts, history, ratings, alerts and bots need the Supabase database (Vercel → Storage → Supabase); the app creates its tables itself.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Push to `main` and Vercel deploys.

18+. Bet responsibly: flat stakes, never chase losses.
