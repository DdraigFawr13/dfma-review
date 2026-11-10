// Port of service/dfma/units.py: lengths are millimetres inside, inches on screen (D-005).
// S1 ported what the reader and the part summary use; S2 adds past_limit, fraction, fmt_in and the Python number formats.

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

export const METRIC = ["mm", "cm", "m"]; // D-020: centimetre and metre files are metric too

/** Python's f"{x:.{places}f}": round(x, places) (an exact tie to even), then the digits; -0 keeps its sign. */
export function pyFixed(x: number, places: number): string {
  const r = round(x, places);
  const text = Math.abs(r).toFixed(places);
  return x < 0 || Object.is(x, -0) ? `-${text}` : text;
}

/** Python's f"{x:g}" (6 significant digits, trailing zeros dropped). */
export function pyG(x: number): string {
  if (x === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(6)))));
  if (exp < -4 || exp >= 6) {
    const [m, e] = x.toExponential(5).split("e");
    const mant = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    const n = Number(e);
    return `${mant}e${n < 0 ? "-" : "+"}${String(Math.abs(n)).padStart(2, "0")}`;
  }
  return String(Number(x.toPrecision(6)));
}

/** value to `places` decimals, or one more where that would read the same as the limit ("6.03x (limit 6.0x)"). */
export function pastLimit(value: number, limit: number, places: number): string {
  const text = pyFixed(value, places);
  return text === pyFixed(limit, places) ? pyFixed(value, places + 1) : text;
}

/** "1/4", "1 1/2"; null unless within 0.0005 in of a 1/64 in multiple (spec Units). */
export function fraction(inches: number): string | null {
  const sixtyFourths = round(inches * 64, 0);
  if (sixtyFourths === 0 || Math.abs(inches - sixtyFourths / 64) > 0.0005 + 1e-12) return null;
  const abs = Math.abs(sixtyFourths);
  const whole = Math.floor(abs / 64);
  let n = abs % 64;
  const sign = sixtyFourths < 0 ? "-" : "";
  if (n === 0) return `${sign}${whole}`;
  let d = 64;
  while (n % 2 === 0) { n /= 2; d /= 2; }
  return whole ? `${sign}${whole} ${n}/${d}` : `${sign}${n}/${d}`;
}

/** "0.250 in", or "0.250 in (1/4)" with a fraction where one fits. */
export function fmtIn(inches: number, withFraction = false): string {
  let text = pyFixed(inches, 3);
  if (Number(text) === 0) text = pyFixed(0, 3);
  const frac = withFraction ? fraction(inches) : null;
  return frac ? `${text} in (${frac})` : `${text} in`;
}
