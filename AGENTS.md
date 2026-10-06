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
- Leaflet map lives in `RiskMapInner.tsx`, loaded lazily behind ClientOnly — Leaflet breaks SSR and `*.client.*` names are rejected by the SSR build.
