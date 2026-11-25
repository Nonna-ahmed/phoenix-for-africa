"""Daily job: free keyless data in, static JSON out. EXPERIMENTAL satellite-detection risk, Haut-Katanga pilot.
Inputs (no API key): NASA FIRMS regional NRT CSVs (NOAA-20 VIIRS, last 7 days), NASA POWER daily weather.
Output: public/data/risk-haut-katanga.json
"""
import io, json, sys, time, datetime as dt, urllib.request
import numpy as np, pandas as pd, lightgbm as lgb
sys.path.insert(0, __file__.rsplit('/', 1)[0] if '/' in __file__ else '.')
from features import build_features, BASE, W0, S0, STEP, BBOX
from region import get_region

FIRMS = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/{r}/J1_VIIRS_C2_{r}_7d.csv"
REGIONS = ["Southern_Africa", "Northern_and_Central_Africa"]
POWER = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,WS2M,RH2M"
         "&community=AG&longitude={lon}&latitude={lat}&start={s}&end={e}&format=JSON")
W, S, E, N = BBOX
nI = int(np.ceil((E - W) / STEP)); nJ = int(np.ceil((N - S) / STEP))

def get(url, tries=4):
    for k in range(tries):
        try: return urllib.request.urlopen(url, timeout=90).read()
        except Exception as e: print('retry', url[:80], e, file=sys.stderr); time.sleep(5 * (k + 1))
    raise RuntimeError('download failed: ' + url)

def main(today=None, out=None, model=None):
    out = out or get_region()['output']
    import os
    model = model or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model.txt')
    D = pd.Timestamp(today or dt.datetime.utcnow().date())
    days = pd.date_range(D - pd.Timedelta(days=109), D)   # 110-day window ending on the target day
    T = len(days); di = {d: i for i, d in enumerate(days)}
    # --- fire history (cells with >=1 nominal/high detection per UTC day)
    A = np.zeros((T, nI, nJ), np.float32); seen_dates = set(); n_det = 0
    for r in REGIONS:
        f = pd.read_csv(io.BytesIO(get(FIRMS.format(r=r))))
        if not len(f): continue
        f = f[f.confidence.astype(str).str[0].str.lower().isin(['n', 'h']) & (f.longitude >= W) & (f.longitude < E) & (f.latitude >= S) & (f.latitude < N)]
        for row in f.itertuples():
            d = pd.Timestamp(row.acq_date)
            if d in di:
                A[di[d], int((row.longitude - W) // STEP), int((row.latitude - S) // STEP)] = 1; seen_dates.add(d.date().isoformat()); n_det += 1
    # --- weather (NASA POWER 0.5 deg grid points)
    wl = np.arange(np.ceil(W * 2) / 2, E + 0.01, 0.5); wa = np.arange(S + 0.25, N, 0.5)   # 0.5 deg POWER grid points inside the region
    arr = {v: np.full((T, len(wa), len(wl)), np.nan, np.float32) for v in ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'WS2M', 'RH2M']}
    for j, a in enumerate(wa):
        for i, o in enumerate(wl):
            d = json.loads(get(POWER.format(lon=round(o, 2), lat=round(a, 2), s=days[0].strftime('%Y%m%d'), e=D.strftime('%Y%m%d'))))
            for v in arr:
                for ds, val in d['properties']['parameter'][v].items():
                    t = di.get(pd.Timestamp(ds))
                    if t is not None and val != -999: arr[v][t, j, i] = val
    clon = W + STEP * (np.arange(nI) + .5); clat = S + STEP * (np.arange(nJ) + .5)
    wi = np.abs(clon[:, None] - wl[None, :]).argmin(1); wj = np.abs(clat[:, None] - wa[None, :]).argmin(1)
    wx = {v: np.stack([[arr[v][:, wj[j], wi[i]] for j in range(nJ)] for i in range(nI)], 0).transpose(2, 0, 1) for v in arr}
    # Safety: weather for the day the features read (D - WL) must be real, not missing/back-filled. Otherwise stop; the previous file stays.
    from features import WL
    for v in wx:
        if np.isnan(wx[v][-1 - WL]).any():
            raise RuntimeError(f'weather {v} for {days[-1 - WL].date()} not yet available from NASA POWER; refusing to publish a degraded prediction')
    F = build_features(A, wx['T2M_MAX'], wx['T2M_MIN'], wx['PRECTOTCORR'], wx['WS2M'], wx['RH2M'], days.dayofyear.values)
    X = np.stack([F[k][-1].reshape(-1) for k in BASE], -1)
    p = lgb.Booster(model_file=model).predict(X).reshape(nI, nJ)
    cells = []
    for i in range(nI):
        for j in range(nJ):
            pr = float(p[i, j]); lvl = 'high' if pr >= 0.65 else 'medium' if pr >= 0.35 else 'low'
            cells.append({'lat': round(float(clat[j]), 4), 'lon': round(float(clon[i]), 4), 'probability': round(pr, 3), 'risk_level': lvl,
                          'date': D.date().isoformat(), 'cell_size_deg': STEP})
    last_fire = max(seen_dates) if seen_dates else None
    doc = {'experimental': True, 'product': 'Daily satellite-detection risk (probability that VIIRS detects at least one nominal/high-confidence fire pixel in the cell on this UTC day)',
           'not_a_confirmed_fire_forecast': True, 'region': 'Haut-Katanga pilot footprint (bounding box, not an administrative boundary)',
           'bbox_WSEN': list(BBOX), 'cell_deg': STEP, 'date': D.date().isoformat(), 'generated_utc': dt.datetime.utcnow().isoformat(timespec='seconds') + 'Z',
           'inputs': {'fire_source': 'NASA FIRMS NOAA-20 VIIRS NRT (regional CSV, last 7 days)', 'fire_detections_in_footprint_last_7d': n_det,
                      'latest_fire_date_seen': last_fire, 'weather_source': 'NASA POWER daily (0.5 deg), used with a 3-day lag'},
           'model': 'LightGBM, trained on 2020-2023 NOAA-20 VIIRS detections; see MODEL_CARD.md for 2025 held-out results',
           'cells': cells}
    import os; os.makedirs(os.path.dirname(out), exist_ok=True); json.dump(doc, open(out, 'w'))
    print('wrote', out, 'cells', len(cells), 'detections_7d', n_det, 'mean p', round(float(p.mean()), 3), 'max', round(float(p.max()), 3))

if __name__ == '__main__':
    main(*(sys.argv[1:2]))
