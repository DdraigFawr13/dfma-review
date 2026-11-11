// The grading scorer's pure functions (score.ts), on hand-made inputs with known answers; the same cases as
// tests/service/test_grading.py. The outside answer keys are not needed.
import { describe, expect, test } from "vitest";
import {
  compareIds, excludedCalls, faceLabels, fileLabels, holeGroups, instanceScore, misses, parseSitusCase, predicted, ratio, scorePart,
  scores, select, situsPredicted, summaryLine, tally, type FaceRec, type FeatureRec, type GradeResult, type PartRec,
} from "./score.ts";

const faces = (names: string[], kinds?: string[]): FaceRec[] =>
  names.map((n, i) => ({ kind: kinds?.[i] ?? "plane", kind2: kinds?.[i] ?? "plane", name: n, file_pos: i, shape_id: i + 1 }));
const feat = (f: Partial<FeatureRec> & { kind: string; faces: number[] }): FeatureRec => ({ open_ends: 1, ...f });

describe("labels", () => {
  test("file labels read the face names in order", () => {
    const step = "#1=ADVANCED_FACE('24',(#2),#3,.T.);\n#4 = ADVANCED_FACE ( '1' ,(#5),#6,.F.);\n#7=FACE_BOUND('',#8,.T.);";
    expect(fileLabels(step)).toEqual([24, 1]);
    expect(fileLabels(new TextEncoder().encode(step))).toEqual([24, 1]);
  });

  test("face labels join through the entity and check the order", () => {
    const [labels, checks] = faceLabels({ faces: faces(["24", "1", "12"]) }, [24, 1, 12]);
    expect(labels).toEqual([24, 1, 12]);
    expect(checks).toEqual({ same_count: true, file_order: true, names_agree: true, kinds_agree: true });
  });

  test("a reordered join is flagged", () => {
    const f = faces(["1", "24"]);
    [f[0].file_pos, f[1].file_pos] = [1, 0];
    f[1].kind2 = "cylinder";
    const [labels, checks] = faceLabels({ faces: f }, [24, 1]);
    expect(labels).toEqual([1, 24]);
    expect([checks.file_order, checks.names_agree, checks.kinds_agree]).toEqual([false, true, false]);
  });
});

describe("predicted and scores", () => {
  test("through and blind by open ends; holes win over pockets", () => {
    const result = { faces: faces(Array(6).fill("0")), features: [
      feat({ kind: "pocket", faces: [3, 4, 5] }), feat({ kind: "hole", faces: [0, 1], open_ends: 2 }), feat({ kind: "hole", faces: [2, 3] }),
    ] };
    expect(predicted(result)).toEqual(["through", "through", "blind", "blind", "pocket", "pocket"]);
  });

  test("recall, precision, and the excluded labels dropped", () => {
    const labels = [1, 1, 12, 12, 14, 14, 3, 24, 11, null];
    const preds = ["through", null, "through", "blind", "pocket", null, "pocket", null, "through", "pocket"];
    const total = tally(labels, preds);
    const s = scores(total);
    expect(s.recall[1]).toEqual({ n: 1, of: 2, pct: 50 });
    expect(s.recall[12]).toEqual({ n: 2, of: 2, pct: 100 }); // found as a hole, either type
    expect(s.type_recall[12]).toEqual({ n: 1, of: 2, pct: 50 });
    expect(s.recall[13]).toEqual({ n: 0, of: 0, pct: null });
    expect(s.precision.through).toEqual({ n: 1, of: 2, pct: 50 }); // face 2 is blind; face 8 (O-ring) dropped
    expect(s.precision.hole).toEqual({ n: 3, of: 3, pct: 100 });
    expect(s.precision.pocket).toEqual({ n: 1, of: 2, pct: 50 }); // face 6 is a passage (class 3)
    expect(s.false_by_label.pocket).toEqual({ 3: 1 });
    expect(s.claimed_on_excluded).toEqual({ through: 1 });
    expect(total.get("unlabelled", "pocket")).toBe(1);
  });

  test("untyped holes count for recall but not for type precision", () => {
    const result = { faces: faces(["1", "12", "0"]), features: [feat({ kind: "hole", faces: [0, 1, 2], open_ends: null })] };
    const preds = predicted(result);
    expect(preds).toEqual(["hole", "hole", "hole"]);
    const s = scores(tally([1, 12, 0], preds));
    expect([s.recall[1].n, s.recall[12].n]).toEqual([1, 1]);
    expect(s.precision.hole).toEqual({ n: 2, of: 3, pct: 66.7 });
    expect([s.precision.through.of, s.type_recall[1].n]).toEqual([0, 0]);
  });

  test("percentages round half to even, as Python's round", () => {
    expect(ratio(1, 8).pct).toBe(12.5);
    expect(ratio(1, 16).pct).toBe(6.2); // 6.25 is exact in binary: Python rounds it to 6.2
    expect(ratio(3, 16).pct).toBe(18.8); // 18.75 to 18.8
    expect(ratio(0, 0)).toEqual({ n: 0, of: 0, pct: null });
  });

  test("misses list the faces per class", () => {
    expect(misses("p.step", [1, 1, 14, 0], ["through", null, "blind", null])).toEqual([
      { part: "p.step", class: 1, faces: [1], called: [null] }, { part: "p.step", class: 14, faces: [2], called: ["blind"] }]);
  });
});

