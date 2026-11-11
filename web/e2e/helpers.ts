// Shared helpers for the browser e2e tests (ported from tests/e2e/steps.py, tests/helpers.py and conftest.py in S8b).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import { parse } from "smol-toml";

/** tests/parts: the STEP test parts (committed) and expected.toml (their face counts and sizes). */
export const PARTS = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../tests/parts");

export interface ExpectedPart {
  name: string;
  face_count?: number;
  [key: string]: unknown;
}

/** One entry of tests/parts/expected.toml, by name (helpers.py `expected`). */
export function expected(name: string): ExpectedPart {
  const doc = parse(readFileSync(resolve(PARTS, "expected.toml"), "utf8")) as { part?: ExpectedPart[] };
  const part = (doc.part ?? []).find((p) => p.name === name);
  if (!part) throw new Error(`no part named ${name} in expected.toml`);
  return part;
}

export const STEPS = ["part", "features", "machining", "cost", "report"] as const;
export type Step = (typeof STEPS)[number];

/** Tap the step's tab and wait until its section shows (steps.py `open_step`). */
export async function openStep(page: Page, name: Step | string): Promise<void> {
  await page.getByTestId(`step-${name}`).click();
  await expect(page.getByTestId(`page-${name}`)).toBeVisible();
}

/** Open the app, pick a STEP file and wait for the overview (steps.py `load`). */
export async function load(page: Page, file: string, timeout = 60_000): Promise<void> {
  await page.goto("/");
  await page.getByTestId("upload-file").setInputFiles(file);
  await expect(page.getByTestId("overview")).toBeVisible({ timeout });
}

/** Wait until the part `name` is read, then open `step` (steps.py `shown`). */
export async function shown(page: Page, name: string, step: Step | string | null = "features", timeout = 60_000): Promise<void> {
  await expect(page.locator("#status")).toContainText(`Showing ${name}`, { timeout });
  await expect(page.getByTestId("overview")).toBeVisible();
  if (step) await openStep(page, step);
}

/** Wait for the analysis an action starts: the browser copy's worker (steps.py `reanalysis`; the service path is gone in S8b). */
export function reanalysis(page: Page, timeout = 30_000) {
  return page.waitForEvent("worker", { timeout });
}
