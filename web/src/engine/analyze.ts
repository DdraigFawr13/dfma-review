// Port of service/dfma/analyze.py (port spec Design "analyze.ts"). It always returns the full response shape;
// `checks_not_run` names, in check-name wording, every rule not ported yet. S1 ported the read, the face kinds, the
// frame, the mesh, the part summary and the assumptions; S2 the holes and the hole rules; S3 the mill plan and the cost
// drivers; S4 the pockets, corners and undercuts; S5 the walls and thin_wall; S6 the turning axis, bores, grooves, the
// turned profile, the turn rules and the lathe plan (turning.ts), and looks_turned on Milling; S7 the .ipt: its reading
// (inventor/), the pair checks, the thread, Hole feature and blend mapping and the three .ipt rules.
import type { Analysis, Material, Process } from "../api";
import { extentsMm, faceInfo, partFrame, turningAxis, type Vec } from "./frame";
import { meshFaces } from "./mesh";
import type { OC } from "./oc";
import { readStep } from "./read";
import { holes, number, Topology } from "./features/holes";
import { linkCorners, pockets } from "./features/pockets";
import { holeWalls, walls } from "./features/walls";
import { grooves, holeOffAxis, pocketOnAxis, profileFeature, splitBores, turnedProfile } from "./features/turned";
import { plan as lathePlan } from "./turning";
import { checkName, checksRun, costTotal, findingRows, limitText, passedRows } from "./rows";
import { costDrivers, driverRules } from "./drivers";
import { plan, type Plan } from "./plan";
import { RULES } from "./rules/index";
import type { Feature, PartSummary } from "./rules/types";
import { ASSUMPTIONS, MATERIALS, MSG_NO_UNIT, MSG_OPEN_SHELL, PROCESSES, thresholds, TURN_ASSUMPTIONS } from "./settings";
import { mmToIn, round } from "./units";
import type { IptRead } from "./inventor/part";
import { checkPair, checkPartType, inventorBlock, pairReason } from "./inventor/pair";
import { mapThreads, type StepHole, type Transform } from "./inventor/threads";
import { mapHoles } from "./inventor/holes";
import { mapBlends } from "./inventor/blends";
import { IPT_ASSUMPTION } from "./settings";

export type BrowserAnalysis = Analysis & { checks_not_run: string[]; cost_partial: boolean };

const IN_FILE = "/in.step";
const TURN_NEEDS_AXIS = ["turn_slender", "turn_offaxis", "bore_depth"];
const NEEDS_IPT = ["thread_mismatch", "hole_mismatch", "blend_mismatch"]; // runs only when an .ipt was read

/** The test harness's options (tests/inventor/nist_pair.py: a NIST pair lined up by `register`, no pair check); the
 *  app never passes them. */
export interface Harness { transform?: Transform; check?: boolean }

/** A rule config/drivers.toml maps to a driver is not ported yet for this process: the cost total is partial (D-061). */
export function costPartial(process: Process): boolean {
  const feeds = driverRules();
  return RULES.some((r) => !r.ported.includes(process) && r.PROCESSES.includes(process) && feeds.includes(r.ID));
}

/** The check names of the rules not ported yet for this process, in RULES order, each once. */
export function checksNotRun(process: Process): string[] {
  return [...new Set(RULES.filter((r) => !r.ported.includes(process) && r.PROCESSES.includes(process)).map((r) => checkName(r.ID)))];
}

