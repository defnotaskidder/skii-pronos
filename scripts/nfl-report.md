# NFL model training report

Seasons 2015–2026 (ESPN season years; 2026 is the current season to date) · hold-out 2025

Games: 3108 (regular season + playoffs) · with a closing line: 3100 · with both box scores: 3108
Ties after 60': 184 (5.9%) · final ties: 11 · home win rate 0.55

## Hold-out fit (train < 2025)
  Elo: K=20.06 home=36.7 mov=1 revert=0.402 (log loss 0.6335)
  score distribution on 2735 games with a closing line:
    round 1: sM=12.95 sM1=-0.02 sT=13.5 sT1=0.05 cT=0 loglik=-6.79954
    round 2: sM=12.825 sM1=-0.06 sT=13.5 sT1=0.01 cT=0 loglik=-6.79846
    round 3: sM=12.825 sM1=-0.06 sT=13.375 sT1=0.03 cT=0 loglik=-6.79824
  overtime: {"ties":125,"regularSeason":118,"endedTied":7,"decidedWithLine":118,"decidedUnderTodaysRules":1} · tie share 0.0593 · home OT win k=0.6805 b=0.1673 · adds +3/+0 52%, +6/+0 34%, +6/+3 14%
  shrinkage: k=7 games, prior weight 0.3, kPlays=400, kTo=6 (out-of-sample margin RMSE 13.225)
  long-run total (last 3 seasons): 44.62 · home margin all seasons 1.9

## Strength model feature sets (out of sample, seasons 2017–2024)

| Features | Margin RMSE | Total RMSE |
|---|---|---|
| home field only | 14.315 | 13.74 |
| + Elo | 13.304 | 13.74 |
| + points | 13.248 | 13.74 |
| + yards per play | 13.214 | 13.74 |
| + turnovers | 13.22 | 13.74 |
| + rest (full) | 13.225 | 13.74 |

Kept: **+ yards per play** (home, elo, pd, ypp).

Blend weights fitted out of sample (2017–2024): margin 0.025, total 0 — the share of the strength model mixed into the market's numbers.

### Hold-out season 2025 (285 games with a closing line)

| | Market (closing line) | Strength model | Blend | Elo only |
|---|---|---|---|---|
| Moneyline log loss | 0.6098 (book ML 0.61) | 0.6326 | 0.61 | 0.6335 |
| Margin RMSE | 12.188 | 12.827 | 12.196 | home field only 14.116 |
| Total RMSE | 13.234 | 13.528 | 13.234 | |

Against the spread when the strength model disagrees with the closing line: ≥2 pts: 53/114 = 46.5% ± 9.2 · ≥3 pts: 30/64 = 46.9% ± 12.2 · ≥4 pts: 13/37 = 35.1% ± 15.4
Totals when it disagrees with the closing total: ≥2 pts: 71/145 = 49.0% ± 8.1 · ≥3 pts: 44/90 = 48.9% ± 10.3 · ≥4 pts: 28/53 = 52.8% ± 13.4

#### Score distribution — hold-out 2025 (285 games)

Exact 60-minute score log-likelihood per game: key-number model -6.7878 vs plain normal grid -7.1932

| Final margin | Actual | Model | Plain normal |
|---|---|---|---|
| tie | 0.4% | 0.3% | 0.2% |
| ±1 | 5.6% | 4.4% | 5.7% |
| ±2 | 5.3% | 4.5% | 5.7% |
| ±3 | 16.1% | 14.9% | 7.4% |
| ±4 | 6.7% | 4.4% | 5.5% |
| ±6 | 3.9% | 7.0% | 6.2% |
| ±7 | 9.1% | 8.6% | 5.1% |
| ±10 | 3.5% | 4.9% | 4.5% |
| ±14 | 3.9% | 5.3% | 3.5% |

Pushes on whole-number spreads: 0/24 actual (0.0%) vs model 7.1% · on whole-number totals: 0/5 (0.0%) vs model 2.7%

### Current season to date (80 games, hold-out parameters) (80 games with a closing line)

| | Market (closing line) | Strength model | Blend | Elo only |
|---|---|---|---|---|
| Moneyline log loss | 0.6536 (book ML 0.6516) | 0.6399 | 0.6528 | 0.638 |
| Margin RMSE | 12.33 | 12.521 | 12.327 | home field only 12.971 |
| Total RMSE | 13.012 | 14.292 | 13.012 | |

