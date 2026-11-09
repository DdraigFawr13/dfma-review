"""Rules on single parts: hole_depth (J2), hole_size (S2), corner_radius and pocket_depth (S3), thin_wall (S4)."""

from __future__ import annotations

import pytest

from helpers import PARTS, expected

from dfma.analyze import analyze


def run(name: str, material: str = "al6061", process: str = "mill") -> dict:
    return analyze(PARTS / f"{name}.step", f"{name}.step", process, material)


def only_holes(result: dict) -> list[dict]:
    """The hole features (S4 adds walls to every block, so hole tests pick their kind)."""
    return [f for f in result["features"] if f["kind"] == "hole"]


def test_deep_hole():
    result = run("deep_hole")
    assert result["rules_run"] == ["hole_depth", "hole_size", "corner_radius", "pocket_depth", "undercut", "thin_wall", "access",
                                   "looks_turned"]  # D-028
    [hole] = only_holes(result)
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
    [hole] = only_holes(result)
    assert hole["dims_mm"]["depth"] == pytest.approx(25.4, abs=0.001)  # to where the cone starts
    assert hole["dims_mm"]["point_mm"] == pytest.approx(expected("drill_point_hole")["point_mm"], abs=0.001)
    kinds = {result["faces"][i]["kind"] for i in hole["faces"]}
    assert kinds == {"cylinder", "cone"}


def test_stepped_hole_segments_share_open_ends():
    holes = only_holes(run("stepped_hole"))
    assert sorted(round(h["dims_mm"]["diameter"] / 25.4, 4) for h in holes) == [0.25, 0.4375]
    depths = sorted(round(h["dims_mm"]["depth"] / 25.4, 4) for h in holes)
    assert depths == [0.25, 0.75]
    assert all(len(h["open_vectors"]) == 2 for h in holes)  # the chain opens on +Z and -Z
    big = max(holes, key=lambda h: h["dims_mm"]["diameter"])
    small = min(holes, key=lambda h: h["dims_mm"]["diameter"])
    assert len(big["faces"]) == 2 and len(small["faces"]) == 1  # the shoulder belongs to the larger segment
    assert sorted(big["open_dirs"]) == sorted(small["open_dirs"]) == ["+Z", "-Z"]


def test_through_hole_has_two_open_dirs():
    [hole] = only_holes(run("odd_hole"))
    assert sorted(hole["open_dirs"]) == ["+Z", "-Z"]


def test_blind_holes_have_one_open_end():
    for name, dirs in (("flat_bottom_hole", ["-Z"]), ("drill_point_hole", ["+Y"])):
        [hole] = only_holes(run(name))
        assert hole["open_dirs"] == dirs, name
    a, b = only_holes(run("two_holes_web"))
    assert len(a["open_vectors"]) == len(b["open_vectors"]) == 1
    assert sum(x * y for x, y in zip(a["open_vectors"][0], b["open_vectors"][0])) == pytest.approx(-1.0)


def test_split_hole_is_one_through_hole():
    [hole] = only_holes(run("split_hole"))
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
    assert len(only_holes(result)) == 1
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
    [hole] = only_holes(analyze(path, path.name))
    assert len(hole["open_vectors"]) == 1  # a ball-end bottom closes the hole
    assert hole["dims_mm"]["depth"] == pytest.approx(25.4, abs=0.01)


def test_split_blind_hole_keeps_its_bottom(tmp_path):
    import math
    halves = (blind(0.5, 0.5, 2, 0.25, 1.0, math.pi), blind(0.5, 0.5, 2, 0.25, 1.0, math.pi, math.pi))
    path = write(tmp_path, "split_blind", cut(box(1, 1, 2), *halves))
    result = analyze(path, path.name)
    [hole] = only_holes(result)
    assert len(hole["open_vectors"]) == 1
    assert {result["faces"][i]["kind"] for i in hole["faces"]} == {"cylinder", "plane"}


