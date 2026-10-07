"""
PHOENIX historical data pipeline v3 — Africa expansion (data engineering only, NO model training).

Adds 30 x 30 km pilot windows (900 x 1 km cells) in 9 more countries and builds them with exactly the
v2 definitions (target, observation validity, D-3 weather/soil lag, NDVI availability, year-matched land
cover, max-area admin assignment). Reuses the v1 download stages and the v2 build/audit code unchanged by
pointing them at phoenix_pipeline/v3_africa_expansion/. v1_pilot and v2_blocker_resolution are read-only.

Usage:
  python pipeline/phoenix_pipeline_v3.py fetch  [window]   # FIRMS, POWER, NDVI, terrain (v1 stages)
  python pipeline/phoenix_pipeline_v3.py prep   [window]   # grid + admin1 + admin2 + NDVI composites + yearly land cover
  python pipeline/phoenix_pipeline_v3.py build  [window]   # v2 build + leakage audit
  python pipeline/phoenix_pipeline_v3.py report             # country assessment + final v3 report (incl. CD/DZ from v2)
"""
import json, os, sys, math, datetime as dt
import numpy as np, pandas as pd

BASE = os.environ.get("PHX_BASE", "/mnt/documents/phoenix_pipeline")
OUT = f"{BASE}/v3_africa_expansion"; CACHE = os.environ.get("PHX_CACHE", "/tmp/phx_cache")
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
os.environ["PHX_OUT"] = OUT; os.environ["PHX_BASE"] = BASE
sys.path.insert(0, os.path.dirname(__file__))
import phoenix_pipeline as v1  # noqa: E402
import phoenix_pipeline_v2 as v2  # noqa: E402

# Pilot windows chosen for climatic/geographic diversity inside known fire-affected landscapes (not max fire count).
WINDOWS = {
    "ma_rif_p1":        {"country": "Morocco", "country_code": "MA", "iso3": "MAR", "zone": "North Africa / Mediterranean", "setting": "coastal-near, Rif forest", "lat": 35.10, "lon": -5.55},
    "tn_nefza_p1":      {"country": "Tunisia", "country_code": "TN", "iso3": "TUN", "zone": "North Africa / Mediterranean", "setting": "coastal, Kroumirie-Mogods forest", "lat": 36.95, "lon": 9.10},
    "eg_delta_p1":      {"country": "Egypt", "country_code": "EG", "iso3": "EGY", "zone": "North Africa / arid irrigated", "setting": "coastal-near, Nile Delta cropland", "lat": 31.20, "lon": 30.95},
    "ng_kainji_p1":     {"country": "Nigeria", "country_code": "NG", "iso3": "NGA", "zone": "Sahel / West Africa", "setting": "inland, Guinea savanna", "lat": 10.00, "lon": 4.60},
    "ke_mara_p1":       {"country": "Kenya", "country_code": "KE", "iso3": "KEN", "zone": "East Africa", "setting": "inland, savanna grassland", "lat": -1.40, "lon": 35.10},
    "zm_kafue_p1":      {"country": "Zambia", "country_code": "ZM", "iso3": "ZMB", "zone": "Southern Africa", "setting": "inland, miombo woodland", "lat": -14.80, "lon": 26.00},
    "ao_moxico_p1":     {"country": "Angola", "country_code": "AO", "iso3": "AGO", "zone": "Central / Southern Africa", "setting": "inland, miombo woodland", "lat": -11.80, "lon": 20.00},
    "mz_zambezia_p1":   {"country": "Mozambique", "country_code": "MZ", "iso3": "MOZ", "zone": "Southern / East Africa", "setting": "coastal-near, woodland/cropland", "lat": -17.30, "lon": 37.00},
    "za_lowveld_p1":    {"country": "South Africa", "country_code": "ZA", "iso3": "ZAF", "zone": "Southern Africa", "setting": "inland, lowveld savanna", "lat": -24.90, "lon": 31.30},
}
V2_EXISTING = {"cd_haut_katanga_p1": {"zone": "Central Africa / tropical", "setting": "inland, miombo woodland"},
               "dz_north_p1": {"zone": "North Africa / Mediterranean", "setting": "coastal, Mediterranean forest"}}
GB = "https://www.geoboundaries.org/api/current/gbOpen/{iso}/{lvl}/"
LIVE_APP = {"CD", "DZ"}  # countries with live PHOENIX app modules (registry CONNECTED) — unrelated to historical data

for wid, w in WINDOWS.items():
    w.setdefault("admin1", None); w.setdefault("admin1_code", None)
v1.WINDOWS.update(WINDOWS); v1.OUT = OUT; v1.CACHE = CACHE
v2.WINDOWS.update(WINDOWS); v2.V1 = OUT; v2.OUT = OUT; v2.CACHE = CACHE
for w in WINDOWS.values():
    v2.ADM2[w["country_code"]] = {"url": GB.format(iso=w["iso3"], lvl="ADM2"), "unit": "ADM2 (geoBoundaries canonical)", "source": f"geoBoundaries gbOpen {w['iso3']} ADM2"}


