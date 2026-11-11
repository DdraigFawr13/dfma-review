// Port of tests/service/test_inventor_api.py. The Python tests post to the FastAPI /api/analyze; the browser engine has
// no HTTP, so each assertion is made on the same inputs where the browser keeps that behaviour:
//  - the engine's refusals as {error} through node.ts analyzeOrRefuse (what the worker replies);
//  - the page-side guards (a compound file as the STEP, an .ipt over 50 MB) through engine-client.ts analyzeInBrowser,
//    which checks both before it starts a worker;
//  - the in-process attach tests through analyze() with an IptPart built from the STEP itself (tests/inventor/built.py).
// Retired: the HTTP status codes (422, 413, 200) and the TestClient/multipart plumbing of the service's app.py.
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { analyze } from "../analyze";
import { EngineError, analyzeInBrowser } from "../../engine-client";
import type { HoleFeature } from "../inventor/holes";
import { PLAIN_PART, type IptPart } from "../inventor/part";
import { stepCorners } from "../inventor/pair";
import type { Vec } from "../inventor/sab";
import type { Thread } from "../inventor/threads";
import { analyzeOrRefuse } from "../node";
import { readStep } from "../read";
import { IPT_ASSUMPTION, MAX_UPLOAD_BYTES, MSG_IPT_NEEDS_STEP, MSG_IPT_NOT_IPT, MSG_TOO_LARGE } from "../settings";
import { bytesOf, FILES, getOc, PARTS, stepBytes } from "./inventor_common";

const BOX = resolve(PARTS, "box_through_hole.step");
const run = async (step: Uint8Array, name: string, ipt?: { bytes: Uint8Array; name: string }): Promise<any> =>
  analyzeOrRefuse(await getOc(), step, name, "mill", "al6061", ipt);
const iptFile = (name: string) => ({ bytes: bytesOf(resolve(FILES, name)), name });

test("no .ipt: the response is unchanged", async () => {
  const r = await run(bytesOf(BOX), "box_through_hole.step");
  expect(r.error).toBeUndefined();
  expect("inventor" in r).toBe(false);
  expect(r.assumptions).not.toContain(IPT_ASSUMPTION);
});

test("NIST pair refused: the app's pair check turns every NIST pair away", async () => {
  const r = await run(stepBytes("nist_ctc_04_asme1_ap242-e1.stp"), "nist_ctc_04_asme1_ap242-e1.stp", iptFile("INV_nist_ctc_04_asme1_2021.ipt"));
  expect(r).toEqual({ error: "These files don't match: the STEP has 483 faces, the .ipt 368. Export the STEP again from this .ipt and upload both." });
}, 120_000);

test("sheet metal refused", async () => {
  const r = await run(stepBytes("nist_ctc_03_asme1_ap242-e2.stp"), "nist_ctc_03_asme1_ap242-e2.stp", iptFile("INV_nist_ctc_03_asme1_2021.ipt"));
  expect(r).toEqual({ error: "This Inventor part is a sheet-metal part. Only plain single-body parts can be read for now. Upload the STEP on its own, without the .ipt." });
});

test("an .ipt given as the STEP is refused before any worker starts (the page's guard, engine-client.ts)", async () => {
  const file = new File([bytesOf(resolve(FILES, "INV_nist_ftc_11_asme1_2021.ipt")) as BlobPart], "part.stp");
  const e = await analyzeInBrowser(file, null, "mill", "al6061").catch((x) => x);
  expect(e).toBeInstanceOf(EngineError);
  expect((e as Error).message).toBe(MSG_IPT_NEEDS_STEP);
});

test("a STEP given as the .ipt is refused", async () => {
  expect(await run(bytesOf(BOX), "box_through_hole.step", { bytes: bytesOf(BOX), name: "part.ipt" })).toEqual({ error: MSG_IPT_NOT_IPT });
});

test("an .ipt over the upload limit is refused before any worker starts (the page's guard, engine-client.ts)", async () => {
  const big = { size: MAX_UPLOAD_BYTES + 1 } as File; // the guard reads only the size
  const e = await analyzeInBrowser(new File([bytesOf(BOX) as BlobPart], "box_through_hole.step"), big, "mill", "al6061").catch((x) => x);
  expect(e).toBeInstanceOf(EngineError);
  expect((e as Error).message).toBe(MSG_TOO_LARGE);
});

// --- built inputs (tests/inventor/built.py): an IptPart made from the STEP itself, plus a thread or a Hole feature ---

let oc: any;
beforeAll(async () => { oc = await getOc(); });

function iptFromStep(stepPath: string, threads: Thread[], holeFeatures: HoleFeature[] = []): { part: IptPart; faces: number } {
  oc.FS.writeFile("/api_step.step", bytesOf(stepPath));
  const step = readStep(oc, "/api_step.step");
  const part: IptPart = {
    saved_with: "2024.1 (Build 281209000, 209)", acis_version: "229.6.0.65535", subtype: PLAIN_PART, model_state_names: ["[Primary]"],
    solid_bodies: 1, corners_mm: stepCorners(oc, step.solid), face_count: step.faces.length, threads, hole_features: holeFeatures,
    hole_names: [], hole_names_seen: 0, blends: [],
  };
  return { part, faces: step.faces.length };
}

