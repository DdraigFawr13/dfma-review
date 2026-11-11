# Handoff

Updated: 2026-11-10 (port S7 approved, D-069; merged in PR #41). A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. First usable version: S1 to S7 merged (#3 to #18). Inventor parts: I1 (#21 to #23), I2 and I3 (#24, #27; D-039 to D-046) merged. Review-steps S1 merged in #29 (D-047). Review-steps S2+S3 merged in #30 (D-051): the step screen is complete. UX audit merged in #31; its 34 fixes merged in #32 (D-053). Now: GitLab Pages port S8 (retire Python) next, in a new session; S7 merged in #41 (D-069); S6 merged in #40 (D-067); S5 merged in #38 (D-064), S4 in #37 (D-062); S1 merged in #34, S2 in #35 (D-060), S3 in #36 (D-061); and the work-pair check from 2026-11-12. History and full entries: [docs/archive/handoff-2026-11.md](archive/handoff-2026-11.md) (grep it; "Moved 2026-11-09" holds the long entries cut from here).

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
- ✔ UI direction: research and 3 mock-up rounds, approved (D-042, #25) · ✔ spec approved (D-045, #28) · ✔ S1 merged in #29 (D-047) · ✔ S2 + S3 merged in #30 (D-048 to D-052) · ✔ UX audit #31 · ✔ audit fixes #32 (D-053) ([round 3](https://claude.ai/artifact/V5jsL9TkRoY7HDiPJM4DS8); answers and sources in `docs/research/ui-direction/README.md`).
- ▶ GitLab Pages port (Morgan, 2026-11-09; D-054, D-055, D-056): ✔ trial · ✔ spec approved (PR #33) · ✔ S1 site, viewer, parity (PR #34) · ✔ S2 holes (PR #35) · ✔ S3 plan, cost, PDF (PR #36; work release possible) · ✔ S4 pockets (PR #37) · ✔ S5 walls (PR #38) · ✔ S6 turning (PR #40) · ✔ S7 Inventor (PR #41) · ○ S8 retire Python.
- ○ Steps and slots (Morgan, 2026-11-10; D-066, D-068): ✔ research ([page](research/feature-recognition.html)) · ✔ answers (MFCAD++ classes, no open-pocket kind, plan first) · ○ spec with `write-spec` · ○ build (after the port, unless Morgan moves it up).
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-11 S8a (D-072): merged the D-071 docs from `port-s8-retire-python` here (that branch is unmerged; left as is). Quick parity 122 of 122, 4 shards, 236.7 s. Scorer and harness match Python (numbers in D-072). Stale EDMR line: `tests/edmr/scorecard.toml` `nasty_cheese` 386, both engines 387 (open).



## Next

00. S8b (retire Python) in a new session, after Morgan approves the S8a PR: `service/`, the Python tests, `environment.yml`, `tests/e2e/` ported to `web/e2e/` (Playwright) and vitest; `scripts/make_demo.py` to Node; CI on Node only (D-071, spec S8). S8a is built (D-072): the four-shard parity, the frozen key in `tests/parity/key/`, the scorer and harness on the engine. Morgan: turn on GitHub Pages if not yet; tell IT before the work copy (D-055).
000a. UI fixes (Morgan, 2026-11-10; 4 photos of the work copy): example parts on the start form; no pins while the part rotates; Inventor-style rotate and move; a top bar with Open… and Examples; a machine-tooling view on Machining; one feature at a time. Later: slice/cutaway, dimensions on the part, a tool-access check (ideas). After S8b. Plan with `planning-interview` and a mock-up first (WS-02, ui-mockups); Proposed until Morgan approves.
000. Steps and slots (D-068): Morgan added slot recognition in another copy without full testing (2026-11-10) and wants it redone here, tested; spec with `write-spec` after the port; start with a labelled `steps_slots` set, then NIST and EDMR, then MFCAD++ classes 5-10 and 17-22.
0. Now: plainer sentences for the rule cases that still read as titles, each shown to Morgan first (D-045). Follow-up from the audit fixes: Hole feature rows still carry aria-pressed and aria-expanded (F15's pattern, out of its scope).
1. Owed from 2026-11-12 (D-035, D-046; now after the merge): one of Morgan's work pairs, with one Hole renamed (names right or absent, never wrong; else switch names off), by Drive share into `tests/inventor/.local/<pair>/`, then `python tests/inventor/local_pairs.py` (now prints Hole features too); counts differ or a gap over 0.01 mm: stop and take the numbers and D-033's fallback to Morgan; else record it in `local_pairs.toml`. Don't ask before 2026-11-12.
2. Recognition and stress-test status, scoring commands and the MFCAD++ download: archive "Moved 2026-11-09" (old Next 3 and 3a). Re-run them on every recognition change.
3. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Shape from the `.ipt` alone: its own phase after I1 (D-035); test-run numbers in the archive.
- `test_nist.py` ctc_02 took 5.8-7.07 s here and once 10.4 s in a busier container, against a 10 s limit; limit unchanged (VER-04); detail in the archive. 2026-11-10: 10.2 s once inside a full `check.py`, 7.9-8.3 s alone (3 runs); S5: 10.1 s once inside `check.py`, alone 8.66-8.81 s on the branch and 9.17-9.36 s on main's code.
- Backlog and after-project ideas (hole types, ring-face threads, G-code view, waivers, shop profiles): archive "Moved 2026-11-09".
- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).

## Decisions since the last plan update

- 2026-11-11 D-071: S8 before the UI list; faster checks on the S8 branch; S8 file list and two-PR split approved.
- 2026-11-10 D-070: S7 merges without the full-set parity (stopped, no result); parity prints a line per file.
- 2026-11-10 D-069: S7 approved; merge when ready; S8 in a new session.
- 2026-11-10 D-068: steps and slots named and scored by MFCAD++'s classes (no open-pocket kind); plan and tools first; slot depth over 6× width a finding.
- 2026-11-10 D-067: S6 approved; merge when CI is done; S7 in a new session.
- 2026-11-11 D-072: S8a built (four-shard parity, frozen key 13.61 MB, scorer and harness on the engine); S8b next.

- 2026-11-10 D-065: faster `check.py` (lanes, timed tests alone, pytest-xdist); approved and merged in PR #39.
- 2026-11-10 D-059: J4 (big plate) dropped; S3 makes the Machining setups distinct, with a mock-up first.
- D-001 to D-037: see `docs/DECISIONS.md` (`grep '^## D-'`).
