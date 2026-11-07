# Handoff

Updated: 2026-11-07. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. Brainstorm (D-001), bootstrap (D-002, #1), design (D-003 to D-006) and the first-version spec (D-007, [docs/specs/first-version.md](specs/first-version.md)) are merged in [#2](https://github.com/DdraigFawr13/dfma-review/pull/2). S1 (read and view) merged in [#3](https://github.com/DdraigFawr13/dfma-review/pull/3), approved by Morgan 2026-11-06. S2 (holes) approved by Morgan 2026-11-06 ("otherwise I approve of this phase") and merged in [#4](https://github.com/DdraigFawr13/dfma-review/pull/4). S3 (pockets) approved by Morgan 2026-11-06 ("Ok approved you can do the pr and merge go with your recommendations", D-015) and merged in [#6](https://github.com/DdraigFawr13/dfma-review/pull/6). S4 (thin walls) in progress on branch `s4-thin-walls`, draft [#7](https://github.com/DdraigFawr13/dfma-review/pull/7).

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ✔ Spec the first usable version (D-007, 6 fresh checks, $1.49).
- ▶ Build slice by slice: ✔ S1 read and view · ✔ S2 holes · ✔ S3 pockets · ▶ S4 thin walls · S5 machine and setups · S6 turning · S7 report and PDF.
- ○ Assemblies and DFA · history and compare · time and $.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-07 S4 fresh review (96,088 tokens): 0 high, 5 medium, 4 low; fixed 4 with tests (rays start on the hole face, one wall per pair of holes, bounded points and guarded booleans, 4-place title at the limit); 3 declined with evidence (spec S4 Settled). Scorecards vs main: NIST 690 → 1,340, EDMR 1,090 → 3,110; slowest file 6.44 s.
- 2026-11-07 S4 built on `s4-thin-walls` (#7, draft): walls (opposed planar pairs, overlap ≥10 mm², ray test for material between; the spec's midpoint test found 0 walls on a plain block, spec Features "Wall" updated), `thin_wall` rule (mill and turn), 4 test parts, wall counts on every expected entry, legend row "Walls checked, no finding" (`--ok-wall` #6b5d4f). Zero-decision check on d6502d4: builder defaults in spec S4 "Settled at build". Checks fail first: 27 of 28 J3 tests fail on main. Scorecards: NIST features 690 → 1,227, EDMR 1,090 → 2,345, none worse; max 3.94 s / 5.22 s. Mock-up [wall legend](https://claude.ai/artifact/JaEjos5QQvY7cbRVHwWpH2) (`mockups/wall-legend.html`, real screenshots; fresh check 73,109 tokens, 3 fixes) answered.
- 2026-11-07 D-016 (Morgan: "Go with recommended"): walls box off by default; thin material at holes added to S4 (around a hole's side and under a drill point, measured up to 0.250 in): `hole_walls()`, parts `thin_drill_point`, `hole_near_edge`, `holes_close`. Scorecards vs main: NIST features 690 → 1,351, EDMR 1,090 → 3,119, none worse; slowest file 6.72 s.
- 2026-11-06 S3 approved (D-015), merged in #6. Mock-up v3 used real-viewer screenshots (v1 sketch: "terrible and unrealistic"); selection got a 40% minimum frame and sharp corners as an edge bar (`edge_mm`). Fresh review (93,501 tokens): 2 medium fixed test-first (pocket rules ran for turning; plane-to-arc sharp corners missed), 3 low fixed, 3 declined, 1 deferred to S5. Checks: 221 service, 5 unit, 7 browser; NIST max 3.98 s. [Status](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu), [demo](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) updated.
- 2026-11-06 S2 approved and merged (#4). Colour legend with a checkbox per feature kind (D-014; holes on by default). NIST research: papers (R3 Appendix A lists FTC 6/8/9 features with sizes: answer key; FTC 6, 8, 9 designed in inches, so D-013 holds); fork `engineering-design-models` (16 GB, ~2,399 AP203 STEP, no PMI; best for features: UMD, STEP/STI, PTC mfgmill18; third-party rights unstated); usnistgov/SFA is the AP242 PMI reference.
- 2026-11-06 NIST gold standard (D-011): Morgan chose to keep the files in GitHub untouched. `tests/nist/NIST-PMI-STEP-Files.zip` (NIST's file byte for byte, SHA-256 checked), `tests/nist/SOURCE.md`, `tests/nist_files.py` (unpacks to the git-ignored `tests/nist/.cache/`), `tests/nist/scorecard.toml` + `make_scorecard.py`, `tests/service/test_nist.py` (17 files read under 10 s, faces not analysed may only fall, features may only rise). `scripts/check.py` all pass: 32 service, 5 unit, 2 browser. Open: ctc_05 reads as units `other`.
- 2026-11-06 Morgan added a setup script to the "Network" environment: micromamba at `/opt/micromamba/bin/micromamba`, env at `/opt/mamba/envs/dfma` (fresh containers only; checked with get_environment).
- 2026-11-06 Phone pages for Morgan: [S1 status](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu), [view-only demo](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) (real viewer, test parts analysed in advance; refresh after each slice).

## Next

1. S4: waiting on Morgan's approval ([status](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu), [demo](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) updated 2026-11-07, 26 parts in 4 materials); then finish per GIT-08 and start S5. Carry: S5 must make a hole end on a pocket floor take the floor normal; engraved lettering on NIST parts reads as pockets (assumption in the app).
2. NIST library merged in [#5](https://github.com/DdraigFawr13/dfma-review/pull/5) (069ef55).
3. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Morgan (2026-11-07), before S5: workshop the finding labels ("not clearly indicating what they are attached to … floating randomly" with many tags) and research better feature-recognition methods (equations, efficiency; possible code review). Research agents started 2026-11-07; S4 approval not yet given. S4 took 1 h 58 min of session time, $6.19 main session plus 314,815 agent tokens.
- Backlog (Morgan, 2026-11-06): name each hole's type (through, blind, counterbore, countersink, drill point, threaded); recognise threads modelled as ring faces (NIST FTC 10's threaded hole is missed); catalogue NIST resources and commit the papers (research agents running).

- Nice to haves after the project is complete (Morgan, 2026-11-06), from the [research page](https://claude.ai/artifact/S2TDMa3VjXmz4AD7kUt1zm): waivers per finding, shop profiles, change review (rev A vs B, thinnest wall and smallest corner re-measured), comments and sign-off per finding, FMEA row export.

- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).
- Which CAD exports the test STEP files (Inventor version): unknown; public models first.

## Brainstorm trial (master D-048)

- 2026-11-06: 4 concepts; dropped with reasons: yes; kill criteria: yes; rounds: 1; measured agent cost $0.74; measure 2 (design round 1 asked nothing the brief answered): yes, every question came from the brief's open list; measure 3 (concept survived design unchanged): yes (Morgan, 2026-11-06: "Yes").

## Decisions since the last plan update

- 2026-11-06 Concept chosen (D-001). Full master setup with web-app layer (D-002).
- 2026-11-06 S1 build: extra packages and micromamba (D-008); slices shown as status page + demo (D-009); S1 merge approved.
- 2026-11-06 First-version scope (D-003), stack (D-004), rules and units (D-005), company-move gates (D-006), spec approved (D-007).
