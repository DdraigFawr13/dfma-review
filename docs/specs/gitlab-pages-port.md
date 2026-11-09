# GitLab Pages port: the whole app in the browser

- **Status:** Draft
- **Planned in:** [Port Round 1](https://claude.ai/artifact/GsFh2jKiaVwTGoDRxyRE4z) (collection `round1`), [Port Review 1](https://claude.ai/artifact/LB487Hw6uY7NAmwZHLERKk) (Morgan, 2026-11-09: "Ok approved with your recommendations"). Trial: `spikes/ocjs/README.md`. **Decisions:** D-001, D-004, D-006, D-009, D-011, D-054, D-055.

## Problem

Morgan, 2026-11-09: running on GitLab Pages "allows me to host it on my work computer / network". Today "I can't run this in my work PC or share it easily": the app is a Python service on Morgan's own PC at localhost (D-004). "Engineers will open the site and there is no automated review like this currently."

## Goals

- An engineer opens a link in Chrome, drops in a STEP file (and optionally its `.ipt`), and gets the same report as the Python app gives today, with nothing installed (Morgan: "As you say"). "The same" means the same findings (kind, count, face ids), the same features, plan, cost drivers, assumptions and rows, and every number equal to 6 significant figures (D-055).
- The site is static files only: any host that serves files serves it (GitLab Pages at work, GitHub Pages until then). No server code, no Python, no conda.
- CAD files never leave the engineer's PC: the file is read in the browser and nothing is sent anywhere (APP-01). The site says so where the file is picked.
- Parity is measured, not assumed: on every push a parity run compares the browser engine with the Python app on the same files, through our own checks (D-011, REP-05).

## Non-goals

- No new checks, thresholds, features or wording. Every number on screen comes from the same rule as today. The only new screen text: the "Checks not run yet" list (S1 to S7) and the licences page.
- No assemblies, history, time or dollars (later phases, HANDOFF plan map).
- No trimmed engine build (D-055: full build; trim later only if the download hurts).
- No accounts, no saved results, no server (D-006).
- No change to the look (UI_STYLE tokens).

## Journeys and checks

Each check fails at the starting commit, because `web/src/engine/`, the `pages` build, `tests/parity/` and the Checks-not-run list don't exist there.

### J1 Open the site and view a part (S1)

- **Given** the GitHub Pages copy. **When** Morgan opens it in Chrome and picks `tests/parts/report_sample.step`, Milling, Aluminum 6061.
- **Then** the Part step shows the same overview as the Python app: file name, size, face count and units; the model can be rotated. The start form says "Your file stays on this computer. Nothing is uploaded." The page reads "Test copy" in its header. The Report step lists the checks not run yet by name. **Check:** `tests/e2e/test_browser_engine.py::test_view_part` (pytest-playwright against the static build); `tests/parity/parity.test.ts` "part and faces" on the parity set.

### J2 The same findings as Python (S2 to S7)

- **Given** a slice has ported a group of checks. **When** the parity run analyses every file in the parity set with both engines.
- **Then** for every ported check the two results are equal under the D-055 tolerance, file by file; a file that fails in Python (a refused file, a crash) fails in the browser engine with the same message. **Check:** `cd web && npm run parity` (full set), and `scripts/check.py` step "parity" (quick set).

### J3 The page stays usable while a part is analysed (S1)

- **When** Morgan picks `nist_ctc_02_asme1_ap242-e2.stp` (the slowest NIST file today, 5.8 to 10.4 s in Python). **Then** "Analysing …" shows and the step tabs still respond to taps while the engine works. **Check:** `test_browser_engine.py::test_ui_responsive` (a click on a step tab during the analysis is handled within 200 ms).

### J4 No memory creep (S1, re-run each slice)

- **When** the same part is analysed 20 times in one tab. **Then** the engine's memory after run 20 is within 10% of its memory after run 2. **Check:** `web/src/engine/memory.test.ts` (Node; wasm memory size from the module's exported memory, as in `spikes/ocjs/browser.html`).

### J5 Engineers at work (S3 on)

- **Given** S3 has merged and Morgan has told IT or their manager (D-055). **When** the GitLab pipeline runs `.gitlab-ci.yml`'s `pages` job. **Then** the work copy serves the same build, without "Test copy" in its header. **Check:** Morgan's evidence (a screenshot of the work URL); before that, `npm --prefix web run build:pages -- --mode work` shows no "Test copy".

### J6 Licences (S1)

- **When** Morgan opens "Licences" from the page footer. **Then** it lists OpenCascade (LGPL-2.1 with the Open CASCADE exception) with a link to the exact `@taucad/opencascade.js` 3.0.0-beta.3 source and the engine's licence text, and every other package the page ships with its licence. **Check:** `test_browser_engine.py::test_licences`.

### J7 Python retired (S8)

