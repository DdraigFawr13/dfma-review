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
- **Amended by D-042, built 2026-11-09:** the verdict line is gone; its counts are on the Part step's overview and the checks run on the Report step.
- **Decision:** Layout 4 leads: controls and part size in a bar on top, a verdict line, the 3D view on the left, findings on the right in severity groups plus a "Passed" list. Style: Drawing office, with the rest of the part faded while a finding is selected. Kept for later: layouts 1 (three columns) and 2 (controls on top); after: 3 (CAD tree); cut: 5 (pins), 6 (table below), 7 (one at a time). Styles kept: Drawing office, Inspection sheet; after: Dark CAD workspace, Light quote portal; cut: Highlight focus (only its ghosting is used). Extras picked for later ("All of these can come later"): a "Rules passed" list, a section view, a draggable split between view and list.
- **Why:** Morgan's answers on the [options board](https://claude.ai/artifact/EUxCGkamBk28VYfGe2CWD3) (collection `layout1`, 2026-11-06), built from research on 9 tools (HANDOFF 2026-11-06).

## D-013 mm files accept inch drills too

- **Status:** Accepted (2026-11-06). Changes D-007's "metric drills for mm files".
- **Decision:** `hole_size` checks mm files against the metric drills and the 1/64 in drills. Inch and other files keep the 1/64 in drills only, so the 0.1 mm grid still can't hide an odd inch size there. With both lists, the top of the drill range for mm files is 1 in (25.4 mm), not 25.0 mm (D-010's skip rule uses this top).
- **Why:** new evidence from the NIST gold standard (D-011): several NIST parts are designed in inches but written in mm, and metric-only checking flagged every standard inch hole (ftc_09: 27 hole-size findings from its mm file against 4 from its inch twin stc_09). Morgan: "For hole size your recommendation is approved" (2026-11-06).

## D-014 Colour legend with a switch per feature kind

