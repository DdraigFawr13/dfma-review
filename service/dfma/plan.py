"""The mill plan (spec Design "Plan"): setups, machine, operations, tools and tool changes.

Setups are the smallest set of directions (+-X +-Y +-Z of the part frame) that reaches every hole and
pocket the `access` rule did not flag, by brute force over the 63 non-empty subsets; ties go to the
subset whose directions come first in the order +Z -Z +X -X +Y -Y. A countersink (D-022) must be cut
from its own end, so each countersunk end is one more thing to reach, in that end's direction only.
"""

from __future__ import annotations

from itertools import combinations

from . import tools as T
from .units import MM_PER_IN

ORDER = ("+Z", "-Z", "+X", "-X", "+Y", "-Y")
MACHINE_3AXIS = "3-axis mill"
MACHINE_MULTI = "4/5-axis mill or fixture"
DRILL_MATCH_IN = 0.0005  # as hole_size: a hole within this of a drill is drilled with it


def _cover(needs: list[set[str]]) -> list[str]:
    """The smallest subset of ORDER meeting every need (a need is met by any one of its directions),
    the first such subset in ORDER position by position on a tie; [+Z] when nothing needs a setup."""
    needs = [n for n in needs if n]
    if not needs:
        return ["+Z"]
    for size in range(1, len(ORDER) + 1):
        for combo in combinations(range(len(ORDER)), size):  # lexicographic: earlier directions first
            dirs = {ORDER[i] for i in combo}
            if all(n & dirs for n in needs):
                return [ORDER[i] for i in combo]
    raise AssertionError("every need holds a direction in ORDER")


def _frame_dir(v, frame: dict) -> str | None:
    from .features import _frame_dir as fd
    return fd(tuple(v), frame)


def _drill_id(drill: T.Drill) -> str:
    return f"dr-{drill.diameter_mm:g}mm" if drill.metric else f"dr-{drill.diameter_mm / MM_PER_IN:.4f}"


def _mill_id(d_mm: float) -> str:
    return f"em-{d_mm / MM_PER_IN:.3f}"


def _hole_tool(f: dict, units: str) -> dict:
    """The matching drill, or pick_end_mill(hole radius, hole diameter) when no drill matches (spec Plan)."""
    d = f["dims_mm"]["diameter"]
    drill = T.nearest_drill(d, units)
    if abs(drill.diameter_mm - d) <= T.match_tolerance_mm() + 1e-9:
        return {"id": _drill_id(drill), "kind": "drill", "diameter_in": round(drill.diameter_mm / MM_PER_IN, 6),
                "undersized": False}
    mill, undersized = T.pick_end_mill(d / 2, d)
    return {"id": _mill_id(mill), "kind": "end_mill", "diameter_in": round(mill / MM_PER_IN, 6),
            "undersized": undersized}


def _pocket_tool(f: dict) -> dict:
    mill = f["dims_mm"]["end_mill_mm"]
    return {"id": _mill_id(mill), "kind": "end_mill", "diameter_in": round(mill / MM_PER_IN, 6),
            "undersized": bool(f["dims_mm"].get("undersized", 0))}


def _countersink_tool(deg: float) -> dict:
    return {"id": f"cs-{deg:g}", "kind": "countersink", "diameter_in": None, "undersized": False}


def _rank(tool: dict) -> tuple:
    """Within a setup: end mills largest to smallest, then drills smallest to largest (spec Plan), then
    countersinks (after their holes are drilled; D-022), by angle."""
    if tool["kind"] == "end_mill":
        return (0, -tool["diameter_in"], tool["id"])
    if tool["kind"] == "drill":
        return (1, tool["diameter_in"], tool["id"])
    return (2, 0.0, tool["id"])


def plan(features: list[dict], findings: list[dict], frame: dict, units_in_file: str) -> dict:
    """machine, setups, operations, tools and tool_changes for a mill part."""
    flagged = {f["feature"] for f in findings if f["rule"] == "access"}
    jobs = []  # (feature id, the directions it can be cut from, tool)
    for f in features:
        if f["kind"] not in ("hole", "pocket") or f["id"] in flagged or not f["open_dirs"]:
            continue  # flagged, or a void sealed inside the part (no open end): not planned (assumptions)
        tool = _hole_tool(f, units_in_file) if f["kind"] == "hole" else _pocket_tool(f)
        jobs.append((f["id"], set(f["open_dirs"]), tool))
        for v, deg in zip(f.get("countersink_vectors", []), f.get("countersink_degs", [])):
            if d := _frame_dir(v, frame):  # always: a hole with no end along an axis is flagged above
                jobs.append((f["id"], {d}, _countersink_tool(deg)))  # each end its own angle

    setups = _cover([dirs for _, dirs, _ in jobs])
    members: list[list[str]] = [[] for _ in setups]
    ops: dict[tuple[int, str], dict] = {}
    tool_list: dict[str, dict] = {}
    for fid, dirs, tool in jobs:
        k = next(i for i, d in enumerate(setups) if d in dirs)
        if fid not in members[k]:
            members[k].append(fid)
        tool_list.setdefault(tool["id"], tool)
        op = ops.setdefault((k, tool["id"]), {"setup": k, "tool": tool["id"], "features": []})
        if fid not in op["features"]:
            op["features"].append(fid)
    operations = sorted(ops.values(), key=lambda o: (o["setup"], _rank(tool_list[o["tool"]])))
    used = list(dict.fromkeys(o["tool"] for o in operations))
    return {
        "machine": MACHINE_MULTI if flagged else MACHINE_3AXIS,
        "setups": [{"direction": d, "features": m} for d, m in zip(setups, members)],
        "operations": operations,
        "tools": [tool_list[t] for t in used],
        "tool_changes": len(operations),
    }
