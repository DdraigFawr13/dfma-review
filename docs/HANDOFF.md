# Handoff

Updated: 2026-11-09. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. First usable version: S1 to S7 merged (#3 to #18). Inventor parts phase: plan (D-031, D-032), I1 spec (D-033, [docs/specs/inventor-i1-threads.md](specs/inventor-i1-threads.md)), I1 S1 (#21), S2 (#22) and S3 (#23, D-038) merged. Now: the combined I2+I3 spec on branch `inventor-i2-i3` (draft #24). History and full entries: [docs/archive/handoff-2026-11.md](archive/handoff-2026-11.md) (grep it; "Moved 2026-11-09" holds the long entries cut from here).

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ✔ Spec the first usable version (D-007, 6 fresh checks, $1.49).
- ✔ Build slice by slice: S1 to S7, grading spike, recognition rounds, stress-test, undercut and turning sets (#3 to #18).
- ○ Assemblies and DFA · history and compare · time and $.
- ▶ Inventor parts (Morgan, 2026-11-08): ✔ research · ✔ own reader (D-031) · ✔ plan (D-032) · ✔ spec I1 (D-033) · ✔ I1 S1 #21, S2 #22, S3 #23 · ▶ spec I2+I3 (`inventor-i2-i3`, #24) · ○ build I2 hole features and names · ○ I3 fillets and chamfers.
- ○ Inventor shape from the `.ipt` alone (D-035; after I1).
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-09 Harness upgraded to AI-Master-Instructions `v4.12.0` (master D-066, from the master's review of this project): new REP-05; session start lists unmerged branches and an over-cap HANDOFF; `ui-mockups` now does D-024's fit-width tap-to-zoom (`add-zoom.mjs`); `docs/harness/drift/` keeps guard counts. This HANDOFF cut to the cap.
- 2026-11-09 S3 merged in #23 (D-038); I2+I3 spec started on `inventor-i2-i3`. Names: start from `docs/research/inventor-names-probe/README.md`; per-face `NMx_Hole_Brep_tag` and `NMx_blend_tag` carry a feature id (archive, "Moved 2026-11-09").

## Next

0. Now: the combined I2+I3 spec with `write-spec` on `inventor-i2-i3` (D-038), for Morgan's approval; then build it there and PR.
1. Owed from 2026-11-12 (D-035): one of Morgan's work pairs by Drive share into `tests/inventor/.local/<pair>/`, then `python tests/inventor/local_pairs.py`; counts differ or a gap over 0.01 mm: stop and take the numbers and D-033's fallback to Morgan; else record it in `local_pairs.toml`. Don't ask before 2026-11-12.
2. Recognition and stress-test status, scoring commands and the MFCAD++ download: archive "Moved 2026-11-09" (old Next 3 and 3a). Re-run them on every recognition change.
3. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Shape from the `.ipt` alone: its own phase after I1 (D-035); test-run numbers in the archive.
- `test_nist.py` ctc_02 took 5.8-7.07 s here and once 10.4 s in a busier container, against a 10 s limit; limit unchanged (VER-04); detail in the archive.
- Backlog and after-project ideas (hole types, ring-face threads, G-code view, waivers, shop profiles): archive "Moved 2026-11-09".
- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).

## Decisions since the last plan update

- 2026-11-09 D-038: S3 merges now (#23); I2+I3 on a new branch with its own PR.
- D-001 to D-037: see `docs/DECISIONS.md` (`grep '^## D-'`).
