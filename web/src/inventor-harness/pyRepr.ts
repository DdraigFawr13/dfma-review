// How Python prints the values the harness scripts print. `pyStr`: None, a str, an int. `pyFloat`: a float field (a whole
// number gets ".0"). Limit: a float below 1e-4 or from 1e16 up is written differently in Python (exponent); the
// printed floats are rounded lengths in mm.
export function pyStr(v: unknown): string {
  return v === null || v === undefined ? "None" : String(v);
}

export function pyFloat(v: number | null | undefined): string {
  if (v === null || v === undefined) return "None";
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}
