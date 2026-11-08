"""One module per rule (spec Rules). RULES is the rule order that numbers findings (F1, F2, ...)."""

from __future__ import annotations

from . import access, corner_radius, hole_depth, hole_size, pocket_depth, thin_wall, undercut

RULES = [hole_depth, hole_size, corner_radius, pocket_depth, undercut, thin_wall, access]  # S6 adds turning
