// Inches on screen to 0.001 in; fractions within 0.0005 in of a 1/64 in multiple (spec Units).

const MM_PER_IN = 25.4;

export function mmToIn(mm: number): number {
  return mm / MM_PER_IN;
}

/** "0.250 in" */
export function formatIn(inches: number): string {
  return `${fixed(inches, 3)} in`;
}

/** "0.250 in (1/4)" when the value is within 0.0005 in of a 1/64 in multiple, else "0.260 in". */
export function formatInWithFraction(inches: number): string {
  const fraction = toFraction(inches);
  return fraction === null ? formatIn(inches) : `${formatIn(inches)} (${fraction})`;
}

/** "1/4", "1 1/2", "2"; null when no 1/64 in multiple is within 0.0005 in. */
export function toFraction(inches: number): string | null {
  const sixtyFourths = Math.round(inches * 64);
  if (Math.abs(inches - sixtyFourths / 64) > 0.0005 + 1e-12) return null;
  if (sixtyFourths === 0) return null;
  const sign = sixtyFourths < 0 ? "-" : "";
  let n = Math.abs(sixtyFourths);
  const whole = Math.floor(n / 64);
  n -= whole * 64;
  if (n === 0) return `${sign}${whole}`;
  let d = 64;
  while (n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  return whole > 0 ? `${sign}${whole} ${n}/${d}` : `${sign}${n}/${d}`;
}

/** Part size: decimals only, largest first: "2.000 × 1.000 × 0.500 in". */
export function formatSize(bboxIn: number[]): string {
  const sorted = [...bboxIn].sort((a, b) => b - a);
  return `${sorted.map((v) => fixed(v, 3)).join(" × ")} in`;
}

/** Ratios to 0.1: "8.0×". */
export function formatRatio(ratio: number): string {
  return `${fixed(ratio, 1)}×`;
}

function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text; // no "-0.000"
}
