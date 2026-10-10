# Model card: <model id>

> Copy this file to `docs/model-cards/<model-id>.md`. Write "Unknown" instead of guessing.

## 1. Summary
- **Model id (as in `src/data/registry.ts`):**
- **Type / library / version:**
- **Status:** in-development | validated | legacy
- **Owner and last updated:**
- **Where it is served (endpoint, host):**
- **Where the trained artifact is stored:**

## 2. Intended use
- **Question it answers:** (e.g. "Probability of >=1 qualifying satellite fire detection in a 1 km cell on date D")
- **Not for:** confirmed wildfire prediction, evacuation decisions, areas outside the coverage below.
- **Target variable:** (must be `satellite_fire_occurrence`; never "confirmed wildfire")

## 3. Coverage
- **Region / bbox (W,S,E,N):**
- **Spatial unit and time step:**
- **Seasons covered:**

## 4. Training data
- **Pipeline version and tables:** (v1 / v2 / v3 / v4, with file names)
- **Date range:**
- **Label definition:** how positives and negatives are defined. Name the observation-validity rule (`NO_FIRE_CONFIRMED`, `INSUFFICIENT_OBSERVATION`, ...).
- **Class balance:** positives / negatives / excluded, per month
- **Features:** list. State which are lagged (weather uses D-3) and confirm none are observation-quality fields.
- **Known data gaps:** (cloud/season bias, shared POWER cells, single-pixel land cover, ...)

## 5. Evaluation
- **Split method:** time-based. State train / validation / test date ranges.
- **Metrics on the untouched test period:** PR-AUC (headline), ROC-AUC, Brier score, calibration plot
- **Per-country and per-month breakdown:**
- **Baselines compared:** "fire yesterday" persistence, basic Fire Weather Index
- **Leakage audit result:**

## 6. Limitations and risks
-

## 7. Changelog
| Date | Version | Change |
|---|---|---|
