// POST /api/analyze (spec Flow and Response schema). Typed so far: the S1 to S5 fields.

export type Process = "mill" | "turn";
export type Material = "al6061" | "steel1018" | "ss304" | "plastic";

export interface Face {
  id: number;
  kind: "plane" | "cylinder" | "cone" | "torus" | "other";
  positions: number[]; // flat xyz, mm, file coordinates
  indices: number[]; // local to this face
}

export interface Analysis {
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
  turn_axis: number[] | null; // S6: the turning axis (file coordinates), for parts reviewed for turning
  setups: { direction: string; features: string[] }[];
  operations: { setup: number; tool: string; features: string[]; faces: number[] }[]; // faces each tool cuts
  tools: Tool[];
  tool_changes: number;
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
  edge_mm?: number[][]; // a sharp corner's edge (two end points), drawn by the viewer (S3)
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
}

export class ApiError extends Error {}

const GENERIC = "The analysis failed. Try again, or try another file.";

export async function analyze(file: File, process: Process, material: Material): Promise<Analysis> {
  const body = new FormData();
  body.append("file", file);
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
