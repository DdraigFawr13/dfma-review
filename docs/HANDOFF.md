# Handoff

Updated: 2026-11-09. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. First usable version: S1 to S7 merged (#3 to #18). Inventor parts: I1 merged (#21 to #23); I2+I3 spec approved (D-039); I2 S1 merged in #24 (D-041); I2 S2 built on `inventor-i2-s2`, draft PR [#27](https://github.com/DdraigFawr13/dfma-review/pull/27), with main (#25, #26) merged in. History: [docs/archive/handoff-2026-11.md](archive/handoff-2026-11.md) (grep it; "Moved 2026-11-09" holds the long entries).

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ✔ Spec the first usable version (D-007, 6 fresh checks, $1.49).
- ✔ Build slice by slice: S1 to S7, grading spike, recognition rounds, stress-test, undercut and turning sets (#3 to #18).
- ○ Assemblies and DFA · history and compare · time and $.
- ▶ Inventor parts (Morgan, 2026-11-08): ✔ research · ✔ own reader (D-031) · ✔ plan (D-032) · ✔ spec I1 (D-033) · ✔ I1 S1 #21, S2 #22, S3 #23 · ✔ spec I2+I3 (D-039) · ✔ I2 S1 hole features #24 (D-041) · ✔ S2 names and copies built (#27) · ○ S3 fillets and chamfers (merge after Morgan's work-pair check).
- ○ Inventor shape from the `.ipt` alone (D-035; after I1).
- ✔ UI direction: research and 3 mock-up rounds, approved (D-042, #25) · ○ build the step-by-step review screen: `write-spec` after I2+I3 merges ([round 3](https://claude.ai/artifact/V5jsL9TkRoY7HDiPJM4DS8); answers and sources in `docs/research/ui-direction/README.md`).
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-09 Main (#25 UI direction D-042, #26 harness v4.12.0) merged into `inventor-i2-s2` (PR #27); only HANDOFF and its archive conflicted (main's archive already held every branch line).
- 2026-11-09 I2 S2 (names and copies) built, draft PR [#27](https://github.com/DdraigFawr13/dfma-review/pull/27). `inventor/names.py` rank rule: NIST 70/70 checkable Holes right, 0 wrong; FTC 06 2024 and STC 10 no names; CTC 04 threads `Hole8`. Copy text, "n in the browser, m read" note, names in small print on rows and PDF. Fresh review fixes committed; `check.py` all passed (771 service, 38 browser) before the main merge. Left: stream size as the probe measured it, the count-coincidence risk (spec Risks). [Status page](https://claude.ai/artifact/DGZmySgSRTSkP9XtrW2hNZ); [demo](https://claude.ai/artifact/WSwfP6u74iVZ3Rpa5jUNp5).
- 2026-11-09 Harness upgraded to AI-Master-Instructions `v4.12.0`, merged as #26 (Morgan approved: "Approved"; master D-066, from the master's review of this project): new REP-05; session start lists unmerged branches and an over-cap HANDOFF; `ui-mockups` now does D-024's fit-width tap-to-zoom (`add-zoom.mjs`); `docs/harness/drift/` keeps guard counts. This HANDOFF cut to the cap.
- 2026-11-09 I2 S1 (hole features) approved by Morgan ("Ok approved") and merged in #24 (D-041): `check.py` all passed (745 service, 36 browser); 85 Holes keyed by position, type and diameter 85/85, depth 43/43. [Status page](https://claude.ai/artifact/5yW8LBj6ZjYb3aA4v3zFy6), [demo](https://claude.ai/artifact/WSwfP6u74iVZ3Rpa5jUNp5). Full entry, fresh-review leftovers: archive "Moved 2026-11-09".

## Next

0. Now: S3 fillets and chamfers on `inventor-i2-s2` and PR #27 (mock-up first). The PR merges only after Morgan's hand check of one work pair, including one renamed Hole (from 2026-11-12, D-041).
1. Owed from 2026-11-12 (D-035): one of Morgan's work pairs by Drive share into `tests/inventor/.local/<pair>/`, then `python tests/inventor/local_pairs.py` (now prints Hole features too); counts differ or a gap over 0.01 mm: stop and take the numbers and D-033's fallback to Morgan; else record it in `local_pairs.toml`. Don't ask before 2026-11-12.
2. Recognition and stress-test status, scoring commands and the MFCAD++ download: archive "Moved 2026-11-09" (old Next 3 and 3a). Re-run them on every recognition change.
3. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Shape from the `.ipt` alone: its own phase after I1 (D-035); test-run numbers in the archive.
- `test_nist.py` ctc_02 took 5.8-7.07 s here and once 10.4 s in a busier container, against a 10 s limit; limit unchanged (VER-04); detail in the archive.
- Backlog and after-project ideas (hole types, ring-face threads, G-code view, waivers, shop profiles): archive "Moved 2026-11-09".
- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).

## Decisions since the last plan update

- 2026-11-09 D-042: review screen redesign approved (steps Part · Features · Machining · Cost · Report, overview after reading, Fix / Review, plain-sentence rows, Show OK per kind, cost total); not built. Found on that branch: `test_nist` ctc_02 took 10.5 s and 11.1 s (limit 10 s) in 2 of 3 full runs in a cloud container under load, 9.19 s alone; limit unchanged (VER-04).
- 2026-11-09 D-041: merge I2 S1 now (#24); S2 and S3 on a new branch, merged after the work-pair check.
- 2026-11-09 D-040: Hole features panel and PDF section approved (mock-up).
- 2026-11-09 D-039: I2+I3 spec approved; default names only; no fillet or chamfer names; blend disagreements are findings; one PR merged after the work-pair check; copies as "pattern or mirror".
- 2026-11-09 D-038: S3 merges now (#23); I2+I3 on a new branch with its own PR.
- D-001 to D-037: see `docs/DECISIONS.md` (`grep '^## D-'`).
