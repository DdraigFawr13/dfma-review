# DFMA Review

Reviews a mechanical part (a STEP file) for manufacturability, in your browser, on your own computer. Concept: [docs/CONCEPT.md](docs/CONCEPT.md). Current state: [docs/HANDOFF.md](docs/HANDOFF.md).

Your file is analyzed on this computer and deleted straight after the analysis. Nothing is kept or sent anywhere.

## Set up (once)

1. Install [Miniforge](https://github.com/conda-forge/miniforge) (conda from conda-forge). No Docker is needed.
2. In this folder, build the environment. It takes a few minutes the first time:

   ```
   conda env create -f environment.yml
   conda activate dfma
   python -m playwright install chromium
   ```

   The last line is only needed to run the browser tests.

To update an existing environment after `environment.yml` changes: `conda env update -f environment.yml --prune`.

## Start

```
conda activate dfma
python -m dfma start
```

The first start builds the web page (`npm ci` and `npm run build` in `web/`). Then open <http://localhost:8000>, choose a STEP file, and drag the part to rotate it.

Options: `--port 8001` for another port, `--no-build` to skip building the page.

## Checks

```
python scripts/check.py
```

This runs, in order: the master drift check, the service tests (`pytest tests/service`), the web type check and unit tests, the web build, and the browser tests (`pytest -m e2e`). It stops at the first failure.

Test parts are generated: `python tests/parts/make_parts.py` writes `tests/parts/*.step` and `tests/parts/expected.toml`. Both are committed.

To run the browser tests with a Chromium that is already installed, set `DFMA_CHROMIUM` to its path.

## Packages and licences

Approved in D-004, D-007, D-008 and D-031; versions are pinned in `environment.yml` and `web/package-lock.json`. Licences checked on conda-forge and npm on 2026-11-06.

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
| pypdf | 7.0.0 | BSD-3-Clause | tests (from S7) |
| vitest | 5.1.0 | MIT | tests |

Other packages in the environment are dependencies these pull in.
