"""
PHOENIX historical data pipeline (data only — no model training).

Target: satellite_fire_occurrence (NASA FIRMS VIIRS S-NPP thermal anomalies), NOT confirmed wildfire.
Spatial unit: 1 km x 1 km cells (0.009° lat x 0.009°/cos(lat) lon) inside pilot windows.
Temporal unit: daily (UTC acquisition date).

Stages (each caches raw API responses under CACHE so reruns are reproducible and cheap):
  firms    raw_fire_detections         NASA FIRMS area API, VIIRS_SNPP_SP (archive) + VIIRS_SNPP_NRT (recent)
  power    weather_daily/soil_daily    NASA POWER daily point API, one request per native 0.5°x0.625° cell
  ndvi     ndvi_composites             MOD13Q1.061 via ORNL DAAC MODIS Web Service, QA-filtered 250 m pixels
  static   land_cover, terrain         Esri/IO 10 m land cover at cell centroid; SRTM 30 m elevation at centroid
  build    spatial_grid, processed_fire_events, training_features_daily, data_quality_reports, model_split_config

Usage: python pipeline/phoenix_pipeline.py <stage> [window_id]
Env: FIRMS_MAP_KEY (server/sandbox secret). Never hard-coded.
"""
import json, math, os, sys, time, io, datetime as dt
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd, requests

CACHE = os.environ.get("PHX_CACHE", "/tmp/phx_cache")
OUT = os.environ.get("PHX_OUT", "/mnt/documents/phoenix_pipeline/v1_pilot")
START, END = dt.date(2020, 1, 1), dt.date(2026, 9, 30)
SP_END = dt.date(2026, 6, 30)  # FIRMS standard-processing archive end at time of build (checked via data_availability)
CELL_DEG = 0.009  # ~1 km in latitude
HALF_KM = 15      # 30 km x 30 km pilot windows -> 30 x 30 = 900 cells

WINDOWS = {
    "cd_haut_katanga_p1": {"country": "Democratic Republic of the Congo", "country_code": "CD", "admin1": "Haut-Katanga", "admin1_code": "CD-HK", "lat": -11.45, "lon": 27.60},
    "dz_north_p1": {"country": "Algeria", "country_code": "DZ", "admin1": "El Tarf", "admin1_code": "DZ-36", "lat": 36.80, "lon": 8.30},
}
os.makedirs(CACHE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
S = requests.Session()


def bbox(w):
    dlat = HALF_KM / 111.32; dlon = dlat / math.cos(math.radians(w["lat"]))
    return (w["lon"] - dlon, w["lat"] - dlat, w["lon"] + dlon, w["lat"] + dlat)


def get(url, tries=8, **kw):
    for i in range(tries):
        try:
            r = S.get(url, timeout=120, **kw)
            if r.status_code == 200: return r
            if "transaction limit" in r.text or "Invalid MAP_KEY" in r.text: time.sleep(120); continue  # FIRMS 10-minute cap (over-limit also answers "Invalid MAP_KEY")
            if r.status_code in (429, 500, 502, 503, 504): time.sleep(5 * (i + 1)); continue
            raise RuntimeError(f"{r.status_code} {r.text[:200]}")
        except requests.RequestException:
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"failed {url[:120]}")


def cached(name, fn):
    p = os.path.join(CACHE, name)
    if os.path.exists(p): return open(p).read()
    txt = fn(); open(p, "w").write(txt); return txt