def test_half_faces_at_different_heights_are_not_a_hole(tmp_path):
    import math
    # Two 180 deg half-cylinders of one radius and axis, at different depths: a stepped U, not a hole.
    tools = (blind(0.5, 0.5, 2, 0.25, 0.5, math.pi), blind(0.5, 0.5, 2, 0.25, 1.0, math.pi, math.pi))
    path = write(tmp_path, "half_steps", cut(box(1, 1, 2), *tools))
    holes = only_holes(analyze(path, path.name))
    assert all(h["dims_mm"]["depth"] < 0.5 * IN + 0.01 for h in holes)  # never one 1.0 in deep "hole"


def test_groove_in_bore_is_not_a_hole(tmp_path):
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeCylinder
    from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt
    bore = blind(1, 1, 1, 0.5, 1.0 + 0.04)
    groove = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(IN, IN, 0.4 * IN), gp_Dir(0, 0, 1)), 0.3 * IN, 0.2 * IN).Shape()
    path = write(tmp_path, "groove", cut(box(2, 2, 1), bore, groove))
    holes = only_holes(analyze(path, path.name))
    # One 0.5 in bore through the groove (HANDOFF 3a: it was two pieces, one either side), no 0.6 in groove
    assert [round(h["dims_mm"]["diameter"] / IN, 3) for h in holes] == [0.5]
    assert holes[0]["dims_mm"]["depth"] == pytest.approx(1.0 * IN, abs=1e-3)


def test_cross_hole_does_not_open_a_blind_hole(tmp_path):
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeCylinder
    from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt
    cross = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(-1, 0.5 * IN, 1.5 * IN), gp_Dir(1, 0, 0)), 0.0625 * IN, IN + 2).Shape()
    path = write(tmp_path, "cross", cut(box(1, 1, 2), blind(0.5, 0.5, 2, 0.25, 1.0), cross))
    holes = only_holes(analyze(path, path.name))
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
        assert "edge_mm" not in c  # a fillet is drawn as its own face
    assert result["findings"] == []


def test_pocket_fillets_are_analysed():
    # A guard: pocket faces are never listed as not analysed. (S1 listed only torus and other faces,
    # so cylinder fillets were never listed; this keeps it so once torus fillets join pockets.)
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
    corner = next(f for f in result["features"] if f["id"] == "corner-1")
    (x0, y0, z0), (x1, y1, z1) = corner["edge_mm"]  # the sharp edge itself, for the viewer
    assert abs(z1 - z0) == pytest.approx(0.25 * IN, abs=0.001) and (x0, y0) == pytest.approx((x1, y1), abs=1e-6)
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


def test_pocket_rules_run_for_mill_only():
    # Spec "Flow": corner_radius and pocket_depth run for mill only (review finding, S3).
    result = analyze(PARTS / "pocket_sharp.step", "pocket_sharp.step", "turn", "al6061")
    assert "corner_radius" not in result["rules_run"] and "pocket_depth" not in result["rules_run"]
    assert not [f for f in result["findings"] if f["rule"] in ("corner_radius", "pocket_depth")]


def test_sharp_corner_between_a_wall_and_an_arc(tmp_path):
    # A pocket whose ends are cut by a large arc (R 1.100 in) meeting the straight walls at an angle:
    # each junction is a sharp concave edge between a plane and a cylinder (review finding, S3).
    from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
    from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt
    tool_box = BRepPrimAPI_MakeBox(gp_Pnt(0.5 * IN, 0.5 * IN, 0.5 * IN), 2.0 * IN, 1.0 * IN, 1.0 * IN).Shape()
    arc = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(1.5 * IN, 1.0 * IN, 0.0), gp_Dir(0, 0, 1)), 1.1 * IN, 2.0 * IN).Shape()
    tool = BRepAlgoAPI_Common(tool_box, arc).Shape()
    path = write(tmp_path, "arc_ends", cut(box(3, 2, 1), tool))
    result = analyze(path, path.name)
    sharp = [c for c in kind(result, "corner") if c["dims_mm"]["radius"] == 0]
    assert len(sharp) == 8  # side wall to arc, and arc to end wall, at both ends
    assert all(len(c["faces"]) == 2 and "edge_mm" in c for c in sharp)
    [pocket] = kind(result, "pocket")
    assert pocket["dims_mm"]["min_corner_radius"] == 0 and pocket["dims_mm"]["undersized"] == 1