/** `ipt` is the .ipt read beforehand (inventor/part.ts readIpt, which is asynchronous) and its file name. */
export function analyze(oc: OC, step: Uint8Array, name: string, process: Process, material: Material,
  ipt?: { read: IptRead; name: string }, harness: Harness = {}): BrowserAnalysis {
  if (!(PROCESSES as readonly string[]).includes(process)) throw new Error(`unknown process ${process}`);
  if (!(MATERIALS as readonly string[]).includes(material)) throw new Error(`unknown material ${material}`);
  oc.FS.writeFile(IN_FILE, step);
  try {
    const part = readStep(oc, IN_FILE);
    let inventor: ReturnType<typeof inventorBlock> & Record<string, unknown> | null = null;
    const iptPart = ipt?.read.part;
    if (ipt !== undefined) { // the .ipt beside its STEP; checks before any analysis (spec I1 Builder defaults)
      if (ipt.read.error) throw ipt.read.error;
      checkPartType(iptPart!, part);
      const checks = harness.check === false ? pairReason(oc, iptPart!, part)[1] : checkPair(oc, iptPart!, part);
      inventor = inventorBlock(iptPart!, ipt.name, checks);
    }
    const infos = part.faces.map((f, i) => faceInfo(oc, i, f));
    const meshes = meshFaces(oc, part.solid, part.faces);
    const vertices: Vec[] = [];
    for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) vertices.push([m.positions[i], m.positions[i + 1], m.positions[i + 2]]);
    const frame = partFrame(infos, vertices);
    const bboxIn = extentsMm(frame, vertices).map((e) => round(mmToIn(e), 6)) as [number, number, number];
    // Holes, then pockets (skipping hole faces), then walls between planar faces and at holes (analyze.py)
    let holeList = holes(oc, part.solid, part.faces, frame);
    const holeFaces = new Set(holeList.flatMap((f) => f.faces));
    const [rawPockets, rawCorners] = pockets(oc, part.solid, part.faces, frame, holeFaces);
    const wallList = [...walls(oc, part.solid, part.faces), ...holeWalls(oc, part.solid, part.faces, holeList)];
    const pocketList = number(rawPockets, "pocket");
    const cornerList = number(rawCorners, "corner");
    linkCorners(pocketList, cornerList);
    // S6: the turning axis, for Turning and, on Milling, for looks_turned (D-028)
    const topo = new Topology(oc, part.solid, part.faces);
    const turn = turnedProfile(topo, infos.map((f) => f.area), vertices, turningAxis(infos, vertices));
    let turnFeatures: Feature[] | null = null;
    if (process === "turn" && turn.diameter !== undefined) { // spec Features "Turned profile", "Groove", "Bore"
      const [kept, bores, renamed] = splitBores(topo, holeList, turn);
      holeList = kept;
      for (const w of wallList) if (w.hole !== undefined) w.hole = renamed.get(w.hole)!; // a wall at a hole names it by its new id
      const taken = new Set([...kept, ...bores].flatMap((f) => f.faces));
      const grooveList = number(grooves(topo, turn, taken), "groove");
      for (const i of [...grooveList, ...pocketList].flatMap((f) => f.faces)) taken.add(i);
      const profile = { id: "profile-1", ...profileFeature(topo, turn, taken) };
      for (const f of [...kept, ...bores, ...pocketList] as unknown as (Record<string, unknown> & { faces: number[]; kind: string })[]) {
        delete f.on_axis; // recorded instead as the angle and offset turn_offaxis reads
        [f.off_axis_deg, f.off_axis_mm] = f.kind === "pocket"
          ? pocketOnAxis(oc, f as unknown as { faces: number[]; axis: number[] }, part.faces, turn)
          : holeOffAxis(topo, f, turn);
      }
      turnFeatures = [...bores, ...grooveList, profile] as unknown as Feature[];
    }
    if (inventor !== null) { // threads onto the final holes and bores, before the rules; then Hole features, blends
      const stepHoles = [...holeList, ...(turnFeatures ?? []).filter((f) => f.kind === "bore")] as unknown as StepHole[];
      inventor.threads = mapThreads(topo, iptPart!.threads, stepHoles, harness.transform);
      inventor.hole_features = mapHoles(topo, iptPart!.hole_features, stepHoles, harness.transform);
      inventor.hole_names_seen = iptPart!.hole_names_seen; // "<n> Hole features in the browser, <m> read"
      inventor.blends = mapBlends(topo, iptPart!.blends, harness.transform);
    }
    const features = [...holeList, ...(turnFeatures ?? []), ...pocketList, ...cornerList, ...number(wallList, "wall")] as unknown as Feature[];
    const pocketFaces = new Set(pocketList.flatMap((f) => f.faces));
    const summary: PartSummary = { units_in_file: part.unitsInFile, frame, turn, face_count: part.faces.length };
    if (inventor !== null) {
      summary.inventor_threads = inventor.threads as PartSummary["inventor_threads"];
      summary.inventor_holes = inventor.hole_features as PartSummary["inventor_holes"];
      summary.inventor_blends = inventor.blends as PartSummary["inventor_blends"];
    }
    const limits = thresholds(material);
    const rules = RULES.filter((r) => r.module && r.ported.includes(process) && r.PROCESSES.includes(process)
      && !(TURN_NEEDS_AXIS.includes(r.ID) && turnFeatures === null) // no axis: only the shared rules
      && !(NEEDS_IPT.includes(r.ID) && inventor === null));
    const raw = rules.flatMap((r) => r.module!.check(features, summary, limits));
    const findings = raw.map((f, n) => ({ id: `F${n + 1}`, ...f, check: checkName(f.rule), limit_text: limitText(f.threshold_source) }));
    const passed = rules.flatMap((r) => (r.module!.passes ? r.module!.passes(features, summary, limits) : []))
      .map((p) => ({ ...p, limit_text: limitText(p.threshold_source) }));
    const rulesRun = rules.map((r) => r.ID);
    type NoPlan = { machine: null; setups: []; operations: []; tools: []; tool_changes: 0 };
    const milled: Plan | NoPlan = process === "mill"
      ? plan(features, findings as { rule: string; feature?: string | null }[], frame, part.unitsInFile)
      : turnFeatures !== null
        ? lathePlan(features, findings as { rule: string }[], part.unitsInFile)
        : { machine: null, setups: [], operations: [], tools: [], tool_changes: 0 }; // turned, but no turning axis: nothing to plan
    const drivers = costDrivers(findings as unknown as { id: string; rule: string }[], milled.setups, milled.tools);
    const assumptions = [...ASSUMPTIONS, ...(process === "turn" ? TURN_ASSUMPTIONS : [])];
    if (part.freeEdges) assumptions.push(MSG_OPEN_SHELL.replace("{n}", String(part.freeEdges)));
    if (part.unitsInFile === "none") assumptions.push(MSG_NO_UNIT);
    if (inventor !== null) assumptions.push(IPT_ASSUMPTION);
    const result: BrowserAnalysis = {
      part: {
        name,
        units_in_file: part.unitsInFile,
        bbox_in: bboxIn,
        face_count: part.faces.length,
        volume_mm3: part.volumeMm3,
        ignored_solids: part.ignoredSolids,
        // Torus and other faces, except those that belong to a pocket (as Python).
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
      turn_axis: turnFeatures !== null ? [...turn.axis!] : null,
      // The stock in the machine plan: the part's own size, no allowance added (Morgan, 2026-11-08)
      stock: turnFeatures !== null
        ? { shape: "bar", diameter_in: round(mmToIn(turn.diameter!), 6), length_in: round(mmToIn(turn.length!), 6) }
        : { shape: "block", size_in: bboxIn },
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
    if (inventor !== null) (result as unknown as Record<string, unknown>).inventor = inventor;
    return result;
  } finally {
    oc.FS.unlink(IN_FILE);
  }
}
