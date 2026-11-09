from geo import *
def P(recs,r,i):
    v=recs[r].values
    ps=[x for t,x in v if t=='p']
    return ps
def face_points(recs,f):
    pts=[]; seen=set()
    loop=P(recs,f,0)[3]
    while 0<=loop<len(recs) and recs[loop].name=='loop' and loop not in seen:
        seen.add(loop)
        lp=P(recs,loop,0); ce0=lp[3]; ce=ce0; k=0
        while 0<=ce<len(recs) and recs[ce].name=='coedge' and k<10000:
            cp=P(recs,ce,0); e=cp[5]
            if 0<=e<len(recs) and recs[e].name=='edge':
                for vtx in [x for t,x in recs[e].values if t=='p'][2:4]:
                    if 0<=vtx<len(recs) and recs[vtx].name=='vertex':
                        pt=P(recs,vtx,0)[-1]
                        if 0<=pt<len(recs) and recs[pt].name=='point': pts.append(tuple(10*c for c in recs[pt].of('v')[0]))
            ce=cp[2]; k+=1
            if ce==ce0: break
        loop=lp[2]
    return pts
