// Port of tests/service/test_rows.py. Review-steps S1 (spec docs/specs/review-steps.md, D-045): check names, limit
// sources in plain words, the cost total and each cost driver's findings; S2: the Features step's rows.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, test } from "vitest";
import type { Material, Process } from "../../api";
import { costDrivers } from "../drivers";
import { RULES } from "../rules/index";
import { checkName, checksRun, costTotal, findingRows, idRange, joinValues, LIMITS, limitText, SENTENCES, SHORTS, valueText } from "../rows";
import { round } from "../units";
import { PARTS, ROOT, run, type Result } from "./groupa_common";

const RULE_DIR = resolve(ROOT, "web/src/engine/rules");

/** Every threshold_source the rules can give: literals and SOURCE constants in the rule modules (the TypeScript
 *  copies of service/dfma/rules/*.py), and every table's `source` in config/thresholds.toml. */
function sources(): Set<string> {
  const found = new Set<string>();
  for (const file of readdirSync(RULE_DIR).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(resolve(RULE_DIR, file), "utf8");
    for (const m of text.matchAll(/threshold_source:\s*"([^"]+)"/g)) found.add(m[1]);
    for (const m of text.matchAll(/^(?:export )?const SOURCE\s*=\s*"([^"]+)"/gm)) found.add(m[1]);
  }
  const walk = (node: unknown): void => {
    if (node !== null && typeof node === "object") {
      const o = node as Record<string, unknown>;
      if (typeof o.source === "string") found.add(o.source);
      for (const v of Object.values(o)) walk(v);
    }
  };
  walk(parse(readFileSync(resolve(ROOT, "config/thresholds.toml"), "utf8")));
  return found;
}

test("limit text", () => {
  // Every source the rules give has plain words, with no decision ids or file names; any other source fails.
  const found = sources();
  for (const s of ["estimate", "assumption", "spec", "drill list in config/tools.toml", "D-032: the .ipt and STEP must agree",
    "D-021", "D-025", "D-026 (Sandvik)"]) expect(found.has(s), s).toBe(true);
  for (const s of found) {
    expect(s in LIMITS, s).toBe(true);
    expect(limitText(s), s).not.toMatch(/D-\d|config\/|\.toml/);
  }
  expect(limitText("estimate")).toBe("limit is an estimate");
  expect(limitText("drill list in config/tools.toml")).toBe("drill list, within 0.0005 in");
  expect(limitText("D-026 (Sandvik)")).toBe("limit from Sandvik's tables");
  expect("D-999" in LIMITS).toBe(false);
  expect(limitText("shop table")).toBe("limit: shop table"); // a source a manager added shows as given
});

test("check names", () => {
  // Every rule in RULES has a check name ending in "check"; the spec's table for a few.
  for (const rule of RULES) expect(checkName(rule.ID).endsWith(" check"), rule.ID).toBe(true);
  expect(checkName("corner_radius")).toBe("Corner radius check");
  expect(checkName("looks_turned")).toBe("Process check");
  expect(checkName("hole_mismatch")).toBe(".ipt check");
  expect(checksRun(["turn_axis", "turn_slender", "turn_offaxis"])).toEqual(["Turning axis check", "Length to diameter check"]);
  expect(() => checkName("no_such_rule")).toThrow();
});

test("words in the response", async () => {
  // Findings and passes carry their limit in words, findings their check; the response lists the checks run.
  const r = await run("report_sample");
  expect(r.checks_run).toEqual(["Hole depth check", "Hole size check", "Corner radius check", "Pocket depth check", "Step depth check",
    "Undercut check", "Thin wall check", "Access check", "Process check"]);
  for (const f of r.findings) {
    expect(f.limit_text).toBe(limitText(f.threshold_source));
    expect(f.check).toBe(checkName(f.rule));
  }
  for (const p of r.passed) expect(p.limit_text).toBe(limitText(p.threshold_source));
  expect(r.findings.find((f: Result) => f.rule === "hole_size").limit_text).toBe("drill list, within 0.0005 in");
});

test("cost total", async () => {
  // report_sample: 4 + 4 + 2 + 1 + 1 + 1 + 1 = 14.0 (frame r3-cost); no drivers: None; rounded to 0.1.
  expect((await run("report_sample")).cost_total).toBe(14.0);
  expect(costTotal([])).toBeNull();
  expect(costTotal([{ score: 0.3333 }, { score: 1.0 }])).toBe(1.3);
  expect((await run("box_through_hole")).cost_total).toBe(1.0);
});

