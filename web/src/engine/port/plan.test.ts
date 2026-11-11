// Port of tests/service/test_plan.py (S5): machine, setups, tools and tool changes (spec J4, Design "Plan"; D-022).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { cover, ORDER, pocketTools, rank, type Tool } from "../plan";
import * as access from "../rules/access";
import type { Feature, PartSummary } from "../rules/types";
import { analyzeBytes, analyzeShape, box, checkPlan, cut, cyl, expected, oc, partBytes, ROOT, run, type Feat, type Result } from "./groupb_common";

const approx = (v: number, want: number, abs: number) => expect(Math.abs(v - want)).toBeLessThanOrEqual(abs);

test("two sided block", async () => {
  // J4: a pocket each side and a hole from the side: 3-axis mill, 3 setups, the tools per setup. D-029: each pocket is
  // roughed (the largest end mill at most 75% of its narrowest width: 0.750 in -> 1/2 in, 1.000 in -> 3/4 in), then
  // finished with the 1/4 in that fits its corners: 5 loads.
  const r = await run("two_sided_block");
  await checkPlan(partBytes("two_sided_block"), expected("two_sided_block"), r);
  expect(r.machine).toBe("3-axis mill");
  expect(r.operations.map((o: Feat) => [r.setups[o.setup].direction, o.tool])).toEqual([
    ["+Z", "em-0.500"], ["+Z", "em-0.250"], ["-Z", "em-0.750"], ["-Z", "em-0.250"], ["-X", "dr-0.2500"]]);
  expect(r.tool_changes).toBe(5);
  expect(r.findings).toEqual([]);
});

test("no roughing tool when one tool does both", () => {
  // D-029: a pocket with no two walls facing each other has no width to size a roughing tool by, and a roughing tool no
  // larger than the finishing one is left out: one tool does both.
  const pocket = (dims: Record<string, number>): Feature => ({ id: "pocket-1", kind: "pocket", faces: [1], dims_mm: dims });
  expect(pocketTools(pocket({ end_mill_mm: 6.35, undersized: 0 })).map((t) => t.id)).toEqual(["em-0.250"]); // no narrowest_width
  // 75% is 0.5625 in
  expect(pocketTools(pocket({ end_mill_mm: 12.7, undersized: 0, narrowest_width: 0.75 * 25.4 })).map((t) => t.id)).toEqual(["em-0.500"]); // the 1/2 in finisher already is the largest
});

for (const [name, angle] of [["angled_hole", 30.0], ["angled_hole_in_pocket", 20.0]] as const) {
  test(`access finding (${name}, ${angle})`, async () => {
    const r = await run(name);
    const found = r.findings.filter((f: Feat) => f.rule === "access");
    expect(found.length).toBe(1);
    const f = found[0];
    // D-050: both enter their flat top face at a slant (as far off square as off the axes): still a Fix
    expect([f.severity, f.unit, f.limit, f.threshold_source]).toEqual(["high", "deg", 0.5, "assumption"]);
    approx(f.measured, angle, 0.01);
    expect(f.title).toContain(`enters its face ${angle.toFixed(1)}° off square`);
    expect(f.title).toContain("4/5-axis mill or a fixture");
    expect(r.machine).toBe("4/5-axis mill or fixture");
    const planned = new Set(r.setups.flatMap((s: Feat) => s.features));
    expect(planned.has(f.feature)).toBe(false); // in no setup (spec Plan: setups cover what access didn't flag)
  });
}

test("hole in pocket floor keeps its axis", async () => {
  // D-022: the end on the pocket floor points along the hole, not along the pocket's opening.
  const r = await run("angled_hole_in_pocket");
  const holes = r.features.filter((f: Feat) => f.kind === "hole");
  expect(holes.length).toBe(1);
  expect(holes[0].open_dirs).toEqual([]);
  expect(holes[0].open_vectors.length).toBe(2);
});

