"""D-063: a cylinder face's whole-degree bins are taken after snapping each angle to 9 decimals, so a sample at a
whole degree lands in one bin whatever 1-ulp noise atan2 carries (the browser's atan2 is one step off glibc's at a
seam; S5 parity found it on 4 NIST linkage arms)."""

from __future__ import annotations

from dfma import features as F
from helpers import ROOT


def test_whole_degree_snaps_noise_at_a_whole_degree():
    assert F._whole_degree(269.99999999999994) == 270  # the browser's value at linkage_arm_42's seam
    assert F._whole_degree(269.99999999999997) == 270  # this Python's value there
    assert F._whole_degree(360 - 1e-13) == 0
    assert F._whole_degree(89.9999999) == 89  # a real 89.9999999 deg stays in 89


def test_seam_bin_on_a_nist_part():
    from dfma.read import read_step
    path = ROOT / "tests/edmr/models/NIST/Manfred_Osti/spectrometer/linkage_arm_42/linkage_arm_42.prt.hh.sat.stp"
    part = read_step(str(path))
    c = F._cylinder(5, part.faces[5], tapers=True)
    assert 90 in c.bins  # 89.99999999999999 before the snap: bin 90 was missing
