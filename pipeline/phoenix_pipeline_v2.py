"""
PHOENIX historical data pipeline v2 — blocker resolution (data engineering only, NO model training).

Reads the preserved v1 pilot outputs (raw FIRMS detections, NASA POWER daily, NDVI composites, terrain)
from phoenix_pipeline/v1_pilot/ and writes corrected tables/reports to phoenix_pipeline/v2_blocker_resolution/.
v1 files are never modified.

Changes vs v1:
  1. Observation validity: positive / valid_negative_candidate / insufficient_observation / missing_observation.
     No per-cell VIIRS observation-quality (cloud/clear) product is ingested, so a no-hotspot day is never
     promoted to a negative: it is 'insufficient_observation'. Days whose FIRMS request failed or fall outside
     the product's archive dates are 'missing_observation'.
  2. NASA POWER availability lag: features for prediction date D use only observations dated <= D - LAG.
  3. Land cover year-matched from Esri/Impact Observatory annual 10 m LULC (2017-2025); 2026 uses 2025, flagged.
  4. Admin2 from geoBoundaries (CD: OCHA territories/cities; DZ: UNHCR/GAUL level 2 communes), max-area overlap.
  5. Pilot-scope metadata. 6. Sparse-sample reporting. 8. Leakage audit >= 500 rows.

Usage:
  python pipeline/phoenix_pipeline_v2.py landcover [window]
  python pipeline/phoenix_pipeline_v2.py admin2 [window]
  python pipeline/phoenix_pipeline_v2.py build [window]
"""
import json, os, sys, math, datetime as dt
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd, requests

BASE = os.environ.get("PHX_BASE", "/mnt/documents/phoenix_pipeline")
V1, OUT = f"{BASE}/v1_pilot", f"{BASE}/v2_blocker_resolution"
CACHE = os.environ.get("PHX_CACHE", "/tmp/phx_cache")
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)

START, END = dt.date(2020, 1, 1), dt.date(2026, 9, 30)
HALF_KM = 15
POWER_AVAILABILITY_LAG_DAYS = int(os.environ.get("POWER_AVAILABILITY_LAG_DAYS", 3))
FIRMS_PRODUCTS = {"VIIRS_SNPP_SP": ("2012-01-20", "2026-06-30"), "VIIRS_SNPP_NRT": ("2026-07-01", "2026-10-07")}  # FIRMS data_availability API, 2026-10-07
LC_YEARS = list(range(2020, 2026))  # annual maps available 2017-2025 (ImageServer timeExtent)
LC_URL = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/identify"
IO = {1: "Water", 2: "Trees", 4: "Flooded vegetation", 5: "Crops", 7: "Built area", 8: "Bare ground", 9: "Snow/ice", 10: "Clouds", 11: "Rangeland"}
ADM2 = {
    "CD": {"url": "https://www.geoboundaries.org/api/current/gbOpen/COD/ADM2/", "unit": "territory/city", "source": "geoBoundaries gbOpen COD ADM2 (Référentiel Géographique Commun, OCHA DRC), CC BY 3.0 IGO"},
    "DZ": {"url": "https://www.geoboundaries.org/api/current/gbHumanitarian/DZA/ADM2/", "unit": "commune (GAUL level 2)", "source": "geoBoundaries gbHumanitarian DZA ADM2 (UNHCR from FAO GAUL, via HDX), CC BY 3.0 IGO"},
}
WINDOWS = {
    "cd_haut_katanga_p1": {"country": "Democratic Republic of the Congo", "country_code": "CD", "admin1": "Haut-Katanga", "admin1_code": "CD-HK", "lat": -11.45, "lon": 27.60},
    "dz_north_p1": {"country": "Algeria", "country_code": "DZ", "admin1": "El Tarf", "admin1_code": "DZ-36", "lat": 36.80, "lon": 8.30},
}
SCOPE = {"spatial_scope": "pilot", "pilot_area_km2": 900, "grid_resolution_km": 1, "grid_cells": 900,
         "hierarchy": ["Africa", "country", "admin1", "admin2", "1 km grid"]}
S = requests.Session()


def bbox(w):
    dlat = HALF_KM / 111.32; dlon = dlat / math.cos(math.radians(w["lat"]))
    return (w["lon"] - dlon, w["lat"] - dlat, w["lon"] + dlon, w["lat"] + dlat)


