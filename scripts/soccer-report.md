# Football model training report

Generated 2026-10-19T02:20:49.929Z · hold-out 2025-07-01 → 2026-07-01

Games: 44127 in 72 competitions (before hold-out: 19309, hold-out: 19014, current: 5804) · 36913 with a closing 1X2 line
Home win rate 0.444 · draws 0.26 · goals per game 2.661

## Hold-out fit (games before 2025-07-01)
  strength model: eta=0.0054 etaNew=0.0319 kN=15.5 shrink=0.5956 newTeam=-0.2103 rho=-0.0709 home=0.2194 etaHome=0.0047 kMu=184.6 etaOff=0.0194 spread=1.4696 (score nll 2.8648, 10 s)
  tier 1: 1782 priced games, model weight 0 (1X2 log loss 0.9538 · market alone 0.9538 · model alone 0.9837)
  tier 2: 2160 priced games, model weight 0.026 (1X2 log loss 0.9731 · market alone 0.9732 · model alone 0.9968)
  tier 3: 7172 priced games, model weight 0 (1X2 log loss 0.9972 · market alone 0.9972 · model alone 1.0263)
  tier 4: 3051 priced games, model weight 0 (1X2 log loss 1.019 · market alone 1.019 · model alone 1.0409)
  tier 5: 0 priced games — weight kept at 0.3
  new clubs (6328 games): blend factor at zero games 0

### Out-of-sample 2025-07-01 → 2026-07-01: 18351 games, 15841 with a closing line

| 1X2 log loss (lower is better) | Model alone | Market (de-vigged) | Market (score matrix) | Blend | Baseline |
|---|---|---|---|---|---|
| every game | 1.0224 | — | — | — | 1.0696 (league frequencies) |
| priced games | 1.0261 | 0.9967 | 0.9966 | **0.9966** | |
| tier 1 (1905) | 1.0065 | 0.9693 | 0.97 | 0.97 | |
| tier 2 (2198) | 1.0158 | 0.9793 | 0.9787 | 0.9788 | |
| tier 3 (8501) | 1.0249 | 0.9963 | 0.9963 | 0.9963 | |
| tier 4 (3237) | 1.0475 | 1.0254 | 1.0252 | 1.0252 | |

Over 2.5 log loss (11510 games at that line): model 0.694 · market 0.6854 · blend 0.6854 · baseline 0.6932

Calibration of the blend's favourite outcome:

| Bucket | Games | Predicted | Actual |
|---|---|---|---|
| 30–40% | 3052 | 0.376 | 0.369 |
| 40–50% | 5713 | 0.446 | 0.447 |
| 50–60% | 3656 | 0.545 | 0.546 |
| 60–70% | 2050 | 0.644 | 0.64 |
| 70–80% | 942 | 0.742 | 0.743 |
| 80–90% | 387 | 0.841 | 0.871 |
| 90–100% | 41 | 0.92 | 0.902 |

Model alone (no price), favourite outcome over every game — and over games where both clubs have 30+ games behind their figures:

| Bucket | Games | Predicted | Actual | Settled clubs: games | Predicted | Actual |
|---|---|---|---|---|---|---|
| 30–40% | 4141 | 0.377 | 0.378 | 3615 | 0.377 | 0.378 |
| 40–50% | 8328 | 0.447 | 0.452 | 7282 | 0.447 | 0.456 |
| 50–60% | 4063 | 0.543 | 0.57 | 3427 | 0.542 | 0.566 |
| 60–70% | 1397 | 0.641 | 0.707 | 1136 | 0.64 | 0.717 |
| 70–80% | 355 | 0.741 | 0.766 | 281 | 0.742 | 0.769 |
| 80–90% | 60 | 0.83 | 0.883 | 50 | 0.831 | 0.86 |
| 90–100% | 7 | 0.918 | 0.857 | 7 | 0.918 | 0.857 |

Betting every 1X2 side and over/under 2.5 at the closing price when blend chance × odds clears the edge (flat 1 unit):

| Edge | Bets | Units | ROI | By market |
|---|---|---|---|---|
| ≥ 0 | 78 | -15 | -19.2% | 1 11 (11.1%), 2 27 (-29.3%), X 38 (-20.9%), O2.5 1 (68%), U2.5 1 (-100%) |
| ≥ 0.03 | 28 | -2.6 | -9.3% | 1 4 (10.1%), 2 12 (-72.1%), X 10 (59.5%), O2.5 1 (68%), U2.5 1 (-100%) |
| ≥ 0.06 | 18 | 2.1 | 11.8% | 1 1 (145%), 2 8 (-58.1%), X 7 (80.7%), O2.5 1 (68%), U2.5 1 (-100%) |

Safe picks at a real price (blend chance ≥ 72% on a 1X2 side or the 2.5 line): 1101 picks, predicted 0.792, actual 0.793, ROI -2.5% — 1: 918 (hit 0.798, ROI -2.1%), 2: 183 (hit 0.765, ROI -4.9%)

### Current season to date (same hold-out parameters): 5393 games, 5085 with a closing line

