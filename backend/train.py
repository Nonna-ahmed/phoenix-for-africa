import os
import numpy as np, pandas as pd, json, lightgbm as lgb
from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss
from sklearn.isotonic import IsotonicRegression
z=np.load('data/arrays.npz'); A=(z['A']>0).astype(np.float32); days=pd.to_datetime(z['days']); T,nI,nJ=A.shape
wa,wl=z['wa'],z['wl']; from region import get_region
_R=get_region(); W0,S0,STEP=_R['W'],_R['S'],_R['step']
# map cell -> weather point (nearest)
clon=W0+STEP*(np.arange(nI)+.5); clat=S0+STEP*(np.arange(nJ)+.5)
wi=np.abs(clon[:,None]-wl[None,:]).argmin(1); wj=np.abs(clat[:,None]-wa[None,:]).argmin(1)
def wx(v): return z[v][:,wj[None,:].repeat(nI,0).T if False else 0,0] if False else np.stack([[z[v][:,wj[j],wi[i]] for j in range(nJ)] for i in range(nI)],axis=0).transpose(2,0,1)  # T,nI,nJ
tmax,tmin,pr,ws,rh=[wx(v) for v in ['T2M_MAX','T2M_MIN','PRECTOTCORR','WS2M','RH2M']]
import sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from features import build_features, BASE as BASEF, WL
F=build_features(A,tmax,tmin,pr,ws,rh,days.dayofyear.values)
II,JJ=np.meshgrid(np.arange(nI),np.arange(nJ),indexing='ij')
F['lat']=np.broadcast_to(clat[JJ][None],A.shape); F['lon']=np.broadcast_to(clon[II][None],A.shape)
# block id: 1-degree blocks (round(1/step) cells per side); held out as whole blocks
_bs=max(1,int(round(1.0/STEP))); block=(II//_bs)*10000+(JJ//_bs)
rng=np.random.RandomState(7); ub=np.unique(block); held=set(rng.choice(ub,size=len(ub)//4,replace=False).tolist())
isheld=np.isin(block,list(held))
print('blocks',len(ub),'held-out blocks',len(held),'held-out cells',int(isheld.sum()),'of',nI*nJ)
valid=np.arange(T)>=95   # after 90-day warm-up with lag
dates=days
def split(a,b): return np.where((dates>=a)&(dates<=b)&valid)[0]
TRY=_R['train_years']; VY=_R['val_year']; TY=_R['test_year']
tr=split(f'{min(TRY)}-01-01',f'{max(TRY)}-12-31'); va=split(f'{VY}-01-01',f'{VY}-12-31'); te=split(f'{TY}-01-01',f'{TY}-12-31')
base_old=['doy_sin','doy_cos','tmax','tmin','wind','rh','rain7','rain30','rain90','tmax7','rh7','days_since_rain','fire1','fire3','fire7','nb_fire7','days_since_fire']
base=BASEF
def mat(idx,feats,cellmask=None):
    m=np.ones((nI,nJ),bool) if cellmask is None else cellmask
    X=np.stack([F[k][idx][:,m] for k in feats],-1).reshape(-1,len(feats)); y=A[idx][:,m].reshape(-1); return X,y
def evalset(y,p,name):
    r={'n':int(len(y)),'pos_rate':round(float(y.mean()),4),'pr_auc':round(float(average_precision_score(y,p)),4),'roc_auc':round(float(roc_auc_score(y,p)),4),'brier':round(float(brier_score_loss(y,np.clip(p,0,1))),4)}
    k=int(len(y)*0.1); o=np.argsort(-p)[:k]; r['recall_top10pct']=round(float(y[o].sum()/y.sum()),4); r['precision_top10pct']=round(float(y[o].mean()),4)
    return r
res={}
def fit(feats,trmask,label):
    Xtr,ytr=mat(tr,feats,trmask); Xva,yva=mat(va,feats,trmask)
    m=lgb.LGBMClassifier(n_estimators=600,learning_rate=0.05,num_leaves=31,min_child_samples=200,subsample=0.8,subsample_freq=1,colsample_bytree=0.8,verbose=-1,random_state=1)
    m.fit(Xtr,ytr,eval_set=[(Xva,yva)],eval_metric='average_precision',callbacks=[lgb.early_stopping(40,verbose=False)])
    return m
notheld=~isheld
out={}
for name,feats in [('no_coords',base),('with_coords',base+['lat','lon'])]:
    m=fit(feats,notheld,name)
    # calibration on 2024 (non-held cells only)
    Xva,yva=mat(va,feats,notheld); iso=IsotonicRegression(out_of_bounds='clip').fit(m.predict_proba(Xva)[:,1],yva)
    for scope,mask in [(f'seen_areas_{TY}',notheld),(f'held_out_areas_{TY}',isheld)]:
        X,y=mat(te,feats,mask); p=m.predict_proba(X)[:,1]
        out[f'{name}|{scope}']=evalset(y,p,name); out[f'{name}|{scope}|calibrated']=evalset(y,iso.predict(p),name)
        out[f'{name}|{scope}']['best_iter']=int(m.best_iteration_ or 0)
    if name=='no_coords':
        best=(m,iso,feats)
        imp=dict(sorted(zip(feats,[int(v) for v in m.booster_.feature_importance('gain')]),key=lambda x:-x[1])); out['importance_gain']=imp
# baselines (2025)
for scope,mask in [(f'seen_areas_{TY}',notheld),(f'held_out_areas_{TY}',isheld)]:
    X,y=mat(te,['fire7'],mask); out[f'persistence_fire7|{scope}']=evalset(y,X[:,0]+1e-3*np.random.RandomState(0).rand(len(y)),'p')
    X,y=mat(te,['fire1'],mask); out[f'persistence_fire1|{scope}']=evalset(y,X[:,0]+1e-3*np.random.RandomState(0).rand(len(y)),'p')
    # seasonal climatology: mean detection rate by day-of-year (+-15d window) over 2020-23, all non-held cells
    doy=dates.dayofyear.values; clim=np.zeros(367)
    trdoy=doy[tr]; rate=A[tr][:,notheld].mean(1)
    for d in range(1,367):
        dd=np.minimum(np.abs(trdoy-d),366-np.abs(trdoy-d)); clim[d]=rate[dd<=15].mean()
    p=np.repeat(clim[doy[te]],int(mask.sum())); X,y=mat(te,['fire1'],mask); out[f'climatology_doy|{scope}']=evalset(y,p+1e-6*np.random.RandomState(1).rand(len(y)),'c')
# reliability table (no_coords, held-out, uncalibrated)
m,iso,feats=best; X,y=mat(te,feats,isheld); p=m.predict_proba(X)[:,1]
bins=np.linspace(0,1,11); rel=[]
for a,b in zip(bins[:-1],bins[1:]):
    s=(p>=a)&(p<b+1e-9 if b==1 else p<b)
    if s.sum(): rel.append({'bin':f'{a:.1f}-{b:.1f}','n':int(s.sum()),'mean_pred':round(float(p[s].mean()),3),'obs_rate':round(float(y[s].mean()),3)})
out['reliability_no_coords_held_out']=rel
# per-month PR-AUC held-out 2025
mo=np.repeat(dates[te].month.values,int(isheld.sum())); pm={}
for k in range(1,13):
    s=mo==k
    if y[s].sum()>0 and y[s].sum()<s.sum(): pm[k]={'pos_rate':round(float(y[s].mean()),3),'pr_auc':round(float(average_precision_score(y[s],p[s])),3),'roc_auc':round(float(roc_auc_score(y[s],p[s])),3)}
out[f'monthly_held_out_{TY}_no_coords']=pm
out['footprint']={'bbox_WSEN':list(_R['bbox_WSEN']),'cell_deg':STEP,'cells':int(nI*nJ),'held_out_cells':int(isheld.sum()),'train':f'{min(TRY)}-01-01..{max(TRY)}-12-31','val':str(VY),'test':str(TY),'weather_lag_days':WL}
import hashlib
os.makedirs(os.path.dirname(_R['model_path']),exist_ok=True); m.booster_.save_model(_R['model_path'])
out['model_sha256']=hashlib.sha256(open(_R['model_path'],'rb').read()).hexdigest(); out['region']=_R['id']
out['features']=list(feats); out['trained_utc']=pd.Timestamp.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
os.makedirs('data',exist_ok=True); json.dump(out,open('data/results.json','w'),indent=1)
os.makedirs(os.path.dirname(_R['results_path']),exist_ok=True); json.dump(out,open(_R['results_path'],'w'),indent=1)
print(json.dumps({k:v for k,v in out.items() if '|' in k},indent=0)[:6000])
print(out['importance_gain']); print(rel); print(pm)