test("driver findings", async () => {
  // A findings driver lists the F ids of the findings it counts; setups, tools and small tools list none.
  const r = await run("report_sample");
  const got = Object.fromEntries(r.cost_drivers.map((d: Result) => [d.driver, d.findings]));
  expect(got).toEqual({ distinct_tools: [], small_corners: ["F4", "F5", "F6", "F7"], deep_holes: ["F1", "F2"],
    deep_pockets: ["F8"], extra_setups: [], odd_holes: ["F3"], small_tools: [] });
  for (const d of r.cost_drivers) expect([0, d.count]).toContain(d.findings.length);
  const findings = [{ id: "F1", rule: "hole_depth" }, { id: "F2", rule: "looks_turned" }, { id: "F3", rule: "bore_depth" }];
  const [deep, ...rest] = costDrivers(findings, [{}], []);
  expect(rest).toEqual([]);
  expect(deep.findings).toEqual(["F1", "F3"]);
});

// --- S2: the Features step's rows (spec J3, Design "Rows") ---

/** Rows cover each finding exactly once, each row has a short title, and Fix rows come first. */
function coversEveryFindingOnce(result: Result): void {
  const ids: string[] = result.rows.flatMap((r: Result) => r.findings);
  expect([...ids].sort()).toEqual(result.findings.map((f: Result) => f.id).sort());
  expect(ids.length).toBe(new Set(ids).size);
  const sev: string[] = result.rows.map((r: Result) => r.severity);
  expect(sev).toEqual([...sev].sort((a, b) => Number(a !== "high") - Number(b !== "high"))); // stable, as Python's sorted(key=)
  for (const r of result.rows) {
    expect(r.short && r.sentence && r.check.endsWith("check"), JSON.stringify(r)).toBeTruthy();
    expect(r.id).toBe(`row:${r.findings[0]}`);
  }
}

test("rows: report_sample", async () => {
  // Frame r3-features: 8 findings as 4 rows, Fix first, with the frame's sentences; Passed groups the 9 walls.
  const r = await run("report_sample");
  const got = r.rows.map((x: Result) => [x.short, x.count, x.range, x.sentence, x.check, x.limit]);
  expect(got).toEqual([
    ["Sharp corner", 4, "F4–F7", "Inside corners have no radius. Needs 0.031 in (1/32) or more, or EDM (spark erosion).",
      "Corner radius check", "limit is an estimate"],
    ["Deep hole", 2, "F1 F2", "9.6× and 7.2× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips).",
      "Hole depth check", "limit is an estimate"],
    ["Drill size", 1, "F3", "0.260 in isn't a standard drill. Nearest is 0.266 in (17/64).",
      "Hole size check", "drill list, within 0.0005 in"],
    ["Deep pocket", 1, "F8", "Depth is 8.0× the end mill that fits. Over 3.0× needs a long tool. "
      + "Cut in 8 passes of 0.031 in (1/32).", "Pocket depth check", "limit is an estimate"],
  ]);
  expect(r.rows[0].id).toBe("row:F4");
  expect(r.rows[0].features).toEqual(["corner-1", "corner-2", "corner-3", "corner-4"]);
  coversEveryFindingOnce(r);
  const walls = r.passed_rows.find((x: Result) => x.kind === "wall");
  expect([walls.short, walls.count, walls.check, walls.severity]).toEqual(["Walls", 9, "Thin wall check", "ok"]);
  expect(walls.id).toBe("row:pass-wall-thin_wall");
  expect(walls.findings).toEqual([]);
  const flagged = new Set(r.findings.map((f: Result) => f.feature));
  expect(r.passed_rows.flatMap((x: Result) => x.features).filter((f: string) => flagged.has(f))).toEqual([]);
});

const finding = (n: number, rule: string, severity: string, measured: number, limit: number, unit: string, title = ""): Result =>
  ({ id: `F${n}`, rule, severity, measured, limit, unit, title: title || `${rule} ${measured}`, feature: `${rule}-${n}`,
    threshold_source: "estimate" });

