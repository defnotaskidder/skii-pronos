# Football model training report

Generated 2026-10-19T01:57:23.060Z · hold-out 2025-07-01 → 2026-07-01

Games: 44127 in 72 competitions (before hold-out: 19309, hold-out: 19014, current: 5804) · 7589 with a closing 1X2 line
Home win rate 0.444 · draws 0.26 · goals per game 2.661

## Hold-out fit (games before 2025-07-01)
  strength model: eta=0.0117 etaNew=0.0411 kN=6.8 shrink=0.6374 newTeam=-0.2358 rho=-0.0446 home=0.2553 etaHome=0.0065 kMu=198.2 etaOff=0.0236 spread=1.1998 (score nll 2.8654, 22 s)
  tier 1: 1782 priced games, model weight 0 (1X2 log loss 0.9537 · market alone 0.9537 · model alone 0.9885)
  tier 2: 1355 priced games, model weight 0.079 (1X2 log loss 0.9861 · market alone 0.9863 · model alone 1.0118)
  tier 3: 0 priced games — weight kept at 0.2
  tier 4: 0 priced games — weight kept at 0.25
  tier 5: 0 priced games — weight kept at 0.3
  new clubs (578 games): blend factor at zero games 0

### Out-of-sample 2025-07-01 → 2026-07-01: 18351 games, 3351 with a closing line

| 1X2 log loss (lower is better) | Model alone | Market (de-vigged) | Market (score matrix) | Blend | Baseline |
|---|---|---|---|---|---|
| every game | 1.022 | — | — | — | 1.0696 (league frequencies) |
| priced games | 1.0101 | 0.9737 | 0.9741 | **0.9742** | |
| tier 1 (1905) | 1.006 | 0.9693 | 0.9703 | 0.9703 | |
| tier 2 (1446) | 1.0156 | 0.9795 | 0.9791 | 0.9793 | |

Over 2.5 log loss (2532 games at that line): model 0.6986 · market 0.6872 · blend 0.6873 · baseline 0.6941

Calibration of the blend's favourite outcome:

| Bucket | Games | Predicted | Actual |
|---|---|---|---|
| 30–40% | 508 | 0.379 | 0.38 |
| 40–50% | 1138 | 0.446 | 0.446 |
| 50–60% | 774 | 0.547 | 0.527 |
| 60–70% | 495 | 0.645 | 0.657 |
| 70–80% | 285 | 0.744 | 0.733 |
| 80–90% | 141 | 0.84 | 0.894 |
| 90–100% | 10 | 0.917 | 0.8 |

Model alone (no price), favourite outcome over every game — and over games where both clubs have 30+ games behind their figures:

| Bucket | Games | Predicted | Actual | Settled clubs: games | Predicted | Actual |
|---|---|---|---|---|---|---|
| 30–40% | 3913 | 0.378 | 0.38 | 3400 | 0.378 | 0.384 |
| 40–50% | 8342 | 0.447 | 0.449 | 7270 | 0.447 | 0.45 |
| 50–60% | 4135 | 0.543 | 0.565 | 3498 | 0.542 | 0.563 |
| 60–70% | 1475 | 0.641 | 0.689 | 1235 | 0.64 | 0.695 |
| 70–80% | 400 | 0.74 | 0.778 | 321 | 0.741 | 0.776 |
| 80–90% | 79 | 0.832 | 0.886 | 67 | 0.833 | 0.866 |
| 90–100% | 7 | 0.931 | 0.857 | 7 | 0.931 | 0.857 |

Betting every 1X2 side and over/under 2.5 at the closing price when blend chance × odds clears the edge (flat 1 unit):

| Edge | Bets | Units | ROI | By market |
|---|---|---|---|---|
| ≥ 0 | 63 | -7.5 | -11.9% | 1 38 (-22.2%), 2 16 (29.1%), X 7 (-48.6%), O2.5 1 (68%), U2.5 1 (-100%) |
| ≥ 0.03 | 13 | -0.2 | -1.3% | 1 3 (-100%), 2 5 (51%), X 3 (20%), O2.5 1 (68%), U2.5 1 (-100%) |
| ≥ 0.06 | 6 | 2.6 | 43.8% | 2 3 (11.7%), X 1 (260%), O2.5 1 (68%), U2.5 1 (-100%) |

Safe picks at a real price (blend chance ≥ 72% on a 1X2 side or the 2.5 line): 367 picks, predicted 0.792, actual 0.79, ROI -3% — 1: 291 (hit 0.797, ROI -2.7%), 2: 76 (hit 0.763, ROI -4.2%)

### Current season to date (same hold-out parameters): 5393 games, 754 with a closing line

