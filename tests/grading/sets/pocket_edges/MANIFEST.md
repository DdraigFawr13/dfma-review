# Pocket-edges set

Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name. Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/pocket_edges`. Expected depth and narrowest gap (mm) are checked by `tests/service/test_pocket_edges.py`.

Part · what it tests · faces by class · depth · narrowest · floor pieces
- `c01_plain` · 50 x 30 x 12 pocket, corner R6 (control) · 14: 9, 24: 6 · 12 · 30 · 1
- `ch_top_0p5` · the same with a 0.5 x 45 deg chamfer round its top edge (depth still 12) · 0: 8, 14: 9, 24: 6 · 12 · 30 · 1
- `ch_top_1p0` · the same with a 1.0 x 45 deg chamfer round its top edge (depth still 12) · 0: 8, 14: 9, 24: 6 · 12 · 30 · 1
- `ch_top_2p0` · the same with a 2.0 x 45 deg chamfer round its top edge (depth still 12) · 0: 8, 14: 9, 24: 6 · 12 · 30 · 1
- `fl_top_r1` · the same with an r1 fillet round its top edge (depth still 12) · 14: 9, 23: 8, 24: 6 · 12 · 30 · 1
- `fl_top_r2` · the same with an r2 fillet round its top edge (depth still 12) · 14: 9, 23: 8, 24: 6 · 12 · 30 · 1
- `ch_top_sharp` · 50 x 30 x 12 pocket, sharp corners, 1 x 45 deg top chamfer · 0: 4, 14: 5, 24: 6 · 12 · 30 · 1
- `boss_gap_1p27` · 50 x 30 x 12 pocket, corner R6, a d8 round boss 1.27 mm from its -X wall · 14: 10, 24: 7 · 12 · 1.27 · 1
- `boss_gap_4p0` · 50 x 30 x 12 pocket, corner R6, a d8 round boss 4 mm from its -X wall · 14: 10, 24: 7 · 12 · 4 · 1
- `boss_pair` · 50 x 30 x 12 pocket, two d8 bosses 2 mm apart · 14: 11, 24: 8 · 12 · 2 · 1
- `split_obround` · closed slot-shaped pocket 46 x 16 x 12 built as a box and two round ends (floor in 5 pieces) · 16: 10, 24: 6 · 12 · 16 · 5
