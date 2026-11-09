from s14 import *
import math
def ptrs(recs,i): return [x for t,x in recs[i].values if t=='p']
def ok(recs,i,n): return 0<=i<len(recs) and recs[i].name==n
def edges_by_neighbour(recs,f):
    out=collections.defaultdict(list)
    loop=ptrs(recs,f)[3]; seen=set()
    while ok(recs,loop,'loop') and loop not in seen:
        seen.add(loop); lp=ptrs(recs,loop); ce0=ce=lp[3]; k=0
        while ok(recs,ce,'coedge') and k<10000:
            cp=ptrs(recs,ce); part=cp[4]; e=cp[5]
            nb=None
            if ok(recs,part,'coedge'):
                pl=ptrs(recs,part)[6]
                if ok(recs,pl,'loop'): nb=ptrs(recs,pl)[4]
            pts=[]
            if ok(recs,e,'edge'):
                for vtx in ptrs(recs,e)[2:4]:
                    if ok(recs,vtx,'vertex'):
                        pt=ptrs(recs,vtx)[-1]
                        if ok(recs,pt,'point'): pts.append(tuple(10*c for c in recs[pt].of('v')[0]))
            out[nb]+=pts
            ce=cp[2]; k+=1
            if ce==ce0: break
        loop=lp[2]
    return out
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a): n=math.sqrt(dot(a,a)); return tuple(x/n for x in a)
def chamfer_face(recs,f):
    g=geom(recs,f); E=edges_by_neighbour(recs,f)
    L={n:sum(math.dist(E[n][i],E[n][i+1]) for i in range(0,len(E[n])-1,2)) for n in E}
    nbs=sorted(E,key=lambda n:-L[n])
    if g[0]=='cone':
        ax=norm(g[2]); o=g[1]
        pts=[p for n in E for p in E[n]]
        h=[dot(sub(p,o),ax) for p in pts]; r=[math.sqrt(max(0,dot(sub(p,o),sub(p,o))-dot(sub(p,o),ax)**2)) for p in pts]
        return ('cone', round(max(r)-min(r),3), round(max(h)-min(h),3))
    if g[0]=='plane':
        # two neighbour planes with the most edge points
        pl=[n for n in nbs if n is not None and geom(recs,n)[0]=='plane'][:2]
        if len(pl)<2: return ('plane?',[geom(recs,n)[0] for n in nbs if n is not None])
        A,B=geom(recs,pl[0]),geom(recs,pl[1])
        na,nb_=norm(A[2]),norm(B[2]); dirL=cross(na,nb_)
        if dot(dirL,dirL)<1e-12: return ('parallel',)
        ang=math.degrees(math.acos(max(-1,min(1,abs(dot(na,nb_))))))
        # setback on A: distance from A-edge points to plane B along A = dist_to_planeB / sin(angle)
        sa=[abs(dot(sub(p,B[1]),nb_)) for p in E[pl[0]]]; sb=[abs(dot(sub(p,A[1]),na)) for p in E[pl[1]]]
        s=math.sin(math.radians(180-ang)) or 1
        return ('plane', round(max(sa)/s,3), round(max(sb)/s,3), round(ang,1))
    return (g[0],)
if __name__=='__main__':
    for p in FILES:
        recs=main_model(p)
        for ids,fs in blends(recs).items():
            if len(ids)!=1: continue
            kinds={geom(recs,f)[0] for f in fs}
            if not kinds<= {'plane','cone'}: continue
            print(short(p),ids[0],collections.Counter(chamfer_face(recs,f) for f in fs))
