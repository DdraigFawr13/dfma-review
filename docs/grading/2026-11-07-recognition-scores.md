# Recognition scores: holes and pockets (grading spike, 2026-11-07)

Measured on `main` c0adf63 with `tests/grading/grade.py` (tests: `tests/service/test_grading.py`). Test files are in the git-ignored `tests/grading/.cache/`, not committed. Every number below comes from a run in this session; estimates are labelled.

## Sets

- **Quiddity's MFCAD++ subset** (github.com/pzfreo/quiddity-python, Apache-2.0, `tests/corpus/mfcadpp`): **40 parts**, not 41 (the 41st file is `MANIFEST.json`). MFCAD++ is CC BY, DOI 10.17034/d1fec5a0-8c10-4630-b02e-b92dc81df823. The subset was chosen for chamfers, triangular pockets, triangular blind steps, 6-sided passages and 2-sided through steps (MANIFEST `rule.targets`), so it holds few holes.
- **First 500 MFCAD++ test parts** (lexical order, `1000.step` to `12832.step`), the sample Quiddity used. The QUB download answers scripts with a Cloudflare check, so Morgan downloaded `MFCAD_dataset.zip` in a browser and shared it from Google Drive (1,615,810,586 bytes; 8,949 test STEP files, as its readme says). Our class totals equal Quiddity's (239 through-hole, 363 blind-hole, 907 rectangular-pocket faces), so the sample is the same.
- **Analysis Situs** (gitlab.com/ssv/AnalysisSitus, BSD-3, `tests/feature-recognition`): 19 hole cases, 36 cavity cases, 53 data files. Each case's `refFids` are the face ids Analysis Situs itself returns (its test runner fails on any difference, `tests/feature-recognition/recognize-holes/begin`), so Analysis Situs scores 100% on them by design: they measure how close we are to its rules, not who is more accurate.

## Join checks

- MFCAD++ 500: face counts, entity names and face kinds agree on all 500; our face order differs from the file's on 1 part (`11251.step`), which is why labels are joined through each face's entity name, not by position.
- MFCAD++ subset: for all 40 parts, our face count equals the file's ADVANCED_FACE count, our face i is the file's face i, each face's STEP entity name equals its label, and a second reader saw the same face kinds (`checks_true` 40/40/40/40).
- Analysis Situs ids are 1-based MapShapes order over the whole shape: on `recognize-holes/A03` (refFids {5 7}) faces 5 and 7 are the two cylinders of our two holes.

## Scores

MFCAD++ first 500 test parts, face recall per class:

- Class 1 through hole 211 of 239 (88.3%); 12 blind hole 325 of 363 (89.5%). With the right type: 201 and 323.
- Class 13 triangular pocket 664 of 732 (90.7%); 14 rectangular 720 of 907 (79.4%); 15 6-sided 1,015 of 1,133 (89.6%); 16 circular end 806 of 973 (82.8%).
- All holes 536 of 602 (89.0%); all pockets 3,205 of 3,745 (85.6%).
- Precision: through 201/203 (99.0%), blind 323/334 (96.7%), any hole 536/537 (99.8%), pocket 3,205/3,214 (99.7%; the 9 wrong faces are chamfers, class 0).
- Not scored (excluded labels), but they would be wrong findings in the app: 208 O-ring groove faces (class 11) called holes (183 through, 25 blind), and 40 blind-slot faces (classes 17-19) called pockets.
- Beside Quiddity's 500-part run on the same parts (`docs/benchmarks/effectiveness-mfcadpp-500-0.5.0.md:29-33`; their measure is faces of accepted records, close to ours but not identical): through holes 234 vs our 211, blind holes 177 vs 325, rectangular pockets 385 vs 720, 6-sided pockets 828 vs 1,015, circular-end pockets 423 vs 806 (of 239, 363, 907, 1,133, 973).

MFCAD++ subset, face recall per class (faces we put in the matching kind / labelled faces):

- Class 1 through hole: 16 of 22 (72.7%). Class 12 blind hole: 20 of 27 (74.1%). Every found hole also got the right type.
- Class 13 triangular pocket 52 of 61 (85.2%); 14 rectangular 70 of 103 (68.0%); 15 6-sided 56 of 77 (72.7%); 16 circular end 100 of 114 (87.7%).
- All holes 36 of 49 (73.5%); all pockets 278 of 355 (78.3%).
- Precision: through 16/16, blind 20/20, pocket 278/278 (100%). Not scored (excluded labels): 17 O-ring faces (class 11) we called through holes; 5 class 18 blind-slot faces we called a pocket.

Analysis Situs:

- Holes, our whole hole face sets: exact on 2 of 19 cases (A02, A16); faces precision 354/372 (95.2%), recall 354/501 (70.7%).
- Cavities, our holes plus pockets: exact on 5 of 36 (A18, B04, B07, B11, B14; 1 file, B02, has no solid we can read); precision 1,100/1,227 (89.6%), recall 1,100/2,151 (51.1%). Pockets alone: recall 223/2,151 (10.4%).

## Misses by cause

