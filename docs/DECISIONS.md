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

## D-014 Colour legend with a switch per feature kind

- **Status:** Accepted (2026-11-06).
- **Decision:** Under the 3D view, a colour legend names every colour (High, Medium, Selected) and holds one checkbox per feature kind for features checked with no finding: S2 has "Holes checked, no finding", on by default, tinting those holes `--low` green with no label. Holes with a finding keep their severity colour; the selected finding stays accent. Each later slice adds its feature kind to the legend (pockets, corners, walls), each with its own swatch.
- **Why:** Morgan saw untinted holes on NIST FTC 10 and read them as missed; 31 of its 42 found holes were clean and drawn plain. Morgan: "can we have those as a toggle then to turn certain ok features on to make sure I can like debug and check the work?" and "let's go with a for now but I do still want the highlighting to be a toggle. I will need that toggle for each feature type or like a color legend to show what is what. Whatever you recommend for that goal is fine for me" (2026-11-06).

## D-015 S3: pocket and corner legend, selection and defaults

- **Status:** Accepted (2026-11-06).
- **Decision:**
  - The colour legend gains "Pockets checked, no finding" (`--ok-pocket` #8559b8) and "Corners checked, no finding" (`--ok-corner` #1d7f86), each with its own checkbox, all three kinds on by default; it always lists all three kinds. A corner fillet is also a pocket wall and shows the corner colour.
  - The verdict line names the kinds a part has ("1 pocket and 4 corners checked"; a holes-only part keeps "2 holes checked").
  - A selected finding is framed at no less than 40% of the part's size. A sharp inside corner has no face of its own, so it is drawn as a bar along its edge (corner features carry `edge_mm`), in its severity colour and the accent when selected; its two walls are not painted for that finding.
  - Finding labels never cover each other: a label that would overlap one already placed moves to the nearest free spot (Morgan: "the flags for the failing portions are covering each other").
  - The S3 defaults in the spec's S3 "Settled at build" list stand (test parts, recognition, `pick_end_mill`, titles and suggestions). Inch end mills serve every file. Engraved text and logos (on most NIST parts) read as pockets with sharp corners and stay flagged as measured; this is listed in `assumptions`.
- **Why:** Morgan approved the [mock-up](https://claude.ai/artifact/7pzmdnGnguo8CThdQ87gvD) v3 (real-viewer screenshots, after "the feature highlights on your model look terrible and unrealistic" on the v1 sketch and "What does it look like when selected?"): "Ok approved you can do the pr and merge go with your recommendations" (2026-11-06).

## D-016 S4: thin material at holes, walls box off by default

- **Status:** Accepted (2026-11-07).
- **Decision:**
  - S4 also measures thin material at holes, not only between two flat faces: the material under a drill point (from the tip to the nearest face across material) and around a hole's side (to the nearest face or other hole across material, measured square to the hole axis). Each is a `wall` feature and `thin_wall` rules on it with the same limits. Material at a hole is measured up to 0.250 in, four times the largest limit (assumption): thicker material there is no wall feature, which keeps the search under the 10 s file limit (the slowest NIST file took 8.15 s for this step without the cap).
  - The legend row "Walls checked, no finding" (`--ok-wall` #6b5d4f) starts unticked, the only kind box that does: with it ticked almost the whole part is tinted, because nearly every flat face belongs to a wall. The verdict line still counts walls.
- **Why:** Morgan asked whether blind holes, drill points and opposed holes are checked; measured on test blocks, flat-bottom holes were and drill points and holes near a face were not. Morgan: "Go with recommended" (2026-11-07) to the options "add both to S4 now" and, on the [wall legend mock-up](https://claude.ai/artifact/JaEjos5QQvY7cbRVHwWpH2), "unticked when the page opens".

## D-017 Findings show as pins on the model; the selected pin in its severity colour

- **Status:** Accepted (2026-11-07).
- **Decision:**
  - Each finding's label is a pin ("F5") on a visible spot of its faces, white and ringed in its severity colour. A pin that would cover one already placed folds into it ("F4 +2"); a pin whose spot is behind the part is hidden. This replaces D-015's labels that moved to the nearest free spot.
  - The selected finding's pin is solid in its severity colour (red for HIGH, orange for MEDIUM), larger, with its severity word ("F5 HIGH"), raised on a stem to a dot on its spot. Its faces still turn the Selected colour (`--accent`); nothing else dims.
  - Unselected pins show severity by their ring colour only; the findings list, which every pin's id points to, carries the severity word (APP-02 is met by the list and the selected pin).
- **Why:** Morgan said the tags were "not clearly indicating what they are attached to" and looked "largely floating randomly" with many findings. Research: DFM tools list findings and highlight the selected one; web 3D viewers use numbered pins tied to a list. Morgan picked pins on the [workshop page](https://claude.ai/artifact/P3kT7ftt811y7qbQWb2gNk) ("b is good"), wanted only the selected one highlighted ("I liked the way they were"), then the warning colours: "go with these new solid colors … you can push and merge s4" (2026-11-07).

## D-018 Recognition gold standard and target

- **Status:** Accepted (2026-11-07). How the test files are kept for CI is still open (HANDOFF).
- **Decision:**
  - The grading sets are the gold standard for hole and pocket recognition: the first 500 MFCAD++ test parts (lexical order), Quiddity's 40-part MFCAD++ subset and Analysis Situs's 55 hole and cavity cases, scored by `tests/grading/grade.py`. D-011 (NIST) stays the standard for mapping whole parts.
  - Target, in every category on the 500 parts: at least 10% fewer missed surfaces than the best other tool (Quiddity 0.3.12, Analysis Situs), and 100% of our hole and pocket calls right (0 wrong surfaces, wrong calls on grooves, slots and steps included). From the 2026-11-07 baseline: holes miss at most 14 of 602 (Quiddity misses 16), pockets at most 93 of 3,745 (Analysis Situs misses 104).
  - Each round of recognition changes reruns our engine and shows that round's comparison with the other tools' fixed results (the [head-to-head page](https://claude.ai/artifact/YAAEriC8gktJkGi5VtNvhq)).
  - Builder default: each round is also scored on MFCAD++ test parts 501-1,000, which are not used to tune the rules, so a gain that only fits the first 500 shows up.
  - Added 2026-11-07: our own labelled set `tests/grading/sets/bullnose_draft` (29 parts made by its `make.py`: bull-nose and ball floors, drafted walls, and slots, steps and a passage that are not pockets), because MFCAD++ has no filleted floors or drafted walls. It is part of the standard: every comparison scores all three tools on it through `grade.py`, and `tests/service/test_bullnose_draft.py` holds our engine to it. The outside tools are rebuilt by `tests/grading/others/setup.sh`.
  - Added 2026-11-07: `tests/grading/sets/tapered_holes` (12 parts: tapered recesses and holes from 0.57 to 10 deg, a taper-pin hole, a pipe-thread taper, and countersinks, an entry chamfer, a drill point and a drafted boss as guards), on the same terms. Builder default with it: a cone of half-angle up to 15 deg is a tapered hole's wall; the hole reports its wide-end diameter, `taper_deg` and `small_diameter`, and `hole_size` does not judge it, since a taper is reamed, not drilled to a size. Countersink and chamfer cones stay out of the hole, as MFCAD++ labels them.
  - Added 2026-11-07 (HANDOFF 3a, the stress-test gaps): `tests/grading/sets/hole_joins` (19 parts: counterbores with a chamfer or fillet at the bore or in the corner, crossing holes, a snap-ring groove, a clevis pin hole, radial holes through a shaft, and guards: counterbores at both ends, blind holes from both sides, bores in two walls far apart, counterbores facing across a slot), on the same terms. Its INSTANCES.json lists each hole's faces, and `grade.py` scores holes found whole (`instance_score`; a stepped hole's segments share a `chain`). Builder defaults with it: a counterbore's floor joins its bore through up to 4 faces round the axis (floor ring, chamfer or fillet at the bore, corner fillet); the chamfer or fillet at the narrower bore stays out of the hole, as chamfers do. Pieces of one bore join across a gap when lines inside the bore at 0.9 of its radius cross no face, and the gap is at most 3 diameters (assumption: bores farther apart, such as two walls of a housing, are each made from their own side); a join that leaves a bore wider than both its ends (counterbores facing across a cavity, NIST ctc_02) is undone. A hole whose two ends open onto one face (a radial hole through a shaft) is through.
  - Added 2026-11-07 (Morgan: "go with your recommendation"): `tests/grading/sets/pocket_edges` (11 parts: chamfers and rounds on a pocket's rim, round bosses near a wall, a floor in 5 flat pieces), on the same terms; its MANIFEST gives each pocket's depth and narrowest gap, which `test_pocket_edges.py` holds ours to. Builder defaults with it: a pocket's depth runs to the top of a chamfer or round on its rim (a face wholly above the walls, at most half the depth tall); a round boss's gap to any wall or other boss counts in the narrowest gap; flat faces joined edge to edge in one plane are one floor.
  - Added 2026-11-07 (Morgan: "go with your recommendation", set 2): `tests/grading/sets/undercuts` (10 parts: T-slots through, blind square-ended and round-ended, two side by side; dovetails through and blind; a pocket under a lip, a pocket with a groove round its floor, a T-slot closed at both ends; a plain pocket), on the same terms. Slot faces are labelled 6, 17 or 18; any call on them must be 0 (`test_undercuts.py` checks "claimed on excluded"). Builder defaults with it: a floor is a pocket floor only when a ray from some point on it, along its normal, leaves the part (a cutter can reach it); a pocket with an undercut is one pocket: a ceiling facing its floor that a wall runs into, and the walls rising from the ceiling's other side, are its faces when they lie over the floor (within its outline box), and its depth runs to their top. A void sealed inside the part (an inner shell; MFCAD++ labels 3 of the first 500 parts' voids pockets, 22 faces) keeps the old rules, so the scoreboard does not move on a label no cutter could make. No undercut or sealed-void finding yet (each is a new rule; HANDOFF open questions).
- **Why:** Morgan, 2026-11-07: "I want you to be at least 10% better in all categories with 100% accuracy in your guesses. Every round of changes you make please show me that rounds comparison with the others. Obviously you just need to rerun our engine. Also these testings are going to now be our new gold standard"; target chosen as "10% fewer misses" (the literal +10% is over 100 for holes and pockets). Morgan, 2026-11-07, on the added set: "Create sample parts as needed and add them to the library and testing standard for all comparisons to see how the other models handle them and learn from them then proceed to fix them"; on the tapered set: "go ahead with the tapered holes".

## D-019 Blind slots shaped like a pocket beside a step count as pockets

- **Status:** Accepted (2026-11-07). Amends D-018's "0 wrong calls on slots".
- **Decision:** A surface MFCAD++ labels as a blind slot (classes 17-19) counts as a right pocket call when the slot's end is closed by one wall shorter than the others, past which lies the floor of a blind step (classes 20-22). That shape is the same as a real pocket cut beside a step, so no shape rule can call it a slot. The scoreboard shows these surfaces on their own line ("labelled slot, same shape as a pocket"), outside the wrong-call count. Other slot surfaces called pockets still count as wrong.
- **Why:** the adversarial review (2026-11-07, [page](https://claude.ai/artifact/4oufpheC26VYYwT2zBiiHs)) found 20 of the 40 slot surfaces on the first 500 parts have this shape (10526, 10649, 11652, 12317), and the rule that removed them also removed 5 real pockets on EDMR daratech and 1797609in (LESSONS "recognition"). Morgan, 2026-11-07, choosing "Pockets (Recommended)": call them pockets and show them on the scoreboard as "labelled slot, same shape as a pocket", outside the 0-wrong target.

## D-020 Units without mm, and walls with draft

- **Status:** Accepted (2026-11-07). Changes D-013 for cm and m files, and the spec's wall definition (exactly parallel faces).
- **Decision:**
  - Files in centimetres or metres are metric: `units_in_file` is `cm` or `m`, and `hole_size` checks them against the metric and the 1/64 in drills, as mm files (D-013).
  - A file that declares no length unit is read as millimetres; `units_in_file` is `none`, the report's assumptions say so (`MSG_NO_UNIT`), and it gets the inch drills, as `other` files.
  - A wall's two faces may be up to 15 deg from parallel (draft); its thickness is taken at the thinnest place. 15 deg is the same limit as pocket draft and tapered holes (D-018).
- **Why:** the stress test ([page](https://claude.ai/artifact/4oufpheC26VYYwT2zBiiHs)): a 6.6 mm hole in a cm or m file was "not a standard drill"; a no-unit file drawn in inches would read 25.4 times too small with no note; a 0.4 mm wall with 0.01 deg of draft gave no finding. Morgan, 2026-11-07, choosing the recommended option on each: "Up to 15°", "Treat as metric", "Read as mm, say so".

## D-021 Undercut pockets get a finding; sealed voids do not

- **Status:** Accepted (2026-11-08).
- **Decision:**
  - A pocket with an undercut (set 2: a ceiling facing its floor, D-018) gets a finding that it needs an undercut cutter (a T-slot or lollipop cutter), with the overhang measured on the model (D-001).
  - Built 2026-11-08 as rule `undercut` (mill only, medium, measured in inches, limit 0, `config/thresholds.toml` source "D-021"). Builder defaults: the overhang is the distance from each edge where a ceiling meets a wall below it to the nearest edge where it meets a wall above it, the largest; a ceiling must lie wholly above the floor; the finding is given only when every floor edge has a wall (through a side another feature opens, a cutter may reach in from the side). Scan of 1,213 files (NIST, EDMR, our sets, MFCAD++ 1-1,000): it fires on the 3 undercut set parts only.
  - A void sealed inside the part (an inner shell) gets no finding; it keeps the pocket rules it had before set 2 (D-018).
- **Why:** Morgan, 2026-11-08: "I approve. Go with your recommendations" ([head-to-head page](https://claude.ai/artifact/YAAEriC8gktJkGi5VtNvhq)): the undercut changes the tooling the shop needs; sealed voids come from how MFCAD++ made its parts, not from real parts.

## D-022 S5 and set 3: countersinks, sloped exits, holes in pocket floors

- **Status:** Accepted (2026-11-08; Morgan chose the recommended option on each of 3 questions).
- **Decision:**
  - Countersinks: the cone stays out of the hole's `faces` for scoring (D-018 unchanged). The hole records it (`dims_mm.countersink_diameter`, `countersink_deg`; its cone faces in `countersink_faces`), and the plan adds one countersink tool load per angle per setup (tool id `cs-<angle>`, for example `cs-90`).
  - A hole that leaves through a sloped face: its `depth` is the full-round depth (where the drill still cuts all the way round), as a drill point is left out; the longest side is kept as `dims_mm.max_depth` and shown in the finding's detail. Measured on a d8 hole leaving a 20 deg slope: 23.544 mm full round, 26.456 mm longest side.
  - A hole end on a pocket floor keeps the hole's own axis (spec Features "Hole": the line giving it the pocket's open direction is dropped), so an angled hole drilled into a pocket floor gets the `access` finding.
- **Why:** Morgan, 2026-11-08, answering the S5 questions: "Record + tool", "Full round", "Hole's own axis" (each the recommended option). An angled hole still needs an angled spindle or fixture, whatever it opens onto.

## D-023 Machine plan panel, Passed list and selectable setups

- **Status:** Accepted (2026-11-08). The Machine plan panel first; the two additions after their [mock-up](https://claude.ai/artifact/ACtTrQnaA8qUkRzZkUgMRX) (Morgan: "Approved, merge when ready").
- **Decision:**
  - Accepted: the Machine plan panel as on the [mock-up](https://claude.ai/artifact/5Cmq85bG5CPpi7oZ3oZHGW) (`mockups/plan-panel.html`).
  - Accepted: a "Passed" list. For each feature with no finding, the checks it passed, why, and the math to check it, with the same numbers and limits the rules use. It is collapsed by default ("collapsed and off by default... at least for demos").
  - Accepted: each setup in the Machine plan can be selected. Selecting one shows its features on the model and a brief why (which way each feature opens, and why this setup cuts it).
- **Why:** Morgan, 2026-11-08: "I want the ability to turn on ok features and see the brief summary of why it is ok like what checks it passed and why with the math to check it. It should be collapsed and off by default" and "I approve of the machine plan but I want each one selectable to show the features so it can be checked with a brief why as well like above. I want to see what that would look like first though".

## D-024 Screenshots fit the screen, tap to zoom

- **Status:** Accepted (2026-11-08).
- **Decision:** On every page with screenshots for Morgan (status pages, mock-ups, research pages), each screenshot fits the screen width, so the whole desktop view is visible at once. Tapping one opens it full screen, where pinch, double-tap, drag and the − / Fit / + / Close buttons zoom and pan. Screenshots for these pages are taken at 2× pixel density, so they stay sharp when zoomed. `scripts/add_zoom.py <page.html>` adds the viewer (`scripts/zoom_viewer.html`; no library, nothing sent anywhere). This replaces the `ui-mockups` skill's fixed-width frames in a sideways-scrolling strip for this project.
- **Why:** Morgan, 2026-11-08: "I can't see those very well unfortunately can we start presenting these screenshots in a different way where I can see the desktop view fit on my screen and zoom in on areas that I want to see more of?"

## D-025 Turning: slender limit by material

- **Status:** Accepted (2026-11-08).
- **Decision:** `turn_slender` warns (medium) at over 3.0× length to diameter for `steel1018` and `ss304`, and stays at over 4.0× for `al6061` and `plastic`. High stays at over 8.0× for all four. Changes the spec's single 4.0× (Rules "turn_slender").
- **Why:** the S6 [turning research](https://claude.ai/artifact/W671Yt2gJgDqrfgf6iC3RH): a part held only in a chuck is safe to 3× in steel and harder, 5× only in aluminium and soft materials (Lathe Mastery wikibook); CADEM: chuck only under 3×. Morgan picked the recommended option on 2026-11-08 (proposal 1 of 5).

## D-026 Turning: support named, bore reach, inside grooves, smallest diameter

- **Status:** Accepted (2026-11-08).
- **Decision:** the S6 turning research proposals 2 to 5, as recommended:
  - `turn_slender`'s suggestion names the support its ratio needs: chuck alone to 3×, tailstock to 6×, tailstock and steady rest to 12×, then one more holding point per 3×; Swiss-type from 6× (CADEM thumb rules; Wevolver: Swiss practically required over 10×).
  - New rule `bore_depth` (turn only, bores only): depth ÷ diameter over 4.0 medium (needs a carbide boring bar), over 6.0 high (needs a damped bar); per material in `thresholds.toml`. `hole_depth` judges holes only, so a bore is still judged once.
  - An inside groove gets a note in the lathe plan: not every shop cuts inside grooves (Protolabs does not). No finding.
  - `turn_slender` divides by the profile's smallest outside diameter (`dims_mm.min_diameter`; grooves excluded), not the largest. Changes the spec's Features "Turned profile" and Rules "turn_slender".
- **Why:** the [turning research](https://claude.ai/artifact/W671Yt2gJgDqrfgf6iC3RH): Sandvik's boring-bar overhang table (steel 4×, carbide 6×, damped 10× and 14×); Protolabs: "ID grooves are not supported"; CAD Exchanger's turned-part check divides by the minimum diameter. Morgan, 2026-11-08: "I approve of all your findings and recommendations from the turning research".

## D-027 A part-wide pin doesn't hide a small finding

- **Status:** Accepted (2026-11-08). Changes D-017's "overlapping pins fold into the first placed".
- **Decision:** pins are placed selected first, then the findings whose visible spots spread least on screen (a hole before the whole outside of a shaft), then in finding order. A pin tries its own visible spots, nearest its middle first, and takes the first that covers no placed pin; it folds ("+n") only when every spot is covered. Also added: the test part `flange_bolt_hole` (a bolt hole parallel to the axis, 0.750 in off it).
- **Why:** Morgan, 2026-11-08, on the S6 example: "I don't see that off center hole". The length finding's pin sat at the shaft's middle, on top of the cross hole, and folded the hole's pin into it. Morgan picked both fixes (move the pin, add an off-centre hole part).

## D-028 Milling warns on a turned part; stock and operation order in the plan

- **Status:** Accepted (2026-11-08).
- **Decision:**
  - New rule `looks_turned` (mill only): when round faces on one axis are 40% or more of the part's surface, high: "This part looks turned; review it for Turning". The mirror of `turn_axis`; the mill plan is unchanged. Changes the spec's Non-goal line "the tool warns only when turning is picked and no turning axis is found".
  - The Machine plan shows the stock: a round bar (largest outside diameter × length) for Turning, a block (the part's three sizes) for Milling. Both are the part's own size; no machining allowance is added.
  - Operations are numbered in the order they run, across setups, and a selected setup's reasons are listed in that order.
  - The demo opens a turning test part on Turning.
- **Why:** Morgan, 2026-11-08, on the S6 demo: a turning part opened on Milling; "when I selected a turning part as milling it only had one setup and operation when the part had like grooves"; "the machine plan should say the stock size and it should list the operation details in order of operations listed". Morgan picked "Warn: looks turned" (recommended).

## D-029 Roughing and finishing tools; pins stand above their spot

- **Status:** Accepted (2026-11-08).
- **Decision:**
  - A pocket gets a roughing end mill before its finishing one: the largest end mill at most 75% of the pocket's narrowest width (assumption, `config/tools.toml` `[roughing]`), only when larger than the finishing tool (the one that fits its corners, as before). A pocket with no two walls facing each other keeps one tool.
  - A turned outside gets `turn-rough` then `turn-finish`; a bore `bore-rough` then `bore-finish`. Grooves and drills stay one tool each.
  - Each tool is its own tool load (spec Plan "Tool changes" unchanged), so plans gain loads: two_sided_block 3 → 5.
  - Every finding pin stands 22 px above its spot on a stem to a dot, in its severity colour, so the feature under it stays visible (the selected pin stays at 26 px). Changes D-017, where only the selected pin had a stem.
- **Why:** Morgan, 2026-11-08: "the tags are covering the features and making them hard to see"; "standard practice would be to mill out as much as possible with a larger tool and then do finishing passes with a second tool … look at logic across milling and turning for finishing passes". The 75% share is an assumption, not sourced; a shop can change it.

## D-030 Cost drivers after turning: which findings feed which driver

- **Status:** Accepted (2026-11-08; Morgan: "Ok I approve of all of this as recommended", and on the merge review: "go ahead and make whatever recommended changes"). Built in S7.
- **Decision:**
  - Added to the spec's driver list: `bore_depth` findings count as `deep_holes`.
  - `turn_offaxis` feeds `off_axis` and `access` feeds `multi_axis`, as the spec says.
  - Three more drivers: `deep_pockets` (pocket_depth), `undercuts` (undercut) and `slender_parts` (turn_slender). `looks_turned` and `turn_axis` feed none: they warn about the process picked, not a cost of the part.
  - `small_tools` counts tools marked undersized or under 1/8 in across (`under_in` in drivers.toml). The spec disagreed with itself: its driver list says "undersized or sub-1/8 in tools", its Counts line "`undersized` tools". The first build followed the Counts line; the merge review (2026-11-08) took the driver list, because a small tool costs even when it fits: `pocket_small_radius`'s 1/32 in end mill is not undersized but now counts. The Counts line is updated to match.
  - Drivers live in `config/drivers.toml`, so adding one is a config edit.
- **Why:** the spec's nine drivers were written before S3 to S6; a slender shaft needing a steady rest, or a deep pocket needing a long end mill, is a cost with no driver. Weights stay 1.0 and are estimates (REP-01).

## D-031 Inventor parts: our own reader

- **Status:** Accepted (2026-11-08; Morgan, on the [research page](https://claude.ai/artifact/94JciyGLeYsorjas1XCyUw): "Ok go with our own reader. See if there is any way you can get that inventory data for like threads and holes and have it mapped to the part if possible maybe by hole size or position"). The rest of the phase plan is still open (round 1).
- **Decision:** read `.ipt` files with code of our own on Linux, no Autodesk software, cloud or paid SDK (research routes B to E not taken). The feature data (threads first) is mapped onto the part by position: each thread attribute sits on a B-rep face whose axis we match to a hole we find.
- **Why:** no free Linux tool reads Inventor features fully; the spike (`docs/research/inventor-spike/`) read and mapped 15 of 16 NIST threads, matching the NIST keys.
- **Round 1 answers** ([form](https://claude.ai/artifact/UR1pmouDpuSahgVF5v5kbc), 2026-11-08): olefile approved as a runtime dependency (SAFE-01); Morgan: "If okefile works well and it's free then that is fine. Make sure it is safe to use though." Checked 2026-11-08: 0.47 (2023-12-01) on PyPI and conda-forge, BSD-2-Clause, no dependencies (standard library only), no known vulnerabilities (PyPI and OSV empty). Safety rules for the reader: it runs in the analysis worker under its time limit, caps the size of every inflated stream, and treats every record count and pointer as untrusted. Shape stays from STEP; shape from the `.ipt` comes "right after feature reader works" (a later phase). Now: thread callouts, hole type as designed, feature names, a flag where `.ipt` and STEP disagree; soon: fillet and chamfer sizes; later: iProperties material and part number, `.iam`, a folder of parts. No Autodesk cloud (assume no). Repo holds only the 16 NIST `.ipt` files with checksums; Morgan's work pairs stay off it (D-006). Company uses Inventor 2023-2025. Autodesk's terms: "Not a concern for us" (Morgan). InventorLoader (GPL) may run in a scratch folder as a cross-check; its source is not read or copied. Open until the [review](https://claude.ai/artifact/JKC9dFPSgWqzhpq65qzArK): the measure of done, the upload flow, part types, test pairs per release.

## D-032 Inventor parts phase plan approved

- **Status:** Accepted (2026-11-08; Morgan, in chat after the [review page](https://claude.ai/artifact/JKC9dFPSgWqzhpq65qzArK): "Ok go ahead with all as recommended and merge when ready"). Every recommended answer and take on the review page is taken as given.
- **Decision:**
  - **Done for the phase:** every thread shows its callout (size, class, depth, tap drill); 95% of Hole features map to a hole the app finds; every feature that can't be mapped shows "not mapped", never a guess.
  - **Three states per feature:** matched; disagrees (measured, with the gap in mm), which becomes a finding (D-001); not mapped (our limit, shown as such, never a finding).
  - **Upload:** the `.ipt` and its STEP export together; the shape comes from the STEP (D-031).
  - **Checks before mapping:** the pair must line up exactly (within 0.01 mm, no rotation search) and agree in volume, bounding box and face count, else it is refused with the reason ("these files don't match"). The rotation search stays in the NIST tests only, because NIST's STEP files come from other CAD systems.
  - **Part types:** plain single-body parts first; Model States, iParts and iFeatures, sheet metal, multi-body, derived and Content Center parts are refused with a message until Morgan says they're used.
  - **Feature names:** every name (default or renamed) in small print beside its finding.
  - **Tests:** the 16 NIST `.ipt` files with checksums, committed in the first slice that reads them; Morgan's work pairs, one per Inventor release 2023, 2024 and 2025, stay off the repo, and only their checksums and expected counts go in git; no online pairs. If IT allows, an Inventor macro on Morgan's PC makes answer keys for the work parts (tests only; the app never needs Inventor).
  - **Build order:** I1 threads; I2 hole features (type, designed sizes, names, patterns and mirrors, disagree and not-mapped states); I3 fillets and chamfers. Later phases: shape from the `.ipt`, material from iProperties, a folder of parts, `.iam` with assemblies.
- **Why:** the review (own and an adversarial reviewer on the answers alone) found "all features mapped" untestable, Inventor 2023 and 2025 untested, and a mapping miss able to look like a design fault. Each item above closes one of those.

## D-033 Inventor I1 threads spec approved

- **Status:** Accepted (2026-11-08; Morgan, on the [approval page](https://claude.ai/artifact/We9PewcwKGm4GFnMrrQfxp): "Approved, start building"). Amends D-032.
- **Decision:**
  - Build I1 from [docs/specs/inventor-i1-threads.md](specs/inventor-i1-threads.md): S1 pair upload, checks and refusals; S2 threads mapped and shown; S3 feature names.
  - The stale-pair check compares every corner (within 0.01 mm), the face count and the bounding box, instead of volume (Morgan: "Check every corner, plus the face count and outer size"). If Morgan's first work pair shows Inventor's STEP export changes the face or corner count, the spec's fallback (refuse on the bounding box only, warn on the rest) goes to Morgan before S1 goes on.
  - Feature names move to I2 if S3's half-session decode fails (Morgan: "Yes, move them to I2 if needed").
  - Samples for the refuse list: Morgan "Not sure". Sheet metal and multi-body are refused from measured markers; parts with 2+ Model States are refused by the `UFRxDoc` rule (layout assumed); iParts, derived and Content Center parts are not detected and the report says so in its assumptions until a sample turns up.
- **Why:** the `.ipt` stores no volume (no float in any property set, no mass or volume in any ACIS record of the 16 NIST files), and a corner check catches a moved hole that volume would miss; 5 fresh checks found no other open decision.

## D-034 I1 S1: two file fields for the .ipt pair

- **Status:** Accepted (2026-11-08; Morgan, in chat after the [mock-up](https://claude.ai/artifact/GfyRY7JTC9RHF97csbb18H): "Ok go with a").
- **Decision:** the upload bar has two fields, "STEP file" and "Inventor part (.ipt), optional" (mock-up option A), instead of one field for both files (spec Design "web/", amended). Picking the STEP starts the review as today; adding or changing the `.ipt` runs it again with both (a new part); an `.ipt` picked first waits for its STEP. The bar shows the Inventor build beside the size and faces; the status line names both files. The wording listed in the mock-up's check record is approved with it.
- **Why:** each file is picked on its own, in either order, and nothing changes for STEP-only users; one field needs both files picked in one dialog.
- **Open (Morgan, same message):** "explore the idea of just using the .ipt file": shape from the `.ipt` alone, a later phase in D-031 and D-032. Proposed, not decided: see HANDOFF Open questions.

