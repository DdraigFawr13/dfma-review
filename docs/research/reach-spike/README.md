# Reach spike (D-085 step 1), 2026-11-11

The three measurements D-085 asks for before the P1 and P2 spec. Code: `web/src/reach-spike/` (run by `vitest.spike.config.ts`, not by `npm run check`; nothing in the app imports it). Manifold probes: `manifold/` here. Machine: this cloud container, 4 cores, Node 22.23.4, Chromium 153.0.8010.12 (Playwright's). Morgan's PC is not measured; its times are unknown.

## Answers

1. **Reach timing fits the 15 s budget.** On the largest NIST part (CTC 02), with all 6 directions, all 11 end mills and the holder, one Chromium worker takes 4.2 to 10.0 s with each tool on its own grid. Three workers take 2.0 to 3.8 s. Proposed rule: cell = D/4, capped at 4 M cells per map, directions spread over up to 3 workers.
2. **Manifold is small and loads fast.** The Vite build emits 44,026 B of JS and 541,470 B of wasm (gzip 14,182 + 203,843 B). That is 1.4 % of the 41,036,092 B OpenCascade wasm the site ships already. It loads in 34 to 45 ms in Chromium (5 cold runs, no network). Every NIST mesh welds into a valid manifold.
3. **OpenCAMLib is LGPL-2.1-or-later, builds and runs here.** Morgan approved the install (2026-11-11). The Node binding was built from upstream source in 29 s and checked our tool-tip heights. Finding for P2a: sampling H at cell centres is optimistic. On 0.13 to 20.7 % of points our tip is lower than OpenCAMLib's, so a tool would seem to reach where it can't. A disk one cell wider is safe to 0.177 mm, but pessimistic on 3.4 to 76 % of points.

## 1. Reach timing

Largest NIST part: `nist_ctc_02_asme1_ap242-e2.stp`, 680 × 860 × 400 mm, 635 faces, 92,062 triangles. It is the largest on every measure of the 17 (`meshes.run.ts` output, below).

**Method** (`heightmap.ts`):
- Mesh: the app's own `readStep` and `meshFaces` (0.05 mm, 0.5 rad).
- Height map H per direction ±X ±Y ±Z: the highest point along the direction at each cell centre, from a CPU triangle rasteriser. Each vertex also marks its own cell.
- Tool: a flat end mill of radius R. The tip at a cell stops at T = the highest H within R (a disk dilation, exact on cell centres).
- Holder: per D-085's assumption, a 2 in cylinder from 4 × D above the tip. It is a disk dilation of radius 25.4 mm on a grid pooled to about 3.2 mm, made once per grid.
- As-milled surface: M = the lowest T within R. A cell is cut when any tool position over it gets down, so this is a disk opening.
- A cell is left over when M > H + 0.01 mm.
- Tools: the 11 inch end mills in `config/tools.toml`. Drills are not in it (D-085: drills only along found hole axes, no height map).

**Checked before timing** (`check.run.ts`, 3 tests):
- The dilation matches brute force on 5 random maps.
- A pocketed block's height map is right from +Z and −Z.
- A 2 mm tool clears a 4 mm pocket except its corners, and a 6 mm tool leaves the whole pocket.
- Each test was seen to fail on a planted bug: the old edge bug in the sliding max, and dropping the erosion.
- First model error, caught here: reach as a dilation alone. It counts a band R wide beside every wall as left over (LESSONS "reach").

**Cell-size rules timed.** "one:c" puts every tool on one grid of cell c mm. "tool:k:cap" puts each tool on cell D/k, never finer than the cell that keeps the part's largest map under cap M cells. The smallest tool is 1/32 in (0.79 mm), so at D/4 its cell is 0.2 mm unless the cap stops it. On CTC 02 the cap sets the finest cell: 0.77 mm at 1 M, 0.54 mm at 2 M, 0.38 mm at 4 M.

CTC 02, all 6 directions × 11 tools, times in ms:

| rule | Node, 1 worker thread | Chromium, 1 worker | Chromium, 3 workers | Chromium, 6 workers |
|---|---|---|---|---|
| one:0.8 | 10,196 | 11,224 | | |
| tool:4:1 | 3,618 | 4,183 | 1,950 | |
| tool:4:2 | 5,507 | 5,853 | 2,622 | |
| tool:4:4 | 9,098 | 9,955 | 3,809 | 3,665 |
| tool:8:4 | 14,702 | 17,024 | 6,538 | 5,659 |

- Node: `node src/reach-spike/time-node.mjs <part.f32> <rules…>`, raw output in `ctc02-node.txt` (compute time inside the worker).
- Chromium: `time-browser.mjs`, the same `heightmap.ts` with its types stripped by Node, in module Web Workers. The 1-worker figures are the worker's own time (the first run). The 3- and 6-worker figures are wall time from posting to the last answer, raw in `browser-workers.txt`.
- Split at tool:4:4 in Node: rasterising 3,533 ms, holder 672 ms, tools 4,890 ms. Rasterising is large because each tool size rasterises again.
- An untested idea, not timed: rasterise once at the finest cell and max-pool, which is one pass.
- Memory: Node resident set 343 MB at tool:4:4 and 389 MB at tool:8:4 (one worker). Not measured in Chromium.
- 6 workers on 4 cores gain little over 3: 3,665 against 3,809 ms.

**All 17 NIST files**, Node, 1 worker (`all17-node.txt`; it ran beside an apt install and the probes, so a few % of noise is possible):
- tool:4:2: CTC 02 5,691 ms, then CTC 05 4,241, CTC 04 2,874 and CTC 01 2,590. The other 13 files take 154 to 2,144 ms.
- tool:4:4: CTC 02 9,121 ms, then CTC 05 5,679, CTC 04 4,031 and CTC 01 3,799. The other 13 take 152 to 3,263 ms.

**Not covered** (REP-02):
- Refining where leftovers show is not built. Its cost depends on how much area is left over, which P2a sets.
- The leftover volumes are timing work only: the tip map is checked against OpenCAMLib (section 3), but not the full opening, the holder or the volumes.
- Cell-centre sampling loses half a cell at each wall. The test pocket's 48 mm³ reads as 36.75 mm³ at 0.5 mm cells.
- D-085's "smallest feature" part of the cell rule is not used; only tool size is.
- Ball and bull-nose tools (P2b) are not timed.

**Proposed for the P2a spec (not decided):**
- cell = D/4 per tool, capped at 4 M cells per map, directions on min(3, cores − 1) workers.
- Measured on CTC 02: 3.8 s on 3 workers and 10.0 s on 1. A 1-core-worker PC stays under 15 s only if it is no more than about 1.5× slower than this container (estimate).
- If that is too close, cap at 2 M: 5.9 s on 1 worker and 2.6 s on 3.

## 2. Manifold (`manifold-3d` 3.5.4, Apache-2.0)

- Package, from npm on 2026-11-11, installed in a scratch folder (not the repo's package files): `manifold.js` 82,371 B (gzip −9: 19,098 B) and `manifold.wasm` 541,470 B (gzip: 203,834 B).
  - SHA-256 of `manifold.wasm`: `73e3b419ad31294f6b1cc478173944e50efc4a34bfdeeff0107bdfc12975f11c`.
  - `LICENSE`: Apache License 2.0.
- Vite 8.3.6 build of a dynamic `import("manifold-3d")` (`manifold/index.html` and `main.js`): a 44,026 B JS chunk (gzip 14,182 B) and the wasm unchanged at 541,470 B (gzip 203,843 B).
  - Vite warns that `node:module` is externalised for the browser. That is harmless here: it is Manifold's Node path.
  - The site already ships `opencascade_full.wasm` at 41,036,092 B.
- Download time is an estimate, not measured: about 0.2 s for 218 kB gzip at 10 Mbit/s.
- Load in Chromium (`manifold/load.mjs`), fresh context each run so nothing is cached, served locally. The time runs from import to `setup()` done, plus a 10 mm cube's volume (1000):
  - totals 41, 34, 36, 41 and 45 ms;
  - import 7 to 11 ms; instantiate 27 to 34 ms.
- Welded meshes (`manifold/weld.mjs`, Node): each NIST mesh was welded by position on a 1e-4 mm grid.
  - All 17 load as valid manifolds (status `NoError`), in 4 to 155 ms each (CTC 02 155 ms).
  - Volume against OpenCascade's: within 0.063 % on 15 files, −0.278 % on FTC 11 (5,121 against 5,135 mm³).
  - FTC 08's tessellated file (`-e1-tg`) is inside-out: −503,281 mm³, exactly minus OpenCascade's volume. So `meshFaces` gives inward triangles for that file's tessellated faces. P2a has to orient them first; the viewer is not checked here.

## 3. OpenCAMLib

- **Licence, settled from source.** Upstream `aewallin/opencamlib` was cloned on 2026-11-11 at `1a450b7c3d3b669224a2a5d09aab7f319794574c`, committed 2026-10-17.
  - `COPYING` is "GNU LESSER GENERAL PUBLIC LICENSE Version 2.1, February 1999".
  - 84 source headers say "either version 2.1 of the License, or (at your option) any later version". The 31 files without a header are bindings and helpers.
  - The README badge says LGPL v2.1. `pyproject.toml` points to `COPYING`.
  - Only the npm wrapper's `package.json` (`src/npmpackage/package.json:30`, and the published `@opencamlib/opencamlib` 2023.01.11) says `"LGPL-3.0"`. "Or any later version" allows that, but it is not the source's own licence.
  - Answer: **LGPL-2.1-or-later.** As a test-time dependency that never ships (D-085), LGPL places no duty on the built site.
- **Build and run: done, from source, with Morgan's approval (2026-11-11).**
  - The session's permission check first refused both loading the npm package's prebuilt `ocl.node` (`@opencamlib/opencamlib` 2023.01.11, prebuilt for linux, macOS and Windows) and the first source build; Morgan then approved the install.
  - The repo's `install.sh` route (cmake-js) could not fetch Node headers: nodejs.org answered 405 through the network proxy.
  - What worked: Boost 1.83 headers (`apt-get install libboost-dev`), the npm package `node-api-headers` for the Node-API headers, and node-addon-api from `src/nodejslib`. Then `cmake -S . -B build/nodejs -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_NODEJS_LIB=ON -DVERSION_STRING=1a450b7 -DCMAKE_JS_INC=<node-api-headers>/include` and `cmake --build build/nodejs -j 3`. `VERSION_STRING` is needed because a shallow clone has no tags.
  - Result: 29 s, `ocl.node` 737,144 B; it loads in Node 22.23.4 and answers.
- **Cross-check** (`web/src/reach-spike/ocl-check.mjs`, raw output in `ocl-check.txt`):
  - Method: the part is rotated so each direction is +Z. OpenCAMLib's `PathDropCutter` with a `CylCutter` (1/4 in, flute 4 × D) runs along every 10th grid row. Its sampling is set so its points fall on our cell centres. The cell is D/8 (0.794 mm), so our disk is exactly 4 cells = R. Compared: our tip map T (dilation) against its tip heights, at the same points.
  - Two binding traps: it keeps raw pointers to the cutter and the surface, so hold both in variables. And a line takes floor(L / s + 1) samples.
  - FTC 06, 6 directions (3,968 to 12,288 points each): within 0.01 mm on 89.3 to 99.4 % of points, within 0.1 mm on 92.4 to 99.7 %. Ours lower (optimistic) on 0.13 to 9.70 %, higher on 0.12 to 1.40 %. Worst 268.49 mm.
  - CTC 02, 5 directions (+X −X +Y −Y +Z; 43,707 to 93,413 points each): within 0.01 mm on 78.6 to 95.2 %, within 0.1 mm on 94.5 to 97.6 %. Ours lower on 4.48 to 20.73 %, higher on 0.29 to 0.64 %. Worst 852 mm, a whole part width.
  - The −Z run was killed for lack of memory and was not repeated.
  - OpenCAMLib time: 2.4 to 7.0 s per direction on FTC 06, 62 to 129 s on CTC 02 (every 10th row). Test-time checks should use small parts or sparse rows.
  - With a disk one cell wider (r + 1): ours lower on 0 to 1.55 % of points, by at most 0.177 mm; ours higher on 3.43 to 76.44 %.
  - Reading (inference): the misses are edges and slopes between cell centres, which centre sampling cannot see. P2a needs a conservative raster (the highest point over each cell's area, not at its centre) or the wider disk, and has to pick between them by this same check. Not measured yet.

## Files

- `web/src/reach-spike/heightmap.ts`: the rasteriser, dilation, erosion, holder and per-direction run.
- `check.run.ts`: the 3 checks. `meshes.run.ts`: meshes the 17 NIST files into `tests/nist/.cache/reach-spike/` (gitignored).
- `time-node.mjs`, `time-browser.mjs` and `rules.mjs`: the timing harnesses. `ocl-check.mjs`: the OpenCAMLib cross-check (needs a built `ocl.node`). `picture.mjs`: the +Z picture (`ctc02-plusZ.png`).
- Run: `cd web && npx vitest run --config vitest.spike.config.ts src/reach-spike/`, then `node src/reach-spike/time-node.mjs ../tests/nist/.cache/reach-spike/nist_ctc_02_asme1_ap242-e2.f32 tool:4:4`. The browser harness also needs `DFMA_CHROMIUM` set.
- `manifold/`: the probes. They need `manifold-3d@3.5.4` installed in a scratch folder (`npm i manifold-3d@3.5.4`), and `weld.mjs` reads the spike's mesh cache.
