// The Inventor test harness's Node ports (src/inventor-harness/): built inputs through the app path, the rotations, and the
// work-pair check's lines. `register` on the 16 NIST pairs, against Python's transform, is transforms.run.ts (a long run
// that needs the unpacked NIST STEP files).
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, expect, test } from "vitest";
import { analyze } from "../engine/analyze";
import { mapBlends } from "../engine/inventor/blends";
import { Topology } from "../engine/features/holes";
import { loadNodeOc } from "../engine/node";
import type { OC } from "../engine/oc";
import { readStep } from "../engine/read";
import { blockBlends, BOX_TOP, DOWN, filletedBlock, holeFeature, iptFromStep, thread } from "./built";
import { localPairs } from "./localPairs";
import { rotations } from "./register";

const ROOT = resolve(__dirname, "../../..");
const PARTS = join(ROOT, "tests/parts");
let oc: OC;
beforeAll(async () => { oc = await loadNodeOc(); }, 120_000);

test("rotations: the 24 proper axis rotations, each once", () => {
  const r = rotations();
  expect(r.length).toBe(24);
  expect(new Set(r.map((m) => JSON.stringify(m))).size).toBe(24);
});

test("the built part passes the app path: a thread and a Hole feature on box_through_hole's hole", () => {
  const box = readFileSync(join(PARTS, "box_through_hole.step"));
  oc.FS.writeFile("/box-in.step", new Uint8Array(box));
  const part = iptFromStep(oc, "/box-in.step", [thread(BOX_TOP, DOWN, 10.0)], [holeFeature(BOX_TOP, DOWN, 6.35, 12.7, { through: true })]);
  const r = analyze(oc, new Uint8Array(box), "box_through_hole.step", "mill", "al6061", { read: { part }, name: "box.ipt" }) as unknown as
    { inventor: { threads: { state: string; hole: string }[]; hole_features: { state: string }[]; checks: { faces: number[]; worst_corner_gap_mm: number } } };
  expect(r.inventor.threads.map((t) => [t.state, t.hole])).toEqual([["matched", "hole-1"]]);
  expect(r.inventor.hole_features.map((f) => f.state)).toEqual(["matched"]);
  expect(r.inventor.checks.worst_corner_gap_mm).toBe(0);
});

test("the built filleted block: the fillet r 3 and the chamfer match; r 3.5 disagrees by 0.5 mm", () => {
  oc.FS.writeFile("/block-in.step", oc.FS.readFile(filletedBlock(oc, "/block-out.step")));
  const part = readStep(oc, "/block-in.step");
  const topo = new Topology(oc, part.solid, part.faces);
  const [fillet, chamfer] = mapBlends(topo, blockBlends()) as unknown as { state: string; radius_mm: number; faces_mapped: number; distances_mm: number[] }[];
  expect([fillet.state, fillet.radius_mm, fillet.faces_mapped]).toEqual(["matched", 3.0, 1]);
  expect([chamfer.state, chamfer.distances_mm]).toEqual(["matched", [2.0, 2.0]]);
  const [off] = mapBlends(topo, blockBlends(3.5)) as unknown as { state: string; gaps: { what: string; mm: number }[] }[];
  expect([off.state, off.gaps.map((g) => [g.what, g.mm])]).toEqual(["disagrees", [["radius", 0.5]]]);
});

test("local pairs: the lines for no folder, a pair that does not line up, and a folder without a STEP", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pairs-"));
  const lines: string[] = [];
  expect(await localPairs(oc, join(dir, ".local"), "", (l) => lines.push(l))).toBe(1);
  expect(lines).toEqual(["no pairs in tests/inventor/.local/ (one folder per pair: an .ipt and its .stp or .step)"]);
  lines.length = 0;
  const p1 = join(dir, ".local", "p1");
  mkdirSync(p1, { recursive: true });
  mkdirSync(join(dir, ".local", "p2"));
  copyFileSync(join(ROOT, "tests/inventor/files/INV_nist_ftc_11_asme1_2021.ipt"), join(p1, "a.ipt"));
  copyFileSync(join(PARTS, "box_through_hole.step"), join(p1, "b.STEP"));
  writeFileSync(join(dir, ".local", "p2", "b.step"), "x");
  expect(await localPairs(oc, join(dir, ".local"), "", (l) => lines.push(l))).toBe(1);
  // these are the lines tests/inventor/local_pairs.py prints on the same folders (2026-11-11)
  expect(lines).toEqual([
    "p1: saved with 2021 (Build 250183000, 183), ACIS 226.0.3.65535",
    "  pair check: FAIL - These files don't match: the STEP has 7 faces, the .ipt 8. Export the STEP again from this .ipt and upload both.",
    "p2: needs exactly one .ipt and one STEP",
  ]);
}, 60_000);
