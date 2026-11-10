// Port of service/dfma/analyze.py (port spec Design "analyze.ts"). It always returns the full response shape;
// a key not ported yet holds what Python returns for a part with none of that kind, and `checks_not_run` names,
// in check-name wording, every rule not ported yet. S1 ports the read, the face kinds, the frame, the mesh,
// the part summary and the assumptions.
import type { Analysis, Material, Process } from "../api";
import { extentsMm, faceInfo, partFrame, type Vec } from "./frame";
import { meshFaces } from "./mesh";
import type { OC } from "./oc";
import { readStep } from "./read";
import { checkName, checksRun } from "./rows";
import { RULES } from "./rules/index";
import { ASSUMPTIONS, MATERIALS, MSG_NO_UNIT, MSG_OPEN_SHELL, PROCESSES, TURN_ASSUMPTIONS } from "./settings";
import { mmToIn, round } from "./units";

export type BrowserAnalysis = Analysis & { checks_not_run: string[] };

const IN_FILE = "/in.step";

/** The check names of the rules not ported yet for this process, in RULES order, each once. */
export function checksNotRun(process: Process): string[] {
  return [...new Set(RULES.filter((r) => !r.ported && r.PROCESSES.includes(process)).map((r) => checkName(r.ID)))];
}

export function analyze(oc: OC, step: Uint8Array, name: string, process: Process, material: Material,
  _ipt?: { bytes: Uint8Array; name: string }): BrowserAnalysis {
  // _ipt: accepted and ignored until S7 (the .ipt field is hidden in the browser copy, D-057).
  if (!(PROCESSES as readonly string[]).includes(process)) throw new Error(`unknown process ${process}`);
  if (!(MATERIALS as readonly string[]).includes(material)) throw new Error(`unknown material ${material}`);
  oc.FS.writeFile(IN_FILE, step);
  try {
    const part = readStep(oc, IN_FILE);
    const infos = part.faces.map((f, i) => faceInfo(oc, i, f));
    const meshes = meshFaces(oc, part.solid, part.faces);
    const vertices: Vec[] = [];
    for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) vertices.push([m.positions[i], m.positions[i + 1], m.positions[i + 2]]);
    const frame = partFrame(infos, vertices);
    const bboxIn = extentsMm(frame, vertices).map((e) => round(mmToIn(e), 6)) as [number, number, number];
    const rulesRun: string[] = []; // S2 on: the ported rules that ran
    const assumptions = [...ASSUMPTIONS, ...(process === "turn" ? TURN_ASSUMPTIONS : [])];
    if (part.freeEdges) assumptions.push(MSG_OPEN_SHELL.replace("{n}", String(part.freeEdges)));
    if (part.unitsInFile === "none") assumptions.push(MSG_NO_UNIT);
    return {
      part: {
        name,
        units_in_file: part.unitsInFile,
        bbox_in: bboxIn,
        face_count: part.faces.length,
        volume_mm3: part.volumeMm3,
        ignored_solids: part.ignoredSolids,
        // Torus and other faces; S4 leaves out those that belong to a pocket, as Python does.
        not_analysed_faces: infos.filter((f) => f.kind === "torus" || f.kind === "other").map((f) => f.id),
        frame: { x: [...frame.x], y: [...frame.y], z: [...frame.z] },
      },
      faces: infos.map((f, i) => ({ id: f.id, kind: f.kind, ...meshes[i] })),
      features: [],
      findings: [],
      rules_run: rulesRun,
      checks_run: checksRun(rulesRun),
      passed: [],
      rows: [],
      passed_rows: [],
      machine: null,
      turn_axis: null,
      stock: { shape: "block", size_in: bboxIn }, // S3 (and S6 for a bar)
      setups: [],
      operations: [],
      tools: [],
      tool_changes: 0,
      cost_drivers: [],
      cost_total: null,
      assumptions,
      checks_not_run: checksNotRun(process),
    };
  } finally {
    oc.FS.unlink(IN_FILE);
  }
}
