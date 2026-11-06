# First usable version: STEP part review

- **Status:** Draft
- **Planned in:** [design round 1](https://claude.ai/artifact/4Xa6iLguwU2pnXQXCAYydk), [round 2](https://claude.ai/artifact/LEGMPWU3Avt4E9pjnSvbhG), [approval](https://claude.ai/artifact/WDr91uJChvS9RkBziPWDHo) (2026-11-06). **Decisions:** D-001, D-003, D-004, D-005, D-006.

## Problem

Design reviews for manufacturability are "not really done at all" today (Morgan). The tool "should improve the designs of parts and improve manufacturing efficiency": a design companion for design mechanical engineers and shop managers. Morgan's test for the first deliverable is a "report with findings and machine estimates". Morgan "would hate if it was not useful", so every finding must show its evidence.

## Goals

- Morgan uploads one STEP part, picks milling or turning and a material, and within 30 s (assumption: parts under 5 MB) gets a review in the browser. The review shows each finding with its measured value, the threshold it broke and its face highlighted in 3D.
- The review lists the setups, the generic inch tools and the tool changes, and ranks what drives cost. No time and no dollars (D-003).
- All 7 rules pass their test parts: hole depth vs diameter, non-standard hole size, inside corner radius, deep pocket, thin wall, access and setups, turning checks. Each test part has a known answer.
- The review exports as a PDF with one image per finding.
- Every machine builds from one environment file with no Docker, and the app starts with one command at `http://localhost:8000` (D-004).

## Non-goals

- Assemblies and DFA, saved history, revision compare, time, dollars, accounts, batch upload, Morgan's own machine and tool lists, and native Inventor files. These are later phases (D-003).
- Faces other than planes, cylinders, cones and the fillets between them. The tool reports faces it can't classify as "not analysed" instead of guessing.
- Automatic choice of milling or turning. The user picks; the tool only flags a mismatch.
- Any AI at runtime (D-001).
- Drawing check and drawing generation (stages 3 and 4).

## Journeys and checks

### J1 Start and view a part

- **Given** a fresh clone and the environment built from `environment.yml`
- **When** Morgan runs `python -m dfma start` and uploads `tests/parts/box_through_hole.step`
- **Then** the part shows in the browser and can be rotated and zoomed. The part panel shows its size in inches (2.000 × 1.000 × 0.500 in) and its face count. **Check:** `tests/e2e/test_view.py::test_upload_shows_part` (Playwright screenshot plus face count), `tests/service/test_read.py::test_box_through_hole_faces`.

### J2 A rule finding with its evidence

- **Given** the app is running
- **When** Morgan uploads `tests/parts/deep_hole.step` (a 0.250 in hole, 2.000 in deep) in 6061
- **Then** the findings list shows "Hole depth 8.0× diameter (limit 6.0×)". Clicking it highlights that hole's faces and frames them. **Check:** `tests/service/test_rules.py::test_deep_hole`, `tests/e2e/test_findings.py::test_click_highlights_face`.

### J3 Every rule against its test parts

- **Given** the generated test parts in `tests/parts/` and their expected findings in `tests/parts/expected.toml`
- **When** the suite runs
- **Then** each part's findings match its expected rule ids, face ids and measured values to 0.001 in. Parts marked clean produce no findings. **Check:** `tests/service/test_expected.py` (parametrised over `expected.toml`).

### J4 Setups, tools and tool changes

- **Given** `tests/parts/two_sided_block.step` (pockets on +Z and −Z, holes on +X)
- **When** Morgan uploads it for milling
- **Then** the review shows 3 setups (+Z, −Z, +X), the tool per operation and the total tool changes, all matching `expected.toml`. **Check:** `tests/service/test_plan.py::test_two_sided_block`.

### J5 Turning

- **Given** `tests/parts/slender_shaft.step` (0.500 in diameter, 4.000 in long, one cross-hole)
- **When** Morgan uploads it for turning in 1018
- **Then** the review shows the turning axis, "Length 8.0× diameter (limit 4.0×)" and "Cross-hole needs a milling operation". **Check:** `tests/service/test_turning.py::test_slender_shaft`.

### J6 Report and PDF

- **Given** a reviewed part with at least 3 findings
- **When** Morgan presses Export PDF
- **Then** a PDF downloads with the part summary, setups, tools, ranked cost drivers and one page section per finding with its image. **Check:** `tests/e2e/test_pdf.py::test_export_pdf` (the PDF has a page per expected section and the right number of embedded images).

### J7 Bad input

- **Given** the app is running
- **When** Morgan uploads a text file renamed `.step`, or a STEP file with no solid
- **Then** a message names the problem ("No solid found in this file") and the app keeps working. A parse that runs past 60 s is stopped with "This file took too long to read". **Check:** `tests/service/test_read.py::test_bad_files`, `tests/service/test_read.py::test_timeout`.

## Decisions

- One part per upload; the user picks milling or turning and one of 4 materials (D-003).
- Python geometry service on OpenCascade 8.0.1 (pythonocc-core 8.0.1.2); TypeScript web page with three.js; the PDF is built in the browser (D-004).
- One conda `environment.yml` for every machine; no Docker; served at localhost:8000 (D-004).
- Face ids are assigned when a file is read and carried by the mesh and every finding. Thresholds live per material in `config/thresholds.toml`, each value labelled with its source or `estimate`. Millimetres inside, inches on screen to 0.001 in (D-005).
- Cost drivers are ranked by count × weight, with no time or dollars (D-003).

## Alternatives rejected

- **Rust or C++ around OpenCascade:** rejected because the engine is the same and development is slower. There is no Rust STEP reader, and the Rust wrapper is "a major work in progress". Fails when wrapper coverage runs out (D-004).
- **OpenCascade in the browser (WebAssembly):** rejected because it runs the older 7.6.2 and is limited by tab memory. Fails on large or messy files (D-004).
- **Docker:** rejected because Morgan expects IT to refuse it and the work copy will be rebuilt through GitLab (D-004).
- **Automatic process detection:** rejected for now because it misreads a milled part with a big bore or a shaft with flats. Fails on any part that mixes both processes.
- **Machine learning feature recognition:** rejected because it needs training data and gives no measurable evidence, and Morgan wants no AI (D-001).
- **Headless browser for PDF images:** rejected because the browser already renders the view. Fails only if a PDF must be made with no browser open, which isn't a goal.
- **glTF for the mesh:** rejected for now because plain JSON with per-face arrays keeps face ids obvious. Fails when parts are large enough that JSON is slow (assumption: over about 200,000 triangles). Revisit then.

## Risks

- OpenCascade misreads real STEP exports, or AP242 data is lost → S1 reads the public files first. Morgan's own export joins before S7 (open question 1).
- Feature recognition misfires on real parts (split hole faces, blended fillets) → the analytic faces only rule, "not analysed" for the rest, and test parts that include split cylinders.
- Thresholds are wrong → each one is an editable, labelled estimate, and findings show the threshold used.
- Windows setup differs from the Linux cloud build → J1 runs on Morgan's PC as S1's device check. Paths are handled with `pathlib`, with no shell scripts.
- Scope creep → the non-goals above; anything new goes to HANDOFF as a later phase.

## Design

### Layout

- `environment.yml`: conda-forge channel only. Pins `python=3.12`, `pythonocc-core=8.0.1.2`, `nodejs=22`, `fastapi`, `uvicorn`, `python-multipart`, `pytest`, `httpx`, `playwright` and `pypdf` (for tests), each pinned to an exact version when S1 resolves it, and records those versions.
- `service/dfma/`: the Python package.
  - `__main__.py`: the `start` and `serve` commands.
  - `app.py`: the FastAPI routes.
  - `read.py`: STEP to shape, units, face ids.
  - `mesh.py`
  - `features.py`
  - `rules/`: one module per rule.
  - `plan.py`: setups, tools and tool changes.
  - `turning.py`
  - `drivers.py`
  - `settings.py`: loads the TOML files.
  - `units.py`
- `config/thresholds.toml`, `config/tools.toml`, `config/drivers.toml`: editable settings (below).
- `web/`: Vite + TypeScript + three.js + jsPDF. `src/main.ts`, `src/viewer.ts`, `src/findings.ts`, `src/report.ts`, `src/api.ts`. `npm run check` runs `tsc --noEmit` and `vitest run`.
- `tests/parts/make_parts.py`: builds every test part with OpenCascade and writes the STEP files plus `expected.toml`. The STEP files are committed so tests don't depend on generation order.
- `tests/service/`, `tests/e2e/`: pytest, with e2e marked `e2e` and using Playwright for Python.
- `scripts/check.py`: runs every local check in order and stops at the first failure. Cross-platform, Python only.

### Flow

1. The browser posts `multipart/form-data` to `POST /api/analyze` with fields `file`, `process` (`mill` | `turn`) and `material` (`al6061` | `steel1018` | `ss304` | `acetal`). The 1045 and 316 grades share the 1018 and 304 entries until thresholds differ (assumption).
2. `read.py` loads the file with `STEPControl_Reader`. It requires at least one solid; if there are several, it takes the largest by volume and reports the rest as "ignored solids". It converts everything to mm and gives each face an integer id in `TopExp.MapShapes(shape, TopAbs_FACE)` order. Ids are stable within one analysis, which is all this version needs.
3. Reading runs in a child process with a 60 s limit (J7).
4. `mesh.py` triangulates with `BRepMesh_IncrementalMesh` (linear deflection 0.05 mm, angular 0.5 rad; assumption) and returns per-face arrays.
5. `features.py`, then `rules/*`, then `plan.py` or `turning.py`, then `drivers.py` build the response.

### Response schema (`POST /api/analyze`, 200)

```
{
  "part":     { "name": str, "units_in_file": "mm"|"inch"|..., "bbox_mm": [x,y,z],
                "face_count": int, "volume_mm3": float, "ignored_solids": int,
                "not_analysed_faces": [int] },
  "faces":    [ { "id": int, "kind": "plane"|"cylinder"|"cone"|"torus"|"other",
                  "positions": [float], "indices": [int] } ],
  "features": [ { "id": str, "kind": "hole"|"pocket"|"wall"|"corner"|"turned_profile",
                  "faces": [int], "axis": [x,y,z], "dims_mm": {name: float} } ],
  "findings": [ { "id": str, "rule": str, "severity": "high"|"medium"|"low",
                  "title": str, "measured": float, "limit": float, "unit": "in"|"ratio",
                  "faces": [int], "feature": str, "threshold_source": str, "suggestion": str } ],
  "setups":   [ { "direction": "+X"|"-X"|"+Y"|"-Y"|"+Z"|"-Z", "features": [str] } ],
  "operations": [ { "setup": int, "tool": str, "features": [str] } ],
  "tools":    [ { "id": str, "kind": "drill"|"end_mill"|"turning"|"boring"|"grooving",
                  "diameter_in": float } ],
  "tool_changes": int,
  "cost_drivers": [ { "driver": str, "count": int, "weight": float, "score": float } ],
  "assumptions": [str]
}
```

Errors return 422 with `{"error": str}`, using the J7 messages.

### Features (analytic faces only)

- **Hole:** one or more concave cylindrical faces sharing an axis and radius. Split half-cylinders merge into one hole. Through if both ends open onto outer faces; blind otherwise, depth taken to the bottom face. Depth is measured along the axis.
- **Pocket:** a planar floor face whose concave neighbours are walls perpendicular to it, open on the side the floor normal points. Depth is from the floor to the highest wall edge.
- **Inside corner:** the concave edge or fillet between two pocket walls. Radius is the fillet's cylinder radius, or 0 for a sharp edge.
- **Wall:** a pair of parallel planar faces with opposite normals whose projections overlap. Thickness is their distance (`BRepExtrema_DistShapeShape`).
- **Turned profile** (turn only): the axis shared by the most cylindrical and conical face area.

### Rules

Every rule reads its limits from `thresholds.toml` for the chosen material. All starting values below are labelled `estimate` in the file.

- `hole_depth`: depth ÷ diameter over 6.0 is medium; over 10.0 is high.
- `hole_size`: the diameter matches no size in `tools.toml` drills (fractional 1/64 to 1 in, number 1-80, letter A-Z) within 0.0005 in. Medium. Suggestion: the nearest standard size.
- `corner_radius`: radius under 0.0313 in (1/32), or sharp, is medium. Also flagged: depth ÷ (2 × radius) over 4.0, meaning the tool that fits is long and thin.
- `pocket_depth`: depth ÷ the diameter of the largest end mill that fits the pocket's smallest corner, over 3.0. Medium.
- `thin_wall`: thickness under 0.030 in (al6061), 0.020 in (steel1018, ss304) or 0.060 in (acetal). High.
- `access`: a feature whose tool axis isn't one of ±X ±Y ±Z of the part's bounding box. High: "needs 4- or 5-axis or a fixture". Its setups come from `plan.py`.
- `turn_slender`: length ÷ diameter over 4.0 is medium; over 8.0 is high.
- `turn_offaxis`: a hole or pocket not on the turning axis is medium: "needs a milling operation or live tooling".

### Plan (`plan.py`)

- Each hole or pocket has one open direction among ±X ±Y ±Z. Setups are the smallest set of directions covering all features: brute force over the 63 non-empty subsets, ties broken by the order +Z −Z +X −X +Y −Y.
- Tools: a hole takes the matching drill, or the largest end mill under its diameter if no drill matches. A pocket takes the largest end mill from `tools.toml` (1/8, 3/16, 1/4, 3/8, 1/2, 5/8, 3/4, 1 in) whose radius is no larger than its smallest corner radius and whose diameter fits its narrowest width.
- Operations are ordered by setup, then tool. Tool changes count each time the tool differs from the previous operation, including the first load of each setup. This rule is listed in `assumptions`.
- Turning: one operation each for the turning tool, a drill for an on-axis hole, a boring bar for bores over 0.500 in, and a grooving tool for grooves. Off-axis features are listed as milling operations.

### Cost drivers

Drivers are: setups beyond 1, distinct tools, tools under 1/8 in, deep holes, non-standard holes, thin walls, sharp inside corners and off-axis features. Each driver's score is its count × its weight from `drivers.toml` (starting weights are labelled `estimate`). The report shows them sorted by score.

### Web page

- One screen. An upload panel (file, process, material) sits on the left at 1280 px width and stacks above the viewer on narrower screens. The three.js viewer is in the middle and the findings list on the right.
- Faces with a finding are coloured by severity; the colour is paired with a label, since severity isn't shown by colour alone (APP-02). Clicking a finding highlights its faces in the accent colour and frames the camera on them.
- Export PDF captures the canvas with each finding highlighted in turn (renderer `preserveDrawingBuffer: true`) and builds the PDF with jsPDF.
- `python -m dfma start` builds `web/dist` with npm if it is missing, then serves it and the API on 127.0.0.1:8000. Uploaded files stay in memory and are never written to disk (APP-01).

## Slices

### S1 Read and view a part

- **Morgan tries:** builds the environment, runs `python -m dfma start`, uploads `box_through_hole.step` and one public file, and rotates them. This runs on Morgan's PC as the device check.
- **Checks that fail now:** J1 checks; `tests/service/test_read.py::test_units_inch_file`.
- **Files:**
  - `environment.yml`: pinned packages.
  - `service/dfma/{__main__,app,read,mesh,units,settings}.py`
  - `web/` scaffold with the viewer only.
  - `tests/parts/make_parts.py` with `box_through_hole`.
  - `scripts/check.py`
  - `.github/workflows/ci.yml`: add a micromamba job, with the action pinned to a full SHA under the `efficient-github-actions` skill.
  - `AGENTS.md`: local checks.
- **Waits on:** none. Public files only after their licence is checked (open question 2).

### S2 Holes: depth and size, with the findings list

- **Morgan tries:** uploads `deep_hole.step` and `odd_hole.step` (0.2600 in), sees two findings, and clicks one to highlight it.
- **Checks that fail now:** J2; J3 for the hole parts; `test_split_cylinder_hole`.
- **Files:**
  - `features.py` (holes)
  - `rules/hole_depth.py`, `rules/hole_size.py`
  - `config/thresholds.toml`, `config/tools.toml`
  - `web/src/findings.ts`
  - New test parts and `expected.toml` entries.
- **Waits on:** S1, plus Morgan's approval of the `ui-style` doc and the review-screen mock-up (`ui-mockups`), made at the start of this slice.

### S3 Pockets: inside corners and depth

- **Morgan tries:** uploads `pocket_sharp.step` and `pocket_deep.step` and sees the corner and depth findings.
- **Checks that fail now:** J3 for the pocket parts.
- **Files:**
  - `features.py` (pockets, corners)
  - `rules/corner_radius.py`, `rules/pocket_depth.py`
  - Test parts.
- **Waits on:** S2.

### S4 Thin walls

- **Morgan tries:** uploads `thin_rib.step` in 6061 and then in acetal, and sees the limit change with the material.
- **Checks that fail now:** J3 for the wall parts; `test_material_changes_limit`.
- **Files:**
  - `features.py` (walls)
  - `rules/thin_wall.py`
  - Test parts.
- **Waits on:** S3.

### S5 Setups, tools and tool changes

- **Morgan tries:** uploads `two_sided_block.step` and `angled_hole.step` and reads the setups, the tools and the access finding.
- **Checks that fail now:** J4; J3 for `angled_hole`.
- **Files:**
  - `plan.py`
  - `rules/access.py`
  - A plan panel in the web page.
  - Test parts.
- **Waits on:** S4.

### S6 Turning

- **Morgan tries:** uploads `slender_shaft.step` for turning, and the same part for milling to compare.
- **Checks that fail now:** J5.
- **Files:**
  - `turning.py`
  - `rules/turn_slender.py`, `rules/turn_offaxis.py`
  - A process field in the upload panel.
  - Test parts.
- **Waits on:** S5.

### S7 Cost drivers, report and PDF

- **Morgan tries:** uploads one of their own parts, reads the full review and exports the PDF.
- **Checks that fail now:** J6, J7.
- **Files:**
  - `drivers.py`, `config/drivers.toml`
  - `web/src/report.ts` (jsPDF)
  - Error messages.
- **Waits on:** S6.

## Verification

- Every push: `python scripts/check.py`. It runs `node .claude/master/sync.mjs --check`, `pytest tests/service`, `npm --prefix web run check`, `npm --prefix web run build` and `pytest -m e2e`.
- End to end: J1-J7 in `pytest -m e2e`. The device check is Morgan running S1 and S7 on their own PC.

## Open questions

1. Which CAD exports Morgan's real STEP files, and which version? Morgan's part joins the test set before S7.
2. Public test models (NIST MBE PMI): licence not checked. Check it before S1 commits any file (SAFE-05). If it fails, S1 uses generated parts only.
3. Starting threshold values are estimates. Morgan or a shop manager may want to change them after S2-S4.
