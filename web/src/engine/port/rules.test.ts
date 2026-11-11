// Port of tests/service/test_rules.py: rules on single parts: hole_depth (J2), hole_size (S2), corner_radius and
// pocket_depth (S3), thin_wall (S4), and (built .ipt inputs) thread_mismatch, hole_mismatch, blend_mismatch. Parts that
// the Python tests built with pythonocc are built here with the engine's own OpenCascade wrapper.
import { expect, test, vi } from "vitest";
import type { Material, Process } from "../../api";
import { blockBlends, BOX_TOP, DOWN, DRILL_TOP, filletedBlock, holeFeature, iptFromStep, thread } from "../../inventor-harness/built";
import * as holeDepth from "../rules/hole_depth";
import * as settings from "../settings";
import { drills, pickEndMill } from "../tools";
import { pastLimit } from "../units";
import type { OC } from "../oc";
import type { IptPart } from "../inventor/part";
import type { Feature, PartSummary } from "../rules/types";
import { analyzeBytes, analyzeShape, boxMm, cut, expected, fuse, IN, oc, partBytes, run as runPart, stepOf, type Feat, type Result, type Shape } from "./groupb_common";
import type { Thread } from "../inventor/threads";

/** pytest.approx: `abs` when given, else a relative 1e-6 (and an absolute 1e-12). */
const near = (v: number, want: number, abs?: number) => expect(Math.abs(v - want), `${v} vs ${want}`).toBeLessThanOrEqual(abs ?? Math.max(1e-6 * Math.abs(want), 1e-12));
const run = (name: string, material: Material = "al6061", process: Process = "mill") => runPart(name, process, material);
const onlyHoles = (r: Result): Feat[] => r.features.filter((f: Feat) => f.kind === "hole");
const kind = (r: Result, k: string): Feat[] => r.features.filter((f: Feat) => f.kind === k);
const wallsOf = (r: Result): Feat[] => kind(r, "wall");
const one = <T>(xs: T[]): T => { expect(xs.length).toBe(1); return xs[0]; };
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const r3 = (v: number) => Math.round(v * 1e3) / 1e3;

test("deep hole", async () => {
  const result = await run("deep_hole");
  expect(result.rules_run).toEqual(["hole_depth", "hole_size", "corner_radius", "pocket_depth", "undercut", "thin_wall", "access", "looks_turned"]); // D-028
  const hole = one(onlyHoles(result));
  expect(hole.id).toBe("hole-1");
  expect(hole.kind).toBe("hole");
  near(hole.dims_mm.diameter, 6.35, 0.001);
  near(hole.dims_mm.depth, 50.8, 0.001);
  // The block's largest faces are its 1 x 2.5 in sides, so frame +Z is a side normal and the hole opens towards frame +Y (spec Flow step 5).
  expect(hole.open_dirs).toEqual(["+Y"]);
  expect(hole.open_vectors.length).toBe(1);
  const f = one(result.findings as Feat[]);
  expect([f.id, f.rule, f.severity]).toEqual(["F1", "hole_depth", "medium"]);
  expect(f.title).toBe("Hole depth 8.0× diameter (limit 6.0×)");
  near(f.measured, 8.0, 0.01);
  expect([f.limit, f.unit]).toEqual([6.0, "ratio"]);
  expect(f.feature).toBe("hole-1");
  expect(new Set(f.faces)).toEqual(new Set(hole.faces));
  expect(f.threshold_source).toBe("estimate");
  expect(f.suggestion).toBe("Needs peck drilling (drilling in short steps to clear chips). Make it shallower or larger if the design allows.");
});

test("very deep hole is high with its limit", async () => {
  const f = one((await run("very_deep_hole")).findings as Feat[]);
  expect([f.severity, f.limit]).toEqual(["high", 10.0]);
  expect(f.title).toBe("Hole depth 11.0× diameter (limit 10.0×)");
});

test("odd hole names nearest drill", async () => {
  const f = one((await run("odd_hole")).findings as Feat[]);
  expect([f.rule, f.unit]).toEqual(["hole_size", "in"]);
  expect(f.title).toBe("Hole 0.260 in not a standard drill size");
  near(f.measured, 0.26, 0.0005);
  near(f.limit, 17 / 64, 1e-6);
  expect(f.suggestion).toBe("Nearest drill 0.266 in (17/64). Use it if the fit allows.");
});

test("metric tie goes to smaller drill", async () => {
  // 6.55 mm sits exactly between the 6.5 and 6.6 mm drills.
  const g = one((await run("odd_metric_hole")).findings as Feat[]);
  near(g.limit, 6.5 / 25.4, 1e-6);
  expect(g.suggestion).toBe("Nearest drill 6.5 mm (0.256 in). Use it if the fit allows.");
});

test("mm files accept inch drills", async () => {
  // 6.35 mm is 1/4 in: inch-designed parts exported in mm are not flagged (D-013).
  expect((await run("box_through_hole")).findings).toEqual([]);
  expect(drills("mm").some((d) => Math.abs(d.diameter_mm - 6.35) < 1e-6)).toBe(true);
  expect(drills("inch").some((d) => Math.abs(d.diameter_mm - 6.5) < 1e-6)).toBe(false);
});

test("clean parts", async () => {
  for (const name of ["box_through_hole", "box_inch", "metric_hole", "flat_bottom_hole", "two_holes_web", "split_hole", "stepped_hole",
    "drill_point_hole", "clean_holes", "fillet_not_hole"]) expect((await run(name)).findings, name).toEqual([]);
});

test("drill point is part of the hole", async () => {
  const result = await run("drill_point_hole");
  const hole = one(onlyHoles(result));
  near(hole.dims_mm.depth, 25.4, 0.001); // to where the cone starts
  near(hole.dims_mm.point_mm, expected("drill_point_hole").point_mm, 0.001);
  expect(new Set(hole.faces.map((i: number) => result.faces[i].kind))).toEqual(new Set(["cylinder", "cone"]));
});

