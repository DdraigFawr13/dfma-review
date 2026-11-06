"""Run the whole analysis in this process and return the response dict (spec Layout, Flow)."""

from __future__ import annotations

from pathlib import Path

from . import settings
from .frame import extents_mm, face_info, part_frame
from .mesh import mesh_faces
from .errors import ReadError
from .features import holes
from .rules import RULES
from .read import read_step
from .units import mm_to_in

__all__ = ["ReadError", "analyze"]


def analyze(path: str | Path, name: str, process: str = "mill", material: str = "al6061") -> dict:
    if process not in settings.PROCESSES:
        raise ValueError(f"unknown process {process!r}")
    if material not in settings.MATERIALS:
        raise ValueError(f"unknown material {material!r}")

    part = read_step(path)
    infos = [face_info(i, f) for i, f in enumerate(part.faces)]
    meshes = mesh_faces(part.solid, part.faces)
    vertices = [tuple(m["positions"][i:i + 3]) for m in meshes for i in range(0, len(m["positions"]), 3)]
    frame = part_frame(infos, vertices)
    features = holes(part.solid, part.faces, frame)
    summary = {"units_in_file": part.units_in_file}
    limits = settings.thresholds(material)
    findings = [f for rule in RULES for f in rule.check(features, summary, limits)]
    findings = [{"id": f"F{n}", **f} for n, f in enumerate(findings, 1)]

    return {
        "part": {
            "name": name,
            "units_in_file": part.units_in_file,
            "bbox_in": [round(mm_to_in(e), 6) for e in extents_mm(frame, vertices)],
            "face_count": len(part.faces),
            "volume_mm3": part.volume_mm3,
            "ignored_solids": part.ignored_solids,
            # Until S3 knows pocket fillets, every torus and every other face is listed.
            "not_analysed_faces": [f.id for f in infos if f.kind in ("torus", "other")],
            "frame": {k: list(v) for k, v in frame.items()},
        },
        "faces": [{"id": f.id, "kind": f.kind, **m} for f, m in zip(infos, meshes)],
        "features": features,
        "findings": findings,
        "rules_run": [rule.ID for rule in RULES],
        "machine": None,
        "turn_axis": None,
        "setups": [],
        "operations": [],
        "tools": [],
        "tool_changes": 0,
        "cost_drivers": [],
        "assumptions": list(settings.ASSUMPTIONS),
    }
