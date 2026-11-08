"""Read Inventor .ipt files with code of our own (D-031): olefile for the compound file, our SAB splitter
for the ACIS model inside. Spec: docs/specs/inventor-i1-threads.md."""

from .pair import check_part_type
from .part import IptPart, read_ipt

__all__ = ["IptPart", "check_part_type", "read_ipt"]
