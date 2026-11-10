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
  expect(compare(r, key(), 1).status).toBe("same");
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
    expect(compare(r, key(), 1).status, what).toBe("different");
  }
});

test("rounding at a tie and triangle order are not differences", () => {
  const r = { ...key(), rules_run: [], checks_run: [] };
  r.faces[0].positions = [0, 1, 0, 1 + 1e-5, 0, 0, 0, 0, 0]; // points reordered, one 1e-5 off
  r.faces[0].indices = [2, 1, 0];
  r.part.volume_mm3 = 1234.5678 * (1 + 4e-7);
  expect(compare(r, key(), 1).status).toBe("same");
});

test("refusals need the same message; a Python crash needs a result or MSG_FAILED", () => {
  expect(compare({ error: "x" }, { error: "x" }).status).toBe("same");
  expect(compare({ error: "y" }, { error: "x" }).status).toBe("different");
  expect(compare(key(), { error: "x" }).status).toBe("different");
  expect(compare({ error: MSG_FAILED }, { crash: -11 })).toEqual({ status: "python_crashed", diffs: [], leftOut: [] });
  expect(compare({ error: "x" }, { crash: -11 }).diffs.length).toBe(1);
});

// S2: a key with a hole, a pocket, a wall, findings from ported and unported rules, rows and passes, in Python's shape.
const hole = { id: "hole-1", kind: "hole", faces: [3, 4], dims_mm: { diameter: 6.35, depth: 50.8 }, open_dirs: [], open_vectors: [[0, 0.6, 0.8]] };
const s2key = () => ({
  ...key(),
  rules_run: ["hole_depth", "hole_size", "corner_radius", "access"],
  checks_run: ["Hole depth check", "Hole size check", "Corner radius check", "Access check"],
  features: [structuredClone(hole), { id: "pocket-1", kind: "pocket", faces: [7] }, { id: "wall-1", kind: "wall", faces: [8] }],
  findings: [
    { id: "F1", rule: "hole_depth", severity: "high", feature: "hole-1", measured: 8, limit: 6, title: "deep" },
    { id: "F2", rule: "corner_radius", severity: "high", feature: "corner-1", measured: 0, limit: 0.03, title: "sharp" },
    { id: "F3", rule: "access", severity: "medium", feature: "hole-1", measured: 36.9, limit: 0.5, title: "angled hole" },
  ],
  rows: [
    { id: "row:F1", rule: "hole_depth", findings: ["F1"], range: "F1", count: 1, sentence: "8.0×" },
    { id: "row:F2", rule: "corner_radius", findings: ["F2"], range: "F2", count: 1, sentence: "sharp" },
    { id: "row:F3", rule: "access", findings: ["F3"], range: "F3", count: 1, sentence: "angled hole." },
  ],
  passed: [{ rule: "hole_size", feature: "hole-1", title: "Standard drill: 0.250 in (1/4)" }, { rule: "thin_wall", feature: "wall-1", title: "w" }],
  passed_rows: [{ id: "row:pass-wall-thin_wall", rule: "thin_wall", kind: "wall", features: ["wall-1"] }],
});
/** What the browser engine returns at S2 for s2key: the hole items only, its findings numbered F1, F2. */
const s2result = () => {
  const k = s2key();
  return {
    ...k,
    rules_run: ["hole_depth", "hole_size", "access"],
    checks_run: ["Hole depth check", "Hole size check", "Access check"],
    features: [structuredClone(hole)],
    findings: [{ ...k.findings[0] }, { ...k.findings[2], id: "F2" }],
    rows: [{ ...k.rows[0] }, { ...k.rows[2], id: "row:F2", findings: ["F2"], range: "F2" }],
    passed: [k.passed[0]],
    passed_rows: [],
  };
};

test("S2: Python's unported kinds and rules are left out and the findings renumbered", () => {
  expect(compare(s2result(), s2key(), 2)).toEqual({ status: "same", diffs: [], leftOut: [] });
});

test("S2: a changed hole, finding, row, pass or rule list is caught", () => {
  const cases: [string, (r: ReturnType<typeof s2result>) => void][] = [
    ["hole depth", (r) => { r.features[0].dims_mm.depth = 50.81; }],
    ["hole dropped", (r) => { r.features = []; }],
    ["finding title", (r) => { r.findings[0].title = "Deep"; }],
    ["finding order", (r) => { r.findings.reverse(); }],
    ["row range", (r) => { r.rows[1].range = "F3"; }],
    ["row sentence", (r) => { r.rows[0].sentence = "8.0x"; }],
    ["passed", (r) => { r.passed = []; }],
    ["rules_run", (r) => { r.rules_run = ["hole_depth", "hole_size"]; }],
  ];
  for (const [what, plant] of cases) {
    const r = s2result();
    plant(r);
    expect(compare(r, s2key(), 2).status, what).toBe("different");
  }
});

test("S2: an access row that mixes a pocket's finding is left out on both sides; a turned file compares S1 keys", () => {
  const k = s2key();
  k.findings.push({ id: "F4", rule: "access", severity: "medium", feature: "pocket-1", measured: 20, limit: 0.5, title: "angled pocket" });
  k.rows[2] = { ...k.rows[2], findings: ["F3", "F4"], range: "F3 F4", count: 2, sentence: "angled hole. Worst of 2." };
  const outcome = compare(s2result(), k, 2);
  expect(outcome.status).toBe("same");
  expect(outcome.leftOut).toEqual(["rows (access)"]);
  const turned = { ...s2key(), rules_run: ["hole_depth", "hole_size", "turn_axis"] };
  const r = { ...key(), rules_run: [], checks_run: [] };
  const t = compare(r, turned, 2);
  expect(t.status).toBe("same");
  expect(t.leftOut).toEqual(["features", "findings", "rows", "passed", "passed_rows"]);
});
