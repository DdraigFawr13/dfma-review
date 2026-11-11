// Port of tests/service/test_expected.py (J3): every committed test part's features and findings match
// tests/parts/expected.toml exactly.
import { expect, test } from "vitest";
import type { Material, Process } from "../../api";
import { analyzeBytes, checkPlan, expectedParts, facesNear, partBytes } from "./groupb_common";

const ENTRIES = expectedParts();
const KINDS = ["hole", "pocket", "corner", "wall"];

test("enough parts", () => {
  expect(ENTRIES.length).toBeGreaterThanOrEqual(21);
});

for (const entry of ENTRIES) {
  const process = (entry.process ?? "mill") as Process;
  const material = (entry.material ?? "al6061") as Material;
  test(`part ${entry.name}-${process}-${material}`, async () => {
    const bytes = partBytes(entry.name);
    const result = await analyzeBytes(bytes, `${entry.name}.step`, process, material);
    expect(result.part.face_count).toBe(entry.face_count);
    const kinds = new Map<string, number>();
    for (const f of result.features) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
    expect(Object.fromEntries(KINDS.map((k) => [k, kinds.get(k) ?? 0]))).toEqual(entry.features);
    if ("turn" in entry) { // S6: the turning features of a part uploaded for turning
      expect(Object.fromEntries(Object.keys(entry.turn).map((k) => [k, kinds.get(k) ?? 0]))).toEqual(entry.turn);
    }

    const want: { rule: string; severity: string; measured: number; probe_mm: number[] }[] = entry.finding ?? [];
    const got = result.findings;
    expect(got.length, JSON.stringify(got.map((f: { title: string }) => f.title))).toBe(want.length);
    const unmatched = [...got];
    for (const w of want) {
      const probeFaces = await facesNear(bytes, w.probe_mm);
      expect(probeFaces.size, `probe ${w.probe_mm} is on no face of ${entry.name}.step`).toBeGreaterThan(0);
      // Ratios match to 0.01, inches to 0.001 (J3). Among findings that fit, the one sharing the most faces with the probe
      // wins: a probe on a sharp corner's edge touches both of its walls, and each wall also belongs to the next corner along it.
      const shared = (f: { faces: number[] }) => f.faces.filter((x) => probeFaces.has(x)).length;
      const fits = unmatched.filter((f) => f.rule === w.rule && f.severity === w.severity
        && Math.abs(f.measured - w.measured) <= (f.unit === "ratio" ? 0.01 : 0.001) && shared(f) > 0);
      let match: (typeof fits)[number] | undefined;
      for (const f of fits) if (match === undefined || shared(f) > shared(match)) match = f; // the first of the most, as max()
      expect(match, `no finding matches ${JSON.stringify(w)}; got ${JSON.stringify(got)}`).toBeDefined();
      unmatched.splice(unmatched.indexOf(match), 1);
    }
    await checkPlan(bytes, entry, result);
  });
}
