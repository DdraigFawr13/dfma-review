# Handoff

Updated: 2026-11-09. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. First usable version: S1 to S7 merged (#3 to #18). Inventor parts phase: plan (D-031, D-032), I1 spec (D-033, [docs/specs/inventor-i1-threads.md](specs/inventor-i1-threads.md)), I1 S1 (#21), S2 (#22) and S3 (#23, D-038) merged. I2+I3 spec approved (D-039); I2 S1 hole features merged in #24 (D-041). Now: I2 S2 names and copies on a new branch `inventor-i2-s2`. History and full entries: [docs/archive/handoff-2026-11.md](archive/handoff-2026-11.md) (grep it; "Moved 2026-11-09" holds the long entries cut from here).

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ✔ Spec the first usable version (D-007, 6 fresh checks, $1.49).
- ✔ Build slice by slice: S1 to S7, grading spike, recognition rounds, stress-test, undercut and turning sets (#3 to #18).
- ○ Assemblies and DFA · history and compare · time and $.
- ▶ Inventor parts (Morgan, 2026-11-08): ✔ research · ✔ own reader (D-031) · ✔ plan (D-032) · ✔ spec I1 (D-033) · ✔ I1 S1 #21, S2 #22, S3 #23 · ✔ spec I2+I3 (D-039) · ✔ I2 S1 hole features #24 (D-041) · ✔ S2 names and copies and S3 fillets and chamfers, merged in #27 (D-043, D-046) · ▶ work-pair check owed (from 2026-11-12).
- ○ Inventor shape from the `.ipt` alone (D-035; after I1).
- ✔ UI direction: research and 3 mock-up rounds, approved (D-042, #25) · ✔ spec approved (D-045, #28) · ▶ build S1 · ○ S2 · ○ S3 ([round 3](https://claude.ai/artifact/V5jsL9TkRoY7HDiPJM4DS8); answers and sources in `docs/research/ui-direction/README.md`).
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-09 PR #27 merged on Morgan's word ("approve all please merge", D-046, amends D-041): I2 S2 names and copies ([status](https://claude.ai/artifact/DGZmySgSRTSkP9XtrW2hNZ)) and I3 S3 fillets and chamfers ([status](https://claude.ai/artifact/H5YVa33eegML8ziNYsJzo5), D-043): `inventor/names.py`, `inventor/blends.py`, `rules/blend_mismatch.py`, panel and PDF section; NIST blend counts equal the stored names, 499 of 744 fillet faces found. The work-pair check is still owed; a wrong name there switches names off.
- 2026-11-09 Review-in-steps spec approved by Morgan ("Approved, start building"; D-045) and merged in #28: [docs/specs/review-steps.md](specs/review-steps.md). Checks and outcomes: LESSONS "spec" (review-steps line).
- 2026-11-09 Harness upgraded to AI-Master-Instructions `v4.12.0`, merged as #26 (Morgan approved: "Approved"; master D-066, from the master's review of this project): new REP-05; session start lists unmerged branches and an over-cap HANDOFF; `ui-mockups` now does D-024's fit-width tap-to-zoom (`add-zoom.mjs`); `docs/harness/drift/` keeps guard counts. This HANDOFF cut to the cap.
- 2026-11-09 I2 S1 (hole features) approved by Morgan ("Ok approved") and merged in #24 (D-041): `check.py` all passed (745 service, 36 browser); 85 Holes keyed by position, type and diameter 85/85, depth 43/43. [Status page](https://claude.ai/artifact/5yW8LBj6ZjYb3aA4v3zFy6), [demo](https://claude.ai/artifact/WSwfP6u74iVZ3Rpa5jUNp5). Full entry, fresh-review leftovers: archive "Moved 2026-11-09".

## Next

0. Now: review-steps S1 (steps, overview, Cost total, Report, Fix / Review words) in a new session on a new branch from main after PR #28 merges: [docs/specs/review-steps.md](specs/review-steps.md) (approved, D-045). #27 is merged, so the Fillets and chamfers panel is on main: S2 places it as a Features group (D-045). Start with the zero-decision re-check of S1 against merged main (write-spec step 8). PR #27 (I2 S2 + I3 S3) still waits for Morgan's work-pair check (D-041).
1. Owed from 2026-11-12 (D-035, D-046; now after the merge): one of Morgan's work pairs, with one Hole renamed (names right or absent, never wrong; else switch names off), by Drive share into `tests/inventor/.local/<pair>/`, then `python tests/inventor/local_pairs.py` (now prints Hole features too); counts differ or a gap over 0.01 mm: stop and take the numbers and D-033's fallback to Morgan; else record it in `local_pairs.toml`. Don't ask before 2026-11-12.
2. Recognition and stress-test status, scoring commands and the MFCAD++ download: archive "Moved 2026-11-09" (old Next 3 and 3a). Re-run them on every recognition change.
3. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Shape from the `.ipt` alone: its own phase after I1 (D-035); test-run numbers in the archive.
- `test_nist.py` ctc_02 took 5.8-7.07 s here and once 10.4 s in a busier container, against a 10 s limit; limit unchanged (VER-04); detail in the archive.
- Backlog and after-project ideas (hole types, ring-face threads, G-code view, waivers, shop profiles): archive "Moved 2026-11-09".
- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).

## Decisions since the last plan update

- 2026-11-09 D-046: merge #27 now; the work-pair check follows the merge (amends D-041).
- 2026-11-09 D-045: review-steps spec approved; 3 slices; rows.py; build from main.
- 2026-11-09 D-042: review screen redesign approved (steps Part · Features · Machining · Cost · Report, overview after reading, Fix / Review, plain-sentence rows, Show OK per kind, cost total); not built. Found on that branch: `test_nist` ctc_02 took 10.5 s and 11.1 s (limit 10 s) in 2 of 3 full runs in a cloud container under load, 9.19 s alone; limit unchanged (VER-04).
- 2026-11-09 D-041: merge I2 S1 now (#24); S2 and S3 on a new branch, merged after the work-pair check.
- 2026-11-09 D-040: Hole features panel and PDF section approved (mock-up).
- 2026-11-09 D-039: I2+I3 spec approved; default names only; no fillet or chamfer names; blend disagreements are findings; one PR merged after the work-pair check; copies as "pattern or mirror".
- 2026-11-09 D-038: S3 merges now (#23); I2+I3 on a new branch with its own PR.
- D-001 to D-037: see `docs/DECISIONS.md` (`grep '^## D-'`).
