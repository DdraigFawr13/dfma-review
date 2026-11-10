// Port of service/dfma/inventor/names.py: Hole feature names by the rank rule (spec I2+I3 "Names", D-039). Hole names
// are UTF-16 texts `Hole<n>` in the smallest `RSeStorage/B` stream that has an `RSeStorage/M` partner and holds at
// least one. Where their count equals the count of Hole features, the k-th smallest feature id has the k-th name by
// number. English default names only: any other count gives no names (fails safe).
import { ReadError } from "../read";
import type { Ipt } from "./ole";

const HOLE = /^Hole\d{1,9}$/;

/** Printable UTF-16LE runs of 3 to 60 characters, as the regex (?:[\x20-\x7e]\x00){3,60} finds them. */
function texts(d: Uint8Array): string[] {
  const out: string[] = [];
  let i = 0;
  while (i + 1 < d.length) {
    let n = 0;
    while (n < 60 && i + 2 * n + 1 < d.length && d[i + 2 * n] >= 0x20 && d[i + 2 * n] <= 0x7e && d[i + 2 * n + 1] === 0) n++;
    if (n >= 3) {
      let s = "";
      for (let k = 0; k < n; k++) s += String.fromCharCode(d[i + 2 * k]);
      out.push(s);
      i += 2 * n;
    } else i += 1;
  }
  return out;
}

/** The distinct `Hole<n>` texts of that stream, sorted by number; [] when no stream holds any. */
export function holeNames(f: Ipt): string[] {
  let best: [number, string, Set<string>] | null = null;
  const all = new Set(f.names);
  for (const name of [...f.names].sort()) {
    if (!name.startsWith("RSeStorage/B") || !all.has("RSeStorage/M" + name.slice("RSeStorage/B".length))) continue;
    let data: Uint8Array | null;
    try {
      data = f.inflate(name);
    } catch (e) {
      if (e instanceof ReadError) continue;
      throw e;
    }
    if (data === null || (best !== null && data.length >= best[0])) continue; // ties on size go to the first name
    const found = new Set(texts(data).filter((t) => HOLE.test(t)));
    if (found.size) best = [data.length, name, found];
  }
  return best ? [...best[2]].sort((a, b) => Number(a.slice(4)) - Number(b.slice(4))) : [];
}

/** The rank rule: the k-th smallest feature id gets the k-th name, only when the counts are equal. */
export function assign(features: { feature_id: number; name: string | null }[], names: string[]): void {
  if (names.length !== features.length) return;
  const sorted = [...features].sort((a, b) => a.feature_id - b.feature_id);
  sorted.forEach((feat, k) => { feat.name = names[k]; });
}

/** A thread's name is its Hole feature's; a thread whose id is no Hole feature's gets null. */
export function nameThreads(threads: { feature_id: number | null; feature_name: string | null }[],
  features: { feature_id: number; name: string | null }[]): void {
  const byId = new Map(features.map((x) => [x.feature_id, x.name]));
  for (const t of threads) t.feature_name = t.feature_id !== null ? (byId.get(t.feature_id) ?? null) : null;
}
