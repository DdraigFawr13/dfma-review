// P1 removal lines (machining spec, Design "P1: page"), worded as the approved P1 mock-up (mockups/p1-removal.html,
// D-089): the Machining step's plan list and the PDF's Part summary. Pure functions on a result.
import type { Analysis } from "./api";

const MM3_PER_IN3 = 25.4 ** 3;
/** "2,401.60 in³ (39,355,177 mm³)": in³ to 2 decimals and mm³ whole, both with thousands commas. */
export function volumeText(mm3: number): string {
  const in3 = (mm3 / MM3_PER_IN3).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${in3} in³ (${Math.round(mm3).toLocaleString("en-US")} mm³)`;
}

export type Typed = [number, number, number];
const BAD_SIZE = "Type three sizes over 0 in.";
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const in3Text = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The part's sides along the part frame's x, y, z as the Stock line shows them (to 0.001 in), so a typed size equal
 *  to the shown one is accepted (machining spec J2). */
function partSides(result: Analysis): Typed {
  return result.part.bbox_in.map(r3) as Typed;
}

/** Your stock (machining spec J2, R6): three typed sizes in inches, in any order, paired largest to largest with the
 *  part's sides; returns them along the part frame's x, y, z, or the line that says what is wrong. */
export function typedStock(result: Analysis, raw: string[]): { typed: Typed } | { error: string } {
  const sizes = raw.map((s) => (/^\s*(\d+\.?\d*|\.\d+)\s*$/.test(s) ? Number(s) : NaN)); // plain decimals only
  if (sizes.length !== 3 || sizes.some((v) => !Number.isFinite(v) || v <= 0)) return { error: BAD_SIZE };
  const part = partSides(result);
  const order = [0, 1, 2].sort((a, b) => part[b] - part[a]); // the part's axes, largest side first
  const sorted = [...sizes].sort((a, b) => b - a);
  const typed: Typed = [0, 0, 0];
  order.forEach((k, i) => { typed[k] = sorted[i]; });
  const small = order.filter((k) => typed[k] < part[k]);
  if (small.length) return { error: small.map((k) => `Your ${typed[k].toFixed(3)} in is smaller than the part's ${part[k].toFixed(3)} in.`).join(" ") };
  return { typed };
}

/** The plan list's rows under Stock, as [term, text]; none for a part with no removal (turned). With your stock
 *  (`typed`, inches along the part frame's x, y, z): the removal from it, Not explained still of the part-size
 *  removal (D-089), and the facing per axis in the order Z, X, Y so corners count once (the part sits centred). */
export function removalLines(result: Analysis, typed?: Typed): [string, string][] {
  const m = result.removal;
  if (!m) return [];
  const notExplained = (of: string): [string, string] =>
    ["Not explained", `${volumeText(m.unexplained_mm3)}, ${m.unexplained_pct.toFixed(2)} % of the ${of}removal: no found hole or pocket accounts for it, such as an outside profile`];
  if (!typed) return [["Removal", `${volumeText(m.total_mm3)}: the stock block minus the part`], notExplained("")];
  const [tx, ty, tz] = typed;
  const [px, py, pz] = partSides(result);
  const typedMm3 = tx * ty * tz * MM3_PER_IN3;
  const facing = (axis: string, extra: number, in3: number): [string, string] =>
    [`Facing ${axis}`, `${(extra / 2).toFixed(4)} in per side, ${in3Text(in3)} in³ in the two layers`];
  return [
    ["Removal", `${volumeText(typedMm3 - m.part_mm3)}: your ${typed.map((v) => v.toFixed(3)).join(" × ")} in block minus the part`],
    notExplained("part-size "),
    facing("Z", tz - pz, (tz - pz) * tx * ty),
    facing("X", tx - px, (tx - px) * ty * pz),
    facing("Y", ty - py, (ty - py) * px * pz),
  ];
}
