// SPIKE (research, not product): build an OpenCascade solid from the ACIS records of an .ipt alone, in TypeScript.
// Port of docs/research/inventor-shape-spike/ipt_shape.py (D-035). Layouts are in that file's docstring.
import type { OC } from "../engine/oc";
import { Ipt, find } from "../engine/inventor/ole";
import { HEADER, split, type Record, type Vec } from "../engine/inventor/sab";

const MM = 10.0;
type Bad = { [k: string]: number };

export async function mainModel(bytes: Uint8Array): Promise<Record[]> {
  const f = await Ipt.open(bytes);
  let best: [Record[], number] | null = null;
  for (const d of f.models()) {
    let k = find(d, HEADER);
    while (k >= 0) {
      const [, recs] = split(d, k);
      const n = recs.reduce((c, r) => c + (r.name === "face" ? 1 : 0), 0);
      if (best === null || n > best[1]) best = [recs, n];
      k = find(d, HEADER, k + 1);
    }
  }
  if (!best) throw new Error("no model");
  return best[0];
}

export interface Built { solid: unknown | null; res: { [k: string]: unknown }; faces?: unknown[]; edges?: Map<number, unknown>; keep?: unknown[] }

export function build(oc: OC, recs: Record[]): Built {
  const stage = { name: "start" };
  const t0 = Date.now();
  const miss: Bad = {};
  const bad = (k: string) => { miss[k] = (miss[k] ?? 0) + 1; };
  const vec = (i: number, n: number): Vec => recs[i].values.filter(([k]) => k === "v")[n][1] as Vec;
  const dbl = (i: number): number[] => recs[i].values.filter(([k]) => k === "d").map(([, v]) => v as number);
  const ptr = (i: number, n: number): number => recs[i].values[n][1] as number;
  const P = (v: Vec) => new oc.gp_Pnt(MM * v[0], MM * v[1], MM * v[2]);
  const D = (v: Vec) => new oc.gp_Dir(v[0], v[1], v[2]);
  const len = (v: Vec) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  const neg = (v: Vec): Vec => [-v[0], -v[1], -v[2]];
  const keep: unknown[] = []; // builders own the shapes they return: keep them alive until the solid is made
  const K = <T,>(x: T): T => { keep.push(x); return x; };
  const verts = new Map<number, unknown>();
  const edges = new Map<number, unknown>();

  const vertex = (i: number) => {
    if (!verts.has(i)) verts.set(i, K(new oc.BRepBuilderAPI_MakeVertex(P(vec(ptr(i, 5), 0)))).Vertex());
    return verts.get(i);
  };
  const surface = (s: number): unknown | null => {
    const n = recs[s].name;
    if (n === "plane-surface") return new oc.Geom_Plane(new oc.gp_Ax3(P(vec(s, 0)), D(vec(s, 1)), D(vec(s, 2))));
    if (n === "cone-surface") {
      const [o, ax, mj] = [vec(s, 0), vec(s, 1), vec(s, 2)];
      const d = dbl(s);
      const rad = MM * len(mj);
      const a3 = new oc.gp_Ax3(P(o), D(ax), D(mj));
      if (Math.abs(d[1]) < 1e-9) return new oc.Geom_CylindricalSurface(a3, rad);
      return new oc.Geom_ConicalSurface(a3, Math.atan(d[1] / d[2]), rad);
    }
    if (n === "sphere-surface") {
      return new oc.Geom_SphericalSurface(new oc.gp_Ax3(P(vec(s, 0)), D(vec(s, 2)), D(vec(s, 1))), MM * Math.abs(dbl(s)[0]));
    }
    if (n === "torus-surface") {
      const d = dbl(s);
      return new oc.Geom_ToroidalSurface(new oc.gp_Ax3(P(vec(s, 0)), D(vec(s, 1)), D(vec(s, 2))), MM * d[0], MM * Math.abs(d[1]));
    }
    return null;
  };
  const edge = (e: number): unknown | null => {
    if (edges.has(e)) return edges.get(e);
    const r = recs[e];
    const [v0, t0, v1, t1, c] = [3, 4, 5, 6, 8].map((i) => r.values[i][1] as number);
    if (c === -1) { bad("degenerate-edge-skipped"); return null; }
    const rc = recs[c];
    const rev = r.values[9][1] as boolean;
    let curve: unknown, a = t0, b = t1;
    if (rc.name === "straight-curve") {
      const dv = vec(c, 1);
      curve = new oc.Geom_Line(new oc.gp_Lin(P(vec(c, 0)), D(rev ? neg(dv) : dv)));
      const k = MM * len(dv);
      a = k * t0; b = k * t1;
    } else if (rc.name === "ellipse-curve") {
      const [ctr, nrm, mj] = [vec(c, 0), vec(c, 1), vec(c, 2)];
      const rad = MM * len(mj);
      const ratio = dbl(c)[0];
      const ax = new oc.gp_Ax2(P(ctr), D(rev ? neg(nrm) : nrm), D(mj));
      curve = Math.abs(ratio - 1) < 1e-9 ? new oc.Geom_Circle(ax, rad) : new oc.Geom_Ellipse(ax, rad, rad * ratio);
    } else { bad("curve:" + rc.name); return null; }
    let mk: any;
    try { mk = K(new oc.BRepBuilderAPI_MakeEdge(curve, vertex(v0), vertex(v1), a, b)); } catch (e) { bad("edge-throw:" + rc.name); return null; }
    if (!mk.IsDone()) { bad("edge-not-done"); return null; }
    edges.set(e, mk.Edge());
    return edges.get(e);
  };
  const wire = (lp: number): unknown | null => {
    const first = ptr(lp, 4);
    const mk = K(new oc.BRepBuilderAPI_MakeWire());
    let c = first;
    for (let n = 0; n < 10000; n++) {
      const ed = edge(ptr(c, 6));
      if (ed === null || ed === undefined) {
        if (recs[ptr(c, 6)].values[8][1] === -1) { c = ptr(c, 3); if (c === first) break; continue; }
        return null;
      }
      mk.Add(recs[c].values[7][1] ? oc.TopoDS.Edge((ed as { Reversed(): unknown }).Reversed()) : ed);
      c = ptr(c, 3);
      if (c === first) break;
    }
    if (!mk.IsDone()) { bad("wire-not-done"); return null; }
    return mk.Wire();
  };
  const apexLoop = (f: number): boolean => {
    let lp = ptr(f, 4);
    while (lp !== -1) {
      const c = ptr(lp, 4);
      if (ptr(c, 3) === c && recs[ptr(c, 6)].values[8][1] === -1) return true;
      lp = ptr(lp, 3);
    }
    return false;
  };
  const apexFace = (surf: { SemiAngle(): number; RefRadius(): number }, w: unknown) => {
    const ex = new oc.TopExp_Explorer(w, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
    const ed = oc.TopoDS.Edge(ex.Current());
    const pt = oc.BRep_Tool.Pnt(oc.TopExp.FirstVertex(ed));
    const pr = new oc.GeomAPI_ProjectPointOnSurf(pt, surf);
    const v = pr.LowerDistanceParameters().V;
    const apex = -surf.RefRadius() / Math.sin(surf.SemiAngle());
    return new oc.BRepBuilderAPI_MakeFace(surf, 0.0, 2 * Math.PI, Math.min(v, apex), Math.max(v, apex), 1e-7).Face();
  };

  const shellOf = new Map<number, number>();
  recs.forEach((r, i) => { if (r.name === "face") { const s = ptr(i, 5); shellOf.set(s, (shellOf.get(s) ?? 0) + 1); } });
  const shellSizes = [...shellOf.values()].sort((a, b) => b - a);
  const main = [...shellOf.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const faces: unknown[] = [];
  stage.name = "faces";
  recs.forEach((r, i) => {
    if (r.name !== "face" || ptr(i, 5) !== main) return;
    let s: unknown;
    try { s = surface(ptr(i, 7)); } catch (e) { bad("surface-throw:" + recs[ptr(i, 7)].name); return; }
    if (s === null) { bad("surface:" + recs[ptr(i, 7)].name); return; }
    const wires: unknown[] = [];
    let lp = ptr(i, 4);
    while (lp !== -1) { try { const w = wire(lp); if (w) wires.push(w); } catch (e) { bad("wire-throw"); } lp = ptr(lp, 3); }
    if (!wires.length) { bad("face-no-wire"); return; }
    if (apexLoop(i)) { try { faces.push(apexFace(s as never, wires[0])); } catch { bad("apex-face-failed"); } return; }
    try {
      const mk = K(new oc.BRepBuilderAPI_MakeFace(s, wires[0], true)); // 3 args: the 2-arg call binds to another overload
      for (const w of wires.slice(1)) mk.Add(w);
      const fix = K(new oc.ShapeFix_Face(mk.Face()));
      fix.Perform();
      faces.push(fix.Face());
    } catch (e) { bad("face-throw:" + recs[ptr(i, 7)].name); }
  });
  let res: { [k: string]: unknown } = {};
  let solid: unknown = null;
  try {
  res = { faces_ipt: recs.filter((r) => r.name === "face").length, shell_sizes: shellSizes, faces_built: faces.length, miss };
  stage.name = "sewing";
  const trySew = (fs: unknown[]) => { try { const q = new oc.BRepBuilderAPI_Sewing(1e-3, true, true, true, false); for (const f of fs) q.Add(f); q.Perform(new oc.Message_ProgressRange()); return true; } catch { return false; } };
  if (process.env.BISECT && !trySew(faces)) {
    let lo = 1, hi = faces.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (trySew(faces.slice(0, mid))) lo = mid + 1; else hi = mid; }
    miss["first-bad-prefix"] = lo;
    const idx = recs.map((r, i) => (r.name === "face" && ptr(i, 5) === main ? i : -1)).filter((i) => i >= 0);
    miss["bad-face-surface:" + recs[ptr(idx[lo - 1], 7)].name] = 1;
    miss["bad-face-rec"] = idx[lo - 1];
    miss["alone-ok"] = trySew([faces[lo - 1]]) ? 1 : 0;
    try { const q = new oc.BRepBuilderAPI_Sewing(1e-3, true, true, true, false); q.Add(faces[lo - 1]); q.Perform(new oc.Message_ProgressRange()); } catch (e) { (res as any).exc = oc.getExceptionMessage(e as never).join(": "); }
  }
  stage.name = "sew-new";
  const sew = K(new oc.BRepBuilderAPI_Sewing(1e-3, true, true, true, false));
  stage.name = "sew-add";
  for (const f of faces) sew.Add(f);
  stage.name = "sew-perform:" + faces.length;
  sew.Perform(new oc.Message_ProgressRange());
  stage.name = "sewn"; if (keep.length < 0) throw new Error("unreachable");
  const sh = sew.SewedShape();
  res.free_edges = sew.NbFreeEdges();
  const shells: unknown[] = [];
  const ex = new oc.TopExp_Explorer(sh, oc.TopAbs_ShapeEnum.TopAbs_SHELL);
  for (; ex.More(); ex.Next()) shells.push(oc.TopoDS.Shell(ex.Current()));
  res.shells = shells.length;
  const vol = (s: unknown) => { const p = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, p, false, false, false); const m = p.Mass(); p.delete(); return m; };
  stage.name = "solid";
  if (shells.length) {
    const big = shells.reduce((a, b) => (Math.abs(vol(a)) >= Math.abs(vol(b)) ? a : b));
    const fx = new oc.ShapeFix_Shell(big);
    fx.Perform();
    solid = new oc.ShapeFix_Solid().SolidFromShell(fx.Shell());
    if (vol(solid) < 0) solid = (solid as { Reversed(): unknown }).Reversed();
    res.valid = new oc.BRepCheck_Analyzer(solid, true, false).IsValid();
    res.volume = vol(solid);
  }
  } catch (e) { res.threw = stage.name; try { res.exc2 = oc.getExceptionMessage(e as never).join(": "); } catch { /* not a wasm exception */ } }
  res.kept = keep.length; // reference `keep` here so the builders live to the end
  res.ms = Date.now() - t0;
  res.stage = stage.name;
  return { solid, res, faces, edges, keep } as Built;
}

/** Write a shape to a STEP file in the engine's FS and return its bytes (mm). */
export function toStep(oc: OC, shape: unknown): Uint8Array {
  const w = new oc.STEPControl_Writer();
  w.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, new oc.Message_ProgressRange());
  w.Write("/spike_out.stp");
  const b = oc.FS.readFile("/spike_out.stp") as Uint8Array;
  oc.FS.unlink("/spike_out.stp");
  return b;
}
