import os, sys, pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from region import get_region

def test_default_region_matches_pilot():
    r = get_region()
    assert tuple(r['bbox_WSEN']) == (24.8, -13.0, 29.0, -8.2) and r['step'] == 0.25 and r['status'] == 'experimental' and r['validated'] is False

def test_unknown_region_fails():
    with pytest.raises(SystemExit): get_region('atlantis')
