# Inventor shape spike (2026-11-08): an OpenCascade solid from an .ipt alone

Scratch research, not product code. Needs the I1 S1 reader (`service/dfma/inventor`, branch inventor-i1-s1).

- `ipt_shape.py`: ACIS records to faces, sewn into a solid. The record layouts it relies on are in its docstring.
- `compare.py`: builds the 7 target files and compares with the NIST STEP (volume, area, bbox, `features.holes`).
  Run: `PYTHONPATH=service:tests:docs/research/inventor-shape-spike python docs/research/inventor-shape-spike/compare.py`

Rules found by measurement:
- Straight-curve direction is not always a unit vector; its length is the parameter scale (CTC 03).
- An edge with sense True walks its curve backwards: negate the curve normal (ellipse) or direction (line)
  (rule held on 3 files, 0 endpoint misses in about 760 ellipse edges).
- An edge with no curve pointer (-1) is degenerate (cone tip). The cone tip face is built from (u, v) bounds.
- Cone: tan(half angle) = sin / cos; cos can be negative (FTC 09 countersinks).
- Sphere radius and torus minor radius can be negative: use the absolute value.
- A model can hold several bodies (FTC 06: one of 146 faces plus two 1-face sheets): build the biggest shell.
- `intcurve-curve` stores an exact NUBS B-spline (degree, knots with multiplicities, poles) plus the two
  surfaces it intersects, so a Geom_BSplineCurve can be built. Not done.

Results (2026-11-08, re-run in the main session; volume vs the NIST STEP's `read_step` volume, holes by `features.holes` on both):
- CTC 03 -0.11%, 15/15 holes; CTC 04 -0.15%, 58/58; FTC 06 2021 and 2024 -1.06%, 22/22; FTC 09 2021 and 2024 -0.21%, 30/30. Every solid valid (BRepCheck), 0 free edges, 0.1-0.8 s.
- FTC 11 -41% (ipt 3,007 mm³, 2.01 mm thick; both NIST STEP files 5,129 and 5,135 mm³, 3.0 mm). The .ipt holds 8 faces in every model of every stream, so the reader picks the right model; the NIST .ipt may be another revision, or the builder is wrong on it. Not resolved.
- Estimate (not measured) to production grade: 4-6 days, with spline surfaces, intcurve edges and checks on all 16 files.
