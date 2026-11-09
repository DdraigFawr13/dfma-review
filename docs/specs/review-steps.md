# Review in steps: the D-042 screen

- **Status:** Draft
- **Planned in:** UI direction rounds 1-3 ([round 3](https://claude.ai/artifact/V5jsL9TkRoY7HDiPJM4DS8); answers in `docs/research/ui-direction/README.md`; round 3's `ui3` collection: "Approved with the changes I wrote", "The cost section isn't showing any total but otherwise go with what you recommend"). **Decisions:** D-005, D-009, D-012, D-014, D-015, D-016, D-017, D-023, D-024, D-036, D-040, D-042, D-043, D-044.

The approved frames are `mockups/ui-direction/round3-frames.html` (ids `r3-start`, `r3-loading`, `r3-error`, `r3-overview`, `r3-features`, `r3-passed`, `r3-mach`, `r3-cost`, `r3-report`, `r3-overview-900`, `r3-features-900`), all drawn on `tests/parts/report_sample.step`, Milling, Aluminum 6061. They are this spec's mock-ups (D-044): a slice builds to them, and only what they don't show gets a new mock-up in the new design.

## Problem

Morgan, 2026-11-09: the UI "is getting increasingly convoluted and complicated with too much description and unclear labeling". Measured on `report_sample.step` at 1280 × 900 (`docs/research/ui-direction/README.md` "What's wrong today"): 4 panels in the side column each scrolling in its own box, 1 of 8 findings in view; 910 words with every panel open; the same title and fix line 4 times; a 7-entry legend; code names (`em-0.250`, `config/tools.toml`) on screen; the verdict line lists every rule run. Morgan wants "a quick way to walk through the dfma steps of like a design review and observe the issues that come up for each step".

## Goals

- A review reads as five steps across the top, Part · Features · Machining · Cost · Report, with Back / Next at the foot of each (D-042).
- On `report_sample.step` the Features step shows its 8 findings as 4 rows (frame `r3-features`: Sharp corner ×4, Deep hole ×2, Drill size, Deep pocket), all in view at 1280 × 900 (`test_steps.py::test_rows_in_view` checks each row's box is inside the viewport).
- Every severity is a word, and on screen also a shape (▲ Fix, ◆ Review); step tabs show shape + number.
- Every demo from S1 on is built from this screen (D-044).

## Non-goals

- No new checks or thresholds: every measured value and limit on screen is one the service gives today. New: the row wording (Design "Rows") and the cost total (a sum of today's driver scores).
- No change to the look (UI_STYLE "Tokens": colours, fonts).
- No time or dollars in Cost: the total is a score and says so.
- No layout below 900 px beyond what UI_STYLE targets today.

## Journeys and checks

Tests named here are new unless marked "moved"; each fails at the starting commit because the step bar (`data-testid="step-part"`), the `rows` key or the new words don't exist there.

### J1 Start, read, overview (Part step)

- **Given** the app with no part. **When** Morgan picks `report_sample.step` (Milling, Aluminum 6061).
- **Then** the start form (`r3-start`), "Analysing report_sample.step…" over the model (`r3-loading`), then the overview (`r3-overview`): file name, "4.000 × 2.500 × 2.000 in · 14 faces · inch", "Milling · Aluminum 6061", "Change file"; cards Features ("Fix 4 · Review 4 · OK 9", "2 holes, 1 pocket, 4 corners and 9 walls checked"), Machining ("3-axis mill · 2 setups · 4 tool loads"), Cost ("7 drivers", the two biggest with "(weights are estimates)"), Report ("PDF of all of the above"), each with "Open ›"; "Fix first" with the first Fix row (in S1, before rows exist: the first high finding's word, id and title). A refused file: "Error: …" inside the start form (`r3-error`). **Check:** `tests/e2e/test_steps.py::test_part_step`, `::test_refused_in_form`.

### J2 Walk the steps

- **When** Morgan taps a tab, "Open ›", Next or Back. **Then** that step shows, its tab has `aria-current="step"`, focus moves to the step's heading; the Features tab reads "▲ 4 ◆ 4"; Back is hidden on Part, Next on Report. **Check:** `test_steps.py::test_walk`.

### J3 Features step rows

- **Then** chips "Issues 8 · Passed 9 · All", Issues on; rows as `r3-features` (word + shape, short title, ×n, F range, one sentence, the check and its limit source). Tapping a row selects all its findings' faces and opens the detail: "F4 · corner-1 · 1 of 4", Measured, the suggestion, ‹ › to step through the group (each step selects that finding alone). Passed (`r3-passed`) groups OK features ("Walls ×9"); a passed row's detail keeps its checks, why and math (D-023). Show OK switches (Holes, Pockets, Corners, Walls, each with its colour swatch and label) at the foot of the model on this step only, defaults as today (walls off); the 7-entry legend is gone. The selected pin reads "F4 FIX"; other pins stay ringed only (D-017). **Check:** `test_steps.py::test_feature_rows`, `::test_rows_in_view`, `::test_show_ok`; `tests/service/test_rows.py`.

### J4 Machining

- **Then** as `r3-mach`: machine, stock, tool loads, "Why 2" with `planWhy`'s line, each setup's numbered operations and "Issues here" (the rows whose finding's feature is in one of that setup's operations); setup chips on the model select a setup as today's `setup:` selection does. **Check:** `test_steps.py::test_machining`.

### J5 Cost and Report

- **Then** Cost as `r3-cost`: per driver, count × weight = score and its F ids; "Total score 14.0" with "Score is count × weight. Every weight is an estimate. No time or dollars yet." Report as `r3-report`: what the PDF holds, "Rules run" as plain names, "Assumptions (n)" folded (n = `assumptions` length), Export PDF. The PDF's summary reads "8 findings: 4 Fix, 4 Review." and a finding page heads "F4 · FIX". **Check:** `test_steps.py::test_cost_total`, `::test_report_step`; `tests/e2e/test_pdf.py` (moved; its "HIGH"/"MEDIUM" assertions become "FIX"/"REVIEW"); `web/src/report.test.ts`.

### J6 With an .ipt

- **Then** Threads, Hole features and Fillets and chamfers are groups at the foot of the Features step, with the rows and words D-036, D-040, D-043 approved. **Check:** moved `tests/e2e/test_threads.py`, `test_hole_features.py`, and `test_blends.py` once #27 is merged.

### J7 Empty and other states

- No findings: no "Fix first"; the Features card reads "No findings. Every feature checked passed its rules." No Fix rows: "Fix first" is replaced by "Review first" with the first Review row. No cost drivers: Cost reads "None: one setup and no tools to load." (today's PDF wording) and no total. Turning: the Machining card reads the plan's machine name ("Lathe"), setups and tool loads; no `machine`: "No machine plan for this part." **Check:** `test_steps.py::test_empty_states` (fixtures edited from report_sample's response), `::test_turning_overview` (`tests/parts/` lathe part as `test_lathe_plan.py` uses).

## Decisions

- The screen, words and layout are D-042; this spec decides how to build it.
- Severity stays `high` / `medium` in the API; the words change on screen and in the PDF (D-042).
- Row wording and grouping live in one service module, `rows.py`, used by the screen and the PDF (Design "Rows").
- The cost total is computed in the service (D-001: every number traces to the service).
- Mock-ups in the new design; demos from the built screen (D-044).

## Alternatives rejected

- **Row wording in the web code:** the measured value, limit and unit live in each rule, and the PDF needs the same words; two copies would drift.
- **Wording in each of the 16 rule files:** 16 places to keep consistent and test; one table in `rows.py` keyed by rule and case is shorter and tested in one file.
- **Restyle today's panels in place:** keeps 4 scrolling boxes, the problem Morgan named (layouts C and E were cut in round 1).
- **One slice for the whole screen:** 36 browser tests in 9 files move at once; too big for one session.
- **Build on PR #27's branch:** the screen would wait for Morgan's work-pair check (from 2026-11-12, D-041). The build cuts from main; whichever PR merges second merges the other in and places Fillets and chamfers as a Features group.

## Risks

- **36 browser tests in 9 files assume today's layout.** Each slice moves the tests it touches to new selectors and keeps every behaviour they assert (VER-01); verdict-line tests become overview tests.
- **Grouped sentences read wrongly for odd values.** `test_rows.py` runs every rule case on 1, 2 and 4 findings, and on the NIST and EDMR parts already in `tests/service`.
- **Accessibility at 200% text** (APP-02): five tabs with counts in 460 px. The tabs wrap to two lines rather than scroll; checked at 1280 px with 200% text in `test_steps.py::test_walk`.
- **Demo size:** 16 MB page limit; the demo is 5.4 MB of meshes today (D-036 entry in the archive). The screen adds code, not meshes; measured each slice.

## Design

### Parts

- `service/dfma/rows.py` (new): `ROWS` table (rule, case → short, check, sentence and group templates), `limit_text(source)`, `finding_rows(findings) -> list[Row]`, `passed_rows(features, passed) -> list[Row]`. Called at the end of `analyze`; the response gains `rows`, `passed_rows`, and `cost_total`, and each cost driver gains `findings` (its F ids, by its `rules`).
- `web/index.html`: `nav#steps` with five buttons (`data-testid="step-part"`, `"step-features"`, `"step-machining"`, `"step-cost"`, `"step-report"`), one `section` per step (`data-testid="page-part"` …), each with an `h2` (`tabindex="-1"`), Back / Next (`data-testid="step-back"`, `"step-next"`) in a bar fixed to the step's foot; the model beside them (side panel 460 px at 1280 px; under the model at `max-width: 900px`). The start form, `#error` (`data-testid="error-message"`) and the privacy line live in `page-part`; `#status` stays one line under the step bar for messages after a part is read (PDF failure). Overview: `data-testid="overview"`, cards `overview-features` … `overview-report`, each "Open ›" `open-<step>`, `fix-first`, `change-file`.
- `web/src/main.ts`: `step` variable and `showStep(name)` (hides other sections, sets `aria-current`, focuses the `h2`). Not in the URL (browser Back leaves the app, as today). "Change file" shows the start form; process and material keep their values, the file inputs clear, `run` is bumped (an analysis in flight is dropped) and the selection clears. Changing process or material on the start form with a file chosen re-runs, as today.
- `web/src/steps.ts` (new): `renderOverview`, `renderRows` (Features), `renderMachining`, `renderCost`, `renderReport`; reuses `findings.ts` (`renderPlan`, `planWhy`, `driverLine`, `renderThreads`, `renderHoleFeatures`, `meta`).
- `web/src/viewer.ts`: the selected pin's word becomes Fix / Review; OK tints show only while the Features step is shown.
- `web/src/report.ts`: words Fix / Review in the summary and finding heads; finding pages unchanged otherwise.
- `docs/UI_STYLE.md`: rewritten for the step screen in S3.

### Rows

`Row` (JSON): `{"id": "row-1", "rule": "corner_radius", "severity": "high" | "medium" | "ok", "short": "Sharp corner", "count": 4, "findings": ["F4", "F5", "F6", "F7"], "range": "F4–F7", "sentence": "Inside corners have no radius. Needs 0.031 in (1/32) or more, or EDM.", "check": "Corner radius check", "limit": "limit is an estimate", "features": ["corner-1", …]}`. Passed rows: `severity "ok"`, `findings: []`, `kind` ("wall"), `count` features.

- **Grouping:** findings with the same rule, case, severity and `limit` (the finding's own `limit` field, a number) form one row, in F-id order; rows in order of their first F id, Fix rows first. Passed rows group by kind and rule.
- **Sentence:** one finding: the case's `one` template with its value. Several: if every finding's sentence is the same, that sentence; else the `many` template with the distinct values, high to low, joined "a and b" (2), "a, b and c" (3), "from a to z" (4 or more).
- **Range:** "F4–F7" when the ids run without a gap, else ids with spaces ("F1 F3").
- **Limit source** (`limit_text`): `estimate` → "limit is an estimate"; `assumption` → "limit is an assumption"; `spec` → "limit from the spec"; `drill list in config/tools.toml` → "drill list, within 0.0005 in"; `D-032: the .ipt and STEP must agree` → "the .ipt and STEP must agree within 0.01 mm"; another `D-0nn…` → "limit agreed in D-0nn"; anything else: the text as given, and `test_rows.py` fails on any source not in this list.

Short titles and check names (proposed; Morgan approves them with the spec):

| Rule | Case | short | check |
|---|---|---|---|
| corner_radius | high (no radius) | Sharp corner | Corner radius check |
| corner_radius | medium | Small corner radius | Corner radius check |
| hole_depth | | Deep hole | Hole depth check |
| hole_size | | Drill size | Hole size check |
| pocket_depth | | Deep pocket | Pocket depth check |
| thin_wall | | Thin wall | Thin wall check |
| undercut | | Undercut | Undercut check |
| access | | Angled feature | Access check |
| looks_turned | | Looks turned | Process check |
| turn_axis | | No turning axis | Turning axis check |
| turn_slender | | Slender part | Length to diameter check |
| turn_offaxis | | Off the turning axis | Turning axis check |
| bore_depth | | Deep bore | Bore depth check |
| thread_mismatch | | Thread vs hole | .ipt check |
| hole_mismatch | | Hole feature vs hole | .ipt check |
| blend_mismatch (after #27) | | Fillet vs face | .ipt check |

Each rule case's `one` and `many` sentences are written in `rows.py` from today's title and suggestion; the four in the frames are fixed: Sharp corner "Inside corners have no radius. Needs {limit} or more, or EDM."; Deep hole "{values} the diameter deep. Over {limit} needs peck drilling."; Drill size "{value} isn't a standard drill. Nearest is {nearest}."; Deep pocket "Depth is {value} the end mill that fits. Over {limit} needs a long tool."

### Words and marks

Fix (▲, `--high`) for `high`, Review (◆, `--medium`) for `medium`, OK (no mark, `--low`) for passes. The PDF prints the words only (its fonts lack ▲ ◆).

## Slices

### S1 Steps, Part, Cost and Report

- **Morgan tries:** the first demo in the new design: pick a part, see the overview, walk the five steps; Fix / Review words everywhere, including the PDF. Features and Machining hold today's lists, moved as they are (findings list with the new words; legend still under the model; plan panel); Cost has its total; Report is final.
- **Checks that fail now:** J1, J2, J5, J7; `test_rows.py::test_cost_total_and_driver_findings`.
- **Files:** `service/dfma/drivers.py` (`findings` per driver), `analyze.py` (`cost_total`), `web/index.html`, `web/src/main.ts`, `web/src/steps.ts` (`renderOverview`, `renderCost`, `renderReport`), `web/src/findings.ts` (severity words; `checkedLine` without "Rules run"), `web/src/report.ts` and `report.test.ts` (words), `web/src/style.css`, `tests/e2e/test_steps.py`; moved: `test_view.py`, `test_upload_pair.py`, `test_findings.py`, `test_pdf.py`, `test_plan_panel.py`, `test_lathe_plan.py` (selectors only); `scripts/make_demo.py` (still works; demo rebuilt); status page.
- **Waits on:** none.

### S2 Features rows

- **First:** a mock-up of the Threads, Hole features and Fillets and chamfers groups inside the Features step (the frames don't show them): `mockups/review-steps-features.html`, in the new design, approved by Morgan.
- **Morgan tries:** report_sample's Features step (4 rows, detail 1 of 4, Passed with math, Show OK switches, "F4 FIX" pin); a NIST pair with its groups.
- **Checks that fail now:** J3, J6; `test_rows.py`.
- **Files:** `service/dfma/rows.py`, `analyze.py`, `tests/service/test_rows.py`, `web/src/api.ts` (`Row`, `rows`, `passed_rows`, `cost_total`), `web/src/steps.ts` (`renderRows`), `web/src/viewer.ts`, `web/index.html` (legend out, Show OK switches keep `data-testid` `show-checked`, `show-checked-pockets`, `show-checked-corners`, `show-checked-walls`); moved: `test_findings.py`, `test_passed_and_setups.py` (its Passed tests), `test_threads.py`, `test_hole_features.py`, `test_blends.py` if #27 is in.
- **Waits on:** S1.

### S3 Machining and the style guide

- **Morgan tries:** Machining with "Issues here" per setup and setup chips on the model; the final demo.
- **Checks that fail now:** J4.
- **Files:** `web/src/steps.ts` (`renderMachining`), `web/src/viewer.ts` (setup chips); moved: `test_plan_panel.py`, `test_lathe_plan.py`, `test_passed_and_setups.py` (its setup tests); `docs/UI_STYLE.md` rewritten (checklist item 9: word and shape); D-012, D-014, D-017, D-023 each gain "Amended by D-042 (built <date>)" with the changed lines.
- **Waits on:** S2.

## Verification

- Every push: `python scripts/check.py` in the dfma env with `DFMA_CHROMIUM` set.
- End to end: each slice's demo (`scripts/make_demo.py`) and status page with screenshots at 1280 and 900 px beside the matching frame (UI_STYLE checklist item 7); Morgan's check of the demo on the phone.

## Open questions

- Short titles and check names (Design "Rows" table): approve or change with the spec.
