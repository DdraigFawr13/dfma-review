// npm run parity:full: the parity run on the full set (port spec J2), before a slice's PR is marked ready.
// Reads the frozen key in tests/parity/key/ (S8a); the runner splits it over four processes.
import { spawnSync } from "node:child_process";

const run = spawnSync(process.execPath, ["scripts/parity-run.mjs"], { stdio: "inherit", env: { ...process.env, PARITY_SET: "full" } });
process.exit(run.status ?? 1);
