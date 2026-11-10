// Port of service/dfma/inventor/ole.py: open an Inventor .ipt (an OLE compound file) and inflate its model streams
// (port spec Decisions: `cfb` 1.2.2 and the browser's DecompressionStream("deflate")). Every size is untrusted: each
// inflated stream is capped, and so is the file's total (D-031 safety rules).
//
// The browser inflates asynchronously, so `openIpt` reads the file and inflates every `RSeStorage/B` stream first; the
// reading code (part.ts) is then synchronous, as the Python. Stream names and their order are olefile's: paths below
// the root joined with "/", sorted by their parts (olefile sorts each storage's entries by name).
import CFB from "cfb";
import { MSG_IPT_FORMAT, MSG_IPT_NOT_IPT, MSG_IPT_TOO_BIG } from "../settings";
import { ReadError } from "../read";

export const STREAM_CAP = 64 * 1024 * 1024; // bytes per inflated stream; largest measured 2,536,828 (NIST, 2026-11-08)
export const FILE_CAP = 256 * 1024 * 1024; // bytes inflated per file
export const DESIGN_TRACKING = "\x05PypkizqiUjudbposAayal4qdGf"; // property 31: document subtype; 67: the saving build
const MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // olefile MAGIC
const TOO_BIG = "too big" as const;

/** One stream inflated: its bytes, null when it carries no model (no `x^`, or not zlib after all), or TOO_BIG. */
type Inflated = Uint8Array | null | typeof TOO_BIG;

export function find(d: Uint8Array, pattern: ArrayLike<number>, from = 0): number {
  const n = pattern.length;
  const first = pattern[0];
  for (let i = Math.max(0, from); i + n <= d.length; i++) {
    if (d[i] !== first) continue;
    let k = 1;
    while (k < n && d[i + k] === pattern[k]) k++;
    if (k === n) return i;
  }
  return -1;
}

const ZLIB = [0x78, 0x5e]; // b"x^"

type Run = { kind: "ok" | "junk" | "error" | "big"; data: Uint8Array };

/** DecompressionStream over `input`, stopping past `cap` bytes of output. */
async function run(input: Uint8Array, cap: number): Promise<Run> {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  writer.write(input as Uint8Array<ArrayBuffer>).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  const joined = () => {
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { kind: "ok", data: joined() };
      parts.push(value);
      total += value.length;
      if (total > cap) {
        reader.cancel().catch(() => {});
        return { kind: "big", data: new Uint8Array() };
      }
    }
  } catch (e) {
    // Bytes after the end of the zlib stream (Python's zlib keeps them apart, as unused_data): Chromium says "Junk
    // found after end of compressed data.", Node "Trailing junk found after the end of the compressed stream".
    return { kind: /junk/i.test(String((e as Error)?.message)) ? "junk" : "error", data: joined() };
  }
}

/** One stream inflated from its first zlib header `x^`, as ole.py `inflate`. Python's zlib stops at the stream's end
 *  and ignores what follows; DecompressionStream refuses trailing bytes (Chromium then drops the last output), so on
 *  that refusal the end is found by halving: a prefix that ends cleanly is the whole stream. */
export async function inflate(raw: Uint8Array, cap = STREAM_CAP): Promise<Inflated> {
  const k = find(raw, ZLIB);
  if (k < 0) return null;
  const body = raw.subarray(k);
  const first = await run(body, cap);
  if (first.kind === "big") return TOO_BIG;
  if (first.kind === "ok") return first.data;
  if (first.kind === "error") return null; // zlib.error: such streams carry no model
  let [lo, hi] = [2, body.length - 1]; // the stream ends at some length in [lo, hi]
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = await run(body.subarray(0, mid), cap);
    if (r.kind === "big") return TOO_BIG;
    if (r.kind === "ok") return r.data;
    if (r.kind === "junk") hi = mid - 1;
    else lo = mid + 1; // cut short of the end
  }
  return null;
}

/** The compound file's streams, read and inflated once. */
export class Ipt {
  private constructor(readonly names: string[], private readonly streams: Map<string, Uint8Array>,
    private readonly inflated: Map<string, Inflated>) {}

  /** Raises ReadError(MSG_IPT_NOT_IPT) on a file that is not one (olefile.isOleFile, then OleFileIO). */
  static async open(bytes: Uint8Array, streamCap = STREAM_CAP): Promise<Ipt> {
    if (bytes.length < MAGIC.length || MAGIC.some((b, i) => bytes[i] !== b)) throw new ReadError(MSG_IPT_NOT_IPT);
    let c: ReturnType<typeof CFB.read>;
    try {
      c = CFB.read(bytes, { type: "array" });
    } catch {
      throw new ReadError(MSG_IPT_NOT_IPT); // a broken header or FAT
    }
    const streams = new Map<string, Uint8Array>();
    c.FileIndex.forEach((e, i) => {
      if (e.type !== 2) return; // streams only
      const path = c.FullPaths[i].split("/").filter((x) => x !== "").slice(1).join("/"); // below the root entry
      const content = e.content as unknown as ArrayLike<number> | undefined;
      streams.set(path, content instanceof Uint8Array ? content : new Uint8Array(content ?? []));
    });
    const names = [...streams.keys()].sort(byParts);
    const inflated = new Map<string, Inflated>();
    for (const n of names) if (n.startsWith("RSeStorage/B")) inflated.set(n, await inflate(streams.get(n)!, streamCap));
    return new Ipt(names, streams, inflated);
  }

