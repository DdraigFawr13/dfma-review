# Feature names probe (I1 S3, 2026-11-09)

Throwaway research scripts, not app code, written from the bytes of the NIST files (no InventorLoader or Autodesk code read). Outcome: the half-session decode did not link a thread record to its feature name, so no names code ships in S3 and names move to I2 (D-033, D-037). The answer key is `tests/inventor/names_key.json`.

## Answer key (InventorLoader output only)

InventorLoader 1.5.1 in a scratch FreeCAD 26.3.0 env (conda-forge), run through the GUI binary offscreen. Its import dialog ("choose strategy") was answered with code 2, which gives the feature model ("nativ"): CTC 04 56 objects, 9 `PartDesign::Hole`. It reads no thread settings (`Threaded False` on every Hole), but gives each Hole's name, diameter and profile-sketch centres. Each of the 16 NIST threads lies 0.0000 mm from the axis through exactly one centre (next nearest 10.49 mm): CTC 04 thread-1..4 Hole8 (Ø10.106, the M12 minor diameter); FTC 10 2021 and 2024 thread-1,2 Hole17, thread-3,5 Hole9, thread-4,6 Hole16.

## Measured (16/16 threads)

- **Feature id:** the 9th int of the thread record (index 8 of `of("i")` in 2021; index 9 in the 2024 `ATTRIB_CUSTOM` form, which has one more leading int) is the same for every thread of one Hole feature and differs between features: CTC 04 2437 (Hole8); FTC 10 9337 (Hole17), 1604 (Hole9), 9190 (Hole16), the same values in 2021 and 2024.
- **Names:** UTF-16 in the largest feature stream (CTC 04 `RSeStorage/Blksix3fyxogg21deugps1wfkjj`, 1,095,103 bytes inflated; FTC 10 `Bdmeowcf…`), each `u32 length` + text + a 16-byte type id (Hole `1a7d751fd2119c54a00020803603c8c9`, Extrusion `3111a90cd0118b83000819b00524dc09`, Fillet `dc15f7f1d1114205000830b00524dc09`).
- **Nodes:** the matching `RSeStorage/M…` stream, inflated, holds at byte 14 a u32 count (CTC 04 10,261) and then one u32 size per node with the top bit set. A 14-byte header plus each node's size plus 9 bytes tiles the B stream exactly (end = 1,095,103). A reference is `0x80000000 | index`, and node numbers start at 1: with that, a Hole name node and its partner refer to each other (Hole8 = 3252 ↔ 5283 → 6411).

## Tried, no link found

- The ids 2437 / 9337 / 1604 / 9190 as u32, u16 and flagged refs in every stream: hits, but none beside a Hole name; one pair table in CTC 04 maps ref 2437 → 944, and node 944 leads to no name.
- A breadth-first walk of flagged refs from each Hole name node (depth 4): every Hole reaches thousands of nodes, the same for all Holes (the byte scan can't tell a ref from other data), and none reaches its thread's id except FTC 10's 1604 from every Hole alike.

## For I2

I2 must read Hole features (type, sizes, positions) anyway. Once a Hole node's centres are decoded, the name follows by position exactly as the key was built, with no need for the id link; or the node layouts (field types per type id) make the ref walk exact.
