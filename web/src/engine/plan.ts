// Port of service/dfma/plan.py (port spec S3): the mill plan: setups, machine, operations, tools and tool changes.
// Setups are the smallest set of directions (+-X +-Y +-Z of the part frame) that reaches every hole and pocket the
// `access` rule did not flag, by brute force over the 63 non-empty subsets; ties go to the subset whose directions
// come first in the order +Z -Z +X -X +Y -Y. A countersink (D-022) is cut from its own end, so each countersunk end is
// one more thing to reach, in that end's direction only. Pockets reach the plan in S4; their tools are ported here.
import { frameDir, type Frame } from "./features/holes";
import type { Feature } from "./rules/types";
import { toolsConfig } from "./settings";
import { endMillsMm, matchToleranceMm, nearestDrill, PICK_TOL_MM, pickEndMill, type Drill } from "./tools";
import { MM_PER_IN, pyFixed, pyG, round } from "./units";

export const ORDER = ["+Z", "-Z", "+X", "-X", "+Y", "-Y"] as const;
export const MACHINE_3AXIS = "3-axis mill";
export const MACHINE_MULTI = "4/5-axis mill or fixture";

export interface Tool { id: string; kind: "drill" | "end_mill" | "countersink"; diameter_in: number | null; undersized: boolean }
export interface Operation { setup: number; tool: string; features: string[]; faces: number[] }
export interface Setup { direction: string; features: string[] }
export interface Plan { machine: string; setups: Setup[]; operations: Operation[]; tools: Tool[]; tool_changes: number }

