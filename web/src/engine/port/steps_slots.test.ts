// Steps and slots spec, Journeys J1, J3 and J4 (S1): the labelled set in tests/grading/sets/steps_slots (block
// 100 x 60 x 30 mm, top at z = 30, file axes; `node web/scripts/make-set.mjs steps_slots` builds it). The part frame's
// axes differ from the file's on most parts (D-078), so each expected direction is the frame direction of a file vector.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { instanceScore, scores, SLOT_CLASSES, STEP_CLASSES, type Tally } from "../../grading/score";
import { frameDir } from "../features/holes";
import { loadNodeOc } from "../node";
import type { OC } from "../oc";
import { ORDER } from "../plan";
import { analyseFile, scoreFile, setDir, sumOf, total, type Result } from "./groupc-kit";

const SET = setDir("steps_slots");
const FILES = readdirSync(SET).filter((f) => f.endsWith(".step")).sort();
const INSTANCES = JSON.parse(readFileSync(resolve(SET, "INSTANCES.json"), "utf8")) as Record<string, { steps: number[][]; slots: number[][] }>;
const stem = (f: string) => f.replace(/\.step$/, "");

let oc: OC;
const results = new Map<string, Promise<Result>>();
const run = (name: string) => {
  if (!results.has(name)) results.set(name, analyseFile(oc, resolve(SET, `${name}.step`)));
  return results.get(name)!;
};
beforeAll(async () => { oc = await loadNodeOc(); });

const kinds = (r: Result, kind: string) => r.features.filter((f: Result) => f.kind === kind);
const dirOf = (r: Result, v: [number, number, number]) => frameDir(v, r.part.frame);
const rankOf = (d: string) => ORDER.indexOf(d as (typeof ORDER)[number]);
/** The face whose mesh lies wholly on the plane `axis` = `at` (file axes). */
function faceOn(r: Result, axis: 0 | 1 | 2, at: number): number {
  const hits = r.faces.flatMap((f: Result, i: number) => {
    const p = f.positions as number[];
    for (let k = axis; k < p.length; k += 3) if (Math.abs(p[k] - at) > 1e-6) return [];
    return [i];
  });
  expect(hits, `one face on ${"xyz"[axis]} = ${at}`).toHaveLength(1);
  return hits[0];
}
const toolsOf = (r: Result, id: string) => r.operations.filter((o: Result) => o.features.includes(id)).map((o: Result) => o.tool);
const rules = (r: Result, rule: string) => r.findings.filter((f: Result) => f.rule === rule);

describe("J1 steps", () => {
  test("st_through: one step, floor first in ORDER, depth along its normal, one tool", async () => {
    const r = await run("st_through");
    const steps = kinds(r, "step");
    expect(steps).toHaveLength(1);
    const [s] = steps;
    const [floorZ, wallY] = [faceOn(r, 2, 20), faceOn(r, 1, 15)];
    expect([...s.faces].sort()).toEqual([floorZ, wallY].sort());
    const [dz, dy] = [dirOf(r, [0, 0, 1]), dirOf(r, [0, -1, 0])];
    const zFirst = rankOf(dz!) < rankOf(dy!);
    expect(s.floor).toBe(zFirst ? floorZ : wallY);
    expect(s.dims_mm.depth).toBeCloseTo(zFirst ? 10 : 15, 6);
    expect(s.open_edges).toBe(3);
    expect(s.open_dirs).toEqual([dz, dy].sort((a, b) => rankOf(a!) - rankOf(b!)));
    expect(toolsOf(r, s.id)).toEqual(["em-1.000"]); // no inside corner: the 1 in end mill, no rougher
  });

  test("st_l: the floor's direction only, rougher and a 3/16 in finisher, one linked corner, no corner finding", async () => {
    const r = await run("st_l");
    const [s, ...more] = kinds(r, "step");
    expect(more).toEqual([]);
    expect(s.open_dirs).toHaveLength(1);
    // 3/16 in: 4.7625 / 25.4 is just under 0.1875, so the id reads em-0.187, as in the frozen keys (the spec wrote 0.188)
    expect(toolsOf(r, s.id)).toEqual(["em-1.000", "em-0.187"]);
    const corners = kinds(r, "corner");
    expect(corners).toHaveLength(1);
    expect(corners[0].pocket).toBe(s.id);
    expect(corners[0].dims_mm.radius).toBeCloseTo(3, 6);
    expect(rules(r, "corner_radius")).toEqual([]);
    expect(rules(r, "step_depth")).toEqual([]);
  });

  test("st_deep: a 1/16 in finisher, step_depth and corner_radius medium", async () => {
    const r = await run("st_deep");
    const [s, ...more] = kinds(r, "step");
    expect(more).toEqual([]);
    expect(toolsOf(r, s.id)).toEqual(["em-1.000", "em-0.062"]);
    const [floorZ] = [faceOn(r, 2, 10)];
    if (s.floor === floorZ) expect(s.dims_mm.depth).toBeCloseTo(20, 6);
    expect(rules(r, "step_depth").map((f: Result) => [f.severity, f.feature])).toEqual([["medium", s.id]]);
    expect(rules(r, "corner_radius").map((f: Result) => f.severity)).toEqual(["medium"]);
  });
});

