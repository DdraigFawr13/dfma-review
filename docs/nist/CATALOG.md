# NIST resources catalogue

Everything here is copied from NIST byte for byte and never edited (D-011). Morgan asked for NIST material to live in GitHub so it survives the move to the company GitLab, and for new items to be added here when a slice needs or uses them (2026-11-06). The gold-standard STEP zip itself lives in `tests/nist/` because the tests read it.

## In this repo

| File | What it is | Source (downloaded 2026-11-06) |
|---|---|---|
| `papers/NIST.AMS.100-10.pdf` | Guide to the NIST PMI CAD Models and CAD System PMI Modeling Capability Verification Testing Results (92 pp, 2017) | https://doi.org/10.6028/NIST.AMS.100-10 |
| `papers/NIST.GCR.15-997.pdf` | Report 1: Combined Test Case (CTC) verification (77 pp, 2015) | https://doi.org/10.6028/NIST.GCR.15-997 |
| `papers/NIST.GCR.15-998.pdf` | Report 2: CTC 5 validation in STEP AP242, JT and 3D PDF (50 pp) | https://doi.org/10.6028/NIST.GCR.15-998 |
| `papers/NIST.GCR.15-999.pdf` | Report 3: Fully-Toleranced Test Case (FTC 6, 8, 9) verification (92 pp) | https://doi.org/10.6028/NIST.GCR.15-999 |
| `papers/NIST-CTC-verification-slides.pdf` | Slides for Report 1 | https://www.nist.gov/document/nist-cad-model-ctc-verification |
| `papers/NIST-CTC-validation-slides.pdf` | Slides for Report 2 | https://www.nist.gov/document/nist-cad-model-ctc-validation |
| `papers/NIST-FTC-verification-slides.pdf` | Slides for Report 3 | https://www.nist.gov/document/nist-cad-model-ftc-verification |
| `test-cases/NIST-FTC-definitions.zip` | FTC 6-11 definitions: drawings (PDF), AP203 geometry, element ids, `NIST-FTC-PMI-Definitions.xlsx` | https://www.nist.gov/document/nist-ftc-test-case-definitions |
| `test-cases/NIST-CTC-definitions.zip` | CTC 1-5 definitions, `NIST-CTC-PMI-Definitions.xlsx`, README | https://www.nist.gov/document/nist-ctc-test-case-definitions |
| `test-cases/NIST-HTC-CAD-models.zip` | Hole Test Case (2024): counterbore, countersink, through and depth holes; native CATIA V5, Creo, NX files plus a PDF drawing (no STEP) | https://www.nist.gov/document/nist-htc-pmi-cad-models |
| `../../tests/nist/NIST-PMI-STEP-Files.zip` | The 17 AP242 STEP files (gold standard), AP203 files, PDFs | https://www.nist.gov/document/nist-pmi-step-files |

Index page: https://www.nist.gov/ctl/smart-connected-systems-division/smart-connected-manufacturing-systems-group/mbe-pmi-0

## Licence

- NIST page: "The test cases, CAD models, and STEP files can be used without any restrictions."
- Reports 1-3 (contractor reports, p3): "The test system can be used without any restrictions." That sentence covers the test system; it does not say so about the report text (inference: copying for our own reference is fine).
- The Guide (NIST.AMS.100-10) has no rights statement; it says only "This publication is available free of charge". Inference: a NIST staff work, so US public domain (17 U.S.C. 105).

## What the papers give us (page numbers are PDF pages)

- **Answer key for feature recognition:** Report 3 Appendix A (p30-35) lists FTC 6, 8 and 9 features with sizes, e.g. "F18-21 | Counterbored Holes - Set 1 | 4X Ø.415 ±.008". Report 1 Appendix A (p32-34) lists 50 CTC constructs with units. The `*-PMI-Definitions.xlsx` files in the definition zips hold the same in a spreadsheet. Positions are not listed: they come from the model.
- **Design units:** CTC 1, 2, 4 mm; CTC 3, 5 inch; FTC 6, 7, 8, 9 inch; FTC 11 mm (R1 p32-34; drawings). Several inch parts are written to mm STEP files, which is why D-013 accepts inch drills in mm files.
- **Hole counts per case:** Guide Table 2 (p15) and threads Table 5 (p16): counterbores in CTC 4, FTC 6 (3), FTC 7, FTC 10 (3); threads in CTC 4 and FTC 10 (3).
- **GD&T:** ASME Y14.5-1994 and Y14.41-2003 (R1 p11). Tolerance types per case: Guide Table 1 (p14); datums Table 3 (p15); modifiers Tables 4-5 (p16). FTC drawing notes block, including a general profile tolerance, R3 p36: a template for generated drawings (stage 4).
- **Threads in STEP:** the modelled diameter of a threaded hole differs between CAD systems (R1 p28), so read thread size from PMI, not from the geometry.
- **AP242 reality:** in 2015, CTC 5 translated with 76% of annotations as semantic PMI (R2 p25): expect partial PMI and keep a fallback.

## Incorporated (2026-11-06)

