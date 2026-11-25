"""One scheduled refresh for all regions, with fail-safe publication checks.
Order: (1) start from the LIVE risk files, (2) per region (isolated subprocess, errors caught) recompute risk only if the
live file is not for today's UTC day, (3) hotspots every run, (4) manifest, (5) publish check.
publish_check refuses (non-zero exit, no deploy) if: a risk file is older than the live one (never downgrade), a hotspot file
is missing/older than 36 h, or the manifest disagrees with the files. Run with env SITE_URL (empty = dry run)."""
import datetime as dt, json, os, subprocess, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import region as RG, manifest as MF

def fetch_json(url):
    try: return json.loads(urllib.request.urlopen(url, timeout=60).read())
    except Exception: return None

def baseline(site, today, fetch=fetch_json):
    """Copy live risk files into place. Returns {region_id: live_date or None}."""
    live = {}
    for rid, c in RG.load_config().items():
        d = fetch(f"{site}/{os.path.relpath(c['output'], 'public')}") if site else None
        ok = isinstance(d, dict) and d.get('date') and d.get('cells') and d.get('region_id', rid) == rid
        live[rid] = d['date'] if ok else None
        if ok:
            os.makedirs(os.path.dirname(os.path.join(RG.ROOT, c['output'])), exist_ok=True)
            json.dump(d, open(os.path.join(RG.ROOT, c['output']), 'w'))
    return live

def need_risk(live, today): return {r: d != today for r, d in live.items()}

def run_region(rid, runner=subprocess.run):
    try:
        p = runner([sys.executable, os.path.join(RG.HERE, 'predict.py')], env={**os.environ, 'REGION': rid}, capture_output=True, text=True)
        return p.returncode == 0
    except Exception: return False

def publish_check(live, today, now=None):
    now = now or dt.datetime.now(dt.timezone.utc); errs = []
    for rid, c in RG.load_config().items():
        try: d = json.load(open(os.path.join(RG.ROOT, c['output']))).get('date')
        except Exception: d = None
        if live.get(rid) and (not d or d < live[rid]): errs.append(f'{rid}: risk would downgrade {live[rid]} -> {d}')
    for f in ('hotspots-southern-africa.json', 'hotspots-northern-central-africa.json'):
        p = os.path.join(RG.ROOT, 'public', 'data', f)
        try:
            g = json.load(open(p))
            if g.get('status') != 'ok': errs.append(f'{f} status not ok')
            t = dt.datetime.fromisoformat(str(g.get('fetchedAt', '')).replace('Z', '+00:00'))
            if (now - t).total_seconds() > 36 * 3600: errs.append(f'{f} older than 36 h')
        except Exception: errs.append(f'{f} missing or unreadable')
    mp = os.path.join(RG.ROOT, 'public', 'data', 'regions-manifest.json')
    try:
        have = {r['id']: r['estimates_available'] for r in json.load(open(mp))['regions']}
        for rid in RG.load_config():
            if have.get(rid) != MF.validate(rid)['ok']: errs.append(f'{rid}: manifest disagrees with files')
    except Exception: errs.append('manifest missing')
    return errs

def main():
    site = (os.environ.get('SITE_URL') or '').rstrip('/'); today = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d')
    live = baseline(site, today); print('live risk dates', live, 'today', today)
    for rid, need in need_risk(live, today).items():
        if need: print(rid, 'risk updated' if run_region(rid) else '::notice::risk not ready, previous output kept (labelled with own date)')
    if subprocess.run([sys.executable, os.path.join(RG.HERE, 'hotspots.py')]).returncode: print('::warning::hotspot refresh failed')
    subprocess.run([sys.executable, os.path.join(RG.HERE, 'manifest.py')], check=True)
    errs = publish_check(live, today)
    # recheck the live date right before deploy: a newer run may have published meanwhile
    after = baseline_dates(site)
    for rid, d in after.items():
        mine = json.load(open(os.path.join(RG.ROOT, RG.load_config()[rid]['output']))).get('date')
        if d and mine and d > mine: errs.append(f'{rid}: live site is newer ({d}) than this run ({mine})')
    for e in errs: print('::error::publish check failed:', e)
    open(os.environ.get('GITHUB_OUTPUT', os.devnull), 'a').write('publish=' + ('no' if errs else 'yes') + '\n')
    sys.exit(1 if errs else 0)

def baseline_dates(site, fetch=fetch_json):
    out = {}
    for rid, c in RG.load_config().items():
        d = fetch(f"{site}/{os.path.relpath(c['output'], 'public')}") if site else None
        out[rid] = d.get('date') if isinstance(d, dict) else None
    return out

if __name__ == '__main__': main()
