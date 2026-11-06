# NIST MBE PMI test cases (gold standard, D-011)

`NIST-PMI-STEP-Files.zip` is the file NIST publishes, byte for byte. Never edit, re-zip or replace it; `tests/service/test_nist.py::test_zip_untouched` checks its SHA-256.

- Source: https://www.nist.gov/document/nist-pmi-step-files, linked from https://www.nist.gov/ctl/smart-connected-systems-division/smart-connected-manufacturing-systems-group/mbe-pmi-0
- Downloaded: 2026-11-06. Size: 13,976,599 bytes. SHA-256: `8fa78429e6d8d9b0d7681d223b6aa9ec98c3772185c55b1a0e3679b21c181911`
- Licence: the NIST page says "The test cases, CAD models, and STEP files can be used without any restrictions." (SAFE-05)
- Contents: 17 AP242 files (FTC 06-11, STC 06-10, CTC 01-05, plus FTC 08 tessellated), AP203 files with PMI and geometry only, test-case PDFs and NIST's README.

The tests unpack it on demand into `tests/nist/.cache/` (not in git). `scorecard.toml` records, per AP242 file, what the tool maps today; a later slice may only move those numbers towards a complete map, never back.
