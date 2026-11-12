// Steps and slots S2 (D-079): slot depth / the diameter of the end mill that fits, over the pocket_depth limit (3.0)
// is medium; pocket_depth's test, passes and advice on slots (rules/pocket_depth.ts).
import { depthRule } from "./pocket_depth";

export const ID = "slot_depth";
export const PROCESSES = ["mill"] as const;
export const { check, passes } = depthRule(ID, "slot");