for (const name of ["clean_one_setup", "rotated_block", "through_hole_two_dirs"]) {
  test(`clean parts one setup (${name})`, async () => {
    const r = await run(name);
    expect(r.findings).toEqual([]);
    expect(r.setups.length).toBe(1);
    expect(r.machine).toBe("3-axis mill");
  });
}

test("rotated block plans as the unrotated one", async () => {
  const [a, b] = [await run("clean_one_setup"), await run("rotated_block")];
  for (const key of ["machine", "setups", "operations", "tools", "tool_changes"]) expect(a[key], key).toEqual(b[key]);
});

test("countersink is a tool load from its own end", async () => {
  // D-022: the countersink at the top makes the hole's setup the top one, after the drill.
  const r = await run("countersunk_hole");
  const holes = r.features.filter((f: Feat) => f.kind === "hole");
  expect(holes.length).toBe(1);
  const hole = holes[0];
  approx(hole.dims_mm.countersink_deg, 82.0, 1e-6 * 82 + 1e-12); // pytest.approx default: rel 1e-6
  approx(hole.dims_mm.countersink_diameter, 12.7, 1e-3);
  expect(hole.countersink_faces.some((x: number) => hole.faces.includes(x))).toBe(false); // D-018: the cone stays out of the hole
  expect(r.operations.map((o: Feat) => o.tool)).toEqual(["dr-0.2500", "cs-82"]);
  expect(r.tools[1]).toEqual({ id: "cs-82", kind: "countersink", diameter_in: null, undersized: false });
});

test("no holes or pockets gets one setup", async () => {
  const r = await run("thin_rib");
  expect(r.setups).toEqual([{ direction: "+Z", features: [] }]);
  expect(r.operations).toEqual([]);
  expect(r.tools).toEqual([]);
  expect(r.tool_changes).toBe(0);
});

test("odd hole takes an end mill", async () => {
  // No drill within 0.0005 in of 0.260 in: pick_end_mill(0.130, 0.260) gives the 1/4 in end mill.
  const r = await run("odd_hole");
  expect(r.tools.map((t: Feat) => t.id)).toEqual(["em-0.250"]);
});

test("metric drill id", async () => {
  const r = await run("metric_hole"); // a 6.5 mm hole in a mm file
  expect(r.tools.map((t: Feat) => t.id)).toEqual(["dr-6.5mm"]);
});

test("turn has no mill plan", async () => {
  const r = await run("box_through_hole", "turn");
  expect(r.machine).toBeNull();
  expect(r.setups).toEqual([]);
  expect(r.tool_changes).toBe(0);
});

test("operation order within a setup", () => {
  // End mills largest to smallest, then drills smallest to largest, then countersinks.
  const tools: Record<string, Tool> = {
    a: { id: "a", kind: "drill", diameter_in: 0.5, undersized: false }, b: { id: "b", kind: "end_mill", diameter_in: 0.25, undersized: false },
    c: { id: "c", kind: "countersink", diameter_in: null, undersized: false }, d: { id: "d", kind: "drill", diameter_in: 0.25, undersized: false },
    e: { id: "e", kind: "end_mill", diameter_in: 0.5, undersized: false } };
  const cmp = (x: (number | string)[], y: (number | string)[]) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
  expect(Object.keys(tools).sort((p, q) => cmp(rank(tools[p]), rank(tools[q])))).toEqual(["e", "b", "d", "a", "c"]);
});

test("cover is smallest then first in order", () => {
  expect(cover([])).toEqual(["+Z"]);
  expect(cover([new Set(["+X", "-X"])])).toEqual(["+X"]);
  expect(cover([new Set(["-Y"]), new Set(["+Z", "-Y"])])).toEqual(["-Y"]); // one direction beats two
  expect(cover([new Set(["+X"]), new Set(["-Z"])])).toEqual(["-Z", "+X"]); // setups listed in the order +Z -Z +X -X +Y -Y
  expect(cover([new Set(["+Y", "-X"]), new Set(["+Y", "-Z"]), new Set(["+X", "-Z"])])).toEqual(["-Z", "-X"]); // ties: earlier positions first (not -Z +Y)
  expect(cover(ORDER.map((d) => new Set([d])))).toEqual([...ORDER]);
});

