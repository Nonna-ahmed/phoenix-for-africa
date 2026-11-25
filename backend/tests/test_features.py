"""Leakage and alignment tests. Run: python -m pytest backend/tests -q"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import numpy as np
from features import build_features, BASE, WL

def make(T=140, nI=6, nJ=7, seed=0):
    r = np.random.RandomState(seed)
    A = (r.rand(T, nI, nJ) < 0.3).astype(np.float32)
    w = [r.rand(T, nI, nJ).astype(np.float32) * 30 for _ in range(5)]
    doy = (np.arange(T) % 365) + 1
    return A, w, doy

def feats(A, w, doy, t):
    F = build_features(A, *w, doy); return np.stack([F[k][t] for k in BASE])

def test_target_day_and_future_fire_do_not_change_features():
    A, w, doy = make(); t = 120; base = feats(A, w, doy, t)
    A2 = A.copy(); A2[t:] = 1 - A2[t:]            # flip the target day and everything after
    assert np.allclose(base, feats(A2, w, doy, t), equal_nan=True)

def test_weather_newer_than_publication_lag_does_not_change_features():
    A, w, doy = make(); t = 120; base = feats(A, w, doy, t)
    w2 = [x.copy() for x in w]
    for x in w2: x[t - WL + 1:] = 999.0           # anything newer than day t-WL (not yet published) is garbage
    assert np.allclose(base, feats(A, w2, doy, t), equal_nan=True)

def test_features_use_yesterdays_fire():
    A, w, doy = make(); t = 120
    A[t - 1] = 0; A[t - 2] = 0; A[t - 3] = 0
    f0 = feats(A, w, doy, t)[BASE.index('fire1')]
    A[t - 1] = 1
    f1 = feats(A, w, doy, t)[BASE.index('fire1')]
    assert (f0 == 0).all() and (f1 == 1).all()

def test_window_matches_full_history():
    # serving uses a 110-day window; it must equal the full-history features used in training
    A, w, doy = make(T=300); t = 280
    full = feats(A, w, doy, t)
    lo = t - 109
    win = feats(A[lo:t + 1], [x[lo:t + 1] for x in w], doy[lo:t + 1], -1)
    assert np.allclose(full, win, equal_nan=True)

def test_no_coordinate_features():
    assert 'lat' not in BASE and 'lon' not in BASE
