exec(open('s28.py').read().split("tot=collections.Counter()")[0])
def kind(x):
    cs=x['cyl']; cones=x['cone']
    drill=any(abs(a-59.0)<0.5 for _,a in cones); csk=[a for _,a in cones if abs(a-59.0)>=0.5]
    cut='Countersink' if csk else ('Counterbore' if len(cs)>=2 else 'None')
    return cut, ('Angled' if drill else 'Flat-or-through'), min(cs) if cs else None, (2*csk[0] if csk else None), max(cs) if len(cs)>=2 else None
tot=collections.Counter(); bad=[]
for p in FILES:
    kf=K+os.path.basename(p)[:-4]+'.json'
    key=[o for o in json.load(open(kf)) if o['TypeId']=='PartDesign::Hole']
    if not key: continue
    recs=main_model(p); inst=instances(recs)
    src={}
    for i,t,ints,o in attrs(recs):
        if t=='hole' and o is not None and recs[o].name=='face':
            ids=pair_ids(ints)
            if ids: src.setdefault(o, ids[-1])
    fids=sorted(set(src.values()))
    names=sorted([o['Label'] for o in key], key=lambda s:int(''.join(c for c in s if c.isdigit()) or 0))
    if len(fids)!=len(names): continue
    rank=dict(zip(fids,names)); byname={o['Label']:o for o in key}
    for fid in fids:
        k=byname[rank[fid]]['props']; xs=[x for x in inst if x['fid']==fid]
        if not xs: tot['no instance']+=1; continue
        ks={kind(x) for x in xs}
        want=(k['HoleCutType'], 'Angled' if (k['DrillPoint']=='Angled' and k['DepthType']!='ThroughAll') else 'Flat-or-through', k['Diameter'])
        got=sorted(ks,key=str)[0]
        okt = got[0]==want[0]; okd = want[1]==got[1]; okdia = got[2] is not None and abs(got[2]-want[2])<0.01
        tot['type ok' if okt else 'type bad']+=1; tot['point ok' if okd else 'point bad']+=1; tot['dia ok' if okdia else 'dia bad']+=1
        if not (okt and okd and okdia) or len(ks)>1: bad.append((short(p),rank[fid],want,k.get('HoleCutDiameter'),k.get('HoleCutCountersinkAngle'),k.get('DepthType'),ks))
print(tot)
for b in bad: print(b)
