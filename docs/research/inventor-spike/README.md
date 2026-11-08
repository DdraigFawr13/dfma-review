# Inventor .ipt spike (2026-11-08)

Throwaway research scripts, not app code. They show that thread callouts in an `.ipt` can be read and mapped to holes in the STEP of the same part. Written from the bytes of the NIST files; no Autodesk or InventorLoader code was used.

- `sab.py`: opens the compound file (olefile), inflates the `RSeStorage/B*` streams (zlib after the first `x^`), and splits the embedded ACIS binary B-rep into records (tags: 0x04 int, 0x06 double, 0x07 string, 0x0c pointer, 0x0d/0x0e names, 0x13/0x14 point/vector, 0x11 end of record). Lengths are in cm.
- `ipt_dump.py <dir of sab.py> <file.ipt>`: vertices, cylinder faces, hole-tagged faces and thread attributes (`NMx_Thread_Entity` in Inventor 2021; `ATTRIB_CUSTOM` + `INV_NMX_THREAD_TAG` in 2024), in mm. Each thread's 4th pointer is its face; its strings hold the callout, standard, class, pitch and a diameter list; its first two points are the thread's ends (their distance is the thread depth).
- `step_holes.py <file.stp>` and `step_dump.py <file.stp>` (dfma env): our hole list with axis and top point, and the STEP vertices.
- `register.py <ipt.json> <step_pts.json> <holes.json>`: picks the axis-aligned rotation and shift that best overlays the two models (NIST's STEP files come from other CAD systems, so frames differ), then maps each thread to the STEP hole on the same axis.

Run: olefile in a scratch venv (`python3 -m venv v && v/bin/pip install olefile`), the rest in the dfma env. Results: `docs/research/inventor.html` section 0.
