// Port of tests/service/test_grading.py: the grading scorer (the Node scorer: web/src/grading, launched by
// scripts/grading.mjs): label join, counts and Analysis Situs parsing. The pure functions are checked on hand-made
// inputs with known answers; two tests run the child process on our own test parts, end to end. The outside answer
// keys are not needed here. (The pure cases are also in src/grading/score.test.ts; they are repeated here so this file
// holds every assertion of the Python file.)
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { mfcadpp } from "../../grading/grade";
import { runChild } from "../../grading/run";
import {
  compareIds, excludedCalls, faceLabels, fileLabels, instanceScore, misses, parseSitusCase, predicted, scorePart, scores, select,
  situsPredicted, summaryLine, tally, type FaceRec, type FeatureRec, type GradeResult, type PartRec,
} from "../../grading/score";

// mfcadpp runs its files through runChild; the one test with a fake result swaps it (the Python test patched run_all)
const FAKE = new Set<string>();
vi.mock("../../grading/run", async (orig) => {
  const real = await orig<typeof import("../../grading/run")>();
  return {
    ...real,
    runChild: (mode: "grade" | "counts", path: string, t?: number) => FAKE.has(path)
      ? Promise.resolve({ status: "ok", ignored_solids: 0, error: null,
        faces: [0, 1].map((i) => ({ kind: "cylinder", kind2: "cylinder", name: "1", file_pos: i, shape_id: i + 1 })),
        features: [{ kind: "hole", faces: [0], open_ends: 2, chain: 1 }, { kind: "hole", faces: [1], open_ends: 2, chain: 2 }] })
      : real.runChild(mode, path, t),
  };
});

const ROOT = resolve(__dirname, "../../../..");
const PARTS = join(ROOT, "tests", "parts");
const faces = (names: string[], kinds?: string[]): FaceRec[] =>
  names.map((n, i) => ({ kind: kinds?.[i] ?? "plane", kind2: kinds?.[i] ?? "plane", name: n, file_pos: i, shape_id: i + 1 }));
const feat = (f: Partial<FeatureRec> & { kind: string; faces: number[] }): FeatureRec => ({ open_ends: 1, ...f });

