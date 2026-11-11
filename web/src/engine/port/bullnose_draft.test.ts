// Port of tests/service/test_bullnose_draft.py (D-018 bull-nose and draft round): the labelled set in
// tests/grading/sets/bullnose_draft is scored with the grading scorer. Every pocket surface is found and nothing else is
// called a pocket: bull-nose and ball floors, drafted walls, islands, and the look-alike slots, steps and passages that
// are not pockets.
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { POCKET_CLASSES, scores, type Tally } from "../../grading/score";
import { loadNodeOc } from "../node";
import type { OC } from "../oc";
import { scoreFile, setDir, sumOf, total } from "./groupc-kit";

const SET = setDir("bullnose_draft");
const FILES = readdirSync(SET).filter((f) => f.endsWith(".step")).sort().map((f) => resolve(SET, f));
const stem = (p: string) => p.split("/").pop()!.replace(/\.step$/, "");
const KNOWN_MISSES = new Set<string>(); // dr_round_1deg (a 1 deg tapered recess) is read since the tapered-holes round

let oc: OC;
beforeAll(async () => { oc = await loadNodeOc(); });

describe("set_part", () => {
  for (const path of FILES) {
    test(stem(path), async () => {
      const { counts, missed } = await scoreFile(oc, path);
      const s = scores(counts);
      expect(s.precision.pocket.n, "a face that is not a pocket's was called one").toBe(s.precision.pocket.of);
      expect(s.precision.hole.n, "a face that is not a hole's was called one").toBe(s.precision.hole.of);
      if (!KNOWN_MISSES.has(path.split("/").pop()!)) expect(missed).toEqual([]);
    });
  }
});

test("set_totals", async () => {
  const parts: Tally[] = [];
  for (const path of FILES) parts.push((await scoreFile(oc, path)).counts);
  const s = total(parts);
  expect(FILES.length).toBe(31);
  expect([sumOf(s, POCKET_CLASSES, "n"), sumOf(s, POCKET_CLASSES, "of")]).toEqual([259, 259]);
});