- **EDMR subset in `tests/edmr/`**: 113 STEP files (UMD benchmark, NIST spectrometer, STEP/STI NIST DPPA files) plus 139 UMD `.fts` feature lists, copied from Morgan's fork; provenance and licence in `tests/edmr/SOURCE.md`. `tests/service/test_edmr.py` scores every file through the analysis worker. Baseline with the S2 code: 105 read, 2 read errors (`weldment.stp` is truncated; UMD `ex2.step` has no solid), 6 crash OpenCascade inside the reader (UMD bracket1-4-Part, castle, ex1); the worker restarts and the app shows "The analysis failed on this file". 880 holes found, longest file 2.2 s.
- **Reading fix found by it:** the 1995 UMD files hold solids with no product structure, so nothing was a transfer root and every one failed; `read.py` now transfers their solid B-reps directly.
- **SFA: Morgan's fork `DdraigFawr13/SFA`** (of `usnistgov/SFA`, version 5.54): referenced, not copied (1.9 GB). Its `Release/` folder holds `SFA-5.54.zip` (the Windows app), `SFA-User-Guide-v7.pdf`, `SFA-README-FIRST.pdf`, release notes and a newer `NIST-PMI-STEP-Files.zip` (12,889,852 bytes, SHA-256 `1fb91bb8ff0fe02032b948fda0775bc74591cd0bebc0988347d32574e5884f90`: CTC 04 as AP242 e2, FTC 08 tessellated as e4, a different FTC 11). Our gold standard stays the file from the NIST page (`tests/nist/`). Use SFA to check how a file's semantic PMI and hole features read before the drawing stages (3 and 4).

## Elsewhere, not copied (yet)

- **Morgan's fork `DdraigFawr13/engineering-design-models`** (NIST Engineering Design Model Repository, 16 GB, about 2,399 AP203 STEP files, no PMI in any of them). Most useful for feature recognition: `models/UMD` (benchmark parts with `.fts` feature lists, e.g. `UMD/through_pocket1/through_pocket1.step`), `models/STEP/STI` (e.g. `monster4.stp`, `valve.stp`), `models/PTC/V18/mfgmill18` (milling tutorial parts), `models/NIST/Manfred_Osti/spectrometer` (turned parts). Licence: NIST's notice covers works of NIST employees; it says nothing about models contributed by companies and universities (PTC, SDRC, Sandia, UMD and others), and `models/Sandia` carries a patent caution. Copy a file here only when a slice uses it, with its path and source recorded.
- **`usnistgov/CAD-PMI-Testing`**, **`usnistgov/STP2X3D`** (STEP to X3D on OpenCascade), **`usnistgov/AR-PMI`** (points to the NIST Box Assembly test data), **`usnistgov/QIF`** (inspection data): secondary references.

## Native Inventor files (found 2026-11-08, not copied yet)

- `NIST-FTC-CTC-PMI-CAD-models.zip` (https://www.nist.gov/document/nist-ftc-ctc-pmi-cad-models, 60,294,624 bytes, SHA-256 `17e14dbf207f447f16e0182a7eda5254ee19afff591dd409b8b510103dd05d10`): folders CATIA V5-6R2019, Creo 10, Creo 4, `Inventor 2021` (11 `.ipt`, CTC 01-05 and FTC 06-11), NX 1980, SolidWorks MBD 2018, plus geometry-only STEP in `CTC Definitions/` and `FTC Definitions/` ("STEP files of FTC model geometry, no PMI is included"). README: "this test system is not subject to copyright protection and is in the public domain".
- `NIST-STC-PMI-v4.zip` (https://www.nist.gov/document/nist-stc-pmi-v4, 51,125,067 bytes, SHA-256 `bb4fb9939476542af6e90fd2616b4e897756916494a4c92f11404fc13dd1aba8`): `Inventor/` holds 5 `.ipt` for STC 06-10, named `INV_nist_ftc_0N_asme1_2024.ipt`. README: "the Inventor models were not" updated in v2, then (29 Aug 2023) "all of the Inventor models have been updated".
- The 16 `.ipt` files total 13,755,904 bytes. Inside: OLE compound file, zlib streams, ACIS binary B-rep (`asmheader` 226.0.3 in 2021, 229.x in 2024), feature tree names (Hole, Extrusion, Fillet …). Research page: `docs/research/inventor.html`. HTC, MTC and D2MI zips have no Inventor files.

## Checksums (SHA-256)

```
b6de8191f7e3dd2e79ecddc7c1978d820dd887d73701e8ca0a32d0c821cf3503  papers/NIST-CTC-validation-slides.pdf
e95314f0edfd1d9852f2acfcfe7f19d0151067a8631736f45e73c1be3a9feca0  papers/NIST-CTC-verification-slides.pdf
1a0a34dc20d2938e5e8c078ed80851be5204b7e97178d3232a32de7c1f6f0e38  papers/NIST-FTC-verification-slides.pdf
6a3385a8192d171fac391bde29fbbd6414e1ebcd59e8cc3c1c7b458f3c114818  papers/NIST.AMS.100-10.pdf
246468395db2df0589c2a4956b42d46f8dac783b50d9d532925d864321ea3c00  papers/NIST.GCR.15-997.pdf
7d7dd09b04e2cf6e733e3fbc2afb8829f5788141b8ae9b1b0565bf1ead288005  papers/NIST.GCR.15-998.pdf
7ea890ea2868690e612fc8a772739d54fd84286ac359e4831b9b478bc75909c0  papers/NIST.GCR.15-999.pdf
79ebc74d99eb05c0d23de1c1d8730651fa2a24def56f647bac21dd439ec40690  test-cases/NIST-CTC-definitions.zip
3762211e6c5e6c75055f56366abe59c43d5824468fb313d7818ba8ee6b777c15  test-cases/NIST-FTC-definitions.zip
6ac4b6fdf43bb0e4f5e5947079f38eb3244c1a9e286bf092879e7310fbcc9d31  test-cases/NIST-HTC-CAD-models.zip
```
