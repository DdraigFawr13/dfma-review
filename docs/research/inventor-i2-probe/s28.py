import json, os, math
from s10 import *
K='/tmp/claude-0/-home-user-dfma-review/040cedfe-09a8-5d3d-b3de-d31b6e2b4d9b/scratchpad/key/'
tot=collections.Counter()
for p in FILES:
    kf=K+os.path.basename(p)[:-4]+'.json'
    key=[o for o in json.load(open(kf)) if o['TypeId']=='PartDesign::Hole']
    if not key: continue
    recs=main_model(p); inst=instances(recs)
    # source fid of each instance = last id of its pair list: recompute per face
    src={}
    for i,t,ints,o in attrs(recs):
        if t=='hole' and o is not None and recs[o].name=='face':
            ids=pair_ids(ints)
            if ids: src.setdefault(o, ids[-1])
    fids=sorted({v for v in src.values()})
    names=sorted([o['Label'] for o in key], key=lambda s:int(''.join(c for c in s if c.isdigit()) or 0))
    rank=dict(zip(fids,names)) if len(fids)==len(names) else {}
    # IL truth: name -> fids whose instance lines pass through any centre
    truth={}
    for x in inst:
        a=x['axis']; o=x['foot']
        for k in key:
            for c in k.get('centres',[]):
                w=sub(c,o); d=math.sqrt(max(0,dot(w,w)-dot(w,a)**2))
                h=dot(c,a); dia=k['props'].get('Diameter')
                atend=x['span'] and min(abs(h-x['span'][0]),abs(h-x['span'][1]))<0.01
                if d<0.01 and atend and dia and any(abs(dia-cy)<0.01 for cy in x['cyl']): truth.setdefault(k['Label'],set()).add(x['fid'])
    # x['fid'] may be a pattern id; map through faces? use source ids set per instance: take x['fid'] if in fids
    ok=bad=unk=0; detail=[]
    for k in key:
        t={f for f in truth.get(k['Label'],set()) if f in fids}
        if not t: unk+=1; detail.append((k['Label'],'no instance at its centres')); continue
        guess=[f for f,n in rank.items() if n==k['Label']]
        if len(t)==1 and guess==list(t): ok+=1
        else: bad+=1; detail.append((k['Label'],sorted(t),guess))
    tot.update(ok=ok,bad=bad,unk=unk)
    print(short(p),'counts eq',len(fids)==len(names),len(fids),len(names),'rank right',ok,'wrong',bad,'no truth',unk, detail[:4])
print(tot)
