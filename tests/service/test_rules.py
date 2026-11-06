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
    assert hole["open_dirs"] == ["+Z"] or len(hole["open_dirs"]) == 1
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
    # 6.35 mm sits exactly between 6.3 and 6.4 mm; 6.55 mm between 6.5 and 6.6 mm.
    [f] = run("box_through_hole")["findings"]
    assert f["limit"] == pytest.approx(6.3 / 25.4, abs=1e-6)
    assert f["suggestion"] == "Nearest drill 6.3 mm (0.248 in). Use it if the fit allows."
    [g] = run("odd_metric_hole")["findings"]
    assert g["suggestion"] == "Nearest drill 6.5 mm (0.256 in). Use it if the fit allows."


def test_clean_parts():
    for name in ("box_inch", "metric_hole", "flat_bottom_hole", "two_holes_web", "split_hole",
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


def test_through_hole_has_two_open_dirs():
    [hole] = run("odd_hole")["features"]
    assert sorted(hole["open_dirs"]) in (["+Z", "-Z"], ["+X", "-X"], ["+Y", "-Y"])


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


def test_limits_come_from_thresholds_toml():
    from dfma import settings
    table = settings.thresholds("ss304")["hole_depth"]
    assert table == {"medium": 6.0, "high": 10.0, "source": "estimate"}
