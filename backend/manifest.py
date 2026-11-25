"""Write public/data/regions-manifest.json: which regions exist, their status, and whether an estimate may be shown.
A region gets estimates_available=true ONLY if its held-out results file and its risk output both exist.
The web app must show "no estimate" for every other region (never a number, never "low")."""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def build(root=ROOT):
    cfg = json.load(open(os.path.join(root, 'backend', 'regions.json'))); out = []
    for rid, r in cfg.items():
        risk, res = os.path.join(root, r['output']), os.path.join(root, r.get('results', ''))
        date = None
        if os.path.exists(risk):
            try: date = json.load(open(risk)).get('date')
            except Exception: date = None
        out.append({'id': rid, 'label': r['label'], 'bbox_WSEN': r['bbox_WSEN'], 'cell_deg': r['cell_deg'], 'status': r['status'], 'validated': r['validated'],
                    'risk_file': '/' + os.path.relpath(r['output'], 'public'), 'risk_date': date, 'has_heldout_results': bool(r.get('results')) and os.path.exists(res),
                    'estimates_available': bool(r.get('results')) and os.path.exists(res) and date is not None})
    return {'regions': out}
if __name__ == '__main__':
    o = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'public', 'data', 'regions-manifest.json')
    json.dump(build(), open(o, 'w'), indent=1); print('wrote', o)