// rule, severity, unit, limit, measured values for 4 findings (high to low not required)
const CASES: [string, string, string, number, number[]][] = [
  ["corner_radius", "high", "in", 0.03125, [0.0, 0.0, 0.0, 0.0]],
  ["corner_radius", "medium", "in", 0.03125, [0.02, 0.015, 0.01, 0.005]],
  ["corner_radius", "medium", "ratio", 4.0, [5.4, 6.0, 7.0, 8.0]],
  ["hole_depth", "medium", "ratio", 6.0, [7.2, 9.6, 6.4, 8.0]],
  ["hole_depth", "high", "ratio", 10.0, [12.0, 11.0, 15.0, 10.5]],
  ["hole_size", "medium", "in", 0.265625, [0.26, 0.262, 0.263, 0.264]],
  ["pocket_depth", "medium", "ratio", 3.0, [8.0, 4.0, 5.0, 6.0]],
  ["thin_wall", "medium", "in", 0.03, [0.02, 0.01, 0.015, 0.025]],
  ["undercut", "medium", "in", 0.0, [0.1, 0.2, 0.3, 0.4]],
  ["access", "high", "deg", 0.5, [22.0, 30.0, 45.0, 10.0]],
  ["looks_turned", "medium", "ratio", 0.9, [0.95, 0.95, 0.95, 0.95]],
  ["turn_axis", "high", "", 0.0, [1, 1, 1, 1]],
  ["turn_slender", "medium", "ratio", 4.0, [5.0, 6.0, 7.0, 8.0]],
  ["turn_offaxis", "high", "in", 0.0, [0.1, 0.2, 0.3, 0.4]],
  ["bore_depth", "medium", "ratio", 4.0, [5.0, 6.0, 7.0, 8.0]],
  ["thread_mismatch", "medium", "in", 0.000394, [0.004, 0.002, 0.001, 0.003]],
  ["hole_mismatch", "medium", "in", 0.000394, [0.004, 0.002, 0.001, 0.003]],
  ["blend_mismatch", "medium", "in", 0.000394, [0.004, 0.002, 0.001, 0.003]],
];

/** rows._lookup: the "rule|severity" entry, else the rule's. */
const lookup = <T>(table: Record<string, T>, rule: string, severity: string): T | undefined => table[`${rule}|${severity}`] ?? table[rule];

describe("every case", () => {
  // Each rule case on 1, 2 and 4 findings gives one row with a short title and a sentence that reads right.
  for (const n of [1, 2, 4]) {
    for (const [rule, severity, unit, limit, values] of CASES) {
      test(`${n}-${rule}-${severity}-${unit}`, () => {
        const found = values.slice(0, n).map((v, k) => finding(k + 1, rule, severity, v, limit, unit, `${rule} title ${v}`));
        const out = findingRows(found);
        expect(out.length).toBe(1);
        const [row] = out;
        expect(row.count).toBe(n);
        expect(row.severity).toBe(severity);
        expect(row.findings).toEqual(found.map((f) => f.id));
        expect(row.short).toBe(lookup(SHORTS, rule, severity));
        expect(row.range).toBe({ 1: "F1", 2: "F1 F2", 4: "F1–F4" }[n]);
        expect(row.features).toEqual(found.map((f) => f.feature));
        const s: string = row.sentence;
        expect(s.endsWith(".") && !s.includes("{"), s).toBe(true);
        const hasOwn = lookup(SENTENCES, rule, severity) !== undefined;
        const distinct = new Set(values.slice(0, n)).size;
        if (!hasOwn) {
          const worst = found.reduce((a, b) => (b.measured > a.measured ? b : a)).title;
          expect(s).toBe(distinct === 1 ? `${worst}.` : `${worst}. Worst of ${n}.`);
        } else if (rule === "corner_radius") {
          expect(s.startsWith(`Inside corner${n > 1 ? "s have" : " has"}`), s).toBe(true);
        } else if (distinct === 4) {
          expect(s, s).toContain("from ");
          expect(s, s).toContain(" to ");
        } else if (distinct === 2) {
          expect(s, s).toContain(" and ");
        }
      });
    }
  }
});

test("join and values", () => {
  expect(joinValues(["a"])).toBe("a");
  expect(joinValues(["a", "b"])).toBe("a and b");
  expect(joinValues(["a", "b", "c"])).toBe("a, b and c");
  expect(joinValues(["a", "b", "c", "d"])).toBe("from a to d");
  expect(valueText(0.03125, "in")).toBe("0.031 in (1/32)");
  expect(valueText(6.03, "ratio", 6.0)).toBe("6.03×"); // one decimal would read as the limit
  expect(valueText(9.6, "ratio", 6.0)).toBe("9.6×");
  expect(valueText(22.0, "deg")).toBe("22.0°");
  expect(idRange(["F1", "F3"])).toBe("F1 F3");
  expect(idRange(["F1", "F2", "F3"])).toBe("F1–F3");
});

