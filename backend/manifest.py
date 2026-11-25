"""Write public/data/regions-manifest.json: which regions exist and whether an estimate may be shown.
estimates_available is true ONLY if ALL of these hold (reasons are listed otherwise):
  - results file parses and is for this region, bbox, cell size and train/val/test years in regions.json;
  - the model file exists, its sha256 equals the one recorded in the results AND in the risk file, and its feature count
    matches features.BASE (a model/config mismatch is refused);
  - on held-out AREAS in the test year the model's PR-AUC beats every baseline (persistence and climatology);
  - the risk file is for this region and bbox, is marked experimental, and has cells with a date.
The web app must show "no estimate" for every other region, never a number and never "low"."""
import hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import region as RG

def _load(path):
    try: return json.load(open(path))
    except Exception: return None

def validate(rid, cfg=None):
    r = RG.get_region(rid); reasons = []
    res, risk = _load(r['results_path']), _load(r['output_path'])
    if not isinstance(res, dict): reasons.append('results file missing or invalid')
    if not isinstance(risk, dict): reasons.append('risk file missing or invalid')
    sha = None
    if os.path.exists(r['model_path']): sha = hashlib.sha256(open(r['model_path'], 'rb').read()).hexdigest()
    else: reasons.append('model file missing')
    if isinstance(res, dict):
        fp = res.get('footprint') or {}
        if res.get('region') != rid: reasons.append('results are for a different region')
        if list(fp.get('bbox_WSEN') or []) != list(r['bbox_WSEN']) or fp.get('cell_deg') != r['cell_deg']: reasons.append('results footprint differs from config')
        if fp.get('val') != str(r['val_year']) or fp.get('test') != str(r['test_year']) or not str(fp.get('train', '')).startswith(f"{min(r['train_years'])}-"): reasons.append('results years differ from config')
        if sha and res.get('model_sha256') != sha: reasons.append('model file does not match the model the results were computed for')
        ty = r['test_year']; mk = f'no_coords|held_out_areas_{ty}'; m = res.get(mk)
        base = [res.get(f'{b}|held_out_areas_{ty}') for b in ('persistence_fire7', 'persistence_fire1', 'climatology_doy')]
        if not isinstance(m, dict) or any(not isinstance(b, dict) for b in base): reasons.append('held-out metrics or baselines missing')
        elif not all(m.get('pr_auc', 0) > b.get('pr_auc', 1) for b in base): reasons.append('model does not beat all baselines on held-out areas')
        try:
            import features
            if res.get('features') is not None and list(res['features']) != list(features.BASE): reasons.append('results features differ from code')
            hdr = [l for l in open(r['model_path']) if l.startswith('max_feature_idx=')] if os.path.exists(r['model_path']) else []
            if hdr and int(hdr[0].split('=')[1]) + 1 != len(features.BASE): reasons.append('model feature count differs from code')
        except Exception: reasons.append('could not check model features')
    if isinstance(risk, dict):
        if risk.get('region_id') != rid or list(risk.get('bbox_WSEN') or []) != list(r['bbox_WSEN']): reasons.append('risk file is for a different region/bbox')
        if risk.get('model_sha256') != sha: reasons.append('risk file was produced by a different model')
        if not risk.get('date') or not risk.get('cells') or risk.get('experimental') is not True: reasons.append('risk file incomplete')
    return {'ok': not reasons, 'reasons': reasons, 'risk_date': (risk or {}).get('date') if isinstance(risk, dict) else None}

def build():
    cfg = RG.load_config(); out = []
    for rid, c in cfg.items():
        v = validate(rid)
        out.append({'id': rid, 'label': c['label'], 'bbox_WSEN': c['bbox_WSEN'], 'cell_deg': c['cell_deg'], 'status': c['status'], 'validated': c['validated'],
                    'risk_file': '/' + os.path.relpath(c['output'], 'public'), 'risk_date': v['risk_date'], 'estimates_available': v['ok'], 'reasons': v['reasons']})
    return {'regions': out}

if __name__ == '__main__':
    o = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RG.ROOT, 'public', 'data', 'regions-manifest.json')
    os.makedirs(os.path.dirname(o), exist_ok=True); json.dump(build(), open(o, 'w'), indent=1); print('wrote', o)
