// Port of tests/service/test_edmr.py: the EDMR subset (tests/edmr): every file is scored, and no result gets worse
// (D-011). Each file runs in its own Node process (grading/run.ts, the browser engine's worker-per-file), so a file that
// aborts the engine is a "crash" result, not a dead test run. Status order: crash < read_error < ok.
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse } from "smol-toml";
import { expect, test } from "vitest";
import { runChild } from "../../grading/run";
import { edmrFiles } from "../../grading/scorecard";

const HERE = join(resolve(__dirname, "../../../.."), "tests", "edmr");
interface Card { path: string; status: string; face_count: number; not_analysed: number; features: number }
const SCORECARD = Object.fromEntries(((parse(readFileSync(join(HERE, "scorecard.toml"), "utf8")) as { file: Card[] }).file).map((f) => [f.path, f]));
const FILES = edmrFiles();
const RANK: Record<string, number> = { crash: 0, read_error: 1, ok: 2 };
const rel = (p: string) => relative(HERE, p).split("\\").join("/");

test("every file is scored", () => {
  expect(FILES.length).toBe(113);
  expect(FILES.map(rel).sort()).toEqual(Object.keys(SCORECARD).sort());
});

// A file that takes the process down is a crash result in a second or two; a slow one can take most of a minute
test.each(FILES.map((p) => [p.split("/").pop()!.replace(/\.[^.]*$/, ""), p]))("%s", async (_stem, path) => {
  const now = (await runChild("counts", path, 120)) as unknown as Card;
  const status = now.status === "ok" || now.status === "read_error" ? now.status : "crash"; // scorecard.ts: a timeout is a crash
  const was = SCORECARD[rel(path)];
  expect(RANK[status], `${path.split("/").pop()}: ${was.status} -> ${status}`).toBeGreaterThanOrEqual(RANK[was.status]);
  if (status === "ok" && was.status === "ok") {
    expect(now.face_count).toBe(was.face_count);
    expect(now.not_analysed).toBeLessThanOrEqual(was.not_analysed);
    expect(now.features).toBeGreaterThanOrEqual(was.features);
  }
}, 150_000);