DONE = {"power": "weather_daily", "ndvi": "ndvi_pixels", "static": "static_features"}

def stage_fetch(wid):
    v1.stage_firms(wid)
    for name, fn in (("power", v1.stage_power), ("ndvi", v1.stage_ndvi), ("static", v1.stage_static)):
        if not os.path.exists(f"{OUT}/{DONE[name]}_{wid}.parquet"): fn(wid)


def _assign(wid, lvl):
    from shapely.geometry import shape, box
    from shapely.strtree import STRtree
    w = WINDOWS[wid]; p = f"{CACHE}/{lvl}_{w['iso3']}.geojson"
    if not os.path.exists(p):
        meta = v1.S.get(GB.format(iso=w["iso3"], lvl=lvl), timeout=60).json()
        open(p, "wb").write(v1.S.get(meta["gjDownloadURL"], timeout=300).content)
        json.dump({k: meta.get(k) for k in ("boundarySource", "boundaryLicense", "boundaryYearRepresented", "boundaryCanonical")}, open(p + ".meta", "w"))
    feats = json.load(open(p))["features"]; geoms = [shape(f["geometry"]).buffer(0) for f in feats]; tree = STRtree(geoms)
    g = v1.grid(wid); res = []
    for r in g.itertuples():
        cell = box(r.min_lon, r.min_lat, r.max_lon, r.max_lat); best, area = None, 0.0
        for i in tree.query(cell):
            a = geoms[i].intersection(cell).area
            if a > area: best, area = i, a
        res.append((feats[best]["properties"]["shapeName"], feats[best]["properties"].get("shapeID")) if best is not None else (None, None))
    return res, json.load(open(p + ".meta"))


def stage_prep(wid):
    g = v1.grid(wid); a1, m1 = _assign(wid, "ADM1")
    g["admin1"] = [x[0] for x in a1]; g["admin1_code"] = [x[1] for x in a1]
    g["admin1_source"] = f"geoBoundaries gbOpen {WINDOWS[wid]['iso3']} ADM1 ({m1['boundarySource']}, {m1['boundaryLicense']}); maximum-area overlap"
    g.to_parquet(f"{OUT}/spatial_grid_{wid}.parquet", index=False)
    WINDOWS[wid]["admin1"] = pd.Series(g.admin1).mode().iloc[0] if g.admin1.notna().any() else None
    _, m2 = _assign(wid, "ADM2")
    v2.ADM2[WINDOWS[wid]["country_code"]].update(unit=m2.get("boundaryCanonical") or "ADM2", source=f"geoBoundaries gbOpen {WINDOWS[wid]['iso3']} ADM2 ({m2['boundarySource']}, {m2['boundaryLicense']})")
    v2.stage_admin2(wid)
    # NDVI composites exactly as v1 build (per-cell mean of QA-valid 250 m pixels)
    b = v1.bbox(WINDOWS[wid]); n = 2 * v1.HALF_KM; dlat = (b[3] - b[1]) / n; dlon = (b[2] - b[0]) / n
    P = pd.read_parquet(f"{OUT}/ndvi_pixels_{wid}.parquet")
    P["row"] = ((P.lat - b[1]) / dlat).astype(int); P["col"] = ((P.lon - b[0]) / dlon).astype(int)
    P = P[(P.row >= 0) & (P.row < n) & (P.col >= 0) & (P.col < n)]
    P["grid_id"] = [f"{wid}_r{r:03d}c{c:03d}" for r, c in zip(P.row, P.col)]
    C = P.groupby(["grid_id", "composite_start", "data_available_date"]).agg(ndvi=("ndvi", "mean"), ndvi_valid_px=("ndvi", "count"), ndvi_total_px=("ndvi", "size")).reset_index().sort_values(["grid_id", "composite_start"])
    C["ndvi_previous"] = C.groupby("grid_id").ndvi.shift(1); C["ndvi_change"] = C.ndvi - C.ndvi_previous
    C.to_parquet(f"{OUT}/ndvi_composites_{wid}.parquet", index=False)
    v2.stage_landcover(wid)
    json.dump(WINDOWS[wid], open(f"{OUT}/window_{wid}.json", "w"))


def stage_build(wid):
    WINDOWS[wid].update(json.load(open(f"{OUT}/window_{wid}.json")))
    v2.stage_build(wid)


def density(pos_days, dates):
    if pos_days >= 1000 and dates >= 200: return "Sufficient"
    if pos_days >= 200 and dates >= 50: return "Limited"
    return "Very Sparse"

DENSITY_RULE = "Per 900 km² pilot, 2020-01-01..2026-09-30: Sufficient = >=1000 positive square-days AND >=200 distinct fire dates; Limited = >=200 AND >=50; otherwise Very Sparse."


