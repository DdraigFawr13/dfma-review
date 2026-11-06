"""S2 rules on single parts: hole_depth (J2) and hole_size, with their evidence and settings."""

from __future__ import annotations

import pytest

from helpers import PARTS, expected

from dfma.analyze import analyze


def run(name: str, material: str = "al6061") -> dict:
    return analyze(PARTS / f"{name}.step", f"{name}.step", "mill", material)


def test_deep_hole():
    result = run("deep_hole")
    assert result["rules_run"] == ["hole_depth", "hole_size"]
    [hole] = result["features"]
    assert hole["id"] == "hole-1" and hole["kind"] == "hole"
    assert hole["dims_mm"]["diameter"] == pytest.approx(6.35, abs=0.001)
    assert hole["dims_mm"]["depth"] == pytest.approx(50.8, abs=0.001)
    # The block's largest faces are its 1 x 2.5 in sides, so frame +Z is a side normal and the
    # hole opens towards frame +Y (spec Flow step 5).
    assert hole["open_dirs"] == ["+Y"]
    assert len(hole["open_vectors"]) == 1
    [f] = result["findings"]
    assert f["id"] == "F1" and f["rule"] == "hole_depth" and f["severity"] == "medium"
    assert f["title"] == "Hole depth 8.0× diameter (limit 6.0×)"
    assert f["measured"] == pytest.approx(8.0, abs=0.01)
    assert f["limit"] == 6.0 and f["unit"] == "ratio"
    assert f["feature"] == "hole-1" and set(f["faces"]) == set(hole["faces"])
    assert f["threshold_source"] == "estimate"
    assert f["suggestion"] == "Needs peck drilling. Make it shallower or larger if the design allows."


def test_very_deep_hole_is_high_with_its_limit():
    [f] = run("very_deep_hole")["findings"]
    assert f["severity"] == "high" and f["limit"] == 10.0
    assert f["title"] == "Hole depth 11.0× diameter (limit 10.0×)"


def test_odd_hole_names_nearest_drill():
    [f] = run("odd_hole")["findings"]
    assert f["rule"] == "hole_size" and f["unit"] == "in"
    assert f["title"] == "Hole 0.260 in not a standard drill size"
    assert f["measured"] == pytest.approx(0.26, abs=0.0005)
    assert f["limit"] == pytest.approx(17 / 64, abs=1e-6)
    assert f["suggestion"] == "Nearest drill 0.266 in (17/64). Use it if the fit allows."


def test_metric_tie_goes_to_smaller_drill():
    # 6.55 mm sits exactly between the 6.5 and 6.6 mm drills.
    [g] = run("odd_metric_hole")["findings"]
    assert g["limit"] == pytest.approx(6.5 / 25.4, abs=1e-6)
    assert g["suggestion"] == "Nearest drill 6.5 mm (0.256 in). Use it if the fit allows."


def test_mm_files_accept_inch_drills():
    # 6.35 mm is 1/4 in: inch-designed parts exported in mm are not flagged (D-013).
    assert run("box_through_hole")["findings"] == []
    from dfma.tools import drills
    assert any(abs(d.diameter_mm - 6.35) < 1e-6 for d in drills("mm"))
    assert not any(abs(d.diameter_mm - 6.5) < 1e-6 for d in drills("inch"))


def test_clean_parts():
    for name in ("box_through_hole", "box_inch", "metric_hole", "flat_bottom_hole", "two_holes_web", "split_hole",
                 "stepped_hole", "drill_point_hole", "clean_holes", "fillet_not_hole"):
        assert run(name)["findings"] == [], name


def test_drill_point_is_part_of_the_hole():
    result = run("drill_point_hole")
    [hole] = result["features"]
    assert hole["dims_mm"]["depth"] == pytest.approx(25.4, abs=0.001)  # to where the cone starts
    assert hole["dims_mm"]["point_mm"] == pytest.approx(expected("drill_point_hole")["point_mm"], abs=0.001)
    kinds = {result["faces"][i]["kind"] for i in hole["faces"]}
    assert kinds == {"cylinder", "cone"}


