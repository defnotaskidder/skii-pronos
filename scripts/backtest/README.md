# Backtests behind the engine's choices

Every claim in `lib/calibration.js`, `lib/model.js` (scoring shift, live goal clock) and the README was measured with these. Run from this folder with Node 20+.

On the site's own graded picks (public API, read-only):
- `node pull.mjs` — download the graded picks into `picks.json` (git-ignored data, re-create it).
- `node walk3.mjs` — walk-forward test of learned corrections: each day forecast from earlier days only (raw model, the old bucket + league scheme, market-family offsets…). Lower log loss is better.
- `node walk4.mjs` — do "strong" / "weak" league labels predict anything? (They did not.)
- `node goaltimes.mjs 700` — when goals are scored (ESPN summaries of finished games), for the live clock.

On the closing-line history in `.cache/soccer` (`node scripts/soccer-history.mjs`, then `node scripts/train-soccer.mjs`):
- `node base.mjs` — predicted vs actual for every market the score matrix prices.
- `node shape.mjs '[{"rho":-0.07},{"c3":0.1}]' 3` — alternative score-matrix shapes, train vs hold-out.
- `node shift.mjs` — would a constant shift make a derived market truer on the hold-out season?
- `node devig.mjs` — ways of removing the bookmaker's margin.

Change the engine only when the hold-out (or walk-forward) number improves by more than its standard error.
