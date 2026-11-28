"""Daily job: free keyless data in, static JSON out. EXPERIMENTAL satellite-detection risk for one region.
The model type and its feature list come from the region's results file, so each region is served by the
model that won its own test (LightGBM, scikit-learn or a plain logistic regression), and only models that
use weather trigger a NASA POWER download.
Inputs (no API key): NASA FIRMS regional NRT CSVs (NOAA-20 VIIRS, last 7 days), NASA POWER daily weather.
Output: public/data/risk-<region>.json
"""
import datetime as dt, hashlib, io, json, os, sys, time, urllib.request
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if '/' in __file__ else '.')
from features import BASE, WEATHER, build_features, needs_weather, W0, S0, STEP, BBOX, WL
from region import get_region, ROOT

FIRMS = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/{r}/J1_VIIRS_C2_{r}_7d.csv"
POWER = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,WS2M,RH2M"
         "&community=AG&longitude={lon}&latitude={lat}&start={s}&end={e}&format=JSON")
W, S, E, N = BBOX
nI = int(np.ceil((E - W) / STEP)); nJ = int(np.ceil((N - S) / STEP))


def get(url, tries=4):
    for k in range(tries):
        try: return urllib.request.urlopen(url, timeout=120).read()
        except Exception as e: print('retry', url[:80], e, file=sys.stderr); time.sleep(5 * (k + 1))
    raise RuntimeError('download failed: ' + url)


def nrt(region_name, day, cache_dir):
    """Download (or reuse from this run's cache) the 7-day NRT CSV for a FIRMS region."""
    os.makedirs(cache_dir, exist_ok=True)
    p = os.path.join(cache_dir, f'{region_name}_{day}.csv')
    if os.path.exists(p) and os.path.getsize(p) > 200: return pd.read_csv(p)
    raw = get(FIRMS.format(r=region_name)); open(p, 'wb').write(raw); return pd.read_csv(io.BytesIO(raw))


def power_grid(day, days, grid_deg):
    wl = np.arange(np.ceil(W / grid_deg) * grid_deg, E + 0.01, grid_deg)
    wa = np.arange(S + grid_deg / 2, N, grid_deg)
    arr = {v: np.full((len(days), len(wa), len(wl)), np.nan, np.float32) for v in ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'WS2M', 'RH2M']}
    for j, a in enumerate(wa):
        for i, o in enumerate(wl):
            d = json.loads(get(POWER.format(lon=round(float(o), 2), lat=round(float(a), 2), s=days[0].strftime('%Y%m%d'), e=day.strftime('%Y%m%d'))))
            for v in arr:
                for ds, val in d['properties']['parameter'][v].items():
                    t = {x.strftime('%Y-%m-%d'): k for k, x in enumerate(days)}.get(ds)
                    if t is not None and val != -999: arr[v][t, j, i] = val
    clon = W + STEP * (np.arange(nI) + .5); clat = S + STEP * (np.arange(nJ) + .5)
    wi = np.abs(clon[:, None] - wl[None, :]).argmin(1); wj = np.abs(clat[:, None] - wa[None, :]).argmin(1)
    return {v: np.stack([[arr[v][:, wj[j], wi[i]] for j in range(nJ)] for i in range(nI)], 0).transpose(2, 0, 1) for v in arr}


def load_model(results, path):
    fmt = results.get('model_format', 'lightgbm-txt')
    if fmt == 'lightgbm-txt':
        import lightgbm as lgb
        return ('lightgbm', lgb.Booster(model_file=path))
    if fmt == 'sklearn-joblib':
        import joblib
        return ('sklearn', joblib.load(path))
    raise SystemExit(f'unknown model format {fmt!r}')


