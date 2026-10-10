# Roadmap

Order matters: finish each phase before starting the next. Pause new pages and features until Phase 2 is done.

## Done
- [x] AI response brief page (region + time range, Lovable AI)
- [x] Weather & population spatial coverage
- [x] OSM hospitals layer
- [x] OSM roads layer
- [x] AI planner (`/plan`)
- [x] Historical pipeline v1–v4 (v4: confirmed no-fire labels from VNP14A1 for 6 countries)
- [x] Pipeline readiness page (`/pipeline`)

## Phase 0: Foundation (1–2 weeks)
- [x] Real README, `.env.example`, `pipeline/requirements.txt`, `.gitignore` for Python and secrets
- [x] Remove committed `__pycache__/*.pyc`
- [ ] Bring the FastAPI backend under version control (needs the backend code; contract documented in `docs/api-contract.md`)
- [x] Document every endpoint used by `src/services/api` (`docs/api-contract.md`)
- [x] Add CI (typecheck, test, build; lint informational)
- [ ] Fix the 3 `react-hooks/rules-of-hooks` errors (`RiskMap.tsx`, `brief.tsx`, `plan.tsx`) and run `prettier --write` as its own commit, then make lint blocking
- [x] Model card template + cards for the two existing models (owner must fill the "Unknown" fields)
- [x] Mark the existing Algeria and DRC models "legacy, pre-v4 labels" in the UI
- [ ] Add a `LICENSE`
- [x] Make pipeline paths configurable (no hard-coded `/mnt/documents`)

## Phase 1: A trustworthy model (4–6 weeks)
- [ ] Train on v4 labels (Mozambique, DRC, Angola, Zambia, Nigeria, South Africa)
- [ ] Time-based split: train 2020–23, validation 2024, test 2025–26 (as in `pipeline-status.json`)
- [ ] Drop LAT/LON as features; add NDVI, soil moisture, land cover, elevation, recent fire history
- [ ] Handle seasonal observation bias (weighting, or evaluate on well-observed months)
- [ ] Baselines: "fire yesterday" persistence and a basic Fire Weather Index
- [ ] Report PR-AUC and calibration per country and per month (not ROC-AUC alone)
- [ ] Publish results on `/models`

## Phase 2: From pilot to real coverage (4–8 weeks)
- [ ] Scale from 30 × 30 km windows to full admin1 regions (start with 2–3 best-data countries)
- [ ] Automated daily data refresh and inference
- [ ] Monitoring and a "data is stale" indicator
- [ ] Move a country out of "Coming Soon" only after it passes Phase 1 checks

## Phase 3: Reaching people (6–10 weeks)
- [ ] Alert delivery: SMS / WhatsApp / USSD
- [ ] UI translations: French, Arabic, Portuguese, Swahili
- [ ] Offline-capable PWA
- [ ] Real emergency contacts per country

## Phase 4: Trust and safety (in parallel from Phase 2)
- [ ] Auth, rate limiting and spam protection for reports and assistance requests
- [ ] Moderation and verification workflow ("confirmed" must mean verified)
- [ ] Privacy review for location data
- [ ] Test AI briefs against failure cases (missing data, conflicting sources)
- [ ] More tests (currently one routing test)

## Phase 5: Validation and sustainability
- [ ] Pilot with one civil-protection agency, NGO or university; compare predictions with what actually burned
- [ ] Funding and partnerships (digital public goods programs, humanitarian organisations)
