# Handoff

Updated: 2026-11-06. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. Brainstorm (D-001), bootstrap (D-002, #1), design (D-003 to D-006) and the first-version spec (D-007, [docs/specs/first-version.md](specs/first-version.md)) are merged in [#2](https://github.com/DdraigFawr13/dfma-review/pull/2). S1 (read and view) merged in [#3](https://github.com/DdraigFawr13/dfma-review/pull/3), approved by Morgan 2026-11-06. S2 (holes) approved by Morgan 2026-11-06 ("otherwise I approve of this phase") and merged in [#4](https://github.com/DdraigFawr13/dfma-review/pull/4). S3 (pockets) approved by Morgan 2026-11-06 ("Ok approved you can do the pr and merge go with your recommendations", D-015) and merged in [#6](https://github.com/DdraigFawr13/dfma-review/pull/6). Next: S4 (thin walls), in a new session.

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

- 2026-11-06 S3 approved (D-015), merged in #6. Mock-up v3 used real-viewer screenshots (v1 sketch: "terrible and unrealistic"); selection got a 40% minimum frame and sharp corners as an edge bar (`edge_mm`). Fresh review (93,501 tokens): 2 medium fixed test-first (pocket rules ran for turning; plane-to-arc sharp corners missed), 3 low fixed, 3 declined, 1 deferred to S5. Checks: 221 service, 5 unit, 7 browser; NIST max 3.98 s. [Status](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu), [demo](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) updated.
- 2026-11-06 S2 approved and merged (#4). Colour legend with a checkbox per feature kind (D-014; holes on by default). NIST research: papers (R3 Appendix A lists FTC 6/8/9 features with sizes: answer key; FTC 6, 8, 9 designed in inches, so D-013 holds); fork `engineering-design-models` (16 GB, ~2,399 AP203 STEP, no PMI; best for features: UMD, STEP/STI, PTC mfgmill18; third-party rights unstated); usnistgov/SFA is the AP242 PMI reference.
- 2026-11-06 NIST gold standard (D-011): Morgan chose to keep the files in GitHub untouched. `tests/nist/NIST-PMI-STEP-Files.zip` (NIST's file byte for byte, SHA-256 checked), `tests/nist/SOURCE.md`, `tests/nist_files.py` (unpacks to the git-ignored `tests/nist/.cache/`), `tests/nist/scorecard.toml` + `make_scorecard.py`, `tests/service/test_nist.py` (17 files read under 10 s, faces not analysed may only fall, features may only rise). `scripts/check.py` all pass: 32 service, 5 unit, 2 browser. Open: ctc_05 reads as units `other`.
- 2026-11-06 Morgan added a setup script to the "Network" environment: micromamba at `/opt/micromamba/bin/micromamba`, env at `/opt/mamba/envs/dfma` (fresh containers only; checked with get_environment).
- 2026-11-06 Phone pages for Morgan: [S1 status](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu), [view-only demo](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) (real viewer, test parts analysed in advance; refresh after each slice).

## Next

1. S4 (thin walls) in a new session, from `main`: `write-spec` step 8 (zero-decision re-check of S4's sections against the merged S3 code, including spec Flow's per-process rule list), checks fail first, build, show per D-009. S4 adds a "Walls checked" legend row (D-014): mock-up with real-viewer screenshots, not a sketch (LESSONS). Carry: S5 must make a hole end on a pocket floor take the floor normal; engraved lettering on NIST parts reads as pockets (assumption in the app).
2. NIST library merged in [#5](https://github.com/DdraigFawr13/dfma-review/pull/5) (069ef55).
3. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

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
