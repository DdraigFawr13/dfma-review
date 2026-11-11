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
- **Tip map T(d, tool):** the lowest height the tool's tip can reach at each cell without the tool or holder touching the part (H dilated by the tool, and by the holder 4 × D above the tip).
- **As-milled map M(d, tool):** the lowest surface the tool leaves at each cell (T opened by the tool). A cell is cut by the tool only where a tool position covers its whole square.
- **Leftover:** removal material that no tool cuts from any direction, and no drill removes.

## Goals

- **P1:** every milled part's result says the removal volume, each hole and pocket's own volume, and how much (mm³ and %) no found feature explains. The page shows it in the Machining step and the PDF, with ghost stock around the part. The user can type their own stock and see the extra layer per side as facing.
- **P2a:** within 15 s of the report showing (CTC 02, Chromium, this container: the spike measured 3.8 s for the maps), the Machining step lists each leftover region (volume, footprint, deepest gap, direction, smallest tool, why) and "X % of the removal volume is reachable with this tool set", and shows the regions no feature explains and the leftovers hatched on the model.
- **P2a never says a tool reaches where it can't:** on every compared point our tip height is at or above OpenCAMLib's minus 0.01 mm (FTC 06 all 6 directions, CTC 02 sparse rows).
- **P2b:** ball and bull-nose end mills join the reach check, and each feature's setup direction is one from which reach shows its tool cuts it.

## Non-goals

