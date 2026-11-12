# Steps and slots set

Made by `make.ts` (`node web/scripts/make-set.mjs steps_slots` rebuilds it). Labels: MFCAD++ classes in each face's STEP name. Score: `node web/scripts/grading.mjs grade mfcadpp tests/grading/sets/steps_slots`. Checks: `web/src/engine/port/steps_slots.test.ts`. INSTANCES.json lists each step's and slot's faces. Block 100 x 60 x 30 mm, top at z = 30, sizes in mm.

Part · what it tests · faces by class · expected
- `st_through` · step 15 wide (y 0-15), 10 deep, along the whole X length · 8: 2, 24: 6 · 1 step
- `st_l` · L step at the +X -Y corner, 20 x 15, 10 deep, walls meeting in a 3 mm radius · 22: 4, 24: 6 · 1 step, 1 corner (r3)
- `st_deep` · L step at the -X +Y corner, 10 x 8, 20 deep, walls meeting in a 1 mm radius · 22: 4, 24: 6 · 1 step, 1 corner (r1)
- `st_stair` · two through steps: 10 deep (y 15-30) and 20 deep (y 0-15) · 8: 4, 24: 6 · 2 steps
- `st_fillet` · st_through with a 2 mm fillet between floor and wall · 8: 3, 24: 6 · 1 step
- `st_blind_rect` · an L corner notch 20 x 15, 10 deep, at the -X -Y corner, sharp · 22: 3, 24: 6 · 1 step, 1 sharp corner
- `st_blind_round` · a quarter-round corner notch, radius 15, 10 deep, at the -X -Y corner · 21: 2, 24: 6 · 1 step
- `st_blind_tri` · a triangular corner notch, 10 deep, at the -X -Y corner (one wall) · 20: 2, 24: 6 · 1 step
- `st_face` · the top lowered 5 mm over x 0-60, leaving one wall at x = 60 · 8: 2, 24: 6 · 1 step
- `sl_blind_round` · slot 10 wide, 8 deep, from x = 40 out through +X, round end r5 · 18: 6, 24: 6 · 1 slot (S2); no step
- `sl_blind` · slot 10 wide, 8 deep, from x = 40 out through +X, flat end, sharp corners · 17: 4, 24: 6 · 1 slot (S2); no step
- `sl_through` · slot 10 wide, 8 deep, along the whole X length · 6: 3, 24: 7 · 1 slot (S2); no step
- `sl_deep` · through slot 4 wide, 26 deep, along X · 6: 3, 24: 7 · 1 slot (S2); no step
- `st_chamfer` · a 45 deg 5 mm chamfer on the top edge at y = 0 (not a step) · 0: 1, 24: 6 · no step
- `pk_beside_step` · pocket 40 x 10, 16 deep, closed at +X by a short wall (z 14-20) over a blind step's floor (D-019) · 14: 5, 22: 4, 24: 6 · 1 pocket, unchanged
- `pk_control` · plain pocket 50 x 30 x 12, sharp corners (control) · 14: 5, 24: 6 · 1 pocket, unchanged
- `sl_angled` · slot 8 wide, 6 deep, along X in a face tilted 20 deg about X (no call) · 6: 3, 24: 7 · no step, no slot
- `vg_through` · 90 deg V-groove along X, 16 wide at the top, 8 deep (no call) · 5: 2, 24: 7 · no step, no slot
