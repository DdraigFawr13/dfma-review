# Decisions

Settled rules for this project. Not a changelog: an entry stays while the rule is in force. Change a rule here in the same change that changes the behaviour. Mark ideas Proposed until the owner approves them; mark retired entries SUPERSEDED with a pointer, never delete them.

## D-001 Concept chosen

- **Status:** Accepted (2026-11-06)
- **Decision:** Build the staged tool in [docs/CONCEPT.md](CONCEPT.md): (1) STEP report with DFM/DFA findings, setups, tool changes and time; (2) single-user design review; (3) DXF drawing check against ASME Y14.5-2018; (4) DXF drawing generation. Code measures, templates write; no runtime AI unless Morgan approves. Portable hosting.
- **Why:** Morgan's pick in brainstorm round 1 ([page](https://claude.ai/artifact/QRrJhDYjzW3NapQUBGR6rH)), after 4 concepts and a fresh critique. Reasons for each dropped concept are in the brief.

## D-002 Full master setup with the web-app layer

- **Status:** Accepted (2026-11-06)
- **Decision:** Use AI-Master-Instructions `v4.11.0`, full profile, layers `core` and `project-types/web-app`. Add a stack layer once design picks the stack.
- **Why:** a multi-stage plan with a UI and CI needs the full setup; `lite` is for scripts and one-offs (master D-056).

## D-003 First usable version scope

- **Status:** Accepted (2026-11-06)
- **Decision:** One STEP part at a time, with the process (milling or turning) picked by the user on upload. Rules: hole depth vs diameter, non-standard hole sizes, inside corner radius, deep pockets, thin walls, access and setups, turning checks. Output: each finding with measured value and highlighted face, tool list and tool changes from a generic inch tool set, setups, ranked cost drivers (no time or $), web page with 3D view and PDF export. Analytic faces (planes, cylinders, cones) first. Assemblies and DFA, history, revision compare, and time with $ follow, in that order.
- **Why:** Morgan's design answers ([round 1](https://claude.ai/artifact/4Xa6iLguwU2pnXQXCAYydk), [round 2](https://claude.ai/artifact/LEGMPWU3Avt4E9pjnSvbhG), [approval](https://claude.ai/artifact/WDr91uJChvS9RkBziPWDHo)). $ needs time; setups need the access rule; parts before assemblies proves each rule first. The reviewer judged the full stage 1 to be about five products.

## D-004 Stack: Python + OpenCascade service, browser viewer, no Docker

- **Status:** Accepted (2026-11-06)
- **Decision:** Geometry in Python on OpenCascade 8.0.1 (pythonocc-core 8.0.1.2, LGPL). Web page in TypeScript with a three.js viewer; the PDF is built in the browser. One conda environment file sets up every machine; no Docker. Runs on Morgan's PC at localhost; nothing tied to GitHub or one host, so GitLab can rebuild it.
- **Why:** OpenCascade is the only free kernel that reads STEP solids (AP203, AP214, part of AP242). No Rust kernel imports STEP (Fornjot shut down; truck-stepio 0.3.0 has no import); the browser build is the older 7.6.2. Morgan expects IT to refuse Docker and the work copy to be rebuilt through GitLab. Versions checked on conda-forge and crates.io, 2026-11-06.

## D-005 Rules, thresholds and units

- **Status:** Accepted (2026-11-06)
- **Decision:** Every face gets a stable id when the file is read; the mesh and every finding carry it. Thresholds live per material (6061; 1018/1045; 304/316; Delrin/nylon) in one editable settings file, each value labelled with its source or "estimate"; our own values, never copied handbook tables or ASME Y14.5 text. Millimetres inside, inches on screen to 0.001 in, fractions where a standard size matches. Each rule ships only when it passes its test parts (2-3 per rule with known answers, plus public models).
- **Why:** review findings agreed by Morgan (round 2): highlighting needs face ids end to end; thresholds depend on material and need a home; copyright (SAFE-05); STEP carries its own unit.

## D-006 Gates before the company move

- **Status:** Accepted (2026-11-06)
- **Decision:** Before moving to the company server: ask IT where CAD files may be stored, and whether GitLab CI runners can download packages (conda-forge, PyPI, npm). Other engineers read reports as PDFs until then; no accounts.
- **Why:** company parts may be confidential; the setup depends on package access (round 2 finding, agreed).

## D-007 First-version spec approved

