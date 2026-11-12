# Steps and slots S1: build attempt and the target check (2026-11-12)

Spec: [`docs/specs/steps-slots.md`](../../specs/steps-slots.md) (D-079, D-081). Branch `ccr-32792aa1-29h1tl`.

**Result at the time: the target rule fails on both MFCAD++ sets, so S1 stops here for Morgan (spec J4: "A miss stops the slice: the numbers go to Morgan; the target is not lowered").** Holes and pockets are unchanged on both sets. On our own 18-part set every step face is found, each step whole, and nothing else is called a step.

**Merged with D-095:** Morgan accepted S1 as measured (round 4) and dropped the recall target for now; the engine work is in the code (PR #64). The earlier text below, which says the engine work is kept as a patch, was true until then. The parity keys were re-frozen with the guarded script (quick 91 files, full 206 more, none refused). `node web/scripts/make-set.mjs steps_slots` rebuilds the set's STEP files, MANIFEST.md and INSTANCES.json; `web/scripts/census-steps.ts` tallies why step faces are missed.

## The target (D-079), measured

Runs: `node web/scripts/grading.mjs grade mfcadpp tests/grading/.cache/mfcadpp --limit 500 --jobs 4` (first set) and `--skip 500 --limit 500` (check set); `node web/scripts/grading.mjs summary <out>.json` prints the step line and the target. Step face recall must be at least the pocket face recall of the same run, with 0 faces wrongly called a step.

- Rule as the spec wrote it, first set (721 s): steps 2,474 of 2,759 faces, but wrong calls on class 19 slots (80 faces), triangular pockets (13: 19), chamfers (0: 14), class 6 (4), class 18 (2), others (13). The spec's "First" check (step calls on 5, 6, 7, 17-19, stock) is over 0, so the rule went back for changes 1 and 2 below.
- Version A (changes 1-4), first set (680 s): steps 2,452 / 2,759 (88.9%) vs pockets 3,667 / 3,745 (97.9%); 26 wrong faces (chamfer 14, class 6 6, class 4 3, class 13 3), 0 on stock. Check set (697 s): steps 2,376 / 2,629 (90.4%) vs pockets 3,760 / 3,872 (97.1%); 39 wrong (chamfer 23, class 13 6, class 15 4, class 2 3, class 3 2, class 23 1).
- Version B (A plus change 5), first set (691 s): steps 2,375 / 2,759 (86.1%); 21 wrong (chamfer 13, class 4 3, class 13 3, class 6 2). Check set (698 s): steps 2,284 / 2,629 (86.9%) vs pockets 97.1%; 29 wrong (chamfer 15, class 13 6, class 15 4, class 2 3, class 23 1).
- Holes and pockets on every run: first 590 / 602, 0 wrong and 3,667 / 3,745, 1 wrong; check 643 / 666, 0 wrong and 3,760 / 3,872, 1 wrong: the baseline exactly.
- V-groove (5) and round-bottom (7) slots: no step call on any run (first: 103 and 78 faces; check: 130 and 80).

## Round 4 (2026-11-12, D-094): quarter-round notches and knife edges (in the patch now)

Morgan chose option A after the round 3 page. Each change was measured on the full first set before it stayed (the 500-part runs take about 11 min each).

12. A floor whose walls are exactly one flat face and one cylinder gets a wall-arc limit of 181 deg instead of 150 (`SECTOR_ARC_MAX_DEG`). That shape is MFCAD++'s circular blind step (a quarter-round notch with one flat side, e.g. `11074`, floor 23). A blanket limit of 181 for every floor added 95 wrong faces (79 on excluded labels): round-ended slots (class 19: two cylinders and a flat) also span 180 deg. With the narrow rule, the only new calls were the 5 three-face class 21 features (15 faces) and no class 19 call.
13. The open-floor search no longer rejects a step for a knife edge (a cylinder wall and a slot wall meeting at a convex edge with exactly opposite normals, a zero-thickness blade of stock; `10314`, `10627`, `10683`, `11905`). Pockets keep their knife-edge rule. Switching it off added no wrong face on the first set.

- First set: steps 2,477 / 2,636 (94.0%, was 92.5%) vs pockets 97.9%; 16 wrong (unchanged); class 21 335 / 351 (was 302). Not steps: tilted 79, u-slot 41 (was 36), side 3.
- Check set: steps 2,418 / 2,545 (95.0%, was 93.1%) vs pockets 97.1%; 25 wrong (unchanged); class 21 291 / 307. Not steps: u-slot 26 (was 21), tilted 55, side 3.
- The u-slot line grew by 5 faces on each set: with the knife test gone, some class 22 U-shaped notches now show the blind-slot shape D-093 leaves out, so their faces moved from the recall count to that line. This is a scoring side effect, not a call.
- Holes and pockets unchanged on both sets. Target: FAIL on both (recall short by 3.9 and 2.1 points; wrong faces 16 and 25).
- `vitest` on `src/grading`, `src/engine/features`, `steps_slots`, `umd_counts`: 75 pass, 2 fail (the round 2 pair, base2 and regli_pathological1). Not run: `npm run check`, `parity:refreeze`, EDMR, timed CTC 02. The two changes have no unit test of their own (no part with a quarter-round notch or a knife edge in the step test set).
- Not fixable by a shape rule (traced): class 21 cylinders 1.2 mm wide that are the remains of a step another feature cut away (`10190` face 32); class 8 faces split from their floor by an O-ring groove (`10127` face 4).
- What is left on the first set (159 missed faces): sloped-neighbour floors (about 28 on-axis), class 21 wall arcs of 150 deg or more beyond the new pair (10), class 8 floors with no wall (14), class 22 (20), two or more runs. Then the 16 wrong faces: chamfers 5, class 6 6, class 4 3, class 13 2.

## Round 3 (2026-11-12): census of the misses, V-floors scored as tilted (in the patch now)

Fresh container: patch applied, MFCAD++ test split re-downloaded from Morgan's Drive copy (1,615,810,586 bytes, size matched), baseline first set reproduced round 2 exactly (2,444 / 2,677, 16 wrong).

**Census** (`web/scripts/census-steps.ts`, in the patch): reruns every step-class miss with the open-floor diagnostic on and tallies why. The 233 missed faces of the first set:

- 99 are planes off the part axes (classes 9: 41, 10: 15, 20: 39, 21: 2, 8: 2). D-093 already leaves tilted floors out, but the diagnostic only noted one after the wall search succeeded.
- "material past edge" (Terms, "Open edge") is the most common reason a floor is rejected: about 110 faces, mostly a neighbour sloping 35 to 60 deg; the rule that removed the class 19 wrong calls (change 1), so relaxing it needs its own test.
- Class 21: 15 faces never a floor or wall candidate, 15 wall arc 150 deg or more, 9 knife edge. Class 8: 14 floors with no wall. A class 8 face on an O-ring cylinder (`10015` face 20) is a disc another feature consumed; no shape rule finds it.
- A gap with no direction into the floor (`into` null) hit 1 face only: not a lever.

**Change 11 (scoring only, engine results unchanged):** a V-floor, two planes off the part axes meeting at a concave edge with no flat on-axis floor beside either, goes on the "not steps (D-093)" tilted line. A first version without the "no floor beside" test also took 24 class 20 and 2 class 8 faces that are a notch's diagonal walls standing on a floor; those stay.

- First set: steps 2,444 / 2,641 (92.5%) vs pockets 97.9%; 16 wrong; not steps: tilted 79 (was 43), u-slot 36, side 3. Misses by class: 8 24, 9 60, 10 11, 20 30, 21 49, 22 23.
- Check set: steps 2,375 / 2,550 (93.1%) vs pockets 97.1%; 25 wrong; not steps: u-slot 21, tilted 55 (was 29), side 3.
- Holes and pockets unchanged on both. Target: FAIL on both (recall, wrong calls).
- `vitest` on `src/grading`, `src/engine/features`, `steps_slots`, `umd_counts`: 75 pass, 2 fail (umd base2, regli_pathological1: the round 2 pair). The V-floor line has no unit test of its own (no V-groove part in the set); it is measured on the two runs only. Not run: `npm run check`, `parity:refreeze`, EDMR.
- Reading: scoring cannot close the gap. 197 first-set faces are still missed and 16 wrong, mostly sloped-neighbour floors, class 21 circular steps and chamfers. The target needs either engine rules that each risk wrong calls or Morgan changing the target (spec J4: the target is not lowered by us).

## Round 2 (2026-11-12): in the patch

Morgan approved the round ("I approve all"). Two changes, each measured on the 193-part dev set (the first-set parts with misses or wrong calls, plus 60 others) before the full runs:

9. A chamfer beside another wall (a flat wall under half as wide across the floor normal as it runs along it, turning under 60 deg from a neighbour at an outside edge) is kept out of the step's faces (D-093). A chamfer-shaped wall that is a step's only wall stays: MFCAD++ calls such a notch a triangular blind step (20). Dev set: wrong faces 26 to 16 (chamfers 14 to 5), right faces 1,038 to 1,029. Dropping every chamfer-shaped wall instead cost 32 right faces, 18 of them class 20.
10. Two step floors on one plane whose single walls face each other across them are one slot's pieces (a channel floor broken into strips by grooves or cross holes), and so is a step seen from one of those walls. No change on the dev set; UMD base1 and socket2 now agree.

- First set (690 s): steps 2,444 / 2,677 (91.3%) vs pockets 97.9%; 16 wrong (chamfer 5, class 6 6, class 4 3, class 13 2); not steps: tilted 43, u-slot 36, side 3.
- Check set (690 s): steps 2,375 / 2,576 (92.2%) vs pockets 97.1%; 25 wrong (chamfer 11, class 13 4, class 15 4, class 2 3, class 3 2, class 23 1); not steps: u-slot 21, tilted 29, side 3.
- Holes and pockets unchanged. Target: FAIL on both.
- UMD: 9 of 11 agree. base2 finds 3 of 7 labelled steps: UMD labels its four lower floors steps between two slots, the arrangement it leaves unlabelled in base1, so change 10 fixes one and breaks the other. regli_pathological1 finds 1 step where UMD labels a slot (S2 will name slots).
- `npx vitest run` (web): 936 pass, 2 fail (umd_counts base2, regli_pathological1).
- Next round: misses by class on the first set (8 26, 9 63, 10 23, 20 49, 21 49, 22 23); wrong class 6 (a through slot's faces, S2's step-or-slot question) and class 13.

## D-093 scoring (2026-11-12): superseded by round 2

Morgan: tilted floors, side-only notches and vand1's steps are not steps; UMD corners are; chamfers beside a step are wrong. The finder has a grading-only diagnostic (`OPEN_DIAG` in `features/pockets.ts`, off in the app) that records those shapes, and blind-slot-shaped U's (4 flat faces, 3 walls, 1 open edge); the scorer leaves labelled step faces of those shapes out of the step count unless they are called steps, on a "not steps (D-093)" line (`score.test.ts` tests it). The engine's results do not change.

- First set (676 s): steps 2,459 / 2,678 (91.8%) vs pockets 97.9%; 26 wrong; not steps: tilted 42, u-slot 36, side 3. Misses by class: 8 26, 9 58, 10 23, 20 44, 21 49, 22 19.
- Check set (654 s): steps 2,383 / 2,577 (92.5%) vs pockets 97.1%; 39 wrong; not steps: tilted 28, u-slot 21, side 3.
- Holes and pockets unchanged. Target: FAIL on both (recall, and wrong calls, chamfers the largest group: 14 and 23).
- UMD (`umd_counts.test.ts`, `[Corner]` counted with steps, vand1 a known difference): 7 of 11 agree; base1 9 found (3 labelled), base2 13 (7), regli_pathological1 1 (0), socket2 8 (4) are over-calls to work on.
- Tests: `steps_slots`, `runs`, `refreeze-mask` 47 pass; `score.test.ts` 26 pass.

## After the audit (D-092, 2026-11-12): superseded by D-093 scoring

The audit (`docs/audit/2026-11-12-design.md`, PR #63) found six high items; Morgan: "Do as you recommend".

- Changes 7 (tilted floors) and 8 (floors reached from a side) are out of the patch until Morgan decides their scope: D-081 keeps steps on a floor along a part axis (audit F2, F3).
- `runs()` starts at an open edge, so a run no longer depends on where the wire starts; `web/src/engine/features/runs.test.ts` failed on the old code (2 of 4) and passes (audit F7).
- The re-freeze masking is in `web/src/engine/refreeze-mask.ts`, with 12 tests in `refreeze-mask.test.ts`; a planted loose guard fails 2 of them (audit F6).
- CTC 02 (`nist_ctc_02_asme1_ap242-e2.stp`, the spec's 10 s file), two runs each: main 7.1, 6.4, 6.9 and 6.5 s; the patch 8.2, 7.5, 8.2 and 7.4 s. Round 1 with change 7 took 10.3 s (audit F1). The open-floor search costs about 0.9 s of it: edge gaps 0.56 s, walls 0.18 s, reach 0.15 s.
- First set (646 s): steps 2,459 / 2,759 (89.1%) vs pockets 97.9%; 26 wrong (chamfer 14, class 6 6, class 4 3, class 13 3). Check set (665 s): 2,383 / 2,629 (90.6%) vs 97.1%; 39 wrong (chamfer 23, class 13 6, class 15 4, class 2 3, class 3 2, class 23 1). Holes and pockets unchanged. Target: FAIL on both.
- `npx vitest run` (web): 931 pass, 6 fail, all in umd_counts (base1, base2, regli_pathological1, socket1, socket2, vand1).

**U-shaped class 22 against class 17, by shape** (audit F5; first set, every instance whose floor test sees a U): of 13 class 22 instances, 5 (20 faces) have the signature "4 flat faces, 3 walls, 1 open edge", the same as 34 of the 40 class 17 slots. The other 8 have 7 or 10 faces, and 5 of them two open edges; no class 17 instance has either. So only those 5 cannot be told from blind slots by shape, and the round 1 claim that all 13 (79 faces) are alike was wrong. The other 8 are a recall lever for a later round.

## Round 1 (D-091, 2026-11-12): superseded by the audit

Morgan chose more rounds with the target unchanged. A trace of every missed step face (first set, version B: 384 faces in 154 instances) gave the causes; round 1 changed three things:

6. Change 5 (symmetry) is replaced by a narrower test: a floor whose walls all meet it on an inner loop of the wall (a rib or boss standing on a plate) is no step. Change 5 had dropped 112 missed faces; `thin_rib` still gets no step.
7. A tilted floor (off the part axes) is kept when the step has a wall on a part axis (MFCAD++ slanted steps, class 10). Two tilted faces alone, as a V-groove's, are not.
8. A floor no cutter reaches along its normal (material over it: a notch cut into a side face) is kept when a cutter reaches it from an open side along a part axis; the plan cuts it from that side.

- First set (716 s): steps 2,483 / 2,759 (90.0%) vs pockets 97.9%; 33 wrong (chamfer 16, class 6 6, class 14 5, class 4 3, class 13 3).
- Check set (707 s): steps 2,407 / 2,629 (91.6%) vs pockets 97.1%; 45 wrong (chamfer 26, class 13 6, class 15 4, class 2 3, class 3 2, class 14 2, class 6 1, class 23 1).
- Holes and pockets unchanged on both. Target: FAIL on both sets.

**Labels no shape rule can split** (corrected after the audit: see above; measured on the first set, every class 17 and 22 instance, by the shape our floor test sees): class 22 blind steps, 157 instances L-shaped (518 faces) and 13 U-shaped (79 faces); class 17 blind slots, 40 U-shaped (164 faces). A U-shaped class 22 is the same shape as a class 17 slot, as D-019's pocket-shaped slots are, so its 79 faces cannot be called steps without calling the 164 slot faces steps too. With them on their own line (D-019's way), the first set's step recall would be 2,483 of 2,680 (92.6%), still short.

Remaining misses (first set, round 1): about 276 faces: V-shaped floors of class 9 (two tilted faces, material past an edge, about 40), U-shaped class 22 (about 60 with the slot-side drops), knife edges on class 21 (18), quarter-round walls covering 150° or more (18), tilted floors with no wall on an axis (about 40), two or more runs (about 30). Wrong calls: chamfers next to steps are the largest group (16 and 26).

## Changes to the spec's rule (each measured on the 45 first-set parts that had a wrong call)

1. An open edge is one whose gap is air the rays escape from (Terms, "Open edge"). Past an edge where `Enclosure` finds material (a slope, a rounded side), the floor is no open floor. The spec's text already says "its rays escape"; the code had treated material as open. Removed the class 19 calls with change 2.
2. A step's walls must all face one side: the smallest arc holding their outward directions on the floor plane (a flat wall by its normal, a round wall by its normals at its vertices) is under 150° (180 − 2 × 15° draft). This replaces "no facing pair of planar walls" for steps: a class 19 slot seen from its flat end is a U of two round sides (180°), a triangular pocket open at one corner covers 240°. On the 45 parts: wrong faces 127 → 42 (change 1) → 26 (change 2), step faces found 174 → 171 of 211.
3. A cut edge between two pieces of the same flat wall does not split a run (`pk_beside_step`: the pocket cuts the step's wall in two; as written the step was found as two pieces).
4. A step whose faces all lie in a larger step's is dropped (the same step seen from one of its walls).
5. (Version B) A step with a flat wall on a part axis needs one such wall that, seen as a floor, has this floor as a wall (Terms, "Same feature": a step is symmetric). Without it `tests/parts/thin_rib.step` (a plate with a rib on it) gets 4 steps, one per rib side. Costs recall: 88.9% → 86.1% on the first set.

Tried and backed out: a narrow 45° chamfer is no wall (chamfer wrong calls 14 → 3, but triangular steps 32 → 24 of 49 on the 45 parts).

Smaller differences from the spec text:

- `st_l`'s finisher is `em-0.187`: 4.7625 mm / 25.4 is just under 0.1875, and the frozen keys already use `em-0.187` (37 times). The spec wrote `em-0.188`.
- `st_stair`: each step's depth is its own wall's height, 10 mm both (floors 10 and 20 mm below the top).
- Step corners are numbered after the pocket corners, so every pocket corner keeps its id in the parity key.
- `removal` (P1, after the spec) gains each step's volume (`VOLUME_KINDS`, pocket formula), as HANDOFF asked; the re-freeze allow list includes it on step files.
- The removal assumption text still says "each hole's and pocket's own volume": changing it changes every milled key.

## Why step faces are missed (version B, first set: 384 faces in about 120 parts)

All missed faces are called nothing (no hole or pocket takes them). A trace of 40 sample parts (`openFloor`/`classify` debug lines) gives, per floor tried: a U of walls with a facing pair (13), the floor rejected because its outline has no wall (9), material past an edge (9) or a knife edge (7), two or more runs (7), a wall arc of 150° or more (2), dropped as a slot's side or a subset (4). Some class 9 "2-sided through steps" have floors that are not on a part axis (`10098`: two slanted faces), which the spec leaves out.

## UMD counts (J4), version B

Per part, steps found against labelled steps `s` and opened pockets `o` in `<part>/<part>.fts`; the spec's check is `s <= found <= s + o`.

- Agree (6): bottomless_pocket1 0, polyh_castle 0, socket1-Part 4, socket2-Part 4, swivel1-Part 2, swivel2-Part 2.
- Disagree (5): AES94 2 found (s 3, o 2); base1-Part 2 (s 3); base2-Part 3 (s 7); regli_pathological1 1 (s 0); vand1 0 (s 6).
- vand1: its steps meet the centre hole, so each floor has one wall and a cut edge; the spec keeps the pocket rule "a cut with under two walls is no floor". base1: version A found 9 (each floor strip of a grooved channel, which UMD does not label, read as a step); version B 2.
- socket1: version A found its 4 corner notches too. UMD labels them `[Corner]` (16 in the 11 parts); MFCAD++ labels the same shape a rectangular blind step (22). Counting `[Corner]` with steps is a question for Morgan.

## Checks

- `web/src/engine/port/steps_slots.test.ts`: 31 tests (J1, J3, J4 on the set), pass.
- `web/src/engine/port/umd_counts.test.ts`: fails on the 5 parts above (spec: to Morgan before any exemption).
- `npx vitest run` (web), version B with the list tests updated (drivers, rules run, checks run, rule-to-kind map, the scorer's summary line): 916 pass, 5 fail, all in umd_counts. Version A also failed `plan.test.ts` "no holes or pockets gets one setup" (the 4 `thin_rib` steps), which change 5 removed.
- Not run: `parity:refreeze`, `npm run check`, EDMR, timed NIST CTC 02: the slice stopped at the target.

## Landing (2026-11-12, D-095)

- Morgan chose option B after round 4: S1 accepted as measured, the D-079 recall target no longer gates it. The scorer still prints it.
- `umd_counts.test.ts`: base2-Part (3 found, 7 labelled) and regli_pathological1 (1 found, 0 labelled) are now recorded known differences with their exact counts, like vand1; a planted count of 4 failed the base2 test. S2 names slots.
- Parity re-freeze: quick 91 files and full 206 more changed, none refused (the new Step depth check adds to `rules_run` and `checks_run`; step parts gain step features). After: quick 122 / 122 the same; full 335 compared, 327 the same, 2 known tessellation, 0 different.
- `e2e/steps.spec.ts` test_report_step lists the new "Step depth check: none" after the pocket check.
- Times: `npm run check` 848 s (14 m 8 s) here, under the 900 s budget (D-073) with little room; `npm --prefix web run edmr` 114 pass in 7 m 0 s; `parity:full` 3 m 22 s.
