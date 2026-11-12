// Shared by the ported tests/service files test_rules, test_plan, test_turning, test_expected, test_round3_pockets,
// test_round4 and test_round5: the repo paths, one engine per test file, analyze() on a committed or built STEP file as
// the Python tests called it, and the OpenCascade builders the Python tests wrote with pythonocc (sizes in inches
// unless a name says mm). Test code only; the engine itself is untouched.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import { expect } from "vitest";
import type { Material, Process } from "../../api";
import { analyze } from "../analyze";
import type { IptPart } from "../inventor/part";
import { loadNodeOc } from "../node";
import type { OC } from "../oc";
import { readStep } from "../read";

export const ROOT = resolve(__dirname, "../../../..");
export const PARTS = resolve(ROOT, "tests/parts");
export const IN = 25.4;

let engine: Promise<OC> | null = null;
export function oc(): Promise<OC> {
  return (engine ??= loadNodeOc());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Result = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Feat = Record<string, any>;

export async function analyzeBytes(bytes: Uint8Array, name: string, process: Process = "mill", material: Material = "al6061",
  ipt?: IptPart): Promise<Result> {
  return analyze(await oc(), bytes, name, process, material, ipt ? { read: { part: ipt }, name: "p.ipt" } : undefined) as unknown as Result;
}

export function partBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(PARTS, `${name}.step`)));
}

