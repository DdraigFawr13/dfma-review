// Build the steps and slots set: labelled STEP parts for the grading scorer (steps and slots spec, "Test set").
//   node web/scripts/make-set.mjs steps_slots      (writes the .step files, MANIFEST.md and INSTANCES.json here)
//
// Made with the engine's own OpenCascade (opencascade.js), labelled as ../bullnose_draft/make.py labels its parts:
// each face's MFCAD++ class in its STEP name, in file order. A face is a tool's when a point inside it lies ON the
// tool solid (the first tool in the list wins); a fillet made on the part is picked by a box round it instead. Classes
// (tests/grading/sets/undercuts/make.py names them): 5 V through slot, 6 rectangular through slot, 8 rectangular
// through step, 14 rectangular pocket, 17 rectangular blind slot, 18 round-end blind slot, 20 triangular blind step,
// 21 circular blind step, 22 rectangular blind step, 0 chamfer, 24 stock (an untouched block face).
// INSTANCES.json lists each step's and slot's faces (0-based, in file order) for the whole-feature count.
// Block 100 x 60 x 30 mm, top at z = 30, file axes. Sizes in mm.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadNodeOc } from "../../../../web/src/engine/node.ts";
import { uvBounds } from "../../../../web/src/engine/features/holes.ts";
import type { OC } from "../../../../web/src/engine/oc.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const [L, W, TOP] = [100, 60, 30];
const oc: OC = await loadNodeOc();
const progress = () => new oc.Message_ProgressRange();
const pnt = (x: number, y: number, z: number) => new oc.gp_Pnt(x, y, z);

type Box6 = [number, number, number, number, number, number];
/** A tool: a solid whose boundary a face lies on, or a box a fillet face's inner point lies in. */
type Tool = { shape?: OC; within?: Box6; cls: number; feature: "step" | "slot" | null };
interface Part { name: string; what: string; part: OC; tools: Tool[]; expect: string }

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  new oc.BRepPrimAPI_MakeBox(pnt(x0, y0, z0), x1 - x0, y1 - y0, z1 - z0).Shape();
const block = () => box(0, 0, 0, L, W, TOP);
const cyl = (x: number, y: number, z: number, r: number, h: number) =>
  new oc.BRepPrimAPI_MakeCylinder(new oc.gp_Ax2(pnt(x, y, z), new oc.gp_Dir(0, 0, 1)), r, h).Shape();

function boolean(kind: "cut" | "fuse", a: OC, b: OC): OC {
  const op = kind === "cut" ? new oc.BRepAlgoAPI_Cut(a, b, progress()) : new oc.BRepAlgoAPI_Fuse(a, b, progress());
  if (!op.IsDone()) throw new Error(`BRepAlgoAPI_${kind} failed`);
  return op.Shape();
}
const cut = (a: OC, ...tools: OC[]) => tools.reduce((s, t) => boolean("cut", s, t), a);
const fuse = (a: OC, b: OC) => boolean("fuse", a, b);

/** A prism over a closed polygon of [x, y] in the plane z = z0, h tall; or, with `alongX`, a polygon of [y, z] in the
 *  plane x = x0, extruded h along +X. */
function prism(points: number[][], z0: number, h: number, alongX = false): OC {
  const poly = new oc.BRepBuilderAPI_MakePolygon();
  for (const [a, b] of points) poly.Add(alongX ? pnt(z0, a, b) : pnt(a, b, z0));
  poly.Close();
  const face = new oc.BRepBuilderAPI_MakeFace(poly.Wire(), false).Face();
  return new oc.BRepPrimAPI_MakePrism(face, alongX ? new oc.gp_Vec(h, 0, 0) : new oc.gp_Vec(0, 0, h), false, true).Shape();
}

/** The edge whose midpoint is at `mid`. */
function edgeAt(shape: OC, mid: number[]): OC {
  const e = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for (; e.More(); e.Next()) {
    const ed = oc.TopoDS.Edge(e.Current());
    const c = new oc.BRepAdaptor_Curve(ed);
    const p = c.Value((c.FirstParameter() + c.LastParameter()) / 2);
    if (Math.max(Math.abs(p.X() - mid[0]), Math.abs(p.Y() - mid[1]), Math.abs(p.Z() - mid[2])) < 1e-6) return ed;
  }
  throw new Error(`no edge at ${mid}`);
}

function fillet(shape: OC, r: number, mids: number[][]): OC {
  const f = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  for (const m of mids) f.Add(r, edgeAt(shape, m));
  f.Build(progress());
  if (!f.IsDone()) throw new Error("fillet failed");
  return f.Shape();
}

