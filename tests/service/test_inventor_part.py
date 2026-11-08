"""I1 S1: read_ipt and the part-type check on the 16 NIST .ipt files (spec J3, J6 reader cases)."""

from __future__ import annotations

import hashlib
import re
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

from helpers import rewrite_ipt_models

from dfma import settings
from dfma.errors import ReadError
from dfma.inventor import check_part_type, read_ipt
from dfma.inventor.part import PLAIN_PART, model_states

INV = Path(__file__).resolve().parents[1] / "inventor"
FILES = INV / "files"

# (faces, corners, Model State names) measured 2026-11-08; CTC 04 368/506 and FTC 07 2021 210 corners
# (from 346 point records) as in the spec, J3
COUNTS = {
    "INV_nist_ctc_01_asme1_2021.ipt": (139, 250, []),
    "INV_nist_ctc_02_asme1_2021.ipt": (443, 630, []),
    "INV_nist_ctc_03_asme1_2021.ipt": (131, 202, []),
    "INV_nist_ctc_04_asme1_2021.ipt": (368, 506, []),
    "INV_nist_ctc_05_asme1_2021.ipt": (158, 261, []),
    "INV_nist_ftc_06_asme1_2021.ipt": (148, 237, []),
    "INV_nist_ftc_06_asme1_2024.ipt": (148, 237, ["[Primary]"]),
    "INV_nist_ftc_07_asme1_2021.ipt": (258, 210, ["Master"]),
    "INV_nist_ftc_07_asme1_2024.ipt": (258, 346, ["[Primary]"]),
    "INV_nist_ftc_08_asme1_2021.ipt": (255, 412, []),
    "INV_nist_ftc_08_asme1_2024.ipt": (255, 412, ["[Primary]"]),
    "INV_nist_ftc_09_asme1_2021.ipt": (91, 174, []),
    "INV_nist_ftc_09_asme1_2024.ipt": (91, 174, []),
    "INV_nist_ftc_10_asme1_2021.ipt": (223, 310, []),
    "INV_nist_ftc_10_asme1_2024.ipt": (215, 299, ["[Primary]"]),
    "INV_nist_ftc_11_asme1_2021.ipt": (8, 8, []),
}
SHEET_METAL = ["INV_nist_ctc_03_asme1_2021.ipt", "INV_nist_ftc_09_asme1_2021.ipt", "INV_nist_ftc_09_asme1_2024.ipt"]
PLAIN_STEP = SimpleNamespace(ignored_solids=0)  # the part-type check reads only this from the STEP


def _sums() -> dict[str, str]:
    text = (INV / "SOURCE.md").read_text(encoding="utf-8")
    return {name: h for h, name in re.findall(r"^([0-9a-f]{64})  (\S+\.ipt)$", text, re.M)}


def test_checksums():
    sums = _sums()
    assert sorted(sums) == sorted(COUNTS) == sorted(p.name for p in FILES.glob("*.ipt"))
    for name, h in sums.items():
        assert hashlib.sha256((FILES / name).read_bytes()).hexdigest() == h, name


@pytest.mark.parametrize("name", sorted(COUNTS))
def test_counts(name):
    part = read_ipt(FILES / name)
    faces, corners, states = COUNTS[name]
    assert (part.face_count, len(part.corners_mm), part.model_state_names) == (faces, corners, states)
    assert part.solid_bodies == 1
    assert part.acis_version.startswith("22")
    year = "2022" if name == "INV_nist_ftc_07_asme1_2021.ipt" else name[-8:-4]
    assert part.saved_with.startswith(year)


def test_units_and_header():
    """CTC 04, saved by 2021: cm in the file, mm out; the outer size as NIST draws it (mm)."""
    part = read_ipt(FILES / "INV_nist_ctc_04_asme1_2021.ipt")
    assert part.acis_version == "226.0.3.65535"
    assert part.saved_with == "2021 (Build 250183000, 183)"
    lo = [min(c[k] for c in part.corners_mm) for k in range(3)]
    hi = [max(c[k] for c in part.corners_mm) for k in range(3)]
    assert max(h - l for h, l in zip(hi, lo)) > 100  # a part some hundred mm long, not cm


@pytest.mark.parametrize("name", SHEET_METAL)
def test_sheet_metal_refused(name):
    with pytest.raises(ReadError) as e:
        check_part_type(read_ipt(FILES / name), PLAIN_STEP)
    assert str(e.value) == ("This Inventor part is a sheet-metal part. Only plain single-body parts can be read "
                            "for now.")


