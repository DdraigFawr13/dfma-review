"""I1 S1 J2: check_pair's reasons on built inputs (an IptPart made from box_through_hole.step's own corners)."""

from __future__ import annotations

import pytest

from helpers import PARTS

from dfma import settings
from dfma.errors import ReadError
from dfma.inventor import IptPart, check_pair
from dfma.inventor.pair import PLAIN_PART, step_corners
from dfma.read import read_step

BOX = PARTS / "box_through_hole.step"


@pytest.fixture(scope="module")
def step():
    return read_step(BOX)


def part_from(step, corners=None, faces=None) -> IptPart:
    return IptPart(saved_with="2024 (test)", acis_version="229.6.0.65535", subtype=PLAIN_PART,
                   model_state_names=["[Primary]"], solid_bodies=1,
                   corners_mm=corners if corners is not None else step_corners(step.solid),
                   face_count=len(step.faces) if faces is None else faces)


def refused(ipt, step) -> str:
    with pytest.raises(ReadError) as e:
        check_pair(ipt, step)
    return str(e.value)


def test_matching_pair_passes(step):
    checks = check_pair(part_from(step), step)
    n = len(step_corners(step.solid))
    assert n == 10  # as prototyped for the spec
    assert checks == {"faces": [len(step.faces)] * 2, "corners": [n, n], "worst_corner_gap_mm": 0.0}


def test_face_count(step):
    s = len(step.faces)
    assert refused(part_from(step, faces=s - 1), step) == settings.MSG_PAIR_MISMATCH.format(
        reason=f"the STEP has {s} faces, the .ipt {s - 1}")


def test_shifted(step):
    moved = [(x + 0.02, y, z) for x, y, z in step_corners(step.solid)]
    assert refused(part_from(step, moved), step) == settings.MSG_PAIR_MISMATCH.format(
        reason="the parts' outer corners differ by up to 0.02 mm")


def test_one_corner_moved(step):
    corners = step_corners(step.solid)
    lo = [min(c[k] for c in corners) for k in range(3)]
    hi = [max(c[k] for c in corners) for k in range(3)]
    # a hole corner: inside the outer box in x, so moving it in x keeps the outer size
    i = next(i for i, c in enumerate(corners) if lo[0] + 1 < c[0] < hi[0] - 1)
    corners[i] = (corners[i][0] + 0.02, corners[i][1], corners[i][2])
    assert refused(part_from(step, corners), step) == settings.MSG_PAIR_MISMATCH.format(
        reason="1 of 10 corners of the .ipt are more than 0.01 mm from the STEP (worst 0.02 mm)")


def test_corner_count(step):
    corners = step_corners(step.solid)
    corners.append(corners[0])
    assert refused(part_from(step, corners), step) == settings.MSG_PAIR_MISMATCH.format(
        reason="the .ipt has 11 corners, the STEP 10")


def test_within_tolerance_passes(step):
    corners = [(x + 0.004, y - 0.004, z) for x, y, z in step_corners(step.solid)]
    checks = check_pair(part_from(step, corners), step)
    assert checks["worst_corner_gap_mm"] == pytest.approx(0.0057, abs=1e-4)
