// Port of tests/inventor/nist_pair.py: analyse a NIST pair lined up by the test harness (spec I1 "Test files"). NIST's
// STEP files come from other CAD systems, so the app refuses every NIST pair (J2); here `register` finds the frame
// and the pair check is skipped, so the thread mapping can be tested and shown (labelled as such in the demo).
import type { Material, Process } from "../api";
import { analyze } from "../engine/analyze";
import { readIpt } from "../engine/inventor/part";
import type { OC } from "../engine/oc";
import { readStep } from "../engine/read";
import { register } from "./register";

export const DEMO_LABEL = "NIST pair lined up by the test harness; the app itself refuses this pair";

const PLAIN_IN = "/harness-plain.step";

/** [rows, shift] for the pair, from the STEP's holes and bores in a plain milling analysis. */
export async function transform(oc: OC, step: Uint8Array, stepName: string, ipt: Uint8Array): Promise<[number[][], number[]]> {
  const plain = analyze(oc, step, stepName, "mill", "al6061") as unknown as { features: { kind: string; faces: number[]; dims_mm: { diameter: number } }[] };
  const holes = plain.features.filter((f) => f.kind === "hole");
  oc.FS.writeFile(PLAIN_IN, step);
  try {
    const part = readStep(oc, PLAIN_IN);
    const read = await readIpt(ipt);
    if (read.error) throw read.error;
    return await register(oc, read.part, ipt, part, holes);
  } finally {
    oc.FS.unlink(PLAIN_IN);
  }
}

/** `analyze` with the .ipt lined up by `register` and no pair check (never the app path). */
export async function analyzeRegistered(oc: OC, step: Uint8Array, stepName: string, ipt: Uint8Array, iptName: string,
  process: Process = "mill", material: Material = "al6061"): Promise<object> {
  const t = await transform(oc, step, stepName, ipt);
  const read = await readIpt(ipt);
  if (read.error) throw read.error;
  return analyze(oc, step, stepName, process, material, { read, name: iptName }, { transform: t, check: false });
}

/** Python's repr of a str: single quotes, double when the text holds a single quote and no double quote. */
const quoted = (s: string): string => {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  return q + s.replace(/\\/g, "\\\\").replace(q === "'" ? /'/g : /"/g, "\\" + q) + q;
};

/** The thread lines nist_pair.py prints (Python's repr of each value). */
export function threadLines(r: { inventor: { threads: Record<string, unknown>[] }; findings: { rule: string; id: string; title: string }[] }): string[] {
  const py = (v: unknown): string => v === null || v === undefined ? "None" : typeof v === "number" && Number.isInteger(v) ? v.toFixed(1) : String(v);
  const out: string[] = [];
  for (const t of r.inventor.threads) {
    out.push([t.id, t.designation, t.class, t.depth_mm, t.tap_drill_mm, t.state, t.hole].map(py).join(" ")
      + ` [${(t.gaps as { text: string }[]).map((g) => quoted(g.text)).join(", ")}] ${py(t.reason)}`);
  }
  for (const f of r.findings) if (f.rule === "thread_mismatch") out.push(`${f.id} ${f.title}`);
  return out;
}
