import os, sys, pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from region import get_region

def test_default_region_matches_pilot():
    r = get_region()
    assert tuple(r['bbox_WSEN']) == (24.8, -13.0, 29.0, -8.2) and r['step'] == 0.25 and r['status'] == 'experimental' and r['validated'] is False

def test_unknown_region_fails():
    with pytest.raises(SystemExit): get_region('atlantis')

def test_manifest_no_estimate_without_results(tmp_path):
    import json, shutil
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    import manifest
    root = tmp_path; (root / 'backend').mkdir(); (root / 'public' / 'data').mkdir(parents=True)
    cfg = {'a': {'label': 'A', 'bbox_WSEN': [0, 0, 1, 1], 'cell_deg': .25, 'status': 'experimental', 'validated': False, 'output': 'public/data/risk-a.json', 'results': 'backend/results-a.json'}}
    json.dump(cfg, open(root / 'backend' / 'regions.json', 'w')); json.dump({'date': '2026-11-25'}, open(root / 'public' / 'data' / 'risk-a.json', 'w'))
    assert manifest.build(str(root))['regions'][0]['estimates_available'] is False   # risk file but no held-out results
    json.dump({}, open(root / 'backend' / 'results-a.json', 'w'))
    assert manifest.build(str(root))['regions'][0]['estimates_available'] is True

def test_pilot_manifest_entry():
    import manifest
    r = manifest.build()['regions'][0]
    assert r['id'] == 'haut-katanga' and r['has_heldout_results'] and r['validated'] is False