# --- S4: walls and thin_wall ---

def walls_of(result: dict) -> list[dict]:
    return [f for f in result["features"] if f["kind"] == "wall"]


def test_material_changes_limit():
    """thin_rib's 0.040 in rib is flagged only in Delrin / nylon (limit 0.060 in; spec S4)."""
    limits = {"al6061": 0.030, "steel1018": 0.020, "ss304": 0.020, "plastic": 0.060}
    for material, limit in limits.items():
        result = run("thin_rib", material)
        thin = [f for f in result["findings"] if f["rule"] == "thin_wall"]
        if material != "plastic":
            assert thin == [], material
            continue
        [f] = thin
        assert f["severity"] == "high" and f["unit"] == "in" and f["limit"] == limit
        assert f["measured"] == pytest.approx(0.040, abs=0.001)
        assert f["threshold_source"] == "estimate"
        assert f["title"] == "Wall 0.040 in thick (limit 0.060 in)"
        assert f["suggestion"] == "Make the wall 0.060 in or thicker if the design allows."
        wall = next(w for w in walls_of(result) if w["id"] == f["feature"])
        assert f["faces"] == wall["faces"] and len(wall["faces"]) == 2


def test_s4_thresholds_per_material():
    from dfma import settings
    want = {"al6061": 0.030, "steel1018": 0.020, "ss304": 0.020, "plastic": 0.060}
    for material, limit in want.items():
        table = settings.thresholds(material)["thin_wall"]
        assert table == {"min_in": limit, "source": "estimate"}


def test_wall_feature_schema():
    result = run("thin_floor")
    floor = min(walls_of(result), key=lambda w: w["dims_mm"]["thickness"])
    assert floor["dims_mm"]["thickness"] == pytest.approx(0.015 * IN, abs=0.001)
    assert floor["dims_mm"]["overlap_mm2"] >= 10.0
    assert floor["open_dirs"] == [] and floor["open_vectors"] == []
    assert floor["faces"] == sorted(floor["faces"])
    assert [w["id"] for w in walls_of(result)] == [f"wall-{n}" for n in range(1, 9)]
    # features: holes, pockets, corners, then walls (spec Response schema; S4 settled)
    kinds = [f["kind"] for f in result["features"]]
    assert kinds == sorted(kinds, key=["hole", "pocket", "corner", "wall"].index)


def test_wall_at_the_limit_is_not_flagged(tmp_path):
    """A wall exactly 0.030 in thick in 6061 is not "under 0.030 in"."""
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox
    from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer
    path = tmp_path / "plate_030.step"
    writer = STEPControl_Writer()
    writer.Transfer(BRepPrimAPI_MakeBox(2.0 * IN, 1.0 * IN, 0.030 * IN).Shape(), STEPControl_AsIs)
    writer.Write(str(path))
    result = analyze(path, path.name)
    assert min(w["dims_mm"]["thickness"] for w in walls_of(result)) == pytest.approx(0.030 * IN, abs=1e-6)
    assert [f for f in result["findings"] if f["rule"] == "thin_wall"] == []
    result = analyze(path, path.name, "mill", "plastic")
    assert [f["rule"] for f in result["findings"]] == ["thin_wall"]


def test_slot_sides_are_not_a_wall():
    """The 0.040 in slot's two sides face each other across air: no wall, so no finding in plastic."""
    result = run("slot_not_wall", "plastic")
    assert result["findings"] == []
    assert min(w["dims_mm"]["thickness"] for w in walls_of(result)) > 0.2 * IN


def test_bosses_with_air_between_are_not_a_wall():
    """clean_walls: the bosses face each other across 1.000 in of air, and their outer sides (2.000 in apart) have air between: neither is a wall."""
    thick = sorted(round(w["dims_mm"]["thickness"] / IN, 3) for w in walls_of(run("clean_walls")))
    assert thick == [0.25, 0.5, 0.5, 0.5, 0.5, 1.0, 1.0, 2.0, 3.0]