- **When** the port is done. **Then** the repo has no `service/`, no `environment.yml`; `npm ci && npm run check` at the repo root runs every check; the parity key is the frozen JSON in `tests/parity/key/`; demos are built from the static site. **Check:** S8's checks.

## Decisions

- Engine: `@taucad/opencascade.js` 3.0.0-beta.3 (OpenCascade V8_0_0), pinned exactly; the `.wasm` file ships unmodified beside the code (D-054).
- `.ipt` files: `cfb` 1.2.2 (Apache-2.0) and the browser's own `DecompressionStream("deflate")`; property sets parsed by our own code (D-054). Assumption, checked first in S7: it inflates a stream that has bytes after its end, as `service/dfma/inventor/ole.py` `inflate` allows. If it refuses them, S7 stops and asks Morgan to approve `fflate` (MIT) instead.
- Config files: `config/*.toml` read with `smol-toml` 1.9.1 (BSD-3-Clause), imported at build time so the shop's TOML stays the one source (SRC-01). Proposed here; approving the spec approves it (SAFE-01).
- The engine runs in a module Web Worker; the page talks to it by messages (D-055).
- Python stays as the answer key until S8 (D-055).
- Hosting: a GitHub Actions workflow deploys `web/dist-pages/` to GitHub Pages from `main` only (CI-05); `.gitlab-ci.yml` holds the same build for work (D-055).

## Alternatives rejected

- **Keep the Python service and host it at work**: needs a server and Python on a company machine, which is what Morgan wants to avoid (round 1). It would fail where IT refuses a server.
- **Official `opencascade.js` 1.1.1 / 2.0.0-beta**: OpenCascade 7.6.2, last published 2023-03-23 (D-004). It would fail where 7.6 and 8.0 disagree, unmeasured.
- **Port all of it, then compare**: one big switch with no parity until the end. It would fail by finding differences only after weeks of work. Slices with a parity run each time catch them where they start.
- **Remove each Python piece once ported**: leaves nothing to compare later fixes against (round 1, Morgan chose to keep it).
- **A trimmed engine build now**: smaller download (size not measured) but needs our own Emscripten build in CI (D-055: later, if needed).
- **Port the tests to TypeScript slice by slice**: doubles each slice's work; the parity run already proves behaviour, and the Python tests keep guarding the answer key until S8, which ports what is left.

## Risks