test("stepped hole segments share open ends", async () => {
  const holes = onlyHoles(await run("stepped_hole"));
  expect(holes.map((h) => r4(h.dims_mm.diameter / 25.4)).sort((a, b) => a - b)).toEqual([0.25, 0.4375]);
  expect(holes.map((h) => r4(h.dims_mm.depth / 25.4)).sort((a, b) => a - b)).toEqual([0.25, 0.75]);
  expect(holes.every((h) => h.open_vectors.length === 2)).toBe(true); // the chain opens on +Z and -Z
  const big = holes.reduce((a, b) => (b.dims_mm.diameter > a.dims_mm.diameter ? b : a));
  const small = holes.reduce((a, b) => (b.dims_mm.diameter < a.dims_mm.diameter ? b : a));
  expect(big.faces.length).toBe(2); // the shoulder belongs to the larger segment
  expect(small.faces.length).toBe(1);
  expect([...big.open_dirs].sort()).toEqual(["+Z", "-Z"]);
  expect([...small.open_dirs].sort()).toEqual(["+Z", "-Z"]);
});

test("through hole has two open dirs", async () => {
  expect([...one(onlyHoles(await run("odd_hole"))).open_dirs].sort()).toEqual(["+Z", "-Z"]);
});

test("blind holes have one open end", async () => {
  for (const [name, dirs] of [["flat_bottom_hole", ["-Z"]], ["drill_point_hole", ["+Y"]]] as const) {
    expect(one(onlyHoles(await run(name))).open_dirs, name).toEqual(dirs);
  }
  const holes = onlyHoles(await run("two_holes_web"));
  expect(holes.length).toBe(2);
  const [a, b] = holes;
  expect(a.open_vectors.length).toBe(1);
  expect(b.open_vectors.length).toBe(1);
  near(a.open_vectors[0].reduce((s: number, x: number, k: number) => s + x * b.open_vectors[0][k], 0), -1.0);
});

test("split hole is one through hole", async () => {
  const hole = one(onlyHoles(await run("split_hole")));
  expect(hole.faces.length).toBe(2);
  expect([...hole.open_dirs].sort()).toEqual(["+Z", "-Z"]);
});

// --- Geometry built here (pythonocc in the Python twin), sizes in inches ---

const boxIn = (o: OC, l: number, w: number, h: number): Shape => new o.BRepPrimAPI_MakeBox(l * IN, w * IN, h * IN).Shape();
const pointAt = (o: OC, x: number, y: number, z: number) => new o.gp_Pnt(x, y, z);
const axisAt = (o: OC, p: number[], d: number[]) => new o.gp_Ax2(pointAt(o, p[0], p[1], p[2]), new o.gp_Dir(d[0], d[1], d[2]));

/** A cylinder tool open to +Z: from `depth` below `top` to 1 mm above it; `angle` < 2 pi makes a half cylinder, `rotate` turns it. */
function blind(o: OC, x: number, y: number, top: number, d: number, depth: number, angle?: number, rotate = 0.0): Shape {
  const ax = axisAt(o, [x * IN, y * IN, (top - depth) * IN], [0, 0, 1]);
  if (rotate) ax.Rotate(new o.gp_Ax1(pointAt(o, x * IN, y * IN, 0), new o.gp_Dir(0, 0, 1)), rotate);
  return angle ? new o.BRepPrimAPI_MakeCylinder(ax, (d / 2) * IN, depth * IN + 1.0, angle).Shape()
    : new o.BRepPrimAPI_MakeCylinder(ax, (d / 2) * IN, depth * IN + 1.0).Shape();
}

/** _cyl of test_rules: a cylinder of diameter d (mm) and height h (mm) from (x, y, z) mm along `axis`, optionally partial. */
function cylD(o: OC, x: number, y: number, z: number, d: number, h: number, axis = [0, 0, 1], angle = 2 * Math.PI, start = 0.0): Shape {
  const ax = axisAt(o, [x, y, z], axis);
  if (start) ax.Rotate(new o.gp_Ax1(pointAt(o, x, y, z), new o.gp_Dir(axis[0], axis[1], axis[2])), start);
  return new o.BRepPrimAPI_MakeCylinder(ax, d / 2, h, angle).Shape();
}

test("holes above drill range are skipped", async () => {
  const o = await oc();
  const bore = new o.BRepPrimAPI_MakeCylinder(axisAt(o, [1.5 * 25.4, 1.5 * 25.4, -1], [0, 0, 1]), 0.75 * 25.4, 30).Shape();
  const result = await analyzeShape(cut(o, boxIn(o, 3, 3, 1), bore), "mill", "al6061", true, "bore_1500.step");
  expect(onlyHoles(result).length).toBe(1);
  expect(result.findings).toEqual([]); // a 1.500 in hole is above the 1 in drill range (D-010)
});

test("limits come from thresholds.toml", async () => {
  expect(settings.thresholds("ss304").hole_depth).toEqual({ medium: 6.0, high: 10.0, source: "estimate" });
  // analyze uses the chosen material's table: a stricter plastic limit turns deep_hole high.
  const real = settings.thresholds;
  const spy = vi.spyOn(settings, "thresholds").mockImplementation((m: string) =>
    (m === "plastic" ? { hole_depth: { medium: 4.0, high: 7.0, source: "test" } } : real(m)));
  try {
    const f = one((await run("deep_hole", "plastic")).findings as Feat[]);
    expect([f.severity, f.limit, f.threshold_source]).toEqual(["high", 7.0, "test"]);
    expect(one((await run("deep_hole", "al6061")).findings as Feat[]).severity).toBe("medium");
  } finally {
    spy.mockRestore();
  }
});

test("ratio at the limit is not flagged", async () => {
  // 0.250 in x 1.500 in is exactly 6.0x: "over 6.0" is medium, 6.0 itself is not.
  const o = await oc();
  const result = await analyzeShape(cut(o, boxIn(o, 1, 1, 2), blind(o, 0.5, 0.5, 2, 0.25, 1.5)), "mill", "al6061", true);
  expect(result.findings).toEqual([]);
});

// --- Geometry the fresh review raised (S2 review, 2026-11-06) ---

test("ball bottom hole is blind", async () => {
  const o = await oc();
  const ball = new o.BRepPrimAPI_MakeSphere(pointAt(o, 0.5 * IN, 0.5 * IN, 1.0 * IN), 0.125 * IN).Shape();
  const tool = fuse(o, blind(o, 0.5, 0.5, 2, 0.25, 1.0), ball);
  const hole = one(onlyHoles(await analyzeShape(cut(o, boxIn(o, 1, 1, 2), tool), "mill", "al6061", true)));
  expect(hole.open_vectors.length).toBe(1); // a ball-end bottom closes the hole
  near(hole.dims_mm.depth, 25.4, 0.01);
});