@pytest.mark.parametrize("name", ["INV_nist_ftc_06_asme1_2021.ipt", "INV_nist_ftc_10_asme1_2021.ipt"])
def test_surface_bodies_not_multibody(name):
    """Each holds 2 extra one-plane surface bodies beside its solid (measured); they pass the body rule."""
    check_part_type(read_ipt(FILES / name), PLAIN_STEP)


@pytest.mark.parametrize("name", sorted(set(COUNTS) - set(SHEET_METAL)))
def test_plain_parts_pass(name):
    check_part_type(read_ipt(FILES / name), PLAIN_STEP)


def _part(**kw):
    part = read_ipt(FILES / "INV_nist_ctc_04_asme1_2021.ipt")
    for k, v in kw.items():
        setattr(part, k, v)
    return part


@pytest.mark.parametrize("kw, step, kind", [
    ({"model_state_names": ["[Primary]", "Long"]}, PLAIN_STEP, "part with Model States"),
    ({"solid_bodies": 2}, PLAIN_STEP, "multi-body part"),
    ({}, SimpleNamespace(ignored_solids=1), "multi-body part"),
    ({"subtype": "28EC8354-9024-440F-A8A2-0E0E55D635B0"}, PLAIN_STEP, "part of a type this tool can't read yet"),
    ({"subtype": None}, PLAIN_STEP, "part of a type this tool can't read yet"),
])
def test_other_refusals(kw, step, kind):
    with pytest.raises(ReadError) as e:
        check_part_type(_part(**kw), step)
    assert str(e.value) == settings.MSG_IPT_TYPE.format(kind=kind)


def test_model_states_layout():
    """Built from the measured layout: after the marker's second copy, a count, a byte, then the names."""
    mark = bytes.fromhex("90b4294dd011b249077ec39300000006")
    names = ["[Primary]", "Long"]
    body = len(names).to_bytes(4, "little") + b"\x00" + b"".join(
        len(n).to_bytes(4, "little") + n.encode("utf-16le") for n in names)
    assert model_states(b"xx" + mark + b"\x01" * 8 + mark + body + mark) == names
    assert model_states(b"no marker here") == []
    assert model_states(mark + b"\x00" * 3 + mark + b"\x05\x00") == []  # cut short: no names, no crash


# J6 reader cases: hostile and broken files, built here from a NIST copy (no outside binaries)

def _copy(tmp_path: Path, name: str = "INV_nist_ftc_11_asme1_2021.ipt") -> Path:
    out = tmp_path / "part.ipt"
    shutil.copyfile(FILES / name, out)
    return out


def test_not_an_ipt(tmp_path):
    p = tmp_path / "x.ipt"
    p.write_bytes(b"ISO-10303-21;\nHEADER;\n")
    with pytest.raises(ReadError, match=re.escape(settings.MSG_IPT_NOT_IPT)):
        read_ipt(p)
    shutil.copyfile(Path(__file__).resolve().parents[1] / "parts" / "box_through_hole.step", p)
    with pytest.raises(ReadError, match=re.escape(settings.MSG_IPT_NOT_IPT)):
        read_ipt(p)


def test_over_cap(tmp_path):
    """The cap patched down to 1 MiB (spec Builder defaults); CTC 02's main model inflates past it."""
    with pytest.raises(ReadError, match=re.escape(settings.MSG_IPT_TOO_BIG)):
        read_ipt(_copy(tmp_path, "INV_nist_ctc_02_asme1_2021.ipt"), stream_cap=1024 * 1024)


def test_no_model(tmp_path):
    p = _copy(tmp_path)
    rewrite_ipt_models(p, lambda d: d.replace(b"asmheader", b"xxxxxxxxx"))
    with pytest.raises(ReadError, match=re.escape(settings.MSG_IPT_NO_MODEL)):
        read_ipt(p)


@pytest.mark.parametrize("cut", ["length", "tag", "end"])
def test_broken_model(tmp_path, cut):
    """A string length running off the data, an unknown tag, and a model cut before its end record."""
    def change(d: bytes) -> bytes:
        k = d.find(b"\x0d\x09asmheader")
        if k < 0:
            return d
        if cut == "length":  # the first long string (tag 0x08, u16 length) claims 65535 bytes
            j = d.find(b"\x08", k + 12)
            return d[:j + 1] + b"\xff\xff" + d[j + 3:j + 40]
        if cut == "tag":
            j = d.find(b"\x11", k) + 1  # first byte of the second record
            return d[:j] + b"\xee" + d[j + 1:]
        return d[:k + 200]
    p = _copy(tmp_path)
    rewrite_ipt_models(p, change)
    with pytest.raises(ReadError) as e:
        read_ipt(p)
    assert str(e.value) in (settings.MSG_IPT_FORMAT.format(version="226.0.3.65535"),
                            settings.MSG_IPT_FORMAT.format(version="unknown"))
