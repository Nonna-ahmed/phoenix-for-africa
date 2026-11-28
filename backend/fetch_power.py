"""Download NASA POWER daily weather (free, keyless) on the coarse grid inside a region from
backend/regions.json, into data/power/<region>/<lat>_<lon>.csv. Resumable; each run stops after a
short time budget, so re-run until it prints done.  REGION=gh-north python backend/fetch_power.py"""
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import region as RG

P = "T2M_MAX,T2M_MIN,PRECTOTCORR,WS2M,RH2M"

def points(R):
    G = R.get('power_grid_deg', 0.5)
    lons = np.arange(np.ceil(R['W'] / G) * G, R['E'] + 0.01, G); lats = np.arange(R['S'] + G / 2, R['N'], G)
    return [(round(float(a), 2), round(float(o), 2)) for a in lats for o in lons]

def fetch_one(args):
    rid, a, o, y0, y1 = args
    d = os.path.join(RG.ROOT, 'data', 'power', rid); os.makedirs(d, exist_ok=True)
    fn = os.path.join(d, f'{a}_{o}.csv')
    if os.path.exists(fn) and os.path.getsize(fn) > 500: return 'skip'
    url = (f"https://power.larc.nasa.gov/api/temporal/daily/point?parameters={P}&community=AG"
           f"&longitude={o}&latitude={a}&start={y0}1201&end={y1}1231&format=JSON")
    for k in range(4):
        try:
            doc = json.load(urllib.request.urlopen(url, timeout=90))
            df = pd.DataFrame(doc['properties']['parameter']); df.index.name = 'date'; df = df.reset_index()
            df['wlat'] = a; df['wlon'] = o
            tmp = fn + '.part'; df.to_csv(tmp, index=False); os.replace(tmp, fn)
            return 'ok'
        except Exception as e:
            print('retry', a, o, e); time.sleep(3 * (k + 1))
    return 'FAILED %s %s %s' % (rid, a, o)

def run(rid, budget=80):
    R = RG.get_region(rid); y0 = min(R['train_years']) - 1; y1 = max(R['test_year'], R['val_year'])
    todo = [(rid, a, o, y0, y1) for a, o in points(R)]
    T0 = time.time(); done = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        for r in ex.map(fetch_one, todo):
            if r == 'ok': done += 1
            if r.startswith('FAILED'): print(r)
            if time.time() - T0 > budget: break
    left = sum(1 for a, o in points(R) if not os.path.exists(os.path.join(RG.ROOT, 'data', 'power', rid, f'{a}_{o}.csv')))
    print(f'{rid}: {len(todo)} points, {left} left')
    return left

if __name__ == '__main__':
    only = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('REGION')
    rids = [only] if only else list(RG.load_config())
    left = 0
    for rid in rids: left += run(rid)
    print('done' if left == 0 else 'budget reached, rerun')
