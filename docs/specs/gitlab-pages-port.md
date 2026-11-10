# GitLab Pages port: the whole app in the browser

- **Status:** Approved 2026-11-10 (Morgan on [Port Spec Approval](https://claude.ai/artifact/AjZQkdVY7ATByDULSNBfmQ), collection `final`: "Approved, start building"; D-056)
- **Planned in:** [Port Round 1](https://claude.ai/artifact/GsFh2jKiaVwTGoDRxyRE4z) (collection `round1`), [Port Review 1](https://claude.ai/artifact/LB487Hw6uY7NAmwZHLERKk) (Morgan, 2026-11-09: "Ok approved with your recommendations"). Trial: `spikes/ocjs/README.md`. **Decisions:** D-001, D-004, D-006, D-009, D-011, D-030, D-054, D-055, D-056, D-057, D-058. **S1 mock-up:** [approved 2026-11-10](https://claude.ai/artifact/EDnCkkdnccX7jjsjrP3ZJa) (D-057).
- **Approving this spec** also accepts D-054 (the engine and the static site), which replaces D-004's stack and D-006's package gate for the app.

## Problem

Morgan, 2026-11-09: running on GitLab Pages "allows me to host it on my work computer / network". Today "I can't run this in my work PC or share it easily": the app is a Python service on Morgan's own PC at localhost (D-004). "Engineers will open the site and there is no automated review like this currently."

## Goals

- An engineer opens a link in Chrome, drops in a STEP file (and optionally its `.ipt`), and gets the same report as the Python app gives today, with nothing installed (Morgan: "As you say"). "The same" means the same findings (kind, count, face ids), the same features, plan, cost drivers, assumptions and rows, and every number equal to 6 significant figures (D-055).
- The site is static files only: any host that serves files serves it (GitLab Pages at work, GitHub Pages until then). No server code, no Python, no conda.
- CAD files never leave the engineer's PC: the file is read in the browser and nothing is sent anywhere (APP-01). The start form says so.
- Parity is measured, not assumed: every push compares the browser engine with the Python app on the same files, through our own checks (D-011, REP-05).

## Non-goals

- No new checks, thresholds, features or wording, except: the "Not checked yet" notice (S1 to S7) and the licences page.
- No assemblies, history, time or dollars (later phases, HANDOFF plan map).
- No trimmed engine build (D-055).
- No accounts, no saved results, no server (D-006).
- No change to the look (`docs/UI_STYLE.md` tokens).

## Terms

- **Key:** the Python app's output for a file, written by `tests/parity/key.py`; the answer the browser engine must match.
- **Quick set:** `tests/parts/*.step` (44) and the 33 NIST STEP files in `tests/nist/NIST-PMI-STEP-Files.zip`; from S7 also the 16 `.ipt` pairs in `tests/inventor/files`.
- **Full set:** the quick set plus `tests/edmr/models` (113 STEP files) and `tests/grading/sets` (100). Counts from `find -iname '*.st*p'`, 2026-11-09.
- **Ported keys:** the response keys a slice has ported (table under Parity). The others are "not checked yet".

## Journeys and checks

Each journey's check fails at the starting commit, because `web/src/engine/`, the `pages` build, `tests/parity/` and the Not-checked-yet notice don't exist there.

### J1 Open the site and view a part (S1)

- **Given** the GitHub Pages copy. **When** Morgan opens it in Chrome and picks `tests/parts/report_sample.step`, Milling, Aluminum 6061.
- **Then** the Part step shows the same overview text as the Python app (file name, size, face count, units), and the model rotates. The start form says "Your file stays on this computer. Nothing is uploaded." The header says "Test copy". Features and Report show the Not-checked-yet line; Machining and Cost show "Not worked out yet in this copy." (Design "Not checked yet"). The Inventor file field is hidden until S7. **Check:** `tests/e2e/test_browser_engine.py::test_view_part`, `::test_not_checked_notice`; `web/src/engine/parity.test.ts` "S1 keys".

### J2 The same results as Python (S1 to S7)

- **When** the parity run analyses every file in the set with both engines. **Then** every ported key is equal under the D-055 tolerance, file by file. A file Python refuses gets the same message from the browser engine; a file that crashes Python is recorded, not failed (Parity). **Check:** `scripts/check.py` step "parity" (quick set); `npm --prefix web run parity:full` (full set) before a PR is marked ready.

### J3 The page stays usable while a part is analysed (S1)

- **When** Morgan picks `nist_ctc_02_asme1_ap242-e2.stp` (the slowest NIST file in Python: 5.8 to 10.4 s, HANDOFF). **Then** "Analysing …" shows and a tap on a step tab is handled within 200 ms during the analysis. **Check:** `test_browser_engine.py::test_ui_responsive`.

### J4 Memory (S1, re-run each slice)

- **When** the largest file in the full set (`nist_ftc_09_asme1_ap242-e1.stp`, 6.1 MB) and then a 50 MB STEP file are analysed in the page. **Then** each finishes, and the worker's wasm memory stays under 2 GB. A second analysis starts in a fresh worker (Design "Worker"). **Check:** `test_browser_engine.py::test_peak_memory`: the test build (Design "Browser tests") adds `wasm_bytes` (the `buffer.byteLength` of the memory the worker's own `instantiateWasm` instance exports) and `worker` (a count of workers made) to the reply; the test prints each file's value and checks the two analyses ran in different workers; the 50 MB file is made by `python tests/parts/make_parts.py --big-plate` (a new flag; today `main()` takes none) into the git-ignored `tests/parts/.cache/big_plate.step`: a 10 mm plate with a grid of through holes, the grid chosen in S1 so the file is 48 to 50 MB (under `MAX_UPLOAD_BYTES`), the grid recorded in the script. If it takes Python longer than `TIME_LIMIT_S`, the test opens the page with `?time_limit_s=600` and the time goes in the S1 PR.

### J5 Bad files and hangs (S1)

- **When** Morgan picks `not_step.step`, then `no_solid.step`, then a file whose analysis runs past `TIME_LIMIT_S` (60 s, `service/dfma/settings.py:18`). **Then** the page shows `MSG_NOT_STEP`, `MSG_NO_SOLID`, `MSG_TOO_LONG` with Try again, exactly as today; an engine crash shows `MSG_FAILED` with Try again. **Check:** `test_browser_engine.py::test_refused`, `::test_timeout` (the test build honours `?time_limit_s=1`; `nist_ctc_02_asme1_ap242-e2.stp` takes longer).

### J6 Licences (S1)

- **When** Morgan opens "Licences" from the page footer. **Then** it lists OpenCascade (LGPL-2.1 with the Open CASCADE exception) with a link to the exact `@taucad/opencascade.js` 3.0.0-beta.3 source and the engine's licence text, and every runtime package the page ships, with its licence. **Check:** `test_browser_engine.py::test_licences`; `web/src/licences.test.ts` fails when a `dependencies` entry in `web/package.json` is missing from the page.

### J6b The real worker gives the key's answer (S1, re-run each slice)

- **When** five files go through the real worker in Chromium: `report_sample.step`, `countersunk_hole.step`, `clean_holes.step`, `nist_ctc_01_asme1_ap242-e1.stp`, `nist_ftc_09_asme1_ap242-e1.stp`. **Then** each result equals its key on the ported keys, as in Node. **Check:** `test_browser_engine.py::test_worker_parity`: it saves each result to JSON and runs `npm --prefix web run compare -- <result.json> <key.json>`, a small CLI (`node web/src/engine/compare-cli.ts`; Node 22.23.4 runs TypeScript files directly, checked 2026-11-09) over `web/src/engine/compare.ts` (the same rules the Node parity uses), and fails on its non-zero exit.

### J7 The right copy in the right place (S1, S3)

- **Then** the GitHub Pages build says "Test copy" and the work build does not. **Check:** `web/src/copy.test.ts` builds both modes and checks the header text; `.github/workflows/pages.yml` runs `build:pages` with no mode and fails if the built `index.html` lacks "Test copy".

### J8 Engineers at work (S3 on)

- **Given** S3 has merged and Morgan has told IT or their manager (D-055). **When** the work GitLab runs `.gitlab-ci.yml`'s `pages` job. **Then** the work URL serves the same app without "Test copy". **Check:** Morgan's evidence (screenshot of the work URL).

### J9 Python retired (S8)

- **Then** `git ls-files service environment.yml tests/e2e` is empty; `npm ci && npm run check` at the repo root passes; parity against the frozen key in `tests/parity/key/` passes. **Check:** those three commands in the S8 PR.

## Decisions

- Engine: `@taucad/opencascade.js` 3.0.0-beta.3 (OpenCascade V8_0_0), pinned exactly; the `.wasm` ships unmodified beside the code (D-054).
- `.ipt` files: `cfb` 1.2.2 (Apache-2.0) and the browser's `DecompressionStream("deflate")`. Checked 2026-11-09: it inflates all 143 model streams of the 16 test files to the same bytes as `ole.py` (`spikes/ocjs/inflate.mjs`). Property sets are parsed by our own code (D-054).
- Config: `config/*.toml` imported as text (`?raw`) and parsed with `smol-toml` 1.9.1 (BSD-3-Clause), so the shop's TOML stays the one source (SRC-01). New dependency: approving the spec approves it (SAFE-01).
- The engine runs in a module Web Worker, one worker per analysis (D-055).
- Python stays as the answer key until S8 (D-055).
- Hosting: `.github/workflows/pages.yml` deploys from `main` only (CI-05); `.gitlab-ci.yml` holds the same build for work (D-055).

## Alternatives rejected

- **Keep the Python service and host it at work**: needs a server and Python on a company machine, what Morgan wants to avoid (round 1). Fails where IT refuses a server.
- **A portable Python bundle on each PC** (an unzipped conda env): meets "nothing installed" only loosely and doesn't give engineers a link to share (round 1: "share it easily"). Fails where IT blocks running unpacked programs.
- **Python in the browser (Pyodide)**: would avoid the port, but pythonocc-core has no WebAssembly build (assumption: not in Pyodide's package list; not checked). Fails at the first `import OCC`.
- **Official `opencascade.js` 1.1.1 / 2.0.0-beta**: OpenCascade 7.6.2, last published 2023-03-23 (D-004).
- **Port all of it, then compare**: differences found only after weeks of work. Slices with a parity run catch each where it starts.
- **Remove each Python piece once ported**: leaves nothing to compare later fixes against (round 1).
- **Free every engine object by hand**: many hundreds of call sites to get right. One worker per analysis frees everything at once; J4 checks the peak within one analysis.
- **Port the tests to TypeScript slice by slice**: doubles each slice; the parity run proves behaviour and the Python tests guard the key until S8.
- **Work release only after walls (S5)**: avoids a partial report at work, but Morgan chose an earlier release with the missing checks listed (D-055).
- **A release asset copy of the engine package**: an outside-repo upload for a risk the lockfile's integrity hash and npm already cover; a built site keeps working whatever npm does.

## Risks

- **Meshes differ on 214 of 8,137 NIST faces** (same nodes, different triangles; `spikes/ocjs/README.md`). S1's full-set parity (2026-11-10, 290 files): 282 the same, 6 crash Python (UMD files, LESSONS "read"), 2 differ in mesh points only, on 3 faces: `bn_ball6.step` faces 14 and 18 (B-spline; 6 of 153 points up to 0.35 mm apart, same counts) and `nasty_cheese.stp` face 202 (a cylinder's seam: the two engines duplicate different seam points, 3.5 mm apart). The compare is kept as it is (VER-01); S4 starts from these files. `_inner_points` samples triangle centres (`service/dfma/features.py:1377`), and pockets (`:930`, in `_reachable`) and walls (`:1488`) use it. Hole walls do not (`hole_walls` casts rays through `_NearRays`, `:1597`; rays are identical). → S4 measures it first: a direct port, parity on pockets over the full set. If any pocket or wall finding differs, S4 stops and the fix (sampling that doesn't depend on triangles, changed in Python first and re-graded) goes to Morgan before code, because it changes Python's own findings. The work release (S3) carries no pocket or wall checks, so engineers never see a finding that later changes for this reason.
- **A partial report read as complete** (S3 release) → the Not-checked-yet notice on the steps and the PDF names every check not run, and the cost total reads "partial" while any check that feeds a cost driver (D-030) is not checked yet (Design "Not checked yet").
- **pythonocc segfaults on `nist_ftc_08_asme1_ap242-e1-tg.stp`** in 2 calls the recognizers make → `key.py` runs each file in its own process and writes `{"crash": <exit code>}`; parity then requires the browser engine to return a result or `MSG_FAILED`, and lists the file in its summary as "Python crashed".
- **The fork stops** (one company, beta) → pinned with the lockfile's integrity hash; the fork's Docker build recipe is the way back (not tried). A deployed site keeps working.
- **11.5 MB engine download** → served compressed and cached by the browser; Morgan's first open at work is the measurement (S3).
- **CI time**: one 20-minute job today (`.github/workflows/ci.yml:28`) → S1 measures the quick parity and the browser e2e run; if the job passes 15 minutes, parity moves to its own job with its own cache (Open questions).

## Design

### Parts

- `web/src/engine/`: the TypeScript engine. One file per Python module, same names, functions in camelCase, so they read side by side: `oc.ts` (loads the engine), `read.ts`, `units.ts`, `settings.ts`, `frame.ts`, `mesh.ts`, `features/holes.ts`, `features/pockets.ts`, `features/walls.ts`, `features/turned.ts` (the parts of `features.py`), `rules/<id>.ts` (one per `service/dfma/rules/<id>.py`), `plan.ts`, `turning.ts`, `drivers.ts`, `rows.ts`, `inventor/<name>.ts` (one per `service/dfma/inventor/<name>.py`), `analyze.ts`.
- `analyze.ts` exports `analyze(step: Uint8Array, name: string, process: Process, material: Material, ipt?: {bytes: Uint8Array, name: string}): Analysis`. It always returns the full response shape of `service/dfma/analyze.py`; a key not ported yet holds what Python returns for a part with none of that kind (`[]`, `null`, `0`), and `checks_not_run: string[]` names, in `rows.check_name` wording, every rule of `service/dfma/rules/` not ported yet (S7 empties it; Python never returns it).
- `settings.ts` holds the `MSG_*` strings and the numbers of `service/dfma/settings.py`. `web/src/engine/settings.test.ts` compares them with `python tests/parity/key.py --settings` (a JSON dump of every upper-case name in `settings.py`) until S8.
- **Engine loading:** the worker imports `@taucad/opencascade.js` and its wasm URL (`@taucad/opencascade.js/wasm?url`), as the 2026-11-09 Vite check did. The page compiles the wasm once (`WebAssembly.compileStreaming`) and sends it to each new worker as the message's `module` field; the worker instantiates it through the loader's `instantiateWasm` option (assumption: the fork's loader honours it; checked first in S1, and if not, each worker compiles it, 0.59 to 0.68 s measured).
- **Config:** `settings.ts` ports `settings.py`'s loaders for `config/thresholds.toml`, `tools.toml` and `drivers.toml`, reading each file as text (`?raw`) with `smol-toml`.
- **Worker** (`web/src/worker.ts`): one module worker per analysis. The page sends `{id, module: WebAssembly.Module, step: ArrayBuffer, name, process, material, ipt?: {bytes: ArrayBuffer, name}}` with the buffers transferred; the worker replies `{id, ok: true, analysis}` or `{id, ok: false, message}` and the page then terminates it. The worker posts `{type: "ready"}` once the engine is loaded; the `TIME_LIMIT_S` timer starts then, so a slow first download is not a timeout. The page treats a worker `error` event as `MSG_FAILED` (retry) and no reply within `TIME_LIMIT_S` of `ready` as `MSG_TOO_LONG` (retry), and terminates the worker in both cases.
- `web/src/api.ts`: `analyze()` keeps its signature and its `ApiError(message, retry)`. `VITE_ENGINE=service` is today's `fetch` (the default for `npm run dev` and `build` until S8); `VITE_ENGINE=browser` uses the worker. Before reading, each file over `MAX_UPLOAD_BYTES` (50 MB, each file on its own, as `app.py:112`) gives `MSG_TOO_LARGE`.
- `web/vite.config.ts` and `web/package.json`: `build:pages` builds with `VITE_ENGINE=browser`, `base: "./"`, into `web/dist-pages/`; `VITE_COPY=test` by default, `--mode work` sets `VITE_COPY=work` (no "Test copy"). Checked: Vite 8.3.6 bundles the engine into a module worker and it runs in Chromium from a plain static server, without cross-origin isolation (`crossOriginIsolated` false).
- `web/public/licences.html` (S1): written by hand; `licences.test.ts` guards it.

### Not checked yet

- Features and Report show one line under the heading while `checks_not_run` is not empty: "Not checked yet in this copy: <names>." Until S3, Machining and Cost show instead "Not worked out yet in this copy." and no total (their keys hold Python's empty values). The overview's Fix · Review · OK counts and the Passed list count ported checks only, under the same line. The PDF prints the line in its summary. While any rule that `config/drivers.toml` maps to a driver is in `checks_not_run`, the cost total reads "<total> (partial)" on screen and in the PDF. Wording and place come from the S1 mock-up (`ui-mockups`), approved by Morgan before code.

### Parity

- `tests/parity/key.py --set quick|full --out <dir>` (also `--settings`): runs `dfma.analyze.analyze` (Aluminum 6061; the process `tests/parts/expected.toml` gives a part, else Milling) on each file in its own process (the `tests/grading/child.py` pattern) and writes `<dir>/<path relative to the repo, "/" as "__">.json`: the response, or `{"error": "<message>"}`, or `{"crash": <exit code>}`. Cached in `tests/parity/.cache/key/`, keyed by SHA-256 over `<relative path>\0<bytes>\0` for the part file, then for every file under `service/` and `config/` (skipping `__pycache__`), `tests/parity/key.py` and `tests/parts/expected.toml`, in sorted path order, then the pythonocc version string. The 33 NIST files and every set but `tests/parts` run Milling. `--settings` writes `tests/parity/.cache/settings.json`: `json.dumps` of every upper-case name in `settings.py` except the machine-specific `REPO_ROOT`, `WEB_DIR`, `DIST_DIR`, `CONFIG_DIR`, `HOST`, `DEFAULT_PORT` (tuples as lists, other values with `default=str`); `check.py` writes it before the web tests, and `settings.test.ts` reads that file (no Python call from vitest).
- `web/src/engine/parity.test.ts` (vitest, Node): reads the key dir (`PARITY_KEY_DIR`, default `tests/parity/.cache/key`) and the set (`PARITY_SET`, default `quick`), runs `analyze()` on each file, and compares the ported keys only: exact for strings, ids, kinds, counts and booleans; numbers to 6 significant figures, or within 1e-9 absolute (values near zero); `faces[].positions` as a sorted list of points rounded to 1e-5 mm, `faces[].indices` by length only (the mesh difference). The compare is filtered per slice (table below): a list key is compared on its items of ported kinds and rules only, and the plan and cost keys only on files that qualify. The summary line counts files compared and files left out for each key. The compare rules live in `web/src/engine/compare.ts`, shared with J6b.
- Ported keys by slice (mill files only until S6):
  - S1: `part` (except `not_analysed_faces`, which leaves out pocket faces: S4), `faces`, `assumptions`, refusal messages. `rules_run` is `[]` and `checks_run` is `rows.checks_run([])`; `checks_not_run` is every rule in `RULES` whose `PROCESSES` holds the process, in `RULES` order (for Turning, without `analyze.py`'s axis filter until S6).
  - Finding ids: `analyze.py:102` numbers findings `F1`, `F2`… across all rules in `RULES` order, so until S7 both sides' filtered findings are renumbered in order before the compare and every field that refers to a finding id (in `rows`, `passed_rows`, `cost_drivers`, `setups`, `operations`) is mapped the same way. From S7 ids compare as they are.
  - S2: `features` of kind `hole`; `findings`, `rows`, `passed` and `passed_rows` for rules `hole_size`, `hole_depth` and `access` on holes; `rules_run` equal to Python's filtered to ported rules.
  - S3: `machine`, `stock`, `setups`, `operations`, `tools`, `tool_changes`, `cost_drivers`, `cost_total`, on files whose key has no feature of kind `pocket` or `corner` and no finding from a rule not ported (the plan reads holes and pockets and the findings on them, `service/dfma/plan.py:108`). So until S5 a file with any `thin_wall` finding is left out of these keys, because that finding feeds a cost driver.
  - S4: kinds `pocket`, `corner`; `part.not_analysed_faces`; rules `corner_radius`, `pocket_depth`, `undercut`, `access` on pockets. S5: kind `wall`; `thin_wall`. S6: turn files, kinds `bore`, `groove`, `profile`, the turn rules, `turn_axis`. S7: `inventor` and the three mismatch rules. From S7 every key is compared on every file.
- `npm --prefix web run parity` runs the quick set; `parity:full` the full set. MFCAD++ and Analysis Situs (downloaded, git-ignored) run by hand on recognition slices, as today (HANDOFF Next 2).
- S8 freezes the last key for both sets, without `faces[].positions`, into `tests/parity/key/` (assumption: under 20 MB; measured in S8).

### Browser tests

- `tests/e2e/conftest.py` gains `--engine service|browser` (default `service`). `browser` serves `web/dist-pages-test/` with `python -m http.server` on port 8766. That is the test build, `npm --prefix web run build:pages:test` (`VITE_TEST=1`: the `wasm_bytes` and `worker` reply fields and the `?time_limit_s=` override; neither exists in `build:pages`), which `scripts/check.py` builds first. `PORT` stays 8765 for `service`. `test_browser_engine.py` is marked `browser_only` and is deselected in the service run. `check.py` runs the e2e suite twice: service (all other tests, as today) and browser (`--engine browser`, deselecting every id in `tests/e2e/browser_pending.txt`). Its format: one pytest node id per line, then ` # S<n>`, the slice that removes it; blank lines and lines starting with `#` are ignored; `conftest.py` reads it. S1 writes it from the first browser run: every failing test is listed with the slice that ports its feature. The list only shrinks; S7 empties it; S8 deletes it.

### Hosting

- `.github/workflows/pages.yml` (S1): on push to `main`, `npm --prefix web ci && npm --prefix web run build:pages`, the J7 check, then `actions/upload-pages-artifact` (`path: web/dist-pages`) and `actions/deploy-pages`; `timeout-minutes`, `permissions` `contents: read`, `pages: write`, `id-token: write`, concurrency per ref (CI-06). Morgan turns on Pages once (Settings → Pages → Source: GitHub Actions); S1's status page gives the taps. S1 records the engine's transfer size from GitHub Pages (whether it arrives compressed).
- **Before a merge** Morgan judges a slice on its status page and its view-only demo (D-009). From S1 the demo is built from browser-engine results: `scripts/make_demo.py --engine browser` takes its results from `npm --prefix web run demo-results` (the TS engine in Node) instead of the service. The live GitHub Pages link updates after the merge (CI-05: no branch previews).
- `.gitlab-ci.yml` (S3): a `pages` job on the default branch, image `node:22`, running `npm --prefix web ci && npm --prefix web run build:pages -- --mode work && mv web/dist-pages public && find public -name '*.wasm' -o -name '*.js' -o -name '*.html' | xargs gzip -k`, artifact `public` (assumption, not checked: GitLab Pages serves the `.gz` copies to browsers that accept them). If the work runners can't download packages, the fallback (commit `public/`) is Morgan's call at the move (D-055).

## Slices

Each slice ports its Python modules line for line, adds its keys to the parity compare, removes its rules from `checks_not_run` and its tests from `browser_pending.txt`, and passes J4. Only S1 changes a screen, so only S1 starts with a mock-up.

### S1 Site, viewer and parity harness

- **Morgan tries:** the GitHub Pages link: pick a STEP file, see the Part step and the model, see "Not checked yet" on the other steps, open Licences.
- **Checks that fail now:** J1, J3, J4, J5, J6, J7; `parity.test.ts` S1 keys; `settings.test.ts`.
- **Files:** `web/src/engine/{oc,read,units,settings,frame,mesh,analyze,compare}.ts` and `rows.ts` (`check_name`, `checks_run` only); `web/src/worker.ts`; `web/src/api.ts`; `web/index.html` (header `Test copy`, the start-form line, the `#ipt-field` hidden in the browser build), `web/src/steps.ts` and `web/src/report.ts` (the Not-checked-yet lines): mock-up first; `web/vite.config.ts`, `web/package.json` (scripts; `@taucad/opencascade.js`, `smol-toml` pinned); `web/public/licences.html`; `web/src/{licences,copy}.test.ts`; `web/src/engine/{parity,settings}.test.ts`; `tests/parity/key.py`; `tests/parts/make_parts.py` (`big_plate`); `tests/e2e/conftest.py`, `tests/e2e/test_browser_engine.py`, `tests/e2e/browser_pending.txt`; `scripts/check.py` (parity, browser build, browser e2e); `scripts/make_demo.py` (`--engine browser`), `web/package.json` `demo-results`; `.github/workflows/pages.yml`; `.gitignore` (`tests/parity/.cache/`, `tests/parts/.cache/`, `web/dist-pages/`, `web/dist-pages-test/`); `spikes/ocjs/` deleted (its results live in D-054, this spec and git history).
- **Waits on:** Morgan approving the S1 mock-up; Morgan turning on GitHub Pages after the merge.

### S2 Holes

- **Morgan tries:** the link with `report_sample.step`, `countersunk_hole.step`, `deep_hole.step`: the hole rows match Python's.
- **Checks that fail now:** parity S2 keys; the hole tests in `browser_pending.txt` (marked `# S2`) pass in the browser run.
- **Files:** `features/holes.ts` (`features.py` lines 33 to 676 and `number`, lines 1342 to 1353), `rules/{hole_size,hole_depth,access}.ts` (`access` whole; its pocket branch has nothing to judge until S4), `rows.ts` (whole).
- **Waits on:** S1.

### S3 Plan, cost and PDF (first work release possible)

- **Morgan tries:** Machining, Cost and the PDF for `clean_holes.step`; the PDF and Cost show what's not checked yet.
- **Checks that fail now:** parity S3 keys; the `# S3` tests.
- **Files:** `plan.ts`, `drivers.ts`; `web/src/report.ts` and the Cost step (the "(partial)" total); `.gitlab-ci.yml`.
- **Waits on:** S2.

### S4 Pockets, corners, undercuts

- **First:** port `_inner_points` and `_reachable` as they are and run parity on pockets over the full set; any difference stops the slice (Risks). **Files:** `features/pockets.ts` (`features.py` lines 678 to 1341 and `_inner_points`, `_Rays`), `rules/{corner_radius,pocket_depth,undercut}.ts`. **Checks:** parity S4 keys; `# S4` tests. **Waits on:** S3.

### S5 Walls

- **Files:** `features/walls.ts` (`walls`, `hole_walls`, `_NearRays`, `_touching`, `_on_face`), `rules/thin_wall.ts`. **Checks:** parity S5 keys (any difference: stop, as S4); `# S5` tests. **Waits on:** S4.

### S6 Turned parts

- **Files:** `features/turned.ts` (`turned_profile`, `grooves`, `split_bores`, `profile_feature`, `coaxial`, `pocket_on_axis`, `Round`), `turning.ts`, `rules/{turn_axis,turn_offaxis,turn_slender,bore_depth,looks_turned}.ts`. **Checks:** parity S6 keys; `# S6` tests. **Waits on:** S5.

### S7 Inventor pairs

- **Files:** `inventor/{ole,sab,tags,topo,surfaces,part,pair,threads,holes,names,blends}.ts`, `rules/{thread_mismatch,hole_mismatch,blend_mismatch}.ts`; `web/index.html` (`#ipt-field` shown again); `cfb` added to `web/package.json` and the licences page. **Checks:** parity S7 keys on the 16 pairs (now in the quick set); `tests/inventor/hostile.py`'s cases give the same messages; `checks_not_run` and `browser_pending.txt` empty. **Waits on:** S6.

### S8 Retire Python

- **Files:** freeze `tests/parity/key/`; port `tests/e2e/` to `@playwright/test` in `web/e2e/` and each service test parity doesn't cover to vitest, the PR listing every test file and where it went; a root `package.json` whose `check` runs the web check, build, vitest, parity and e2e; delete `service/`, `environment.yml`, `tests/e2e/`, `tests/parity/key.py` and its cache; replace `scripts/make_demo.py` with a Node script that builds demos from `web/dist-pages`; `ci.yml` on Node only; README and AGENTS "Local checks". **Checks:** J9. **Waits on:** S7, and Morgan approving the S8 file list.

## Builder defaults (S1, 2026-11-10)

Settled at build after the zero-decision re-check; none changes a goal (WS-02). Where the spec's words and the approved mock-up or today's code differ, the mock-up (D-057) and "exactly as today" win.

- **Builds:** `web/scripts/build-pages.mjs` sets `VITE_ENGINE`, `VITE_COPY` and `VITE_TEST`, then runs Vite (works on Windows): `build:pages [-- --mode work]`, `build:pages:test` (`--test`, into `dist-pages-test/`), `--demo` (into `dist-demo/`, for `make_demo.py --engine browser`). The browser copy's page changes (mark, privacy and status lines, hidden `#ipt-field`, Licenses footer) are made on the HTML by a Vite plugin, so the built `index.html` carries them and the service build is unchanged.
- **Licenses:** the link and page say "Licenses" (American spelling, D-057); the file stays `licences.html`. The browser build fails when a package in its bundle is missing from the page (18 packages at S1, jsPDF's included), and the page ships the engine's license and exception texts. `licences.test.ts` also checks every `dependencies` entry.
- **Key:** `key.py` also writes `<dir>/index-<set>.json` (path, process, key file), which `parity.test.ts` reads; a name listed twice in `expected.toml` takes its first entry's process; the hash cache sits in `tests/parity/.cache/by-hash/`. The quick set is 77 files: 44 parts and all 33 STEP files of the NIST zip (AP203 and AP242).
- **Compare:** `rules_run` and `checks_run` are Python's filtered to the ported rules (`PORTED_RULES` in `compare.ts`); a mesh point must find an unused partner within 1.5e-5 mm on every coordinate (Python's and JavaScript's rounding differ at a tie, so a sorted pairing misaligned on 75 of 77 files). `compare.test.ts` plants 6 changes and checks each is caught. The last merged slice is `web/src/engine/slice.ts`.
- **Not checked yet:** the lines key on `checks_not_run`, which only the browser engine returns; `checks_not_run` lists each check name once. Machining and Cost show "Not worked out yet in this copy." while `SLICE` < 3. The PDF prints the line in its summary in place of the verdict while no check has run, and the not-worked-out line under Machine plan and Cost drivers.
- **Refusals (J5):** too large, then a compound file (an `.ipt`) in the STEP field (`MSG_IPT_NEEDS_STEP`, as `app.py`), then the engine; "try again" shows only for too long and failed, as today (the spec's "with Try again" for every message did not match today's page). An engine abort is `MSG_FAILED`.
- **J3 (D-058):** a 10 ms heartbeat in the page and a tap on the Part tab timed from the test both stay under 200 ms from the upload to the worker's reply; the engine compiles while the page waits for a file, and the test waits for that first. The drawing after the reply is printed (310 to 484 ms here, software WebGL; the service app: 1,144 and 1,387 ms on the same file). The worker sends each face's normals and edge lines; the viewer draws all edges as one object and skips three's synchronous shader checks.
- **J4 (D-058):** `make_parts.py --big-plate`: 112 x 112 holes of 3 mm on a 5 mm pitch, 49.94 MiB (12,544 holes); one non-parallel cut (a parallel cut ran out of memory here). Python's reader takes 925.6 s on it. J4 is marked `per_slice` and runs once per slice, alone, with a 60-minute limit: `pytest -m per_slice --engine browser`; not in `check.py` or CI.
- **Test hooks:** `window.__dfma.analysis()` returns the result on screen; the test build adds `wasm_bytes` and `worker` to it.

## Verification

- Every push: `python scripts/check.py` until S8 (S1 adds the quick parity and the browser e2e run); from S8, `npm run check` at the root.
- Before a slice's PR is marked ready: `npm --prefix web run parity:full` and J4 (`pytest -m per_slice --engine browser`, alone on the machine; D-058), their summary lines in the PR.
- End to end: the GitHub Pages link on Morgan's PC (D-009 status page per slice); the work URL from S3 on, by Morgan.

## Open questions

- Does the work GitLab build the site, or serve committed files? Morgan checks before the work release (S3; D-055 default: a pipeline).
- Does `check.py` still fit CI's 20-minute job with the quick parity and a second e2e run? Measured in S1 (Risks).
