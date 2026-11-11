// Shared helpers for the Group C ports (tests/service/test_*.py of the labelled grading sets and the built-part tests):
// run the browser engine on a file, score it with the TypeScript grader (grading/score.ts, the port of grade.py), and
// build the parts the Python tests built with pythonocc, with the engine's own OpenCascade wrapper (oc.ts).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "vitest";
import type { Process } from "../../api";
import { gradeFile } from "../../grading/analyse";
import { fileLabels, scorePart, scores, Tally, type FeatureRec, type Scores } from "../../grading/score";
import { analyzeOrRefuse } from "../node";
import type { OC } from "../oc";

export const ROOT = resolve(__dirname, "../../../..");
export const IN = 25.4;
export const setDir = (name: string) => resolve(ROOT, "tests/grading/sets", name);
export const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Result = any;

/** analyze() as the worker runs it; a refusal or a failure is a test failure here. */
export async function analyse(oc: OC, bytes: Uint8Array, name: string, process: Process = "mill", material = "al6061"): Promise<Result> {
  const r = (await analyzeOrRefuse(oc, bytes, name, process, material as never)) as Result;
  if (r.error) throw new Error(`${name}: ${r.error}`);
  return r;
}
export const analyseFile = (oc: OC, path: string, process: Process = "mill", material = "al6061") =>
  analyse(oc, new Uint8Array(readFileSync(path)), path.split("/").pop()!, process, material);

/** pytest.approx on a number: relative 1e-6 (and 1e-12 absolute) unless `abs` is given. */
export function approx(actual: number, want: number, abs?: number, label = ""): void {
  const tol = abs ?? Math.max(1e-6 * Math.abs(want), 1e-12);
  expect(Math.abs(actual - want) <= tol, `${label} ${actual} vs ${want} (tolerance ${tol})`).toBe(true);
}
export function approxList(actual: number[], want: number[], abs?: number, label = ""): void {
  expect(actual.length, `${label} ${JSON.stringify(actual)} vs ${JSON.stringify(want)}`).toBe(want.length);
  actual.forEach((a, i) => approx(a, want[i], abs, `${label}[${i}]`));
}
export const byNumber = (a: number, b: number) => a - b;

/** child.run + grade.score_part for one grading-set file (the Python tests' _score), cached per file. */
const cache = new Map<string, Promise<{ counts: Tally; missed: unknown[]; features: FeatureRec[] }>>();
export function scoreFile(oc: OC, path: string) {
  let hit = cache.get(path);
  if (!hit) {
    hit = (async () => {
      const child = await gradeFile(oc, path);
      expect(child.error, `${path}: ${child.error}`).toBeNull();
      const [rec, counts, missed] = scorePart(path.split("/").pop()!, { status: "ok", ...child }, fileLabels(readFileSync(path)));
      expect(rec.status).toBe("ok");
      return { counts, missed, features: child.features };
    })();
    cache.set(path, hit);
  }
  return hit;
}
export function total(parts: Tally[]): Scores {
  const t = new Tally();
  for (const p of parts) t.merge(p);
  return scores(t);
}
export const sumOf = (s: Scores, classes: Record<number, string> | number[], key: "n" | "of") =>
  (Array.isArray(classes) ? classes : Object.keys(classes).map(Number)).reduce((a, c) => a + s.recall[c][key], 0);

// --- shapes, as the Python tests built them with pythonocc ---

export interface Shapes {
  pnt: (x: number, y: number, z: number) => OC;
  box: (x: number, y: number, z: number, l: number, w: number, h: number) => OC;
  cyl: (x: number, y: number, z: number, r: number, h: number, dir?: [number, number, number]) => OC;
  cut: (shape: OC, ...tools: OC[]) => OC;
  rotate: (shape: OC, about: [number, number, number], dir: [number, number, number], deg: number) => OC;
  draft: (shape: OC, deg: number, topZ: number) => OC;
  step: (shape: OC) => Uint8Array;
}

export function shapes(oc: OC): Shapes {
  const pnt = (x: number, y: number, z: number) => new oc.gp_Pnt(x, y, z);
  const dir = (d: [number, number, number]) => new oc.gp_Dir(d[0], d[1], d[2]);
  const progress = () => new oc.Message_ProgressRange();
  let n = 0;
  return {
    pnt,
    box: (x, y, z, l, w, h) => new oc.BRepPrimAPI_MakeBox(pnt(x, y, z), l, w, h).Shape(),
    cyl: (x, y, z, r, h, d = [0, 0, 1]) => new oc.BRepPrimAPI_MakeCylinder(new oc.gp_Ax2(pnt(x, y, z), dir(d)), r, h).Shape(),
    cut(shape, ...tools) {
      for (const tool of tools) {
        const op = new oc.BRepAlgoAPI_Cut(shape, tool, progress());
        expect(op.IsDone(), "BRepAlgoAPI_Cut").toBe(true);
        shape = op.Shape();
      }
      return shape;
    },
    rotate(shape, about, d, deg) {
      const t = new oc.gp_Trsf();
      t.SetRotation(new oc.gp_Ax1(pnt(...about), dir(d)), (deg * Math.PI) / 180);
      return new oc.BRepBuilderAPI_Transform(shape, t, true, false).Shape();
    },
    // bullnose_draft/make.py draft(): tilt the side faces (normal square to Z) inward toward the bottom by deg, about the top
    draft(shape, deg, topZ) {
      const mk = new oc.BRepOffsetAPI_DraftAngle(shape);
      const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      let count = 0;
      for (; ex.More(); ex.Next()) {
        const face = oc.TopoDS.Face(ex.Current());
        const s = new oc.BRepAdaptor_Surface(face, true);
        expect(String(s.GetType())).toBe("GeomAbs_Plane"); // a drafted box: planes only
        if (Math.abs(s.Plane().Axis().Direction().Z()) > 1e-6) continue;
        mk.Add(face, dir([0, 0, 1]), -(deg * Math.PI) / 180, new oc.gp_Pln(pnt(0, 0, topZ), new oc.gp_Dir(0, 0, 1)));
        expect(mk.AddDone(), "draft refused a face").toBe(true);
        count++;
      }
      expect(count).toBeGreaterThan(0);
      mk.Build(progress());
      expect(mk.IsDone()).toBe(true);
      return mk.Shape();
    },
    step(shape) {
      const path = `/groupc-${n++}.step`;
      const w = new oc.STEPControl_Writer();
      w.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress());
      expect(String(w.Write(path))).toBe("IFSelect_RetDone");
      const bytes = oc.FS.readFile(path) as Uint8Array;
      oc.FS.unlink(path);
      return bytes;
    },
  };
}
