"""Test several model families for one region and keep the best one.

Same train years, same spatial hold-out (1 degree blocks) and same test year for every candidate.
Selection rule: highest PR-AUC on held-out areas in the test year; a model only replaces a cheaper
one when it wins by more than TOLERANCE (0.003). Baselines (persistence and day-of-year climatology)
are scored on the same rows; a region whose best model does not beat all of them is written as failed
and the manifest withholds its estimate.

Run: REGION=gh-north python backend/train.py
"""
import hashlib, json, os, sys, time
import joblib, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
import lightgbm as lgb
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import region as RG
from features import BASE, NOWX, WL, build_features

TOL = 0.003
# cheapest to serve first: no weather download, then simple, then boosted trees
COST_ORDER = ['logit_nowx', 'lgbm_nowx', 'hgb_full', 'lgbm_full', 'rf_full']
CANDIDATES = [
    ('lgbm_full', 'LightGBM', BASE, True),
    ('lgbm_nowx', 'LightGBM (no weather)', NOWX, False),
    ('hgb_full', 'HistGradientBoosting', BASE, True),
    ('rf_full', 'RandomForest', BASE, True),
    ('logit_nowx', 'LogisticRegression (no weather)', NOWX, False),
]

R = RG.get_region()
z = np.load(os.path.join(RG.ROOT, 'data', f'arrays-{R["id"]}.npz'))
A = (z['A'] > 0).astype(np.float32); days = pd.to_datetime(z['days']); T, nI, nJ = A.shape
wa, wl = z['wa'], z['wl']; W0, S0, STEP = R['W'], R['S'], R['step']
clon = W0 + STEP * (np.arange(nI) + .5); clat = S0 + STEP * (np.arange(nJ) + .5)
wi = np.abs(clon[:, None] - wl[None, :]).argmin(1); wj = np.abs(clat[:, None] - wa[None, :]).argmin(1)
def wx(v): return np.stack([[z[v][:, wj[j], wi[i]] for j in range(nJ)] for i in range(nI)], axis=0).transpose(2, 0, 1)
tmax, tmin, pr, ws, rh = [wx(v) for v in ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'WS2M', 'RH2M']]
F = build_features(A, tmax, tmin, pr, ws, rh, days.dayofyear.values, with_weather=True)
II, JJ = np.meshgrid(np.arange(nI), np.arange(nJ), indexing='ij')
_bs = max(1, int(round(1.0 / STEP))); block = (II // _bs) * 10000 + (JJ // _bs)
rng = np.random.RandomState(7); ub = np.unique(block); held = set(rng.choice(ub, size=max(1, len(ub) // 4), replace=False).tolist())
isheld = np.isin(block, list(held)); notheld = ~isheld
print('blocks', len(ub), 'held-out', len(held), 'held-out cells', int(isheld.sum()), 'of', nI * nJ)
valid = np.arange(T) >= 95; dates = days
TRY, VY, TY = R['train_years'], R['val_year'], R['test_year']
def split(a, b): return np.where((dates >= a) & (dates <= b) & valid)[0]
tr = split(f'{min(TRY)}-01-01', f'{max(TRY)}-12-31'); va = split(f'{VY}-01-01', f'{VY}-12-31'); te = split(f'{TY}-01-01', f'{TY}-12-31')

def mat(idx, feats, cellmask):
    X = np.stack([F[k][idx][:, cellmask] for k in feats], -1).reshape(-1, len(feats)); y = A[idx][:, cellmask].reshape(-1)
    return X, y

def evalset(y, p):
    r = {'n': int(len(y)), 'pos_rate': round(float(y.mean()), 4),
         'pr_auc': round(float(average_precision_score(y, p)), 4), 'roc_auc': round(float(roc_auc_score(y, p)), 4),
         'brier': round(float(brier_score_loss(y, np.clip(p, 0, 1))), 4)}
    k = max(1, int(len(y) * 0.1)); o = np.argsort(-p)[:k]
    r['recall_top10pct'] = round(float(y[o].sum() / max(1, y.sum())), 4); r['precision_top10pct'] = round(float(y[o].mean()), 4)
    return r

def make(name):
    if name in ('lgbm_full', 'lgbm_nowx'):
        return lgb.LGBMClassifier(n_estimators=400, learning_rate=0.06, num_leaves=31, min_child_samples=100,
                                  subsample=0.8, subsample_freq=1, colsample_bytree=0.8, verbose=-1, random_state=1)
    if name == 'hgb_full':
        return HistGradientBoostingClassifier(max_iter=250, learning_rate=0.06, max_leaf_nodes=31, min_samples_leaf=100,
                                              l2_regularization=1.0, early_stopping=False, random_state=1)
    if name == 'rf_full':
        return RandomForestClassifier(n_estimators=150, min_samples_leaf=25, max_features='sqrt', n_jobs=1, random_state=1)
    if name == 'logit_nowx':
        return make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, C=0.5))
    raise SystemExit(name)

out = {}; table = []; fitted = {}
Xtr_va, ytr_va = {}, {}
for name, label, feats, uses_wx in CANDIDATES:
    t0 = time.time(); m = make(name)
    Xtr, ytr = mat(tr, feats, notheld); Xva, yva = mat(va, feats, notheld)
    if name.startswith('lgbm'):
        m.fit(Xtr, ytr, eval_set=[(Xva, yva)], eval_metric='average_precision', callbacks=[lgb.early_stopping(40, verbose=False)])
        best_iter = int(m.best_iteration_ or 0)
    else:
        m.fit(Xtr, ytr); best_iter = None
    row = {'model': name, 'kind': 'candidate', 'family': label, 'uses_weather': uses_wx, 'features': len(feats), 'seconds': round(time.time() - t0, 1)}
    if best_iter: row['best_iter'] = best_iter
    for scope, mask in [(f'seen_areas_{TY}', notheld), (f'held_out_areas_{TY}', isheld)]:
        X, y = mat(te, feats, mask); p = m.predict_proba(X)[:, 1]
        out[f'{name}|{scope}'] = evalset(y, p)
    row.update({k: out[f'{name}|held_out_areas_{TY}'][k] for k in ('pr_auc', 'roc_auc', 'brier', 'recall_top10pct', 'precision_top10pct')})
    table.append(row); fitted[name] = (m, feats, uses_wx)
    print(name, 'held-out PR-AUC', row['pr_auc'], f'{row["seconds"]}s', flush=True)

# baselines on the same rows
for scope, mask in [(f'seen_areas_{TY}', notheld), (f'held_out_areas_{TY}', isheld)]:
    X, y = mat(te, ['fire7'], mask); out[f'persistence_fire7|{scope}'] = evalset(y, X[:, 0] + 1e-3 * np.random.RandomState(0).rand(len(y)))
    X, y = mat(te, ['fire1'], mask); out[f'persistence_fire1|{scope}'] = evalset(y, X[:, 0] + 1e-3 * np.random.RandomState(0).rand(len(y)))
    doy = dates.dayofyear.values; clim = np.zeros(367); trdoy = doy[tr]; rate = A[tr][:, notheld].mean(1)
    for d in range(1, 367):
        dd = np.minimum(np.abs(trdoy - d), 366 - np.abs(trdoy - d)); clim[d] = rate[dd <= 15].mean()
    X, y = mat(te, ['fire1'], mask); p = np.repeat(clim[doy[te]], int(mask.sum()))
    out[f'climatology_doy|{scope}'] = evalset(y, p + 1e-6 * np.random.RandomState(1).rand(len(y)))
for b in ('persistence_fire7', 'persistence_fire1', 'climatology_doy'):
    row = {'model': b, 'kind': 'baseline', 'family': 'baseline', 'uses_weather': False, 'features': 0}
    row.update({k: out[f'{b}|held_out_areas_{TY}'][k] for k in ('pr_auc', 'roc_auc', 'brier', 'recall_top10pct', 'precision_top10pct')})
    table.append(row)

cands = [t for t in table if t['kind'] == 'candidate']; bases = [t for t in table if t['kind'] == 'baseline']
# Serving rule: NASA POWER publishes 4-6 days late, so a model that needs weather cannot always produce
# today's risk (the pilot's own file is often a few days old for exactly this reason). Weather models are
# still tested and reported, but the model that ships must run on FIRMS fire data alone.
servable = [t for t in cands if not t['uses_weather']]
best_all = max(cands, key=lambda t: t['pr_auc'])
best = max(servable, key=lambda t: t['pr_auc'])
eligible = [t for t in servable if t['pr_auc'] >= best['pr_auc'] - TOL]
selected = min(eligible, key=lambda t: COST_ORDER.index(t['model']))
beats = selected['pr_auc'] > max(b['pr_auc'] for b in bases)
gap = best_all['pr_auc'] - best['pr_auc']
reason = (f"Best overall was {best_all['model']} ({best_all['pr_auc']:.4f}); the best model that needs no weather data "
          f"was {best['model']} ({best['pr_auc']:.4f}, {gap:+.4f}). Models that need NASA POWER are not shipped because "
          f"POWER publishes 4-6 days late and the daily job could not always produce today's risk.")
if selected['model'] != best['model']:
    reason += f" Within {TOL} PR-AUC the cheaper model wins, so {selected['model']} was kept."
if not beats: reason += ' It does NOT beat every baseline, so the region is withheld from the site.'
print('selected', selected['model'], '|', reason)

m, feats, uses_wx = fitted[selected['model']]
model_path = R['model_path']; os.makedirs(os.path.dirname(model_path), exist_ok=True)
if selected['model'].startswith('lgbm'):
    m.booster_.save_model(model_path); fmt = 'lightgbm-txt'
else:
    joblib.dump(m, model_path); fmt = 'sklearn-joblib'
out['model_sha256'] = hashlib.sha256(open(model_path, 'rb').read()).hexdigest()
out['region'] = R['id']; out['selected_model'] = selected['model']; out['model_format'] = fmt
out['model_type'] = selected['family']; out['features'] = list(feats); out['uses_weather'] = uses_wx
out['footprint'] = {'bbox_WSEN': list(R['bbox_WSEN']), 'cell_deg': STEP, 'cells': int(nI * nJ), 'held_out_cells': int(isheld.sum()),
                    'train': f'{min(TRY)}-01-01..{max(TRY)}-12-31', 'val': str(VY), 'test': str(TY), 'weather_lag_days': WL}
out['selection'] = {'selected': selected['model'], 'rule': f'best held-out PR-AUC among models that need no weather data; cheaper model kept within {TOL}',
                    'tolerance': TOL, 'beats_all_baselines': bool(beats), 'reason': reason,
                    'table': sorted(table, key=lambda t: (t['kind'] != 'candidate', -t['pr_auc']))}
if selected['model'].startswith('lgbm'):
    out['importance_gain'] = dict(sorted(zip(feats, [int(v) for v in m.booster_.feature_importance('gain')]), key=lambda x: -x[1]))
X, y = mat(te, feats, isheld); p = m.predict_proba(X)[:, 1]
bins = np.linspace(0, 1, 11); rel = []
for a, b in zip(bins[:-1], bins[1:]):
    s = (p >= a) & (p < b + 1e-9 if b == 1 else p < b)
    if s.sum(): rel.append({'bin': f'{a:.1f}-{b:.1f}', 'n': int(s.sum()), 'mean_pred': round(float(p[s].mean()), 3), 'obs_rate': round(float(y[s].mean()), 3)})
out['reliability_held_out'] = rel
mo = np.repeat(dates[te].month.values, int(isheld.sum())); pm = {}
for k in range(1, 13):
    s = mo == k
    if y[s].sum() > 0 and y[s].sum() < s.sum(): pm[k] = {'pos_rate': round(float(y[s].mean()), 3), 'pr_auc': round(float(average_precision_score(y[s], p[s])), 3)}
out['monthly_held_out'] = pm
out['trained_utc'] = pd.Timestamp.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
os.makedirs(os.path.join(RG.ROOT, 'data'), exist_ok=True)
json.dump(out, open(os.path.join(RG.ROOT, 'data', f'results-{R["id"]}.json'), 'w'), indent=1)
json.dump(out, open(R['results_path'], 'w'), indent=1)
print('wrote', R['results_path'], 'model', model_path, fmt)
