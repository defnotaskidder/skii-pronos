# Skii Pronos

Live football (and NBA / NFL / NHL / MLB) predictions: every league loads by itself, every match gets a model pick with an honest hit chance, there's a **coupon du jour** every day, live and full AI analysis on any match, goal alerts, and a history that grades itself.

## What's on the site

| Page | What it does |
|---|---|
| **Dashboard** | Coupon du jour, live now, top picks for the next 24 h, value spots, your 7-day record |
| **Matches** | Every league, yesterday → +2 days. Filter Live / Upcoming / Finished, by day, sport, league, or search. Tap a price or a pick to add it to your coupon |
| **Live** | Everything in play, refreshed every 30 s, plus games starting soon and just finished |
| **Coupon du jour** | Safe coupon (~2.5 odds, AI-checked when a key is set), bold coupon (~8), and a builder for any target (2 → 200) |
| **Match page** | Engine pick + value pick, every market with chance / fair odds / price / EV, live model (win/draw/loss, next goal, overs re-priced from score, minute, red cards, shots), stats, key moments, form, table, lineups, bookmaker comparison, **AI analyst** |
| **History** | Tracked coupons, graded automatically from final scores: hit rate, units, ROI |
| **Notifications** | Follow any match (🔔) for kick-off, goal, red-card and full-time alerts; coupon du jour and win/loss alerts; optional browser pop-ups |
| **Sign in** | Email/password and Google via Supabase (switched on by two env vars) |

## How the prono engine works

1. **Market** — bookmaker odds (DraftKings via ESPN) with the margin removed (power method).
2. **Goals model** — a Dixon-Coles Poisson model fitted to those fair odds prices every other market consistently: double chance, draw-no-bet, over/unders, BTTS, team goals, clean sheets, combos, handicaps, exact scores.
3. **Stats model** — expected goals from the league table (attack/defence vs league average) and recent form, blended in at a small weight. Where it disagrees with the price, that's a **value** spot.
4. **Pick** — the market with the best balance of hit chance and price (minimum ~1.20), with a confidence tier. If a market has no live price, the site shows the minimum odds worth taking on 1xBet (marked ≈).
5. **Live** — remaining goals re-priced from the minute, score, red cards and shots on target.

No pick is a guarantee. The engine is built to be honest about chances, not to promise wins.

## Settings (all optional)

Copy `.env.example` to `.env.local` for local runs, or add the same names in Vercel → Project → Settings → Environment Variables.

| Variable | What it switches on |
|---|---|
| `ANTHROPIC_API_KEY` | AI analyst on match pages and the AI check of the coupon du jour |
| `ENGINE_MODEL` | Model for the analyst (default `claude-opus-5-5`; `claude-sonnet-5-5` is cheaper) |
| `ENGINE_WEB_SEARCH` | `true` lets the analyst look up injuries and lineups first |
| `COUPON_AI` | `false` turns off the AI review of the coupon |
| `ODDS_API_KEY` | Bookmaker comparison (1xBet first) on match pages — The Odds API |
| `ODDS_REGIONS`, `ODDS_BOOKMAKERS`, `ODDS_CACHE_MIN` | Which books, in what order, cached how long |
| Supabase (Vercel → Storage → connect Supabase) | Accounts (sign in / sign up). Any variable prefix works; the site finds `…SUPABASE_URL` and `…SUPABASE_ANON_KEY` itself |

Fixtures, scores, stats, form, standings and the main odds come from ESPN's public feed and need no key.

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Deploy

Push to `main` — Vercel builds and deploys automatically.

18+. Bet responsibly: flat stakes, never chase losses.
