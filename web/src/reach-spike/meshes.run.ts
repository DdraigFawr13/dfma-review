// Reach spike (D-085 step 1): mesh every NIST AP242 STEP file with the app's own reader and mesher, and save each
// triangle soup to tests/nist/.cache/reach-spike/ (gitignored) for the height-map timing. Not part of `npm run check`.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import { meshFaces } from "../engine/mesh";
import { loadNodeOc } from "../engine/node";
import { readStep } from "../engine/read";

const NIST = "../tests/nist/.cache/NIST-PMI-STEP-Files/";
const OUT = "../tests/nist/.cache/reach-spike/";

test("mesh NIST parts", async () => {
  const oc = await loadNodeOc();
  mkdirSync(OUT, { recursive: true });
  const rows: object[] = [];
  for (const name of readdirSync(NIST).filter((n) => n.endsWith(".stp")).sort()) {
    oc.FS.writeFile("/in.stp", new Uint8Array(readFileSync(NIST + name)));
    const t0 = performance.now();
    const part = readStep(oc, "/in.stp");
    const t1 = performance.now();
    const meshes = meshFaces(oc, part.solid, part.faces);
    const t2 = performance.now();
    const tri: number[] = [];
    for (const m of meshes) for (const i of m.indices) tri.push(m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]);
    const soup = new Float32Array(tri);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < soup.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], soup[i]); hi[k] = Math.max(hi[k], soup[i]); }
    writeFileSync(OUT + name.replace(/\.stp$/, ".f32"), Buffer.from(soup.buffer));
    const row = { name, faces: part.faces.length, triangles: soup.length / 9, size_mm: hi.map((h, k) => +(h - lo[k]).toFixed(2)),
      volume_mm3: Math.round(part.volumeMm3), read_ms: Math.round(t1 - t0), mesh_ms: Math.round(t2 - t1) };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  writeFileSync(OUT + "parts.json", JSON.stringify(rows, null, 1));
});
