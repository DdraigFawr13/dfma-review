# Tapered-hole set

Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name. Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/tapered_holes`.

Part · what it tests · faces by class
- `tp_blind_1deg` · round recess d20 at the top, 15 deep, 1 deg taper · 12: 2, 24: 6
- `tp_blind_3deg` · round recess d20 at the top, 15 deep, 3 deg taper · 12: 2, 24: 6
- `tp_blind_5deg` · round recess d20 at the top, 15 deep, 5 deg taper · 12: 2, 24: 6
- `tp_blind_10deg` · round recess d20 at the top, 15 deep, 10 deg taper · 12: 2, 24: 6
- `tp_blind_3deg_r1` · round recess d20, 15 deep, 3 deg taper, 1 mm fillet round its floor · 12: 3, 24: 6
- `tp_small_3deg` · blind hole d6 at the top, 12 deep, 3 deg taper · 12: 2, 24: 6
- `tp_pin_through` · taper-pin hole d8 at the top, 1:50 taper, through the part · 1: 1, 24: 6
- `tp_pipe` · pipe-thread taper hole d21.3 at the top, 1:16 taper, 18 deep · 12: 2, 24: 6
- `ng_csink` · d6 through hole with a 90 deg countersink d12 (the countersink is not a hole) · 0: 1, 1: 1, 24: 6
- `ng_chamfer` · d10 through hole with a 1 mm x 45 deg entry chamfer (the chamfer is not a hole) · 0: 1, 1: 1, 24: 6
- `ng_drill_point` · d8 blind hole, 10 deep, with a 118 deg drill point (the point is part of the hole) · 12: 2, 24: 6
- `ng_boss_3deg` · round boss d20 with 3 deg draft on the top face (not a hole) · 24: 8
