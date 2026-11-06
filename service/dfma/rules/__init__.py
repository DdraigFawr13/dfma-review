"""One module per rule (spec Rules). RULES is the rule order that numbers findings (F1, F2, ...)."""

from __future__ import annotations

from . import corner_radius, hole_depth, hole_size, pocket_depth

RULES = [hole_depth, hole_size, corner_radius, pocket_depth]  # S4 adds thin_wall; ...
