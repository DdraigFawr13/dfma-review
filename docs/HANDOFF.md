# Handoff

Updated: 2026-11-11 (UI fixes A and B merged, #51 and #53; D-082 merged, #54; steps and slots spec approved and merged, D-081, PR #50; next: steps and slots S1 in a new session). A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. First usable version, Inventor parts I1-I3, review steps and the UX audit fixes are merged (#3 to #32). GitLab Pages port S1-S7 and S8a merged (#34 to #42; D-060 to D-072). S8b (retire Python) merged in #43 (D-074); harness v4.14.0 merged in #44 (D-073). Now: steps and slots S1 (D-081, Next 000), and the work-pair check from 2026-11-12. History: [docs/archive/handoff-2026-11.md](archive/handoff-2026-11.md) (grep it; "Moved 2026-11-09" holds the long entries cut from here).

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
- ✔ UI fixes (Morgan, 2026-11-10; D-076): ✔ round 1 and review · ✔ mock-up approved (PR #46) · ✔ spec A+B (D-078, #49) · ✔ slice A model (#51, D-080) · ✔ slice B screens (#53) · ○ Morgan's work-copy check · ○ later: cutaway, dimensions; tool-access check after steps and slots.
- ▶ Steps and slots (Morgan, 2026-11-10; D-066, D-068, D-079): ✔ research ([page](research/feature-recognition.html)) · ✔ planning ([round 1](https://claude.ai/artifact/2NiJeW3rhomfLQSDeVzDhY), [review](https://claude.ai/artifact/1DwcDhFZcZVzxisd3QTqcy)) · ✔ spec `docs/specs/steps-slots.md` approved (D-081), merged in PR #50 · ○ S1 steps · ○ S2 slots · ○ S3 screens · ○ then V-groove and round-bottom slots, edge treatments, pocket shapes (D-075).
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-11 Steps and slots spec approved (D-081) and merged in PR #50: planned with D-079 (Morgan: research, then the recommendations); checked 6 times ([approval page](https://claude.ai/artifact/G38mPz8nx9BMCwwYR39hqc)). Baseline: MFCAD++ first 500 holes 12/602 missed, pockets 78/3,745, 1 wrong (716 s, 4 jobs); check set holes 23/666, pockets 112/3,872, 1 wrong.
- 2026-11-11 UI fixes slice B (the screens) merged in PR #53: Examples, one Open… picker, Part / Machine switch; `web/e2e/screens.spec.ts`.
- Earlier (UI fixes spec #49, D-077 #48, plan, S8b, harness v4.14.0): archive "Moved 2026-11-11 (spec session)", "(slice A session)" and "(steps-slots planning session)".

## Next

00. Checks: `npm run check` at the root; before a PR is marked ready also `npm --prefix web run edmr` and `parity:full` when the engine changed. Morgan: turn on GitHub Pages (Settings → Pages → Source: GitHub Actions) if not yet; tell IT before the work copy (D-055).
000a. UI fixes (D-076, D-078, D-080): A and B merged (#51, #53). Owed: Morgan's work-copy check of both (VER-07); arrow keys and the 50 ms drag target stand as built (D-080) until then. B's open finding: a countersink tool has `diameter_in: null`, so it shows no spindle.
000. Now (steps and slots, D-079, D-081): build S1 (steps) from the approved spec [`docs/specs/steps-slots.md`](specs/steps-slots.md) in a new session, on a new branch from main: re-run write-spec step 8's zero-decision check on S1's sections against main (UI fixes A and B changed `findings.ts`, `main.ts`), do S1's "First" check on 500 MFCAD++ parts, see S1's checks fail, then build. MFCAD++: archive "Moved 2026-11-09" for the download.
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

- 2026-11-11 D-082: a UI-only change skips the parity run and timed engine tests (Morgan); merged in PR #54.
- 2026-11-11 D-081: steps and slots spec approved; merged after UI fixes B (Morgan: "You merge after pr 53").
- 2026-11-11 D-080: UI fixes slice A approved after the demo; merged in PR #51; open calls stand as built.
- 2026-11-11 D-079: steps and slots planned: step cut from floor or wall, slot from floor only (amends D-068); slot rougher ≤ 0.75 width then finisher; step rougher 1 in then corner finisher; deep check on both and slot over 6× width; target fixed before the first run.
- 2026-11-11 D-078: UI fixes spec approved; view buttons in file axes, triad in part axes (as recommended); free rotation with ArcballControls (Morgan changed it from turntable).
- 2026-11-10 D-068: steps and slots named and scored by MFCAD++'s classes (no open-pocket kind); plan and tools first; slot depth over 6× width a finding.
- D-001 to D-037: see `docs/DECISIONS.md` (`grep '^## D-'`).