function chamfer(shape: OC, d: number, mid: number[]): OC {
  const c = new oc.BRepFilletAPI_MakeChamfer(shape);
  c.Add(d, edgeAt(shape, mid));
  c.Build(progress());
  if (!c.IsDone()) throw new Error("chamfer failed");
  return c.Shape();
}

function rotate(shape: OC, about: number[], dir: number[], deg: number): OC {
  const t = new oc.gp_Trsf();
  t.SetRotation(new oc.gp_Ax1(pnt(about[0], about[1], about[2]), new oc.gp_Dir(dir[0], dir[1], dir[2])), (deg * Math.PI) / 180);
  return new oc.BRepBuilderAPI_Transform(shape, t, true, false).Shape();
}

/** A box tool with one vertical edge (at x, y) rounded to r: the inside corner of an L step. */
function roundedCorner(b: Box6, x: number, y: number, r: number): OC {
  const t = box(...b);
  return fillet(t, r, [[x, y, (b[2] + b[5]) / 2]]);
}

function parts(): Part[] {
  const P: Part[] = [];
  const step = (cls: number, shape: OC): Tool => ({ shape, cls, feature: "step" });
  const slot = (cls: number, shape: OC): Tool => ({ shape, cls, feature: "slot" });

  // J1 steps
  let t = box(-5, -5, 20, L + 5, 15, TOP + 5);
  P.push({ name: "st_through", what: "step 15 wide (y 0-15), 10 deep, along the whole X length", part: cut(block(), t),
    tools: [step(8, t)], expect: "1 step" });
  t = roundedCorner([80, -5, 20, L + 5, 15, TOP + 5], 80, 15, 3);
  P.push({ name: "st_l", what: "L step at the +X -Y corner, 20 x 15, 10 deep, walls meeting in a 3 mm radius",
    part: cut(block(), t), tools: [step(22, t)], expect: "1 step, 1 corner (r3)" });
  t = roundedCorner([-5, 52, 10, 10, W + 5, TOP + 5], 10, 52, 1);
  P.push({ name: "st_deep", what: "L step at the -X +Y corner, 10 x 8, 20 deep, walls meeting in a 1 mm radius",
    part: cut(block(), t), tools: [step(22, t)], expect: "1 step, 1 corner (r1)" });
  const a = box(-5, -5, 20, L + 5, 30, TOP + 5), b = box(-5, -5, 10, L + 5, 15, TOP + 5);
  P.push({ name: "st_stair", what: "two through steps: 10 deep (y 15-30) and 20 deep (y 0-15)", part: cut(block(), a, b),
    tools: [step(8, b), step(8, a)], expect: "2 steps" });
  t = box(-5, -5, 20, L + 5, 15, TOP + 5);
  P.push({ name: "st_fillet", what: "st_through with a 2 mm fillet between floor and wall", part: fillet(cut(block(), t), 2, [[L / 2, 15, 20]]),
    tools: [step(8, t), { within: [-1, 12.9, 19.9, L + 1, 15.1, 22.1], cls: 8, feature: "step" }], expect: "1 step" });
  t = box(-5, -5, 20, 20, 15, TOP + 5);
  P.push({ name: "st_blind_rect", what: "an L corner notch 20 x 15, 10 deep, at the -X -Y corner, sharp", part: cut(block(), t),
    tools: [step(22, t)], expect: "1 step, 1 sharp corner" });
  t = cyl(0, 0, 20, 15, 15);
  P.push({ name: "st_blind_round", what: "a quarter-round corner notch, radius 15, 10 deep, at the -X -Y corner", part: cut(block(), t),
    tools: [step(21, t)], expect: "1 step" });
  t = prism([[-5, -5], [30, -5], [-5, 20]], 20, 15);
  P.push({ name: "st_blind_tri", what: "a triangular corner notch, 10 deep, at the -X -Y corner (one wall)", part: cut(block(), t),
    tools: [step(20, t)], expect: "1 step" });
  t = box(-5, -5, 25, 60, W + 5, TOP + 5);
  P.push({ name: "st_face", what: "the top lowered 5 mm over x 0-60, leaving one wall at x = 60", part: cut(block(), t),
    tools: [step(8, t)], expect: "1 step" });

  // J2 slots (S2): no step call in S1
  t = fuse(box(40, 25, 22, L + 5, 35, TOP + 5), cyl(40, 30, 22, 5, 13));
  P.push({ name: "sl_blind_round", what: "slot 10 wide, 8 deep, from x = 40 out through +X, round end r5", part: cut(block(), t),
    tools: [slot(18, t)], expect: "1 slot (S2); no step" });
  t = box(40, 25, 22, L + 5, 35, TOP + 5);
  P.push({ name: "sl_blind", what: "slot 10 wide, 8 deep, from x = 40 out through +X, flat end, sharp corners", part: cut(block(), t),
    tools: [slot(17, t)], expect: "1 slot (S2); no step" });
  t = box(-5, 25, 22, L + 5, 35, TOP + 5);
  P.push({ name: "sl_through", what: "slot 10 wide, 8 deep, along the whole X length", part: cut(block(), t),
    tools: [slot(6, t)], expect: "1 slot (S2); no step" });
  t = box(-5, 28, 4, L + 5, 32, TOP + 5);
  P.push({ name: "sl_deep", what: "through slot 4 wide, 26 deep, along X", part: cut(block(), t),
    tools: [slot(6, t)], expect: "1 slot (S2); no step" });

  // J3 look-alikes
  P.push({ name: "st_chamfer", what: "a 45 deg 5 mm chamfer on the top edge at y = 0 (not a step)", part: chamfer(block(), 5, [L / 2, 0, TOP]),
    tools: [{ within: [-1, -1, TOP - 5.1, L + 1, 5.1, TOP + 1], cls: 0, feature: null }], expect: "no step" });
  const stepB = box(70, -5, 20, L + 5, 30, TOP + 5), pk = box(30, 10, 14, 70, 20, TOP + 5);
  P.push({ name: "pk_beside_step", what: "pocket 40 x 10, 16 deep, closed at +X by a short wall (z 14-20) over a blind step's floor (D-019)",
    part: cut(block(), stepB, pk), tools: [{ shape: pk, cls: 14, feature: null }, step(22, stepB)], expect: "1 pocket, unchanged" });
  t = box(25, 15, 18, 75, 45, TOP + 5);
  P.push({ name: "pk_control", what: "plain pocket 50 x 30 x 12, sharp corners (control)", part: cut(block(), t),
    tools: [{ shape: t, cls: 14, feature: null }], expect: "1 pocket, unchanged" });
  // A slot along X in a face tilted 20 deg about X: the wedge off the top, then the slot square to the new face
  const wedge = rotate(box(-5, -50, TOP - 10, L + 5, W + 50, TOP + 60), [0, 0, TOP - 10], [1, 0, 0], 20);
  const sl = rotate(box(-5, 25, TOP - 10 - 6, L + 5, 33, TOP + 40), [0, 0, TOP - 10], [1, 0, 0], 20);
  P.push({ name: "sl_angled", what: "slot 8 wide, 6 deep, along X in a face tilted 20 deg about X (no call)", part: cut(block(), wedge, sl),
    tools: [slot(6, sl)], expect: "no step, no slot" });
  t = prism([[22, TOP + 8], [38, TOP + 8], [30, TOP - 8]], -5, L + 10, true);
  P.push({ name: "vg_through", what: "90 deg V-groove along X, 16 wide at the top, 8 deep (no call)", part: cut(block(), t),
    tools: [{ shape: t, cls: 5, feature: null }], expect: "no step, no slot" });
  return P;
}

