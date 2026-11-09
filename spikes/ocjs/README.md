# Trial: opencascade.js for a GitLab Pages build (D-054)

2026-11-09. Question: can the app's geometry move into the browser, so the whole app is a static GitLab Pages site? Not part of the app; nothing here is imported by `service/` or `web/`.

## Results (measured in this cloud container, 2026-11-09)

- **Geometry, face by face:** `@taucad/opencascade.js` 3.0.0-beta.3 (OpenCascade V8_0_0) against the app's reader (pythonocc-core 8.0.1.2) on the 33 STEP files in `tests/nist/NIST-PMI-STEP-Files.zip`: 33 of 33 files and 8,137 of 8,137 faces the same in kind, area, plane normal, cylinder radius and axis, cone angle, sphere and torus radii, orientation, and the faces each one touches. Largest difference 1.9e-14 (relative area). Volume, area, bounding box, edge count, ignored solids and gap edges the same on every file. The comparison caught 3 planted face changes and 1 planted volume change.
- **In Chromium** (Playwright's Chromium): the same 8,137 of 8,137. Engine start 0.59 to 0.68 s from a local server; all 33 files read and fingerprinted in 8.01 s (the Python reader: 8.98 s). Wasm memory 128 MB at start, 221 MB after `nist_ftc_09` (6.1 MB file), 266 MB after all 33 with nothing freed (the tab's limit: 4 GB).
- **Download:** `opencascade_full.wasm` is 41,036,092 bytes, 11,495,406 gzipped. A custom build with only the classes we use would be smaller (not tried).
- **`.ipt` reader:** `cfb` 1.2.2 and `node:zlib` against the app's `Ipt` (olefile 0.47) on the 16 files in `tests/inventor/files`: 512 of 512 streams the same raw bytes; the 143 inflated model streams the same. Not tried: property sets (`Ipt.properties`), which `cfb` does not parse.
- **API cover:** all 59 OpenCascade names `service/` imports exist in the fork's bindings except `Message` (used only to quiet OpenCascade's console banners). Collections go by their NCollection names (e.g. `NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher`).

## The recognizers' engine calls (probe.py, probe.mjs; 2026-11-09)

The calls `features.py` makes beyond reading, run the same way on all 33 files from the bounding-box centre and on each file's first 40 faces:

- **Identical on 33 of 33 files:** ray casts (`IntCurvesFace_ShapeIntersector`, 7 rays each: every hit parameter), point in solid (`BRepClass3d_SolidClassifier`, 9 points), point in face (`BRepClass_FaceClassifier` at each face's centre of mass; both engines raise on the same 40 faces), projection and face normal (`GeomAPI_ProjectPointOnSurf`, `BRepGProp_Face`), distance (`BRepExtrema_DistShapeShape`; both raise "no solution" on the same 39 pairs), boolean common area (`BRepAlgoAPI_Common`).
- **Mesh (`BRepMesh_IncrementalMesh` 0.05 mm, 0.5 rad):** 7,923 of 8,137 faces identical. The other 214 have the same nodes, node and triangle counts, but join the nodes into different triangles. Not threading: each engine gives the same mesh with and without its parallel flag, and Python gives the same mesh on two runs. Inferred cause: OpenCascade 8.0.1 (pythonocc) against 8.0.0 (the fork); not checked. It matters for the wall finder, which samples triangle centres (`features.py` `_inner_points`).
- **pythonocc crashes, the fork does not:** on `nist_ftc_08_asme1_ap242-e1-tg.stp`, `GeomAPI_ProjectPointOnSurf` from the bounding-box centre and `BRepAlgoAPI_Common(face 0, solid)` segfault Python (the app runs each analysis in its own process for this reason). Both probes skip them on that file, so the fork's behaviour there was not compared.

## Not measured

- The recognizers (`features.py`, 1,835 lines; `inventor/`, 1,609 lines) are not ported, so hole, pocket and wall scores on the fork are unknown. Their inputs and the engine calls they make are the same, except the mesh above.
- Files larger than the NIST set, and a slow network.
- The fork's maintenance: one company, beta tags only.

## Run it

```
cd spikes/ocjs && npm ci
unzip -oqj ../../tests/nist/NIST-PMI-STEP-Files.zip '*.stp' -d .cache/nist
python fingerprint.py .cache/nist .cache/py.json          # in the dfma environment
node fingerprint.mjs .cache/nist .cache/js.json && node compare.mjs .cache/py.json .cache/js.json
node browser_run.mjs .cache/browser.json && node compare.mjs .cache/py.json .cache/browser.json
python probe.py .cache/nist .cache/probe_py.json && node probe.mjs .cache/nist .cache/probe_js.json
python ipt_py.py ../../tests/inventor/files .cache/ipt_py.json && node ipt_js.mjs ../../tests/inventor/files .cache/ipt_js.json
```

Licences: `@taucad/opencascade.js` LGPL-2.1-only with the Open CASCADE exception (as pythonocc-core's OpenCascade); `cfb` Apache-2.0.
