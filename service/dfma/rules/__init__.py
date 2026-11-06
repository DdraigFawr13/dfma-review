"""One module per rule (spec Rules). RULES is the rule order that numbers findings (F1, F2, ...)."""

from __future__ import annotations

from . import hole_depth, hole_size

RULES = [hole_depth, hole_size]  # S3 adds corner_radius and pocket_depth; S4 thin_wall; ...
