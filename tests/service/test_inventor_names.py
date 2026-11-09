"""I1 S3: the feature-name answer key (tests/inventor/names_key.json, InventorLoader output, D-031) agrees with what
our reader sees. Names are not decoded yet (S3 time box failed; names move to I2, D-033, D-037); these tests pin the
key and the measured feature-id field I2 starts from (docs/research/inventor-names-probe/README.md)."""

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
