import sys, json, math
sys.path.insert(0,'/home/user/dfma-review/tests/inventor'); sys.path.insert(0,'/home/user/dfma-review/tests/service'); sys.path.insert(0,'/home/user/dfma-review/tests')
from s10 import *
from nist_pair import transform
from dfma.analyze import analyze
from dfma.read import read_step
from dfma.features import _cylinder
from nist_files import ap242_files
PAIRS={'ctc_01_2021':'nist_ctc_01_asme1_ap242-e1.stp','ctc_02_2021':'nist_ctc_02_asme1_ap242-e2.stp','ctc_04_2021':'nist_ctc_04_asme1_ap242-e1.stp','ctc_05_2021':'nist_ctc_05_asme1_ap242-e1.stp','ftc_06_2021':'nist_ftc_06_asme1_ap242-e2.stp','ftc_06_2024':'nist_stc_06_asme1_ap242-e3.stp','ftc_07_2021':'nist_ftc_07_asme1_ap242-e2.stp','ftc_07_2024':'nist_stc_07_asme1_ap242-e3.stp','ftc_08_2021':'nist_ftc_08_asme1_ap242-e2.stp','ftc_08_2024':'nist_stc_08_asme1_ap242-e3.stp','ftc_10_2021':'nist_ftc_10_asme1_ap242-e2.stp','ftc_10_2024':'nist_stc_10_asme1_ap242-e2.stp','ftc_11_2021':'nist_ftc_11_asme1_ap242-e2.stp'}
steps={p.name:p for p in ap242_files()}
def mul(m,v): return tuple(sum(m[r][c]*v[c] for c in range(3)) for r in range(3))
res={}
for p in FILES:
    s=short(p)
    if s not in PAIRS or (len(sys.argv)>1 and sys.argv[1] not in s): continue
    st=steps[PAIRS[s]]
    rows,shift=transform(str(st),p)
    r=analyze(st,st.name,'mill'); faces=read_step(st).faces
    holes=[f for f in r['features'] if f['kind']=='hole']
    sh=[]
    for h in holes:
        cs=[c for i in h['faces'] if (c:=_cylinder(i,faces[i],tapers=True))]
        if cs: sh.append((h,cs[0]))
    inst=instances(main_model(p)); out=[]
    for x in inst:
        a=mul(rows,x['axis']); o=tuple(u+v for u,v in zip(mul(rows,x['foot']),shift))
        best=None
        for h,c in sh:
            if abs(dot(a,c.axis))<0.9999: continue
            w=sub(c.origin,o); d=math.sqrt(max(0,dot(w,w)-dot(w,a)**2))
            if best is None or d<best[0]: best=(d,h)
        st_=None
        if best and best[0]<=0.01: st_=('match',best[1]['id'],best[1]['dims_mm'].get('diameter'),best[1].get('hole_type') or best[1].get('subtype'),round(best[0],4))
        if not st_ and best:
            rad=best[1]['dims_mm'].get('diameter',0)/2
            st_=('disagrees',round(best[0],3)) if best[0]<=rad else ('none',round(best[0],2))
        out.append((x['fid'],x['cyl'],[c for c in x['cone']],round(x['span'][1]-x['span'][0],3) if x['span'] else None, st_ or ('none', round(best[0],2) if best else None)))
    n=len(out); m=sum(1 for o in out if o[4][0]=='match'); dg=sum(1 for o in out if o[4][0]=='disagrees')
    print(s,'holes',n,'matched',m,'disagrees',dg,'not mapped',n-m-dg)
    for o in out:
        pass
    res[s]=out
json.dump(res,open('holes_cmp.json','w'),default=str)
