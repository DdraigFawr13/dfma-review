"""Spike: build an OpenCascade solid from the ACIS records of an .ipt alone (no STEP).

Usage (from the repo root): PYTHONPATH=service python docs/research/inventor-shape-spike/ipt_shape.py <file.ipt>
Layouts decoded from the bytes (index = position in the record list; -1 = null pointer):
  face    [attr,id,hist, nextface, loop, shell, subshell, surface, b, b]
  loop    [attr,id,hist, nextloop, firstcoedge, face]
  coedge  [attr,id,hist, next, prev, partner, edge, b sense (False=forward), loop, i, pcurve]
  edge    [attr,id,hist, vertex0, t0, vertex1, t1, coedge, curve, b sense, s]
  vertex  [attr,id,hist, edge, i, point]        point [.., v]
  plane   [.., v root, v normal, v udir, b...]
  cone    [.., v centre, v axis, v major (len = radius), d ratio, b, b, d sin, d cos, d scale, b...]
  sphere  [.., v centre, d radius, v, v, b...]
  torus   [.., v centre, v axis, d major R, d minor r, v ref, b...]
  straight-curve [.., v root, v dir, b, b]     ellipse-curve [.., v centre, v normal, v major, d ratio, b, b]
Lengths are cm in the file; everything below is scaled to mm.
"""
import math
import sys
import time

from dfma.inventor import ole, sab

from OCC.Core.BRep import BRep_Builder
from OCC.Core.BRepBndLib import brepbndlib
from OCC.Core.BRepBuilderAPI import (BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakeVertex,
                                     BRepBuilderAPI_MakeWire, BRepBuilderAPI_Sewing)
from OCC.Core.BRepCheck import BRepCheck_Analyzer
from OCC.Core.BRepGProp import brepgprop
from OCC.Core.Bnd import Bnd_Box
from OCC.Core.GProp import GProp_GProps
from OCC.Core.Geom import (Geom_Circle, Geom_ConicalSurface, Geom_CylindricalSurface, Geom_Ellipse, Geom_Line,
                           Geom_Plane, Geom_SphericalSurface, Geom_ToroidalSurface)
from OCC.Core.ShapeFix import ShapeFix_Face, ShapeFix_Shell, ShapeFix_Solid
from OCC.Core.TopAbs import TopAbs_EDGE, TopAbs_SHELL
from OCC.Core.TopExp import TopExp_Explorer
from OCC.Core.TopoDS import TopoDS_Solid, topods
from OCC.Core.gp import gp_Ax2, gp_Ax3, gp_Circ, gp_Dir, gp_Elips, gp_Lin, gp_Pln, gp_Pnt

MM = 10.0


def main_model(path):
    f = ole.Ipt(path)
    best = None
    try:
        for d in f.models():
            k = d.find(sab.HEADER)
            while k >= 0:
                _, recs = sab.split(d, k)
                n = sum(1 for r in recs if r.name == "face")
                if best is None or n > best[1]:
                    best = (recs, n)
                k = d.find(sab.HEADER, k + 1)
    finally:
        f.close()
    return best[0]


def P(v):
    return gp_Pnt(*(MM * x for x in v))


def D(v):
    return gp_Dir(*v)


