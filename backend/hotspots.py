"""Write small static hotspot files from NASA's public keyless NOAA-20/21 VIIRS 7-day regional CSVs.
Run by the daily workflow so the free Cloudflare Worker (10 ms CPU limit) never parses a big CSV.
One output file per FIRMS region; the web app loads the files that overlap the map area and says which part is not covered."""
import csv, io, json, os, sys, datetime as dt, urllib.request
DAYS = 2  # UTC days kept (today and yesterday)
OK = {'nominal', 'high', 'n', 'h'}
BASE = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire'
# coverage rectangles W,S,E,N = observed extent of each regional CSV (checked 2026-11-25)
REGIONS = {
    'southern-africa': {'tag': 'Southern_Africa', 'cover': (10.0, -35.0, 58.0, -4.0)},
    'northern-central-africa': {'tag': 'Northern_and_Central_Africa', 'cover': (-25.0, -10.0, 52.0, 37.5)},
}
SATS = {'noaa-20-viirs-c2': ('VIIRS_NOAA20_NRT', 'J1'), 'noaa-21-viirs-c2': ('VIIRS_NOAA21_NRT', 'J2')}

def build(key, outdir='public/data'):
    reg = REGIONS[key]; tag = reg['tag']
    cutoff = (dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=DAYS - 1)).isoformat()
    hs = []
    for sat, (src, code) in SATS.items():
        txt = urllib.request.urlopen(f'{BASE}/{sat}/{tag}/{code}_VIIRS_C2_{tag}_7d.csv', timeout=120).read().decode()
        for r in csv.DictReader(io.StringIO(txt)):
            try: lat, lon = float(r['latitude']), float(r['longitude'])
            except (KeyError, ValueError): continue
            if r['acq_date'] < cutoff or r.get('confidence', '').lower() not in OK: continue
            t = r.get('acq_time', '').zfill(4)
            try: frp = float(r['frp'])
            except (KeyError, ValueError): frp = None
            hs.append({'lat': round(lat, 4), 'lon': round(lon, 4), 'acqDate': r['acq_date'], 'acqTime': f'{t[:2]}:{t[2:]}', 'satellite': r.get('satellite'), 'instrument': 'VIIRS', 'source': src, 'confidence': r['confidence'], 'frp': frp, 'daynight': r.get('daynight')})
    doc = {'status': 'ok', 'region': key, 'message': 'Static file from public NASA NOAA-20/21 VIIRS 7-day CSVs (nominal/high confidence), written by the daily job',
           'coverage_WSEN': list(reg['cover']), 'days_covered': DAYS, 'hotspots': hs, 'total': len(hs), 'truncated': False,
           'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
    os.makedirs(outdir, exist_ok=True); out = f'{outdir}/hotspots-{key}.json'
    json.dump(doc, open(out, 'w'), separators=(',', ':')); print('wrote', out, len(hs), os.path.getsize(out) // 1024, 'KB')

def main(outdir='public/data'):
    for k in REGIONS: build(k, outdir)
if __name__ == '__main__': main(*sys.argv[1:])
