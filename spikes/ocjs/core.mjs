// The reader and fingerprint shared by the Node run (fingerprint.mjs) and the browser run (browser.html).
// readStep() mirrors service/dfma/read.py: transfer roots, else the solid entities directly; closed
// shells that lie in no solid compete with the solids; the largest solid by volume wins.
const SOLID_ENTITIES = ['StepShape_ManifoldSolidBrep', 'StepShape_BrepWithVoids', 'StepShape_FacetedBrep'];
const GAP_MAX_SHARE = 0.1;


function listItems(oc, list) {
  const copy = new oc.NCollection_List_TopoDS_Shape(list);
  const out = [];
  while (!copy.IsEmpty()) { out.push(copy.First()); copy.RemoveFirst(); }
  copy.delete();
  return out;
}

function explore(oc, shape, kind, avoid) {
  const ex = avoid ? new oc.TopExp_Explorer(shape, kind, avoid) : new oc.TopExp_Explorer(shape, kind);
  const out = [];
  for (; ex.More(); ex.Next()) out.push(ex.Current());
  ex.delete();
  return out;
}

function volume(oc, shape) {
  const p = new oc.GProp_GProps();
  oc.BRepGProp.VolumeProperties(shape, p, false, false, false);
  const v = Math.abs(p.Mass());
  p.delete();
  return v;
}

function declaresSolid(reader) {
  const m = reader.StepModel();
  for (let i = 1; i <= m.NbEntities(); i++) if (SOLID_ENTITIES.includes(m.Value(i).DynamicType().Name())) return true;
  return false;
}

export function readStep(oc, path) {
  const reader = new oc.STEPControl_Reader();
  const status = reader.ReadFile(path);
  if (status !== 'IFSelect_RetDone') return { error: 'not STEP: ' + status };
  reader.TransferRoots();
  if (reader.NbShapes() === 0) {
    const m = reader.StepModel();
    for (let i = 1; i <= m.NbEntities(); i++) {
      const e = m.Value(i);
      if (SOLID_ENTITIES.includes(e.DynamicType().Name())) reader.TransferEntity(e);
    }
  }
  const shape = reader.NbShapes() ? reader.OneShape() : null;
  const solids = [];
  const gaps = [];
  if (shape && !shape.IsNull()) {
    for (const s of explore(oc, shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID)) { solids.push(oc.TopoDS.Solid(s)); gaps.push(0); }
    if (declaresSolid(reader)) {
      const beside = solids.length > 0;
      for (const sh of explore(oc, shape, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SOLID)) {
        const shell = oc.TopoDS.Shell(sh);
        const edges = new oc.NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher();
        oc.TopExp.MapShapesAndAncestors(shell, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_FACE, edges);
        let free = 0;
        for (let i = 1; i <= edges.Size(); i++) if (edges.FindFromIndex(i).Size() === 1) free++;
        const n = edges.Size();
        edges.delete();
        if (beside && free > GAP_MAX_SHARE * n) continue;
        gaps.push(free);
        solids.push(new oc.ShapeFix_Solid().SolidFromShell(shell));
      }
    }
  }
  if (!solids.length) return { error: 'no solid' };
  const vols = solids.map((s) => volume(oc, s));
  let best = 0;
  vols.forEach((v, i) => { if (v > vols[best]) best = i; });
  return { solid: solids[best], volume: vols[best], ignored_solids: solids.length - 1, free_edges: gaps[best] };
}

function canon(x, y, z) {
  for (const c of [x, y, z]) {
    if (Math.abs(c) > 1e-9) {
      const s = c > 0 ? 1 : -1;
      return [x, y, z].map((v) => Math.round(s * v * 1e6) / 1e6 + 0);
    }
  }
  return [0, 0, 0];
}

function facePrint(oc, face) {
  const s = new oc.BRepAdaptor_Surface(face, true);
  const kind = String(s.GetType()).replace('GeomAbs_', '').replace('Surface', '').replace('Of', '');
  const p = new oc.GProp_GProps();
  oc.BRepGProp.SurfaceProperties(face, p, false, false);
  const out = { kind: NAMES[kind] ?? kind, area: p.Mass(), rev: face.Orientation() === 'TopAbs_REVERSED' };
  p.delete();
  const dir = (ax) => { const d = ax.Direction(); return canon(d.X(), d.Y(), d.Z()); };
  if (out.kind === 'Plane') out.dir = dir(s.Plane().Axis());
  else if (out.kind === 'Cylinder') { const c = s.Cylinder(); out.r = c.Radius(); out.dir = dir(c.Axis()); }
  else if (out.kind === 'Cone') { const c = s.Cone(); out.deg = (c.SemiAngle() * 180) / Math.PI; out.dir = dir(c.Axis()); }
  else if (out.kind === 'Sphere') out.r = s.Sphere().Radius();
  else if (out.kind === 'Torus') { const t = s.Torus(); out.r = t.MajorRadius(); out.r2 = t.MinorRadius(); }
  s.delete();
  return out;
}
// GeomAbs names after trimming, mapped to fingerprint.py's KINDS.
const NAMES = { Plane: 'Plane', Cylinder: 'Cylinder', Cone: 'Cone', Sphere: 'Sphere', Torus: 'Torus',
  Bezier: 'Bezier', BSpline: 'BSpline', Revolution: 'Revolution', Extrusion: 'Extrusion', Offset: 'Offset', Other: 'Other' };

export function fingerprint(oc, path) {
  const t0 = performance.now();
  const res = readStep(oc, path);
  if (res.error) return { error: res.error };
  const read_s = (performance.now() - t0) / 1000;
  const solid = res.solid;
  const E = oc.TopAbs_ShapeEnum;
  const fmap = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapes(solid, E.TopAbs_FACE, fmap);
  const faces = [];
  for (let i = 1; i <= fmap.Size(); i++) faces.push(oc.TopoDS.Face(fmap.FindKey(i)));
  const emap = new oc.NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapesAndAncestors(solid, E.TopAbs_EDGE, E.TopAbs_FACE, emap);
  const nbrs = faces.map(() => new Set());
  for (let i = 1; i <= emap.Size(); i++) {
    const ids = [...new Set(listItems(oc, emap.FindFromIndex(i)).map((f) => fmap.FindIndex(f) - 1))];
    for (const a of ids) for (const b of ids) if (a !== b) nbrs[a].add(b);
  }
  const box = new oc.Bnd_Box();
  oc.BRepBndLib.Add(solid, box, true);
  const p = new oc.GProp_GProps();
  oc.BRepGProp.SurfaceProperties(solid, p, false, false);
  const out = {
    volume: res.volume, area: p.Mass(), ignored_solids: res.ignored_solids, free_edges: res.free_edges,
    edges: emap.Size(),
    bbox: [box.GetXMin(), box.GetYMin(), box.GetZMin(), box.GetXMax(), box.GetYMax(), box.GetZMax()],
    read_s,
    faces: faces.map((f, i) => ({ ...facePrint(oc, f), n: [...nbrs[i]].sort((a, b) => a - b) })),
  };
  p.delete(); box.delete(); emap.delete(); fmap.delete();
  return out;
}
