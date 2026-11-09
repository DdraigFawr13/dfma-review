# Inventor parts I2 + I3: hole features, names, fillets and chamfers

- **Status:** Draft (fresh checks run 2026-11-09 on 1f7b97c; fixes below)
- **Planned in:** D-032 (phase plan, "Build order" I2 and I3), D-033 (names move to I2), D-037 and D-038 (one combined spec, own branch), chat 2026-11-09 (names: "Check, then ship"). **Decisions:** D-001, D-005, D-031, D-032, D-033, D-036, D-038.

Every "measured" fact below was measured in this session (2026-11-09) on the 16 NIST `.ipt` files in `tests/inventor/files/` with the scripts in [docs/research/inventor-i2-probe/](../research/inventor-i2-probe/README.md). Every unmeasured one says **Assumption**; every inference says **Inference**. Builds on the I1 spec, [inventor-i1-threads.md](inventor-i1-threads.md) (its words, upload, checks, refusals and Threads panel are not repeated here).

## Words used here

- **Tag:** an ACIS attribute record on a face, edge or vertex that names the Inventor features that made or changed it (I1 "Words": ACIS, SAB, record, main model). Each tag holds a list of **feature ids** (ints).
- **Harness:** `tests/inventor/register.py` and `nist_pair.analyze_registered` (I1 S2): they line up a NIST `.ipt` with its NIST STEP (which another CAD system wrote) and skip the pair check; tests and the demo only, never the app path.
- **Plain file:** one of the 13 NIST `.ipt` files that is not sheet metal (I1 J3 refuses CTC 03, FTC 09 2021 and 2024).
- **Hole feature:** one Inventor Hole command; it can place many **holes** (one per sketch point). **Copy:** a hole placed by a Rectangular Pattern, Circular Pattern or Mirror feature from a Hole feature's hole.
- **Blend feature:** an Inventor Fillet or Chamfer. Its faces carry blend tags.
- **Answer key:** `tests/inventor/holes_key.json`, InventorLoader's output only (D-031): name, sizes, type and sketch points of 91 Hole features in 10 files.

## Problem

Morgan (2026-11-08, D-031): "See if there is any way you can get that inventory data for like threads and holes and have it mapped to the part if possible maybe by hole size or position." I1 does threads. A STEP file has each hole's shape but not what the engineer designed: it can't say that 30 countersunk holes are one Hole feature, that 3 of 4 were copied by a mirror, what the feature is called in the Inventor browser, or what radius a fillet was given. The review today reports holes from shape alone and no fillet or chamfer sizes.

## Goals

