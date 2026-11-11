// Reach spike (D-085 step 1): a CPU height-map rasteriser and flat-end-mill reach, for timing only. Written in
// erasable TypeScript only, so Node strips its types and the same file runs in a Node worker and a browser worker.
// Not part of the app: nothing in src/ outside src/reach-spike/ imports it.
//
// Height map for direction d (the side the tool comes from): over a grid on the plane across d, the highest
// point of the part along d at each cell centre (H). A flat end mill of radius R with its tip at a cell stops at
// T = the highest H within R of the cell (a disk dilation). The holder, a cylinder of radius RH from L above the tip,
// stops the tip at (highest H within RH) - L, so the tip at q stops at T'(q) = max(T(q), holder(q) - L). Material at
// a cell is cut when any tool position within R of it gets down there: the as-milled surface is M(p) = the lowest
// T' within R of p (a disk opening of H). A cell is left over when M > H + TOL.

export const DIRS = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as const;
const AXES: [number, number, number, number][] = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 0, 2, 1], [1, 0, 2, -1], [2, 0, 1, 1], [2, 0, 1, -1]]; // [h, u, v, sign]
export const TOL_MM = 0.01;

export interface Grid { nu: number; nv: number; cell: number; h: Float32Array; floor: number }

/** H for direction index k (DIRS) at cell size `cell` mm; cells the part does not cover get the stock floor. */
export function heightMap(soup: Float32Array, k: number, cell: number): Grid {
  const [ah, au, av, s] = AXES[k];
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, floor = Infinity;
  for (let i = 0; i < soup.length; i += 3) {
    const u = soup[i + au], v = soup[i + av], h = s * soup[i + ah];
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; if (h < floor) floor = h;
  }
  const nu = Math.floor((u1 - u0) / cell) + 1, nv = Math.floor((v1 - v0) / cell) + 1;
  const H = new Float32Array(nu * nv).fill(-Infinity);
  for (let t = 0; t < soup.length; t += 9) {
    const ax = (soup[t + au] - u0) / cell, ay = (soup[t + av] - v0) / cell, ah0 = s * soup[t + ah];
    const bx = (soup[t + 3 + au] - u0) / cell, by = (soup[t + 3 + av] - v0) / cell, bh = s * soup[t + 3 + ah];
    const cx = (soup[t + 6 + au] - u0) / cell, cy = (soup[t + 6 + av] - v0) / cell, ch = s * soup[t + 6 + ah];
    // vertices always mark their own cell (keeps edges thinner than a cell)
    splat(H, nu, ax, ay, ah0); splat(H, nu, bx, by, bh); splat(H, nu, cx, cy, ch);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue; // seen edge-on: a wall
    const i0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx))), i1 = Math.min(nu - 1, Math.floor(Math.max(ax, bx, cx)));
    const j0 = Math.max(0, Math.ceil(Math.min(ay, by, cy))), j1 = Math.min(nv - 1, Math.floor(Math.max(ay, by, cy)));
    const inv = 1 / area, eps = -1e-9;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const w0 = ((bx - i) * (cy - j) - (by - j) * (cx - i)) * inv;
        const w1 = ((cx - i) * (ay - j) - (cy - j) * (ax - i)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < eps || w1 < eps || w2 < eps) continue;
        const h = w0 * ah0 + w1 * bh + w2 * ch, at = j * nu + i;
        if (h > H[at]) H[at] = h;
      }
    }
  }
  for (let i = 0; i < H.length; i++) if (H[i] === -Infinity) H[i] = floor;
  return { nu, nv, cell, h: H, floor };
}

function splat(H: Float32Array, nu: number, x: number, y: number, h: number) {
  const at = Math.round(y) * nu + Math.round(x);
  if (h > H[at]) H[at] = h;
}

/** Sliding max of width 2w+1 along one row (van Herk / Gil-Werman, O(n)). */
function rowMax(src: Float32Array, off: number, n: number, w: number, out: Float32Array, g: Float32Array, hh: Float32Array) {
  if (w === 0) { for (let i = 0; i < n; i++) out[i] = src[off + i]; return; }
  const p = 2 * w + 1;
  for (let i = 0; i < n; i++) g[i] = i % p === 0 ? src[off + i] : Math.max(g[i - 1], src[off + i]);
  for (let i = n - 1; i >= 0; i--) hh[i] = (i % p === p - 1 || i === n - 1) ? src[off + i] : Math.max(hh[i + 1], src[off + i]);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n - 1, i + w);
    if (Math.floor(a / p) !== Math.floor(b / p)) { out[i] = Math.max(hh[a], g[b]); continue; }
    let x = src[off + a]; // a clipped window inside one block (row ends only)
    for (let q = a + 1; q <= b; q++) if (src[off + q] > x) x = src[off + q];
    out[i] = x;
  }
}

