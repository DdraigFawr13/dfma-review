# Handoff

Updated: 2026-11-08. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build. Brainstorm (D-001), bootstrap (D-002, #1), design (D-003 to D-006) and the first-version spec (D-007, [docs/specs/first-version.md](specs/first-version.md)) are merged in [#2](https://github.com/DdraigFawr13/dfma-review/pull/2). S1 (read and view) merged in [#3](https://github.com/DdraigFawr13/dfma-review/pull/3), approved by Morgan 2026-11-06. S2 (holes) approved by Morgan 2026-11-06 ("otherwise I approve of this phase") and merged in [#4](https://github.com/DdraigFawr13/dfma-review/pull/4). S3 (pockets) approved by Morgan 2026-11-06 (D-015) and merged in [#6](https://github.com/DdraigFawr13/dfma-review/pull/6). S4 (thin walls, thin material at holes, finding pins) approved by Morgan 2026-11-07 ("you can push and merge s4", D-016, D-017) and merged in [#7](https://github.com/DdraigFawr13/dfma-review/pull/7). Grading spike approved by Morgan 2026-11-07 ("Merge, then start") and merged in [#8](https://github.com/DdraigFawr13/dfma-review/pull/8). Recognition rounds 1-6, the adversarial review, D-019 and the bull-nose/draft round approved by Morgan 2026-11-07 ("Also merge and start a new or whenever you feel like you are at a good point to do so") and merged in [#9](https://github.com/DdraigFawr13/dfma-review/pull/9). Tapered holes approved by Morgan 2026-11-07 ("Approved for merge") and merged in [#10](https://github.com/DdraigFawr13/dfma-review/pull/10). Stress-test gaps (hole joins, exit walls, D-020 units and drafted walls) approved by Morgan 2026-11-07 ("I approve and you can merge") and merged in [#11](https://github.com/DdraigFawr13/dfma-review/pull/11). Pocket edges set and two quick fixes approved by Morgan 2026-11-07 ("Ok approved") and merged in [#12](https://github.com/DdraigFawr13/dfma-review/pull/12). Undercuts set approved by Morgan 2026-11-08 ("I approve. Go with your recommendations", D-021) and merged in [#13](https://github.com/DdraigFawr13/dfma-review/pull/13). The undercut finding (D-021) approved by Morgan 2026-11-08 ("Approved. Merge when ready") and merged in [#14](https://github.com/DdraigFawr13/dfma-review/pull/14). S5 machine and setups, set 3, and D-022/D-023 (Machine plan panel, Passed list, selectable setups; a selected setup lights the faces its tools cut, countersink cones included, per Morgan's follow-up) approved by Morgan 2026-11-08 ("Approved, merge when ready") and merged in [#15](https://github.com/DdraigFawr13/dfma-review/pull/15). Next: S6 turning, on a new branch.

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ✔ Spec the first usable version (D-007, 6 fresh checks, $1.49).
- ▶ Build slice by slice: ✔ S1 read and view · ✔ S2 holes · ✔ S3 pockets · ✔ S4 thin walls · ✔ grading spike (#8) · ✔ recognition rounds 1-6 and bull-nose/draft (#9) · ✔ tapered holes (#10) · ✔ stress-test gaps (#11) · ✔ pocket edges (#12) · ✔ undercuts set (#13) · ✔ undercut finding (#14) · ✔ S5 machine and setups, set 3 (#15) · ▶ S6 turning · S7 report and PDF.
- ○ Assemblies and DFA · history and compare · time and $.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-08 S6 turning on `s6-turning` (Morgan: "begin s6 … research on turning … then report … I approve of whatever report it comes up with"). Research [page](https://claude.ai/artifact/W671Yt2gJgDqrfgf6iC3RH) (`docs/research/turning.html`; 2 research agents, 244k tokens, 4 key sources re-fetched and confirmed): spec limits sit inside the sourced ranges; 5 proposals listed, none built. Built per spec: `turning.py`, profile/groove/bore in `features.py`, `rules/turn_axis.py`, `turn_slender.py`, `turn_offaxis.py`, `[turning]` in tools.toml, `[*.turn_slender]` in thresholds.toml, lathe plan in the Machine plan panel (D-023), 5 test parts, `test_turning.py`, browser `test_lathe_plan.py`. Settled-at-build notes in the spec's S6. Checks: 576+ service, 6 unit, 21 browser. Demo [updated](https://claude.ai/artifact/D3bfwpowEhoMCkUzEettYP) with the S6 parts. Draft [PR #17](https://github.com/DdraigFawr13/dfma-review/pull/17); [S6 status](https://claude.ai/artifact/4k6NRVgis3yhnBCFXF9yEg), [lathe plan mock-up](https://claude.ai/artifact/XceFs75tHjeEpzhxZ9tZ6o) (`mockups/lathe-plan.html`; fresh check 46,828 tokens, 1 major and 3 minor, all fixed). Open: the research's 5 proposals, asked one at a time (WS-03); Morgan's approval of S6.

- 2026-11-06 Phone pages for Morgan: [S1 status](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu), [view-only demo](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) (to S4; S5 on: the new demo above, `python scripts/make_demo.py <out.html>` after `npm --prefix web run build`).

## Next

1. Done 2026-11-07: 500-part MFCAD++ run from Morgan's Drive copy (QUB zip, 1,615,810,586 bytes; test split unpacked to `tests/grading/.cache/mfcadpp/`). Face recall holes 536/602 (89.0%), pockets 3,205/3,745 (85.6%), precision 99.8% / 99.7%; 545 of 606 misses are features cut by another feature. Morgan can turn off the Drive link sharing. The Hugging Face access request is still open; not needed now.
2. Done 2026-11-07 (Morgan asked for all three tools on all parts): [head-to-head page](https://claude.ai/artifact/YAAEriC8gktJkGi5VtNvhq) v2, all through `grade.py --engine`. On 500 parts holes found 536 / 586 / 530 of 602 (ours / Quiddity / Analysis Situs), pockets 3,205 / 3,352 / 3,641 of 3,745; we make the fewest wrong calls. v1 of the page compared unlike numbers (LESSONS "reports" x2, now an AGENTS.md rule). Envs in git-ignored `tests/grading/.cache/`: `qenv` (Quiddity), `as-env77` + `as-build/build/as_recognize` (OCCT 7.7.2; 7.8+ fails on the old hasher API).
3. Recognition (D-018), status at the #9 merge, on the 500 parts: holes 12 missed (target 14: met) and 0 wrong; pockets 84 missed (target 93: met) and 1 wrong (chamfer face, `11654`); O-ring faces called holes 16 (13 on `12118`, a groove round a hexagonal post) and pockets 0; slots called pockets 5 (`10020`, a 10.6 deg wedge) plus 25 shaped like a pocket beside a step (D-019: count as pockets). Check set: holes 23/0, pockets 113/1, O-ring 30/0, slots 15 + 5 shaped. Bull-nose/draft set (31 parts): pockets 259/259, holes 8/10 (the 1 deg tapered recess; Analysis Situs reads cone hole walls), 0 wrong. Each round: NIST and EDMR tests first, then `python tests/grading/grade.py mfcadpp tests/grading/.cache/mfcadpp --limit 500` and `--skip 500 --limit 500`, and the set `tests/grading/sets/bullnose_draft`, each with `python tests/grading/summary.py <out>.json`; then republish the [head-to-head page](https://claude.ai/artifact/YAAEriC8gktJkGi5VtNvhq) (source not in the repo: Artifact read, build on it). Other tools on the set: `--engine quiddity --python tests/grading/.cache/qenv/bin/python --faces constituent` and `--engine situs --situs-bin tests/grading/.cache/as-build/build/as_recognize`; their MFCAD++ numbers stay fixed. A fresh container: MFCAD++ from Morgan's Drive share (file id `1oUEB_d-gN64i4lfXYIaFEJVKWOqzE6pz`, `drive.usercontent.google.com/download?id=...&export=download&confirm=t`, 1,615,810,586 bytes; unpack `MFCAD++_dataset/step/test/*.step` into `tests/grading/.cache/mfcadpp/`), then `bash tests/grading/others/setup.sh` (about 10 min) for the other tools.
3a. Now: the [stress test](https://claude.ai/artifact/4oufpheC26VYYwT2zBiiHs) gaps. Done: chamfered counterbores, crossing holes, radial cross hole (hole_joins set). Done too: no wall is measured to a face the hole opens onto (`_NearRays`; d6 into a 70 deg slope gave 0.075 mm; EDMR socket x3 scorecard -1 wall each; weldment, mohne, nasty_cheese lose 0.000-0.024 in invented walls). Done: cm/m files metric, no-unit file noted, walls up to 15 deg from parallel (D-020; `test_units.py`, `test_drafted_walls.py`; NIST and EDMR gain only walls 3.2 mm and over, no finding changes). All 7 merged in #11. Done: set 2, undercuts and T-slots (Just done). Done: set 3 (hole ends and walls) with S5. Still open from the stress test: the O-ring round a hex post, drafted stock boxes, all-NURBS files. Per-round scoring: also `tests/grading/sets/hole_joins`, `pocket_edges`, `undercuts` and `hole_ends_walls`. `test_nist` ctc_02 now 7-8 s under load (classifier built once).
4. NIST library merged in [#5](https://github.com/DdraigFawr13/dfma-review/pull/5) (069ef55).
5. Morgan: S1 device check on their PC is still owed (VER-07): build the environment, `python -m dfma start`, upload `tests/parts/box_through_hole.step`, rotate. Steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu).

## Open questions


- Settled 2026-11-07: labels are pins (D-017); the scoring spike runs in a new session before S5 (Morgan: "We do the grading and testing in a new session before s5"). Research totals: 384,128 agent tokens (methods, labels, GitHub). S4 took 1 h 58 min to the first approval ask, $6.19 main session.
- Backlog (Morgan, 2026-11-06): name each hole's type (through, blind, counterbore, countersink, drill point, threaded); recognise threads modelled as ring faces (NIST FTC 10's threaded hole is missed); catalogue NIST resources and commit the papers (research agents running).

- After the project (Morgan, 2026-11-08: "I want it at the end of a project"): G-code for each operation with a live toolpath view; research open-source CAM first (to check: FreeCAD CAM, OpenCAMLib, Kiri:Moto, CAMotics) and its licences. [Concept](https://claude.ai/artifact/WnAU2EvXV5q3qHrJWdc5sp) (`mockups/gcode-concept.html`, illustrative feeds).
- Nice to haves after the project is complete (Morgan, 2026-11-06), from the [research page](https://claude.ai/artifact/S2TDMa3VjXmz4AD7kUt1zm): waivers per finding, shop profiles, change review (rev A vs B, thinnest wall and smallest corner re-measured), comments and sign-off per finding, FMEA row export.

- GitLab at work: are there CI runners, and can they download packages? Ask IT before the move (D-006).
- Which CAD exports the test STEP files (Inventor version): unknown; public models first.

## Brainstorm trial (master D-048)

- 2026-11-06: 4 concepts; dropped with reasons: yes; kill criteria: yes; rounds: 1; measured agent cost $0.74; measure 2 (design round 1 asked nothing the brief answered): yes, every question came from the brief's open list; measure 3 (concept survived design unchanged): yes (Morgan, 2026-11-06: "Yes").

## Decisions since the last plan update

- 2026-11-08 D-024: screenshots on Morgan's pages fit the screen and zoom on tap, taken at 2×.
- 2026-11-08 D-023: Machine plan panel, a Passed list with the math (collapsed by default) and selectable setups with a why; all approved and merged in #15.
- 2026-11-08 D-022: countersinks recorded on the hole and planned as a tool load; full-round depth for sloped exits; a hole on a pocket floor keeps its own axis.
- 2026-11-08 D-021: undercut pockets get a finding (needs a T-slot or lollipop cutter); sealed voids get none.
- 2026-11-06 Concept chosen (D-001). Full master setup with web-app layer (D-002).
- 2026-11-06 S1 build: extra packages and micromamba (D-008); slices shown as status page + demo (D-009); S1 merge approved.
- 2026-11-06 First-version scope (D-003), stack (D-004), rules and units (D-005), company-move gates (D-006), spec approved (D-007).
