// Port of tests/service/test_pocket_edges.py (set 1 after the stress test): the labelled set in
// tests/grading/sets/pocket_edges is scored with the grading scorer, and each pocket's depth and narrowest gap must match
// MANIFEST.md (measured on the built parts).
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { POCKET_CLASSES, scores, type Tally } from "../../grading/score";
import { loadNodeOc } from "../node";
import type { OC } from "../oc";
import { analyseFile, approx, scoreFile, setDir, sumOf, total, type Result } from "./groupc-kit";

const SET = setDir("pocket_edges");
const FILES = readdirSync(SET).filter((f) => f.endsWith(".step")).sort().map((f) => resolve(SET, f));
const stem = (p: string) => p.split("/").pop()!.replace(/\.step$/, "");
const EXPECTED = new Map<string, [number, number]>();
for (const m of readFileSync(resolve(SET, "MANIFEST.md"), "utf8").matchAll(/^- `(\w+)` · .* · ([\d.]+) · ([\d.]+) · \d+$/gm)) {
  EXPECTED.set(m[1], [Number(m[2]), Number(m[3])]);
}

let oc: OC;
beforeAll(async () => { oc = await loadNodeOc(); });

describe("set_part", () => {
  for (const path of FILES) {
    test(stem(path), async () => {
      const { counts, missed } = await scoreFile(oc, path);
      const s = scores(counts);
      expect(s.precision.pocket.n, "a face that is not a pocket's was called one").toBe(s.precision.pocket.of);
      expect(missed).toEqual([]);
    });
  }
});

describe("depth and narrowest gap", () => {
  for (const path of FILES) {
    test(stem(path), async () => {
      const [depth, narrowest] = EXPECTED.get(stem(path))!;
      const pockets = (await analyseFile(oc, path)).features.filter((f: Result) => f.kind === "pocket");
      expect(pockets).toHaveLength(1);
      approx(pockets[0].dims_mm.depth, depth, 1e-3);
      approx(pockets[0].dims_mm.narrowest_width, narrowest, 1e-3);
    });
  }
});

test("set_totals", async () => {
  const parts: Tally[] = [];
  for (const path of FILES) parts.push((await scoreFile(oc, path)).counts);
  const s = total(parts);
  expect(FILES.length).toBe(11);
  expect(EXPECTED.size).toBe(11);
  const of = sumOf(s, POCKET_CLASSES, "of");
  expect(sumOf(s, POCKET_CLASSES, "n")).toBe(of);
  expect(of).toBe(100);
});
