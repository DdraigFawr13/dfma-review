import sys
exec(open('s15.py').read().split("for p in FILES:")[0])
from s17 import chamfer_face
from OCC.Core.GeomAbs import GeomAbs_Plane
for p in FILES:
    s=short(p)
    if s not in ('ctc_01_2021','ctc_02_2021','ctc_04_2021','ctc_05_2021'): continue
    st=steps[PAIRS[s]]; rows,shift=transform(str(st),p); sf=[]
    for f in read_step(st).faces:
        a=BRepAdaptor_Surface(f); t=a.GetType()
        if t==GeomAbs_Plane: c=a.Plane(); sf.append(('plane',P(c.Location()),D(c.Axis().Direction())))
        elif t==GeomAbs_Cone: c=a.Cone(); sf.append(('cone',P(c.Location()),D(c.Axis().Direction()),math.degrees(c.SemiAngle())))
    recs=main_model(p); ok=bad=0
    for ids,fs in blends(recs).items():
        if len(ids)!=1 or not {geom(recs,f)[0] for f in fs}<={'plane','cone'}: continue
        for f in fs:
            g=geom(recs,f); o=tuple(u+v for u,v in zip(mul(rows,g[1]),shift)); a=mul(rows,g[2])
            if g[0]=='plane': hit=[x for x in sf if x[0]=='plane' and abs(abs(dot(x[2],a))-1)<1e-6 and abs(dot(sub(x[1],o),a))<0.01]
            else:
                ang=math.degrees(math.asin(abs(g[4]))); hit=[x for x in sf if x[0]=='cone' and abs(abs(dot(x[2],a))-1)<1e-6 and linegap(o,a,x[1])<0.01 and abs(abs(x[3])-ang)<0.01]
            ok+=bool(hit); bad+=not hit
    print(s,'chamfer faces on a STEP face of the same type and place',ok,'miss',bad)
