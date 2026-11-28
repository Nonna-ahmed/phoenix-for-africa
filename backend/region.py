"""Region configuration. A region is a bbox, a cell size and train/val/test years. Add an entry to regions.json to
build another one; it is NOT usable until train.py has produced held-out-area and held-out-year results for it and
backend/manifest.py validates them (status stays "experimental"; the web app shows no estimate for any region the
manifest does not clear)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('PHOENIX_ROOT') or os.path.dirname(HERE)
def load_config():
    return json.load(open(os.environ.get('REGIONS_FILE') or os.path.join(HERE, 'regions.json')))
def get_region(rid=None):
    cfg = load_config(); rid = rid or os.environ.get('REGION', 'haut-katanga')
    if rid not in cfg: raise SystemExit(f'unknown region {rid!r}; known: {sorted(cfg)}')
    r = dict(cfg[rid]); r['id'] = rid; W, S, E, N = r['bbox_WSEN']; r['W'], r['S'], r['E'], r['N'] = W, S, E, N
    r['step'] = r['cell_deg']
    r.setdefault('model', f'backend/model-{rid}.txt'); r.setdefault('results', f'backend/results-{rid}.json')
    for k in ('output', 'model', 'results'): r[k + '_path'] = os.path.join(ROOT, r[k])
    return r