| 1X2 log loss (lower is better) | Model alone | Market (de-vigged) | Market (score matrix) | Blend | Baseline |
|---|---|---|---|---|---|
| every game | 1.0242 | — | — | — | 1.0696 (league frequencies) |
| priced games | 1.0261 | 0.9919 | 0.9919 | **0.9919** | |
| tier 1 (370) | 0.9869 | 0.9365 | 0.9364 | 0.9364 | |
| tier 2 (487) | 1.0196 | 0.9597 | 0.9588 | 0.959 | |
| tier 3 (2928) | 1.0236 | 0.9935 | 0.9934 | 0.9934 | |
| tier 4 (1300) | 1.0454 | 1.0164 | 1.0167 | 1.0167 | |

Over 2.5 log loss (3331 games at that line): model 0.695 · market 0.6882 · blend 0.6882 · baseline 0.6939

Calibration of the blend's favourite outcome:

| Bucket | Games | Predicted | Actual |
|---|---|---|---|
| 30–40% | 929 | 0.377 | 0.356 |
| 40–50% | 1840 | 0.446 | 0.442 |
| 50–60% | 1167 | 0.548 | 0.55 |
| 60–70% | 700 | 0.644 | 0.677 |
| 70–80% | 324 | 0.745 | 0.719 |
| 80–90% | 108 | 0.839 | 0.861 |
| 90–100% | 17 | 0.928 | 1 |

Model alone (no price), favourite outcome over every game — and over games where both clubs have 30+ games behind their figures:

| Bucket | Games | Predicted | Actual | Settled clubs: games | Predicted | Actual |
|---|---|---|---|---|---|---|
| 30–40% | 1172 | 0.377 | 0.372 | 1047 | 0.377 | 0.37 |
| 40–50% | 2557 | 0.446 | 0.469 | 2295 | 0.446 | 0.464 |
| 50–60% | 1183 | 0.542 | 0.565 | 1022 | 0.541 | 0.578 |
| 60–70% | 391 | 0.637 | 0.693 | 302 | 0.636 | 0.722 |
| 70–80% | 77 | 0.738 | 0.792 | 59 | 0.739 | 0.814 |
| 80–90% | 12 | 0.824 | 0.917 | 10 | 0.825 | 0.9 |
| 90–100% | 1 | 0.946 | 1 | — | — | — |

Betting every 1X2 side and over/under 2.5 at the closing price when blend chance × odds clears the edge (flat 1 unit):

| Edge | Bets | Units | ROI | By market |
|---|---|---|---|---|
| ≥ 0 | 10 | 4.8 | 48% | 1 1 (285%), 2 5 (47%), X 4 (-10%) |
| ≥ 0.03 | 4 | -0.1 | -3.7% | 1 1 (285%), 2 2 (-100%), X 1 (-100%) |
| ≥ 0.06 | 1 | -1 | -100% | X 1 (-100%) |

Safe picks at a real price (blend chance ≥ 72% on a 1X2 side or the 2.5 line): 362 picks, predicted 0.79, actual 0.787, ROI -2.9% — 1: 298 (hit 0.795, ROI -2.4%), 2: 64 (hit 0.75, ROI -5.3%)

## Production fit (every game)
  strength model: eta=0.011 etaNew=0.0324 kN=3.7 shrink=0.6675 newTeam=-0.1874 rho=-0.0334 home=0.1416 etaHome=0.0024 kMu=270.2 etaOff=0.0101 spread=1.7998 (score nll 2.8747, 8 s)
  tier 1: 4057 priced games, model weight 0 (1X2 log loss 0.9601 · market alone 0.9601 · model alone 0.9944)
  tier 2: 4845 priced games, model weight 0 (1X2 log loss 0.9748 · market alone 0.9748 · model alone 1.0075)
  tier 3: 18601 priced games, model weight 0 (1X2 log loss 0.9966 · market alone 0.9966 · model alone 1.0259)
  tier 4: 7588 priced games, model weight 0 (1X2 log loss 1.0214 · market alone 1.0214 · model alone 1.0444)
  tier 5: 0 priced games — weight kept at 0.3
  new clubs (1783 games): blend factor at zero games 1

Parameters written to lib/soccer-params.json: 2014 clubs, 72 competitions · 23 s

## How to read the parameters

- `model.eta` / `etaNew` / `kN`: how far a club's attack and defence move per goal of surprise — fast for a new club, settling to `eta` after ~`kN` games.
- `model.shrink`: a club's figures at the start of a new season (1 = keep them, 0 = back to the league average); `newTeam`: where a club with no history starts.
- `model.rho`: Dixon-Coles correction of the low scores (negative = fewer 0-0 / 1-1 than independent Poisson).
- `model.home` / `etaHome`: a competition's starting home advantage (log goals) and how fast its own value is learnt; `muPrior` / `kMu`: the scoring-rate prior and its weight each season.
- `model.etaOff`: how fast a domestic league's strength offset moves after a continental or cup game against a club from another league.
- `model.spread`: damping of the gap between the two expected-goal figures before pricing.
- `market.blend`: weight on the model's expected goals against the bookmaker's implied ones, by league tier (0 = market only); `blendNew`: fraction of that weight for a club with no games yet.
- `leagues` / `teams`: the state after the last game trained on — lib/ratings.js keeps updating it from every result.