test("tool load assumption listed", async () => {
  expect((await run("box_through_hole")).assumptions.some((a: string) => a.includes("Tool loads count every tool loaded"))).toBe(true);
});

test("each operation lists the faces it cuts", async () => {
  // Morgan, 2026-11-08: selecting a setup should show the countersink surface too. The countersink tool's operation holds
  // its own cone (kept out of the hole's faces by D-018); the drill holds the bore.
  const r = await run("countersunk_hole");
  const hole = r.features.filter((f: Feat) => f.kind === "hole")[0];
  const ops = Object.fromEntries(r.operations.map((o: Feat) => [o.tool, o]));
  expect(ops["dr-0.2500"].faces).toEqual([...hole.faces].sort((a: number, b: number) => a - b));
  expect(ops["cs-82"].faces).toEqual([...hole.countersink_faces].sort((a: number, b: number) => a - b));
});

test("countersink at each end lights only its cone", async () => {
  // cs_both: drilled from one side; the other setup only countersinks, and its operation holds only the cone at its own
  // end, not the bore or the far cone.
  const path = resolve(ROOT, "tests/grading/sets/hole_ends_walls/cs_both.step");
  const r = await analyzeBytes(new Uint8Array(readFileSync(path)), "cs_both.step");
  const holes = r.features.filter((f: Feat) => f.kind === "hole");
  expect(holes.length).toBe(1);
  const hole = holes[0];
  expect(r.setups.length).toBe(2);
  const onlyCs = r.setups.map((_: unknown, s: number) => s).filter((s: number) => {
    const tools = new Set(r.operations.filter((o: Feat) => o.setup === s).map((o: Feat) => o.tool));
    return tools.size === 1 && tools.has("cs-90");
  });
  expect(onlyCs.length).toBe(1);
  const ops = r.operations.filter((o: Feat) => o.setup === onlyCs[0]);
  expect(ops.length).toBe(1);
  const ends = hole.countersink_end_faces.map((e: number[]) => JSON.stringify([...e].sort((a, b) => a - b)));
  expect(ends).toContain(JSON.stringify(ops[0].faces));
  expect(ops[0].faces.some((x: number) => hole.faces.includes(x))).toBe(false);
  expect(hole.countersink_end_faces.length).toBe(2);
});

test("access severity D-050", () => {
  // D-050 (Morgan, 2026-11-09): an angled hole is a Review; a Fix when it enters its flat face off square; a hole with no
  // flat face at an open end stays a Review; an angled pocket is a Review too ("do the same for pockets").
  const frame = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const tilt = [0.0, 0.5, 0.866025]; // 30 deg off +Z
  const one = (kind: string, entry: number | null) => {
    const f: Feature = { id: `${kind}-1`, kind, faces: [1], dims_mm: {}, open_dirs: [], open_vectors: [tilt], entry_deg: entry };
    const found = access.check([f], { frame } as unknown as PartSummary, {});
    expect(found.length).toBe(1);
    return found[0];
  };
  expect(one("hole", 0.0).severity).toBe("medium");
  expect(one("hole", 0.5).severity).toBe("medium"); // within the 0.5 deg tolerance
  expect(one("hole", null).severity).toBe("medium");
  const slant = one("hole", 12.0);
  expect([slant.severity, slant.measured, slant.threshold_source]).toEqual(["high", 12.0, "assumption"]);
  expect(one("pocket", null).severity).toBe("medium");
});

/** The NIST AP242 file from tests/nist/.cache (unpacked by the Python side or nist.test.ts), else read from the committed zip. */
function nistBytes(name: string): Uint8Array {
  const cached = resolve(ROOT, "tests/nist/.cache/NIST-PMI-STEP-Files", name);
  if (existsSync(cached)) return new Uint8Array(readFileSync(cached));
  return new Uint8Array(execFileSync("unzip", ["-p", resolve(ROOT, "tests/nist/NIST-PMI-STEP-Files.zip"), `NIST-PMI-STEP-Files/${name}`], { maxBuffer: 1 << 28 }));
}

