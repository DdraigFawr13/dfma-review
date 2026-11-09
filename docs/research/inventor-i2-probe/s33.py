from s10 import *
import sys
sys.path.insert(0,'/home/user/dfma-review/service')
from dfma.inventor import threads as th
tot=collections.Counter()
for p in FILES:
    recs=main_model(p); pos=collections.Counter(); bad_pairs=0
    for i,r in enumerate(recs):
        t,ints=tagof(r)
        if t not in ('hole','blend'): continue
        ps=r.of('p'); k=[j for j,v in enumerate(ps) if 0<=v<len(recs) and recs[v].name in ('face','edge','vertex')]
        pos[(recs[ps[k[0]]].name, k[0]) if k else None]+=1
        ids=pair_ids(ints); 
        # terminator present?
        kk=1; ok=False
        while kk<len(ints):
            if ints[kk]==-1: ok=True; break
            kk+=2
        bad_pairs+= not ok
    # thread id vs hole tag of its face
    hs=collections.defaultdict(set)
    for i,t,ints,o in attrs(recs):
        if t=='hole' and o is not None: hs[o].add(tuple(pair_ids(ints)))
    tm=0; tn=0
    for i,r in enumerate(recs):
        ok,s=th._is_thread(r)
        if not ok: continue
        ints=r.of('i'); fid=ints[8] if (r.name or '').startswith('NMx') else ints[9]
        face=r.of('p')[3]; tn+=1
        tm+= any(ids and ids[-1]==fid for ids in hs.get(face,()))
    print(short(p), dict(pos), 'no -1 end',bad_pairs, 'threads',tn,'thread id = its face hole tag id',tm)
