// Port of tests/service/test_hole_joins.py (HANDOFF 3a, the stress-test gaps): the labelled set in
// tests/grading/sets/hole_joins (hole instances in INSTANCES.json) is scored with the grading scorer. Every hole is found
// whole (one stepped hole, one chain), with the right type and no wrong call.
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { HOLE_CLASSES, instanceScore, scores, type Tally } from "../../grading/score";
import { loadNodeOc } from "../node";
import type { OC } from "../oc";
import { analyseFile, approx, approxList, byNumber, readJson, scoreFile, setDir, type Result } from "./groupc-kit";

const SET = setDir("hole_joins");
const INSTANCES: Record<string, number[][]> = readJson(resolve(SET, "INSTANCES.json"));
const FILES = readdirSync(SET).filter((f) => f.endsWith(".step")).sort().map((f) => resolve(SET, f));
const stem = (p: string) => p.split("/").pop()!.replace(/\.step$/, "");

let oc: OC;
beforeAll(async () => { oc = await loadNodeOc(); });

const holesOf = (r: Result): Result[] => r.features.filter((f: Result) => f.kind === "hole");
const depths = (r: Result) => holesOf(r).map((f) => f.dims_mm.depth as number).sort(byNumber);

describe("set_part", () => {
  for (const path of FILES) {
    test(stem(path), async () => {
      const { counts, missed, features } = await scoreFile(oc, path);
      const whole = instanceScore(features, INSTANCES[stem(path)]);
      const s = scores(counts);
      expect(s.precision.hole.n, "a face that is not a hole's was called one").toBe(s.precision.hole.of);
      expect(missed).toEqual([]);
      expect(whole.whole, JSON.stringify(whole)).toBe(whole.of);
      for (const cls of Object.keys(HOLE_CLASSES)) {
        expect(s.type_recall[cls].n, `class ${cls} faces given the wrong type`).toBe(s.recall[cls].of);
      }
    });
  }
});

test("set_totals", async () => {
  const parts: Tally[] = [];
  let whole = 0, of = 0;
  for (const path of FILES) {
    const { counts, features } = await scoreFile(oc, path);
    parts.push(counts);
    const w = instanceScore(features, INSTANCES[stem(path)]);
    whole += w.whole;
    of += w.of;
  }
  expect(FILES.length).toBe(19);
  expect(whole).toBe(of);
  expect(of).toBe(FILES.reduce((a, p) => a + INSTANCES[stem(p)].length, 0));
  expect(of).toBe(25);
});

test("crossing holes are two whole holes and a bore with a groove is one", async () => {
  let r = await analyseFile(oc, resolve(SET, "x_equal.step"));
  approxList(depths(r), [30.0, 100.0]);
  r = await analyseFile(oc, resolve(SET, "x_snap_ring.step"));
  expect(holesOf(r)).toHaveLength(1);
  const bore = holesOf(r)[0];
  approx(bore.dims_mm.depth, 30.0);
  expect(bore.open_vectors).toHaveLength(2);
});

test("bores far apart or blind from both sides stay two holes", async () => {
  for (const [name, want] of [["ng_far_walls", [30.0, 30.0]], ["ng_blind_opposite", [12.0, 12.0]]] as const) {
    approxList(depths(await analyseFile(oc, resolve(SET, `${name}.step`))), [...want], undefined, name);
  }
});

test("radial hole through a shaft is through", async () => {
  const r = await analyseFile(oc, resolve(SET, "r_through.step"));
  expect(holesOf(r)).toHaveLength(1);
  const hole = holesOf(r)[0];
  // D-022: the depth is where the hole is round all the way (2 x sqrt(15^2 - 3^2)); the longest side is max_depth.
  expect(hole.open_vectors).toHaveLength(2);
  approx(hole.dims_mm.depth, 2 * Math.sqrt(15 ** 2 - 3 ** 2));
  approx(hole.dims_mm.max_depth, 30.0);
});

test("counterbore with a chamfer at the bore is one through hole", async () => {
  const r = await analyseFile(oc, resolve(SET, "cb_chamfer.step"));
  const holes = holesOf(r);
  expect(holes).toHaveLength(2);
  expect(new Set(holes.map((h) => h.chain)).size).toBe(1);
  approxList(holes.map((h) => h.dims_mm.diameter as number).sort(byNumber), [6.6, 11.0]);
  expect(holes.every((h) => h.open_vectors.length === 2)).toBe(true); // through, both segments
});
