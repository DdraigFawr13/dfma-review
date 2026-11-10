// POST /api/analyze (spec Flow and Response schema). Typed so far: the S1 to S5 fields.

export type Process = "mill" | "turn";
export type Material = "al6061" | "steel1018" | "ss304" | "plastic";

export interface Face {
  id: number;
  kind: "plane" | "cylinder" | "cone" | "torus" | "other";
  positions: number[]; // flat xyz, mm, file coordinates
  indices: number[]; // local to this face
  /** The browser copy only (port J3): the face's normals and edge lines, worked out in the worker so the page doesn't
   *  stall drawing a large part. The service's page works them out itself. Never compared with Python. */
  view?: { normals: Float32Array; edges: Float32Array };
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
  blends?: Blend[]; // I3 S3: always a list when an .ipt was read
}

type MapState = "matched" | "disagrees" | "not_mapped";

/** I3 S3 (spec I2+I3 "Response"): one fillet or chamfer from the .ipt, sizes as designed, mm. */
export interface Blend {
  id: string;
  feature_id: number;
  kind: "fillet" | "chamfer" | null; // null: its shape was not understood
  radius_mm: number | null;
  distances_mm: number[] | null; // chamfer: [d1, d2] (plane) or [radial, axial] (cone)
  angle_deg: number | null; // plane chamfer: the angle between its two neighbour faces
  faces: number;
  faces_mapped: number;
  copied_by: number[];
  state: MapState;
  step_faces: number[];
  gaps: { what: "radius"; mm: number; text: string }[];
  reason: string | null;
}

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
  checks_run: string[]; // review-steps S1: the check names of rules_run, in run order, each once
  passed: Passed[]; // D-023 proposed: each check a feature passed, with the math
  rows: Row[]; // review-steps S2: the findings grouped into the Features step's rows, Fix rows first
  passed_rows: Row[]; // review-steps S2: features with no finding, grouped by kind and check
  assumptions: string[];
  machine: string | null; // S5
  turn_axis: number[] | null;
  stock?: { shape: "bar" | "block"; diameter_in?: number; length_in?: number; size_in?: number[] }; // the part's own size // S6: the turning axis (file coordinates), for parts reviewed for turning
  setups: { direction: string; features: string[] }[];
  operations: { setup: number; tool: string; features: string[]; faces: number[] }[]; // faces each tool cuts
  tools: Tool[];
  tool_changes: number;
  cost_drivers: CostDriver[]; // S7: counts above 0, ranked by score
  cost_total: number | null; // review-steps S1: the sum of the scores to 0.1; null with no drivers
  checks_not_run?: string[]; // the browser copy only (port spec Design): checks this copy has not ported yet
  cost_partial?: boolean; // the browser copy only (D-061): a check that feeds a cost driver has not run
}

export interface CostDriver {
  driver: string; // a key in config/drivers.toml
  label: string;
  count: number;
  weight: number;
  score: number; // count x weight
  weight_source: string; // "estimate" for every starting weight
  findings: string[]; // review-steps S1: the F ids it counts; [] for setups, tools and small tools
}

export interface Passed {
  rule: string;
  feature: string | null; // null for turn_axis, which judges the whole part (S6)
  faces: number[];
  title: string;
  math: string;
  threshold_source: string;
  limit_text: string; // review-steps S1: the source in plain words ("limit is an estimate")
}

export interface Tool {
  id: string; // "dr-0.2500", "dr-6.5mm", "em-0.250", "cs-82", "turn", "bore", "groove-0.125"
  kind: "drill" | "end_mill" | "countersink" | "turn" | "bore" | "groove" | string;
  diameter_in: number | null;
  width_in?: number; // a grooving tool's insert width (S6)
  undersized: boolean;
}

export type Severity = "high" | "medium" | "low";

/** A Features step row (review-steps spec Design "Rows"): findings with the same rule, case, severity and limit, or
 *  the passed features of one kind and check. */
export interface Row {
  id: string; // "row:F4", or "row:pass-wall-thin_wall"
  rule: string;
  severity: "high" | "medium" | "ok";
  short: string; // "Sharp corner"
  count: number;
  findings: string[]; // F ids; [] for a passed row
  range: string; // "F4–F7", "F1 F2"
  sentence: string;
  check: string; // "Corner radius check"
  limit: string; // "limit is an estimate"
  features: string[];
  kind?: string; // a passed row's feature kind
}

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
  pocket?: string | null; // a corner's pocket (review-steps D-049: Machining shows it in that pocket's setup)
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
  feature: string | null; // null for a rule on the whole part (looks_turned, turn_axis)
  threshold_source: string;
  limit_text: string; // review-steps S1: the source in plain words
  check: string; // review-steps S1: "Hole depth check"
  suggestion: string;
  thread?: string; // thread_mismatch (I1 S2): the thread's id
  hole_feature?: string; // hole_mismatch (I2 S1): the Hole feature's id
  ipt_hole?: string; // hole_mismatch (I2 S1): the .ipt hole's id
  blend?: string; // blend_mismatch (I3 S3): the blend's id
}

/** A message for the reader; `retry` when trying again can help (no answer, a timeout, a server fault: audit F3). */
export class ApiError extends Error {
  constructor(message: string, readonly retry = false) {
    super(message);
  }
}

const GENERIC = "The analysis failed. Try again, or try another file.";

if (import.meta.env.VITE_ENGINE === "browser") void import("./engine-client").then((m) => m.prepareEngine());

/** VITE_ENGINE=browser (the static site, port spec Design "web/src/api.ts"): the engine runs in a worker in this
 *  page; nothing is sent anywhere. Otherwise the Python service at /api/analyze. */
export async function analyze(file: File, ipt: File | null, process: Process, material: Material): Promise<Analysis> {
  // The test build answers through /api/analyze when a browser test fakes the service with page.route (port S7:
  // tests/e2e/conftest.py sets the flag), so those tests check the browser copy's page on the same answers.
  const faked = import.meta.env.VITE_TEST === "1" && (window as unknown as { __dfmaFakeService?: boolean }).__dfmaFakeService === true;
  if (import.meta.env.VITE_ENGINE === "browser" && !faked) {
    const { analyzeInBrowser, EngineError } = await import("./engine-client");
    try {
      return await analyzeInBrowser(file, ipt, process, material);
    } catch (e) {
      if (e instanceof EngineError) throw new ApiError(e.message, e.retry);
      throw new ApiError(GENERIC, true);
    }
  }
  const body = new FormData();
  body.append("file", file);
  if (ipt) body.append("ipt", ipt); // sent only when picked (I1)
  body.append("process", process);
  body.append("material", material);
  let response: Response;
  try {
    response = await fetch("/api/analyze", { method: "POST", body });
  } catch {
    throw new ApiError("The app isn't answering on this computer. Ask whoever set up DFMA Review to start it again.", true);
  }
  if (response.ok) return (await response.json()) as Analysis;
  let message = GENERIC;
  let retry = response.status >= 500;
  try {
    const data = (await response.json()) as { error?: unknown; retry?: unknown };
    if (typeof data.error === "string") message = data.error;
    if (data.retry === true) retry = true; // a timeout (audit F3)
  } catch {
    // keep the generic message
  }
  throw new ApiError(message, retry || message === GENERIC);
}
