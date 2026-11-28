"""Tests for backend/alerts.py: alert derivation from the static risk + hotspot files."""
import json, os, sys, datetime as dt, importlib
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pytest

NOW = dt.datetime(2026, 11, 28, 12, 0, 0, tzinfo=dt.timezone.utc)

CFG = {'r1': {'label': 'Region One', 'name': 'R1', 'country': 'Xland', 'country_code': 'XL',
              'bbox_WSEN': [20, -10, 26, -4], 'cell_deg': 0.5, 'firms_realtime_region': 'Southern_Africa',
              'train_years': [2021], 'val_year': 2022, 'test_year': 2023,
              'output': 'public/data/risk-r1.json', 'model': 'backend/m-r1.bin', 'results': 'backend/res-r1.json'},
       'r2': {'label': 'Region Two', 'name': 'R2', 'country': 'Yland', 'country_code': 'YL',
              'bbox_WSEN': [30, -20, 36, -14], 'cell_deg': 0.5, 'firms_realtime_region': 'Southern_Africa',
              'train_years': [2021], 'val_year': 2022, 'test_year': 2023,
              'output': 'public/data/risk-r2.json', 'model': 'backend/m-r2.bin', 'results': 'backend/res-r2.json'}}


@pytest.fixture()
def root(tmp_path, monkeypatch):
    (tmp_path / 'backend').mkdir()
    (tmp_path / 'public/data').mkdir(parents=True)
    json.dump(CFG, open(tmp_path / 'backend/regions.json', 'w'))
    monkeypatch.setenv('PHOENIX_ROOT', str(tmp_path))
    monkeypatch.setenv('REGIONS_FILE', str(tmp_path / 'backend/regions.json'))
    import region, alerts
    importlib.reload(region)
    importlib.reload(alerts)
    monkeypatch.setattr(alerts.MF, 'validate', lambda rid: {'ok': True})
    return tmp_path, alerts


def write_risk(root, rid, probs, date='2026-11-28'):
    cells = [{'lat': -9.0, 'lon': 21.0, 'probability': p, 'risk_level': 'x', 'date': date} for p in probs]
    json.dump({'region_id': rid, 'region': CFG[rid]['label'], 'country': CFG[rid]['country'],
               'country_code': CFG[rid]['country_code'], 'bbox_WSEN': CFG[rid]['bbox_WSEN'],
               'date': date, 'generated_utc': NOW.isoformat(), 'experimental': True, 'cells': cells},
              open(root / CFG[rid]['output'], 'w'))


def write_hotspots(root, entries):
    json.dump({'status': 'ok', 'hotspots': entries, 'fetchedAt': NOW.isoformat()},
              open(root / 'public/data/hotspots-southern-africa.json', 'w'))
    json.dump({'status': 'ok', 'hotspots': [], 'fetchedAt': NOW.isoformat()},
              open(root / 'public/data/hotspots-northern-central-africa.json', 'w'))


def hs(lat, lon, when, frp=50.0):
    return {'lat': lat, 'lon': lon, 'acqDate': when.date().isoformat(),
            'acqTime': when.strftime('%H:%M'), 'frp': frp, 'confidence': 'n', 'source': 'VIIRS_NOAA20_NRT'}


def read(root):
    return json.load(open(root / 'public/data/alerts.json'))


def test_high_risk_alert_with_peak_and_counts(root):
    root, alerts = root
    write_risk(root, 'r1', [0.1, 0.7, 0.8])
    write_risk(root, 'r2', [0.1, 0.2])
    write_hotspots(root, [])
    alerts.build(NOW)
    doc = read(root)
    assert doc['status'] == 'ok' and len(doc['alerts']) == 1
    a = doc['alerts'][0]
    assert a['id'] == 'risk-r1-2026-11-28' and a['type'] == 'risk' and a['severity'] == 'high'
    assert a['probability'] == 0.8 and '2 of 3 cells at high' in a['message'] and a['stale'] is False


def test_elevated_and_stale_flag(root):
    root, alerts = root
    write_risk(root, 'r1', [0.1, 0.4], date='2026-11-27')
    write_hotspots(root, [])
    alerts.build(NOW)
    [a] = read(root)['alerts']
    assert a['severity'] == 'elevated' and a['title'] == 'ELEVATED SATELLITE-DETECTION RISK'
    assert a['stale'] is True and "not today's risk file" in a['message']


def test_no_alert_below_threshold_or_when_manifest_rejects(root, monkeypatch):
    root, alerts = root
    write_risk(root, 'r1', [0.1, 0.2])
    write_risk(root, 'r2', [0.9])
    monkeypatch.setattr(alerts.MF, 'validate', lambda rid: {'ok': rid != 'r2'})
    write_hotspots(root, [])
    alerts.build(NOW)
    assert read(root)['alerts'] == []


def test_detection_alert_counts_fresh_hotspots_in_bbox(root):
    root, alerts = root
    write_risk(root, 'r1', [0.1])
    fresh_in = hs(-8.0, 22.0, NOW - dt.timedelta(hours=2), frp=120.0)
    dup = dict(fresh_in)  # same key, must be deduped
    old = hs(-8.0, 22.0, NOW - dt.timedelta(hours=30))
    outside = hs(0.0, 0.0, NOW - dt.timedelta(hours=1))
    write_hotspots(root, [fresh_in, dup, old, outside])
    alerts.build(NOW)
    [a] = read(root)['alerts']
    assert a['type'] == 'detection' and a['region_id'] == 'r1' and a['severity'] == 'info'
    assert '1 NASA VIIRS hotspot' in a['message'] and '120 MW' in a['message']


def test_bad_hotspot_file_means_no_detection_alerts(root):
    root, alerts = root
    write_risk(root, 'r1', [0.1])
    (root / 'public/data/hotspots-southern-africa.json').write_text('not json')
    alerts.build(NOW)
    assert read(root)['alerts'] == []
