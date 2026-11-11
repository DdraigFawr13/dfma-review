# Machining P1 and P2: removal volume and reach

- **Status:** Draft
- **Planned in:** [round 1](https://claude.ai/artifact/EFfFHenk4UaMnjpq4hGLLj), [review](https://claude.ai/artifact/Mc4eBLkZtwmGPJ9uHEs8Zt) (2026-11-11); spike [README](../research/reach-spike/README.md); removal prototype [README](../research/removal-proto/README.md); Morgan in chat 2026-11-11: "Numbers now, regions in P2a". **Decisions:** D-084, D-085, D-086, D-087 (D-001, D-009, D-073, D-077, D-081 apply).

## Problem

The engineer who tried the app, in Morgan's words (D-085): the machining was "wrong for different axes", "a counter bore was saying it could be machined from the wrong side" (fixed in P0, D-086), through slots were not machined, and "explore more dfm and machining setup issues because that is what we run into".

Today the plan only knows the holes and pockets it found. It does not say how much material comes off, how much of that the found features explain, or whether the tools can reach what is left. Material no feature explains, such as an outside profile, a step or a slot, gets no setup, no tool and no finding, and nothing tells the user it was skipped (`settings.ts:36`: "Exterior profiles, steps, open-sided pockets ... are not planned").

## Terms

- **Part frame:** `result.part.frame` (`frame.ts` `partFrame`); directions ±X ±Y ±Z are its axes, as the plan's setups (`plan.ts:13` `ORDER`). The reach spike used file axes; P2a rotates the mesh into the part frame first.
- **Stock:** the box over the part in the part frame, no allowance (today's `stock`, `analyze.ts:160-163`), or the size the user types (P1 S2).
- **Removal:** stock volume minus the solid's exact volume (`part.volume_mm3`, from `BRepGProp`).
- **Explained:** the part of the removal that found features account for, by their own sizes (Design, "Feature volumes").
- **Height map H(d):** for direction d, the highest point of the part along d over each cell. **Conservative:** never lower than the true highest point over the cell's whole square (D-087).
- **Tip map T(d, tool):** with the tool's centre over a cell's centre, the lowest height its tip can reach without the tool (a cylinder of the tool's diameter) or the holder (a 2 in cylinder whose bottom is 4 × D above the tip) touching the part.
- **As-milled map M(d, tool):** the lowest surface the tool leaves at each cell (the lowest T among the positions within its radius); drawn in the As-milled view.
- **Voxel:** a small cube of the stock box. The reach check decides, voxel by voxel, whether material is open (above the part from some direction), cut by some tool, or explained by a feature's face.
- **Leftover:** removal material that no tool cuts from any direction, and no drill removes.
- **NIST files:** the 17 NIST AP242 test parts (`docs/nist/CATALOG.md`); CTC 02 is the largest, FTC 08 `-e1-tg` the one with an inside-out mesh.

## Goals

- **P1:** every milled part's result says the removal volume, each hole and pocket's own volume, and how much (mm³ and %) no found feature explains. The page shows it in the Machining step and the PDF, with ghost stock around the part. The user can type their own stock and see the extra layer per side as facing.
- **P2a:** within 15 s of the report showing (CTC 02, Chromium, this container: the spike measured 3.8 s for the maps), the Machining step lists each leftover region (volume, footprint, deepest gap, direction, smallest tool, why) and "X % of the removal volume is reachable with this tool set", and shows the regions no feature explains and the leftovers hatched on the model.
- **P2a never says a tool reaches where it can't:** on every compared point our tip height is at or above OpenCAMLib's minus 0.01 mm (FTC 06 all 6 directions, CTC 02 sparse rows).
- **P2b:** ball and bull-nose end mills join the reach check, and each feature's setup direction is one from which reach shows its tool cuts it.

## Non-goals

- Tilted (3+2) directions, turned parts, the shortest stick-out per tool, removal volume in the cost, standard stock sizes, regions from the OpenCascade cut (D-085 "Later"; removal prototype).
- Time estimates (P4) and the Xometry checks (P3).
- Leftover findings in the cost drivers or the Features step's rows: they live in the Machining step until P4 (assumption: Morgan reads machining issues there). P2b's re-plan changes the setup and tool drivers as any plan change does.
- Refining the grid where leftovers show (D-085's "refined where leftovers show"): not in P2a; the spike did not build it, and D-087's cell rule meets the budget without it (Reconcile item R2).
- GPU height maps: only if the CPU path misses the 15 s budget (D-085).
- Manifold: not used (Alternatives). D-085's approval stays unused.

## Journeys and checks

Engine checks run in `npm run check` (vitest takes `web/src/**` except the files `web/vite.config.ts:97` excludes). A test that reads NIST files goes into both that exclude list and `vitest.timed.config.ts:9`'s `include`, as `nist.test.ts` does, so it runs in `npm run timed` only (the timed lane). Browser checks run in `npm run e2e` (Playwright, `web/e2e/`). Built test parts use `web/src/engine/port/groupb_common.ts` (`boxMm`, `cyl`, `cut`, `stepOf`) as `cut_pockets.test.ts` does.

### J1 Removal numbers (P1 S1)

- **Given** a 100 × 60 × 30 mm block with a 10 mm through hole along Z and a 40 × 20 × 8 mm sharp-cornered pocket from +Z (built in the test).
- **When** it is analysed as a milled part.
- **Then** `result.removal` has the fields of Design "P1: removal", with `stock_mm3` 180,000 within 0.01 %, one `features` entry for the hole (its id from `result.features`) and one for the pocket. `total_mm3` equals `stock_mm3 − part_mm3` to 0.001 mm³; the hole's volume is π × 25 × 30 within 0.5 %; the pocket's 6,400 within 0.5 % (its area comes from the mesh); `unexplained_mm3` is under 1 % of the total.
- A 40 × 20 × 8 mm pocket with a 10 × 10 mm island 4 mm high in its middle: the pocket's volume is (800 − 100) × 8 = 5,600 within 0.5 %: the island's top is not floor, so the 400 mm³ above it counts as unexplained (true removal 6,000; the formula is approximate by design). **Check:** `engine/port/removal.test.ts` "pocket with an island".
- `stock_mm3` equals the product of today's `stock.size_in` × 25.4 within 0.01 % on every part in this file. **Check:** `engine/port/removal.test.ts` "stock agrees" (`stock_mm3` uses the unrounded `bboxMm`; `size_in` is rounded to 1e-6 in, well inside 0.01 %). **Check:** `web/src/engine/port/removal.test.ts` "block with a hole and a pocket".
- On a turned part (`process` "turn"), `removal` is `null`. **Check:** same file, "turned part has no removal".
- On each of the 17 NIST files, the unclamped `features_sum_mm3 ≤ total_mm3 × 1.001`, and the FTC/STC twins (06, 07, 08 `-e2`, 09, 10) agree on `unexplained_pct` to 0.5 percentage points (prototype: 0.00 to 0.05). **Check:** `web/src/engine/port/removal_nist.test.ts`, in the timed lane (Journeys intro); not named `timed` (no wall-clock limit).
- The Machining step's plan list shows two lines, a removal line (volume in in³ and mm³, and the stock it came from) and a "not explained by a found feature" line (in³, mm³ and %), worded as the P1 mock-up approves. The PDF's Part summary shows the same two lines. **Check:** `web/e2e/removal.spec.ts` "removal lines" on `clean_pocket.step` (`tests/parts/`), and `web/src/report.test.ts` "removal lines in the PDF"; the expected numbers come from the engine's answer for that part (`removalLines`), not typed into the test.

### J2 Ghost stock and your own stock (P1 S2)

- **Given** a milled part's report. **When** the user opens the Machining step. **Then** a box shows around the part in the viewer at `GHOST_OPACITY` with its edges drawn, toggled by a "Stock" button that is on by default. **Check:** `e2e/removal.spec.ts` "ghost stock": a new test hook `window.__dfma.stock()` (`main.ts:86`) returns `{ shown, size_mm }`; `shown` flips with the button and `size_mm` matches the stock's sides; a 2× screenshot in the PR.
- **When** the user types 4 × 2.5 × 1.25 in into "Your stock" and taps Apply on a part of 3.937 × 2.362 × 1.181 in. **Then** the removal line uses that stock, and one line per axis shows the facing, the extra split evenly between opposite sides (here 0.0315, 0.0690 and 0.0345 in per side, to 4 decimals), with the volume of that axis's two layers in in³ to 2 decimals, taken in the order Z, X, Y of the part frame so corners count once: Z layers (typed z − part z) × typed x × typed y, X layers (typed x − part x) × typed y × part z, Y layers (typed y − part y) × part x × part z. The ghost box takes the typed size, centred. **Check:** `e2e/removal.spec.ts` "typed stock"; `web/src/removal-lines.test.ts` "facing per side" (pure function).
- **When** a typed size is smaller than the part's matching size. **Then** a line names the size that is too small against the part's (for 4 × 2.5 × 1.0 in: 1.000 in against 1.181 in), and nothing else changes. A size equal to the part's is accepted (0 facing on that axis). A size that is empty, not a number, 0 or below gives "Type three sizes over 0 in". **Check:** `removal-lines.test.ts` "stock too small", "bad stock size".

### J3 Reach in Node (P2a S1)

- **Given** a 100 × 60 × 30 mm block with a 20 × 20 × 10 mm pocket from +Z whose corners have 3 mm radii. **When** reach runs with the 11 end mills. **Then** no leftover listed, and `reachable_pct` + `resolution_pct` ≥ 99.9 % of the pocket's 4,000 mm³ less its corner fillets (computed in the test). **Check:** `web/src/reach/reach.test.ts` "pocket reachable".
- The same pocket with sharp corners: leftovers only at the 4 corners, each under 1 mm³ and under `min_leftover_mm3`, so none listed (they are below the voxel size, so this checks the listing, not their volume). **Check:** "sharp corners not listed".
- A 4 mm wide, 25 mm deep slot through the block along X, open at the top: the 1/8 in end mill (3.175 mm) reaches 12.7 mm (4 × D) before its holder hits, so the slot's lower part is left: one Medium leftover, why "length", direction +Z, tool `em-0.125` (the largest end mill that cuts the region with its holder ignored). **Check:** "deep narrow slot is Medium".
- A 20 × 20 × 10 mm block (voxel 0.126 mm, Design "Voxels") with a 0.6 mm wide, 5 mm deep slot across it: one High leftover, why "width" (the smallest end mill is 0.79 mm). **Check:** "slot narrower than every tool is High".
- A 1/8 in (3.175 mm) through hole 30 mm deep, drilled (a drill matches, `plan.ts` `holeTool`): no leftover, though the 1/8 in end mill's holder stops it at 12.7 mm. **Check:** "drilled hole is cut".
- Hole centres: on every NIST hole segment with a drill tool, the circle fit's centre lies within 0.01 mm of OpenCascade's cylinder axis (`BRepAdaptor_Surface.Cylinder()`), or its `Reach.drills` entry has `fitted: false` (Design "Drills"). **Check:** `reach_nist.test.ts` "hole centres".
- The conservative raster: on 200 random triangles over a 1 mm grid, H at every cell is ≥ the exact highest point over the cell's square (found by clipping) minus 1e-6 mm, and ≤ it plus the cell's diagonal × the triangle's slope. **Check:** `web/src/reach/heightmap.test.ts` "conservative against clipping".
- On FTC 08 `-e1-tg` (inside-out mesh) the reach result equals the one for FTC 08 `-e2` within 1 percentage point of `reachable_pct`. **Check:** `web/src/reach/reach_nist.test.ts` "inside-out mesh", in the timed lane. The same file prints, per NIST file, reachable %, leftovers, P1's unexplained % and the voxel pass's own unexplained % (no limit; for the status page).

### J4 Never optimistic (P2a S1, before it ships)

- **When** `npm --prefix web run reach:ocl` runs (it builds OpenCAMLib from upstream commit `1a450b7c3d3b669224a2a5d09aab7f319794574c` into `web/.cache/opencamlib/` if missing, then compares). **Then** for a flat 1/4 in end mill on FTC 06 (all 6 directions, every 10th row) and CTC 02 (+Z and +X, every 40th row), at each sampled cell centre and at the 4 points a quarter cell from it along the diagonals, our tip height T for that cell is ≥ OpenCAMLib's `PathDropCutter` tip − 0.01 mm, and the script prints the share where ours is higher by over 0.1 mm (pessimism, reported, no limit). **Check:** the script exits 1 on any optimistic point and 0 otherwise, seen to fail first on a planted bug (centre sampling restored, VER-10); its output pasted in the PR. Run before the PR is marked ready when `web/src/reach/` changed, as `edmr` (D-077); not in CI (it needs Boost and cmake). `reach:ocl -- --write` also stores OpenCAMLib's FTC 06 tips at those points in `tests/reach/ocl-ftc06.json.gz`, and `web/src/reach/ocl_fixture.test.ts` (timed lane) checks our T against that file on every engine push, so a later change can't turn optimistic unseen.
- OpenCAMLib never reaches the site: no dependency name containing `opencamlib` in `web/package.json` or `web/package-lock.json`, and `/web/.cache/` is in the root `.gitignore`. **Check:** `web/src/licences.test.ts` "no OpenCAMLib in the app".

### J5 Reach in the page (P2a S2)

- **Given** CTC 02 (`tests/nist/.cache/`, unpacked by `npm run nist`) uploaded with `setInputFiles` and analysed in Chromium. **When** the report shows. **Then** within 15 s the Machining step's Reach section shows the reachable % and the leftover list, and the Features step and the rest of the report work while it runs. **Check:** `e2e/reach.spec.ts` "CTC 02 reach in time", tagged `@timed`.
- Tap a leftover: its faces light, the viewer frames it and its line shows volume, footprint, deepest gap, direction, tool and why. **Check:** `e2e/reach.spec.ts` "tap a leftover".
- An "As milled" view hatches leftovers and regions no feature explains. **Check:** comes with the approved mock-up.
- A reach failure (worker error) shows "Reach check didn't finish" in the Reach section; the rest of the report is unchanged (APP-03). **Check:** `e2e/reach.spec.ts` "reach failure".

### J6 Ball, bull-nose and setups from reach (P2b)

- A floor fillet of 3 mm radius round the bottom of a 40 × 20 × 10 mm pocket (about 230 mm³ left by flat tools, estimate): with flat end mills only, a leftover along the fillet; with P2b's tools, none. **Check:** `reach.test.ts` "floor fillet cleared by a ball end mill".
- J4's comparison passes for a ball (`BallCutter`) and a bull-nose (`BullCutter`, corner 1/32 in) 1/4 in tool. **Check:** `reach:ocl`.
- Setups: `npm --prefix web run parity:refreeze quick` and `full` refuse any change outside P2b's allowed list; the report of changed setups goes to Morgan part by part before `--write`. **Check:** the re-freeze report in the PR.

### J7 Nothing else changes (every slice)

- Guards (they pass today and must keep passing). P1 S1, P2b: the guarded re-freeze (D-086) changes only the slice's allowed keys; then `npm run parity` passes on the new key. P1 S2, P2a: `npm run parity` passes on the existing key (reach is outside `analyze()`). NIST CTC 02's analysis stays under its 10 s limit (7-9 s today).

## Decisions

- Stock is the box with no allowance; the user may type their own; the extra shows as facing per side, not as regions. Milled parts only (D-085).
- Removal is box minus the solid's exact volume (D-085). Feature volumes come from each feature's sizes, not from cuts; regions no feature explains come with P2a's maps (Morgan, 2026-11-11, after the removal prototype).
- Severity (D-085): unrecognised but reachable material Low (note only); unreachable High; reachable only by a tool longer than the assumed length Medium, saying the length is assumed. In this spec they are lines in the Machining step's Reach section, not engine findings (R8, for Morgan).
- P2a: flat end mills from `config/tools.toml`, drills only along found holes' axes; ±X ±Y ±Z; flute 3 × D, stick-out 4 × D, holder a 2 in cylinder from 4 × D above the tip (assumptions, D-085).
- Cell D/4 per tool, at most 4 M cells per direction map, directions on up to min(3, cores − 1) workers; a conservative height map checked against OpenCAMLib before it ships; OpenCAMLib built from source for tests only (D-087).
- P2b: ball and bull-nose at the same 11 diameters, bull-nose corner 1/32 in on the 6 sizes from 1/4 in up (assumption); setups come from reach; the key is re-frozen with the setup changes shown to Morgan part by part (D-085).
- Removal is in `analyze()` (exact, fast); reach runs after the report, in its own workers, outside `analyze()` (this spec, from D-085's "report shows at once").

## Alternatives rejected

- **Regions from the OpenCascade cut (D-085 as written):** the cut gives one connected region on most parts (CTC 01: 1 region; CTC 02: 99.95 % in one), so it can't say which material no feature covers; splitting it by features took up to 12.0 s and disagreed on twin files (removal prototype). Fails always on parts machined from the outside.
- **Manifold for leftover volume (D-085 approved it):** leftover material lies above the part along its own direction, so sampling the leftover columns against the other directions' maps gives volumes without building solids from 4 M-cell maps (whose cost the spike did not measure). It saves 218 kB gzip and a runtime dependency. It would be needed if regions had to be exact solids (for a DXF later).
- **Reach inside `analyze()`:** the report would wait 4-10 s more on CTC 02 (D-085: the report shows at once).
- **Centre-sampled height map:** optimistic on 0.13-20.7 % of points (spike, D-087).
- **A one-cell-wider disk instead of a conservative raster:** safe to 0.177 mm but pessimistic on 3.4-76 % of points (spike); the conservative raster is tested against OpenCAMLib in J4, and the wider disk stays the fallback if J4 fails.
- **Leftovers as engine findings with rows and cost (D-085's "one finding per leftover region"):** reach runs after the report, so its findings can't be in `analyze()`'s `findings`, `rows` and `cost_drivers` without waiting for it; and they would change the cost before P4 weighs them. Escalated as R8.
- **Hole centres from the engine (a new `axis_point_mm` field):** a re-freeze of every hole file in P2a; a circle fit on the hole's cylinder vertices needs no engine change and is checked against OpenCascade in J3.

## Risks

- The conservative raster costs more than the spike's centre sampling → P2a S1 "First" times CTC 02 before anything else; over 15 s in Chromium with 3 workers: stop, take the numbers to Morgan (2 M cap: 2.6 s in the spike).
- Morgan's PC is not measured; a PC with 1 worker is under 15 s only if no more than about 1.5× slower than this container (spike estimate) → the Reach section shows progress per direction, and the timing is part of Morgan's slice check (D-077).
- Many tiny corner leftovers would bury the useful ones → `min_leftover_mm3` (1 mm³, assumption) hides them from the list (they stay in the %), and the corner radius check already flags sharp corners.
- A conservative tip map leaves a skin up to about one tool cell (D/4) beside walls (critic, unmeasured) → the skin is reported as "resolution", never as reachable and never as a leftover (Design "Voxels"); P2a S1 "First" measures it on J3's pocket and on CTC 02 and shows Morgan the share.
- Memory: up to 4 M cells × 4 B per map (the spike's one Node worker used 343 MB; Chromium not measured) → each tool's maps are freed after its voxel bits, maps never leave their worker, only bitsets cross threads; P2a S1 "First" measures peak memory in Chromium (`Performance.getMetrics` JSHeapUsedSize per worker) and stops at over 1 GB in total.
- Time on fewer cores: CI runs on `ubuntu-24.04` (`ci.yml:26`), 4 vCPU for a public repo and 2 for a private one (GitHub's published sizes; this repo's visibility not checked here) → J5's `@timed` test runs with the workers the machine has; a 2-core runner gets 1 worker, the case Morgan's slower PC would hit, so a failure there is a real finding for Morgan, not a reason to widen the limit (VER-04).
- Typed stock in the wrong orientation → sizes are matched largest to largest (assumption), and the lines name the part's sides.
- Re-freezing makes the key follow the engine → the guarded script refuses changes outside each slice's allowed list (D-086).
- Check time (D-073, 900 s; AGENTS.md's baseline 421 s on 2026-11-11, and 664 s on the spike branch's last commit): `removal_nist.test.ts`, `reach_nist.test.ts` and `ocl_fixture.test.ts` run in the timed lane, which `npm run check` runs for engine changes (D-082; `web/src/reach/` is not UI-only under `scripts/scope.mjs:25`, so a reach change runs them); `reach.test.ts` and `heightmap.test.ts` use built parts only; each in one `it` per NIST file with its own timeout; `reach_nist.test.ts` reuses one `analyze` per file for removal and reach; time each before it joins and report against the budget (VER-11).

## Design

### P1: removal (`web/src/engine/removal.ts`, new)

- `removal(features, faces, bboxMm, partMm3): Removal`, called in `analyze.ts` after the features, for `process === "mill"`; `null` for "turn". `bboxMm` is `extentsMm(frame, vertices)` (`analyze.ts:73`, before the inch rounding; J1 checks it against `stock`).
- `Removal` (in `api.ts`, field `removal: Removal | null` on `Analysis`), in this key order:
  `{ stock_mm3, part_mm3, total_mm3, features: { feature: string; volume_mm3: number }[], features_sum_mm3, explained_mm3, unexplained_mm3, unexplained_pct }`. Every mm³ rounded to 0.001 (`round`, `units.ts`), `unexplained_pct` to 0.01. `features` lists each feature of a `VOLUME_KINDS` kind in `result.features` order, by its id (`hole-3`, `pocket-1`); none: `[]`.
- **Feature volumes:** `export const VOLUME_KINDS = ["hole", "pocket"]` in `removal.ts`. `hole`: π × (`diameter` / 2)² × `depth`, per segment (each segment is its own feature; drill points and countersinks not counted: assumption, small). `pocket`: floor area × `depth`, where the floor area is the projected area (triangle area × its normal's component along `axis`) of the pocket's mesh triangles that face along `axis` (component > 0) and whose highest vertex is within 0.01 mm of the pocket's lowest point along `axis` or which belong to a non-planar face touching such a face (floor fillets); island tops and ceilings are left out. A hole whose segment starts on a pocket floor lies below it, so the two don't overlap. A pocket whose floor pieces sit at different heights counts only the lowest (an undercount; approximate). Steps and slots (steps-slots S1, S2) add `step` and `slot` to `VOLUME_KINDS` with the pocket's formula: HANDOFF Next 000 carries this for those builds.
- `features_sum_mm3` = the sum, unclamped (J1 checks it); `explained_mm3` = min(sum, `total_mm3`); `unexplained_mm3` = total − explained; `unexplained_pct` = unexplained ÷ total × 100 (0 when total is 0).
- A new last entry of `ASSUMPTIONS` (`settings.ts:36`): "Removal is the stock block minus the part's exact volume; each hole's and pocket's own volume comes from its sizes (approximate), and the rest is material no found feature explains, such as an outside profile."
- **Parity:** the re-freeze's `ALLOWED` (`parity-refreeze.test.ts:26`) is replaced (P0's values go) by `keys: ["removal", "assumptions"]`, `featureFields: {}`; `masked` (`:50`) already treats a key the old file lacks as allowed to appear. Nothing else may change. Cost: 0-4 ms per NIST file (removal prototype).

### P1: page (`web/src/removal.ts`, new; `findings.ts`, `report.ts`, `viewer.ts`, `main.ts`)

- `removalLines(result, typed?: [number, number, number]): string[]` (pure; `typed` in inches; returns the lines). Volumes show as in³ to 2 decimals, then mm³ whole with thousands commas in brackets; the stock as `formatSize`; facing per side to 4 decimals.
- Typed stock: three number fields (in) and Apply, in the Machining step's plan list under Stock. Sizes and the part's `bbox_in` are each sorted largest first and paired; any typed size under its pair → the "smaller than the part" line. Facing per axis: (typed − part) ÷ 2 per side (assumption: the part sits centred), with that layer's volume; one line per axis pair. Not stored (session only).
- Ghost stock: `Viewer.showStock(frame, minMm, sizeMm)`: a box mesh in the part frame (its min corner is the extents' minimum along each frame axis, as the removal prototype built it), its edges drawn, opacity `GHOST_OPACITY`, `depthWrite` off; a "Stock" toggle (`aria-pressed`) beside the view buttons; test hook `__dfma.stock()`.
- PDF (`report.ts`, Part summary, after Stock): the same lines (typed stock not in the PDF: assumption, the PDF is the file's own review).
- Exact placement, wording and toggle: the P1 mock-up (`ui-mockups`) approved before S1's code.

### P2a: reach core (`web/src/reach/`, new; no OpenCascade)

- **Files:** all reach code lives in `web/src/reach/` (not directly in `web/src/`, which `scripts/scope.mjs:25` treats as UI-only): `soup.ts` (build the input from an `Analysis`), `heightmap.ts`, `tools.ts` (kernels), `drills.ts`, `voxels.ts`, `regions.ts`, `reach.ts` (one thread, for Node), `client.ts` and `worker.ts` (S2).
- **Input** (`ReachInput`, built by `soup.ts` from `result.faces`, `result.features`, `result.operations`, `result.tools`, `result.part.frame`, `result.removal`): `soup` Float32Array (9 per triangle, mm, part frame), `faceOf` Int32Array (face id per triangle), `box` `{ min: Vec, max: Vec }` (part frame), `tools: { id: string; d_mm: number; profile: "flat" }[]` (the 11 end mills, ids as `plan.ts` `millId`; `profile` is the kernel's name so P2b adds "ball" and "bull"), `drills: { feature: string; axis: Vec; centre: Vec; r_mm: number; lo: number; hi: number }[]`, `explainedFaces: Set<number>` (faces of `VOLUME_KINDS` features), `removalMm3` (P1's `total_mm3`), config.
- **Config** `config/reach.toml` (loaded as `settings.ts` loads `tools.toml`): `flute_x = 3.0`, `stickout_x = 4.0`, `holder_diameter_in = 2.0`, `cell_div = 4`, `max_cells = 4_000_000`, `max_workers = 3`, `tol_mm = 0.01`, `min_leftover_mm3 = 1.0`, `unexplained_min_share = 0.01`, `voxel_cap = 2_000_000`, `voxel_min_mm = 0.1`, each with a `source` comment ("D-085 assumption", "D-087").
- **Orientation:** soup rotated by `frame.x/y/z` (dot products). A soup whose signed volume is negative is flipped (FTC 08 `-e1-tg`); the height map itself does not depend on winding.
- **Height map** (`web/src/reach/heightmap.ts`, new: the spike's `web/src/reach-spike/heightmap.ts` copied and changed to conservative; the spike's file stays as it is, as the record): per direction and grid, H[c] = the highest point of any triangle over cell c's closed square: each triangle is clipped to every cell its projection touches and the clipped polygon's highest vertex is taken. Each cell also keeps the face id of that highest point. Rasterised once per direction at the finest cell; coarser grids are max-pooled from it (the spike's untimed idea, README section 1), which stays conservative because the max over sub-squares is the max over their union.
- **Grids:** per tool, cell = max(D / `cell_div`, the cell that keeps the direction's map under `max_cells`). Pooled cells are whole multiples of the finest (each tool's cell rounds down to one).
- **Tip map:** T[c] holds for the tool's centre anywhere in cell c's square: T[c] = max of H over every cell whose square comes within R of c's square (conservative dilation; J4 checks it at the centre and 4 off-centre points); then max with (holder: the same dilation with radius 25.4 mm on a grid max-pooled to about 3.2 mm, as the spike's `pool`, minus `stickout_x` × D, because the holder starts 4 × D above the tip). Flute length (D-085's 3 × D) does not enter the map: the shank is taken as D up to the holder (assumption, R10), so the tool body collides as the cutter does. Also kept: T without the holder (for "why").
- **As-milled map** (for the As-milled view only): M[c] = min of T over the cells whose square comes within R of c's centre; per direction, the min over tools resampled onto the finest grid, kept for the view.
- **Drills:** each hole segment named in an operation whose tool has `kind` "drill". Its centre: an algebraic least-squares circle fit (Kåsa: fit x² + y² + a x + b y + c = 0) on its cylinder faces' mesh vertices projected on the plane across `axis`; `lo`, `hi`: those vertices' extent along `axis`, each end extended to the box when it is open (its direction in `open_vectors`). Fewer than 6 vertices, or vertices spanning under 90° of arc around the fitted centre: not fitted, so not counted as drilled (pessimistic). A voxel centre inside a fitted cylinder (radius `r_mm`, between `lo` and `hi`) is cut.
- **Voxels:** one grid over the box in the part frame, edge v = max(cube root of box volume ÷ `voxel_cap`, `voxel_min_mm`) (J3's 20 × 20 × 10 block: 0.126 mm; the 100 × 60 × 30 block: 0.448 mm; CTC 02: 4.890 mm). A leftover region smaller than 2 voxels across may be missed; that is the check's resolution, said in its assumption line. For a voxel centre p and direction d, with h = p's height along d and c = p's cell in a map of d:
  - **open** from d: h > H(d)[c] + `tol_mm` on d's finest map;
  - **cut** by (d, tool): some cell q whose square comes within R of p across d has T[q] ≤ h − `tol_mm` (the tool can stand at the point of q nearest p; no slack, so never optimistic); **cut** overall: cut by some (d, tool), or inside a drilled cylinder;
  - **near-cut** by (d, tool): not cut, but some cell q within R + that tool's cell of p has T[q] ≤ h − `tol_mm` (the grid's own blur beside walls);
  - **cut without holder**: the same with T taken without the holder;
  - **explained**: open from some d whose H cell's face id is in `explainedFaces`.
  - **Resolution:** open, not cut, near-cut by some (d, tool): counted in `resolution_mm3`, neither reachable nor leftover.
  - **Leftover:** open from some d, not cut, not resolution. **Width-left:** leftover and not cut without holder. Voxels open from no direction are not classified: the check can't tell a sealed or undercut space from the part's inside, so `hidden_mm3` = max(0, `removalMm3` − open voxels' volume) is reported, and it never counts as reachable.
- **Leftover regions** (`regions.ts`): leftover voxels, 26-connected. `Leftover`: `{ id: "L1"…, severity: "high" | "medium", volume_mm3, direction, footprint_mm: [number, number], deepest_mm, tool, why: "width" | "length", faces: number[] }`. `volume_mm3` = voxels × v³. `direction`: the d from which most of its voxels are open, ties in `ORDER`. `footprint_mm`: its extent across `direction`, largest first. `deepest_mm`: its extent along `direction`. `tool`: for "length", the largest end mill that cuts every voxel of the region with its holder ignored; for "width", the smallest end mill (`em-0.031`). `why`: "width" if any voxel is width-left, else "length"; `severity` high for width, medium for length. `faces`: the H face ids under its voxels along `direction`. Listed largest first; regions under `min_leftover_mm3` are counted in `leftover_mm3`, not listed.
- **Unexplained regions:** open, not explained voxels, 26-connected. `Region`: `{ id: "U1"…, volume_mm3, direction, footprint_mm, faces }`, as `Leftover`; listed when over `unexplained_min_share` × `removalMm3` (assumption until Morgan's parts set the size, D-085); severity low. This is the voxel pass's own measure; P1's `unexplained_pct` (from sizes) stays the headline number, and the Reach section names its own as "seen by the reach check" (the NIST run prints both, J3).
- **Output** (`Reach`, in `api.ts`): `{ reachable_pct, resolution_pct, leftover_mm3, resolution_mm3, hidden_mm3, leftovers: Leftover[], unexplained: Region[], directions: { dir, cells, cell_mm, ms }[], drills: { feature: string; fitted: boolean }[], ms, assumptions: string[] }` (P2b adds `feature_dirs`). `reachable_pct` = cut voxels' volume ÷ `removalMm3` × 100 and `resolution_pct` = `resolution_mm3` ÷ `removalMm3` × 100, each clamped to 0-100 and rounded to 0.1; 0 when `removalMm3` is 0. The Reach section says "X % reachable with this tool set; Y % within one tool cell of a wall, below the check's resolution; Z mm³ not seen from any side".
- **Node entry:** `web/scripts/reach.mjs <file.step>` runs `analyze`, `soup.ts` and `reach.ts` on one thread and prints `Reach` as JSON, run as `grading.mjs` runs TypeScript (`--experimental-transform-types --import scripts/ts-register.mjs`). For the status page and by hand; the tests call `reach.ts` directly.

### P2a: OpenCAMLib check (`web/scripts/build-ocl.sh`, `web/scripts/reach-ocl.mjs`)

- `build-ocl.sh`: clone upstream at the pinned commit into `web/.cache/opencamlib/src`, then the spike README's commands (Boost headers from `apt-get install libboost-dev`, `node-api-headers`, cmake with `-DBUILD_NODEJS_LIB=ON -DVERSION_STRING=1a450b7`). Skips when `ocl.node` exists. `web/package.json` gets `"reach:ocl": "sh scripts/build-ocl.sh && node scripts/reach-ocl.mjs"`. `node-api-headers` is installed into `web/.cache/`, not `web/node_modules`.
- `reach-ocl.mjs`: the spike's `ocl-check.mjs` method (part rotated so d is +Z, cutter and surface held in variables), on the new `heightmap.ts`, at J4's points; `--write` writes the fixture. `.gitignore` (root) gains `/web/.cache/`.

### P2a: page (`web/src/reach/client.ts`, `web/src/reach/worker.ts`; `steps.ts`, `findings.ts`, `viewer.ts`, `main.ts`)

- After a milled report shows, `startReach(result)` builds `ReachInput` (`soup.ts`) and starts `w = max(1, min(max_workers, navigator.hardwareConcurrency − 1))` module workers; worker k takes the directions at positions k, k + w, … of `ORDER`, each given the whole input (CTC 02's soup is 3.3 MB, copied per worker).
- Each worker, per direction and then per tool, builds the maps, sets that tool's voxel bits and frees the tool's T before the next (only H, the face ids and the as-milled min stay), and returns per direction voxel bitsets (one bit per voxel, `Uint8Array`, transferred): open, cut, near-cut, cut without holder, explained, plus an `Int32Array` of the H face id per voxel for the voxels open from that direction (−1 none), and progress messages per direction. Maps never leave the worker.
- The page ORs the bitsets, applies the drills, and runs `regions.ts` (26-connected labelling of the leftover and unexplained voxels only; assumption: under 0.5 s on CTC 02's 2 M voxels, timed in S1 "First"; if over, it moves to a worker).
- A newer analysis terminates the older reach's workers. A worker error or a timeout of 60 s (`TIME_LIMIT_S`) ends the reach: "Reach check didn't finish", no retry button (assumption), the rest unchanged. `__dfma.reach()` returns the `Reach` or null (test hook); e2e makes a worker fail with `?reach_fail=1` in the test build only, as `time_limit_s` (`engine-client.ts`).
- Machining step: a Reach section (progress per direction, then the % and the list); the As-milled view; tap a leftover to light its faces. Exact layout: the P2a mock-up, approved before S2's code.

### P2b: tools and setups

- **Kernels** (`tools.ts`, which S1 writes with `profile` as a parameter so P2b adds cases, not a new interface): ball: T = max over the disk of (H(q) − R + √(R² − r²)); bull-nose with corner c: flat to R − c, then the corner arc; M uses the same profile. Conservative as the flat tool (cells whose square meets the disk, the profile at the nearest point of the square).
- **Tools:** `config/tools.toml` `[end_mills]` gains `ball_inch` (the 11 sizes) and `bullnose_inch` (0.25, 0.375, 0.5, 0.625, 0.75, 1.0) with `bullnose_corner_in = 0.03125`. Ids `bm-0.250`, `bn-0.250` (as `millId`).
- **Setups from reach:** reach also returns, per planned feature and direction, whether every voxel open from that direction whose H face is one of the feature's faces is cut by the feature's finishing tool (the last tool `plan.ts` gives it: `holeTool`, or the last of `pocketTools`) or by a ball or bull-nose tool (`Reach.feature_dirs: Record<string, Record<string, "tool" | "ball" | "bull" | "no">>`). A feature's candidate directions (`tool_dirs` when present, else `open_dirs`) keep those not "no"; a "ball" or "bull" direction adds the smallest such tool that cuts it to the feature's operations in that setup. A feature with no voxels under its faces, or with every direction "no", keeps its candidates (its leftover stays in the Reach list). `replan(result: Analysis, reach: Reach): Analysis` (`plan.ts`, pure) re-runs `plan()` with the filtered directions and the cost drivers on it; the page shows today's plan at once and swaps in `replan`'s when reach arrives (`findings.ts` `renderPlan` called again).
- **Parity:** `ALLOWED` is set to `keys` as below and `featureFields: {}` (no feature field changes). `parity.test.ts` and the re-freeze run analyze, then `reach.ts` (one thread), then `replan`, on the quick set (`tests/parity/key/index-quick.json`) and `parity:full`; `ALLOWED` is D-086's keys (`setups`, `operations`, `tools`, `tool_changes`, `cost_drivers`, `cost_total`), and the re-freeze refuses a file where a hole or pocket loses a tool id it had (`toolsOf`, `parity-refreeze.test.ts`), allowing only added `bm-`/`bn-` ids.

## Slices

Order (D-085): P1 S1, P1 S2, then steps and slots S1 and S2 (D-081), then P2a S1, P2a S2, P2b. One mock-up for P1 covers S1 and S2; one for P2a covers S2.

### P1 S1 Removal numbers

- **Morgan tries:** upload a work part or `clean_pocket.step`: the Machining step and the PDF say how much comes off and how much no found feature explains.
- **First:** the P1 mock-up (`ui-mockups`) of the lines, the typed stock and the ghost stock; Morgan approves it before code.
- **Checks that fail now:** J1; J7 (re-freeze adds `removal`).
- **Files:** `web/src/engine/removal.ts` (new), `analyze.ts` (call it), `api.ts` (`Removal`, `removal`), `settings.ts` (assumption line), `findings.ts` (two plan lines), `report.ts` (two PDF lines), `web/src/removal.ts` (`removalLines`), `engine/port/removal.test.ts`, `engine/port/removal_nist.test.ts`, `vite.config.ts` (exclude) and `vitest.timed.config.ts` (include), `report.test.ts`, `e2e/removal.spec.ts`, `parity-refreeze.test.ts` (`ALLOWED`), `tests/parity/key/`, tests that pin `assumptions` (named in the PR).
- **Waits on:** none.

### P1 S2 Ghost stock and your own stock

- **Morgan tries:** the Stock toggle; type a larger stock and read the facing lines.
- **Checks that fail now:** J2.
- **Files:** `viewer.ts` (`showStock`, toggle), `findings.ts` (fields, Apply), `web/src/removal.ts` (facing, too-small, bad size), `main.ts` (wiring, `__dfma.stock`), `web/src/removal-lines.test.ts`, `e2e/removal.spec.ts`.
- **Waits on:** P1 S1.

### P2a S1 Reach core in Node

- **Morgan tries:** the status page: per NIST part, reachable %, leftovers and unexplained regions, with the +Z picture as in the spike.
- **First:** time the conservative raster, the voxel bitsets and `regions.ts` on CTC 02 in Node and in Chromium (the spike's `time-node.mjs` and `time-browser.mjs` pointed at the new files); over 15 s with 3 workers: stop and take the numbers to Morgan. Measure J3's pocket with and without the one-cell slack (Risks).
- **Checks that fail now:** J3, J4.
- **Files:** `web/src/reach/{soup,heightmap,tools,drills,voxels,regions,reach}.ts` (new), `reach.test.ts`, `heightmap.test.ts`, `reach_nist.test.ts`, `ocl_fixture.test.ts`, `tests/reach/ocl-ftc06.json.gz`, `vite.config.ts` (exclude) and `vitest.timed.config.ts` (include), `config/reach.toml`, `settings.ts` (loader), `web/scripts/{reach.mjs,reach-ocl.mjs,build-ocl.sh}`, `web/package.json`, root `.gitignore`, `licences.test.ts`, `api.ts` (`Reach`, `Leftover`, `Region`). Built parts for `reach.test.ts` come from `groupb_common.ts` (`boxMm`, `cyl`, `cut`) in a Node test with OpenCascade, read back with `analyze`, as `cut_pockets.test.ts` does; the 3 mm corner radii are `cyl` cuts at the corners.
- **Waits on:** steps and slots S2 (D-085 order), so steps and slots count as explained.

### P2a S2 Reach in the page

- **Morgan tries:** open CTC 02 or a work part: the Reach section fills in; tap a leftover; the As-milled view.
- **First:** the P2a mock-up, approved by Morgan; its checks complete J5.
- **Checks that fail now:** J5.
- **Files:** `web/src/reach/{client,worker}.ts` (new), `engine-client.ts` pattern for the test-build flag, `steps.ts`, `findings.ts`, `viewer.ts`, `main.ts`, `e2e/reach.spec.ts`.
- **Waits on:** P2a S1.

### P2b Ball, bull-nose and setups from reach

- **Morgan tries:** the re-freeze report, part by part; then a part with floor fillets.
- **First:** time reach on the quick parity set in Node; if `npm run check` would pass 900 s (D-073), stop and take the numbers to Morgan.
- **Checks that fail now:** J6.
- **Files:** `web/src/reach/{tools,reach}.ts`, `config/tools.toml`, `web/src/engine/plan.ts` (`replan`), `parity.test.ts`, `parity-refreeze.test.ts`, `tests/parity/key/`, `findings.ts` (re-plan on arrival), `reach/reach.ts` and `api.ts` (`feature_dirs`), the tests that pin setups (named in the PR).
- **Waits on:** P2a S2.

## Verification

- Every push: `npm run check` at the root (D-077). Before ready: `npm --prefix web run edmr` and `parity:full` when the engine changed; `reach:ocl` when `web/src/reach/` changed; the re-freeze reports in the PR.
- Morgan checks each slice by using it (D-077): a status page and a view-only demo (D-009).

## Reconcile with D-085 and D-087 (for Morgan)

- **R1 (contradiction, settled):** D-085 "regions from the OpenCascade cut already shipped" against this spec's feature volumes and P2a regions; Morgan chose "Numbers now, regions in P2a" on 2026-11-11.
- **R2 (contradiction):** D-085 P2a "refined where leftovers show"; this spec leaves refinement out (D-087's rule meets the budget).
- **R3 (contradiction):** D-085 "Tested on Morgan's parts first, then NIST": his parts have not arrived; P1 is tested on built parts and NIST, and his parts run when they arrive.
- **R4 (addition):** Manifold not used though approved (Alternatives).
- **R5 (addition):** the unexplained-region size starts at 1 % of the removal until Morgan's parts set it.
- **R6 (addition):** typed stock: centred, sizes paired largest to largest, not in the PDF, not stored.
- **R7 (addition):** reach is outside `analyze()`; P2b re-plans in the page when reach arrives, and the parity run includes reach.
- **R8 (contradiction):** D-085 "One finding per leftover region" and "a region both checks see is one finding at the higher level"; this spec lists leftovers and unexplained regions in the Machining step's Reach section with their severity, not as engine findings, rows or cost drivers (they arrive after the report). Recommended: as written until P4 adds time and cost; the alternative is to add them to the Features step's rows when reach arrives, without cost.
- **R9 (addition):** the reach check's resolution: material within about one tool cell of a wall is reported as "below the check's resolution", and a leftover smaller than 2 voxels across may be missed (CTC 02's voxel is 4.89 mm); nothing is called reachable that the maps don't show cut (Design "Voxels").
- **R10 (contradiction):** D-085 sets flute length 3 × D; with the shank taken as D up to the holder it never limits the map, so this spec does not use it. D-085's "cell size from the smallest feature or tool" is tool size only (D-087's rule).

## Open questions

- Which free options the engineer meant; which setup issues the shop runs into most; when the engineer's parts arrive (D-085, Morgan).