describe("parts that fail still count", () => {
  const inFile = [1, 1, 14, 11, 0];

  test.each(["timeout", "read_error", "crash"])("%s: every labelled face is a miss", (status) => {
    const [rec, counts, missed] = scorePart("p.step", { status } as never, inFile);
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

  test("face names that cannot be read are a failed join", () => {
    const r = { status: "ok", ignored_solids: 0, features: [], faces: [{ kind: "cylinder", kind2: null, name: null, file_pos: null, shape_id: null }] };
    const [rec, counts] = scorePart("p.step", r, [1]);
    expect(rec.status).toBe("join_failed");
    expect(scores(counts).recall[1]).toEqual({ n: 0, of: 1, pct: 0 });
  });

  test("a joined part keeps its labels and features", () => {
    const r = { status: "ok", ignored_solids: 2, features: [feat({ kind: "hole", faces: [0, 1], open_ends: 2 })], faces: faces(["1", "1", "24"]) };
    const [rec, counts, missed] = scorePart("p.step", r, [1, 1, 24]);
    expect(rec).toMatchObject({ status: "ok", faces: 3, ignored_solids: 2, labels: [1, 1, 24] });
    expect(scores(counts).recall[1]).toEqual({ n: 2, of: 2, pct: 100 });
    expect(missed).toEqual([]);
  });
});

describe("whole holes", () => {
  test("whole, split and merged", () => {
    const features = [feat({ kind: "hole", faces: [0, 1] }), feat({ kind: "hole", faces: [2], chain: 1 }), feat({ kind: "hole", faces: [3], chain: 1 }),
      feat({ kind: "hole", faces: [4] }), feat({ kind: "hole", faces: [5] })];
    expect(holeGroups(features).map((g) => [...g])).toEqual([[0, 1], [4], [5], [2, 3]]);
    expect(instanceScore(features, [[0, 1], [2, 3]])).toEqual({ whole: 2, of: 2, split: 0, merged: 0 });
    expect(instanceScore(features, [[4, 5]])).toEqual({ whole: 0, of: 1, split: 1, merged: 0 }); // one hole in two groups
    expect(instanceScore([feat({ kind: "hole", faces: [0, 1, 2, 3] })], [[0, 1], [2, 3]])).toEqual({ whole: 0, of: 2, split: 0, merged: 2 });
  });
});

describe("other engines and chains", () => {
  test("faces with no file positions still join", () => {
    const r = { status: "ok", ignored_solids: 0, features: [feat({ kind: "hole", faces: [0], open_ends: null })],
      faces: [{ kind: "cylinder", kind2: "cylinder", name: "1", file_pos: null, shape_id: null }] };
    const [rec, counts] = scorePart("p.step", r, [1]);
    expect(rec.status).toBe("ok");
    expect(scores(counts).recall[1]).toEqual({ n: 1, of: 1, pct: 100 });
  });

  test("a counterbore and its bore share a chain; two holes in one group are merged", () => {
    const ours = [feat({ kind: "hole", faces: [0, 1], chain: 1 }), feat({ kind: "hole", faces: [2], chain: 1 }),
      feat({ kind: "hole", faces: [3], chain: 2 }), feat({ kind: "hole", faces: [4], chain: 3 }), feat({ kind: "pocket", faces: [5] })];
    expect(instanceScore(ours, [[0, 1, 2], [3, 4]])).toEqual({ whole: 1, of: 2, split: 1, merged: 0 });
    expect(instanceScore([feat({ kind: "hole", faces: [0, 1, 2, 3, 4], open_ends: null })], [[0, 1, 2], [3, 4]])).toEqual({ whole: 0, of: 2, split: 0, merged: 2 });
    expect(instanceScore([], [[0]])).toEqual({ whole: 0, of: 1, split: 0, merged: 0 });
  });
});

describe("Analysis Situs", () => {
  test("parse a test case", () => {
    const text = "# Set working variables.\nset datafile public/cad/holes/obstructed-hole.step\nset radius 1e10\nset refFids { 5 7 }\n\n__recognize-holes\n";
    expect(parseSitusCase(text)).toEqual({ datafile: "public/cad/holes/obstructed-hole.step", refFids: [5, 7], radius: 1e10 });
    expect(parseSitusCase("set datafile  a.brep\nset maxSize   0\nset refFids { }\n").refFids).toEqual([]);
  });

  test("ids are one-based and the compare is exact", () => {
    const result = { faces: faces(["", "", ""], ["plane", "cylinder", "plane"]), features: [feat({ kind: "hole", faces: [1, 2] })] };
    expect(situsPredicted(result, ["hole"])).toEqual([2, 3]);
    expect(situsPredicted(result, ["hole"], ["cylinder"])).toEqual([2]);
    const c = compareIds([2, 3], [2, 4]);
    expect([c.exact, c.tp, c.fp, c.fn]).toEqual([false, 1, [3], [4]]);
    expect(compareIds([], []).exact).toBe(true);
  });
});

test("select takes ids in lexical order with skip and limit", () => {
  const paths = ["2", "10", "1000", "100", "3"].map((n) => `dir/${n}.step`);
  expect(select(paths).map((p) => p.slice(4, -5))).toEqual(["10", "100", "1000", "2", "3"]);
  expect(select(paths, 2, 2).map((p) => p.slice(4, -5))).toEqual(["1000", "2"]);
});

describe("summary", () => {
  test("O-ring faces called pockets are counted", () => {
    const part = { labels: [11, 11, 18, 24, 14], features: [feat({ kind: "pocket", faces: [0, 2, 3, 4] }), feat({ kind: "hole", faces: [1] })] } as unknown as PartRec;
    expect(excludedCalls([part])).toEqual({ "o-ring-as-hole": 1, "o-ring-as-pocket": 1, "slot-step-as-pocket": 1, "slot-shaped-as-pocket": 0, "other-excluded": 1 });
  });

  test("a slot shaped like a pocket beside a step has its own line (D-019)", () => {
    const labels = [17, 17, 17, 17, 20, 18, 18, 18];
    const shaped = feat({ kind: "pocket", faces: [0, 1, 2, 3], short_walls: [[1, [4]]] });
    const plain = feat({ kind: "pocket", faces: [5, 6, 7] });
    expect(excludedCalls([{ labels, features: [shaped, plain] } as unknown as PartRec]))
      .toMatchObject({ "slot-shaped-as-pocket": 4, "slot-step-as-pocket": 3 });
    const twoShort = feat({ kind: "pocket", faces: [0, 1, 2, 3], short_walls: [[1, [4]], [2, [4]]] });
    expect(excludedCalls([{ labels, features: [twoShort] } as unknown as PartRec])).toMatchObject({ "slot-shaped-as-pocket": 0, "slot-step-as-pocket": 4 });
  });

  test("one line per result", () => {
    const part = { part: "a.step", status: "ok", labels: [1, 1, 14], features: [feat({ kind: "hole", faces: [0, 1], open_ends: 2 }), feat({ kind: "pocket", faces: [2] })] };
    const d = { status: { ok: 1 }, scores: scores(tally([1, 1, 14], ["through", "through", "pocket"])), per_part: [part],
      holes_whole: { whole: 1, of: 1, split: 0, merged: 0 } } as unknown as GradeResult;
    expect(summaryLine("r.json", d)).toBe("r.json: {'ok': 1} holes 2/2 (miss 0, wrong 0, through/blind right 2) whole holes 1/1 (split 0, merged 0) "
      + "pockets 1/1 (miss 0, wrong 0) o-ring-as-hole 0 o-ring-as-pocket 0 slot-step-as-pocket 0 slot-shaped-as-pocket 0 other-excluded 0");
  });
});
