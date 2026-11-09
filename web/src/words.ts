// Severity words and shapes (review-steps spec "Words and marks", D-042): the API keeps high / medium; the screen and
// the PDF say Fix / Review, and the screen adds a shape so colour is never the only sign (APP-02).

export type Sev = "high" | "medium" | "low" | "ok";

const WORD: Record<Sev, string> = { high: "Fix", medium: "Review", low: "OK", ok: "OK" };
const MARK: Record<Sev, string> = { high: "▲", medium: "◆", low: "", ok: "" };

/** "Fix", "Review" or "OK". */
export function sevWord(severity: string): string {
  return WORD[severity as Sev] ?? severity;
}

/** "▲", "◆" or "" (the PDF's fonts lack the shapes: words only there). */
export function sevMark(severity: string): string {
  return MARK[severity as Sev] ?? "";
}

/** "F4–F7" for a run of three or more ids without a gap, else the ids with spaces ("F1 F2", "F1 F3"). */
export function idRange(ids: string[]): string {
  const nums = ids.map((id) => Number(id.replace(/^\D+/, "")));
  const run = ids.length >= 3 && nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  return run ? `${ids[0]}–${ids[ids.length - 1]}` : ids.join(" ");
}

/** "1 setup", "2 setups". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
