// The built inputs (built.ts) against what tests/inventor/built.py makes: PYTHON_BUILT is a JSON file of the Python
// objects, PYTHON_BLOCK the STEP file Python's filleted_block wrote. Prints one line per comparison.
import { readFileSync, writeSync } from "node:fs";
import { expect, test } from "vitest";
import { analyze } from "../engine/analyze";
import { loadNodeOc } from "../engine/node";
import { blockBlends, BOX_TOP, DOWN, DRILL_TOP, filletedBlock, holeFeature, iptFromStep, thread } from "./built";

// A Map becomes an object with string keys, a Surf's halfAngleDeg is Python's half_angle_deg
const plain = (v: unknown): unknown => {
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k === "halfAngleDeg" ? "half_angle_deg" : k, plain(x)]));
  return v;
};

test("built inputs equal Python's", async () => {
  const py = JSON.parse(readFileSync(process.env.PYTHON_BUILT!, "utf8"));
  const oc = await loadNodeOc();
  const root = new URL("../../../tests/parts/", import.meta.url).pathname;
  oc.FS.writeFile("/box.step", new Uint8Array(readFileSync(root + "box_through_hole.step")));
  const mine: Record<string, unknown> = {
    thread: thread(BOX_TOP, DOWN, 10.0),
    thread2: thread(DRILL_TOP, DOWN, 5.0, { id: "t2", designation: "M6x1", cls: "6H", face: "shaft" }),
    hole_through: holeFeature(BOX_TOP, DOWN, 6.35, 12.7, { through: true }),
    hole_blind: holeFeature(DRILL_TOP, DOWN, 6.35, 25.4, { through: false, point_deg: 118.0, copied_by: [3], feature_id: 7 }),
    ipt_box: iptFromStep(oc, "/box.step", [thread(BOX_TOP, DOWN, 10.0)], [holeFeature(BOX_TOP, DOWN, 6.35, 12.7, { through: true })]),
    blends: blockBlends(), blends35: blockBlends(3.5),
  };
  let same = 0;
  for (const [k, v] of Object.entries(mine)) {
    const ok = JSON.stringify(plain(v)) === JSON.stringify(py[k]);
    if (ok) same++;
    writeSync(1, `${ok ? "equal    " : "DIFFERENT"} ${k}\n`);
    if (!ok) writeSync(1, `  node   ${JSON.stringify(plain(v)).slice(0, 400)}\n  python ${JSON.stringify(py[k]).slice(0, 400)}\n`);
  }
  // the filleted block: both STEP files through the browser engine's analysis
  filletedBlock(oc, "/node-block.step");
  const run = (path: string) => {
    const r = analyze(oc, oc.FS.readFile(path), "block.step", "mill", "al6061") as unknown as Record<string, unknown>;
    return r;
  };
  oc.FS.writeFile("/py-block.step", new Uint8Array(readFileSync(process.env.PYTHON_BLOCK!)));
  const [a, b] = [run("/node-block.step"), run("/py-block.step")];
  const part = (r: Record<string, unknown>) => ({ part: r.part, kinds: (r.faces as { kind: string }[]).map((f) => f.kind), features: r.features });
  const blockSame = JSON.stringify(part(a)) === JSON.stringify(part(b));
  const full = JSON.stringify(a) === JSON.stringify(b);
  writeSync(1, `${blockSame ? "equal    " : "DIFFERENT"} filleted block: part summary, face kinds and features of the two STEP files\n`);
  writeSync(1, `${full ? "equal    " : "DIFFERENT"} filleted block: the whole analysis response of the two STEP files\n`);
  if (!blockSame) writeSync(1, `  node   ${JSON.stringify(part(a)).slice(0, 600)}\n  python ${JSON.stringify(part(b)).slice(0, 600)}\n`);
  writeSync(1, `${same} of ${Object.keys(mine).length} objects equal\n`);
  expect(same).toBe(Object.keys(mine).length);
  expect(blockSame).toBe(true);
});
