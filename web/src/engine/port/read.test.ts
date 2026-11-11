// Port of tests/service/test_read.py. S1: reading a part, the response shape, bad input, limits and runtime (J1, J7).
// Not ported (Python-only plumbing, see the port report): the FastAPI upload route and its status codes, the crashed
// and timed-out multiprocessing Worker. Their browser counterparts (the size check, the time limit and the worker
// restart in web/src/engine-client.ts) need a real Worker and are the browser lane's; their messages and limits are
// asserted below.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { analyze } from "../analyze";
import { analyzeOrRefuse } from "../node";
import { ReadError } from "../read";
import { MAX_UPLOAD_BYTES, MSG_NO_SOLID, MSG_NOT_STEP, MSG_TOO_LARGE, MSG_TOO_LONG } from "../settings";
import { analyzeBytes, expected, oc, PARTS, ROOT, run, type Result } from "./groupa_common";

const NOT_STEP = "This is not a STEP file this tool can read. Export it again as .step or .stp from your CAD.";
const NO_SOLID = "No solid found in this file. Export the part as a solid body, not surfaces or a drawing.";
const TOO_LARGE = "File is larger than 50 MB. Export a single body or a smaller part.";
const TOO_LONG = "This file took too long to analyze. Try again; if it stops again, export a single body or a smaller part.";

type V = number[];
const dot = (a: V, b: V) => a.reduce((s, x, i) => s + x * b[i], 0);
const sub = (a: V, b: V) => a.map((x, i) => x - b[i]);

function* triangles(face: Result): Generator<[V, V]> {
  const p: number[] = face.positions;
  const ix: number[] = face.indices;
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => [p[3 * ix[t + k]], p[3 * ix[t + k] + 1], p[3 * ix[t + k] + 2]]);
    const [u, v] = [sub(b, a), sub(c, a)];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    yield [n, [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3)];
  }
}

function faceNormalAndCentroid(face: Result): [V, V] {
  let total = [0, 0, 0];
  let centre = [0, 0, 0];
  let area = 0;
  for (const [n, c] of triangles(face)) {
    const a = Math.sqrt(dot(n, n));
    total = total.map((t, k) => t + n[k]);
    centre = centre.map((s, k) => s + a * c[k]);
    area += a;
  }
  const length = Math.sqrt(dot(total, total));
  return [total.map((t) => t / length), centre.map((s) => s / area)];
}

const near = (got: number, want: number, abs: number, what: string) => expect(Math.abs(got - want), `${what}: ${got} vs ${want}`).toBeLessThanOrEqual(abs);

function checkBox(result: Result, name: string, units: string): void {
  const part = result.part;
  expect(part.name).toBe(`${name}.step`);
  expect(part.units_in_file).toBe(units);
  [...(part.bbox_in as number[])].sort((a, b) => b - a).forEach((v, i) => near(v, [2.0, 1.0, 0.5][i], 0.001, "bbox_in"));
  expect(part.face_count).toBe(expected(name).face_count);
  expect(part.ignored_solids).toBe(0);
  expect(part.not_analysed_faces).toEqual([]);
  // 2 x 1 x 0.5 in block minus a 0.25 in hole through 0.5 in.
  const volume = (2 * 1 * 0.5 - Math.PI * 0.125 ** 2 * 0.5) * 25.4 ** 3;
  near(part.volume_mm3, volume, Math.abs(volume) * 1e-4, "volume_mm3"); // pytest.approx(rel=1e-4)
  // The frame is right-handed and +Z is a large face's normal (the 0.5 in direction).
  const frame = part.frame;
  near(part.bbox_in[2], 0.5, 0.001, "bbox_in[2]");
  const z: V = frame.z;
  const cross = [frame.x[1] * frame.y[2] - frame.x[2] * frame.y[1], frame.x[2] * frame.y[0] - frame.x[0] * frame.y[2],
    frame.x[0] * frame.y[1] - frame.x[1] * frame.y[0]];
  cross.forEach((c, i) => near(c, z[i], 1e-9, "frame cross"));

  const faces: Result[] = result.faces;
  expect(faces.map((f) => f.id)).toEqual(Array.from({ length: part.face_count }, (_, i) => i));
  expect(faces.map((f) => f.kind).sort()).toEqual(["cylinder", ...Array(6).fill("plane")]);
  for (const face of faces) {
    expect(face.positions.length % 3 === 0 && face.positions.length > 0).toBe(true);
    expect(face.indices.length % 3 === 0 && face.indices.length > 0).toBe(true);
    expect(Math.max(...face.indices)).toBeLessThan(face.positions.length / 3);
  }
  // Triangles face out of the material: outer faces point away from the block's centre,
  // and the hole wall points towards the hole's axis.
  const centre = [25.4, 12.7, 6.35];
  for (const face of faces) {
    const [n, c] = faceNormalAndCentroid(face);
    if (face.kind === "plane") {
      expect(dot(n, sub(c, centre)), `face ${face.id} faces into the material`).toBeGreaterThan(0);
      near(Math.max(...n.map(Math.abs)), 1.0, 1e-6, "plane normal");
    } else { // the hole wall: each triangle's normal points towards the hole axis
      for (const [triN, triC] of triangles(face)) {
        expect(dot(triN, [triC[0] - 25.4, triC[1] - 12.7, 0.0]), "the hole wall faces into the material").toBeLessThan(0);
      }
    }
  }
  // +Z is outward: the +Z face's centroid lies on the +Z side of the part.
  const zfaces = faces.filter((f) => f.kind === "plane" && dot(faceNormalAndCentroid(f)[0], z) > 0.999);
  expect(zfaces.length, "no face has the frame's +Z as its outward normal").toBeGreaterThan(0);

  const xs: number[] = faces.flatMap((f) => f.positions.filter((_: number, i: number) => i % 3 === 0));
  near(Math.max(...xs) - Math.min(...xs), 50.8, 0.01, "x extent (file coordinates, mm)");

  // S7: one setup and one drill, so the only driver is the one tool
  expect(result.cost_drivers.map((d: Result) => [d.driver, d.count, d.score])).toEqual([["distinct_tools", 1, 1.0]]);
  // S2: one hole, 1/4 in (6.35 mm), a standard drill in both files (D-013). S4: the block's
  // X, Y and Z pairs of faces are 3 walls, 2.000, 1.000 and 0.500 in thick, none thin.
  expect(result.features.map((f: Result) => f.kind)).toEqual(["hole", "wall", "wall", "wall"]);
  const walls = result.features.filter((f: Result) => f.kind === "wall")
    .map((f: Result) => Math.round((f.dims_mm.thickness / 25.4) * 1e4) / 1e4).sort((a: number, b: number) => a - b);
  expect(walls).toEqual([0.5, 1.0, 2.0]);
  expect(result.findings).toEqual([]);
  // S5 (spec Plan): the through hole opens +Z and -Z, so one setup, +Z first; one drill load.
  expect(result.machine).toBe("3-axis mill");
  expect(result.setups).toEqual([{ direction: "+Z", features: ["hole-1"] }]);
  expect(result.tools.map((t: Result) => t.id)).toEqual(["dr-0.2500"]);
  expect(result.tool_changes).toBe(1);
  expect(result.turn_axis).toBeNull();
  expect(Array.isArray(result.assumptions)).toBe(true);
}