- **Status:** Accepted (2026-11-06).
- **Amended by D-042, built 2026-11-09:** the legend is gone; the Show OK switches (Holes, Pockets, Corners, Walls, each with its swatch) sit at the foot of the model on the Features step only.
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
- **Amended by D-042, built 2026-11-09:** HIGH / MEDIUM read FIX / REVIEW on screen and in the PDF; the selected pin reads "F4 FIX".
- **Amended by D-053 (2026-11-09):** every pin carries its ▲/◆ mark, selected or not, so a pin's severity no longer rests on its ring colour alone (UX audit F26).
- **Amended by D-076, built in UI fixes S1 (2026-11-11):** pins and stems hide while the camera moves (drag, wheel, keys) and come back about 150 ms after the last mouse or wheel move, 600 ms after a key; and a selection greys everything else, so "nothing else dims" no longer holds.
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
- **Amended by D-076 (slice B, built 2026-11-11):** the Machining step has a Part / Machine switch over the model; in Machine a setup puts its direction up on screen, and a tool row lights the faces it cuts with a placeholder spindle (a chuck on a lathe part). Part is as before.
- **Amended by D-042, built 2026-11-09:** the Machine plan panel is the Machining step; the Passed list is the Features step's Passed chip (rows by kind and check, each feature's math in the open row).
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
- **Test of the .ipt alone** (Morgan, 2026-11-08, on the [page](https://claude.ai/artifact/WJPZdd5WSm2rcuvMksTNb3): "Yeah go with two fields and try now alongside s1"): a time-boxed test run, in its own worktree, builds an OpenCascade solid from the `.ipt` alone on the 7 NIST files with no spline faces or intcurve edges and compares it with the NIST STEP (volume, outer size, holes). Research only: nothing reaches the app until Morgan decides; shape from the `.ipt` stays a later phase (D-031, D-032) unless the result changes that.

## D-035 Shape from the .ipt: its own phase after I1

- **Status:** Accepted (2026-11-08; Morgan, in chat after the [results page](https://claude.ai/artifact/WJPZdd5WSm2rcuvMksTNb3): "Go with your recommendations and continue. Stop asking for th s1 pair until later this week").
- **Decision:** finish I1 (threads) with the `.ipt` + STEP pair; then plan reading the shape from the `.ipt` alone as its own phase (planning-interview), starting from `docs/research/inventor-shape-spike/`. S1 goes on without the work pair: `check_pair` is built to the spec's rules and stays provisional until the first work pair is measured (spec S1 "First"); if that measurement breaks the rules, D-033's fallback still goes to Morgan. Don't ask Morgan for the pair again before 2026-11-12.
- **Why:** the test run built a valid solid from the `.ipt` on all 7 analytic NIST files (volume within 0.11-1.06% and the same holes on 6; FTC 11 41% short, unexplained), but spline surfaces, intcurve edges and the work releases are untested (estimate 4-6 days); the STEP route works for every part now.


## D-036 I1 S2: Threads panel and PDF section

- **Status:** Accepted (2026-11-08; Morgan, in chat after the [mock-up](https://claude.ai/artifact/7H6qTtj2BYgQATskcXVMZG): "Approved with your recommendation").
- **Decision:** a fold-away "Threads" panel under Findings, open when the `.ipt` has threads, hidden without an `.ipt` (`mockups/threads-panel.html`). One row per thread in record order: state (matched / disagrees / not mapped, in text and colour), callout `<designation> - <class>`, its hole, depth and tap drill in inches with the stored mm in brackets; a disagreeing row adds its gaps and its finding; a not-mapped row is plain text with its reason ("our limit, not a finding"). Tapping a row selects its hole. The hole's Passed row and any finding on it add `Thread: <callout> (from the .ipt)`. The PDF's summary page gets a Threads section after Cost drivers with one line per thread. The wording in the mock-up's check record is approved with it.
- **Why:** a fixed fourth panel squeezed the findings list; a disagreeing thread is also a finding, so a folded panel can't hide it.

## D-037 I1 S3, I2 and I3 on one branch, merged together

- **Status:** Accepted (2026-11-09; Morgan, in chat: "Can we also combine i2 and i3 into this session and merge then all together?", then picked "One branch, one merge" on the follow-up question). Amends D-032's build order (each phase its own PR).
- **Decision:** I1 S3 (feature names), I2 (hole features) and I3 (fillets and chamfers) are built on branch `inventor-i1-s3` and its one PR, and merged together after Morgan approves. Order: finish S3; write one combined I2+I3 spec (write-spec, fresh checks) for Morgan's approval; build it slice by slice on the same branch. If a session's context runs out, the next session continues from HANDOFF on the same branch. Morgan also allowed running InventorLoader in a scratch folder for the answer key (output only, its source not read, D-031).
- **Why:** Morgan wants one review and one merge for the rest of the Inventor feature work; the cost is one larger review and S3 waiting for I2 and I3.

## D-038 Merge S3 now; I2+I3 on a new branch

- **Status:** Accepted (2026-11-09; Morgan, in chat while the I2+I3 spec was starting: "You can actually create or and merge what's there before the spec"). Amends D-037 (one branch, one merge).
- **Decision:** PR #23 (I1 S3: the names answer key, the decode probe, `test_inventor_names.py`; no app change) merges now. The combined I2+I3 spec and its build go on a new branch cut from the merged main (GIT-01), with their own PR, merged after Morgan's approval.
- **Why:** S3 changes no app code and its checks are green, so it need not wait for I2 and I3; a merged branch is never reused.

## D-039 Inventor I2 + I3 spec approved

- **Status:** Accepted (2026-11-09; Morgan, on the [approval page](https://claude.ai/artifact/CKm1QJ3P9fADdFuZQrb8Ev): "Approved, start building", then "Approved" in chat). Amends D-032 (names).
- **Decision:**
  - Build I2 and I3 from [docs/specs/inventor-i2-i3-holes-fillets.md](specs/inventor-i2-i3-holes-fillets.md): S1 hole features, S2 names and copies, S3 fillets and chamfers, on branch `inventor-i2-i3` (PR #24).
  - Names by the rank rule, default names only: a renamed Hole has no name and the part then shows no Hole names ("OK, default names only"; amends D-032's "default or renamed"). Names ship only from a rule checked against an answer key with zero misses (Morgan, 2026-11-09: "Check, then ship"; 70 of 70, 0 wrong).
  - Fillet and chamfer names left out for now ("Leave them out for now"): no answer key can check them.
  - A fillet or chamfer that disagrees with the STEP is a finding, like threads and holes (`blend_mismatch`, S3).
  - One PR, merged only after Morgan's hand check of one work pair in Inventor (work pairs owed from 2026-11-12, D-035).
  - Copies show as "copied by n pattern or mirror features"; the kind is not named.
- **Why:** measured on the 16 NIST files (docs/research/inventor-i2-probe): face tags give Hole features, copies and blends; type and diameter 73/73 against the key; 6 fresh checks found no open decision left beyond these five.

## D-040 I2 S1: Hole features panel and PDF section

- **Status:** Accepted (2026-11-09; Morgan, in chat after the [mock-up](https://claude.ai/artifact/BRpP8rxBEi2U1nwX8piYHT): "Approved with your recommendation").
- **Decision:** a fold-away "Hole features" panel after Threads, hidden without an `.ipt` (`mockups/hole-features-panel.html`). One row per Hole feature in id order: state (matched / disagrees / not mapped, in text and colour), `<type> · <n> holes`, its id, its sizes as designed (inches first, mm in brackets), and its hole counts per state. Tapping a feature selects all its mapped STEP holes and unfolds the list of its holes and the rows of holes that disagree or aren't mapped; tapping a hole row selects that hole alone. The panel opens when any hole disagrees or isn't mapped, else it is folded. The PDF's summary page gets a "Hole features" section after Threads, one line per feature, with its findings and any not-mapped reason. Rule label "Hole feature vs hole". The wording in the mock-up is approved with it.
- **Why:** 54 holes under 9 features would bury the Machine plan; the features fold their holes, and a disagreeing hole is also a finding, so folding can't hide it.

## D-041 Merge I2 S1 now; S2 and S3 on a new branch

- **Status:** Accepted (2026-11-09; Morgan, in chat after the S1 [status page](https://claude.ai/artifact/5yW8LBj6ZjYb3aA4v3zFy6): "Ok approved. When merged start the next session in a new session please", then picked "Merge S1 now" on the follow-up question). Amends D-039 (one PR, merged after the work-pair check).
- **Decision:** PR #24 (I2 S1, hole features) merges now. S2 (names and copies) and S3 (fillets and chamfers) go on a new branch cut from the merged main (GIT-01) with their own PR, which merges only after Morgan's hand check of one work pair in Inventor (from 2026-11-12). The next slice starts in a new session.
- **Why:** the work-pair check guards the rank rule for Hole names (S2), which S1 doesn't ship; S1's checks are green and its NIST numbers are measured.

## D-042 Review screen redesign: a step-by-step review

- **Status:** Accepted (2026-11-09; Morgan, on the [round 3 page](https://claude.ai/artifact/V5jsL9TkRoY7HDiPJM4DS8): "Approved with the changes I wrote" and "The cost section isn't showing any total but otherwise go with what you recommend"). Not built yet: the build is its own slice, planned with `write-spec` after the Inventor I2+I3 work. Until then UI_STYLE describes the screen as built. When built, it amends D-012 (layout and verdict line), D-014 (legend), D-017 (severity words) and D-023 (where Plan and Passed sit).
- **Amended by D-076 (slice B, built 2026-11-11):** one Open… picker in the top bar takes a STEP and its .ipt together; "Change file" and the file name in the bar are gone; Examples ▾ loads four sample parts.
- **Amended by D-053 (2026-11-09):** the setup count's reason reads "Why n setups:" on its own line (F31); Fix first stays last on the overview, but the cards column no longer stretches, so no blank band sits above it (F21).
- **Decision:**
  - Steps across the top: Part · Features · Machining · Cost · Report, with Back / Next at the foot of each. The Part step is the start form; once the part is read it becomes the overview (counts per step, features checked, biggest cost drivers, Fix first) with "Change file".
  - Severity words Fix (was HIGH) and Review (was MEDIUM), with shape marks ▲ and ◆, in the app and the PDF. Step tabs show shape + number; every list, card and selected pin carries the word (amends UI_STYLE checklist item 9 when built).
  - A finding row: severity word, a short title, one plain sentence with the measured value and the limit, then the check's name and its limit source (estimate, or the drill list within 0.0005 in). Repeats fold into one row ("Sharp corner ×4"). Ids such as corner-1 only in the opened detail. Rows, not a table.
  - Features step: chips Issues · Passed · All (Passed off by default, as D-023). A "Show OK" switch per kind (holes, pockets, corners, walls) at the foot of the model, on this step only, defaults as D-015 and D-016; the 7-entry legend goes. Threads (D-036) and Hole features (D-040) become groups in this step.
  - Machining step: machine, stock, tool loads, a one-line why for the setup count, each setup's operations and the issues it holds; setup chips on the model (D-023). Turning shows the lathe plan here.
  - Cost step: drivers as count × weight with the findings that feed each, and a total score (Morgan's change).
  - Report step: what the PDF holds, the rules run (off the verdict line, which goes), the assumptions, Export PDF.
  - Side panel 460 px at 1280 px; the panel moves under the model at 900 px and below. Errors show in the start form. Look unchanged (Drawing office).
- **Why:** Morgan, 2026-11-09: the UI was "increasingly convoluted and complicated with too much description and unclear labeling". Measured on report_sample.step: 1 of 8 findings in view, 910 words with every panel open, the same sentence 4 times, a 7-entry legend. Research (DFM tools, BIM issue trackers, NN/g, IBM Carbon) and three mock-up rounds: [round 1](https://claude.ai/artifact/3WKMC2icNNuE9i9scBLT3n), [round 2](https://claude.ai/artifact/PZbfjpJcG6jLqFR1CWShpM), [round 3](https://claude.ai/artifact/V5jsL9TkRoY7HDiPJM4DS8). Answers and sources: `docs/research/ui-direction/README.md`; frames: `mockups/ui-direction/round3-frames.html`.

## D-043 I3 S3: Fillets and chamfers panel and PDF section

- **Status:** Accepted (2026-11-09; Morgan, in chat after the [mock-up](https://claude.ai/artifact/9AedyRhGSNr5Md5Pzj9VxZ): "Approved").
- **Decision:** a fold-away "Fillets and chamfers" panel after Hole features, hidden without an `.ipt` (`mockups/blends-panel.html`). One row per blend in feature-id order: state (matched / disagrees / not mapped, in text and colour), `Fillet · R<size>` or `Chamfer · <d1> × <d2>, <angle>°` (inches first, mm in brackets), its id, "n of m faces found in the STEP", "copied by n pattern or mirror features" when copied (kind not named, D-039). Tapping a row selects its STEP faces. The panel opens when a blend disagrees or isn't mapped. A fillet radius gap is a medium "fillet vs face" finding; chamfers are checked by place only. The PDF gets a "Fillets and chamfers" section after Hole features, one line per blend, with "finding F<n>" as on screen. The wording in the mock-up is approved with it.
- **Why:** the same pattern as Threads (D-036) and Hole features (D-040); measured on NIST (spec S3 "Settled at build").

## D-044 Mock-ups in the new design now; demos after it is built

- **Status:** Accepted (2026-11-09; Morgan: "can you show mockups and demos in the new UI design from now on please", then, told D-042 isn't built: "go with recommended here").
- **Decision:** from now on every mock-up is drawn in the D-042 step-by-step design (round 3 frames, `mockups/ui-direction/`). S3 finishes on today's screen (tests and PDF) with no new demo; the D-042 build is specced (`write-spec`) and built next, and every demo after it is built from the new screen (D-009 unchanged: demos come from the real code).
- **Why:** demos must show what the app really does (D-009), and the new design exists only as approved mock-ups; S3's panel is already built and its PDF section doesn't depend on the screen.

## D-045 Review-in-steps spec approved

- **Status:** Accepted (2026-11-09; Morgan, on the approval question: "Approved, start building").
- **Decision:** build the D-042 screen from `docs/specs/review-steps.md` in three slices (S1 steps, overview, Cost total, Report, Fix / Review words; S2 grouped Features rows and Show OK switches; S3 Machining with issues per setup). Row wording, grouping and limit-source text live in one service module, `service/dfma/rows.py`, with the short titles and check names in the spec's Design "Rows" table; rule cases other than sharp corner, hole depth, drill size and pocket depth keep today's titles as their sentences until plainer ones are shown to Morgan. The step is in the address (`#part` … `#report`). The cost total is computed in the service and labelled a score. The build cuts from main; whichever of it and PR #27 merges second brings the other in and places Fillets and chamfers as a Features group.
- **Why:** D-042 approved the screen; the spec passed paraphrase, critic and zero-decision checks with two fix passes and a final zero-decision pass (LESSONS "spec").

## D-046 Merge I2 S2 and I3 S3 now; the work-pair check follows

- **Status:** Accepted (2026-11-09; Morgan: "approve all please merge"). Amends D-041 (the PR merged only after the work-pair check) and D-039's "one PR merged after the work-pair check".
- **Decision:** PR #27 (Hole names and copies, fillets and chamfers) merges now. Morgan's hand check of one work pair in Inventor, with one Hole renamed, is still owed from 2026-11-12. If it shows a wrong Hole name, Hole names are switched off (Morgan's rule, D-039: "Check, then ship").
- **Why:** Morgan approved the work; the names come from a rule with 70 of 70 right and 0 wrong on the NIST key, and the risk the hand check guards (two faults cancelling out) is stated in the spec's Risks.

## D-047 Review-steps S1 approved and merged

- **Status:** Accepted (2026-11-09; Morgan: "Approved. Merge please then start a new session for s2").
- **Decision:** PR #29 (review-steps S1) merges, with the builder's calls listed on its [status page](https://claude.ai/artifact/1DBpmPRjdQ97e1vezTzHUV): once a part is read, process and material are two dropdowns under the file name; id ranges dash for 3 or more ids in a row ("F4–F7"), two stay spaced ("F1 F2"); a limit source missing from `rows.LIMITS` shows as given ("limit: <source>"), and `test_rows.py` fails on any such source in the repo; pins stay on every step. S2 starts in a new session.
- **Why:** Morgan tried the first demo in the new design and approved it; the frames left these points open (the spec's zero-decision re-check found no gap that needed a question).

## D-048 Review-steps S2 and S3 built and merged together

- **Status:** Accepted (2026-11-09; Morgan: "in the new session let's just combine s2 and s3 they aren't that big of builds so let's combine those and start them in a new session on merge").
- **Decision:** review-steps S2 (Features rows) and S3 (Machining and the style guide) are built in one session on one branch, `review-steps-s2-s3`, cut from main after #29, and merge in one PR. S2's groups mock-up (`mockups/review-steps-features.html`) is still approved by Morgan before code; S3 builds to frame `r3-mach` (D-044). Both slices' checks must fail before the build and pass before the PR.
- **Why:** Morgan judged both slices small enough for one session; S3 waited only on S2.

## D-049 Features groups mock-up approved; corners go with their pocket's setup

- **Status:** Accepted (2026-11-09; Morgan, on the mock-up: "I do approve of the design and you can move forward"; on Machining placement: "With their pocket").
- **Amended by D-053 (2026-11-09):** a row's advice is labelled "What to do" on a Fix row and a Review row alike, on screen and in the PDF (F34).
- **Decision:** S2 builds the [Features groups mock-up](https://claude.ai/artifact/Cff2Y88mwZ3FaXqUMBLxwq) (`mockups/review-steps-features.html`): under the Issues rows, "From <.ipt>", then one folding row per group (Threads, Hole features, Fillets and chamfers) with its count and tally in the approved words; an opened group shows today's rows (D-036, D-040, D-043) and its intro without the counts the group row shows; the groups show under every chip; a row's advice is labelled "Fix" on a Fix row and "Suggestion" on a Review row. S3: an inside corner sits in the setup that cuts its pocket (as frame `r3-mach` shows); a thin wall sits under "Whole part". This amends the spec's "Machining placement" default, which read setup membership from `setups[].features` only (holes and pockets, `plan.py:108`).
- **Why:** the zero-decision re-check found the spec's rule put every corner in "In no setup", against the approved frame; Morgan chose the frame.

## D-050 An angled hole is a Review; a hole not square to its entry face is a Fix

- **Status:** Accepted (2026-11-09; Morgan: "a hole off of one of the main setup planes should not be a fix inherently unless there is more wrong with it. It should be a review or whatever it's called. If the hole is not perpendicular to its surface plane then that could be marked as a fix"; on the follow-up: "Both in this PR", "Keep pockets as Fix"; then, on approving the PR: "Actually do the same for pockets don't keep them fix").
- **Decision:** the `access` rule's hole findings drop from Fix (high) to Review (medium). A hole is a Fix when its axis is more than 0.5° off square to the flat face around its opening (the same 0.5° the rule uses for the part's axes; assumption, labelled in the finding). A pocket that opens off the part's axes is a Review too; it has no entry-face check (none is measured for pockets), so it is never a Fix on this rule. Built on `review-steps-s2-s3` with S2 and S3 (D-048). Amends the first-version spec's Rules line for `access` (high for every feature).
- **Why:** a hole drilled square into an angled face is routine with a fixture or a 4/5-axis mill; a hole that enters its face at a slant makes the drill walk, which is worth fixing in the design.

## D-051 Review-steps S2+S3 approved and merged

- **Status:** Accepted (2026-11-09; Morgan: "I approve the demo you can build and merge when ready").
- **Decision:** PR #30 (review-steps S2 and S3, D-048; groups mock-up D-049; angled holes and pockets D-050) merges with the builder's calls on its [status page](https://claude.ai/artifact/9HhhzKxSxrPjExsFUfPuB7): several findings of a templated case read in the plural; the Passed chip counts features; rows inside an opened .ipt group keep today's look; Machining shows tool names only; a part with no machine plan lists its rows on Features only. The review-steps spec is shipped.
- **Why:** Morgan tried the demo and approved it.

## D-052 A deep pocket's advice counts its passes at a safe depth

- **Status:** Accepted (2026-11-09; Morgan: "can they not just do multiple passes at multiple z heights? Maybe add that in the review in some way to that is simple to understand how many passes at safe depths you would need"; on the depth per pass: "Base this on common machining practices. You may research this to confirm what those are").
- **Decision:** a `pocket_depth` finding gives `passes` and `pass_in`: the depth split into even passes no deeper than `pass_xd` × the end mill's diameter (`config/thresholds.toml`: 1.0 in aluminium, steel 1018 and plastic, 0.5 in stainless; an estimate). The row's sentence adds "Cut in 8 passes of 0.031 in (1/32)."; the advice says the tool still reaches the full depth, so it is a long-reach end mill. The finding stays a Review. Built in PR #30 before its merge.
- **Why:** passes lower each cut's load, but the tool's reach is the full depth either way, so the long tool stays the issue. Sources for the per-pass depth (common practice for slotting with solid end mills): MMC Carbide's "Depth of cut" course (slotting with roughing edges up to 1D; shallower for harder material and more flutes), and Haas speeds-and-feeds sheets as reported by a web search (1.0D for aluminium and carbon steel, 0.5D for stainless; the sheets themselves refused automated reading, so their columns are unverified). Plastic: as aluminium (assumption; no source found).

## D-053 UX audit fixes, 2026-11-09

- **Status:** Accepted (2026-11-09; Morgan, on the audit's reply page: "Go with your recommendations to fix"). Built and approved: "Approved, merge when ready" (2026-11-09), merged in PR #32.
- **Decision:** fix all 34 findings of [docs/audit/2026-11-09-ux.md](audit/2026-11-09-ux.md) as each one's Fix recommends, on one branch (`audit-2026-11-09-fixes`) and one PR. Where a Fix offers two ways, the first is taken unless it says "leave it" first: F9 keeps the approved frames' words and names them in UI_STYLE; F16 raises small targets to 44 px below 900 px; F20 scrolls the steps in one row below 500 px; F24 makes each card heading the link; F25 is left as it is (F19 gives disabled tabs their reason). Amends D-017 (F26), D-042 (F21, F31) and D-049 (F34). A code fix closes with a test that fails before it; a wording fix closes with its commit.
- **Why:** the audit (PR #31) found no blocking issue but 34 smaller ones across wording, narrow widths at 200% text, ARIA and the Machining step; Morgan accepted every recommended Fix.

## D-054 A static GitLab Pages build on opencascade.js

- **Status:** Accepted (2026-11-10, with the port spec, D-056). Planning approved 2026-11-09 (Morgan: "Go ahead and plan the port"). Replaces D-004's stack and D-006's package gate for the app once S8 retires Python. Morgan asked to port to TypeScript on opencascade.js so the app runs "on Gitlab pages completely", as the work PC suggested. Trial done; the port itself is not approved. If approved, it replaces D-004's stack and D-006's package gate for the app (the build still downloads npm packages).
- **Decision (proposed):** move the geometry service from Python (pythonocc-core 8.0.1.2) to TypeScript in the browser on `@taucad/opencascade.js` 3.0.0-beta.3 (OpenCascade V8_0_0, LGPL-2.1 with the OCCT exception), and the `.ipt` reader from olefile to `cfb` 1.2.2 (Apache-2.0). Port in slices; each slice must give the same results as the Python code on the same files before the Python code for it goes. Every finding and number still traces to a measurement (D-001); nothing leaves the user's PC.
- **Why:** the trial (`spikes/ocjs/README.md`) found the fork reads all 33 NIST STEP files the same as the app: 8,137 of 8,137 faces the same in kind, area, radius, axis, orientation and neighbours, in Node and in Chromium; 512 of 512 `.ipt` streams the same. D-004 refused the browser because the official build was 7.6.2; the fork is 8.0.0. Risks: the fork is a beta from one company (last published 2026-07-22); the engine is 41 MB (11.5 MB gzipped) for the user's browser to download; the recognizers are not ported, so their scores on the fork are not measured.

## D-055 GitLab Pages port: planning answers

- **Status:** Accepted (2026-11-09). Morgan, on [Port Round 1](https://claude.ai/artifact/GsFh2jKiaVwTGoDRxyRE4z) and then on [Port Review 1](https://claude.ai/artifact/LB487Hw6uY7NAmwZHLERKk): "Ok approved with your recommendations" (the review page's form was left blank, so its recommended options and takes are the answers).
- **Decision:** engineers open the site in Chrome from the company network. A public copy lives on GitHub Pages until the move; it only ever holds test parts and says it is a test copy. The Python app stays as the answer key until the port is done. The site loads the full engine build (trim later only if the download hurts). Upload, 3D view and holes go first; every feature is in scope. Engineers at work may start once holes and the PDF work, with every report listing the checks it has not run yet. Morgan tells IT or their manager before the work copy goes up. The engine runs in a background worker. "The same report" means the same findings (kind, count, faces) and every number equal to 6 significant figures. The 50 MB upload limit stays. Defaults taken where the form had no recommendation (Claude, 2026-11-09, open to change): the repo stays public; a GitLab pipeline builds the work copy, or built files are committed if the work runners can't download packages; no deadline.
- **Why:** Morgan: running on GitLab Pages "allows me to host it on my work computer / network"; today "I can't run this in my work PC or share it easily"; engineers will open the site and "there is no automated review like this currently". The review's 11 findings and their takes are on the review page.

## D-056 GitLab Pages port spec approved

- **Status:** Accepted (2026-11-10). Morgan on [Port Spec Approval](https://claude.ai/artifact/AjZQkdVY7ATByDULSNBfmQ) (collection `final`): "Approved, start building"; in chat: "spec done. Start building in a new thread".
- **Decision:** build [docs/specs/gitlab-pages-port.md](specs/gitlab-pages-port.md) slice by slice, S1 first, S1 starting with its mock-up. Approved with it: `smol-toml` 1.9.1 (BSD-3-Clause) reads `config/*.toml` in the browser; the browser tests run twice on every push (service and browser engine) until S8; `spikes/ocjs/` is deleted in S1; the browser tests move to `@playwright/test` in S8 so the repo needs only Node; from S1, demos are built from the browser engine's results. Accepts D-054.
- **Why:** the trial (`spikes/ocjs/README.md`) and the spec's 3 fresh checks, 2 re-checks and final check left no high-severity finding; Morgan answered Yes to each addition.

## D-057 Port S1 mock-up approved; merge when satisfied

- **Status:** Accepted (2026-11-10). Morgan, in chat on the [S1 mock-up](https://claude.ai/artifact/EDnCkkdnccX7jjsjrP3ZJa): "I approve all merge when you are satisfied".
- **Decision:** build S1's screens as the mock-up shows (`mockups/port-s1-browser-copy.html`), with every choice on it: the not-checked line replaces "No findings…" on the Features card and step, and the chips and Show OK switches hide while no check has run; "The PDF holds" lists only page 1 and the assumptions until their slices; the status line reads "Choose a STEP file to start." while the .ipt field is hidden; the privacy line becomes the spec's; "Licenses" in American spelling (the spec's file name `licences.html` stays); no new wording while the engine downloads; a boxed "Test copy" mark in normal type. Merge S1 once its checks pass, the fresh reviewer's findings are settled and the status page and demo are published (D-009), without waiting for another approval.
- **Why:** Morgan approved every choice and delegated the merge.

## D-058 Port S1: the page freeze fixed; the big plate runs once per slice

- **Status:** Accepted (2026-11-10). Morgan, in chat: "Go with your recommendations but do try to keep the resting time shorter please. Be more efficient", on the [two-tests page](https://claude.ai/artifact/PQryDfevPjVgpWMcDAHRPR).
- **Decision:** J3 keeps its 200 ms limit. The freeze was found and fixed: the engine compiles while the page waits for a file, and the worker works out each face's normals and edge lines; the viewer draws every face's edges as one object and skips three's synchronous shader checks. J3 measures the analysis, from the upload to the worker's reply, as its spec words say; the drawing of the result after it is printed, not limited, because it is the shared 3D viewer (the service app freezes 1,144 and 1,387 ms drawing the same file; the browser copy 310 to 484 ms). J4 (the 49.94 MiB plate) runs once per slice, alone on the machine, with a 60-minute limit (`pytest -m per_slice --engine browser`), not on every push; its time and memory are recorded, then its size is decided.
- **Why:** Python's own reader took 925.6 s on the plate, so the file's size, not the browser, made J4 impractical on every push; the freeze measured 782 ms in the test and was found to be the result's drawing, not the analysis.

## D-059 Port: J4 dropped; S3 makes the machining setups easier to tell apart

- **Status:** Accepted (2026-11-10). Morgan, in chat during S2: "you don't to have to do that large plate with holes test that you did last session. We can just skip that it's unnecessary"; "Stop you don't have to do j4". And: "It is difficult to see where to click to select a machining setup in the right bar. The individual setups should be more distinct from each other", to be added "when we get to that slice".
- **Decision:** J4 (`test_peak_memory`, the 49.94 MiB plate, `pytest -m per_slice --engine browser`) is no longer run per slice or before a PR is marked ready; no plate size is chosen. The test stays in the repo, unrun, so a later slice can bring it back. S3 (Machining) also makes each setup in the Machining step's side list clearly separate and plainly tappable; that changes a screen, so S3 starts with a mock-up for it (`ui-mockups`), approved by Morgan before code.
- **Why:** Morgan judged the big-plate test unnecessary; the setup list is hard to read and tap today. Amends D-058 (J4 once per slice) and the spec's "only S1 changes a screen".

## D-060 Port S2 approved; merge when ready; S3 in a new session

- **Status:** Accepted (2026-11-10). Morgan, in chat: "I approve and you can merge when ready and start s3 in a new session".
- **Decision:** merge S2 once its checks pass, the fresh reviewer's findings are settled, the full-set parity is recorded and the status page and demo are published (D-009), without waiting for another approval. S3 starts in a new session, with its mock-up first (D-059).
- **Why:** Morgan approved the slice and delegated the merge.

## D-061 Port S3 mock-up approved with its recommendations; merge when done; S4 in a new session

- **Status:** Accepted (2026-11-10). Morgan, in chat on the [S3 mock-up](https://claude.ai/artifact/8JNZWyfhEctah8fm9jzDzh) (`mockups/port-s3-setups.html`): "Yes go with recommended as I said previously"; "When done I approve of what you have so please merge and start s4 in a new session. You have my approval to run anything you need to complete this slice".
- **Decision:** Q1 option A: each Machining setup is a card whose head is a band with "Show on model ›", turning `--accent` with "Shown on model" when picked (44 px tall below 900 px). Q2: the same look in the Python app. Q3: until pockets are ported (S4), a milled part's Machining step and PDF say "Pockets are not in this plan yet in this copy, so it may need more setups and tools." Q4: the PDF's Cost drivers section ends with "Total score: <n> points", with " (partial)" in the browser copy while a check that feeds a driver has not run; the screen's total and the Cost card read the same, and the Cost step shows the not-checked line. Turned parts keep "Not worked out yet in this copy." on Machining and Cost until S6. Merge S3 once its checks pass, the fresh reviewer's findings are settled, the full-set parity is recorded and the status page and demo are published (D-009); S4 starts in a new session.
- **Why:** Morgan's words above; the setup list was hard to read and tap (D-059), and a plan that leaves out pockets would otherwise show too few setups and tools with nothing saying so.

## D-062 Port S4 approved; merge when done; S5 in a new session

- **Status:** Accepted (2026-11-10). Morgan, in chat during the S4 build: "Ok when you are done merge and then start s5 in a new session".
- **Decision:** merge S4 (PR #37) once its checks pass, the fresh reviewer's findings are settled, the full-set parity is recorded and the status page and demo are published (D-009), without waiting for another approval. S5 (walls) starts in a new session, with its **First** step: port the wall finders as they are and run parity on walls over the full set; any wall finding that differs stops the slice and goes to Morgan (spec Risks).
- **Why:** Morgan approved the slice and delegated the merge. S4's stop test did not trigger: every pocket, corner and pocket finding on the full set equals Python's.

## D-063 Port S5: whole-degree bins snap to 9 decimals first, in Python and the port

- **Status:** Accepted (2026-11-10). Morgan, on the S5 stop question: "Snap in both (Recommended)".
- **Decision:** `features.py` `_angle_bins` takes each sample's whole-degree bin as `int(round(a, 9)) % 360` (`_whole_degree`), and `holes.ts` `wholeDegree` does the same. S5 then goes on.
- **Why:** S5's first full-set parity found 4 NIST linkage arms whose `thin_wall` findings named other walls than Python's. The cause was not the mesh: V8's `Math.atan2` is one step off glibc's at a hole's seam (-1.5707963267948972 vs -1.570796326794897), so the browser read 269.99999999999994 deg where Python read 270.0, dropped bin 270, and credited a wall to the hole's other half-face. A browser-only copy of glibc's atan2 can't be guaranteed on every input. With the snap in both, full parity is 282/290 the same (the 2 mesh-only files differ, 6 crash Python). Python's own results change on 7 of 290 files: the same findings, titles and cost totals; holes, pockets, setups and tools unchanged; only which hole face a wall at a hole names, 3 passing wall thicknesses, and 1 extra passing wall on `nasty_cheese.stp`.

## D-064 Port S5 approved; merge when CI is done; S6 in a new session

- **Status:** Accepted (2026-11-10). Morgan, in chat during the S5 build: "Ok I approve of everything when you are done. Please go ahead and begin to once this slice is complete and start a new session for the next slice. Merge when ci is completed".
- **Decision:** merge S5 once its checks and CI pass, the fresh reviewer's findings are settled, the full-set parity is recorded and the status page and demo are published (D-009), without waiting for another approval. S6 (turned parts) then starts in a new session.
- **Why:** Morgan approved the slice and delegated the merge.

## D-065 Faster check.py: lanes at once, timed tests alone, service tests on pytest-xdist

- **Status:** Accepted (2026-11-10). Morgan, in chat: "Can we work on reducing the amount of testing time for this port phase?", "I want to maintain accuracy still though", then "Do as you recommend" (pytest-xdist on the stated terms). After the measured results: "Approved. Merge when ready" (PR #39). D-063 and D-064 are on the S5 branch (PR #38).
- **Decision:** `scripts/check.py` runs its setup steps in series, then three lanes at once (service tests; e2e against the service; parity key, parity, browser e2e), then every test marked `timed` (it asserts a wall-clock limit) alone. The service lane runs on pytest-xdist 3.8.0 with cores − 2 workers, so each browser lane keeps a core (with every core, PR #39's first CI run starved a PDF download past Playwright's 30 s wait) (MIT, conda-forge; with execnet 2.1.2, MIT), a new test-only package. It stays only while a parallel run passes exactly the tests a serial run passes, by name, run after run; no assertion, tolerance or limit changes for it.
- **Why:** `check.py` took 12 min 40 s here and 13 min 24 s in CI against a 20-minute limit, one step after another. Measured results are on the [status page](https://claude.ai/artifact/He8bThHsaFfvnDt1MB8XS8) and in PR #39.


## D-066 Port S6 resumed; steps, slots and open pockets added to the plan

- **Status:** Accepted (2026-11-10). Morgan, in chat: "Ok please continue with the next slice here. Also to add to the plan, we will need to add feature recognition for things like steps, slots, and open pockets (like open on one side). Ensure you do research into finding, classifying, and machining features like that".
- **Decision:** the pause after S5 ends; port S6 (turned parts) is built in this session. A new plan item, feature recognition for steps, slots and open pockets, is added after the port; its research is [docs/research/feature-recognition.html](research/feature-recognition.html). Its 5 proposals and 4 questions there are Proposed, not decided; it is planned with the `planning-interview` skill before any code (WS-03).
- **Why:** Morgan's instruction. Today the pocket finder drops every floor with an open side (`service/dfma/features.py` `_pocket_walls`), so steps, slots and open pockets get no plan, tool or finding.

## D-067 Port S6 approved; merge when CI is done

- **Status:** Accepted (2026-11-10). Morgan, in chat: "S6 is approved. Merge whenever available".
- **Decision:** mark PR #40 ready and merge it once CI passes (auto-merge where the repo allows). S7 (Inventor) starts in a new session.
- **Why:** Morgan approved the slice and delegated the merge.

## D-068 Steps and slots: MFCAD++'s classes are the gold standard; no "open pocket" kind

- **Status:** Accepted (2026-11-10). Morgan, in chat: "do we need an open pocket? Does that count as anything or is it just a different feature by another name? I'd like to use the mfcad++ database as our test golden standard for things like this. Otherwise go with your recommendations". Amends D-018 (steps and slots are now scored) and D-066 (the proposals).
- **Decision:**
  - **Kinds and names:** an open-sided floor is named with MFCAD++'s classes, so the app has no "open pocket" kind. A floor open to the outside on its far end (or both ends) with two facing walls is a slot (classes 5-7 through, 17-19 blind); one with a single wall run is a step (classes 8-10 through, 20-22 blind). Pockets stay closed (13-16).
  - **Scoring:** steps and slots are scored on MFCAD++ like pockets (D-018: target 0 wrong calls). Classes 17-22 leave `EXCLUDED` in `tests/grading/grade.py` once a finder for them exists. D-019's shape stays a pocket.
  - **Plan first:** steps and slots change the plan and tools first. Their open sides join `open_dirs`, so a cutter can enter from the side, and a slot gets a roughing end mill under its width before the finish. Findings only for a slot deeper than 6× its width (Protolabs) and, later, for the special cutters (T-slot, dovetail).
  - **Order:** a labelled `steps_slots` test set, then NIST and EDMR runs, before the MFCAD++ score (LESSONS "recognition"). Planned and specced after the port (S8), unless Morgan moves it up.
- **Why:** MFCAD++ has no open-pocket class: what the UMD labels "Opened Pocket" and CAD Exchanger calls an "Open pocket", MFCAD++ labels a step or a slot ([research](research/feature-recognition.html)). So, against Morgan's chosen gold standard, an open pocket is the same feature under another name, and a third kind would be a call MFCAD++ can never score. The rest are the research page's recommendations, which Morgan accepted.

## D-069 Port S7 approved; merge when ready

- **Status:** Accepted (2026-11-10). Morgan, in chat: "Ok I approve please merge when ready. No need to show me the demo".
- **Decision:** mark PR #41 ready once the full-set parity is recorded, and merge it when CI passes (auto-merge where the repo allows). S8 (retire Python) starts in a new session, its file list approved by Morgan first. Morgan's UI list (HANDOFF Next 000a) waits for planning.
- **Why:** Morgan approved the slice and delegated the merge; no demo review needed.

## D-070 S7 merges without the full-set parity; long runs show progress

- **Status:** Accepted (2026-11-10). Morgan, in chat: "Skip the rule. End the testing and analyze the results so far. Also when doing runs like this I want to make sure to receive at least some indication of progress so we know it is not hung up. Merge when ready to do so".
- **Decision:** S7's full-set parity was stopped after 64 min of CPU with no result (it printed only at the end). PR #41 merges on the quick parity (122 of 122) and green CI; the spec's "full set before ready" rule is waived for S7 only. From now on the parity run prints one line per file (`parity <set> [n/N] <status> <s> (total <s>): <file>`), and a long run is watched on those lines.
- **Why:** Morgan's call; S7's new code runs only with an `.ipt`, and the full set's extra files have none.

## D-071 S8 before the UI list; faster checks on the S8 branch

- **Status:** Accepted (2026-11-11). Morgan, in chat: "yes do both on the S8 branch and do what you recommend. If retiring python reduces the work load for testing further changes then do that first".
- **Decision:** S8 (retire Python) comes before the UI list (HANDOFF 000a), because it drops the Python service tests, the service-copy e2e run and the Python key from every later check. The parity run is split across processes and the key cache stops rebuilding on harness-only edits, on the S8 branch. **Approved 2026-11-11** (Morgan, on the question form: "Two PRs (Recommended)"): the S8 file list and its split into S8a (speed-ups, frozen key, scorer and Inventor harness on the engine) and S8b (Playwright and vitest ports, Python deleted), [S8 file list](https://claude.ai/artifact/ExT2DS3QeAL7bRas5LJLRT).
- **Why:** Morgan's call; the spec's S8 list missed the scorer, the Inventor harness and the part generators, which also run on Python.

## D-072 S8a built: four-shard parity, frozen key, harness and scorer on the engine

- **Status:** Approved 2026-11-11 (owner, in chat); PR #42 marked ready with auto-merge on. Built on `ccr-bd6f31ec-kskq1t` (S8a of D-071). Known: the full-set parity has 2 files that differ in `faces[].positions` (bn_ball6, nasty_cheese), unmeasured and pre-existing from S1-S7 (D-070); to be measured in a later slice.
- **Decision:** S8a as approved in D-071: parity split over 4 processes; key cache not rebuilt on harness-only edits; the final Python key frozen into `tests/parity/key/`; the scorer, scorecards, and Inventor harness (`local_pairs` first) run on the browser engine. Python stays until S8b.
- **Builder choices (not in the spec):**
  1. The frozen key keeps `faces[].positions` (gzipped), so parity still checks positions. Measured: 335 keys, 13.61 MB, under the spec's 20 MB assumption.
  2. `olefile` 0.47 and `pytest-xdist` 3.8.0 (both pinned in `environment.yml`) were installed with pip, because micromamba is not on this machine. The env had been built before those pins.
  3. The key cache no longer hashes `tests/parity/key.py`; a `KEY_FORMAT` constant stands in. Only harness keys hash `register.py` and `nist_pair.py`.
- **Why:** Morgan's D-071 approval; the measurements are from this session.
- **Measured:** quick parity 122 of 122 the same, 0 different, 0 Python crashed, 4 shards in 236.7 s. Harness: 16 of 16 NIST transforms equal Python's; `built` 7 of 7 equal. Scorer: all 100 MFCAD++ records on 6 labelled sets equal Python's; NIST scorecard equal.
- **Not done:** `local_pairs` on Morgan's real pairs (absent here; fixtures only). The pair check's passing line is untested on real data. The committed `tests/edmr/scorecard.toml` says `nasty_cheese` features 386; both engines give 387 (left as committed; open question).

## D-073 Harness v4.14.0 and the check time budget

- **Status:** Accepted (2026-11-11). Morgan, on PR #44: "Go ahead and merge all when ready".
- **Decision:** the shared harness moves to v4.14.0 (master D-068): the `test-design` skill and rules VER-10 and VER-11 load here. `python scripts/check.py` has a time budget of 900 s in a cloud session, and CI stays under its 20-minute `timeout-minutes`.
- **Why:** this repo's test lessons (LESSONS:29, :43, :45, :14, :23, :27, :30, :42, :53, :55) became the master rules. The budget leaves a margin over the 639.2 s measured on 2026-11-11 (lanes 511.5 s, then timed tests 63.5 s, 21.7 s, 33.8 s).

## D-074 S8b: the two full-set position diffs are tessellation; Python retired

- **Status:** Approved 2026-11-11 (owner, in chat: "Approved. Merge when ready"); PR #43. Measured before any Python was deleted. The tessellation exemption and the 30 s plan-test limit were chosen on the owner's "do what you recommend" and approved with the PR. Morgan's approval of the S8 file list: D-071.
- **Decision:** the two full-set differences in `faces[].positions` (bn_ball6, nasty_cheese; D-072) are tessellation, not geometry. No engine change. The frozen key keeps `faces[].positions` as it is (D-072).
- **Measured** (scratch measure run, Python OCC in `/opt/mamba/envs/dfma` against the key and the browser engine's output; numbers from that run):
  - `bn_ball6.step`, faces 14 and 18 (B-spline/revolution surfaces): 153 points and 822 indices on each side; Hausdorff 0.3490 mm (face 14) and 0.3374 mm (face 18); each point within 7.44e-6 mm of the face surface on both sides. Also faces 2 and 22 (planes) differ in index order only (deviation 0).
  - `nasty_cheese.stp`, face 202 (cylinder): 74 points and 216 indices on each side; Hausdorff 0 (the same 72 distinct points). One seam point is duplicated at a different position on each side (3.5355 mm apart along Y); each point within 4.31e-6 mm of the surface.
  - `nasty_cheese.stp` also has 64 faces that differ in triangulation (63 with identical point sets). The largest surface deviation of any of them is 1.23e-4 mm (face 152), so all are tessellation under the 1e-3 mm rule.
- **Why:** the approved S8 list required the measurement before Python could no longer regenerate the key; the answer is tessellation for every differing face measured.
- **Open:** the nasty_cheese measurement lists 64 faces, not one; the 63 identical-point faces are tessellation only. The compare is unchanged (positions rounded to 1e-5 mm, D-055 tolerance): the full-set parity still lists these two files as different, so `parity:full` exits non-zero until Morgan decides whether tessellation is accepted by the compare. Not changed here.

- **S8b results (2026-11-11, same branch):** `npm run check` exit 0. `parity:full` on the browser engine vs the frozen key: 335 files, 327 the same, 2 different (bn_ball6 and nasty_cheese, the D-074 pair), 6 Python crashed (UMD files, S1); exit 1 because of the 2 different. EDMR vitest: 114 of 114 (moved to `npm --prefix web run edmr`, out of the default check, about 9 minutes). The compare is not changed; whether tessellation is accepted is Morgan's call.
- **S8b quality pass (2026-11-11):** the e2e reference for findings, passed and pair checks is the frozen Python key where it covers the file (Mill, aluminium 6061); `thin_rib` (plastic) is not in the key and still compares to the browser run. This narrows the earlier note on browser-engine references.
- **S8b tessellation investigation (2026-11-11, 39 min):** cause found, not in our code. Same mesh call on both sides (linear 0.05 mm, angular 0.5 rad, parallel true, `BRep_Tool.Triangulation` with purpose none). The Python mesher is deterministic: `bn_ball6` face 14 gives the same 153 points with the parallel flag on or off, and both equal the frozen key. The two builds differ: pythonocc uses OpenCascade 8.0.1 (its library reports 8.0.1); opencascade.js 3.0.0-beta.3 (the browser engine) describes itself as OCCT 8.0.0. The difference is therefore the OpenCascade patch build. Not fixed here: a fix means changing the OpenCascade dependency (SAFE-01: needs approval). The compare is unchanged; `parity:full` still exits 1 on the 2 files until Morgan decides.
- **S8b decision (2026-11-11): tessellation is a named, measured exemption, not a compare change.** The position compare exempts only these faces, by index, in parity.test.ts: bn_ball6 faces 14 and 18; nasty_cheese face 202 (the other 63 nasty_cheese faces already compare equal; index order only). Every other key and face of those files is still compared, and any other difference fails. Full parity now: 335 files, 327 the same, 2 known tessellation, 0 different, 6 Python crashed; exit 0. Reason: pythonocc uses OCCT 8.0.1 and the browser build is OCCT 8.0.0 (D-074 investigation). Changing the OpenCascade dependency was rejected here: it needs approval and is not shown to fix this. Morgan can overrule this exemption at review.

## D-075 Edge treatments (chamfers and fillets) and pocket shapes join the recognition plan

- **Status:** Accepted (2026-11-11). Morgan, in chat: "Ok so chamfer and fillets can be like edge treatments to let's add those to the plan. As for the pocket types I guess we might as well add those too but later after chamfers and fillets".
- **Decision:** two recognition items join the plan, after steps and slots (D-068):
  - **Edge treatments:** chamfers and fillets found from the geometry as features of their own (MFCAD++ class 0 chamfer, 23 round). Today they are only parts of holes and pockets, or names read from Inventor `.ipt` records.
  - **Pocket shapes, after edge treatments:** the four MFCAD++ pocket classes told apart (13 triangular, 14 rectangular, 15 6-sided, 16 circular end); today all four are one "pocket" kind.
- **Why:** Morgan's call, from the MFCAD++ class coverage page (https://claude.ai/artifact/8jC8LKPZBuzrtCJd6vFas7). The order after steps and slots is the builder's default: Morgan set only edge treatments before pocket shapes. Each is planned and specced before it is built (WS-02).
- **Open (Proposed, not decided):** passages (MFCAD++ 2 to 4) are scored today and have no plan.

## D-076 UI fixes (HANDOFF 000a): plan and mock-up approved

- **Status:** Accepted (2026-11-11). Morgan, in chat on the [mock-up](https://claude.ai/artifact/Adh7jrTqHCskfymUbrPkc4): "Ok approved. When you are done merging please open the next slice in a new session to continue". Answers: [round 1](https://claude.ai/artifact/TC6zxWereXxzeVBLG4MtLE), [review](https://claude.ai/artifact/N8rWXXux4n2VWqNhkDzEUB); mock-up `mockups/ui-fixes.html` (built by `mockups/build_ui_fixes.mjs`; screenshots from a throwaway prototype, `mockups/ui-fixes/proto.diff`). PR #46. Not built yet.
- **Decision:** two slices, spec'd with `write-spec` first, A before B.
  - **Slice A, the model:**
    - Mouse like Inventor, plus trackpad moves: left-drag or Shift + middle-drag rotates; middle-drag, right-drag or Shift + left-drag moves; the wheel zooms towards the point under the mouse, forward zooms in. Touch unchanged. Middle-click autoscroll and paste blocked over the model.
    - View buttons Home, Front, Top, Right, Iso at the model's bottom right (no view cube). Views and setups move the camera, never the part.
    - An XYZ axis triad in the model's bottom-left corner, labelled, in the part's own axes (part.frame); no origin marker (Morgan: "just the triad is fine").
    - Pins hide on any camera change (drag, wheel, keys) and come back about 150 ms after the last; still, pins on every finding as now. Lag timed on a named big part on a production build, before and after.
    - One feature at a time: a picked row lights only the finding it shows ("1 of n"); every other face is plain grey at 0.35 opacity (findings and Show OK tints too); ‹ › and ← → step. Nothing picked: as now, Show OK switches unchanged.
    - Keyboard on the focused model: arrows rotate, Shift + arrows move, + and − zoom, H home; ← → step on the open row. The model gets a visible focus ring.
  - **Slice B, the screens:**
    - Examples on the start form and in a top-bar Examples ▾ menu: report_sample, angled_hole_in_pocket, slender_shaft, clean_one_setup (an example sets Process itself).
    - Top bar: Open…, Examples ▾, Export PDF; the file name moves to the status line; "Change file" leaves the overview. One picker takes the STEP and its .ipt.
    - Machine view on Machining: a Part / Machine switch over the model; a setup chip turns the view so the spindle is on top (a lathe part lies across the screen); tapping a tool row (a button, at least 32 px tall) lights the faces it cuts in that setup and shows it in a placeholder spindle (cutter diameter to scale, the rest generic); a lathe part shows a placeholder chuck.
  - **Later:** tool-access check after steps and slots (Morgan, review note), research first; cutaway and dimensions on the part: Soon, after A and B; view cube: no.
- **Slice A built (2026-11-11, branch `ui-fixes-a-model`):** UI_STYLE "Selected finding" and D-017 amended; builder defaults in the spec's S1 section.
- **Amends, when built:** UI_STYLE "Selected finding" (a row lights the finding it shows; other faces grey, not their colours); D-042 ("Change file" leaves the overview; one Open… picker); D-023 (the Machine view turns the view per setup and lights a tool's faces); D-017 (pins hidden while the part moves).
- **Why:** Morgan's 4 photos of the work copy (2026-11-10): rotating was "the hardest currently"; a row with many copies lit the whole part. Round 1 and the review settled each choice; an adversarial review and two fresh mock-up checks ($1.42 measured) found the folded-row cause, the lag on wheel and keys, the arrow-key clash, trackpad moves and the lathe view.

## D-077 Checks follow what changed; Morgan checks each slice by using it

- **Status:** Accepted (2026-11-11). Morgan, in chat, picked option (a), "Both", from: (a) Morgan hand-checks each slice and docs- or mockups-only pushes skip the long checks, with CI still reporting; (b) no rule change.
- **Decision:**
  - A push whose changed files are all Markdown, under `docs/` or under `mockups/` runs only the drift check (`npm run drift`), locally and in CI. Any other push runs `npm run check` as before (D-073 budget unchanged).
  - CI keeps running on every non-draft PR update and `main` push; `scripts/ci-scope.sh` decides light or full inside the one `check` job, so the job always reports. Manual runs, first pushes and unknown bases are full.
  - EDMR (`npm --prefix web run edmr`) before ready only when `web/src/engine/` or the web packages changed.
  - "Testing by what changed" in Morgan's words: "I will observe and use all the changes and note whether or not they work as intended or if I want changes after using them". Their notes are the owner's evidence (VER-07); the automated checks still run on code.
- **Why:** PR #46 changed only docs and mock-ups, yet ran `npm run check` (688 s) and EDMR (442 s) locally, and CI ran the full check, because `ci.yml`'s `paths-ignore` covered only `**/*.md` and `docs/**`. Morgan: "Testing and co should be dependent on what is being changed so we don't have to do all that long testing every time". A workflow-level filter would leave a required check pending; skipping steps inside the job doesn't. Search: the check scripts, `web/src` and `web/e2e` mention `docs/` and `mockups/` only in comments (grep, 2026-11-11); NIST files live in `tests/nist`.

## D-078 UI fixes spec approved; view buttons in file axes; free rotation

- **Status:** Accepted (2026-11-11). Morgan, in chat: "I approve both. Merge in whatever order you deem correct then start the next slice in a new session" (PRs #48 and #49, [approval page](https://claude.ai/artifact/SYV9w7ZZmAXFArnEu7dKvh)). The reply gave no answer to the page's two questions, so both were taken as recommended (WS-02); Morgan then changed question 2 to free rotation.
- **Decision:**
  - The spec `docs/specs/ui-fixes.md` is approved: slice A (the model), then slice B (the screens) after A merges.
  - View buttons (Home, Front, Top, Right, Iso) use the file's axes; the triad uses the part's axes (part.frame, D-076) with a "Part axes" caption (Open question 1, a).
  - The part turns freely (Open question 2, b): Morgan, in chat after the approval: "Oh wait no I want the free rotation not the turn table". Built on three's `ArcballControls` (same package, no new dependency), which replaces today's orbit about the file's Y axis.
  - The page's additions stand: pins return about 0.5 s after a move on big parts (CTC 02); 600 ms after a key; any selection greys the rest, PDF pictures included; stepping frames each finding; view buttons move under the model at 500 px and below.
- **Why:** 41 of 42 sample parts have part axes that differ from the file's (26 with part +Z = file −Z), so Top in part axes would show the underside; the orbit-axis cause was confirmed with three.js 0.187 in Node. Measured before: CTC 02 drag frame gap p90 344-466 ms, pin placement 420 ms a frame.

## D-080 UI fixes slice A approved; merge when ready

- **Numbered D-080:** recorded first as D-079 on the slice A branch; renumbered before merging because the steps and slots branch (PR #50) had already recorded its own D-079.

- **Status:** Accepted (2026-11-11). Morgan, in chat, after the [demo](https://claude.ai/artifact/KzexiP7jM8zQdB3RQox29M): "Ok I approve of the demo. You may merge whenever you are ready to do so" (PR #51).
- **Decision:** slice A (spec `docs/specs/ui-fixes.md` S1) merges as built, with the builder defaults in the spec's S1 "Built" list. The reply named neither open call, so both stand as built (WS-02): the arrow keys move the camera the arrow's way; the drag frame target of 50 ms stays a target, judged on the work copy's GPU (measured here in software WebGL: p90 192-196 ms, page script 0.22-0.27 s per 40-move drag, against 10.9-15.2 s on main). Slice B starts in a new session after the merge.
- **Why:** the demo showed the slice working; `npm run check` passed (662 s), a fresh review's 8 findings were fixed, and each new check failed on main or on a planted bug.

## D-079 Steps and slots planned: directions, depth checks, step tools, target rule

- **Status:** Accepted (2026-11-11). Morgan answered [round 1](https://claude.ai/artifact/2NiJeW3rhomfLQSDeVzDhY) (every question as recommended) and, on the [review page](https://claude.ai/artifact/1DwcDhFZcZVzxisd3QTqcy), in chat: "Do some research on these questions first then go with what you recommend". The research (below) supported each recommendation, so all five review questions are taken as recommended. Amends D-068 (open sides).
- **Decision:**
  - **Scope:** steps (MFCAD++ 8-10, 20-22) and slots with a floor (6, 17-19) on the engine, plan and tools first; a Features group, model colours and a PDF section after the UI fixes (D-076, D-078) merge, with a mock-up first. After this work: V-groove and round-bottom slots (5, 7; scored on their own line meanwhile), the closed-pocket ramp note, T-slot and dovetail names and cutters, keyways on turned parts.
  - **Directions (amends D-068):** a step can be cut from its floor's direction or its wall's direction; both are setup choices. A slot is cut from its floor's direction only; its open ends mean side entry (no ramp), not a setup.
  - **Tools:** a slot roughs with the largest end mill at most `pocket_width_share` (0.75) of its width, then finishes as a pocket does (`pickEndMill`). A step roughs with the largest end mill up to 1 in (nothing limits its width), then finishes with the end mill that fits its corner radius; the rougher is listed only when larger than the finisher (D-029's rule).
  - **Findings:** steps and slots get the deep pocket check (depth over 3× the finishing end mill in aluminium, D-052 passes); a slot deeper than 6× its width is its own medium finding.
  - **Target, fixed before the first run:** on both 500-part MFCAD++ sets, step and slot face recall at least the pockets' recall in the same run, 0 wrong step or slot calls, and holes and pockets no worse than the baseline (first 500 on 2026-11-11: holes 12 of 602 missed, pockets 78 of 3,745 missed, 1 wrong); whole features counted too, on our sets and the UMD parts.
  - **Sizes kept for drawings later:** width, length, depth, end type (open, flat, round), end radius, open ends, directions.
- **Why:** research, 2026-11-11 (pages opened unless marked): access on a 3-axis mill is "from above" along six principal directions (Hubs, how-design-parts-cnc-machining); cutting a slot from its end takes a side-and-face cutter on a horizontal mill (Sandvik, groove-or-slot-milling), which the app doesn't plan; setup planners give a feature several tool approach directions (snippet only). Hubs checks both cavity depth (4× width) and tool length (3-4× diameter), so both checks are usual. Fusion's rest machining roughs with a large tool, then a smaller one clears what it left. Published MFCAD++ face accuracy is 97.79% overall, with the rectangular through slot lowest at 91% (Vidanes et al., CAD 166, 2024). V-grooves take 60° or 90° double-angle cutters (Harvey); half-round grooves take convex radius cutters (Penn Tool) or a ball end mill (inference). Two MFCAD++ classes have no floor (measured on the first 500: class 5, 103 faces in 38 parts; class 7, 78 faces in 47), so a floor-and-wall finder can't find them. The 6× slot depth comes from D-068 (Protolabs); this session's fetch of Protolabs' guide found only a 2 in overall depth limit.

## D-081 Steps and slots spec approved; merge after the two sessions ahead of it

- **Status:** Accepted (2026-11-11). Morgan, in chat: "I agree with all recommendations. Do not run ci until I tell you to. There are two other sessions that need to merge before this one. Once they are merged you can update from main and merge as well." ([approval page](https://claude.ai/artifact/G38mPz8nx9BMCwwYR39hqc); no answers saved on it, so every item is taken as recommended.)
- **Decision:**
  - The spec `docs/specs/steps-slots.md` is approved: S1 steps, S2 slots, S3 screens and PDF after the UI fixes merge.
  - The five additions stand: the guarded parity re-freeze script; crossing slots and slots into a pocket wait; steps and slots only on a floor along a part axis; a step's floor picked by direction order and recorded; UMD parts counted by feature.
  - PR #50 merges after UI fixes slice A (PR #51, merged 2026-11-11) and slice B (PR #53, `ccr-cb7e43ab-n1dv94`; Morgan, in chat: "You merge after pr 53"): then update from main and merge. No CI run until Morgan says so.
- **Why:** Morgan's instruction. The two UI branches change the screens and HANDOFF; merging after them keeps one order of decisions and handoff entries.

## D-082 A UI-only change skips the engine-only checks

- **Status:** Accepted (2026-11-11). Built in PR #54; Morgan: "Approved merge". Morgan, in chat: "Also can you reduce the testing for this?", then picked "Skip engine tests on UI-only (Recommended)" from: skip engine tests on UI-only changes; merge PR #51 on the local pass; both; no change. Numbered D-082 because the steps and slots branch (PR #50) holds D-079 and D-081.
- **Decision:**
  - `scripts/scope.mjs` decides, for `npm run check` locally and in CI. A change is UI-only when every changed file is screen code directly in `web/src/` (not `api.ts`, whose types the engine imports, nor `worker.ts`, which runs it), under `web/e2e/` or `web/public/`, `web/index.html`, Markdown, `docs/` or `mockups/`. Anything else, an empty change, or no base to compare with runs everything.
  - A UI-only change skips the parity run against the frozen key (`npm run parity`) and the timed engine tests (`npm --prefix web run timed`). The drift check, NIST unpack, type check, unit tests, both builds, the browser tests and the timed browser tests still run.
  - Locally the change is the merge base with `origin/main` to the working tree, untracked files included; in CI it is the PR's merge commit (`HEAD^1..HEAD`). A push to `main` and a manual run always run everything, once per merge. `DFMA_FULL=1` forces everything.
  - D-077's light path (docs-only: drift check alone) and its EDMR rule are unchanged.
- **Why:** on PR #51 (screen code only) the parity run took about 134 s and the timed engine tests 100 s of a 695 s check (2026-11-11 local run); neither reads the screen code. The engine reads `web/src/api.ts`, `web/src/grading/`, `web/src/inventor-harness/` and `config/` (grep of `web/src/engine` imports, 2026-11-11), so those are not UI. Checked: 19 cases in `web/src/scope.test.ts` (5 fail with the UI pattern widened to all of `web/src/`), and 8 git cases in a scratch repo (local unstaged, committed, untracked engine file, engine edit, `DFMA_FULL`, push, PR merge commit, empty change).

## D-083 Research comes first in every major module

- **Status:** Accepted (2026-11-11). Morgan, in chat: "It seems like we overlooked some research and I want to make research a standard part of all of these major modules."
- **Decision:** every major module (a plan-map line such as machining, DFMA, Inventor, Vault, assemblies, drawings) starts with a research step before planning: what existing tools do, which open resources (code, data, papers) we can use, with licences and sources. Its result is a page under `docs/research/` linked from HANDOFF's plan map. The planning interview starts from it.
- **Why:** an engineer's review showed the machining side falls short of what Xometry's quoting does, and that research was missed before the machining estimate was built.

## D-084 New direction: better machining and DFMA, Inventor parts, then Autodesk Vault

- **Status:** Accepted as the plan (2026-11-11). Morgan, after the research page: "Ok I will get you those parts later. For now let's make this the plan for next steps here". Earlier, in chat: "from his feedback it is clear we need to improve the machining aspect and the dfma aspect of this tool as well as get it working with just inventor parts then get it ported to work in Autodesk vault preferably." First step: research auto-CAM programs like Xometry's quoting (D-083).
- **Decision:** order of work: (1) research auto-CAM and instant quoting; (2) improve machining; (3) improve DFMA; (4) work from Inventor parts alone; (5) port to Autodesk Vault. Open: what the engineer's feedback said, point by point; whether "just inventor parts" drops STEP input or adds `.ipt` without a STEP (D-035); whether a Vault port keeps the browser app (D-054) or becomes a Vault/Inventor add-in.
- **Morgan, later the same day:** "this tool is really not good at finding all features that need to be machined. From the stock"; and "we really only need it as an aspect of dfm so it doesn't need to generate gcode necessarily but it would be nice to use to make sure tools can access the features they need to cut". Research: [`docs/research/auto-cam.html`](research/auto-cam.html) ([page](https://claude.ai/artifact/UnHEMoUGXWeHiYeQUiWff2)).
- **Machining step, in order (the page's P1-P4, now the plan):** P1 removal volume: stock (bounding box plus a set allowance, or the user's stock) minus part, each region's volume shown, any region no feature explains flagged. P2 reach check: height maps per setup direction offset by each tool's diameter, corner radius, flute length and a simple holder; material left behind reported per tool and direction with its size; checked against OpenCAMLib on the NIST parts. P3 the 17 Xometry checks we lack, as rules with test parts, thread checks and wall distance first. P4 later: time from removal volume (Boothroyd-Dewhurst), checked on the Zenodo 17035762 G-code; FreeCAD Adaptive in WASM only if that falls short. Not planned: Kiri:Moto code, GPL engines, Inventor or Fusion CAM, machine learning.
- **Still to ask before building:** each new runtime dependency (OpenCAMLib, Manifold) separately (SAFE-01); uploading a test part to Xometry (SAFE-01); the stock allowance; the holder shape. Each phase is planned with `planning-interview` before a spec (D-083). Morgan's parts with missed features come later; P1 is tested on them first, then on NIST.
- **Order:** planning P1 and P2 comes before steps and slots S1 (Morgan picked "Machining plan first (Recommended)" over S1 first or both at once), since P1 may change what S1 needs.
- **Why:** an engineer's feedback (not yet written down in the repo).
