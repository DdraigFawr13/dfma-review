// npm run demo-results (scripts/make_demo.py --engine browser): the browser engine's results in Node for the demo
// (D-056). DEMO_IN: a JSON list of {path (from the repo root), process, material}; DEMO_OUT: where to write
// {"<file name>|<process>|<material>": result}.
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { expect, test } from "vitest";
import type { Material, Process } from "../api";
import { analyzeOrRefuse, loadNodeOc } from "./node";

const ROOT = resolve(__dirname, "../../..");

test("demo results", async () => {
  const input = process.env.DEMO_IN, output = process.env.DEMO_OUT;
  expect(input && output, "set DEMO_IN and DEMO_OUT (scripts/make_demo.py does)").toBeTruthy();
  const jobs = JSON.parse(readFileSync(input!, "utf8")) as { path: string; process: Process; material: Material;
    ipt?: string; shown?: string; transform?: [number[][], number[]] }[];
  const oc = await loadNodeOc();
  const out: Record<string, object> = {};
  for (const j of jobs) {
    const name = j.shown ?? basename(j.path); // S7: a pair lined up by the test harness shows as "<stem> (lined up)"
    const ipt = j.ipt ? { bytes: new Uint8Array(readFileSync(resolve(ROOT, j.ipt))), name: basename(j.ipt) } : undefined;
    const harness = j.transform ? { transform: j.transform, check: false } : {};
    out[`${name}${ipt ? `+${ipt.name}` : ""}|${j.process}|${j.material}`] = await analyzeOrRefuse(oc,
      new Uint8Array(readFileSync(resolve(ROOT, j.path))), name, j.process, j.material, ipt, harness);
  }
  writeFileSync(output!, JSON.stringify(out));
  console.log(`demo results: ${jobs.length} analyses by the browser engine into ${output}`);
});
