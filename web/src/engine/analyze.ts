// Port of service/dfma/analyze.py (port spec Design "analyze.ts"). It always returns the full response shape;
// a key not ported yet holds what Python returns for a part with none of that kind, and `checks_not_run` names,
// in check-name wording, every rule not ported yet. S1 ported the read, the face kinds, the frame, the mesh, the part
// summary and the assumptions; S2 the holes and the hole rules (hole_depth, hole_size, access) with their rows, on
// Milling only (a turned part's holes split into holes and bores first: S6); S3 the mill plan and the cost drivers
// (a turned part's plan is turning.plan: S6); S4 the pockets, corners and undercuts with their rules, on Milling
// (a turned part's pockets feed its profile and off-axis checks: S6).
import type { Analysis, Material, Process } from "../api";
import { extentsMm, faceInfo, partFrame, type Vec } from "./frame";
import { meshFaces } from "./mesh";
import type { OC } from "./oc";
import { readStep } from "./read";
import { holes, number } from "./features/holes";
import { linkCorners, pockets } from "./features/pockets";
import { checkName, checksRun, costTotal, findingRows, limitText, passedRows } from "./rows";
import { costDrivers, driverRules } from "./drivers";
import { plan, type Plan } from "./plan";
import { RULES } from "./rules/index";
import type { Feature, PartSummary } from "./rules/types";
import { ASSUMPTIONS, MATERIALS, MSG_NO_UNIT, MSG_OPEN_SHELL, PROCESSES, thresholds, TURN_ASSUMPTIONS } from "./settings";
import { mmToIn, round } from "./units";

export type BrowserAnalysis = Analysis & { checks_not_run: string[]; cost_partial: boolean };

const IN_FILE = "/in.step";

/** A rule config/drivers.toml maps to a driver is not ported yet for this process: the cost total is partial (D-061). */
export function costPartial(process: Process): boolean {
  const feeds = driverRules();
  return RULES.some((r) => !r.ported.includes(process) && r.PROCESSES.includes(process) && feeds.includes(r.ID));
}

/** The check names of the rules not ported yet for this process, in RULES order, each once. */
export function checksNotRun(process: Process): string[] {
  return [...new Set(RULES.filter((r) => !r.ported.includes(process) && r.PROCESSES.includes(process)).map((r) => checkName(r.ID)))];
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
    // S2: holes and the hole rules, on Milling (rules_run lists the ported rules that ran, in RULES order)
    const holeList = process === "mill" ? holes(oc, part.solid, part.faces, frame) : [];
    // S4: pockets and corners, after the holes whose faces they skip (analyze.py); walls follow in S5
    const holeFaces = new Set(holeList.flatMap((f) => f.faces));
    const [rawPockets, rawCorners] = process === "mill" ? pockets(oc, part.solid, part.faces, frame, holeFaces) : [[], []];
    const pocketList = number(rawPockets, "pocket");
    const cornerList = number(rawCorners, "corner");
    linkCorners(pocketList, cornerList);
    const features = [...holeList, ...pocketList, ...cornerList] as unknown as Feature[];
    const pocketFaces = new Set(pocketList.flatMap((f) => f.faces));
    const summary: PartSummary = { units_in_file: part.unitsInFile, frame, face_count: part.faces.length };
    const limits = thresholds(material);
    const rules = RULES.filter((r) => r.module && r.ported.includes(process) && r.PROCESSES.includes(process));
    const raw = rules.flatMap((r) => r.module!.check(features, summary, limits));
    const findings = raw.map((f, n) => ({ id: `F${n + 1}`, ...f, check: checkName(f.rule), limit_text: limitText(f.threshold_source) }));
    const passed = rules.flatMap((r) => (r.module!.passes ? r.module!.passes(features, summary, limits) : []))
      .map((p) => ({ ...p, limit_text: limitText(p.threshold_source) }));
    const rulesRun = rules.map((r) => r.ID);
    const milled: Plan | { machine: null; setups: []; operations: []; tools: []; tool_changes: 0 } = process === "mill"
      ? plan(features, findings as { rule: string; feature?: string | null }[], frame, part.unitsInFile)
      : { machine: null, setups: [], operations: [], tools: [], tool_changes: 0 }; // turning.plan: S6
    const drivers = costDrivers(findings as unknown as { id: string; rule: string }[], milled.setups, milled.tools);
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
        // Torus and other faces, except those that belong to a pocket (S4, as Python; a turned part's pockets: S6).
        not_analysed_faces: infos.filter((f) => (f.kind === "torus" || f.kind === "other") && !pocketFaces.has(f.id)).map((f) => f.id),
        frame: { x: [...frame.x], y: [...frame.y], z: [...frame.z] },
      },
      faces: infos.map((f, i) => ({ id: f.id, kind: f.kind, ...meshes[i] })),
      // The rule modules build plain objects, as the Python dicts; parity checks their shape against the key.
      features: features as unknown as Analysis["features"],
      findings: findings as unknown as Analysis["findings"],
      rules_run: rulesRun,
      checks_run: checksRun(rulesRun),
      passed: passed as unknown as Analysis["passed"],
      rows: findingRows(findings) as unknown as Analysis["rows"],
      passed_rows: passedRows(features, findings, passed) as unknown as Analysis["passed_rows"],
      machine: milled.machine,
      turn_axis: null, // S6
      stock: { shape: "block", size_in: bboxIn }, // the part's own size, no allowance (a bar: S6)
      setups: milled.setups,
      operations: milled.operations,
      tools: milled.tools as Analysis["tools"],
      tool_changes: milled.tool_changes,
      cost_drivers: drivers,
      cost_total: costTotal(drivers),
      assumptions,
      checks_not_run: checksNotRun(process),
      cost_partial: costPartial(process),
    };
  } finally {
    oc.FS.unlink(IN_FILE);
  }
}
