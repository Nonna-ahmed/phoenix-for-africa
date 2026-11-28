import json, os, sys, datetime as dt, shutil, subprocess
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pytest
SRC = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

@pytest.fixture()
def root(tmp_path, monkeypatch):
    r = tmp_path / 'p'; shutil.copytree(os.path.join(SRC, 'public'), r / 'public'); shutil.copytree(os.path.join(SRC, 'backend'), r / 'backend', ignore=shutil.ignore_patterns('__pycache__', 'tests'))
    monkeypatch.setenv('PHOENIX_ROOT', str(r))
    import importlib, region, manifest, refresh
    for m in (region, manifest, refresh): importlib.reload(m)
    return r

def risk(root): return json.load(open(root / 'public/data/risk-haut-katanga.json'))

def test_baseline_copies_live_and_flags_need(root):
    import refresh
    live_doc = dict(risk(root), date='2026-11-20')
    live = refresh.baseline('http://x', '2026-11-25', fetch=lambda u: live_doc)
    assert live['haut-katanga'] == '2026-11-20' and all(v is None for k, v in live.items() if k != 'haut-katanga')
    assert risk(root)['date'] == '2026-11-20'
    assert refresh.need_risk(live, '2026-11-25') == {rid: True for rid in live}
    assert refresh.need_risk({rid: '2026-11-25' for rid in live}, '2026-11-25') == {rid: False for rid in live}

def test_baseline_ignores_bad_live(root):
    import refresh
    before = risk(root)['date']
    import region as RG
    assert refresh.baseline('http://x', 't', fetch=lambda u: None) == {rid: None for rid in RG.load_config()}
    assert refresh.baseline('http://x', 't', fetch=lambda u: {'date': '2030-01-01', 'cells': []}) == {rid: None for rid in RG.load_config()}
    assert risk(root)['date'] == before

def test_failed_predict_keeps_previous_output(root):
    import refresh
    before = risk(root)
    assert refresh.run_region('haut-katanga', runner=lambda *a, **k: type('P', (), {'returncode': 1})()) is False
    assert risk(root) == before

def _fresh_hotspots(root, hours=0):
    t = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)).isoformat()
    for f in ('southern-africa', 'northern-central-africa'):
        p = root / f'public/data/hotspots-{f}.json'; d = json.load(open(p)); d['fetchedAt'] = t; d['status'] = 'ok'; json.dump(d, open(p, 'w'))
    subprocess.run([sys.executable, str(root / 'backend/manifest.py')], check=True, env=os.environ)
    subprocess.run([sys.executable, str(root / 'backend/alerts.py')], check=True, env=os.environ)

def test_publish_check_passes_then_refuses_downgrade_and_stale_hotspots(root):
    import refresh
    _fresh_hotspots(root)
    d = risk(root)['date']
    assert refresh.publish_check({'haut-katanga': d}, d) == []
    assert any('downgrade' in e for e in refresh.publish_check({'haut-katanga': '2999-01-01'}, d))
    _fresh_hotspots(root, hours=40)
    assert any('older than 36 h' in e for e in refresh.publish_check({'haut-katanga': d}, d))

def test_publish_check_refuses_manifest_mismatch(root):
    import refresh
    _fresh_hotspots(root)
    m = json.load(open(root / 'public/data/regions-manifest.json')); m['regions'][0]['estimates_available'] = False
    json.dump(m, open(root / 'public/data/regions-manifest.json', 'w'))
    assert any('manifest disagrees' in e for e in refresh.publish_check({}, 'x'))

def test_manifest_refuses_mismatched_model_or_failing_results(root):
    import manifest
    assert manifest.validate('haut-katanga')['ok']
    res = json.load(open(root / 'backend/results.json'))
    sel_key = f"{res.get('selected_model')}|held_out_areas_2025"
    good_pr_auc = res[sel_key]['pr_auc']
    res[sel_key]['pr_auc'] = 0.5; json.dump(res, open(root / 'backend/results.json', 'w'))
    v = manifest.validate('haut-katanga'); assert not v['ok'] and any('baselines' in r for r in v['reasons'])
    res[sel_key]['pr_auc'] = good_pr_auc; res['model_sha256'] = 'bad'; json.dump(res, open(root / 'backend/results.json', 'w'))
    assert any('different' in r or 'does not match' in r for r in manifest.validate('haut-katanga')['reasons'])
    os.remove(root / 'backend/results.json'); assert not manifest.validate('haut-katanga')['ok']
