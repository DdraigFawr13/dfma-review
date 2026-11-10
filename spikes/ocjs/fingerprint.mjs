// The same fingerprint as fingerprint.py, from @taucad/opencascade.js (OCCT 8.0.0 in WebAssembly).
// node fingerprint.mjs <step folder> <out.json>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import init from '@taucad/opencascade.js';
import { fingerprint } from './core.mjs';

const WASM_DIR = dirname(fileURLToPath(import.meta.resolve('@taucad/opencascade.js/wasm')));

async function load(opts = {}) {
  return init({ locateFile: (f) => join(WASM_DIR, f), ...opts });
}

// Node entry: copy each file into the wasm file system, fingerprint it, write the JSON.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [folder, outPath] = process.argv.slice(2);
  const t0 = performance.now();
  const oc = await load();
  console.log('init', ((performance.now() - t0) / 1000).toFixed(2), 's');
  const result = {};
  for (const name of readdirSync(folder).filter((n) => n.endsWith('.stp')).sort()) {
    oc.FS.writeFile('/in.stp', readFileSync(join(folder, name)));
    try { result[name] = fingerprint(oc, '/in.stp'); } catch (e) { result[name] = { error: String(e) }; }
    oc.FS.unlink('/in.stp');
    console.log(name, result[name].faces?.length ?? result[name].error, 'faces', (result[name].read_s ?? 0).toFixed(2), 's',
      'rss', (process.memoryUsage().rss / 2 ** 20).toFixed(0), 'MB');
  }
  writeFileSync(outPath, JSON.stringify(result));
}