- **Status:** Accepted (2026-11-06)
- **Decision:** Build [docs/specs/first-version.md](specs/first-version.md) slice by slice (S1-S7). "Machine estimates" in this version means machine type, setups, tools and tool loads; time and $ come later. Approved packages: FastAPI, uvicorn, python-multipart, Vite, three.js, jsPDF, and test-only pytest, pytest-playwright, Playwright, pypdf, vitest (S1 records each licence). Metric drills are used for parts modelled in mm; uploads go to a temporary file deleted after the analysis; uploads over 50 MB are refused; the PDF is a one-click jsPDF download.
- **Why:** Morgan approved with the recommendations ([spec approval](https://claude.ai/artifact/CAqfoCYn9pSSxkBHn4peGb)) after 6 fresh-context checks ($1.49 measured) whose findings were all fixed. New runtime packages need approval (SAFE-01).

## D-008 S1 build: extra packages and micromamba in the cloud

- **Status:** Accepted (2026-11-06)
- **Decision:** Add three build and test packages to D-007's approved list: `httpx` (test-only, BSD-3-Clause; FastAPI's test client), `typescript` (Apache-2.0; the compiler D-004's TypeScript needs) and `@types/three` (MIT; type definitions only). Cloud build sessions install micromamba from conda-forge to build `environment.yml`.
- **Why:** Morgan approved both when S1 started (2026-11-06): the cloud machine has no conda, and the three packages are build tools, not code the app runs.

## D-009 How each slice is shown to Morgan

- **Status:** Accepted (2026-11-06)
- **Decision:** Every phase and slice is presented on Morgan's phone the way S1 was: a published status page (what works, check counts, CI run link, screenshots, Morgan's next step) and a view-only demo page built from the real web code with the slice's test parts analysed in advance, refreshed after each slice. Chat messages stay short and link to those pages; CI runs are linked from the PR's Checks tab.
- **Why:** Morgan works from a phone and can't open the app running in a cloud session ("that is how I want these phases and slices presented from now on", 2026-11-06).

## D-010 S2: look, screen sizes and holes above the drill range

- **Status:** Accepted (2026-11-06) for the answers below; `docs/UI_STYLE.md` and the review-screen mock-up still need Morgan's approval.
- **Decision:**
  - The look is "Drawing office" (pale blue-grey paper, navy ink, IBM Plex Sans and Mono); its values are in `docs/UI_STYLE.md`. Inspection sheet was also kept; Drawing office leads.
  - Target: PC or laptop browser, first width 1280 px, minimum text 14 px, minimum click target 32 px.
  - `hole_size` skips holes above the drill range (over 1 in for inch files, over 25.0 mm for mm files); they are milled with an end mill. Holes below the range are still flagged.
- **Why:** Morgan's [S2 form](https://claude.ai/artifact/7E7WfzWghKK6UF2kvhqUWZ) answers and "Go with drawing office" (2026-11-06). A 1.500 in bore flagged "nearest drill 1 in" would not be useful.

## D-011 NIST MBE PMI test cases are the gold standard

- **Status:** Accepted (2026-11-06). How the files are stored in the repo is still open (HANDOFF).
- **Decision:** The NIST MBE PMI test cases (FTC 06-11, STC 06-10, CTC 01-05; [download page](https://www.nist.gov/ctl/smart-connected-systems-division/smart-connected-manufacturing-systems-group/mbe-pmi-0)) are the project's ultimate test standard: the goal is that the tool eventually maps every one of them completely. Simple generated blocks (`tests/parts/make_parts.py`) stay the step-by-step tests on the way there, one set per slice.
- **Licence:** the NIST page says "The test cases, CAD models, and STEP files can be used without any restrictions." This closes spec open question 2 (SAFE-05).
- **Baseline (S1 code, measured 2026-11-06):** all 17 AP242 files read, 0.1 to 1.5 s each; faces not analysed (torus or other) range from 0 (ctc_01, ctc_03, ftc_09, stc_09) to 62 (ftc_07, stc_07); ftc_08's tessellated file is 272 of 272 faces not analysed; ctc_05 reads as units `other`.
- **Why:** Morgan, 2026-11-06: "these should be used as our ultimate testing standard … our gold standard of excellence is that it is able to completely map these blocks eventually. Also you will need to make simple blocks for other testing purposes as we work our way up to these".

## D-012 Review-screen layout picks

- **Status:** Accepted (2026-11-06) as the brief for the review-screen mock-up; the mock-up itself still needs Morgan's approval.
- **Decision:** Layout 4 leads: controls and part size in a bar on top, a verdict line, the 3D view on the left, findings on the right in severity groups plus a "Passed" list. Style: Drawing office, with the rest of the part faded while a finding is selected. Kept for later: layouts 1 (three columns) and 2 (controls on top); after: 3 (CAD tree); cut: 5 (pins), 6 (table below), 7 (one at a time). Styles kept: Drawing office, Inspection sheet; after: Dark CAD workspace, Light quote portal; cut: Highlight focus (only its ghosting is used). Extras picked for later ("All of these can come later"): a "Rules passed" list, a section view, a draggable split between view and list.
- **Why:** Morgan's answers on the [options board](https://claude.ai/artifact/EUxCGkamBk28VYfGe2CWD3) (collection `layout1`, 2026-11-06), built from research on 9 tools (HANDOFF 2026-11-06).

## D-013 mm files accept inch drills too

- **Status:** Accepted (2026-11-06). Changes D-007's "metric drills for mm files".
- **Decision:** `hole_size` checks mm files against the metric drills and the 1/64 in drills. Inch and other files keep the 1/64 in drills only, so the 0.1 mm grid still can't hide an odd inch size there. With both lists, the top of the drill range for mm files is 1 in (25.4 mm), not 25.0 mm (D-010's skip rule uses this top).
- **Why:** new evidence from the NIST gold standard (D-011): several NIST parts are designed in inches but written in mm, and metric-only checking flagged every standard inch hole (ftc_09: 27 hole-size findings from its mm file against 4 from its inch twin stc_09). Morgan: "For hole size your recommendation is approved" (2026-11-06).
