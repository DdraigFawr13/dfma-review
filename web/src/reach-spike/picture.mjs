// Reach spike: one picture for Morgan's status page. CTC 02 from +Z: height as shade (dark low, light high), cells a
// 1/4 in flat end mill (with the holder) cannot reach hatched red. node src/reach-spike/picture.mjs <part.f32> <out.png>
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dilateDisk, erodeDisk, heightMap, pool, TOL_MM } from "./heightmap.ts";

const [file, out] = process.argv.slice(2);
const soup = new Float32Array(readFileSync(file).buffer.slice(0));
const cell = 0.8, d = 6.35, holderR = 25.4;
const g = heightMap(soup, 4, cell);
const m = Math.max(1, Math.round(holderR / 8 / cell)), pg = pool(g, m);
const holder = dilateDisk(pg.h, pg.nu, pg.nv, Math.ceil(holderR / pg.cell));
const r = Math.round(d / 2 / cell), T = dilateDisk(g.h, g.nu, g.nv, r);
for (let j = 0; j < g.nv; j++) for (let i = 0; i < g.nu; i++) {
  const at = j * g.nu + i, hl = holder[Math.floor(j / m) * pg.nu + Math.floor(i / m)] - 4 * d;
  if (hl > T[at]) T[at] = hl;
}
const M = erodeDisk(T, g.nu, g.nv, r);
let lo = Infinity, hi = -Infinity, left = 0;
for (const h of g.h) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
const W = g.nu, H = g.nv, px = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  const j = H - 1 - y; // +v up
  px[y * (W * 4 + 1)] = 0;
  for (let i = 0; i < W; i++) {
    const at = j * W + i, s = (g.h[at] - lo) / (hi - lo), o = y * (W * 4 + 1) + 1 + i * 4;
    let c = [Math.round(40 + 180 * s), Math.round(55 + 175 * s), Math.round(75 + 170 * s)];
    if (M[at] - g.h[at] > TOL_MM) { left++; if ((i + y) % 6 < 3) c = [179, 38, 30]; }
    px.set([...c, 255], o);
  }
}
const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(t, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(px)), chunk("IEND", Buffer.alloc(0))]));
console.log(JSON.stringify({ grid: `${W}x${H}`, cell_mm: cell, tool_mm: d, leftover_cells: left, leftover_share: +(left / (W * H)).toFixed(3) }));
