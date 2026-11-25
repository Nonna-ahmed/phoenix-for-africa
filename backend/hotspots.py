"""Write a small hotspots JSON for the FIRMS Southern Africa region from NASA's public keyless NOAA-20/21 VIIRS 7-day CSVs.
Run by the daily workflow so the free Cloudflare Worker (10 ms CPU limit) never parses the 43k-row CSV."""
import csv, io, json, os, sys, datetime as dt, urllib.request
BBOX = (24.8, -13.0, 29.0, -8.2)  # W,S,E,N, same as features.BBOX
URLS = {
 'VIIRS_NOAA20_NRT': 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/Southern_Africa/J1_VIIRS_C2_Southern_Africa_7d.csv',
 'VIIRS_NOAA21_NRT': 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/Southern_Africa/J2_VIIRS_C2_Southern_Africa_7d.csv'}
COVER = (10.0, -35.0, 58.0, -4.0)  # approx. FIRMS 'Southern Africa' region; requests outside it show unavailable, not zero
OK = {'nominal', 'high', 'n', 'h'}
DAYS = 2  # UTC days kept (today and yesterday) to keep the static file small
def main(out='public/data/hotspots-southern-africa.json'):
    hs = []
    cutoff = (dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=DAYS - 1)).isoformat()
    for src, u in URLS.items():
        txt = urllib.request.urlopen(u, timeout=60).read().decode()
        for r in csv.DictReader(io.StringIO(txt)):
            try: lat, lon = float(r['latitude']), float(r['longitude'])
            except (KeyError, ValueError): continue
            if r.get('confidence', '').lower() not in OK: continue
            if r['acq_date'] < cutoff: continue
            t = r.get('acq_time', '').zfill(4)
            try: frp = float(r['frp'])
            except (KeyError, ValueError): frp = None
            hs.append({'lat': round(lat, 4), 'lon': round(lon, 4), 'acqDate': r['acq_date'], 'acqTime': f'{t[:2]}:{t[2:]}', 'satellite': r.get('satellite'), 'instrument': 'VIIRS', 'source': src, 'confidence': r['confidence'], 'frp': frp, 'daynight': r.get('daynight')})
    if not hs and len(URLS): pass
    doc = {'status': 'ok', 'message': 'Static file from public NASA NOAA-20/21 VIIRS 7-day CSVs (nominal/high confidence), written by the daily job', 'coverage_WSEN': list(COVER), 'hotspots': hs, 'total': len(hs), 'truncated': False, 'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
    os.makedirs(os.path.dirname(out), exist_ok=True); json.dump(doc, open(out, 'w'), separators=(',', ':'))
    print('wrote', out, len(hs))
if __name__ == '__main__': main(*sys.argv[1:])
