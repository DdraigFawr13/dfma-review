// Weld each NIST triangle soup by position (1e-4 mm grid) and hand it to Manifold: is it a valid manifold, and
// how close is its volume to OpenCascade's (parts.json)?
import { readFileSync } from "node:fs";
import Module from "manifold-3d";
const DIR = new URL("../../../../tests/nist/.cache/reach-spike/", import.meta.url).pathname;
const wasm = await Module(); wasm.setup();
const parts = JSON.parse(readFileSync(DIR + "parts.json", "utf8"));
for (const p of parts) {
  const soup = new Float32Array(readFileSync(DIR + p.name.replace(/\.stp$/, ".f32")).buffer.slice(0));
  const key = new Map(), verts = [], tris = new Uint32Array(soup.length / 3);
  for (let i = 0; i < soup.length; i += 3) {
    const k = `${Math.round(soup[i] * 1e4)},${Math.round(soup[i + 1] * 1e4)},${Math.round(soup[i + 2] * 1e4)}`;
    let at = key.get(k);
    if (at === undefined) { at = verts.length / 3; key.set(k, at); verts.push(soup[i], soup[i + 1], soup[i + 2]); }
    tris[i / 3] = at;
  }
  const t0 = performance.now();
  let row = { name: p.name, tris: tris.length / 3 };
  try {
    const m = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: tris }));
    row = { ...row, status: m.status(), vol_mm3: Math.round(m.volume()), occ_mm3: p.volume_mm3, diff_pct: +(100 * (m.volume() - p.volume_mm3) / p.volume_mm3).toFixed(3), ms: Math.round(performance.now() - t0) };
  } catch (e) { row.error = String(e).slice(0, 120); }
  console.log(JSON.stringify(row));
}