describe("pure scorer functions", () => {
  test("file labels read the face names in order", () => {
    const step = "#1=ADVANCED_FACE('24',(#2),#3,.T.);\n#4 = ADVANCED_FACE ( '1' ,(#5),#6,.F.);\n#7=FACE_BOUND('',#8,.T.);";
    expect(fileLabels(step)).toEqual([24, 1]);
  });

  test("face labels join through the entity and check order", () => {
    const [labels, checks] = faceLabels({ faces: faces(["24", "1", "12"]) }, [24, 1, 12]);
    expect(labels).toEqual([24, 1, 12]);
    expect(checks).toEqual({ same_count: true, file_order: true, names_agree: true, kinds_agree: true });
  });

  test("face labels flag a reordered join", () => {
    const f = faces(["1", "24"]);
    [f[0].file_pos, f[1].file_pos] = [1, 0]; // our face 0 is the file's face 1
    f[1].kind2 = "cylinder";
    const [labels, checks] = faceLabels({ faces: f }, [24, 1]);
    expect(labels).toEqual([1, 24]);
    expect([checks.file_order, checks.names_agree, checks.kinds_agree]).toEqual([false, true, false]);
  });

  test("predicted splits through and blind, and holes win over pockets", () => {
    const result = { faces: faces(Array(6).fill("0")), features: [
      feat({ kind: "pocket", faces: [3, 4, 5] }), feat({ kind: "hole", faces: [0, 1], open_ends: 2 }), feat({ kind: "hole", faces: [2, 3] }),
    ] };
    expect(predicted(result)).toEqual(["through", "through", "blind", "blind", "pocket", "pocket"]);
  });

  test("scores count recall, precision, and drop excluded labels", () => {
    const labels = [1, 1, 12, 12, 14, 14, 3, 24, 11, null];
    const preds = ["through", null, "through", "blind", "pocket", null, "pocket", null, "through", "pocket"];
    const total = tally(labels, preds);
    const s = scores(total);
    expect(s.recall[1]).toEqual({ n: 1, of: 2, pct: 50 });
    expect(s.recall[12]).toEqual({ n: 2, of: 2, pct: 100 }); // found as a hole, either type
    expect(s.type_recall[12]).toEqual({ n: 1, of: 2, pct: 50 });
    expect(s.recall[14]).toEqual({ n: 1, of: 2, pct: 50 });
    expect(s.recall[13]).toEqual({ n: 0, of: 0, pct: null });
    expect(s.precision.through).toEqual({ n: 1, of: 2, pct: 50 }); // face 2 is blind; face 8 (O-ring) dropped
    expect(s.precision.hole).toEqual({ n: 3, of: 3, pct: 100 });
    expect(s.precision.pocket).toEqual({ n: 1, of: 2, pct: 50 }); // face 6 is a passage (class 3)
    expect(s.false_by_label.pocket).toEqual({ 3: 1 });
    expect(s.claimed_on_excluded).toEqual({ through: 1 });
    expect(total.get("unlabelled", "pocket")).toBe(1);
  });

  test("misses list the faces per class", () => {
    expect(misses("p.step", [1, 1, 14, 0], ["through", null, "blind", null])).toEqual([
      { part: "p.step", class: 1, faces: [1], called: [null] }, { part: "p.step", class: 14, faces: [2], called: ["blind"] }]);
  });

  test("parse a Situs case", () => {
    const text = "# Set working variables.\nset datafile public/cad/holes/obstructed-hole.step\nset radius 1e10\nset refFids { 5 7 }\n\n__recognize-holes\n";
    expect(parseSitusCase(text)).toEqual({ datafile: "public/cad/holes/obstructed-hole.step", refFids: [5, 7], radius: 1e10 });
    expect(parseSitusCase("set datafile  a.brep\nset maxSize   0\nset refFids { }\n").refFids).toEqual([]);
  });

  test("Situs ids are one-based and compare is exact", () => {
    const result = { faces: faces(["", "", ""], ["plane", "cylinder", "plane"]), features: [feat({ kind: "hole", faces: [1, 2] })] };
    expect(situsPredicted(result, ["hole"])).toEqual([2, 3]);
    expect(situsPredicted(result, ["hole"], ["cylinder"])).toEqual([2]);
    const c = compareIds([2, 3], [2, 4]);
    expect([c.exact, c.tp, c.fp, c.fn]).toEqual([false, 1, [3], [4]]);
    expect(compareIds([], []).exact).toBe(true);
  });

  test("untyped holes count for recall but not type precision", () => {
    const result = { faces: faces(["1", "12", "0"]), features: [feat({ kind: "hole", faces: [0, 1, 2], open_ends: null })] };
    const preds = predicted(result);
    expect(preds).toEqual(["hole", "hole", "hole"]);
    const s = scores(tally([1, 12, 0], preds));
    expect([s.recall[1].n, s.recall[12].n]).toEqual([1, 1]);
    expect(s.precision.hole).toEqual({ n: 2, of: 3, pct: 66.7 });
    expect([s.precision.through.of, s.type_recall[1].n]).toEqual([0, 0]);
  });

  test("select takes ids in lexical order with skip and limit", () => {
    const paths = ["2", "10", "1000", "100", "3"].map((n) => `${n}.step`);
    expect(select(paths).map((p) => p.slice(0, -5))).toEqual(["10", "100", "1000", "2", "3"]);
    expect(select(paths, 2, 2).map((p) => p.slice(0, -5))).toEqual(["1000", "2"]);
  });

  test.each(["timeout", "read_error", "crash"])("a part that fails (%s) still counts its labelled faces as misses", (status) => {
    const [rec, counts, missed] = scorePart("p.step", { status } as never, [1, 1, 14, 11, 0]);
    expect(rec.status).toBe(status);
    const s = scores(counts);
    expect(s.recall[1]).toEqual({ n: 0, of: 2, pct: 0 });
    expect(s.recall[14]).toEqual({ n: 0, of: 1, pct: 0 });
    expect(missed.map((m) => m.class)).toEqual([1, 14]);
  });

  test("a failed join counts as misses too", () => {
    const r = { status: "ok", ignored_solids: 0, features: [feat({ kind: "hole", faces: [0], open_ends: 2 })],
      faces: [{ kind: "plane", kind2: "cylinder", name: "1", file_pos: 0, shape_id: 1 }] };
    const [rec, counts] = scorePart("p.step", r, [1]);
    expect(rec.status).toBe("join_failed");
    expect(scores(counts).recall[1]).toEqual({ n: 0, of: 1, pct: 0 });
  });

  test("a part whose face names cannot be read is a failed join", () => {
    const r = { status: "ok", ignored_solids: 0, features: [], faces: [{ kind: "cylinder", kind2: null, name: null, file_pos: null, shape_id: null }] };
    const [rec, counts] = scorePart("p.step", r, [1]);
    expect(rec.status).toBe("join_failed");
    expect(scores(counts).recall[1]).toEqual({ n: 0, of: 1, pct: 0 });
  });

  test("another engine without file positions still joins", () => {
    const r = { status: "ok", ignored_solids: 0, features: [feat({ kind: "hole", faces: [0], open_ends: null })],
      faces: [{ kind: "cylinder", kind2: "cylinder", name: "1", file_pos: null, shape_id: null }] };
    const [rec, counts] = scorePart("p.step", r, [1]);
    expect(rec.status).toBe("ok");
    expect(scores(counts).recall[1]).toEqual({ n: 1, of: 1, pct: 100 });
  });

  test("the summary counts O-ring faces called pockets", () => {
    const part = { labels: [11, 11, 18, 24, 14], features: [feat({ kind: "pocket", faces: [0, 2, 3, 4] }), feat({ kind: "hole", faces: [1] })] } as unknown as PartRec;
    expect(excludedCalls([part])).toEqual({ "o-ring-as-hole": 1, "o-ring-as-pocket": 1, "slot-step-as-pocket": 1, "slot-shaped-as-pocket": 0, "other-excluded": 1 });
  });

  test("the summary puts a slot shaped like a pocket beside a step on its own line (D-019)", () => {
    const labels = [17, 17, 17, 17, 20, 18, 18, 18];
    const shaped = feat({ kind: "pocket", faces: [0, 1, 2, 3], short_walls: [[1, [4]]] });
    const twoShort = feat({ kind: "pocket", faces: [5, 6, 7], short_walls: [[6, [4]], [7, [4]]] });
    const got = excludedCalls([{ labels, features: [shaped, twoShort] } as unknown as PartRec]);
    expect([got["slot-shaped-as-pocket"], got["slot-step-as-pocket"]]).toEqual([4, 3]);
  });

  test("instance score joins a stepped hole's chain and finds splits and merges", () => {
    const ours = [feat({ kind: "hole", faces: [0, 1], chain: 1 }), feat({ kind: "hole", faces: [2], chain: 1 }),
      feat({ kind: "hole", faces: [3], chain: 2 }), feat({ kind: "hole", faces: [4], chain: 3 }), feat({ kind: "pocket", faces: [5] })];
    expect(instanceScore(ours, [[0, 1, 2], [3, 4]])).toEqual({ whole: 1, of: 2, split: 1, merged: 0 });
    // Quiddity: features with no chain, each its own hole
    const quid = [feat({ kind: "hole", faces: [0, 1, 2], open_ends: 2 }), feat({ kind: "hole", faces: [3, 4] })];
    expect(instanceScore(quid, [[0, 1, 2], [3, 4]]).whole).toBe(2);
    // Analysis Situs: every hole face in one feature, so two holes are merged
    const situs = [feat({ kind: "hole", faces: [0, 1, 2, 3, 4], open_ends: null })];
    expect(instanceScore(situs, [[0, 1, 2], [3, 4]])).toEqual({ whole: 0, of: 2, split: 0, merged: 2 });
    expect(instanceScore([], [[0]])).toEqual({ whole: 0, of: 1, split: 0, merged: 0 });
  });
});