/** Index subsets of size k in lexicographic order, as itertools.combinations(range(n), k). */
function* combinations(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield [...idx];
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/** The smallest subset of ORDER meeting every need (a need is met by any one of its directions), the first such
 *  subset in ORDER position by position on a tie; [+Z] when nothing needs a setup. */
export function cover(needs: Set<string>[]): string[] {
  const real = needs.filter((n) => n.size);
  if (!real.length) return ["+Z"];
  for (let size = 1; size <= ORDER.length; size++) {
    for (const combo of combinations(ORDER.length, size)) {
      const dirs = new Set<string>(combo.map((i) => ORDER[i]));
      if (real.every((n) => [...n].some((d) => dirs.has(d)))) return combo.map((i) => ORDER[i]);
    }
  }
  throw new Error("every need holds a direction in ORDER");
}

function drillId(drill: Drill): string {
  return drill.metric ? `dr-${pyG(drill.diameter_mm)}mm` : `dr-${pyFixed(drill.diameter_mm / MM_PER_IN, 4)}`;
}

function millId(dMm: number): string {
  return `em-${pyFixed(dMm / MM_PER_IN, 3)}`;
}

/** The matching drill, or pickEndMill(hole radius, hole diameter) when no drill matches (spec Plan). */
function holeTool(f: Feature, units: string): Tool {
  const d = f.dims_mm.diameter;
  const drill = nearestDrill(d, units);
  if (Math.abs(drill.diameter_mm - d) <= matchToleranceMm() + 1e-9) {
    return { id: drillId(drill), kind: "drill", diameter_in: round(drill.diameter_mm / MM_PER_IN, 6), undersized: false };
  }
  const [mill, undersized] = pickEndMill(d / 2, d);
  return { id: millId(mill), kind: "end_mill", diameter_in: round(mill / MM_PER_IN, 6), undersized };
}

/** D-029: a roughing end mill for a pocket: the largest at most `pocket_width_share` of its narrowest width, when that
 *  is larger than the finishing tool. null for a pocket with no width to size it by, or when one tool does both. */
function roughTool(f: Feature): Tool | null {
  const width = f.dims_mm.narrowest_width;
  if (width === undefined || width === null) return null;
  const share = (toolsConfig().roughing as Record<string, number>).pocket_width_share;
  const fits = endMillsMm().filter((d) => d <= share * width + PICK_TOL_MM);
  if (!fits.length || fits[fits.length - 1] <= f.dims_mm.end_mill_mm + 1e-6) return null;
  const d = fits[fits.length - 1];
  return { id: millId(d), kind: "end_mill", diameter_in: round(d / MM_PER_IN, 6), undersized: false };
}

function pocketTool(f: Feature): Tool {
  const mill = f.dims_mm.end_mill_mm;
  return { id: millId(mill), kind: "end_mill", diameter_in: round(mill / MM_PER_IN, 6), undersized: !!(f.dims_mm.undersized ?? 0) };
}

/** A pocket's tools in the order they cut: the roughing end mill (D-029), then the finishing one. */
export function pocketTools(f: Feature): Tool[] {
  const rough = roughTool(f);
  return [...(rough ? [rough] : []), pocketTool(f)];
}

function countersinkTool(deg: number): Tool {
  return { id: `cs-${pyG(deg)}`, kind: "countersink", diameter_in: null, undersized: false };
}

type Rank = [number, number, string];
/** Within a setup: end mills largest to smallest, then drills smallest to largest, then countersinks by angle. */
function rank(tool: Tool): Rank {
  if (tool.kind === "end_mill") return [0, -tool.diameter_in!, tool.id];
  if (tool.kind === "drill") return [1, tool.diameter_in!, tool.id];
  return [2, 0.0, tool.id];
}

function cmp(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/** machine, setups, operations, tools and tool_changes for a mill part. */
export function plan(features: Feature[], findings: { rule: string; feature?: string | null }[], frame: Frame, unitsInFile: string): Plan {
  const flagged = new Set(findings.filter((f) => f.rule === "access").map((f) => f.feature));
  const jobs: [string, Set<string>, Tool, number[]][] = []; // feature id, the directions it can be cut from, tool, its faces
  for (const f of features) {
    if ((f.kind !== "hole" && f.kind !== "pocket") || flagged.has(f.id) || !f.open_dirs?.length) continue;
    for (const tool of f.kind === "hole" ? [holeTool(f, unitsInFile)] : pocketTools(f)) jobs.push([f.id, new Set(f.open_dirs), tool, f.faces]);
    const vecs: number[][] = f.countersink_vectors ?? [], degs: number[] = f.countersink_degs ?? [], cones: number[][] = f.countersink_end_faces ?? [];
    for (let i = 0; i < Math.min(vecs.length, degs.length, cones.length); i++) {
      const d = frameDir(vecs[i] as [number, number, number], frame);
      if (d) jobs.push([f.id, new Set([d]), countersinkTool(degs[i]), cones[i]]);
    }
  }
  const setups = cover(jobs.map(([, dirs]) => dirs));
  const members: string[][] = setups.map(() => []);
  const ops = new Map<string, Operation>();
  const toolList = new Map<string, Tool>();
  for (const [fid, dirs, tool, faces] of jobs) {
    const k = setups.findIndex((d) => dirs.has(d));
    if (!members[k].includes(fid)) members[k].push(fid);
    if (!toolList.has(tool.id)) toolList.set(tool.id, tool);
    const key = `${k}\0${tool.id}`;
    if (!ops.has(key)) ops.set(key, { setup: k, tool: tool.id, features: [], faces: [] });
    const op = ops.get(key)!;
    if (!op.features.includes(fid)) op.features.push(fid);
    op.faces = [...new Set([...op.faces, ...faces])].sort((a, b) => a - b);
  }
  const operations = [...ops.values()].sort((a, b) => cmp([a.setup, ...rank(toolList.get(a.tool)!)], [b.setup, ...rank(toolList.get(b.tool)!)]));
  const used = [...new Set(operations.map((o) => o.tool))];
  return {
    machine: flagged.size ? MACHINE_MULTI : MACHINE_3AXIS,
    setups: setups.map((d, i) => ({ direction: d, features: members[i] })),
    operations,
    tools: used.map((t) => toolList.get(t)!),
    tool_changes: operations.length,
  };
}
