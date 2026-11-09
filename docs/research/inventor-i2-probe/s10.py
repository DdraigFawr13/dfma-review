from topo import *
import math
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def canon(a):
    n=math.sqrt(dot(a,a)); a=tuple(x/n for x in a)
    for x in a:
        if abs(x)>1e-9: return a if x>0 else tuple(-y for y in a)
def pair_ids(ints):
    out=[]; k=1
    while k+1<len(ints) and ints[k]!=-1:
        out.append(ints[k+1]); k+=2
    return out
def instances(recs):
    A=attrs(recs); fids=collections.defaultdict(set)
    for i,t,ints,o in A:
        if t!='hole' or o is None or recs[o].name!='face' or len(ints)<3: continue
        for x in pair_ids(ints): fids[x].add(o)
    out=[]
    for fid,fs in fids.items():
        lines={}
        for f in fs:
            g=geom(recs,f)
            if g[0] not in('cyl','cone'): continue
            ax=canon(g[2]); o=g[1]; t=dot(o,ax); foot=tuple(round(o[k]-t*ax[k],2) for k in range(3))
            key=(tuple(round(x,4) for x in ax),foot)
            lines.setdefault(key,[]).append((f,g))
        for key,fl in lines.items():
            ax=key[0]
            hs=[dot(p,ax) for f,g in fl for p in face_points(recs,f)]
            cy=[round(2*g[3],3) for f,g in fl if g[0]=='cyl']
            cn=[(round(2*g[3],3),round(math.degrees(math.asin(abs(g[4]))),1)) for f,g in fl if g[0]=='cone']
            out.append(dict(fid=fid,axis=ax,foot=key[1],cyl=sorted(set(cy)),cone=cn,span=(min(hs),max(hs)) if hs else None,nf=len(fl)))
    return out
if __name__=='__main__':
    import sys
    for p in FILES:
        if sys.argv[1] in p:
            for x in instances(main_model(p)): print(x)