/** Disk dilation of radius r cells: each cell takes the highest value within r (exact on cell centres). */
export function dilateDisk(src: Float32Array, nu: number, nv: number, r: number): Float32Array {
  const out = new Float32Array(nu * nv).fill(-Infinity);
  if (r <= 0) { out.set(src); return out; }
  // one row-dilated image per distinct chord half-width
  const widths = new Map<number, Float32Array>();
  for (let dy = 0; dy <= r; dy++) widths.set(Math.floor(Math.sqrt(r * r - dy * dy)), new Float32Array(0));
  const tmp = new Float32Array(nu), g = new Float32Array(nu), hh = new Float32Array(nu);
  for (const w of widths.keys()) {
    const img = new Float32Array(nu * nv);
    for (let j = 0; j < nv; j++) { rowMax(src, j * nu, nu, w, tmp, g, hh); img.set(tmp, j * nu); }
    widths.set(w, img);
  }
  for (let dy = -r; dy <= r; dy++) {
    const img = widths.get(Math.floor(Math.sqrt(r * r - dy * dy)))!;
    for (let j = Math.max(0, -dy); j < Math.min(nv, nv - dy); j++) {
      const o = j * nu, q = (j + dy) * nu;
      for (let i = 0; i < nu; i++) if (img[q + i] > out[o + i]) out[o + i] = img[q + i];
    }
  }
  return out;
}

/** Max-pool by m×m blocks (a coarser, higher map: used for the holder). */
export function pool(g: Grid, m: number): Grid {
  const nu = Math.ceil(g.nu / m), nv = Math.ceil(g.nv / m), h = new Float32Array(nu * nv).fill(-Infinity);
  for (let j = 0; j < g.nv; j++) for (let i = 0; i < g.nu; i++) {
    const at = Math.floor(j / m) * nu + Math.floor(i / m), x = g.h[j * g.nu + i];
    if (x > h[at]) h[at] = x;
  }
  return { nu, nv, cell: g.cell * m, h, floor: g.floor };
}

/** Disk erosion: each cell takes the lowest value within r. */
export function erodeDisk(src: Float32Array, nu: number, nv: number, r: number): Float32Array {
  const neg = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) neg[i] = -src[i];
  const out = dilateDisk(neg, nu, nv, r);
  for (let i = 0; i < out.length; i++) out[i] = -out[i];
  return out;
}

export interface ToolResult { d_mm: number; cell_mm: number; cells: number; r_cells: number; leftover_cells: number; leftover_mm3: number; ms: number }
export interface DirResult { dir: string; raster_ms: number; holder_ms: number; tools: ToolResult[] }

/** One direction, every tool (diameters in mm) on its own grid: cell = cellFor(D). A grid and its holder map are made
 *  once per cell size. Holder: radius holderR mm from 4·D above the tip. */
export function reachOneDir(soup: Float32Array, k: number, toolsMm: number[], cellFor: (d: number) => number, holderR = 25.4): DirResult {
  const now = () => performance.now();
  const grids = new Map<number, { g: Grid; m: number; pg: Grid; holder: Float32Array }>();
  let raster_ms = 0, holder_ms = 0;
  const tools: ToolResult[] = [];
  for (const d of toolsMm) {
    const cell = cellFor(d);
    let e = grids.get(cell);
    if (!e) {
      let t = now();
      const g = heightMap(soup, k, cell);
      raster_ms += now() - t;
      t = now();
      const m = Math.max(1, Math.round(holderR / 8 / cell)); // holder on a coarse grid, cell about holderR/8
      const pg = pool(g, m);
      e = { g, m, pg, holder: dilateDisk(pg.h, pg.nu, pg.nv, Math.ceil(holderR / pg.cell)) };
      holder_ms += now() - t;
      grids.set(cell, e);
    }
    const t = now();
    const { g, m, pg, holder } = e;
    const r = Math.max(1, Math.round(d / 2 / cell));
    const T = dilateDisk(g.h, g.nu, g.nv, r);
    const L = 4 * d;
    for (let j = 0; j < g.nv; j++) {
      const hr = Math.floor(j / m) * pg.nu;
      for (let i = 0; i < g.nu; i++) { const at = j * g.nu + i, hl = holder[hr + Math.floor(i / m)] - L; if (hl > T[at]) T[at] = hl; }
    }
    const M = erodeDisk(T, g.nu, g.nv, r);
    let n = 0, vol = 0;
    for (let i = 0; i < M.length; i++) { const gap = M[i] - g.h[i]; if (gap > TOL_MM) { n++; vol += gap; } }
    tools.push({ d_mm: d, cell_mm: cell, cells: g.nu * g.nv, r_cells: r, leftover_cells: n, leftover_mm3: vol * cell * cell, ms: now() - t });
  }
  return { dir: DIRS[k], raster_ms, holder_ms, tools };
}
