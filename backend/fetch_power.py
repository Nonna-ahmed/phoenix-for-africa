"""Download NASA POWER daily weather (free, keyless) on a coarse grid inside the region from backend/regions.json.
REGION=haut-katanga python backend/fetch_power.py   (re-run until it prints done; it has a time budget per run)"""
import json, time, os, sys, urllib.request, numpy as np, pandas as pd, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from region import get_region
R = get_region(); G = R.get('power_grid_deg', 0.5)
lons = np.arange(np.ceil(R['W'] / G) * G, R['E'] + 0.01, G); lats = np.arange(R['S'] + G / 2, R['N'], G)
pts = [(round(a, 2), round(o, 2)) for a in lats for o in lons]
y0 = min(R['train_years']) - 1
os.makedirs('data/pchunks', exist_ok=True); T0 = time.time()
P = "T2M_MAX,T2M_MIN,PRECTOTCORR,WS2M,RH2M"
for a, o in pts:
    fn = f'data/pchunks/{a}_{o}.csv'
    if os.path.exists(fn): continue
    if time.time() - T0 > 90: print('budget, rerun'); sys.exit(0)
    url = f"https://power.larc.nasa.gov/api/temporal/daily/point?parameters={P}&community=AG&longitude={o}&latitude={a}&start={y0}1201&end={R['test_year']}1231&format=JSON"
    for k in range(4):
        try: d = json.load(urllib.request.urlopen(url, timeout=60)); break
        except Exception as e: print('retry', a, o, e); time.sleep(8)
    else: sys.exit('fail')
    df = pd.DataFrame(d['properties']['parameter']); df.index.name = 'date'; df = df.reset_index(); df['wlat'] = a; df['wlon'] = o
    df.to_csv(fn, index=False)
print('done', len(glob.glob('data/pchunks/*.csv')), len(pts))
