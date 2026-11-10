// The parity compare catches what it must (port spec Parity): planted changes on a small key.
import { expect, test } from "vitest";
import { compare, MSG_FAILED } from "./compare";

const key = () => ({
  part: { name: "p.step", units_in_file: "mm", bbox_in: [1, 2, 3], face_count: 2, volume_mm3: 1234.5678, ignored_solids: 0,
    not_analysed_faces: [1], frame: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } },
  faces: [
    { id: 0, kind: "plane", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
    { id: 1, kind: "torus", positions: [5, 5, 5, 6, 5, 5, 5, 6, 5], indices: [0, 1, 2] },
  ],
  assumptions: ["a", "b"],
  rules_run: ["hole_depth"],
  checks_run: ["Hole depth check"],
  findings: [{ id: "F1" }],
});

test("the same result passes, with Python's unported rules and keys left out", () => {
  const r = { ...key(), rules_run: [], checks_run: [], findings: [], not_compared: 1 } as Record<string, unknown>;
  delete r.not_compared;
  expect(compare(r, key()).status).toBe("same");
});

test("a number off at the 6th significant figure, a kind, a count or a point is caught", () => {
  const base = () => ({ ...key(), rules_run: [], checks_run: [] });
  const cases: [string, (r: ReturnType<typeof base>) => void][] = [
    ["volume", (r) => { r.part.volume_mm3 = 1234.58; }],
    ["kind", (r) => { r.faces[1].kind = "other"; }],
    ["indices", (r) => { r.faces[0].indices = [0, 1, 2, 0, 1, 2]; }],
    ["point", (r) => { r.faces[0].positions[4] = 2e-5; }],
    ["assumption", (r) => { r.assumptions = ["a"]; }],
    ["units", (r) => { r.part.units_in_file = "inch"; }],
  ];
  for (const [what, plant] of cases) {
    const r = base();
    plant(r);
    expect(compare(r, key()).status, what).toBe("different");
  }
});

test("rounding at a tie and triangle order are not differences", () => {
  const r = { ...key(), rules_run: [], checks_run: [] };
  r.faces[0].positions = [0, 1, 0, 1 + 1e-5, 0, 0, 0, 0, 0]; // points reordered, one 1e-5 off
  r.faces[0].indices = [2, 1, 0];
  r.part.volume_mm3 = 1234.5678 * (1 + 4e-7);
  expect(compare(r, key()).status).toBe("same");
});

test("refusals need the same message; a Python crash needs a result or MSG_FAILED", () => {
  expect(compare({ error: "x" }, { error: "x" }).status).toBe("same");
  expect(compare({ error: "y" }, { error: "x" }).status).toBe("different");
  expect(compare(key(), { error: "x" }).status).toBe("different");
  expect(compare({ error: MSG_FAILED }, { crash: -11 })).toEqual({ status: "python_crashed", diffs: [] });
  expect(compare({ error: "x" }, { crash: -11 }).diffs.length).toBe(1);
});