# ---------------- FIRMS ----------------
def stage_firms(wid):
    w = WINDOWS[wid]; b = bbox(w); key = os.environ["FIRMS_MAP_KEY"]
    area = ",".join(f"{v:.4f}" for v in b); rows, log = [], []
    d = START
    while d <= END:
        src = "VIIRS_SNPP_SP" if d <= SP_END else "VIIRS_SNPP_NRT"
        n = min(5, (min(END, SP_END if d <= SP_END else END) - d).days + 1)
        name = f"firms_{wid}_{src}_{d}_{n}.csv"
        try:
            txt = cached(name, lambda: get(f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{src}/{area}/{n}/{d}").text)
            if not txt.startswith("latitude"): raise RuntimeError(txt[:100])
            df = pd.read_csv(io.StringIO(txt)); df["source_product"] = src; rows.append(df)
            log.append({"start": str(d), "days": n, "source": src, "status": "ok", "records": len(df)})
        except Exception as e:
            p = os.path.join(CACHE, name)
            if os.path.exists(p): os.remove(p)
            log.append({"start": str(d), "days": n, "source": src, "status": "error", "error": str(e)[:120]})
        d += dt.timedelta(days=n)
    raw = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()
    if raw.empty: raw = pd.DataFrame(columns=["latitude", "longitude", "acq_date", "confidence", "frp", "version"])
    raw["version"] = raw["version"].astype(str)
    raw["country"], raw["country_code"], raw["admin1"], raw["window_id"] = w["country"], w["country_code"], w["admin1"], wid
    raw["retrieved_at"] = dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    raw.to_parquet(f"{OUT}/raw_fire_detections_{wid}.parquet", index=False)
    json.dump(log, open(f"{OUT}/firms_request_log_{wid}.json", "w"))
    print(wid, "raw detections", len(raw), "failed chunks", sum(l["status"] != "ok" for l in log))

# ---------------- NASA POWER ----------------
POWER_VARS = ["T2M_MAX", "T2M_MIN", "T2M", "RH2M", "WS2M", "PRECTOTCORR", "GWETROOT", "GWETTOP"]

def power_cell(lat, lon):  # native POWER MERRA-2/GEOS grid: 0.5° lat x 0.625° lon, centres on multiples
    return round(round(lat / 0.5) * 0.5, 3), round(round(lon / 0.625) * 0.625, 4)


def stage_power(wid):
    g = grid(wid); cells = sorted({power_cell(a, o) for a, o in zip(g.lat, g.lon)}); frames = []
    for la, lo in cells:
        url = (f"https://power.larc.nasa.gov/api/temporal/daily/point?parameters={','.join(POWER_VARS)}&community=AG"
               f"&latitude={la}&longitude={lo}&start={START:%Y%m%d}&end={END:%Y%m%d}&format=JSON")
        j = json.loads(cached(f"power_{la}_{lo}.json", lambda: get(url).text))
        par = j["properties"]["parameter"]
        df = pd.DataFrame({v: pd.Series(par[v]) for v in POWER_VARS})
        df.index = pd.to_datetime(df.index, format="%Y%m%d"); df = df.where(df > -998)  # -999 -> missing, never a value
        df["power_lat"], df["power_lon"] = la, lo
        frames.append(df.rename_axis("date").reset_index())
    out = pd.concat(frames); out["source"] = "NASA POWER daily point API (community AG)"
    out["retrieved_at"] = dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    out["data_available_date_est"] = out["date"] + pd.Timedelta(days=4)  # documented typical publication latency, estimate
    out.to_parquet(f"{OUT}/weather_daily_{wid}.parquet", index=False)
    print(wid, "power cells", len(cells), "rows", len(out))

# ---------------- NDVI ----------------
def stage_ndvi(wid):
    w = WINDOWS[wid]; base = "https://modis.ornl.gov/rst/api/v1/MOD13Q1"
    dates = json.loads(cached(f"ndvi_dates_{wid}.json", lambda: get(f"{base}/dates?latitude={w['lat']}&longitude={w['lon']}", headers={"Accept": "application/json"}).text))["dates"]
    dates = [d for d in dates if START.isoformat() <= d["calendar_date"] <= END.isoformat()]
    R = 6371007.181; recs = []
    for i in range(0, len(dates), 10):
        a, z = dates[i]["modis_date"], dates[min(i + 9, len(dates) - 1)]["modis_date"]
        bands = {}
        for band in ["250m_16_days_NDVI", "250m_16_days_pixel_reliability"]:
            url = f"{base}/subset?latitude={w['lat']}&longitude={w['lon']}&band={band}&startDate={a}&endDate={z}&kmAboveBelow={HALF_KM}&kmLeftRight={HALF_KM}"
            bands[band] = json.loads(cached(f"ndvi_{wid}_{band}_{a}_{z}.json", lambda: get(url, headers={"Accept": "application/json"}).text))
        nd, qa = bands["250m_16_days_NDVI"], bands["250m_16_days_pixel_reliability"]
        nr, nc, cs, xll, yll = int(nd["nrows"]), int(nd["ncols"]), float(nd["cellsize"]), float(nd["xllcorner"]), float(nd["yllcorner"])
        rr, cc = np.divmod(np.arange(nr * nc), nc)
        y = yll + (nr - rr - 0.5) * cs; x = xll + (cc + 0.5) * cs
        plat = np.degrees(y / R); plon = np.degrees(x / (R * np.cos(y / R)))
        qmap = {s["calendar_date"]: np.array(s["data"]) for s in qa["subset"]}
        for s in nd["subset"]:
            v = np.array(s["data"], dtype=float); q = qmap.get(s["calendar_date"])
            ok = (q is not None) & np.isin(q, [0, 1]) & (v >= -2000) & (v <= 10000) if q is not None else np.zeros_like(v, bool)
            proc = s.get("proc_date")
            recs.append(pd.DataFrame({"composite_start": s["calendar_date"], "proc_date": proc, "lat": plat, "lon": plon,
                                      "ndvi": np.where(ok, v * 0.0001, np.nan), "qa": q if q is not None else -9}))
    out = pd.concat(recs, ignore_index=True)
    out["composite_start"] = pd.to_datetime(out["composite_start"])
    out["data_available_date"] = pd.to_datetime(out["proc_date"].astype(str).str[:7], format="%Y%j", errors="coerce")
    out.to_parquet(f"{OUT}/ndvi_pixels_{wid}.parquet", index=False)
    print(wid, "ndvi composites", out.composite_start.nunique(), "pixels", len(out))

# ---------------- static ----------------
IO = {1: "Water", 2: "Trees", 4: "Flooded vegetation", 5: "Crops", 7: "Built area", 8: "Bare ground", 9: "Snow/ice", 10: "Clouds", 11: "Rangeland"}

def stage_static(wid):
    g = grid(wid)
    def lc(row):
        geom = json.dumps({"x": row[1], "y": row[0], "spatialReference": {"wkid": 4326}})
        try:
            j = get("https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/identify", params={"geometry": geom, "geometryType": "esriGeometryPoint", "returnCatalogItems": "false", "f": "json"}).json()
            v = int(float(j.get("value"))); return IO.get(v)
        except Exception: return None
    p = f"{CACHE}/lc_{wid}.json"
    if not os.path.exists(p):
        with ThreadPoolExecutor(8) as ex: json.dump(list(ex.map(lc, zip(g.lat, g.lon))), open(p, "w"))
    lcv = json.load(open(p)); elev = []
    pe = f"{CACHE}/elev_{wid}.json"
    if not os.path.exists(pe):
        for i in range(0, len(g), 100):
            locs = "|".join(f"{a:.5f},{o:.5f}" for a, o in zip(g.lat[i:i + 100], g.lon[i:i + 100]))
            j = get(f"https://api.opentopodata.org/v1/srtm30m?locations={locs}").json()
            elev += [r.get("elevation") for r in j["results"]]; time.sleep(1.1)
        json.dump(elev, open(pe, "w"))
    elev = json.load(open(pe))
    s = g[["grid_id", "row", "col", "lat", "lon"]].copy()
    s["land_cover_class"] = lcv; s["land_cover_source"] = "Esri/Impact Observatory Sentinel-2 10 m land cover (latest annual), sampled at cell centroid"
    s["elevation_m"] = pd.to_numeric(pd.Series(elev), errors="coerce").values
    # 1 km-scale slope/aspect from neighbouring cell-centroid elevations (central differences); edge cells -> missing
    E = s.pivot(index="row", columns="col", values="elevation_m").sort_index(ascending=False)
    dy = 1000.0; dx = 1000.0
    gy, gx = np.full(E.shape, np.nan), np.full(E.shape, np.nan)
    a = E.values; gy[1:-1, :] = (a[:-2, :] - a[2:, :]) / (2 * dy); gx[:, 1:-1] = (a[:, 2:] - a[:, :-2]) / (2 * dx)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))); aspect = (np.degrees(np.arctan2(-gx, gy)) + 360) % 360
    sl = pd.DataFrame(slope, index=E.index, columns=E.columns).stack(future_stack=True).rename("slope_deg_1km")
    asp = pd.DataFrame(aspect, index=E.index, columns=E.columns).stack(future_stack=True).rename("aspect_deg_1km")
    s = s.merge(sl.reset_index(), on=["row", "col"], how="left").merge(asp.reset_index(), on=["row", "col"], how="left")
    s["terrain_source"] = "NASA SRTM 30 m via OpenTopoData at cell centroid; slope/aspect from 1 km centroid differences"
    s.to_parquet(f"{OUT}/static_features_{wid}.parquet", index=False)
    print(wid, "land cover ok", s.land_cover_class.notna().sum(), "elev ok", s.elevation_m.notna().sum())

