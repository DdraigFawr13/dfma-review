"""The lathe plan (spec Design "Turning"): one setup, `turn`; operations in order turn, on-axis drills, bore,
groove, then each off-axis feature as a milling operation (pick_end_mill or a drill); the machine is
"lathe", or "lathe with live tooling" if turn_offaxis fired. One operation per tool, as in the mill plan,
so tool loads are the number of operations."""

from __future__ import annotations

from . import settings
from .plan import _hole_tool, _pocket_tool, _rank
from .rules.turn_offaxis import off_axis
from .units import MM_PER_IN

MACHINE_LATHE = "lathe"
MACHINE_LIVE = "lathe with live tooling"
TURN_TOOL = {"id": "turn", "kind": "turn", "diameter_in": None, "undersized": False}
BORE_TOOL = {"id": "bore", "kind": "bore", "diameter_in": None, "undersized": False}


def groove_tool(width_mm: float) -> dict:
    """The widest grooving insert that fits the groove; the narrowest, undersized, when none fits."""
    widths = sorted(settings.tools_config()["turning"]["groove_widths_in"])
    fits = [w for w in widths if w * MM_PER_IN <= width_mm + 1e-3]
    w = fits[-1] if fits else widths[0]
    return {"id": f"groove-{w:.3f}", "kind": "groove", "diameter_in": None, "width_in": w, "undersized": not fits}


def plan(features: list[dict], findings: list[dict], units_in_file: str) -> dict:
    """machine, setups, operations, tools and tool_changes for a turned part (a profile was found)."""
    jobs: list[tuple[int, str, dict, list[int]]] = []  # (stage, feature id, tool, faces)
    for f in features:
        if f["kind"] == "profile":
            jobs.append((0, f["id"], TURN_TOOL, f["faces"]))
        elif f["kind"] == "bore":
            jobs.append((2, f["id"], BORE_TOOL, f["faces"]))
        elif f["kind"] == "groove":
            jobs.append((3, f["id"], groove_tool(f["dims_mm"]["width"]), f["faces"]))
        elif f["kind"] in ("hole", "pocket") and f["open_vectors"]:
            tool = _hole_tool(f, units_in_file) if f["kind"] == "hole" else _pocket_tool(f)
            jobs.append((1 if f["kind"] == "hole" and not off_axis(f) else 4, f["id"], tool, f["faces"]))

    ops: dict[str, dict] = {}
    stage_of: dict[str, tuple] = {}
    tools: dict[str, dict] = {}
    members: list[str] = []
    for stage, fid, tool, faces in jobs:
        tools.setdefault(tool["id"], tool)
        stage_of.setdefault(tool["id"], (stage, *_rank(tool)))
        op = ops.setdefault(tool["id"], {"setup": 0, "tool": tool["id"], "features": [], "faces": []})
        op["features"].append(fid)
        op["faces"] = sorted({*op["faces"], *faces})
        if fid not in members:
            members.append(fid)
    operations = sorted(ops.values(), key=lambda o: stage_of[o["tool"]])
    live = any(f["rule"] == "turn_offaxis" for f in findings)
    return {
        "machine": MACHINE_LIVE if live else MACHINE_LATHE,
        "setups": [{"direction": "turn", "features": members}],
        "operations": operations,
        "tools": [tools[o["tool"]] for o in operations],
        "tool_changes": len(operations),
    }
