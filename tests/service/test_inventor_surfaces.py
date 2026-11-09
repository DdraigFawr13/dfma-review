"""I2 S1: the surface under each .ipt face, on CTC 04, which holds every kind (spec Builder defaults; measured
2026-11-09: 165 cylinders, 88 planes, 66 cones, 27 tori, 22 spheres)."""

from __future__ import annotations

import collections
import functools

import pytest

from helpers import PARTS

from dfma.inventor import ole, sab, surfaces

CTC04 = PARTS.parent / "inventor" / "files" / "INV_nist_ctc_04_asme1_2021.ipt"


@functools.lru_cache(maxsize=None)
def _main_model():
    f = ole.Ipt(CTC04)
    best = None
    try:
        for d in f.models():
            k = d.find(sab.HEADER)
            while k >= 0:
                _, recs = sab.split(d, k)
                n = sum(1 for r in recs if r.name == "face")
                if best is None or n > best[1]:
                    best = (recs, n)
                k = d.find(sab.HEADER, k + 1)
    finally:
        f.close()
    return best[0]


def test_kinds():
    recs = _main_model()
    faces = [i for i, r in enumerate(recs) if r.name == "face"]
    kinds = collections.Counter(surfaces.surface(recs, i).kind for i in faces)
    assert kinds == {"cyl": 165, "plane": 88, "cone": 66, "torus": 27, "sphere": 22}


@pytest.mark.parametrize("face, kind, origin, axis, radius, minor, half", [
    (4, "sphere", (-92.702, 295.0, 10.811), None, 5.0, None, None),
    (6, "cyl", (-92.702, 295.0, 0.0), (0.0, 0.0, 1.0), 5.0, None, None),
    (101, "plane", (-367.3554, 250.0, 0.0), (0.0, 0.0, 1.0), None, None, None),
    (325, "torus", (-493.3268, 370.0, 10.811), (0.0, 0.0, 1.0), 10.0, 5.0, None),
    (505, "cone", (-755.0, 400.0, 1.5), (0.0, 0.0, -1.0), 8.5, None, 45.0),
])
def test_examples(face, kind, origin, axis, radius, minor, half):
    s = surfaces.surface(_main_model(), face)
    assert s.kind == kind
    assert s.origin == pytest.approx(origin, abs=1e-3)
    if axis is None:
        assert s.axis is None
    else:
        assert s.axis == pytest.approx(axis, abs=1e-9)
    for got, want in ((s.radius, radius), (s.minor, minor), (s.half_angle_deg, half)):
        assert (got is None) if want is None else got == pytest.approx(want, abs=1e-9)