def stage_report(_=None):
    rows = []
    srcs = [(wid, f"{BASE}/v2_blocker_resolution", V2_EXISTING[wid]) for wid in V2_EXISTING] + [(wid, OUT, WINDOWS[wid]) for wid in WINDOWS]
    for wid, d, meta in srcs:
        p = f"{d}/data_quality_report_{wid}.json"
        if not os.path.exists(p): rows.append({"window_id": wid, "country": meta.get("country"), "status": "not built"}); continue
        j = json.load(open(p)); T = pd.read_parquet(f"{d}/training_features_daily_{wid}.parquet", columns=["t2m_max", "soil_moisture_current", "ndvi_current", "land_cover_class", "elevation_m", "slope_deg_1km", "admin1", "admin2"])
        ps = j["positive_samples"]; cc = j["country_code"]
        rows.append({
            "window_id": wid, "country": j["country"], "country_code": cc, "zone": meta["zone"], "setting": meta["setting"],
            "admin1": j["admin1"] if d != OUT else WINDOWS[wid]["admin1"], "admin2_units": list(j["admin2"]["units"].keys()),
            "historical_period": j["date_range"], "geographic_coverage": f"pilot 30x30 km ({j.get('pilot_area_km2', 900)} km², 900 cells), bbox {[round(x, 3) for x in j['bbox']]}",
            "firms_raw_detections": ps["raw_detections"], "medium_high_confidence_detections": ps["qualifying_detections_in_window"],
            "positive_square_days": ps["positive_square_days"], "distinct_fire_dates": ps["positive_dates"], "grid_cells_ever_detected": ps["positive_grid_cells"],
            "coverage_pct": {k: round(100 * T[c].notna().mean(), 2) for k, c in [("weather", "t2m_max"), ("soil_moisture", "soil_moisture_current"), ("ndvi", "ndvi_current"), ("land_cover", "land_cover_class"), ("terrain_elevation", "elevation_m"), ("terrain_slope", "slope_deg_1km"), ("admin1", "admin1"), ("admin2", "admin2")]},
            "missingness_pct": j["missingness_pct"], "observation_validity": j["observation_validity"],
            "leakage_audit": {"rows_checked": j["leakage_audit"]["rows_checked"], "mismatches": sum(j["leakage_audit"]["mismatches"].values()), "passed": j["leakage_audit"]["passed"]},
            "event_density": density(ps["positive_square_days"], ps["positive_dates"]),
            "reliable_negative_labels": False, "historical_ml_data": "collected (pilot)", "live_app_modules": "connected" if cc in LIVE_APP else "not connected (does not affect historical data)",
            "readiness": j["readiness"], "source_dir": os.path.basename(d),
        })
    built = [r for r in rows if "event_density" in r]
    rec = [r["country"] for r in built if r["event_density"] == "Sufficient"]
    caution = [f"{r['country']} ({r['event_density']})" for r in built if r["event_density"] != "Sufficient"]
    rep = {
        "version": "v3_africa_expansion", "generated": dt.date.today().isoformat(), "target": "satellite_fire_occurrence", "model_trained": False,
        "density_rule": DENSITY_RULE, "countries": rows,
        "zones_covered": sorted({r["zone"] for r in built}),
        "observation_validity_limitation": "No per-cell VIIRS observation-quality (cloud/clear-land fire mask) is ingested for any country, so valid_negative_candidate = 0 everywhere; no-hotspot days are insufficient_observation. No country has reliable negative labels.",
        "weather_rule": v2.__dict__.get("POWER_AVAILABILITY_LAG_DAYS") and f"D-{v2.POWER_AVAILABILITY_LAG_DAYS} for every weather/soil value and rolling window (3/7/14/30 d)",
        "data_sources": {
            "fire": "NASA FIRMS VIIRS S-NPP 375 m, SP archive to 2026-06-30 then NRT; confidence nominal/high",
            "weather_soil": "NASA POWER daily point API (community AG), native 0.5°x0.625° cells; GWETROOT soil moisture",
            "ndvi": "MOD13Q1.061 250 m 16-day via ORNL DAAC MODIS Web Service; QA 0/1 only; available from proc_date",
            "land_cover": "Esri/Impact Observatory Sentinel-2 10 m annual LULC 2020-2025 (2026 = 2025, flagged prior_year_proxy)",
            "terrain": "NASA SRTM 30 m via OpenTopoData at cell centroid; slope/aspect from 1 km centroid differences",
            "admin": "geoBoundaries gbOpen ADM1/ADM2 per country (CD/DZ ADM2 as in v2); maximum-area overlap",
        },
        "recommended_first_unified_dataset": rec, "exclude_or_caution": caution,
        "blocking_for_all": ["No valid negatives (observation-validity mask missing)", "Pilot windows only, not full countries", "POWER cells ~55x70 km shared by 1 km cells"],
    }
    json.dump(rep, open(f"{OUT}/v3_final_report.json", "w"), indent=2, default=str)
    pd.json_normalize(built).to_csv(f"{OUT}/v3_country_assessment.csv", index=False)
    print(json.dumps([{k: r.get(k) for k in ("country", "positive_square_days", "distinct_fire_dates", "event_density", "leakage_audit")} for r in rows], indent=0, default=str))
    print("recommended", rec); print("caution", caution)


if __name__ == "__main__":
    st = sys.argv[1]
    if st == "report": stage_report(); sys.exit()
    for w in ([sys.argv[2]] if len(sys.argv) > 2 else list(WINDOWS)): globals()[f"stage_{st}"](w)
