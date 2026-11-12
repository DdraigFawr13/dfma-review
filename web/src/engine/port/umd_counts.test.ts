// Steps and slots spec, J4 (UMD): the University of Maryland benchmark parts (tests/edmr/models/UMD, docs/nist/CATALOG.md)
// label features by removed volume, not by face, so they are counted: per part, with s, t and o the labelled steps,
// slots and opened pockets in <part>/<part>.fts, S1 checks s <= steps found <= s + o. A `[Corner]` (a corner notch, a
// plain L step; MFCAD++ class 22) counts with the steps (D-093). bracket1-4-Part, castle and ex1
// stop the reader ("memory access out of bounds", measured 2026-11-11) and are left out. Not timed: no wall-clock limit.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { loadNodeOc } from "../node";
import type { OC } from "../oc";
import { analyseFile, ROOT, type Result } from "./groupc-kit";

const UMD = resolve(ROOT, "tests/edmr/models/UMD");
export const PARTS = ["AES94", "base1-Part", "base2-Part", "bottomless_pocket1", "polyh_castle", "regli_pathological1",
  "socket1-Part", "socket2-Part", "swivel1-Part", "swivel2-Part", "vand1"];

/** The labelled count of one feature type in a part's .fts. */
export function labelled(part: string, type: string): number {
  return readFileSync(resolve(UMD, part, `${part}.fts`), "utf8").split(`Feature Type: [${type}]`).length - 1;
}

/** Parts that disagree for a reason Morgan settled (D-093, D-095), with the numbers: each test checks the count found is
 *  exactly the one recorded and still outside the range, so an entry is removed or changed when the engine changes. */
const KNOWN: Record<string, { found: number; why: string }> = {
  vand1: { found: 0, why: "6 labelled steps meet the centre hole, so each floor has one wall and a cut edge: not steps (D-093)" },
  "base2-Part": { found: 3, why: "UMD labels 7 steps, four of them lower floors between two slots, the arrangement it leaves unlabelled in base1; S2 names slots (D-095)" },
  regli_pathological1: { found: 1, why: "the one step found is a feature UMD labels a slot; S2 names slots (D-095)" },
};

let oc: OC;
beforeAll(async () => { oc = await loadNodeOc(); });

test("the 11 readable parts hold 31 steps, 19 slots and 2 opened pockets", () => {
  const sum = (type: string) => PARTS.reduce((a, p) => a + labelled(p, type), 0);
  expect([sum("step"), sum("slot"), sum("Opened Pocket")]).toEqual([31, 19, 2]);
});

describe("steps found within the labelled steps and opened pockets", () => {
  for (const part of PARTS) {
    test(part, { timeout: 60_000 }, async () => {
      const r: Result = await analyseFile(oc, resolve(UMD, part, `${part}.step`));
      const found = r.features.filter((f: Result) => f.kind === "step").length;
      const [s, o] = [labelled(part, "step") + labelled(part, "Corner"), labelled(part, "Opened Pocket")];
      const say = `${part}: ${found} steps found, labelled ${s} steps and corners and ${o} opened pockets`;
      if (part in KNOWN) {
        const known = KNOWN[part];
        expect(found, `${say}; known difference: ${known.why}`).toBe(known.found);
        expect(found >= s && found <= s + o, `${say}; known difference: ${known.why}`).toBe(false);
        return;
      }
      expect(found, say).toBeGreaterThanOrEqual(s);
      expect(found, say).toBeLessThanOrEqual(s + o);
    });
  }
});

/** S2 (spec J4): parts whose slot counts disagree with the labels. Accepted as known differences by Morgan (2026-11-12, D-096 addendum); causes not traced. Each is held at the numbers
 *  measured 2026-11-12, so a change in the engine shows and the entry is changed or removed. */
const SLOT_KNOWN: Record<string, [number, number]> = { // part: [steps found, slots found]
  bottomless_pocket1: [0, 0], // labelled 1 slot
  polyh_castle: [0, 4], // labelled 2 slots
  regli_pathological1: [1, 0], // labelled 1 slot
  "socket2-Part": [4, 2], // labelled 6 slots
};

// S2: per part, t <= slots found and steps + slots found <= s + t + o (spec J4)
describe("slots found within the labelled slots", () => {
  for (const part of PARTS) {
    test(part, { timeout: 60_000 }, async () => {
      const r: Result = await analyseFile(oc, resolve(UMD, part, `${part}.step`));
      const [steps, slots] = ["step", "slot"].map((k) => r.features.filter((f: Result) => f.kind === k).length);
      const [s, t, o] = [labelled(part, "step") + labelled(part, "Corner"), labelled(part, "slot"), labelled(part, "Opened Pocket")];
      const say = `${part}: ${steps} steps and ${slots} slots found, labelled ${s} steps and corners, ${t} slots, ${o} opened pockets`;
      if (part in SLOT_KNOWN) {
        expect([steps, slots], `${say}; known difference, accepted 2026-11-12 (D-096)`).toEqual(SLOT_KNOWN[part]);
        expect(slots >= t && steps + slots <= s + t + o, say).toBe(false);
        return;
      }
      expect(slots, say).toBeGreaterThanOrEqual(t);
      expect(steps + slots, say).toBeLessThanOrEqual(s + t + o);
    });
  }
});
