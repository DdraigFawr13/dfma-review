// POST /api/analyze (spec Flow and Response schema). Typed so far: the S1 to S5 fields.

export type Process = "mill" | "turn";
export type Material = "al6061" | "steel1018" | "ss304" | "plastic";

export interface Face {
  id: number;
  kind: "plane" | "cylinder" | "cone" | "torus" | "other";
  positions: number[]; // flat xyz, mm, file coordinates
  indices: number[]; // local to this face
}

/** I1 (spec "Response"): present only when an .ipt was uploaded with the STEP. */
export interface Inventor {
  name: string;
  saved_with: string;
  acis_version: string;
  checks: { faces: [number, number]; corners: [number, number]; worst_corner_gap_mm: number | null };
  threads?: Thread[]; // S2: always a list when an .ipt was read
  hole_features?: HoleFeature[]; // I2 S1: always a list when an .ipt was read
  hole_names_seen?: number; // I2 S2: `Hole<n>` names in the .ipt; names fill in only when it equals the features read
}

type MapState = "matched" | "disagrees" | "not_mapped";

/** I2 S1 (spec I2+I3 "Response"): one Hole feature from the .ipt, sizes as designed, mm. */
export interface HoleFeature {
  id: string;
  feature_id: number;
  name: string | null; // S2
  type: "simple" | "counterbore" | "countersink";
  diameter_mm: number | null;
  depth_mm: number | null;
  length_mm: number | null;
  through: boolean;
  point_deg: number | null;
  cbore_diameter_mm: number | null;
  cbore_depth_mm: number | null;
  csink_diameter_mm: number | null;
  csink_deg: number | null;
  holes: IptHole[];
  state: MapState;
  reason: string | null;
}

export interface IptHole {
  id: string;
  start: number[];
  axis: number[];
  copied_by: number[];
  state: MapState;
  hole: string | null;
  gaps: { what: "axis" | "diameter" | "depth" | "through"; mm: number; text: string }[];
  reason: string | null;
}

/** I1 S2 (spec "Response"): one thread from the .ipt; mm and file coordinates as stored. */
export interface Thread {
  id: string;
  designation: string | null;
  class: string | null;
  standard: string | null;
  pitch_mm: number | null;
  depth_mm: number | null;
  tap_drill_mm: number | null;
  minor_mm: [number, number] | null;
  major_mm: [number, number] | null;
  start: number[] | null;
  end: number[] | null;
  axis: number[] | null;
  state: "matched" | "disagrees" | "not_mapped";
  hole: string | null;
  gaps: { what: "axis" | "diameter" | "depth"; mm: number; text: string }[];
  reason: string | null;
  feature_name: string | null;
}

export interface Analysis {
  inventor?: Inventor;
  part: {
    name: string;
    units_in_file: "mm" | "cm" | "m" | "inch" | "none" | "other";
    bbox_in: [number, number, number];
    face_count: number;
    volume_mm3: number;
    ignored_solids: number;
    not_analysed_faces: number[];
    frame: { x: number[]; y: number[]; z: number[] };
  };
  faces: Face[];
  features: Feature[];
  findings: Finding[];
  rules_run: string[];
  passed: Passed[]; // D-023 proposed: each check a feature passed, with the math
  assumptions: string[];
  machine: string | null; // S5
  turn_axis: number[] | null;
  stock?: { shape: "bar" | "block"; diameter_in?: number; length_in?: number; size_in?: number[] }; // the part's own size // S6: the turning axis (file coordinates), for parts reviewed for turning
  setups: { direction: string; features: string[] }[];
  operations: { setup: number; tool: string; features: string[]; faces: number[] }[]; // faces each tool cuts
  tools: Tool[];
  tool_changes: number;
  cost_drivers: CostDriver[]; // S7: counts above 0, ranked by score
}

export interface CostDriver {
  driver: string; // a key in config/drivers.toml
  label: string;
  count: number;
  weight: number;
  score: number; // count x weight
  weight_source: string; // "estimate" for every starting weight
}

export interface Passed {
  rule: string;
  feature: string | null; // null for turn_axis, which judges the whole part (S6)
  faces: number[];
  title: string;
  math: string;
  threshold_source: string;
}

export interface Tool {
  id: string; // "dr-0.2500", "dr-6.5mm", "em-0.250", "cs-82", "turn", "bore", "groove-0.125"
  kind: "drill" | "end_mill" | "countersink" | "turn" | "bore" | "groove" | string;
  diameter_in: number | null;
  width_in?: number; // a grooving tool's insert width (S6)
  undersized: boolean;
}

export type Severity = "high" | "medium" | "low";

export interface Feature {
  id: string;
  kind: string;
  faces: number[];
  axis: number[] | null;
  open_dirs: string[];
  open_vectors: number[][];
  dims_mm: Record<string, number>;
  outside?: boolean; // a groove: outside (true) or inside a bore (false), S6
  edge_mm?: number[][]; // a sharp corner's edge (two end points), drawn by the viewer (S3)
  thread?: string[]; // I1 S2: ids of the threads mapped to this hole or bore
  hole_feature?: string; // I2 S1: the first Hole feature mapped to this hole or bore
  blind?: boolean; // I2 S1: a bottom closes this hole segment
}

export interface Finding {
  id: string;
  rule: string;
  severity: Severity;
  title: string;
  measured: number;
  limit: number;
  unit: "in" | "ratio" | "deg" | "%";
  faces: number[];
  feature: string;
  threshold_source: string;
  suggestion: string;
  thread?: string; // thread_mismatch (I1 S2): the thread's id
  hole_feature?: string; // hole_mismatch (I2 S1): the Hole feature's id
  ipt_hole?: string; // hole_mismatch (I2 S1): the .ipt hole's id
}

export class ApiError extends Error {}

const GENERIC = "The analysis failed. Try again, or try another file.";

export async function analyze(file: File, ipt: File | null, process: Process, material: Material): Promise<Analysis> {
  const body = new FormData();
  body.append("file", file);
  if (ipt) body.append("ipt", ipt); // sent only when picked (I1)
  body.append("process", process);
  body.append("material", material);
  let response: Response;
  try {
    response = await fetch("/api/analyze", { method: "POST", body });
  } catch {
    throw new ApiError("The app isn't answering. Is `python -m dfma start` still running?");
  }
  if (response.ok) return (await response.json()) as Analysis;
  let message = GENERIC;
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string") message = data.error;
  } catch {
    // keep the generic message
  }
  throw new ApiError(message);
}
