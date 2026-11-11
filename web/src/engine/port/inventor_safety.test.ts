// Port of tests/service/test_inventor_safety.py: hostile or broken .ipt files. The Python file built them with
// tests/inventor/hostile.py and olefile; here the same files are the frozen copies in tests/parity/key/ipt/ (written by
// tests/parity/key.py --freeze from exactly those cases, so they are the very bytes the Python test used). The Python
// reads the hostile tag's face from the clean file with hostile.py; here it is found as the one face the hostile read
// lost against the clean read (stricter: exactly one face lost). The HTTP side (422 status, the TestClient, the worker
// answering again) is service plumbing; its browser counterpart is the refusal as {error} and a clean analysis after it.
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { analyzeOrRefuse } from "../node";
import { Ipt } from "../inventor/ole";
import { assign, holeNames } from "../inventor/names";
import { mapHoles, type HoleFeature } from "../inventor/holes";
import { readIpt, type IptPart } from "../inventor/part";
import { Record as SabRecord } from "../inventor/sab";
import { pairIds } from "../inventor/tags";
import { facePoints, MAX_STEPS, TopologyError } from "../inventor/topo";
import { ReadError } from "../read";
import { MSG_FEATURE_BAD, MSG_IPT_FORMAT, MSG_IPT_NO_MODEL, MSG_IPT_NOT_IPT, TIME_LIMIT_S } from "../settings";
import { bytesOf, FILES, freshIpt, getOc, hostileBytes, PARTS, rewriteIptModels } from "./inventor_common";

const BOX = resolve(PARTS, "box_through_hole.step");
const CTC04 = "INV_nist_ctc_04_asme1_2021.ipt";

describe("broken .ipt: refused with its message within the time limit, and the engine keeps serving", () => {
  const cases: [string, string][] = [
    ["no-model", MSG_IPT_NO_MODEL],
    ["unknown-tag", MSG_IPT_FORMAT.replace("{version}", "226.0.3.65535")],
    ["cut-short", MSG_IPT_FORMAT.replace("{version}", "226.0.3.65535")],
  ];
  test.each(cases)("%s", async (name, message) => {
    const oc = await getOc();
    const start = performance.now();
    const r = await analyzeOrRefuse(oc, bytesOf(BOX), "box_through_hole.step", "mill", "al6061", { bytes: hostileBytes(name), name: "part.ipt" });
    expect((performance.now() - start) / 1000).toBeLessThan(TIME_LIMIT_S);
    expect(r).toEqual({ error: message });
    const again = (await analyzeOrRefuse(oc, bytesOf(BOX), "box_through_hole.step", "mill")) as { error?: string };
    expect(again.error).toBeUndefined();
  });
});

test("not an .ipt", async () => {
  const r = await analyzeOrRefuse(await getOc(), bytesOf(BOX), "box_through_hole.step", "mill", "al6061", { bytes: hostileBytes("not-an-ipt"), name: "notes.ipt" });
  expect(r).toEqual({ error: MSG_IPT_NOT_IPT });
});

// --- I2 S1 J7: hostile feature tags and topology ---

const summary = (feats: HoleFeature[]) => Object.fromEntries(feats.map((f) => [f.feature_id, [f.type, Math.round((f.diameter_mm ?? 0) * 1e4) / 1e4, f.holes.length, f.reason]]));
const without = (o: { [k: string]: unknown }, fid: number) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== String(fid)));
const hostile = async (name: string): Promise<IptPart> => {
  const r = await readIpt(hostileBytes(name));
  if (r.error) throw r.error;
  return r.part;
};
const holeFaces = (feats: HoleFeature[]) => new Set(feats.flatMap((f) => f.holes.flatMap((h) => h.faces)));

describe("bad tags: a bad tag is dropped, never a refusal: its face leaves its feature and every other feature reads as before", () => {
  test.each(["no_end", "long_list", "owner_off"])("%s", async (kind) => {
    const clean = (await freshIpt(CTC04)).hole_features;
    const feats = (await hostile(`hole-${kind}`)).hole_features;
    const [before, after] = [holeFaces(clean), holeFaces(feats)];
    const lost = [...before].filter((f) => !after.has(f));
    expect(lost).toHaveLength(1); // the tag's face (found here, not by hostile.py)
    expect([...after].filter((f) => !before.has(f))).toEqual([]);
    const fid = clean.find((x) => x.holes.some((h) => h.faces.includes(lost[0])))!.feature_id;
    expect(without(summary(feats), fid)).toEqual(without(summary(clean), fid));
  });
});

