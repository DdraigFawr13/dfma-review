// Port of service/dfma/units.py: lengths are millimetres inside, inches on screen (D-005).
// S1 ports what the reader and the part summary use; past_limit, fraction and fmt_in come with the rows (S2).

export const MM_PER_IN = 25.4;

export function mmToIn(mm: number): number {
  return mm / MM_PER_IN;
}

export type Unit = "mm" | "cm" | "m" | "inch" | "none" | "other";

/** Map the length unit a STEP file declares to "mm", "cm", "m", "inch", "none" (it declares none, D-020) or "other". */
export function unitName(fileLengthUnit: string): Unit {
  const name = fileLengthUnit.trim().toLowerCase();
  if (["mm", "millimetre", "millimeter"].includes(name)) return "mm";
  if (["cm", "centimetre", "centimeter"].includes(name)) return "cm";
  if (["m", "metre", "meter"].includes(name)) return "m";
  if (!name) return "none";
  if (["in", "inch", "inches"].includes(name)) return "inch";
  return "other";
}

/** Python's round(x, n) for the values the engine rounds: round half to even on the decimal string. */
export function round(x: number, places: number): number {
  const scaled = x * 10 ** places;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let r: number;
  if (Math.abs(diff - 0.5) < 1e-9 * Math.max(1, Math.abs(scaled))) r = floor % 2 === 0 ? floor : floor + 1;
  else r = Math.round(scaled);
  return r / 10 ** places + 0; // + 0 turns -0 into 0, as Python prints it
}
