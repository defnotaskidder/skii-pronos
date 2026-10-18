# Hockey model training report

Generated 2026-10-18T16:33:01.826Z · seasons 2021-22 → 2026-27 · hold-out 2025-26

Games: 7143 (2021-22: 1404, 2022-23: 1403, 2023-24: 1403, 2024-25: 1405, 2025-26: 1394, 2026-27: 134)
Regulation ties: 0.223 · decided in OT 1104 · shootout 488 · home win rate 0.537

## Hold-out fit (train < 2025-26)
  Elo: K=14.77/10.34/7.38 home=29.5 otMult=0.993 gd=0.061 (log loss 0.6638)
  goals (full): home=0.0684 kG=40.9405 kS=1 tau=0.4739 playoff=-0.0196 form=-0.0764 elo=0.228 rest=-0.0806/0.071 W={"aG":0.4888,"aS":0.395,"dG":0.5577,"dS":0.6207} (nll 3.8312)
  goals (no shots): W={"aG":0.583,"aS":0,"dG":0.7715,"dS":0} (nll 3.8398)
  OT: q=0.6854 k=1.2264 b=0.0478 shootout k=0.0646 b=0.0394 ({"tied":1213,"otGoal":855,"shootout":358})
  spread damping: 1 (ML + 60-min log loss 1.6826)

### Out-of-sample: 2025-26 (1394 games)

| Market | Model | Baseline |
|---|---|---|
| Moneyline log loss | 0.6846 | 0.6933 (home rate 0.5407) · Elo only 0.6974 |
| Moneyline Brier | 0.2458 | 0.2501 · Elo only 0.2517 |
| Moneyline accuracy | 0.5538 | 0.5407 |
| 60-minute 1X2 log loss | 1.0723 | 1.0848 |
| Over 5.5 Brier / log loss | 0.2442 / 0.6815 | 0.2448 / 0.6826 |
| Over 6.5 Brier / log loss | 0.2446 / 0.6824 | 0.2452 / 0.6836 |
| Puck line −1.5 Brier | 0.2038 | 0.2103 |
| Mean total goals | 6.221 | actual 6.148 |

Calibration of the home moneyline chance (hold-out):

| Bucket | Games | Predicted | Actual |
|---|---|---|---|
| 10–20% | 1 | 0.187 | 0 |
| 20–30% | 11 | 0.271 | 0.364 |
| 30–40% | 98 | 0.363 | 0.367 |
| 40–50% | 350 | 0.457 | 0.474 |
| 50–60% | 572 | 0.55 | 0.516 |
| 60–70% | 285 | 0.643 | 0.596 |
| 70–80% | 70 | 0.731 | 0.671 |
| 80–90% | 7 | 0.816 | 0.857 |

Favourites the model puts at ≥60%: 472 games, predicted 0.659, actual 0.621

### Current season to date (134 games, same hold-out parameters)

Moneyline log loss 0.6363 (baseline 0.6867, Elo only 0.6484) · accuracy 0.5821 · mean total predicted 6.1 vs actual 6.172

## Production fit (all seasons)
  Elo: K=14.46/10.12/7.23 home=26.2 otMult=1.281 gd=0.104 (log loss 0.6702)
  goals (full): home=0.0621 kG=42.2847 kS=4.7124 tau=0.5247 playoff=-0.0329 form=-0.0531 elo=0.2164 rest=-0.0803/0.0646 W={"aG":0.505,"aS":0.4765,"dG":0.4972,"dS":0.7502} (nll 3.8247)
  goals (no shots): W={"aG":0.6238,"aS":0,"dG":0.7523,"dS":0} (nll 3.8343)
  OT: q=0.6736 k=1.2551 b=0.0443 shootout k=-0.1431 b=0.0347 ({"tied":1592,"otGoal":1104,"shootout":488})
  spread damping: 1 (ML + 60-min log loss 1.6967)

In-sample (seasons after the first): moneyline log loss 0.6638 (baseline 0.6906) · over 6.5 Brier 0.2447 (baseline 0.2457)

Parameters written to lib/hockey-params.json · 41 s

## How to read the parameters

- `goals.home`: home-ice edge in log goals (split half/half between the two sides).
- `goals.kG` / `goals.kS`: pseudo-games of league-average goals / shots a team's season rates are shrunk toward (early-season humility).
- `goals.full` / `goals.noShots`: weights on goals-for, shot-volume, goals-against and shots-against rates — the second set is used where the feed has no shot data (college hockey).
- `goals.form`: weight on last-10 points% minus season points%; `goals.elo`: weight on the Elo gap (per 400 points); `goals.rest`: back-to-back effects on own scoring and own defence.
- `goals.tau`: extra probability mass on regulation ties beyond independent Poisson.
- `goals.spread`: damping of the gap between the two expected-goal figures before pricing (teams are less different game to game than their season rates say).
- `ot`: share of ties decided in overtime (regular season) and how strength tilts the OT and shootout winners.
- `elo`: hockey Elo (K by experience, home-ice points, OT/SO damping, margin bonus) used by lib/ratings.js for hockey games.
- `market.statsWeight`: how far the live model pulls DraftKings' implied expected goals toward its own estimate (not fitted: no historical prices).
