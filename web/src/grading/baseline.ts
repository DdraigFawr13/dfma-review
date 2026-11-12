// The hole and pocket baselines the steps and slots target rule compares with (steps and slots spec, Goals; D-079):
// today's engine before steps and slots, measured 2026-11-11 with
//   node web/scripts/grading.mjs grade mfcadpp tests/grading/.cache/mfcadpp --limit 500 --jobs 4            (first)
//   node web/scripts/grading.mjs grade mfcadpp tests/grading/.cache/mfcadpp --skip 500 --limit 500 --jobs 4 (check)
// Faces found, faces labelled, and wrong calls, on the labels that baseline scored.
export interface Baseline { name: string; holes: [number, number, number]; pockets: [number, number, number] }

export const BASELINES: Baseline[] = [
  { name: "first 500", holes: [590, 602, 0], pockets: [3667, 3745, 1] },
  { name: "check 500", holes: [643, 666, 0], pockets: [3760, 3872, 1] },
];

/** The baseline with the same labelled hole and pocket face counts, or null (another set). */
export function baselineFor(holesOf: number, pocketsOf: number): Baseline | null {
  return BASELINES.find((b) => b.holes[1] === holesOf && b.pockets[1] === pocketsOf) ?? null;
}
