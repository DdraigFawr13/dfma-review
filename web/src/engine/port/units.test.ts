// Port of tests/service/test_units.py. D-020 (HANDOFF 3a, stress-test units gaps): centimetre and metre files are
// metric (metric and inch drills, as mm files), and a file that declares no length unit is read as mm with an
// assumption line. The files are box_through_hole.step with its length unit rewritten.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { MSG_NO_UNIT } from "../settings";
import { nearestDrill } from "../tools";
import { analyzeBytes, PARTS, run } from "./groupa_common";

const BASE = readFileSync(resolve(PARTS, "box_through_hole.step"), "utf8");
const UNIT = "#430 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );\n";

function variant(name: "cm" | "m" | "none"): Uint8Array {
  const text = {
    cm: BASE.replace("SI_UNIT(.MILLI.,.METRE.)", "SI_UNIT(.CENTI.,.METRE.)"),
    m: BASE.replace("SI_UNIT(.MILLI.,.METRE.)", "SI_UNIT($,.METRE.)"),
    none: BASE.replace(UNIT, "").replace("(#430,#431,#432)", "(#431,#432)")
      .replace("LENGTH_MEASURE(1.E-07),#430,", "LENGTH_MEASURE(1.E-07),#431,"),
  }[name];
  expect(text).not.toBe(BASE);
  return new Uint8Array(Buffer.from(text, "utf8"));
}

for (const unit of ["cm", "m", "none"] as const) {
  test(`units_in_file[${unit}]`, async () => {
    expect((await analyzeBytes(variant(unit), `box_${unit}.step`)).part.units_in_file).toBe(unit);
  });
}

test("cm and m files get the metric drills", () => {
  for (const unit of ["mm", "cm", "m"]) expect(nearestDrill(6.6, unit).diameter_mm, unit).toBeCloseTo(6.6, 6); // metric: no finding
  for (const unit of ["inch", "none", "other"]) expect(nearestDrill(6.6, unit).metric, unit).toBe(false);
});

test("a file with no unit says it was read as mm", async () => {
  const r = await analyzeBytes(variant("none"), "box_none.step");
  expect(r.part.units_in_file).toBe("none");
  expect(r.assumptions).toContain(MSG_NO_UNIT);
  const mm = await run("box_through_hole");
  expect(mm.assumptions).not.toContain(MSG_NO_UNIT);
  expect(r.part.bbox_in).toEqual(mm.part.bbox_in); // read as mm: the same sizes
});
