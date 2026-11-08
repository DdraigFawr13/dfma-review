"""Checks before mapping (spec I1 Design "Checks before mapping"). First failure wins.

check_pair (face count, outer size, corners) is added once Morgan's first work pair has been measured
(spec S1 "First"); check_part_type does not depend on that measurement.
"""

from __future__ import annotations

from .. import settings
from ..errors import ReadError
from .part import PLAIN_PART, SHEET_METAL, IptPart


def part_type_reason(ipt: IptPart, step) -> str | None:
    """The kind of part refused, or None for a plain single-body part. `step` is the STEP's ReadResult."""
    if ipt.subtype == SHEET_METAL:
        return "sheet-metal part"
    if ipt.subtype != PLAIN_PART:  # any other document type, or none stored
        return "part of a type this tool can't read yet"
    if len(ipt.model_state_names) > 1:
        return "part with Model States"
    if step.ignored_solids > 0 or ipt.solid_bodies > 1:
        return "multi-body part"
    return None


def check_part_type(ipt: IptPart, step) -> None:
    kind = part_type_reason(ipt, step)
    if kind is not None:
        raise ReadError(settings.MSG_IPT_TYPE.format(kind=kind))
