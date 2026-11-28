"""Build the fire + weather arrays for one region from the shared FIRMS archives (data/raw) and the
region's POWER chunks (data/power/<region>). Writes data/arrays-<region>.npz.
Run: REGION=gh-north python backend/build_dataset.py"""
import glob, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import region as RG

R = RG.get_region(); W, S, E, N, STEP = R['W'], R['S'], R['E'], R['N'], R['step']
Y = R['train_years'] + [R['val_year'], R['test_year']]; y0, y1 = min(Y), max(Y)
raw = os.path.join(RG.ROOT, 'data', 'raw')
fr = []
for y in range(y0, y1 + 1):
    p = os.path.join(raw, f"{R['firms_country_archive']}_{y}.csv")
    if not os.path.exists(p): raise SystemExit(f'missing {p}; run backend/download_data.py')
    df = pd.read_csv(p, usecols=['latitude', 'longitude', 'acq_date', 'confidence', 'type'])
    fr.append(df[(df.longitude >= W) & (df.longitude < E) & (df.latitude >= S) & (df.latitude < N)])
f = pd.concat(fr); print('raw detections in bbox', len(f), f.confidence.astype(str).str[0].str.lower().value_counts().to_dict())
f = f[f.confidence.astype(str).str[0].str.lower().isin(['n', 'h']) & (f.type == 0)]
f = f.assign(ci=np.floor((f.longitude - W) / STEP).astype(int), cj=np.floor((f.latitude - S) / STEP).astype(int))
cnt = f.groupby(['ci', 'cj', 'acq_date']).size().rename('n').reset_index(); cnt['acq_date'] = pd.to_datetime(cnt.acq_date)
nI = int(np.ceil((E - W) / STEP)); nJ = int(np.ceil((N - S) / STEP))
days = pd.date_range(f'{y0-1}-12-01', f'{y1}-12-31'); di = {d: i for i, d in enumerate(days)}
A = np.zeros((len(days), nI, nJ), np.float32)
cnt = cnt[cnt.acq_date.isin(di)]
for r in cnt.itertuples(): A[di[r.acq_date], r.ci, r.cj] = r.n
print('cells', nI * nJ, 'days', len(days), 'fire cell-days', int((A[31:] > 0).sum()))
pdir = os.path.join(RG.ROOT, 'data', 'power', R['id'])
files = sorted(glob.glob(os.path.join(pdir, '*.csv')))
if not files: raise SystemExit('no POWER chunks; run backend/fetch_power.py')
w = pd.concat([pd.read_csv(x) for x in files]); w.replace(-999, np.nan, inplace=True)
w['date'] = pd.to_datetime(w.date.astype(str))
wl = sorted(w.wlon.unique()); wa = sorted(w.wlat.unique())
var = ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'WS2M', 'RH2M']
WA = {v: np.full((len(days), len(wa), len(wl)), np.nan, np.float32) for v in var}
ai = {a: i for i, a in enumerate(wa)}; li = {l: i for i, l in enumerate(wl)}
w['d'] = w.date.map(di); w = w.dropna(subset=['d'])
for v in var: WA[v][w.d.astype(int).values, w.wlat.map(ai).values, w.wlon.map(li).values] = w[v].values
print('weather points', len(wa), 'x', len(wl), 'missing frac', {v: round(float(np.isnan(WA[v]).mean()), 3) for v in var})
out = os.path.join(RG.ROOT, 'data', f'arrays-{R["id"]}.npz')
np.savez_compressed(out, A=A, days=days.values.astype('datetime64[D]'), wa=np.array(wa), wl=np.array(wl), **{v: WA[v] for v in var})
print('wrote', out)
