from lib import *
import math
TAGS2024={'INV_NMX_HOLE_TAG':'hole','INV_NMX_BLEND_TAG':'blend','INV_NMX_THREAD_TAG':'thread','INV_NMX_SWEEPGENERATED_TAG':'sweep','INV_NMX_GEN_TAG':'gen','INV_NMX_MATCHED_ATTRIB':'matched','INV_FEATURE_ORIENTATION_ATTR':'orient','INV_NMX_FEATURE_DEPENDENCY_ATTRIB':'dep'}
TAGS2021={'NMx_Hole_Brep_tag':'hole','NMx_blend_tag':'blend','NMx_Thread_Entity':'thread','NMx_Sweep_Generated_Brep_tag':'sweep','NMx_Generated_Brep_tag':'gen','NMx_Matched_Entity':'matched','NMx_Feature_Orientation':'orient','NMx_feature_dependency_attrib':'dep','NMx_tweak_face_tag':'tweak','NMx_Brep_Feature_tag':'brepfeat','NMx_BPatch_Tag':'bpatch','NMx_flange_tag':'flange','NMx_shell_face_tag':'shell','NMx_split_face_tag':'split','NMx_Loft_Surface_Brep_tag':'loft'}
def tagof(r):
    n=r.name or ''
    if n.startswith('ATTRIB_CUSTOM'):
        s=r.of('s'); 
        if s: return TAGS2024.get(s[0], s[0]), r.of('i')[2:]  # drop -1,1 -> starts at version
        return None,None
    k=n.split('-')[0]
    if k in TAGS2021: return TAGS2021[k], r.of('i')[1:]   # drop -1 -> starts at version 43
    return None,None
def owner(recs,r):
    for v in r.of('p'):
        if 0<=v<len(recs) and recs[v].name in('face','edge','vertex','body','lump','shell','loop','coedge'): return v
def surf(recs,f):
    for v in recs[f].of('p'):
        if 0<=v<len(recs) and (recs[v].name or '').endswith('surface'): return v
def geom(recs,f):
    s=surf(recs,f); r=recs[s]; n=r.name; vs=r.of('v'); ds=r.of('d')
    rev = recs[f].of('b')[0] if recs[f].of('b') else None
    if n.startswith('plane'): return ('plane', tuple(10*x for x in vs[0]), vs[1])
    if n.startswith('cone'):
        rad=10*math.sqrt(sum(x*x for x in vs[2]))
        if abs(ds[1])<1e-9: return ('cyl', tuple(10*x for x in vs[0]), vs[1], rad, rev)
        return ('cone', tuple(10*x for x in vs[0]), vs[1], rad, ds[1], ds[2], rev)
    if n.startswith('torus'): return ('torus', tuple(10*x for x in vs[0]), vs[1], 10*ds[0], 10*ds[1])
    if n.startswith('sphere'): return ('sphere', tuple(10*x for x in vs[0]), 10*ds[0])
    return (n,)
def attrs(recs):
    out=[]
    for i,r in enumerate(recs):
        t,ints=tagof(r)
        if t: out.append((i,t,ints,owner(recs,r)))
    return out