def test_thin_wall_runs_for_turn():
    """thin_wall is shared by mill and turn (spec Flow); the pocket rules are not. A block has no turning axis
    (S6 turn_axis), so the two turning rules don't run either: only the shared rules."""
    result = run("thin_floor", process="turn")
    assert result["rules_run"] == ["hole_depth", "hole_size", "thin_wall", "turn_axis"]
    assert [f["rule"] for f in result["findings"]] == ["thin_wall", "turn_axis"]


def test_hole_walls():
    """D-016: material under a drill point and around a hole's side is a wall, measured up to 0.250 in."""
    tip = [w for w in walls_of(run("thin_drill_point")) if w.get("at") == "tip"]
    assert [round(w["dims_mm"]["thickness"] / IN, 4) for w in tip] == [0.015]
    assert tip[0]["hole"] == "hole-1" and tip[0]["axis"] is None and tip[0]["faces"] == sorted(tip[0]["faces"])
    side = [w for w in walls_of(run("hole_near_edge")) if w.get("at") == "side"]
    assert [round(w["dims_mm"]["thickness"] / IN, 3) for w in side] == [0.02]
    # Two holes 0.025 in apart find each other: one wall between their two hole faces.
    result = run("holes_close")
    [web] = [w for w in walls_of(result) if "hole" in w]
    hole_faces = {f for h in only_holes(result) for f in h["faces"]}
    assert set(web["faces"]) <= hole_faces and web["dims_mm"]["thickness"] == pytest.approx(0.025 * IN, abs=0.001)
    # Holes 0.375 in or more from other faces get no hole wall (the 0.250 in cap).
    assert [w for w in walls_of(run("box_through_hole")) if "hole" in w] == []
    assert [w for w in walls_of(run("drill_point_hole")) if "hole" in w] == []


def _write(tmp_path, shape, name):
    from OCC.Core.STEPControl import STEPControl_AsIs, STEPControl_Writer
    path = tmp_path / f"{name}.step"
    writer = STEPControl_Writer()
    writer.Transfer(shape, STEPControl_AsIs)
    writer.Write(str(path))
    return path


def _box_mm(x, y, z, dx, dy, dz):
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeBox
    from OCC.Core.gp import gp_Pnt
    return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()


def _cut(shape, *tools):
    from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Cut
    for tool in tools:
        op = BRepAlgoAPI_Cut(shape, tool)
        op.Build()
        shape = op.Shape()
    return shape


def _cyl(x, y, z, d, h, axis=(0, 0, 1), angle=2 * 3.141592653589793, start=0.0):
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeCylinder
    from OCC.Core.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pnt
    ax = gp_Ax2(gp_Pnt(x, y, z), gp_Dir(*axis))
    if start:
        ax.Rotate(gp_Ax1(gp_Pnt(x, y, z), gp_Dir(*axis)), start)
    return BRepPrimAPI_MakeCylinder(ax, d / 2, h, angle).Shape()


def test_wall_just_under_the_limit_is_flagged_and_reads_clearly(tmp_path):
    """0.0299 in is under 0.030 in: flagged, and the title doesn't read "0.030 in thick (limit 0.030 in)"."""
    path = _write(tmp_path, _box_mm(0, 0, 0, 2 * IN, 1 * IN, 0.0299 * IN), "plate_0299")
    [f] = [f for f in analyze(path, path.name)["findings"] if f["rule"] == "thin_wall"]
    assert f["measured"] == pytest.approx(0.0299, abs=1e-6)
    assert f["title"] == "Wall 0.0299 in thick (limit 0.030 in)"


def test_hole_wall_cap_is_0_250_in(tmp_path):
    """Material at a hole is measured up to 0.250 in: 0.240 in is a wall, 0.260 in is not."""
    r = 0.125 * IN
    for gap, walls in ((0.240, 1), (0.260, 0)):
        shape = _cut(_box_mm(0, 0, 0, 2 * IN, 1 * IN, 0.5 * IN), _cyl(1.0 * IN, r + gap * IN, -1, 2 * r, 0.5 * IN + 2))
        result = analyze(_write(tmp_path, shape, f"gap_{gap}"), "gap.step")
        assert len([w for w in walls_of(result) if "hole" in w]) == walls, gap


