from probe_nodes import segments, Seg
from s10 import *
for p in FILES:
    recs=main_model(p); others=set(); last=set()
    allpat=set()
    for i,t,ints,o in attrs(recs):
        if o is None or recs[o].name!='face' or t in ('matched','orient','dep','thread'): continue
        ids=pair_ids(ints)
        if t=='hole' and ids: last.add(ids[-1]); others|=set(ids[:-1])
    small=None
    for n,B,M,sizes,hdr in segments(p):
        S=Seg(B,sizes,hdr); h=S.find_text(r'(Rectangular Pattern|Circular Pattern|Mirror|Pattern)\d*')
        if h and (small is None or len(B)<small[1]): small=(n,len(B),h)
    print(short(p),'ids over hole faces',sorted(others-last),'| names',sorted(small[2]) if small else [])
