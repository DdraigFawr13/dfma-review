// Port of tests/service/test_inventor_part.py: read_ipt and the part-type check on the 16 NIST .ipt files (spec J3, J6
// reader cases). The reader cases that rewrite an .ipt's model stream use the web's `cfb` library where Python used
// olefile (rewriteIptModels below).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import CFB from "cfb";
import { describe, expect, test } from "vitest";
import { checkPartType } from "../inventor/pair";
import { modelStates, readIpt } from "../inventor/part";
import { ReadError } from "../read";
import { MSG_IPT_FORMAT, MSG_IPT_NO_MODEL, MSG_IPT_NOT_IPT, MSG_IPT_TOO_BIG, MSG_IPT_TYPE } from "../settings";
import { bytesOf, FILES, freshIpt, INV, ipt, PARTS } from "./inventor_common";

// (faces, corners, Model State names) measured 2026-11-08; CTC 04 368/506 and FTC 07 2021 210 corners
// (from 346 point records) as in the spec, J3
const COUNTS: Record<string, [number, number, string[]]> = {
  "INV_nist_ctc_01_asme1_2021.ipt": [139, 250, []],
  "INV_nist_ctc_02_asme1_2021.ipt": [443, 630, []],
  "INV_nist_ctc_03_asme1_2021.ipt": [131, 202, []],
  "INV_nist_ctc_04_asme1_2021.ipt": [368, 506, []],
  "INV_nist_ctc_05_asme1_2021.ipt": [158, 261, []],
  "INV_nist_ftc_06_asme1_2021.ipt": [148, 237, []],
  "INV_nist_ftc_06_asme1_2024.ipt": [148, 237, ["[Primary]"]],
  "INV_nist_ftc_07_asme1_2021.ipt": [258, 210, ["Master"]],
  "INV_nist_ftc_07_asme1_2024.ipt": [258, 346, ["[Primary]"]],
  "INV_nist_ftc_08_asme1_2021.ipt": [255, 412, []],
  "INV_nist_ftc_08_asme1_2024.ipt": [255, 412, ["[Primary]"]],
  "INV_nist_ftc_09_asme1_2021.ipt": [91, 174, []],
  "INV_nist_ftc_09_asme1_2024.ipt": [91, 174, []],
  "INV_nist_ftc_10_asme1_2021.ipt": [223, 310, []],
  "INV_nist_ftc_10_asme1_2024.ipt": [215, 299, ["[Primary]"]],
  "INV_nist_ftc_11_asme1_2021.ipt": [8, 8, []],
};
const NAMES = Object.keys(COUNTS).sort();
const SHEET_METAL = ["INV_nist_ctc_03_asme1_2021.ipt", "INV_nist_ftc_09_asme1_2021.ipt", "INV_nist_ftc_09_asme1_2024.ipt"];
const PLAIN_STEP = { ignoredSolids: 0 } as never; // the part-type check reads only this from the STEP

const refusal = (f: () => void): string => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(ReadError); return (e as Error).message; }
  throw new Error("no ReadError raised");
};

test("checksums", () => {
  const text = readFileSync(resolve(INV, "SOURCE.md"), "utf8");
  const sums = new Map([...text.matchAll(/^([0-9a-f]{64}) {2}(\S+\.ipt)$/gm)].map((m) => [m[2], m[1]]));
  const onDisk = readdirSync(FILES).filter((n) => n.endsWith(".ipt")).sort();
  expect([...sums.keys()].sort()).toEqual(NAMES);
  expect(NAMES).toEqual(onDisk);
  for (const [name, h] of sums) expect(createHash("sha256").update(readFileSync(resolve(FILES, name))).digest("hex"), name).toBe(h);
});