test("cycling loop: a coedge ring that never closes stops after MAX_STEPS steps; that hole is not mapped with the reason `feature data not understood`, and the other features read as before", async () => {
  const clean = (await freshIpt(CTC04)).hole_features;
  const feats = (await hostile("cycle-hole")).hole_features;
  const bad = feats.flatMap((f) => f.holes.map((h) => [f, h] as const)).filter(([, h]) => h.reason === MSG_FEATURE_BAD);
  expect(bad).toHaveLength(1); // the hole on the cycled face
  const fid = bad[0][0].feature_id;
  expect(without(summary(feats), fid)).toEqual(without(summary(clean), fid));
  const rows = mapHoles(null as never, feats, []).flatMap((f) => f.holes).filter((h) => h.reason === MSG_FEATURE_BAD);
  expect(rows).toHaveLength(1);
  expect(rows[0].state).toBe("not_mapped");
});

test("caps: 64 pairs per tag, MAX_STEPS per loop or coedge ring (spec Builder defaults)", () => {
  expect(pairIds([...Array(64).fill([1, 5]).flat(), -1])).toEqual(Array(64).fill(5));
  expect(pairIds([...Array(65).fill([1, 5]).flat(), -1])).toBeNull();
  expect(pairIds([1, 5, 1, 6])).toBeNull(); // no -1
  // face -> loop -> coedge whose next is itself, but never the first: built records
  const p = (n: number) => ["p", n] as ["p", number];
  const recs = [
    new SabRecord("face", [p(-1), p(-1), p(-1), p(1)]),
    new SabRecord("loop", [p(-1), p(-1), p(-1), p(2), p(0)]),
    new SabRecord("coedge", [p(-1), p(-1), p(3)]),
    new SabRecord("coedge", [p(-1), p(-1), p(3)]),
  ];
  expect(() => facePoints(recs, 0)).toThrow(TopologyError);
  expect(MAX_STEPS).toBe(10_000);
});

test("bad names stream: a names stream that can't be read or unpacked gives no names, never a refusal; the rank rule then leaves every Hole feature unnamed", async () => {
  const bytes = bytesOf(resolve(FILES, CTC04));
  const f = await Ipt.open(bytes);
  expect(holeNames(f)).toHaveLength(9);
  expect(holeNames(await Ipt.open(bytes, 1000))).toEqual([]); // every stream over the cap: skipped, no ReadError
  (f as unknown as { inflate: () => never }).inflate = () => { throw new ReadError(MSG_IPT_FORMAT.replace("{version}", "unknown")); }; // a stream that can't be opened
  expect(holeNames(f)).toEqual([]);
});

test("names need equal counts: one name too many or too few and no feature is named (never a shifted guess)", () => {
  const feats = [{ feature_id: 30, name: null as string | null }, { feature_id: 10, name: null as string | null }];
  assign(feats, ["Hole1"]);
  expect(feats.map((f) => f.name)).toEqual([null, null]);
  assign(feats, ["Hole1", "Hole2", "Hole3"]);
  expect(feats.map((f) => f.name)).toEqual([null, null]);
  assign(feats, ["Hole1", "Hole2"]);
  expect(feats.map((f) => f.name)).toEqual(["Hole2", "Hole1"]); // the smallest id gets the smallest number
});


// tests/inventor/hostile.py `records`, `main_model` and `cycle`, as the chamfer test needs them (the frozen file of the
// same name cycles another face, the first blend tag's)
const FIXED: { [t: number]: number } = { 0x04: 4, 0x15: 4, 0x0c: 4, 0x06: 8, 0x13: 24, 0x14: 24, 0x16: 16, 0x03: 2, 0x02: 1, 0x05: 4 };
type Rec = { name: string | null; values: [number | "s", number][] };
const HEADER = Buffer.from("\x0d\x09asmheader", "latin1");

function records(d: Buffer, start: number): Rec[] {
  const out: Rec[] = [];
  let cur: Rec["values"] = [];
  let name: string | null = null;
  let i = start;
  while (i < d.length) {
    const t = d[i], at = i;
    i += 1;
    if (t === 0x11) { out.push({ name, values: cur }); cur = []; name = null; continue; }
    if ([0x0d, 0x0e, 0x07, 0x12].includes(t)) {
      const n = d[i];
      const s = d.subarray(i + 1, i + 1 + n).toString("latin1");
      i += 1 + n;
      if ((t === 0x0d || t === 0x0e) && !cur.length) {
        name = name === null ? s : `${name}-${s}`;
        if (name.endsWith("End-of-ASM-data") || name.startsWith("Begin-of-ASM-History-Data")) return out;
      } else cur.push(["s", at]);
      continue;
    }
    if (t === 0x08 || t === 0x09) {
      const w = t === 0x08 ? 2 : 4;
      const n = w === 2 ? d.readUInt16LE(i) : d.readUInt32LE(i);
      cur.push(["s", at]);
      i += w + n;
      continue;
    }
    if (t in FIXED) { cur.push([t, at]); i += FIXED[t]; continue; }
    if ([0x0a, 0x0b, 0x0f, 0x10].includes(t)) continue;
    throw new Error(`unknown tag ${t} at ${at}`);
  }
  return out;
}

