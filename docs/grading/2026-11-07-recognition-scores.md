# Recognition scores: holes and pockets (grading spike, 2026-11-07)

Measured on `main` c0adf63 with `tests/grading/grade.py` (tests: `tests/service/test_grading.py`). Test files are in the git-ignored `tests/grading/.cache/`, not committed. Every number below comes from a run in this session; estimates are labelled.

## Sets

- **Quiddity's MFCAD++ subset** (github.com/pzfreo/quiddity-python, Apache-2.0, `tests/corpus/mfcadpp`): **40 parts**, not 41 (the 41st file is `MANIFEST.json`). MFCAD++ is CC BY, DOI 10.17034/d1fec5a0-8c10-4630-b02e-b92dc81df823. The subset was chosen for chamfers, triangular pockets, triangular blind steps, 6-sided passages and 2-sided through steps (MANIFEST `rule.targets`), so it holds few holes.
- **First 500 MFCAD++ test parts:** not run. The only download (pure.qub.ac.uk) answers with a Cloudflare "Just a moment..." check, and the Hugging Face mirror `AI4Manufacturing/mfcadpp` is gated (manual approval). Needs Morgan's choice.
- **Analysis Situs** (gitlab.com/ssv/AnalysisSitus, BSD-3, `tests/feature-recognition`): 19 hole cases, 36 cavity cases, 53 data files.

## Join checks

- MFCAD++: for all 40 parts, our face count equals the file's ADVANCED_FACE count, our face i is the file's face i, each face's STEP entity name equals its label, and a second reader saw the same face kinds (`checks_true` 40/40/40/40).
- Analysis Situs ids are 1-based MapShapes order over the whole shape: on `recognize-holes/A03` (refFids {5 7}) faces 5 and 7 are the two cylinders of our two holes.

## Scores

MFCAD++ subset, face recall per class (faces we put in the matching kind / labelled faces):

- Class 1 through hole: 16 of 22 (72.7%). Class 12 blind hole: 20 of 27 (74.1%). Every found hole also got the right type.
- Class 13 triangular pocket 52 of 61 (85.2%); 14 rectangular 70 of 103 (68.0%); 15 6-sided 56 of 77 (72.7%); 16 circular end 100 of 114 (87.7%).
- All holes 36 of 49 (73.5%); all pockets 278 of 355 (78.3%).
- Precision: through 16/16, blind 20/20, pocket 278/278 (100%). Not scored (excluded labels): 17 O-ring faces (class 11) we called through holes; 5 class 18 blind-slot faces we called a pocket.
- Context, not comparable: Quiddity's own 500-part run finds 234/239 through-hole and 177/363 blind-hole faces (`docs/benchmarks/effectiveness-mfcadpp-500-0.5.0.md:29-31`).

Analysis Situs:

- Holes, our whole hole face sets: exact on 2 of 19 cases (A02, A16); faces precision 354/372 (95.2%), recall 354/501 (70.7%).
- Cavities, our holes plus pockets: exact on 5 of 36 (A18, B04, B07, B11, B14; 1 file, B02, has no solid we can read); precision 1,100/1,227 (89.6%), recall 1,100/2,151 (51.1%). Pockets alone: recall 223/2,151 (10.4%).

## Misses by cause

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

## Ranked changes (expected effects are estimates: upper bounds on these sets)

1. **Let a pocket floor's outline be broken by other features.** Accept a floor when concave perpendicular walls close it except where the outline meets another feature at a convex edge. Up to 68 of 77 missed pocket faces: recall 78.3% to at most 97.5% on the subset. Risk: open slots and steps read as pockets, so precision (100% now) can fall; test on blind slots and steps. S5 needs this for holes through pocket floors.
2. **Accept holes cut by other features.** Replace the 359-deg test with coaxial patches covering at least half a turn in one axial run, keeping Quiddity's guard against fillets and slot end caps. Up to 13 faces: hole recall 73.5% to at most 100% on the subset; 4 cylinders on Analysis Situs.
3. **Keep entry chamfers, countersinks and entry fillets with their hole.** Link coaxial cones and tori at an open end to the hole as its own named feature (the backlog's hole types), not as hole faces: MFCAD++ labels chamfers class 0, so merging would cost precision there. Up to 125 of 147 missed Analysis Situs hole faces: recall 70.7% to at most 95.6%.
4. **Let a chamfer or slope sit between pocket floor and wall.** 9 faces in 2 parts on the subset.
5. **Stop calling O-ring grooves through holes** (17 faces, not scored): an internal groove check exists for linked segments (`features.py:274-275`); grooves between two coaxial cylinders need it too. Fits S6 (turning).