class Builder:
    def __init__(self, recs):
        self.r = recs
        self.miss = {}
        self.verts, self.edges = {}, {}

    def bad(self, k):
        self.miss[k] = self.miss.get(k, 0) + 1

    def vec(self, i, n):
        return [v for k, v in self.r[i].values if k == "v"][n]

    def dbl(self, i):
        return [v for k, v in self.r[i].values if k == "d"]

    def ptr(self, i, n):
        return self.r[i].values[n][1]

    def vertex(self, i):
        if i not in self.verts:
            pt = self.vec(self.ptr(i, 5), 0)
            self.verts[i] = BRepBuilderAPI_MakeVertex(P(pt)).Vertex()
        return self.verts[i]

    def surface(self, s):
        n = self.r[s].name
        if n == "plane-surface":
            return Geom_Plane(gp_Pln(gp_Ax3(P(self.vec(s, 0)), D(self.vec(s, 1)), D(self.vec(s, 2)))))
        if n == "cone-surface":
            o, ax, mj = self.vec(s, 0), self.vec(s, 1), self.vec(s, 2)
            d = self.dbl(s)
            rad = MM * math.sqrt(sum(x * x for x in mj))
            a3 = gp_Ax3(P(o), D(ax), D(mj))
            if abs(d[1]) < 1e-9:
                return Geom_CylindricalSurface(a3, rad)
            return Geom_ConicalSurface(a3, math.atan(d[1] / d[2]), rad)  # radius grows along the axis by sin/cos per unit; cos can be < 0 (FTC 09)
        if n == "sphere-surface":
            c = self.vec(s, 0)
            rad = MM * abs(self.dbl(s)[0])  # negative radius only flips the normal
            return Geom_SphericalSurface(gp_Ax3(P(c), D(self.vec(s, 2)), D(self.vec(s, 1))), rad)
        if n == "torus-surface":
            d = self.dbl(s)
            return Geom_ToroidalSurface(gp_Ax3(P(self.vec(s, 0)), D(self.vec(s, 1)), D(self.vec(s, 2))),
                                        MM * d[0], MM * abs(d[1]))  # a negative minor radius only flips the normal
        return None

    def edge(self, e):
        if e in self.edges:
            return self.edges[e]
        r = self.r[e]
        v0, t0, v1, t1, c = (r.values[i][1] for i in (3, 4, 5, 6, 8))
        if c == -1:  # no curve: a degenerate edge (cone apex, sphere pole); ShapeFix_Wire adds them back
            self.bad("degenerate-edge-skipped")
            return None
        rc = self.r[c]
        rev = r.values[9][1]  # edge sense: a reversed edge walks its curve backwards (measured on 3 files, 0 misses)
        if rc.name == "straight-curve":
            dv = self.vec(c, 1)
            curve = Geom_Line(gp_Lin(P(self.vec(c, 0)), D(tuple(-x for x in dv) if rev else dv)))
            # the direction is not always a unit vector: its length is the parameter scale (CTC 03, measured)
            k = MM * math.sqrt(sum(x * x for x in self.vec(c, 1)))
            t0, t1 = k * t0, k * t1
        elif rc.name == "ellipse-curve":
            ctr, nrm, mj = self.vec(c, 0), self.vec(c, 1), self.vec(c, 2)
            a = MM * math.sqrt(sum(x * x for x in mj))
            ratio = self.dbl(c)[0]
            ax = gp_Ax2(P(ctr), D(tuple(-x for x in nrm) if rev else nrm), D(mj))
            curve = Geom_Circle(gp_Circ(ax, a)) if abs(ratio - 1) < 1e-9 else Geom_Ellipse(gp_Elips(ax, a, a * ratio))
        else:
            self.bad("curve:" + str(rc.name))
            return None
        mk = BRepBuilderAPI_MakeEdge(curve, self.vertex(v0), self.vertex(v1), t0, t1)
        if not mk.IsDone():
            print("edge fail", e, rc.name, rev, mk.Error())
            self.bad("edge-not-done")
            return None
        self.edges[e] = mk.Edge()
        return self.edges[e]

    def wire(self, lp):
        first = self.ptr(lp, 4)
        mk = BRepBuilderAPI_MakeWire()
        c = first
        for _ in range(10000):
            ed = self.edge(self.ptr(c, 6))
            if ed is None:
                if self.r[self.ptr(c, 6)].values[8][1] == -1:  # degenerate: skip
                    c = self.ptr(c, 3)
                    if c == first:
                        break
                    continue
                return None
            mk.Add(ed.Reversed() if self.r[c].values[7][1] else ed)
            c = self.ptr(c, 3)
            if c == first:
                break
        if not mk.IsDone():
            self.bad("wire-not-done")
            return None
        return mk.Wire()

    def apex_loop(self, f):
        """True when the face has a loop of one coedge on a curve-less (degenerate) edge: a cone tip."""
        lp = self.ptr(f, 4)
        while lp != -1:
            c = self.ptr(lp, 4)
            if self.ptr(c, 3) == c and self.r[self.ptr(c, 6)].values[8][1] == -1:
                return True
            lp = self.ptr(lp, 3)
        return False

    def apex_face(self, surf, wire):
        """A cone tip face: the cone from its one circle edge to the apex, built by (u, v) bounds."""
        from OCC.Core.GeomAPI import GeomAPI_ProjectPointOnSurf
        from OCC.Core.BRep import BRep_Tool
        from OCC.Core.TopExp import topexp
        pt = BRep_Tool.Pnt(topexp.FirstVertex(next_edge(wire)))
        pr = GeomAPI_ProjectPointOnSurf(pt, surf)
        _, v = pr.LowerDistanceParameters()
        apex = -surf.RefRadius() / math.sin(surf.SemiAngle())
        return BRepBuilderAPI_MakeFace(surf, 0.0, 2 * math.pi, min(v, apex), max(v, apex), 1e-7).Face()

    def faces(self, shell=None):
        out = []
        for i, r in enumerate(self.r):
            if r.name != "face" or (shell is not None and self.ptr(i, 5) != shell):
                continue
            s = self.surface(self.ptr(i, 7))
            if s is None:
                self.bad("surface:" + str(self.r[self.ptr(i, 7)].name))
                continue
            wires, lp = [], self.ptr(i, 4)
            while lp != -1:
                w = self.wire(lp)
                if w is not None:
                    wires.append(w)
                lp = self.ptr(lp, 3)
            if not wires:
                self.bad("face-no-wire")
                continue
            if self.apex_loop(i):
                out.append(self.apex_face(s, wires[0]))
                continue
            mk = BRepBuilderAPI_MakeFace(s, wires[0])
            for w in wires[1:]:
                mk.Add(w)
            fix = ShapeFix_Face(mk.Face())
            fix.Perform()
            out.append(fix.Face())
        return out


