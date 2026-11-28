# Model card: Haut-Katanga daily satellite-detection risk (EXPERIMENTAL pilot)

> **Update 2026-11-28.** The pilot was retrained with the same test now used for the other twelve study areas: five model families and three baselines, 1-degree blocks held out, test year 2025. A weather-free logistic regression scored as well as the LightGBM that used NASA POWER weather (held-out PR-AUC 0.9154 vs 0.9176), so the pilot now ships the weather-free model and no longer depends on late weather data. The numbers below describe the earlier LightGBM run and are kept for comparison; the current per-model table is in backend/results.json and on the site Models page.

## What it predicts
Probability that NASA VIIRS (NOAA-20, 375 m) detects at least one nominal/high-confidence fire pixel in a 0.25 degree cell (about 28 km) on a given UTC day. It is **not** a forecast of confirmed or burning fires. A day with no detection includes days the satellite could not see the ground (cloud) and days with no fire; the open data used here has no cloud mask, so the two cannot be separated.

## Footprint
Bounding box W,S,E,N = [24.8, -13.0, 29.0, -8.2], 340 cells. It is a rectangle around Haut-Katanga (DR Congo) and is **not** an administrative boundary. It covers parts of neighbouring areas. Nothing outside it is predicted.

## Data (all free, no API key)
- Fire labels and recent fire history: NASA FIRMS NOAA-20 VIIRS. Training: open per-country yearly archive (viirs-jpss1, DR Congo, 2020 to 2025, type 0 only). Daily job: regional NRT 7-day CSV.
- Weather: NASA POWER daily, 0.5 degree grid, used with a 3-day lag.
- Not used: land cover, NDVI, soil moisture, elevation, fuel load, forecast weather.

## Features (17)
Day of year (sin, cos); weather lagged 3 days (tmax, tmin, wind, humidity, 7-day mean tmax and humidity, rain over 7, 30, 90 days, days since rain >= 1 mm); fire in the cell yesterday, in the last 3 and 7 days; fire in the 8 neighbouring cells in the last 7 days; days since last fire (capped at 8). **No coordinates.** A with-coordinates comparison is in the table.

## Evaluation
Time split: train 2020-01-01..2023-12-31, validation 2024 (early stopping), test 2025, never used for fitting. Spatial hold-out: the footprint is split into 25 one-degree blocks, 6 blocks (84 cells) were never used for fitting and are scored separately on 2025. Fire in the test period is 24% of cell-days (very seasonal), so PR-AUC and ROC-AUC look high for every method.

| Model / baseline (2025 test) | PR-AUC | ROC-AUC | Brier | Recall in top 10% | Precision in top 10% |
|---|---|---|---|---|---|
| LightGBM, no coordinates, held-out areas | 0.9183 | 0.9725 | 0.0532 | 0.3983 | 0.9618 |
| LightGBM, with lat/lon, held-out areas | 0.9194 | 0.9737 | 0.0527 | 0.3975 | 0.9599 |
| Baseline: fire in last 7 days, held-out areas | 0.89 | 0.9597 | 0.132 | 0.3907 | 0.9436 |
| Baseline: fire yesterday, held-out areas | 0.7333 | 0.8783 | 0.0879 | 0.3333 | 0.805 |
| Baseline: seasonal rate by day of year, held-out areas | 0.6092 | 0.8785 | 0.1173 | 0.2672 | 0.6451 |
| LightGBM, no coordinates, training areas | 0.8986 | 0.9624 | 0.0654 | 0.3653 | 0.9573 |
| LightGBM, with lat/lon, training areas | 0.9017 | 0.9646 | 0.0643 | 0.3658 | 0.9585 |
| Baseline: fire in last 7 days, training areas | 0.8686 | 0.9494 | 0.1575 | 0.3568 | 0.9348 |
| Baseline: fire yesterday, training areas | 0.7173 | 0.8611 | 0.1077 | 0.3025 | 0.7926 |
| Baseline: seasonal rate by day of year, training areas | 0.651 | 0.886 | 0.1175 | 0.2641 | 0.6921 |

Reading it honestly: the model beats seasonal climatology clearly and beats a "fire in the last 7 days" rule modestly (PR-AUC about 0.92 vs 0.89 on held-out areas). Most of the skill is recent fire history in the cell and its neighbours. Weather features add little (low importance) because POWER weather is coarse and lagged. Adding coordinates did not help (difference is within noise), so the model ships without them. Held-out areas score slightly higher than training areas; with only 6 blocks and one test year this is not a sign they are easier in general. Held-out blocks still touch trained blocks, so neighbour-fire inputs are real information, not leakage, but this is not a test on a distant region.

### Calibration (held-out areas, 2025, uncalibrated model)
| Predicted bin | n | Mean predicted | Observed rate |
|---|---|---|---|
| 0.0-0.1 | 20218 | 0.023 | 0.012 |
| 0.1-0.2 | 913 | 0.143 | 0.158 |
| 0.2-0.3 | 799 | 0.249 | 0.225 |
| 0.3-0.4 | 754 | 0.348 | 0.346 |
| 0.4-0.5 | 589 | 0.451 | 0.479 |
| 0.5-0.6 | 764 | 0.552 | 0.609 |
| 0.6-0.7 | 966 | 0.651 | 0.68 |
| 0.7-0.8 | 992 | 0.748 | 0.777 |
| 0.8-0.9 | 2781 | 0.863 | 0.923 |
| 0.9-1.0 | 1884 | 0.92 | 0.976 |

### By month (held-out areas, 2025)
| Month | Fire rate | PR-AUC | ROC-AUC |
|---|---|---|---|
| 1 | 0.005 | 0.027 | 0.806 |
| 2 | 0.005 | 0.022 | 0.756 |
| 3 | 0.013 | 0.068 | 0.78 |
| 4 | 0.047 | 0.334 | 0.877 |
| 5 | 0.2 | 0.725 | 0.911 |
| 6 | 0.521 | 0.939 | 0.945 |
| 7 | 0.635 | 0.972 | 0.966 |
| 8 | 0.647 | 0.972 | 0.972 |
| 9 | 0.488 | 0.837 | 0.879 |
| 10 | 0.278 | 0.68 | 0.871 |
| 11 | 0.037 | 0.233 | 0.811 |
| 12 | 0.005 | 0.132 | 0.916 |

Skill is weakest in the low-fire months (Nov to Mar), where there are few positives; treat those months' scores with caution.

## Known limits
- One test year (2025), one region.
- Predicts satellite detection, not fire or burned area. Agricultural burning, gas flares and other thermal sources count as detections.
- Training used NOAA-20 archive; the daily job uses NOAA-20 NRT. NRT confidence labels are words (nominal, high, low); training used letters (n, h, l). The job maps both to the same classes.
- S-NPP NRT feeds are empty after early Nov 2026, so the job uses NOAA-20 only.
- Not an official warning system. Confirm with local authorities.
