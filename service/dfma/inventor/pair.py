"""Checks before mapping (spec I1 Design "Checks before mapping"). First failure wins.

check_pair (face count, outer size, corners) follows the spec's rules; they stay provisional until
Morgan's first work pair is measured (spec S1 "First", D-035).
"""

from __future__ import annotations

from .. import settings
from ..errors import ReadError
from .part import PLAIN_PART, SHEET_METAL, IptPart


def part_type_reason(ipt: IptPart, step) -> str | None:
    """The kind of part refused, or None for a plain single-body part. `step` is the STEP's ReadResult."""
    if ipt.subtype == SHEET_METAL:
        return "sheet-metal part"
    if ipt.subtype != PLAIN_PART:  # any other document type, or none stored
        return "part of a type this tool can't read yet"
    if len(ipt.model_state_names) > 1:
        return "part with Model States"
    if step.ignored_solids > 0 or ipt.solid_bodies > 1:
        return "multi-body part"
    return None


def check_part_type(ipt: IptPart, step) -> None:
    kind = part_type_reason(ipt, step)
    if kind is not None:
        raise ReadError(settings.MSG_IPT_TYPE.format(kind=kind))


def step_corners(solid) -> list[tuple[float, float, float]]:
    """Every TopAbs_VERTEX of the STEP solid, in mm (prototyped on box_through_hole.step: 10 corners)."""
    from OCC.Core.BRep import BRep_Tool
    from OCC.Core.TopAbs import TopAbs_VERTEX
    from OCC.Core.TopExp import topexp
    from OCC.Core.TopoDS import topods
    from OCC.Core.TopTools import TopTools_IndexedMapOfShape

    m = TopTools_IndexedMapOfShape()
    topexp.MapShapes(solid, TopAbs_VERTEX, m)
    out = []
    for i in range(1, m.Size() + 1):
        p = BRep_Tool.Pnt(topods.Vertex(m.FindKey(i)))
        out.append((p.X(), p.Y(), p.Z()))
    return out


def _bbox(pts):
    return [min(p[k] for p in pts) for k in range(3)] + [max(p[k] for p in pts) for k in range(3)]


def _gaps(pts, others, tol: float) -> list[float]:
    """For each point, its distance to the nearest of `others` when that is within `tol`, else inf.
    Looked up in tol-sized grid cells with their 26 neighbours (spec "Checks before mapping")."""
    cells: dict[tuple[int, int, int], list] = {}
    for q in others:
        cells.setdefault(tuple(int(c // tol) for c in q), []).append(q)
    out = []
    for p in pts:
        cx, cy, cz = (int(c // tol) for c in p)
        best = float("inf")
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for q in cells.get((cx + dx, cy + dy, cz + dz), ()):
                        d = ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2) ** 0.5
                        best = min(best, d)
        out.append(best if best <= tol else float("inf"))
    return out


def _worst(pts, others, gaps, cap: int = 200) -> float:
    """The worst corner gap in mm: exact nearest distances for up to `cap` corners outside the tolerance."""
    far = [p for p, g in zip(pts, gaps) if g == float("inf")][:cap]
    worst = max((g for g in gaps if g != float("inf")), default=0.0)
    for p in far:
        worst = max(worst, min(((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2) ** 0.5
                               for q in others))
    return worst


def pair_reason(ipt: IptPart, step) -> tuple[str | None, dict]:
    """(reason the pair is refused or None, the checks block). `step` is the STEP's ReadResult.
    Provisional until Morgan's first work pair is measured (spec S1 "First", D-035)."""
    tol = settings.PAIR_TOL_MM
    s_corners = step_corners(step.solid)
    checks = {"faces": [ipt.face_count, len(step.faces)], "corners": [len(ipt.corners_mm), len(s_corners)],
              "worst_corner_gap_mm": None}
    if ipt.face_count != len(step.faces):
        return f"the STEP has {len(step.faces)} faces, the .ipt {ipt.face_count}", checks
    if not ipt.corners_mm or not s_corners:
        return f"the .ipt has {len(ipt.corners_mm)} corners, the STEP {len(s_corners)}", checks
    box = max(abs(a - b) for a, b in zip(_bbox(ipt.corners_mm), _bbox(s_corners)))
    if box > tol:
        return f"the parts' outer corners differ by up to {box:.2f} mm", checks
    if len(ipt.corners_mm) != len(s_corners):
        return f"the .ipt has {len(ipt.corners_mm)} corners, the STEP {len(s_corners)}", checks
    for pts, others, this, other in ((ipt.corners_mm, s_corners, ".ipt", "STEP"),
                                     (s_corners, ipt.corners_mm, "STEP", ".ipt")):
        gaps = _gaps(pts, others, tol)
        n = sum(g == float("inf") for g in gaps)
        worst = _worst(pts, others, gaps)
        checks["worst_corner_gap_mm"] = max(checks["worst_corner_gap_mm"] or 0.0, round(worst, 4))
        if n:
            return (f"{n} of {len(pts)} corners of the {this} are more than {tol:g} mm from the {other} "
                    f"(worst {worst:.2f} mm)"), checks
    return None, checks


def check_pair(ipt: IptPart, step) -> dict:
    """The checks block when the pair lines up; ReadError(MSG_PAIR_MISMATCH) with the first reason else."""
    reason, checks = pair_reason(ipt, step)
    if reason is not None:
        raise ReadError(settings.MSG_PAIR_MISMATCH.format(reason=reason))
    return checks


def inventor_block(ipt: IptPart, name: str, checks: dict) -> dict:
    """result["inventor"] for S1 (spec "Response"; S2 adds threads)."""
    return {"name": name, "saved_with": ipt.saved_with, "acis_version": ipt.acis_version, "checks": checks}
