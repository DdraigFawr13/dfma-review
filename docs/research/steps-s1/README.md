# Steps and slots S1: build attempt and the target check (2026-11-12)

Spec: [`docs/specs/steps-slots.md`](../../specs/steps-slots.md) (D-079, D-081). Branch `ccr-32792aa1-29h1tl`.

**Result: the target rule fails on both MFCAD++ sets, so S1 stops here for Morgan (spec J4: "A miss stops the slice: the numbers go to Morgan; the target is not lowered").** Holes and pockets are unchanged on both sets. On our own 18-part set every step face is found, each step whole, and nothing else is called a step.

The engine work is kept as a patch, [`s1-wip.patch`](s1-wip.patch), so `main` stays green (GIT-05): `git apply docs/research/steps-s1/s1-wip.patch`, then `node web/scripts/make-set.mjs steps_slots` rebuilds the set's STEP files, MANIFEST.md and INSTANCES.json (left out of the patch; the script makes the same files every run).

## The target (D-079), measured

Runs: `node web/scripts/grading.mjs grade mfcadpp tests/grading/.cache/mfcadpp --limit 500 --jobs 4` (first set) and `--skip 500 --limit 500` (check set); `node web/scripts/grading.mjs summary <out>.json` prints the step line and the target. Step face recall must be at least the pocket face recall of the same run, with 0 faces wrongly called a step.

- Rule as the spec wrote it, first set (721 s): steps 2,474 of 2,759 faces, but wrong calls on class 19 slots (80 faces), triangular pockets (13: 19), chamfers (0: 14), class 6 (4), class 18 (2), others (13). The spec's "First" check (step calls on 5, 6, 7, 17-19, stock) is over 0, so the rule went back for changes 1 and 2 below.
- Version A (changes 1-4), first set (680 s): steps 2,452 / 2,759 (88.9%) vs pockets 3,667 / 3,745 (97.9%); 26 wrong faces (chamfer 14, class 6 6, class 4 3, class 13 3), 0 on stock. Check set (697 s): steps 2,376 / 2,629 (90.4%) vs pockets 3,760 / 3,872 (97.1%); 39 wrong (chamfer 23, class 13 6, class 15 4, class 2 3, class 3 2, class 23 1).
- Version B (A plus change 5), first set (691 s): steps 2,375 / 2,759 (86.1%); 21 wrong (chamfer 13, class 4 3, class 13 3, class 6 2). Check set (698 s): steps 2,284 / 2,629 (86.9%) vs pockets 97.1%; 29 wrong (chamfer 15, class 13 6, class 15 4, class 2 3, class 23 1).
- Holes and pockets on every run: first 590 / 602, 0 wrong and 3,667 / 3,745, 1 wrong; check 643 / 666, 0 wrong and 3,760 / 3,872, 1 wrong: the baseline exactly.
- V-groove (5) and round-bottom (7) slots: no step call on any run (first: 103 and 78 faces; check: 130 and 80).

## Round 1 (D-091, 2026-11-12): in the patch now

Morgan chose more rounds with the target unchanged. A trace of every missed step face (first set, version B: 384 faces in 154 instances) gave the causes; round 1 changed three things:

6. Change 5 (symmetry) is replaced by a narrower test: a floor whose walls all meet it on an inner loop of the wall (a rib or boss standing on a plate) is no step. Change 5 had dropped 112 missed faces; `thin_rib` still gets no step.
7. A tilted floor (off the part axes) is kept when the step has a wall on a part axis (MFCAD++ slanted steps, class 10). Two tilted faces alone, as a V-groove's, are not.
8. A floor no cutter reaches along its normal (material over it: a notch cut into a side face) is kept when a cutter reaches it from an open side along a part axis; the plan cuts it from that side.

- First set (716 s): steps 2,483 / 2,759 (90.0%) vs pockets 97.9%; 33 wrong (chamfer 16, class 6 6, class 14 5, class 4 3, class 13 3).
- Check set (707 s): steps 2,407 / 2,629 (91.6%) vs pockets 97.1%; 45 wrong (chamfer 26, class 13 6, class 15 4, class 2 3, class 3 2, class 14 2, class 6 1, class 23 1).
- Holes and pockets unchanged on both. Target: FAIL on both sets.

**Labels no shape rule can split** (measured on the first set, every class 17 and 22 instance, by the shape our floor test sees): class 22 blind steps, 157 instances L-shaped (518 faces) and 13 U-shaped (79 faces); class 17 blind slots, 40 U-shaped (164 faces). A U-shaped class 22 is the same shape as a class 17 slot, as D-019's pocket-shaped slots are, so its 79 faces cannot be called steps without calling the 164 slot faces steps too. With them on their own line (D-019's way), the first set's step recall would be 2,483 of 2,680 (92.6%), still short.

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
