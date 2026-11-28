"""Shared feature code for training and the daily prediction job (one source, so they cannot drift)."""
import numpy as np

WL = 3          # weather publication lag in days (NASA POWER), as in the repo pipeline
from region import get_region
_R = get_region()  # REGION env var, default haut-katanga
W0, S0, STEP = _R['W'], _R['S'], _R['step']
BBOX = (_R['W'], _R['S'], _R['E'], _R['N'])  # W, S, E, N (from regions.json)
BASE = ['doy_sin','doy_cos','tmax','tmin','wind','rh','rain7','rain30','rain90','tmax7','rh7',
        'days_since_rain','fire1','fire3','fire7','nb_fire7','days_since_fire']

def _roll_sum(X, k, lag=0):
    T = X.shape[0]; c = np.cumsum(np.pad(X.astype(np.float64), ((1,0),(0,0),(0,0))), axis=0)
    out = np.full_like(X, np.nan)
    for t in range(T):
        hi = t - lag; lo = hi - k + 1
        if lo >= 0: out[t] = c[hi+1] - c[lo]
    return out

def _lag(X, l):
    out = np.full_like(X, np.nan); out[l:] = X[:-l]; return out

def build_features(A, tmax, tmin, pr, ws, rh, doy):
    """A: fire detected (T,nI,nJ) 0/1. weather arrays (T,nI,nJ). doy: day of year (T,). Returns dict of (T,nI,nJ)."""
    F = {}
    F['doy_sin'] = np.broadcast_to(np.sin(2*np.pi*doy/365.25)[:,None,None], A.shape)
    F['doy_cos'] = np.broadcast_to(np.cos(2*np.pi*doy/365.25)[:,None,None], A.shape)
    F['tmax'] = _lag(tmax, WL); F['tmin'] = _lag(tmin, WL); F['wind'] = _lag(ws, WL); F['rh'] = _lag(rh, WL)
    F['rain7'] = _roll_sum(pr, 7, WL); F['rain30'] = _roll_sum(pr, 30, WL); F['rain90'] = _roll_sum(pr, 90, WL)
    F['tmax7'] = _roll_sum(tmax, 7, WL) / 7; F['rh7'] = _roll_sum(rh, 7, WL) / 7
    T = A.shape[0]; dsr = np.zeros_like(pr)
    for t in range(T): dsr[t] = 0 if t == 0 else np.where(pr[t] >= 1, 0, dsr[t-1] + 1)
    F['days_since_rain'] = _lag(dsr, WL)
    F['fire1'] = _lag(A, 1); F['fire3'] = _roll_sum(A, 3, 1); F['fire7'] = _roll_sum(A, 7, 1)
    f7 = F['fire7']; nb = np.zeros_like(f7)
    for di in (-1,0,1):
        for dj in (-1,0,1):
            if di == 0 and dj == 0: continue
            s = np.roll(np.roll(f7, di, axis=1), dj, axis=2)
            if di == 1: s[:,0,:] = 0
            if di == -1: s[:,-1,:] = 0
            if dj == 1: s[:,:,0] = 0
            if dj == -1: s[:,:,-1] = 0
            nb += np.nan_to_num(s)
    F['nb_fire7'] = nb
    dsf = np.full(A.shape, 400., dtype=np.float32); c = np.full(A.shape[1:], 400.)
    for t in range(T):
        dsf[t] = c; c = np.where(A[t] > 0, 1, np.minimum(c + 1, 400))
    F['days_since_fire'] = np.minimum(dsf, 8)
    return F
