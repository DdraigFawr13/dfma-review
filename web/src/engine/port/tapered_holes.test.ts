// Port of tests/service/test_tapered_holes.py (D-018 tapered-holes round): the labelled set in
// tests/grading/sets/tapered_holes is scored with the grading scorer. Tapered holes (cones up to TAPER_MAX_DEG) are holes
// with their taper and narrow end; countersinks, entry chamfers and a drafted boss are not holes.
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { HOLE_CLASSES, scores, type Tally } from "../../grading/score";
import { loadNodeOc } from "../node";
import type { OC } from "../oc";
import { analyseFile, approx, scoreFile, setDir, sumOf, total, type Result } from "./groupc-kit";

const SET = setDir("tapered_holes");
const FILES = readdirSync(SET).filter((f) => f.endsWith(".step")).sort().map((f) => resolve(SET, f));
const stem = (p: string) => p.split("/").pop()!.replace(/\.step$/, "");

let oc: OC;
beforeAll(async () => { oc = await loadNodeOc(); });

describe("set_part", () => {
  for (const path of FILES) {
    test(stem(path), async () => {
      const { counts, missed } = await scoreFile(oc, path);
      const s = scores(counts);
      expect(s.precision.hole.n, "a face that is not a hole's was called one").toBe(s.precision.hole.of);
      expect(missed).toEqual([]);
    });
  }
});

test("set_totals", async () => {
  const parts: Tally[] = [];
  for (const path of FILES) parts.push((await scoreFile(oc, path)).counts);
  const s = total(parts);
  expect(FILES.length).toBe(12);
  const of = sumOf(s, HOLE_CLASSES, "of");
  expect(sumOf(s, HOLE_CLASSES, "n")).toBe(of);
  expect(of).toBe(20);
});

test("tapered hole reports its taper and gets no drill size finding", async () => {
  const r = await analyseFile(oc, resolve(SET, "tp_pipe.step"));
  const holes = r.features.filter((f: Result) => f.kind === "hole");
  expect(holes).toHaveLength(1);
  const d = holes[0].dims_mm;
  approx(d.diameter, 21.3, 1e-3);
  approx(d.taper_deg, 1.79, 0.01);
  approx(d.small_diameter, 21.3 - (2 * 18) / 32, 1e-3);
  expect(r.findings.filter((f: Result) => f.rule === "hole_size")).toEqual([]); // 21.3 is no drill, but a taper is reamed
});
