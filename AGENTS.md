<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# PHOENIX rules

- All backend calls go through `src/services/api` (client, normalizers, hooks); base URL only from `VITE_API_BASE_URL` — keeps the FastAPI backend swappable and never hard-coded.
- `src/data/registry.ts` holds country/region/model metadata only, never live or demo values — adding a country must not need UI changes.
- Mock/demo data may only live in `src/services/mock` and must be badged "Demo data" in the UI — real and demo values must never mix.
- Normalizers return null for absent fields and treat NASA POWER -999 as missing — the UI shows "Data unavailable"/"Missing" instead of invented values.
- NASA FIRMS is called only from `src/lib/firms.functions.ts` (server fn, key `FIRMS_MAP_KEY`, server-side cap + cache) — keeps the MAP_KEY private and the browser light.
- Leaflet map lives in `RiskMapInner.tsx`, loaded lazily behind ClientOnly — Leaflet breaks SSR and `*.client.*` names are rejected by the SSR build.
- NASA POWER weather comes from `src/lib/power.functions.ts` (server fn, cached, -999 → null) — country-independent, keyless, provenance returned with every result.
- Shelters/safe locations use the `SafeLocation` schema (`src/data/locations.ts`) and the per-country source registry (`src/data/sources.ts`), fetched by `src/lib/locations.functions.ts` — a location is a confirmed shelter only if `isEmergencyShelter` and official/humanitarian-verified; GRID3 is never a shelter registry.
- Land cover, terrain, population and soil moisture come from `src/lib/site.functions.ts` (each source independent, failure → "unavailable"); the dataset registry is `src/data/datasets.ts` and a source shows "Available" only after the live `probeSources` check succeeds — never claim coverage PHOENIX hasn't retrieved.
- Map layers are defined once in `src/components/phoenix/layers.ts`; `RiskMap` owns on/off state, fetches each layer only while it is on, and derives status from the actual query result plus the shared source registry — never a second availability system.
- Spatial map layers use what each source really provides: NASA POWER native grid cells via `src/lib/grid.functions.ts` (no interpolation, areas >9 tiles return "limited"), source-rendered raster images for land cover/population (`src/data/rasters.ts`), hillshade tiles for terrain, and `getPixelInfo` for real values on click — never copy one point value across an area.
- AI response briefs: `/brief` gathers live layer data in the browser (NASA POWER grids incl. soil moisture, 5×5 `getAreaSample` for population/elevation/land cover, 0.25° hotspot clusters — never single-point values for a region), posts a compact validated summary to the `/api/brief` server route (`src/lib/brief.server.ts`, Lovable AI Gateway, streamed text, errors appended as a marker line) — the AI only sees PHOENIX data, never invents values. OSM hospitals/roads come from `src/lib/osm.functions.ts` (Esri live OSM Africa replica; Overpass is unreachable from the sandbox).
- AI Planner: `/plan` sends a planner question plus area data (NASA POWER grid stats, 3×3 sampled land cover/elevation/WorldPop via `getAreaSample`) to `/api/plan`; brief and planner share `streamAi` and `COMMON_RULES` in `src/lib/brief.server.ts` — one place for grounding/citation/no-fabricated-confidence rules.
- Vegetation/NDVI comes only from `src/lib/vegetation.functions.ts` (`VegetationResult` interface; MOD13Q1.061 via ORNL DAAC MODIS Web Service, QA-filtered real pixels in sampled windows, 24 h cache) — swap providers behind the interface; NDVI is never risk or drought. `NASA_EARTHDATA_TOKEN` is stored server-side for future LP DAAC direct access but the current endpoint needs no auth.
- Historical training data is built offline by `pipeline/phoenix_pipeline.py` (v1, outputs in `v1_pilot/`) and `pipeline/phoenix_pipeline_v2.py` (reads v1, writes `v2_blocker_resolution/`; no-hotspot days are never negatives without per-cell observation-quality data; POWER features lagged by POWER_AVAILABILITY_LAG_DAYS) — versions never overwrite each other. Original note: (cached raw API responses → Parquet in Files); the app only shows `src/data/pipeline-status.json` on `/pipeline` — the Worker never builds training tables. Target is satellite_fire_occurrence, never confirmed wildfire.
