# Inventor parts I1: threads

- **Status:** Approved 2026-11-08 (D-033)
- **Planned in:** [round 1 form](https://claude.ai/artifact/UR1pmouDpuSahgVF5v5kbc), [review page](https://claude.ai/artifact/JKC9dFPSgWqzhpq65qzArK), chat 2026-11-08. **Decisions:** D-001, D-005, D-006, D-011, D-031, D-032, D-033. Research: [docs/research/inventor.html](../research/inventor.html) sections 0 and 3; spike in [docs/research/inventor-spike/](../research/inventor-spike/README.md).

Every "measured" fact below was measured in this session (2026-11-08) on the 16 NIST `.ipt` files (zips checked against the SHA-256 in [CATALOG](../nist/CATALOG.md) "Native Inventor files"). Every unmeasured one says **Assumption**.

## Words used here

- **ACIS / SAB:** the 3D-model format inside an `.ipt` (Inventor's kernel came from ACIS); SAB is its binary form. A **record** is one tagged entry (`face`, `vertex`, `point`, an attribute …); a **model** is one inflated `RSeStorage/B*` stream that starts with an `asmheader` record. The **main model** is the one with the most `face` records.
- **Property sets:** OLE streams of named values. **Design Tracking Properties** is stream `\x05PypkizqiUjudbposAayal4qdGf`; its property 31 is the document subtype, 67 the Inventor build that saved the file. **`UFRxDoc`** is a plain stream that names the file's Model States.
- **Model States** (Inventor 2022 on): several versions of one part in one file. **iPart:** a table-driven family of parts. **Derived part:** a part whose body comes from another file. **Content Center:** Autodesk's library of standard parts (bolts, nuts).
- **Corner:** a `vertex` record's point in the `.ipt`; a `TopAbs_VERTEX` in the STEP.

## Problem

Morgan (2026-11-08): "See if there is any way you can get that inventory data for like threads and holes and have it mapped to the part if possible maybe by hole size or position." A STEP file carries the hole's shape, not its thread: NIST CTC 04 models its M12 holes at Ø10.2 mm, STC 10 models its M3 holes at Ø3.0 and FTC 10 at Ø2.459 (measured), so the shape alone can't name a thread. The engineer has the thread in Inventor; the report today can't show it.

## Goals

- Every thread in an uploaded `.ipt` shows its callout, class, thread depth and tap drill on the hole it belongs to, on screen and in the PDF (D-032 "Done").
- Each thread is in exactly one of three states: **matched**; **disagrees** (with the gap in mm, shown as a finding); **not mapped** (shown as our limit, never as a finding) (D-032).
- NIST, through the test harness: CTC 04 4 matched (M12x1.75, 6H, depth 25 mm); FTC 10 (2021) 6 matched (M3x0.5, 6H, depth 6 mm); STC 10 5 matched and 1 disagrees by 0.10 mm (D-032's "at least 5 of 6"). The 10 other plain files report no threads; the 3 sheet-metal files are refused.
- A pair that is not the same part in the same frame is refused with the reason; so is each part type in D-032's refuse list that I1 can detect (Open question 3).

The 16 files: CTC 01-05 and FTC 06-11 saved by Inventor 2021 (`INV_nist_<case>_asme1_2021.ipt`; FTC 07 was last saved by 2022), and STC 06-10 saved by Inventor 2024, which NIST names `INV_nist_ftc_<NN>_asme1_2024.ipt`. "STC 10" is `INV_nist_ftc_10_asme1_2024.ipt`; its STEP is `nist_stc_10_asme1_ap242-e2.stp`. Each 2021 file pairs with `nist_<case>_asme1_ap242*.stp` (FTC 08: the `-e2` file) in `tests/nist/NIST-PMI-STEP-Files.zip`.

## Non-goals

- Hole type, designed sizes, patterns and mirrors from the `.ipt` (I2). Fillets and chamfers (I3). Shape, material or part number from the `.ipt`; `.iam`; folders of parts (later phases, D-032).
- Any rotation or shift search in the app (D-032). It lives in the test harness only (also used to build the demo, labelled as such).
- Reading or copying InventorLoader's source (GPL, D-031). Its output may be used as a cross-check in a scratch folder.
- Any Autodesk software, cloud or paid SDK (D-031). Any AI at runtime (D-001). Threads as cost drivers (`config/drivers.toml` is unchanged).

## Journeys and checks

All Python tests go in `tests/service/` (the folder `scripts/check.py` runs); browser tests in `tests/e2e/` with the `e2e` marker. Each check below fails at the starting commit (cd9da8a) unless marked **guard**.

### J1 Upload a matching pair

- **Given** an `.ipt` and the STEP Inventor exported from it
- **When** the engineer picks both and the analysis runs
- **Then** the review shows the part from the STEP as today, plus a Threads panel listing each thread with its state; a matched thread's hole shows its callout. **Check:** S1: `tests/inventor/local_pairs.py` on Morgan's work pairs prints `pair check: pass` for each (manual; its output goes in HANDOFF as evidence, VER-07). S2: the same script's thread counts match `local_pairs.toml`; `tests/e2e/test_threads.py::test_threads_panel`.

### J2 Pair refused

- **Given** a `.ipt` and a STEP that are not the same part in the same frame. Every NIST pair is one: other CAD systems wrote NIST's STEP, and face counts differ in all 16 (CTC 04: `.ipt` 368, STEP 483; measured).
- **When** both are uploaded
- **Then** 422 with `These files don't match: the STEP has 483 faces, the .ipt 368. Export the STEP again from this .ipt and upload both.` **Check:** `tests/service/test_inventor_api.py::test_nist_pair_refused`. `tests/service/test_inventor_pair.py` covers each reason on built inputs: the STEP `tests/parts/box_through_hole.step` against an `IptPart` whose corners and face count come from that STEP (passes), shifted 0.02 mm (bounding-box reason), one corner moved 0.02 mm (corner reason), one face fewer (face reason).

### J3 Part type refused

- **Given** a sheet-metal `.ipt` (NIST CTC 03, FTC 09 2021 and 2024; measured)
- **When** it is uploaded with its NIST STEP
- **Then** 422 with `This Inventor part is a sheet-metal part. Only plain single-body parts can be read for now.` (the part type is checked before the pair). **Check:** `tests/service/test_inventor_part.py::test_sheet_metal_refused` (3 files); `::test_surface_bodies_not_multibody` (FTC 06 2021, FTC 10 2021 pass the body rule); `::test_counts` (faces and corners of all 16, e.g. CTC 04 368 and 506; FTC 07 2021 210 corners from 346 `point` records).

### J4 Threads read and mapped (NIST, test harness)

- **Given** each NIST `.ipt` and its STEP, lined up by `tests/inventor/register.py`
- **When** `inventor.attach(...)` runs with that transform and without the pair check
- **Then** the Goals' NIST results: CTC 04 4 matched, each `M12x1.75`, class `6H`, depth 25.0 mm, tap drill 10.25 mm; FTC 10 (2021) 6 matched, `M3x0.5`, `6H`, depth 6.0, tap drill 2.5; STC 10 5 matched and 1 `disagrees` with one gap `axis` of 0.10 mm (±0.01); 10 plain files: 0 threads. **Check:** `tests/service/test_inventor_threads.py`.

### J5 Report and PDF

- **Given** an analysed pair with threads
- **When** Export PDF runs
- **Then** the summary page has a Threads section with one line per thread (hole id, callout, class, depth, tap drill, state); a disagreeing thread also has its finding page. Feature names join each line in S3. **Check:** `tests/e2e/test_pdf.py::test_pdf_threads` (pypdf text, on the fixture below).

### J6 Hostile or broken files

- **Given** files built by the test (no outside binaries): a `.ipt` that is not a compound file; one whose `B` stream inflates past the cap; one whose record length or pointer runs off the data; one with no `asmheader`
- **When** each is uploaded with `box_through_hole.step`
- **Then** respectively `MSG_IPT_NOT_IPT`, `MSG_IPT_TOO_BIG`, `MSG_IPT_FORMAT` (version `unknown` when no header was read), `MSG_IPT_NO_MODEL`, each as 422 within `TIME_LIMIT_S`, and the next normal upload still succeeds (the worker is up). **Check:** `tests/service/test_inventor_safety.py`. A worker crash (out of memory) stays the existing 500 `MSG_FAILED` path.
- **Guard:** without an `.ipt` the response has no `inventor` key (`test_inventor_api.py::test_no_ipt_unchanged`; passes now, must keep passing).

## Decisions

- Our own reader with olefile, threads mapped by position (D-031).
- Upload `.ipt` + STEP; shape from the STEP; exact frame within 0.01 mm, no rotation search; stale-pair check; refuse non-plain part types; three states; feature names in small print; NIST `.ipt` committed with checksums; work pairs off the repo (D-032).
- olefile 0.47 (conda-forge, BSD-2-Clause) is a runtime dependency; the reader runs in the analysis worker under its time limit, caps every inflated stream and treats every count and pointer as untrusted (D-031).
- Corners, face count and bounding box instead of volume; feature names move to I2 if S3's decode fails; Model States (2+), iParts, derived and Content Center parts keep the assumption line until a sample turns up (D-033, amends D-032).

## Alternatives rejected

- **Map threads by hole size**: rejected because the modelled diameter differs by system (10.2, 3.0 and 2.459 mm for the same kinds of threads, measured) and several holes share a size. Fails on any part with two holes of one size.
- **Rotation search in the app** (as the spike): rejected by D-032; it can line up a wrong or stale pair. Fails on symmetric parts, where several rotations fit.
- **Shape from the `.ipt` now**: rejected by D-031; our decoder reads records, not geometry a kernel can mesh.
- **Volume in the stale-pair check** (D-032's wording): not measurable. No value in the 7 property sets of the 16 files is a float (every value read with olefile `getproperties`), and none of the 58 distinct ACIS record names, nor any string in a record, mentions mass, volume or density (searched all models of all 16 files). Computing a volume from ACIS surfaces needs a kernel we don't have. Open question 1.
- **Bounding box and face count only** (critic's simpler option): rejected as the recommendation because a moved or resized hole keeps both; offered to Morgan in Open question 1.
- **InventorLoader as the reader**: rejected by D-031 (GPL, reads no threads, rebuilt 28 of 117 faces on CTC 01).

## Risks

- The format is undocumented and changes by release (ACIS 226.0.3 in 2021, 229.6.0 in 2024; measured). Inventor 2023 and 2025 are untested → Morgan's pairs, one per release, before I1 is called done. An unknown record tag refuses the file (`MSG_IPT_FORMAT`) instead of guessing.
- **Assumption:** a STEP exported by Inventor from the same `.ipt` has its frame, the same corners within 0.01 mm and the same face count. Not checked: no such pair exists here. → S1 starts by measuring it on at least one of Morgan's pairs (Waits on). If it fails, S1 stops and the rule goes back to Morgan.
- Refusals for Model States, iParts, derived and Content Center parts have no sample → Open question 3. Until then such a part passes, and only the pair check stands between it and a wrong thread.
- The thread string layout is measured on M12 and M3 (2021 and 2024); inch threads (UNC/UNF) are **assumed** to use the same layout. A record that doesn't fit gives that thread `not_mapped` with the reason `thread record not understood`, never a refusal of the part.
- A hostile file → J6. olefile parses the whole compound file before our caps apply; the upload limit (50 MB per file) bounds that. `sab.py` reads each model in one pass; pointers are only followed one step, so the work is linear in the data.

## Design

### Parts

- `service/dfma/inventor/` (new package). Every failure raises `dfma.errors.ReadError` with a message from `settings.py` (no subclasses). `__init__.py` exports `read_ipt`, `check_part_type`, `check_pair`, `attach`.
  - `ole.py`: refuse unless `olefile.isOleFile(path)`; open with `olefile.OleFileIO`; list with `listdir(streams=True, storages=False)`; read with `openstream(name).read()`; properties with `getproperties(name)`. Inflate each `RSeStorage/B*` stream from its first `x^` with `zlib.decompressobj().decompress(data[k:], cap)`; a non-empty `unconsumed_tail` means over the cap. Caps: 64 MiB per stream, 256 MiB per file (largest measured: 2,536,828 bytes).
  - `sab.py`: the record splitter, rewritten from the spike's `sab.py` (tags as its docstring), with every length and count bounds-checked against the data, every pointer checked to lie in the record list before use, and an unknown tag raising `MSG_IPT_FORMAT`. cm in, mm out.
  - `part.py`: `read_ipt(path) -> IptPart`, fields `saved_with` (property 67 text up to the first NUL), `acis_version`, `subtype` (property 31), `model_state_names`, `solid_bodies`, `corners_mm` (the `point` record of each `vertex` record of the main model, ×10), `face_count`; S2 adds `threads`.
  - `pair.py`: `check_part_type(ipt, step_part)` and `check_pair(ipt, step_part)`; orders below.
  - `threads.py` (S2): thread records → `Thread`; `map_threads(threads, holes, faces, transform=None)`, where `holes` are hole and bore features and `faces` is `part.faces`; `transform` is `(rows, shift)`, a 3×3 rotation as 3 lists and a shift in mm, applied to every `.ipt` point and vector first.
  - `attach(result, step_part, holes, ipt, transform=None, check=True)`: runs `check_part_type`, then `check_pair` when `check`, then (S2) `map_threads`; adds `result["inventor"]`, each hole's `thread` list and `summary["inventor_threads"]`. The app always calls it with `transform=None, check=True`; only `tests/inventor/` passes the others.
- `analyze.py`: `analyze(path, name, process, material, ipt_path=None, ipt_name=None)`. With an `.ipt`, `read_ipt` runs right after `read_step`; the part-type check comes first; mapping runs on the final hole list (after `split_bores` in Turning, on `hole_list + bores` with their final ids); rules run after, so `thread_mismatch` sees `summary["inventor_threads"]`.
- `worker.py`: the job tuple becomes `(path, name, process, material, ipt_path, ipt_name)`; `Worker.run` and `run_analysis` take `ipt_path=None, ipt_name=None`.
- `app.py`: `/api/analyze` takes an optional `ipt: UploadFile | None = File(None)`. `UploadLimit` gets `limit=2 * MAX_UPLOAD_BYTES` (two files, plus its envelope); after copying, each temp file over `MAX_UPLOAD_BYTES` returns 413 `MSG_TOO_LARGE`. The `.ipt` temp file has suffix `.ipt`. If `file` is an OLE compound file (`olefile.isOleFile`), the answer is 422 `MSG_IPT_NEEDS_STEP`. Both temp files are deleted in `finally` (APP-01).
- `rules/thread_mismatch.py`, listed in `rules/__init__.py`: one finding per `disagrees` thread; severity `medium`; `unit` `in`; `measured` = the largest gap in inches, `limit` = `settings.PAIR_TOL_MM` (0.01 mm, source `D-032`, the one value both the pair check and the mapping use) in inches; title names the thread, the hole and each gap in mm and the possible cause (e.g. `M3x0.5 thread is 0.10 mm off the axis of hole-38: the part or an old STEP export differs from the .ipt`); `threshold_source` `D-032: the .ipt and STEP must agree`; suggestion `Export the STEP again from this .ipt, or check this thread in Inventor.`; `feature` = the hole id; `faces` = the hole's faces. `web/src/findings.ts` `RULE_NAMES`: `thread_mismatch: "thread vs hole"`.
- `settings.py`: the messages below. `environment.yml`: `olefile=0.47`. `README.md` "Packages and licences": olefile 0.47, BSD-2-Clause.
- `web/` (D-034, mock-up option A): `#file` stays the STEP field; a new `#ipt` field (`data-testid="upload-ipt"`, label `Inventor part (.ipt), optional`, accept `.ipt,.IPT`). An `.ipt` in the STEP field shows `MSG_IPT_NEEDS_STEP` with no upload; an `.ipt` with no STEP yet shows `Now choose the STEP file that Inventor exported from this .ipt.` and waits. `api.ts` sends `ipt`; `Analysis` gains `inventor?` and hole `thread?`. S1 shows the `.ipt` name and `saved_with` under the part name; S2 adds `renderThreads` in `findings.ts` (rows `data-testid="thread-row"`, panel `data-testid="threads-panel"`, tapping a row selects its hole) and the report section. Placement and look of both come from the approved mock-ups (`ui-mockups`), made at the start of S1 and S2.

### Thread records (measured)

- Inventor 2021: record `NMx_Thread_Entity-NamingMatching-attrib`. Inventor 2024: `ATTRIB_CUSTOM-attrib` whose first string is `INV_NMX_THREAD_TAG`.
- Its pointer values in order are `-1`, then two linked attributes, then the threaded `face` (the 4th value, index 3; CTC 04: `-1, 4438, 3783, 3456`, record 3456 is a `face`). The distance between its first two points is the thread depth (CTC 04 25.0 mm; FTC 10 and STC 10 6.0 mm); its second-last vector is the thread's start and its last the axis (corrected in S2: "Builder defaults, S2 re-check").
- Its strings after the tag, in order (CTC 04; FTC 10 and STC 10 the same layout): `12` (nominal size), `M12x1.75` (designation), `ANSI Metric M Profile` (standard), `''`, `''`, `6H` (class), `1.75` (pitch), then `12`, `12.453`, `10.863`, `11.063`, `10.106`, `10.441`, `10.25`. Reading of the last seven (**inference**: the M12 and M3 numbers match ISO 6H limits): major min, major max, pitch min, pitch max, minor min, minor max, tap drill. Shown as "tap drill (as stored in the .ipt)".
- Thread ids `thread-1` … in record order in the main model.

### Mapping (mm, raw STEP coordinates as `read_step` gives them)

Each hole or bore feature's axis line and axial span come from its faces for which `features._cylinder(i, faces[i], tapers=True)` returns a `Cyl` (`origin`, `axis`, `radius`, and `lo`, `hi` along the axis): the face whose `lo..hi` overlaps the thread's span most, so a counterbore's wider face is not used for the threaded part. Its depth is `dims_mm["max_depth"]` when present, else `dims_mm["depth"]`. Each segment of a stepped hole is its own feature.

- **Gap to a hole:** the larger of the distances from the thread's two end points to the hole's axis line.
- **Candidates:** holes whose axis is parallel to the thread's (|dot| ≥ 0.9999) and whose gap is at most the hole's radius. The hole is the candidate whose `lo..hi` overlaps the thread's span (its ends projected on the hole's axis) most; ties go to the lowest hole id.
- **matched:** gap ≤ 0.01 mm; hole diameter from minor min − 0.01 to major min + 0.01 (covers holes modelled at the minor, tap-drill or major diameter: FTC 10 2.459, CTC 04 10.2, STC 10 3.0, measured); thread depth ≤ hole depth + 0.01, or the hole is through.
- **disagrees:** a hole was found but one of those fails. `gaps` lists each failure as `{"what": "axis" | "diameter" | "depth", "mm": <gap>, "text": ...}`, e.g. `0.10 mm off the hole's axis`, `hole Ø3.50 is 0.50 mm over the thread's major diameter`, `thread 8.00 deep in a 6.00 hole`.
- **not mapped:** no candidate (`reason`: `no hole on this thread's axis`); the threaded face is convex, so the thread is on a shaft (`external thread: not on a hole`); the threaded face is a cone (`tapered thread: not supported yet`); another face type (`the threaded face is not a cylinder`); or the record didn't parse or its limits are not in order (major min ≤ major max, pitch min ≤ pitch max, minor min ≤ minor max, minor max < major min; else `thread record not understood`).

Several threads may share a hole: a hole's `thread` is a list of thread ids.

### Checks before mapping (first failure wins)

`check_part_type`:
1. **Sheet metal** (measured): property 31 is `9C464203-9BAE-11D3-8BAD-0060B0CE6BB4`, stored beside the text `Sheet Metal`, in CTC 03 and FTC 09 (2021, 2024); the 13 others hold `4D29B490-49B2-11D0-93C3-7E0706000000`. Sheet-metal GUID → `sheet-metal part`; any other value but the plain-part one → `part of a type this tool can't read yet`.
2. **Model States:** more than one name in `UFRxDoc` → `part with Model States`. Measured: one name in every file that has one (`[Primary]` in the 2024 files, `Master` in FTC 07). **Assumption:** the list layout, until a two-state sample (Open question 3).
3. **Multi-body:** the STEP holds more than one solid (`part.ignored_solids > 0`), or the `.ipt` main model holds more than one solid body. A body counts as solid unless all its faces are planes and it has fewer than 4 (no closed solid has fewer than 4 plane faces). Measured: FTC 06 and FTC 10 (2021) each hold 2 extra one-plane bodies; they pass. → `multi-body part`.

`check_pair` (in the order a builder can observe each reason):
1. **Face count:** `.ipt` main model `face` records vs STEP faces. Reason `the STEP has <s> faces, the .ipt <i>`.
2. **Bounding box** of the corners, each side within 0.01 mm. Reason `the parts' outer corners differ by up to <x> mm`.
3. **Corners:** counts equal (reason `the .ipt has <i> corners, the STEP <s>`), then every corner of each within 0.01 mm of a corner of the other, looked up in 0.01 mm grid cells with their neighbours (reason `<n> of <m> corners of the .ipt are more than 0.01 mm from the STEP (worst <x> mm)`). STEP corners come from `topexp.MapShapes(solid, TopAbs_VERTEX, map)` and `BRep_Tool.Pnt` (prototyped on `box_through_hole.step`: 10 corners).

`result["inventor"]["checks"]` = `{"faces": [ipt, step], "corners": [ipt, step], "worst_corner_gap_mm": x}`.

### Messages (`settings.py`)

- `MSG_IPT_NOT_IPT` = `This is not an Inventor part file (.ipt) this tool can read`
- `MSG_IPT_NEEDS_STEP` = `Add the STEP export of this part: the shape is read from the STEP`
- `MSG_IPT_TYPE` = `This Inventor part is a {kind}. Only plain single-body parts can be read for now.`
- `MSG_PAIR_MISMATCH` = `These files don't match: {reason}. Export the STEP again from this .ipt and upload both.`
- `MSG_IPT_TOO_BIG` = `This .ipt holds more data than this tool will unpack`
- `MSG_IPT_NO_MODEL` = `No 3D model found inside this .ipt`
- `MSG_IPT_FORMAT` = `This .ipt uses a format this tool can't read yet (ACIS {version})`
- Assumption line added to `assumptions` whenever an `.ipt` is read: `iParts, derived and Content Center parts are not detected yet; the thread data of such a part may not match its STEP.` (until Open question 3 is answered)

### Response (added keys)

```
"inventor": {
  "name": "part.ipt", "saved_with": "2024.1 (Build 281209000, 209)", "acis_version": "229.6.0.65535",
  "checks": {"faces": [215, 215], "corners": [299, 299], "worst_corner_gap_mm": 0.0},
  "threads": [{"id": "thread-1", "designation": "M3x0.5", "class": "6H", "standard": "ANSI Metric M Profile",
               "pitch_mm": 0.5, "depth_mm": 6.0, "tap_drill_mm": 2.5, "minor_mm": [2.459, 2.599], "major_mm": [3.0, 3.172],
               "start": [x, y, z], "end": [x, y, z], "axis": [x, y, z], "state": "matched" | "disagrees" | "not_mapped",
               "hole": "hole-36" | null, "gaps": [], "reason": null, "feature_name": null}]
}
```

S1 returns `inventor` without `threads`; S2 adds it. Holes gain `"thread": [...]` (S2). On screen, lengths show in inches as other lengths do, with the stored mm in brackets for metric threads (D-005).

### Builder defaults (from the zero-decision re-check)

- **Fields and order:** `file` is the STEP, `ipt` the `.ipt`. `read_step` runs first and its errors win; then `read_ipt` (a non-OLE `ipt` → `MSG_IPT_NOT_IPT`), `check_part_type`, `check_pair`. An OLE file sent as `file` → `MSG_IPT_NEEDS_STEP` in `app.py` before the worker. A STEP sent as `ipt` → `MSG_IPT_NOT_IPT`. Both files are held to `MAX_UPLOAD_BYTES` each.
- **Signatures:** `check_part_type(ipt: IptPart, step: ReadResult)`, `check_pair(ipt: IptPart, step: ReadResult)`; `check_pair` collects the STEP corners from `step.solid`. `api.ts`: `analyze(file: File, ipt: File | null, process, material)`. The web page keeps both picked files; changing either one is a new part (camera and selection reset, as for a new STEP today).
- **`MSG_IPT_FORMAT` version:** the `asmheader` string of the model being split, or `unknown` before one is read.
- **Mapping details:** "overlap" is length in mm; the hole's diameter is `dims_mm["diameter"]` (for a tapered hole, its wide end); a thread record with fewer than the 14 strings listed, or whose seven limits don't parse as numbers, is `not_mapped` (`thread record not understood`). `summary["inventor_threads"]` is the same list as `result["inventor"]["threads"]`. `thread` lists are written into the hole and bore dicts before `features` is assembled.
- **Rule:** `thread_mismatch` goes last in `RULES` (F-numbers of existing findings don't move), `PROCESSES = ("mill", "turn")`; its `measured` is in inches, while `gaps[].mm` stays in mm.
- **Tests assert the message:** each `test_inventor_pair.py` case asserts the reason text, not only a refusal. The over-cap case calls `read_ipt` in-process with the cap patched down to 1 MiB (no 64 MiB file in the test). `test_inventor_threads.py::test_fixtures_current` rebuilds both fixtures and compares their `inventor` blocks and hole `thread` lists with the committed ones, so the browser tests can't drift from the real response.
- **Demo shim key:** `<step name>+<ipt name>|<process>|<material>` when an `.ipt` is picked, else unchanged; the demo picker sets both files.

### Builder defaults, S1 re-check (2026-11-08, against main e9c126e)

A fresh zero-decision re-check of S1 found 14 gaps (3 high, 8 medium, 3 low); each takes the default below, and the layouts were measured on the 16 NIST files in the build session.
- **Record links (measured):** a link is the first pointer of a record that points at a record of the kind wanted: `vertex` → `point`; `face` → `shell` → `lump` → `body`; a face's surface is its first pointer to a record whose name ends in `surface` (`plane-surface` …). A model ends at `End-of-ASM-data` or at `Begin-of-ASM-History-Data`; the ACIS history after it (`delta_state` records holding old copies, numbered apart) is not read (CTC 01 broke without this). One stream can hold several models one after another (FTC 11); each is split and the one with most faces is the main model.
- **`UFRxDoc` (measured):** the 16 bytes `90b4294dd011b249077ec39300000006` appear three times; after the second come a u32 count, one byte, then that many names (u32 length + UTF-16). Count 0 in the ten files saved by 2021, 1 in FTC 07 2021 (`Master`, saved by 2022) and the four plain 2024 files (`[Primary]`). No marker or a cut-short list → no names (not a refusal). Assumption: two states give count 2 there.
- **`IptPart`:** `saved_with: str` (`unknown` when property 67 is missing), `acis_version: str`, `subtype: str | None`, `model_state_names: list[str]`, `solid_bodies: int`, `corners_mm: list[tuple[float, float, float]]`, `face_count: int`, `threads: list` (S2). No `subtype` → `part of a type this tool can't read yet`. `acis_version` is the `asmheader` record's first string that starts with a digit and holds a `.`.
- **Measured counts** (faces, corners): CTC 01 139, 250; CTC 02 443, 630; CTC 03 131, 202; CTC 04 368, 506; CTC 05 158, 261; FTC 06 148, 237 (both); FTC 07 258, 210 (2021) and 258, 346 (2024); FTC 08 255, 412 (both); FTC 09 91, 174 (both); FTC 10 223, 310 (2021) and 215, 299 (2024); FTC 11 8, 8 (NIST's geometry-only STEP of FTC 11 is 7,634 bytes). Each file reads in under 0.2 s.
- **Hostile files (J6):** built in the test from a copy of a NIST `.ipt`, its model streams rewritten in place with olefile's `write_mode` (same size; recompressed at zlib level 5, whose header is Inventor's `x^`), so no outside binary is needed; "not an OLE file" is a text file and `box_through_hole.step`.
- **Where the checks run:** `read_ipt`, `check_part_type` and `check_pair` run right after `read_step`, before meshing, so a refusal is quick; `result["inventor"]` is added just before `analyze` returns. `attach` does the same work only for the harness path (S2).
- **Upload limit:** `UploadLimit` at 2 × `MAX_UPLOAD_BYTES` means `tests/service/test_read.py`'s no-length stream test sends 101 chunks of 1 MiB instead of 51 to reach the new limit; it still asserts 413 (the limit moved; the test is not weakened, VER-01). Each file is held to 50 MB after copying.
- **Numbers in reasons:** mm to 2 decimals (`0.02 mm`), counts as integers.
- **Web:** the pick follows the approved mock-up (`mockups/ipt-pick.html`); `api.ts` appends `ipt` only when one is picked; `accept` lists `.step,.stp,.ipt,.STEP,.STP,.IPT`; the web text `Add the STEP export…` is the same as `settings.MSG_IPT_NEEDS_STEP` (a comment in each names the other).
- **Order details:** `Worker.run` and `run_analysis` take `ipt_path=None, ipt_name=None` before `time_limit_s`; the `.ipt` assumption line goes last in `assumptions`; FTC 09 2024 pairs with `nist_stc_09_asme1_ap242*.stp`.
- **`local_pairs.py`:** `tests/inventor/.local/<pair>/` holds one `.ipt` and one `.stp` or `.step`; `local_pairs.toml` has a `[[pair]]` table per folder with `name`, `ipt_sha256`, `step_sha256`, `release`, `faces`, `corners`; it prints `pair check: pass` or `pair check: FAIL - <reason>` per pair.
- **Added tests:** Model States, a STEP with extra solids, an unknown subtype and no subtype (`test_inventor_part.py`); an OLE file sent as `file`, a STEP sent as `ipt`, an `.ipt` over 50 MB (`test_inventor_api.py`); the web messages for a wrong mix and an `.ipt` alone (`tests/e2e/test_upload_pair.py`, `set_input_files`).

### Builder defaults, S2 re-check (2026-11-08, against main 8929f05)

A fresh zero-decision re-check of S2 found 24 gaps (9 high, 11 medium, 4 low); none changed the design, so each takes the default below. One spec fact was wrong and is corrected from a measurement.
- **Thread position (measured, corrects "Thread records"):** the record's first two vectors give the depth only; they are the same for every thread of one hole feature (CTC 04's 4 threads all hold `(-22.5, 12, 7)` cm). The **second-last vector is the start** (on the threaded face's axis, 0.0000 mm off on all 16 NIST threads) and the last the axis into the material; `end = start + depth × axis`. Points ×10 (cm → mm); the axis is a unit vector.
- **Face kind:** the face's surface is a `cone-surface`; its 2nd float (sine of the half-angle) 0 → cylinder, else `cone`; no `cone-surface` → `other`. Concave (a hole) when the face's first bool is True (all 16 NIST threads, all in holes); False → `shaft`. **Assumption:** no external-thread sample. Order of `not_mapped` reasons: record not understood, external, tapered, not a cylinder, no hole.
- **Through:** two `open_vectors` pointing opposite ways. **Heights:** `dot(p, cyl.axis)` in world coordinates, as `Cyl.lo/hi`; the hole's line is its `Cyl` face with the largest overlap. Hole diameter < minor min − 0.01 gives `hole Ø<d> is <x> mm under the thread's minor diameter`.
- **`Thread`** is a dataclass in `threads.py` (`id, designation, cls, standard, pitch_mm, depth_mm, tap_drill_mm, minor_mm, major_mm, start, end, axis, face, reason`); `read_ipt` fills `IptPart.threads` with `read_threads(recs)`; `map_threads` returns the response list. Strings are kept as stored (inch threads untested).
- **Holes' `thread`:** present only on a hole or bore with a matched or disagreeing thread. `inventor.threads` is always a list when an `.ipt` is read.
- **No `attach`:** rules must see the threads, so `analyze` maps them itself between the final hole list and `summary`; the harness calls `analyze(..., ipt_transform=(rows, shift), ipt_check=False)` (test-only keywords; with `ipt_check=False` the checks block is still computed). `nist_pair.analyze_registered` runs a plain `analyze` to get the holes, `register`, then that call.
- **Rule:** `thread_mismatch` runs only when an `.ipt` was read (`analyze.NEEDS_IPT`), so `rules_run` is unchanged without one. Title `<designation> thread on <hole>: <gap texts joined by "; ">. Possible cause: the part or an old STEP export differs from the .ipt`; `measured`, `limit` rounded to 6 decimals; finding carries `thread`. No `passes`.
- **register:** reads the `.ipt` cylinders itself (`register.ipt_cylinders`, harness only); STEP holes from `_cylinder`; after the spike's vote, the shift is refined by the median offset of corner pairs within 0.2, 0.05, then 0.02 mm (a mean put CTC 04 0.013 mm off: two CAD systems place some corners differently). Measured shifts: CTC 04 (250, 0, 30), STC 10 (79, 0, 37.5), FTC 10 (0, 0, 0) mm.
- **Built threads:** `tests/inventor/built.py` (an `IptPart` from a STEP test part plus threads); the depth case uses `drill_point_hole.step` (box_through_hole's hole is through).
- **Fixtures:** the full Milling / Aluminum 6061 response, compact JSON (CTC 04 1.06 MB, STC 10 0.66 MB); CTC 04 drives `test_threads_panel`, STC 10 `test_pdf_threads`.
- **`local_pairs.toml`:** `threads_matched`, `threads_disagrees`, `threads_not_mapped` per pair; `local_pairs.py` runs `analyze` with `ipt_path`.
- **PDF:** `report.ascii` keeps Latin-1, so `Ø` (code 216) prints as is; threads list in record order; inches first, the stored mm in brackets; a not-mapped line starts with its thread id.

### Test files

- `tests/inventor/files/`: the 16 NIST `.ipt` files, byte for byte (13,755,904 bytes); `tests/inventor/SOURCE.md`: both zip URLs and SHA-256, each file's SHA-256, the public-domain note. `tests/service/test_inventor_part.py::test_checksums`. `.gitattributes`: `*.ipt binary`.
  SHA-256 of the 16 files as extracted on 2026-11-08 (`unzip -j` of `Inventor 2021/*.ipt` and `*.ipt` from the two zips):

  ```
  c3716769b86d5fb7db9b65fa4c785c0f98db92258af0a801d544ab7d83251ec3  INV_nist_ctc_01_asme1_2021.ipt
  d0027e6469e71bdc7c9ed75c67ee8dafea1dd16e78e72249c1825f918168573d  INV_nist_ctc_02_asme1_2021.ipt
  6015216e51931b3ff173f1fdccef1583b37d31540d12914319b59d5d6ef5011c  INV_nist_ctc_03_asme1_2021.ipt
  c4b483d35ecdeeae98f8bfc206fb5d5e0c459c622c9e0fe34d55593478089d7f  INV_nist_ctc_04_asme1_2021.ipt
  27af6adf58e41f13d18291c4e4ea5bf1ac4ed571751fb1c538c2d45feb255c26  INV_nist_ctc_05_asme1_2021.ipt
  b726dec98a86e26fe9987bbbdeaff34396859130d576ae5bc3be7a69d7e60891  INV_nist_ftc_06_asme1_2021.ipt
  3b6ef80aeb2aafb65327461ff04a33140d0a6888edc272c51273c7a1ab6e35e6  INV_nist_ftc_06_asme1_2024.ipt
  afa1293e6d8852d04c0733947578d8f19949d99f49227521c248b9dc4104d99c  INV_nist_ftc_07_asme1_2021.ipt
  b691d3d29a73ee9e0be4290692f79a85c7829754f786beff2fa901971c4f6a68  INV_nist_ftc_07_asme1_2024.ipt
  d501948d2e752d1a4a24165873340b7effcd31194092b0033c46a86939b61fd1  INV_nist_ftc_08_asme1_2021.ipt
  8fde251df9385988984a6a81f2f6b07cb113a862f87d931ca08abac4da5867f1  INV_nist_ftc_08_asme1_2024.ipt
  98e01cb4bca340c3d2e8604893ace7ed3252975e27de611844c004bc70e3b3ac  INV_nist_ftc_09_asme1_2021.ipt
  02cd8a89bedb341b39e65461859500769efde3ea33e78d142825d5d2bde71b37  INV_nist_ftc_09_asme1_2024.ipt
  58db08fc38f417e63cea961e7cbb5d853ca5f9210c64a0ed9a0c4cbc1d556acd  INV_nist_ftc_10_asme1_2021.ipt
  142317b7adec77791951180379673b82e138bf9446b713fc79f4e19905a25deb  INV_nist_ftc_10_asme1_2024.ipt
  0f507d3d753855324a56088a387581fadfaf63b639c1231c2429f5632af76163  INV_nist_ftc_11_asme1_2021.ipt
  ```
- `tests/inventor/register.py` (S2): the spike's `register.py` (24 axis rotations + shift, vertex votes on a 0.1 mm grid, cylinder-axis hits), returning `(rows, shift)`.
- `tests/inventor/nist_pair.py` (S2): `analyze_registered(step, ipt, process, material)`: `analyze` on the STEP, then `attach(..., transform=register(...), check=False)`. Used by `test_inventor_threads.py`, by `tests/inventor/make_fixture.py` (writes `tests/inventor/fixtures/ctc_04.json` and `stc_10.json`, committed), and by `scripts/make_demo.py`.
- `tests/e2e/test_threads.py` and `test_pdf.py::test_pdf_threads` load the app, answer `/api/analyze` with the fixture through Playwright `page.route`, and pick two placeholder files named as the pair.
- `tests/inventor/local_pairs.py` + `local_pairs.toml`: run the app path (`analyze` with `ipt_path`, no transform) on pairs in `tests/inventor/.local/` (git-ignored); the toml holds, per pair, both SHA-256, the Inventor release, faces and corners (S1) and thread counts per state (S2). Morgan's files reach the session by a Drive share, as MFCAD++, and never enter git (D-006, D-032).
- `docs/nist/CATALOG.md` "Native Inventor files": now copied, with the test folder.

## Slices

### S1 Pair upload, checks and refusals

- **First:** measure the pair check on at least one of Morgan's work pairs with a scratch version of `local_pairs.py` (faces, corners, worst gap). If the counts or the 0.01 mm don't hold, stop and take the numbers to Morgan. Then the `ui-mockups` mock-up of the two-file pick.
- **Morgan tries:** in the app, CTC 04's `.ipt` with its NIST STEP → "These files don't match: the STEP has 483 faces, the .ipt 368…"; CTC 03's `.ipt` → the sheet-metal message; only an `.ipt` → "Add the STEP export…"; a work pair → it opens as today, with the `.ipt` name and Inventor build under the part name.
- **Checks that fail now:** J2, J3, J6; `local_pairs.py` prints `pair check: pass` for each work pair (J1, S1 part).
- **Files:** `service/dfma/inventor/{__init__,ole,sab,part,pair}.py`; `analyze.py`, `worker.py`, `app.py`, `settings.py`; `environment.yml`, `README.md`; `web/index.html`, `web/src/api.ts`, `web/src/main.ts`; `tests/inventor/{files/,SOURCE.md,local_pairs.py,local_pairs.toml}`; `tests/service/test_inventor_{part,pair,api,safety}.py`; `.gitignore` (`tests/inventor/.local/`), `.gitattributes`; CATALOG.
- **Waits on:** Morgan's answers to Open questions 1 and 3, and one work pair.

### S2 Threads mapped and shown

- **First:** the `ui-mockups` mock-up of the Threads panel and the PDF section. Approved 2026-11-08 (D-036): [threads-panel](https://claude.ai/artifact/7H6qTtj2BYgQATskcXVMZG), `mockups/threads-panel.html`.
- **Morgan tries:** the demo opens NIST CTC 04 with its `.ipt`, labelled `NIST pair lined up by the test harness; the app itself refuses this pair` (a second demo entry shows that refusal as the app gives it), and shows 4 threads `M12x1.75 - 6H`, 25 mm deep, on its 4 holes; STC 10 shows one thread as a finding, 0.10 mm off its hole's axis (a measured difference between NIST's two files, which came from different CAD systems). In the app, a work pair shows its threads; Export PDF has the Threads section.
- **Checks that fail now:** J1 (S2 part), J4, J5; `tests/service/test_rules.py::test_thread_mismatch`, 3 built cases on `box_through_hole.step` (D-005: 2-3 test parts per rule) plus STC 10: a thread 0.10 mm off the hole's axis, one on a hole 0.50 mm over its major diameter, one deeper than its blind hole, each one `medium` finding with its gap; and a centred thread gives none. `tests/service/test_inventor_api.py::test_attach_in_process`: `analyze(step, ..., ipt_path=...)` in-process with `read_ipt` patched to return an `IptPart` built from `box_through_hole.step` plus one thread, so the passing app path (part type, pair check, mapping, rule) runs on every push; real pairs rest on Morgan's evidence (VER-07).
- **Files:** `service/dfma/inventor/threads.py`, `part.py` (`threads`), `__init__.py` (`attach` maps); `rules/thread_mismatch.py`, `rules/__init__.py`; `web/src/findings.ts`, `report.ts`, `format.ts`, `api.ts`, `index.html` (panel slot); `scripts/make_demo.py` (entries from `nist_pair.py`, both file names in the demo shim's key); `tests/inventor/{register,nist_pair,make_fixture}.py`, `tests/inventor/fixtures/`; `tests/service/test_inventor_threads.py`, `test_rules.py`; `tests/e2e/test_threads.py`, `test_pdf.py`; `local_pairs.toml` thread counts.
- **Waits on:** S1.

### S3 Feature names

- **First:** build the answer key: InventorLoader in a scratch FreeCAD env from conda-forge (the earlier session's route, D-031: its output only, source not read) on CTC 04, FTC 10 and STC 10; save each thread's feature name to `tests/inventor/names_key.json`. Then decode the link from a thread record to its feature, time-boxed to half a session. Probed 2026-11-08 without success: the thread's ints (`43`, `4302`, `2437` …) and its two linked records (`NMx_Feature_Orientation`, `NMx_Matched_Entity`) hold no value found next to a feature name; names sit as UTF-16 text in two streams (CTC 04).
- **Morgan tries:** each thread row and its PDF line show the Inventor feature name in small print (e.g. `Hole3`).
- **Checks that fail now:** `tests/service/test_inventor_names.py`: every NIST thread's `feature_name` equals the key.
- **Files:** `service/dfma/inventor/names.py`, `threads.py`; `web/src/findings.ts`, `report.ts`; `tests/inventor/names_key.json`; `tests/service/test_inventor_names.py`.
- **If the decode fails in the time box:** no names code ships; rows and PDF lines stay without a name; HANDOFF records what was tried, and names move to I2 (Open question 2).
- **Waits on:** S2.
- **Outcome (2026-11-09):** the key was built (`tests/inventor/names_key.json`, 16 threads: CTC 04 Hole8 ×4; FTC 10 2021 and 2024 Hole17, Hole9, Hole16 ×2 each), but the decode time box ended without a thread → name link, so no names code ships: `feature_name` stays `null` and rows and PDF lines show no name. Names move to I2 (D-033), built on the same branch (D-037). `tests/service/test_inventor_names.py` pins the key and the measured feature-id field. What was tried: `docs/research/inventor-names-probe/README.md`.

### Builder defaults, S3 re-check (2026-11-09, against main 3804787)

A fresh zero-decision re-check of S3 found 18 gaps (7 high, 8 medium, 3 low); each takes the default below; none needed Morgan. They apply when names are built (now I2).
- `feature_name` per thread is a string or `null`; never guessed; an empty or blank decoded name is `null`; threads of one feature share its name.
- On screen: the bare name (`Hole8`) as one more `fmeta` span on the thread row, after the size line, set with `textContent`; nothing when `null`. PDF: one more field after the callout, left out when `null`, so lines without names are unchanged. Not in finding titles or the Passed-row callout (this spec's S3 wording; D-033 amends D-032's "beside its finding").
- Names are read through `ole.Ipt` under the same caps; every count, length and offset is bounds-checked; a name is at most 255 characters; bad data gives `null`, never a refusal.
- The key is by `.ipt` name and covers CTC 04, FTC 10 2021 and 2024; files without threads get no entries. Fixtures are regenerated with `tests/inventor/make_fixture.py` once names fill in.

## Verification

- Every push: `python scripts/check.py` in the dfma env, with `DFMA_CHROMIUM` set.
- End to end: `tests/inventor/local_pairs.py` on Morgan's pairs (2023, 2024, 2025), plus Morgan's own run of one pair on their PC (VER-07).

## Open questions

All three answered on the [approval page](https://claude.ai/artifact/We9PewcwKGm4GFnMrrQfxp) (D-033). Still open: if Morgan's first work pair changes the face or corner count, the fallback in D-033 needs Morgan's OK before S1 goes on.