def test_stepped_hole_segments_share_open_ends():
    holes = run("stepped_hole")["features"]
    assert sorted(round(h["dims_mm"]["diameter"] / 25.4, 4) for h in holes) == [0.25, 0.4375]
    depths = sorted(round(h["dims_mm"]["depth"] / 25.4, 4) for h in holes)
    assert depths == [0.25, 0.75]
    assert all(len(h["open_vectors"]) == 2 for h in holes)  # the chain opens on +Z and -Z
    big = max(holes, key=lambda h: h["dims_mm"]["diameter"])
    small = min(holes, key=lambda h: h["dims_mm"]["diameter"])
    assert len(big["faces"]) == 2 and len(small["faces"]) == 1  # the shoulder belongs to the larger segment
    assert sorted(big["open_dirs"]) == sorted(small["open_dirs"]) == ["+Z", "-Z"]


def test_through_hole_has_two_open_dirs():
    [hole] = run("odd_hole")["features"]
    assert sorted(hole["open_dirs"]) == ["+Z", "-Z"]


def test_blind_holes_have_one_open_end():
    for name, dirs in (("flat_bottom_hole", ["-Z"]), ("drill_point_hole", ["+Y"])):
        [hole] = run(name)["features"]
        assert hole["open_dirs"] == dirs, name
    a, b = run("two_holes_web")["features"]
    assert len(a["open_vectors"]) == len(b["open_vectors"]) == 1
    assert sum(x * y for x, y in zip(a["open_vectors"][0], b["open_vectors"][0])) == pytest.approx(-1.0)


def test_split_hole_is_one_through_hole():
    [hole] = run("split_hole")["features"]
    assert len(hole["faces"]) == 2 and sorted(hole["open_dirs"]) == ["+Z", "-Z"]


def test_holes_above_drill_range_are_skipped(tmp_path):
    from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Cut
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
    from OCC.Core.Interface import Interface_Static
    from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer
    from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt

    box = BRepPrimAPI_MakeBox(3 * 25.4, 3 * 25.4, 1 * 25.4).Shape()
    bore = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(1.5 * 25.4, 1.5 * 25.4, -1), gp_Dir(0, 0, 1)), 0.75 * 25.4, 30).Shape()
    writer = STEPControl_Writer()
    Interface_Static.SetCVal("write.step.unit", "INCH")
    writer.Transfer(BRepAlgoAPI_Cut(box, bore).Shape(), STEPControl_AsIs)
    path = tmp_path / "bore_1500.step"
    writer.Write(str(path))
    result = analyze(path, path.name)
    assert len(result["features"]) == 1
    assert result["findings"] == []  # a 1.500 in hole is above the 1 in drill range (D-010)


def test_limits_come_from_thresholds_toml(monkeypatch):
    from dfma import settings
    table = settings.thresholds("ss304")["hole_depth"]
    assert table == {"medium": 6.0, "high": 10.0, "source": "estimate"}
    # analyze uses the chosen material's table: a stricter plastic limit turns deep_hole high.
    real = settings.thresholds
    monkeypatch.setattr(settings, "thresholds", lambda m: {"hole_depth": {"medium": 4.0, "high": 7.0, "source": "test"}}
                        if m == "plastic" else real(m))
    [f] = run("deep_hole", "plastic")["findings"]
    assert f["severity"] == "high" and f["limit"] == 7.0 and f["threshold_source"] == "test"
    [g] = run("deep_hole", "al6061")["findings"]
    assert g["severity"] == "medium"


def test_ratio_at_the_limit_is_not_flagged(tmp_path):
    # 0.250 in x 1.500 in is exactly 6.0x: "over 6.0" is medium, 6.0 itself is not.
    path = write(tmp_path, "at_limit", cut(box(1, 1, 2), blind(0.5, 0.5, 2, 0.25, 1.5)))
    assert analyze(path, path.name)["findings"] == []


# --- Geometry the fresh review raised (S2 review, 2026-11-06) ---------------------------------

IN = 25.4


def box(l, w, h):
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox
    return BRepPrimAPI_MakeBox(l * IN, w * IN, h * IN).Shape()


