# Steps and slots

- **Status:** Draft
- **Planned in:** [round 1](https://claude.ai/artifact/2NiJeW3rhomfLQSDeVzDhY), [review](https://claude.ai/artifact/1DwcDhFZcZVzxisd3QTqcy) (2026-11-11). **Decisions:** D-066, D-068, D-075, D-079 (D-018, D-019, D-029, D-052 apply).

## Problem

Morgan: steps and slots are "going to be used to better define all features of a part and eventually be used for drawing creation automation", and should be "equivalent to holes and pockets in terms of score and getting features right". An earlier try in another copy "did well for the parts I had but it was not thorough in testing so I want it redone here".

Today the pocket finder drops every floor with an open side (`web/src/engine/features/pockets.ts`, `pocketWalls` returns `null` when an edge has no wall and `Enclosure.inside` is false). So a step or slot gets no feature, no setup, no tool and no finding.

## Goals

- Steps (MFCAD++ 8-10, 20-22) and floored slots (6, 17-19) are found as features with the sizes a drawing needs: depth, width (slots), length, end type, end radius, open ends, directions.
- The plan reaches each one from the right directions and lists its roughing and finishing end mills.
- The deep pocket check covers steps and slots; a slot deeper than 6× its width is a medium finding.
- The target rule (D-079), measured on both 500-part MFCAD++ sets in one run: step and slot face recall each at least the pockets' recall in that run; 0 faces wrongly called step or slot; holes and pockets no worse than the baseline below.

Baseline, today's engine, measured 2026-11-11 (`node scripts/grading.mjs grade mfcadpp … --limit 500`, 716 s at `--jobs 4`): holes 590 of 602 faces found (12 missed, 0 wrong); pockets 3,667 of 3,745 (78 missed, 1 wrong); slot-shaped-as-pocket 25 (D-019); slot-step-as-pocket 5. The second set (`--skip 500 --limit 500`): see "Baseline, check set" under Verification.

## Non-goals

- V-groove (5) and round-bottom (7) through slots: no floor. Measured on the first 500 parts: class 5 has 103 faces in 38 parts, class 7 has 78 in 47. Scored on their own line, outside the target, until their own work (D-079).
- Screens, model colours and the PDF section: slice S3, after the UI fixes (D-076, D-078) merge.
- The closed-pocket ramp note, T-slot and dovetail names and cutters, keyways, horizontal mills and side-and-face cutters (D-079).
- New findings beyond the two depth checks (D-068).

## Journeys and checks

### J1 A stepped part (S1)

- **Given** `tests/grading/sets/steps_slots/st_through.step` (100 × 60 × 30 mm block, a step 15 wide and 10 deep along X).
- **When** it is analysed for mill in aluminium.
- **Then** one feature of kind `step` holds the step's floor and wall faces, with `dims_mm.depth` 10, `open_ends` 2, and `open_dirs` the floor's and the wall's directions (file +Z and −Y, named in the part frame); the plan has a setup for it with one tool, `em-1.000` (no inside corner, so the finisher is the 1 in end mill and no rougher is listed). **Check:** `web/src/engine/port/steps_slots.test.ts` "st_through".
- **And** `st_l.step` (an L step, its two walls meeting in a 3 mm radius): `open_dirs` the floor's only (two wall planes); tools `em-1.000` (rougher) then `em-0.188` (3/16 in, the largest whose radius fits 3 mm). **Check:** "st_l".

### J2 A slotted part (S2)

- **Given** `steps_slots/sl_blind_round.step` (slot 10 wide, 8 deep, open at +X, round end of radius 5).
- **Then** one `slot` feature with `width` 10, `depth` 8, `open_ends` 1, `end_type` "round", `end_radius` 5, `open_dirs` the floor's direction only; tools `em-0.250` (rougher, the largest ≤ 0.75 × 10 = 7.5 mm), then `em-0.375` (finisher: ≤ 10 mm wide, radius 4.76 ≤ 5). **Check:** `steps_slots.test.ts` "sl_blind_round".
- **And** `sl_blind.step` (the same slot with a flat end and sharp corners): `end_type` "flat"; finisher the smallest end mill, undersized, as a sharp-cornered pocket gets today. **Check:** "sl_blind".

### J3 Deep slot (S2)

- **Given** `steps_slots/sl_deep.step` (through slot 4 wide, 26 deep; no inside corners).
- **Then** findings `slot_depth` (26 ÷ 3.175 mm, the 1/8 in finisher, is 8.2, over 3) and `slot_ratio` (26 > 6 × 4), both medium. **Check:** `steps_slots.test.ts` "sl_deep".

### J4 Scores (S1 for steps, S2 for slots)

- **Then** on both 500-part sets the target rule holds; `summary` prints step and slot recall and the class 5 and 7 lines. **Check:** the two grading runs and summaries, pasted in the PR.

### J5 Nothing lost on real parts (every slice)

- **Then** `npm run parity` passes on the re-frozen key, and the re-freeze report shows no hole or pocket feature changed on any file. NIST and EDMR scorecard tests pass. **Check:** `parity:refreeze` report in the PR; `npm run timed`; `npm --prefix web run edmr`.

### J6 Morgan's view (S3)

- **When** Morgan taps a step or slot row in the Features step. **Then** its faces light on the model and its sizes show. **Check:** e2e tests named in S3's mock-up.

## Decisions

- Kinds `step` and `slot`; no open-pocket kind (D-068).
- A step can be cut from its floor's direction and, when all its walls are one plane, that wall's direction; a slot only from its floor's (D-079).
- Slot tools as a pocket's (rougher at 0.75 of width, then `pickEndMill`); step rougher the largest end mill (1 in) when larger than its finisher `dims_mm.end_mill_mm` (`pickEndMill(minR, ∞)` with `minR` ∞ when it has no inside corner, as pockets compute it before storing 0) (D-079, D-029).
- New rules `step_depth`, `slot_depth` (pocket_depth's test and limits on steps and slots) and `slot_ratio` (depth over 6× width, medium) (D-079).
- Target rule fixed before the first run (D-079).
- The frozen parity key is re-frozen by a script that reports every change (this spec; see Design).

## Alternatives rejected

- **A separate finder from scratch:** rejected; `pocketWalls` already finds floors, walls, blends and the open-edge test (`Enclosure.inside`). It would fail by duplicating 800 lines of tuned rules.
- **Extend `pocket_depth` to steps and slots:** rejected; its row title and sentences say "pocket", and renaming them changes every pocket row in the parity key.
- **Every open side a setup (D-068 as written):** rejected (D-079): on a vertical mill a slot can't be cut from its end.
- **A length-over-width cut-off from a source:** none found (research page); see the step/slot rule in Design, measured in S1.
- **UMD labels by face:** rejected; measured 2026-11-11, the `.fts` points of 8 of 11 readable parts lie on no face (they describe the removed volume). UMD is a feature-count key only.
- **Accept parity diffs per file in a list:** rejected; a list of exemptions grows with each recognition change and hides real ones. Re-freezing with a report keeps the key exact.

## Risks

- New calls on MFCAD++ faces become wrong calls (LESSONS "recognition") → the set first, then NIST and EDMR, then MFCAD++ (D-068).
- A floor today dropped may today be part of a pocket through `floorPieces` → the re-freeze report must show no pocket changed; a changed pocket stops the slice.
- Blind slot vs blind step look alike (both a floor with 3 walls and one open edge) → the rule below, measured on MFCAD++ 17 vs 22 in S1; if their shapes overlap, stop and take the numbers to Morgan.
- Check time: 500-part runs are not in `npm run check`; the new set test is. Time it (VER-11) and report against 900 s (D-073).

## Design

### Finder (`web/src/engine/features/pockets.ts`)

`pocketWalls` gains a second outcome. Where today it returns `null` because an edge has no wall and `Enclosure.inside` is false, it records the edge as **open** and keeps going; any other `null` stays. A floor whose walls close all round stays a pocket, unchanged. A floor with at least one open edge and at least one wall becomes an **open floor**; with no wall it is no feature.

New exported function `openFeatures(oc, solid, faces, frame, taken)` runs after `pockets` in `analyze.ts`, skipping hole and pocket faces (`taken`), and returns `Step[]` and `Slot[]` (same shape as `Pocket`: `kind`, `faces`, `axis`, `open_dirs`, `open_vectors`, `dims_mm`). It reuses `floorPieces`, `blendWalls`, `floorChamferWalls`, `reachable`, `knifeEdge`, `rimTop`, `narrowest` and `corners` as pockets do.

Classify an open floor (walls joined by concave edges, blends or corner chamfers form one **run**; a **facing pair** is two planar walls whose normals, projected on the floor, are opposite within `DRAFT_MAX_DEG`):

| Walls | Call |
|---|---|
| one run, no facing pair | step |
| two runs that are a facing pair, both ends open | slot, `open_ends` 2 |
| one run with a facing pair and an end wall (flat plane or round cylinder) | slot if its length (open edge to end wall) ≥ its width; else step (assumption, measured in S1) |
| anything else (three runs, an island) | no call, as today |

Sizes (`dims_mm`, mm): `depth` (as pockets, `rimTop`), `length` (floor extent along the walls), `width` (slots: the facing gap, `narrowest`), `min_corner_radius`, `end_mill_mm`, `undersized`, `end_radius` (round end; else absent). Feature fields: `end_type` "open" | "flat" | "round", `open_ends` (count of open edges' runs), `open_dirs` per the decision, `open_vectors` the floor normal plus each open side's outward unit vector.

### Plan (`plan.ts`) and tools

`plan()` takes kinds `step` and `slot`. A slot uses `pocketTools`. A step uses new `stepTools`: rougher `em-1.000` when larger than `dims_mm.end_mill_mm`, then the finisher `dims_mm.end_mill_mm`. The finder sets `end_mill_mm` from `pickEndMill(minR, Infinity)` with the unrounded `minR` (∞ without inside corners); never from the stored `min_corner_radius`, which is 0 when there are none. `src/findings.ts` tool reasons get a step and a slot line ("rough", "fits its corner", "fits its width"), as for pockets.

### Rules and settings

- `rules/step_depth.ts`, `rules/slot_depth.ts`: pocket_depth's test and passes on their kind, reading `limits.pocket_depth`; titles "Deep step", "Deep slot"; sentences as pocket_depth's with the kind's word. Registered in `rules/index.ts`, `rows.ts`, and `config/drivers.toml` beside `deep_pockets`.
- `rules/slot_ratio.ts`: depth / width over `max_ratio` is medium; title "Slot deeper than 6× its width". `config/thresholds.toml` `[<material>.slot_ratio] max_ratio = 6.0, source = "D-068"` for all four materials.

### Scoring (`web/src/grading/`)

- `score.ts`: `STEP_CLASSES` {8, 9, 10, 20, 21, 22} → "step", `SLOT_CLASSES` {6, 17, 18, 19} → "slot"; `predicted()` maps feature kinds `step` and `slot`; recall and precision per kind as pockets. `EXCLUDED` loses 20-22 in S1 and 17-19 in S2. D-019's `slotShaped` line stays: a pocket call on such a face is counted there, never wrong. Classes 5 and 7 get a `floorless` summary line (faces called anything).
- `analyse.ts` exports step and slot features to the child result.
- `summary.ts` prints step and slot lines and the target rule's pass or fail.
- Whole features: our sets' `INSTANCES.json` lists each step and slot; `instanceScore` counts them as it does holes. UMD: a new test counts steps and slots per readable part against the `.fts` counts ("Opened Pocket" may be either), without claiming face matches.

### Test set (`tests/grading/sets/steps_slots/`)

A Node generator `make.ts` on opencascade.js (Python is retired), run by `node web/scripts/make-set.mjs steps_slots`: block 100 × 60 × 30 mm, cut by tool boxes and cylinders; each face labelled with its tool's MFCAD++ class by a point on the face classified ON the tool (prototyped 2026-11-11: labels land in file order, `file_order` and `names_agree` true). Writes the `.step` files, `MANIFEST.md` and `INSTANCES.json`. Parts: through step, 2-sided (L) step, stair of two steps, filleted step, blind steps (rectangular, round, triangular), step across the whole top (a face cut: a step), through slot, blind slot flat end, blind slot round end, two crossing slots, slot ending in a pocket, slot on a 20° face, deep slot, a 45° chamfer on an edge (no call), D-019's slot beside a step (a pocket), a closed pocket control.

### Parity re-freeze

`web/scripts/parity-refreeze.mjs` (`npm --prefix web run parity:refreeze [quick|full]`): runs the engine on every key file, writes new keys into `tests/parity/key/`, and prints per file the changed top-level keys and, for `features`, the ids and kinds added, removed or changed. It refuses (exit 1) when a hole or pocket feature changed, unless `--allow-pockets` is given. The PR pastes the report.

## Slices

### S1 Steps, the set and the re-freeze

- **Morgan tries:** upload `st_through.step` or a stepped work part: the Machining step lists the step's setup and its two end mills.
- **Checks that fail now:** J1; `steps_slots.test.ts` step parts; `score.test.ts` step classes; J4 for steps.
- **Files:** `features/pockets.ts` (open floors, steps), `analyze.ts` (call it), `plan.ts`, `findings.ts` (tool reasons), `rules/step_depth.ts` + `index.ts` + `rows.ts`, `config/drivers.toml`, `grading/{score,analyse,summary}.ts`, `tests/grading/sets/steps_slots/` (whole set, slots labelled but not yet called), `web/scripts/{make-set,parity-refreeze}.mjs`, `tests/parity/key/` (re-frozen), `src/engine/port/steps_slots.test.ts`, UMD count test in `port/edmr.test.ts`.
- **First:** measure blind slot (17) vs blind step (22) length ÷ width on the 500 parts; record it in this spec.
- **Waits on:** none.

### S2 Slots

- **Morgan tries:** `sl_blind.step` and `sl_deep.step`: the slot's tools and the two findings.
- **Checks that fail now:** J2, J3, slot parts in `steps_slots.test.ts`, J4 for slots.
- **Files:** `features/pockets.ts` (slots), `plan.ts`, `findings.ts`, `rules/{slot_depth,slot_ratio}.ts` + registrations, `config/thresholds.toml`, `grading/score.ts` (17-19), parity key.
- **Waits on:** S1.

### S3 Screens and PDF

- **Morgan tries:** a step and a slot in the Features step and the PDF.
- **First:** a mock-up with `ui-mockups`, approved by Morgan.
- **Files:** set by the mock-up (`main.ts` checked kinds, `findings.ts` sizes, `report.ts`, `viewer.ts`).
- **Waits on:** S2 and the UI fixes slice B merged.

## Verification

- Every push: `npm run check` at the root; before ready: `npm --prefix web run edmr`, `parity:full`.
- Each slice: both 500-part grading runs and summaries in the PR, and the re-freeze report.
- Baseline, check set (`--skip 500 --limit 500`): filled in when the 2026-11-11 run finishes.

## Open questions

- None for Morgan. The blind slot vs step cut-off is measured in S1; if it can't separate them, it goes to Morgan with the numbers.
