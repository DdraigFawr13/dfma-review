// Port of tests/service/test_audit_wording.py. The 2026-11-09 UX audit's wording (docs/audit/2026-11-09-ux.md,
// D-053): messages a user reads carry no decision ids or file names (F1), say what to do (F3, F11), spell American
// (F12) and gloss their jargon (F13).
// Not ported: test_f3_only_a_timeout_offers_to_try_again posted to the FastAPI app (service/app.py) with a stubbed
// run_analysis; the browser's counterpart (worker.ts, engine-client.ts retry flags) needs a Worker, so it is the
// browser lane's (web/e2e).
import { beforeAll, describe, expect, test } from "vitest";
import * as settings from "../settings";
import { PARTS, run, analyzeBytes, type Result } from "./helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INTERNAL = /D-0\d\d|config\/|\(spec\b/;
const BRITISH = /analys(?:e|ed|es|ing)\b|neighbour|millimetre|colour|centre/i;
const MESSAGES = Object.entries(settings).filter(([k, v]) => k.startsWith("MSG_") && typeof v === "string").map(([, v]) => v as string);
const SHOWN = ["title", "suggestion", "limit_text", "check"]; // a finding's fields the screen and the PDF print

let results: Result[];
beforeAll(async () => {
  results = [await run("report_sample"),
    await analyzeBytes(new Uint8Array(readFileSync(resolve(PARTS, "shaft_with_groove_and_bore.step"))), "shaft.step", "turn")];
}, 60_000);

function shown(r: Result): string[] {
  const out: string[] = [...r.assumptions, ...r.checks_run];
  for (const f of r.findings) for (const k of SHOWN) out.push(f[k]);
  for (const row of [...r.rows, ...r.passed_rows]) for (const k of ["short", "sentence", "check", "limit"]) out.push(row[k]);
  for (const p of r.passed) for (const k of ["title", "math", "limit_text"]) out.push(p[k]);
  return out;
}
const allTexts = () => [...MESSAGES, ...settings.ASSUMPTIONS, ...settings.TURN_ASSUMPTIONS, ...results.flatMap(shown)];

test("the settings messages are collected", () => {
  expect(MESSAGES.length).toBeGreaterThan(10); // a changed export name must not empty the F1 and F12 checks
});

test("f1: no ids or file names", () => {
  expect(allTexts().filter((t) => INTERNAL.test(t))).toEqual([]);
});

test("f12: American spelling", () => {
  expect(allTexts().filter((t) => BRITISH.test(t))).toEqual([]);
});

test("f3: errors say how to fix them", () => {
  expect(settings.MSG_NOT_STEP.endsWith("Export it again as .step or .stp from your CAD.")).toBe(true);
  expect(settings.MSG_NO_SOLID.endsWith("Export the part as a solid body, not surfaces or a drawing.")).toBe(true);
  expect(settings.MSG_TOO_LARGE.endsWith("Export a single body or a smaller part.")).toBe(true);
  expect(settings.MSG_TOO_LONG.endsWith("Try again; if it stops again, export a single body or a smaller part.")).toBe(true);
  for (const m of [settings.MSG_IPT_TOO_BIG, settings.MSG_IPT_NO_MODEL, settings.MSG_IPT_FORMAT]) {
    expect(m.endsWith("Upload the STEP on its own, without the .ipt."), m).toBe(true);
  }
});

test("f11: warnings end with an action", () => {
  expect(settings.MSG_OPEN_SHELL.endsWith("Check the file for gaps and export it again.")).toBe(true);
  expect(settings.MSG_NO_UNIT.endsWith("Set the unit in your CAD export, then upload again.")).toBe(true);
});

describe("f13: jargon glossed", () => {
  test("rows, findings and the .ipt format message", () => {
    expect(settings.MSG_IPT_FORMAT).not.toContain("ACIS");
    const sentences = Object.fromEntries(results[0].rows.map((row: Result) => [row.rule, row.sentence]));
    expect(sentences.corner_radius).toContain("EDM (spark erosion)");
    expect(sentences.hole_depth).toContain("peck drilling (drilling in short steps to clear chips)");
    const byRule = Object.fromEntries(results[0].findings.map((f: Result) => [f.rule, f])); // the PDF prints titles and advice: glossed there too
    const title = results[0].findings.find((f: Result) => f.rule === "corner_radius" && f.severity === "high").title;
    expect(title).toContain("EDM (spark erosion)");
    expect(byRule.hole_depth.suggestion).toContain("peck drilling (drilling in short steps");
  });
});

test("f14: wall math in its title's decimals", async () => {
  const wall = results[0].passed.find((p: Result) => p.feature === "wall-1");
  expect(wall.math).toBe("4.000 in ≥ 0.030 in");
  const holes = (await run("clean_holes")).passed;
  const depth: string[] = holes.filter((p: Result) => p.rule === "hole_depth").map((p: Result) => p.math);
  expect(depth.length).toBeGreaterThan(0);
  for (const m of depth) expect(m, m).toMatch(/^\d+\.\d{3} in deep ÷ \d+\.\d{3} in diameter/);
});
