# DFMA Review

Reviews a mechanical part (a STEP file) for manufacturability, in your browser, on your own computer. Concept: [docs/CONCEPT.md](docs/CONCEPT.md). Current state: [docs/HANDOFF.md](docs/HANDOFF.md).

Your file is analyzed on this computer and deleted straight after the analysis. Nothing is kept or sent anywhere.

## Set up (once)

Install [Node.js](https://nodejs.org/) 22 (the version in CI). Then, in this folder:

```
npm --prefix web ci
npm --prefix web exec -- playwright install chromium
```

The second line is only needed to run the browser tests. To use a Chromium that is already installed, set `DFMA_CHROMIUM` to its path.

## Start

```
npm --prefix web run build:pages
cd web && npx vite preview --outDir dist-pages --port 8000
```

Then open <http://localhost:8000>, choose a STEP file, and drag the part to rotate it. The analysis runs in your browser (a worker), so no server is needed.

## Checks

```
npm run check
```

This runs, in order: the master drift check, the NIST unpack, the web type check and unit tests (`vitest`), the web build, the test build, the parity run against the frozen key (`tests/parity/key/`), the browser e2e tests (Playwright, not timed), and the timed tests alone. It stops at the first failure.

The EDMR tests (114 files, about 9 minutes) are not in `npm run check`. Run `npm --prefix web run edmr` before a PR is marked ready, as with `npm --prefix web run parity:full`.

The part generators are Python and optional: `tests/parts/environment.yml` pins them. `python tests/parts/make_parts.py` writes `tests/parts/*.step` and `tests/parts/expected.toml`. Both are committed.

## Packages and licences

Approved in D-004, D-007, D-008 and D-031; versions are pinned in `tests/parts/environment.yml` (optional Python part generators) and `web/package-lock.json`. Licences checked on conda-forge and npm on 2026-11-06.

| Package | Version | Licence | Use |
|---|---|---|---|
| pythonocc-core | 8.0.1.2 | LGPL-3.0-or-later | geometry |
| occt (OpenCascade, pulled in by pythonocc-core) | 8.0.1 | LGPL-2.1-only | geometry |
| fastapi | 0.162.0 | MIT | web service |
| uvicorn | 0.54.0 | BSD-3-Clause | web server |
| python-multipart | 0.0.33 | Apache-2.0 | uploads |
| olefile | 0.47 | BSD-2-Clause | Inventor `.ipt` files (from I1, D-031) |
| nodejs | 22.23.4 | MIT | web build |
| three | 0.187.0 | MIT | 3D viewer |
| jspdf | 4.2.1 | MIT | PDF report (from S7) |
| vite | 8.3.6 | MIT | web build |
| typescript | 7.0.2 | Apache-2.0 | web build |
| @types/three | 0.187.0 | MIT | web build (types) |
| pytest | 9.2.0 | MIT | tests |
| httpx | 0.28.1 | BSD-3-Clause | tests |
| playwright, playwright-python | 1.60.0 | Apache-2.0 | browser tests |
| pytest-playwright | 0.10.0 | Apache-2.0 | browser tests |
| pytest-xdist | 3.8.0 | MIT | service tests in parallel (D-065) |
| execnet | 2.1.2 | MIT | pulled in by pytest-xdist |
| pypdf | 7.0.0 | BSD-3-Clause | tests (from S7) |
| vitest | 5.1.0 | MIT | tests |

Other packages in the environment are dependencies these pull in.
