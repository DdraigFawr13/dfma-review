// settings.ts must hold the names and values of settings.py as the Python app had them (port spec Design "settings.ts").
// S8b: settings.py is retired; its dump is frozen in tests/parity/key/settings.json (written by key.py --settings before S8b).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import * as settings from "./settings";

const DUMP = resolve(__dirname, "../../../tests/parity/key/settings.json");

test("settings.ts equals the frozen settings.py dump", () => {
  expect(existsSync(DUMP), `${DUMP} is missing (the frozen settings dump)`).toBe(true);
  const python = JSON.parse(readFileSync(DUMP, "utf8")) as Record<string, unknown>;
  const ours = Object.fromEntries(Object.entries(settings).filter(([k]) => /^[A-Z][A-Z0-9_]*$/.test(k)));
  expect(Object.keys(ours).sort()).toEqual(Object.keys(python).sort());
  for (const [k, v] of Object.entries(python)) expect(ours[k], k).toEqual(v);
});

test("the config loaders read config/*.toml", () => {
  expect(Object.keys(settings.thresholds("al6061")).length).toBeGreaterThan(0);
  expect(Object.keys(settings.toolsConfig()).length).toBeGreaterThan(0);
  expect(Object.keys(settings.driversConfig()).length).toBeGreaterThan(0);
});

test("the parity compare's MSG_FAILED is settings' (compare.ts keeps its own copy to stay import-free)", async () => {
  const { MSG_FAILED } = await import("./compare");
  expect(MSG_FAILED).toBe(settings.MSG_FAILED);
});