- Tilted (3+2) directions, turned parts, the shortest stick-out per tool, removal volume in the cost, standard stock sizes, regions from the OpenCascade cut (D-085 "Later"; removal prototype).
- Time estimates (P4) and the Xometry checks (P3).
- Leftover findings in the cost drivers or the Features step's rows: they live in the Machining step until P4 (assumption: Morgan reads machining issues there).
- Refining the grid where leftovers show (D-085's "refined where leftovers show"): not in P2a; the spike did not build it, and D-087's cell rule meets the budget without it (Reconcile item R2).
- GPU height maps: only if the CPU path misses the 15 s budget (D-085).
- Manifold: not used (Alternatives). D-085's approval stays unused.

## Journeys and checks

Engine checks run in `npm run check` (vitest takes `web/src/**` except the files `web/vite.config.ts:97` excludes). Browser checks run in `npm run e2e` (Playwright, `web/e2e/`). Built test parts use `web/src/engine/port/groupb_common.ts` (`boxMm`, `cyl`, `cut`, `stepOf`) as `cut_pockets.test.ts` does.

### J1 Removal numbers (P1 S1)

- **Given** a 100 × 60 × 30 mm block with a 10 mm through hole along Z and a 40 × 20 × 8 mm sharp-cornered pocket from +Z (built in the test).
- **When** it is analysed as a milled part.
- **Then** `result.removal` is `{ stock_mm3: 180000, part_mm3, total_mm3, features: [{ feature: "hole-1", volume_mm3 }, { feature: "pocket-1", volume_mm3 }], explained_mm3, unexplained_mm3, unexplained_pct }`. `total_mm3` equals `stock_mm3 − part_mm3` to 0.001 mm³; the hole's volume is π × 25 × 30 within 0.5 % (mesh); the pocket's 6400 within 0.5 %; `unexplained_mm3` is under 1 % of total. **Check:** `web/src/engine/port/removal.test.ts` "block with a hole and a pocket".
- On a turned part (`process` "turn"), `removal` is `null`. **Check:** same file, "turned part has no removal".
- On each of the 17 NIST files, `explained_mm3 ≤ total_mm3 × 1.001`, and the FTC/STC twins (06, 07, 08 `-e2`, 09, 10) agree to 0.5 percentage points (prototype: 0.00 to 0.05). **Check:** `web/src/engine/port/removal_nist.test.ts`, added to `vitest.timed.config.ts`'s `include` beside `nist.test.ts` (it reads all 17 files, so it stays out of the default lane); not `timed` (no wall-clock limit).
- The Machining step's plan list shows two lines, a removal line (volume in in³ and mm³, and the stock it came from) and a "not explained by a found feature" line (in³, mm³ and %), worded as the P1 mock-up approves. The PDF's Part summary shows the same two lines. **Check:** `web/e2e/removal.spec.ts` "removal lines" on `clean_pocket.step` (`tests/parts/`), and `web/src/report.test.ts` "removal lines in the PDF"; the expected numbers come from the engine's answer for that part (`removalLines`), not typed into the test.

### J2 Ghost stock and your own stock (P1 S2)

- **Given** a milled part's report. **When** the user opens the Machining step. **Then** a box shows around the part in the viewer at `GHOST_OPACITY` with its edges drawn, toggled by a "Stock" button that is on by default. **Check:** `e2e/removal.spec.ts` "ghost stock" (the stock mesh is in the scene; screenshot at 2× in the PR).
- **When** the user types 4 × 2.5 × 1.25 in into "Your stock" and taps Apply on a part of 3.937 × 2.362 × 1.181 in. **Then** the removal line uses that stock, and one line per axis shows the facing, the extra split evenly between opposite sides (here 0.0315, 0.069 and 0.0345 in per side), with that layer's volume. **Check:** `e2e/removal.spec.ts` "typed stock"; `web/src/removal.test.ts` "facing per side" (pure function).
- **When** a typed size is smaller than the part's matching size. **Then** a line names the size that is too small against the part's (for 4 × 2.5 × 1.0 in: 1.000 in against 1.181 in), and nothing else changes. **Check:** `removal.test.ts` "stock too small".

### J3 Reach in Node (P2a S1)

- **Given** a 100 × 60 × 30 mm block with a 20 × 20 × 10 mm pocket from +Z whose corners have 3 mm radii. **When** reach runs with the 11 end mills. **Then** no leftover, and reachable 100 %. **Check:** `web/src/reach/reach.test.ts` "pocket reachable".
- The same pocket with sharp corners: leftovers only at the 4 corners, each under 1 mm³ and under `min_leftover_mm3`, so none listed; reachable ≥ 99.9 %. **Check:** "sharp corners not listed".
- A 4 mm wide, 30 mm deep slot through the block along X, open at the top: the 1/8 in end mill (3.175 mm) reaches 12.7 mm (4 × D) before its holder hits, so the slot's lower part is left: one Medium leftover, why "length", direction +Z, tool `em-0.125`. **Check:** "deep narrow slot is Medium".
- A 0.5 mm wide, 10 mm deep slot: one High leftover, why "width". **Check:** "slot narrower than every tool is High".
- A 6 mm through hole 30 mm deep, drilled: the hole's material counts as cut (drill). **Check:** "drilled hole is cut".
- The conservative raster: on 200 random triangles over a 1 mm grid, H at every cell is ≥ the exact highest point over the cell's square (found by clipping) minus 1e-6 mm, and ≤ it plus the cell's diagonal × the triangle's slope. **Check:** `web/src/reach/heightmap.test.ts` "conservative against clipping".
- On FTC 08 `-e1-tg` (inside-out mesh) the reach result equals the one for FTC 08 `-e2` within 1 % of reachable volume. **Check:** `web/src/reach/reach_nist.test.ts` "inside-out mesh", in the parity config with `removal_nist.test.ts`.

### J4 Never optimistic (P2a S1, before it ships)

- **When** `npm --prefix web run reach:ocl` runs (it builds OpenCAMLib from upstream commit `1a450b7c3d3b669224a2a5d09aab7f319794574c` into `web/.cache/opencamlib/` if missing, then compares). **Then** for a flat 1/4 in end mill on FTC 06 (all 6 directions, every 10th row) and CTC 02 (+Z and +X, every 40th row), our tip height is ≥ OpenCAMLib's `PathDropCutter` tip − 0.01 mm at every compared point, and the script prints the share where ours is higher by over 0.1 mm (pessimism, reported, no limit). **Check:** the script exits 0; its output pasted in the PR. Run before the PR is marked ready when `web/src/reach/` changed, as `edmr` (D-077); not in CI.
- OpenCAMLib never reaches the site: no dependency name containing `opencamlib` in `web/package.json` or `web/package-lock.json`, and `web/.cache/` is in `.gitignore`. **Check:** `web/src/licences.test.ts` "no OpenCAMLib in the app".

### J5 Reach in the page (P2a S2)

- **Given** CTC 02 analysed in Chromium. **When** the report shows. **Then** within 15 s the Machining step's Reach section shows the reachable % and the leftover list, and the Features step and the rest of the report work while it runs. **Check:** `e2e/reach.spec.ts` "CTC 02 reach in time", tagged `@timed`.
- Tap a leftover: its faces light, the viewer frames it and its line shows volume, footprint, deepest gap, direction, tool and why. **Check:** `e2e/reach.spec.ts` "tap a leftover".
- An "As milled" view hatches leftovers and regions no feature explains. **Check:** comes with the approved mock-up.
- A reach failure (worker error) shows "Reach check didn't finish" in the Reach section; the rest of the report is unchanged (APP-03). **Check:** `e2e/reach.spec.ts` "reach failure".

### J6 Ball, bull-nose and setups from reach (P2b)

- A floor fillet of 3 mm radius at the bottom of a pocket: with flat end mills only, a leftover along the fillet; with P2b's tools, none. **Check:** `reach.test.ts` "floor fillet cleared by a ball end mill".
- J4's comparison passes for a ball (`BallCutter`) and a bull-nose (`BullCutter`, corner 1/32 in) 1/4 in tool. **Check:** `reach:ocl`.
- Setups: `npm --prefix web run parity:refreeze quick` and `full` refuse any change outside P2b's allowed list; the report of changed setups goes to Morgan part by part before `--write`. **Check:** the re-freeze report in the PR.

### J7 Nothing else changes (every slice)

- P1 S1, P2b: the guarded re-freeze (D-086) changes only the slice's allowed keys; then `npm run parity` passes on the new key. P1 S2, P2a: `npm run parity` passes on the existing key (reach is outside `analyze()`). NIST CTC 02's analysis stays under its 10 s limit (7-9 s today).

## Decisions

- Stock is the box with no allowance; the user may type their own; the extra shows as facing per side, not as regions. Milled parts only (D-085).
- Removal is box minus the solid's exact volume (D-085). Feature volumes come from each feature's sizes, not from cuts; regions no feature explains come with P2a's maps (Morgan, 2026-11-11, after the removal prototype).
- Unrecognised but reachable material is a Low note; unreachable is High; material only an assumed-length tool can't reach is Medium and says the length is assumed (D-085).
- P2a: flat end mills from `config/tools.toml`, drills only along found holes' axes; ±X ±Y ±Z; flute 3 × D, stick-out 4 × D, holder a 2 in cylinder from 4 × D above the tip (assumptions, D-085).
- Cell D/4 per tool, at most 4 M cells per direction map, directions on up to min(3, cores − 1) workers; a conservative height map checked against OpenCAMLib before it ships; OpenCAMLib built from source for tests only (D-087).
- P2b: ball and bull-nose at the same 11 diameters, bull-nose corner 1/32 in on 1/4 in and up (assumption); setups come from reach; the key is re-frozen with the setup changes shown to Morgan part by part (D-085).
- Removal is in `analyze()` (exact, fast); reach runs after the report, in its own workers, outside `analyze()` (this spec, from D-085's "report shows at once").

## Alternatives rejected

- **Regions from the OpenCascade cut (D-085 as written):** the cut gives one connected region on most parts (CTC 01: 1 region; CTC 02: 99.95 % in one), so it can't say which material no feature covers; splitting it by features took up to 12.0 s and disagreed on twin files (removal prototype). Fails always on parts machined from the outside.
- **Manifold for leftover volume (D-085 approved it):** leftover material lies above the part along its own direction, so sampling the leftover columns against the other directions' maps gives volumes without building solids from 4 M-cell maps (whose cost the spike did not measure). It saves 218 kB gzip and a runtime dependency. It would be needed if regions had to be exact solids (for a DXF later).
- **Reach inside `analyze()`:** the report would wait 4-10 s more on CTC 02 (D-085: the report shows at once).
- **Centre-sampled height map:** optimistic on 0.13-20.7 % of points (spike, D-087).
- **A one-cell-wider disk instead of a conservative raster:** safe to 0.177 mm but pessimistic on 3.4-76 % of points (spike); the conservative raster is tested against OpenCAMLib in J4, and the wider disk stays the fallback if J4 fails.
- **Leftovers as engine findings with rows and cost:** they would change every parity key and the cost before P4 weighs them.
- **Hole centres from the engine (a new `axis_point_mm` field):** a re-freeze of every hole file in P2a; a circle fit on the hole's cylinder vertices needs no engine change and is checked against OpenCascade in J3.

## Risks

- The conservative raster costs more than the spike's centre sampling → P2a S1 "First" times CTC 02 before anything else; over 15 s in Chromium with 3 workers: stop, take the numbers to Morgan (2 M cap: 2.6 s in the spike).
- Morgan's PC is not measured; a PC with 1 worker is under 15 s only if no more than about 1.5× slower than this container (spike estimate) → the Reach section shows progress per direction, and the timing is part of Morgan's slice check (D-077).
- Many tiny corner leftovers would bury the useful ones → `min_leftover_mm3` (1 mm³, assumption) hides them from the list (they stay in the %), and the corner radius check already flags sharp corners.
- Typed stock in the wrong orientation → sizes are matched largest to largest (assumption), and the lines name the part's sides.
- Re-freezing makes the key follow the engine → the guarded script refuses changes outside each slice's allowed list (D-086).
- Check time (D-073, 900 s; 664 s measured on the spike branch): `removal_nist.test.ts` and `reach_nist.test.ts` run in `npm run timed` (`vitest.timed.config.ts`), which `npm run check` runs for engine changes (D-082); `reach.test.ts` and `heightmap.test.ts` use built parts only; time each before it joins and report against the budget (VER-11).

## Design

### P1: removal (`web/src/engine/removal.ts`, new)

- `removal(features, faces, bboxMm, partMm3): Removal`, called in `analyze.ts` after the features, for `process === "mill"`; `null` for "turn". `bboxMm` is `extentsMm(frame, vertices)` (`analyze.ts:73`, before the inch rounding).
- `Removal` (in `api.ts`, field `removal: Removal | null` on `Analysis`):
  `{ stock_mm3, part_mm3, total_mm3, features: { feature: string; volume_mm3: number }[], explained_mm3, unexplained_mm3, unexplained_pct }`. Numbers rounded to 0.001 mm³ (`round`, `units.ts`), `unexplained_pct` to 0.01.
- **Feature volumes** (`VOLUME_KINDS`): `hole`: π × (`diameter` / 2)² × `depth` per segment (drill points and countersinks not counted: assumption, small). `pocket`: the projected area of its faces' mesh triangles whose normal has a positive component along `axis` (triangle area × that component), × `depth`. Steps and slots: the steps-slots S1 and S2 builds add `step` and `slot` to `VOLUME_KINDS` with the pocket's formula (a note goes in that spec's S1 "First" check).
- `explained_mm3` = min(sum of feature volumes, `total_mm3`); `unexplained_mm3` = total − explained; `unexplained_pct` = unexplained ÷ total × 100 (0 when total is 0).
- An assumption line in `ASSUMPTIONS` (`settings.ts:36`): "Removal is the stock block minus the part's exact volume; each hole's and pocket's own volume comes from its sizes (approximate), and the rest is material no found feature explains, such as an outside profile."
- **Parity:** the re-freeze's `ALLOWED` (`parity-refreeze.test.ts:26`) becomes `keys: ["removal", "assumptions"]`, `featureFields: {}`; nothing else may change.

### P1: page (`web/src/removal.ts`, new; `findings.ts`, `report.ts`, `viewer.ts`, `main.ts`)

- `removalLines(result, typed?: [number, number, number]): string[]` (pure, inches in, the lines out). Volumes show as in³ to 2 decimals then mm³ grouped with commas; the stock as `formatSize`.
- Typed stock: three number fields (in) and Apply, in the Machining step's plan list under Stock. Sizes and the part's `bbox_in` are each sorted largest first and paired; any typed size under its pair → the "smaller than the part" line. Facing per axis: (typed − part) ÷ 2 per side (assumption: the part sits centred), with that layer's volume; one line per axis pair. Not stored (session only).
- Ghost stock: a box mesh in the viewer in the part frame (`result.part.frame`, from the min corner of the extents), its edges drawn, opacity `GHOST_OPACITY`; a "Stock" toggle beside the view buttons.
- PDF (`report.ts`, Part summary, after Stock): the same lines (typed stock not in the PDF: assumption, the PDF is the file's own review).
- Exact placement, wording and toggle: the P1 mock-up (`ui-mockups`) approved before S1's code.

### P2a: reach core (`web/src/reach/`, new; no OpenCascade)

- **Input** (`ReachInput`): triangle soup in the part frame (Float32Array, mm), face id per triangle (Int32Array), the stock box (min, max), tools (the 11 end mills as diameters, mm), drilled holes (Design "Drills"), the feature face sets (for "explained"), config.
- **Config** `config/reach.toml` (loaded as `settings.ts` loads `tools.toml`): `flute_x = 3.0`, `stickout_x = 4.0`, `holder_diameter_in = 2.0`, `cell_div = 4`, `max_cells = 4_000_000`, `max_workers = 3`, `tol_mm = 0.01`, `min_leftover_mm3 = 1.0`, `unexplained_min_share = 0.01`, `voxel_cap = 2_000_000`, each with a `source` comment ("D-085 assumption", "D-087").
- **Orientation:** soup rotated by `frame.x/y/z` (dot products). A soup whose signed volume is negative is flipped (FTC 08 `-e1-tg`); the height map itself does not depend on winding.
- **Height map** (`heightmap.ts`, from the spike's, kept in `reach-spike/` unchanged): per direction and grid, H[c] = the highest point of any triangle over cell c's closed square: each triangle is clipped to every cell its projection touches and the clipped polygon's highest vertex is taken. Each cell also keeps the face id of that highest point.
- **Grids:** per tool, cell = max(D / `cell_div`, the cell that keeps the direction's map under `max_cells`). One raster per distinct cell size per direction.
- **Tip map:** T = max of H over every cell whose square meets the disk of radius R around the cell centre (conservative dilation); then max with (holder dilation of radius 25.4 mm on the same rule, on the spike's pooled grid, minus `stickout_x` × D). Flute length does not enter the map: the shank is taken as D up to the holder (assumption), so the tool body collides as the cutter does. Also kept: T without the holder (for "why").
- **As-milled map:** M[c] = min of T over the tool positions whose disk covers cell c's whole square (radius R − cell × √2 ÷ 2). A cell is cut down to M[c]; cells where no position covers the square keep the stock top.
- **Drills:** each hole segment in an operation with a `drill` tool: its axis and radius, centre from a least-squares circle fit (Kåsa) on its cylinder faces' vertices projected across the axis, span from those vertices along the axis plus the open ends out to the stock. Material inside a drilled cylinder counts as cut.
- **Voxels:** one grid over the stock, cell = max(cube root of stock volume ÷ `voxel_cap`, the finest tool cell). A voxel centre p is **open** from d when p's height along d is above H(d) at its cell (finest map of d). It is **cut** when some (d, tool) has p above M(d, tool), or it is inside a drilled cylinder. **Width-left:** open and not cut even with every T taken without the holder. **Explained:** open from some d whose cell's face id belongs to a feature in `VOLUME_KINDS`.
- **Leftovers:** open, not cut voxels, 26-connected into regions. Each region: `volume_mm3` (voxels × voxel volume), `direction` (the d with most of its voxels open), `footprint_mm` (its extent across d, two numbers, largest first), `deepest_mm` (largest M − H along d over its cells), `tool` (smallest end mill id), `why` ("width" if any voxel is width-left, else "length"), `severity` (high for width, medium for length), `faces` (face ids under its columns along d). Regions under `min_leftover_mm3` are counted, not listed.
- **Unexplained regions:** open, not explained voxels, 26-connected; listed when over `unexplained_min_share` × removal total (assumption until Morgan's parts set the size, D-085); severity low.
- **Output** (`Reach`, in `api.ts`): `{ reachable_pct, leftover_mm3, leftovers: Leftover[], unexplained: Region[], directions: { dir, cells, cell_mm, ms }[], ms, assumptions: string[] }`. `reachable_pct` = (removal total − leftover voxels' volume) ÷ removal total × 100, with P1's exact total.
- **Node entry:** `web/scripts/reach.mjs <file.step>` runs `analyze` then reach on one thread and prints the JSON (used by J3's NIST tests, `reach:ocl` and the status page).

### P2a: OpenCAMLib check (`web/scripts/build-ocl.sh`, `web/scripts/reach-ocl.mjs`)

- `build-ocl.sh`: clone upstream at the pinned commit into `web/.cache/opencamlib/src`, then the spike README's commands (Boost headers from `apt-get install libboost-dev`, `node-api-headers`, cmake with `-DBUILD_NODEJS_LIB=ON -DVERSION_STRING=1a450b7`). Skips when `ocl.node` exists. `web/package.json` gets `"reach:ocl": "sh scripts/build-ocl.sh && node scripts/reach-ocl.mjs"`. `node-api-headers` is installed into `web/.cache/`, not `web/node_modules`.
- `reach-ocl.mjs`: the spike's `ocl-check.mjs` method (part rotated so d is +Z, sampling on our cell centres, cutter and surface held in variables), on the new `heightmap.ts`, the cases in J4.

### P2a: page (`web/src/reach-client.ts`, `web/src/reach-worker.ts`, `steps.ts`, `findings.ts`, `viewer.ts`)

- After a milled report shows, `startReach(result)` builds the soup from `result.faces` and posts one job per direction group to `min(max_workers, navigator.hardwareConcurrency − 1)` module workers (at least 1), directions dealt round-robin in `ORDER`; each returns its maps' summaries (H, M per tool, face ids, as transferable buffers); the page thread then runs the voxel pass (assumption: under 1 s on CTC 02; S1 "First" times it, and if over, it moves to a worker). A newer analysis ends the older reach.
- Machining step: a Reach section (progress per direction, then the % and the list); the As-milled view; tap a leftover to light its faces. Exact layout: the P2a mock-up, approved before S2's code.

### P2b: tools and setups

- **Kernels:** ball: T = max over the disk of (H(q) − R + √(R² − r²)); bull-nose with corner c: flat to R − c, then the corner arc; M uses the same profile. Conservative as the flat tool (cells whose square meets the disk, the profile at the nearest point of the square).
- **Tools:** `config/tools.toml` `[end_mills]` gains `ball_inch` (the 11 sizes) and `bullnose_inch` (the 7 sizes from 1/4 in) with `bullnose_corner_in = 0.03125`.
- **Setups from reach:** for each planned feature, its candidate directions (`tool_dirs ?? open_dirs`) are kept only where reach cuts its faces' voxels with its planned finishing tool (or a ball or bull-nose tool, which is then added to its operations in that setup). A feature left with none keeps its candidates and its leftover stays a finding. `plan()` takes the filtered directions; the analysis shows at once with today's setups, and the Machining step re-plans when reach arrives (`replan(result, reach)`, pure).
- **Parity:** `parity.test.ts` and the re-freeze run analyze, then reach (Node, one thread), then `replan`; `ALLOWED` is the setups keys of D-086 (`setups`, `operations`, `tools`, `tool_changes`, `cost_drivers`, `cost_total`), every hole and pocket keeping a tool it had or gaining a ball or bull-nose one.

## Slices

Order (D-085): P1 S1, P1 S2, then steps and slots S1 and S2 (D-081), then P2a S1, P2a S2, P2b. One mock-up for P1 covers S1 and S2; one for P2a covers S2.

### P1 S1 Removal numbers

- **Morgan tries:** upload a work part or `clean_pocket.step`: the Machining step and the PDF say how much comes off and how much no found feature explains.
- **First:** the P1 mock-up (`ui-mockups`) of the lines, the typed stock and the ghost stock; Morgan approves it before code.
- **Checks that fail now:** J1; J7 (re-freeze adds `removal`).
- **Files:** `web/src/engine/removal.ts` (new), `analyze.ts` (call it), `api.ts` (`Removal`, `removal`), `settings.ts` (assumption line), `findings.ts` (two plan lines), `report.ts` (two PDF lines), `web/src/removal.ts` (`removalLines`), `engine/port/removal.test.ts`, `engine/port/removal_nist.test.ts`, `vitest.timed.config.ts` (include), `report.test.ts`, `e2e/removal.spec.ts`, `parity-refreeze.test.ts` (`ALLOWED`), `tests/parity/key/`, tests that pin `assumptions` (named in the PR).
- **Waits on:** none.

### P1 S2 Ghost stock and your own stock

- **Morgan tries:** the Stock toggle; type a larger stock and read the facing lines.
- **Checks that fail now:** J2.
- **Files:** `viewer.ts` (stock box, toggle), `findings.ts` (fields, Apply), `web/src/removal.ts` (facing, too-small), `main.ts` (wiring), `web/src/removal.test.ts`, `e2e/removal.spec.ts`.
- **Waits on:** P1 S1.

### P2a S1 Reach core in Node

- **Morgan tries:** the status page: per NIST part, reachable %, leftovers and unexplained regions, with the +Z picture as in the spike.
- **First:** time the conservative raster and the voxel pass on CTC 02 in Node and Chromium (the spike's harnesses on the new `heightmap.ts`); over 15 s with 3 workers: stop and take the numbers to Morgan.
- **Checks that fail now:** J3, J4.
- **Files:** `web/src/reach/{heightmap,tools,drills,voxels,reach}.ts` (new), their tests, `reach_nist.test.ts`, `vitest.timed.config.ts` (include), `config/reach.toml`, `settings.ts` (loader), `web/scripts/{reach.mjs,reach-ocl.mjs,build-ocl.sh}`, `web/package.json`, `.gitignore`, `licences.test.ts`, `api.ts` (`Reach`).
- **Waits on:** steps and slots S2 (D-085 order), so steps and slots count as explained.

### P2a S2 Reach in the page

- **Morgan tries:** open CTC 02 or a work part: the Reach section fills in; tap a leftover; the As-milled view.
- **First:** the P2a mock-up, approved by Morgan; its checks complete J5.
- **Checks that fail now:** J5.
- **Files:** `web/src/{reach-client,reach-worker}.ts` (new), `steps.ts`, `findings.ts`, `viewer.ts`, `main.ts`, `e2e/reach.spec.ts`.
- **Waits on:** P2a S1.

### P2b Ball, bull-nose and setups from reach

- **Morgan tries:** the re-freeze report, part by part; then a part with floor fillets.
- **First:** time reach on the quick parity set in Node; if `npm run check` would pass 900 s (D-073), stop and take the numbers to Morgan.
- **Checks that fail now:** J6.
- **Files:** `web/src/reach/{tools,reach}.ts`, `config/tools.toml`, `web/src/engine/plan.ts` (`replan`), `parity.test.ts`, `parity-refreeze.test.ts`, `tests/parity/key/`, `findings.ts` (re-plan on arrival), the tests that pin setups (named in the PR).
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

## Open questions

- Which free options the engineer meant; which setup issues the shop runs into most; when the engineer's parts arrive (D-085, Morgan).