test("split blind hole keeps its bottom", async () => {
  const o = await oc();
  const halves = [blind(o, 0.5, 0.5, 2, 0.25, 1.0, Math.PI), blind(o, 0.5, 0.5, 2, 0.25, 1.0, Math.PI, Math.PI)];
  const result = await analyzeShape(cut(o, boxIn(o, 1, 1, 2), ...halves), "mill", "al6061", true);
  const hole = one(onlyHoles(result));
  expect(hole.open_vectors.length).toBe(1);
  expect(new Set(hole.faces.map((i: number) => result.faces[i].kind))).toEqual(new Set(["cylinder", "plane"]));
});

test("half faces at different heights are not a hole", async () => {
  // Two 180 deg half-cylinders of one radius and axis, at different depths: a stepped U, not a hole.
  const o = await oc();
  const tools = [blind(o, 0.5, 0.5, 2, 0.25, 0.5, Math.PI), blind(o, 0.5, 0.5, 2, 0.25, 1.0, Math.PI, Math.PI)];
  const holes = onlyHoles(await analyzeShape(cut(o, boxIn(o, 1, 1, 2), ...tools), "mill", "al6061", true));
  expect(holes.every((h) => h.dims_mm.depth < 0.5 * IN + 0.01)).toBe(true); // never one 1.0 in deep "hole"
});

test("groove in bore is not a hole", async () => {
  const o = await oc();
  const bore = blind(o, 1, 1, 1, 0.5, 1.0 + 0.04);
  const groove = new o.BRepPrimAPI_MakeCylinder(axisAt(o, [IN, IN, 0.4 * IN], [0, 0, 1]), 0.3 * IN, 0.2 * IN).Shape();
  const holes = onlyHoles(await analyzeShape(cut(o, boxIn(o, 2, 2, 1), bore, groove), "mill", "al6061", true));
  // One 0.5 in bore through the groove (HANDOFF 3a: it was two pieces, one either side), no 0.6 in groove
  expect(holes.map((h) => r3(h.dims_mm.diameter / IN))).toEqual([0.5]);
  near(holes[0].dims_mm.depth, 1.0 * IN, 1e-3);
});

test("cross hole does not open a blind hole", async () => {
  const o = await oc();
  const cross = new o.BRepPrimAPI_MakeCylinder(axisAt(o, [-1, 0.5 * IN, 1.5 * IN], [1, 0, 0]), 0.0625 * IN, IN + 2).Shape();
  const holes = onlyHoles(await analyzeShape(cut(o, boxIn(o, 1, 1, 2), blind(o, 0.5, 0.5, 2, 0.25, 1.0), cross), "mill", "al6061", true));
  const main = holes.reduce((a, b) => (b.dims_mm.diameter > a.dims_mm.diameter ? b : a));
  expect(main.open_vectors.length).toBe(1); // the cross hole breaks through its wall, not its ends
});

// --- S3: pockets and inside corners (spec S3 "Settled at build") ---

test("pick end mill", () => {
  let got = pickEndMill(0.150 * IN, 1.0 * IN);
  near(got[0], 0.25 * IN);
  expect(got[1]).toBe(false);
  near(pickEndMill(0.125 * IN, 1.0 * IN)[0], 0.25 * IN); // radius equal to the tool's fits
  near(pickEndMill(0.150 * IN, 0.2 * IN)[0], 0.1875 * IN); // the gap limits it
  got = pickEndMill(0.0, 1.0 * IN); // nothing fits a sharp corner
  near(got[0], 0.03125 * IN);
  expect(got[1]).toBe(true);
});

test("fillet pocket is one pocket and four corners", async () => {
  const result = await run("fillet_not_hole");
  const pocket = one(kind(result, "pocket"));
  const corners = kind(result, "corner");
  expect(corners.map((c) => c.id)).toEqual(["corner-1", "corner-2", "corner-3", "corner-4"]);
  // The frame takes +Z from the part's faces (spec Flow step 5): here file -Z, as for flat_bottom_hole.
  expect(pocket.id).toBe("pocket-1");
  expect(pocket.open_dirs).toEqual(["-Z"]);
  const dims = pocket.dims_mm;
  near(dims.depth, 0.5 * IN, 0.001);
  near(dims.min_corner_radius, 0.1 * IN, 0.001);
  near(dims.narrowest_width, 1.0 * IN, 0.001); // not the 0.141 in across a fillet
  near(dims.end_mill_mm, 0.1875 * IN);
  expect(dims.undersized).toBe(0);
  expect(new Set(pocket.faces.map((i: number) => result.faces[i].kind))).toEqual(new Set(["plane", "cylinder"]));
  expect(pocket.faces.length).toBe(9); // floor, 4 walls, 4 fillets
  for (const c of corners) {
    near(c.dims_mm.radius, 0.1 * IN, 0.001);
    expect(c.open_dirs).toEqual([]);
    expect(c.open_vectors).toEqual([]);
    expect(c.faces.length).toBe(1);
    expect(c.faces.every((x: number) => pocket.faces.includes(x))).toBe(true);
    expect("edge_mm" in c).toBe(false); // a fillet is drawn as its own face
  }
  expect(result.findings).toEqual([]);
});

test("pocket fillets are analysed", async () => {
  // A guard: pocket faces are never listed as not analysed. (S1 listed only torus and other faces, so cylinder fillets were
  // never listed; this keeps it so once torus fillets join pockets.)
  const result = await run("fillet_not_hole");
  const pocketFaces = new Set<number>(kind(result, "pocket")[0].faces);
  expect(result.part.not_analysed_faces.filter((x: number) => pocketFaces.has(x))).toEqual([]);
});