Against the spread when the strength model disagrees with the closing line: ≥2 pts: 23/40 = 57.5% ± 15.3 · ≥3 pts: 14/24 = 58.3% ± 19.7 · ≥4 pts: 8/14 = 57.1% ± 25.9
Totals when it disagrees with the closing total: ≥2 pts: 15/50 = 30.0% ± 12.7 · ≥3 pts: 10/33 = 30.3% ± 15.7 · ≥4 pts: 6/18 = 33.3% ± 21.8

Coefficients of the hold-out strength model: {"hfa":1.8605,"bElo":0.4827,"bPd":0.4166,"bYpp":3.0673,"bTo":0,"bShort":0,"bBye":0,"k":7,"kPlays":400,"kTo":6,"priorR":0.3,"tBase":0.0366,"tPts":0.5596,"tYpp":8.4723,"tPlayoff":0.4577}
## Production fit (all seasons)
  Elo: K=20.89 home=35.4 mov=1 revert=0.429 (log loss 0.6336)
  score distribution on 3100 games with a closing line:
    round 1: sM=12.825 sM1=-0.06 sT=13.375 sT1=0.03 cT=0 loglik=-6.79309
    round 2: sM=12.7 sM1=-0.06 sT=13.375 sT1=0.03 cT=0 loglik=-6.79307
    round 3: sM=12.7 sM1=-0.06 sT=13.375 sT1=0.03 cT=0 loglik=-6.793
  overtime: {"ties":148,"regularSeason":139,"endedTied":9,"decidedWithLine":139,"decidedUnderTodaysRules":22} · tie share 0.0647 · home OT win k=0.842 b=0.1497 · adds +3/+0 55%, +6/+0 19%, +7/+6 9%, +6/+3 9%, +7/+0 6%
  shrinkage: k=7 games, prior weight 0.3, kPlays=400, kTo=6 (out-of-sample margin RMSE 13.226)
  long-run total (last 3 seasons): 46.04 · home margin all seasons 1.9

Production blend weights: margin 0, total 0
Production strength coefficients: {"hfa":1.8725,"bElo":0.5694,"bPd":0.3343,"bYpp":2.9429,"bTo":0,"bShort":0,"bBye":0,"k":7,"kPlays":400,"kTo":6,"priorR":0.3,"tBase":0.0113,"tPts":0.6691,"tYpp":8.544,"tPlayoff":-0.4145}

#### Score distribution — last three seasons, production parameters (649 games)

Exact 60-minute score log-likelihood per game: key-number model -6.782 vs plain normal grid -7.189

| Final margin | Actual | Model | Plain normal |
|---|---|---|---|
| tie | 0.3% | 0.4% | 0.2% |
| ±1 | 4.6% | 5.0% | 6.2% |
| ±2 | 5.4% | 4.6% | 5.8% |
| ±3 | 15.1% | 15.1% | 7.5% |
| ±4 | 4.9% | 4.7% | 5.6% |
| ±6 | 7.1% | 6.1% | 5.8% |
| ±7 | 8.2% | 9.0% | 5.3% |
| ±10 | 4.2% | 4.8% | 4.5% |
| ±14 | 3.2% | 5.1% | 3.5% |

Pushes on whole-number spreads: 4/58 actual (6.9%) vs model 6.8% · on whole-number totals: 0/5 (0.0%) vs model 2.7%

Parameters written to lib/nfl-params.json · 192 s

## How to read the parameters

- `dist.v` (team score 0–70) and `dist.w` (absolute margin 0–40): multiplicative weights on the regulation score grid — the key numbers. `dist.sM`/`dist.sT` (+ slopes `sM1`/`sT1` per point of total above 44): spreads of margin and total; `dist.cT`: closing total minus the regulation total location.
- `ot`: share of regular-season overtimes ending tied, logistic tilt of the overtime winner toward the stronger side, and the points overtime adds (winner/loser).
- `elo`: K, home field in rating points, margin-of-victory scale, share of each rating regressed to the mean between seasons; `elo.seed`: every team's rating after the last game trained on (lib/ratings.js starts from it).
- `strength`: points of expected margin per unit of each feature (home field, Elo gap /25, points differential per game, yards-per-play differential, turnover margin per game, short week, bye), shrinkage (pseudo-games toward the prior), and the total model.
- `priors`: last completed season's per-game team rates, the starting point of this season's rates.
- `market.blendM`/`blendT`: share of the strength model mixed into the bookmaker's margin and total (fitted out of sample; the closing line is very hard to beat).
