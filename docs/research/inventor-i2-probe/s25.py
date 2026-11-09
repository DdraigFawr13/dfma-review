import re
from probe_nodes import segments, Seg
from s10 import *
for p in FILES:
    recs=main_model(p); last=set(); others=set()
    for i,t,ints,o in attrs(recs):
        if t!='hole' or o is None or recs[o].name!='face': continue
        ids=pair_ids(ints)
        if ids: last.add(ids[-1]); others|=set(ids[:-1])
    small=None
    for n,B,M,sizes,hdr in segments(p):
        S=Seg(B,sizes,hdr); h=S.find_text(r'Hole\d+')
        if h and (small is None or len(B)<small[1]): small=(n,len(B),h)
    names=sorted(small[2],key=lambda k:small[2][k]) if small else []
    names_by_num=sorted(small[2],key=lambda k:int(k[4:])) if small else []
    print(short(p),'hole fids (source)',sorted(last),'pattern-ish ids',sorted(others-last),'| Hole names',len(names),names_by_num)
