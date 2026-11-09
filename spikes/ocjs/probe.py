"""The engine calls the recognizers make beyond reading (mesh, rays, point-in-face, point-in-solid,
distance, boolean common, projection, face normal), on each STEP file; probe.mjs makes the same calls."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "service"))
from OCC.Core.Bnd import Bnd_Box
from OCC.Core.BRep import BRep_Tool
from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Common
from OCC.Core.BRepBndLib import brepbndlib
from OCC.Core.BRepClass import BRepClass_FaceClassifier
from OCC.Core.BRepClass3d import BRepClass3d_SolidClassifier
from OCC.Core.BRepExtrema import BRepExtrema_DistShapeShape
from OCC.Core.BRepGProp import brepgprop, BRepGProp_Face
from OCC.Core.BRepMesh import BRepMesh_IncrementalMesh
from OCC.Core.GeomAPI import GeomAPI_ProjectPointOnSurf
from OCC.Core.GProp import GProp_GProps
from OCC.Core.IntCurvesFace import IntCurvesFace_ShapeIntersector
from OCC.Core.TopLoc import TopLoc_Location
from OCC.Core.gp import gp_Dir, gp_Lin, gp_Pnt, gp_Vec
from dfma.read import read_step

def r(x): return float(f"{x:.9g}")

NO_PROJECT = {'nist_ftc_08_asme1_ap242-e1-tg.stp'}  # GeomAPI_ProjectPointOnSurf and BRepAlgoAPI_Common segfault pythonocc here

def probe(path):
    res = read_step(path); solid, faces = res.solid, res.faces
    box = Bnd_Box(); brepbndlib.Add(solid, box); x0, y0, z0, x1, y1, z1 = box.Get()
    c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    BRepMesh_IncrementalMesh(solid, 0.05, False, 0.5, True)
    mesh = []
    for f in faces:
        loc = TopLoc_Location(); t = BRep_Tool.Triangulation(f, loc)
        if t is None: mesh.append(None); continue
        tr = loc.Transformation(); s = 0.0
        for i in range(1, t.NbNodes() + 1):
            p = t.Node(i).Transformed(tr); s += p.X() + 2 * p.Y() + 3 * p.Z()
        tri = sum(sum(t.Triangle(i).Get()) for i in range(1, t.NbTriangles() + 1))
        mesh.append([t.NbNodes(), t.NbTriangles(), r(s), tri])
    inter = IntCurvesFace_ShapeIntersector(); inter.Load(solid, 1e-6); rays = []
    for d in [(1,0,0),(0,1,0),(0,0,1),(-1,0,0),(0,-1,0),(0,0,-1),(1,1,1)]:
        inter.Perform(gp_Lin(gp_Pnt(*c), gp_Dir(*d)), -1e9, 1e9)
        rays.append(sorted(r(inter.WParameter(i)) for i in range(1, inter.NbPnt() + 1)) if inter.IsDone() else None)
    sc = BRepClass3d_SolidClassifier(solid); inside = []
    for k in range(9):
        p = (x0 + (x1 - x0) * k / 8, y0 + (y1 - y0) * (8 - k) / 8, z0 + (z1 - z0) * k / 8)
        sc.Perform(gp_Pnt(*p), 1e-6); inside.append(int(sc.State()))
    fc, proj, dist = [], [], []
    for i, f in enumerate(faces[:40]):
        g = GProp_GProps(); brepgprop.SurfaceProperties(f, g); m = g.CentreOfMass()
        try: fc.append(int(BRepClass_FaceClassifier(f, m, 1e-6).State()))
        except Exception: fc.append('err')
        pj = None if path.name in NO_PROJECT else GeomAPI_ProjectPointOnSurf(gp_Pnt(*c), BRep_Tool.Surface(f))
        if pj is not None and pj.NbPoints():
            u, v = pj.LowerDistanceParameters(); pt, vec = gp_Pnt(), gp_Vec(); BRepGProp_Face(f).Normal(u, v, pt, vec)
            proj.append([r(pj.LowerDistance()), r(vec.Magnitude())])
        else: proj.append(None)
        if i:
            try: dist.append(r(BRepExtrema_DistShapeShape(faces[0], f).Value()))
            except Exception: dist.append('err')
    g = GProp_GProps()
    if path.name not in NO_PROJECT: brepgprop.SurfaceProperties(BRepAlgoAPI_Common(faces[0], solid).Shape(), g)
    return {"mesh": mesh, "rays": rays, "inside": inside, "face_in": fc, "proj": proj, "dist": dist, "common_area": r(g.Mass())}

src = Path(sys.argv[1])
out = {p.name: probe(p) for p in ([src] if src.is_file() else sorted(src.glob("*.stp")))}
Path(sys.argv[2]).write_text(json.dumps(out))
