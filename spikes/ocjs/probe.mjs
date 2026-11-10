// probe.py's calls on @taucad/opencascade.js; node probe.mjs <step folder> <out.json>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import init from '@taucad/opencascade.js';
import { readStep } from './core.mjs';

const W = dirname(fileURLToPath(import.meta.resolve('@taucad/opencascade.js/wasm')));
const oc = await init({ locateFile: (f) => join(W, f) });
const NO_PROJECT = new Set(['nist_ftc_08_asme1_ap242-e1-tg.stp']); // as probe.py (pythonocc segfaults there)
const STATE = { TopAbs_IN: 0, TopAbs_OUT: 1, TopAbs_ON: 2, TopAbs_UNKNOWN: 3 };
const r = (x) => Number(x.toPrecision(9));
const P = (x, y, z) => new oc.gp_Pnt(x, y, z);

function probe(name, path) {
  const { solid } = readStep(oc, path);
  const fmap = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapes(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE, fmap);
  const faces = []; for (let i = 1; i <= fmap.Size(); i++) faces.push(oc.TopoDS.Face(fmap.FindKey(i)));
  const box = new oc.Bnd_Box(); oc.BRepBndLib.Add(solid, box, true);
  const [x0, y0, z0, x1, y1, z1] = [box.GetXMin(), box.GetYMin(), box.GetZMin(), box.GetXMax(), box.GetYMax(), box.GetZMax()];
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  new oc.BRepMesh_IncrementalMesh(solid, 0.05, false, 0.5, true);
  const mesh = faces.map((f) => {
    const loc = new oc.TopLoc_Location(); const t = oc.BRep_Tool.Triangulation(f, loc, 0);
    if (!t || t.isNull?.()) return null;
    const tr = loc.Transformation(); let s = 0;
    for (let i = 1; i <= t.NbNodes(); i++) { const p = t.Node(i).Transformed(tr); s += p.X() + 2 * p.Y() + 3 * p.Z(); }
    let tri = 0; for (let i = 1; i <= t.NbTriangles(); i++) { const g = t.Triangle(i).Get(); tri += g.theN1 + g.theN2 + g.theN3; }
    return [t.NbNodes(), t.NbTriangles(), r(s), tri];
  });
  const inter = new oc.IntCurvesFace_ShapeIntersector(); inter.Load(solid, 1e-6);
  const rays = [[1,0,0],[0,1,0],[0,0,1],[-1,0,0],[0,-1,0],[0,0,-1],[1,1,1]].map((d) => {
    inter.Perform(new oc.gp_Lin(P(...c), new oc.gp_Dir(...d)), -1e9, 1e9);
    if (!inter.IsDone()) return null;
    const w = []; for (let i = 1; i <= inter.NbPnt(); i++) w.push(r(inter.WParameter(i)));
    return w.sort((a, b) => a - b);
  });
  const sc = new oc.BRepClass3d_SolidClassifier(solid); const inside = [];
  for (let k = 0; k < 9; k++) { sc.Perform(P(x0 + (x1 - x0) * k / 8, y0 + (y1 - y0) * (8 - k) / 8, z0 + (z1 - z0) * k / 8), 1e-6); inside.push(STATE[sc.State()]); }
  const fc = [], proj = [], dist = [];
  faces.slice(0, 40).forEach((f, i) => {
    const g = new oc.GProp_GProps(); oc.BRepGProp.SurfaceProperties(f, g, false, false); const m = g.CentreOfMass();
    try { fc.push(STATE[new oc.BRepClass_FaceClassifier(f, m, 1e-6).State()]); } catch { fc.push('err'); }
    const pj = NO_PROJECT.has(name) ? null : new oc.GeomAPI_ProjectPointOnSurf(P(...c), oc.BRep_Tool.Surface(f));
    if (pj && pj.NbPoints()) {
      const { U, V } = pj.LowerDistanceParameters(); const pt = new oc.gp_Pnt(), vec = new oc.gp_Vec();
      new oc.BRepGProp_Face(f).Normal(U, V, pt, vec); proj.push([r(pj.LowerDistance()), r(vec.Magnitude())]);
    } else proj.push(null);
    if (i) { try { dist.push(r(new oc.BRepExtrema_DistShapeShape(faces[0], f).Value())); } catch { dist.push('err'); } }
  });
  const g = new oc.GProp_GProps();
  if (!NO_PROJECT.has(name)) oc.BRepGProp.SurfaceProperties(new oc.BRepAlgoAPI_Common(faces[0], solid).Shape(), g, false, false);
  return { mesh, rays, inside, face_in: fc, proj, dist, common_area: r(g.Mass()) };
}

const [folder, outPath] = process.argv.slice(2); const out = {};
for (const n of readdirSync(folder).filter((x) => x.endsWith('.stp')).sort()) {
  oc.FS.writeFile('/in.stp', readFileSync(join(folder, n)));
  try { out[n] = probe(n, '/in.stp'); } catch (e) { out[n] = { error: String(e) }; console.log(n, String(e)); }
  oc.FS.unlink('/in.stp');
}
writeFileSync(outPath, JSON.stringify(out));
