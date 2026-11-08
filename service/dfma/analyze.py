"""Run the whole analysis in this process and return the response dict (spec Layout, Flow)."""

from __future__ import annotations

from pathlib import Path

from . import settings
from .drivers import cost_drivers
from .frame import extents_mm, face_info, part_frame, turning_axis
from .mesh import mesh_faces
from .plan import plan
from .errors import ReadError
from .features import (coaxial, grooves, hole_walls, holes, number, pocket_on_axis, pockets, profile_feature,
                       split_bores, turned_profile, walls)
from . import turning
from .rules import RULES
from .read import read_step
from .units import mm_to_in

__all__ = ["ReadError", "analyze"]

TURN_NEEDS_AXIS = ("turn_slender", "turn_offaxis", "bore_depth")


def _off_axis(f: dict, faces, turn: dict) -> tuple[float, float]:
    """(angle deg, offset mm) of a hole, bore or pocket from the turning axis."""
    if f["kind"] == "pocket":
        return pocket_on_axis(f, faces, turn)
    from .features import _cylinder
    line = next((c for i in f["faces"] if (c := _cylinder(i, faces[i], tapers=True))), None)
    if line is None:
        return 90.0, 0.0
    return coaxial(line.origin, line.axis, turn["origin"], turn["axis"])


def analyze(path: str | Path, name: str, process: str = "mill", material: str = "al6061",
            ipt_path: str | Path | None = None, ipt_name: str | None = None) -> dict:
    if process not in settings.PROCESSES:
        raise ValueError(f"unknown process {process!r}")
    if material not in settings.MATERIALS:
        raise ValueError(f"unknown material {material!r}")

    part = read_step(path)
    inventor = None
    if ipt_path is not None:  # I1: the .ipt beside its STEP; checks before any analysis (spec I1 Builder defaults)
        from . import inventor as inv
        ipt = inv.read_ipt(ipt_path)
        inv.check_part_type(ipt, part)
        inventor = inv.inventor_block(ipt, ipt_name or Path(ipt_path).name, inv.check_pair(ipt, part))
    infos = [face_info(i, f) for i, f in enumerate(part.faces)]
    meshes = mesh_faces(part.solid, part.faces)
    vertices = [tuple(m["positions"][i:i + 3]) for m in meshes for i in range(0, len(m["positions"]), 3)]
    frame = part_frame(infos, vertices)
    hole_list = holes(part.solid, part.faces, frame)
    hole_faces = {i for f in hole_list for i in f["faces"]}
    pocket_list, corner_list = pockets(part.solid, part.faces, frame, hole_faces)
    wall_list = walls(part.solid, part.faces) + hole_walls(part.solid, part.faces, hole_list)
    pocket_list, corner_list = number(pocket_list, "pocket"), number(corner_list, "corner")
    turn_features = None
    # The turning axis: for Turning (S6) and, on Milling, for looks_turned (D-028)
    turn = turned_profile(part.faces, [f.area for f in infos], vertices, turning_axis(infos, vertices))
    if process == "turn":  # S6 (spec Features "Turned profile", "Groove", "Bore")
        if "diameter" in turn:
            hole_list, bores, renamed = split_bores(hole_list, part.faces, turn)
            for w in wall_list:  # a wall at a hole names it by its new id
                if "hole" in w:
                    w["hole"] = renamed[w["hole"]]
            taken = {i for f in hole_list + bores for i in f["faces"]}
            groove_list = number(grooves(part.solid, part.faces, turn, taken), "groove")
            taken |= {i for g in groove_list for i in g["faces"]} | {i for p in pocket_list for i in p["faces"]}
            profile = {"id": "profile-1", **profile_feature(part.faces, turn, taken)}
            for f in hole_list + bores + pocket_list:
                f.pop("on_axis", None)  # recorded instead as the angle and offset turn_offaxis reads
                f["off_axis_deg"], f["off_axis_mm"] = _off_axis(f, part.faces, turn)
            turn_features = bores + groove_list + [profile]
    features = (hole_list + (turn_features or []) + pocket_list + corner_list + number(wall_list, "wall"))
    pocket_faces = {i for f in pocket_list for i in f["faces"]}
    summary = {"units_in_file": part.units_in_file, "frame": frame, "turn": turn, "face_count": len(part.faces)}
    limits = settings.thresholds(material)
    rules = [rule for rule in RULES if process in rule.PROCESSES
             and not (rule.ID in TURN_NEEDS_AXIS and turn_features is None)]  # no axis: only the shared rules
    findings = [f for rule in rules for f in rule.check(features, summary, limits)]
    findings = [{"id": f"F{n}", **f} for n, f in enumerate(findings, 1)]
    passed = [p for rule in rules if hasattr(rule, "passes") for p in rule.passes(features, summary, limits)]
    if process == "mill":
        milled = plan(features, findings, frame, part.units_in_file)
    elif turn_features is not None:
        milled = turning.plan(features, findings, part.units_in_file)
    else:  # turned, but no turning axis found (turn_axis): nothing to plan
        milled = {"machine": None, "setups": [], "operations": [], "tools": [], "tool_changes": 0}

    bbox_in = [round(mm_to_in(e), 6) for e in extents_mm(frame, vertices)]
    # The stock in the machine plan: the part's own size, no allowance added (Morgan, 2026-11-08)
    if turn_features is not None:
        stock = {"shape": "bar", "diameter_in": round(mm_to_in(turn["diameter"]), 6),
                 "length_in": round(mm_to_in(turn["length"]), 6)}
    else:
        stock = {"shape": "block", "size_in": bbox_in}

    result = {
        "part": {
            "name": name,
            "units_in_file": part.units_in_file,
            "bbox_in": bbox_in,
            "face_count": len(part.faces),
            "volume_mm3": part.volume_mm3,
            "ignored_solids": part.ignored_solids,
            # Torus and other faces, except those that belong to a pocket (S3).
            "not_analysed_faces": [f.id for f in infos if f.kind in ("torus", "other") and f.id not in pocket_faces],
            "frame": {k: list(v) for k, v in frame.items()},
        },
        "faces": [{"id": f.id, "kind": f.kind, **m} for f, m in zip(infos, meshes)],
        "features": features,
        "findings": findings,
        "rules_run": [rule.ID for rule in rules],
        "passed": passed,  # D-023 proposed: the checks each feature passed, with the math
        "machine": milled["machine"],
        "turn_axis": list(turn["axis"]) if turn_features is not None else None,
        "stock": stock,
        "setups": milled["setups"],
        "operations": milled["operations"],
        "tools": milled["tools"],
        "tool_changes": milled["tool_changes"],
        "cost_drivers": cost_drivers(findings, milled["setups"], milled["tools"]),
        "assumptions": list(settings.ASSUMPTIONS) + (settings.TURN_ASSUMPTIONS if process == "turn" else []) + ([settings.MSG_OPEN_SHELL.format(n=part.free_edges)]
                                                     if part.free_edges else [])
                       + ([settings.MSG_NO_UNIT] if part.units_in_file == "none" else []),
    }
    if inventor is not None:
        result["inventor"] = inventor
        result["assumptions"].append(settings.IPT_ASSUMPTION)
    return result
