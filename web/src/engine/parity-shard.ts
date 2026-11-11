// Splits the parity index over N shards (port spec Parity, S8a: four processes). Greedy by size: the largest
// entry goes to the least-loaded shard, so each process gets about the same bytes to analyse. Deterministic: the
// same index and sizes give the same split, so a shard's files are the same on every run. No imports.

export function shardOf(sizes: number[], n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error(`shard count must be a whole number of 1 or more: ${n}`);
  const load = new Array<number>(n).fill(0);
  const shard = new Array<number>(sizes.length).fill(0);
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a] || a - b);
  for (const i of order) {
    let best = 0;
    for (let k = 1; k < n; k++) if (load[k] < load[best]) best = k;
    shard[i] = best;
    load[best] += sizes[i];
  }
  return shard;
}

// "k/n" (0-based k) as PARITY_SHARD gives it; "0/1" is the whole index.
export function parseShard(spec: string): { k: number; n: number } {
  const m = /^(\d+)\/(\d+)$/.exec(spec);
  if (!m) throw new Error(`PARITY_SHARD must look like "0/4": ${spec}`);
  const k = Number(m[1]), n = Number(m[2]);
  if (n < 1 || k >= n) throw new Error(`PARITY_SHARD ${spec}: k must be below n`);
  return { k, n };
}

// S8b (D-074): the faces whose point positions differ from the frozen Python key by tessellation only (measured per
// face on 2026-11-11 with Python OCC and the browser engine; both on the surface within 1.3e-4 mm). Keyed by the
// entry's path in tests/parity/key/index-*.json, by face index.
export const KNOWN_TESSELLATION: Record<string, number[]> = {
  "tests/grading/sets/bullnose_draft/bn_ball6.step": [14, 18],
  "tests/edmr/models/STEP/STI/nasty_cheese/nasty_cheese.stp": [202],
};
