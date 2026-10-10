# PHOENIX for Africa

Wildfire risk, satellite fire detection and emergency-response decision support for Africa.

**Live app:** https://phoenix-for-africa.lovable.app

> **Status: pre-release / pilot.** Real data is connected for Algeria and the DR Congo.
> Other countries show "Coming Soon". PHOENIX is decision support, **not** an official
> warning system. Always confirm with local authorities.

## What it does

| Area | Route | Notes |
| --- | --- | --- |
| Risk map and ranking | `/`, `/map` | Model-based risk from the PHOENIX backend |
| Satellite hotspots | `/fires` | NASA FIRMS (VIIRS / MODIS). Thermal anomalies, **not** confirmed fires |
| Alerts | `/alerts` | Predicted-risk alerts and satellite-detection alerts, kept separate |
| Shelters / safe locations | `/shelters` | Verified shelters kept separate from schools, health facilities, settlements |
| AI response brief | `/brief` | Region + time range summary, grounded only in retrieved PHOENIX data |
| AI planner | `/plan` | Preparedness Q&A for a selected area |
| Fire reports / assistance | `/reports`, `/assistance` | Community submissions (unverified until reviewed) |
| Models and data transparency | `/models`, `/data-sources`, `/pipeline` | Model registry, data coverage, pipeline readiness |

## Architecture

```
Browser ──► TanStack Start app (this repo, hosted on Lovable)
              ├─ src/services/api   ──► PHOENIX FastAPI backend (VITE_API_BASE_URL)   [not in this repo]
              ├─ src/lib/*.functions.ts  server functions: NASA FIRMS, NASA POWER, OSM,
              │                          MODIS NDVI, land cover / terrain / population
              └─ src/lib/brief.server.ts  AI brief + planner (Lovable AI Gateway)

pipeline/   offline Python data pipeline (v1–v4) that builds historical training data
```

## Data principles (from `AGENTS.md`)

- Hotspots are satellite thermal anomalies, never "confirmed wildfires".
- Real and demo values never mix. Demo data would live only in `src/services/mock` and be badged "Demo data".
- Missing values are shown as "Data unavailable", never invented. NASA POWER `-999` is treated as missing.
- A source shows "Available" only after a live check succeeds.
- The AI only sees PHOENIX data. It never invents numbers, never issues evacuation orders, never declares a place "safe".
- NDVI is never presented as risk or drought.

Read `AGENTS.md` before changing anything. It is the project's rulebook.

## Getting started

Requirements: [Bun](https://bun.sh) (a `bun.lock` is committed) or Node.js 20+.

```sh
git clone https://github.com/Nonna-ahmed/phoenix-for-africa.git
cd phoenix-for-africa
cp .env.example .env        # then fill in the values
bun install                 # or: npm install
bun run dev                 # or: npm run dev
```

Other scripts: `build`, `preview`, `lint`, `format`, `test`. CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every push and pull request.

Lint note: `bun run lint` currently reports ~1,280 Prettier formatting errors and 3 `react-hooks/rules-of-hooks` errors, so it is non-blocking in CI until they are fixed.

### Environment variables

See `.env.example`.

| Variable | Where used | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | browser | PHOENIX FastAPI backend base URL. Without it, backend-driven pages show "Data unavailable" |
| `FIRMS_MAP_KEY` | server only | NASA FIRMS hotspots |
| `LOVABLE_API_KEY` | server only | AI brief and planner |
| `NASA_EARTHDATA_TOKEN` | server / pipeline | LP DAAC access (needed by pipeline v4) |

Never commit real keys.

## Data pipeline (`pipeline/`)

Builds historical training data offline. The app never builds training tables itself.

| Version | Script | Output |
| --- | --- | --- |
| v1 | `phoenix_pipeline.py` | `v1_pilot/` (DRC and Algeria pilots) |
| v2 | `phoenix_pipeline_v2.py` | `v2_blocker_resolution/` (reads v1, fixes feature timing, no fake negatives) |
| v3 | `phoenix_pipeline_v3.py` | `v3_africa_expansion/` (11 countries) |
| v4 | `phoenix_pipeline_v4.py` | `v4_satellite_observation/` (VNP14A1 FireMask: confirmed no-fire labels) |

Versions never overwrite each other. Target variable: `satellite_fire_occurrence`.

```sh
pip install -r pipeline/requirements.txt
export PHX_BASE=./data/phoenix_pipeline      # this is the default; set it to keep outputs elsewhere
export NASA_EARTHDATA_TOKEN=...
python pipeline/phoenix_pipeline_v4.py granules cd_haut_katanga_p1
```

Current readiness is published in `src/data/pipeline-status.json` and on the `/pipeline` page.

## Known limitations

- Training data covers 30 × 30 km pilot windows, not whole regions.
- Existing risk models (Algeria, DRC) are marked **legacy**: they were trained before the v4 labels existed and are due for retraining.
- v4 shows a strong seasonal bias in observation validity (rainy-season cloud) for some countries.
- NASA POWER cells (~55 × 70 km) are shared by all 1 km cells inside them.

## Docs

- [`roadmap.md`](./roadmap.md): phased plan
- [`docs/api-contract.md`](./docs/api-contract.md): what the frontend expects from the FastAPI backend
- [`docs/model-cards/`](./docs/model-cards): model card template and cards for the existing models
- [`AGENTS.md`](./AGENTS.md): project rules

## Contributing

This repository is synced with Lovable. Commits to `main` appear in the Lovable editor.
Do not force-push or rewrite published history.

## License

Not yet specified. Add a `LICENSE` file before accepting outside contributions.
