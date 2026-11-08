import sys, json
from dfma.read import read_step
from dfma.features import holes, _cylinder
from dfma.analyze import face_info, mesh_faces, part_frame
part = read_step(sys.argv[1])
infos = [face_info(i, f) for i, f in enumerate(part.faces)]
meshes = mesh_faces(part.solid, part.faces)
vertices = [tuple(m['positions'][i:i + 3]) for m in meshes for i in range(0, len(m['positions']), 3)]
frame = part_frame(infos, vertices)
out = []
for h in holes(part.solid, part.faces, frame):
    c = next((c for i in h["faces"] if (c := _cylinder(i, part.faces[i], tapers=True))), None)
    if not c: continue
    a = c.axis; o = c.origin
    t = sum(o[k]*a[k] for k in range(3)); base = [o[k]-t*a[k] for k in range(3)]   # axis point at height 0
    top = [base[k]+c.hi*a[k] for k in range(3)]
    out.append({"id": h["id"], "d": round(h["dims_mm"].get("diameter", 2*c.radius), 4), "depth": round(h["dims_mm"].get("depth", 0), 4),
                "axis": [round(x, 4) for x in a], "top": [round(x, 4) for x in top], "type": h.get("type") or h.get("end") or "", "keys": sorted(h["dims_mm"])})
json.dump(out, sys.stdout, indent=0)