def test_split_holes_close_together_give_one_wall(tmp_path):
    """holes_close with each hole made of two half-cylinders whose seam faces the other hole: still one wall."""
    import math
    r = 0.125 * IN
    tools = [_cyl(x * IN, 0.5 * IN, -1, 2 * r, 0.5 * IN + 2, angle=math.pi, start=a)
             for x in (0.8625, 1.1375) for a in (0.0, math.pi)]
    result = analyze(_write(tmp_path, _cut(_box_mm(0, 0, 0, 2 * IN, 1 * IN, 0.5 * IN), *tools), "split_close"), "x.step")
    assert len(only_holes(result)) == 2
    [web] = [w for w in walls_of(result) if "hole" in w]
    # The seam itself is no start point, so the nearest ray is 1 deg off it: within J3's 0.001 in.
    assert web["dims_mm"]["thickness"] == pytest.approx(0.025 * IN, abs=0.001 * IN)


def test_drill_point_tip_on_a_side_axis(tmp_path):
    """A drill-point hole from -X with 0.015 in under its tip: the tip wall is found on any axis."""
    import math
    from OCC.Core.BRepPrimAPI import BRepPrimAPI_MakeCone
    from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt
    r = 0.125 * IN
    point = r / math.tan(math.radians(59))
    start = 1.0 * IN - 0.015 * IN - point
    cone = BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(start, 0.5 * IN, 0.5 * IN), gp_Dir(1, 0, 0)), r, 0.0, point).Shape()
    shape = _cut(_box_mm(0, 0, 0, IN, IN, IN), _cyl(-1, 0.5 * IN, 0.5 * IN, 2 * r, 1 + start, axis=(1, 0, 0)), cone)
    result = analyze(_write(tmp_path, shape, "drill_x"), "x.step")
    tip = [w for w in walls_of(result) if w.get("at") == "tip"]
    assert [round(w["dims_mm"]["thickness"] / IN, 4) for w in tip] == [0.015]


def test_cross_hole_gives_no_false_hole_wall(tmp_path):
    """Rays start only on a hole's own face, never in the gap a cross hole cuts through it."""
    r = 0.125 * IN
    shape = _cut(_box_mm(0, 0, 0, IN, IN, IN), _cyl(0.5 * IN, 0.5 * IN, -1, 2 * r, IN + 2),
                 _cyl(-1, 0.5 * IN, 0.5 * IN, 2 * r, IN + 2, axis=(1, 0, 0)))
    result = analyze(_write(tmp_path, shape, "cross"), "x.step")
    assert [f for f in result["findings"] if f["rule"] == "thin_wall"] == []


def test_a_value_just_past_its_limit_never_reads_as_the_limit():
    """Stress test (HANDOFF 3a): a 6.03x hole was titled "Hole depth 6.0× diameter (limit 6.0×)"."""
    from dfma.rules import hole_depth
    from dfma.units import past_limit
    limits = {"hole_depth": {"medium": 6.0, "high": 10.0, "source": "estimate"}}
    holes = [{"kind": "hole", "id": f"hole-{i}", "faces": [i], "dims_mm": {"diameter": 1.0, "depth": d}}
             for i, d in enumerate((6.03, 6.5, 10.04))]
    titles = [f["title"] for f in hole_depth.check(holes, {}, limits)]
    assert titles == ["Hole depth 6.03× diameter (limit 6.0×)", "Hole depth 6.5× diameter (limit 6.0×)",
                      "Hole depth 10.04× diameter (limit 10.0×)"]
    assert past_limit(6.25, 6.0, 1) == "6.2" and past_limit(5.97, 6.0, 1) == "5.97"


def _with_threads(monkeypatch, tmp_path, step: str, threads) -> dict:
    """The app path with read_ipt patched to an IptPart built from the STEP plus `threads` (I1 S2)."""
    import dfma.inventor
    from inventor.built import ipt_from_step
    part = ipt_from_step(PARTS / f"{step}.step", threads)
    monkeypatch.setattr(dfma.inventor, "read_ipt", lambda path: part)
    return analyze(PARTS / f"{step}.step", f"{step}.step", ipt_path=tmp_path / "p.ipt", ipt_name="p.ipt")


