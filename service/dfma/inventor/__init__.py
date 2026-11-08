"""Read Inventor .ipt files with code of our own (D-031): olefile for the compound file, our SAB splitter
for the ACIS model inside. Spec: docs/specs/inventor-i1-threads.md."""

from .pair import check_pair, check_part_type, inventor_block, pair_reason
from .part import IptPart, read_ipt
from .threads import Thread, map_threads

__all__ = ["IptPart", "Thread", "map_threads", "check_pair", "check_part_type", "inventor_block", "pair_reason", "read_ipt"]
