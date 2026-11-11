// Port of tests/service/test_cut_holes.py (D-018 round 2): a hole stays a hole when another feature cuts into its wall, a
// cut hole's bottom stays its own, and an O-ring groove or a slot end is not a hole. Built here, analysed end to end.
// Sizes in inches, modelled in mm.
import { beforeAll, expect, test } from "vitest";
import type { OC } from "../oc";
import { loadNodeOc } from "../node";
import { analyse, IN, shapes, type Result, type Shapes } from "./groupc-kit";

let oc: OC;
let s: Shapes;
beforeAll(async () => { oc = await loadNodeOc(); s = shapes(oc); });

const box = (x: number, y: number, z: number, l: number, w: number, h: number) => s.box(x * IN, y * IN, z * IN, l * IN, w * IN, h * IN);
const cyl = (x: number, y: number, z: number, r: number, h: number) => s.cyl(x * IN, y * IN, z * IN, r * IN, h * IN);
const BLOCK = () => box(0, 0, 0, 3, 2, 1);

async function holesOf(shape: unknown): Promise<[Result[], Result[]]> {
  const r = await analyse(oc, s.step(shape), "part.step");
  return [r.features.filter((f: { kind: string }) => f.kind === "hole"), r.faces];
}

test("through hole cut by a passage is still a hole", async () => {
  const hole = cyl(1.5, 1.0, -0.5, 0.25, 2);
  const passage = box(1.6, 0.5, -0.5, 0.6, 1.0, 2); // takes about a third of the hole's wall
  const [found] = await holesOf(s.cut(BLOCK(), hole, passage));
  expect(found).toHaveLength(1);
  expect(found[0].open_vectors).toHaveLength(2);
});

test("blind hole cut by a pocket keeps only its own faces", async () => {
  const hole = cyl(1.5, 1.0, 0.25, 0.25, 2); // 0.75 in deep from the top
  const pocket = box(1.6, 0.4, 0.6, 1.0, 1.2, 1); // a pocket 0.4 in deep cuts its upper wall
  const [found, faces] = await holesOf(s.cut(BLOCK(), hole, pocket));
  expect(found).toHaveLength(1);
  expect(new Set(found[0].faces.map((i: number) => faces[i].kind))).toEqual(new Set(["cylinder", "plane"]));
  expect(found[0].faces.filter((i: number) => faces[i].kind === "plane")).toHaveLength(1); // its bottom, no pocket wall
});

test("O-ring groove is not a hole", async () => {
  const groove = s.cut(cyl(1.5, 1.0, 0.75, 0.6, 1), cyl(1.5, 1.0, 0.75, 0.4, 1)); // a ring 0.25 in deep
  const [found] = await holesOf(s.cut(BLOCK(), groove));
  expect(found).toEqual([]);
});

test("slot with round ends is not a hole", async () => {
  const slot = [box(1.0, 0.75, 0.75, 1.0, 0.5, 1), cyl(1.0, 1.0, 0.75, 0.25, 1), cyl(2.0, 1.0, 0.75, 0.25, 1)];
  const [found] = await holesOf(s.cut(BLOCK(), ...slot));
  expect(found).toEqual([]);
});
