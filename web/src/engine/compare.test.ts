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
  // walls are S5: a wall, its finding and its pass on the key alone are left out at S4
  const withWall = s4key() as ReturnType<typeof s4key> & { features: unknown[] };
  withWall.features.push({ id: "wall-1", kind: "wall", faces: [11], dims_mm: { thickness: 0.5 } });
  withWall.passed.push({ rule: "thin_wall", feature: "wall-1", title: "w" });
  expect(compare(s4key(), withWall, 4).status, "a wall at S4").toBe("same");
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

// S5: walls (between planar faces and at holes) and thin_wall; the plan and cost now compare on a thin-wall file.
const wall = { id: "wall-1", kind: "wall", faces: [11, 12], axis: [0, 0, -1], open_dirs: [], open_vectors: [],
  dims_mm: { thickness: 0.5, overlap_mm2: 120 } };
const holeWall = { id: "wall-2", kind: "wall", faces: [3, 12], axis: null, open_dirs: [], open_vectors: [],
  dims_mm: { thickness: 1.2 }, hole: "hole-1", at: "side" };
const s5key = () => {
  const k = s4key();
  return { ...k, features: [...k.features, structuredClone(wall), structuredClone(holeWall)],
    findings: [...k.findings, { id: "F4", rule: "thin_wall", severity: "high", feature: "wall-1", measured: 0.01969, limit: 0.03,
      title: "Wall 0.020 in thick (limit 0.030 in)" }],
    rows: [...k.rows, { id: "row:F4", rule: "thin_wall", findings: ["F4"], range: "F4", count: 1, sentence: "thin." }],
    rules_run: ["hole_depth", "hole_size", "corner_radius", "pocket_depth", "undercut", "thin_wall", "access"],
    checks_run: ["Hole depth check", "Hole size check", "Corner radius check", "Pocket depth check", "Undercut check",
      "Thin wall check", "Access check"],
    passed: [...k.passed, { rule: "thin_wall", feature: "wall-2", title: "0.047 in thick, at least 0.030 in" }],
    passed_rows: [...k.passed_rows, { rule: "thin_wall", kind: "wall", features: ["wall-2"], title: "Walls ×1" }],
    cost_drivers: [...k.cost_drivers, { driver: "thin_walls", label: "Thin walls", count: 1, weight: 2, score: 2, weight_source: "drivers.toml", findings: ["F4"] }] };
};

test("S5: walls and thin_wall compare, the plan compares on a thin-wall file, and every planted change is caught", () => {
  expect(compare(s5key(), s5key(), 5)).toEqual({ status: "same", diffs: [], leftOut: [] });
  const cases: [string, (r: ReturnType<typeof s5key>) => void][] = [
    ["wall thickness", (r) => { (r.features[3].dims_mm as Record<string, number>).thickness = 0.50001; }],
    ["wall overlap", (r) => { (r.features[3].dims_mm as Record<string, number>).overlap_mm2 = 121; }],
    ["hole wall's hole", (r) => { (r.features[4] as typeof holeWall).hole = "hole-2"; }],
    ["hole wall's place", (r) => { (r.features[4] as typeof holeWall).at = "tip"; }],
    ["wall dropped", (r) => { r.features.pop(); }],
    ["thin_wall finding", (r) => { r.findings[3].title = "Wall 0.0197 in thick (limit 0.030 in)"; }],
    ["thin_wall row", (r) => { r.rows[3].sentence = "Thin."; }],
    ["thin_wall pass", (r) => { r.passed.pop(); }],
    ["rules_run", (r) => { r.rules_run = r.rules_run.filter((id) => id !== "thin_wall"); }],
    ["thin walls driver", (r) => { r.cost_drivers[r.cost_drivers.length - 1].score = 3; }],
    ["wall passed row", (r) => { r.passed_rows.pop(); }],
  ];
  for (const [what, plant] of cases) {
    const r = s5key();
    plant(r);
    expect(compare(r, s5key(), 5).status, what).toBe("different");
  }
  // S4 left the walls, thin_wall and the plan on a thin-wall file out
  expect(compare(s4key(), s5key(), 4)).toEqual({ status: "same", diffs: [], leftOut: ["plan and cost"] });
});