test("angled holes square to their face are review", async () => {
  // NIST CTC 04: its 12 holes 22 deg off the axes are drilled square into angled faces: Review, not Fix (D-050).
  const r: Result = await analyzeBytes(nistBytes("nist_ctc_04_asme1_ap242-e1.stp"), "nist_ctc_04_asme1_ap242-e1.stp");
  const found = r.findings.filter((f: Feat) => f.rule === "access");
  expect(found.length).toBe(12);
  expect(new Set(found.map((f: Feat) => f.severity))).toEqual(new Set(["medium"]));
  const ids = new Set(found.map((x: Feat) => x.feature));
  expect(new Set(r.features.filter((f: Feat) => ids.has(f.id)).map((f: Feat) => f.entry_deg))).toEqual(new Set([0.0]));
}, 30_000); // the browser engine takes about 5.2 s here; the Python twin 3.8 s (S8b, measured): a 30 s limit, not a looser check

// P0 (D-085): the engineer's report, "a counter bore was saying it could be machined from the wrong side". A counterbore
// is cut from its large end; the small hole through it can still be drilled from either end. Built here: a 2 x 2 x 1 in
// block, a 0.250 in hole through, a 7/16 in counterbore 0.250 in deep at the end named.
async function counterbored(ends: ("top" | "bottom")[]): Promise<Result> {
  const o = await oc();
  const tools = [cyl(o, 1, 1, -0.1, 0.125, 1.2)];
  for (const end of ends) tools.push(cyl(o, 1, 1, end === "top" ? 0.75 : -0.1, 0.4375 / 2, 0.35));
  return analyzeShape(cut(o, box(o, 0, 0, 0, 2, 2, 1), ...tools));
}
const cboreOf = (r: Result) => r.features.filter((f: Feat) => f.kind === "hole" && Math.abs(f.dims_mm.diameter - 0.4375 * 25.4) < 0.01);
/** The part-frame name of a world direction, read off the hole's own open ends (the frame can flip the part, as it
 *  does stepped_hole: world +Z is its "-Z"). */
const named = (r: Result, world: number[]) => {
  const hole = r.features.find((f: Feat) => f.kind === "hole");
  const k = hole.open_vectors.findIndex((v: number[]) => v.every((x, i) => Math.abs(x - world[i]) < 1e-9));
  return hole.open_dirs[k];
};
const UP = [0, 0, 1], DOWN = [0, 0, -1];

test("counterbore at the bottom is cut from the bottom", async () => {
  const r = await counterbored(["bottom"]);
  expect(r.setups.map((s: Feat) => s.direction)).toEqual([named(r, DOWN)]);
  const [cbore] = cboreOf(r);
  expect(cbore.tool_dirs).toEqual([named(r, DOWN)]);
  expect(r.setups[0].features).toContain(cbore.id);
  const small = r.features.find((f: Feat) => f.kind === "hole" && f.id !== cbore.id);
  expect(small.tool_dirs).toBeUndefined(); // the 0.250 in hole can still be drilled from either end
});

for (const [label, make] of [["built", () => counterbored(["top"])], ["stepped_hole", () => run("stepped_hole")]] as const) {
  test(`counterbore at the top is cut from the top (${label})`, async () => {
    const r = await make();
    expect(r.setups.map((s: Feat) => s.direction)).toEqual([named(r, UP)]);
  });
}

test("a counterbore at each end takes a setup at each end", async () => {
  const r = await counterbored(["top", "bottom"]);
  const cbores = cboreOf(r);
  expect(cbores.length).toBe(2);
  expect(new Set(r.setups.map((s: Feat) => s.direction))).toEqual(new Set([named(r, UP), named(r, DOWN)]));
  for (const s of r.setups) expect(cbores.filter((f: Feat) => s.features.includes(f.id)).length, s.direction).toBe(1);
});
