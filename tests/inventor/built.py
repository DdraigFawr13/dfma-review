"""Built inputs for the passing app path (spec I1 S2 "Checks that fail now"): an IptPart made from a STEP test
part itself (its corners and face count), plus threads placed on its hole. Test data, not measured threads."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "service"))

from dfma.inventor.pair import PLAIN_PART, step_corners  # noqa: E402
from dfma.inventor.part import IptPart  # noqa: E402
from dfma.inventor.threads import Thread  # noqa: E402
from dfma.read import read_step  # noqa: E402


def thread(start, axis, depth: float, *, id: str = "thread-1", designation: str = "1/4-20 UNC", cls: str = "2B",
           major=(6.35, 6.48), minor=(4.98, 5.25), tap: float = 5.11, face: str = "hole") -> Thread:
    """A thread from `start` (mm) along the unit `axis` for `depth` mm."""
    end = tuple(start[k] + depth * axis[k] for k in range(3))
    return Thread(id, designation, cls, "ANSI Unified Screw Threads", 1.27, depth, tap, list(minor), list(major),
                  tuple(start), end, tuple(axis), face)


def ipt_from_step(step_path, threads: list[Thread]) -> IptPart:
    step = read_step(step_path)
    return IptPart(saved_with="2024.1 (Build 281209000, 209)", acis_version="229.6.0.65535", subtype=PLAIN_PART,
                   model_state_names=["[Primary]"], solid_bodies=1, corners_mm=step_corners(step.solid),
                   face_count=len(step.faces), threads=threads)


# box_through_hole.step: hole-1 is Ø6.35 mm, through, on the line x 25.4, y 12.7, z 0 to 12.7 (measured)
BOX_TOP, DOWN = (25.4, 12.7, 12.7), (0.0, 0.0, -1.0)
# drill_point_hole.step: hole-1 is Ø6.35 mm, 25.4 mm deep, blind, from z 50.8 down, at x 12.7, y 12.7 (measured)
DRILL_TOP = (12.7, 12.7, 50.8)
