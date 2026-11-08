# Undercuts set

Made by `make.py` (run it to rebuild). Labels: MFCAD++ classes in each face's STEP name. Score: `python tests/grading/grade.py mfcadpp tests/grading/sets/undercuts`. Expected pockets and depth (mm) are checked by `tests/service/test_undercuts.py`.

Part · what it tests · faces by class · pockets · depth
- `ts_through` · T-slot along X through the block: neck 10 x 10, head 18 x 6 (not a pocket) · 6: 7, 24: 7 · 0 · -
- `ts_blind` · the same T-slot, open at -X, square end at x = 70 (not a pocket) · 17: 9, 24: 6 · 0 · -
- `ts_blind_round` · the same T-slot with a round end, as the cutters leave it (not a pocket) · 18: 16, 24: 6 · 0 · -
- `ts_two` · two through T-slots 36 apart, as on a fixture plate (not pockets) · 6: 14, 24: 8 · 0 · -
- `dt_through` · 60 deg dovetail along X through the block, 12 wide at the top, 8 deep (not a pocket) · 6: 3, 24: 7 · 0 · -
- `dt_blind` · the same dovetail, open at -X, square end at x = 70 (not a pocket) · 17: 4, 24: 6 · 0 · -
- `pk_lip` · pocket 50 x 30 x 12 under a 2 mm lip: the top 3 mm open 46 x 26 (one pocket, depth 12) · 14: 10, 24: 6 · 1 · 12
- `pk_groove` · pocket 50 x 30 x 12 with a 2 mm deep, 3 mm tall undercut groove round its floor (one pocket, depth 12) · 14: 11, 24: 6 · 1 · 12
- `ts_closed` · the T-slot closed at both ends, x 20 to 80 (a T-bolt pocket: one pocket with an undercut each side, depth 16) · 14: 11, 24: 6 · 1 · 16
- `pk_control` · plain pocket 50 x 30 x 12, sharp corners (control) · 14: 5, 24: 6 · 1 · 12