function solids(shape: OC): number {
  const e = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let n = 0;
  for (; e.More(); e.Next()) n++;
  e.delete();
  return n;
}

/** A point on the face's surface inside the face: the first of a 7 x 7 UV grid, from the middle out, that lies in it
 *  (a mesh centroid lies off a curved face by more than the classifier's 1e-5 mm). */
function surfacePoint(face: OC): number[] {
  const [u0, u1, v0, v1] = uvBounds(oc, face);
  const s = new oc.BRepAdaptor_Surface(face, true);
  const steps = [3, 2, 4, 1, 5, 0, 6];
  for (const i of steps) for (const j of steps) {
    const [u, v] = [u0 + ((u1 - u0) * (i + 0.5)) / 7, v0 + ((v1 - v0) * (j + 0.5)) / 7];
    const c = new oc.BRepClass_FaceClassifier(face, new oc.gp_Pnt2d(u, v), 1e-6, false, 0.1);
    if (String(c.State()) === "TopAbs_IN") {
      const p = s.Value(u, v);
      return [p.X(), p.Y(), p.Z()];
    }
  }
  throw new Error("no point inside a face");
}

/** The index of the first tool each face lies on, or null (bullnose_draft/make.py tool_index). */
function toolIndex(faces: OC[], tools: Tool[]): (number | null)[] {
  const classifiers = tools.map((t) => (t.shape ? new oc.BRepClass3d_SolidClassifier(t.shape) : null));
  return faces.map((face) => {
    const p = surfacePoint(face);
    const k = tools.findIndex((t, i) => {
      if (t.within) return p[0] >= t.within[0] && p[0] <= t.within[3] && p[1] >= t.within[1] && p[1] <= t.within[4] && p[2] >= t.within[2] && p[2] <= t.within[5];
      const q = pnt(p[0], p[1], p[2]);
      classifiers[i].Perform(q, 1e-5);
      return String(classifiers[i].State()) === "TopAbs_ON";
    });
    return k < 0 ? null : k;
  });
}

