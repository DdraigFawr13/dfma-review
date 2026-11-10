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

/** Python's round(x, n): the decimal nearest the float's exact binary value, an exact tie to the even digit.
 *  toFixed(n) is correctly rounded except at an exact tie, where it rounds up; the exact expansion (toFixed with
 *  enough digits ends the binary fraction) shows the tie. */
export function round(x: number, places: number): number {
  if (!Number.isFinite(x)) return x;
  const exact = Math.abs(x).toFixed(Math.min(100, places + 60));
  const tail = exact.slice(exact.indexOf(".") + 1 + places);
  let r = Number(x.toFixed(places));
  if (/^50*$/.test(tail)) {
    const step = 10 ** -places;
    const down = Number((Math.sign(x) * (Math.abs(x) - step / 2)).toFixed(places)); // the neighbour towards zero
    const digit = (v: number) => Math.round(Math.abs(v) * 10 ** places) % 2;
    if (digit(r) === 1) r = down; // an exact tie: keep the even one
  }
  return r + 0; // + 0 turns -0 into 0, as Python prints it
}
