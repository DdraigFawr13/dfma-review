// Port of tests/grading/child.py: one STEP file analysed by the browser engine for the grading scorer. The analysis is
// the app's own analyze() (engine/node.ts analyzeOrRefuse); a second reader of the same file gives each face's STEP
// entity name (MFCAD++ writes its label there), its position among the ADVANCED_FACEs and its whole-shape id, joined
// to our faces by index (the shapes of two readers are different objects). The scorer checks the face kinds agree.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { dot, faceInfo, type Vec } from "../engine/frame.ts";
import { Topology } from "../engine/features/holes.ts";
import { analyzeOrRefuse } from "../engine/node.ts";
import { OPEN_DIAG } from "../engine/features/pockets.ts";
import type { OC } from "../engine/oc.ts";
import { SOLID_ENTITIES, volume } from "../engine/read.ts";
import type { FaceRec, FeatureRec } from "./score.ts";

export const SECOND_FILE = "/grade-second.step";

interface Second {
  names: [string | null, number | null][]; shape: OC; faces: OC[]; kinds: string[]; solid: OC | null;
}

function explore(oc: OC, shape: OC, kind: OC): OC[] {
  const ex = new oc.TopExp_Explorer(shape, kind);
  const out: OC[] = [];
  for (; ex.More(); ex.Next()) out.push(ex.Current());
  ex.delete();
  return out;
}

/** Shells in no solid, closed into solids (read.py _solids_from_shells; the same rule as engine/read.ts). */
function closedShells(oc: OC, shape: OC, beside: boolean): OC[] {
  const E = oc.TopAbs_ShapeEnum;
  const out: OC[] = [];
  const ex = new oc.TopExp_Explorer(shape, E.TopAbs_SHELL, E.TopAbs_SOLID);
  for (; ex.More(); ex.Next()) {
    const shell = oc.TopoDS.Shell(ex.Current());
    const edges = new oc.NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher();
    oc.TopExp.MapShapesAndAncestors(shell, E.TopAbs_EDGE, E.TopAbs_FACE, edges);
    let free = 0;
    for (let i = 1; i <= edges.Size(); i++) if (edges.FindFromIndex(i).Size() === 1) free++;
    const n = edges.Size();
    edges.delete();
    if (beside && free > 0.1 * n) continue; // an open surface, not a gapped solid
    out.push(oc.TopoDS.Solid(new oc.ShapeFix_Solid().SolidFromShell(shell)));
  }
  ex.delete();
  return out;
}

/** child.py _step_names: each face's entity name and file position from a second reader of the same file. */
function secondRead(oc: OC, path: string, nFaces: number): Second {
  const E = oc.TopAbs_ShapeEnum;
  const none = (shape: OC): Second => ({ names: Array.from({ length: nFaces }, () => [null, null]), shape, faces: [], kinds: [], solid: null });
  const reader = new oc.STEPControl_Reader();
  reader.ReadFile(path);
  reader.TransferRoots();
  const shape = reader.NbShapes() ? reader.OneShape() : null;
  if (shape === null || shape.IsNull()) return none(null);
  let solids = explore(oc, shape, E.TopAbs_SOLID).map((s) => oc.TopoDS.Solid(s));
  const model = reader.StepModel();
  let declared = false;
  for (let i = 1; i <= model.NbEntities() && !declared; i++) declared = SOLID_ENTITIES.includes(model.Value(i).DynamicType().Name());
  if (declared) solids = solids.concat(closedShells(oc, shape, solids.length > 0)); // a declared solid with a gap: its shell is closed
  if (!solids.length) return none(shape);
  const vols = solids.map((s) => volume(oc, s));
  let best = 0;
  vols.forEach((v, i) => { if (v > vols[best]) best = i; });
  const map = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapes(solids[best], E.TopAbs_FACE, map);
  const faces: OC[] = [];
  for (let i = 1; i <= map.Size(); i++) faces.push(oc.TopoDS.Face(map.FindKey(i)));
  map.delete();
  const order = new Map<number, number>();
  for (let i = 1; i <= model.NbEntities(); i++) if (model.Value(i).DynamicType().Name() === "StepShape_AdvancedFace") order.set(i, order.size);
  const tr = reader.WS().TransferReader();
  const names = faces.map((face): [string | null, number | null] => {
    const ent = tr.EntityFromShapeResult(face, 1);
    if (!ent || ent.IsNull?.()) return [null, null];
    const name = typeof ent.Name === "function" ? ent.Name() : null;
    return [name && !name.IsNull?.() ? String(name.ToCString()) : null, order.get(model.Number(ent)) ?? null];
  });
  return { names, shape, faces, kinds: faces.map((f, i) => faceInfo(oc, i, f).kind), solid: solids[best] };
}

