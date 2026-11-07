"""D-020 (HANDOFF 3a, stress-test units gaps): centimetre and metre files are metric (metric and inch
drills, as mm files), and a file that declares no length unit is read as mm with an assumption line.
Before: both were "other" (inch drills only, so a 6.6 mm hole was "not a standard drill") and the
no-unit file gave no note. The files are box_through_hole.step with its length unit rewritten."""

from __future__ import annotations

import pytest

from helpers import PARTS

BASE = (PARTS / "box_through_hole.step").read_text()
UNIT = "#430 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );\n"


def _variant(tmp_path, name: str) -> object:
    text = {
        "cm": BASE.replace("SI_UNIT(.MILLI.,.METRE.)", "SI_UNIT(.CENTI.,.METRE.)"),
        "m": BASE.replace("SI_UNIT(.MILLI.,.METRE.)", "SI_UNIT($,.METRE.)"),
        "none": BASE.replace(UNIT, "").replace("(#430,#431,#432)", "(#431,#432)")
                    .replace("LENGTH_MEASURE(1.E-07),#430,", "LENGTH_MEASURE(1.E-07),#431,"),
    }[name]
    assert text != BASE
    path = tmp_path / f"box_{name}.step"
    path.write_text(text)
    return path


@pytest.mark.parametrize("unit", ["cm", "m", "none"])
def test_units_in_file(tmp_path, unit):
    from dfma.read import read_step
    assert read_step(_variant(tmp_path, unit)).units_in_file == unit


def test_cm_and_m_files_get_the_metric_drills():
    from dfma.tools import nearest_drill
    for unit in ("mm", "cm", "m"):
        assert nearest_drill(6.6, unit).diameter_mm == pytest.approx(6.6)  # metric: no finding
    for unit in ("inch", "none", "other"):
        assert not nearest_drill(6.6, unit).metric


def test_a_file_with_no_unit_says_it_was_read_as_mm(tmp_path):
    from dfma import settings
    from dfma.analyze import analyze
    r = analyze(_variant(tmp_path, "none"), "box_none.step")
    assert r["part"]["units_in_file"] == "none"
    assert settings.MSG_NO_UNIT in r["assumptions"]
    mm = analyze(PARTS / "box_through_hole.step", "box_through_hole.step")
    assert settings.MSG_NO_UNIT not in mm["assumptions"]
    assert r["part"]["bbox_in"] == mm["part"]["bbox_in"]  # read as mm: the same sizes