test("sharp corner and undersized tool", async () => {
  const result = await run("pocket_sharp");
  const findings: Feat[] = result.findings;
  expect(findings.map((f) => f.rule)).toEqual(["corner_radius", "corner_radius", "corner_radius", "corner_radius", "pocket_depth"]);
  const c = findings[0];
  expect([c.id, c.severity, c.feature]).toEqual(["F1", "high", "corner-1"]);
  expect(c.title).toBe("Sharp inside corner: needs EDM (spark erosion) or a corner radius");
  expect([c.measured, c.limit, c.unit]).toEqual([0, 0.03125, "in"]);
  expect(c.suggestion).toBe("Add a corner radius of 0.031 in (1/32) or more; a larger radius lets a larger end mill cut the pocket.");
  expect(c.faces.length).toBe(2); // the two walls that meet at the sharp edge
  const corner = result.features.find((f: Feat) => f.id === "corner-1");
  const [[x0, y0, z0], [x1, y1, z1]] = corner.edge_mm; // the sharp edge itself, for the viewer
  near(Math.abs(z1 - z0), 0.25 * IN, 0.001);
  near(x0, x1, 1e-6);
  near(y0, y1, 1e-6);
  const p = findings[4];
  expect(p.title).toBe("Pocket depth 8.0× the end mill that fits (limit 3.0×)");
  near(p.measured, 8.0, 0.01);
  expect([p.limit, p.unit]).toEqual([3.0, "ratio"]);
  expect(p.suggestion.endsWith("Smallest tool used: no end mill in the list fits the corners.")).toBe(true);
  expect(kind(result, "pocket")[0].dims_mm.undersized).toBe(1);
});

test("small radius title", async () => {
  const f = (await run("pocket_small_radius")).findings[0];
  expect(f.title).toBe("Corner radius 0.020 in under 0.031 in (1/32)");
  near(f.measured, 0.02, 0.0005);
  expect(f.limit).toBe(0.03125);
  expect(f.suggestion).toBe("Make the corner radius 0.031 in (1/32) or more if the design allows.");
});

test("long thin tool corner and depth", async () => {
  const findings: Feat[] = (await run("pocket_long_thin_tool")).findings;
  const [c, p] = [findings[0], findings[4]];
  expect([c.severity, c.unit, c.limit]).toEqual(["medium", "ratio", 4.0]);
  expect(c.title).toBe("Corner radius 0.050 in: the end mill that fits cuts 5.3× its diameter deep (limit 4.0×)");
  expect(c.suggestion).toBe("Make the corner radius or the gap larger, or the pocket shallower, if the design allows.");
  expect(p.title).toBe("Pocket depth 5.3× the end mill that fits (limit 3.0×)");
  expect(p.suggestion).toBe("Cut it in 6 passes of 0.083 in each (at most 1× the tool per pass, an estimate); the tool still reaches 0.500 in deep, "
    + "so it is a long-reach 3/32 in end mill. Or make the pocket shallower, or its corners and gaps larger, if the design allows."); // D-052
  expect([p.passes, r4(p.pass_in)]).toEqual([6, 0.0833]);
});

/** make_parts.pocket_part(depth, r) for the default 3 x 2 x 1 in block with a 2 x 1 in pocket: a box tool whose 4 vertical
 *  edges are filleted with radius r, cut from the block (inches). */
function pocketPart(o: OC, depth: number, r: number): Shape {
  let tool: Shape = new o.BRepPrimAPI_MakeBox(pointAt(o, 0.5 * IN, 0.5 * IN, (1 - depth) * IN), 2 * IN, 1 * IN, (depth + 0.5) * IN).Shape();
  if (r) {
    const fillet = new o.BRepFilletAPI_MakeFillet(tool, o.ChFi3d_FilletShape.ChFi3d_Rational);
    const edges = new o.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
    o.TopExp.MapShapes(tool, o.TopAbs_ShapeEnum.TopAbs_EDGE, edges);
    for (let i = 1; i <= edges.Size(); i++) {
      const edge = o.TopoDS.Edge(edges.FindKey(i));
      const c = new o.BRepAdaptor_Curve(edge);
      const [a, b] = [c.Value(c.FirstParameter()), c.Value(c.LastParameter())];
      if (Math.abs(a.X() - b.X()) < 1e-9 && Math.abs(a.Y() - b.Y()) < 1e-9 && Math.abs(a.Z() - b.Z()) > 1e-6) fillet.Add(r * IN, edge);
    }
    fillet.Build(new o.Message_ProgressRange());
    tool = fillet.Shape();
  }
  return cut(o, boxIn(o, 3, 2, 1), tool);
}

test("both medium corner reasons join", async () => {
  // 0.020 in corners 0.400 in deep: under 1/32 in, and the 1/32 in end mill cuts 12.8x deep.
  const o = await oc();
  const f = (await analyzeShape(pocketPart(o, 0.4, 0.020), "mill", "al6061", true)).findings[0];
  expect(f.title).toBe("Corner radius 0.020 in under 0.031 in (1/32); the end mill that fits cuts 12.8× its diameter deep (limit 4.0×)");
  expect(f.unit).toBe("in");
  near(f.measured, 0.02, 0.0005); // the radius reason leads
  expect(f.suggestion).toBe("Make the corner radius 0.031 in (1/32) or more if the design allows. "
    + "Make the corner radius or the gap larger, or the pocket shallower, if the design allows.");
});

test("island narrows the tool", async () => {
  const result = await run("pocket_island");
  const pocket = one(kind(result, "pocket"));
  near(pocket.dims_mm.narrowest_width, 0.2 * IN, 0.001);
  near(pocket.dims_mm.end_mill_mm, 0.1875 * IN);
  near(pocket.dims_mm.depth, 0.6 * IN, 0.001); // floor to the rim, not the island top
  expect(kind(result, "corner").length).toBe(4); // the island's convex edges are not corners
  expect(pocket.faces.length).toBe(13); // floor, 4 walls, 4 fillets and the 4 island walls (not the island top)
});

test("holes are not pockets", async () => {
  for (const name of ["flat_bottom_hole", "stepped_hole", "deep_hole", "box_through_hole"]) expect(kind(await run(name), "pocket"), name).toEqual([]);
});

test("clean pockets", async () => {
  for (const name of ["pocket_deep_wide", "clean_pocket"]) expect((await run(name)).findings, name).toEqual([]);
});

test("missing rule table skips the rule", async () => {
  const spy = vi.spyOn(settings, "thresholds").mockImplementation(() => ({ hole_depth: { medium: 6.0, high: 10.0, source: "t" } }));
  try {
    expect((await run("pocket_sharp")).findings).toEqual([]);
  } finally {
    spy.mockRestore();
  }
});