def _mismatches(result: dict) -> list[dict]:
    return [f for f in result["findings"] if f["rule"] == "thread_mismatch"]


@pytest.mark.parametrize("case", ["axis", "diameter", "depth", "centred"])
def test_thread_mismatch(monkeypatch, tmp_path, case):
    """D-005: built cases, each one medium finding with its gap; a centred thread gives none (STC 10:
    test_inventor_threads.py)."""
    from inventor.built import BOX_TOP, DOWN, DRILL_TOP, thread
    if case == "axis":  # 0.10 mm off the hole's axis
        result = _with_threads(monkeypatch, tmp_path, "box_through_hole",
                               [thread((25.5, 12.7, 12.7), DOWN, 10.0)])
        gap, mm, text = "axis", 0.10, "0.10 mm off the hole's axis"
    elif case == "diameter":  # the Ø6.35 hole is 0.50 mm over a 5.85 mm major diameter
        result = _with_threads(monkeypatch, tmp_path, "box_through_hole",
                               [thread(BOX_TOP, DOWN, 10.0, major=(5.85, 5.95), minor=(4.9, 5.1))])
        gap, mm, text = "diameter", 0.50, "hole Ø6.35 is 0.50 mm over the thread's major diameter"
    elif case == "depth":  # 30 mm of thread in the 25.4 mm blind hole
        result = _with_threads(monkeypatch, tmp_path, "drill_point_hole", [thread(DRILL_TOP, DOWN, 30.0)])
        gap, mm, text = "depth", 4.6, "thread 30.00 deep in a 25.40 hole"
    else:
        result = _with_threads(monkeypatch, tmp_path, "box_through_hole", [thread(BOX_TOP, DOWN, 12.7)])
        assert result["inventor"]["threads"][0]["state"] == "matched"
        assert _mismatches(result) == []
        return
    [t] = result["inventor"]["threads"]
    assert (t["state"], t["hole"]) == ("disagrees", "hole-1")
    [g] = t["gaps"]
    assert (g["what"], g["text"]) == (gap, text) and g["mm"] == pytest.approx(mm, abs=1e-4)
    [f] = _mismatches(result)
    assert f["severity"] == "medium" and f["feature"] == "hole-1" and f["unit"] == "in"
    assert f["measured"] == pytest.approx(mm / 25.4, abs=1e-6) and f["limit"] == pytest.approx(0.01 / 25.4, abs=1e-6)
    assert f["title"] == (f"1/4-20 UNC thread on hole-1: {text}. Possible cause: the part or an old STEP export "
                          "differs from the .ipt")
    assert f["threshold_source"] == "D-032: the .ipt and STEP must agree"
    assert f["suggestion"] == "Export the STEP again from this .ipt, or check this thread in Inventor."
    assert f["id"] == f"F{len(result['findings'])}"  # last in RULES: the other findings keep their numbers


@pytest.mark.parametrize("face, reason", [("shaft", "external thread: not on a hole"),
                                          ("cone", "tapered thread: not supported yet"),
                                          ("other", "the threaded face is not a cylinder")])
def test_thread_not_mapped(monkeypatch, tmp_path, face, reason):
    """Not mapped is our limit, never a finding (D-032)."""
    from inventor.built import BOX_TOP, DOWN, thread
    result = _with_threads(monkeypatch, tmp_path, "box_through_hole", [thread(BOX_TOP, DOWN, 10.0, face=face)])
    [t] = result["inventor"]["threads"]
    assert (t["state"], t["hole"], t["reason"]) == ("not_mapped", None, reason)
    assert _mismatches(result) == [] and "thread" not in next(f for f in result["features"] if f["id"] == "hole-1")


def test_thread_no_hole(monkeypatch, tmp_path):
    from inventor.built import thread
    result = _with_threads(monkeypatch, tmp_path, "box_through_hole", [thread((5.0, 5.0, 12.7), (0, 0, -1), 5.0)])
    assert result["inventor"]["threads"][0]["reason"] == "no hole on this thread's axis"


