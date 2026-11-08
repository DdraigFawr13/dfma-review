"""Run ipt_shape on the target .ipt files and compare with the NIST STEP.
PYTHONPATH=service:tests:docs/research/inventor-shape-spike python docs/research/inventor-shape-spike/compare.py [names]"""
import re
import sys
import time
from pathlib import Path

from ipt_shape import run
from nist_files import ap242_files

from OCC.Core.BRepBndLib import brepbndlib
from OCC.Core.BRepGProp import brepgprop
from OCC.Core.Bnd import Bnd_Box
from OCC.Core.GProp import GProp_GProps
from dfma.read import read_step, volume
from dfma.features import holes
from dfma.frame import face_info, part_frame
from dfma.mesh import mesh_faces

TARGETS = ["ctc_03_asme1_2021", "ctc_04_asme1_2021", "ftc_06_asme1_2021", "ftc_06_asme1_2024",
           "ftc_09_asme1_2021", "ftc_09_asme1_2024", "ftc_11_asme1_2021"]


def step_for(name):
    m = re.match(r"(ctc|ftc)_(\d\d)_asme1_(\d{4})", name)
    kind, nn, yr = m.groups()
    case = f"stc_{nn}" if yr == "2024" else f"{kind}_{nn}"
    return next(p for p in ap242_files() if p.name.startswith(f"nist_{case}_asme1_ap242"))


def area(s):
    p = GProp_GProps()
    brepgprop.SurfaceProperties(s, p)
    return p.Mass()


def ext(s):
    bb = Bnd_Box()
    brepbndlib.AddOptimal(s, bb, False, False)
    x0, y0, z0, x1, y1, z1 = bb.Get()
    return sorted([x1 - x0, y1 - y0, z1 - z0])


def hole_list(solid, faces):
    infos = [face_info(i, f) for i, f in enumerate(faces)]
    meshes = mesh_faces(solid, faces)
    verts = [tuple(m["positions"][i:i + 3]) for m in meshes for i in range(0, len(m["positions"]), 3)]
    fr = part_frame(infos, verts)
    return holes(solid, faces, fr)


def faces_of(solid):
    from OCC.Core.TopAbs import TopAbs_FACE
    from OCC.Core.TopExp import TopExp_Explorer
    from OCC.Core.TopoDS import topods
    out, ex = [], TopExp_Explorer(solid, TopAbs_FACE)
    while ex.More():
        out.append(topods.Face(ex.Current()))
        ex.Next()
    return out


def sig(hs):
    return sorted((round(h.get("diameter_mm", h.get("diameter", 0)) or 0, 2), round(h.get("depth_mm", h.get("depth", 0)) or 0, 2)) for h in hs)


for name in (sys.argv[1:] or TARGETS):
    path = Path("tests/inventor/files") / f"INV_nist_{name}.ipt"
    r, solid = run(str(path))
    step = read_step(step_for(name))
    print(name, "STEP", step_for(name).name)
    print("  faces", r["faces_built"], "/", r["faces_ipt"], "STEP faces", len(step.faces), "valid", r.get("valid"),
          "shells", r["shells"], "free edges", r["free_edges"], "miss", r["miss"], f"{r['secs']:.1f}s")
    if solid is None:
        continue
    vi, vs = abs(r["volume"]), step.volume_mm3
    print(f"  volume ipt {vi:.2f} step {vs:.2f} diff {100 * (vi - vs) / vs:+.3f}%  signed ipt {r['volume']:.1f}")
    print("  area ipt %.1f step %.1f" % (area(solid), area(step.solid)))
    print("  extents ipt", [round(x, 2) for x in ext(solid)], "step", [round(x, 2) for x in ext(step.solid)])
    try:
        hi = hole_list(solid, faces_of(solid))
        hs = hole_list(step.solid, step.faces)
        print("  holes ipt", len(hi), "step", len(hs))
        if hi and "diameter_mm" not in hi[0]:
            print("  keys", list(hi[0].keys()))
    except Exception as e:
        print("  holes failed:", repr(e)[:200])
