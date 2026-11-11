// Port of tests/service/test_hole_ends_walls.py (set 3 with S5, HANDOFF 3a; D-022): the labelled set in
// tests/grading/sets/hole_ends_walls is scored with the grading scorer (grading/score.ts), and each part's hole depth,
// longest side, countersinks and hole walls must match EXPECT.json, which make.py works out from the geometry.
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { HOLE_CLASSES, scores, type Tally } from "../../grading/score";
import { loadNodeOc } from "../node";
import type { OC } from "../oc";
import { check as holeDepthCheck } from "../rules/hole_depth";
import { analyseFile, analyse, approx, approxList, byNumber, readJson, scoreFile, setDir, shapes, sumOf, total, type Result } from "./groupc-kit";

const SET = setDir("hole_ends_walls");
const FILES = readdirSync(SET).filter((f) => f.endsWith(".step")).sort().map((f) => resolve(SET, f));
const stem = (p: string) => p.split("/").pop()!.replace(/\.step$/, "");
const EXPECT = readJson(resolve(SET, "EXPECT.json"));

let oc: OC;
beforeAll(async () => { oc = await loadNodeOc(); });

describe("set_part", () => {
  for (const path of FILES) {
    test(stem(path), async () => {
      const { counts, missed } = await scoreFile(oc, path);
      const s = scores(counts);
      for (const kind of ["hole", "pocket"]) expect(s.precision[kind].n, `a face that is not a ${kind}'s was called one`).toBe(s.precision[kind].of);
      expect(missed).toEqual([]);
    });
  }
});

describe("depths, countersinks and walls", () => {
  for (const path of FILES) {
    test(stem(path), async () => {
      const want = EXPECT[stem(path)];
      const result = await analyseFile(oc, path);
      const holes = result.features.filter((f: Result) => f.kind === "hole");
      expect(holes).toHaveLength(1);
      const hole = holes[0];
      expect(want.holes).toHaveLength(1);
      const h = want.holes[0];
      const dims = hole.dims_mm;
      approx(dims.depth, h.depth, 1e-3);
      if ("max_depth" in h) approx(dims.max_depth, h.max_depth, 1e-3);
      else expect("max_depth" in dims).toBe(false);
      if (h.countersinks.length) {
        expect(hole.countersink_vectors).toHaveLength(h.countersinks.length);
        approx(dims.countersink_diameter, Math.max(...h.countersinks.map((c: number[]) => c[0])), 1e-3);
        approxList([...hole.countersink_degs].sort(byNumber), h.countersinks.map((c: number[]) => c[1]).sort(byNumber), 0.1);
        const own = new Set(hole.faces);
        expect(hole.countersink_faces.every((i: number) => !own.has(i))).toBe(true); // D-018: the cone stays out
      } else {
        expect("countersink_deg" in dims || "countersink_vectors" in hole).toBe(false);
      }
      const walls = result.features.filter((f: Result) => f.kind === "wall" && "hole" in f).map((f: Result) => f.dims_mm.thickness as number).sort(byNumber);
      approxList(walls, want.walls, 1e-3);
    });
  }
});

test("set_totals", async () => {
  const parts: Tally[] = [];
  for (const path of FILES) parts.push((await scoreFile(oc, path)).counts);
  const s = total(parts);
  expect(FILES.length).toBe(17);
  expect(Object.keys(EXPECT).length).toBe(17);
  const of = sumOf(s, HOLE_CLASSES, "of");
  expect(sumOf(s, HOLE_CLASSES, "n")).toBe(of);
  expect(of).toBe(21); // MANIFEST: classes 1 and 12
});

test("sloped exit names the longest side", () => {
  // D-022: a deep-hole finding on a sloped exit says the longest side too.
  const f = { kind: "hole", id: "hole-1", faces: [1], dims_mm: { diameter: 2.0, depth: 14.0, max_depth: 16.0 } };
  const out = holeDepthCheck([f] as never, {} as never, { hole_depth: { medium: 6.0, high: 10.0, source: "estimate" } } as never) as Result[];
  expect(out).toHaveLength(1);
  expect(out[0].measured).toBe(7.0);
  expect(out[0].suggestion).toContain("its longest side is 0.630 in");
});

test("each countersink angle is its own tool", async () => {
  // Review finding: a 90 deg countersink at the top and an 82 deg one at the bottom are two tools, each cut from its own end.
  const r = await analyseFile(oc, resolve(SET, "cs_mixed.step"));
  const byTool = new Map<string, unknown>(r.operations.map((o: Result) => [o.tool, r.setups[o.setup].direction]));
  expect(new Set(byTool.keys())).toEqual(new Set(["dr-6.6mm", "cs-90", "cs-82"]));
  expect(JSON.stringify(byTool.get("cs-90"))).not.toBe(JSON.stringify(byTool.get("cs-82")));
});

test("cut hole keeps its length", async () => {
  // A hole only partly round (a d4 cross hole 1 mm under the top, open to it all along) has no full-round part: its depth
  // stays its length (100), not a length from its broken ends (53.6 before the fix). The d8 hole it crosses is not round
  // all the way in its top 3 mm, so by D-022 its depth is 27 and its longest side 30.
  const s = shapes(oc);
  const TOP = 30;
  const hl = s.cyl(50, 30, -5, 4, TOP + 10); // hew.through_hole(50, 30, 4)
  const x = s.cyl(-5, 30, TOP - 1, 2, 120, [1, 0, 0]);
  const r = await analyse(oc, s.step(s.cut(s.cut(s.box(0, 0, 0, 100, 60, 30), hl), x)), "crossnear.step");
  const holes = r.features.filter((f: Result) => f.kind === "hole")
    .map((f: Result) => [f.dims_mm.diameter, f.dims_mm.depth, f.dims_mm.max_depth ?? null] as [number, number, number | null])
    .sort((a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1]);
  expect(holes).toHaveLength(2);
  approx(holes[0][0], 4.0); approx(holes[0][1], 100.0); expect(holes[0][2]).toBeNull();
  approx(holes[1][0], 8.0); approx(holes[1][1], 27.0); approx(holes[1][2]!, 30.0);
});