def next_edge(wire):
    ex = TopExp_Explorer(wire, TopAbs_EDGE)
    return topods.Edge(ex.Current())


def vol(shape):
    p = GProp_GProps()
    brepgprop.VolumeProperties(shape, p)
    return p.Mass()


def run(path):
    t = time.time()
    recs = main_model(path)
    b = Builder(recs)
    # one solid per shell: the biggest shell is the solid; the others (1-face sheets in FTC 06) are reported
    from collections import Counter
    shells_n = Counter(b.ptr(i, 5) for i, r in enumerate(recs) if r.name == "face")
    main = shells_n.most_common(1)[0][0]
    faces = b.faces(main)
    sew = BRepBuilderAPI_Sewing(1e-3)
    for f in faces:
        sew.Add(f)
    sew.Perform()
    sh = sew.SewedShape()
    res = {"faces_ipt": sum(1 for r in recs if r.name == "face"), "shell_sizes": sorted(shells_n.values(), reverse=True), "faces_built": len(faces), "miss": b.miss,
           "free_edges": sew.NbFreeEdges()}
    shells = []
    ex = TopExp_Explorer(sh, TopAbs_SHELL)
    while ex.More():
        shells.append(topods.Shell(ex.Current()))
        ex.Next()
    res["shells"] = len(shells)
    solid = None
    if shells:
        big = max(shells, key=lambda s: abs(vol(s)))
        fx = ShapeFix_Shell(big)
        fx.Perform()
        sol = TopoDS_Solid()
        BRep_Builder().MakeSolid(sol)
        BRep_Builder().Add(sol, fx.Shell())
        sf = ShapeFix_Solid(sol)
        sf.Perform()
        solid = sf.Solid()
        if vol(solid) < 0:
            solid = solid.Reversed()
        res["valid"] = BRepCheck_Analyzer(solid).IsValid()
        res["volume"] = vol(solid)
        bb = Bnd_Box()
        brepbndlib.AddOptimal(solid, bb, False, False)
        x0, y0, z0, x1, y1, z1 = bb.Get()
        res["extents"] = sorted([x1 - x0, y1 - y0, z1 - z0])
    res["secs"] = time.time() - t
    return res, solid


if __name__ == "__main__":
    print(run(sys.argv[1])[0])
