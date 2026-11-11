// Port of tests/inventor/built.py: built inputs for the passing app path (spec I1 S2 "Checks that fail now"): an IptPart
// made from a STEP test part itself (its corners and face count), plus threads (I1 S2) and Hole features (I2 S1) placed
// on its hole. Test data, not measured threads or features.
import type { Blend } from "../engine/inventor/blends";
import type { HoleFeature, IptHole } from "../engine/inventor/holes";
import { stepCorners } from "../engine/inventor/pair";
import { PLAIN_PART, type IptPart } from "../engine/inventor/part";
import type { Surf } from "../engine/inventor/surfaces";
import { surf } from "../engine/inventor/surfaces";
import type { Thread } from "../engine/inventor/threads";
import type { OC } from "../engine/oc";
import { readStep } from "../engine/read";
import type { Vec } from "../engine/inventor/sab";

/** A thread from `start` (mm) along the unit `axis` for `depth` mm. */
export function thread(start: Vec, axis: Vec, depth: number, o: Partial<Thread> & { id?: string } = {}): Thread {
  const end = [0, 1, 2].map((k) => start[k] + depth * axis[k]) as Vec;
  return {
    id: o.id ?? "thread-1", designation: o.designation ?? "1/4-20 UNC", cls: o.cls ?? "2B", standard: "ANSI Unified Screw Threads",
    pitch_mm: 1.27, depth_mm: depth, tap_drill_mm: o.tap_drill_mm ?? 5.11, minor_mm: o.minor_mm ?? [4.98, 5.25],
    major_mm: o.major_mm ?? [6.35, 6.48], start, end, axis, face: o.face ?? "hole", reason: null, feature_id: null, feature_name: null,
  };
}

/** A simple Hole feature of one hole from `start` (mm, the open end) along the unit `axis`; `length` is its drill
 *  cylinder's length (for a blind hole, the depth the STEP side measures). */
export function holeFeature(start: Vec, axis: Vec, diameter: number, length: number,
  o: { through: boolean; feature_id?: number; point_deg?: number | null; copied_by?: number[] }): HoleFeature {
  const hole: IptHole = {
    start, axis, copied_by: o.copied_by ?? [], faces: [], diameter_mm: diameter, length_mm: length, drill_length_mm: length,
    drill_lo_mm: 0.0, through: o.through, type: "simple", point_deg: o.point_deg ?? null, cbore_diameter_mm: null,
    cbore_depth_mm: null, csink_diameter_mm: null, csink_deg: null, reason: null,
  };
  return {
    feature_id: o.feature_id ?? 100, holes: [hole], type: "simple", diameter_mm: diameter, depth_mm: o.through ? null : length,
    length_mm: length, through: o.through, point_deg: o.point_deg ?? null, cbore_diameter_mm: null, cbore_depth_mm: null,
    csink_diameter_mm: null, csink_deg: null, name: null, reason: null,
  };
}

/** The IptPart of a STEP test part: its corners and face count, one plain body. `stepPath` is in the engine's file system. */
export function iptFromStep(oc: OC, stepPath: string, threads: Thread[], holeFeatures: HoleFeature[] = [], blends: Blend[] = []): IptPart {
  const step = readStep(oc, stepPath);
  return {
    saved_with: "2024.1 (Build 281209000, 209)", acis_version: "229.6.0.65535", subtype: PLAIN_PART, model_state_names: ["[Primary]"],
    solid_bodies: 1, corners_mm: stepCorners(oc, step.solid), face_count: step.faces.length, threads, hole_features: holeFeatures,
    hole_names: [], hole_names_seen: 0, blends,
  };
}

// box_through_hole.step: hole-1 is a 6.35 mm through hole on the line x 25.4, y 12.7, z 0 to 12.7 (measured)
export const BOX_TOP: Vec = [25.4, 12.7, 12.7];
export const DOWN: Vec = [0.0, 0.0, -1.0];
// drill_point_hole.step: hole-1 is 6.35 mm, 25.4 mm deep, blind, from z 50.8 down, at x 12.7, y 12.7 (measured)
export const DRILL_TOP: Vec = [12.7, 12.7, 50.8];

// I3 S3 (spec Builder defaults "Built filleted part"): a 40 x 30 x 20 mm block, x 0-40, y 0-30, z 0-20, with a 3 mm
// fillet on the vertical edge at x 0, y 0 and a 2 x 2 mm chamfer on the top edge at y 30, z 20.

/** Write the block as a STEP file (mm) at `path` in the engine's file system, with OpenCascade's own fillet and chamfer. */
export function filletedBlock(oc: OC, path: string): string {
  const edgeAt = (shape: OC, mid: Vec): OC => {
    const e = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    for (; e.More(); e.Next()) {
      const ed = oc.TopoDS.Edge(e.Current());
      const c = new oc.BRepAdaptor_Curve(ed);
      const p = c.Value((c.FirstParameter() + c.LastParameter()) / 2);
      if (Math.max(Math.abs(p.X() - mid[0]), Math.abs(p.Y() - mid[1]), Math.abs(p.Z() - mid[2])) < 1e-6) return ed;
    }
    throw new Error(`no edge at ${mid}`);
  };
  const box = new oc.BRepPrimAPI_MakeBox(40.0, 30.0, 20.0).Shape();
  const f = new oc.BRepFilletAPI_MakeFillet(box);
  f.Add(3.0, edgeAt(box, [0.0, 0.0, 10.0]));
  f.Build(new oc.Message_ProgressRange());
  const shape = f.Shape();
  const c = new oc.BRepFilletAPI_MakeChamfer(shape);
  c.Add(2.0, edgeAt(shape, [20.0, 30.0, 20.0]));
  c.Build(new oc.Message_ProgressRange());
  const w = new oc.STEPControl_Writer();
  w.Transfer(c.Shape(), oc.STEPControl_StepModelType.STEPControl_AsIs, true, new oc.Message_ProgressRange());
  if (String(w.Write(path)) !== "IFSelect_RetDone") throw new Error(`could not write ${path}`);
  return path;
}

/** The block's fillet (radius `filletR`, placed as the 3 mm one) and chamfer, as read_blends would give them. */
export function blockBlends(filletR = 3.0): Blend[] {
  const fillet: Blend = {
    feature_id: 200, kind: "fillet", radius_mm: filletR, distances_mm: null, angle_deg: null, faces: [0], copied_by: [],
    surfs: new Map<number, Surf>([[0, surf("cyl", [3.0, 3.0, 0.0], [0.0, 0.0, 1.0], filletR)]]),
    points: new Map<number, Vec[]>([[0, [[0.0, 3.0, 0.0], [3.0, 0.0, 0.0], [3.0, 0.0, 20.0], [0.0, 3.0, 20.0]]]]), reason: null,
  };
  const n = Math.SQRT1_2; // 2 ** -0.5 is 1 ulp low in V8; this is the correctly rounded value Python gives
  const chamfer: Blend = {
    feature_id: 201, kind: "chamfer", radius_mm: null, distances_mm: [2.0, 2.0], angle_deg: 90.0, faces: [1], copied_by: [],
    surfs: new Map<number, Surf>([[1, surf("plane", [0.0, 29.0, 19.0], [0.0, n, n])]]),
    points: new Map<number, Vec[]>([[1, [[0.0, 30.0, 18.0], [40.0, 30.0, 18.0], [40.0, 28.0, 20.0], [0.0, 28.0, 20.0]]]]), reason: null,
  };
  return [fillet, chamfer];
}
