// P1 spec prototype (write-spec step 3): stock box in the part frame minus the solid; regions and volumes.
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { test } from "vitest";
import { faceInfo, partFrame, type Vec } from "../engine/frame";
import { meshFaces } from "../engine/mesh";
import { loadNodeOc } from "../engine/node";
import { readStep, volume } from "../engine/read";

const NIST = "../tests/nist/.cache/NIST-PMI-STEP-Files/";
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test("cut", async () => {
  const oc = await loadNodeOc();
  for (const name of readdirSync(NIST).filter((n) => n.endsWith(".stp")).sort()) {
    oc.FS.writeFile("/in.stp", new Uint8Array(readFileSync(NIST + name)));
    const part = readStep(oc, "/in.stp");
    const infos = part.faces.map((f: unknown, i: number) => faceInfo(oc, i, f));
    const meshes = meshFaces(oc, part.solid, part.faces);
    const vs: Vec[] = [];
    for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) vs.push([m.positions[i], m.positions[i + 1], m.positions[i + 2]]);
    const fr = partFrame(infos, vs);
    const lo = (["x", "y", "z"] as const).map((k) => Math.min(...vs.map((v) => dot(v, fr[k]))));
    const hi = (["x", "y", "z"] as const).map((k) => Math.max(...vs.map((v) => dot(v, fr[k]))));
    const o = [0, 1, 2].map((i) => lo[0] * fr.x[i] + lo[1] * fr.y[i] + lo[2] * fr.z[i]);
    const t0 = performance.now();
    const ax = new oc.gp_Ax2(new oc.gp_Pnt(o[0], o[1], o[2]), new oc.gp_Dir(fr.z[0], fr.z[1], fr.z[2]), new oc.gp_Dir(fr.x[0], fr.x[1], fr.x[2]));
    const box = new oc.BRepPrimAPI_MakeBox(ax, hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]).Shape();
    const boxV = volume(oc, box);
    const op = new oc.BRepAlgoAPI_Cut(box, part.solid, new oc.Message_ProgressRange());
    const ok = op.IsDone();
    const res = op.Shape();
    const t1 = performance.now();
    const vols: number[] = [];
    const ex = new oc.TopExp_Explorer(res, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    for (; ex.More(); ex.Next()) vols.push(volume(oc, ex.Current()));
    const t2 = performance.now();
    const sum = vols.reduce((a, b) => a + b, 0);
    const diff = boxV - part.volumeMm3;
    vols.sort((a, b) => b - a);
    appendFileSync("../docs/research/removal-proto/cut.jsonl", "\n" + JSON.stringify({ name, ok, cut_ms: Math.round(t1 - t0), regions: vols.length, explore_ms: Math.round(t2 - t1),
      box: Math.round(boxV), part: Math.round(part.volumeMm3), removal: Math.round(diff), sum: Math.round(sum),
      sum_vs_removal_pct: +((sum - diff) / diff * 100).toFixed(4), small_lt_1mm3: vols.filter((v) => v < 1).length, largest: vols.slice(0, 3).map(Math.round) }));
  }
});
