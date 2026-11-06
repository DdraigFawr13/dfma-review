"""Triangulate each face (spec Flow step 6). Flat xyz per face, mm, file coordinates;
indices are local to the face; normals are computed in the browser."""

from __future__ import annotations

from OCC.Core.BRep import BRep_Tool
from OCC.Core.BRepMesh import BRepMesh_IncrementalMesh
from OCC.Core.TopAbs import TopAbs_REVERSED
from OCC.Core.TopLoc import TopLoc_Location

from . import settings


def mesh_faces(solid, faces: list) -> list[dict]:
    """Return [{"positions": [...], "indices": [...]}] in face-id order."""
    BRepMesh_IncrementalMesh(solid, settings.MESH_LINEAR_MM, False, settings.MESH_ANGULAR_RAD, True)
    out = []
    for face in faces:
        location = TopLoc_Location()
        tri = BRep_Tool.Triangulation(face, location)
        positions: list[float] = []
        indices: list[int] = []
        if tri is not None:
            transform = location.Transformation()
            for i in range(1, tri.NbNodes() + 1):
                p = tri.Node(i).Transformed(transform)
                positions += [round(p.X(), 5), round(p.Y(), 5), round(p.Z(), 5)]
            reversed_face = face.Orientation() == TopAbs_REVERSED
            for i in range(1, tri.NbTriangles() + 1):
                a, b, c = tri.Triangle(i).Get()
                if reversed_face:
                    b, c = c, b  # keep triangles facing out of the material
                indices += [a - 1, b - 1, c - 1]
        out.append({"positions": positions, "indices": indices})
    return out
