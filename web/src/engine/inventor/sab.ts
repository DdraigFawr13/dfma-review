// Port of service/dfma/inventor/sab.py: split the ACIS binary (SAB) model inside an .ipt into records. A record is a
// list of tagged values ending with tag 0x11; tags 0x0d/0x0e at a record's start make its name (parts joined with
// '-'). Every length is checked against the data, pointers are checked where they are used (`ref`), and an unknown
// tag raises MSG_IPT_FORMAT. Lengths in the model are cm.
import { ReadError } from "../read";
import { MSG_IPT_FORMAT } from "../settings";
import { latin1 } from "./ole";

export const HEADER = [0x0d, 0x09, ...Array.from("asmheader", (c) => c.charCodeAt(0))];

export type Vec = [number, number, number];
// 's' str, 'i' int, 'p' pointer, 'd' float, 'v' 3-vector, 'v2' 2-vector, 'b' bool, '{' / '}' brackets
export type Value = ["s", string] | ["i", number] | ["p", number] | ["d", number] | ["v", Vec] | ["v2", [number, number]]
  | ["b", boolean] | ["{", null] | ["}", null];

export class Record {
  constructor(readonly name: string | null, readonly values: Value[] = []) {}

  of(kind: "s"): string[];
  of(kind: "i" | "p" | "d"): number[];
  of(kind: "v"): Vec[];
  of(kind: "b"): boolean[];
  of(kind: string): unknown[];
  of(kind: string): unknown[] {
    const out: unknown[] = [];
    for (const [k, v] of this.values) if (k === kind) out.push(v);
    return out;
  }
}

// tag -> (kind, reader, size)
type Fixed = [Value[0], (dv: DataView, i: number) => number | number[], number];
const F: { [t: number]: Fixed } = {};
F[0x04] = ["i", (dv, i) => dv.getInt32(i, true), 4];
F[0x15] = ["i", (dv, i) => dv.getInt32(i, true), 4];
F[0x0c] = ["p", (dv, i) => dv.getInt32(i, true), 4];
F[0x06] = ["d", (dv, i) => dv.getFloat64(i, true), 8];
F[0x13] = ["v", (dv, i) => [dv.getFloat64(i, true), dv.getFloat64(i + 8, true), dv.getFloat64(i + 16, true)], 24];
F[0x14] = ["v", (dv, i) => [dv.getFloat64(i, true), dv.getFloat64(i + 8, true), dv.getFloat64(i + 16, true)], 24];
F[0x16] = ["v2", (dv, i) => [dv.getFloat64(i, true), dv.getFloat64(i + 8, true)], 16];
F[0x03] = ["i", (dv, i) => dv.getInt16(i, true), 2];
F[0x02] = ["i", (dv, i) => dv.getUint8(i), 1];
F[0x05] = ["d", (dv, i) => dv.getFloat32(i, true), 4];

const DIGITS = /^[0-9²³¹]/; // Python's str.isdigit() on a latin1 character

/** Records from offset `start` (the 0x0d tag of `asmheader`) up to `End-of-ASM-data` or the history section.
 *  Returns [version, records]. */
export function split(d: Uint8Array, start: number): [string, Record[]] {
  let version = "unknown";
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const fail = (): never => {
    throw new ReadError(MSG_IPT_FORMAT.replace("{version}", version));
  };
  const take = (i: number, n: number): Uint8Array => {
    if (n < 0 || i + n > d.length) fail();
    return d.subarray(i, i + n);
  };
  let i = start;
  const recs: Record[] = [];
  let cur: Value[] = [];
  let name: string | null = null;
  for (;;) {
    if (i >= d.length) fail(); // no End-of-ASM-data: the data ran out
    const t = d[i];
    i += 1;
    if (t === 0x11) {
      recs.push(new Record(name, cur));
      if (recs.length === 1) { // the asmheader record: its first version-like string
        version = recs[0].of("s").find((s) => DIGITS.test(s) && s.includes(".")) ?? version;
      }
      cur = [];
      name = null;
      continue;
    }
    if (t === 0x0d || t === 0x0e || t === 0x07 || t === 0x12) {
      const n = take(i, 1)[0];
      const s = latin1(take(i + 1, n));
      i += 1 + n;
      if ((t === 0x0d || t === 0x0e) && !cur.length) {
        name = name === null ? s : `${name}-${s}`;
        // The live model ends here; what follows is ACIS history (measured in CTC 01, 2026-11-08)
        if (name.endsWith("End-of-ASM-data") || name.startsWith("Begin-of-ASM-History-Data")) return [version, recs];
      } else cur.push(["s", s]);
      continue;
    }
    if (t === 0x08 || t === 0x09) {
      const w = t === 0x08 ? 2 : 4;
      const lb = take(i, w);
      const n = w === 2 ? lb[0] | (lb[1] << 8) : (lb[0] | (lb[1] << 8) | (lb[2] << 16) | (lb[3] << 24)) >>> 0;
      cur.push(["s", latin1(take(i + w, n))]);
      i += w + n;
      continue;
    }
    const fx = F[t];
    if (fx !== undefined) {
      const [kind, readFn, n] = fx;
      take(i, n);
      cur.push([kind, readFn(dv, i)] as Value);
      i += n;
      continue;
    }
    if (t === 0x0a || t === 0x0b) {
      cur.push(["b", t === 0x0a]);
      continue;
    }
    if (t === 0x0f || t === 0x10) {
      cur.push([t === 0x0f ? "{" : "}", null]);
      continue;
    }
    fail();
  }
}

/** A pointer value checked to lie in the record list (and to name the kind asked for), else null. */
export function ref(recs: Record[], p: unknown, name: string | null = null, suffix: string | null = null): number | null {
  if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p >= recs.length) return null;
  const n = recs[p].name ?? "";
  if (name !== null && n !== name) return null;
  if (suffix !== null && !n.endsWith(suffix)) return null;
  return p;
}

/** The first pointer of `rec` that points at a record called `name`. */
export function link(recs: Record[], rec: Record, name: string): number | null {
  for (const p of rec.of("p")) {
    const q = ref(recs, p, name);
    if (q !== null) return q;
  }
  return null;
}
