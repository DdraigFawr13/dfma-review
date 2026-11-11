// P1 spec prototype: how much of the removal volume the found holes and pockets explain.
// Hole segment: a cylinder of its diameter from its lowest point along the axis out to the stock along each open vector.
// Pocket: its floor faces (planar, normal = axis) swept along the axis out of the stock.
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { test } from "vitest";
import { analyze } from "../engine/analyze";
import { loadNodeOc } from "../engine/node";
import { readStep, volume } from "../engine/read";

const NIST = "../tests/nist/.cache/NIST-PMI-STEP-Files/";
const OUT = "../docs/research/removal-proto/cover.jsonl";
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test("cover", async () => {
  const oc = await loadNodeOc();
  const P = () => new oc.Message_ProgressRange();
  for (const name of readdirSync(NIST).filter((n) => n.endsWith(".stp") && !n.includes("-tg")).sort()) {
    const bytes = new Uint8Array(readFileSync(NIST + name));
    const a = analyze(oc, bytes, name, "mill", "al6061");
    oc.FS.writeFile("/p.stp", bytes);
    const part = readStep(oc, "/p.stp");
    const fr = a.part.frame;
    const pts: number[][] = [];
    for (const f of a.faces) for (let i = 0; i < f.positions.length; i += 3) pts.push([f.positions[i], f.positions[i + 1], f.positions[i + 2]]);
    const lo = ["x", "y", "z"].map((k) => Math.min(...pts.map((v) => dot(v, (fr as any)[k]))));
    const hi = ["x", "y", "z"].map((k) => Math.max(...pts.map((v) => dot(v, (fr as any)[k]))));
    const o = [0, 1, 2].map((i) => lo[0] * fr.x[i] + lo[1] * fr.y[i] + lo[2] * fr.z[i]);
    const L = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 2;
    const t0 = performance.now();
    const ax = new oc.gp_Ax2(new oc.gp_Pnt(o[0], o[1], o[2]), new oc.gp_Dir(fr.z[0], fr.z[1], fr.z[2]), new oc.gp_Dir(fr.x[0], fr.x[1], fr.x[2]));
    const box = new oc.BRepPrimAPI_MakeBox(ax, hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]).Shape();
    const removal = new oc.BRepAlgoAPI_Cut(box, part.solid, P()).Shape();
    const removalV = volume(oc, removal);
    const t1 = performance.now();
    const tools: unknown[] = [];
    let holes = 0, pockets = 0;
    for (const f of a.features as any[]) {
      if (f.kind === "hole") {
        holes++;
        const fp = f.faces.flatMap((i: number) => { const p = a.faces[i].positions; const out = []; for (let j = 0; j < p.length; j += 3) out.push([p[j], p[j + 1], p[j + 2]]); return out; });
        const axis = f.axis as number[];
        // centre: mean of points projected off the axis
        const c = [0, 1, 2].map((k) => fp.reduce((s: number, p: number[]) => s + p[k], 0) / fp.length);
        for (const v of f.open_vectors as number[][]) {
          const s = Math.min(...fp.map((p: number[]) => dot(p, v)));
          const base = [0, 1, 2].map((k) => c[k] + (s - dot(c, v)) * v[k]);
          tools.push(new oc.BRepPrimAPI_MakeCylinder(new oc.gp_Ax2(new oc.gp_Pnt(base[0], base[1], base[2]), new oc.gp_Dir(v[0], v[1], v[2])), f.dims_mm.diameter / 2, L).Shape());
        }
        if (!f.open_vectors.length) void axis;
      } else if (f.kind === "pocket") {
        pockets++;
        const n = f.axis as number[];
        for (const i of f.faces as number[]) {
          if (a.faces[i].kind !== "plane") continue;
          // a floor: every point at the lowest height along n among the pocket's planar faces facing n
          const ad = new oc.BRepAdaptor_Surface(part.faces[i], true);
          const nn = ad.Plane().Axis().Direction();
          let fn = [nn.X(), nn.Y(), nn.Z()];
          if ((part.faces[i] as any).Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) fn = fn.map((x) => -x);
          if (dot(fn, n) < 0.999) continue;
          tools.push(new oc.BRepPrimAPI_MakePrism(part.faces[i], new oc.gp_Vec(n[0] * L, n[1] * L, n[2] * L), false, true).Shape());
        }
      }
    }
    let covered = 0, uncovered = removalV, regions: number[] = [];
    if (tools.length) {
      const comp = new oc.TopoDS_Compound(); const bb = new oc.BRep_Builder(); bb.MakeCompound(comp);
      for (const t of tools) bb.Add(comp, t);
      const cut = new oc.BRepAlgoAPI_Cut(removal, comp, P());
      if (!cut.IsDone()) throw new Error("cover cut failed " + name);
      const rest = cut.Shape();
      uncovered = volume(oc, rest);
      covered = removalV - uncovered;
      const ex = new oc.TopExp_Explorer(rest, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      for (; ex.More(); ex.Next()) regions.push(volume(oc, ex.Current()));
      regions.sort((x, y) => y - x);
    }
    const t2 = performance.now();
    appendFileSync(OUT, JSON.stringify({ name, holes, pockets, tools: tools.length, removal: Math.round(removalV), covered_pct: +(covered / removalV * 100).toFixed(2),
      uncovered_regions: regions.length, gt_1000mm3: regions.filter((r) => r > 1000).length, top: regions.slice(0, 4).map(Math.round), removal_ms: Math.round(t1 - t0), cover_ms: Math.round(t2 - t1) }) + "\n");
  }
});
