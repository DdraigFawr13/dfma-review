# Review in steps: the D-042 screen

- **Status:** Draft
- **Planned in:** UI direction rounds 1-3 ([round 3](https://claude.ai/artifact/V5jsL9TkRoY7HDiPJM4DS8); answers in `docs/research/ui-direction/README.md`; round 3's `ui3` collection: "Approved with the changes I wrote", "The cost section isn't showing any total but otherwise go with what you recommend"). **Decisions:** D-005, D-009, D-012, D-014, D-015, D-016, D-017, D-023, D-024, D-036, D-040, D-042, D-043, D-044.

The approved frames are `mockups/ui-direction/round3-frames.html` (ids `r3-start`, `r3-loading`, `r3-error`, `r3-overview`, `r3-features`, `r3-passed`, `r3-mach`, `r3-cost`, `r3-report`, `r3-overview-900`, `r3-features-900`), all drawn on `tests/parts/report_sample.step`, Milling, Aluminum 6061. They are this spec's mock-ups (D-044): a slice builds to them, and only what they don't show gets a new mock-up in the new design.

## Problem

Morgan, 2026-11-09: the UI "is getting increasingly convoluted and complicated with too much description and unclear labeling". Measured on `report_sample.step` at 1280 × 900: the side column holds 4 panels each scrolling in its own box, 1 of 8 findings in view; 910 words with every panel open; the same title and fix line 4 times (one per corner); a 7-entry legend; code names (`em-0.250`, `config/tools.toml`) on screen; the verdict line lists every rule run. Morgan wants "a quick way to walk through the dfma steps of like a design review and observe the issues that come up for each step".

## Goals

- A review reads as five steps across the top, Part · Features · Machining · Cost · Report, with Back / Next at the foot of each (D-042).
- On `report_sample.step` the Features step shows all 8 findings as 4 rows without scrolling at 1280 × 900 (frame `r3-features`: Sharp corner ×4, Deep hole ×2, Drill size, Deep pocket).
- Every severity is a word and a shape (▲ Fix, ◆ Review), in the app and the PDF; step tabs show shape + number.
- Every demo from S1 on is built from this screen (D-044).

## Non-goals

- No new checks, rules, thresholds or numbers: every value on screen is one the service gives today.
- No change to the look (Drawing office tokens, fonts, colours: UI_STYLE "Tokens").
- No time or dollars in Cost (still scores only).
- No phone layout below 900 px beyond what UI_STYLE already targets.

## Journeys and checks

### J1 Start, read, overview (Part step)

- **Given** the app with no part
- **When** Morgan picks `report_sample.step`
- **Then** the Part step shows the start form (frame `r3-start`), then "Analysing report_sample.step…" over the model (`r3-loading`), then the overview (`r3-overview`): file name, size, faces, units, process and material, "Change file"; one card per step with its counts (Features: Fix 4, Review 4, OK 9, "2 holes, 1 pocket, 4 corners and 9 walls checked"; Machining: 3-axis mill, 2 setups, 4 tool loads; Cost: 7 drivers and the two biggest; Report: "PDF of all of the above"), each with "Open ›"; "Fix first" with the top Fix row. A refused file shows "Error: …" inside the start form (`r3-error`). **Check:** `tests/e2e/test_steps.py::test_part_step`, `::test_refused_in_form`.

### J2 Walk the steps

- **Given** the overview
- **When** Morgan taps a step tab, "Open ›", Next or Back
- **Then** that step shows, the tab is marked current (`aria-current="step"`), and the Features tab reads ▲ 4 ◆ 4. Keyboard: tabs are buttons in order. **Check:** `test_steps.py::test_walk`.

### J3 Features step rows

- **Given** the Features step on `report_sample.step`
- **Then** chips Issues 8 · Passed 9 · All, Issues on; rows as `r3-features`: word, short title, ×n, the F range, one plain sentence, then the check's name and its limit source. Tapping a row selects all its findings' faces; the detail shows "F4 · corner-1 · 1 of 4", Measured, and the suggestion, with ‹ › to step through the group. Passed (`r3-passed`) groups OK features the same way ("Walls ×9"). "Show OK" switches for Holes, Pockets, Corners, Walls sit at the foot of the model on this step only (defaults as D-015, D-016: walls off); the legend is gone. Pins read "F4 FIX". **Check:** `test_steps.py::test_feature_rows`, `::test_show_ok`; `tests/service/test_rows.py`.

### J4 Machining, Cost, Report

- **Then** Machining as `r3-mach`: machine, stock, tool loads, "Why 2" line, each setup's numbered operations and "Issues here" rows; setup chips on the model. Cost as `r3-cost`: one row per driver, count × weight = score, the findings that feed it, and "Total score 14.0" (the sum of the driver scores). Report as `r3-report`: what the PDF holds, the rules run, Assumptions (n) folded, Export PDF. **Check:** `test_steps.py::test_machining`, `::test_cost_total`, `::test_report_step`.

### J5 PDF words

- **Then** the PDF's summary says "8 findings: 4 Fix, 4 Review." and each finding page heads "F4 · FIX". **Check:** `tests/e2e/test_pdf.py` (updated assertions), `web/src/report.test.ts`.

### J6 With an .ipt

- **Then** Threads, Hole features and (after #27) Fillets and chamfers are groups in the Features step, with the rows and wording D-036, D-040 and D-043 approved. **Check:** `tests/e2e/test_threads.py`, `test_hole_features.py`, `test_blends.py` moved to the new places.

## Decisions

- The step screen, its words and layout are D-042; this spec decides only how to build it.
- Severity data stays `high` / `medium` in the API; only the words change on screen and in the PDF (D-042).
- Short titles and sentences come from the service, one pair per rule case (Design "Rows"); the web groups and shows them.
- Mock-ups in the new design; demos from the built screen (D-044).

## Alternatives rejected

- **Write the short titles and sentences in the web code:** the measured value, limit and unit already live in each rule, and the PDF needs the same words; two copies would drift. It would fail when a rule changes its limit wording.
- **Restyle the current panels in place:** keeps 4 scrolling boxes in one column, the problem Morgan named. Rejected in rounds 1-2 (layouts C and E cut).
- **One slice for the whole screen:** too big for one session; 36 browser tests move at once.
- **Base the build on PR #27's branch:** the screen would wait for Morgan's work-pair check (from 2026-11-12). Instead the build cuts from main; whichever of the two PRs merges second merges the other in and places Fillets and chamfers as a Features group.

## Risks

- **36 browser tests assume today's layout** (9 files). Each slice moves the tests it touches to the new selectors and keeps every behaviour they assert (VER-01); a test of the verdict line becomes a test of the overview counts. → per-slice list under Slices.
- **Grouped sentences** read wrongly for some rule with odd values. → each rule's `group_sentence` is unit-tested on 1, 2 and 4 findings (`test_rows.py`).
- **The 3D view at 460 px of side panel** leaves the model narrower. → frames were drawn at that size and approved.
- **Demo size:** the demo page holds every part's mesh (5.4 MB after D-036's fix; 16 MB limit). The new screen adds code, not meshes. Assumption: under 6 MB; measured each slice.

## Design

### Parts

- `web/index.html`: a step bar (`nav#steps`, five buttons `data-testid="step-part"` … `"step-report"`), one `section` per step (`data-testid="step-<name>"`, only the current one shown), the model beside them (side panel 460 px at 1280 px; under the model at 900 px and below), Back / Next at the foot of each step (`data-testid="step-back"`, `"step-next"`).
- `web/src/main.ts`: the current step in one variable; `showStep(name)`; after a part is read, the Part step shows the overview. "Change file" shows the start form again with the last choices kept.
- `web/src/steps.ts` (new): `renderOverview`, `renderFeatureRows`, `renderMachining`, `renderCost`, `renderReport`; reuses `findings.ts` helpers (`renderPlan`, `planWhy`, `driverLine`, `renderThreads`, `renderHoleFeatures`).
- `web/src/viewer.ts`: pin label is the F id and the severity word ("F4 FIX"); Show OK per kind as today's `setShowChecked`.
- `service/dfma/rules/*.py`: every finding and pass gains `short`, `sentence` and `group_sentence` (Design "Rows").
- `web/src/report.ts`: severity words Fix / Review; summary "n findings: a Fix, b Review."; the rest unchanged.
- `docs/UI_STYLE.md`: rewritten for the step screen in S3 (it describes the built screen until then, D-042).

### Rows

Each finding and each pass gets, from its rule:

- `short`: 2-3 words, fixed per rule case (table below).
- `sentence`: one plain sentence for this finding, with its value and limit, units as D-005 ("0.260 in isn't a standard drill. Nearest is 0.266 in (17/64).").
- `group_sentence`: the same sentence for several findings, with `{values}` where the values go ("{values} the diameter deep. Over 6.0× needs peck drilling."), plus `value` ("9.6×").

Grouping (web): findings fold into one row when `rule`, `short`, `severity`, `limit` and `group_sentence` are equal. One finding: its `sentence`. Several: `group_sentence` with the distinct `value`s joined ("9.6× and 7.2×"; four or more: "from 9.6× to 6.4×"); when every finding has the same `sentence`, that sentence. The F range: "F4–F7" when consecutive, else "F1 F3". The row's foot: the check's name (`RULE_NAMES`, capitalised, + " check") and its limit source ("limit is an estimate" when `threshold_source` is `estimate`; "drill list, within 0.0005 in" for the drill list; else the source as given).

Short titles (proposed; Morgan approves with the spec):

| Rule | Case | short |
|---|---|---|
| corner_radius | high (no radius) | Sharp corner |
| corner_radius | medium | Small corner radius |
| hole_depth | | Deep hole |
| hole_size | | Drill size |
| pocket_depth | | Deep pocket |
| thin_wall | | Thin wall |
| undercut | | Undercut |
| access | | Angled feature |
| looks_turned | | Looks turned |
| turn_axis | | No turning axis |
| turn_slender | | Slender part |
| turn_offaxis | | Off the turning axis |
| bore_depth | | Deep bore |
| thread_mismatch | | Thread vs hole |
| hole_mismatch | | Hole feature vs hole |
| blend_mismatch (after #27) | | Fillet vs face |

Passes use the kind's plural in the group ("Walls ×9") and the rule's pass sentence ("Thinnest is 0.500 in. At least 0.030 in is needed.").

### Words and marks

Fix (▲, `--high`) for `high`, Review (◆, `--medium`) for `medium`, OK (no mark, `--low`) for passes. In the PDF the words only (its fonts lack ▲ ◆; `ascii()` would print "?").

## Slices

### S1 Steps and the Part step

- **Morgan tries:** the first demo in the new design: pick a part, see the overview, walk the five steps with Next, Back and the tabs. Features, Machining, Cost and Report hold today's panels, moved as they are; Cost adds its total.
- **Checks that fail now:** J1, J2; `test_steps.py::test_cost_total`.
- **Files:** `web/index.html` (step bar, sections, form inside Part, verdict line removed), `web/src/main.ts` (steps, overview, Change file), `web/src/steps.ts` (`renderOverview`, `renderCost` total), `web/src/style.css` (step bar, 460 px panel, 900 px stacking), `tests/e2e/test_steps.py` (new); moved: `test_view.py`, `test_upload_pair.py`, `test_findings.py` (verdict tests become overview counts), `scripts/make_demo.py` (part bar still works), status page.
- **Waits on:** none.

### S2 Features step rows

- **First:** a mock-up of the Threads, Hole features and Fillets and chamfers groups inside the Features step (the frames don't show them), in the new design, approved by Morgan.
- **Morgan tries:** the Features step on `report_sample.step` (4 rows), a group's detail stepping 1 of 4, Passed, Show OK switches, pins "F4 FIX"; a NIST pair with its Inventor groups.
- **Checks that fail now:** J3, J6; `test_rows.py`.
- **Files:** every `service/dfma/rules/*.py` (`short`, `sentence`, `group_sentence`, `value`), `tests/service/test_rows.py` (each rule on 1, 2 and 4 findings), `web/src/api.ts`, `web/src/steps.ts` (`renderFeatureRows`), `web/src/viewer.ts` (pin words), `web/index.html` (legend out, Show OK switches), moved: `test_findings.py`, `test_passed_and_setups.py` (Passed part), `test_threads.py`, `test_hole_features.py`, `test_blends.py` (when #27 is in).
- **Waits on:** S1.

### S3 Machining, Report and the PDF

- **Morgan tries:** Machining with "Issues here" per setup and setup chips on the model; Report; the PDF with Fix / Review.
- **Checks that fail now:** J4 (Machining, Report), J5.
- **Files:** `web/src/steps.ts` (`renderMachining`, `renderReport`), `web/src/report.ts` (words), `web/src/report.test.ts`, moved: `test_plan_panel.py`, `test_lathe_plan.py`, `test_passed_and_setups.py` (setups part), `test_pdf.py`; `docs/UI_STYLE.md` rewritten for the step screen (checklist item 9: word and shape); DECISIONS amendments D-012, D-014, D-017, D-023 marked as D-042 says.
- **Waits on:** S2.

## Verification

- Every push: `python scripts/check.py` in the dfma env with `DFMA_CHROMIUM` set.
- End to end: each slice's demo (`scripts/make_demo.py`) and status page with screenshots at 1280 and 900 px beside the matching frame (UI_STYLE checklist item 7); Morgan's device check of the demo on the phone.

## Open questions

- Short titles (Design "Rows" table): approve or change with the spec.
