# Backtests behind the engine's choices

Every claim in `lib/calibration.js`, `lib/model.js` (scoring shift, live goal clock) and the README was measured with these. Run from this folder with Node 20+.

On the site's own graded picks (public API, read-only):
- `node pull.mjs` — download the graded picks into `picks.json` (git-ignored data, re-create it).
- `node walk3.mjs` — walk-forward test of learned corrections: each day forecast from earlier days only (raw model, the old bucket + league scheme, market-family offsets…). Lower log loss is better.
- `node walk4.mjs` — do "strong" / "weak" league labels predict anything? (They did not.)
- `node goaltimes.mjs 700` — when goals are scored (ESPN summaries of finished games), for the live clock.

The live model and the OP live pick, on finished games replayed minute by minute (run these with `node --import ./lib-register.mjs <script>`: they import the site's own `lib/` code):
- `node livepull.mjs 2400` — goal and red-card timelines of graded games, with each side (`livetimes.json`, git-ignored; needs `picks.json`).
- `live.mjs` — every live market at twelve check points against the final score: said → won by market, minute and game state.
- `liverate.mjs` — goals scored after each check point against the goals the model expected, by state (the leader / trailer multipliers).
- `livefit.mjs priced` — fits those multipliers on half of the games and scores them, and any settings given on the command line, on the other half.
- `livedraw.mjs` — the draw and the low-scoring bets; is the goal expectation rebuilt from the 1X2 stretched? (It is not.)
- `liveop.mjs` — the OP pick as a visitor would have seen it every five minutes, graded; the numbers shown on the card (`OP_RECORD`).

On the closing-line history in `.cache/soccer` (`node scripts/soccer-history.mjs`, then `node scripts/train-soccer.mjs`):
- `node base.mjs` — predicted vs actual for every market the score matrix prices.
- `node shape.mjs '[{"rho":-0.07},{"c3":0.1}]' 3` — alternative score-matrix shapes, train vs hold-out.
- `node shift.mjs` — would a constant shift make a derived market truer on the hold-out season?
- `node devig.mjs` — ways of removing the bookmaker's margin.

Change the engine only when the hold-out (or walk-forward) number improves by more than its standard error.
