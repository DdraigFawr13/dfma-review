# Hole-joins set

Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name; hole instances in INSTANCES.json. Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/hole_joins`.

Part · what it tests · faces by class · holes
- `cb_plain` · d6.6 through hole, d11 x 6 counterbore (control) · 1: 3, 24: 6 · 1
- `cb_chamfer` · the same with a 0.5 x 45 deg chamfer where the hole meets the counterbore floor · 0: 1, 1: 3, 24: 6 · 1
- `cb_chamfer_1` · the same with a 1 x 45 deg chamfer there · 0: 1, 1: 3, 24: 6 · 1
- `cb_fillet` · the same with an r0.5 fillet where the hole meets the counterbore floor · 1: 3, 23: 1, 24: 6 · 1
- `cb_corner` · the same with an r0.5 fillet in the counterbore's corner (bore to floor) · 1: 4, 24: 6 · 1
- `cb_both` · chamfer 0.5 at the hole and r0.5 in the counterbore's corner · 0: 1, 1: 4, 24: 6 · 1
- `cb_blind_chamfer` · d6.6 blind hole to z = 5 under the counterbore, 0.5 chamfer between them · 0: 1, 12: 4, 24: 6 · 1
- `x_equal` · d8 hole down through the block, crossed at mid-depth by a d8 hole along X · 1: 4, 24: 6 · 2
- `x_small` · d8 hole down through the block, crossed by a d4 hole along X (control) · 1: 3, 24: 6 · 2
- `x_blind` · d8 blind hole 20 deep from the top, crossed 5 above its bottom by a d8 hole along X · 1: 2, 12: 3, 24: 6 · 2
- `x_snap_ring` · d10 bore through the block with a d12 x 1.5 snap-ring groove at mid-depth · 1: 2, 11: 3, 24: 6 · 1
- `x_clevis` · clevis: a 20 wide slot leaves two arms; a d8 pin hole along X through both arms · 1: 2, 6: 3, 24: 7 · 1
- `ng_blind_opposite` · d8 blind holes 12 deep from the top and from the bottom, 6 of material between (2 holes) · 12: 4, 24: 6 · 2
- `ng_cb_both_ends` · d6.6 through hole with a d11 x 6 counterbore at both ends (1 hole: the counterbores are not joined) · 1: 5, 24: 6 · 1
- `ng_far_walls` · a 40 wide slot leaves two 30 thick arms; a d10 hole along X through both (gap 4 diameters: 2 holes) · 1: 2, 6: 3, 24: 7 · 2
- `ng_cb_facing` · clevis with a 20 wide slot; d8 hole along X through both arms with a d16 x 5 counterbore on each arm's inner face (2 holes: the counterbores face each other, as on NIST ctc_02) · 1: 6, 6: 3, 24: 7 · 2
- `r_through` · d6 radial hole through a d30 shaft (both ends open onto the round face) · 1: 1, 24: 3 · 1
- `r_blind` · d6 radial hole 10 deep into a d30 shaft (control: blind) · 12: 2, 24: 3 · 1
- `r_offset` · d6 hole through a d30 shaft, 8 off its axis (both ends on the round face) · 1: 1, 24: 3 · 1
