// Port of service/dfma/read.py: read a STEP file into one solid in mm, with face ids.
import type { OC } from "./oc";
import { MSG_NO_SOLID, MSG_NOT_STEP } from "./settings";
import { unitName, type Unit } from "./units";

/** A refusal with the user's message (service/dfma/errors.py ReadError). */
export class ReadError extends Error {}

export const SOLID_ENTITIES = ["StepShape_ManifoldSolidBrep", "StepShape_BrepWithVoids", "StepShape_FacetedBrep"];
export const GAP_MAX_SHARE = 0.1; // assumption (read.py): beside closed solids, a shell with more than 10% of its edges
// on one face is an open surface, not a gapped solid

export interface ReadResult {
  solid: unknown; // TopoDS_Shape
  faces: unknown[]; // TopoDS_Face, index = face id
  unitsInFile: Unit;
  volumeMm3: number;
  ignoredSolids: number;
  freeEdges: number; // edges on one face only, when an open shell was read as the solid (D-018 round 4)
}

export function volume(oc: OC, shape: unknown): number {
  const props = new oc.GProp_GProps();
  oc.BRepGProp.VolumeProperties(shape, props, false, false, false);
  const v = Math.abs(props.Mass());
  props.delete();
  return v;
}

function explore(oc: OC, shape: unknown, kind: unknown, avoid?: unknown): unknown[] {
  const ex = avoid === undefined ? new oc.TopExp_Explorer(shape, kind) : new oc.TopExp_Explorer(shape, kind, avoid);
  const out: unknown[] = [];
  for (; ex.More(); ex.Next()) out.push(ex.Current());
  ex.delete();
  return out;
}

/** The length unit the file declares. The reader itself converts to mm (its default). */
export function fileLengthUnit(oc: OC, reader: OC): Unit {
  const seq = () => new oc.NCollection_Sequence_TCollection_AsciiString();
  const [lengths, angles, solidAngles] = [seq(), seq(), seq()];
  reader.FileUnits(lengths, angles, solidAngles);
  const names = new Set<string>();
  for (let i = 1; i <= lengths.Length(); i++) names.add(lengths.Value(i).ToCString());
  lengths.delete(); angles.delete(); solidAngles.delete();
  if (names.size === 0) return "none";
  if (names.size !== 1) return "other";
  return unitName([...names][0]);
}

function declaresSolid(reader: OC): boolean {
  const model = reader.StepModel();
  for (let i = 1; i <= model.NbEntities(); i++) if (SOLID_ENTITIES.includes(model.Value(i).DynamicType().Name())) return true;
  return false;
}

/** Shells in no solid, closed into solids, with their free-edge counts (read.py _solids_from_shells). */
function solidsFromShells(oc: OC, shape: unknown, besideSolids: boolean): [unknown[], number[]] {
  const E = oc.TopAbs_ShapeEnum;
  const solids: unknown[] = [];
  const free: number[] = [];
  for (const sh of explore(oc, shape, E.TopAbs_SHELL, E.TopAbs_SOLID)) {
    const shell = oc.TopoDS.Shell(sh);
    const edges = new oc.NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher();
    oc.TopExp.MapShapesAndAncestors(shell, E.TopAbs_EDGE, E.TopAbs_FACE, edges);
    let nFree = 0;
    for (let i = 1; i <= edges.Size(); i++) if (edges.FindFromIndex(i).Size() === 1) nFree++;
    const n = edges.Size();
    edges.delete();
    if (besideSolids && nFree > GAP_MAX_SHARE * n) continue; // an open surface, not a gapped solid
    free.push(nFree);
    solids.push(oc.TopoDS.Solid(new oc.ShapeFix_Solid().SolidFromShell(shell)));
  }
  return [solids, free];
}

/** Read the STEP file at `path` in the engine's file system. */
export function readStep(oc: OC, path: string): ReadResult {
  const E = oc.TopAbs_ShapeEnum;
  const reader = new oc.STEPControl_Reader();
  let status: unknown;
  try {
    status = reader.ReadFile(path);
  } catch {
    throw new ReadError(MSG_NOT_STEP); // OpenCascade raises on some malformed files
  }
  if (String(status) !== "IFSelect_RetDone") throw new ReadError(MSG_NOT_STEP); // the engine's enums are strings
  const units = fileLengthUnit(oc, reader);
  reader.TransferRoots();
  if (reader.NbShapes() === 0) {
    // Some files (1990s AP203 exports) hold solids with no product structure: transfer their solid B-reps directly.
    const model = reader.StepModel();
    for (let i = 1; i <= model.NbEntities(); i++) {
      const entity = model.Value(i);
      if (SOLID_ENTITIES.includes(entity.DynamicType().Name())) reader.TransferEntity(entity);
    }
  }
  const shape = reader.NbShapes() ? reader.OneShape() : null;
  let solids: unknown[] = [];
  let gaps: number[] = [];
  if (shape && !shape.IsNull()) {
    solids = explore(oc, shape, E.TopAbs_SOLID).map((s) => oc.TopoDS.Solid(s));
    gaps = solids.map(() => 0);
    if (declaresSolid(reader)) {
      const [closed, free] = solidsFromShells(oc, shape, solids.length > 0);
      solids = solids.concat(closed);
      gaps = gaps.concat(free);
    }
  }
  if (!solids.length) throw new ReadError(MSG_NO_SOLID);
  const volumes = solids.map((s) => volume(oc, s));
  let best = 0;
  volumes.forEach((v, i) => { if (v > volumes[best]) best = i; }); // first largest on a tie
  const solid = solids[best];
  const faceMap = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapes(solid, E.TopAbs_FACE, faceMap);
  const faces: unknown[] = [];
  for (let i = 1; i <= faceMap.Size(); i++) faces.push(oc.TopoDS.Face(faceMap.FindKey(i)));
  faceMap.delete();
  return { solid, faces, unitsInFile: units, volumeMm3: volumes[best], ignoredSolids: solids.length - 1, freeEdges: gaps[best] };
}