/** analyze() on tests/parts/<name>.step. */
export function run(name: string, process: Process = "mill", material: Material = "al6061"): Promise<Result> {
  return analyzeBytes(partBytes(name), `${name}.step`, process, material);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Expected = { name: string; face_count: number; process?: string; material?: string; [k: string]: any };

export function expectedParts(): Expected[] {
  return ((parse(readFileSync(resolve(PARTS, "expected.toml"), "utf8")) as { part?: Expected[] }).part) ?? [];
}

export function expected(name: string): Expected {
  const found = expectedParts().find((p) => p.name === name);
  if (!found) throw new Error(`no expected part ${name}`);
  return found;
}

/** Ids of the faces within `tol` mm of a probe point, on the exact B-rep (tests/helpers.py faces_near, spec J3). */
export async function facesNear(bytes: Uint8Array, probe: number[], tol = 0.01): Promise<Set<number>> {
  const o = await oc();
  o.FS.writeFile("/probe.step", bytes);
  try {
    const step = readStep(o, "/probe.step");
    const p = new o.gp_Pnt(probe[0], probe[1], probe[2]);
    const vertex = new o.BRepBuilderAPI_MakeVertex(p).Vertex();
    const hits = new Set<number>();
    step.faces.forEach((face, id) => {
      const dist = new o.BRepExtrema_DistShapeShape(vertex, face, o.Extrema_ExtFlag.Extrema_ExtFlag_MIN, o.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad,
        new o.Message_ProgressRange());
      if (dist.IsDone() && dist.Value() <= tol) hits.add(id);
      dist.delete();
    });
    return hits;
  } finally {
    o.FS.unlink("/probe.step");
  }
}

// --- OpenCascade builders (the engine's own wrapper; pythonocc's names) ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Shape = any;

export const pnt = (o: OC, x: number, y: number, z: number) => new o.gp_Pnt(x, y, z);
export const dir = (o: OC, x: number, y: number, z: number) => new o.gp_Dir(x, y, z);
export const ax2 = (o: OC, p: number[], d: number[]) => new o.gp_Ax2(pnt(o, p[0], p[1], p[2]), dir(o, d[0], d[1], d[2]));

/** A box at (x, y, z) inches of l x w x h inches. */
export function box(o: OC, x: number, y: number, z: number, l: number, w: number, h: number): Shape {
  return new o.BRepPrimAPI_MakeBox(pnt(o, x * IN, y * IN, z * IN), l * IN, w * IN, h * IN).Shape();
}
export function boxMm(o: OC, x: number, y: number, z: number, dx: number, dy: number, dz: number): Shape {
  return new o.BRepPrimAPI_MakeBox(pnt(o, x, y, z), dx, dy, dz).Shape();
}
/** A cylinder up +Z from (x, y, z) inches, radius r, height h inches. */
export function cyl(o: OC, x: number, y: number, z: number, r: number, h: number): Shape {
  return new o.BRepPrimAPI_MakeCylinder(ax2(o, [x * IN, y * IN, z * IN], [0, 0, 1]), r * IN, h * IN).Shape();
}
export function cut(o: OC, shape: Shape, ...tools: Shape[]): Shape {
  for (const tool of tools) {
    const op = new o.BRepAlgoAPI_Cut(shape, tool, new o.Message_ProgressRange());
    if (!op.IsDone()) throw new Error("cut failed");
    shape = op.Shape();
  }
  return shape;
}
export function common(o: OC, a: Shape, b: Shape): Shape {
  return new o.BRepAlgoAPI_Common(a, b, new o.Message_ProgressRange()).Shape();
}
export function fuse(o: OC, a: Shape, b: Shape): Shape {
  return new o.BRepAlgoAPI_Fuse(a, b, new o.Message_ProgressRange()).Shape();
}

/** The shape as STEP bytes; `inch` sets the writer's unit to INCH as the Python helper did, else millimetres. */
export function stepOf(o: OC, shape: Shape, inch = false): Uint8Array {
  o.Interface_Static.SetCVal("write.step.unit", inch ? "INCH" : "MM");
  const writer = new o.STEPControl_Writer();
  writer.Transfer(shape, o.STEPControl_StepModelType.STEPControl_AsIs, true, new o.Message_ProgressRange());
  const path = "/built.step";
  if (String(writer.Write(path)) !== "IFSelect_RetDone") throw new Error("STEP write failed");
  const bytes = new Uint8Array(o.FS.readFile(path));
  o.FS.unlink(path);
  o.Interface_Static.SetCVal("write.step.unit", "MM");
  return bytes;
}

/** analyze() on a built shape. */
export async function analyzeShape(shape: Shape, process: Process = "mill", material: Material = "al6061", inch = false,
  name = "part.step"): Promise<Result> {
  return analyzeBytes(stepOf(await oc(), shape, inch), name, process, material);
}

/** The pocket features of a built shape (test_cut_pockets.pockets_of). */
export async function pocketsOf(shape: Shape): Promise<Feat[]> {
  return (await analyzeShape(shape)).features.filter((f: Feat) => f.kind === "pocket");
}

export const BLOCK = [0, 0, 0, 3, 2, 1] as const;
export const POCKET = [0.5, 0.5, 0.5, 2, 1, 1] as const; // 2 x 1 in, 0.5 in deep, open to +Z

/** The edge of `shape` whose parameter-midpoint is at `mid` (inches) within 1e-6 mm; the last such edge, as the Python loop. */
export function edgeAtMid(o: OC, shape: Shape, midIn: number[]): Shape {
  const exp = new o.TopExp_Explorer(shape, o.TopAbs_ShapeEnum.TopAbs_EDGE, o.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let found: Shape = null;
  for (; exp.More(); exp.Next()) {
    const edge = o.TopoDS.Edge(exp.Current());
    const c = new o.BRepAdaptor_Curve(edge);
    const p = c.Value((c.FirstParameter() + c.LastParameter()) / 2);
    if ([p.X(), p.Y(), p.Z()].every((v, k) => Math.abs(v - midIn[k] * IN) < 1e-6)) found = edge;
  }
  if (found === null) throw new Error(`no edge at ${midIn}`);
  return found;
}

export function chamfer(o: OC, shape: Shape, edges: Shape[], sizeMm: number): Shape {
  const op = new o.BRepFilletAPI_MakeChamfer(shape);
  for (const e of edges) op.Add(sizeMm, e);
  op.Build(new o.Message_ProgressRange());
  if (!op.IsDone()) throw new Error("chamfer failed");
  return op.Shape();
}

/** A straight prism over a closed polygon (x, y in inches) from z0 up h inches (round 3 hexagon, round 5 prism). */
export function prism(o: OC, points: number[][], z0: number, h: number): Shape {
  const poly = new o.BRepBuilderAPI_MakePolygon();
  for (const [x, y] of points) poly.Add(pnt(o, x * IN, y * IN, z0 * IN));
  poly.Close();
  const face = new o.BRepBuilderAPI_MakeFace(poly.Wire(), false).Face();
  return new o.BRepPrimAPI_MakePrism(face, new o.gp_Vec(0, 0, h * IN), false, true).Shape();
}

const PLANNED = ["hole", "pocket", "step", "slot", "profile", "bore", "groove"]; // what a setup holds (S5 mill, S6 lathe; steps S1)

/** test_expected.check_plan: machine, setups (each holding the features its probes name, in order), tools and tool loads,
 *  for entries that list them. `bytes` is the STEP file the probes are measured on. */
export async function checkPlan(bytes: Uint8Array, entry: Expected, result: Result): Promise<void> {
  if ("machine" in entry) expect(result.machine).toEqual(entry.machine);
  if ("setups" in entry) {
    expect(result.setups.map((s: Feat) => s.direction)).toEqual(entry.setups.map((s: Feat) => s.dir));
    const planned = result.features.filter((f: Feat) => PLANNED.includes(f.kind));
    for (let i = 0; i < entry.setups.length; i++) {
      const want = entry.setups[i];
      const got = result.setups[i];
      const named = new Set<string>();
      for (const probe of want.probes as number[][]) {
        const near = await facesNear(bytes, probe);
        const hit = planned.filter((f: Feat) => f.faces.some((x: number) => near.has(x))).map((f: Feat) => f.id);
        expect(hit.length, `probe ${probe} names ${hit}`).toBe(1);
        named.add(hit[0]);
      }
      expect(new Set(got.features), `${want.dir}: ${got.features} vs ${[...named]}`).toEqual(named);
    }
  }
  if ("tools" in entry) expect(result.tools.map((t: Feat) => t.id)).toEqual(entry.tools);
  if ("tool_changes" in entry) {
    expect(result.tool_changes).toEqual(entry.tool_changes);
    expect(entry.tool_changes).toEqual(result.operations.length);
  }
}
