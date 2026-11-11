// P1 removal lines (machining spec, Design "P1: page"), worded as the approved P1 mock-up (mockups/p1-removal.html,
// D-089): the Machining step's plan list and the PDF's Part summary. Pure functions on a result.
import type { Analysis } from "./api";

const MM3_PER_IN3 = 25.4 ** 3;
/** "2,401.60 in³ (39,355,177 mm³)": in³ to 2 decimals and mm³ whole, both with thousands commas. */
export function volumeText(mm3: number): string {
  const in3 = (mm3 / MM3_PER_IN3).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${in3} in³ (${Math.round(mm3).toLocaleString("en-US")} mm³)`;
}

/** The plan list's rows under Stock, as [term, text]; none for a part with no removal (turned). */
export function removalLines(result: Analysis): [string, string][] {
  const m = result.removal;
  if (!m) return [];
  return [
    ["Removal", `${volumeText(m.total_mm3)}: the stock block minus the part`],
    ["Not explained", `${volumeText(m.unexplained_mm3)}, ${m.unexplained_pct.toFixed(2)} % of the removal: no found hole or pocket accounts for it, such as an outside profile`],
  ];
}