/** Write the part, then name each ADVANCED_FACE with its class, in file order (bullnose_draft/make.py write).
 *  Returns each face's label and tool index, in file order. */
function write(path: string, part: OC, tools: Tool[]): [number[], (number | null)[]] {
  const tmp = "/make-set.step";
  const w = new oc.STEPControl_Writer();
  w.Transfer(part, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress());
  if (String(w.Write(tmp)) !== "IFSelect_RetDone") throw new Error(`could not write ${path}`);
  const r = new oc.STEPControl_Reader();
  r.ReadFile(tmp);
  r.TransferRoots(progress());
  const shape = r.OneShape();
  const map = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapes(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, map);
  const faces: OC[] = [];
  for (let i = 1; i <= map.Size(); i++) faces.push(oc.TopoDS.Face(map.FindKey(i)));
  const hits = toolIndex(faces, tools);
  const model = r.StepModel();
  const tr = r.WS().TransferReader();
  const order = new Map<number, number>();
  for (let i = 1; i <= model.NbEntities(); i++) if (model.Value(i).DynamicType().Name() === "StepShape_AdvancedFace") order.set(i, order.size);
  const labels: (number | null)[] = Array.from({ length: order.size }, () => null);
  const byTool: (number | null)[] = Array.from({ length: order.size }, () => null);
  faces.forEach((face, i) => {
    const pos = order.get(model.Number(tr.EntityFromShapeResult(face, 1)))!;
    labels[pos] = hits[i] === null ? 24 : tools[hits[i]!].cls;
    byTool[pos] = hits[i];
  });
  if (labels.includes(null)) throw new Error(`${path}: a face with no STEP entity`);
  const text = new TextDecoder("latin1").decode(oc.FS.readFile(tmp) as Uint8Array);
  oc.FS.unlink(tmp);
  let k = 0;
  writeFileSync(path, text.replace(/ADVANCED_FACE\s*\(\s*'[^']*'/g, () => `ADVANCED_FACE('${labels[k++]}'`), "latin1");
  return [labels as number[], byTool];
}

const lines = ["# Steps and slots set", "",
  "Made by `make.ts` (`node web/scripts/make-set.mjs steps_slots` rebuilds it). Labels: MFCAD++ classes in each face's STEP name. "
  + "Score: `node web/scripts/grading.mjs grade mfcadpp tests/grading/sets/steps_slots`. Checks: `web/src/engine/port/steps_slots.test.ts`. "
  + "INSTANCES.json lists each step's and slot's faces. Block 100 x 60 x 30 mm, top at z = 30, sizes in mm.", "",
  "Part · what it tests · faces by class · expected"];
const instances: Record<string, { holes: number[][]; steps: number[][]; slots: number[][] }> = {};
for (const { name, what, part, tools, expect } of parts()) {
  if (solids(part) !== 1) throw new Error(`${name}: ${solids(part)} solids`);
  const [labels, byTool] = write(join(HERE, `${name}.step`), part, tools);
  const counts = [...new Set(labels)].sort((x, y) => x - y).map((c) => `${c}: ${labels.filter((l) => l === c).length}`).join(", ");
  const group = (kind: "step" | "slot") => {
    // one feature per tool of that kind; tools of one feature share a kind and are merged when they hold one feature
    const out = new Map<string, number[]>();
    byTool.forEach((k, pos) => {
      if (k === null || tools[k].feature !== kind) return;
      const key = tools[k].shape ? String(k) : "fillet";
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(pos);
    });
    if (out.has("fillet")) { // a fillet made on the part belongs to the first tool of its kind
      const first = [...out.keys()].find((k) => k !== "fillet")!;
      out.get(first)!.push(...out.get("fillet")!);
      out.delete("fillet");
    }
    return [...out.values()].map((f) => f.sort((x, y) => x - y));
  };
  instances[name] = { holes: [], steps: group("step"), slots: group("slot") };
  lines.push(`- \`${name}\` · ${what} · ${counts} · ${expect}`);
  console.log(name, counts);
}
writeFileSync(join(HERE, "MANIFEST.md"), lines.join("\n") + "\n");
writeFileSync(join(HERE, "INSTANCES.json"), JSON.stringify(instances, null, 1) + "\n");