function mainModel(d: Buffer): Rec[] | null {
  let best: [Rec[], number] | null = null;
  for (let k = d.indexOf(HEADER); k >= 0; k = d.indexOf(HEADER, k + 1)) {
    const recs = records(d, k);
    const n = recs.filter((r) => r.name === "face").length;
    if (best === null || n > best[1]) best = [recs, n];
  }
  return best && best[1] ? best[0] : null;
}

/** The first coedge of the face's first loop gets as its next another coedge that loops on itself (a full circle):
 *  the ring never gets back to its first coedge. */
function cycle(d: Buffer, face: number): Buffer {
  const recs = mainModel(d);
  if (recs === null || !recs.some((r) => (r.name ?? "").startsWith("NMx_Hole_Brep_tag"))) return d; // another stream's model: left alone
  if (face >= recs.length || recs[face].name !== "face") return d;
  const ptrs = (rec: number) => recs[rec].values.filter(([t]) => t === 0x0c).map(([, at]) => at);
  const intAt = (at: number) => d.readInt32LE(at + 1);
  const first = intAt(ptrs(intAt(ptrs(face)[3]))[3]);
  const other = recs.findIndex((r, i) => r.name === "coedge" && i !== first && intAt(ptrs(i)[2]) === i);
  const out = Buffer.from(d);
  out.writeInt32LE(other, ptrs(first)[2] + 1);
  return out;
}

// --- I3 S3 J7: hostile blend tags and topology (the same files, on blend tags) ---

type B = IptPart["blends"][number];
const blendSummary = (part: IptPart) => Object.fromEntries(part.blends.map((b: B) => [b.feature_id, [b.kind,
  b.radius_mm ? Math.round(b.radius_mm * 1e4) / 1e4 : b.radius_mm,
  b.distances_mm?.length ? b.distances_mm.map((x) => Math.round(x * 1e4) / 1e4) : b.distances_mm, b.reason]]));

describe("bad blend tags: a bad blend tag is dropped, never a refusal: its face leaves its blend, every other blend reads as before", () => {
  test.each(["no_end", "long_list", "owner_off"])("%s", async (kind) => {
    const clean = await freshIpt(CTC04);
    const part = await hostile(`blend-${kind}`);
    const [before, after] = [new Set(clean.blends.flatMap((b) => b.faces)), new Set(part.blends.flatMap((b) => b.faces))];
    const lost = [...before].filter((f) => !after.has(f));
    expect(lost).toHaveLength(1); // the tag's face
    expect([...after].filter((f) => !before.has(f))).toEqual([]);
    const fid = clean.blends.find((b) => b.faces.includes(lost[0]))!.feature_id;
    expect(without(blendSummary(part), fid)).toEqual(without(blendSummary(clean), fid));
    expect(summary(part.hole_features)).toEqual(summary(clean.hole_features));
  });
});

test("cycling chamfer face: a coedge ring that never closes on a chamfer face: that face gives no size and no points, the chamfer takes its size from its next face, and nothing is refused", async () => {
  const clean = await freshIpt(CTC04);
  const chamfers = clean.blends.filter((b) => b.kind === "chamfer");
  expect(chamfers).toHaveLength(1);
  const [chamfer] = chamfers;
  const face = chamfer.faces.find((f) => chamfer.surfs.get(f)!.kind === "plane")!;
  const r = await readIpt(rewriteIptModels(bytesOf(resolve(FILES, CTC04)), (d) => cycle(d, face)));
  if (r.error) throw r.error;
  const part = r.part;
  const got = part.blends.filter((b) => b.feature_id === chamfer.feature_id);
  expect(got).toHaveLength(1);
  expect(got[0].points.get(face)).toEqual([]);
  expect(got[0].reason).toBeNull();
  expect(got[0].distances_mm!.map((x) => Math.round(x * 1e4) / 1e4)).toEqual([5.0, 5.0]);
  expect(without(blendSummary(part), chamfer.feature_id)).toEqual(without(blendSummary(clean), chamfer.feature_id));
});
