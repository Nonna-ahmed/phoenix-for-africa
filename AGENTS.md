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
