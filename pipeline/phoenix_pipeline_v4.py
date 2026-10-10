"""
PHOENIX historical data pipeline v4 — satellite observation validity (data engineering only, NO model training).

Adds per-cell/day satellite observability to the v3 tables for six pilot areas, using NASA VNP14A1 v002
(VIIRS/NPP Thermal Anomalies/Fire Daily L3 Global 1 km SIN Grid, LP DAAC). VNP14A1 is the official daily
gridded aggregate of the VNP14IMG 375 m swath fire product: its FireMask holds the same algorithm's
per-pixel classes (missing / not processed / water / cloud / non-fire land / unknown / fire L/N/H).
VNP14IMG swaths themselves carry no per-pixel geolocation (it needs VNP03IMG, ~200 MB per 6-min granule,
~30,000 granules for this scope), so VNP14A1 is the authoritative way to place those classes on the ground.

Target observability rule (from the FireMask class semantics, no tuned threshold):
  per PHOENIX 1 km cell/day, area fractions of intersecting VNP14A1 pixels (10x10 sub-point sampling) per class.
  observed = classes 3 (non-fire water), 5 (non-fire land), 7/8/9 (fire)  -> the algorithm looked at the surface
  obscured = class 4 (cloud); invalid = 0, 1, 2, 6
  satellite_observation_valid = observation_coverage_fraction == 1.0 (every part of the cell observed; any cloud or
  invalid part could hide a fire). Graded fractions are kept.
  FIRE_DETECTED       = v3 FIRMS qualifying detection (nominal/high) in cell/day (definition unchanged)
  NO_FIRE_CONFIRMED   = no FIRMS detection AND satellite_observation_valid AND no VNP14A1 fire-class pixel (any confidence) touches the cell
                        (a fire pixel overlapping the cell without a FIRMS point inside it is ambiguous -> INSUFFICIENT_OBSERVATION)
  INSUFFICIENT_OBSERVATION = no FIRMS detection AND granule present AND not fully observed
  MISSING             = VNP14A1 granule for the cell's tile/date not available or failed to process
VNP14A1 values are used ONLY to label target observability; they are never predictors.

Usage:
  python pipeline/phoenix_pipeline_v4.py granules [window]   # CMR inventory -> manifest
  python pipeline/phoenix_pipeline_v4.py download [window]   # resumable; keeps window subsets (npz) as raw
  python pipeline/phoenix_pipeline_v4.py build    [window]   # cell/day observation table + v4 training table + audits
  python pipeline/phoenix_pipeline_v4.py report               # combined dataset, country assessment, report, summary
Env: NASA_EARTHDATA_TOKEN (Earthdata bearer token, never hard-coded).
"""
import json, os, sys, math, time, io, datetime as dt, hashlib
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd, requests

BASE = os.environ.get("PHX_BASE", "/mnt/documents/phoenix_pipeline")
V3 = f"{BASE}/v3_africa_expansion"; V2 = f"{BASE}/v2_blocker_resolution"
OUT = f"{BASE}/v4_satellite_observation"; TMP = os.environ.get("PHX_TMP", "/tmp/phx_v4")
RAW = f"{TMP}/subsets"  # per-granule window subsets (working cache); packed per window into OUT/raw_vnp14a1_{wid}.npz
PROC_VERSION = "phoenix_v4.0"
for d in (OUT, RAW, TMP): os.makedirs(d, exist_ok=True)
START, END = dt.date(2020, 1, 1), dt.date(2026, 9, 30); FIRMS_SP_END = dt.date(2026, 6, 30)
R = 6371007.181; T = 1111950.5197665233; PX = T / 1200; X0 = -20015109.354; Y0 = 10007554.677
PRODUCT = {"short_name": "VNP14A1", "version": "002", "concept_id": "C2545314541-LPCLOUD", "provider": "NASA LP DAAC (LPCLOUD)",
           "long_name": "VIIRS/NPP Thermal Anomalies/Fire Daily L3 Global 1km SIN Grid V002", "resolution_m": round(PX, 3),
           "doi": "10.5067/VIIRS/VNP14A1.002", "parent_swath_product": "VNP14IMG v002 (375 m)"}
CLASSES = {0: "missing input data", 1: "not processed (trim)", 2: "not processed (obsolete)", 3: "non-fire water", 4: "cloud",
           5: "non-fire land", 6: "unknown", 7: "fire (low)", 8: "fire (nominal)", 9: "fire (high)"}
