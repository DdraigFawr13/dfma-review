// Port of tests/service/test_round4.py (D-018 round 4): a file whose solid has a gap is still read (and says so), and a
// circular-end pocket with chamfers round its floor is still a pocket. Parts are built with OpenCascade (the engine's
// wrapper), written to STEP and analysed end to end. Sizes in inches, modelled in mm.
import { expect, test } from "vitest";
import { ax2, BLOCK, box, chamfer, cut, IN, oc, pnt, pocketsOf, analyzeBytes, stepOf, type Shape } from "./groupb_common";
import type { OC } from "../oc";

const close = (a: number, b: number, abs: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(abs);
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const bytes = (s: string) => new TextEncoder().encode(s);

test("solid with a gap is read and the gap is listed", async () => {
  const o = await oc();
  const step = text(stepOf(o, new o.BRepPrimAPI_MakeBox(2 * IN, 1 * IN, 0.5 * IN).Shape()));
  const shell = /CLOSED_SHELL\('',\((#\d+),/.exec(step);
  expect(shell).not.toBeNull(); // drop the first face from the closed shell: its 4 edges now belong to one face only
  const result = await analyzeBytes(bytes(step.replace(shell![0], "CLOSED_SHELL('',(")), "box.step");
  expect(result.part.face_count).toBe(5);
  expect(result.assumptions.some((a: string) => a.includes("4 of its edges belong to one face only"))).toBe(true);
});

test("whole solid lists no gap", async () => {
  const o = await oc();
  const result = await analyzeBytes(stepOf(o, new o.BRepPrimAPI_MakeBox(2 * IN, 1 * IN, 0.5 * IN).Shape()), "box.step");
  expect(result.assumptions.some((a: string) => a.includes("gap"))).toBe(false);
});

/** Chamfer every edge that lies wholly at height z_in (the pocket floor's outline). */
function chamferFloor(o: OC, shape: Shape, zIn: number, sizeIn: number): Shape {
  const exp = new o.TopExp_Explorer(shape, o.TopAbs_ShapeEnum.TopAbs_EDGE, o.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const edges: Shape[] = [];
  for (; exp.More(); exp.Next()) {
    const edge = o.TopoDS.Edge(exp.Current());
    const c = new o.BRepAdaptor_Curve(edge);
    const zs = [0, 1, 2, 3, 4].map((k) => c.Value(c.FirstParameter() + ((c.LastParameter() - c.FirstParameter()) * k) / 4).Z());
    if (zs.every((z) => Math.abs(z - zIn * IN) < 1e-6)) edges.push(edge);
  }
  expect(edges.length).toBeGreaterThan(0);
  return chamfer(o, shape, edges, sizeIn * IN);
}

/** A slot-shaped prism (inches): straight sides from x0 to x1 at y +/- r, round ends, z to z + h. */
function stadium(o: OC, x0: number, x1: number, y: number, r: number, z: number, h: number): Shape {
  const P = (a: number, b: number) => pnt(o, a * IN, b * IN, z * IN);
  const arc = (cx: number, from: number, to: number) => // the circle of radius r about (cx, y), X axis along file +X, from..to radians
    new o.BRepBuilderAPI_MakeEdge(new o.gp_Circ(new o.gp_Ax2(P(cx, y), new o.gp_Dir(0, 0, 1), new o.gp_Dir(1, 0, 0)), r * IN), from, to).Edge();
  const seg = (a: ReturnType<typeof P>, b: ReturnType<typeof P>) => new o.BRepBuilderAPI_MakeEdge(a, b).Edge();
  const wire = new o.BRepBuilderAPI_MakeWire();
  for (const e of [seg(P(x0, y - r), P(x1, y - r)), arc(x1, -Math.PI / 2, Math.PI / 2), seg(P(x1, y + r), P(x0, y + r)),
    arc(x0, Math.PI / 2, (3 * Math.PI) / 2)]) wire.Add(e);
  const face = new o.BRepBuilderAPI_MakeFace(wire.Wire(), false).Face();
  return new o.BRepPrimAPI_MakePrism(face, new o.gp_Vec(0, 0, h * IN), false, true).Shape();
}

test("circular-end pocket with chamfers round its floor is a pocket", async () => {
  // A 2 x 0.5 in pocket with round ends, 0.5 in deep, inside the block; every floor edge chamfered.
  const o = await oc();
  const part = chamferFloor(o, cut(o, box(o, ...BLOCK), stadium(o, 1.0, 2.0, 1.0, 0.25, 0.5, 1)), 0.5, 0.03);
  const found = await pocketsOf(part);
  expect(found.length).toBe(1);
  close(found[0].dims_mm.depth, 0.5 * IN, 0.01);
});

test("a gapped main part beside a small closed body is still the part", async () => {
  // Stress test (HANDOFF 3a): a main part whose shell has a small gap, saved next to a small closed body, was dropped
  // silently and the small body analysed. The gap here is one small face cut out of a block with 8 holes (its 2 rim
  // circles open).
  const o = await oc();
  let main: Shape = new o.BRepPrimAPI_MakeBox(4 * IN, 2 * IN, 1 * IN).Shape();
  for (let i = 0; i < 8; i++) {
    main = cut(o, main, new o.BRepPrimAPI_MakeCylinder(ax2(o, [(0.4 + 0.45 * i) * IN, 1 * IN, -1], [0, 0, 1]), 0.1 * IN, 2 * IN).Shape());
  }
  const small = new o.BRepPrimAPI_MakeBox(pnt(o, 10 * IN, 0, 0), 0.25 * IN, 0.25 * IN, 0.25 * IN).Shape();
  const comp = new o.TopoDS_Compound();
  const builder = new o.BRep_Builder();
  builder.MakeCompound(comp);
  builder.Add(comp, main);
  builder.Add(comp, small);
  let step = text(stepOf(o, comp));
  const shells = [...step.matchAll(/CLOSED_SHELL\('',\(([^)]*)\)/g)].map((m) => m[1]);
  const big = shells.reduce((a, b) => ((b.match(/#/g) ?? []).length > (a.match(/#/g) ?? []).length ? b : a));
  const faces = big.split(",").map((f) => f.trim());
  const cylSurfaces = [...step.matchAll(/(#\d+)\s*=\s*CYLINDRICAL_SURFACE/g)].map((m) => m[1]);
  const gap = faces.find((f) => new RegExp(`${f}\\s*=\\s*ADVANCED_FACE\\([^;]*,(${cylSurfaces.join("|")}),`).test(step));
  expect(gap).toBeDefined();
  step = step.replace(big, faces.filter((f) => f !== gap).join(",")); // drop one hole's wall
  const result = await analyzeBytes(bytes(step), "gapmix.step");
  const bbox: number[] = result.part.bbox_in;
  const sorted = [...bbox].sort((a, b) => a - b);
  const near = (v: number[], w: number[]) => v.every((x, k) => Math.abs(x - w[k]) <= 1e-3);
  expect(near(bbox, [4.0, 2.0, 1.0]) || near(sorted, [1.0, 2.0, 4.0])).toBe(true);
  expect(result.assumptions.some((a: string) => a.includes("of its edges belong to one face only"))).toBe(true);
  expect(result.part.ignored_solids).toBe(1);
});