describe("J2 slots", () => {
  const one = async (name: string) => {
    const r = await run(name);
    const [s, ...more] = kinds(r, "slot");
    expect(more).toEqual([]);
    expect(kinds(r, "step"), "a slot part has no step call").toEqual([]);
    return { r, s };
  };
  const floorOf = (r: Result, s: Result) => expect(s.open_dirs).toEqual([r.features.find((f: Result) => f.id === s.id).open_dirs[0]]);

  test("sl_blind_round: round end radius 5, one open end, rougher 1/4 in and finisher 3/8 in", async () => {
    const { r, s } = await one("sl_blind_round");
    expect(s.dims_mm.narrowest_width).toBeCloseTo(10, 6);
    expect(s.dims_mm.depth).toBeCloseTo(8, 6);
    expect([s.open_ends, s.end_type]).toEqual([1, "round"]);
    expect(s.dims_mm.end_radius).toBeCloseTo(5, 6);
    expect(s.open_dirs).toHaveLength(1);
    expect(toolsOf(r, s.id)).toEqual(["em-0.375", "em-0.250"]); // largest first (plan.ts rank)
    floorOf(r, s);
  });

  test("sl_blind: flat end, sharp corners: undersized 1/32 in finisher, corner_radius high, slot_depth medium", async () => {
    const { r, s } = await one("sl_blind");
    expect([s.open_ends, s.end_type]).toEqual([1, "flat"]);
    expect(s.dims_mm.undersized).toBe(1);
    expect(toolsOf(r, s.id)).toEqual(["em-0.250", "em-0.031"]);
    expect(rules(r, "corner_radius").map((f: Result) => f.severity)).toContain("high");
    expect(rules(r, "slot_depth").map((f: Result) => [f.severity, f.feature])).toEqual([["medium", s.id]]);
  });

  test("sl_through: open both ends, 1/4 in and 3/8 in", async () => {
    const { r, s } = await one("sl_through");
    expect([s.open_ends, s.end_type]).toEqual([2, "open"]);
    expect(toolsOf(r, s.id)).toEqual(["em-0.375", "em-0.250"]);
  });

  test("sl_deep: 3/32 in rougher, 1/8 in finisher, slot_depth and slot_ratio medium", async () => {
    const { r, s } = await one("sl_deep");
    expect(toolsOf(r, s.id)).toEqual(["em-0.125", "em-0.094"]);
    expect(rules(r, "slot_depth").map((f: Result) => f.severity)).toEqual(["medium"]);
    expect(rules(r, "slot_ratio").map((f: Result) => f.severity)).toEqual(["medium"]);
  });
});

describe("J3 look-alikes", () => {
  test("st_chamfer: a 45 deg edge chamfer is no step", async () => {
    expect(kinds(await run("st_chamfer"), "step")).toEqual([]);
  });
  // Expected faces and depth from today's engine before any change (MANIFEST.md)
  test("pk_beside_step: one pocket, unchanged", async () => {
    const p = kinds(await run("pk_beside_step"), "pocket");
    expect(p.map((x: Result) => [x.faces, x.dims_mm.depth])).toEqual([[[10, 11, 12, 13, 14], 16]]);
  });
  test("pk_control: one pocket, unchanged", async () => {
    const p = kinds(await run("pk_control"), "pocket");
    expect(p.map((x: Result) => [x.faces, x.dims_mm.depth])).toEqual([[[6, 7, 8, 9, 10], 12]]);
  });
  for (const name of ["sl_angled", "vg_through"]) {
    test(`${name}: no step, no slot`, async () => {
      const r = await run(name);
      expect([kinds(r, "step"), kinds(r, "slot")]).toEqual([[], []]);
    });
  }
  for (const name of ["st_chamfer", "pk_beside_step", "pk_control", "st_through", "st_l", "st_deep", "st_stair", "st_face"]) {
    test(`${name}: no slot`, async () => {
      expect(kinds(await run(name), "slot")).toEqual([]);
    });
  }
});

describe("J4 scores on the set", () => {
  for (const f of FILES) {
    test(`${stem(f)}: every step face found, none wrong, each step whole`, async () => {
      const { counts, missed, features } = await scoreFile(oc, resolve(SET, f));
      const s = scores(counts);
      expect(s.precision.step.n, "a face that is not a step's was called one").toBe(s.precision.step.of);
      expect(s.claimed_on_excluded.step ?? 0, "a stock face was called a step").toBe(0);
      expect((missed as { class: number }[]).filter((m) => m.class in STEP_CLASSES)).toEqual([]);
      const want = INSTANCES[stem(f)].steps;
      expect(instanceScore(features, want, "step")).toEqual({ whole: want.length, of: want.length, split: 0, merged: 0 });
    });
  }

  test("slot faces: every one found, none wrong, each slot whole", async () => {
    for (const f of FILES) {
      if (stem(f) === "sl_angled") continue; // a guard: its class 6 faces are on a tilted floor, which gets no call (J3, Non-goals)
      const { counts, missed, features } = await scoreFile(oc, resolve(SET, f));
      const s = scores(counts);
      expect(s.precision.slot.n, `${stem(f)}: a face that is not a slot's was called one`).toBe(s.precision.slot.of);
      expect((missed as { class: number }[]).filter((m) => m.class in SLOT_CLASSES), stem(f)).toEqual([]);
      const want = INSTANCES[stem(f)].slots;
      expect(instanceScore(features, want, "slot"), stem(f)).toEqual({ whole: want.length, of: want.length, split: 0, merged: 0 });
    }
  });

  test("set totals", async () => {
    const parts: Tally[] = [];
    for (const f of FILES) parts.push((await scoreFile(oc, resolve(SET, f))).counts);
    const s = total(parts);
    expect(FILES.length).toBe(18);
    expect(sumOf(s, STEP_CLASSES, "n")).toBe(sumOf(s, STEP_CLASSES, "of"));
  });
});
