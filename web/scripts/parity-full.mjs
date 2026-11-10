// npm run parity:full: the parity run on the full set (port spec J2), before a slice's PR is marked ready.
// Needs the key: python tests/parity/key.py --set full (in the dfma environment).
import { spawnSync } from "node:child_process";

const run = spawnSync("npx", ["vitest", "run", "--silent=false", "--config", "vitest.parity.config.ts", "src/engine/parity.test.ts"],
  { stdio: "inherit", env: { ...process.env, PARITY_SET: "full" }, shell: process.platform === "win32" });
process.exit(run.status ?? 1);
