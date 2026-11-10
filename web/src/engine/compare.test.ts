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
  // Only the mixed row is left out: a changed hole-only row of the same rule is still caught
  const k2 = structuredClone(k);
  k2.findings.push({ id: "F5", rule: "access", severity: "high", feature: "hole-1", measured: 2, limit: 0.5, title: "slant" });
  k2.rows.push({ id: "row:F5", rule: "access", findings: ["F5"], range: "F5", count: 1, sentence: "slant." });
  const r2 = s2result();
  r2.findings.push({ id: "F3", rule: "access", severity: "high", feature: "hole-1", measured: 2, limit: 0.5, title: "slant" });
  r2.rows.push({ id: "row:F3", rule: "access", findings: ["F3"], range: "F3", count: 1, sentence: "slant." });
  expect(compare(r2, k2, 2).status).toBe("same");
  r2.rows[2].sentence = "Slant.";
  expect(compare(r2, k2, 2).status).toBe("different");
  const turned = { ...s2key(), rules_run: ["hole_depth", "hole_size", "turn_axis"] };
  const r = { ...key(), rules_run: [], checks_run: [] };
  const t = compare(r, turned, 2);
  expect(t.status).toBe("same");
  expect(t.leftOut).toEqual(["features", "findings", "rows", "passed", "passed_rows"]);
});

// S3: a hole-only key with a plan and cost drivers; the plan keys compare only where the key has no pocket or corner
// and no finding from a rule not ported (port spec Parity S3).
const planKeys = () => ({
  machine: "3-axis mill",
  stock: { shape: "block", size_in: [1, 2, 3] },
  setups: [{ direction: "+Z", features: ["hole-1"] }],
  operations: [{ setup: 0, tool: "dr-0.2500", features: ["hole-1"], faces: [3, 4] }],
  tools: [{ id: "dr-0.2500", kind: "drill", diameter_in: 0.25, undersized: false }],
  tool_changes: 1,
  cost_drivers: [
    { driver: "deep_holes", label: "Deep holes and bores", count: 1, weight: 1.0, score: 1.0, weight_source: "estimate", findings: ["F1"] },
    { driver: "distinct_tools", label: "Distinct tools", count: 1, weight: 1.0, score: 1.0, weight_source: "estimate", findings: [] },
  ],
  cost_total: 2.0,
});
const s3key = () => {
  const k = s2key();
  return { ...k, ...planKeys(), features: [structuredClone(hole)], findings: [k.findings[0], { ...k.findings[2], id: "F2" }],
    rows: [k.rows[0], { ...k.rows[2], id: "row:F2", findings: ["F2"], range: "F2" }],
    rules_run: ["hole_depth", "hole_size", "access"], checks_run: ["Hole depth check", "Hole size check", "Access check"],
    passed: [k.passed[0]], passed_rows: [] };
};

test("S3: the plan and cost keys compare on a hole-only file, and every planted change is caught", () => {
  expect(compare(s3key(), s3key(), 3)).toEqual({ status: "same", diffs: [], leftOut: [] });
  const cases: [string, (r: ReturnType<typeof s3key>) => void][] = [
    ["machine", (r) => { r.machine = "4/5-axis mill or fixture"; }],
    ["stock", (r) => { r.stock.size_in[2] = 3.001; }],
    ["setup direction", (r) => { r.setups[0].direction = "-Z"; }],
    ["operation faces", (r) => { r.operations[0].faces = [3]; }],
    ["tool id", (r) => { r.tools[0].id = "dr-0.2510"; }],
    ["tool changes", (r) => { r.tool_changes = 2; }],
    ["driver order", (r) => { r.cost_drivers.reverse(); }],
    ["driver findings", (r) => { r.cost_drivers[0].findings = ["F2"]; }],
    ["cost total", (r) => { r.cost_total = 2.1; }],
    ["operation order", (r) => { r.operations.push({ setup: 0, tool: "cs-90", features: ["hole-1"], faces: [5] }); }],
    ["setup features", (r) => { r.setups[0].features = []; }],
    ["tool undersized", (r) => { r.tools[0].undersized = true; }],
  ];
  for (const [what, plant] of cases) {
    const r = s3key();
    plant(r);
    expect(compare(r, s3key(), 3).status, what).toBe("different");
    expect(compare(r, s3key(), 2).status, `${what} at S2`).toBe("same"); // S2 did not compare the plan
  }
});

test("S3: a key with a pocket or an unported finding leaves the plan and cost out; its driver ids map like rows", () => {
  const withPocket = { ...s3key(), features: [structuredClone(hole), { id: "pocket-1", kind: "pocket", faces: [7] }] };
  const r = { ...s3key(), machine: "other", cost_total: 9 };
  expect(compare(r, withPocket, 3)).toEqual({ status: "same", diffs: [], leftOut: ["plan and cost"] });
  const withWall = s3key();
  withWall.findings.push({ id: "F3", rule: "thin_wall", severity: "high", feature: "wall-1", measured: 0.5, limit: 1, title: "thin" });
  expect(compare(r, withWall, 3).leftOut).toEqual(["plan and cost"]);
});

