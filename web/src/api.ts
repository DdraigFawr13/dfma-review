// POST /api/analyze (spec Flow and Response schema). Only the S1 fields are typed so far.

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
    units_in_file: "mm" | "inch" | "other";
    bbox_in: [number, number, number];
    face_count: number;
    volume_mm3: number;
    ignored_solids: number;
    not_analysed_faces: number[];
    frame: { x: number[]; y: number[]; z: number[] };
  };
  faces: Face[];
  findings: unknown[];
  assumptions: string[];
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