test("S3 thresholds per material", () => {
  for (const m of ["al6061", "steel1018", "ss304", "plastic"]) {
    const t = settings.thresholds(m);
    expect(t.corner_radius).toEqual({ min_radius_in: 0.03125, max_depth_ratio: 4.0, source: "estimate" });
    // D-052: the deepest cut per pass, 0.5× the tool in stainless
    expect(t.pocket_depth).toEqual({ medium: 3.0, pass_xd: m === "ss304" ? 0.5 : 1.0, source: "estimate" });
  }
});

test("pocket rules run for mill only", async () => {
  // Spec "Flow": corner_radius and pocket_depth run for mill only (review finding, S3).
  const result = await run("pocket_sharp", "al6061", "turn");
  expect(result.rules_run).not.toContain("corner_radius");
  expect(result.rules_run).not.toContain("pocket_depth");
  expect(result.findings.filter((f: Feat) => ["corner_radius", "pocket_depth"].includes(f.rule))).toEqual([]);
});

test("sharp corner between a wall and an arc", async () => {
  // A pocket whose ends are cut by a large arc (R 1.100 in) meeting the straight walls at an angle: each junction is a sharp
  // concave edge between a plane and a cylinder (review finding, S3).
  const o = await oc();
  const toolBox = new o.BRepPrimAPI_MakeBox(pointAt(o, 0.5 * IN, 0.5 * IN, 0.5 * IN), 2.0 * IN, 1.0 * IN, 1.0 * IN).Shape();
  const arc = new o.BRepPrimAPI_MakeCylinder(axisAt(o, [1.5 * IN, 1.0 * IN, 0.0], [0, 0, 1]), 1.1 * IN, 2.0 * IN).Shape();
  const tool = new o.BRepAlgoAPI_Common(toolBox, arc, new o.Message_ProgressRange()).Shape();
  const result = await analyzeShape(cut(o, boxIn(o, 3, 2, 1), tool), "mill", "al6061", true);
  const sharp = kind(result, "corner").filter((c) => c.dims_mm.radius === 0);
  expect(sharp.length).toBe(8); // side wall to arc, and arc to end wall, at both ends
  expect(sharp.every((c) => c.faces.length === 2 && "edge_mm" in c)).toBe(true);
  const pocket = one(kind(result, "pocket"));
  expect(pocket.dims_mm.min_corner_radius).toBe(0);
  expect(pocket.dims_mm.undersized).toBe(1);
});

// --- S4: walls and thin_wall ---

test("material changes limit", async () => {
  // thin_rib's 0.040 in rib is flagged only in Delrin / nylon (limit 0.060 in; spec S4).
  const limits = { al6061: 0.030, steel1018: 0.020, ss304: 0.020, plastic: 0.060 } as const;
  for (const material of Object.keys(limits) as (keyof typeof limits)[]) {
    const limit = limits[material];
    const result = await run("thin_rib", material);
    const thin = result.findings.filter((f: Feat) => f.rule === "thin_wall");
    if (material !== "plastic") {
      expect(thin, material).toEqual([]);
      continue;
    }
    const f = one(thin as Feat[]);
    expect([f.severity, f.unit, f.limit]).toEqual(["high", "in", limit]);
    near(f.measured, 0.040, 0.001);
    expect(f.threshold_source).toBe("estimate");
    expect(f.title).toBe("Wall 0.040 in thick (limit 0.060 in)");
    expect(f.suggestion).toBe("Make the wall 0.060 in or thicker if the design allows.");
    const wall = wallsOf(result).find((w) => w.id === f.feature)!;
    expect(f.faces).toEqual(wall.faces);
    expect(wall.faces.length).toBe(2);
  }
});

test("S4 thresholds per material", () => {
  const want = { al6061: 0.030, steel1018: 0.020, ss304: 0.020, plastic: 0.060 } as const;
  for (const [material, limit] of Object.entries(want)) expect(settings.thresholds(material).thin_wall).toEqual({ min_in: limit, source: "estimate" });
});

