# Handoff

Updated: 2026-11-08. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Build, first usable version: all seven slices merged. S1 to S6 in #3 to #17 (history in [docs/archive/handoff-2026-11.md](archive/handoff-2026-11.md)). S7 (cost drivers, report and PDF) approved by Morgan 2026-11-08 ("I approve of s7 you can merge that whenever") and merged in [#18](https://github.com/DdraigFawr13/dfma-review/pull/18). Now: planning the Inventor parts phase (Morgan, 2026-11-08: "Start a new session for the inventor parts portion of the plan"), branch `inventor-parts-plan`. Morgan's device check and a real part are still owed (Next 0).

## Plan map

Shown at the start of a session and when asking the owner to approve a PR or a merge (WS-08). One line per step, marked done ✔, now ▶ or later ○.

- ✔ Research (bananaz.ai and similar tools) and brainstorm: 4 concepts, 1 round, staged concept picked.
- ✔ Bootstrap the master harness (#1).
- ✔ Design: `planning-interview`, 2 rounds plus approval (D-003 to D-006).
- ✔ Spec the first usable version (D-007, 6 fresh checks, $1.49).
- ✔ Build slice by slice: ✔ S1 read and view · ✔ S2 holes · ✔ S3 pockets · ✔ S4 thin walls · ✔ grading spike (#8) · ✔ recognition rounds 1-6 and bull-nose/draft (#9) · ✔ tapered holes (#10) · ✔ stress-test gaps (#11) · ✔ pocket edges (#12) · ✔ undercuts set (#13) · ✔ undercut finding (#14) · ✔ S5 machine and setups, set 3 (#15) · ✔ S6 turning (#17) · ✔ S7 report and PDF (#18).
- ○ Assemblies and DFA · history and compare · time and $.
- ▶ Inventor parts (Morgan, 2026-11-08): read `.ipt` files and their feature data; learn the conversion from NIST parts that come as both native and STEP, plus other online sources, and test it. CONCEPT allows it once STEP works. ✔ research ([page](https://claude.ai/artifact/94JciyGLeYsorjas1XCyUw): NIST has 16 `.ipt`) · ▶ planning round 1 · ○ review · ○ approval · ○ spec · ○ build.
- ○ Stage 2 design review · ○ Stage 3 DXF drawing check · ○ Stage 4 DXF drawing generation.

## Just done

- 2026-11-08 Inventor research ([page](https://claude.ai/artifact/94JciyGLeYsorjas1XCyUw), source `docs/research/inventor.html`; 3 agents, key sources re-opened here). NIST has 16 `.ipt` (11 Inventor 2021 in the FTC/CTC CAD zip, 5 Inventor 2024 in STC v4; public domain; CATALOG "Native Inventor files"). An `.ipt` holds an ACIS binary B-rep and the feature tree by name; no free Linux tool reads hole features fully (InventorLoader GPL-2: holes, no threads; HOOPS/ODA/CAD Exchanger: shape only; APS $3 per 12 min after 5 free h). Suggested: own feature reader (olefile) with STEP for shape. Running InventorLoader here was blocked by the permission system (outside code): asked in round 1. Scratch only: `olefile` venv and a FreeCAD env in the session scratchpad. [Round 1 form](https://claude.ai/artifact/UR1pmouDpuSahgVF5v5kbc) (collection `round1`) sent.
- 2026-11-08 S7 merged in [#18](https://github.com/DdraigFawr13/dfma-review/pull/18). Built by the scheduled S7 session (it had no push access; its 2 commits came over as a `git format-patch` artifact, applied unchanged), then merge-reviewed here as Morgan asked: D-030's 3 drivers (`deep_pockets`, `undercuts`, `slender_parts`), `small_tools` = undersized or under 1/8 in (the spec disagreed with itself; D-030), each finding's spot ringed with its id in the PDF, measured/limit in screen units, `snapshot` restores clip planes. jsPDF stays imported up front (the demo inlines one script). Checks: 605 service, 11 web unit, 25 browser; `ctc_02` 6.5-7.3 s alone on main and branch (the S7 session's 9-11 s was that machine's load). Pages: [merge review](https://claude.ai/artifact/HFdCd1XRTBBcuKRNXduFVM), [S7 status](https://claude.ai/artifact/NWXp1Q7Qrcrui9JsXTtS73), [mock-up](https://claude.ai/artifact/WqVAbZncGYRRv8ePEzj4Ud), [demo](https://claude.ai/artifact/D3bfwpowEhoMCkUzEettYP). The S7 session's branch exists only in its container; nothing there is unmerged.

- 2026-11-06 Phone pages for Morgan: [S1 status](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu), [view-only demo](https://claude.ai/artifact/KnnLF3YAHp5ZCmNuVWyvP4) (to S4; S5 on: the new demo above, `python scripts/make_demo.py <out.html>` after `npm --prefix web run build`).

## Next

0. Now: Morgan fills [Inventor round 1](https://claude.ai/artifact/UR1pmouDpuSahgVF5v5kbc), then the review round (`planning-interview`). Also: (a) Morgan runs S1 and S7 on their PC (VER-07; steps on the [S1 status page](https://claude.ai/artifact/Psqfsq9d3oL7641H1Hmggu)) with one real STEP part (spec open question 1); (b) offer an `audit` of the first version (VER-09); (c) plan the next phase with `planning-interview` (plan map: assemblies and DFA, history, time and $; or Inventor parts).
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

## Brainstorm trial (master D-048)

- 2026-11-06: 4 concepts; dropped with reasons: yes; kill criteria: yes; rounds: 1; measured agent cost $0.74; measure 2 (design round 1 asked nothing the brief answered): yes, every question came from the brief's open list; measure 3 (concept survived design unchanged): yes (Morgan, 2026-11-06: "Yes").

## Decisions since the last plan update

- 2026-11-08 D-030: cost drivers after turning: bore_depth is a deep hole; new drivers deep_pockets, undercuts, slender_parts; small_tools counts undersized or under 1/8 in.
- 2026-11-08 D-029: roughing then finishing tools (pockets: largest end mill ≤ 75% of the width; turning and bores: rough + finish); pins stand on stems.
- 2026-11-08 D-028: Milling warns on a part that looks turned; the plan shows stock and numbered operations; demo opens turning parts on Turning.
- 2026-11-08 D-027: a part-wide pin moves off small findings (amends D-017); `flange_bolt_hole` test part.
- 2026-11-08 D-026: turning research proposals 2-5 approved together: support named, `bore_depth` (4×/6×), inside-groove note, slender by smallest diameter.
- 2026-11-08 D-025: turning slender warning over 3.0× for the steels, 4.0× for aluminium and plastic; high over 8.0× (research proposal 1).
- 2026-11-08 D-021: undercut pockets get a finding (needs a T-slot or lollipop cutter); sealed voids get none.
- 2026-11-06 Concept (D-001), master setup (D-002), S1 packages (D-008), status page + demo (D-009).
- 2026-11-06 First-version scope (D-003), stack (D-004), rules and units (D-005), company-move gates (D-006), spec approved (D-007).
