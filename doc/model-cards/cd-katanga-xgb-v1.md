# Model card: cd-katanga-xgb-v1

> Filled only from `src/data/registry.ts`. Everything else is marked **Unknown** and must be completed by the model owner.

## 1. Summary
- **Model id:** `cd-katanga-xgb-v1` (registry type: "PHOENIX DRC model (served by backend)", version "—")
- **Status:** **legacy** (trained before the v4 satellite-observation labels existed; retraining planned)
- **Algorithm and exact version:** Unknown (the id suggests XGBoost; not confirmed)
- **Owner and last updated:** Unknown (registry says "Data unavailable")
- **Where it is served:** PHOENIX FastAPI backend (host and endpoint: Unknown)
- **Trained artifact location:** Unknown

## 2. Intended use
- Indicative wildfire-risk map for Haut-Katanga, Lualaba and Tanganyika.
- Not for confirmed-fire claims or evacuation decisions.
- **Target variable:** Unknown (should be `satellite_fire_occurrence`)

## 3. Coverage
- **Regions:** Haut-Katanga, Lualaba, Tanganyika
- **Spatial unit and time step:** Unknown

## 4. Training data
- **Dataset:** `phoenix_climate_2020_2026.csv`, about 406,224 records, about 2,418 dates, 167 NASA POWER locations. `-999` is treated as missing.
- **Features:** LAT, LON, DOY, T2M_MAX, T2M_MIN, RH2M, WS2M, PRECTOTCORR
- **Label definition / negatives:** Unknown. This model predates v4.
- **Known issues:** NASA POWER cells (~55 × 70 km) are coarse. lat/lon as features invite spatial overfitting. Pipeline v4 flags strong seasonal observation bias for Haut-Katanga.

## 5. Evaluation
- **Metrics:** none published in the registry
- **Split method, test period, baselines, calibration:** Unknown

## 6. Limitations and risks
- No published evaluation. The "validated" label was removed until metrics and a split description exist.
- Not comparable with v4-based results.

## 7. Changelog
| Date | Version | Change |
|---|---|---|
| (fill in) | — | Initial model |