test("wall feature schema", async () => {
  const result = await run("thin_floor");
  const floor = wallsOf(result).reduce((a, b) => (b.dims_mm.thickness < a.dims_mm.thickness ? b : a));
  near(floor.dims_mm.thickness, 0.015 * IN, 0.001);
  expect(floor.dims_mm.overlap_mm2).toBeGreaterThanOrEqual(10.0);
  expect(floor.open_dirs).toEqual([]);
  expect(floor.open_vectors).toEqual([]);
  expect(floor.faces).toEqual([...floor.faces].sort((a: number, b: number) => a - b));
  expect(wallsOf(result).map((w) => w.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `wall-${n}`));
  // features: holes, pockets, corners, then walls (spec Response schema; S4 settled)
  const order = ["hole", "pocket", "corner", "wall"];
  const kinds: string[] = result.features.map((f: Feat) => f.kind);
  expect(kinds).toEqual([...kinds].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
});

test("wall at the limit is not flagged", async () => {
  // A wall exactly 0.030 in thick in 6061 is not "under 0.030 in".
  const o = await oc();
  const bytes = stepOf(o, new o.BRepPrimAPI_MakeBox(2.0 * IN, 1.0 * IN, 0.030 * IN).Shape());
  let result = await analyzeBytes(bytes, "plate_030.step");
  near(Math.min(...wallsOf(result).map((w) => w.dims_mm.thickness)), 0.030 * IN, 1e-6);
  expect(result.findings.filter((f: Feat) => f.rule === "thin_wall")).toEqual([]);
  result = await analyzeBytes(bytes, "plate_030.step", "mill", "plastic");
  expect(result.findings.map((f: Feat) => f.rule)).toEqual(["thin_wall"]);
});

test("slot sides are not a wall", async () => {
  // The 0.040 in slot's two sides face each other across air: no wall, so no finding in plastic.
  const result = await run("slot_not_wall", "plastic");
  expect(result.findings).toEqual([]);
  expect(Math.min(...wallsOf(result).map((w) => w.dims_mm.thickness))).toBeGreaterThan(0.2 * IN);
});

test("bosses with air between are not a wall", async () => {
  // clean_walls: the bosses face each other across 1.000 in of air, and their outer sides (2.000 in apart) have air between: neither is a wall.
  const thick = wallsOf(await run("clean_walls")).map((w) => r3(w.dims_mm.thickness / IN)).sort((a, b) => a - b);
  expect(thick).toEqual([0.25, 0.5, 0.5, 0.5, 0.5, 1.0, 1.0, 2.0, 3.0]);
});

test("thin wall runs for turn", async () => {
  // thin_wall is shared by mill and turn (spec Flow); the pocket rules are not. A block has no turning axis (S6 turn_axis),
  // so the two turning rules don't run either: only the shared rules.
  const result = await run("thin_floor", "al6061", "turn");
  expect(result.rules_run).toEqual(["hole_depth", "hole_size", "thin_wall", "turn_axis"]);
  expect(result.findings.map((f: Feat) => f.rule)).toEqual(["thin_wall", "turn_axis"]);
});

test("hole walls", async () => {
  // D-016: material under a drill point and around a hole's side is a wall, measured up to 0.250 in.
  const tip = wallsOf(await run("thin_drill_point")).filter((w) => w.at === "tip");
  expect(tip.map((w) => r4(w.dims_mm.thickness / IN))).toEqual([0.015]);
  expect(tip[0].hole).toBe("hole-1");
  expect(tip[0].axis).toBeNull();
  expect(tip[0].faces).toEqual([...tip[0].faces].sort((a: number, b: number) => a - b));
  const side = wallsOf(await run("hole_near_edge")).filter((w) => w.at === "side");
  expect(side.map((w) => r3(w.dims_mm.thickness / IN))).toEqual([0.02]);
  // Two holes 0.025 in apart find each other: one wall between their two hole faces.
  const result = await run("holes_close");
  const web = one(wallsOf(result).filter((w) => "hole" in w));
  const holeFaces = new Set(onlyHoles(result).flatMap((h) => h.faces));
  expect(web.faces.every((f: number) => holeFaces.has(f))).toBe(true);
  near(web.dims_mm.thickness, 0.025 * IN, 0.001);
  // Holes 0.375 in or more from other faces get no hole wall (the 0.250 in cap).
  expect(wallsOf(await run("box_through_hole")).filter((w) => "hole" in w)).toEqual([]);
  expect(wallsOf(await run("drill_point_hole")).filter((w) => "hole" in w)).toEqual([]);
});

test("wall just under the limit is flagged and reads clearly", async () => {
  // 0.0299 in is under 0.030 in: flagged, and the title doesn't read "0.030 in thick (limit 0.030 in)".
  const o = await oc();
  const result = await analyzeShape(boxMm(o, 0, 0, 0, 2 * IN, 1 * IN, 0.0299 * IN), "mill", "al6061", false, "plate_0299.step");
  const f = one(result.findings.filter((x: Feat) => x.rule === "thin_wall") as Feat[]);
  near(f.measured, 0.0299, 1e-6);
  expect(f.title).toBe("Wall 0.0299 in thick (limit 0.030 in)");
});

test("hole wall cap is 0.250 in", async () => {
  // Material at a hole is measured up to 0.250 in: 0.240 in is a wall, 0.260 in is not.
  const o = await oc();
  const r = 0.125 * IN;
  for (const [gap, walls] of [[0.240, 1], [0.260, 0]] as const) {
    const shape = cut(o, boxMm(o, 0, 0, 0, 2 * IN, 1 * IN, 0.5 * IN), cylD(o, 1.0 * IN, r + gap * IN, -1, 2 * r, 0.5 * IN + 2));
    const result = await analyzeShape(shape, "mill", "al6061", false, "gap.step");
    expect(wallsOf(result).filter((w) => "hole" in w).length, String(gap)).toBe(walls);
  }
});

test("split holes close together give one wall", async () => {
  // holes_close with each hole made of two half-cylinders whose seam faces the other hole: still one wall.
  const o = await oc();
  const r = 0.125 * IN;
  const tools: Shape[] = [];
  for (const x of [0.8625, 1.1375]) for (const a of [0.0, Math.PI]) tools.push(cylD(o, x * IN, 0.5 * IN, -1, 2 * r, 0.5 * IN + 2, [0, 0, 1], Math.PI, a));
  const result = await analyzeShape(cut(o, boxMm(o, 0, 0, 0, 2 * IN, 1 * IN, 0.5 * IN), ...tools), "mill", "al6061", false, "x.step");
  expect(onlyHoles(result).length).toBe(2);
  const web = one(wallsOf(result).filter((w) => "hole" in w));
  // The seam itself is no start point, so the nearest ray is 1 deg off it: within J3's 0.001 in.
  near(web.dims_mm.thickness, 0.025 * IN, 0.001 * IN);
});

test("drill point tip on a side axis", async () => {
  // A drill-point hole from -X with 0.015 in under its tip: the tip wall is found on any axis.
  const o = await oc();
  const r = 0.125 * IN;
  const point = r / Math.tan((59 * Math.PI) / 180);
  const start = 1.0 * IN - 0.015 * IN - point;
  const cone = new o.BRepPrimAPI_MakeCone(axisAt(o, [start, 0.5 * IN, 0.5 * IN], [1, 0, 0]), r, 0.0, point).Shape();
  const shape = cut(o, boxMm(o, 0, 0, 0, IN, IN, IN), cylD(o, -1, 0.5 * IN, 0.5 * IN, 2 * r, 1 + start, [1, 0, 0]), cone);
  const result = await analyzeShape(shape, "mill", "al6061", false, "x.step");
  const tip = wallsOf(result).filter((w) => w.at === "tip");
  expect(tip.map((w) => r4(w.dims_mm.thickness / IN))).toEqual([0.015]);
});

test("cross hole gives no false hole wall", async () => {
  // Rays start only on a hole's own face, never in the gap a cross hole cuts through it.
  const o = await oc();
  const r = 0.125 * IN;
  const shape = cut(o, boxMm(o, 0, 0, 0, IN, IN, IN), cylD(o, 0.5 * IN, 0.5 * IN, -1, 2 * r, IN + 2), cylD(o, -1, 0.5 * IN, 0.5 * IN, 2 * r, IN + 2, [1, 0, 0]));
  const result = await analyzeShape(shape, "mill", "al6061", false, "x.step");
  expect(result.findings.filter((f: Feat) => f.rule === "thin_wall")).toEqual([]);
});

test("a value just past its limit never reads as the limit", () => {
  // Stress test (HANDOFF 3a): a 6.03x hole was titled "Hole depth 6.0× diameter (limit 6.0×)".
  const limits = { hole_depth: { medium: 6.0, high: 10.0, source: "estimate" } };
  const holes: Feature[] = [6.03, 6.5, 10.04].map((d, i) => ({ kind: "hole", id: `hole-${i}`, faces: [i], dims_mm: { diameter: 1.0, depth: d } }));
  expect(holeDepth.check(holes, {} as PartSummary, limits).map((f) => f.title)).toEqual(
    ["Hole depth 6.03× diameter (limit 6.0×)", "Hole depth 6.5× diameter (limit 6.0×)", "Hole depth 10.04× diameter (limit 10.0×)"]);
  expect(pastLimit(6.25, 6.0, 1)).toBe("6.2");
  expect(pastLimit(5.97, 6.0, 1)).toBe("5.97");
});

// --- .ipt checks on built inputs (the app path with the .ipt read patched in Python; here the IptPart is passed directly) ---

/** The IptPart built from a committed STEP part plus threads / Hole features / blends (tests/inventor/built.py ipt_from_step). */
async function withIpt(step: string, threads: Thread[], holeFeatures: ReturnType<typeof holeFeature>[] = [], blends: ReturnType<typeof blockBlends> = []): Promise<Result> {
  const o = await oc();
  o.FS.writeFile("/built-in.step", partBytes(step));
  let part: IptPart;
  try {
    part = iptFromStep(o, "/built-in.step", threads, holeFeatures, blends);
  } finally {
    o.FS.unlink("/built-in.step");
  }
  return analyzeBytes(partBytes(step), `${step}.step`, "mill", "al6061", part);
}
const withThreads = (step: string, threads: Thread[]) => withIpt(step, threads);
const withHoles = (step: string, feats: ReturnType<typeof holeFeature>[], threads: Thread[] = []) => withIpt(step, threads, feats);
const mismatches = (r: Result) => r.findings.filter((f: Feat) => f.rule === "thread_mismatch");

for (const kase of ["axis", "diameter", "depth", "centred"] as const) {
  test(`thread mismatch (${kase})`, async () => {
    // D-005: built cases, each one medium finding with its gap; a centred thread gives none (STC 10: test_inventor_threads.py).
    let result: Result;
    let gap: string;
    let mm: number;
    let text: string;
    if (kase === "axis") { // 0.10 mm off the hole's axis
      result = await withThreads("box_through_hole", [thread([25.5, 12.7, 12.7], DOWN, 10.0)]);
      [gap, mm, text] = ["axis", 0.10, "0.10 mm off the hole's axis"];
    } else if (kase === "diameter") { // the Ø6.35 hole is 0.50 mm over a 5.85 mm major diameter
      result = await withThreads("box_through_hole", [thread(BOX_TOP, DOWN, 10.0, { major_mm: [5.85, 5.95], minor_mm: [4.9, 5.1] })]);
      [gap, mm, text] = ["diameter", 0.50, "hole Ø6.35 is 0.50 mm over the thread's major diameter"];
    } else if (kase === "depth") { // 30 mm of thread in the 25.4 mm blind hole
      result = await withThreads("drill_point_hole", [thread(DRILL_TOP, DOWN, 30.0)]);
      [gap, mm, text] = ["depth", 4.6, "thread 30.00 deep in a 25.40 hole"];
    } else {
      result = await withThreads("box_through_hole", [thread(BOX_TOP, DOWN, 12.7)]);
      expect(result.inventor.threads[0].state).toBe("matched");
      expect(mismatches(result)).toEqual([]);
      return;
    }
    const t = one(result.inventor.threads as Feat[]);
    expect([t.state, t.hole]).toEqual(["disagrees", "hole-1"]);
    const g = one(t.gaps as Feat[]);
    expect([g.what, g.text]).toEqual([gap, text]);
    near(g.mm, mm, 1e-4);
    const f = one(mismatches(result));
    expect([f.severity, f.feature, f.unit]).toEqual(["medium", "hole-1", "in"]);
    near(f.measured, mm / 25.4, 1e-6);
    near(f.limit, 0.01 / 25.4, 1e-6);
    expect(f.title).toBe(`1/4-20 UNC thread on hole-1: ${text}. Possible cause: the part or an old STEP export differs from the .ipt`);
    expect(f.threshold_source).toBe("D-032: the .ipt and STEP must agree");
    expect(f.suggestion).toBe("Export the STEP again from this .ipt, or check this thread in Inventor.");
    expect(f.id).toBe(`F${result.findings.length}`); // last in RULES: the other findings keep their numbers
  });
}

for (const [face, reason] of [["shaft", "external thread: not on a hole"], ["cone", "tapered thread: not supported yet"],
  ["other", "the threaded face is not a cylinder"]] as const) {
  test(`thread not mapped (${face})`, async () => {
    // Not mapped is our limit, never a finding (D-032).
    const result = await withThreads("box_through_hole", [thread(BOX_TOP, DOWN, 10.0, { face })]);
    const t = one(result.inventor.threads as Feat[]);
    expect([t.state, t.hole, t.reason]).toEqual(["not_mapped", null, reason]);
    expect(mismatches(result)).toEqual([]);
    expect("thread" in result.features.find((f: Feat) => f.id === "hole-1")).toBe(false);
  });
}

test("thread no hole", async () => {
  const result = await withThreads("box_through_hole", [thread([5.0, 5.0, 12.7], [0, 0, -1], 5.0)]);
  expect(result.inventor.threads[0].reason).toBe("no hole on this thread's axis");
});

for (const kase of ["axis", "diameter", "depth", "through", "centred"] as const) {
  test(`hole mismatch (${kase})`, async () => {
    // I2 S1: built cases, each one medium finding with its gap; a centred hole on the same part gives none.
    let feats: ReturnType<typeof holeFeature>[];
    let step: string;
    let gap: string;
    let mm: number;
    let text: string;
    if (kase === "axis") { // 0.10 mm off the hole's axis
      feats = [holeFeature([25.5, 12.7, 12.7], DOWN, 6.35, 12.7, { through: true })];
      [step, gap, mm, text] = ["box_through_hole", "axis", 0.10, "0.004 in [0.10 mm] off the hole's axis"];
    } else if (kase === "diameter") {
      feats = [holeFeature(BOX_TOP, DOWN, 6.6, 12.7, { through: true })];
      [step, gap, mm, text] = ["box_through_hole", "diameter", 0.25, "Ø0.260 in [6.60 mm] in the .ipt, Ø0.250 in [6.35 mm] in the STEP"];
    } else if (kase === "depth") { // a 20 mm blind hole where the STEP's is 25.4 mm
      feats = [holeFeature(DRILL_TOP, DOWN, 6.35, 20.0, { through: false, point_deg: 118.0 })];
      [step, gap, mm, text] = ["drill_point_hole", "depth", 5.4, "the Ø0.250 in [6.35 mm] section is 0.787 in [20.00 mm] long in the .ipt, 1.000 in [25.40 mm] in the STEP"];
    } else if (kase === "through") { // blind in the .ipt, through in the STEP: the gap is their length difference
      feats = [holeFeature(BOX_TOP, DOWN, 6.35, 10.0, { through: false })];
      [step, gap, mm, text] = ["box_through_hole", "through", 2.7, "the .ipt hole is blind, the STEP hole is through"];
    } else {
      const result = await withHoles("box_through_hole", [holeFeature(BOX_TOP, DOWN, 6.35, 12.7, { through: true })]);
      const hf = one(result.inventor.hole_features as Feat[]);
      expect([hf.state, hf.holes[0].state, hf.holes[0].hole]).toEqual(["matched", "matched", "hole-1"]);
      expect(result.features.find((f: Feat) => f.id === "hole-1").hole_feature).toBe("hf-1");
      expect(result.findings.filter((f: Feat) => f.rule === "hole_mismatch")).toEqual([]);
      return;
    }
    const result = await withHoles(step, feats);
    const hf = one(result.inventor.hole_features as Feat[]);
    const h = one(hf.holes as Feat[]);
    expect([hf.state, h.state, h.hole, h.id]).toEqual(["disagrees", "disagrees", "hole-1", "hf-1.1"]);
    const g = one(h.gaps as Feat[]);
    expect([g.what, g.text]).toEqual([gap, text]);
    near(g.mm, mm, 1e-4);
    const f = one(result.findings.filter((x: Feat) => x.rule === "hole_mismatch") as Feat[]);
    expect([f.severity, f.feature, f.unit]).toEqual(["medium", "hole-1", "in"]);
    near(f.measured, mm / 25.4, 1e-6);
    near(f.limit, 0.01 / 25.4, 1e-6);
    expect(f.title).toBe(`Hole feature hf-1 hole on hole-1: ${text}. Possible cause: the part or an old STEP export differs from the .ipt`);
    expect(f.threshold_source).toBe("D-032: the .ipt and STEP must agree");
    expect(f.suggestion).toBe("Export the STEP again from this .ipt, or check this Hole feature in Inventor.");
    expect(f.id).toBe(`F${result.findings.length}`); // last in RULES: the other findings keep their numbers
  });
}

test("hole mismatch named", async () => {
  // I2 S2: a named Hole feature's finding starts with its name instead of its id.
  const feat = holeFeature(BOX_TOP, DOWN, 6.6, 12.7, { through: true });
  feat.name = "Hole3";
  const result = await withHoles("box_through_hole", [feat]);
  const f = one(result.findings.filter((x: Feat) => x.rule === "hole_mismatch") as Feat[]);
  expect(f.title.startsWith("Hole3 hole on hole-1: Ø0.260 in [6.60 mm] in the .ipt")).toBe(true);
  expect(f.hole_feature).toBe("hf-1");
  expect(result.inventor.hole_features[0].name).toBe("Hole3");
});

test("hole mismatch after thread", async () => {
  // A STEP hole with a thread_mismatch finding gets no hole_mismatch one; the hole keeps its gaps.
  const off: [number, number, number] = [25.5, 12.7, 12.7];
  const result = await withHoles("box_through_hole", [holeFeature(off, DOWN, 6.35, 12.7, { through: true })], [thread(off, DOWN, 10.0)]);
  expect(result.findings.map((f: Feat) => f.rule).filter((r: string) => r.endsWith("_mismatch"))).toEqual(["thread_mismatch"]);
  expect(result.inventor.hole_features[0].holes[0].state).toBe("disagrees");
});

test("hole not mapped", async () => {
  // Not mapped is our limit, never a finding (D-032).
  const result = await withHoles("box_through_hole", [holeFeature([5.0, 5.0, 12.7], DOWN, 6.35, 12.7, { through: true })]);
  const h = one(result.inventor.hole_features[0].holes as Feat[]);
  expect([h.state, h.hole, h.reason]).toEqual(["not_mapped", null, "no hole on this axis"]);
  expect(result.findings.filter((f: Feat) => f.rule === "hole_mismatch")).toEqual([]);
});

for (const radius of [3.0, 3.5]) {
  test(`blend mismatch (r ${radius})`, async () => {
    // I3 S3 (D-039): the built block's fillet at r 3.5 where the STEP's is 3 mm gives one medium finding, last in RULES; at r 3
    // none. The chamfer is matched either way (its size is not compared).
    const o = await oc();
    filletedBlock(o, "/block.step");
    const bytes = new Uint8Array(o.FS.readFile("/block.step"));
    const part = iptFromStep(o, "/block.step", [], [], blockBlends(radius));
    o.FS.unlink("/block.step");
    const result = await analyzeBytes(bytes, "block.step", "mill", "al6061", part);
    expect(result.rules_run).toContain("blend_mismatch");
    const [fillet, chamfer] = result.inventor.blends as Feat[];
    expect(chamfer.state).toBe("matched");
    const found = result.findings.filter((f: Feat) => f.rule === "blend_mismatch");
    if (radius === 3.0) {
      expect(fillet.state).toBe("matched");
      expect(found).toEqual([]);
      return;
    }
    const f = one(found as Feat[]);
    expect([f.severity, f.feature, f.blend, f.unit]).toEqual(["medium", "bl-1", "bl-1", "in"]);
    expect(f.faces).toEqual(fillet.step_faces);
    expect(f.faces.length).toBeGreaterThan(0);
    near(f.measured, 0.5 / 25.4, 1e-6);
    near(f.limit, 0.01 / 25.4, 1e-6);
    expect(f.title).toBe("Fillet bl-1: R0.138 in [3.50 mm] in the .ipt, R0.118 in [3.00 mm] in the STEP. Possible cause: the part or an old STEP export differs from the .ipt");
    expect(f.threshold_source).toBe("D-032: the .ipt and STEP must agree");
    expect(f.suggestion).toBe("Export the STEP again from this .ipt, or check this fillet in Inventor.");
    expect(f.id).toBe(`F${result.findings.length}`);
  });
}
