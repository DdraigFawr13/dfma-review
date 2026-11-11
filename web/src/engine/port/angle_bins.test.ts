// Port of tests/service/test_angle_bins.py. D-063: a cylinder face's whole-degree bins are taken after snapping each
// angle to 9 decimals, so a sample at a whole degree lands in one bin whatever 1-ulp noise atan2 carries (the
// browser's atan2 is one step off glibc's at a seam; S5 parity found it on 4 NIST linkage arms).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { cylinder, Topology, wholeDegree } from "../features/holes";
import { readStep } from "../read";
import { oc, ROOT } from "./helpers";

test("whole degree snaps noise at a whole degree", () => {
  expect(wholeDegree(269.99999999999994)).toBe(270); // the browser's value at linkage_arm_42's seam
  expect(wholeDegree(269.99999999999997)).toBe(270); // this Python's value there
  expect(wholeDegree(360 - 1e-13)).toBe(0);
  expect(wholeDegree(89.9999999)).toBe(89); // a real 89.9999999 deg stays in 89
});

test("the seam bin on a NIST part", async () => {
  const path = resolve(ROOT, "tests/edmr/models/NIST/Manfred_Osti/spectrometer/linkage_arm_42/linkage_arm_42.prt.hh.sat.stp");
  const engine = await oc();
  engine.FS.writeFile("/in.step", new Uint8Array(readFileSync(path)));
  try {
    const part = readStep(engine, "/in.step");
    const c = cylinder(new Topology(engine, part.solid, part.faces), 5, true);
    expect(c).not.toBeNull();
    expect(c!.bins.has(90)).toBe(true); // 89.99999999999999 before the snap: bin 90 was missing
  } finally {
    engine.FS.unlink("/in.step");
  }
});