describe("the child process, end to end", () => {
  test("the child runs our part end to end (one process per file; a box with one through hole)", async () => {
    const r = await runChild("grade", join(PARTS, "box_through_hole.step"));
    expect(r.status, JSON.stringify(r)).toBe("ok");
    expect(r.faces.length).toBe(7);
    expect(r.faces.map((f) => f.shape_id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.faces.map((f) => f.file_pos)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(r.faces.every((f) => f.kind === f.kind2)).toBe(true);
    const kinds: Record<string, number> = {};
    for (const f of r.features) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
    expect(kinds).toEqual({ hole: 1 });
    expect(r.features[0].open_ends).toBe(2);
    expect(predicted(r).filter((p) => p === "through").length).toBe(1);
  }, 60_000);

  test("the child reports a read error as a result", async () => {
    expect((await runChild("grade", join(PARTS, "not_step.step"))).status).toBe("read_error");
  }, 60_000);
});

describe("a set with instances", () => {
  test("scores whole holes, and the summary line shows them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "grading-"));
    mkdirSync(dir, { recursive: true });
    const step = join(dir, "a.step");
    writeFileSync(step, "ADVANCED_FACE('1',x) ADVANCED_FACE('1',x)");
    writeFileSync(join(dir, "INSTANCES.json"), '{"a": [[0, 1]]}');
    FAKE.add(step);
    const out = await mfcadpp(dir, undefined, 1);
    expect(out.holes_whole).toEqual({ whole: 0, of: 1, split: 1, merged: 0 });
    writeFileSync(join(dir, "r.json"), JSON.stringify(out));
    expect(summaryLine(join(dir, "r.json"), JSON.parse(readFileSync(join(dir, "r.json"), "utf8")) as GradeResult)).toContain("whole holes 0/1 (split 1, merged 0)");
  });
});
