// P1 spec prototype: feature volumes from dims and the mesh, against the exact removal (box - solid).
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { test } from "vitest";
import { analyze } from "../engine/analyze";
import { loadNodeOc } from "../engine/node";

const NIST = "../tests/nist/.cache/NIST-PMI-STEP-Files/";
const OUT = "../docs/research/removal-proto/volumes.jsonl";
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

test("volumes", async () => {
  const oc = await loadNodeOc();
  for (const name of readdirSync(NIST).filter((n) => n.endsWith(".stp")).sort()) {
    const t0 = performance.now();
    const a = analyze(oc, new Uint8Array(readFileSync(NIST + name)), name, "mill", "al6061") as any;
    const t1 = performance.now();
    const box = a.part.bbox_in.reduce((p: number, v: number) => p * v * 25.4, 1);
    const total = box - a.part.volume_mm3;
    let holes = 0, pockets = 0;
    for (const f of a.features) {
      if (f.kind === "hole") holes += Math.PI * (f.dims_mm.diameter / 2) ** 2 * f.dims_mm.depth;
      if (f.kind === "pocket") {
        let area = 0;
        for (const i of f.faces) {
          const { positions: p, indices: ix } = a.faces[i];
          for (let t = 0; t < ix.length; t += 3) {
            const v = [0, 1, 2].map((j) => [p[3 * ix[t + j]], p[3 * ix[t + j] + 1], p[3 * ix[t + j] + 2]]);
            const c = dot(cross(sub(v[1], v[0]), sub(v[2], v[0])), f.axis) / 2;
            if (c > 0) area += c;
          }
        }
        pockets += area * f.dims_mm.depth;
      }
    }
    const t2 = performance.now();
    appendFileSync(OUT, JSON.stringify({ name, total: Math.round(total), holes: Math.round(holes), pockets: Math.round(pockets),
      explained_pct: +((holes + pockets) / total * 100).toFixed(2), analyze_ms: Math.round(t1 - t0), volumes_ms: Math.round(t2 - t1) }) + "\n");
  }
});