def main(today=None, out=None, model=None):
    R = get_region(); out = out or R['output_path']; model = model or R['model_path']
    results = json.load(open(R['results_path']))
    feats = results['features']; use_wx = needs_weather(feats)
    kind, mdl = load_model(results, model)
    D = pd.Timestamp(today or dt.datetime.utcnow().date())
    days = pd.date_range(D - pd.Timedelta(days=109), D); T = len(days); di = {d: i for i, d in enumerate(days)}
    # --- fire history (cells with >=1 nominal/high detection per UTC day)
    A = np.zeros((T, nI, nJ), np.float32); seen_dates = set(); n_det = 0
    f = nrt(R['firms_realtime_region'], D.date().isoformat(), os.path.join(ROOT, 'data', 'nrt-cache'))
    if len(f):
        f = f[f.confidence.astype(str).str[0].str.lower().isin(['n', 'h']) & (f.longitude >= W) & (f.longitude < E) & (f.latitude >= S) & (f.latitude < N)]
        for row in f.itertuples():
            d = pd.Timestamp(row.acq_date)
            if d in di:
                A[di[d], int((row.longitude - W) // STEP), int((row.latitude - S) // STEP)] = 1; seen_dates.add(d.date().isoformat()); n_det += 1
    if use_wx:
        wx = power_grid(D, days, R.get('power_grid_deg', 0.5))
        # Safety: weather for the day the features read (D - WL) must be real, not missing. Otherwise stop; the previous file stays.
        for v in wx:
            if np.isnan(wx[v][-1 - WL]).any():
                raise RuntimeError(f'weather {v} for {days[-1 - WL].date()} not yet available from NASA POWER; refusing to publish a degraded prediction')
        F = build_features(A, wx['T2M_MAX'], wx['T2M_MIN'], wx['PRECTOTCORR'], wx['WS2M'], wx['RH2M'], days.dayofyear.values)
    else:
        F = build_features(A, None, None, None, None, None, days.dayofyear.values, with_weather=False)
    X = np.stack([F[k][-1].reshape(-1) for k in feats], -1)
    p = (mdl.predict(X) if kind == 'lightgbm' else mdl.predict_proba(X)[:, 1]).reshape(nI, nJ)
    cells = []
    for i in range(nI):
        for j in range(nJ):
            pr = float(p[i, j]); lvl = 'high' if pr >= 0.65 else 'medium' if pr >= 0.35 else 'low'
            cells.append({'lat': round(float(S + STEP * (j + .5)), 4), 'lon': round(float(W + STEP * (i + .5)), 4), 'probability': round(pr, 3),
                          'risk_level': lvl, 'date': D.date().isoformat(), 'cell_size_deg': STEP})
    doc = {'experimental': True, 'product': 'Daily satellite-detection risk (probability that VIIRS detects at least one nominal/high-confidence fire pixel in the cell on this UTC day)',
           'not_a_confirmed_fire_forecast': True, 'region_id': R['id'], 'region': R['label'], 'country': R.get('country'), 'country_code': R.get('country_code'),
           'model_selected': results.get('selected_model'), 'model_type': results.get('model_type'), 'uses_weather': use_wx,
           'model_sha256': hashlib.sha256(open(model, 'rb').read()).hexdigest(),
           'bbox_WSEN': list(BBOX), 'cell_deg': STEP, 'date': D.date().isoformat(), 'generated_utc': dt.datetime.utcnow().isoformat(timespec='seconds') + 'Z',
           'inputs': {'fire_source': 'NASA FIRMS NOAA-20 VIIRS NRT (regional CSV, last 7 days)', 'fire_detections_in_footprint_last_7d': n_det,
                      'latest_fire_date_seen': max(seen_dates) if seen_dates else None,
                      'weather_source': 'NASA POWER daily (%s deg), used with a 3-day lag' % R.get('power_grid_deg', 0.5) if use_wx else 'not used by this model'},
           'model': f"{results.get('model_type')} selected by the region test (test year {R['test_year']}, held-out areas PR-AUC {results.get('selection', {}).get('table', [{}])[0].get('pr_auc', 'n/a')})",
           'cells': cells}
    os.makedirs(os.path.dirname(out), exist_ok=True); json.dump(doc, open(out, 'w'))
    print('wrote', out, 'cells', len(cells), 'detections_7d', n_det, 'mean p', round(float(p.mean()), 3), 'max', round(float(p.max()), 3))


if __name__ == '__main__':
    main(*(sys.argv[1:2]))
