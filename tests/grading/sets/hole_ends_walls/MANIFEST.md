# Hole ends and walls set (set 3)

Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name; depths, countersinks and hole walls in EXPECT.json (from the geometry, D-022). Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/hole_ends_walls`.

Part · what it tests · faces by class
- `cs_90` · d6.6 through hole, 90 deg countersink to d13 · 0: 1, 1: 1, 24: 6
- `cs_82` · d6.6 through hole, 82 deg countersink to d12.7 (inch screws) · 0: 1, 1: 1, 24: 6
- `cs_100` · d5.5 through hole, 100 deg countersink to d11 · 0: 1, 1: 1, 24: 6
- `cs_120` · d6.6 through hole, 120 deg countersink to d13 · 0: 1, 1: 1, 24: 6
- `cs_blind` · d5 blind hole 15 deep (flat bottom), 90 deg countersink to d10 · 0: 1, 12: 2, 24: 6
- `cs_both` · d6.6 through hole, 90 deg countersink to d13 at both ends · 0: 2, 1: 1, 24: 6
- `ch_entry` · d10 through hole, 0.5 x 45 deg entry chamfer (a 90 deg countersink to d11) · 0: 1, 1: 1, 24: 6
- `ng_drill_point` · d8 blind hole 10 deep with a 118 deg drill point (a point, not a countersink) · 12: 2, 24: 6
- `sx_bottom_20` · d8 through hole leaving a 20 deg sloped bottom (plane through z 5 at the hole) · 1: 1, 24: 7
- `sx_bottom_45` · d6 through hole leaving a 45 deg sloped bottom (plane through z 10 at the hole) · 1: 1, 24: 6
- `sx_top_30` · d6 blind hole from a 30 deg sloped top (plane through z 25 at the hole) to a flat bottom at z 5 · 12: 2, 24: 7
- `sx_control` · d8 through hole in the flat block (control) · 1: 1, 24: 6
- `hw_top` · d8 blind hole 25 deep; a 4 deep pocket from the top 0.4 from its side (near the top only) · 12: 2, 14: 5, 24: 6
- `hw_bottom` · d8 through hole; a 4 deep pocket from the bottom 0.5 from its side (near the bottom only) · 1: 1, 14: 5, 24: 6
- `hw_mid` · d8 through hole; a 25 deep pocket from the top 0.5 from its side (control: found at 3 heights too) · 1: 1, 14: 5, 24: 6
- `hw_two_sides` · d8 through hole 0.4 from the -Y face, and a 20 deep pocket 0.6 from its other side · 1: 1, 14: 5, 24: 6