// S6: a turned file compares every key above, with bores, grooves, the profile, the turn rules, turn_axis and a bar.
const bore = { id: "bore-1", kind: "bore", faces: [2, 3], axis: [0, 0, 1], open_dirs: ["+Z"], open_vectors: [[0, 0, 1]],
  dims_mm: { diameter: 15, depth: 40 }, off_axis_deg: 0, off_axis_mm: 0 };
const groove = { id: "groove-1", kind: "groove", faces: [4, 5, 6], axis: [0, 0, 1], open_dirs: [], open_vectors: [], outside: true,
  dims_mm: { width: 3.2, depth: 1.5, diameter: 22 } };
const profile = { id: "profile-1", kind: "profile", faces: [0, 1, 7], axis: [0, 0, 1], open_dirs: [], open_vectors: [],
  dims_mm: { diameter: 25, min_diameter: 22, length: 120, share_pct: 81.5 } };
const s6key = () => {
  const k = s5key();
  return { ...k, features: [{ ...structuredClone(hole), off_axis_deg: 90, off_axis_mm: 0 }, structuredClone(bore),
    structuredClone(groove), structuredClone(profile)],
    findings: [{ id: "F1", rule: "turn_slender", severity: "medium", feature: "profile-1", measured: 5.45, limit: 4, title: "slender" },
      { id: "F2", rule: "turn_offaxis", severity: "medium", feature: "hole-1", measured: 90, limit: 0.5, title: "off axis" },
      { id: "F3", rule: "bore_depth", severity: "medium", feature: "bore-1", measured: 2.67, limit: 4, title: "deep bore" }],
    rows: [{ id: "row:F1", rule: "turn_slender", findings: ["F1"], range: "F1", count: 1, sentence: "slender." },
      { id: "row:F2", rule: "turn_offaxis", findings: ["F2"], range: "F2", count: 1, sentence: "off." },
      { id: "row:F3", rule: "bore_depth", findings: ["F3"], range: "F3", count: 1, sentence: "deep." }],
    rules_run: ["hole_depth", "hole_size", "thin_wall", "turn_axis", "turn_slender", "turn_offaxis", "bore_depth"],
    checks_run: ["Hole depth check", "Hole size check", "Thin wall check", "Turning axis check", "Length to diameter check", "Bore depth check"],
    passed: [{ rule: "turn_axis", feature: "profile-1", title: "Round faces on one axis: a lathe part" }],
    passed_rows: [{ rule: "turn_axis", kind: "profile", features: ["profile-1"], title: "Profile ×1" }],
    machine: "lathe with live tooling", turn_axis: [0, 0, 1],
    stock: { shape: "bar", diameter_in: 0.984252, length_in: 4.724409 },
    setups: [{ direction: "turn", features: ["profile-1", "hole-1", "bore-1", "groove-1"] }],
    cost_drivers: [{ driver: "off_axis", label: "Features off the turning axis", count: 1, weight: 2, score: 2, weight_source: "drivers.toml", findings: ["F2"] }] };
};

test("S6: a turned file compares every key, and every planted change is caught", () => {
  expect(compare(s6key(), s6key(), 6)).toEqual({ status: "same", diffs: [], leftOut: [] });
  const cases: [string, (r: ReturnType<typeof s6key>) => void][] = [
    ["bore depth", (r) => { (r.features[1].dims_mm as Record<string, number>).depth = 40.01; }],
    ["bore renamed", (r) => { r.features[1].id = "bore-2"; }],
    ["hole off-axis angle", (r) => { (r.features[0] as { off_axis_deg: number }).off_axis_deg = 89; }],
    ["groove width", (r) => { (r.features[2].dims_mm as Record<string, number>).width = 3.3; }],
    ["groove outside", (r) => { (r.features[2] as typeof groove).outside = false; }],
    ["profile smallest diameter", (r) => { (r.features[3].dims_mm as Record<string, number>).min_diameter = 25; }],
    ["profile faces", (r) => { r.features[3].faces = [0, 1]; }],
    ["slender finding", (r) => { r.findings[0].measured = 5.5; }],
    ["off-axis row", (r) => { r.rows[1].sentence = "Off."; }],
    ["turn_axis pass", (r) => { r.passed.pop(); }],
    ["rules_run", (r) => { r.rules_run = r.rules_run.filter((id) => id !== "bore_depth"); }],
    ["machine", (r) => { r.machine = "lathe"; }],
    ["turn_axis", (r) => { (r as { turn_axis: number[] }).turn_axis = [0, 0, -1]; }],
    ["bar stock", (r) => { (r.stock as { diameter_in: number }).diameter_in = 1; }],
    ["off-axis driver", (r) => { r.cost_drivers[0].score = 3; }],
  ];
  for (const [what, plant] of cases) {
    const r = s6key();
    plant(r);
    expect(compare(r, s6key(), 6).status, what).toBe("different");
  }
  // S5 compared a turned file on the S1 keys only
  const r = s6key();
  r.features = [];
  r.machine = "lathe";
  r.rules_run = []; // what the S5 browser copy ran on a turned part
  r.checks_run = [];
  expect(compare(r, s6key(), 5).status).toBe("same");
});