describe("counts", () => {
  test.each(NAMES)("%s", async (name) => {
    const part = await ipt(name);
    const [faces, corners, states] = COUNTS[name];
    expect([part.face_count, part.corners_mm.length, part.model_state_names]).toEqual([faces, corners, states]);
    expect(part.solid_bodies).toBe(1);
    expect(part.acis_version.startsWith("22")).toBe(true);
    const year = name === "INV_nist_ftc_07_asme1_2021.ipt" ? "2022" : name.slice(-8, -4);
    expect(part.saved_with.startsWith(year)).toBe(true);
  });
});

test("units and header: CTC 04, saved by 2021: cm in the file, mm out; the outer size as NIST draws it (mm)", async () => {
  const part = await ipt("INV_nist_ctc_04_asme1_2021.ipt");
  expect(part.acis_version).toBe("226.0.3.65535");
  expect(part.saved_with).toBe("2021 (Build 250183000, 183)");
  const ext = [0, 1, 2].map((k) => Math.max(...part.corners_mm.map((c) => c[k])) - Math.min(...part.corners_mm.map((c) => c[k])));
  expect(Math.max(...ext)).toBeGreaterThan(100); // a part some hundred mm long, not cm
});

describe("sheet metal refused", () => {
  test.each(SHEET_METAL)("%s", async (name) => {
    const part = await ipt(name);
    expect(refusal(() => checkPartType(part, PLAIN_STEP))).toBe(
      "This Inventor part is a sheet-metal part. Only plain single-body parts can be read for now. Upload the STEP on its own, without the .ipt.");
  });
});

describe("surface bodies are not multi-body (each holds 2 extra one-plane surface bodies beside its solid; they pass the body rule)", () => {
  test.each(["INV_nist_ftc_06_asme1_2021.ipt", "INV_nist_ftc_10_asme1_2021.ipt"])("%s", async (name) => {
    checkPartType(await ipt(name), PLAIN_STEP);
  });
});

describe("plain parts pass", () => {
  test.each(NAMES.filter((n) => !SHEET_METAL.includes(n)))("%s", async (name) => {
    checkPartType(await ipt(name), PLAIN_STEP);
  });
});

describe("other refusals", () => {
  const cases: [string, Record<string, unknown>, unknown, string][] = [
    ["Model States", { model_state_names: ["[Primary]", "Long"] }, PLAIN_STEP, "part with Model States"],
    ["two solid bodies", { solid_bodies: 2 }, PLAIN_STEP, "multi-body part"],
    ["one ignored solid in the STEP", {}, { ignoredSolids: 1 }, "multi-body part"],
    ["another document type", { subtype: "28EC8354-9024-440F-A8A2-0E0E55D635B0" }, PLAIN_STEP, "part of a type this tool can't read yet"],
    ["no document type", { subtype: null }, PLAIN_STEP, "part of a type this tool can't read yet"],
  ];
  test.each(cases)("%s", async (_title, kw, step, kind) => {
    const part = Object.assign(await freshIpt("INV_nist_ctc_04_asme1_2021.ipt"), kw);
    expect(refusal(() => checkPartType(part, step as never))).toBe(MSG_IPT_TYPE.replace("{kind}", kind));
  });
});

test("model states layout: after the marker's second copy, a count, a byte, then the names", () => {
  const mark = Buffer.from("90b4294dd011b249077ec39300000006", "hex");
  const names = ["[Primary]", "Long"];
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const body = Buffer.concat([u32(names.length), Buffer.from([0]), ...names.flatMap((n) => [u32(n.length), Buffer.from(n, "utf16le")])]);
  const text = Buffer.concat([Buffer.from("xx"), mark, Buffer.alloc(8, 1), mark, body, mark]);
  expect(modelStates(new Uint8Array(text))).toEqual(names);
  expect(modelStates(new Uint8Array(Buffer.from("no marker here")))).toEqual([]);
  expect(modelStates(new Uint8Array(Buffer.concat([mark, Buffer.alloc(3), mark, Buffer.from([5, 0])])))).toEqual([]); // cut short: no names, no crash
});

