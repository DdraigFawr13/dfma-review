"""Rules on single parts: hole_depth (J2), hole_size (S2), corner_radius and pocket_depth (S3)."""

from __future__ import annotations

import pytest

from helpers import PARTS, expected

from dfma.analyze import analyze


def run(name: str, material: str = "al6061") -> dict:
    return analyze(PARTS / f"{name}.step", f"{name}.step", "mill", material)


def test_deep_hole():
    result = run("deep_hole")
    assert result["rules_run"] == ["hole_depth", "hole_size", "corner_radius", "pocket_depth"]
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


# --- S3: pockets and inside corners (spec S3 "Settled at build") ------------------------------

def kind(result, k):
    return [f for f in result["features"] if f["kind"] == k]


def test_pick_end_mill():
    from dfma.tools import pick_end_mill
    assert pick_end_mill(0.150 * IN, 1.0 * IN) == (pytest.approx(0.25 * IN), False)
    assert pick_end_mill(0.125 * IN, 1.0 * IN)[0] == pytest.approx(0.25 * IN)  # radius equal to the tool's fits
    assert pick_end_mill(0.150 * IN, 0.2 * IN)[0] == pytest.approx(0.1875 * IN)  # the gap limits it
    assert pick_end_mill(0.0, 1.0 * IN) == (pytest.approx(0.03125 * IN), True)  # nothing fits a sharp corner


def test_fillet_pocket_is_one_pocket_and_four_corners():
    result = run("fillet_not_hole")
    [pocket] = kind(result, "pocket")
    corners = kind(result, "corner")
    assert [c["id"] for c in corners] == ["corner-1", "corner-2", "corner-3", "corner-4"]
    # The frame takes +Z from the part's faces (spec Flow step 5): here file -Z, as for flat_bottom_hole.
    assert pocket["id"] == "pocket-1" and pocket["open_dirs"] == ["-Z"]
    dims = pocket["dims_mm"]
    assert dims["depth"] == pytest.approx(0.5 * IN, abs=0.001)
    assert dims["min_corner_radius"] == pytest.approx(0.1 * IN, abs=0.001)
    assert dims["narrowest_width"] == pytest.approx(1.0 * IN, abs=0.001)  # not the 0.141 in across a fillet
    assert dims["end_mill_mm"] == pytest.approx(0.1875 * IN) and dims["undersized"] == 0
    kinds = {result["faces"][i]["kind"] for i in pocket["faces"]}
    assert kinds == {"plane", "cylinder"} and len(pocket["faces"]) == 9  # floor, 4 walls, 4 fillets
    for c in corners:
        assert c["dims_mm"]["radius"] == pytest.approx(0.1 * IN, abs=0.001)
        assert c["open_dirs"] == [] and c["open_vectors"] == []
        assert len(c["faces"]) == 1 and set(c["faces"]) <= set(pocket["faces"])
    assert result["findings"] == []


def test_pocket_fillets_are_analysed():
    result = run("fillet_not_hole")
    pocket_faces = set(kind(result, "pocket")[0]["faces"])
    assert not pocket_faces & set(result["part"]["not_analysed_faces"])


def test_sharp_corner_and_undersized_tool():
    result = run("pocket_sharp")
    findings = result["findings"]
    assert [f["rule"] for f in findings] == ["corner_radius"] * 4 + ["pocket_depth"]
    c = findings[0]
    assert c["id"] == "F1" and c["severity"] == "high" and c["feature"] == "corner-1"
    assert c["title"] == "Sharp inside corner: needs EDM or a corner radius"
    assert c["measured"] == 0 and c["limit"] == 0.03125 and c["unit"] == "in"
    assert c["suggestion"] == ("Add a corner radius of 0.031 in (1/32) or more; "
                               "a larger radius lets a larger end mill cut the pocket.")
    assert len(c["faces"]) == 2  # the two walls that meet at the sharp edge
    p = findings[4]
    assert p["title"] == "Pocket depth 8.0× the end mill that fits (limit 3.0×)"
    assert p["measured"] == pytest.approx(8.0, abs=0.01) and p["limit"] == 3.0 and p["unit"] == "ratio"
    assert p["suggestion"].endswith("Smallest tool used: no end mill in the list fits the corners.")
    assert kind(result, "pocket")[0]["dims_mm"]["undersized"] == 1


