// The browser copy's "not yet" lines (port spec Design "Not checked yet"; S1 mock-up, D-057). Only the browser engine
// returns checks_not_run, so none of this shows in the Python service's page.
import type { Analysis } from "./api";
import { SLICE } from "./engine/slice";

export const NOT_WORKED_OUT = "Not worked out yet in this copy.";
const PLAN_SLICE = 3; // the machine plan and the cost drivers are ported in S3

/** "Not checked yet in this copy: <names>.", or null when every check runs. */
export function notCheckedLine(result: Analysis): string | null {
  const names = result.checks_not_run ?? [];
  return names.length ? `Not checked yet in this copy: ${names.join(", ")}.` : null;
}

/** No check has run in this copy: the Features step and card show only the line (no chips, no "No findings"). */
export function noChecksRun(result: Analysis): boolean {
  return !!result.checks_not_run?.length && result.checks_run.length === 0;
}

/** The machine plan and the cost drivers are not ported yet: Machining and Cost show NOT_WORKED_OUT, with no total. */
export function planNotWorkedOut(result: Analysis): boolean {
  return result.checks_not_run !== undefined && SLICE < PLAN_SLICE;
}

/** The status line before a part is read; the browser copy has no .ipt field until S7. */
export const START_STATUS = import.meta.env.VITE_ENGINE === "browser" || import.meta.env.VITE_ENGINE === "demo"
  ? "Choose a STEP file to start."
  : "Choose a STEP file to start. Add its .ipt too, if you have one.";
