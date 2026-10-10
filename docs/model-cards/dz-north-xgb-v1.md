# Model card: dz-north-xgb-v1

> Filled only from `src/data/registry.ts`. Everything else is marked **Unknown** and must be completed by the model owner.

## 1. Summary
- **Model id:** `dz-north-xgb-v1`
- **Type / version:** XGBoost, v1
- **Status:** **legacy** (trained before the v4 satellite-observation labels existed; retraining planned)
- **Owner and last updated:** Unknown (registry says "Data unavailable")
- **Where it is served:** PHOENIX FastAPI backend (host and endpoint: Unknown)
- **Trained artifact location:** Unknown

## 2. Intended use
- Indicative wildfire-risk map for Northern Algeria.
- Not for confirmed-fire claims, evacuation decisions, or areas outside the extent below.
- **Target variable:** Unknown (should be `satellite_fire_occurrence`)

## 3. Coverage
- **Extent (W,S,E,N):** 4.5, 36.0, 8.5, 37.2
- **Spatial unit and time step:** Unknown

## 4. Training data
- **Training period:** 2020–2024
- **Features:** LAT, LON, DOY, T2M_MAX, T2M_MIN, RH2M, WS2M, PRECTOTCORR
- **Label definition / negatives:** Unknown. This model predates v4 (confirmed no-fire labels).
- **Class balance:** Unknown
- **Known issues:** lat/lon as features invite spatial overfitting. No vegetation, soil-moisture, land-cover or fire-history features.

## 5. Evaluation (as published in the registry)
- ROC-AUC 0.933, PR-AUC 0.548
- **Split method, test period, baselines, calibration:** Unknown
- Note: with very low fire rates (the v2 El Tarf pilot window had 364 positive cell-days in about 2.2 M, roughly 0.016%) ROC-AUC looks optimistic. PR-AUC and calibration on a time-based test set matter more.

## 6. Limitations and risks
- Not comparable with v4-based results.
- Algeria event density is "Limited" in pipeline v3; independent evaluation may be unreliable.

## 7. Changelog
| Date | Version | Change |
|---|---|---|
| (fill in) | v1 | Initial model |
