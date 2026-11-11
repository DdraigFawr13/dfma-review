// Port of tests/service/test_inventor_blends.py: fillets and chamfers read from the NIST .ipt files and mapped onto
// their STEP faces through the test harness (the app refuses every NIST pair), and the built filleted block. The
// harness transform per pair comes from the frozen parity key; the block is built with the engine's own OpenCascade
// (oc.ts) and written to STEP and read back, as tests/inventor/built.py filleted_block does with pythonocc.
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { Topology } from "../features/holes";
import { mapBlends, type Blend } from "../inventor/blends";
import { surf } from "../inventor/surfaces";
import { readStep } from "../read";
import { getOc, INV, ipt, near, pairTransform, stepBytes, toml } from "./inventor_common";

const COUNTS = toml(resolve(INV, "blend_counts.toml"));
const r4 = (x: number) => Math.round(x * 1e4) / 1e4; // round(x, 4): no value here sits on a tie

const mappedCache = new Map<string, any[]>();
async function mapped(name: string): Promise<any[]> {
  let rows = mappedCache.get(name);
  if (!rows) {
    const oc = await getOc();
    const step = COUNTS.pair[name].step;
    oc.FS.writeFile("/blend_pair.step", stepBytes(step));
    const part = readStep(oc, "/blend_pair.step");
    rows = mapBlends(new Topology(oc, part.solid, part.faces), (await ipt(name)).blends, pairTransform(step, name));
    mappedCache.set(name, rows);
  }
  return rows;
}

describe("counts: fillet radii and chamfer distances per file, by feature id, as measured (J5)", () => {
  test.each(Object.keys(COUNTS.file).sort())("%s", async (name) => {
    const want = COUNTS.file[name];
    const bs = (await ipt(name)).blends;
    expect(bs.map((b) => b.feature_id)).toEqual(bs.map((b) => b.feature_id).sort((a, b) => a - b));
    expect(bs.filter((b) => b.kind === "fillet" && b.radius_mm !== null).map((b) => r4(b.radius_mm!))).toEqual(want.fillets);
    expect(bs.filter((b) => b.kind === "chamfer" && b.distances_mm?.length).map((b) => b.distances_mm!.map(r4))).toEqual(want.chamfers);
    expect(bs.filter((b) => b.reason).length).toBe(want.not_understood);
  });
});

test("spec sizes: CTC 04's 7 fillets and 1 chamfer 5 x 5 mm; CTC 01 4 fillets and chamfers 50 x 50 and 5 x 5; CTC 05 2 fillets and 1 chamfer 6.35 x 6.35 (a cone: no angle); FTC 10 2021 fillets 1, 2, 0.15, 0.2", async () => {
  const sizes = async (name: string) => {
    const bs = (await ipt(name)).blends;
    return [bs.filter((b) => b.kind === "fillet").map((b) => b.radius_mm!).sort((a, b) => a - b),
      bs.filter((b) => b.kind === "chamfer").map((b) => [...b.distances_mm!.map(r4), b.angle_deg ? r4(b.angle_deg) : b.angle_deg])] as [number[], (number | null)[][]];
  };
  let [f, c] = await sizes("INV_nist_ctc_04_asme1_2021.ipt");
  expect(f).toHaveLength(7);
  [2.5, 4, 5, 5, 5, 13, 25].forEach((v, k) => expect(near(f[k], v, 0), `fillet ${k}`).toBe(true));
  expect(c).toEqual([[5.0, 5.0, 90.0]]);
  [f, c] = await sizes("INV_nist_ctc_01_asme1_2021.ipt");
  expect(f).toHaveLength(4);
  expect(c).toEqual([[50.0, 50.0, 90.0], [5.0, 5.0, 90.0]]);
  [f, c] = await sizes("INV_nist_ctc_05_asme1_2021.ipt");
  expect(f).toHaveLength(2);
  expect(c).toEqual([[6.35, 6.35, null]]);
  [f] = await sizes("INV_nist_ftc_10_asme1_2021.ipt");
  expect(f).toHaveLength(4);
  [0.15, 0.2, 1.0, 2.0].forEach((v, k) => expect(near(f[k], v, 0), `fillet ${k}`).toBe(true));
});