// J6 reader cases: hostile and broken files, built here from a NIST copy (no outside binaries)

/** Replace each model stream's inflated data with change(data), recompressed into the same size (tests/helpers.py
 *  rewrite_ipt_models, with cfb in place of olefile). */
function rewriteIptModels(bytes: Uint8Array, change: (d: Buffer) => Buffer): Uint8Array {
  const c = CFB.read(Buffer.from(bytes), { type: "buffer" });
  c.FileIndex.forEach((e, i) => {
    const name = c.FullPaths[i].split("/").filter((x) => x !== "").slice(1).join("/");
    if (e.type !== 2 || !name.startsWith("RSeStorage/B")) return;
    const raw = Buffer.from(e.content as Uint8Array);
    const k = raw.indexOf("x^");
    if (k < 0) return;
    const data = inflateSync(raw.subarray(k), { finishFlush: 2 }); // Z_SYNC_FLUSH: stops at the stream's end
    const changed = change(data);
    if (changed.equals(data)) return; // a stream the change leaves alone stays byte for byte (Node's zlib may deflate it larger than Python's did)
    const out = Buffer.concat([raw.subarray(0, k), deflateSync(changed, { level: 5 })]); // level 2-5 writes the header `x^`, as Inventor does
    expect(out.length, "the changed model must fit its stream").toBeLessThanOrEqual(raw.length);
    e.content = Buffer.concat([out, Buffer.alloc(raw.length - out.length)]) as never;
  });
  return new Uint8Array(CFB.write(c, { type: "buffer" }) as Buffer);
}

const FTC11 = resolve(FILES, "INV_nist_ftc_11_asme1_2021.ipt");

test("not an .ipt", async () => {
  const text = new Uint8Array(Buffer.from("ISO-10303-21;\nHEADER;\n"));
  expect((await readIpt(text)).error?.message).toContain(MSG_IPT_NOT_IPT);
  expect((await readIpt(bytesOf(resolve(PARTS, "box_through_hole.step")))).error?.message).toContain(MSG_IPT_NOT_IPT);
});

test("over the cap: the cap patched down to 1 MiB (spec Builder defaults); CTC 02's main model inflates past it", async () => {
  const r = await readIpt(bytesOf(resolve(FILES, "INV_nist_ctc_02_asme1_2021.ipt")), 1024 * 1024);
  expect(r.error?.message).toContain(MSG_IPT_TOO_BIG);
});

test("no model", async () => {
  const p = rewriteIptModels(bytesOf(FTC11), (d) => Buffer.from(d.toString("latin1").replace("asmheader", "xxxxxxxxx"), "latin1"));
  expect((await readIpt(p)).error?.message).toContain(MSG_IPT_NO_MODEL);
});

describe("broken model: a string length running off the data, an unknown tag, and a model cut before its end record", () => {
  test.each(["length", "tag", "end"])("%s", async (cut) => {
    const change = (d: Buffer): Buffer => {
      const k = d.indexOf(Buffer.from("\x0d\x09asmheader", "latin1"));
      if (k < 0) return d;
      if (cut === "length") { // the first long string (tag 0x08, u16 length) claims 65535 bytes
        const j = d.indexOf(0x08, k + 12);
        return Buffer.concat([d.subarray(0, j + 1), Buffer.from([0xff, 0xff]), d.subarray(j + 3, j + 40)]);
      }
      if (cut === "tag") {
        const j = d.indexOf(0x11, k) + 1; // first byte of the second record
        return Buffer.concat([d.subarray(0, j), Buffer.from([0xee]), d.subarray(j + 1)]);
      }
      return d.subarray(0, k + 200);
    };
    const r = await readIpt(rewriteIptModels(bytesOf(FTC11), change));
    expect([MSG_IPT_FORMAT.replace("{version}", "226.0.3.65535"), MSG_IPT_FORMAT.replace("{version}", "unknown")]).toContain(r.error?.message);
  });
});
