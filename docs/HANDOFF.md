# Handoff

Updated: 2026-11-06. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. Brainstorm (D-001), bootstrap (D-002, #1), design (D-003 to D-006) and the first-version spec (D-007, [docs/specs/first-version.md](specs/first-version.md)) are merged in [#2](https://github.com/DdraigFawr13/dfma-review/pull/2). S1 (read and view) merged in [#3](https://github.com/DdraigFawr13/dfma-review/pull/3), approved by Morgan 2026-11-06. Next: slice S2.

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ✔ Spec the first usable version (D-007, 6 fresh checks, $1.49).
- ▶ Build slice by slice: ✔ S1 read and view · ▶ S2 holes (starts with `ui-style` and the review-screen mock-up) · S3 pockets · S4 thin walls · S5 machine and setups · S6 turning · S7 report and PDF.
- ○ Assemblies and DFA · history and compare · time and $.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-06 S1 built on `s1-read-and-view`: service (read, frame, mesh, worker, upload limit), web viewer, 4 test parts, `scripts/check.py`, CI with micromamba. Zero-decision check: 3 high, 7 medium, 5 low; all given defaults in the spec's S1 "Settled at build" list. Checks failed first (`No module named 'dfma'`), now all 5 pass in a fresh environment (11 service, 5 unit, 2 browser tests). Playwright pinned to 1.60.0 (driver and Python client must match; 1.64.1 needs Node 24+). D-008: extra packages and micromamba, approved by Morgan. Fresh spec review: 0 high, 4 medium, 7 low; 9 fixed with tests, 2 declined (turning-axis sign rule waits for S6's shaft parts; no request cancelling for one local user).
- 2026-11-06 Phone pages for Morgan: [S1 status](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu), [view-only demo](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) (real viewer, test parts analysed in advance; refresh after each slice).
- 2026-11-06 Brainstorm pages: [open questions](https://claude.ai/artifact/BAQurJCWYqGxEZJehD7uGB), [concepts](https://claude.ai/artifact/Mgi7WVFxTne89GD9ZkjzGe), [round 1](https://claude.ai/artifact/QRrJhDYjzW3NapQUBGR6rH). Brief committed as `main`'s first commit (f27c508).
- 2026-11-06 Bootstrap #1: manifest, sync, starter docs, CI drift check. Morgan approved; `main` is the default branch.
- 2026-11-06 Spec checks: paraphrase, critic, zero decisions, then critic, zero decisions and a narrow pass; all findings fixed. Spec [approval page](https://claude.ai/artifact/CAqfoCYn9pSSxkBHn4peGb).
- 2026-11-06 Design pages: [round 1](https://claude.ai/artifact/4Xa6iLguwU2pnXQXCAYydk), [round 2](https://claude.ai/artifact/LEGMPWU3Avt4E9pjnSvbhG), [approval](https://claude.ai/artifact/WDr91uJChvS9RkBziPWDHo). Agent cost: stack research $0.46, review $0.15 (measured).

## Next

1. S2 (holes) in a new session, from `main`: re-run the zero-decision check on S2's sections against merged S1 code, then `ui-style` (docs/UI_STYLE.md) and the review-screen mock-up (`ui-mockups`), both approved by Morgan before code. Show the slice per D-009 (status page + demo).
2. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).
3. Morgan: turn on "Allow auto-merge" in the repo settings.

## Open questions

- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).
- Which CAD exports the test STEP files (Inventor version): unknown; public models first.

## Brainstorm trial (master D-048)

- 2026-11-06: 4 concepts; dropped with reasons: yes; kill criteria: yes; rounds: 1; measured agent cost $0.74; measure 2 (design round 1 asked nothing the brief answered): yes, every question came from the brief's open list; measure 3 (concept survived design unchanged): yes (Morgan, 2026-11-06: "Yes").

## Decisions since the last plan update

- 2026-11-06 Concept chosen (D-001). Full master setup with web-app layer (D-002).
- 2026-11-06 S1 build: extra packages and micromamba (D-008); slices shown as status page + demo (D-009); S1 merge approved.
- 2026-11-06 First-version scope (D-003), stack (D-004), rules and units (D-005), company-move gates (D-006), spec approved (D-007).
