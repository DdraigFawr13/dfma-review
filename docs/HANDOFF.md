# Handoff

Updated: 2026-11-11 (reach spike done on branch `spike-reach`, numbers to Morgan; accepted, D-087; next: `write-spec` for P1 and P2). A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

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
- ▶ Inventor shape from the `.ipt` alone (D-035): ✔ TypeScript spike, closed solid for 7 of 16 files, same features as the STEP route on CTC 04 and FTC 06 (PR #52, [README](research/inventor-shape-ts/README.md)) · ○ spline surfaces and edges, FTC 09, FTC 11 · ○ plan the phase with `planning-interview` first.
- ✔ UI direction: research, mock-ups, spec, S1-S3, UX audit and fixes (#25 to #32, D-042 to D-053; full line in the archive).
- ✔ GitLab Pages port (D-054 to D-074): trial, spec, S1-S7, S8a, S8b retire Python (#33 to #43; full line in the archive).
- ✔ UI fixes (Morgan, 2026-11-10; D-076): ✔ round 1 and review · ✔ mock-up approved (PR #46) · ✔ spec A+B (D-078, #49) · ✔ slice A model (#51, D-080) · ✔ slice B screens (#53) · ○ Morgan's work-copy check · ○ later: cutaway, dimensions; tool-access check after steps and slots.
- ▶ Steps and slots (Morgan, 2026-11-10; D-066, D-068, D-079): ✔ research ([page](research/feature-recognition.html)) · ✔ planning ([round 1](https://claude.ai/artifact/2NiJeW3rhomfLQSDeVzDhY), [review](https://claude.ai/artifact/1DwcDhFZcZVzxisd3QTqcy)) · ✔ spec `docs/specs/steps-slots.md` approved (D-081), merged in PR #50 · ○ S1 steps · ○ S2 slots · ○ S3 screens · ○ then V-groove and round-bottom slots, edge treatments, pocket shapes (D-075).
- ▶ Machining and DFMA rework, then Inventor-only and Vault (Morgan, 2026-11-11; D-083, D-084): ✔ research ([page](https://claude.ai/artifact/UnHEMoUGXWeHiYeQUiWff2)) · ✔ plan accepted (D-084), merged in PR #55 · ✔ P1+P2 planned (D-085, [round 1](https://claude.ai/artifact/EFfFHenk4UaMnjpq4hGLLj), [review](https://claude.ai/artifact/Mc4eBLkZtwmGPJ9uHEs8Zt)), PR #56 · ✔ P0 counterbore side (D-086, PR #57) · ✔ spike ([README](research/reach-spike/README.md), [status page](https://claude.ai/artifact/39TfLVdfgnogtB4GjbC44n)) · ▶ spec P1+P2 (D-087) · ○ P1 removal volume · ○ slots S1-S2 · ○ P2 reach check · ○ P3 Xometry checks · ○ P4 time · ○ DFMA · ○ Inventor-only · ○ Vault.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-11 Reach spike (D-085 step 1), branch `spike-reach`, draft [PR #58](https://github.com/DdraigFawr13/dfma-review/pull/58); [README](research/reach-spike/README.md) has every number and how it was measured. CTC 02 (largest NIST part), 6 directions × 11 end mills + holder, Chromium: 10.0 s on 1 worker, 3.8 s on 3 at cell D/4 capped 4 M cells. Manifold 3.5.4: 218 kB gzip, loads in 34-45 ms; all 17 NIST meshes weld valid; FTC 08 `-e1-tg` mesh is inside-out. OpenCAMLib (Morgan approved the install): LGPL-2.1-or-later; built from source and run; centre-sampled tips are optimistic on 0.13-20.7 % of points (P2a needs a conservative raster or a wider disk). Code: `web/src/reach-spike/`, spike config only.
- 2026-11-11 P0 approved (D-086), merged in PR #57: archive "Moved 2026-11-11 (reach spike session)".
- Earlier (P1+P2 plan #56, UI fixes, S8b, harness): archive.

## Next

00. Checks: `npm run check` at the root; before a PR is marked ready also `npm --prefix web run edmr` and `parity:full` when the engine changed. Morgan: turn on GitHub Pages (Settings → Pages → Source: GitHub Actions) if not yet; tell IT before the work copy (D-055).
000a. UI fixes (D-076, D-078, D-080): A and B merged (#51, #53). Owed: Morgan's work-copy check of both (VER-07); arrow keys and the 50 ms drag target stand as built (D-080) until then. B's open finding: a countersink tool has `diameter_in: null`, so it shows no spindle.
0000. Spike done and accepted (D-087). Next: `write-spec` for P1 and P2 from D-085 and D-087 (numbers in the spike README). Still owed by Morgan: the engineer's wrong-side parts (run them when they arrive), which free options he meant, the shop's setup issues. Stale branch `port-s8-retire-python` (S8b, merged in #43): check before deleting (GIT-03).
000. After P1 (D-085 order; steps and slots, D-079, D-081): build S1 (steps) from the approved spec [`docs/specs/steps-slots.md`](specs/steps-slots.md) in a new session, on a new branch from main: re-run write-spec step 8's zero-decision check on S1's sections against main (UI fixes A and B changed `findings.ts`, `main.ts`), do S1's "First" check on 500 MFCAD++ parts, see S1's checks fail, then build. MFCAD++: archive "Moved 2026-11-09" for the download.
0. Now: plainer sentences for the rule cases that still read as titles, each shown to Morgan first (D-045). Follow-up from the audit fixes: Hole feature rows still carry aria-pressed and aria-expanded (F15's pattern, out of its scope).
1. Owed from 2026-11-12 (D-035, D-046; now after the merge): one of Morgan's work pairs, with one Hole renamed (names right or absent, never wrong; else switch names off), by Drive share into `tests/inventor/.local/<pair>/`, then `cd web && node scripts/harness.mjs local-pairs` (prints Hole features too); counts differ or a gap over 0.01 mm: stop and take the numbers and D-033's fallback to Morgan; else record it in `local_pairs.toml`. Don't ask before 2026-11-12.
2. Recognition and stress-test status, scoring commands and the MFCAD++ download: archive "Moved 2026-11-09" (old Next 3 and 3a). Re-run them on every recognition change.
3. Morgan: S1 device check on their PC still owed (VER-07); steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Shape from the `.ipt` alone: its own phase after I1 (D-035); test-run numbers in the archive.
- Backlog and after-project ideas (hole types, ring-face threads, G-code view, waivers, shop profiles): archive "Moved 2026-11-09".
- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).

## Decisions since the last plan update

- 2026-11-11 D-087: spike accepted; P2a cell rule D/4 capped 4 M, a height map that is never optimistic, OpenCAMLib built from source for tests.
- 2026-11-11 D-086: P0 approved; `tool_dirs` on holes; the guarded `parity:refreeze` changes the key.
- 2026-11-11 D-085: P1+P2 plan approved (Morgan: "Go with all as recommended and I approve"): P0 counterbore side, spike, P1, slots S1-S2, P2a, P2b; Manifold at runtime, OpenCAMLib test-only.
- Earlier (D-001 to D-084): `docs/DECISIONS.md` (`grep '^## D-'`).
