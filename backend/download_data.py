"""Download the NASA FIRMS per-country yearly archives (free, no API key) needed by every region in
regions.json, into data/raw/<Country>_<year>.csv. Shared by regions in the same country; skips files
already downloaded. Run: python backend/download_data.py [REGION]"""
import os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import region as RG

def jobs(only=None):
    seen = {}
    for rid, c in RG.load_config().items():
        if only and rid != only: continue
        ys = c['train_years'] + [c['val_year'], c['test_year']]
        for y in range(min(ys), max(ys) + 1):
            key = (c['firms_country_archive'], y, c['firms_archive_sat'])
            seen[key] = rid
    return seen

def fetch(job):
    country, y, sat = job
    root = os.path.join(RG.ROOT, 'data', 'raw'); os.makedirs(root, exist_ok=True)
    out = os.path.join(root, f'{country}_{y}.csv')
    if os.path.exists(out) and os.path.getsize(out) > 1000: return f'skip {out}'
    url = f'https://firms.modaps.eosdis.nasa.gov/data/country/{sat}/{y}/{sat}_{y}_{country}.csv'
    for k in range(4):
        try:
            data = urllib.request.urlopen(url, timeout=180).read()
            if len(data) < 1000: raise RuntimeError('short file')
            tmp = out + '.part'; open(tmp, 'wb').write(data); os.replace(tmp, out)
            return f'ok {out} {len(data)//1024//1024} MB'
        except Exception as e:
            print('retry', country, y, e); time.sleep(3 * (k + 1))
    return f'FAILED {country} {y}'

if __name__ == '__main__':
    only = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('REGION')
    js = jobs(only)
    with ThreadPoolExecutor(max_workers=6) as ex:
        for r in ex.map(fetch, js): print(r)