  read(name: string): Uint8Array {
    const s = this.streams.get(name);
    if (s === undefined) throw new ReadError(MSG_IPT_FORMAT.replace("{version}", "unknown"));
    return s;
  }

  /** One `RSeStorage/B` stream inflated; null when it carries no model; over the cap -> MSG_IPT_TOO_BIG. */
  inflate(name: string): Uint8Array | null {
    const d = this.inflated.get(name);
    if (d === undefined) return null;
    if (d === TOO_BIG) throw new ReadError(MSG_IPT_TOO_BIG);
    return d;
  }

  /** Every `RSeStorage/B*` stream inflated, in name order; over a cap -> MSG_IPT_TOO_BIG. */
  models(fileCap = FILE_CAP): Uint8Array[] {
    const out: Uint8Array[] = [];
    let total = 0;
    for (const name of this.names) {
      if (!name.startsWith("RSeStorage/B")) continue;
      const data = this.inflate(name);
      if (data === null) continue;
      total += data.length;
      if (total > fileCap) throw new ReadError(MSG_IPT_TOO_BIG);
      out.push(data);
    }
    return out;
  }

  /** olefile getproperties (its first property set) for the ids asked; a value it can't parse is left out. */
  properties(name: string, ids: number[]): Map<number, string | number | boolean> {
    const out = new Map<number, string | number | boolean>();
    const d = this.streams.get(name);
    if (!d) return out;
    const u32 = (b: Uint8Array, o: number) => {
      if (o < 0 || o + 4 > b.length) throw new RangeError("short");
      return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
    };
    const u16 = (b: Uint8Array, o: number) => {
      if (o < 0 || o + 2 > b.length) throw new RangeError("short");
      return b[o] | (b[o + 1] << 8);
    };
    let s: Uint8Array;
    let num: number;
    try {
      const at = u32(d, 28 + 16);
      const size = u32(d, at);
      const sec = d.subarray(at + 4, size < 4 ? d.length : Math.min(d.length, at + 4 + size - 4)); // read(-n) reads to the end
      s = new Uint8Array(4 + sec.length);
      s.set([42, 42, 42, 42]);
      s.set(sec, 4);
      num = Math.min(u32(s, 4), Math.floor(s.length / 8));
    } catch {
      return out;
    }
    for (let i = 0; i < num; i++) {
      try {
        const id = u32(s, 8 + i * 8);
        const off = u32(s, 12 + i * 8);
        const type = u32(s, off);
        if (!ids.includes(id)) continue;
        const o = off + 4;
        let v: string | number | boolean | undefined;
        if (type === 2) { v = u16(s, o); if (v >= 32768) v -= 65536; } // VT_I2
        else if (type === 18) v = u16(s, o); // VT_UI2
        else if ([3, 22, 10, 19, 23].includes(type)) v = u32(s, o); // VT_I4, VT_INT, VT_ERROR, VT_UI4, VT_UINT (as olefile)
        else if (type === 8 || type === 30) { // VT_BSTR, VT_LPSTR: bytes without NULs, read as latin1 by part.ts
          const count = u32(s, o);
          v = latin1(s.subarray(o + 4, o + 4 + count - 1).filter((b) => b !== 0));
        } else if (type === 31) { // VT_LPWSTR: olefile 0.47 reads the count and the text from offset + 4
          const count = u32(s, o + 4);
          const b = s.subarray(o + 4, Math.min(s.length, o + 4 + count * 2));
          v = new TextDecoder("utf-16le").decode(b);
        } else if (type === 17) { if (o >= s.length) throw new RangeError("short"); v = s[o]; } // VT_UI1
        else if (type === 72) v = clsid(s.subarray(o, o + 16)); // VT_CLSID
        else if (type === 11) v = Boolean(u16(s, o)); // VT_BOOL
        if (v !== undefined) out.set(id, v);
      } catch {
        // olefile skips a property it can't parse
      }
    }
    return out;
  }
}

function clsid(b: Uint8Array): string {
  if (b.length !== 16) throw new RangeError("short"); // olefile asserts
  if (b.every((x) => x === 0)) return "";
  const h = (n: number, w: number) => n.toString(16).toUpperCase().padStart(w, "0");
  const u32 = (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  return `${h(u32, 8)}-${h(b[4] | (b[5] << 8), 4)}-${h(b[6] | (b[7] << 8), 4)}-${h(b[8], 2)}${h(b[9], 2)}-`
    + [...b.subarray(10, 16)].map((x) => h(x, 2)).join("");
}

/** Python's bytes.decode("latin1"). */
export function latin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
}

function byParts(a: string, b: string): number {
  const [x, y] = [a.split("/"), b.split("/")];
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return x.length - y.length;
}
