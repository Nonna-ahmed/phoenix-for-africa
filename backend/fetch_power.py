import json, time, os, sys, urllib.request, numpy as np, pandas as pd, glob
lons = np.arange(25.0, 29.01, 0.5); lats = np.arange(-12.75, -8.2, 0.5)
pts = [(round(a,2),round(o,2)) for a in lats for o in lons]
os.makedirs('data/pchunks',exist_ok=True); T0=time.time()
P="T2M_MAX,T2M_MIN,PRECTOTCORR,WS2M,RH2M"
for a,o in pts:
    fn=f'data/pchunks/{a}_{o}.csv'
    if os.path.exists(fn): continue
    if time.time()-T0>90: print('budget, rerun'); sys.exit(0)
    url=f"https://power.larc.nasa.gov/api/temporal/daily/point?parameters={P}&community=AG&longitude={o}&latitude={a}&start=20191201&end=20251231&format=JSON"
    for k in range(4):
        try: d=json.load(urllib.request.urlopen(url,timeout=60)); break
        except Exception as e: print('retry',a,o,e); time.sleep(8)
    else: sys.exit('fail')
    df=pd.DataFrame(d['properties']['parameter']); df.index.name='date'; df=df.reset_index(); df['wlat']=a; df['wlon']=o
    df.to_csv(fn,index=False)
print('done',len(glob.glob('data/pchunks/*.csv')),len(pts))