const thread = (start: Vec, axis: Vec, depth: number): Thread => ({
  id: "thread-1", designation: "1/4-20 UNC", cls: "2B", standard: "ANSI Unified Screw Threads", pitch_mm: 1.27, depth_mm: depth,
  tap_drill_mm: 5.11, minor_mm: [4.98, 5.25], major_mm: [6.35, 6.48], start, end: [0, 1, 2].map((k) => start[k] + depth * axis[k]) as Vec,
  axis, face: "hole", reason: null, feature_id: null, feature_name: null,
});

const holeFeature = (start: Vec, axis: Vec, diameter: number, length: number, through: boolean, pointDeg: number | null): HoleFeature => ({
  feature_id: 100, type: "simple", diameter_mm: diameter, depth_mm: through ? null : length, length_mm: length, through, point_deg: pointDeg,
  cbore_diameter_mm: null, cbore_depth_mm: null, csink_diameter_mm: null, csink_deg: null, name: null, reason: null,
  holes: [{
    start, axis, copied_by: [], faces: [], diameter_mm: diameter, length_mm: length, drill_length_mm: length, drill_lo_mm: 0.0, through,
    type: "simple", point_deg: pointDeg, cbore_diameter_mm: null, cbore_depth_mm: null, csink_diameter_mm: null, csink_deg: null, reason: null,
  }],
});

test("attach in process: the passing app path on every push (S2): the .ipt as an IptPart built from the STEP itself plus one thread on its hole, so the part type, pair check, mapping and rule all run", () => {
  const { part, faces } = iptFromStep(BOX, [thread([25.4, 12.7, 12.7], [0.0, 0.0, -1.0], 10.0)]);
  const step = bytesOf(BOX);
  const result: any = analyze(oc, step, "box_through_hole.step", "mill", "al6061", { read: { part }, name: "box.ipt" });
  const threads = result.inventor.threads;
  delete result.inventor.threads;
  expect(result.inventor.hole_features).toEqual([]); // I2 S1: always a list when an .ipt is read
  delete result.inventor.hole_features;
  expect(result.inventor.hole_names_seen).toBe(0); // I2 S2: the built part has no Hole names
  delete result.inventor.hole_names_seen;
  expect(result.inventor.blends).toEqual([]); // I3 S3: always a list when an .ipt is read
  delete result.inventor.blends;
  expect(result.inventor).toEqual({
    name: "box.ipt", saved_with: "2024.1 (Build 281209000, 209)", acis_version: "229.6.0.65535",
    checks: { faces: [faces, faces], corners: [10, 10], worst_corner_gap_mm: 0.0 },
  });
  expect(threads).toHaveLength(1);
  const [t] = threads;
  expect([t.id, t.state, t.hole, t.gaps, t.reason]).toEqual(["thread-1", "matched", "hole-1", [], null]);
  expect([t.designation, t.depth_mm, t.start]).toEqual(["1/4-20 UNC", 10.0, [25.4, 12.7, 12.7]]);
  expect(result.assumptions[result.assumptions.length - 1]).toBe(IPT_ASSUMPTION);
  expect(result.rules_run).toContain("thread_mismatch");
  const plain: any = analyze(oc, step, "box_through_hole.step", "mill", "al6061");
  expect(plain.rules_run).not.toContain("thread_mismatch");
  const hole = result.features.find((f: any) => f.id === "hole-1");
  expect(hole.thread).toEqual(["thread-1"]);
  delete hole.thread;
  expect(result.findings).toEqual(plain.findings);
  expect(result.features).toEqual(plain.features);
});

describe("hole features in process: a built pair (the STEP's own IptPart plus a Hole feature on its hole) through the app path: the response lists the feature with its hole matched to hole-1, and hole-1 names its feature", () => {
  const cases: [string, Vec, number, boolean][] = [
    ["box_through_hole", [25.4, 12.7, 12.7], 12.7, true],
    ["drill_point_hole", [12.7, 12.7, 50.8], 25.4, false],
  ];
  test.each(cases)("%s", (step, start, length, through) => {
    const path = resolve(PARTS, `${step}.step`);
    const feat = holeFeature(start, [0.0, 0.0, -1.0], 6.35, length, through, through ? null : 118.0);
    const { part } = iptFromStep(path, [], [feat]);
    const r: any = analyze(oc, bytesOf(path), `${step}.step`, "mill", "al6061", { read: { part }, name: "p.ipt" });
    expect(r.inventor.hole_features).toHaveLength(1);
    const [hf] = r.inventor.hole_features;
    expect([hf.id, hf.feature_id, hf.name, hf.type, hf.diameter_mm, hf.through]).toEqual(["hf-1", 100, null, "simple", 6.35, through]);
    expect(hf.depth_mm).toBe(through ? null : 25.4);
    expect(hf.holes).toHaveLength(1);
    const [h] = hf.holes;
    expect([h.id, h.state, h.hole, h.gaps, h.reason, h.copied_by]).toEqual(["hf-1.1", "matched", "hole-1", [], null, []]);
    expect(h.start).toEqual(start);
    expect(h.axis).toEqual([0.0, 0.0, -1.0]);
    expect(hf.state).toBe("matched");
    expect(r.features.find((f: any) => f.id === "hole-1").hole_feature).toBe("hf-1");
    expect(r.rules_run).toContain("hole_mismatch");
    expect(r.findings.filter((f: any) => f.rule === "hole_mismatch")).toEqual([]);
  });
});