- **Hole features (I2):** every Hole feature in an uploaded `.ipt` is listed with its type as designed (simple, counterbore, countersink), its sizes (diameter, depth or through, counterbore diameter and depth, countersink diameter and angle, drill point angle), its holes and which are copies; each hole is **matched**, **disagrees** (gap in mm, a finding) or **not mapped** (our limit, never a finding) (D-032).
- **Names (I2):** each Hole feature, and each thread's `feature_name`, shows its Inventor name when the rank rule applies, and nothing otherwise; never a guess (D-032, Morgan's "Check, then ship" 2026-11-09). Fillets and chamfers show no names (no answer key can check them, Open question 1).
- **Fillets and chamfers (I3):** every fillet feature with its radius, every chamfer with its two distances, each mapped to the STEP faces it made, with the three states; whether a disagreeing blend is a finding is Open question 3.
- **Measured on NIST, through the harness** (D-032's 95% is for exact pairs; NIST pairs come from two CAD systems): holes on a STEP hole axis within 0.01 mm (matched / disagrees / not mapped): CTC 01 10/0/0, CTC 02 42/6/4, CTC 04 48/5/1, CTC 05 13/5/0, FTC 08 2021 4/0/0, FTC 10 2021 34/1/0, STC 10 22/2/0 (173 of 197 matched); the rest lie 0.01 to 8.13 mm off because the two NIST files differ. This does not show D-032's 95%: that target is for exact pairs, so I2 is done only when Morgan's work pairs reach it (Verification). Names: 70 of 70 checkable Holes in the 8 files where the counts match, 0 wrong.

## Non-goals

- Patterns and mirrors of anything but holes; naming the pattern or mirror feature; telling a pattern from a mirror (Inference only from geometry; Open question 2).
- Hole termination as designed ("Through All" vs a depth that comes out the far side): the faces don't record it (12 key Holes designed to a depth come out through).
- Spotface, tapered or tapped-hole options beyond I1's thread record; slots; Hole features with a spline face.
- Variable-radius fillets, face fillets, setback corners: a blend whose faces are splines, or carry two radii, is not mapped (reason given).
- New findings from fillet sizes (e.g. a corner radius rule fed from the `.ipt`), cost drivers, material, `.iam` (later phases, D-032). Any AI at runtime (D-001). InventorLoader in the app (D-031).

## Journeys and checks

All Python tests go in `tests/service/`, browser tests in `tests/e2e/` (`e2e` marker), as I1. Each check fails at the starting commit (main fca375c, where `inventor/` reads threads only) unless marked **guard**.

### J1 Hole features of a matching pair

- **Given** an `.ipt` and its STEP that pass I1's pair check
- **When** the analysis runs
- **Then** the response's `inventor.hole_features` lists each Hole feature with its type, sizes and holes, each hole with its state and STEP hole id; the Hole features panel shows one row per feature; tapping a hole selects its STEP hole. **Check:** `tests/service/test_inventor_api.py::test_hole_features_in_process` (built pair: `tests/inventor/built.py` gains Hole features on `box_through_hole.step` and `drill_point_hole.step`); `tests/e2e/test_hole_features.py::test_panel` on the CTC 04 fixture.

### J2 Hole features read from NIST (harness)

- **Given** each NIST `.ipt`
- **When** `read_ipt` runs
- **Then** per file the Hole feature count and holes per feature are as measured (Hole features, holes: CTC 01 7, 10; CTC 02 28, 52; CTC 04 9, 54; CTC 05 5, 18; FTC 06 2021 9, 18; FTC 06 2024 4, 12; FTC 07 2024 3, 12; FTC 08 2021 1, 4 (1 drawn, 3 copies by ids 2187 and 2202); FTC 10 2021 11, 35; STC 10 9, 24; the other 6 files 0; the table goes in `tests/inventor/hole_counts.toml`); for every Hole the key covers, type and diameter equal the key's (73 checks, 0 misses), and depth equals the key's where the hole ends inside the part. **Check:** `tests/service/test_inventor_holes.py::test_counts`, `::test_against_key`.

### J3 Hole features mapped (harness)

- **Given** the 7 NIST pairs the harness lines up (CTC 01, 02, 04, 05, FTC 08 2021, FTC 10 2021, STC 10)
- **When** `analyze_registered` runs
- **Then** the counts per state in Goals, pinned in `tests/inventor/hole_counts.toml` (`[pair.<ipt name>] matched, disagrees, not_mapped`); CTC 04: 48 matched, 5 disagree (4 holes of `Hole20` 0.25 mm off, 1 of `Hole22` 3.23 mm off) and give 5 `hole_mismatch` findings, 1 not mapped (8.13 mm off, more than the STEP hole's 7 mm radius). **Check:** `tests/service/test_inventor_holes.py::test_mapping`.

### J4 Names

- **Given** each NIST `.ipt`
- **When** `read_ipt` runs
- **Then** each Hole feature's `name` equals the key's where the rank rule applies (8 files, 70 Holes), is `null` where the counts differ (FTC 06 2024, STC 10) and in files with no names; each thread's `feature_name` equals `names_key.json` for CTC 04 and FTC 10 2021 (`null` for STC 10, which passes today: a **guard**). **Check:** `tests/service/test_inventor_names.py` (now asserts names; the 6 existing tests keep passing, **guard**).

### J5 Fillets and chamfers

- **Given** each NIST `.ipt`, and the built pair
- **When** `read_ipt` and the mapping run
- **Then** fillet and chamfer counts and sizes as measured (CTC 01: 4 fillets, 2 chamfers 50 x 50 and 5 x 5 mm; CTC 04: 7 fillets of 25, 13, 5, 5, 5, 4 and 2.5 mm, 1 chamfer 5 x 5; CTC 05: 2 fillets, 1 chamfer 6.35 x 6.35; FTC 10 2021: 4 fillets 1, 2, 0.2 and 0.15 mm; the full table in `tests/inventor/blend_counts.toml`); on the 11 harness pairs (every plain file but FTC 07, whose pair the harness can't line up) no fillet face sits on a STEP face of its type and place with another radius except 1 on FTC 11, and 499 of 744 faces sit on one (pinned per pair as `faces`, `faces_mapped`). **Check:** `tests/service/test_inventor_blends.py`; `tests/e2e/test_blends.py::test_panel`.

### J6 Report

- **Given** an analysed pair with hole features and blends
- **When** Export PDF runs
- **Then** the summary page has "Hole features" and "Fillets and chamfers" sections after Threads, one line per feature; a disagreeing hole has its finding page. **Check:** `tests/e2e/test_pdf.py::test_pdf_hole_features`, `::test_pdf_blends`.

### J7 Hostile data

- **Given** a NIST `.ipt` whose tags are rewritten in place (feature-id list with no `-1`, an id list 10,000 long, a pointer off the record list, a loop that cycles)
- **When** it is read
- **Then** each bad tag is dropped and a feature left with a bad face is `not_mapped` with reason `feature data not understood`, never a refusal; the caps (64 pairs per tag, 10,000 steps per loop or coedge ring) are asserted directly, not by time. **Check:** `tests/service/test_inventor_safety.py::test_bad_tags` asserts the reason and the other features' states (it fails now: no feature is read). Built in S1 (holes) and extended in S3 (blends).
- **Guard:** without an `.ipt` the response is unchanged (`test_no_ipt_unchanged`).

## Decisions

- Our own reader; features mapped by position; three states; names in small print; NIST `.ipt` with checksums (D-031, D-032).
- Names ship only from a rule checked against an answer key with zero misses, else none (Morgan, 2026-11-09: "Check, then ship"; recorded as D-039 on approval).
- **Deliberate change to D-032** ("every name (default or renamed)"): a renamed Hole has no name, and makes the part show none (the counts differ); fillets and chamfers show none (no key). For Morgan on the approval page.
- I2 and I3 on branch `inventor-i2-i3`, one PR (D-038).

## Alternatives rejected

- **Hole features from the feature tree streams** (as InventorLoader does): rejected because the tree's node layout is undecoded (S3 probe: refs can't be told from data) and the face tags give the same features, types and sizes (73/73 against the key). Fails when a Hole leaves no tagged face: then it is not listed (measured: FTC 07 2021 and FTC 08 2024 have Hole names but no hole tags; the 2024 FTC 08 hole is an extrusion).
- **Names by linking feature ids to name nodes**: rejected after two attempts (S3 probe; this session: none of CTC 04's 9 ids appear as u16 or u32 in the 19 KB names stream). Fails on every file.
- **Names by position from the tree's sketch points**: the points' doubles sit in nodes 1459-1461 and 4104-4106 of CTC 04's large stream (measured for two holes), but the link from those nodes to a name is undecoded. Kept as the fallback if the rank rule breaks on a work pair.
- **Names by rank shown without a key check** (Morgan's option "Ship on 4 links"): rejected by Morgan.
- **Fillet radius from the STEP alone**: our STEP pipeline doesn't group blend faces into features; the `.ipt` gives the grouping and the radius directly.
- **InventorLoader in the app**: rejected by D-031 (GPL, and its output has no fillets or chamfers as features).

## Risks

- **The rank rule is an inference** that holds on 70 of 70 checkable Holes (8 files, Inventor 2021 and 2024), with no held-out files. Two faults could cancel out and shift every name by one with the counts still equal: a deleted Hole whose name lingers plus a Hole that left no tag (each seen alone: FTC 06 2024 and STC 10 have more names than ids). No file check can catch that case; the guard is Morgan's hand check of a work pair in Inventor before S2 merges (Verification). If it shows a wrong name, names are dropped (Morgan's rule). → Morgan's work pairs, each checked by hand in Inventor (S2 "Morgan tries"); a renamed feature in a work pair is the test. **Assumption:** renaming doesn't change feature ids.
- **Tags missing in some saves:** STC 10 has 9 Hole ids for 11 names (2 Holes left no hole tag), FTC 06 2024 4 for 7. Such Holes are not listed; the panel says "n Hole features in the browser, m read" when the name count is larger.
- Blend faces are mapped for 499 of 744 fillet faces on the 11 harness pairs (the rest have no STEP face of their type at their place, so they stay not mapped); the panel shows per feature how many of its faces were mapped.
- **Fillet vs chamfer by face shape** is an **inference**: Inventor writes the same blend tag for both. Plane and cone faces → chamfer, except a cone within 10 deg of its axis (CTC 02's 2-degree blend, counted with the Fillet names) → not mapped (`blend shape not understood`). Counts equal the names on all 12 plain files that have blends.
- **Chamfer distances** come from the faces next to the chamfer, assumed planar (plane chamfer) or a plane and a cylinder (cone chamfer); other neighbours give `not_mapped` (`chamfer neighbours not understood`). Checked on all 3 plain files that have chamfers (CTC 01, 04, 05; 0 misses against their STEP faces where the STEP has the face: CTC 01 7/7, CTC 05 2/2, CTC 04 12 planes and 4 of 12 cones).
- NIST pairs FTC 06 and FTC 07 are not lined up by the harness (FTC 06 8/18 and 4/12, FTC 07 2024 0/12 holes): left out of J3, as I1 left them out of J4.

## Design

### Parts

- `service/dfma/inventor/tags.py` (new): `feature_tags(recs) -> dict[int, list[Tag]]` by face record index; `Tag(kind, ids)`. Kinds: 2021 record name before the first `-` (`NMx_Hole_Brep_tag` → `hole`, `NMx_blend_tag` → `blend`); 2024 `ATTRIB_CUSTOM-attrib` first string (`INV_NMX_HOLE_TAG` → `hole`, `INV_NMX_BLEND_TAG` → `blend`). Ids: the ints after the version int (43 or 44) read as pairs `(k, id)` until `k == -1`; at most 64 pairs, else the tag is dropped. The owner is the tag's 4th pointer (index 3); a tag counts only when it points at a `face` record (measured: every hole and blend tag of the 16 files has its owner there, a face, edge or vertex; every pair list ends in `-1`). `k` (1 or 2, measured) is not used.
- `service/dfma/inventor/topo.py` (new): `face_points(recs, face)` and `neighbours(recs, face) -> dict[face, list[point]]`, with the measured pointer positions (README "Topology"); every pointer checked with `sab.ref`, loops and coedge rings capped at 10,000 steps.
- `service/dfma/inventor/surfaces.py` (new): `surface(recs, face) -> Surf` (`plane | cyl | cone | torus | sphere | other`, mm, unit axes; a cone's half-angle from its sine). Shared with `threads._face_kind` (which keeps its behaviour).
- `service/dfma/inventor/holes.py` (I2): `read_hole_features(recs, tags) -> list[HoleFeature]`; `map_holes(features, holes, faces, transform=None)` with the I1 mapping maths (`threads.py` "Mapping": `_cylinder` axis lines, gap = the larger distance of the hole's two ends from the STEP axis).
- `service/dfma/inventor/names.py` (I2): `hole_names(ole, n_ids) -> list[str] | None`.
- `service/dfma/inventor/blends.py` (I3): `read_blends(recs, tags) -> list[Blend]`; `map_blends(blends, faces, transform=None)`.
- `part.py`: `IptPart` gains `hole_features` (S1), `hole_names` and `hole_names_seen: int` (S2), `blends` (S3); `threads.Thread` gains `feature_id` (S2).
- `analyze.py`: after `map_threads`, `map_holes` then (I3) `map_blends`, on the same final hole list; `summary["inventor_holes"]`; rule `hole_mismatch` in `NEEDS_IPT`.
- `rules/hole_mismatch.py`: one finding per disagreeing hole; as `thread_mismatch` (severity medium, limit `PAIR_TOL_MM`, source `D-032`), title `<feature name or "Hole feature"> hole on <hole id>: <gaps>. Possible cause: the part or an old STEP export differs from the .ipt`; goes last in `RULES`.
- `web/`: a fold-away "Hole features" panel and a "Fillets and chamfers" panel after Threads, both hidden without an `.ipt`; layouts from the `ui-mockups` mock-ups at the start of S1 and S3. PDF sections in `report.ts`.

### Hole features (measured)

- A **Hole feature** is a feature id that is the **last** id of some face's hole tag. Ids before it on a face are the features that copied that face (FTC 08: `1997`; `2187, 1997`; `2202, 1997`; `2202, 2187, 1997`). A hole whose faces list copier ids is a copy, `copied_by` = those ids.
- Its **holes**: its `cyl` and `cone` faces grouped by axis line (axis to 4 decimals, the foot of the axis on the plane through the origin to 0.01 mm). Per hole: diameters of its cylinders; cones as (half-angle, rim diameter); span along the axis from its faces' points.
- **Type:** a cone of half-angle 59.0 ± 0.5 deg at the deep end is a drill point (118 deg, from the key's `DrillPointAngle`); any other cone at the open end makes it a countersink (angle = 2 × half-angle; key: 90 deg); two or more cylinder diameters make it a counterbore (the larger is the counterbore). Diameter = the smallest cylinder. On 73 key Holes: type 73/73, diameter 73/73 (within 0.01 mm).
- **Ends:** the deep end is the end of the span with the drill-point cone or a plane face of the feature across the axis; the open end is the other one (for a through hole with a counterbore or countersink, the end where that wider face sits). **Through:** no drill-point cone and no plane face of its feature across its axis at the deep end. `depth_mm` = span for a blind hole, `null` for a through hole (`length_mm` = span). Type priority: countersink if any non-drill-point cone, else counterbore if two or more diameters, else simple.
- **Holes of one feature on one line** (two coaxial holes of one Hole feature) stay one hole with their faces together; holes of different features on one line stay apart (CTC 01: several features share a STEP hole, measured), and several `.ipt` holes may map to one STEP hole.
- Measured counts per file go in `tests/inventor/hole_counts.toml` (S1).

### Names (measured; the rank rule)

- Hole names: every UTF-16 text matching `^Hole\d+$` in the smallest `RSeStorage/B` stream that has an `RSeStorage/M` partner and holds at least one such text (CTC 04: `Bnohvtlg…`, 19,013 bytes). Distinct texts, sorted by their number.
- If their count equals the count of Hole feature ids, the k-th smallest id gets the k-th name; else every name is `null` and `hole_names_seen` keeps the count. A thread's `feature_name` is its Hole feature's name (I1 S3: a thread record's 9th int, 10th in 2024, is its feature id).
- Checked against the key: 70 right, 0 wrong, 3 not checkable (key point not at a hole end) in the 8 files where the counts match.

### Blends (measured)

- A **blend feature** is a feature id of a face's blend tag when that tag holds one id; faces with two or more ids are corner patches of several blends, kept with the first and not used for sizes.
- **Fillet:** all its faces are `cyl`, `torus`, `sphere` (or splines, ignored) with one radius within 0.001 mm (cyl radius, torus minor radius, sphere radius). **Chamfer:** all faces are planes, or cones whose half-angle is 10 to 80 deg. Else `not_mapped` (`blend shape not understood`).
- **Chamfer distances:** plane chamfer: its two neighbour planes with the longest shared edges; distance on each = the largest distance of its shared-edge points from the other plane, divided by the sine of the angle between the planes. Cone chamfer: radial (rim diameter difference / 2) and axial (span). Reported as `[d1, d2]` sorted, mm; angle between the neighbours for plane chamfers.
- **Mapping (holes):** as I1's thread mapping: candidates are STEP holes and bores with a parallel axis whose gap is at most the STEP hole's radius; the one whose span overlaps most. **matched:** axis gap ≤ `PAIR_TOL_MM` (0.01 mm), diameter within 0.01 mm of the STEP hole's `dims_mm["diameter"]`, and for a blind hole depth within 0.01 mm (a through `.ipt` hole needs a through STEP hole); counterbore and countersink sizes are shown, not compared, in I2. **disagrees:** a candidate but a check fails; `gaps` as I1 (`{"what": "axis" | "diameter" | "depth" | "through", "mm", "text"}`). **not mapped:** no candidate (`no hole on this axis`), or a bad face (`feature data not understood`).
- **Mapping (blends):** each fillet face, transformed, to a STEP face of its type whose axis line (cyl), centre (torus, sphere) lies within 0.01 mm and whose radius is within 0.01 mm: `matched`; a face of that type at that place with another radius: `disagrees` (gap), no finding in I3 (Open question 3); no face: the face is not mapped. A feature is `disagrees` when any face disagrees (gap = the largest radius gap), else `matched` when all its sized faces are matched, else `not_mapped` (`faces_mapped` gives how many were); `step_faces` lists the STEP face ids it covers (tap to select).

### Response (added keys)

```
"inventor": {
  "hole_features": [{"id": "hf-1", "feature_id": 9186, "name": "Hole20" | null, "type": "simple" | "counterbore" | "countersink",
      "diameter_mm": 14.0, "depth_mm": 30.0, "through": false, "point_deg": 118 | null,
      "cbore_diameter_mm": null, "cbore_depth_mm": null, "csink_diameter_mm": 20.0 | null, "csink_deg": 90 | null,
      "holes": [{"id": "hf-1.1", "start": [x, y, z], "axis": [x, y, z], "copied_by": [], "state": "matched" | "disagrees" | "not_mapped",
                 "hole": "hole-36" | null, "gaps": [], "reason": null}],
      "reason": null}],
      "state": "matched" | "disagrees" | "not_mapped",
  "hole_names_seen": 9,
  "blends": [{"id": "bl-1", "feature_id": 3193, "kind": "fillet" | "chamfer", "radius_mm": 5.0 | null, "distances_mm": [5.0, 5.0] | null,
      "angle_deg": 90 | null, "faces": 24, "faces_mapped": 24, "state": "matched" | "disagrees" | "not_mapped", "step_faces": [12, 13], "gaps": [], "reason": null}]
}
```

Holes gain `"hole_feature": "hf-1"` when matched or disagreeing. On screen lengths in inches with mm in brackets (D-005), names in small print.

## Slices

### Builder defaults (from the fresh checks)

- Ids: `hf-<n>` in order of feature id; holes `hf-<n>.<m>` in order of their start point (x, then y, then z); blends `bl-<n>` by feature id. `hole` is the STEP feature id as `features` has it (`hole-36`).
- Dataclasses in their modules: `HoleFeature(feature_id, holes, type, diameter_mm, depth_mm, length_mm, through, point_deg, cbore_diameter_mm, cbore_depth_mm, csink_diameter_mm, csink_deg, name, reason)`, `IptHole(start, axis, copied_by, faces)`, `Blend(feature_id, kind, radius_mm, distances_mm, angle_deg, faces, reason)`. `IptPart` defaults: empty lists, `hole_names_seen = 0`. `inventor.hole_features` and `inventor.blends` are always lists when an `.ipt` is read; `name` is present and `null` until S2.
- Rounding: mm to 4 decimals in the response; on screen and in the PDF as I1 threads (inches first, mm in brackets, 2 decimals). Reasons live in `settings.py` beside the I1 messages.
- `hole_names_seen` text (S2): `<n> Hole features in the browser, <m> read`, only when n > m.
- `copied_by` is the copier ids in tag order; the row text is `<k> holes: <d> drawn, <c> copied by <p> pattern or mirror features` (S2).
- `hole_mismatch` title in S1 uses `Hole feature hf-<n>`; S2 swaps in the name when there is one.
- Cone chamfer: `distances_mm` = [radial, axial] sorted, `angle_deg` `null`. A plane chamfer whose two neighbour planes are parallel or not both planes is `not_mapped` (`chamfer neighbours not understood`).
- `make_demo.py` and the fixtures are regenerated in every slice that changes the response (S1, S2, S3); `built.py` gains Hole features in S1 and a filleted block in S3 (`tests/parts/` has none: S3 builds one with OpenCascade's `BRepFilletAPI_MakeFillet`, prototyped at the start of S3).
- `map_holes` takes the same list `map_threads` takes (`hole_list` plus bores, final ids, `analyze.py`) and `part.faces`; it writes `hole_feature` into those hole and bore dicts beside `thread`.
- `hole_mismatch` skips a STEP hole that already has a `thread_mismatch` finding (one finding per hole; the thread finding names the gap). Its `through` gap: `mm` = the difference between the `.ipt` length and the STEP depth, text `the .ipt hole is through, the STEP hole is blind` (or the reverse).
- Feature `state`: `disagrees` if any hole disagrees, else `not_mapped` if any is not mapped, else `matched` (a key on each feature, beside its holes).
- Tags: up to 64 pairs kept, 65 or more dropped; ids in record order, "last" = the pair just before `-1`. `copied_by` is filled in S1 (the data is in the tags); S2 adds its row text.
- J7: `tests/inventor/hostile.py` (S1) rewrites one tag or pointer of a NIST `.ipt` in place (as I1's J6 helper); S1 asserts hole tags and topology, the caps on `tags.feature_tags` and `topo.face_points` directly; S3 adds blend cases with the same helper.
- Names (S2): `read_ipt` reads them inside its open file (`names.hole_names(f: ole.Ipt) -> list[str]`) and `IptPart` gains `hole_names`; ties on stream size go to the stream name's sort order. `Thread.feature_id` (S2) is the record's 9th int (10th in 2024), `None` when the record is short. Names are English default names only: a localised Inventor writes other words, so such parts show no names (fails safe).
- Blends (S3): `map_blends(blends, faces, transform=None)` with `part.faces` from `read_step`; `step_faces` are indices into `part.faces`, as features' `faces` lists. Response adds `faces_mapped`. A blend is `matched` when at least one of its sized faces is matched and none disagree (the radius comes from the `.ipt` either way), `disagrees` when any face disagrees, else `not_mapped`. `distances_mm` keep the order of the neighbours (the longer shared edge first).
- Built filleted part (S3): `tests/inventor/built.py` makes a 40 x 30 x 20 mm block with a 3 mm fillet on one vertical edge and a 2 x 2 mm chamfer on one top edge (`BRepFilletAPI_MakeFillet`, `BRepFilletAPI_MakeChamfer`), and an `IptPart` whose `blends` hold the same two; expected: fillet r 3 matched, chamfer [2, 2] matched; with the fillet given r 3.5: `disagrees`, gap 0.5.
- Each slice ends with a status page and the rebuilt view-only demo (D-009); mock-ups use screenshots of the real viewer at 2x with `scripts/add_zoom.py` (D-024). S2 re-pins the `hole_mismatch` titles and PDF lines S1 pinned once names fill in.
- `surfaces.py` in S1 has tests for every surface kind (plane, cylinder, cone, torus, sphere) on the NIST files, not only those holes use.

### S1 Hole features read, typed and mapped

- **First:** the `ui-mockups` mock-up of the Hole features panel and its PDF section (screenshots of the real viewer, CTC 04), approved by Morgan before code.
- **Morgan tries:** the demo's CTC 04 shows 9 Hole features (e.g. 30 countersunk Ø14 holes, 90 deg, in one feature; 4 Ø10.106 holes with the M12 thread); 5 holes 0.25 to 3.23 mm off show as findings; a work pair shows its Hole features, all matched.
- **Checks that fail now:** J1, J2, J3, J6 (hole part), J7 (hole part), `test_rules.py::test_hole_mismatch` (3 built cases: axis, diameter, depth, each one medium finding with its gap; and a centred hole on the same part gives none while the others do).
- **Files:** `inventor/{tags,topo,surfaces,holes}.py`, `part.py`, `analyze.py`, `rules/hole_mismatch.py`, `rules/__init__.py`, `settings.py` (reasons); `web/src/{findings,report,api}.ts`, `web/index.html`, `web/src/main.ts`; `tests/inventor/{built,make_fixture,hole_counts.toml}`, fixtures regenerated; `tests/service/test_inventor_holes.py` (`test_against_key` pairs each key Hole with the `.ipt` feature whose hole axis passes within 0.01 mm of one of its `centres_mm` and has its diameter, as `docs/research/inventor-i2-probe/s28.py`), `test_rules.py`, `test_inventor_api.py`, `test_inventor_safety.py`; `tests/e2e/test_hole_features.py`, `test_pdf.py`; `scripts/make_demo.py`; `local_pairs.toml` hole counts.
- **Waits on:** Morgan's approval of this spec and of the mock-up.

### S2 Names and copies

- **Morgan tries:** the CTC 04 rows show `Hole8` … `Hole22`; thread rows show `Hole8`; FTC 08's feature shows "4 holes: 1 drawn, 3 copied by 2 pattern or mirror features"; STC 10 shows no names and "11 Hole features in the browser, 9 read". On a work pair, rename one Hole in Inventor, export, and check that its name shows (or no names show) and never a wrong one.
- **Checks that fail now:** J4 (the asserts go into the existing `test_inventor_names.py`); `test_inventor_holes.py::test_copies` (FTC 08 2021: 1 feature, 4 holes, copier ids 2187 and 2202, pinned in `hole_counts.toml`).
- **Files:** `inventor/names.py` (reads the streams through `ole.Ipt` under its caps), `threads.py` (`feature_id` from the record, `feature_name`), `holes.py`, `part.py`; `web/src/findings.ts`, `report.ts` (name in small print as I1 S3's defaults); `tests/service/test_inventor_names.py`; fixtures regenerated.
- **Waits on:** S1; before S2 merges, Morgan's hand check of one work pair in Inventor (work pairs are owed from 2026-11-12, D-035), so the PR merges no earlier than that check.

### S3 Fillets and chamfers (I3)

- **First:** the `ui-mockups` mock-up of the Fillets and chamfers panel, approved by Morgan.
- **Morgan tries:** the demo's CTC 04 lists 7 fillets (25, 13, 5, 5, 5, 4, 2.5 mm) and 1 chamfer 5 x 5 mm; tapping one highlights its faces; the PDF lists them.
- **Checks that fail now:** J5 (counts and sizes pinned in `tests/inventor/blend_counts.toml`: `[file.<ipt name>] fillets = [radii], chamfers = [[d1, d2]]`, and `faces_mapped` per harness pair), J6 (blend part), J7 (blend part).
- **Files:** `inventor/blends.py`, `part.py`, `analyze.py`; `web/src/{findings,report,api}.ts`, `web/index.html`; `tests/inventor/blend_counts.toml`; `tests/service/test_inventor_blends.py`, `test_inventor_safety.py`; `tests/e2e/test_blends.py`, `test_pdf.py`; demo.
- **Waits on:** S1 (tags, topology, surfaces).

## Verification

- Every push: `python scripts/check.py` in the dfma env with `DFMA_CHROMIUM` set and `set -o pipefail`.
- End to end: `tests/inventor/local_pairs.py` on Morgan's work pairs (owed from 2026-11-12, D-035), now with hole-feature and blend counts; at least 95% of their holes matched (D-032's "95% of Hole features map to a hole", read per hole, since one Hole feature places many holes; the per-feature rate is reported beside it); Morgan checks one part's names and sizes against Inventor, including one renamed Hole, before S2 merges (VER-07).

## Open questions

1. Fillet and chamfer names: no answer key can check them (InventorLoader gives none), so by Morgan's rule they don't show. Counts match the names on all 12 plain files that have blends. Recommendation: leave them out until a work pair is checked by hand in Inventor, then decide.
2. Pattern vs mirror: the tags say "copied by feature id n" but not which kind. Recommendation: show "copied by n pattern or mirror features"; naming each needs the tree decode.
3. A fillet whose radius disagrees with the STEP: a finding (`blend_mismatch`, like threads and holes), or shown in the panel only? Recommendation: a finding, as D-032 says ("disagrees … becomes a finding"); one face may on FTC 11 (a STEP torus at its place with other radii, unexplained). If yes, S3 adds `rules/blend_mismatch.py` as `hole_mismatch`.