OBSERVED, CLOUD, INVALID = [3, 5, 7, 8, 9], [4], [0, 1, 2, 6]
WINDOWS = {  # exact v3/v2 pilot grids; (source dir)
    "mz_zambezia_p1": V3, "cd_haut_katanga_p1": V2, "ao_moxico_p1": V3, "zm_kafue_p1": V3, "ng_kainji_p1": V3, "za_lowveld_p1": V3,
}
S = requests.Session()


def sin_xy(lat, lon):
    lat, lon = np.radians(lat), np.radians(lon); return R * lon * np.cos(lat), R * lat


def grid(wid): return pd.read_parquet(f"{WINDOWS[wid]}/spatial_grid_{wid}.parquet")


def tiles_and_weights(wid, k=10):
    """For each PHOENIX cell, k*k sub-points -> (tile h, v, row, col); weights = area fraction per VNP14A1 pixel."""
    g = grid(wid); recs = []
    f = (np.arange(k) + 0.5) / k
    for ci, r in enumerate(g.itertuples()):
        la = r.min_lat + (r.max_lat - r.min_lat) * f; lo = r.min_lon + (r.max_lon - r.min_lon) * f
        LA, LO = np.meshgrid(la, lo, indexing="ij"); x, y = sin_xy(LA.ravel(), LO.ravel())
        h = ((x - X0) // T).astype(int); v = ((Y0 - y) // T).astype(int)
        col = ((x - (X0 + h * T)) // PX).astype(int); row = (((Y0 - v * T) - y) // PX).astype(int)
        df = pd.DataFrame({"h": h, "v": v, "row": row, "col": col}).value_counts().reset_index(name="n")
        df["cell"] = ci; df["w"] = df.n / (k * k); recs.append(df)
    return g, pd.concat(recs, ignore_index=True)


def bbox(g): return float(g.min_lon.min()), float(g.min_lat.min()), float(g.max_lon.max()), float(g.max_lat.max())


def stage_granules(wid):
    g = grid(wid); b = bbox(g); out, page = [], 1
    while True:
        r = S.get("https://cmr.earthdata.nasa.gov/search/granules.json", params={"concept_id": PRODUCT["concept_id"], "bounding_box": ",".join(map(str, b)),
                  "temporal": f"{START}T00:00:00Z,{END}T23:59:59Z", "page_size": 2000, "page_num": page}, timeout=120).json()["feed"]["entry"]
        for e in r:
            url = next((l["href"] for l in e["links"] if l["href"].startswith("https://data.lpdaac") and l["href"].endswith(".h5")), None)
            t = e["title"].split(".")  # VNP14A1.AYYYYDDD.hHHvVV.002.PRODUCTION
            out.append({"granule": e["title"], "date": str(dt.datetime.strptime(t[1][1:], "%Y%j").date()), "tile": t[2], "version": t[3],
                        "production": t[4], "size_mb": float(e.get("granule_size") or 0), "url": url})
        if len(r) < 2000: break
        page += 1
    M = pd.DataFrame(out).drop_duplicates("granule"); M.to_csv(f"{OUT}/granule_manifest_{wid}.csv", index=False)
    print(wid, "granules", len(M), "tiles", M.tile.unique().tolist(), "dates", M.date.nunique())


def _fetch(args):
    row, tok, need, wid = args
    p = f"{RAW}/{wid}/{row['granule']}.npz"
    if os.path.exists(p): return row["granule"], "cached"
    if not row["url"]: return row["granule"], "no_url"
    tmp = f"{TMP}/{row['granule']}.h5"
    for i in range(6):
        try:
            r = S.get(row["url"], headers={"Authorization": f"Bearer {tok}"}, timeout=180)
            if r.status_code == 200 and r.content[:4] == b"\x89HDF":
                open(tmp, "wb").write(r.content); break
            if r.status_code in (401, 403): return row["granule"], f"auth_{r.status_code}"
        except requests.RequestException: pass
        time.sleep(min(120, 5 * 2 ** i))
    else:
        return row["granule"], "download_failed"
    import h5py
    try:
        with h5py.File(tmp) as f:
            gd = f["HDFEOS/GRIDS/VIIRS_Grid_Daily_Fire/Data Fields"]
            r0, r1, c0, c1 = need
            np.savez_compressed(p, fire_mask=gd["FireMask"][r0:r1, c0:c1], qa=gd["QA"][r0:r1, c0:c1], max_frp=gd["MaxFRP"][r0:r1, c0:c1],
                                r0=r0, c0=c0, tile=row["tile"], production=row["production"])
        return row["granule"], "ok"
    except Exception as e:
        return row["granule"], f"read_failed:{str(e)[:60]}"
    finally:
        if os.path.exists(tmp): os.remove(tmp)


def stage_download(wid):
    tok = os.environ["NASA_EARTHDATA_TOKEN"]; M = pd.read_csv(f"{OUT}/granule_manifest_{wid}.csv")
    _, Wt = tiles_and_weights(wid); need = {}
    for (h, v), d in Wt.groupby(["h", "v"]):
        need[f"h{h:02d}v{v:02d}"] = (int(d.row.min()), int(d.row.max()) + 1, int(d.col.min()), int(d.col.max()) + 1)
    M = M[M.tile.isin(need)]
    os.makedirs(f"{RAW}/{wid}", exist_ok=True); jobs = [(r, tok, need[r["tile"]], wid) for r in M.to_dict("records")]
    logp = f"{OUT}/download_log_{wid}.json"; log = json.load(open(logp)) if os.path.exists(logp) else {}
    with ThreadPoolExecutor(8) as ex:
        for i, (gid, st) in enumerate(ex.map(_fetch, jobs)):
            log[gid] = st
            if i % 500 == 0: json.dump(log, open(logp, "w")); print(wid, i, "/", len(jobs), flush=True)
    json.dump(log, open(logp, "w"))
    print(wid, pd.Series(log).str.split(":").str[0].value_counts().to_dict())


def stage_pack(wid):
    """Pack all per-granule subsets of a window into one raw file in OUT (smallest authoritative raw representation)."""
    M = pd.read_csv(f"{OUT}/granule_manifest_{wid}.csv"); log = json.load(open(f"{OUT}/download_log_{wid}.json"))
    old = f"{OUT}/raw_vnp14a1_subsets/{wid}"; arrs = {}
    for r in M.itertuples():
        if log.get(r.granule) not in ("ok", "cached"): continue
        p = f"{RAW}/{wid}/{r.granule}.npz"
        if not os.path.exists(p) and os.path.exists(f"{old}/{r.granule}.npz"): p = f"{old}/{r.granule}.npz"
        z = np.load(p); arrs[r.granule] = (z["fire_mask"], int(z["r0"]), int(z["c0"]))
    keys = sorted(arrs); tiles = sorted({k.split(".")[2] for k in keys})
    out = {"granules": np.array(keys)}
    for t in tiles:
        ks = [k for k in keys if k.split(".")[2] == t]
        out[f"fire_mask_{t}"] = np.stack([arrs[k][0] for k in ks]); out[f"granules_{t}"] = np.array(ks)
        out[f"r0_{t}"] = arrs[ks[0]][1]; out[f"c0_{t}"] = arrs[ks[0]][2]
    np.savez_compressed(f"{TMP}/raw_{wid}.npz", **out)
    import shutil; shutil.copy(f"{TMP}/raw_{wid}.npz", f"{OUT}/raw_vnp14a1_{wid}.npz")
    print(wid, "packed", len(keys), {t: out[f"fire_mask_{t}"].shape for t in tiles}, flush=True)


def stage_build(wid):
    src = WINDOWS[wid]; g, Wt = tiles_and_weights(wid); M = pd.read_csv(f"{OUT}/granule_manifest_{wid}.csv")
    log = json.load(open(f"{OUT}/download_log_{wid}.json"))
    dates = pd.date_range(START, END, freq="D"); nC = len(g)
    frac = {k: np.full((len(dates), nC), np.nan) for k in ("observed", "cloud", "invalid", "fire_any", "fire_nh")}
    npx = np.zeros(nC, int); npx[:] = Wt.groupby("cell").size().reindex(range(nC)).values
    didx = {d: i for i, d in enumerate(dates.strftime("%Y-%m-%d"))}
    tiles = sorted(Wt.assign(t=[f"h{h:02d}v{v:02d}" for h, v in zip(Wt.h, Wt.v)]).t.unique())
    Wt["tile"] = [f"h{h:02d}v{v:02d}" for h, v in zip(Wt.h, Wt.v)]
    have_tile = {t: np.zeros(len(dates), bool) for t in tiles}
    acc = {k: np.zeros((len(dates), nC)) for k in frac}
    pk = f"{TMP}/raw_{wid}.npz"
    Z = np.load(pk if os.path.exists(pk) else f"{OUT}/raw_vnp14a1_{wid}.npz")
    for t in tiles:
        wt = Wt[Wt.tile == t]; cube = Z[f"fire_mask_{t}"]; r0, c0 = int(Z[f"r0_{t}"]), int(Z[f"c0_{t}"])
        di = np.array([didx.get(str(dt.datetime.strptime(k.split(".")[1][1:], "%Y%j").date()), -1) for k in Z[f"granules_{t}"]])
        V = cube[:, wt.row.values - r0, wt.col.values - c0]
        keep = di >= 0; V, di = V[keep], di[keep]; have_tile[t][di] = True
        A = np.zeros((len(wt), nC)); A[np.arange(len(wt)), wt.cell.values] = wt.w.values
        for k, cl in (("observed", OBSERVED), ("cloud", CLOUD), ("invalid", INVALID), ("fire_any", [7, 8, 9]), ("fire_nh", [8, 9])):
            acc[k][di] += np.isin(V, cl).astype(float) @ A
    # a cell/day is complete only if every tile it touches has a granule that day
    cell_tiles = Wt.groupby("cell").tile.agg(lambda s: sorted(set(s)))
    complete = np.ones((len(dates), nC), bool)
    for c, ts in cell_tiles.items():
        for t in ts: complete[:, c] &= have_tile[t]
    for k in frac: frac[k] = np.where(complete, acc[k], np.nan)
    O = pd.DataFrame({"grid_id": np.tile(g.grid_id.values, len(dates)), "date": np.repeat(dates.values, nC)})
    for k, nm in (("observed", "observation_coverage_fraction"), ("cloud", "cloud_obscured_fraction"), ("invalid", "invalid_fraction"),
                  ("fire_any", "vnp14a1_fire_fraction_any_conf"), ("fire_nh", "vnp14a1_fire_fraction_nominal_high")):
        O[nm] = frac[k].ravel().round(4)
    O["intersecting_pixel_count"] = np.tile(npx, len(dates))
    O["valid_pixel_area_count"] = (O.observation_coverage_fraction * 100).round().astype("Int64")  # of 100 sub-points
    O["cloud_obscured_pixel_area_count"] = (O.cloud_obscured_fraction * 100).round().astype("Int64")
    O["invalid_pixel_area_count"] = (O.invalid_fraction * 100).round().astype("Int64")
    O["satellite_observation_valid"] = (O.observation_coverage_fraction >= 0.9999).where(O.observation_coverage_fraction.notna())
    O["observation_quality"] = np.select([O.observation_coverage_fraction.isna(), O.observation_coverage_fraction >= 0.9999, O.observation_coverage_fraction > 0],
                                         ["missing", "fully_observed", "partially_observed"], "not_observed")
    O.to_parquet(f"{OUT}/cell_day_observation_{wid}.parquet", index=False)

    Tb = pd.read_parquet(f"{src}/training_features_daily_{wid}.parquet")
    Tb = Tb.drop(columns=["satellite_fire_occurrence", "fire_observation_valid", "fire_observation_reason"]).rename(columns={})
    Tb = Tb.merge(O, on=["grid_id", "date"], how="left")
    fire = Tb.fire_count > 0
    Tb["satellite_fire_observation_status"] = np.select(
        [fire, Tb.observation_coverage_fraction.isna(), Tb.satellite_observation_valid.fillna(False).astype(bool) & (Tb.vnp14a1_fire_fraction_any_conf == 0)],
        ["FIRE_DETECTED", "MISSING", "NO_FIRE_CONFIRMED"], "INSUFFICIENT_OBSERVATION")
    Tb["satellite_fire_occurrence"] = Tb.satellite_fire_observation_status.map({"FIRE_DETECTED": 1.0, "NO_FIRE_CONFIRMED": 0.0})
    Tb["firms_product_status"] = np.where(Tb.date.dt.date <= FIRMS_SP_END, "VIIRS_SNPP_SP (standard processing, final)", "VIIRS_SNPP_NRT (near-real-time, not finalized)")
    Tb["observation_source"] = f"{PRODUCT['short_name']}.{PRODUCT['version']} FireMask (LP DAAC), {PROC_VERSION}"
    Tb["observation_rule"] = "valid iff 100% of cell area observed (FireMask 3/5/7/8/9); cloud=4; invalid=0/1/2/6; no-fire needs no FireMask fire pixel touching the cell"
    Tb["season"] = Tb.season; Tb["window_id"] = wid
    checks = consistency(Tb, src, wid); leak = leakage(Tb, src, wid)
    Tb.to_parquet(f"{OUT}/training_features_daily_{wid}.parquet", index=False)
    json.dump({"consistency": checks, "leakage": leak}, open(f"{OUT}/audits_{wid}.json", "w"), indent=2, default=str)
    print(wid, Tb.satellite_fire_observation_status.value_counts().to_dict(), "consistency", checks["passed"], "leakage", leak["passed"])


PREDICTORS = ["fires_previous_1d", "fires_previous_3d", "fires_previous_7d", "fires_previous_14d", "fires_previous_30d", "fire_days_previous_7d", "fire_days_previous_30d",
              "max_previous_frp_7d", "max_previous_frp_30d", "days_since_previous_detection", "t2m_max", "t2m_min", "t2m_mean", "rh2m", "ws2m", "precip_1d",
              "t2m_max_3d_mean", "t2m_max_7d_mean", "t2m_max_14d_mean", "rh2m_3d_mean", "rh2m_7d_mean", "ws2m_3d_mean", "ws2m_7d_mean", "precip_3d_sum", "precip_7d_sum",
              "precip_14d_sum", "precip_30d_sum", "soil_moisture_current", "soil_moisture_3d_mean", "soil_moisture_7d_mean", "soil_moisture_14d_mean", "ndvi_current",
              "ndvi_previous", "ndvi_change", "land_cover_class", "elevation_m", "slope_deg_1km", "aspect_deg_1km", "lat", "lon", "day_of_year", "month", "sin_doy", "cos_doy"]
OBS_ONLY = ["observation_coverage_fraction", "cloud_obscured_fraction", "invalid_fraction", "vnp14a1_fire_fraction_any_conf", "vnp14a1_fire_fraction_nominal_high",
            "satellite_observation_valid", "observation_quality", "intersecting_pixel_count", "valid_pixel_area_count", "cloud_obscured_pixel_area_count", "invalid_pixel_area_count"]


def consistency(Tb, src, wid):
    ev = pd.read_parquet(f"{src}/processed_fire_events_{wid}.parquet"); key = set(zip(ev.grid_id, pd.to_datetime(ev.date)))
    st = Tb.satellite_fire_observation_status; k = list(zip(Tb.grid_id, Tb.date))
    has = np.fromiter((x in key for x in k), bool, len(k))
    a = int(((st == "NO_FIRE_CONFIRMED") & has).sum()); b = int(((st == "FIRE_DETECTED") & ~has).sum())
    c = int(((st == "NO_FIRE_CONFIRMED") & (Tb.vnp14a1_fire_fraction_nominal_high > 0)).sum())
    f = Tb[st == "FIRE_DETECTED"]
    return {"no_fire_confirmed_with_firms_fire": a, "fire_detected_without_firms_record": b, "passed": a == 0 and b == 0,
            "diagnostic_no_fire_confirmed_but_vnp14a1_nominal_high_fire_pixel": c,
            "diagnostic_fire_detected_vnp14a1_fire_class_present_pct": round(100 * (f.vnp14a1_fire_fraction_any_conf > 0).mean(), 2) if len(f) else None,
            "diagnostic_fire_detected_cell_cloud_or_missing_pct": round(100 * (f.observation_coverage_fraction.fillna(0) < 1).mean(), 2) if len(f) else None}


def leakage(Tb, src, wid, N=600):
    v3 = pd.read_parquet(f"{src}/training_features_daily_{wid}.parquet", columns=["grid_id", "date"] + [c for c in PREDICTORS])
    Tb2 = Tb[["grid_id", "date"] + PREDICTORS].merge(v3, on=["grid_id", "date"], suffixes=("", "_v3"))
    changed = {c: int((~((Tb2[c] == Tb2[f"{c}_v3"]) | (Tb2[c].isna() & Tb2[f"{c}_v3"].isna()))).sum()) for c in PREDICTORS}
    rep = json.load(open(f"{src}/data_quality_report_{wid}.json"))["leakage_audit"]
    # fresh brute-force sample on v4 rows
    rng = np.random.default_rng(7); idx = rng.choice(len(Tb), N, replace=False); S_ = Tb.iloc[idx]
    ev = pd.read_parquet(f"{src}/processed_fire_events_{wid}.parquet"); ev["date"] = pd.to_datetime(ev.date); by = ev.groupby("grid_id")
    W = pd.read_parquet(f"{src.replace('v2_blocker_resolution', 'v1_pilot') if 'v2' in src else src}/weather_daily_{wid}.parquet").set_index(["power_lat", "power_lon", "date"]).sort_index()
    m = {"fire_history_past_only": 0, "same_day_not_predictor": 0, "weather_D_minus_3": 0, "soil_D_minus_3": 0, "ndvi_available_before_D": 0, "land_cover_year": 0}
    for r in S_.itertuples():
        e = by.get_group(r.grid_id) if r.grid_id in by.groups else ev.iloc[0:0]
        for k in (1, 7, 30):
            v = getattr(r, f"fires_previous_{k}d")
            if not pd.isna(v) and v != ((e.date < r.date) & (e.date >= r.date - pd.Timedelta(days=k))).sum(): m["fire_history_past_only"] += 1
        if r.fire_count != (e.date == r.date).sum(): m["same_day_not_predictor"] += 1
        if not pd.isna(r.t2m_max):
            if r.weather_observation_date > r.date - pd.Timedelta(days=3) or W.loc[(r.power_lat, r.power_lon, r.weather_observation_date)].T2M_MAX != r.t2m_max: m["weather_D_minus_3"] += 1
        if not pd.isna(r.soil_moisture_current) and not np.isclose(W.loc[(r.power_lat, r.power_lon, r.date - pd.Timedelta(days=3))].GWETROOT, r.soil_moisture_current): m["soil_D_minus_3"] += 1
        if not pd.isna(r.ndvi_available_date) and r.ndvi_available_date > r.date: m["ndvi_available_before_D"] += 1
        if r.land_cover_year != min(r.date.year, 2025): m["land_cover_year"] += 1
    obs_in_pred = [c for c in OBS_ONLY if c in PREDICTORS]
    out = {"rows_checked": N, "mismatches": m, "predictor_values_changed_vs_v3": sum(changed.values()), "vnp14a1_fields_in_predictor_list": obs_in_pred,
           "same_day_vnp14a1_fire_used_as_predictor": False, "v3_audit_carried": rep}
    out["passed"] = sum(m.values()) == 0 and out["predictor_values_changed_vs_v3"] == 0 and not obs_in_pred
    return out


def readiness(pos, neg, neg_months):
    if pos >= 1000 and neg >= 50000 and neg_months >= 10: return "READY FOR DATASET"
    if neg > 0: return "LIMITED"
    return "NOT READY"

READINESS_RULE = "READY FOR DATASET = >=1000 FIRE_DETECTED and >=50,000 NO_FIRE_CONFIRMED cell-days, with confirmed negatives in >=10 of 12 calendar months (seasonal coverage); LIMITED = some confirmed negatives but below that; NOT READY = none."


def stage_report(_=None):
    rows, frames = [], []
    for wid in WINDOWS:
        p = f"{OUT}/training_features_daily_{wid}.parquet"
        if not os.path.exists(p): rows.append({"window_id": wid, "status": "not built"}); continue
        RC = ["grid_id", "date", "country", "admin1", "season", "month", "fire_count", "satellite_fire_observation_status", "satellite_observation_valid", "observation_coverage_fraction", "intersecting_pixel_count", "valid_pixel_area_count", "cloud_obscured_pixel_area_count", "invalid_pixel_area_count"]
        Tb = pd.read_parquet(p, columns=RC); Tb["country"] = Tb.country.astype("category"); Tb["admin1"] = Tb.admin1.astype("category"); Tb["satellite_fire_observation_status"] = Tb.satellite_fire_observation_status.astype("category")
        frames.append(Tb[["country", "admin1", "season", "month", "satellite_fire_observation_status"]]); a = json.load(open(f"{OUT}/audits_{wid}.json"))
        st = Tb.satellite_fire_observation_status.value_counts(); n = len(Tb); g = lambda k: int(st.get(k, 0))
        conf = Tb[Tb.satellite_fire_observation_status == "NO_FIRE_CONFIRMED"]; fire = Tb[Tb.satellite_fire_observation_status == "FIRE_DETECTED"]
        cov = Tb.observation_coverage_fraction
        by_m = Tb.groupby("month").agg(valid_obs_pct=("satellite_observation_valid", lambda s: round(100 * s.fillna(False).astype(bool).mean(), 2)),
                                       fire=("satellite_fire_observation_status", lambda s: int((s == "FIRE_DETECTED").sum())),
                                       no_fire_confirmed=("satellite_fire_observation_status", lambda s: int((s == "NO_FIRE_CONFIRMED").sum())))
        by_s = Tb.groupby("season").agg(valid_obs_pct=("satellite_observation_valid", lambda s: round(100 * s.fillna(False).astype(bool).mean(), 2)),
                                        no_fire_confirmed=("satellite_fire_observation_status", lambda s: int((s == "NO_FIRE_CONFIRMED").sum())))
        cell_valid = Tb.groupby("grid_id").satellite_observation_valid.apply(lambda s: s.fillna(False).astype(bool).mean())
        day_valid = Tb.groupby("date").satellite_observation_valid.apply(lambda s: s.fillna(False).astype(bool).mean())
        rows.append({
            "window_id": wid, "country": Tb.country.iloc[0], "admin1": Tb.admin1.mode().iloc[0], "grid_cells": int(Tb.grid_id.nunique()), "cell_days": n,
            "FIRE_DETECTED": g("FIRE_DETECTED"), "NO_FIRE_CONFIRMED": g("NO_FIRE_CONFIRMED"), "INSUFFICIENT_OBSERVATION": g("INSUFFICIENT_OBSERVATION"), "MISSING": g("MISSING"),
            "pct_no_fire_confirmed": round(100 * g("NO_FIRE_CONFIRMED") / n, 2), "pct_insufficient": round(100 * g("INSUFFICIENT_OBSERVATION") / n, 2), "pct_missing": round(100 * g("MISSING") / n, 2),
            "positive_rate_among_observable": round(g("FIRE_DETECTED") / max(1, g("FIRE_DETECTED") + g("NO_FIRE_CONFIRMED")), 5),
            "coverage_fraction_quantiles": {q: round(float(cov.quantile(q)), 3) for q in (0.1, 0.25, 0.5, 0.75, 0.9)},
            "coverage_fraction_bins_pct": {k: round(100 * v, 2) for k, v in pd.cut(cov, [-0.001, 0, 0.5, 0.9999, 1], labels=["0", "0-0.5", "0.5-<1", "1"]).value_counts(normalize=True).sort_index().items()},
            "mean_intersecting_pixels_per_cell": round(float(Tb.intersecting_pixel_count.mean()), 2),
            "valid_pixel_area_units": int(Tb.valid_pixel_area_count.sum()), "cloud_obscured_pixel_area_units": int(Tb.cloud_obscured_pixel_area_count.sum()), "invalid_pixel_area_units": int(Tb.invalid_pixel_area_count.sum()),
            "firms_detections_qualifying": int(Tb.fire_count.sum()), "fire_dates": int(fire.date.nunique()), "cells_ever_burned": int(fire.grid_id.nunique()),
            "days_with_any_valid_cell": int((day_valid > 0).sum()), "days_with_majority_valid_cells": int((day_valid >= 0.5).sum()), "days_with_no_valid_cell": int((day_valid == 0).sum()),
            "by_month": by_m.reset_index().to_dict("records"), "by_season": by_s.reset_index().to_dict("records"),
            "cells_valid_obs_pct_range": [round(100 * float(cell_valid.min()), 2), round(100 * float(cell_valid.max()), 2)],
            "no_fire_confirmed_months": int((by_m.no_fire_confirmed > 0).sum()),
            "consistency": a["consistency"], "leakage": {k: a["leakage"][k] for k in ("rows_checked", "mismatches", "predictor_values_changed_vs_v3", "passed")},
            "nrt_rows_pct": round(100 * (Tb.date.dt.date > FIRMS_SP_END).mean(), 2),
        })
        r = rows[-1]; r["readiness"] = readiness(r["FIRE_DETECTED"], r["NO_FIRE_CONFIRMED"], r["no_fire_confirmed_months"])
        mx, mn = by_m.valid_obs_pct.max(), by_m.valid_obs_pct.min()
        r["seasonal_bias_flag"] = f"valid-observation rate ranges {mn}% (month {int(by_m.valid_obs_pct.idxmin())}) to {mx}% (month {int(by_m.valid_obs_pct.idxmax())})" + (" — STRONG seasonal bias" if mx - mn > 30 else "")
    import pyarrow.parquet as pq, pyarrow as pa
    wr = None
    for wid in WINDOWS:
        pf = pq.ParquetFile(f"{OUT}/training_features_daily_{wid}.parquet")
        for b in pf.iter_batches(batch_size=200_000):
            tb = pa.Table.from_batches([b])
            if wr is None: sch = tb.schema; wr = pq.ParquetWriter(f"{OUT}/v4_combined_candidate_dataset.parquet", sch)
            wr.write_table(tb.cast(sch))
    wr.close()
    C = pd.concat(frames, ignore_index=True); C["country"] = C.country.astype(str); C["admin1"] = C.admin1.astype(str); C["satellite_fire_observation_status"] = C.satellite_fire_observation_status.astype(str)

    def stats(D):
        s = D.satellite_fire_observation_status.value_counts().to_dict(); f, nf = s.get("FIRE_DETECTED", 0), s.get("NO_FIRE_CONFIRMED", 0)
        return {"rows": len(D), **{k: int(s.get(k, 0)) for k in ("FIRE_DETECTED", "NO_FIRE_CONFIRMED", "INSUFFICIENT_OBSERVATION", "MISSING")},
                "positive_rate_among_observable": round(f / max(1, f + nf), 5),
                "country_contribution_pct": {k: round(100 * v, 2) for k, v in D.country.value_counts(normalize=True).items()},
                "region_contribution_pct": {k: round(100 * v, 2) for k, v in D.admin1.value_counts(normalize=True).items()},
                "season_contribution_pct": {k: round(100 * v, 2) for k, v in D.season.value_counts(normalize=True).items()},
                "month_contribution_pct": {int(k): round(100 * v, 2) for k, v in D.month.value_counts(normalize=True).sort_index().items()}}
    obs = C[C.satellite_fire_observation_status.isin(["FIRE_DETECTED", "NO_FIRE_CONFIRMED"])]
    neg = C[C.satellite_fire_observation_status == "NO_FIRE_CONFIRMED"]
    rep = {"version": "v4_satellite_observation", "processing_version": PROC_VERSION, "generated": dt.date.today().isoformat(), "model_trained": False,
           "product": PRODUCT, "fire_mask_classes": CLASSES, "observed_classes": OBSERVED, "cloud_classes": CLOUD, "invalid_classes": INVALID,
           "observation_rule": "satellite_observation_valid = 100% of the 1 km cell area falls on VNP14A1 pixels whose daily FireMask is 3/5/7/8/9 (area fractions from 10x10 sub-point sampling).",
           "readiness_rule": READINESS_RULE, "countries": rows, "combined_all_rows": stats(C), "combined_observable_rows_only": stats(obs),
           "no_fire_confirmed_concentration": {"by_country_pct": {k: round(100 * v, 2) for k, v in neg.country.value_counts(normalize=True).items()},
                                              "by_month_pct": {int(k): round(100 * v, 2) for k, v in neg.month.value_counts(normalize=True).sort_index().items()}},
           "why_vnp14a1_not_vnp14img_swath": "VNP14IMG swath files contain the per-pixel fire mask but no per-pixel latitude/longitude; placing pixels needs VNP03IMG (~200 MB/granule, ~30k granules here). VNP14A1 v002 is the official LP DAAC daily 1 km gridded product generated from the same VNP14IMG algorithm and carries the same class semantics.",
           "limitations": ["Daily FireMask is a composite of all S-NPP overpasses that day (day+night); 'observed' means at least one usable look, not continuous observation.",
                           "VNP14A1 pixels (~927 m sinusoidal) do not align with the 1 km grid; area fractions are approximated by 100 sub-points per cell.",
                           "FIRMS (target) uses S-NPP only, same sensor as VNP14A1, so the observability label matches the detection system.",
                           "FIRMS after 2026-06-30 is NRT (not finalized) — flagged per row.", "Pilot windows only (30 x 30 km)."]}
    json.dump(rep, open(f"{OUT}/v4_final_report.json", "w"), indent=2, default=str)
    pd.json_normalize([{k: v for k, v in r.items() if k not in ("by_month", "by_season")} for r in rows]).to_csv(f"{OUT}/v4_country_assessment.csv", index=False)
    json.dump({"product": PRODUCT, "processing_version": PROC_VERSION, "retrieved": dt.date.today().isoformat(),
               "windows": {w: {"manifest": f"granule_manifest_{w}.csv", "download_log": f"download_log_{w}.json"} for w in WINDOWS},
               "raw": "raw_vnp14a1_subsets/*.npz (FireMask, QA, MaxFRP window subsets + tile, row/col offset, production id)"},
              open(f"{OUT}/source_manifest.json", "w"), indent=2)
    print(json.dumps({r.get("country"): {k: r.get(k) for k in ("FIRE_DETECTED", "NO_FIRE_CONFIRMED", "INSUFFICIENT_OBSERVATION", "MISSING", "readiness", "seasonal_bias_flag")} for r in rows}, indent=1))


if __name__ == "__main__":
    st = sys.argv[1]
    if st == "report": stage_report(); sys.exit()
    for w in ([sys.argv[2]] if len(sys.argv) > 2 else list(WINDOWS)): globals()[f"stage_{st}"](w)