def _with_holes(monkeypatch, tmp_path, step: str, feats, threads=()) -> dict:
    """The app path with read_ipt patched to an IptPart built from the STEP plus Hole features (I2 S1)."""
    import dfma.inventor
    from inventor.built import ipt_from_step
    part = ipt_from_step(PARTS / f"{step}.step", list(threads), feats)
    monkeypatch.setattr(dfma.inventor, "read_ipt", lambda path: part)
    return analyze(PARTS / f"{step}.step", f"{step}.step", ipt_path=tmp_path / "p.ipt", ipt_name="p.ipt")


@pytest.mark.parametrize("case", ["axis", "diameter", "depth", "through", "centred"])
def test_hole_mismatch(monkeypatch, tmp_path, case):
    """I2 S1: built cases, each one medium finding with its gap; a centred hole on the same part gives none."""
    from inventor.built import BOX_TOP, DOWN, DRILL_TOP, hole_feature
    if case == "axis":  # 0.10 mm off the hole's axis
        feats = [hole_feature((25.5, 12.7, 12.7), DOWN, 6.35, 12.7, through=True)]
        step, gap, mm, text = "box_through_hole", "axis", 0.10, "0.004 in [0.10 mm] off the hole's axis"
    elif case == "diameter":
        feats = [hole_feature(BOX_TOP, DOWN, 6.6, 12.7, through=True)]
        step, gap, mm, text = "box_through_hole", "diameter", 0.25, "Ø0.260 in [6.60 mm] in the .ipt, Ø0.250 in [6.35 mm] in the STEP"
    elif case == "depth":  # a 20 mm blind hole where the STEP's is 25.4 mm
        feats = [hole_feature(DRILL_TOP, DOWN, 6.35, 20.0, through=False, point_deg=118.0)]
        step, gap, mm, text = "drill_point_hole", "depth", 5.4, ("the Ø0.250 in [6.35 mm] section is 0.787 in [20.00 mm] long in the .ipt, "
                                                       "1.000 in [25.40 mm] in the STEP")
    elif case == "through":  # blind in the .ipt, through in the STEP: the gap is their length difference
        feats = [hole_feature(BOX_TOP, DOWN, 6.35, 10.0, through=False)]
        step, gap, mm, text = "box_through_hole", "through", 2.7, "the .ipt hole is blind, the STEP hole is through"
    else:
        result = _with_holes(monkeypatch, tmp_path, "box_through_hole",
                             [hole_feature(BOX_TOP, DOWN, 6.35, 12.7, through=True)])
        [hf] = result["inventor"]["hole_features"]
        assert (hf["state"], hf["holes"][0]["state"], hf["holes"][0]["hole"]) == ("matched", "matched", "hole-1")
        assert next(f for f in result["features"] if f["id"] == "hole-1")["hole_feature"] == "hf-1"
        assert [f for f in result["findings"] if f["rule"] == "hole_mismatch"] == []
        return
    result = _with_holes(monkeypatch, tmp_path, step, feats)
    [hf] = result["inventor"]["hole_features"]
    [h] = hf["holes"]
    assert (hf["state"], h["state"], h["hole"], h["id"]) == ("disagrees", "disagrees", "hole-1", "hf-1.1")
    [g] = h["gaps"]
    assert (g["what"], g["text"]) == (gap, text) and g["mm"] == pytest.approx(mm, abs=1e-4)
    [f] = [f for f in result["findings"] if f["rule"] == "hole_mismatch"]
    assert f["severity"] == "medium" and f["feature"] == "hole-1" and f["unit"] == "in"
    assert f["measured"] == pytest.approx(mm / 25.4, abs=1e-6)
    assert f["limit"] == pytest.approx(0.01 / 25.4, abs=1e-6)
    assert f["title"] == (f"Hole feature hf-1 hole on hole-1: {text}. Possible cause: the part or an old STEP "
                          "export differs from the .ipt")
    assert f["threshold_source"] == "D-032: the .ipt and STEP must agree"
    assert f["suggestion"] == "Export the STEP again from this .ipt, or check this Hole feature in Inventor."
    assert f["id"] == f"F{len(result['findings'])}"  # last in RULES: the other findings keep their numbers