| 1X2 log loss (lower is better) | Model alone | Market (de-vigged) | Market (score matrix) | Blend | Baseline |
|---|---|---|---|---|---|
| every game | 1.022 | — | — | — | 1.0696 (league frequencies) |
| priced games | 0.9991 | 0.9493 | 0.9488 | **0.9492** | |
| tier 1 (370) | 0.9831 | 0.9365 | 0.9366 | 0.9366 | |
| tier 2 (384) | 1.0146 | 0.9616 | 0.9606 | 0.9613 | |

Over 2.5 log loss (484 games at that line): model 0.6908 · market 0.6745 · blend 0.6755 · baseline 0.6966

Calibration of the blend's favourite outcome:

| Bucket | Games | Predicted | Actual |
|---|---|---|---|
| 30–40% | 117 | 0.382 | 0.316 |
| 40–50% | 240 | 0.446 | 0.504 |
| 50–60% | 168 | 0.547 | 0.548 |
| 60–70% | 116 | 0.646 | 0.647 |
| 70–80% | 59 | 0.746 | 0.797 |
| 80–90% | 46 | 0.836 | 0.804 |
| 90–100% | 8 | 0.928 | 1 |

Model alone (no price), favourite outcome over every game — and over games where both clubs have 30+ games behind their figures:

| Bucket | Games | Predicted | Actual | Settled clubs: games | Predicted | Actual |
|---|---|---|---|---|---|---|
| 30–40% | 1072 | 0.378 | 0.377 | 963 | 0.378 | 0.379 |
| 40–50% | 2534 | 0.445 | 0.461 | 2253 | 0.446 | 0.458 |
| 50–60% | 1243 | 0.543 | 0.556 | 1082 | 0.542 | 0.561 |
| 60–70% | 440 | 0.64 | 0.714 | 356 | 0.64 | 0.736 |
| 70–80% | 82 | 0.737 | 0.732 | 64 | 0.739 | 0.766 |
| 80–90% | 21 | 0.825 | 0.952 | 17 | 0.826 | 0.941 |
| 90–100% | 1 | 0.959 | 1 | — | — | — |

Betting every 1X2 side and over/under 2.5 at the closing price when blend chance × odds clears the edge (flat 1 unit):

| Edge | Bets | Units | ROI | By market |
|---|---|---|---|---|
| ≥ 0 | 17 | -9.2 | -54.4% | 1 11 (-59.1%), 2 4 (-18.7%), X 2 (-100%) |
| ≥ 0.03 | 1 | -1 | -100% | X 1 (-100%) |
| ≥ 0.06 | 0 | 0 | — |  |

Safe picks at a real price (blend chance ≥ 72% on a 1X2 side or the 2.5 line): 98 picks, predicted 0.808, actual 0.827, ROI -0.3% — 1: 73 (hit 0.849, ROI 1.5%), 2: 25 (hit 0.76, ROI -5.4%)

## Production fit (every game)
  strength model: eta=0.0139 etaNew=0.0419 kN=4.4 shrink=0.6695 newTeam=-0.2884 rho=-0.0324 home=0.2096 etaHome=0.0033 kMu=501.2 etaOff=0.0159 spread=1.1999 (score nll 2.8764, 17 s)
  tier 1: 4057 priced games, model weight 0 (1X2 log loss 0.9601 · market alone 0.9601 · model alone 0.9954)
  tier 2: 3185 priced games, model weight 0.023 (1X2 log loss 0.9801 · market alone 0.9801 · model alone 1.0126)
  tier 3: 0 priced games — weight kept at 0.2
  tier 4: 0 priced games — weight kept at 0.25
  tier 5: 0 priced games — weight kept at 0.3
  new clubs (457 games): blend factor at zero games 1

Parameters written to lib/soccer-params.json: 2014 clubs, 72 competitions · 47 s

## How to read the parameters

- `model.eta` / `etaNew` / `kN`: how far a club's attack and defence move per goal of surprise — fast for a new club, settling to `eta` after ~`kN` games.
- `model.shrink`: a club's figures at the start of a new season (1 = keep them, 0 = back to the league average); `newTeam`: where a club with no history starts.
- `model.rho`: Dixon-Coles correction of the low scores (negative = fewer 0-0 / 1-1 than independent Poisson).
- `model.home` / `etaHome`: a competition's starting home advantage (log goals) and how fast its own value is learnt; `muPrior` / `kMu`: the scoring-rate prior and its weight each season.
- `model.etaOff`: how fast a domestic league's strength offset moves after a continental or cup game against a club from another league.
- `model.spread`: damping of the gap between the two expected-goal figures before pricing.
- `market.blend`: weight on the model's expected goals against the bookmaker's implied ones, by league tier (0 = market only); `blendNew`: fraction of that weight for a club with no games yet.
- `leagues` / `teams`: the state after the last game trained on — lib/ratings.js keeps updating it from every result.
