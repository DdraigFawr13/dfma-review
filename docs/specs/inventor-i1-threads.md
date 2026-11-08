# Inventor parts I1: threads

- **Status:** Draft (2026-11-08)
- **Planned in:** [round 1 form](https://claude.ai/artifact/UR1pmouDpuSahgVF5v5kbc), [review page](https://claude.ai/artifact/JKC9dFPSgWqzhpq65qzArK), chat 2026-11-08. **Decisions:** D-001, D-005, D-006, D-011, D-031, D-032. Research: [docs/research/inventor.html](../research/inventor.html) sections 0 and 3; spike in [docs/research/inventor-spike/](../research/inventor-spike/README.md).

Every "measured" fact below was measured in this session (2026-11-08) on the 16 NIST `.ipt` files (zips checked against the SHA-256 in [CATALOG](../nist/CATALOG.md) "Native Inventor files"). Every unmeasured one says **Assumption**.

## Problem

Morgan (2026-11-08): "See if there is any way you can get that inventory data for like threads and holes and have it mapped to the part if possible maybe by hole size or position." A STEP file carries the hole's shape, not its thread: NIST CTC 04 models its M12 holes at Ø10.2 mm, STC 10 models its M3 holes at Ø3.0 and FTC 10 at Ø2.459 (measured, research page section 0), so the shape alone can't name a thread. The engineer has the thread in Inventor; the report today can't show it.

## Goals

- Every thread in an uploaded `.ipt` shows its callout, class, thread depth and tap drill on the hole it belongs to, on screen and in the PDF (D-032 "Done").
- Each thread is in exactly one of three states: **matched**; **disagrees** (with the gap in mm, shown as a finding); **not mapped** (shown as our limit, never as a finding) (D-032).
- NIST, through the test harness: CTC 04 4 of 4 matched (M12x1.75, 6H, depth 25 mm), FTC 10 6 of 6 matched (M3x0.5, 6H, depth 6 mm), STC 10 at least 5 of 6 matched; the other 13 files have no threads and report none.
- A pair that is not the same part in the same frame is refused with the reason; so is any part type in D-032's refuse list that I1 can detect.

## Non-goals

- Hole type, designed sizes, patterns and mirrors from the `.ipt` (I2). Fillets and chamfers (I3). Shape, material or part number from the `.ipt`; `.iam`; folders of parts (later phases, D-032).
- Any rotation or shift search in the app (D-032). It lives in the NIST tests only.
- Reading or copying InventorLoader's source (GPL, D-031). Its output may be used as a cross-check in a scratch folder.
- Any Autodesk software, cloud or paid SDK (D-031). Any AI at runtime (D-001).

## Journeys and checks

Each check fails at the starting commit (cd9da8a): the app has no `.ipt` path, no `tests/inventor/`, no `inventor` key in the response.

### J1 Upload a matching pair

- **Given** an `.ipt` and the STEP Inventor exported from it
- **When** the engineer picks both files and runs Analyse
- **Then** the review shows the part from the STEP as today, plus a Threads panel listing each thread with its state; a matched thread's hole shows its callout. **Check:** S1 `tests/inventor/local_pairs.py` on Morgan's work pairs (counts match `tests/inventor/local_pairs.toml`); S2 `tests/e2e/test_threads.py::test_threads_panel` (demo pair, see S2).

### J2 Pair refused

- **Given** an `.ipt` and a STEP that are not the same part in the same frame (any NIST pair: other CAD systems wrote NIST's STEP, so face counts differ in all 16 pairs, e.g. CTC 04 `.ipt` 368 faces, STEP 483; measured)
- **When** both are uploaded
- **Then** the app answers 422 with `These files don't match: <reason>. Export the STEP again from this .ipt and upload both.` and no review. **Check:** `tests/service/test_inventor_api.py::test_nist_pair_refused` (CTC 04 pair; reason names both face counts).

### J3 Part type refused

- **Given** a sheet-metal `.ipt` (NIST CTC 03 and FTC 09, both releases: measured, see Design)
- **When** it is uploaded with any STEP
- **Then** 422 with `This Inventor part is a sheet-metal part. Only plain single-body parts can be read for now.` **Check:** `tests/inventor/test_part_type.py::test_sheet_metal_refused[ctc_03, ftc_09_2021, ftc_09_2024]`.

### J4 Threads read and mapped (NIST, test harness)

- **Given** each NIST `.ipt` and its NIST AP242 STEP, lined up by the test-only registration
- **When** the mapping runs
- **Then** CTC 04: 4 matched, each `M12x1.75`, class `6H`, depth 25.0 mm, tap drill 10.25 mm; FTC 10 (2021): 6 matched `M3x0.5` `6H` depth 6.0; STC 10 (`INV_nist_ftc_10_asme1_2024.ipt`): 5 matched and 1 disagrees with an axis gap of 0.10 mm (±0.01); the 10 other plain parts: 0 threads. **Check:** `tests/inventor/test_nist_threads.py`.

### J5 Report and PDF

- **Given** an analysed pair with threads
- **When** Export PDF runs
- **Then** the summary page has a Threads section with one line per thread (hole id, callout, class, depth, tap drill, state) and its feature name in small print; a disagreeing thread also has its own finding page. **Check:** `tests/e2e/test_pdf.py::test_pdf_threads` (pypdf text).

### J6 Hostile or broken files

- **Given** a file named `.ipt` that is not a compound file, one whose stream inflates past the cap, one with a record count or pointer that runs off the data, and one with no `asmheader`
- **When** each is uploaded with a STEP
- **Then** each gets its 422 message (Design, Messages) within the analysis time limit, and the worker stays up. **Check:** `tests/inventor/test_reader_safety.py` (files built by the test, never committed binaries from outside).

## Decisions

- Our own reader with olefile, threads mapped by position (D-031).
- Upload `.ipt` + STEP; shape from the STEP; exact frame within 0.01 mm, no rotation search; stale-pair check; refuse non-plain part types; three states; feature names in small print; NIST `.ipt` committed with checksums; work pairs off the repo (D-032).
- olefile 0.47 (conda-forge, BSD-2-Clause) is a runtime dependency; the reader runs in the analysis worker under its time limit, caps every inflated stream and treats every count and pointer as untrusted (D-031).
- Proposed in this spec, for Morgan (Open questions 1-3): the stale-pair check compares corners instead of volume; feature names may slip to I2; four refuse-list types wait for samples.

## Alternatives rejected

- **Map threads by hole size**: rejected because the modelled diameter differs by system (10.2, 3.0 and 2.459 mm for the same kinds of threads, measured) and several holes share a size. Fails on any part with two holes of one size.
- **Rotation search in the app** (as the spike): rejected by D-032; it can line up a wrong or stale pair and hide that the STEP is not this `.ipt`. Fails on symmetric parts, where several rotations fit.
- **Shape from the `.ipt` now**: rejected by D-031 ("right after feature reader works"); our ACIS decoder reads records, not geometry a kernel can mesh.
- **Volume in the stale-pair check** (D-032's wording): not measurable here. The `.ipt` stores no volume: no property in the 7 property sets of any of the 16 files holds a floating-point value (every value read with olefile `getproperties` and tested for `float`; none found), and computing a volume from ACIS surfaces needs a geometry kernel we don't have. Replaced by the corner check (Open question 1).
- **InventorLoader as the reader**: rejected by D-031 (GPL, reads no threads, rebuilt 28 of 117 faces on CTC 01).

## Risks

- The `.ipt` format is undocumented and changes by release (ACIS 226.0.3 in 2021, 229.x in 2024; measured). Inventor 2023 and 2025 are untested → the local harness on Morgan's pairs (S1) before I1 is called done; an unknown record tag refuses the file with its ACIS version instead of guessing.
- **Assumption:** a STEP exported by Inventor from the same `.ipt` has the `.ipt`'s frame, the same corners within 0.01 mm and the same face count. Not checked: no such pair exists in the repo or NIST. → First thing S1's harness checks on Morgan's pairs; if it fails, S1 stops and the check goes back to Morgan.
- Refusals for Model States, iParts, derived and Content Center parts have no positive sample → Open question 3.
- A hostile file → caps, untrusted counts, worker time limit (J6).

## Design

### Parts

- `service/dfma/inventor/` (new package):
  - `ole.py`: open the compound file with `olefile.OleFileIO`; refuse unless `olefile.isOleFile` is true. List streams with `listdir(streams=True, storages=False)`; read with `openstream(...).read()`. Inflate `RSeStorage/B*` streams with `zlib.decompressobj().decompress(data[k:], cap)` from the first `x^` (offset `k`) and refuse when `unconsumed_tail` is non-empty (over the cap). Caps (Assumption, sized from NIST: largest inflated stream 2,536,828 bytes): 64 MiB per stream, 256 MiB per file.
  - `sab.py`: the ACIS binary record splitter, rewritten from the spike's `sab.py` with every length, count and pointer bounds-checked (a value that runs past the data or a pointer outside the record list raises `ReadError`, never `IndexError`). Lengths are cm; every public value is mm.
  - `part.py`: `read_ipt(path) -> IptPart` with `saved_with` (Design Tracking Properties, property 67, text up to the first NUL, e.g. `2024.1 (Build 281209000, 209)`), `acis_version` (the `asmheader` string, e.g. `229.6.0.65535`), `subtype` (property 31), `model_state_names`, `solid_bodies`, `corners_mm` (every `point` record of the main model), `face_count`, `threads`. The main model is the inflated stream with the most `face` records (spike rule; **Assumption**, every NIST file has 2 models; the stale-pair check catches a wrong pick).
  - `threads.py`: thread records → `Thread`; `map_threads(threads, holes, faces, transform=None)`; `transform` exists for the NIST tests only, and the app never passes it.
  - `pair.py`: `check_pair(ipt, step_part)` → raises `ReadError(MSG_PAIR_MISMATCH.format(reason=...))`.
- `service/dfma/analyze.py`: `analyze(path, name, process, material, ipt_path=None, ipt_name=None)`; with an `.ipt`: read it, check part type, `check_pair`, find holes as today, `map_threads`, add `inventor` to the response and a `thread` key to each matched or disagreeing hole; disagreeing threads add findings through rule `thread_mismatch`.
- `service/dfma/worker.py` and `app.py`: the job tuple and `run_analysis` carry the two optional `.ipt` arguments; `/api/analyze` takes an optional `ipt` file field. Each file is limited to `MAX_UPLOAD_BYTES` (50 MB, `MSG_TOO_LARGE`); `UploadLimit` allows two files plus the envelope. Both temp files are deleted in `finally` (APP-01).
- `service/dfma/rules/thread_mismatch.py`: one finding per disagreeing thread, severity `medium`, `measured` = the largest gap in mm, `limit` = its tolerance (0.01 mm), `threshold_source` = `"D-032: .ipt and STEP must agree"`, suggestion: export the STEP again or check the thread in Inventor.
- `service/dfma/settings.py`: the messages below. `environment.yml`: `olefile=0.47`. `README.md` "Packages and licences": olefile, BSD-2-Clause.
- `web/`: the upload input accepts `.step,.stp,.ipt` (any case) with `multiple`; `api.ts` sends `ipt` when one is picked; a Threads panel (`findings.ts`, `renderThreads`); the report section (`report.ts`). Both are screen changes: S1 and S2 start with a `ui-mockups` mock-up approved by Morgan.

### Thread records (measured on the bytes; field meanings marked)

- Inventor 2021: a record named `NMx_Thread_Entity-NamingMatching-attrib`. Inventor 2024: `ATTRIB_CUSTOM-attrib` whose first string is `INV_NMX_THREAD_TAG`.
- Its pointer list's 4th entry (index 3, counting the leading `-1`) is the threaded `face`. Its first two points are the thread's ends; their distance is the thread depth (CTC 04: 25.0 mm; FTC 10: 6.0 mm). The last vector is the axis (equals the end-to-end direction on CTC 04).
- Strings after the tag, in order (CTC 04): `12`, `M12x1.75` (designation), `ANSI Metric M Profile` (standard), `''`, `''`, `6H` (class), `1.75` (pitch), then `12`, `12.453`, `10.863`, `11.063`, `10.106`, `10.441`, `10.25`. Reading of the last seven (**inference**, from ISO 6H M12 values the numbers match): major min/max, pitch-diameter min/max, minor min/max, tap drill. The report labels the last one "tap drill (as stored in the .ipt)".

### Mapping (all in mm, in the STEP's frame)

For each thread, the candidate holes are the hole features (`features.holes`) whose cylinder axis is parallel to the thread's (|dot| ≥ 0.9999) and whose axis passes within the hole's radius of the thread's start point. Among them, the one whose axial span overlaps the thread's span most is its hole.

- **matched:** axis gap ≤ 0.01 mm, hole diameter between the thread's minor min − 0.01 and major min + 0.01, and thread depth ≤ hole depth + 0.01.
- **disagrees:** a hole was found but one of those fails. Each failed measure is listed with its gap (e.g. `axis 0.10 mm off the hole's axis`, `hole Ø3.50 is 0.50 mm over the thread's major diameter`, `thread 8.00 deep in a 6.00 hole`).
- **not mapped:** no candidate hole, or the threaded face is not a cylinder; the row says which.

Several threads may share a hole (a hole's `thread` is a list of thread ids).

### Pair check (before mapping; first failure wins, in this order)

1. STEP: more than one solid (`part.ignored_solids > 0`) → part-type message, `multi-body part`.
2. Face count: `.ipt` main model `face` records vs STEP faces. Reason: `the STEP has 483 faces, the .ipt 368` (CTC 04, measured).
3. Corners: counts equal, and every `.ipt` corner within 0.01 mm of a STEP vertex (`TopTools_IndexedMapOfShape` of `TopAbs_VERTEX` via `topexp.MapShapes`, `BRep_Tool.Pnt`; prototyped) and every STEP vertex within 0.01 mm of an `.ipt` corner. Reason format: `<n> of <m> corners of the .ipt are more than 0.01 mm from the STEP (worst <x> mm)`, or the two counts when they differ.
4. Bounding box of the corners, each side within 0.01 mm. (Implied by 3; kept because D-032 names it, and it gives the clearer reason when the frame is shifted.)

### Part types (checked before the pair)

- **Sheet metal** (measured): Design Tracking Properties (stream `\x05PypkizqiUjudbposAayal4qdGf`) property 31 is `9C464203-9BAE-11D3-8BAD-0060B0CE6BB4`, beside the text `Sheet Metal`, in CTC 03 and FTC 09 (2021, 2024); the 12 plain parts hold `4D29B490-49B2-11D0-93C3-7E0706000000`. Any value other than the plain-part one is refused (sheet-metal GUID: `sheet-metal part`; else `part of a type this tool can't read yet`).
- **Multi-body:** refused when the STEP holds more than one solid, or the `.ipt` main model holds more than one solid body. A body counts as a solid unless all its faces are planes and it has fewer than 4 (no closed solid has fewer than 4 plane faces). Measured: FTC 06 and FTC 10 (2021) each hold 2 extra bodies of one plane face; they are not refused.
- **Model States:** the `UFRxDoc` stream names the states (`[Primary]` in the 2024 files, `Master` in FTC 07, last saved in Inventor 2022; measured). Refused when it names more than one. **Assumption:** the layout of the list; no file with two states exists here (Open question 3).
- **iParts, derived, Content Center:** no marker found yet and no sample (Open question 3). Until a sample proves a marker, the response's `assumptions` says `iParts, derived and Content Center parts are not detected yet; the thread data of such a part may not match its STEP.`

### Messages (`settings.py`)

- `MSG_IPT_NOT_IPT` = `This is not an Inventor part file (.ipt) this tool can read`
- `MSG_IPT_NEEDS_STEP` = `Add the STEP export of this part: the shape is read from the STEP` (web, before upload; also 422 if the API gets an `.ipt` as `file`)
- `MSG_IPT_TYPE` = `This Inventor part is a {kind}. Only plain single-body parts can be read for now.`
- `MSG_PAIR_MISMATCH` = `These files don't match: {reason}. Export the STEP again from this .ipt and upload both.`
- `MSG_IPT_TOO_BIG` = `This .ipt holds more data than this tool will unpack`
- `MSG_IPT_NO_MODEL` = `No 3D model found inside this .ipt`
- `MSG_IPT_FORMAT` = `This .ipt uses a format this tool can't read yet (ACIS {version})`

### Response (added keys)

```
"inventor": {
  "name": "part.ipt", "saved_with": "2024.1 (Build 281209000, 209)", "acis_version": "229.6.0.65535",
  "checks": {"faces": [215, 215], "corners": [299, 299], "worst_corner_gap_mm": 0.0},
  "threads": [{"id": "thread-1", "designation": "M3x0.5", "class": "6H", "standard": "ANSI Metric M Profile",
               "pitch_mm": 0.5, "depth_mm": 6.0, "tap_drill_mm": 2.5, "minor_mm": [2.459, 2.599], "major_mm": [3.0, 3.172],
               "start": [..], "end": [..], "axis": [..], "state": "matched" | "disagrees" | "not_mapped",
               "hole": "hole-36" | null, "gaps": [{"what": "axis", "mm": 0.10, "text": "..."}], "reason": null | "...",
               "feature_name": null | "Hole3"}]
}
```

Hole features gain `"thread": ["thread-1", ...]`. Without an `.ipt` the response is unchanged (no `inventor` key).

### Tests and files

- `tests/inventor/files/`: the 16 NIST `.ipt` files, byte for byte; `tests/inventor/SOURCE.md`: both zip URLs and SHA-256, each file's SHA-256 (from CATALOG), public-domain note. `tests/inventor/test_files.py` checks every checksum. 13,755,904 bytes in all (CATALOG).
- `tests/inventor/register.py`: the spike's registration (24 axis rotations + shift, vertex votes on a 0.1 mm grid, cylinder-axis hits), tests only.
- `tests/inventor/local_pairs.py` + `local_pairs.toml`: runs the app path (no registration) on pairs in `tests/inventor/.local/` (git-ignored); the toml holds per pair only the SHA-256 of both files, the Inventor release and the expected counts (threads matched / disagrees / not mapped). Exits 0 with "no local pairs" when the folder is empty, so CI skips it by design. Morgan's files never enter git (D-006, D-032).
- `docs/nist/CATALOG.md` "Native Inventor files": now copied, with the test folder.

## Slices

### S1 Pair upload, checks and refusals

- **Morgan tries:** in the app, pick `INV_nist_ctc_04_asme1_2021.ipt` with its NIST STEP → "These files don't match: the STEP has 483 faces, the .ipt 368…"; pick CTC 03's `.ipt` → the sheet-metal message; pick only an `.ipt` → "Add the STEP export…"; then a work pair → it opens as today (threads come in S2). Mock-up of the upload first.
- **Checks that fail now:** J2, J3, J6; `test_files.py`; `local_pairs.py` exits 0 on an empty folder; the corner and face counts of the 16 files (`test_part_type.py::test_counts`: e.g. CTC 04 368 faces, 506 corners; FTC 10 2024 215, 299).
- **Files:** `service/dfma/inventor/{ole,sab,part,pair}.py`; `analyze.py`, `worker.py`, `app.py`, `settings.py` (messages, limits); `environment.yml`, `README.md`; `web/index.html`, `web/src/api.ts`, `web/src/main.ts` (two files, the client-side message); `tests/inventor/` (files, SOURCE, checksums, `test_part_type.py`, `test_reader_safety.py`, `local_pairs.*`); `tests/service/test_inventor_api.py`; `.gitignore` (`tests/inventor/.local/`); CATALOG.
- **Then:** run `local_pairs.py` on Morgan's pairs as soon as they arrive (Drive share, as MFCAD++). The frame assumption holds when every pair passes the pair check; if one fails, stop and report its reason to Morgan.
- **Waits on:** Morgan's answers to Open questions 1 and 3.

### S2 Threads mapped and shown

- **Morgan tries:** the demo page opens NIST CTC 04 with its `.ipt` (lined up by the test harness, and labelled so: the app itself refuses this pair) and shows 4 threads `M12x1.75 - 6H`, 25 mm deep, on the 4 holes; STC 10 shows one thread as a finding, 0.10 mm off its hole's axis. In the app, a work pair shows its threads. Export PDF shows the Threads section. Mock-up of the Threads panel and PDF section first.
- **Checks that fail now:** J1 (`test_threads_panel`), J4, J5; `tests/service/test_rules.py::test_thread_mismatch`.
- **Files:** `service/dfma/inventor/threads.py`, `rules/thread_mismatch.py`, `rules/__init__.py`, `analyze.py`; `web/src/findings.ts` (`renderThreads`, select a row → its hole), `report.ts` (Threads section), `format.ts`; `scripts/make_demo.py` (a demo entry built through `tests/inventor/register.py`); `tests/inventor/test_nist_threads.py`, `tests/e2e/test_threads.py`, `tests/e2e/test_pdf.py`; `local_pairs.toml` expected thread counts.
- **Waits on:** S1.

### S3 Feature names

- **Morgan tries:** each thread row and its PDF line show the Inventor feature name in small print (e.g. `Hole3`), or `name not read`.
- **Checks that fail now:** `tests/inventor/test_feature_names.py`: every NIST thread names a feature that exists in the file's feature list; the answer key is InventorLoader's output on CTC 04, FTC 10 and STC 10, run in a scratch FreeCAD env and saved as expected names (its source not read, D-031).
- **Design gap:** the link from a thread record to its feature name is not decoded. The thread's ints (`43`, `4302`, `2437` …) and its two linked records (`NMx_Feature_Orientation`, `NMx_Matched_Entity`) carry no value found next to a feature name (probed 2026-11-08). The slice starts with a time-boxed decode (half a session). If it doesn't prove out against the answer key, the slice ships `feature_name: null` shown as `name not read`, and names move to I2 (Open question 2).
- **Waits on:** S2.

## Verification

- Every push: `python scripts/check.py` in the dfma env, with `DFMA_CHROMIUM` set.
- End to end: J1 on Morgan's work pairs through `tests/inventor/local_pairs.py` (2023, 2024, 2025), plus Morgan's own run of one pair on their PC (VER-07).

## Open questions

1. **Volume → corners.** D-032 says the pair must agree in volume, bounding box and face count. The `.ipt` stores no volume and we can't compute one without a geometry kernel. Recommended: compare every corner within 0.01 mm instead (stricter: a moved hole moves corners; a same-volume edit can't pass). Or: keep volume by computing it from the STEP only (doesn't compare anything).
2. **Feature names may slip to I2** if the decode fails (S3). Recommended: accept that fallback now so S3 needs no new decision.
3. **Samples for the refuse list.** Sheet metal and multi-body are detected from measured markers. Model States (more than one), iParts, derived and Content Center parts have no sample here. Recommended: Morgan adds one of each that the company uses to the work set (stays off the repo); S1 builds each refusal from its sample. Types the company doesn't use stay as the assumption line above. Note: NIST CTC 03 and FTC 09 are sheet-metal parts in Inventor, so the app will refuse them, as D-032 says.
