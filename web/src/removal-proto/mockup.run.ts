// P1 mock-up numbers (throwaway, not app code): the spec's removal formula (Design "P1: removal") on the parts the
// mock-up shows. cd web && npx vitest run --config vitest.spike.config.ts src/removal-proto/mockup.run.ts
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import { analyze } from "../engine/analyze";
import { loadNodeOc } from "../engine/node";

const PARTS = [["../tests/parts/clean_pocket.step", "mill"], ["../tests/parts/report_sample.step", "mill"],
  ["../tests/nist/.cache/NIST-PMI-STEP-Files/nist_ctc_01_asme1_ap242-e1.stp", "mill"]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

test("mock-up numbers", async () => {
  const oc = await loadNodeOc();
  const out: unknown[] = [];
  for (const [path, process] of PARTS) {
    const a = analyze(oc, new Uint8Array(readFileSync(path)), path.split("/").pop()!, process as "mill", "al6061") as any;
    const stock = a.part.bbox_in.reduce((p: number, v: number) => p * v * 25.4, 1);
    const total = stock - a.part.volume_mm3;
    const feats: { feature: string; volume_mm3: number }[] = [];
    for (const f of a.features) {
      if (f.kind === "hole") feats.push({ feature: f.id, volume_mm3: Math.PI * (f.dims_mm.diameter / 2) ** 2 * f.dims_mm.depth });
      if (f.kind === "pocket") {
        const tris: { v: number[][]; c: number }[] = [];
        let low = Infinity;
        for (const i of f.faces) {
          const { positions: p, indices: ix } = a.faces[i];
          for (let t = 0; t < ix.length; t += 3) {
            const v = [0, 1, 2].map((j) => [p[3 * ix[t + j]], p[3 * ix[t + j] + 1], p[3 * ix[t + j] + 2]]);
            for (const x of v) low = Math.min(low, dot(x, f.axis));
            tris.push({ v, c: dot(cross(sub(v[1], v[0]), sub(v[2], v[0])), f.axis) / 2 });
          }
        }
        // floor: facing along the axis, highest vertex within 0.01 mm of the lowest point (floor fillets left out here)
        const area = tris.filter((t) => t.c > 0 && Math.max(...t.v.map((x) => dot(x, f.axis))) <= low + 0.01).reduce((s, t) => s + t.c, 0);
        feats.push({ feature: f.id, volume_mm3: area * f.dims_mm.depth });
      }
    }
    const sum = feats.reduce((s, f) => s + f.volume_mm3, 0);
    const explained = Math.min(sum, total);
    out.push({ name: a.part.name, bbox_in: a.part.bbox_in, stock_mm3: stock, part_mm3: a.part.volume_mm3, total_mm3: total, features: feats,
      unexplained_mm3: total - explained, unexplained_pct: total ? (total - explained) / total * 100 : 0, stock_text: a.stock });
  }
  writeFileSync("../mockups/p1-removal/numbers.json", JSON.stringify(out, null, 1));
});
