// Port of tests/service/test_inventor_pair.py: checkPair's reasons on built inputs (an IptPart made from
// box_through_hole.step's own corners).
import { beforeAll, expect, test } from "vitest";
import { checkPair, stepCorners } from "../inventor/pair";
import { PLAIN_PART, type IptPart } from "../inventor/part";
import type { Vec } from "../inventor/sab";
import { readStep, ReadError, type ReadResult } from "../read";
import { MSG_PAIR_MISMATCH } from "../settings";
import { bytesOf, getOc } from "./inventor_common";
import { resolve } from "node:path";
import { PARTS } from "./inventor_common";

let oc: any;
let step: ReadResult;

beforeAll(async () => {
  oc = await getOc();
  oc.FS.writeFile("/pair_box.step", bytesOf(resolve(PARTS, "box_through_hole.step")));
  step = readStep(oc, "/pair_box.step");
});

function partFrom(corners?: Vec[], faces?: number): IptPart {
  return {
    saved_with: "2024 (test)", acis_version: "229.6.0.65535", subtype: PLAIN_PART, model_state_names: ["[Primary]"],
    solid_bodies: 1, corners_mm: corners ?? stepCorners(oc, step.solid), face_count: faces ?? step.faces.length,
    threads: [], hole_features: [], hole_names: [], hole_names_seen: 0, blends: [],
  };
}

function refused(ipt: IptPart): string {
  try { checkPair(oc, ipt, step); } catch (e) { expect(e).toBeInstanceOf(ReadError); return (e as Error).message; }
  throw new Error("no ReadError raised");
}
const mismatch = (reason: string) => MSG_PAIR_MISMATCH.replace("{reason}", reason);

test("matching pair passes", () => {
  const checks = checkPair(oc, partFrom(), step);
  const n = stepCorners(oc, step.solid).length;
  expect(n).toBe(10); // as prototyped for the spec
  expect(checks).toEqual({ faces: [step.faces.length, step.faces.length], corners: [n, n], worst_corner_gap_mm: 0.0 });
});

test("face count", () => {
  const s = step.faces.length;
  expect(refused(partFrom(undefined, s - 1))).toBe(mismatch(`the STEP has ${s} faces, the .ipt ${s - 1}`));
});

test("shifted", () => {
  const moved = stepCorners(oc, step.solid).map(([x, y, z]) => [x + 0.02, y, z] as Vec);
  expect(refused(partFrom(moved))).toBe(mismatch("the parts' outer corners differ by up to 0.02 mm"));
});

test("one corner moved", () => {
  const corners = stepCorners(oc, step.solid);
  const lo = [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k])));
  // a hole corner: inside the outer box in x, so moving it in x keeps the outer size
  const i = corners.findIndex((c) => lo[0] + 1 < c[0] && c[0] < hi[0] - 1);
  expect(i).toBeGreaterThanOrEqual(0);
  corners[i] = [corners[i][0] + 0.02, corners[i][1], corners[i][2]];
  expect(refused(partFrom(corners))).toBe(mismatch("1 of 10 corners of the .ipt are more than 0.01 mm from the STEP (worst 0.02 mm)"));
});

test("corner count", () => {
  const corners = stepCorners(oc, step.solid);
  corners.push(corners[0]);
  expect(refused(partFrom(corners))).toBe(mismatch("the .ipt has 11 corners, the STEP 10"));
});

test("within tolerance passes", () => {
  const corners = stepCorners(oc, step.solid).map(([x, y, z]) => [x + 0.004, y - 0.004, z] as Vec);
  const checks = checkPair(oc, partFrom(corners), step);
  expect(Math.abs(checks.worst_corner_gap_mm! - 0.0057)).toBeLessThanOrEqual(1e-4);
});
