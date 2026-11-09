# Handoff

Updated: 2026-11-09. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. First usable version: S1 to S7 merged (#3 to #18). Inventor parts: I1 (#21 to #23), I2 and I3 (#24, #27; D-039 to D-046) merged. Review-steps S1 merged in #29 (D-047). Review-steps S2+S3 merged in #30 (D-051): the step screen is complete. Now: an audit offer (VER-09), then the work-pair check from 2026-11-12. History and full entries: [docs/archive/handoff-2026-11.md](archive/handoff-2026-11.md) (grep it; "Moved 2026-11-09" holds the long entries cut from here).

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
- ✔ UI direction: research and 3 mock-up rounds, approved (D-042, #25) · ✔ spec approved (D-045, #28) · ✔ S1 merged in #29 (D-047) · ✔ S2 + S3 merged in #30 (D-048 to D-051) ([round 3](https://claude.ai/artifact/V5jsL9TkRoY7HDiPJM4DS8); answers and sources in `docs/research/ui-direction/README.md`).
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-09 Review-steps S2+S3 approved by Morgan ("I approve the demo you can build and merge when ready"; D-051) and merged in #30 (D-048): Features rows, .ipt groups (D-049), Machining issues per setup, UI_STYLE rewritten; D-050 (angled holes and pockets Review). `check.py`: 918 service, 22 web, 56 browser, all passed. [Status](https://claude.ai/artifact/9HhhzKxSxrPjExsFUfPuB7), [demo](https://claude.ai/artifact/1xtgoWGBPrHdziq4RvAiA5), [PR #30](https://github.com/DdraigFawr13/dfma-review/pull/30).
- 2026-11-09 Review-steps S1 approved ("Approved. Merge please"; D-047) and merged in [PR #29](https://github.com/DdraigFawr13/dfma-review/pull/29). [Status](https://claude.ai/artifact/1DBpmPRjdQ97e1vezTzHUV), [demo](https://claude.ai/artifact/5wbXKMbjt5grbmM9RJ8mqJ). Full entry: archive "Moved 2026-11-09".
- 2026-11-09 PR #27 merged on Morgan's word ("approve all please merge", D-046, amends D-041): I2 S2 names and copies ([status](https://claude.ai/artifact/DGZmySgSRTSkP9XtrW2hNZ)) and I3 S3 fillets and chamfers ([status](https://claude.ai/artifact/H5YVa33eegML8ziNYsJzo5), D-043): `inventor/names.py`, `inventor/blends.py`, `rules/blend_mismatch.py`, panel and PDF section; NIST blend counts equal the stored names, 499 of 744 fillet faces found. The work-pair check is still owed; a wrong name there switches names off.
- 2026-11-09 Review-in-steps spec approved by Morgan ("Approved, start building"; D-045) and merged in #28: [docs/specs/review-steps.md](specs/review-steps.md). Checks and outcomes: LESSONS "spec" (review-steps line).
- 2026-11-09 Harness upgraded to AI-Master-Instructions `v4.12.0`, merged as #26 (Morgan approved: "Approved"; master D-066, from the master's review of this project): new REP-05; session start lists unmerged branches and an over-cap HANDOFF; `ui-mockups` now does D-024's fit-width tap-to-zoom (`add-zoom.mjs`); `docs/harness/drift/` keeps guard counts. This HANDOFF cut to the cap.

## Next

0. Now: offer Morgan an audit of the step screen (VER-09, `audit` skill; the review-steps spec is shipped). Then plainer sentences for the rule cases that still read as titles, each shown to Morgan first (D-045).
1. Owed from 2026-11-12 (D-035, D-046; now after the merge): one of Morgan's work pairs, with one Hole renamed (names right or absent, never wrong; else switch names off), by Drive share into `tests/inventor/.local/<pair>/`, then `python tests/inventor/local_pairs.py` (now prints Hole features too); counts differ or a gap over 0.01 mm: stop and take the numbers and D-033's fallback to Morgan; else record it in `local_pairs.toml`. Don't ask before 2026-11-12.
2. Recognition and stress-test status, scoring commands and the MFCAD++ download: archive "Moved 2026-11-09" (old Next 3 and 3a). Re-run them on every recognition change.
3. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Shape from the `.ipt` alone: its own phase after I1 (D-035); test-run numbers in the archive.
- `test_nist.py` ctc_02 took 5.8-7.07 s here and once 10.4 s in a busier container, against a 10 s limit; limit unchanged (VER-04); detail in the archive.
- Backlog and after-project ideas (hole types, ring-face threads, G-code view, waivers, shop profiles): archive "Moved 2026-11-09".
- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).

## Decisions since the last plan update

- 2026-11-09 D-051: review-steps S2+S3 approved and merged (#30); spec shipped.
- 2026-11-09 D-050: an angled hole or pocket is a Review; a hole is a Fix when it enters its face off square.
- 2026-11-09 D-049: Features groups mock-up approved; a corner sits in its pocket's setup, a thin wall under "Whole part".
- 2026-11-09 D-048: review-steps S2 and S3 built and merged together, one branch and one PR.
- 2026-11-09 D-047: review-steps S1 approved and merged (#29); builder calls recorded.
- 2026-11-09 D-046: merge #27 now; the work-pair check follows the merge (amends D-041).
- 2026-11-09 D-045: review-steps spec approved; 3 slices; rows.py; build from main.
- 2026-11-09 D-042: review screen redesign approved (steps Part · Features · Machining · Cost · Report, overview after reading, Fix / Review, plain-sentence rows, Show OK per kind, cost total); not built. Found on that branch: `test_nist` ctc_02 took 10.5 s and 11.1 s (limit 10 s) in 2 of 3 full runs in a cloud container under load, 9.19 s alone; limit unchanged (VER-04).
- 2026-11-09 D-041: merge I2 S1 now (#24); S2 and S3 on a new branch, merged after the work-pair check.
- 2026-11-09 D-040: Hole features panel and PDF section approved (mock-up).
- 2026-11-09 D-039: I2+I3 spec approved; default names only; no fillet or chamfer names; blend disagreements are findings; one PR merged after the work-pair check; copies as "pattern or mirror".
- 2026-11-09 D-038: S3 merges now (#23); I2+I3 on a new branch with its own PR.
- D-001 to D-037: see `docs/DECISIONS.md` (`grep '^## D-'`).
