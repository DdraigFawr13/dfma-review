// Port of service/dfma/turning.py (port spec S6): the lathe plan. One setup, `turn`; operations in order turn, on-axis
// drills, bore, groove, then each off-axis feature as a milling operation (pocketTools or a drill); the machine is
// "lathe", or "lathe with live tooling" if turn_offaxis fired. One operation per tool, so tool loads are the number of
// operations.
import { holeTool, pocketTools, rank, slotTools, stepTools, type Operation, type Plan, type Tool } from "./plan";
import { offAxis } from "./rules/turn_offaxis";
import type { Feature } from "./rules/types";
import { toolsConfig } from "./settings";
import { MM_PER_IN, pyFixed } from "./units";

export const MACHINE_LATHE = "lathe";
export const MACHINE_LIVE = "lathe with live tooling";
// D-029: the outside and each bore are roughed, then finished with a second tool
const TURN_TOOLS: Tool[] = ["rough", "finish"].map((r) => ({ id: `turn-${r}`, kind: "turn", diameter_in: null, undersized: false }));
const BORE_TOOLS: Tool[] = ["rough", "finish"].map((r) => ({ id: `bore-${r}`, kind: "bore", diameter_in: null, undersized: false }));

/** The widest grooving insert that fits the groove; the narrowest, undersized, when none fits. */
export function grooveTool(widthMm: number): Tool {
  const widths = [...((toolsConfig().turning as Record<string, number[]>).groove_widths_in)].sort((a, b) => a - b);
  const fits = widths.filter((w) => w * MM_PER_IN <= widthMm + 1e-3);
  const w = fits.length ? fits[fits.length - 1] : widths[0];
  return { id: `groove-${pyFixed(w, 3)}`, kind: "groove", diameter_in: null, width_in: w, undersized: !fits.length };
}

function cmp(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/** machine, setups, operations, tools and tool_changes for a turned part (a profile was found). */
export function plan(features: Feature[], findings: { rule: string }[], unitsInFile: string): Plan {
  const jobs: [number, string, Tool, number[]][] = []; // stage, feature id, tool, faces
  for (const f of features) {
    if (f.kind === "profile") jobs.push(...TURN_TOOLS.map((t): [number, string, Tool, number[]] => [0, f.id, t, f.faces]));
    else if (f.kind === "bore") jobs.push(...BORE_TOOLS.map((t): [number, string, Tool, number[]] => [2, f.id, t, f.faces]));
    else if (f.kind === "groove") jobs.push([3, f.id, grooveTool(f.dims_mm.width), f.faces]);
    else if ((f.kind === "hole" || f.kind === "pocket" || f.kind === "step" || f.kind === "slot") && f.open_vectors?.length) {
      const stage = f.kind === "hole" && !offAxis(f) ? 1 : 4; // a step is milled after turning, as a pocket
      for (const tool of f.kind === "hole" ? [holeTool(f, unitsInFile)] : f.kind === "step" ? stepTools(f) : f.kind === "slot" ? slotTools(f) : pocketTools(f)) jobs.push([stage, f.id, tool, f.faces]);
    }
  }
  const ops = new Map<string, Operation>();
  const stageOf = new Map<string, (number | string)[]>();
  const tools = new Map<string, Tool>();
  const members: string[] = [];
  for (const [stage, fid, tool, faces] of jobs) {
    if (!tools.has(tool.id)) tools.set(tool.id, tool);
    if (!stageOf.has(tool.id)) stageOf.set(tool.id, [stage, ...rank(tool).slice(0, 2), stageOf.size]); // rough before finish
    if (!ops.has(tool.id)) ops.set(tool.id, { setup: 0, tool: tool.id, features: [], faces: [] });
    const op = ops.get(tool.id)!;
    op.features.push(fid);
    op.faces = [...new Set([...op.faces, ...faces])].sort((a, b) => a - b);
    if (!members.includes(fid)) members.push(fid);
  }
  const operations = [...ops.values()].sort((a, b) => cmp(stageOf.get(a.tool)!, stageOf.get(b.tool)!));
  const live = findings.some((f) => f.rule === "turn_offaxis");
  return {
    machine: live ? MACHINE_LIVE : MACHINE_LATHE,
    setups: [{ direction: "turn", features: members }],
    operations,
    tools: operations.map((o) => tools.get(o.tool)!),
    tool_changes: operations.length,
  };
}
