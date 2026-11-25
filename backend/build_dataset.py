import glob, numpy as np, pandas as pd
from region import get_region
_R=get_region(); W,S,E,N,STEP = _R['W'],_R['S'],_R['E'],_R['N'],_R['step']
# --- fire labels (FIRMS VIIRS S-NPP, nominal/high confidence), per 0.25 deg cell per UTC day
fr=[]
for y in range(2020,2026):
    df=pd.read_csv(f'raw/n20_{y}.csv',usecols=['latitude','longitude','acq_date','confidence','type'])
    df=df[(df.longitude>=W)&(df.longitude<E)&(df.latitude>=S)&(df.latitude<N)]
    fr.append(df)
f=pd.concat(fr); print('raw detections in bbox',len(f), f.confidence.value_counts().to_dict(), f.type.value_counts().to_dict())
f=f[f.confidence.isin(['n','h'])&(f.type==0)]
f['ci']=np.floor((f.longitude-W)/STEP).astype(int); f['cj']=np.floor((f.latitude-S)/STEP).astype(int)
cnt=f.groupby(['ci','cj','acq_date']).size().rename('n').reset_index(); cnt['acq_date']=pd.to_datetime(cnt.acq_date)
nI=int(np.ceil((E-W)/STEP)); nJ=int(np.ceil((N-S)/STEP))
days=pd.date_range('2019-12-01','2025-12-31')
A=np.zeros((len(days),nI,nJ),dtype=np.float32)
di={d:i for i,d in enumerate(days)}
for r in cnt.itertuples(): A[di[r.acq_date],r.ci,r.cj]=r.n
print('cells',nI*nJ,'days',len(days),'fire cell-days',int((A[31:]>0).sum()))
# --- weather (NASA POWER 0.5 deg) assigned to cells by nearest weather point
w=pd.concat([pd.read_csv(x) for x in glob.glob('data/pchunks/*.csv')]); w.replace(-999,np.nan,inplace=True)
w['date']=pd.to_datetime(w.date.astype(str)); 
wl=sorted(w.wlon.unique()); wa=sorted(w.wlat.unique())
var=['T2M_MAX','T2M_MIN','PRECTOTCORR','WS2M','RH2M']
WA={v:np.full((len(days),len(wa),len(wl)),np.nan,dtype=np.float32) for v in var}
ai={a:i for i,a in enumerate(wa)}; li={l:i for i,l in enumerate(wl)}
w['d']=w.date.map(di); w=w.dropna(subset=['d'])
for v in var: WA[v][w.d.astype(int).values, w.wlat.map(ai).values, w.wlon.map(li).values]=w[v].values
miss={v:float(np.isnan(WA[v]).mean()) for v in var}; print('weather missing frac',miss)
np.savez_compressed('data/arrays.npz',A=A,days=days.values.astype('datetime64[D]'),wa=np.array(wa),wl=np.array(wl),**{v:WA[v] for v in var})