def blind(x, y, top, d, depth, angle=None, rotate=0.0):
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeCylinder
    from OCC.Core.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pnt
    import math
    ax = gp_Ax2(gp_Pnt(x * IN, y * IN, (top - depth) * IN), gp_Dir(0, 0, 1))
    if rotate:
        ax.Rotate(gp_Ax1(gp_Pnt(x * IN, y * IN, 0), gp_Dir(0, 0, 1)), rotate)
    args = (ax, d / 2 * IN, depth * IN + 1.0) + ((angle,) if angle else ())
    return BRepPrimAPI_MakeCylinder(*args).Shape()


def cut(shape, *tools):
    from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Cut
    for t in tools:
        shape = BRepAlgoAPI_Cut(shape, t).Shape()
    return shape


def write(tmp_path, name, shape):
    from OCC.Core.Interface import Interface_Static
    from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer
    writer = STEPControl_Writer()
    Interface_Static.SetCVal("write.step.unit", "INCH")
    writer.Transfer(shape, STEPControl_AsIs)
    path = tmp_path / f"{name}.step"
    writer.Write(str(path))
    return path


def test_ball_bottom_hole_is_blind(tmp_path):
    from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Fuse
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeSphere
    from OCC.Core.gp import gp_Pnt
    ball = BRepPrimAPI_MakeSphere(gp_Pnt(0.5 * IN, 0.5 * IN, 1.0 * IN), 0.125 * IN).Shape()
    tool = BRepAlgoAPI_Fuse(blind(0.5, 0.5, 2, 0.25, 1.0), ball).Shape()
    path = write(tmp_path, "ball_bottom", cut(box(1, 1, 2), tool))
    [hole] = analyze(path, path.name)["features"]
    assert len(hole["open_vectors"]) == 1  # a ball-end bottom closes the hole
    assert hole["dims_mm"]["depth"] == pytest.approx(25.4, abs=0.01)


def test_split_blind_hole_keeps_its_bottom(tmp_path):
    import math
    halves = (blind(0.5, 0.5, 2, 0.25, 1.0, math.pi), blind(0.5, 0.5, 2, 0.25, 1.0, math.pi, math.pi))
    path = write(tmp_path, "split_blind", cut(box(1, 1, 2), *halves))
    result = analyze(path, path.name)
    [hole] = result["features"]
    assert len(hole["open_vectors"]) == 1
    assert {result["faces"][i]["kind"] for i in hole["faces"]} == {"cylinder", "plane"}


def test_half_faces_at_different_heights_are_not_a_hole(tmp_path):
    import math
    # Two 180 deg half-cylinders of one radius and axis, at different depths: a stepped U, not a hole.
    tools = (blind(0.5, 0.5, 2, 0.25, 0.5, math.pi), blind(0.5, 0.5, 2, 0.25, 1.0, math.pi, math.pi))
    path = write(tmp_path, "half_steps", cut(box(1, 1, 2), *tools))
    holes = analyze(path, path.name)["features"]
    assert all(h["dims_mm"]["depth"] < 0.5 * IN + 0.01 for h in holes)  # never one 1.0 in deep "hole"


def test_groove_in_bore_is_not_a_hole(tmp_path):
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeCylinder
    from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt
    bore = blind(1, 1, 1, 0.5, 1.0 + 0.04)
    groove = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(IN, IN, 0.4 * IN), gp_Dir(0, 0, 1)), 0.3 * IN, 0.2 * IN).Shape()
    path = write(tmp_path, "groove", cut(box(2, 2, 1), bore, groove))
    holes = analyze(path, path.name)["features"]
    assert [round(h["dims_mm"]["diameter"] / IN, 3) for h in holes] == [0.5, 0.5]  # the bore either side, no 0.6 in groove


def test_cross_hole_does_not_open_a_blind_hole(tmp_path):
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeCylinder
    from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt
    cross = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(-1, 0.5 * IN, 1.5 * IN), gp_Dir(1, 0, 0)), 0.0625 * IN, IN + 2).Shape()
    path = write(tmp_path, "cross", cut(box(1, 1, 2), blind(0.5, 0.5, 2, 0.25, 1.0), cross))
    holes = analyze(path, path.name)["features"]
    main = max(holes, key=lambda h: h["dims_mm"]["diameter"])
    assert len(main["open_vectors"]) == 1  # the cross hole breaks through its wall, not its ends