def test_hole_mismatch_named(monkeypatch, tmp_path):
    """I2 S2: a named Hole feature's finding starts with its name instead of its id."""
    from inventor.built import BOX_TOP, DOWN, hole_feature
    feat = hole_feature(BOX_TOP, DOWN, 6.6, 12.7, through=True)
    feat.name = "Hole3"
    result = _with_holes(monkeypatch, tmp_path, "box_through_hole", [feat])
    [f] = [f for f in result["findings"] if f["rule"] == "hole_mismatch"]
    assert f["title"].startswith("Hole3 hole on hole-1: Ø0.260 in [6.60 mm] in the .ipt") and f["hole_feature"] == "hf-1"
    assert result["inventor"]["hole_features"][0]["name"] == "Hole3"


def test_hole_mismatch_after_thread(monkeypatch, tmp_path):
    """A STEP hole with a thread_mismatch finding gets no hole_mismatch one; the hole keeps its gaps."""
    from inventor.built import DOWN, hole_feature, thread
    off = (25.5, 12.7, 12.7)
    result = _with_holes(monkeypatch, tmp_path, "box_through_hole",
                         [hole_feature(off, DOWN, 6.35, 12.7, through=True)], [thread(off, DOWN, 10.0)])
    assert [f["rule"] for f in result["findings"] if f["rule"].endswith("_mismatch")] == ["thread_mismatch"]
    assert result["inventor"]["hole_features"][0]["holes"][0]["state"] == "disagrees"


def test_hole_not_mapped(monkeypatch, tmp_path):
    """Not mapped is our limit, never a finding (D-032)."""
    from inventor.built import DOWN, hole_feature
    result = _with_holes(monkeypatch, tmp_path, "box_through_hole",
                         [hole_feature((5.0, 5.0, 12.7), DOWN, 6.35, 12.7, through=True)])
    [h] = result["inventor"]["hole_features"][0]["holes"]
    assert (h["state"], h["hole"], h["reason"]) == ("not_mapped", None, "no hole on this axis")
    assert [f for f in result["findings"] if f["rule"] == "hole_mismatch"] == []


@pytest.mark.parametrize("radius", [3.0, 3.5])
def test_blend_mismatch(monkeypatch, tmp_path, radius):
    """I3 S3 (D-039): the built block's fillet at r 3.5 where the STEP's is 3 mm gives one medium finding, last in
    RULES; at r 3 none. The chamfer is matched either way (its size is not compared)."""
    import dfma.inventor
    from inventor.built import block_blends, filleted_block, ipt_from_step
    step = filleted_block(tmp_path / "block.step")
    part = ipt_from_step(step, [], (), block_blends(radius))
    monkeypatch.setattr(dfma.inventor, "read_ipt", lambda path: part)
    result = analyze(step, "block.step", ipt_path=tmp_path / "p.ipt", ipt_name="p.ipt")
    assert "blend_mismatch" in result["rules_run"]
    fillet, chamfer = result["inventor"]["blends"]
    assert chamfer["state"] == "matched"
    found = [f for f in result["findings"] if f["rule"] == "blend_mismatch"]
    if radius == 3.0:
        assert fillet["state"] == "matched" and found == []
        return
    [f] = found
    assert f["severity"] == "medium" and f["feature"] == "bl-1" and f["blend"] == "bl-1" and f["unit"] == "in"
    assert f["faces"] == fillet["step_faces"] and f["faces"]
    assert f["measured"] == pytest.approx(0.5 / 25.4, abs=1e-6) and f["limit"] == pytest.approx(0.01 / 25.4, abs=1e-6)
    assert f["title"] == ("Fillet bl-1: R0.138 in [3.50 mm] in the .ipt, R0.118 in [3.00 mm] in the STEP. Possible "
                          "cause: the part or an old STEP export differs from the .ipt")
    assert f["threshold_source"] == "D-032: the .ipt and STEP must agree"
    assert f["suggestion"] == "Export the STEP again from this .ipt, or check this fillet in Inventor."
    assert f["id"] == f"F{len(result['findings'])}"
