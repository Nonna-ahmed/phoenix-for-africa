"""FIXTURE-ONLY end-to-end test: a tiny synthetic region (6x6 deg, 0.5 deg cells, 4 synthetic years) is pushed through the
real build_dataset.py -> train.py -> predict.py -> manifest.py code. It proves the PLUMBING works and the estimates gate follows
the results. It says NOTHING about the accuracy of the real Haut-Katanga model: that comes only from the full-data retrain."""
import importlib, json, os, subprocess, sys
import numpy as np, pandas as pd, pytest
BE = os.path.join(os.path.dirname(__file__), '..')

def make_fixture(root):
    rng = np.random.RandomState(3)
    cfg = {'fx': {'label': 'Synthetic fixture', 'bbox_WSEN': [20, -10, 26, -4], 'cell_deg': 0.5, 'train_years': [2020, 2021], 'val_year': 2022, 'test_year': 2023,
                  'status': 'experimental', 'validated': False, 'output': 'public/data/risk-fx.json', 'model': 'backend/model-fx.txt', 'results': 'backend/results-fx.json'}}
    os.makedirs(root / 'raw'); os.makedirs(root / 'data/pchunks'); os.makedirs(root / 'public/data'); os.makedirs(root / 'backend')
    json.dump(cfg, open(root / 'regions.json', 'w'))
    days = pd.date_range('2019-12-01', '2023-12-31'); lats = np.arange(-9.75, -4, .5); lons = np.arange(20.25, 26, .5)
    rows = []; w = {}
    for la in lats:
        for lo in lons:
            doy = days.dayofyear.values; dry = np.sin(2 * np.pi * (doy - 60) / 365)
            rh = np.clip(55 - 30 * dry + rng.normal(0, 5, len(days)), 5, 100); rain = np.where(rng.rand(len(days)) < np.clip(.3 - .3 * dry, .02, .6), rng.exponential(6, len(days)), 0)
            tmax = 30 + 3 * dry + rng.normal(0, 1, len(days)); w[(la, lo)] = (tmax, tmax - 10, rain, 2 + rng.rand(len(days)), rh)
    for y in range(2019, 2024):
        pass
    fires = {y: [] for y in range(2020, 2024)}
    for (la, lo), (tmax, tmin, rain, ws, rh) in w.items():
        p = np.clip((60 - rh) / 120, 0, .5) * (1 + (la > -7)); hit = rng.rand(len(days)) < p
        for d, h in zip(days, hit):
            if h and d.year >= 2020: fires[d.year].append((la + rng.uniform(-.2, .2), lo + rng.uniform(-.2, .2), d.strftime('%Y-%m-%d'), 'n', 0))
        pd.DataFrame({'date': days.strftime('%Y%m%d'), 'T2M_MAX': tmax, 'T2M_MIN': tmin, 'PRECTOTCORR': rain, 'WS2M': ws, 'RH2M': rh, 'wlat': la, 'wlon': lo}).to_csv(root / f'data/pchunks/{la}_{lo}.csv', index=False)
    for y, r in fires.items(): pd.DataFrame(r, columns=['latitude', 'longitude', 'acq_date', 'confidence', 'type']).to_csv(root / f'raw/n20_{y}.csv', index=False)
    return w, days

@pytest.fixture(scope='module')
def fx(tmp_path_factory):
    root = tmp_path_factory.mktemp('fx'); w, days = make_fixture(root)
    env = {**os.environ, 'PHOENIX_ROOT': str(root), 'REGIONS_FILE': str(root / 'regions.json'), 'REGION': 'fx', 'PYTHONPATH': BE}
    for s in ('build_dataset.py', 'train.py'):
        p = subprocess.run([sys.executable, os.path.join(BE, s)], cwd=root, env=env, capture_output=True, text=True)
        assert p.returncode == 0, p.stdout[-800:] + p.stderr[-1500:]
    return root, env, w, days

def test_train_outputs_and_manifest_gate(fx, monkeypatch):
    root, env, w, days = fx
    for k in ('PHOENIX_ROOT', 'REGIONS_FILE', 'REGION'): monkeypatch.setenv(k, env[k])
    monkeypatch.syspath_prepend(BE)
    for m in ('region', 'features', 'manifest'):
        if m in sys.modules: importlib.reload(sys.modules[m])
    import manifest
    res = json.load(open(root / 'backend/results-fx.json'))
    assert res['region'] == 'fx' and len(res['model_sha256']) == 64 and os.path.exists(root / 'backend/model-fx.txt')
    # no risk file yet -> never available, whatever the results say
    v = manifest.validate('fx'); assert not v['ok'] and any('risk file' in r for r in v['reasons'])
    # run predict in-process with fake downloads and a fixed day
    import predict; importlib.reload(predict)
    today = '2023-12-20'; D = pd.Timestamp(today)
    def fake_get(url, tries=4):
        if 'firms' in url.lower() or url.endswith('.csv') or 'csv' in url.lower():
            return b'latitude,longitude,acq_date,confidence,type\n-6.1,22.1,2023-12-19,n,0\n'
        import re
        la, lo = float(re.search(r'latitude=([-\d.]+)', url).group(1)), float(re.search(r'longitude=([-\d.]+)', url).group(1))
        k = min(w, key=lambda q: abs(q[0] - la) + abs(q[1] - lo)); idx = {d: i for i, d in enumerate(days)}
        par = {}
        for name, a in zip(['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'WS2M', 'RH2M'], w[k]):
            par[name] = {d.strftime('%Y%m%d'): float(a[idx[d]]) for d in pd.date_range(D - pd.Timedelta(days=109), D) if d in idx and d <= D - pd.Timedelta(days=3)}
        return json.dumps({'properties': {'parameter': par}}).encode()
    monkeypatch.setattr(predict, 'get', fake_get)
    predict.main(today=today)
    risk = json.load(open(root / 'public/data/risk-fx.json'))
    assert risk['date'] == today and risk['region_id'] == 'fx' and len(risk['cells']) == 144 and risk['model_sha256'] == res['model_sha256']
    assert all(0 <= c['probability'] <= 1 for c in risk['cells'])
    ty = res['footprint']['test']; m = res[f'no_coords|held_out_areas_{ty}']['pr_auc']
    beats = all(m > res[f'{b}|held_out_areas_{ty}']['pr_auc'] for b in ('persistence_fire7', 'persistence_fire1', 'climatology_doy'))
    assert manifest.validate('fx')['ok'] == beats      # gate follows the measured results, not file existence
    # make results fail on purpose -> gate must close
    bad = dict(res); bad[f'no_coords|held_out_areas_{ty}'] = dict(res[f'no_coords|held_out_areas_{ty}'], pr_auc=0.0)
    json.dump(bad, open(root / 'backend/results-fx.json', 'w')); assert not manifest.validate('fx')['ok']
    # results for a different model -> gate must close even if numbers are good
    good = dict(res, model_sha256='0' * 64); json.dump(good, open(root / 'backend/results-fx.json', 'w'))
    assert not manifest.validate('fx')['ok']