test("S6: looks_turned compares on a milled file", () => {
  const k = { ...s5key(), findings: [...s5key().findings, { id: "F5", rule: "looks_turned", severity: "high", feature: null, measured: 55, limit: 40, title: "looks turned" }] };
  const r = structuredClone(k);
  expect(compare(r, k, 6).status).toBe("same");
  r.findings[4].measured = 56;
  expect(compare(r, k, 6).status).toBe("different");
});

const s7key = () => ({
  ...s6key(),
  findings: [...s6key().findings, { id: "F9", rule: "hole_mismatch", severity: "medium", feature: "hole-1", measured: 0.002,
    title: "Hole1 hole on hole-1: diameter", hole_feature: "hf-1", ipt_hole: "hf-1.1" }],
  inventor: {
    name: "p.ipt", saved_with: "2021 (Build 250183000, 183)", acis_version: "226.0.3.65535",
    checks: { faces: [10, 12], corners: [8, 8], worst_corner_gap_mm: null },
    threads: [{ id: "thread-1", designation: "M6x1", state: "matched", hole: "hole-1", gaps: [], start: [0, 0, 1] }],
    hole_features: [{ id: "hf-1", name: "Hole1", type: "simple", diameter_mm: 5, state: "disagrees",
      holes: [{ id: "hf-1.1", state: "disagrees", hole: "hole-1", gaps: [{ what: "diameter", mm: 0.05, text: "Ø…" }] }] }],
    hole_names_seen: 1,
    blends: [{ id: "bl-1", kind: "fillet", radius_mm: 2, step_faces: [3, 4], state: "matched", gaps: [] }],
  },
  checks_not_run: [], cost_partial: false,
});

test("S7: every key compares, ids as they are, the browser-only keys and the harness's note are left out", () => {
  const k = { ...s7key(), __harness: { transform: [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, 0]] } } as Record<string, unknown>;
  delete k.checks_not_run;
  delete k.cost_partial;
  expect(compare(s7key(), k, 7)).toEqual({ status: "same", diffs: [], leftOut: [] });
  const cases: [string, (r: ReturnType<typeof s7key>) => void][] = [
    ["finding id", (r) => { r.findings[r.findings.length - 1].id = "F10"; }],
    ["saved with", (r) => { r.inventor.saved_with = "2024"; }],
    ["face check", (r) => { r.inventor.checks.faces = [10, 11]; }],
    ["thread state", (r) => { r.inventor.threads[0].state = "disagrees"; }],
    ["thread start", (r) => { r.inventor.threads[0].start = [0, 0, 1.0001]; }],
    ["hole feature name", (r) => { r.inventor.hole_features[0].name = "Hole2"; }],
    ["ipt hole gap", (r) => { r.inventor.hole_features[0].holes[0].gaps[0].mm = 0.06; }],
    ["names seen", (r) => { r.inventor.hole_names_seen = 0; }],
    ["blend faces", (r) => { r.inventor.blends[0].step_faces = [3]; }],
    ["no inventor", (r) => { delete (r as Partial<typeof r>).inventor; }],
    ["a key Python has not", (r) => { (r as Record<string, unknown>).extra = 1; }],
  ];
  for (const [what, plant] of cases) {
    const r = s7key();
    plant(r);
    expect(compare(r, k, 7).status, what).toBe("different");
  }
});
