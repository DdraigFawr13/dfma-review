"""I2 S1 J2, J3: Hole features read from the NIST .ipt files, checked against the answer key, and mapped onto
their STEP holes through the test harness (tests/inventor/nist_pair.py; the app refuses every NIST pair)."""

from __future__ import annotations

import functools
import json
import math
import tomllib

import pytest

from helpers import PARTS

from dfma.inventor import read_ipt
from inventor.nist_pair import analyze_registered
from nist_files import ap242_files

INV = PARTS.parent / "inventor" / "files"
COUNTS = tomllib.loads((PARTS.parent / "inventor" / "hole_counts.toml").read_text("utf-8"))
KEY = json.loads((PARTS.parent / "inventor" / "holes_key.json").read_text("utf-8"))["holes"]
TYPES = {"None": "simple", "Counterbore": "counterbore", "Countersink": "countersink"}


@functools.lru_cache(maxsize=None)
def ipt(name: str):
    return read_ipt(INV / name)


@functools.lru_cache(maxsize=None)
def registered(step_name: str, ipt_name: str) -> dict:
    step = next(p for p in ap242_files() if p.name == step_name)
    return analyze_registered(step, INV / ipt_name)


@pytest.mark.parametrize("name", sorted(COUNTS["file"]))
def test_counts(name):
    want = COUNTS["file"][name]
    feats = ipt(name).hole_features
    assert (len(feats), sum(len(f.holes) for f in feats)) == (want["features"], want["holes"])
    assert [f.feature_id for f in feats] == sorted(f.feature_id for f in feats)


def _off(p, origin, axis) -> float:
    d = [p[k] - origin[k] for k in range(3)]
    t = sum(d[k] * axis[k] for k in range(3))
    return math.sqrt(max(0.0, sum(x * x for x in d) - t * t))


def _along(p, origin, axis) -> float:
    return sum((p[k] - origin[k]) * axis[k] for k in range(3))


def _pairs():
    """(file, key Hole, .ipt feature) for each key Hole whose centre lies on an .ipt hole's axis at one end of the
    hole, with the key's diameter (as docs/research/inventor-i2-probe/s28.py)."""
    out = []
    for name, holes in sorted(KEY.items()):
        feats = ipt(name).hole_features
        for k in holes:
            hits = {f.feature_id: f for f in feats for h in f.holes for c in k["centres_mm"]
                    if h.reason is None and _off(c, h.start, h.axis) <= 0.01
                    and min(abs(t) for t in (_along(c, h.start, h.axis), _along(c, h.start, h.axis) - h.length_mm))
                    <= 0.01 and abs(h.diameter_mm - k["Diameter"]) <= 0.01}
            if len(hits) == 1:
                out.append((name, k, next(iter(hits.values()))))
    return out


def test_against_key():
    """J2: type and diameter equal the key's on every key Hole that pairs with one feature (spec: 73, 0 misses);
    depth equals the key's where the hole ends inside the part."""
    pairs = _pairs()
    assert len(pairs) == 85  # by position (spec: 73 by rank, in the 8 files where the counts match)
    for name, k, f in pairs:
        assert f.type == TYPES[k["HoleCutType"]], (name, k["name"])
        assert f.diameter_mm == pytest.approx(k["Diameter"], abs=0.01), (name, k["name"])
        if not f.through and k["DepthType"] != "ThroughAll":
            assert f.depth_mm == pytest.approx(k["Depth"], abs=0.01), (name, k["name"])
        if f.type == "counterbore":
            assert f.cbore_diameter_mm == pytest.approx(k["HoleCutDiameter"], abs=0.01)
            assert f.cbore_depth_mm == pytest.approx(k["HoleCutDepth"], abs=0.01)
        if f.type == "countersink":
            assert f.csink_deg == pytest.approx(k["HoleCutCountersinkAngle"], abs=0.01)
            assert f.csink_diameter_mm == pytest.approx(k["HoleCutDiameter"], abs=0.01)
        if not f.through and k["DrillPoint"] == "Angled":
            assert f.point_deg == pytest.approx(k["DrillPointAngle"], abs=0.01)


def test_copies():
    """FTC 08 2021: one Hole feature, 4 holes: 1 drawn, 3 copied by ids 2187 and 2202 (spec J2)."""
    [f] = ipt("INV_nist_ftc_08_asme1_2021.ipt").hole_features
    assert f.feature_id == 1997 and len(f.holes) == 4
    assert sorted(tuple(sorted(h.copied_by)) for h in f.holes) == [(), (2187,), (2187, 2202), (2202,)]


@pytest.mark.parametrize("name", sorted(COUNTS["pair"]))
def test_mapping(name):
    """J3: holes per state and hole_mismatch findings on each NIST pair, as measured."""
    want = COUNTS["pair"][name]
    result = registered(want["step"], name)
    rows = [h for f in result["inventor"]["hole_features"] for h in f["holes"]]
    got = {s: sum(1 for h in rows if h["state"] == s) for s in ("matched", "disagrees", "not_mapped")}
    assert got == {s: want[s] for s in got}
    found = [f for f in result["findings"] if f["rule"] == "hole_mismatch"]
    assert len(found) == want["findings"]
    holes = {f["id"]: f for f in result["features"] if f["kind"] in ("hole", "bore")}
    for f in result["inventor"]["hole_features"]:
        for h in f["holes"]:
            assert (h["hole"] is None) == (h["state"] == "not_mapped")
            assert (h["gaps"] != []) == (h["state"] == "disagrees")
            if h["hole"] is not None:
                assert "hole_feature" in holes[h["hole"]]


def test_ctc_04_mapping():
    """J3, CTC 04: the 30 countersunk Ø14 holes are one feature; 4 of them lie 0.25 mm off (NIST's two files
    differ), Hole22's one is 3.23 mm off, and one is not mapped (8.13 mm off, past the STEP hole's radius)."""
    result = registered("nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt")
    feats = result["inventor"]["hole_features"]
    assert [f["id"] for f in feats] == [f"hf-{n}" for n in range(1, 10)]
    big = feats[6]
    assert (big["type"], big["diameter_mm"], big["csink_deg"], big["through"], len(big["holes"])) == (
        "countersink", 14.0, 90.0, True, 30)
    axis_off = sorted(g["mm"] for h in big["holes"] for g in h["gaps"] if g["what"] == "axis")
    assert axis_off == pytest.approx([0.25] * 4, abs=0.01)
    [lone] = [h for f in feats for h in f["holes"] if h["state"] == "not_mapped"]
    assert lone["reason"] == "no hole on this axis"
    assert feats[8]["holes"][0]["gaps"][0]["mm"] == pytest.approx(3.23, abs=0.01)
