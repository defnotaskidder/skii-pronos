# Skii Pronos

Football predictions in French (English on request): every competition ESPN covers loads by itself, every match gets a model pick with an honest hit chance, there's a **coupon du jour** and a **grosse cote du jour** every day plus a big-odds generator, live and full AI analysis on any match, goal alerts in the browser / Telegram / WhatsApp, a public track record, and accounts that sync everything.

## Pages

| Page | What it does |
|---|---|
| **Accueil / Dashboard** | Coupon du jour, grosse cote, live now, top picks for the next 24 h, value spots, your 7-day record |
| **Matchs** | 224 football competitions + NBA / NFL / NHL / MLB, yesterday → +2 days. Filters: live / upcoming / finished, day, sport, men's / women's / youth, league, search |
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