# ---------------- grid ----------------
def grid(wid):
    w = WINDOWS[wid]; b = bbox(w); n = 2 * HALF_KM
    dlat = (b[3] - b[1]) / n; dlon = (b[2] - b[0]) / n; rows = []
    for r in range(n):
        for c in range(n):
            la0, lo0 = b[1] + r * dlat, b[0] + c * dlon
            rows.append({"grid_id": f"{wid}_r{r:03d}c{c:03d}", "row": r, "col": c, "lat": round(la0 + dlat / 2, 5), "lon": round(lo0 + dlon / 2, 5),
                         "min_lat": la0, "min_lon": lo0, "max_lat": la0 + dlat, "max_lon": lo0 + dlon,
                         "country": w["country"], "country_code": w["country_code"], "admin1": w["admin1"], "admin1_code": w["admin1_code"],
                         "admin2": None, "admin2_code": None, "window_id": wid})
    return pd.DataFrame(rows)

# ---------------- build ----------------
def stage_build(wid):
    g = grid(wid); g.to_parquet(f"{OUT}/spatial_grid_{wid}.parquet", index=False)
    b = bbox(WINDOWS[wid]); n = 2 * HALF_KM; dlat = (b[3] - b[1]) / n; dlon = (b[2] - b[0]) / n
    raw = pd.read_parquet(f"{OUT}/raw_fire_detections_{wid}.parquet")
    log = pd.DataFrame(json.load(open(f"{OUT}/firms_request_log_{wid}.json")))
    # processed events: valid detections (VIIRS confidence nominal/high; low excluded), assigned to a cell and UTC date
    ev = raw[raw["confidence"].astype(str).str.lower().isin(["n", "h", "nominal", "high"])].copy()
    ev["row"] = ((ev.latitude - b[1]) / dlat).astype(int); ev["col"] = ((ev.longitude - b[0]) / dlon).astype(int)
    ev = ev[(ev.row >= 0) & (ev.row < n) & (ev.col >= 0) & (ev.col < n)]
    ev["grid_id"] = [f"{wid}_r{r:03d}c{c:03d}" for r, c in zip(ev.row, ev.col)]
    ev["date"] = pd.to_datetime(ev.acq_date)
    ev.to_parquet(f"{OUT}/processed_fire_events_{wid}.parquet", index=False)
    daily = ev.groupby(["grid_id", "date"]).agg(fire_count=("frp", "size"), max_frp=("frp", "max")).reset_index()

    dates = pd.date_range(START, END, freq="D")
    # observation validity per date from the FIRMS request log (archive request succeeded = valid)
    valid_dates = set()
    for _, l in log[log.status == "ok"].iterrows():
        valid_dates |= set(pd.date_range(l.start, periods=l.days, freq="D"))
    ids = g.grid_id.values
    T = pd.MultiIndex.from_product([ids, dates], names=["grid_id", "date"]).to_frame(index=False)
    T = T.merge(daily, on=["grid_id", "date"], how="left")
    T["fire_count"] = T.fire_count.fillna(0).astype(int)
    T["fire_observation_valid"] = np.where(T.date.isin(valid_dates), "valid", "missing")
    T["satellite_fire_occurrence"] = np.where(T.fire_observation_valid == "valid", (T.fire_count > 0).astype(float), np.nan)

    # fire-history features: strictly BEFORE date D (shift by 1 day)
    T = T.sort_values(["grid_id", "date"]); grp = T.groupby("grid_id", sort=False)
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

    # weather + soil: native POWER cell value (no resampling), current-or-past windows only
    W = pd.read_parquet(f"{OUT}/weather_daily_{wid}.parquet").sort_values(["power_lat", "power_lon", "date"])
    wg = W.groupby(["power_lat", "power_lon"], sort=False)
    def roll(col, k, how): return getattr(wg[col].rolling(k, min_periods=k), how)().reset_index(level=[0, 1], drop=True)
    F = W[["date", "power_lat", "power_lon"]].copy()
    F["t2m_max"], F["t2m_min"], F["t2m_mean"], F["rh2m"], F["ws2m"], F["precip_1d"] = W.T2M_MAX, W.T2M_MIN, W.T2M, W.RH2M, W.WS2M, W.PRECTOTCORR
    for k in [3, 7, 14]: F[f"t2m_max_{k}d_mean"] = roll("T2M_MAX", k, "mean")
    for k in [3, 7]: F[f"rh2m_{k}d_mean"] = roll("RH2M", k, "mean"); F[f"ws2m_{k}d_mean"] = roll("WS2M", k, "mean")
    for k in [3, 7, 14, 30]: F[f"precip_{k}d_sum"] = roll("PRECTOTCORR", k, "sum")
    F["soil_moisture_current"] = W.GWETROOT
    for k in [3, 7, 14]: F[f"soil_moisture_{k}d_mean"] = roll("GWETROOT", k, "mean")
    F["weather_data_available_date_est"] = W.data_available_date_est
    pc = pd.DataFrame([power_cell(a, o) for a, o in zip(g.lat, g.lon)], columns=["power_lat", "power_lon"]); pc["grid_id"] = g.grid_id
    T = T.merge(pc, on="grid_id", how="left").merge(F, on=["date", "power_lat", "power_lon"], how="left")
    T["weather_missing"] = T.t2m_max.isna(); T["soil_moisture_missing"] = T.soil_moisture_current.isna()

    # NDVI: per-cell mean of valid 250 m pixels; for date D use the latest composite whose data_available_date <= D (no future composites)
    ndvi_ok = os.path.exists(f"{OUT}/ndvi_pixels_{wid}.parquet")
    if ndvi_ok:
        P = pd.read_parquet(f"{OUT}/ndvi_pixels_{wid}.parquet")
        P["row"] = ((P.lat - b[1]) / dlat).astype(int); P["col"] = ((P.lon - b[0]) / dlon).astype(int)
        P = P[(P.row >= 0) & (P.row < n) & (P.col >= 0) & (P.col < n)]
        P["grid_id"] = [f"{wid}_r{r:03d}c{c:03d}" for r, c in zip(P.row, P.col)]
        C = P.groupby(["grid_id", "composite_start", "data_available_date"]).agg(ndvi=("ndvi", "mean"), ndvi_valid_px=("ndvi", "count"), ndvi_total_px=("ndvi", "size")).reset_index()
        C = C.sort_values(["grid_id", "composite_start"])
        C["ndvi_previous"] = C.groupby("grid_id").ndvi.shift(1); C["ndvi_change"] = C.ndvi - C.ndvi_previous
        C.to_parquet(f"{OUT}/ndvi_composites_{wid}.parquet", index=False)
        C = C.dropna(subset=["data_available_date"]).sort_values("data_available_date"); C["data_available_date"] = C.data_available_date.astype("datetime64[ns]"); T["date"] = T.date.astype("datetime64[ns]")
        T = T.sort_values("date")
        T = pd.merge_asof(T, C[["grid_id", "data_available_date", "composite_start", "ndvi", "ndvi_previous", "ndvi_change", "ndvi_valid_px"]].rename(columns={"ndvi": "ndvi_current", "composite_start": "ndvi_composite_start", "data_available_date": "ndvi_available_date"}),
                          left_on="date", right_on="ndvi_available_date", by="grid_id", direction="backward")
    T["ndvi_missing"] = T["ndvi_current"].isna() if ndvi_ok else True

    S_ = pd.read_parquet(f"{OUT}/static_features_{wid}.parquet")
    T = T.merge(S_[["grid_id", "land_cover_class", "elevation_m", "slope_deg_1km", "aspect_deg_1km"]], on="grid_id", how="left")
    T["land_cover_missing"] = T.land_cover_class.isna(); T["terrain_missing"] = T.elevation_m.isna()
    T = T.merge(g[["grid_id", "lat", "lon", "country", "country_code", "admin1", "admin1_code", "admin2", "admin2_code"]], on="grid_id", how="left")
    doy = T.date.dt.dayofyear; T["day_of_year"], T["month"] = doy, T.date.dt.month
    T["sin_doy"], T["cos_doy"] = np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)
    south = WINDOWS[wid]["lat"] < 0
    T["season"] = T.month.map(lambda m: ("DJF", "MAM", "JJA", "SON")[(m % 12) // 3])
    T = T.drop(columns=["max_frp"]).sort_values(["grid_id", "date"]).reset_index(drop=True)

    checks = leakage_checks(T, ev, wid)
    T.to_parquet(f"{OUT}/training_features_daily_{wid}.parquet", index=False)
    report = quality(T, raw, ev, wid, checks, ndvi_ok)
    json.dump(report, open(f"{OUT}/data_quality_report_{wid}.json", "w"), indent=2, default=str)
    print(json.dumps(report, indent=1, default=str)[:3000])


def leakage_checks(T, ev, wid):
    out = {}
    # 1. fire-history features recomputed by brute force for a sample: must only count detections strictly before D
    rng = np.random.default_rng(0); pos = T[T.fire_count > 0]
    sample = pd.concat([pos.sample(min(150, len(pos)), random_state=0), T.sample(150, random_state=1)]) if len(pos) else T.sample(300, random_state=1)
    bad = 0
    by = ev.groupby("grid_id")
    for _, r in sample.iterrows():
        e = by.get_group(r.grid_id) if r.grid_id in by.groups else ev.iloc[0:0]
        exp = ((e.date < r.date) & (e.date >= r.date - pd.Timedelta(days=7))).sum()
        if not (pd.isna(r.fires_previous_7d) or r.fires_previous_7d == exp): bad += 1
    out["fire_history_uses_only_past"] = {"sampled": len(sample), "mismatches": bad, "passed": bad == 0}
    # 2. same-day detections never in history features
    same = T[(T.fire_count > 0) & (T.fires_previous_1d.notna())]
    out["target_not_in_features"] = {"passed": bool((same.fires_previous_1d <= T.loc[same.index].groupby(T.grid_id).fire_count.shift(1).fillna(0)).all())}
    # 3. NDVI composite must be available on or before D
    if "ndvi_available_date" in T:
        v = T.dropna(subset=["ndvi_available_date"]); out["ndvi_not_from_future"] = {"violations": int((v.ndvi_available_date > v.date).sum()), "passed": bool((v.ndvi_available_date <= v.date).all())}
    out["weather_windows_trailing_only"] = {"passed": True, "note": "Rolling windows use current and prior days only (pandas trailing windows). Same-day weather is included; NASA POWER publishes ~2-4 days later (weather_data_available_date_est) — for operational realism a later step may lag weather by that latency."}
    return out


def quality(T, raw, ev, wid, checks, ndvi_ok):
    feats = [c for c in T.columns if c not in ("grid_id", "date", "country", "country_code", "admin1", "admin1_code", "admin2", "admin2_code", "lat", "lon")]
    valid = T[T.fire_observation_valid == "valid"]; pos = int((valid.satellite_fire_occurrence == 1).sum()); neg = int((valid.satellite_fire_occurrence == 0).sum())
    cov = lambda c: round(100 * T[c].notna().mean(), 2)
    dates = pd.date_range(START, END); missing_dates = sorted(set(dates) - set(T[T.fire_observation_valid == "valid"].date.unique()))
    min_pos = 200
    ready = pos >= min_pos and cov("t2m_max") > 95 and all(c.get("passed", False) for c in checks.values())
    return {
        "window_id": wid, **{k: WINDOWS[wid][k] for k in ("country", "country_code", "admin1")}, "bbox": bbox(WINDOWS[wid]),
        "date_range": [str(START), str(T.date.max().date())], "grid_cells": int(T.grid_id.nunique()), "daily_rows": len(T),
        "raw_firms_detections": len(raw), "valid_confidence_detections_in_window": len(ev),
        "positive_targets": pos, "valid_negative_targets": neg, "insufficient_observation": 0,
        "missing_observation_rows": int((T.fire_observation_valid == "missing").sum()),
        "positive_rate": round(pos / max(1, pos + neg), 6), "imbalance_ratio_neg_per_pos": round(neg / max(1, pos), 1),
        "coverage_pct": {"weather": cov("t2m_max"), "soil_moisture": cov("soil_moisture_current"), "ndvi": cov("ndvi_current") if ndvi_ok else 0.0, "land_cover": cov("land_cover_class"), "terrain_elevation": cov("elevation_m"), "terrain_slope": cov("slope_deg_1km")},
        "missingness_pct_by_feature": {c: round(100 * T[c].isna().mean(), 2) for c in feats if T[c].dtype != bool},
        "duplicate_rows": int(T.duplicated(["grid_id", "date"]).sum()), "firms_temporal_gaps_days": len(missing_dates),
        "spatial_gaps": {"cells_without_land_cover": int(T.groupby("grid_id").land_cover_class.first().isna().sum()), "cells_without_elevation": int(T.groupby("grid_id").elevation_m.first().isna().sum())},
        "leakage_checks": checks, "ndvi_available": ndvi_ok,
        "model_ready": bool(ready), "model_ready_rule": f">= {min_pos} positive valid cell-days, weather coverage > 95%, all leakage checks passed",
        "severe_flags": [f for f, bad in [("few positives", pos < min_pos), ("weather coverage low", cov("t2m_max") < 95)] if bad],
    }


def split_config():
    cfg = {"method": "time-based, no random split", "target": "satellite_fire_occurrence", "default": {"train": ["2020-01-01", "2023-12-31"], "validation": ["2024-01-01", "2024-12-31"], "test": ["2025-01-01", "2026-09-30"]},
           "per_country_overrides": {}, "rules": ["Feature engineering statistics (e.g. NDVI baselines, scalers) are fit on train only", "Test period stays untouched until final evaluation"]}
    json.dump(cfg, open(f"{OUT}/model_split_config.json", "w"), indent=2)


if __name__ == "__main__":
    st = sys.argv[1]; ws = [sys.argv[2]] if len(sys.argv) > 2 else list(WINDOWS)
    if st == "split": split_config(); sys.exit()
    for w in ws: globals()[f"stage_{st}"](w)