def grid(wid):
    return pd.read_parquet(f"{V1}/spatial_grid_{wid}.parquet")

# ---------------- land cover, year-matched ----------------
def stage_landcover(wid):
    g = grid(wid)
    def one(args):
        lat, lon, y = args
        s = int(dt.datetime(y, 1, 1, tzinfo=dt.timezone.utc).timestamp() * 1000); e = int(dt.datetime(y, 12, 31, tzinfo=dt.timezone.utc).timestamp() * 1000)
        geom = json.dumps({"x": lon, "y": lat, "spatialReference": {"wkid": 4326}})
        for _ in range(4):
            try:
                j = S.get(LC_URL, params={"geometry": geom, "geometryType": "esriGeometryPoint", "time": f"{s},{e}", "returnCatalogItems": "true", "f": "json"}, timeout=60).json()
                items = j.get("catalogItems", {}).get("features", [])
                yr = items[0]["attributes"].get("Year") if items else None
                v = j.get("value")
                if yr != y or v in (None, "NoData"): return None  # the map for that year must be the one answering
                return int(float(v))
            except Exception: pass
        return None
    rows = []
    for y in LC_YEARS:
        p = f"{CACHE}/lc_{wid}_{y}.json"
        if not os.path.exists(p):
            with ThreadPoolExecutor(16) as ex: vals = list(ex.map(one, [(a, o, y) for a, o in zip(g.lat, g.lon)]))
            json.dump(vals, open(p, "w"))
        vals = json.load(open(p))
        rows.append(pd.DataFrame({"grid_id": g.grid_id, "land_cover_year": y, "land_cover_code": vals}))
    L = pd.concat(rows, ignore_index=True)
    L["land_cover_class"] = L.land_cover_code.map(IO)
    L.to_parquet(f"{OUT}/land_cover_yearly_{wid}.parquet", index=False)
    print(wid, "land cover yearly", L.groupby("land_cover_year").land_cover_code.apply(lambda s: s.notna().sum()).to_dict())

# ---------------- admin2 ----------------
def stage_admin2(wid):
    from shapely.geometry import shape, box
    from shapely.strtree import STRtree
    w = WINDOWS[wid]; meta = ADM2[w["country_code"]]
    p = f"{CACHE}/adm2_{w['country_code']}.geojson"
    if not os.path.exists(p):
        u = S.get(meta["url"], timeout=60).json()["gjDownloadURL"]; open(p, "wb").write(S.get(u, timeout=300).content)
    feats = json.load(open(p))["features"]; geoms = [shape(f["geometry"]).buffer(0) for f in feats]; tree = STRtree(geoms)
    g = grid(wid); out = []
    for r in g.itertuples():
        cell = box(r.min_lon, r.min_lat, r.max_lon, r.max_lat); best, area, n = None, 0.0, 0
        for i in tree.query(cell):
            a = geoms[i].intersection(cell).area
            if a > 0: n += 1
            if a > area: best, area = i, a
        out.append({"grid_id": r.grid_id, "admin2": feats[best]["properties"]["shapeName"] if best is not None else None,
                    "admin2_code": feats[best]["properties"].get("shapeID") if best is not None else None,
                    "admin2_overlap_fraction": round(area / cell.area, 4) if best is not None else None, "admin2_units_intersecting": n})
    A = pd.DataFrame(out); A["admin2_unit_type"] = meta["unit"]; A["admin2_source"] = meta["source"]
    A["admin2_assignment_rule"] = "maximum-area overlap of the 1 km cell polygon (EPSG:4326 areas; ties impossible in practice, first max kept)"
    A.to_parquet(f"{OUT}/admin2_assignment_{wid}.parquet", index=False)
    print(wid, "admin2 assigned", A.admin2.notna().sum(), "crossing cells", int((A.admin2_units_intersecting > 1).sum()), A.admin2.value_counts().to_dict())

