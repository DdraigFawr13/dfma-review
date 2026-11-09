// The same as ipt_py.py from the cfb package (SheetJS, Apache-2.0) and node:zlib.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync, constants } from 'node:zlib';
import CFB from 'cfb';
const [dir, outPath] = process.argv.slice(2);
const sha = (b) => createHash('sha256').update(b).digest('hex');
function inflate(raw) { // from the first zlib header "x^", ignoring what follows the stream (olefile's decompressobj)
  const k = Buffer.from(raw).indexOf('x^');
  if (k < 0) return null;
  try { return inflateSync(Buffer.from(raw).subarray(k), { finishFlush: constants.Z_SYNC_FLUSH }); } catch { return null; }
}
const out = {};
for (const name of readdirSync(dir).filter((n) => n.endsWith('.ipt')).sort()) {
  const c = CFB.read(readFileSync(join(dir, name)), { type: 'buffer' });
  const streams = {};
  c.FileIndex.forEach((e, i) => {
    if (e.type !== 2) return; // streams only
    const path = c.FullPaths[i].split('/').slice(1).filter(Boolean).join('/');
    const d = inflate(e.content);
    streams[path] = [sha(e.content), path.startsWith('RSeStorage/B') ? (d && d.length ? sha(d) : null) : null];
  });
  out[name] = streams;
}
writeFileSync(outPath, JSON.stringify(out));