test("copies join their fillet: a blend tag's last id is the fillet, ids before it the mirror or pattern that copied the face; CTC 04's (3233, 3193) faces all have 3193's 5 mm radius", async () => {
  const blends = (await ipt("INV_nist_ctc_04_asme1_2021.ipt")).blends;
  const only = blends.filter((b) => b.feature_id === 3193);
  expect(only).toHaveLength(1);
  const [b] = only;
  expect([b.kind, b.radius_mm, b.copied_by, b.faces.length]).toEqual(["fillet", 5.0, [3233], 36]);
  expect(blends.map((x) => x.feature_id)).not.toContain(3233);
});

test("not understood: CTC 02: a 2 deg cone blend and four of spline faces only are not mapped, with their reason", async () => {
  const bad = (await ipt("INV_nist_ctc_02_asme1_2021.ipt")).blends.filter((b) => b.reason);
  expect(bad.map((b) => b.feature_id)).toEqual([446, 2203, 2778, 6592, 8803]);
  expect(new Set(bad.map((b) => b.reason))).toEqual(new Set(["blend shape not understood"]));
  expect(new Set(bad.map((b) => b.kind))).toEqual(new Set([null]));
});

describe("mapping: faces at a STEP face of their shape and place, and blends per state, on each NIST pair (J5)", () => {
  test.each(Object.keys(COUNTS.pair).sort())("%s", async (name) => {
    const want = COUNTS.pair[name];
    const rows = await mapped(name);
    const fl = rows.filter((r) => r.kind === "fillet");
    const ch = rows.filter((r) => r.kind === "chamfer");
    const sum = (rs: any[], k: string) => rs.reduce((n, r) => n + r[k], 0);
    expect([sum(fl, "faces"), sum(fl, "faces_mapped")]).toEqual([want.faces, want.faces_mapped]);
    expect([sum(ch, "faces"), sum(ch, "faces_mapped")]).toEqual([want.chamfer_faces, want.chamfer_faces_mapped]);
    expect(Object.fromEntries(["matched", "disagrees", "not_mapped"].map((s) => [s, rows.filter((r) => r.state === s).length])))
      .toEqual({ matched: want.matched, disagrees: want.disagrees, not_mapped: want.not_mapped });
    for (const r of rows) {
      expect(r.reason === null).toBe(r.state !== "not_mapped");
      expect(r.gaps.length > 0).toBe(r.state === "disagrees");
      expect(r.faces_mapped).toBeLessThanOrEqual(r.faces);
    }
  });
});

test("mapping totals: 499 of 744 fillet faces sit on a STEP face of their shape and place on the 11 pairs; none at its place with another radius (the spec's one on FTC 11 is a torus whose ring is 0.043 mm larger, so it sits elsewhere: not mapped, measured at build)", async () => {
  expect(Object.keys(COUNTS.pair)).toHaveLength(11);
  const rows = (await Promise.all(Object.keys(COUNTS.pair).map(mapped))).flat().filter((r) => r.kind === "fillet");
  expect([rows.reduce((n, r) => n + r.faces, 0), rows.reduce((n, r) => n + r.faces_mapped, 0)]).toEqual([744, 499]);
  expect(rows.filter((r) => r.state === "disagrees")).toEqual([]);
});

test("one face, one place: a coplanar STEP face elsewhere is not the chamfer's: CTC 04's chamfer covers 12 distinct STEP faces, one per mapped .ipt face (before the box check, one plane matched faces 446 and 471)", async () => {
  const cs = (await mapped("INV_nist_ctc_04_asme1_2021.ipt")).filter((r) => r.kind === "chamfer");
  expect(cs).toHaveLength(1);
  expect(cs[0].faces_mapped).toBe(12);
  expect(cs[0].step_faces).toHaveLength(12);
});