MFCAD++ 500, 606 missed faces in 126 part-class records, sorted by an automated check (the labels of the faces across each failing floor edge, or next to each missed hole face, and whether the hole's cylinder covers under 359 deg); not inspected one by one:

- Pocket outline cut by another feature: 483 faces, 86 records (most often a triangular or 6-sided passage, a through hole, a rectangular passage).
- Hole cut by another feature: 62 faces, 23 records (most often a rectangular or 6-sided passage).
- Chamfer at the pocket floor or wall: 29 faces, 6 records.
- Not explained by the check: 34 faces, 11 records (7 pocket, 4 hole).

MFCAD++ subset, 90 missed faces in 16 part-class records, each inspected (face kinds, neighbours, labels, why the rule failed):

1. **Pocket floor cut by another feature** (68 faces, 9 parts): the floor's outer loop meets a passage, through step, slanted step, O-ring groove, through hole or another pocket at a convex edge. Our rule rejects the floor when any outer edge lacks a concave wall perpendicular to it (`service/dfma/features.py:424-433`, called at `:515-519`).
2. **Hole cut by another feature** (13 faces, 4 parts): passages or pockets remove part of the bore, so no band goes all 360 deg (the largest single patch covers 279 deg). Our rule needs 359 of 360 degree bins (`features.py:198-211`).
3. **Chamfer between pocket floor and wall** (9 faces, 2 parts): the edge to the chamfer is concave but not perpendicular, which `_wall_kind` rejects (`features.py:393-402`).

Analysis Situs holes, 147 missed faces by surface kind: 70 cones, 35 tori, 20 planes, 4 cylinders, 18 not in the solid we read (A18). Their hole sets include coaxial entry cones and tori and ending planes; ours hold cylinders, bottoms and shoulders only (`features.py:332`). The 4 cylinders (A01) are 160-deg patches: cause 2. The 18 false faces: 17 one-face through holes in A01 that Analysis Situs leaves out (the 2 checked are full 360-deg cylinders, r = 11 mm, each between 2 planes); cause not found in the code read; 1 shoulder plane in A03 that we include.

Analysis Situs cavities, 1,051 missed faces by surface kind: 508 planes, 199 cylinders, 118 cones, 99 B-spline ("other"), 95 tori, 32 in other solids (A06 is an assembly). Bucketed by kind only, not inspected one by one. Their cavity is any depression reached through outer-loop neighbours (`AnalysisSitus src/asiAlgo/features/asiAlgo_RecognizeCavitiesRule.cpp:272-283`), so filleted, curved and B-spline cavities count; ours needs a planar floor and perpendicular walls.

## How the other two differ (code read beside ours)

- **Round test.** Quiddity keeps coaxial patches that total at least 1.05 x pi (about 189 deg) in one contiguous axial run, "so fillet faces and slot end caps are excluded ... but a bore split by a slot or keyway still counts" (`quiddity src/quiddity/_cylinder_substrate.py:43`, `:371-392`). Analysis Situs sums the seed and its coaxial neighbours and needs 360 deg within 1 deg (`asiAlgo_RecognizeDrillHolesRule.cpp:337-338`). Ours: 359 bins over the shared height band (`features.py:198-211`).
- **Hole face set.** Analysis Situs takes conical, planar and toroidal neighbours as endings (`asiAlgo_RecognizeDrillHolesRule.cpp:372-380`) and admits coaxial cones and tori (`:440-460`). Quiddity keeps the bore faces plus flat or drill-point bottoms (`holes.py:550`, `:363-364`) and carries countersinks as an attribute, not as faces (`holes.py:551-553`).
- **Pocket boundary.** Quiddity starts from two opposed walls and needs exactly one capped end (`_recess_core.py:429-433`, `:457`), growing the region through concave or smooth arcs (`:686-693`); a floor cut by a passage still has its walls. Analysis Situs grows from a seed through outer-loop neighbours (`asiAlgo_RecognizeCavitiesRule.cpp:272-283`). Ours needs every outer edge of the floor to meet a concave perpendicular wall (`features.py:424-433`).

## Ranked changes (expected effects are estimates: upper bounds on the 500 parts)

1. **Let a pocket's outline be broken by other features.** Accept a floor when concave perpendicular walls close it except where the outline meets another feature at a convex edge. Up to 483 faces: pocket recall 85.6% to at most 98.5%. Risk: open slots and steps read as pockets, so precision (99.7% now) can fall; test on blind slots and steps. S5 needs this for holes through pocket floors.
2. **Accept holes cut by other features.** Replace the 359-deg test with coaxial patches covering at least half a turn in one axial run, keeping Quiddity's guard against fillets and slot end caps. Up to 62 faces: hole recall 89.0% to at most 99.3%.
3. **Stop calling O-ring grooves holes.** 208 groove faces became through or blind holes; in the app each would get hole findings. A groove check exists only for linked segments (`features.py:274-275`). Fits S6 (turning) but costs findings now.
4. **Keep entry chamfers, countersinks and entry fillets with their hole** as linked, named features (the backlog's hole types), not as hole faces, since MFCAD++ labels chamfers class 0. Up to 125 of 147 missed Analysis Situs hole faces: recall 70.7% to at most 95.6%.
5. **Let a chamfer or slope sit between pocket floor and wall.** Up to 29 faces on the 500 (with change 1: pocket recall at most 99.3%).