test("S3: driver finding ids compare after renumbering, so an unported rule's finding ahead of them changes nothing", () => {
  // Python numbers findings across all rules: with an unported rule's finding first (a turned file's turn_axis, say)
  // its ids shift. Here a qualifying file's two sides number the same findings differently and still agree.
  const k = s3key();
  k.findings = [{ ...k.findings[0], id: "F7" }, { ...k.findings[1], id: "F9" }];
  k.rows = [{ ...k.rows[0], id: "row:F7", findings: ["F7"], range: "F7" }, { ...k.rows[1], id: "row:F9", findings: ["F9"], range: "F9" }];
  k.cost_drivers[0].findings = ["F7"];
  expect(compare(s3key(), k, 3).status).toBe("same");
  k.cost_drivers[0].findings = ["F9"];
  expect(compare(s3key(), k, 3).status).toBe("different");
});

// S4: pockets and corners, the pocket rules and part.not_analysed_faces (on milled files; turned files from S6).
const pocket = { id: "pocket-1", kind: "pocket", faces: [7, 9], axis: [0, 0, 1], open_dirs: ["+Z"], open_vectors: [[0, 0, 1]],
  dims_mm: { depth: 12.7, min_corner_radius: 3.175, end_mill_mm: 6.35, undersized: 0, narrowest_width: 30 } };
const corner = { id: "corner-1", kind: "corner", faces: [10], axis: [0, 0, 1], open_dirs: [], open_vectors: [],
  dims_mm: { radius: 3.175, depth: 12.7, end_mill_mm: 6.35 }, pocket: "pocket-1" };
const s4key = () => {
  const k = s3key();
  return { ...k, features: [structuredClone(hole), structuredClone(pocket), structuredClone(corner)],
    findings: [...k.findings, { id: "F3", rule: "pocket_depth", severity: "medium", feature: "pocket-1", measured: 2, limit: 3, title: "deep pocket" }],
    rows: [...k.rows, { id: "row:F3", rule: "pocket_depth", findings: ["F3"], range: "F3", count: 1, sentence: "deep." }],
    rules_run: ["hole_depth", "hole_size", "corner_radius", "pocket_depth", "undercut", "access"],
    checks_run: ["Hole depth check", "Hole size check", "Corner radius check", "Pocket depth check", "Undercut check", "Access check"],
    passed: [k.passed[0], { rule: "undercut", feature: "pocket-1", title: "No undercut" }] };
};

test("S4: pockets, corners and their rules compare, the plan compares on a pocket file, and every planted change is caught", () => {
  expect(compare(s4key(), s4key(), 4)).toEqual({ status: "same", diffs: [], leftOut: [] });
  const cases: [string, (r: ReturnType<typeof s4key>) => void][] = [
    ["pocket depth", (r) => { r.features[1].dims_mm.depth = 12.71; }],
    ["undercut key", (r) => { (r.features[1].dims_mm as Record<string, number>).undercut_mm = 2; }],
    ["corner dropped", (r) => { r.features.pop(); }],
    ["corner's pocket", (r) => { (r.features[2] as typeof corner).pocket = "pocket-2"; }],
    ["pocket finding", (r) => { r.findings[2].measured = 2.1; }],
    ["pocket row", (r) => { r.rows[2].sentence = "Deep."; }],
    ["pocket pass", (r) => { r.passed.pop(); }],
    ["rules_run", (r) => { r.rules_run = r.rules_run.filter((id) => id !== "undercut"); }],
    ["not_analysed_faces", (r) => { r.part.not_analysed_faces = []; }],
    ["plan on a pocket file", (r) => { r.setups[0].features = ["hole-1", "pocket-1"]; }],
  ];
  for (const [what, plant] of cases) {
    const r = s4key();
    plant(r);
    expect(compare(r, s4key(), 4).status, what).toBe("different");
  }
  // S3 left pockets, their rules, the plan on this file and not_analysed_faces out
  const r = s4key();
  r.features[1].dims_mm.depth = 99;
  r.part.not_analysed_faces = [];
  r.rules_run = ["hole_depth", "hole_size", "access"]; // what the S3 browser copy ran
  r.checks_run = ["Hole depth check", "Hole size check", "Access check"];
  expect(compare(r, s4key(), 3).diffs).toEqual([]);
});

test("S4: a turned file still leaves not_analysed_faces out (Python's turned pockets: S6)", () => {
  const turned = { ...key(), rules_run: ["hole_depth", "hole_size", "turn_axis"] };
  const r = { ...key(), rules_run: [], checks_run: [], part: { ...key().part, not_analysed_faces: [] } };
  expect(compare(r, turned, 4).status).toBe("same");
});
