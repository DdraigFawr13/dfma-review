// Diff two fingerprints (fingerprint.py = the app today, fingerprint.mjs = the fork).
// node compare.mjs .cache/py.json .cache/js.json
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2).map((p) => JSON.parse(readFileSync(p, 'utf8')));
const REL = 1e-6; // areas and volumes: relative
const ABS = 1e-6; // radii (mm), angles (deg), direction components

const rel = (x, y) => Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1e-12);
const worst = { area: 0, volume: 0, r: 0, dir: 0, deg: 0, bbox: 0 };
let filesSame = 0, facesTotal = 0, facesSame = 0;
const misses = [];

for (const name of Object.keys(a).sort()) {
  const p = a[name], q = b[name];
  const bad = [];
  if (!q) { misses.push(`${name}: missing from the fork's run`); continue; }
  if (p.error || q.error) { if (p.error !== q.error) bad.push(`error ${p.error} vs ${q.error}`); }
  else {
    for (const k of ['ignored_solids', 'free_edges', 'edges']) if (p[k] !== q[k]) bad.push(`${k} ${p[k]} vs ${q[k]}`);
    worst.volume = Math.max(worst.volume, rel(p.volume, q.volume));
    if (rel(p.volume, q.volume) > REL) bad.push(`volume ${p.volume} vs ${q.volume}`);
    if (rel(p.area, q.area) > REL) bad.push(`area ${p.area} vs ${q.area}`);
    const db = Math.max(...p.bbox.map((v, i) => Math.abs(v - q.bbox[i])));
    worst.bbox = Math.max(worst.bbox, db);
    if (db > 1e-3) bad.push(`bbox differs by ${db} mm`);
    if (p.faces.length !== q.faces.length) bad.push(`faces ${p.faces.length} vs ${q.faces.length}`);
    else {
      p.faces.forEach((f, i) => {
        const g = q.faces[i];
        facesTotal++;
        const d = [];
        if (f.kind !== g.kind) d.push(`kind ${f.kind} vs ${g.kind}`);
        if (f.rev !== g.rev) d.push('orientation');
        if (JSON.stringify(f.n) !== JSON.stringify(g.n)) d.push('neighbours');
        const ra = rel(f.area, g.area); worst.area = Math.max(worst.area, ra); if (ra > REL) d.push(`area ${f.area} vs ${g.area}`);
        for (const k of ['r', 'r2', 'deg']) if (k in f) {
          const e = Math.abs(f[k] - g[k]); worst[k === 'deg' ? 'deg' : 'r'] = Math.max(worst[k === 'deg' ? 'deg' : 'r'], e);
          if (!(e <= ABS)) d.push(`${k} ${f[k]} vs ${g[k]}`);
        }
        if (f.dir) {
          const e = Math.max(...f.dir.map((v, j) => Math.abs(v - g.dir[j]))); worst.dir = Math.max(worst.dir, e);
          if (!(e <= 1e-5)) d.push(`dir ${f.dir} vs ${g.dir}`);
        }
        if (d.length) bad.push(`face ${i}: ${d.join(', ')}`); else facesSame++;
      });
    }
  }
  if (bad.length) misses.push(`${name}: ${bad.slice(0, 5).join('; ')}${bad.length > 5 ? `; +${bad.length - 5} more` : ''}`);
  else filesSame++;
}
const t = (o) => Object.values(o).filter((v) => v.read_s).reduce((s, v) => s + v.read_s, 0);
console.log(`files identical: ${filesSame} of ${Object.keys(a).length}`);
console.log(`faces identical: ${facesSame} of ${facesTotal}`);
console.log('largest difference:', JSON.stringify(worst));
console.log(`total read time: app ${t(a).toFixed(2)} s, fork ${t(b).toFixed(2)} s`);
for (const m of misses) console.log('MISS', m);