# ---------------- build ----------------
def stage_build(wid):
    w = WINDOWS[wid]; b = bbox(w); n = 2 * HALF_KM; dlat = (b[3] - b[1]) / n; dlon = (b[2] - b[0]) / n
    g = grid(wid).drop(columns=["admin2", "admin2_code"])
    A = pd.read_parquet(f"{OUT}/admin2_assignment_{wid}.parquet")
    g = g.merge(A, on="grid_id", how="left")
    for k, v in SCOPE.items():
        if k != "hierarchy": g[k] = v
    g.to_parquet(f"{OUT}/spatial_grid_{wid}.parquet", index=False)

    raw = pd.read_parquet(f"{V1}/raw_fire_detections_{wid}.parquet")  # untouched original detections
    log = pd.DataFrame(json.load(open(f"{V1}/firms_request_log_{wid}.json")))
    ev = raw[raw["confidence"].astype(str).str.lower().isin(["n", "h", "nominal", "high"])].copy()
    ev["row"] = ((ev.latitude - b[1]) / dlat).astype(int); ev["col"] = ((ev.longitude - b[0]) / dlon).astype(int)
    ev = ev[(ev.row >= 0) & (ev.row < n) & (ev.col >= 0) & (ev.col < n)]
    ev["grid_id"] = [f"{wid}_r{r:03d}c{c:03d}" for r, c in zip(ev.row, ev.col)]; ev["date"] = pd.to_datetime(ev.acq_date)
    ev.to_parquet(f"{OUT}/processed_fire_events_{wid}.parquet", index=False)
    daily = ev.groupby(["grid_id", "date"]).agg(fire_count=("frp", "size"), max_frp=("frp", "max")).reset_index()

    dates = pd.date_range(START, END, freq="D")
    ok_dates = set()
    for _, l in log[log.status == "ok"].iterrows():
        lo, hi = FIRMS_PRODUCTS[l.source]
        ok_dates |= {d for d in pd.date_range(l.start, periods=l.days, freq="D") if lo <= str(d.date()) <= hi}
    T = pd.MultiIndex.from_product([g.grid_id.values, dates], names=["grid_id", "date"]).to_frame(index=False)
    T = T.merge(daily, on=["grid_id", "date"], how="left"); T["fire_count"] = T.fire_count.fillna(0).astype(int)
    have = T.date.isin(ok_dates); pos = T.fire_count > 0
    T["fire_observation_valid"] = np.select([pos & have, ~have], ["positive", "missing_observation"], "insufficient_observation")
    T["fire_observation_reason"] = np.select(
        [pos & have, ~have],
        ["qualifying VIIRS S-NPP detection (confidence nominal/high) in cell on UTC date",
         "FIRMS archive request failed or date outside VIIRS_SNPP product availability"],
        "no qualifying detection; no per-cell satellite observation-quality (cloud/clear-land) data ingested, so not a confirmed negative")
    T["satellite_fire_occurrence"] = np.where(T.fire_observation_valid == "positive", 1.0, np.where(T.fire_observation_valid == "valid_negative_candidate", 0.0, np.nan))

    # fire history: strictly before D
    T = T.sort_values(["grid_id", "date"]).reset_index(drop=True); grp = T.groupby("grid_id", sort=False)
    prev = grp.fire_count.shift(1)
    for k in [1, 3, 7, 14, 30]:
        T[f"fires_previous_{k}d"] = prev.groupby(T.grid_id).rolling(k, min_periods=k).sum().reset_index(level=0, drop=True)
    pday = (prev > 0).astype(float).where(prev.notna())
    for k in [7, 30]:
        T[f"fire_days_previous_{k}d"] = pday.groupby(T.grid_id).rolling(k, min_periods=k).sum().reset_index(level=0, drop=True)
    pfrp = grp.max_frp.shift(1)
    for k in [7, 30]:
        T[f"max_previous_frp_{k}d"] = pfrp.groupby(T.grid_id).rolling(k, min_periods=1).max().reset_index(level=0, drop=True)
    last = T.date.where(T.fire_count > 0); last_prev = last.groupby(T.grid_id).shift(1).groupby(T.grid_id).ffill()
    T["days_since_previous_detection"] = (T.date - last_prev).dt.days

    # weather + soil: rolling windows on OBSERVATION dates, then made eligible at observation_date + LAG
    W = pd.read_parquet(f"{V1}/weather_daily_{wid}.parquet").sort_values(["power_lat", "power_lon", "date"]).reset_index(drop=True)
    wg = W.groupby(["power_lat", "power_lon"], sort=False)
    def roll(col, k, how): return getattr(wg[col].rolling(k, min_periods=k), how)().reset_index(level=[0, 1], drop=True)
    F = W[["date", "power_lat", "power_lon"]].rename(columns={"date": "weather_observation_date"})
    F["t2m_max"], F["t2m_min"], F["t2m_mean"], F["rh2m"], F["ws2m"], F["precip_1d"] = W.T2M_MAX, W.T2M_MIN, W.T2M, W.RH2M, W.WS2M, W.PRECTOTCORR
    for k in [3, 7, 14]: F[f"t2m_max_{k}d_mean"] = roll("T2M_MAX", k, "mean")
    for k in [3, 7]: F[f"rh2m_{k}d_mean"] = roll("RH2M", k, "mean"); F[f"ws2m_{k}d_mean"] = roll("WS2M", k, "mean")
    for k in [3, 7, 14, 30]: F[f"precip_{k}d_sum"] = roll("PRECTOTCORR", k, "sum")
    F["soil_moisture_current"] = W.GWETROOT
    for k in [3, 7, 14]: F[f"soil_moisture_{k}d_mean"] = roll("GWETROOT", k, "mean")
    F["weather_retrieval_date"] = W.retrieved_at.str[:10]
    F["weather_feature_available_date"] = F.weather_observation_date + pd.Timedelta(days=POWER_AVAILABILITY_LAG_DAYS)
    F["date"] = F.weather_feature_available_date  # join key = prediction date D
    pc = g[["grid_id"]].copy(); pc["power_lat"] = [round(round(a / 0.5) * 0.5, 3) for a in g.lat]; pc["power_lon"] = [round(round(o / 0.625) * 0.625, 4) for o in g.lon]
    T = T.merge(pc, on="grid_id", how="left").merge(F, on=["date", "power_lat", "power_lon"], how="left")
    T["weather_source"] = "NASA POWER daily point API (community AG), native 0.5°x0.625° cell"
    T["weather_missing"] = T.t2m_max.isna(); T["soil_moisture_missing"] = T.soil_moisture_current.isna()

    # NDVI: latest composite processed on/before D
    C = pd.read_parquet(f"{V1}/ndvi_composites_{wid}.parquet").dropna(subset=["data_available_date"])
    C["data_available_date"] = C.data_available_date.astype("datetime64[ns]"); C = C.sort_values("data_available_date")
    T["date"] = T.date.astype("datetime64[ns]"); T = T.sort_values("date")
    T = pd.merge_asof(T, C[["grid_id", "data_available_date", "composite_start", "ndvi", "ndvi_previous", "ndvi_change", "ndvi_valid_px"]].rename(
        columns={"ndvi": "ndvi_current", "composite_start": "ndvi_composite_start", "data_available_date": "ndvi_available_date"}),
        left_on="date", right_on="ndvi_available_date", by="grid_id", direction="backward")
    T["ndvi_missing"] = T.ndvi_current.isna()

    # land cover: year-matched (2026 -> 2025 map, flagged)
    L = pd.read_parquet(f"{OUT}/land_cover_yearly_{wid}.parquet")
    T["land_cover_year"] = T.date.dt.year.clip(upper=max(LC_YEARS))
    T = T.merge(L, on=["grid_id", "land_cover_year"], how="left")
    T["land_cover_temporal_type"] = np.where(T.date.dt.year <= max(LC_YEARS), "year_matched", "prior_year_proxy")
    T["land_cover_source"] = "Esri/Impact Observatory Sentinel-2 10 m Land Use/Land Cover, annual (Sentinel2_10m_LandCover ImageServer), cell-centroid pixel"
    T["land_cover_version"] = "Sentinel_2_10m_LandCover_<year> (annual 2017-2025)"
    T["land_cover_missing"] = T.land_cover_class.isna()

    St = pd.read_parquet(f"{V1}/static_features_{wid}.parquet")[["grid_id", "elevation_m", "slope_deg_1km", "aspect_deg_1km"]]
    T = T.merge(St, on="grid_id", how="left"); T["terrain_temporal_type"] = "static"; T["terrain_missing"] = T.elevation_m.isna()
    T = T.merge(g[["grid_id", "lat", "lon", "country", "country_code", "admin1", "admin1_code", "admin2", "admin2_code", "spatial_scope"]], on="grid_id", how="left")
    doy = T.date.dt.dayofyear; T["day_of_year"], T["month"] = doy, T.date.dt.month
    T["sin_doy"], T["cos_doy"] = np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)
    T["season"] = T.month.map(lambda m: ("DJF", "MAM", "JJA", "SON")[(m % 12) // 3])
    T = T.drop(columns=["max_frp"]).sort_values(["grid_id", "date"]).reset_index(drop=True)

    checks = audit(T, ev, W, C, L, wid)
    T.to_parquet(f"{OUT}/training_features_daily_{wid}.parquet", index=False)
    rep = quality(T, raw, ev, wid, checks, A)
    json.dump(rep, open(f"{OUT}/data_quality_report_{wid}.json", "w"), indent=2, default=str)
    print(json.dumps({k: rep[k] for k in ("observation_validity", "positive_samples", "leakage_audit_passed", "readiness")}, indent=1, default=str))


def audit(T, ev, W, C, L, wid, N=600):
    rng = np.random.default_rng(42); P = T[T.fire_count > 0]
    idx = np.concatenate([rng.choice(P.index, min(N // 2, len(P)), replace=False), rng.choice(T.index, N - min(N // 2, len(P)), replace=False)])
    S_ = T.loc[idx]; by = ev.groupby("grid_id"); lag = pd.Timedelta(days=POWER_AVAILABILITY_LAG_DAYS)
    Wi = W.set_index(["power_lat", "power_lon", "date"]).sort_index(); Ci = C.groupby("grid_id")
    m = {k: 0 for k in ("fire_history", "same_day_target", "weather_lag", "weather_window", "soil_lag", "ndvi_future", "rolling_future")}
    for r in S_.itertuples():
        e = by.get_group(r.grid_id) if r.grid_id in by.groups else ev.iloc[0:0]
        for k in (1, 7, 30):  # brute-force recount from raw processed detections (min_periods: only where window fully inside series)
            v = getattr(r, f"fires_previous_{k}d")
            if not pd.isna(v) and v != ((e.date < r.date) & (e.date >= r.date - pd.Timedelta(days=k))).sum(): m["fire_history"] += 1
        if r.fire_count != (e.date == r.date).sum(): m["same_day_target"] += 1  # target recounted from raw; history windows above exclude D
        if not pd.isna(r.t2m_max):
            if r.weather_observation_date > r.date - lag: m["weather_lag"] += 1
            obs = Wi.loc[(r.power_lat, r.power_lon)]
            win = obs.loc[r.date - lag - pd.Timedelta(days=6): r.date - lag]
            if obs.loc[r.date - lag].T2M_MAX != r.t2m_max or not np.isclose(win.T2M_MAX.mean(), r.t2m_max_7d_mean, equal_nan=True): m["weather_window"] += 1
            if win.index.max() > r.date - lag: m["rolling_future"] += 1
        if not pd.isna(r.soil_moisture_current):
            obs = Wi.loc[(r.power_lat, r.power_lon)]
            if not np.isclose(obs.loc[r.date - lag].GWETROOT, r.soil_moisture_current): m["soil_lag"] += 1
        if not pd.isna(r.ndvi_available_date):
            if r.ndvi_available_date > r.date: m["ndvi_future"] += 1
            c = Ci.get_group(r.grid_id); c = c[c.data_available_date <= r.date]
            if c.empty or not np.isclose(c.iloc[-1].ndvi, r.ndvi_current, equal_nan=True): m["ndvi_future"] += 1
    # static/annual features constant where they must be
    lc_var = int(T.groupby(["grid_id", "land_cover_year"]).land_cover_code.nunique(dropna=False).gt(1).sum())
    terr_var = int(T.groupby("grid_id").elevation_m.nunique(dropna=False).gt(1).sum())
    out = {"rows_checked": len(S_), "positive_rows_in_sample": int((S_.fire_count > 0).sum()), "mismatches": m,
           "land_cover_varies_within_cell_year": lc_var, "terrain_varies_within_cell": terr_var}
    out["passed"] = sum(m.values()) == 0 and lc_var == 0 and terr_var == 0
    return out


def quality(T, raw, ev, wid, checks, A):
    cnt = T.fire_observation_valid.value_counts().to_dict(); tot = len(T)
    cats = {c: {"square_days": int(cnt.get(c, 0)), "pct": round(100 * cnt.get(c, 0) / tot, 3)} for c in ("positive", "valid_negative_candidate", "insufficient_observation", "missing_observation")}
    P = T[T.fire_observation_valid == "positive"]
    feats = ["t2m_max", "rh2m", "ws2m", "precip_7d_sum", "soil_moisture_current", "ndvi_current", "land_cover_class", "elevation_m", "slope_deg_1km", "fires_previous_7d"]
    sparse = len(P) < 1000 or P.date.nunique() < 300
    obs_status = "BLOCKED" if cats["valid_negative_candidate"]["square_days"] == 0 else "PARTIAL"
    lc_status = "READY" if (T.land_cover_temporal_type == "year_matched").mean() > 0.9 else "STATIC-LIMITATION"
    adm2 = "AVAILABLE" if A.admin2.notna().all() else ("PARTIAL" if A.admin2.notna().any() else "UNAVAILABLE")
    warnings = [
        "Pilot window only (30 x 30 km); does not represent the full admin1 region.",
        "No valid negatives: per-cell VIIRS observation-quality (cloud/clear-land fire mask, VNP14IMG) is not yet ingested; no-hotspot days are 'insufficient_observation'.",
        f"Land cover for 2026 dates uses the 2025 annual map (prior_year_proxy); 2020-2025 are year-matched. Land cover is a single 10 m centroid pixel per 1 km cell.",
        "NASA POWER cells are ~55 x 70 km: all 1 km cells inside one POWER cell share its value (no resampling).",
    ]
    if sparse: warnings.append("Fire-event sample is currently too sparse for reliable independent model training/evaluation in this pilot area.")
    return {
        "version": "v2_blocker_resolution", "window_id": wid, **{k: WINDOWS[wid][k] for k in ("country", "country_code", "admin1")},
        **{k: v for k, v in SCOPE.items()}, "bbox": bbox(WINDOWS[wid]), "date_range": [str(START), str(END)], "daily_rows": tot,
        "observation_validity": cats,
        "observation_validity_rule": "positive = >=1 VIIRS S-NPP (FIRMS SP archive to 2026-06-30, NRT after) detection with confidence nominal/high in the cell on the UTC date; "
                                     "valid_negative_candidate = no detection AND per-cell evidence of a usable clear observation (requires VIIRS fire-mask product; none ingested -> 0 rows); "
                                     "insufficient_observation = no detection, FIRMS data present for the date, observation quality unknown; "
                                     "missing_observation = FIRMS request failed or date outside product availability (FIRMS data_availability API). Cloudiness from weather is NOT used.",
        "positive_samples": {"raw_detections": len(raw), "qualifying_detections_in_window": len(ev), "positive_square_days": len(P),
                             "positive_dates": int(P.date.nunique()), "positive_grid_cells": int(P.grid_id.nunique())},
        "weather_availability_rule": f"POWER_AVAILABILITY_LAG_DAYS = {POWER_AVAILABILITY_LAG_DAYS} (conservative; exact historical publication dates are not published per record). "
                                     "For prediction date D, weather and soil-moisture features use observation_date = D - lag; rolling windows end at D - lag. Physical values unchanged.",
        "land_cover": {"status": lc_status, "source": "Esri/Impact Observatory Sentinel-2 10 m annual LULC", "years_used": LC_YEARS,
                       "year_matched_pct": round(100 * (T.land_cover_temporal_type == "year_matched").mean(), 2), "2026_rule": "2025 map, land_cover_temporal_type = prior_year_proxy"},
        "admin2": {"status": adm2, "source": A.admin2_source.iloc[0], "unit_type": A.admin2_unit_type.iloc[0], "rule": A.admin2_assignment_rule.iloc[0],
                   "cells_assigned": int(A.admin2.notna().sum()), "cells_crossing_boundaries": int((A.admin2_units_intersecting > 1).sum()),
                   "units": A.admin2.value_counts().to_dict()},
        "missingness_pct": {c: round(100 * T[c].isna().mean(), 2) for c in feats},
        "duplicate_rows": int(T.duplicated(["grid_id", "date"]).sum()),
        "leakage_audit": checks, "leakage_audit_passed": checks["passed"],
        "status": {"pipeline_execution": "PASS", "observation_validity": obs_status, "weather_availability": "READY", "land_cover_temporal": lc_status,
                   "admin2": adm2, "spatial_coverage": "PILOT", "leakage_audit": "PASS" if checks["passed"] else "FAIL"},
        "readiness": "not model-ready" if obs_status == "BLOCKED" or not checks["passed"] else ("conditionally model-ready" if sparse else "model-ready"),
        "warnings": warnings, "model_trained": False,
    }


if __name__ == "__main__":
    st = sys.argv[1]; ws = [sys.argv[2]] if len(sys.argv) > 2 else list(WINDOWS)
    for w in ws: globals()[f"stage_{st}"](w)
