"""Region configuration. A region is a bbox, a cell size and train/val/test years. Add an entry to regions.json to
build another one; it is NOT usable until train.py has produced held-out-area and held-out-year results for it
(status stays "experimental"/"unvalidated" and the web app must show no estimate for a region without results)."""
import json, os
_CFG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'regions.json')))
def get_region(rid=None):
    rid = rid or os.environ.get('REGION', 'haut-katanga')
    if rid not in _CFG: raise SystemExit(f'unknown region {rid!r}; known: {sorted(_CFG)}')
    r = dict(_CFG[rid]); r['id'] = rid; W, S, E, N = r['bbox_WSEN']; r['W'], r['S'], r['E'], r['N'] = W, S, E, N
    r['step'] = r['cell_deg']; return r
