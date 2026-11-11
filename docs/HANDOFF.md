# Handoff

Updated: 2026-11-11 (port S8b merged in PR #43, D-074; D-075 recorded). A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. First usable version, Inventor parts I1-I3, review steps and the UX audit fixes are merged (#3 to #32). GitLab Pages port S1-S7 and S8a merged (#34 to #42; D-060 to D-072). S8b (retire Python) merged in #43 (D-074); harness v4.14.0 merged in #44 (D-073). Now: UI fixes (Next 000a), and the work-pair check from 2026-11-12. History: [docs/archive/handoff-2026-11.md](archive/handoff-2026-11.md) (grep it; "Moved 2026-11-09" holds the long entries cut from here).

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
- ▶ GitLab Pages port (Morgan, 2026-11-09; D-054, D-055, D-056): ✔ trial · ✔ spec approved (PR #33) · ✔ S1 site, viewer, parity (PR #34) · ✔ S2 holes (PR #35) · ✔ S3 plan, cost, PDF (PR #36; work release possible) · ✔ S4 pockets (PR #37) · ✔ S5 walls (PR #38) · ✔ S6 turning (PR #40) · ✔ S7 Inventor (PR #41) · ✔ S8a (PR #42) · ✔ S8b retire Python (PR #43).
- ○ Steps and slots (Morgan, 2026-11-10; D-066, D-068): ✔ research ([page](research/feature-recognition.html)) · ✔ answers (MFCAD++ classes, no open-pocket kind, plan first) · ○ spec with `write-spec` · ○ build (after the port, unless Morgan moves it up) · ○ then edge treatments: chamfers and fillets (D-075) · ○ then pocket shapes, MFCAD++ 13-16 (D-075).
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-11 S8b merged in #43 (06:19 UTC, `43c4caf`; PR CI green, 12.8 min): Python retired, checks on Node (D-074). `npm run check` 421 s (900 s budget); edmr 114 of 114; parity:full 327 the same, 2 known tessellation, 0 different. The first CI run failed on NIST 10 s limits inside the parallel vitest run; fixed with a timed lane run alone. plan.test.ts angled-holes test: 30 s limit (engine 5.2 s, Python 3.8 s).
- Tessellation (D-074): named exemption for 3 faces (bn_ball6 14, 18; nasty_cheese 202); parity:full exit 0 (327 same, 2 known, 0 different). Cause: OCCT 8.0.1 (pythonocc) vs 8.0.0 (opencascade.js).
- 2026-11-11 Harness upgraded v4.12.0 → v4.14.0 (master D-068): the `test-design` skill, VER-10 (see a test fail first) and VER-11 (real samples, time tests, fixed waits are wall-clock limits) now load here; check time budget in AGENTS.md (D-073). Merged as #44 by auto-merge on green (Morgan approved 2026-11-11).

## Next

00. `main` after #43: CI red on the timed e2e step (`test_ui_responsive` stalled 298 ms > 200 ms; it ran beside a PDF test with 2 workers); fixed in #47 (timed e2e with 1 worker; owner approved 2026-11-11; check `main`'s CI after it merges). Pages deploy 404: Morgan to turn Pages on (Settings → Pages → Source: GitHub Actions). Checks: `npm run check` at the root; before a PR is marked ready also `npm --prefix web run edmr` and `parity:full`. Morgan: turn on GitHub Pages if not yet; tell IT before the work copy (D-055).
000a. Next: UI fixes (Morgan, 2026-11-10; 4 photos of the work copy): example parts on the start form; no pins while the part rotates; Inventor-style rotate and move; a top bar with Open… and Examples; a machine-tooling view on Machining; one feature at a time. Later: slice/cutaway, dimensions on the part, a tool-access check (ideas). Plan with `planning-interview` and a mock-up first (WS-02, ui-mockups); Proposed until Morgan approves.
000. Steps and slots (D-068): Morgan added slot recognition in another copy without full testing (2026-11-10) and wants it redone here, tested; spec with `write-spec` after the port; start with a labelled `steps_slots` set, then NIST and EDMR, then MFCAD++ classes 5-10 and 17-22.
0. Now: plainer sentences for the rule cases that still read as titles, each shown to Morgan first (D-045). Follow-up from the audit fixes: Hole feature rows still carry aria-pressed and aria-expanded (F15's pattern, out of its scope).
1. Owed from 2026-11-12 (D-035, D-046; now after the merge): one of Morgan's work pairs, with one Hole renamed (names right or absent, never wrong; else switch names off), by Drive share into `tests/inventor/.local/<pair>/`, then `cd web && node scripts/harness.mjs local-pairs` (prints Hole features too); counts differ or a gap over 0.01 mm: stop and take the numbers and D-033's fallback to Morgan; else record it in `local_pairs.toml`. Don't ask before 2026-11-12.
2. Recognition and stress-test status, scoring commands and the MFCAD++ download: archive "Moved 2026-11-09" (old Next 3 and 3a). Re-run them on every recognition change.
3. Morgan: S1 device check on their PC is still owed (VER-07): README "Set up" and "Start" (Node; the browser engine), upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Shape from the `.ipt` alone: its own phase after I1 (D-035); test-run numbers in the archive.
- `test_nist.py` ctc_02 took 5.8-7.07 s here and once 10.4 s in a busier container, against a 10 s limit; limit unchanged (VER-04); detail in the archive. 2026-11-10: 10.2 s once inside a full `check.py`, 7.9-8.3 s alone (3 runs); S5: 10.1 s once inside `check.py`, alone 8.66-8.81 s on the branch and 9.17-9.36 s on main's code.
- Backlog and after-project ideas (hole types, ring-face threads, G-code view, waivers, shop profiles): archive "Moved 2026-11-09".
- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).

## Decisions since the last plan update

- 2026-11-11 D-075: edge treatments (chamfers, fillets), then pocket shapes, join the recognition plan after steps and slots.
- 2026-11-11 D-074: S8b approved: Python retired; tessellation is a named 3-face exemption (OCCT 8.0.1 vs 8.0.0).
- 2026-11-11 D-073: harness v4.14.0 (testing rules) and the 900 s check budget; approved, merged in PR #44.
- 2026-11-11 D-071: S8 before the UI list; faster checks on the S8 branch; S8 file list and two-PR split approved.
- 2026-11-10 D-069: S7 approved; merge when ready; S8 in a new session.
- 2026-11-10 D-068: steps and slots named and scored by MFCAD++'s classes (no open-pocket kind); plan and tools first; slot depth over 6× width a finding.
- 2026-11-10 D-067: S6 approved; merge when CI is done; S7 in a new session.

- 2026-11-10 D-065: faster `check.py` (lanes, timed tests alone, pytest-xdist); approved and merged in PR #39.
- D-001 to D-037: see `docs/DECISIONS.md` (`grep '^## D-'`).
