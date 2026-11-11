// Port of tests/service/test_inventor_names.py: the answer key for thread names (tests/inventor/names_key.json,
// InventorLoader output, D-031), the measured feature-id field of thread records, and Hole names by the rank rule
// (spec "Names (measured; the rank rule)", D-039) checked against holes_key.json.
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { holeNames, nameThreads } from "../inventor/names";
import type { Ipt } from "../inventor/ole";
import { THREAD_2021, THREAD_2024_TAG } from "../inventor/threads";
import { FILES, holePairs, INV, ipt, json, mainModel, registered } from "./inventor_common";

const KEY = json(resolve(INV, "names_key.json"));
const THREAD_FILES = Object.keys(KEY.threads).sort();
const NO_NAMES: Record<string, number> = { "INV_nist_ftc_06_asme1_2024.ipt": 7, "INV_nist_ftc_10_asme1_2024.ipt": 11 }; // names seen > ids read

/** The feature id of each thread record of the main model, in record order (2021: int 8; 2024: int 9). */
async function featureIds(name: string): Promise<number[]> {
  const out: number[] = [];
  for (const r of await mainModel(name)) {
    const s = r.of("s");
    const rn = r.name ?? "";
    const isThread = rn.startsWith(THREAD_2021) || (rn.includes("ATTRIB_CUSTOM") && s.length > 0 && s[0] === THREAD_2024_TAG);
    if (isThread) out.push(r.of("i")[rn.startsWith(THREAD_2021) ? 8 : 9]);
  }
  return out;
}

describe("key covers every thread", () => {
  test.each(THREAD_FILES)("%s", async (name) => {
    expect((await ipt(name)).threads.map((t) => t.id)).toEqual(Object.keys(KEY.threads[name]));
  });
});

describe("feature id groups threads by feature", () => {
  test.each(THREAD_FILES)("%s", async (name) => {
    const ids = await featureIds(name);
    const names = Object.values(KEY.threads[name]) as string[];
    expect(ids).toHaveLength(names.length);
    expect(Object.fromEntries(ids.map((id, k) => [String(id), names[k]]))).toEqual(KEY.feature_ids[name]);
    expect(new Set(ids).size).toBe(new Set(names).size); // one id per feature and one feature per id
  });
});

// --- I2 S2 J4: names by the rank rule ---

test("hole names against key: each checkable Hole's name equals the key's where the counts match (spec: 70 of 70, 0 wrong)", async () => {
  let right = 0, wrong = 0;
  for (const [name, k, f] of await holePairs()) {
    if (name in NO_NAMES) { expect(f.name, `${name} ${k.name}`).toBeNull(); continue; }
    if (f.name === k.name) right++; else wrong++;
  }
  expect([right, wrong]).toEqual([70, 0]);
});

describe("hole names rank rule: names fill in only when the count of Hole names equals the count of Hole features; else all null", () => {
  test.each(readdirSync(FILES).filter((n) => n.endsWith(".ipt")).sort())("%s", async (name) => {
    const part = await ipt(name);
    const names = part.hole_features.map((f) => f.name);
    if (name in NO_NAMES) {
      expect(names).toEqual(names.map(() => null));
      expect(part.hole_names_seen).toBe(NO_NAMES[name]);
      return;
    }
    expect(part.hole_names_seen).toBe(names.length);
    expect(names.every((n) => n !== null)).toBe(true);
    expect([...names].sort((a, b) => Number(a!.slice(4)) - Number(b!.slice(4)))).toEqual(names); // k-th smallest id, k-th name by number
  });
});

describe("thread feature name: each thread's feature id and name; STC 10 (FTC 10 2024) shows no names (counts differ)", () => {
  test.each(["INV_nist_ctc_04_asme1_2021.ipt", "INV_nist_ftc_10_asme1_2021.ipt", "INV_nist_ftc_10_asme1_2024.ipt"])("%s", async (name) => {
    const part = await ipt(name);
    expect(part.threads.map((t) => t.feature_id)).toEqual(await featureIds(name));
    const want = name in NO_NAMES ? part.threads.map(() => null) : Object.values(KEY.threads[name]);
    expect(part.threads.map((t) => t.feature_name)).toEqual(want);
  });
});

test("names in response: the response carries each Hole feature's name, each thread's feature_name and hole_names_seen", async () => {
  const inv = (await registered("nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt")).inventor;
  expect(inv.hole_features.map((f: any) => f.name)).toEqual(["Hole8", "Hole10", "Hole11", "Hole12", "Hole13", "Hole19", "Hole20", "Hole21", "Hole22"]);
  expect(new Set(inv.threads.map((t: any) => t.feature_name))).toEqual(new Set(["Hole8"]));
  expect(inv.hole_names_seen).toBe(9);
}, 120_000);

/** Streams by name, already inflated (for holeNames). */
const fake = (streams: Record<string, Uint8Array>): Ipt => ({ names: Object.keys(streams), inflate: (n: string) => streams[n] }) as unknown as Ipt;
const u16 = (...texts: string[]): Uint8Array => new Uint8Array(Buffer.concat(texts.map((t) => Buffer.concat([Buffer.from([5, 0, 0, 0]), Buffer.from(t, "utf16le")]))));
const pad = (b: Uint8Array, n: number): Uint8Array => new Uint8Array(Buffer.concat([b, Buffer.alloc(n, "x")]));
const empty = new Uint8Array();

test("names stream choice: the smallest B stream with an M partner that holds a Hole<n> text; ties to sort order; texts distinct", () => {
  const f = fake({
    "RSeStorage/Bbig": pad(u16("Hole1", "Hole2", "Hole3"), 100), "RSeStorage/Mbig": empty,
    "RSeStorage/Bsmall": u16("Hole10", "Hole2", "Hole10"), "RSeStorage/Msmall": empty,
    "RSeStorage/Bnone": u16("Fillet1"), "RSeStorage/Mnone": empty,
    "RSeStorage/Blone": u16("Hole7"), // no M partner: never read
  });
  expect(holeNames(f)).toEqual(["Hole2", "Hole10"]); // by number, not by text
  const g = fake({ "RSeStorage/Bb": u16("Hole5"), "RSeStorage/Mb": empty, "RSeStorage/Ba": u16("Hole4"), "RSeStorage/Ma": empty });
  expect(holeNames(g)).toEqual(["Hole4"]); // equal sizes: the first name in sort order
});

test("thread of no Hole feature: a thread whose feature id is no Hole feature's gets no name (never a neighbour's)", async () => {
  const part = await ipt("INV_nist_ctc_04_asme1_2021.ipt");
  const threads = [2437, 1, null].map((k) => ({ ...part.threads[0], feature_id: k, feature_name: "stale" as string | null }));
  nameThreads(threads, part.hole_features);
  expect(threads.map((t) => t.feature_name)).toEqual(["Hole8", null, null]);
});
