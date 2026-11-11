# Steps and slots

- **Status:** Draft
- **Planned in:** [round 1](https://claude.ai/artifact/2NiJeW3rhomfLQSDeVzDhY), [review](https://claude.ai/artifact/1DwcDhFZcZVzxisd3QTqcy) (2026-11-11). **Decisions:** D-066, D-068, D-075, D-079 (D-018, D-019, D-029, D-052 apply).

## Problem

Morgan: steps and slots are "going to be used to better define all features of a part and eventually be used for drawing creation automation", and should be "equivalent to holes and pockets in terms of score and getting features right". An earlier try in another copy "did well for the parts I had but it was not thorough in testing so I want it redone here".

Today the pocket finder drops every floor with an open side: `pocketWalls` (`web/src/engine/features/pockets.ts:269`) returns `null` when an edge has a neighbour face but no wall and `Enclosure.inside` finds the gap open to the outside (`pockets.ts:285-288`). So a step or slot gets no feature, no setup, no tool and no finding.

## Terms

- **Open edge:** a floor edge with a neighbour face, where no wall, floor chamfer or blend leads up and `Enclosure.inside` is false (its rays escape the part). Prototyped 2026-11-11 on a block with a step and a slot: rays escape through the open sides and hit the closed end and the far wall.
- **Open floor:** a planar floor, not a hole or pocket face, whose normal is a part-frame axis (`frameDir` not null), with at least one open edge and at least one wall; every other edge is a wall, blend, floor chamfer or an edge cut by another feature (`inside` true). The axis rule keeps a 90° V-groove (two faces at 45°, each a wall of the other) from reading as a step.
- **Same feature:** a step is symmetric: its wall, seen as a floor, has the floor as its wall. Open floors that give the same face set are one feature; its floor is the face whose normal comes first in `ORDER` (`plan.ts:12`) in the part frame, and the feature names it in a `floor` field (face id). `depth` is measured along that floor's normal. All open floors are classified first; a step whose faces all lie in a slot's face set is dropped (a slot's side wall, seen as a floor, has the slot floor as its one wall). This runs in S1 too, where slots are classified but not emitted.
- **Run:** the floor's walls in order round its outer wire, split wherever an open edge or a cut edge (`inside` true) comes between them. A U (side, end, side) is one run; two walls with open edges between them at both ends are two runs.
- **Facing pair:** two planar walls whose normals, projected on the floor plane, point at each other within 2 × `DRAFT_MAX_DEG` (30°), with the floor between them.
- **MFCAD++ classes** (`tests/grading/sets/undercuts/make.py` names them): 5 triangular (V) through slot, 6 rectangular through slot, 7 circular (round-bottom) through slot, 8 rectangular through step, 9 2-sided through step, 10 slanted through step, 17 rectangular blind slot, 18 vertical circular end blind slot, 19 horizontal circular end blind slot, 20 triangular blind step, 21 circular blind step, 22 rectangular blind step.
- **UMD:** the University of Maryland benchmark parts in `tests/edmr/models/UMD`, with `.fts` feature lists (`docs/nist/CATALOG.md:40`).

## Goals

- Steps (MFCAD++ 8-10, 20-22) and slots with a floor (6, 17-19) are found as features with the sizes a drawing needs.
- The plan reaches each from the right directions and lists its end mills.
- Steps and slots get the deep check; a slot deeper than 6× its width is a medium finding.
- **Target rule (D-079)**, on both 500-part MFCAD++ sets, each in one run: step face recall and slot face recall each at least the pocket face recall of the same run; 0 faces wrongly called step or slot (precision misses plus `claimed_on_excluded` step and slot); holes and pockets no worse than the baseline, counted on the labels the baseline scored (so classes 17-22 leave the pocket comparison).

**Baseline**, today's engine (`node web/scripts/grading.mjs grade mfcadpp tests/grading/.cache/mfcadpp --limit 500 --jobs 4`, 716 s), measured 2026-11-11: holes 590 of 602 faces (12 missed, 0 wrong); pockets 3,667 of 3,745 (78 missed, 1 wrong, label 0); slot-shaped-as-pocket 25 (D-019); slot-step-as-pocket 5 (pocket calls on 17-22 faces, all on part 10020); o-ring-as-hole 16. Check set (`--skip 500 --limit 500`): 750 s; holes 643 of 666 (23 missed, 0 wrong); pockets 3,760 of 3,872 (112 missed, 1 wrong); slot-shaped-as-pocket 5; slot-step-as-pocket 15; o-ring-as-hole 30; class 5, 130 faces in 38 parts; class 7, 80 in 46.

## Non-goals

- V-groove (5) and round-bottom (7) through slots: no floor. First 500 parts: class 5, 103 faces in 38 parts; class 7, 78 in 47. Reported on a `floorless` summary line, outside the target, until their own work (D-079).
- Interacting slots (two slots crossing, a slot running into a pocket): their floors split or merge into shapes the table gives no call; later, with measured cases.
- Steps and slots on a floor that is not a part-frame axis (an angled face): no call, as V-grooves.
- Screens, model colours and the PDF section until S3, after the UI fixes (D-076, D-078) merge.
- The closed-pocket ramp note, T-slot and dovetail names and cutters, keyways, horizontal mills and side-and-face cutters (D-079).

## Journeys and checks

Checks in `web/src/engine/port/steps_slots.test.ts` run in `npm run check` (the default vitest run takes `src/**` except the files `web/vite.config.ts:71` excludes). Each names a part of `tests/grading/sets/steps_slots/`; block 100 × 60 × 30 mm, top at z = 30, file axes.

### J1 Steps (S1)

- `st_through`: a step 15 wide (y 0-15) and 10 deep along the whole X length. **Then** one `step` feature holding the floor and wall faces; its `floor` is whichever of the z = 20 face and the y = 15 face has its direction (`frameDir` of file +Z, file −Y in `result.part.frame`) first in `ORDER`, which the test computes; `depth` is 10 for the first, 15 for the second (part axes differ from file axes on 41 of 42 sample parts, D-078); `open_edges` 3; `open_dirs` equal to `[frameDir(file +Z), frameDir(file −Y)]` from `result.part.frame`; one tool, `em-1.000` (no inside corner, so the finisher is the 1 in end mill and no rougher is listed).
- `st_l`: an L step at the +X −Y corner, 20 × 15, 10 deep, its two walls meeting in a 3 mm radius. **Then** `open_dirs` the floor's only (two wall planes); tools `em-1.000` (rougher) and `em-0.188` (3/16 in: radius 2.38 fits 3 mm; 1/4 in's 3.175 doesn't, `PICK_TOL_MM` 0.001); one `corner` feature linked to the step (its `pocket` field holds the step's id); no `corner_radius` finding (10 ÷ 4.76 = 2.1, under 4; radius 3 over the 1/32 in minimum).
- `st_deep`: an L step at the −X +Y corner, 10 × 8, 20 deep, its walls meeting in a 1 mm radius. **Then** (floor and depth as `st_through`, 20 or 10/8) tools `em-1.000` and `em-0.062` (1/16 in, radius 0.79 fits 1 mm); `step_depth` medium (20 ÷ 1.5875 = 12.6, over 3) and `corner_radius` medium (depth ÷ end mill 12.6, over `max_depth_ratio` 4).

### J2 Slots (S2)

- `sl_blind_round`: slot 10 wide, 8 deep, from x = 40 out through +X, round end of radius 5. **Then** one `slot`; `narrowest_width` 10, `depth` 8, `open_ends` 1, `end_type` "round", `end_radius` 5; `open_dirs` the floor's only; tools `em-0.250` (rougher, largest ≤ 0.75 × 10 = 7.5 mm) and `em-0.375` (finisher ≤ 10 mm, radius 4.76 ≤ 5), both on the slot's operations; the plan lists them largest first, as for every setup (`plan.ts:97-100`).
- `sl_blind`: the same with a flat end and sharp corners. **Then** `end_type` "flat"; finisher `em-0.031` marked undersized (as a sharp-cornered pocket today), rougher `em-0.250`; findings `corner_radius` high (sharp) and `slot_depth` medium (8 ÷ 0.79 = 10).
- `sl_through`: slot 10 wide, 8 deep, along the whole X length. **Then** `open_ends` 2, `end_type` "open"; tools `em-0.250` and `em-0.375` (no inside corner).
- `sl_deep`: through slot 4 wide, 26 deep. **Then** tools `em-0.094` (rougher, 2.38 ≤ 0.75 × 4) and `em-0.125`; `slot_depth` medium (26 ÷ 3.175 = 8.2, over 3) and `slot_ratio` medium (26 > 6 × 4).

### J3 Look-alikes (guards: they pass today and must keep passing)

- `st_chamfer` (a 45° 5 mm edge chamfer): no step. `pk_beside_step` (D-019's blind slot closed by one short wall beside a step): one pocket, unchanged. `pk_control` (closed pocket): one pocket, unchanged (expected faces and depth in `MANIFEST.md`, taken from today's engine before any change). `sl_angled` (a slot in a 20° face): no call. `vg_through` (a 90° V-groove along X): no call. In S1 every slot part gets no step call.

### J4 Scores

- On our set (`steps_slots.test.ts` scores it with `groupc-kit.ts` `scoreFile`, as `bullnose_draft.test.ts`): every step face found and 0 wrong from S1; every slot face from S2; each found whole (`INSTANCES.json`). On both MFCAD++ sets: the target rule, printed by `summaryLine` (`score.ts:295`) as PASS or FAIL against `web/src/grading/baseline.ts` (the two baselines above as constants); S1 prints the step half, S2 both. A miss stops the slice: the numbers go to Morgan; the target is not lowered. **Check:** set tests; the two grading runs pasted in the PR.
- UMD: `web/src/engine/port/umd_counts.test.ts` counts `Feature Type: [step]`, `[slot]` and `[Opened Pocket]` in each `<part>/<part>.fts` of the 11 readable parts (AES94, base1-Part, base2-Part, bottomless_pocket1, polyh_castle, regli_pathological1, socket1-Part, socket2-Part, swivel1-Part, swivel2-Part, vand1: 31 steps, 19 slots, 2 opened pockets; bracket1-4-Part, castle and ex1 stop the reader with "memory access out of bounds", measured 2026-11-11). Per part, with `s`, `t`, `o` the labelled steps, slots and opened pockets: S1 checks `s ≤ steps found ≤ s + o`; S2 also checks `t ≤ slots found` and `steps + slots found ≤ s + t + o`. A part that disagrees goes to Morgan with its numbers before any exemption. In `npm run check`; not `timed` (no wall-clock limit); time it.

### J5 Nothing else changes (guard, every slice; passes today)

- `npm --prefix web run parity:refreeze quick` and `full` report no change outside the allowed list (Design, Parity); then `npm run parity` passes on the new key. NIST and EDMR scorecard tests pass (`npm run timed`, `npm --prefix web run edmr`); NIST CTC 02's analysis stays under its 10 s limit (7-9 s today; if over, stop).

### J6 Morgan's view (S3)

- Tap a step or slot row in the Features step: its faces light on the model and its sizes show. Checks come with S3's approved mock-up.

## Decisions

- Kinds `step` and `slot`; no open-pocket kind (D-068).
- Directions: a step's floor direction, plus its wall's when the step has exactly one wall, it is planar, and the wall reach test passes; a slot's floor direction only (D-079).
- Slot tools: rougher the largest end mill ≤ `pocket_width_share` × width, listed unless it equals the finisher; finisher `pickEndMill` as pockets (D-068: "a roughing end mill under its width before the finish"; D-079). Step tools: rougher the largest end mill in `tools.toml`, listed when larger than the finisher; finisher `pickEndMill(minR, ∞)` (D-079).
- Rules `step_depth`, `slot_depth` (pocket_depth's test), `slot_ratio` (depth over 6× width, medium) (D-079).
- The parity key is re-frozen by a script that refuses changes outside an allowed list (this spec).

## Alternatives rejected

- **A second finder pass:** rejected; `Enclosure`, `Rays` setup and `pocketWalls` are private to `pockets()`, and the open floor is found in the same loop. A second pass would rebuild the classifier and rays (2.7 s on CTC 02 before D-019's fix).
- **Return walls plus an open flag from `pocketWalls`:** rejected; `pockets.ts:685` retries a split floor through `floorPieces` when the first call gives no walls or the floor is not reached, so walls plus a flag would skip that retry and lose pockets.
- **Extend `pocket_depth` to steps and slots:** rejected; its title and sentences say "pocket", and its finding ids and rows change on every pocket file.
- **Every open side a setup (D-068 as written):** rejected (D-079).
- **A length-over-width cut between blind slot and blind step:** rejected, measured 2026-11-11: of 33 class-17 blind slots with 4 planar faces in the first 500 parts, 12 are shorter than wide (length ÷ width 0.23 to 9.15). Class 22 blind steps are mostly an L (floor and two square walls, 3 faces), so the run shape separates them.
- **UMD labels by face:** rejected; measured 2026-11-11, on 8 of 11 readable parts some `.fts` points lie on no face (they describe the removed volume).
- **Leave steps and slots out of the parity compare, keep the Python key:** rejected; their setups and tools change `setups`, `operations` and `tools`, which have no kind to filter by, and an unfiltered key that can never change blocks all recognition work after D-074.

## Risks

- New calls on MFCAD++ faces become wrong calls (LESSONS "recognition") → the set first, then NIST and EDMR, then MFCAD++ (D-068).
- Re-freezing makes the key follow the engine → the script refuses any change outside the allowed list, and the PR shows its report; holes and pockets can't move silently.
- Drafted slot walls (up to 15° each) → the facing pair allows 30°, and the width is the shortest distance between the pair.
- Check time: `steps_slots.test.ts` and `umd_counts.test.ts` join `npm run check`; time each before it joins (VER-11) and report against 900 s (D-073).

## Design

### Finder (`features/pockets.ts`)

- `pocketWalls` gains an optional out-list `open: OC[] | null`. Without it (every pocket call) nothing changes. With it (open mode), the branch that returns `null` for a not-enclosed edge with a neighbour (`pockets.ts:285-288`) pushes the edge to `open` and continues; `nb === null` still returns `null`; the `cut && walls.length < 2` and `knifeEdge` returns (`pockets.ts:290-291`) apply as they are.
- In the `pockets()` loop, a floor that gives no pocket after both of `pockets()`'s tries (its own outline, then the `floorPieces` group), so pockets are unchanged, and is not a hole face is retried with an `open` list, walking every outer edge (an open edge no longer ends the walk). With at least one open edge and one wall it is an open floor; `knifeEdge` and `reachable` apply as for pockets.
- `pockets()` returns `[pockets, corners, steps, slots]`; `analyze.ts:77` takes them; `number(steps, "step")`, `number(slots, "slot")`; the features array becomes holes, turned, pockets, corners, steps, slots, walls. `linkCorners` links a corner to a pocket, step or slot by its lowest face.
- Classify an open floor:

| Runs | Call |
|---|---|
| one run, no facing pair | step |
| two runs forming a facing pair, both ends open | slot, `open_ends` 2, `end_type` "open" |
| one run holding a facing pair and one or more end walls between them (no wall outside the pair) | slot, `open_ends` 1, `end_type` "round" when the end wall is one cylinder (`end_radius` its radius), else "flat" |
| anything else (3 or more runs, an island) | no call |

- `open_ends` counts open edges only (a cut end is not open).
- A face set already found is skipped (Terms, "Same feature").
- In S1 a slot row gives no call.
- Fields (as `Pocket`): `kind`, `faces` (floor pieces, walls, blends, corner chamfers), `axis` (floor normal), `open_dirs`, `open_vectors` (floor normal, then one outward unit vector per open edge's direction, deduplicated within 0.5°), `dims_mm`: `depth` (`rimTop`, as pockets), `length` (floor extent along the walls: along the facing pair for slots, along the longest wall's floor edge for steps), `narrowest_width` (slots only: shortest distance between the facing pair, `distShapes`), `min_corner_radius`, `end_mill_mm`, `undersized`, `end_radius` (round end only). Steps carry `open_edges` (count); slots `open_ends`, `end_type`.
- Corners: `corners()` on the walls, as pockets, so `corner_radius` checks them.
- Wall reach test (step side direction): `reachable` along the wall's normal from the wall itself (the same ray test the floor gets, `pockets.ts:299`).
- `end_mill_mm` is `pickEndMill(minR, width)` with the unrounded `minR` (∞ with no inside corner) and `width` ∞ for steps; never from the stored `min_corner_radius`, which is 0 when there are none.

### Every place that lists pocket as a planned kind

Add `step` and `slot` alongside `pocket`: `plan.ts:113`, `rules/access.ts:13`, `turning.ts:37` (stage 4, as pockets), `analyze.ts:92-97` (taken faces and `pocketOnAxis` for off-axis on turned parts), `web/src/engine/port/groupb_common.ts:171` (`PLANNED`), `grading/analyse.ts:123`. `undercut` stays pocket-only.

### Tests that pin today's lists

Update, naming each change in the PR: `port/rules.test.ts` (exact `rules_run`), `port/drivers.test.ts` (driver list), `port/passed.test.ts` (rule to kind), `port/rows.test.ts`, `port/plan.test.ts`, `port/turning.test.ts`, `port/expected.test.ts` with `tests/parts/expected.toml`. Any other test that fails is a finding, not a list to update.

### Plan and tools (`plan.ts`)

`slotTools(f)`: rougher the largest end mill ≤ `pocket_width_share` × `narrowest_width`, listed unless it equals the finisher (unlike `roughTool`, it may be smaller), then `pocketTool(f)`; `pocketTools` and `roughTool` are unchanged. The plan orders tools by `rank` (largest first), so for a slot the list order is not the cutting order; the tool reasons say which tool roughs (assumption: acceptable until S3's screens show cut order). `stepTools(f)`: rougher `endMillsMm().at(-1)` (1 in) when larger than `f.dims_mm.end_mill_mm`, then the finisher. `web/src/findings.ts:120-140` tool reasons (the pocket-only "75% of its gap" reason at 132-137 gets a slot twin): step "the roughing end mill: no wall limits it" / "fits its inside corner"; slot "the roughing end mill: under its width" / "fits its width". `web/src/findings.ts:89` sizes: step "{depth} deep", slot "{width} wide, {depth} deep".

### Rules and settings

- `rules/step_depth.ts`, `rules/slot_depth.ts`: pocket_depth's test, passes and suggestion (`pocket_depth.ts`), on their kind, reading `limits.pocket_depth`, the word "pocket" replaced by "step" or "slot". Registered after `pocket_depth` in `rules/index.ts`. `rows.ts`: `CHECKS` "Step depth check", "Slot depth check"; `SHORTS` "Deep step", "Deep slot"; `SENTENCES` pocket_depth's with the kind word.
- `rules/slot_ratio.ts`: `narrowest_width` > 0 and depth ÷ width > `max_ratio` is medium. `CHECKS` "Slot depth to width check"; `SHORTS` "Slot deeper than 6× its width"; sentence "Depth is {measured} its width. Over {limit} is deeper than most shops cut a slot." with suggestion "Make it wider or shallower, or open one side into a step, if the design allows." `LIMITS["D-068"]` "limit from Protolabs (D-068)". `config/thresholds.toml`: `[<material>.slot_ratio]` `max_ratio = 6.0`, `source = "D-068"`, for al6061, steel1018, ss304, plastic.
- `config/drivers.toml`: `[deep_steps_slots]` label "Deep steps and slots", count "findings", rules `["step_depth"]` in S1, then `"slot_depth", "slot_ratio"` added in S2; weight 1.0, source "estimate", after `[deep_pockets]`.

### Scoring (`web/src/grading/`)

- `score.ts`: `STEP_CLASSES` {8, 9, 10, 20, 21, 22}, `SLOT_CLASSES` {6, 17, 18, 19}; `predicted()` maps `step` and `slot` (a face in a hole keeps the hole's call, then pocket, then step or slot); recall per class and precision per kind as pockets. `EXCLUDED` loses 20-22 in S1 and 17-19 in S2.
- D-019: faces `pocketShapedSlot` marks stay out of the tally (counted on their own line, as today); they are neither slot misses nor pocket wrong calls. Pocket calls on other 17-22 faces print on `slot-step-as-pocket` and count as step or slot misses; the pocket comparison in the target uses the baseline's labels only.
- `floorless`: faces of classes 5 and 7, and what each was called. A step or slot call there is a wrong call (they stay scored labels), which J3's `vg_through` and the axis rule guard.
- Pocket calls on classes 6 and 8-10 stay pocket wrong calls, as today (0 in both baselines).
- `grade.ts:37`: beside `holes_whole`, `steps_whole` and `slots_whole` from `INSTANCES.json` keys `<stem>` → `{"holes": [...], "steps": [[faces]], "slots": [[faces]]}`; a set whose value is a plain list keeps meaning holes (today's sets). `instanceScore` groups features of the given kind by faces, with the same whole, split and merged rules as holes.
- `grading/analyse.ts` exports step and slot features; `summary.ts` prints step and slot lines and the target rule.
- Whole features: `INSTANCES.json` lists each step and slot in the object form below (the `grade.ts:37` line); `instanceScore` counts them with each feature's own faces.

### Test set (`tests/grading/sets/steps_slots/`)

`make.ts` on opencascade.js, run by `node web/scripts/make-set.mjs steps_slots` (prototyped 2026-11-11: `STEPControl_Writer` in Node; faces labelled in explorer order by a point inside each face classified ON a tool solid; the grader read it with `file_order` and `names_agree` true). `make-set.mjs` runs `make.ts` with `--experimental-transform-types --import scripts/ts-register.mjs`, as `grading.mjs` does. Face labels: a face on a step tool is 8 (through) or 20-22 (blind, by shape), on a slot tool 6 or 17-19, its fillets and corner faces the same class; the 45° chamfer 0; untouched block faces 24; `vg_through` 5. Writes the `.step` files, `MANIFEST.md` (the `undercuts` set's format) and `INSTANCES.json`. Parts (each one feature unless said): the J1-J3 parts plus `st_stair` (two steps, 10 and 20 deep), `st_fillet` (`st_through` with a 2 mm floor fillet, in the step's faces), `st_blind_rect` (an L corner notch, 22), `st_blind_round` (a quarter-round corner notch, 21), `st_blind_tri` (a triangular corner notch, 20), `st_face` (the top lowered 5 mm over x 0-60, leaving one wall at x = 60: a step, 8), `sl_blind_round` is class 18, `sl_blind` 17, `sl_through` and `sl_deep` 6; `pk_beside_step` and `pk_control` 14, as in the bullnose_draft set. S1 adds every part to `tests/parity/key/index-quick.json` through `parity:refreeze --add`.

### Parity re-freeze

`web/scripts/parity-refreeze.mjs`, `"parity:refreeze"` in `web/package.json`: for every entry of `tests/parity/key/index-<set>.json`, runs the engine as `parity.test.ts` does and writes the result in the entry's file (same name, gzip, `positions` kept); the index is unchanged. It prints per file the changed keys and, in `features`, the ids and kinds added, removed or changed. Allowed: on every file, the new rule ids in `rules_run` and their check names in `checks_run`, and their empty driver in `cost_drivers`; on a file that gained a step or slot: the new features (`step`, `slot`, their `corner`s) with their findings, rows and passed checks, renumbered finding ids, faces leaving `part.not_analysed_faces`, and `setups`, `operations`, `tools`, `tool_changes`, `cost_drivers`, `cost_total`, except that every hole and pocket keeps its own tools (the set of tool ids in operations naming it). Anything else exits 1 and writes nothing. `--add <files>` writes keys for new entries. Each slice re-freezes. `compare.ts` needs no change: from `SLICE` 7 it compares every key exactly (`compare.ts:161-168`).

## Slices

### S1 Steps, the set and the re-freeze

- **Morgan tries:** upload `st_through.step` or a stepped work part: the Machining step lists the step's setup and end mills.
- **Checks that fail now:** J1, J3 (step guards), J4 for steps, the UMD step counts.
- **Files:** `features/pockets.ts`, `analyze.ts`, `plan.ts`, `turning.ts`, `rules/access.ts`, `rules/step_depth.ts`, `rules/index.ts`, `rows.ts`, `src/findings.ts`, `config/drivers.toml`, `grading/{score,analyse,summary,grade,baseline}.ts`, `port/groupb_common.ts`, the tests above, `port/steps_slots.test.ts`, `port/umd_counts.test.ts`, `tests/grading/sets/steps_slots/` (the whole set), `web/scripts/{make-set,parity-refreeze}.mjs`, `web/package.json`, `tests/parity/key/`.
- **First:** run the open-floor rule (axis rule and dedupe, no plan or tools yet) on the first 500 MFCAD++ parts and count step calls on class 5, 6, 7 and 17-19 faces and on stock (24); any over 0 goes back into the rule before the rest is built.
- **Waits on:** none.

### S2 Slots

- **Morgan tries:** `sl_blind_round.step` and `sl_deep.step`: the slot's tools and the two findings.
- **Checks that fail now:** J2, J3 (slot guards), J4 for slots, UMD slot counts.
- **Files:** `features/pockets.ts`, `plan.ts`, `src/findings.ts`, `rules/{slot_depth,slot_ratio}.ts`, `rules/index.ts`, `rows.ts`, `config/{thresholds,drivers}.toml`, `grading/{score,summary,baseline}.ts`, `port/umd_counts.test.ts`, `port/{steps_slots,rules,drivers,passed,rows}.test.ts`, `tests/parity/key/`.
- **Waits on:** S1.

### S3 Screens and PDF

- **Morgan tries:** a step and a slot in the Features step and in the PDF.
- **First:** a mock-up with `ui-mockups`, approved by Morgan; its checks become J6.
- **Waits on:** S2 and UI fixes slice B merged.

## Verification

- Every push: `npm run check` at the root. Before ready: `npm --prefix web run edmr`, `parity:full`, both 500-part grading runs with summaries, the re-freeze reports.

## Open questions

- None for Morgan.
