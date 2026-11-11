# Shape from the .ipt alone, in TypeScript (2026-11-11)

Research, not product code (D-035). Code: `web/src/inventor-shape-spike/` (`shape.ts` builds an OpenCascade solid from the ACIS records of an `.ipt`; `all16.run.ts` runs all 16 NIST `.ipt` files through our recognizer and, for the 11 with a STEP, through the STEP route).

Run (from `web/`, after `npm run nist` at the root): `OUT=result.json npx vitest run --config vitest.spike.config.ts`

Results (measured 2026-11-11; Inventor route / STEP route):
- Closed solid for 7 of 16 files (CTC 03, CTC 04, FTC 06 ×2, FTC 09 ×2, FTC 11). The other 9 (CTC 01, 02, 05, FTC 07 ×2, 08 ×2, 10 ×2) hold `spline-surface` / `intcurve-curve` records the builder skips, so their shells stay open. Both store exact degree-3 NURBS (`nubs`).
- Same features on both routes: CTC 04 (58 holes, 4 pockets, 22 corners, 49 walls; findings 24 / 26) and FTC 06 2021 and 2024 (findings 24 / 24; hole diameters differ by 0.02 mm).
- Differences: CTC 03 walls 32 / 20; FTC 09 pockets 0 / 2, corners 0 / 19, findings 2 / 16 (cause not found; face splitting is an untested guess); FTC 11 volume -41% (as in the earlier spike); CTC 04 four holes differ in kind between the `.ipt` and the NIST STEP.

Engine quirk (`@taucad/opencascade.js` 3.0.0-beta.3): `new oc.BRepBuilderAPI_MakeFace(surface, wire)` binds to another overload and drops edges; pass the third argument (`true`). Decode a thrown `WebAssembly.Exception` with `oc.getExceptionMessage(e)`.

Next steps are Proposed, not decided: spline surfaces and edges, FTC 09, FTC 11, then the app route with the STEP as a cross-check. D-035 says plan the phase with `planning-interview` first.
