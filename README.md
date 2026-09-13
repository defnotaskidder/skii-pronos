# Skii Pronos Engine

A website that pulls **live bookmaker odds** for the leagues you choose, lets you pick any market on any match, asks the engine (Claude) for **one best market per match with an honest confidence tier**, builds accumulators to a target price (2, 3, 5 … 400), copies a Telegram-ready post, and keeps your **track record** (wins, losses, units, ROI).

Odds come from **The Odds API** (aggregates 1xBet, Pinnacle, Bet365 and 40+ books). The engine never invents a price — it only rates the markets that are actually on the feed.

---

## 1. Get two API keys (10 minutes)

1. **The Odds API** — https://the-odds-api.com → "Get API key". The free plan gives 500 credits/month.
   - Loading one league costs 3 credits (three markets × one region). Extra markets for one match cost about 6 credits.
   - That's roughly 100 league loads a month for free. The $30/month plan gives 20,000 if you go daily.
2. **Anthropic API** — https://platform.claude.com → create a key. The engine uses `claude-sonnet-5` by default (cheap and fast); set `ENGINE_MODEL=claude-opus-5` for a stronger, pricier analyst.

## 2. Run it on your computer

```bash
npm install
cp .env.example .env.local     # then paste your two keys into .env.local
npm run dev                    # open http://localhost:3000
```

## 3. Put it online with Vercel (free)

1. Create a GitHub repository and upload this folder (GitHub website → New repository → "uploading an existing file" → drag the folder contents. Do **not** upload `node_modules` or `.next`).
2. Go to https://vercel.com → Add New Project → Import that repository.
3. In **Environment Variables**, add:
   - `ODDS_API_KEY`
   - `ANTHROPIC_API_KEY`
   - optional: `ODDS_REGIONS` (default `eu`), `ODDS_BOOKMAKERS` (default puts 1xBet first), `ENGINE_MODEL`, `ENGINE_WEB_SEARCH`
4. Click Deploy. Your site is live at `your-project.vercel.app`. Keys stay on the server — visitors never see them.

## 4. How to use it

1. Tick the leagues you want, choose Today / Tomorrow / Weekend / 7 days, choose **Safe locks** or **High value**.
2. **Load live odds** — every match appears with 1X2, main total and handicap prices from your preferred book. Tap any price to put it on the slip. **More markets** loads BTTS, draw-no-bet, team totals and scorer props where the book offers them.
3. **Rate every match (engine)** — the engine reads the real odds and returns one best market per match, a confidence tier, a one-line reason and a runner-up. "Skip" means no edge — that's a real answer, not a failure.
4. **Cote generator** — pick a target (2 … 400) and press Build. It stacks the strongest edges first, one market per match, and shows the total odds and the honest hit chance. **Copy for Telegram** gives you a post with the disclaimer already attached.
5. After the games, mark each engine pick **Won / Lost / Void**. The Track record tab is your public proof.

## 5. Settings

| Variable | What it does |
|---|---|
| `ODDS_REGIONS` | Bookmaker regions to query. `eu` includes 1xBet where listed; `eu,uk` adds UK books (costs double). |
| `ODDS_BOOKMAKERS` | Preference order. First book found is shown; the "best" price across all books is shown next to 1X2. |
| `ENGINE_MODEL` | `claude-sonnet-5` (default) or `claude-opus-5`. |
| `ENGINE_WEB_SEARCH` | `true` lets the engine web-search form, injuries and lineups before rating. Slower and costs more tokens; better picks. |

## 6. Honest limits

- Bookmakers don't expose their apps to outside websites, so odds come through an aggregator feed, refreshed on every load (a 90-second cache protects your monthly quota). The number in the 1xBet app is the one that counts — confirm before you bet.
- 1xBet is only shown when the feed lists it for that match; otherwise the next preferred book is used and named on the card.
- Corners and cards markets are not on this feed. Ask the engine about them in chat, or upgrade the feed later.
- No pick is a guarantee. Flat stakes, one unit per bet, lotos at a tenth of a unit, never chase. 18+ — betting is entertainment, not income.
