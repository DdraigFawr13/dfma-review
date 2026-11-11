# Handoff

Updated: 2026-11-11 (P1 S2 built on branch `p1-s2-stock`, awaiting Morgan's approval). A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

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
- ▶ Inventor parts (D-031 to D-046; #21 to #27): ▶ work-pair check owed (from 2026-11-12). Full line in the archive.
- ▶ Inventor shape from the `.ipt` alone (D-035): ✔ TypeScript spike, closed solid for 7 of 16 files, same features as the STEP route on CTC 04 and FTC 06 (PR #52, [README](research/inventor-shape-ts/README.md)) · ○ spline surfaces and edges, FTC 09, FTC 11 · ○ plan the phase with `planning-interview` first.
- ✔ UI direction: research, mock-ups, spec, S1-S3, UX audit and fixes (#25 to #32, D-042 to D-053; full line in the archive).
- ✔ GitLab Pages port (D-054 to D-074): trial, spec, S1-S7, S8a, S8b retire Python (#33 to #43; full line in the archive).
- ✔ UI fixes (Morgan, 2026-11-10; D-076): ✔ round 1 and review · ✔ mock-up approved (PR #46) · ✔ spec A+B (D-078, #49) · ✔ slice A model (#51, D-080) · ✔ slice B screens (#53) · ○ Morgan's work-copy check · ○ later: cutaway, dimensions; tool-access check after steps and slots.
- ▶ Steps and slots (D-066, D-068, D-079, D-081): ✔ research, planning, spec `docs/specs/steps-slots.md` (#50) · ○ S1 steps · ○ S2 slots · ○ S3 screens · ○ then V-groove and round-bottom slots, edge treatments, pocket shapes (D-075). Full line in the archive.
- ▶ Machining and DFMA rework (D-083 to D-088): ✔ research, plan, P0 (#57), spike (#58), spec P1+P2 ([spec](specs/machining-p1-p2.md), #59) · ✔ P1 S1 removal numbers (#60, D-089) · ▶ P1 S2 stock box and your stock (built, awaiting approval) · ○ slots S1-S2 · ○ P2 reach check · ○ P3 Xometry checks · ○ P4 time · ○ DFMA · ○ Inventor-only · ○ Vault. Full line in the archive.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-11 P1 S2 (stock box, Stock button, Your stock with facing lines) built on `p1-s2-stock`: J2's tests seen failing, then green; a fresh reviewer's gaps fixed (unapplied text kept on redraw, frame-pairing test, plain decimals only, try/finally on the PDF picture). Defaults taken (status page lists them): sides to 0.001 in as the Stock line, one sentence per too-small size, a wrong Apply keeps the size in use, box hidden in Machine view and other steps and the PDF, none on turned parts. Main's CI on 7a1597a was still running at start; Pages run 22 failed again (Pages not turned on).
- 2026-11-11 P1 S1 (removal numbers) merged in [PR #60](https://github.com/DdraigFawr13/dfma-review/pull/60): mock-up [approved](https://claude.ai/artifact/9AyZ9UKCJRt3PKZA4yLJnM) (D-089), [status page](https://claude.ai/artifact/2HFi38q2Cw33uTEgfzgGjF), [demo](https://claude.ai/artifact/NLELKgNM6cXgeW21VcaVoH). `result.removal` on milled parts (null on turned), two lines on Machining and in the PDF; re-freeze 303 key files, none refused; check 720 s; parity:full 0 different; EDMR 114/114.
- 2026-11-11 P1+P2 spec approved (D-088), merged in [PR #59](https://github.com/DdraigFawr13/dfma-review/pull/59); removal prototype [README](research/removal-proto/README.md).
- Earlier (reach spike #58, P0 #57, P1+P2 plan #56, UI fixes, S8b, harness): archive.

## Next

00. Checks: `npm run check` at the root; before a PR is marked ready also `npm --prefix web run edmr` and `parity:full` when the engine changed. Morgan: turn on GitHub Pages (Settings → Pages → Source: GitHub Actions) if not yet; tell IT before the work copy (D-055).
000a. UI fixes (D-076, D-078, D-080): A and B merged (#51, #53). Owed: Morgan's work-copy check of both (VER-07); arrow keys and the 50 ms drag target stand as built (D-080) until then. B's open finding: a countersink tool has `diameter_in: null`, so it shows no spindle.
0000. Now: P1 S2 on branch `p1-s2-stock`: Morgan approves the status page, then merge (GIT-07, GIT-08). Still owed by Morgan: the engineer's wrong-side parts, which free options he meant, the shop's setup issues; turn on GitHub Pages (Pages runs 21 and 22 on main failed). Stale branch `port-s8-retire-python` (merged in #43): check before deleting (GIT-03).
000. After P1 S1 and S2 (D-085, D-088 order; steps and slots, D-079, D-081): build S1 (steps); its builder adds `step` (S2: `slot`) to `VOLUME_KINDS` in `web/src/engine/removal.ts` with the pocket's formula (machining spec, Design "Feature volumes") from the approved spec [`docs/specs/steps-slots.md`](specs/steps-slots.md) in a new session, on a new branch from main: re-run write-spec step 8's zero-decision check on S1's sections against main (UI fixes A and B changed `findings.ts`, `main.ts`), do S1's "First" check on 500 MFCAD++ parts, see S1's checks fail, then build. MFCAD++: archive "Moved 2026-11-09" for the download.
0. Now: plainer sentences for the rule cases that still read as titles, each shown to Morgan first (D-045). Follow-up from the audit fixes: Hole feature rows still carry aria-pressed and aria-expanded (F15's pattern, out of its scope).
1. Owed from 2026-11-12 (D-035, D-046; now after the merge): one of Morgan's work pairs, with one Hole renamed (names right or absent, never wrong; else switch names off), by Drive share into `tests/inventor/.local/<pair>/`, then `cd web && node scripts/harness.mjs local-pairs` (prints Hole features too); counts differ or a gap over 0.01 mm: stop and take the numbers and D-033's fallback to Morgan; else record it in `local_pairs.toml`. Don't ask before 2026-11-12.
2. Recognition and stress-test status, scoring commands and the MFCAD++ download: archive "Moved 2026-11-09" (old Next 3 and 3a). Re-run them on every recognition change.
3. Morgan: S1 device check on their PC still owed (VER-07); steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions

- Shape from the `.ipt` alone: its own phase after I1 (D-035); test-run numbers in the archive.
- Backlog and after-project ideas (hole types, ring-face threads, G-code view, waivers, shop profiles): archive "Moved 2026-11-09".
- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).

## Decisions since the last plan update

- 2026-11-11 D-089: P1 mock-up approved with its four defaults; merge P1 S1 when ready, then P1 S2 in a new session.
- 2026-11-11 D-088: P1+P2 spec approved (R1-R10 as recommended); merge on our own checks while Actions is down.
- 2026-11-11 D-087: spike accepted; P2a cell rule D/4 capped 4 M, a height map that is never optimistic, OpenCAMLib built from source for tests.
- 2026-11-11 D-086: P0 approved; `tool_dirs` on holes; the guarded `parity:refreeze` changes the key.
- 2026-11-11 D-085: P1+P2 plan approved (Morgan: "Go with all as recommended and I approve"): P0 counterbore side, spike, P1, slots S1-S2, P2a, P2b; Manifold at runtime, OpenCAMLib test-only.
- Earlier (D-001 to D-084): `docs/DECISIONS.md` (`grep '^## D-'`).
