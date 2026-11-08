"""One module per rule (spec Rules). RULES is the rule order that numbers findings (F1, F2, ...)."""

from __future__ import annotations

from . import (access, bore_depth, corner_radius, looks_turned, hole_depth, hole_size, pocket_depth, thin_wall, turn_axis, turn_offaxis,
               thread_mismatch, turn_slender, undercut)

# turn_axis (spec Features "Turned profile") runs before the two turning rules, which need its axis.
RULES = [hole_depth, hole_size, corner_radius, pocket_depth, undercut, thin_wall, access, looks_turned, turn_axis, turn_slender,
         turn_offaxis, bore_depth, thread_mismatch]  # bore_depth: D-026; thread_mismatch last (I1 S2), so
# the F-numbers of the other findings don't move
