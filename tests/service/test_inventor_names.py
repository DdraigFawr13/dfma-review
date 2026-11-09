"""Feature names. I1 S3: the answer key (tests/inventor/names_key.json, InventorLoader output, D-031) and the
measured feature-id field of thread records (docs/research/inventor-names-probe/README.md). I2 S2 J4: Hole names
by the rank rule (spec "Names (measured; the rank rule)", D-039), checked against holes_key.json with 0 misses."""

from __future__ import annotations

import json

import pytest

from helpers import PARTS

from dfma.inventor import ole, read_ipt, sab
from dfma.inventor import threads as th

INV = PARTS.parent / "inventor" / "files"
KEY = json.loads((PARTS.parent / "inventor" / "names_key.json").read_text())


def feature_ids(path) -> list[int]:
    """The feature id of each thread record of the main model, in record order (2021: int 8; 2024: int 9)."""
    f = ole.Ipt(path)
    try:
        best = None
        for d in f.models():
            k = d.find(sab.HEADER)
            while k >= 0:
                _, recs = sab.split(d, k)
                n = sum(1 for r in recs if r.name == "face")
                if best is None or n > best[0]:
                    best = (n, recs)
                k = d.find(sab.HEADER, k + 1)
    finally:
        f.close()
    out = []
    for r in best[1]:
        ok, _ = th._is_thread(r)
        if ok:
            ints = r.of("i")
            out.append(ints[8] if (r.name or "").startswith(th.THREAD_2021) else ints[9])
    return out


@pytest.mark.parametrize("ipt", sorted(KEY["threads"]))
def test_key_covers_every_thread(ipt):
    assert [t.id for t in read_ipt(INV / ipt).threads] == list(KEY["threads"][ipt])


@pytest.mark.parametrize("ipt", sorted(KEY["threads"]))
def test_feature_id_groups_threads_by_feature(ipt):
    ids = feature_ids(INV / ipt)
    names = list(KEY["threads"][ipt].values())
    assert len(ids) == len(names)
    assert {str(i): n for i, n in zip(ids, names)} == KEY["feature_ids"][ipt]
    # one id per feature and one feature per id
    assert len(set(ids)) == len(set(names))


# --- I2 S2 J4: names by the rank rule (spec "Names (measured; the rank rule)") ---

import functools  # noqa: E402

from test_inventor_holes import _pairs  # noqa: E402

NO_NAMES = {"INV_nist_ftc_06_asme1_2024.ipt": 7, "INV_nist_ftc_10_asme1_2024.ipt": 11}  # names seen > ids read


@functools.lru_cache(maxsize=None)
def _ipt(name: str):
    return read_ipt(INV / name)


def test_hole_names_against_key():
    """Each checkable Hole's name equals the key's where the counts match (spec: 70 of 70, 0 wrong)."""
    right = wrong = 0
    for name, k, f in _pairs():
        if name in NO_NAMES:
            assert f.name is None, (name, k["name"])
            continue
        if f.name == k["name"]:
            right += 1
        else:
            wrong += 1
    assert (right, wrong) == (70, 0)


@pytest.mark.parametrize("name", sorted(p.name for p in INV.glob("*.ipt")))
def test_hole_names_rank_rule(name):
    """Names fill in only when the count of Hole names equals the count of Hole features; else all null."""
    part = _ipt(name)
    names = [f.name for f in part.hole_features]
    if name in NO_NAMES:
        assert names == [None] * len(names) and part.hole_names_seen == NO_NAMES[name]
        return
    assert part.hole_names_seen == len(names)
    assert all(n is not None for n in names)
    assert sorted(names, key=lambda s: int(s[4:])) == names  # k-th smallest id, k-th name by number


@pytest.mark.parametrize("ipt", ["INV_nist_ctc_04_asme1_2021.ipt", "INV_nist_ftc_10_asme1_2021.ipt",
                                 "INV_nist_ftc_10_asme1_2024.ipt"])
def test_thread_feature_name(ipt):
    """Each thread's feature id and name; STC 10 (FTC 10 2024) shows no names (counts differ)."""
    part = _ipt(ipt)
    assert [t.feature_id for t in part.threads] == feature_ids(INV / ipt)
    want = [None] * len(part.threads) if ipt in NO_NAMES else list(KEY["threads"][ipt].values())
    assert [t.feature_name for t in part.threads] == want


def test_names_in_response():
    """The response carries each Hole feature's name, each thread's feature_name and hole_names_seen."""
    from test_inventor_holes import COUNTS, registered
    ipt = "INV_nist_ctc_04_asme1_2021.ipt"
    inv = registered(COUNTS["pair"][ipt]["step"], ipt)["inventor"]
    assert [f["name"] for f in inv["hole_features"]] == [
        "Hole8", "Hole10", "Hole11", "Hole12", "Hole13", "Hole19", "Hole20", "Hole21", "Hole22"]
    assert {t["feature_name"] for t in inv["threads"]} == {"Hole8"}
    assert inv["hole_names_seen"] == 9


class _FakeIpt:
    """Streams by name, already inflated (for names.hole_names)."""

    def __init__(self, streams: dict[str, bytes]):
        self.streams, self.names = streams, list(streams)

    def inflate(self, name, stream_cap=None):
        return self.streams[name]


def _u16(*texts: str) -> bytes:
    return b"".join(b"\x05\x00\x00\x00" + t.encode("utf-16le") for t in texts)


def test_names_stream_choice():
    """The smallest B stream with an M partner that holds a Hole<n> text; ties to sort order; texts distinct."""
    from dfma.inventor import names as nm
    f = _FakeIpt({"RSeStorage/Bbig": _u16("Hole1", "Hole2", "Hole3") + b"x" * 100, "RSeStorage/Mbig": b"",
                  "RSeStorage/Bsmall": _u16("Hole10", "Hole2", "Hole10"), "RSeStorage/Msmall": b"",
                  "RSeStorage/Bnone": _u16("Fillet1"), "RSeStorage/Mnone": b"",
                  "RSeStorage/Blone": _u16("Hole7")})  # no M partner: never read
    assert nm.hole_names(f) == ["Hole2", "Hole10"]  # by number, not by text
    g = _FakeIpt({"RSeStorage/Bb": _u16("Hole5"), "RSeStorage/Mb": b"", "RSeStorage/Ba": _u16("Hole4"), "RSeStorage/Ma": b""})
    assert nm.hole_names(g) == ["Hole4"]  # equal sizes: the first name in sort order


def test_thread_of_no_hole_feature():
    """A thread whose feature id is no Hole feature's gets no name (never a neighbour's)."""
    import dataclasses
    from dfma.inventor import names as nm
    part = _ipt("INV_nist_ctc_04_asme1_2021.ipt")
    threads = [dataclasses.replace(part.threads[0], feature_id=k, feature_name="stale") for k in (2437, 1, None)]
    nm.name_threads(threads, part.hole_features)
    assert [t.feature_name for t in threads] == ["Hole8", None, None]