/** child.py short_walls: [wall, [faces past its top]] for each pocket wall whose top stops more than 0.01 mm below the
 *  pocket's depth, for the scorer's D-019 line (a slot closed by a short wall over a blind step). */
export function shortWalls(topo: Topology, pocket: { faces: number[]; axis: number[]; dims_mm: Record<string, number> }): [number, number[]][] {
  const n = pocket.axis as Vec;
  const faces = new Set(pocket.faces);
  const hs = new Map<number, number[]>();
  for (const i of faces) hs.set(i, topo.facePoints(i).map((p) => dot(p, n)));
  const normal = (i: number) => (topo.type(i) === "GeomAbs_Plane" ? faceInfo(topo.oc, i, topo.faces[i]).normal : null);
  const floors = [...faces].filter((i) => { const m = normal(i); return m !== null && dot(m, n) > 0.999; });
  if (!floors.length) return [];
  const lowest = (i: number) => Math.min(...hs.get(i)!);
  const floor = floors.reduce((a, b) => (lowest(b) < lowest(a) ? b : a)); // the first lowest, as min()
  const base = lowest(floor);
  const depth = pocket.dims_mm.depth;
  return [...faces].sort((a, b) => a - b).filter((w) => w !== floor && Math.max(...hs.get(w)!) - base < depth - 0.01)
    .map((w): [number, number[]] => [w, [...topo.neighbours(w).keys()].filter((k) => !faces.has(k)).sort((a, b) => a - b)]);
}

export interface GradeFile { faces: FaceRec[]; features: FeatureRec[]; ignored_solids: number; error: string | null; held_steps?: [string, number[]][] }

export async function gradeFile(oc: OC, path: string): Promise<GradeFile> {
  const bytes = new Uint8Array(readFileSync(path));
  const empty = (error: string): GradeFile => ({ faces: [], features: [], ignored_solids: 0, error });
  if (path.toLowerCase().endsWith(".brep")) return empty("the browser engine reads STEP only (no BREP reader)");
  [OPEN_DIAG.on, OPEN_DIAG.held] = [true, []]; OPEN_DIAG.why = new Map(); // D-093: the shapes left out of steps on purpose, for the scorer
  const r = (await analyzeOrRefuse(oc, bytes, basename(path), "mill")) as {
    error?: string; faces: { kind: string }[]; features: (FeatureRec & { open_vectors?: unknown[]; axis: number[]; dims_mm: Record<string, number> })[];
    part: { ignored_solids: number };
  };
  if (r.error) return empty(r.error);
  oc.FS.writeFile(SECOND_FILE, bytes);
  try {
    const second = secondRead(oc, SECOND_FILE, r.faces.length);
    const whole = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
    if (second.shape && !second.shape.IsNull()) oc.TopExp.MapShapes(second.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, whole);
    const faces: FaceRec[] = r.faces.map((f, i) => {
      const [name, pos] = second.names[i] ?? [null, null];
      const kind2 = second.kinds.length ? (i < second.kinds.length ? second.kinds[i] : null) : f.kind;
      const sid = second.shape && !second.shape.IsNull() && i < second.faces.length ? whole.FindIndex(second.faces[i]) : 0;
      return { kind: f.kind, kind2, name, file_pos: pos, shape_id: sid || null };
    });
    const kept = r.features.filter((f) => f.kind === "hole" || f.kind === "pocket" || f.kind === "step" || f.kind === "slot");
    const features: FeatureRec[] = kept.map((f) => ({
      kind: f.kind, faces: f.faces, open_ends: (f.open_vectors ?? []).length, ...(f.chain !== undefined ? { chain: f.chain } : {}),
    }));
    let topo: Topology | null = null;
    kept.forEach((f, i) => {
      if (f.kind !== "pocket" || !second.solid) return;
      topo ??= new Topology(oc, second.solid, second.faces);
      features[i].short_walls = shortWalls(topo, f);
    });
    return { faces, features, ignored_solids: r.part.ignored_solids, error: null, held_steps: OPEN_DIAG.held };
  } finally {
    oc.FS.unlink(SECOND_FILE);
  }
}
