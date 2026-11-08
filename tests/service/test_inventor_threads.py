"""I1 S2 J4: threads read from the NIST .ipt files and mapped onto their STEP holes, lined up by the test harness
(tests/inventor/register.py; the app refuses every NIST pair, J2)."""

from __future__ import annotations

import functools
import json

import pytest

from helpers import PARTS

from dfma.inventor import read_ipt
from inventor import make_fixture
from inventor.nist_pair import analyze_registered
from nist_files import ap242_files

INV = PARTS.parent / "inventor" / "files"
SHEET_METAL = {"INV_nist_ctc_03_asme1_2021.ipt", "INV_nist_ftc_09_asme1_2021.ipt", "INV_nist_ftc_09_asme1_2024.ipt"}
WITH_THREADS = {"INV_nist_ctc_04_asme1_2021.ipt", "INV_nist_ftc_10_asme1_2021.ipt", "INV_nist_ftc_10_asme1_2024.ipt"}


@functools.lru_cache(maxsize=None)
def registered(step_name: str, ipt_name: str) -> dict:
    step = next(p for p in ap242_files() if p.name == step_name)
    return analyze_registered(step, INV / ipt_name)


def states(result: dict) -> dict:
    out: dict[str, int] = {}
    for t in result["inventor"]["threads"]:
        out[t["state"]] = out.get(t["state"], 0) + 1
    return out


@pytest.mark.parametrize("step, ipt, callout, depth, tap, want", [
    ("nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt", "M12x1.75", 25.0, 10.25, {"matched": 4}),
    ("nist_ftc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2021.ipt", "M3x0.5", 6.0, 2.5, {"matched": 6}),
    ("nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt", "M3x0.5", 6.0, 2.5,
     {"matched": 5, "disagrees": 1}),
])
def test_nist_threads(step, ipt, callout, depth, tap, want):
    result = registered(step, ipt)
    assert states(result) == want
    holes = {f["id"]: f for f in result["features"] if f["kind"] == "hole"}
    for t in result["inventor"]["threads"]:
        assert (t["designation"], t["class"], t["depth_mm"], t["tap_drill_mm"]) == (callout, "6H", depth, tap)
        assert t["hole"] in holes and t["id"] in holes[t["hole"]]["thread"]
        if t["state"] == "disagrees":  # STC 10: a measured difference between NIST's two files
            [g] = t["gaps"]
            assert g["what"] == "axis" and g["mm"] == pytest.approx(0.10, abs=0.01)
    assert len({t["hole"] for t in result["inventor"]["threads"]}) == sum(want.values())  # one hole each
    found = [f for f in result["findings"] if f["rule"] == "thread_mismatch"]
    assert len(found) == want.get("disagrees", 0)


def test_thread_records():
    """CTC 04's record as stored (spec "Thread records"; measured)."""
    [t, *_] = read_ipt(INV / "INV_nist_ctc_04_asme1_2021.ipt").threads
    assert (t.id, t.designation, t.cls, t.standard, t.pitch_mm, t.face) == (
        "thread-1", "M12x1.75", "6H", "ANSI Metric M Profile", 1.75, "hole")
    assert t.major_mm == [12.0, 12.453] and t.minor_mm == [10.106, 10.441] and t.tap_drill_mm == 10.25
    assert t.depth_mm == pytest.approx(25.0, abs=1e-4) and t.reason is None


@pytest.mark.parametrize("name", sorted(p.name for p in INV.glob("*.ipt") if p.name not in SHEET_METAL | WITH_THREADS))
def test_plain_files_no_threads(name):
    assert read_ipt(INV / name).threads == []


def test_fixtures_current():
    """The committed fixtures the browser tests use match a fresh run, so they can't drift from the response."""
    for name, (step, ipt) in make_fixture.PAIRS.items():
        fresh = registered(step, ipt)
        kept = json.loads((make_fixture.FIXTURES / f"{name}.json").read_text("utf-8"))
        assert kept["inventor"] == json.loads(json.dumps(fresh["inventor"]))
        assert ({f["id"]: f.get("thread") for f in kept["features"]}
                == {f["id"]: f.get("thread") for f in fresh["features"]})
        assert [f["id"] for f in kept["findings"]] == [f["id"] for f in fresh["findings"]]