describe("built block (spec Builder defaults): the built block's fillet r 3 and chamfer [2, 2] are matched; with r 3.5 the fillet disagrees by 0.5 mm", () => {
  let oc: any;
  let topo: Topology;

  beforeAll(async () => {
    oc = await getOc();
    // a 40 x 30 x 20 mm block, x 0-40, y 0-30, z 0-20, with a 3 mm fillet on the vertical edge at x 0, y 0 and a
    // 2 x 2 mm chamfer on the top edge at y 30, z 20
    const edgeAt = (shape: any, mid: number[]) => {
      const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
      for (; ex.More(); ex.Next()) {
        const ed = oc.TopoDS.Edge(ex.Current());
        const c = new oc.BRepAdaptor_Curve(ed);
        const p = c.Value((c.FirstParameter() + c.LastParameter()) / 2);
        if (Math.max(Math.abs(p.X() - mid[0]), Math.abs(p.Y() - mid[1]), Math.abs(p.Z() - mid[2])) < 1e-6) return ed;
      }
      throw new Error(`no edge at ${mid}`);
    };
    const box = new oc.BRepPrimAPI_MakeBox(40.0, 30.0, 20.0).Shape();
    const f = new oc.BRepFilletAPI_MakeFillet(box);
    f.Add(3.0, edgeAt(box, [0.0, 0.0, 10.0]));
    f.Build(new oc.Message_ProgressRange());
    const shape = f.Shape();
    const c = new oc.BRepFilletAPI_MakeChamfer(shape);
    c.Add(2.0, edgeAt(shape, [20.0, 30.0, 20.0]));
    c.Build(new oc.Message_ProgressRange());
    const w = new oc.STEPControl_Writer();
    w.Transfer(c.Shape(), "STEPControl_AsIs", true, new oc.Message_ProgressRange());
    expect(String(w.Write("/block.step"))).toBe("IFSelect_RetDone"); // the engine's enums are strings
    const part = readStep(oc, "/block.step");
    topo = new Topology(oc, part.solid, part.faces);
  });

  const blocks = (r: number): Blend[] => {
    const n = 2 ** -0.5;
    return [
      { feature_id: 200, kind: "fillet", radius_mm: r, distances_mm: null, angle_deg: null, faces: [0], copied_by: [], reason: null,
        surfs: new Map([[0, surf("cyl", [3.0, 3.0, 0.0], [0.0, 0.0, 1.0], r)]]),
        points: new Map([[0, [[0.0, 3.0, 0.0], [3.0, 0.0, 0.0], [3.0, 0.0, 20.0], [0.0, 3.0, 20.0]]]]) },
      { feature_id: 201, kind: "chamfer", radius_mm: null, distances_mm: [2.0, 2.0], angle_deg: 90.0, faces: [1], copied_by: [], reason: null,
        surfs: new Map([[1, surf("plane", [0.0, 29.0, 19.0], [0.0, n, n])]]),
        points: new Map([[1, [[0.0, 30.0, 18.0], [40.0, 30.0, 18.0], [40.0, 28.0, 20.0], [0.0, 28.0, 20.0]]]]) },
    ];
  };

  test("block", () => {
    const [fillet, chamfer] = mapBlends(topo, blocks(3.0));
    expect([fillet.state, fillet.radius_mm, fillet.faces_mapped]).toEqual(["matched", 3.0, 1]);
    expect([chamfer.state, chamfer.distances_mm, chamfer.angle_deg]).toEqual(["matched", [2.0, 2.0], 90.0]);
    const [off] = mapBlends(topo, blocks(3.5));
    expect(off.state).toBe("disagrees");
    expect(off.step_faces).toEqual(fillet.step_faces);
    expect(off.gaps).toHaveLength(1);
    const [g] = off.gaps;
    expect([g.what, g.mm, g.text]).toEqual(["radius", 0.5, "R0.138 in [3.50 mm] in the .ipt, R0.118 in [3.00 mm] in the STEP"]);
  });
});