def test_small_radius_title():
    f = run("pocket_small_radius")["findings"][0]
    assert f["title"] == "Corner radius 0.020 in under 0.031 in (1/32)"
    assert f["measured"] == pytest.approx(0.02, abs=0.0005) and f["limit"] == 0.03125
    assert f["suggestion"] == "Make the corner radius 0.031 in (1/32) or more if the design allows."


def test_long_thin_tool_corner_and_depth():
    findings = run("pocket_long_thin_tool")["findings"]
    c, p = findings[0], findings[4]
    assert c["severity"] == "medium" and c["unit"] == "ratio" and c["limit"] == 4.0
    assert c["title"] == "Corner radius 0.050 in: the end mill that fits cuts 5.3× its diameter deep (limit 4.0×)"
    assert c["suggestion"] == "Make the corner radius or the gap larger, or the pocket shallower, if the design allows."
    assert p["title"] == "Pocket depth 5.3× the end mill that fits (limit 3.0×)"
    assert p["suggestion"] == ("Needs a long 3/32 in end mill. Make the pocket shallower, or its corners and gaps "
                               "larger, if the design allows.")


def test_both_medium_corner_reasons_join(tmp_path):
    # 0.020 in corners 0.400 in deep: under 1/32 in, and the 1/32 in end mill cuts 12.8x deep.
    import sys
    sys.path.insert(0, str(PARTS))
    from make_parts import pocket_part
    path = write(tmp_path, "both", pocket_part(0.4, 0.020))
    f = analyze(path, path.name)["findings"][0]
    assert f["title"] == ("Corner radius 0.020 in under 0.031 in (1/32); "
                          "the end mill that fits cuts 12.8× its diameter deep (limit 4.0×)")
    assert f["unit"] == "in" and f["measured"] == pytest.approx(0.02, abs=0.0005)  # the radius reason leads
    assert f["suggestion"] == ("Make the corner radius 0.031 in (1/32) or more if the design allows. "
                               "Make the corner radius or the gap larger, or the pocket shallower, if the design allows.")


def test_island_narrows_the_tool():
    result = run("pocket_island")
    [pocket] = kind(result, "pocket")
    assert pocket["dims_mm"]["narrowest_width"] == pytest.approx(0.2 * IN, abs=0.001)
    assert pocket["dims_mm"]["end_mill_mm"] == pytest.approx(0.1875 * IN)
    assert pocket["dims_mm"]["depth"] == pytest.approx(0.6 * IN, abs=0.001)  # floor to the rim, not the island top
    assert len(kind(result, "corner")) == 4  # the island's convex edges are not corners
    assert len(pocket["faces"]) == 13  # floor, 4 walls, 4 fillets and the 4 island walls (not the island top)


def test_holes_are_not_pockets():
    for name in ("flat_bottom_hole", "stepped_hole", "deep_hole", "box_through_hole"):
        assert kind(run(name), "pocket") == [], name


def test_clean_pockets():
    for name in ("pocket_deep_wide", "clean_pocket"):
        assert run(name)["findings"] == [], name


def test_missing_rule_table_skips_the_rule(monkeypatch):
    from dfma import settings
    monkeypatch.setattr(settings, "thresholds", lambda m: {"hole_depth": {"medium": 6.0, "high": 10.0, "source": "t"}})
    assert run("pocket_sharp")["findings"] == []


def test_s3_thresholds_per_material():
    from dfma import settings
    for m in ("al6061", "steel1018", "ss304", "plastic"):
        t = settings.thresholds(m)
        assert t["corner_radius"] == {"min_radius_in": 0.03125, "max_depth_ratio": 4.0, "source": "estimate"}
        assert t["pocket_depth"] == {"medium": 3.0, "source": "estimate"}