- **Meshes differ on 214 of 8,137 NIST faces** (same nodes, different triangles; `spikes/ocjs/README.md`). The wall finder samples triangle centres (`service/dfma/features.py` `_inner_points`), so wall findings may differ → S5 measures it first. If any wall finding differs, S5 stops and the fix (a sampling that doesn't depend on triangles, changed in Python first and re-graded) goes to Morgan before code, because it changes Python's own findings.
- **pythonocc segfaults on 2 calls on `nist_ftc_08_asme1_ap242-e1-tg.stp`** where the fork's behaviour is unknown → the parity runner runs Python in its own process per file (as `tests/grading/child.py` does) and records a crash as a result; the browser engine must then report that file's error the same way the app does today.
- **The fork stops** (one company, beta) → the exact package files are kept in the repo's own release asset at S1 (`engine-3.0.0-beta.3.tgz`, from `npm pack`), so a later install never depends on npm keeping it.
- **Engine objects not freed** → J4 on every slice.
- **11.5 MB engine download** → served compressed; the browser caches it. Measured on the first slow-network open at work (Morgan's evidence, S3).
- **Bad files crash the engine** → the parity set includes `tests/parts/not_step.step`, `no_solid.step` and `tests/inventor/hostile.py`'s files; the worker restarts after an engine abort and the page shows the same error text as today.

## Design

### Parts

- `web/src/engine/`: the TypeScript engine. One file per Python module, same names and same function names in camelCase, so a reviewer can read them side by side: `read.ts` (`service/dfma/read.py`), `units.ts`, `settings.ts`, `frame.ts`, `mesh.ts`, `features/holes.ts`, `features/pockets.ts`, `features/walls.ts`, `features/turned.ts` (the parts of `features.py`), `rules/<id>.ts` (one per `service/dfma/rules/<id>.py`), `plan.ts`, `turning.ts`, `drivers.ts`, `rows.ts`, `inventor/*.ts` (one per `service/dfma/inventor/*.py`), and `analyze.ts`. `analyze.ts` exports `analyze(step: Uint8Array, name: string, process: Process, material: Material, ipt?: {bytes: Uint8Array, name: string}): Analysis`, returning the same JSON as `service/dfma/analyze.py` `analyze()`, plus `checks_not_run: string[]` (check names, as `rows.checks_run` words them) until S7 empties it.
- `web/src/engine/oc.ts`: loads the engine once (`init({ locateFile })`, as `spikes/ocjs` does) in Node and in the worker; every engine object made in an analysis is freed before `analyze` returns (a `using` block or `.delete()`).
- `web/src/worker.ts`: the module Web Worker. Messages: `{type: "analyze", step, name, process, material, ipt?}` in; `{type: "result", analysis}` or `{type: "error", message}` out. An engine abort ends the worker; the page starts a new one for the next file.
- `web/src/api.ts`: `analyze()` keeps its signature. A build flag picks the backend: `VITE_ENGINE=service` (today's `fetch("/api/analyze")`, the dev default until S8) or `VITE_ENGINE=browser` (the worker). Error messages are the strings in `service/dfma/settings.py` (`MSG_*`), copied into `engine/settings.ts`; the 50 MB limit is checked before reading.
- `web/vite.config.ts`: a `pages` build (`npm run build:pages`) with `VITE_ENGINE=browser` and relative asset paths (`base: "./"`) into `web/dist-pages/`; `--mode work` drops the "Test copy" header. The `.wasm` is emitted as an asset (checked: Vite 8.3.6 bundles the engine into a worker and it runs in Chromium from a plain static server, no special headers).
- `web/public/licences.html` (S1): the licences page.

### Parity

- `tests/parity/key.py <file>... --out <dir>`: runs `dfma.analyze.analyze` on each file in its own process (copy `tests/grading/child.py`'s pattern) and writes `<dir>/<file>.json`. The Python side of every comparison. Output is cached in `tests/parity/.cache/` (git-ignored), keyed by the SHA-256 of the file plus every file under `service/` and `config/`, so it re-runs only when Python or the part changes.
- `web/src/engine/parity.test.ts` (vitest, Node): loads each key JSON, runs `analyze()` on the same file, and compares: exact for strings, ids, kinds, counts and booleans; 6 significant figures for numbers; `faces[].positions` as a multiset of points rounded to 1e-5 mm and `indices` by triangle count only (the 214-face mesh difference); keys of unported checks must be absent from both sides' compared view and named in `checks_not_run`.
- Sets: **quick** = `tests/parts/*.step` (44) + the 33 NIST STEP files, in `scripts/check.py` on every push. **Full** = quick + `tests/edmr/models` (113) + `tests/grading/sets` (100) + the 16 `.ipt` pairs in `tests/inventor/files`, run by `npm --prefix web run parity -- --full` before a slice's PR is marked ready, its summary line pasted in the PR. MFCAD++ and Analysis Situs (downloaded, git-ignored) run by hand on recognition slices, as today (HANDOFF Next 2).
- After S8, `tests/parity/key/` holds the last Python output for the quick and full sets without `faces[].positions` (assumption: under 20 MB; measured in S8), and parity compares against it.

### Browser tests

- `tests/e2e/conftest.py` gains `--engine browser`: it serves `web/dist-pages/` with `python -m http.server` instead of starting the service. `scripts/check.py` runs the e2e suite twice: service (all tests, as today) and browser (all tests except those listed in `tests/e2e/browser_pending.txt`, one test id per line, each with the slice that removes it). The list only shrinks; S7 empties it, S8 deletes it.

### Hosting

- `.github/workflows/pages.yml` (S1): on push to `main`, builds `build:pages` and deploys with `actions/deploy-pages`; `timeout-minutes`, least-privilege `permissions` (`pages: write`, `id-token: write`), per-ref concurrency (CI-06). Morgan turns on Pages (Settings → Pages → Source: GitHub Actions) once; S1's builder sends the tap path.
- `.gitlab-ci.yml` (S3): a `pages` job on the default branch that runs `npm --prefix web ci && npm --prefix web run build:pages -- --mode work` and publishes `web/dist-pages` as `public` (GitLab's `pages` job artifact). If the work runners cannot download packages, the fallback is to commit the built `public/` folder instead (D-055); S3 does not decide which.

## Slices

Each slice ports its Python modules line for line, adds their checks to the parity compare, removes its names from `checks_not_run` and its tests from `browser_pending.txt`, and passes J4. A slice that changes a screen starts with a `ui-mockups` mock-up approved by Morgan (write-spec step 8); S1 is the only one that does.

### S1 Site, viewer and parity harness

- **Morgan tries:** the GitHub Pages link: pick a STEP file, see the Part step and the model, rotate it; open Licences.
- **Checks that fail now:** J1, J3, J4, J6; `parity.test.ts` "part and faces".
- **Files:** `web/src/engine/{oc,read,units,settings,frame,mesh,analyze}.ts`; `web/src/worker.ts`; `web/src/api.ts` (backend flag); `web/vite.config.ts` and `web/package.json` (`build:pages`, `parity`, deps pinned); `web/src/main.ts` or `steps.ts` (Test copy header, the file-stays-here line, Checks not run yet list: mock-up first); `web/public/licences.html`; `tests/parity/key.py`; `web/src/engine/{parity,memory}.test.ts`; `tests/e2e/conftest.py` (`--engine`), `tests/e2e/test_browser_engine.py`, `tests/e2e/browser_pending.txt`; `scripts/check.py` (parity and browser e2e steps); `.github/workflows/pages.yml`; `.gitignore` (`tests/parity/.cache/`, `web/dist-pages/`); `spikes/ocjs/` deleted (its findings live in D-054 and this spec).
- **Waits on:** Morgan approving the S1 mock-up; Morgan turning on GitHub Pages (after merge).

### S2 Holes

- **Morgan tries:** the same link with `tests/parts/report_sample.step`, `countersunk_hole.step`, `deep_hole.step`: the Features step shows the hole rows Python shows.
- **Checks that fail now:** parity on `holes`, `hole_walls` inputs, rules `hole_size`, `hole_depth`, `access` (holes; pockets in S4); the browser e2e tests on holes.
- **Files:** `web/src/engine/features/holes.ts` (`features.py` `Cyl` to `holes`, lines 33 to 676, and `number`), `web/src/engine/rules/{hole_size,hole_depth,access}.ts`, `web/src/engine/rows.ts` (the rows those rules produce).
- **Waits on:** S1.

### S3 Plan, cost and PDF (first work release possible)

- **Morgan tries:** Machining, Cost and the PDF on the link for a holes-only part (`clean_holes.step`); the PDF lists the checks not run yet.
- **Checks that fail now:** parity on `machine`, `setups`, `operations`, `tools`, `tool_changes`, `cost_drivers`, `cost_total`, `stock`, `passed`, `passed_rows`, `assumptions`; browser e2e `test_pdf.py`, `test_plan_panel.py`.
- **Files:** `web/src/engine/{plan,drivers,rows}.ts`; the PDF section listing checks not run (`web/src/report.ts`); `.gitlab-ci.yml`.
- **Waits on:** S2.

### S4 Pockets, corners, undercuts

- **Files:** `features/pockets.ts` (`features.py` lines 678 to 1353), `rules/{corner_radius,pocket_depth,undercut}.ts`, `access.ts` pockets. **Checks:** parity on pockets, corners, undercuts; their e2e tests. **Waits on:** S3.

### S5 Walls

- **First:** run parity on walls with a direct port; if any wall finding differs on the full set, stop and take the numbers to Morgan (Risks). **Files:** `features/walls.ts` (`walls`, `hole_walls`, `_inner_points`, `_Rays`, `_NearRays`), `rules/thin_wall.ts`. **Waits on:** S4.

### S6 Turned parts

- **Files:** `features/turned.ts` (`turned_profile`, `grooves`, `split_bores`, `profile_feature`, `coaxial`, `pocket_on_axis`), `turning.ts`, `rules/{turn_axis,turn_offaxis,turn_slender,bore_depth,looks_turned}.ts`. **Waits on:** S5.

### S7 Inventor pairs

- **Files:** `inventor/*.ts` (`ole`, `sab`, `tags`, `topo`, `surfaces`, `part`, `pair`, `threads`, `holes`, `names`, `blends`), `rules/{thread_mismatch,hole_mismatch,blend_mismatch}.ts`; the second file field already exists. **Checks:** parity on all 16 pairs; `tests/inventor/hostile.py` cases give the same errors; `checks_not_run` and `browser_pending.txt` empty. **Waits on:** S6.

### S8 Retire Python

- **Files:** freeze `tests/parity/key/`; port the e2e suite to `@playwright/test` (`web/e2e/`) and the service tests that are not covered by parity (`test_rules.py`, `test_rows.py`, `test_units.py`, `test_inventor_safety.py` and the like: the builder lists each one with where it went) to vitest; a root `package.json` with `check`; delete `service/`, `environment.yml`, `tests/e2e/`, the parity cache; `scripts/make_demo.py` replaced by a Node script that builds demos from `web/dist-pages`; `ci.yml` runs Node only; README and AGENTS "Local checks". **Waits on:** S7, and Morgan's approval of the S8 file list.

## Verification

- Every push: `python scripts/check.py` (until S8; it gains the quick parity and the browser e2e run in S1), then `npm run check` at the root after S8.
- Before a slice's PR is marked ready: `npm --prefix web run parity -- --full`, its summary in the PR.
- End to end: the GitHub Pages link on Morgan's PC (D-009 status page per slice); the work URL from S3 on, by Morgan.

## Open questions

- Does the work GitLab build the site (runners that can download npm packages) or serve committed files? Morgan checks before the work release (S3; D-055 default: a pipeline).
- Does the parity run fit CI's 20-minute limit with the quick set? Measured in S1; if not, the quick set shrinks to the 44 test parts and NIST runs before ready only.
