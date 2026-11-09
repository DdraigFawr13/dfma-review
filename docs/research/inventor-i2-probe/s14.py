from s10 import *
def blends(recs):
    feats=collections.defaultdict(list)
    for i,t,ints,o in attrs(recs):
        if t!='blend' or o is None or recs[o].name!='face': continue
        ids=pair_ids(ints)
        feats[tuple(ids)].append(o)
    return feats
if __name__=='__main__':
    tot=collections.Counter()
    for p in FILES:
        recs=main_model(p); F=blends(recs); per=collections.defaultdict(lambda: collections.Counter())
        for ids,fs in F.items():
            for f in fs:
                g=geom(recs,f)
                if g[0]=='cyl': k=('r',round(g[3],3))
                elif g[0]=='torus': k=('r',round(abs(g[4]),3))
                elif g[0]=='sphere': k=('r',round(abs(g[2]),3))
                else: k=g[0]
                per[ids[0] if len(ids)==1 else ids][k]+=1
        single={k:dict(v) for k,v in per.items() if not isinstance(k,tuple)}
        kinds=collections.Counter()
        for k,v in single.items():
            rs={x[1] for x in v if isinstance(x,tuple)}; oth={x for x in v if not isinstance(x,tuple)}
            kind='fillet' if rs and len(rs)==1 and oth<= {'spline-surface'} else ('chamfer' if not rs and oth<= {'plane','cone'} else 'mixed')
            kinds[kind]+=1
            print(short(p),k,kind,v)
        print('  ==',short(p),dict(kinds),'multi-id face groups',sum(1 for k in per if isinstance(k,tuple)))
