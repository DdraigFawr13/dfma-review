"""Find the rigid transform (24 axis-aligned rotations + shift) that best overlays .ipt vertices on STEP vertices,
then map each .ipt thread and hole cylinder to a STEP hole."""
import json, sys, itertools, collections, math
ipt=json.load(open(sys.argv[1])); spts=json.load(open(sys.argv[2])); holes=json.load(open(sys.argv[3]))
def rots():
    for perm in itertools.permutations(range(3)):
        for sg in itertools.product((1,-1),repeat=3):
            M=[[0]*3 for _ in range(3)]
            for r in range(3): M[r][perm[r]]=sg[r]
            det=(M[0][0]*(M[1][1]*M[2][2]-M[1][2]*M[2][1])-M[0][1]*(M[1][0]*M[2][2]-M[1][2]*M[2][0])+M[0][2]*(M[1][0]*M[2][1]-M[1][1]*M[2][0]))
            if det==1: yield M
mul=lambda M,v:[sum(M[r][c]*v[c] for c in range(3)) for r in range(3)]
key=lambda v:tuple(round(x,1) for x in v)
sset={key(p) for p in spts}
def sub(a,b): return [a[i]-b[i] for i in range(3)]
def dot(a,b): return sum(a[i]*b[i] for i in range(3))
def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def axis_hits(M,t):
    n=0
    for c in ipt["all_cyls"]:
        o=[mul(M,c["o"])[i]+t[i] for i in range(3)]; a=mul(M,c["a"])
        if any(abs(dot(h["axis"],a))>0.999 and abs(h["d"]-c["d"])<0.15 and math.sqrt(sum(x*x for x in cross(sub(h["top"],o),a)))<0.05 for h in holes): n+=1
    return n
best=None
for M in rots():
    votes=collections.Counter()
    for p in ipt["points"][::max(1,len(ipt["points"])//80)]:
        q=mul(M,p)
        for s in spts: votes[key([s[i]-q[i] for i in range(3)])]+=1
    for t,_ in votes.most_common(5):
        hit=sum(1 for p in ipt["points"] if key([mul(M,p)[i]+t[i] for i in range(3)]) in sset)
        score=hit+10*axis_hits(M,t)
        if best is None or score>best[3]: best=(hit,M,t,score)
hit,M,t,_=best
print(f"registration: axis hits {axis_hits(M,t)}/{len(ipt['all_cyls'])} cylinders; {hit}/{len(ipt['points'])} ipt vertices land on a STEP vertex (0.1 mm grid); rotation {M}, shift {t}")
def sub(a,b): return [a[i]-b[i] for i in range(3)]
def dot(a,b): return sum(a[i]*b[i] for i in range(3))
def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def tr(c): return mul(M,c["o"]),[float(x) for x in mul(M,c["a"])]
def nearest(c):
    o,a=tr(c); o=[o[i]+t[i] for i in range(3)]; best=None
    for h in holes:
        if abs(dot(h["axis"],a))<0.999: continue
        dist=math.sqrt(sum(x*x for x in cross(sub(h["top"],o),a)))
        if best is None or dist<best[0]: best=(dist,h)
    return best
print("threads:")
for th in ipt["threads"]:
    b=nearest(th["cyl"]) if th["cyl"] else None
    if b and b[0]<0.05: print(f"  {th['spec']:9} {th['class']:3} {th['standard']:22} depth {th['depth_mm']} modelled d {th['cyl']['d']:.3f} -> {b[1]['id']:8} STEP d {b[1]['d']:.3f} depth {b[1]['depth']:.2f}  gap {b[0]:.4f} mm")
    else: print(f"  {th['spec']} not matched" + (f" (nearest gap {b[0]:.2f} mm, {b[1]['id']} d {b[1]['d']})" if b else ""))
m=0; seen=set(); unmatched=[]
for c in ipt["hole_cyls"]:
    b=nearest(c)
    if b and b[0]<0.05: seen.add(b[1]["id"]); m+=1
    else: unmatched.append(round(c["d"],3))
print(f"hole-tagged cylinder faces: {len(ipt['hole_cyls'])}, on a STEP hole axis: {m}; STEP holes covered {len(seen)}/{len(holes)}; unmatched diameters {sorted(set(unmatched))}")
print("STEP holes with no .ipt hole feature:", sorted({h['d'] for h in holes if h['id'] not in seen}))
