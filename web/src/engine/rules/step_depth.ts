// Steps and slots S1 (D-079): step depth / the diameter of the end mill that fits its inside corners, over the
// pocket_depth limit (3.0) is medium; pocket_depth's test, passes and advice on steps (rules/pocket_depth.ts).
import { depthRule } from "./pocket_depth";

export const ID = "step_depth";
export const PROCESSES = ["mill"] as const;
export const { check, passes } = depthRule(ID, "step");
