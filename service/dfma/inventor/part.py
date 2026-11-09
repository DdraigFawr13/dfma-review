"""read_ipt: what I1 S1 needs from an .ipt (spec I1 Design "Parts"; layouts measured on the 16 NIST files)."""

from __future__ import annotations

import struct
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .. import settings
from ..errors import ReadError
from . import blends as bl, holes as hl, names as nm, ole, sab, tags as tg, threads as th

PLAIN_PART = "4D29B490-49B2-11D0-93C3-7E0706000000"  # Design Tracking property 31 of 13 NIST files
SHEET_METAL = "9C464203-9BAE-11D3-8BAD-0060B0CE6BB4"  # CTC 03, FTC 09 2021 and 2024
# UFRxDoc: this 16-byte marker (the plain-part id as Inventor stores it) appears three times; after the second,
# a u32 count, one byte, then that many names (u32 length + UTF-16). Count 0 in the ten files saved by 2021,
# 1 in FTC 07 2021 ('Master', saved by 2022) and the four plain 2024 files ('[Primary]'). Assumption: a part
# with two Model States has count 2 here (no sample, D-033).
_STATES_MARK = bytes.fromhex("90b4294dd011b249077ec39300000006")


@dataclass
class IptPart:
    saved_with: str  # property 67 up to the first NUL, e.g. "2024.1 (Build 281209000, 209)"
    acis_version: str  # the main model's asmheader version, e.g. "229.6.0.65535"
    subtype: str | None  # property 31, a document-type id
    model_state_names: list[str]
    solid_bodies: int  # in the main model; a body of under 4 faces, all planes, is a surface body
    corners_mm: list[tuple[float, float, float]]  # the point of each vertex record of the main model
    face_count: int
    threads: list = field(default_factory=list)  # S2: threads.Thread, in record order
    hole_features: list = field(default_factory=list)  # I2 S1: holes.HoleFeature, by feature id
    hole_names: list[str] = field(default_factory=list)  # I2 S2: the `Hole<n>` texts seen, by number
    hole_names_seen: int = 0  # I2 S2: how many; names fill in only when it equals len(hole_features)
    blends: list = field(default_factory=list)  # I3: blends.Blend, by feature id


def _text(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, bytes):
        v = v.decode("latin1")
    return str(v).split("\x00", 1)[0].strip()


def model_states(d: bytes) -> list[str]:
    """Model State names from a UFRxDoc stream; [] when the layout isn't found (see _STATES_MARK)."""
    i = d.find(_STATES_MARK)
    i = d.find(_STATES_MARK, i + 1) if i >= 0 else -1
    if i < 0:
        return []
    j = i + len(_STATES_MARK)
    if j + 5 > len(d):
        return []
    n = struct.unpack_from("<I", d, j)[0]
    j += 5
    names = []
    for _ in range(min(n, 1000)):
        if j + 4 > len(d):
            return names
        k = struct.unpack_from("<I", d, j)[0]
        if j + 4 + 2 * k > len(d):
            return names
        names.append(d[j + 4:j + 4 + 2 * k].decode("utf-16le", "replace"))
        j += 4 + 2 * k
    return names


def _bodies(recs: list[sab.Record]) -> int:
    faces_of: dict[int, list[int]] = {}
    for i, r in enumerate(recs):
        if r.name != "face":
            continue
        shell = sab.link(recs, r, "shell")
        lump = sab.link(recs, recs[shell], "lump") if shell is not None else None
        body = sab.link(recs, recs[lump], "body") if lump is not None else None
        if body is not None:
            faces_of.setdefault(body, []).append(i)

    def plane(f: int) -> bool:
        s = next((q for p in recs[f].of("p") if (q := sab.ref(recs, p, suffix="surface")) is not None), None)
        return s is not None and (recs[s].name or "").startswith("plane")

    return sum(1 for fs in faces_of.values() if not (len(fs) < 4 and all(plane(f) for f in fs)))


def read_ipt(path: str | Path, stream_cap: int | None = None) -> IptPart:
    f = ole.Ipt(path)
    try:
        dtp = next((n for n in f.names if n.endswith(ole.DESIGN_TRACKING)), None)
        props = f.properties(dtp) if dtp else {}
        ufr = next((n for n in f.names if n.split("/")[-1] == "UFRxDoc"), None)
        states = model_states(f.read(ufr)) if ufr else []
        names = nm.hole_names(f, stream_cap)
        best = None
        for d in f.models(stream_cap=stream_cap):
            k = d.find(sab.HEADER)
            while k >= 0:  # a stream may hold several models one after another (FTC 11, measured)
                version, recs = sab.split(d, k)
                n = sum(1 for r in recs if r.name == "face")
                if best is None or n > best[2]:
                    best = (version, recs, n)
                k = d.find(sab.HEADER, k + 1)
    finally:
        f.close()
    if best is None or best[2] == 0:
        raise ReadError(settings.MSG_IPT_NO_MODEL)
    version, recs, n_faces = best
    corners = []
    for r in recs:
        if r.name == "vertex":
            p = sab.link(recs, r, "point")
            v = recs[p].of("v") if p is not None else []
            if not v:
                raise ReadError(settings.MSG_IPT_FORMAT.format(version=version))
            corners.append(tuple(10.0 * x for x in v[0]))  # cm -> mm
    sub = _text(props.get(31))
    if sub:
        try:
            sub = str(uuid.UUID(sub)).upper()
        except ValueError:
            pass
    tags = tg.feature_tags(recs)
    features = hl.read_hole_features(recs, tags)
    nm.assign(features, names)
    threads = th.read_threads(recs)
    nm.name_threads(threads, features)
    return IptPart(saved_with=_text(props.get(67)) or "unknown", acis_version=version, subtype=sub,
                   model_state_names=states, solid_bodies=_bodies(recs), corners_mm=corners, face_count=n_faces,
                   threads=threads, hole_features=features, hole_names=names, hole_names_seen=len(names),
                   blends=bl.read_blends(recs, tags))
