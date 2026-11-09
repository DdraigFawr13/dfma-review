import sys, math
sys.path.insert(0,'/home/user/dfma-review/tests/inventor'); sys.path.insert(0,'/home/user/dfma-review/tests')
from s14 import *
from s11pairs import PAIRS
from nist_pair import transform
from nist_files import ap242_files
from dfma.read import read_step
from OCC.Core.BRepAdaptor import BRepAdaptor_Surface
from OCC.Core.GeomAbs import GeomAbs_Cylinder, GeomAbs_Torus, GeomAbs_Sphere, GeomAbs_Cone
steps={p.name:p for p in ap242_files()}
def mul(m,v): return tuple(sum(m[r][c]*v[c] for c in range(3)) for r in range(3))
def P(p): return (p.X(),p.Y(),p.Z())
def D(d): return (d.X(),d.Y(),d.Z())
def linegap(o1,a,o2):
    w=sub(o2,o1); return math.sqrt(max(0,dot(w,w)-dot(w,a)**2))
for p in FILES:
    s=short(p)
    if s not in PAIRS or s.startswith('ftc_07'): continue
    st=steps[PAIRS[s]]; rows,shift=transform(str(st),p)
    sf=[]
    for f in read_step(st).faces:
        a=BRepAdaptor_Surface(f); t=a.GetType()
        if t==GeomAbs_Cylinder: c=a.Cylinder(); sf.append(('cyl',P(c.Location()),D(c.Axis().Direction()),c.Radius()))
        elif t==GeomAbs_Torus: c=a.Torus(); sf.append(('torus',P(c.Location()),D(c.Axis().Direction()),c.MinorRadius(),c.MajorRadius()))
        elif t==GeomAbs_Sphere: c=a.Sphere(); sf.append(('sphere',P(c.Location()),None,c.Radius()))
    recs=main_model(p); ok=bad=0; worst=[]
    for ids,fs in blends(recs).items():
        for f in fs:
            g=geom(recs,f)
            if g[0] not in('cyl','torus','sphere'): continue
            o=tuple(u+v for u,v in zip(mul(rows,g[1]),shift))
            if g[0]=='cyl':
                a=mul(rows,g[2]); r=g[3]
                c=[x for x in sf if x[0]=='cyl' and abs(abs(dot(x[2],a))-1)<1e-6 and linegap(o,a,x[1])<0.01]
                hit=[x for x in c if abs(x[3]-r)<0.01]
            elif g[0]=='torus':
                a=mul(rows,g[2]); r=abs(g[4])
                c=[x for x in sf if x[0]=='torus' and math.dist(x[1],o)<0.01 and abs(abs(dot(x[2],a))-1)<1e-6]
                hit=[x for x in c if abs(x[3]-r)<0.01 and abs(x[4]-abs(g[3]))<0.01]
            else:
                r=abs(g[2]); c=[x for x in sf if x[0]=='sphere' and math.dist(x[1],o)<0.01]; hit=[x for x in c if abs(x[3]-r)<0.01]
            if hit: ok+=1
            else: bad+=1; worst.append((g[0],round(r,3),'cands',len(c)))
    print(s,'fillet faces whose radius and place match a STEP face',ok,'miss',bad, collections.Counter(worst).most_common(4))
