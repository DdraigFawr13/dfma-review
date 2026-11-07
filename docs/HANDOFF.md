# Handoff

Updated: 2026-11-07. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. Brainstorm (D-001), bootstrap (D-002, #1), design (D-003 to D-006) and the first-version spec (D-007, [docs/specs/first-version.md](specs/first-version.md)) are merged in [#2](https://github.com/DdraigFawr13/dfma-review/pull/2). S1 (read and view) merged in [#3](https://github.com/DdraigFawr13/dfma-review/pull/3), approved by Morgan 2026-11-06. S2 (holes) approved by Morgan 2026-11-06 ("otherwise I approve of this phase") and merged in [#4](https://github.com/DdraigFawr13/dfma-review/pull/4). S3 (pockets) approved by Morgan 2026-11-06 (D-015) and merged in [#6](https://github.com/DdraigFawr13/dfma-review/pull/6). S4 (thin walls, thin material at holes, finding pins) approved by Morgan 2026-11-07 ("you can push and merge s4", D-016, D-017) and merged in [#7](https://github.com/DdraigFawr13/dfma-review/pull/7). Grading spike approved by Morgan 2026-11-07 ("Merge, then start") and merged in [#8](https://github.com/DdraigFawr13/dfma-review/pull/8). Next: recognition rounds (D-018) on a new branch, then S5.

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ✔ Spec the first usable version (D-007, 6 fresh checks, $1.49).
- ▶ Build slice by slice: ✔ S1 read and view · ✔ S2 holes · ✔ S3 pockets · ✔ S4 thin walls · ✔ grading spike (#8) · ▶ recognition rounds (D-018) · S5 machine and setups · S6 turning · S7 report and PDF.
- ○ Assemblies and DFA · history and compare · time and $.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-07 Round 3 (D-018) on `recognition-round1` (PR #9): the cut-floor probe starts 0.01 mm past and below the edge, not 0.05 (an O-ring groove 0.04 mm deeper than a floor, a passage corner that nicks it); the step into a face tries 0.05, 0.01, 0.002 mm (floor slivers); a sloped chamfer between floor and wall leads to its wall (edges parallel) and is not a pocket face; a planar wall turning the same angle to both neighbour walls, under 59.5 deg, is a corner chamfer, not a wall (hexagon sides turn 60). 500 parts: pockets missed 176 -> 94 (target 93), wrong 10 -> 1, slots 40, O-ring 16; holes unchanged (12, 0). Check set pockets missed 244 -> 123, wrong 6 -> 1. `tests/service/test_round3_pockets.py` (4 of 5 fail on round 2). Checks: 279 service, 5 unit, 11 browser.
- 2026-11-07 Round 2 (D-018) on `recognition-round1` (PR #9): coaxial same-radius cylinder pieces whose heights overlap join into one hole; a hole that never goes all the way round counts at 189 deg or more (`HALF_TURN_DEG`, as Quiddity); a bottom must lie within the hole's radius, and a flat bottom cut by another feature still counts; a hole ending on a flat ring round a raised core on its axis (`_core`, directly or through a chamfer cone) is an O-ring groove. 500 parts: holes missed 66 -> 12 (target 14: met), wrong 1 -> 0, O-ring as hole 208 -> 16; check set holes missed 80 -> 22, wrong 21 -> 0. `tests/service/test_cut_holes.py` (2 of 4 fail on round 1). Checks: 274 service, 5 unit, 11 browser. [Page](https://claude.ai/artifact/YAAEriC8gktJkGi5VtNvhq) v4.
- 2026-11-07 Round 1 (D-018) on `recognition-round1`: a pocket floor edge with no wall counts when the gap past it is closed all round (5 in-plane rays from just below the floor must hit the part); walls all on one axis are a groove or hole, not a pocket. 500 parts: pocket misses 540 -> 176, wrong 9 -> 10; check set 646 -> 258, wrong 6 -> 6. Holes unchanged (66 missed). `tests/service/test_cut_pockets.py` (2 of 6 fail on main). Checks: 270 service, 5 unit, 11 browser.
- 2026-11-07 Grading spike on `grading-spike` (draft PR): `tests/grading/grade.py` + `child.py` (one OpenCascade process per file), 10 tests in `tests/service/test_grading.py`; report [docs/grading/2026-11-07-recognition-scores.md](grading/2026-11-07-recognition-scores.md), phone page [Recognition Scorecard](https://claude.ai/artifact/NZmuRmB68Cg1uutBtRNDjB). Quiddity subset is 40 parts (not 41); face order matched on all 40. Subset face recall: holes 36/49 (73.5%), pockets 278/355 (78.3%), precision 100%. Analysis Situs: holes 354/501 found, 354/372 right; cavities 1,100/2,151 found. 90 MFCAD++ misses: pocket floor cut by another feature 68, hole cut by another feature 13, floor-to-wall chamfer 9. Ranked changes on the page. Test files in git-ignored `tests/grading/.cache/` (clone Quiddity, sparse-clone Analysis Situs; commands in grade.py's docstring).
- 2026-11-07 S4 approved and merged (#7): walls, thin material at holes (D-016), walls box off, finding pins with the selected pin in its severity colour (D-017). Checks: 250 service, 5 unit, 11 browser.
- 2026-11-07 S4 fresh review (96,088 tokens): 0 high, 5 medium, 4 low; fixed 4 with tests (rays start on the hole face, one wall per pair of holes, bounded points and guarded booleans, 4-place title at the limit); 3 declined with evidence (spec S4 Settled). Scorecards vs main: NIST 690 → 1,340, EDMR 1,090 → 3,110; slowest file 6.44 s.
- 2026-11-07 S4 built on `s4-thin-walls` (#7, draft): walls (opposed planar pairs, overlap ≥10 mm², ray test for material between; the spec's midpoint test found 0 walls on a plain block, spec Features "Wall" updated), `thin_wall` rule (mill and turn), 4 test parts, wall counts on every expected entry, legend row "Walls checked, no finding" (`--ok-wall` #6b5d4f). Zero-decision check on d6502d4: builder defaults in spec S4 "Settled at build". Checks fail first: 27 of 28 J3 tests fail on main. Scorecards: NIST features 690 → 1,227, EDMR 1,090 → 2,345, none worse; max 3.94 s / 5.22 s. Mock-up [wall legend](https://claude.ai/artifact/JaEjos5QQvY7cbRVHwWpH2) (`mockups/wall-legend.html`, real screenshots; fresh check 73,109 tokens, 3 fixes) answered.
- 2026-11-07 D-016 (Morgan: "Go with recommended"): walls box off by default; thin material at holes added to S4 (around a hole's side and under a drill point, measured up to 0.250 in): `hole_walls()`, parts `thin_drill_point`, `hole_near_edge`, `holes_close`. Scorecards vs main: NIST features 690 → 1,351, EDMR 1,090 → 3,119, none worse; slowest file 6.72 s.
- 2026-11-06 NIST gold standard (D-011): Morgan chose to keep the files in GitHub untouched. `tests/nist/NIST-PMI-STEP-Files.zip` (NIST's file byte for byte, SHA-256 checked), `tests/nist/SOURCE.md`, `tests/nist_files.py` (unpacks to the git-ignored `tests/nist/.cache/`), `tests/nist/scorecard.toml` + `make_scorecard.py`, `tests/service/test_nist.py` (17 files read under 10 s, faces not analysed may only fall, features may only rise). `scripts/check.py` all pass: 32 service, 5 unit, 2 browser. Open: ctc_05 reads as units `other`.
- 2026-11-06 Phone pages for Morgan: [S1 status](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu), [view-only demo](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) (real viewer, test parts analysed in advance; refresh after each slice).

## Next

1. Done 2026-11-07: 500-part MFCAD++ run from Morgan's Drive copy (QUB zip, 1,615,810,586 bytes; test split unpacked to `tests/grading/.cache/mfcadpp/`). Face recall holes 536/602 (89.0%), pockets 3,205/3,745 (85.6%), precision 99.8% / 99.7%; 545 of 606 misses are features cut by another feature. Morgan can turn off the Drive link sharing. The Hugging Face access request is still open; not needed now.
2. Done 2026-11-07 (Morgan asked for all three tools on all parts): [head-to-head page](https://claude.ai/artifact/YAAEriC8gktJkGi5VtNvhq) v2, all through `grade.py --engine`. On 500 parts holes found 536 / 586 / 530 of 602 (ours / Quiddity / Analysis Situs), pockets 3,205 / 3,352 / 3,641 of 3,745; we make the fewest wrong calls. v1 of the page compared unlike numbers (LESSONS "reports" x2, now an AGENTS.md rule). Envs in git-ignored `tests/grading/.cache/`: `qenv` (Quiddity), `as-env77` + `as-build/build/as_recognize` (OCCT 7.7.2; 7.8+ fails on the old hasher API).
3. Next, in a fresh session (Morgan, 2026-11-07: "finish round the holes here then start a new session"): round 3+ toward D-018 on the 500 parts: pockets missed 176 -> <=93; wrong calls to 0 (10 chamfer faces in pockets, 16 O-ring faces as holes, 40 slot/step faces as pockets); read `13975.step` (no solid found; Quiddity and Analysis Situs read it). Each round: `python tests/grading/grade.py mfcadpp <test dir> --limit 500` and `--skip 500 --limit 500`, `python tests/grading/summary.py <out>.json`, then republish the head-to-head page (its source is not in the repo: rebuild from the last version, Artifact read). A fresh container has no `tests/grading/.cache/`: fetch MFCAD++ from Morgan's Drive share (file id `1oUEB_d-gN64i4lfXYIaFEJVKWOqzE6pz`, `drive.usercontent.google.com/download?id=...&export=download&confirm=t`, 1,615,810,586 bytes; unpack `MFCAD++_dataset/step/test/*.step` only), `git clone --depth 1 https://github.com/pzfreo/quiddity-python` for the 40-part subset, and the Analysis Situs cases as in the report. The others' numbers are fixed: totals in [the report](grading/2026-11-07-recognition-scores.md) and on the page; rerun only ours. Then S5. Ranked recognition changes (page and report): pockets with cut floors first, since S5 needs holes through pocket floors. Each change is a decision for Morgan before building (WS-02).
4. NIST library merged in [#5](https://github.com/DdraigFawr13/dfma-review/pull/5) (069ef55).
5. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Settled 2026-11-07: labels are pins (D-017); the scoring spike runs in a new session before S5 (Morgan: "We do the grading and testing in a new session before s5"). Research totals: 384,128 agent tokens (methods, labels, GitHub). S4 took 1 h 58 min to the first approval ask, $6.19 main session.
- Backlog (Morgan, 2026-11-06): name each hole's type (through, blind, counterbore, countersink, drill point, threaded); recognise threads modelled as ring faces (NIST FTC 10's threaded hole is missed); catalogue NIST resources and commit the papers (research agents running).

- Nice to haves after the project is complete (Morgan, 2026-11-06), from the [research page](https://claude.ai/artifact/S2TDMa3VjXmz4AD7kUt1zm): waivers per finding, shop profiles, change review (rev A vs B, thinnest wall and smallest corner re-measured), comments and sign-off per finding, FMEA row export.

- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).
- Which CAD exports the test STEP files (Inventor version): unknown; public models first.

## Brainstorm trial (master D-048)

- 2026-11-06: 4 concepts; dropped with reasons: yes; kill criteria: yes; rounds: 1; measured agent cost $0.74; measure 2 (design round 1 asked nothing the brief answered): yes, every question came from the brief's open list; measure 3 (concept survived design unchanged): yes (Morgan, 2026-11-06: "Yes").

## Decisions since the last plan update

- 2026-11-07 D-018: grading sets are the recognition gold standard; target 10% fewer misses than the best other tool, 0 wrong calls.
- 2026-11-06 Concept chosen (D-001). Full master setup with web-app layer (D-002).
- 2026-11-06 S1 build: extra packages and micromamba (D-008); slices shown as status page + demo (D-009); S1 merge approved.
- 2026-11-06 First-version scope (D-003), stack (D-004), rules and units (D-005), company-move gates (D-006), spec approved (D-007).
