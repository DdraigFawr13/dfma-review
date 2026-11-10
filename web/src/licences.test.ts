// J6: the Licenses page names every runtime dependency in web/package.json (the build also fails when a package it
// bundles is missing: vite.config.ts licensesListed), and ships the engine's license texts.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const WEB = resolve(__dirname, "..");
const page = readFileSync(resolve(WEB, "public/licences.html"), "utf8");

test("every dependency in web/package.json is on the Licenses page, with its version", () => {
  const deps = JSON.parse(readFileSync(resolve(WEB, "package.json"), "utf8")).dependencies as Record<string, string>;
  for (const [name, version] of Object.entries(deps)) {
    expect(page, name).toContain(`>${name}<`);
    expect(page, `${name} ${version}`).toContain(version);
  }
});

test("the engine's license and exception, and the Apache-2.0 texts of the .ipt reader (S7), ship with the page", () => {
  expect(page).toContain("LGPL-2.1-only with the Open CASCADE exception 1.0");
  for (const f of ["licences/opencascade-LICENSE.txt", "licences/opencascade-OCCT-exception.txt", "fonts/OFL.txt",
    "licences/cfb-LICENSE.txt", "licences/adler-32-LICENSE.txt", "licences/crc-32-LICENSE.txt"]) {
    expect(page).toContain(`href="${f}"`);
    expect(existsSync(resolve(WEB, "public", f)), f).toBe(true);
  }
});
