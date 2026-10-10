# PHOENIX backend API contract (as consumed by this frontend)

The FastAPI backend is **not in this repository**. This file documents what the frontend
(`src/services/api/endpoints.ts`, `client.ts`, `normalize.ts`) calls and accepts. It is the
starting point for putting the backend under version control.

> **Not yet verified against the live backend.** `normalize.ts` states that response shapes
> were not verified; its readers accept several likely field names and return `null` when a
> field is absent. Once the backend is in a repo, replace this with an OpenAPI schema
> (FastAPI generates one at `/openapi.json`) and tighten the normalizers.

## General
- Base URL: `VITE_API_BASE_URL` (browser-visible, no trailing slash).
- Calls are made **directly from the browser**, so the backend must allow CORS from the app origin(s).
- Requests send `Accept: application/json`. POST bodies are JSON.
- Non-2xx responses are surfaced as `HTTP <status> on <path>`. If the body has a `detail` field, it is shown.
- Missing values must be `null`/absent. NASA POWER fill value `-999` is treated as missing.
- Lists may be a bare array, or wrapped under one of: the endpoint-specific key, `data`, `results`, `items`, `points`, `features`, `records`. GeoJSON `Feature`s are flattened (`properties` + coordinates).
- Only DZ (Algeria) and CD (DR Congo) are queried today (`CONNECTED` in `hooks.ts`).

Common query parameters (all optional): `country` (ISO-2, e.g. `CD`), `region` (region id, e.g. `haut-katanga`), `bbox` (`west,south,east,north`, comma separated).

## GET endpoints

| Path | Query | Wrapper key(s) | Fields read (first match wins) |
|---|---|---|---|
| `/risk-map` | country, region, bbox | `grid`, `cells` | `lat`/`LAT`/`latitude`; `lon`/`LON`/`lng`/`longitude`; `probability`/`prob`/`risk_probability`/`risk`/`fire_probability`; `risk_level`/`level`/`category`; `date`/`DATE`/`timestamp`; environment: `T2M_MAX`, `T2M_MIN`, `RH2M`, `WS2M`, `PRECTOTCORR` |
| `/shelters` | country, region, bbox | `shelters` | `id`/`shelter_id`; `name`/`shelter_name`/`site_name`; lat/lon as above; `capacity`; `status`; `contact`/`phone`; `region`/`province` |
| `/alerts` | country, region | `alerts` | `id`; `type`/`kind`/`category` (matches `fire`, `detect`, `satellite` or `firms` → detection alert, otherwise risk alert); `title`/`headline`; `message`/`description`/`text`; `region`/`province`/`location`; `country`; `probability`/`risk_probability`; `issued_at`/`created_at`/`date`/`timestamp` |
| `/fwi` | country, region, bbox | none (object or first row) | `fwi`/`FWI`/`value`; `date`/`timestamp` |
| `/fire-reports` | country, region | `reports` | `id`; lat/lon; `description`/`message`; `reported_at`/`created_at`/`datetime`/`date`; `status`/`verification_status`/`verified`/`confirmed`. A report counts as **confirmed** only if that value matches `confirmed`, `verified` or `true` (case-insensitive) |

## POST endpoints

`POST /fire-reports`
```json
{ "latitude": -10.9, "longitude": 27.5, "datetime": "2026-10-10T08:30:00.000Z",
  "description": "Smoke visible north of the road", "country": "CD" }
```
`latitude` -90..90, `longitude` -180..180, `datetime` ISO-8601 UTC, `description` 5–1000 chars, `country` optional.

`POST /assistance-requests`
```json
{ "description": "Need transport away from the fire", "country": "CD",
  "latitude": -10.9, "longitude": 27.5, "people": 4 }
```
Only `description` is required (5–1000 chars).

## Endpoints mentioned but not used by the frontend
`/ussd` and `/voice` are referenced in the Assistance page text as backend channels for phones.

## Frontend server functions (not backend)
These run in the app's server runtime and do not use `VITE_API_BASE_URL`:

| File | Source | Secret |
|---|---|---|
| `src/lib/firms.functions.ts` | NASA FIRMS hotspots | `FIRMS_MAP_KEY` |
| `src/lib/power.functions.ts`, `grid.functions.ts` | NASA POWER | none |
| `src/lib/vegetation.functions.ts` | MODIS NDVI (ORNL DAAC) | none |
| `src/lib/site.functions.ts` | land cover, terrain, population, soil moisture | `FIRMS_MAP_KEY` (source probe) |
| `src/lib/osm.functions.ts` | OpenStreetMap hospitals / roads (Esri replica) | none |
| `src/lib/locations.functions.ts` | safe locations (GRID3 etc.) | none |
| `src/lib/brief.server.ts` | AI brief and planner (Lovable AI Gateway) | `LOVABLE_API_KEY` |

## Open questions for the backend owner
- Which model artifacts does each endpoint load, and from where?
- How and when is `/risk-map` refreshed? (Daily job? On request?)
- How are `/fire-reports` and `/assistance-requests` stored, authenticated, rate-limited and moderated?
