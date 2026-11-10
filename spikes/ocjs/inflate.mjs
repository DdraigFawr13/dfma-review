import { readFileSync } from 'node:fs';
import { inflateSync, constants } from 'node:zlib';
import CFB from 'cfb';
// node inflate.mjs: DecompressionStream("deflate") against node:zlib on every .ipt model stream (spec Decisions)
const dir = '../../tests/inventor/files/';
let ok = 0, fail = 0, same = 0, n = 0;
for (const f of (await import('node:fs')).readdirSync(dir).filter((x) => x.endsWith('.ipt'))) {
  const c = CFB.read(readFileSync(dir + f), { type: 'buffer' });
  for (const [i, e] of c.FileIndex.entries()) {
    if (e.type !== 2 || !c.FullPaths[i].includes('RSeStorage/B')) continue;
    const raw = Buffer.from(e.content); const k = raw.indexOf('x^'); if (k < 0) continue;
    let ref; try { ref = inflateSync(raw.subarray(k), { finishFlush: constants.Z_SYNC_FLUSH }); } catch { continue; }
    n++;
    try {
      const out = Buffer.from(await new Response(new Blob([raw.subarray(k)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
      ok++; if (out.equals(ref)) same++;
    } catch (err) { fail++; }
  }
}
console.log({ streams: n, decompressed: ok, refused: fail, identical: same });
