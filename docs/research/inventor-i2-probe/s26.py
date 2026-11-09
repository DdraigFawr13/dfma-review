from probe_nodes import segments, Seg
from s14 import *
for p in FILES:
    recs=main_model(p); F=blends(recs); fil=set(); cha=set(); allids=set()
    for ids,fs in F.items():
        allids|=set(ids)
        if len(ids)!=1: continue
        k={geom(recs,f)[0] for f in fs}
        (cha if k<={'plane','cone'} else fil).add(ids[0])
    small=None
    for n,B,M,sizes,hdr in segments(p):
        S=Seg(B,sizes,hdr); h=S.find_text(r'Hole\d+|Fillet\d+|Chamfer\d+')
        if h and (small is None or len(B)<small[1]): small=(n,len(B),h)
    names=small[2] if small else {}
    fn=sorted([k for k in names if k.startswith('Fillet')],key=lambda k:int(k[6:])); cn=sorted([k for k in names if k.startswith('Chamfer')],key=lambda k:int(k[7:]))
    print(short(p),'blend ids',len(allids),'fillet-like',len(fil),'chamfer-like',len(cha),'| names',fn,cn)
