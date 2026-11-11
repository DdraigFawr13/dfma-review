# Removal volume prototype (P1 spec, write-spec step 3), 2026-11-11

Three probes run before the P1 spec, on the 17 NIST AP242 files, in this cloud container (4 cores, Node 22.23.4). Code: `web/src/removal-proto/` (spike config only: `cd web && npx vitest run --config vitest.spike.config.ts src/removal-proto/<file>`). Each appends to the `.jsonl` here.

## 1. The cut (`cut.run.ts`, `cut.jsonl`)

- Stock: a box in the part frame (`partFrame`) over the mesh vertices; `BRepAlgoAPI_Cut(box, solid)`; each solid of the result is a region.
- Works on 16 of 17 files in 37 to 275 ms (plus 12 to 317 ms to list the solids). FTC 08 `-e1-tg` fails (`IsDone` false; its tessellated solid is inside-out, as the reach spike found).
- The sum of the region volumes equals box minus solid to 0.0041 % or better.
- **The regions don't separate features.** The removed material is mostly one connected piece: CTC 01 1 region (all of it), CTC 03 1, CTC 02 24 regions with the largest 186,722,775 of 186,813,212 mm³ (99.95 %).

## 2. Feature cover by more cuts (`cover.run.ts`, `cover.jsonl`)

- Holes as cylinders out along each open vector, pocket floors swept along the axis, all cut from the removal in one `BRepAlgoAPI_Cut` with a compound tool.
- 0.3 to 12.0 s per file (CTC 04 11,949 ms; CTC 02 7,741 ms).
- Not trustworthy: STC 07 and FTC 07 are the same shape and gave 2.11 % and 86.62 % covered. Not debugged.

## 3. Feature volumes from sizes (`volumes.run.ts`, `volumes.jsonl`)

- Hole segment: π (diameter / 2)² × depth. Pocket: the area of its faces' triangles facing along its axis, projected on the plane across it, × depth. Total removal: box (`bbox_in`) minus the solid's exact volume.
- 0 to 4 ms per file on top of the analysis.
- Holes plus pockets stay under the total on every file; explained 0.04 % (CTC 03) to 55.85 % (FTC 08 `-e2`). Twin files agree (FTC 07 / STC 07 both 0.47 %; FTC 10 47.00 % / STC 10 46.95 %).
- Most NIST removal is outside the profile, which no feature kind covers yet.
- FTC 08 `-e1-tg`: no features found, 0 %.

Morgan's answer (2026-11-11), from the options: "Numbers now, regions in P2a".