test("box through hole", async () => {
  checkBox(await run("box_through_hole"), "box_through_hole", "mm");
});

test("units: an inch file", async () => {
  checkBox(await run("box_inch"), "box_inch", "inch");
});

describe("bad files", () => {
  test("the messages are the Python service's", () => {
    expect([MSG_NOT_STEP, MSG_NO_SOLID, MSG_TOO_LARGE, MSG_TOO_LONG]).toEqual([NOT_STEP, NO_SOLID, TOO_LARGE, TOO_LONG]);
  });
  for (const [name, message] of [["not_step", NOT_STEP], ["no_solid", NO_SOLID]]) {
    test(name, async () => {
      const bytes = new Uint8Array(readFileSync(resolve(PARTS, `${name}.step`)));
      await expect(analyzeBytes(bytes, `${name}.step`)).rejects.toThrow(ReadError);
      await expect(analyzeBytes(bytes, `${name}.step`)).rejects.toThrow(message);
      expect(await analyzeOrRefuse(await oc(), bytes, `${name}.step`, "mill")).toEqual({ error: message }); // as the worker answers
      // The engine keeps working after bad files.
      expect((await run("box_through_hole")).part.face_count).toBe(expected("box_through_hole").face_count);
    });
  }
});

test("bad fields", async () => {
  const bytes = new Uint8Array(readFileSync(resolve(PARTS, "box_through_hole.step")));
  const engine = await oc();
  // @ts-expect-error a process the page never offers
  expect(() => analyze(engine, bytes, "p.step", "drill", "al6061")).toThrow("unknown process");
  // @ts-expect-error a material the page never offers
  expect(() => analyze(engine, bytes, "p.step", "mill", "gold")).toThrow("unknown material");
  expect(() => analyze(engine, bytes, "p.step", "turn", "plastic")).not.toThrow();
});

test("the upload limit is 50 MB", () => {
  expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
});

test("a file of exactly 50 MB is read (and refused as not a STEP)", async () => {
  // Exactly 50 MB of file is allowed; the engine reads it and says it is not a STEP.
  const edge = new Uint8Array(50 * 1024 * 1024);
  expect(await analyzeOrRefuse(await oc(), edge, "edge.step", "mill")).toEqual({ error: NOT_STEP });
}, 60_000);

const STEP_PARTS = readdirSync(PARTS).filter((f) => f.endsWith(".step")).sort();

test("parts are collected", () => {
  expect(STEP_PARTS.length).toBeGreaterThanOrEqual(4);
});

// The runtime tests (Python: `timed`) assert a wall-clock limit: they run alone in read_runtime.test.ts (VER-11).

test("a solid without a product structure", async () => {
  // A 1995 AP203 file whose solid is not under a product (UMD benchmark, tests/edmr) still reads.
  const path = resolve(ROOT, "tests/edmr/models/UMD/through_pocket1/through_pocket1.step");
  const result = await analyzeBytes(new Uint8Array(readFileSync(path)), "through_pocket1.step");
  expect(result.part.face_count).toBe(14);
  expect(result.part.ignored_solids).toBe(0);
});