test("many sentences, exact", () => {
  // The `many` template with 2, 3 and 4 distinct values, high to low; ratios a hair past the limit get 2 decimals.
  const row = (vals: number[], rule = "hole_depth", limit = 6.0, unit = "ratio"): string =>
    findingRows(vals.map((v, k) => finding(k + 1, rule, "medium", v, limit, unit)))[0].sentence;
  expect(row([7.2, 9.6])).toBe("9.6× and 7.2× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips).");
  expect(row([7.2, 9.6, 6.03])).toBe("9.6×, 7.2× and 6.03× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips).");
  expect(row([7.2, 9.6, 6.4, 8.0])).toBe("from 9.6× to 6.4× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips).");
  expect(row([7.2, 7.2])).toBe("7.2× the diameter deep. Over 6.0× needs peck drilling (drilling in short steps to clear chips).");
  expect(row([0.26, 0.262], "hole_size", 0.265625, "in")).toBe("0.262 in and 0.260 in aren't standard drills. Nearest is 0.266 in (17/64).");
  expect(row([8.0, 4.0], "pocket_depth", 3.0)).toBe("Depths are 8.0× and 4.0× the end mill that fits. Over 3.0× needs a long tool.");
  const one = findingRows([finding(1, "corner_radius", "high", 0.0, 0.03125, "in")])[0].sentence;
  expect(one).toBe("Inside corner has no radius. Needs 0.031 in (1/32) or more, or EDM (spark erosion).");
  const worst = findingRows([finding(1, "undercut", "medium", 0.1, 0.0, "in", "Small undercut"),
    finding(2, "undercut", "medium", 0.4, 0.0, "in", "Big undercut")])[0].sentence;
  expect(worst).toBe("Big undercut. Worst of 2.");
});

test("rows split by limit", () => {
  // Drill size findings with different nearest drills are separate rows (limit is in the group key).
  const found = [finding(1, "hole_size", "medium", 0.26, 0.265625, "in"), finding(2, "hole_size", "medium", 0.5, 0.5, "in")];
  expect(findingRows(found).map((r) => r.count)).toEqual([1, 1]);
});

describe("parts", () => {
  // Every part in tests/parts gives rows covering every finding once (the NIST files: test_nist.py).
  const names = readdirSync(PARTS).filter((f) => f.endsWith(".step")).map((f) => f.slice(0, -5)).sort()
    .filter((s) => !["no_solid", "not_step"].includes(s));
  test("the parts are collected", () => expect(names.length).toBeGreaterThanOrEqual(40));
  for (const stem of names) {
    test(stem, async () => {
      const process: Process = ["shaft", "as_turn"].some((k) => stem.includes(k)) ? "turn" : "mill";
      coversEveryFindingOnce(await run(stem, process, "al6061" as Material));
    });
  }
});

test("corner pocket", async () => {
  // S3 (D-049): each inside corner names the pocket it sits in, so Machining shows it in that pocket's setup.
  const r = await run("report_sample");
  const corners = r.features.filter((f: Result) => f.kind === "corner");
  expect(corners.map((c: Result) => c.pocket)).toEqual(Array(4).fill("pocket-1"));
  const pockets = new Set(r.features.filter((f: Result) => f.kind === "pocket").map((f: Result) => f.id));
  for (const name of ["pocket_sharp", "pocket_island", "pocket_small_radius"]) {
    const feats: Result[] = (await run(name)).features;
    const ids = new Set(feats.filter((f) => f.kind === "pocket").map((f) => f.id));
    const cs = feats.filter((f) => f.kind === "corner");
    expect(cs.length > 0 && cs.every((f) => ids.has(f.pocket)), name).toBe(true);
  }
  expect([...pockets]).toEqual(["pocket-1"]);
});

test("pocket passes", async () => {
  // Morgan, 2026-11-09 (D-052): a deep pocket says how many passes at a safe depth it takes; the tool still reaches
  // the full depth. report_sample's pocket: 0.250 in deep, 1/32 in end mill, 1x the tool per pass in aluminium.
  const r = await run("report_sample");
  const f = r.findings.filter((x: Result) => x.rule === "pocket_depth");
  expect(f.length).toBe(1);
  expect([f[0].passes, round(f[0].pass_in, 4)]).toEqual([8, 0.0312]);
  expect(f[0].suggestion.startsWith("Cut it in 8 passes of 0.031 in (1/32) each (at most 1× the tool per pass, "
    + "an estimate); the tool still reaches 0.250 in deep, so it is a long-reach "
    + "1/32 in end mill.")).toBe(true);
  const stainless = await run("report_sample", "mill", "ss304");
  const g = stainless.findings.filter((x: Result) => x.rule === "pocket_depth");
  expect(g.length).toBe(1);
  expect(g[0].passes).toBe(16); // 0.5x the tool per pass in stainless
});
