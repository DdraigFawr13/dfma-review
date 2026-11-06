# NIST Engineering Design Model Repository subset (EDMR)

Test fixtures copied byte for byte from Morgan's fork https://github.com/DdraigFawr13/engineering-design-models (commit `dc4ed1c352bfa7fa0976c6abc6074a7a40aa1d5a`, a fork of `usnistgov/engineering-design-models`), paths kept under `models/`. Never edit them; add more only when a slice uses them (Morgan, 2026-11-06). Catalogue of the whole repository: `docs/nist/CATALOG.md`.

| Set | Files | Why |
|---|---|---|
| `models/UMD` | 35 STEP, 139 `.fts` feature lists | University of Maryland feature-recognition benchmark parts (pockets, slots, holes, part/stock pairs), 1995 AP203 |
| `models/NIST/Manfred_Osti/spectrometer` | 54 STEP | NIST spectrometer assembly parts: shafts, flanges, nuts, spacers (turned and prismatic) |
| `models/STEP/STI` | 24 STEP + README | The files the README credits to the "NIST DPPA Repository" (e.g. `monster4.stp`, `valve.stp`, `interactingPockets.stp`) |

`.fts` files are feature lists written by an old recogniser: a reference, not verified ground truth.

**Licence.** The repository README: "provides a public-domain collection of industry-relevant CAD models"; LICENSE.md: "works of NIST employees are not subject to copyright protection in the United States and are considered to be in the public domain". Neither says anything about models contributed by others (the UMD parts are university work), so they are used here as test fixtures only, with this provenance. Copies of `LICENSE.md` and `README.md` sit beside `models/`.

`scorecard.toml` records what the tool does with each STEP file today; `tests/service/test_edmr.py` lets each number only improve (D-011).
