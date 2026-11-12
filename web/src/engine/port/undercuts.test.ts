// Port of tests/service/test_undercuts.py (set 2 after the stress test): the labelled set in tests/grading/sets/undercuts
// is scored with the grading scorer, and each part's pocket count and depth must match MANIFEST.md. D-021 adds the
// undercut finding ("undercut finding" tests below).
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { POCKET_CLASSES, scores, SLOT_CLASSES, type Tally } from "../../grading/score";
import { loadNodeOc } from "../node";
import type { OC } from "../oc";
import { MATERIALS, thresholds } from "../settings";
import { analyseFile, approx, ROOT, scoreFile, setDir, sumOf, total, type Result } from "./groupc-kit";

const SET = setDir("undercuts");
const FILES = readdirSync(SET).filter((f) => f.endsWith(".step")).sort().map((f) => resolve(SET, f));
const stem = (p: string) => p.split("/").pop()!.replace(/\.step$/, "");
const EXPECTED = new Map<string, [number, number | null]>();
for (const m of readFileSync(resolve(SET, "MANIFEST.md"), "utf8").matchAll(/^- `(\w+)` · .* · (\d+) · ([\d.]+|-)$/gm)) {
  EXPECTED.set(m[1], [Number(m[2]), m[3] === "-" ? null : Number(m[3])]);
}
const UNDERCUT_MM: Record<string, number> = { pk_lip: 2.0, pk_groove: 2.0, ts_closed: 4.0 }; // as built by make.py: lip 2, groove 2, T-slot (18 - 10) / 2

let oc: OC;
beforeAll(async () => { oc = await loadNodeOc(); });

describe("set_part", () => {
  for (const path of FILES) {
    test(stem(path), async () => {
      const { counts, missed } = await scoreFile(oc, path);
      const s = scores(counts);
      expect(s.precision.pocket.n, "a face that is not a pocket's was called one").toBe(s.precision.pocket.of);
      expect(s.claimed_on_excluded, "a slot face (not scored) was called a pocket or hole").toEqual({});
      // T-slots and dovetails (classes 6, 17-19 here) are not slots the finder calls (spec Non-goals); pockets must be whole
      expect((missed as { class: number }[]).filter((m) => !(m.class in SLOT_CLASSES))).toEqual([]);
    });
  }
});

describe("pockets and depth", () => {
  for (const path of FILES) {
    test(stem(path), async () => {
      const [count, depth] = EXPECTED.get(stem(path))!;
      const found = (await analyseFile(oc, path)).features.filter((f: Result) => f.kind === "pocket");
      expect(found).toHaveLength(count);
      if (count) approx(found[0].dims_mm.depth, depth!, 1e-3);
    });
  }
});

test("set_totals", async () => {
  const parts: Tally[] = [];
  for (const path of FILES) parts.push((await scoreFile(oc, path)).counts);
  const s = total(parts);
  expect(FILES.length).toBe(10);
  expect(EXPECTED.size).toBe(10);
  const of = sumOf(s, POCKET_CLASSES, "of");
  expect(sumOf(s, POCKET_CLASSES, "n")).toBe(of);
  expect(of).toBe(37);
});

describe("undercut finding", () => {
  // D-021 (Morgan: "Go with your recommendations"): a pocket with an undercut gets one medium finding, measured as how far
  // the undercut reaches under its lip; no other part of the set gets one.
  for (const path of FILES) {
    test(stem(path), async () => {
      const result = await analyseFile(oc, path, "mill", "al6061");
      const found = result.findings.filter((f: Result) => f.rule === "undercut");
      if (!(stem(path) in UNDERCUT_MM)) {
        expect(found).toEqual([]);
        return;
      }
      expect(found).toHaveLength(1);
      const f = found[0];
      expect([f.severity, f.unit, f.limit]).toEqual(["medium", "in", 0.0]);
      approx(f.measured, UNDERCUT_MM[stem(path)] / 25.4, 1e-5);
      expect(f.title).toContain("T-slot or lollipop cutter");
      const pockets = result.features.filter((p: Result) => p.kind === "pocket");
      expect(pockets).toHaveLength(1);
      expect(f.feature).toBe(pockets[0].id);
      expect(f.faces).toEqual(pockets[0].faces);
    });
  }
});

test("undercut rule is mill only", async () => {
  const result = await analyseFile(oc, resolve(SET, "pk_lip.step"), "turn", "al6061");
  expect(result.rules_run).not.toContain("undercut");
  expect(result.findings.filter((f: Result) => f.rule === "undercut")).toEqual([]);
});

test("undercut thresholds per material", () => {
  for (const m of MATERIALS) expect(thresholds(m).undercut).toEqual({ max_in: 0.0, source: "D-021" });
});

// No undercut finding (D-021) where the evidence doesn't show one. EDMR unterlaf (10 pockets) and daratech (2) have a ledge
// facing a pocket floor between two ribs, but the floor is open on 2 of its 4 sides, so a cutter may reach in from the
// side; the ledge stays one of the pocket's faces (set 2). daratech's walled pocket (floor at z = 8) took the plate's
// underside (z = 0 and 2, below the floor) as ceilings, 0.202 in; a ceiling must lie above the floor.
describe("no undercut finding without evidence", () => {
  for (const name of ["daratech", "unterlaf"]) {
    // unterlaf takes the Python twin 9.2 s (daratech 2.7 s), so both get the longer limit here (browser engine: about 8 and 10 s)
    test(name, { timeout: 120_000 }, async () => {
      const result = await analyseFile(oc, resolve(ROOT, "tests/edmr/models/STEP/STI", name, `${name}.stp`), "mill", "al6061");
      expect(result.findings.filter((f: Result) => f.rule === "undercut")).toEqual([]);
      expect(result.features.filter((f: Result) => f.kind === "pocket" && "undercut_mm" in f.dims_mm)).toEqual([]);
    });
  }
});
