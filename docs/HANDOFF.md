# Handoff

Updated: 2026-11-06. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. Brainstorm (D-001), bootstrap (D-002, #1), design (D-003 to D-006) and the first-version spec (D-007, [docs/specs/first-version.md](specs/first-version.md)) are merged in [#2](https://github.com/DdraigFawr13/dfma-review/pull/2). S1 (read and view) merged in [#3](https://github.com/DdraigFawr13/dfma-review/pull/3), approved by Morgan 2026-11-06. S2 (holes) approved by Morgan 2026-11-06 ("otherwise I approve of this phase") and merged in [#4](https://github.com/DdraigFawr13/dfma-review/pull/4). Next: S3 (pockets).

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ✔ Spec the first usable version (D-007, 6 fresh checks, $1.49).
- ▶ Build slice by slice: ✔ S1 read and view · ✔ S2 holes · ▶ S3 pockets · S4 thin walls · S5 machine and setups · S6 turning · S7 report and PDF.
- ○ Assemblies and DFA · history and compare · time and $.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-06 S3 started on `s3-pockets` from 069ef55 (#5 merged). Baseline `scripts/check.py` all pass (193 service, 5 unit, 5 browser). Zero-decision re-check of S3 running. Side research for Morgan: DRC, DFMEA and shop review ideas ([page](https://claude.ai/artifact/S2TDMa3VjXmz4AD7kUt1zm), `docs/research/drc-dfmea-shop-review.html`; agent 126,996 tokens): keep waivers, shop profiles, change review, comments/sign-off for later phases; avoid auto FMEA scoring and AI. Asked Morgan whether to note them on those phases.
- 2026-11-06 S2 approved and merged (#4). Colour legend with a checkbox per feature kind (D-014; holes on by default). NIST research: papers (R3 Appendix A lists FTC 6/8/9 features with sizes: answer key; FTC 6, 8, 9 designed in inches, so D-013 holds); fork `engineering-design-models` (16 GB, ~2,399 AP203 STEP, no PMI; best for features: UMD, STEP/STI, PTC mfgmill18; third-party rights unstated); usnistgov/SFA is the AP242 PMI reference.
- 2026-11-06 S2 fresh spec review (97,816 tokens): 8 real gaps fixed with tests that fail on the old code, 1 stale. Manual CI [run 23](https://github.com/DdraigFawr13/dfma-review/actions/runs/42297731665) green in 1 min 32 s on b93c519. Status and demo pages updated for S2.
- 2026-11-06 S2 built: checks written first and failed on S1 code (24 service, 2 browser); then `features.py` (holes), `tools.py` (drills), `rules/hole_depth.py`, `rules/hole_size.py`, `config/*.toml`, review screen (layout 4, IBM Plex shipped, OFL). D-013 (Morgan): mm files accept inch drills too; NIST ftc_09 hole-size findings 27 → 2. NIST: 491 holes found in 17 files.
- 2026-11-06 Morgan approved the review-screen [mock-up](https://claude.ai/artifact/2upjSXCWKez2VVsedPVZbH) ("I approve of the design"). [Demo page](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) updated with 4 NIST parts on the merged S1 code (Morgan asked to see one).
- 2026-11-06 NIST gold standard (D-011): Morgan chose to keep the files in GitHub untouched. `tests/nist/NIST-PMI-STEP-Files.zip` (NIST's file byte for byte, SHA-256 checked), `tests/nist/SOURCE.md`, `tests/nist_files.py` (unpacks to the git-ignored `tests/nist/.cache/`), `tests/nist/scorecard.toml` + `make_scorecard.py`, `tests/service/test_nist.py` (17 files read under 10 s, faces not analysed may only fall, features may only rise). `scripts/check.py` all pass: 32 service, 5 unit, 2 browser. Open: ctc_05 reads as units `other`.
- 2026-11-06 Mock-up v2 in Morgan's picks; 2 fresh checks (54,022 and 51,078 tokens), all findings fixed or explained in its check record; lint 0 warnings.
- 2026-11-06 Layout and style research (general-purpose agent): 9 tools; every DFM tool uses a large 3D view, a findings list beside it and click to highlight; almost no published user opinion on layout (G2, Capterra, Gartner returned 403). Mock-up fresh check: 4 fixes queued (see Next).
- 2026-11-06 Morgan added a setup script to the "Network" environment: micromamba at `/opt/micromamba/bin/micromamba`, env at `/opt/mamba/envs/dfma` (fresh containers only; checked with get_environment).
- 2026-11-06 S2 zero-decision check on S2's sections against the merged S1 code (fresh reviewer): 4 high, 5 medium, 2 low. One went to Morgan (holes above the drill range); the rest get defaults listed on the form and written into the spec's S2 "Settled at build". It also found that S2 breaks `test_read.py`'s empty `features`/`findings` asserts, which S2 must update on purpose. Baseline on `main`: `scripts/check.py` all pass (13 service, 5 unit, 2 browser).
- 2026-11-06 S1 built on `s1-read-and-view`: service (read, frame, mesh, worker, upload limit), web viewer, 4 test parts, `scripts/check.py`, CI with micromamba. Zero-decision check: 3 high, 7 medium, 5 low; all given defaults in the spec's S1 "Settled at build" list. Checks failed first (`No module named 'dfma'`), now all 5 pass in a fresh environment (11 service, 5 unit, 2 browser tests). Playwright pinned to 1.60.0 (driver and Python client must match; 1.64.1 needs Node 24+). D-008: extra packages and micromamba, approved by Morgan. Fresh spec review: 0 high, 4 medium, 7 low; 9 fixed with tests, 2 declined (turning-axis sign rule waits for S6's shaft parts; no request cancelling for one local user).
- 2026-11-06 Phone pages for Morgan: [S1 status](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu), [view-only demo](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) (real viewer, test parts analysed in advance; refresh after each slice).
- 2026-11-06 Brainstorm pages: [open questions](https://claude.ai/artifact/BAQurJCWYqGxEZJehD7uGB), [concepts](https://claude.ai/artifact/Mgi7WVFxTne89GD9ZkjzGe), [round 1](https://claude.ai/artifact/QRrJhDYjzW3NapQUBGR6rH). Brief committed as `main`'s first commit (f27c508).
- 2026-11-06 Bootstrap #1: manifest, sync, starter docs, CI drift check. Morgan approved; `main` is the default branch.
- 2026-11-06 Spec checks: paraphrase, critic, zero decisions, then critic, zero decisions and a narrow pass; all findings fixed. Spec [approval page](https://claude.ai/artifact/CAqfoCYn9pSSxkBHn4peGb).

## Next

1. S3 (pockets) in this or a new session, from `main`: `write-spec` step 8 (zero-decision re-check of S3's sections against merged S2 code), no new screen so no mock-up unless the legend gains rows (it does: pockets, corners, D-014). Then checks fail first, build, show per D-009.
2. NIST library merged in [#5](https://github.com/DdraigFawr13/dfma-review/pull/5) (069ef55).
3. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Backlog (Morgan, 2026-11-06): name each hole's type (through, blind, counterbore, countersink, drill point, threaded); recognise threads modelled as ring faces (NIST FTC 10's threaded hole is missed); catalogue NIST resources and commit the papers (research agents running).

- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).
- Which CAD exports the test STEP files (Inventor version): unknown; public models first.

## Brainstorm trial (master D-048)

- 2026-11-06: 4 concepts; dropped with reasons: yes; kill criteria: yes; rounds: 1; measured agent cost $0.74; measure 2 (design round 1 asked nothing the brief answered): yes, every question came from the brief's open list; measure 3 (concept survived design unchanged): yes (Morgan, 2026-11-06: "Yes").

## Decisions since the last plan update

- 2026-11-06 Concept chosen (D-001). Full master setup with web-app layer (D-002).
- 2026-11-06 S1 build: extra packages and micromamba (D-008); slices shown as status page + demo (D-009); S1 merge approved.
- 2026-11-06 First-version scope (D-003), stack (D-004), rules and units (D-005), company-move gates (D-006), spec approved (D-007).
