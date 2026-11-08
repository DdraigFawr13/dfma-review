"""Dump from the .ipt main B-rep: vertex points, threads (with owner cylinder), hole-tagged cylinders. mm."""
import sys, json, math
sys.path.insert(0, sys.argv[1]); import sab
best=None
for n, recs in sab.models(sys.argv[2]):
    nf=sum(1 for r in recs if r[0]=='face')
    if best is None or nf>best[1]: best=(recs,nf)
recs=best[0]
P=lambda vals:[v for k,v in vals if k=='p']
def surf(face):
    for p in P(recs[face][1]):
        if 0<=p<len(recs) and recs[p][0] and recs[p][0].endswith('surface'): return p
def cyl(face):
    s=surf(face)
    if s is None or not recs[s][0].startswith('cone'): return None
    vs=[v for k,v in recs[s][1] if k=='v']; ds=[v for k,v in recs[s][1] if k=='d']
    if len(vs)<3 or abs(ds[1])>1e-9: return None  # sin(half angle)=0: a cylinder
    return {"o":[10*x for x in vs[0]],"a":list(vs[1]),"d":20*math.sqrt(sum(x*x for x in vs[2])),"face":face}
pts=[[10*x for x in v] for name,vals in recs if name=='point' for k,v in vals if k=='v']
threads=[]; holefaces=set()
def tag(name, vals):
    """('thread'|'hole'|None, strings after the tag name): 2021 files name the attrib, 2024 files wrap it in ATTRIB_CUSTOM."""
    s=[v for k,v in vals if k=='s']
    if name.startswith('NMx_Thread_Entity'): return 'thread', s
    if name.startswith('NMx_Hole_Brep_tag'): return 'hole', s
    if 'ATTRIB_CUSTOM' in name and s:
        return {'INV_NMX_THREAD_TAG':'thread','INV_NMX_HOLE_TAG':'hole'}.get(s[0]), s[1:]
    return None, s
for i,(name,vals) in enumerate(recs):
    if not name: continue
    kind, s = tag(name, vals)
    if kind is None: continue
    o=P(vals)[3]
    if not (0<=o<len(recs) and recs[o][0]=='face'): continue
    vs=[v for k,v in vals if k=='v']
    if kind=='thread':
        threads.append({"spec":s[1],"standard":s[2],"class":s[5],"pitch":s[6],"strings":s,"cyl":cyl(o),
                        "depth_mm":round(10*math.dist(vs[0],vs[1]),4) if len(vs)>1 else None})
    else: holefaces.add(o)
allcyl=[c for f,(nm,_) in enumerate(recs) if nm=='face' and (c:=cyl(f))]
hc=[c for f in sorted(holefaces) if (c:=cyl(f))]
json.dump({"points":pts,"threads":threads,"hole_cyls":hc,"all_cyls":allcyl},sys.stdout)
