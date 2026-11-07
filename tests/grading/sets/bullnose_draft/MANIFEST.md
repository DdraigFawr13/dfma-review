# Bull-nose and draft pocket set

Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name. Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/bullnose_draft`.

Part · what it tests · faces by class
- `c01_plain` · 50 x 30 x 12 pocket, sharp corners (control) · 14: 5, 24: 6
- `c02_corner6` · 50 x 30 x 12 pocket, corner R6 (control) · 14: 9, 24: 6
- `bn_r1` · corner R6, floor fillet r1 (bull-nose end mill) · 14: 17, 24: 6
- `bn_r2` · corner R6, floor fillet r2 (bull-nose end mill) · 14: 17, 24: 6
- `bn_r3` · corner R6, floor fillet r3 (bull-nose end mill) · 14: 17, 24: 6
- `bn_r5p5` · corner R6, floor fillet r5.5 (bull-nose end mill) · 14: 17, 24: 6
- `bn_ball6` · corner R6, floor fillet r6 (ball end mill: the corners become spheres) · 14: 17, 24: 6
- `bn_sharp_r2` · sharp corners, floor fillet r2 (fillet added in CAD) · 14: 9, 24: 6
- `bn_one_edge` · sharp corners, one floor edge filleted r2 · 14: 6, 24: 6
- `bn_round_d40` · round pocket d40 x 10, floor fillet r3 · 12: 3, 24: 6
- `bn_obround` · closed slot-shaped pocket 60 x 16 x 8, ends R8, floor fillet r2 · 16: 17, 24: 6
- `bn_shallow` · pocket 2 mm deep, corner R6, floor fillet r1.5 · 14: 17, 24: 6
- `bn_hole` · corner R6, floor fillet r2, d8 through hole in the floor · 1: 1, 14: 17, 24: 6
- `bn_island` · corner R6, 12 x 12 island R3, floor fillets r2 round the walls and the island · 14: 33, 24: 7
- `dr_1deg` · sharp corners, 1 deg draft on all walls · 14: 5, 24: 6
- `dr_2deg` · sharp corners, 2 deg draft on all walls · 14: 5, 24: 6
- `dr_3deg` · sharp corners, 3 deg draft on all walls · 14: 5, 24: 6
- `dr_5deg` · sharp corners, 5 deg draft on all walls · 14: 5, 24: 6
- `dr_10deg` · sharp corners, 10 deg draft on all walls · 14: 5, 24: 6
- `dr_3deg_corner6` · 3 deg draft, corner R6 (the corners become cones) · 14: 9, 24: 6
- `dr_3deg_corner6_r2` · 3 deg draft, corner R6, floor fillet r2 (a cast or moulded pocket) · 14: 17, 24: 6
- `dr_round_1deg` · round pocket d40 x 10, 1 deg draft (a cone wall) · 12: 2, 24: 6
- `dr_two_walls` · 3 deg draft on the two end walls only · 14: 5, 24: 6
- `dr_5deg_hole` · 5 deg draft, d8 through hole in the floor · 1: 1, 14: 5, 24: 6
- `ng_slot_r2` · open-ended slot 16 wide, 8 deep, through the -X side, floor fillets r2 (not a pocket) · 17: 7, 24: 6
- `ng_step_r2` · step along the +Y edge, 10 deep, floor fillet r2 (not a pocket) · 8: 3, 24: 6
- `ng_slot_3deg` · open-ended slot through the -X side, 3 deg draft on its side walls (not a pocket) · 17: 4, 24: 6
- `ng_step_3deg` · step along the +Y edge, 3 deg draft on its wall (not a pocket) · 8: 2, 24: 6
- `ng_uslot` · open-ended slot 16 wide with a full round bottom (r8), through the -X side (not a pocket; MFCAD++ 15720 has its like) · 17: 7, 24: 6
- `bn_blind_hole_r1` · d8 x 10 blind hole with a 1 mm fillet round its flat bottom (a blind hole, not through) · 12: 3, 24: 6
- `ng_passage_3deg` · 50 x 30 passage through the part, 3 deg draft (no floor: not a pocket) · 3: 4, 24: 6
