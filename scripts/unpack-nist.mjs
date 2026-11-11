// Unpack the NIST MBE PMI gold-standard zip (D-011) into tests/nist/.cache/NIST-PMI-STEP-Files, once, and list its
// AP242 STEP files. Node 22, no dependencies; replaces tests/nist_files.py.
//
//   node scripts/unpack-nist.mjs                 unpack if the folder is missing (checks the zip's SHA-256 first)
//   node scripts/unpack-nist.mjs --list          also print the AP242 STEP files (*_ap242*.stp), sorted, one per line
//   node scripts/unpack-nist.mjs --out <dir>     use <dir> instead of tests/nist/.cache (a scratch copy for checks)
//
// Import: `import { ap242Files } from "./unpack-nist.mjs"` (returns the sorted absolute paths).
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NIST_DIR = join(ROOT, "tests", "nist");
export const ZIP = join(NIST_DIR, "NIST-PMI-STEP-Files.zip");
export const SHA256 = "8fa78429e6d8d9b0d7681d223b6aa9ec98c3772185c55b1a0e3679b21c181911";
const FOLDER = "NIST-PMI-STEP-Files";

/** The zip's entries from its central directory: {name, method, csize, size, offset}. */
function entries(zip) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new Error("zip64 is not supported");
  const out = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory entry");
    const nameLen = zip.readUInt16LE(p + 28), extraLen = zip.readUInt16LE(p + 30), commentLen = zip.readUInt16LE(p + 32);
    out.push({ method: zip.readUInt16LE(p + 10), csize: zip.readUInt32LE(p + 20), size: zip.readUInt32LE(p + 24),
      offset: zip.readUInt32LE(p + 42), name: zip.toString("utf8", p + 46, p + 46 + nameLen) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function data(zip, e) {
  const p = e.offset;
  if (zip.readUInt32LE(p) !== 0x04034b50) throw new Error(`bad local header for ${e.name}`);
  const start = p + 30 + zip.readUInt16LE(p + 26) + zip.readUInt16LE(p + 28);
  const raw = zip.subarray(start, start + e.csize);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRawSync(raw);
  throw new Error(`unsupported zip method ${e.method} for ${e.name}`);
}

/** Unpack the zip into `cache` (default tests/nist/.cache) unless the folder is already there; return its path. */
export function unpack(cache = join(NIST_DIR, ".cache")) {
  const folder = join(cache, FOLDER);
  if (statSync(folder, { throwIfNoEntry: false })?.isDirectory()) return folder;
  const zip = readFileSync(ZIP);
  const sha = createHash("sha256").update(zip).digest("hex");
  if (sha !== SHA256) throw new Error(`${ZIP}: SHA-256 ${sha}, expected ${SHA256}`);
  mkdirSync(cache, { recursive: true });
  // Unpack into a private folder, then rename it into place in one step: parallel runs never see a half-written
  // file, and a run that loses the race drops its copy.
  const work = join(cache, `.unpack-${randomBytes(6).toString("hex")}`);
  mkdirSync(work);
  try {
    for (const e of entries(zip)) {
      const target = resolve(work, e.name);
      if (target !== work && !target.startsWith(work + sep)) throw new Error(`unsafe path in zip: ${e.name}`);
      if (e.name.endsWith("/")) { mkdirSync(target, { recursive: true }); continue; }
      mkdirSync(dirname(target), { recursive: true });
      const bytes = data(zip, e);
      if (bytes.length !== e.size) throw new Error(`${e.name}: ${bytes.length} bytes, expected ${e.size}`);
      writeFileSync(target, bytes);
    }
    try {
      renameSync(join(work, FOLDER), folder);
    } catch (err) {
      if (!statSync(folder, { throwIfNoEntry: false })?.isDirectory()) throw err;
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return folder;
}

/** The AP242 STEP files (*_ap242*.stp), sorted, as absolute paths. */
export function ap242Files(cache) {
  const folder = unpack(cache);
  return readdirSync(folder).filter((f) => /^.*_ap242.*\.stp$/.test(f)).sort().map((f) => join(folder, f));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--out");
  const out = at >= 0 ? resolve(args[at + 1] ?? "") : undefined;
  if (at >= 0 && !args[at + 1] || args.some((a, i) => !["--list", "--out"].includes(a) && args[i - 1] !== "--out")) {
    console.error("usage: node scripts/unpack-nist.mjs [--list] [--out <dir>]");
    process.exit(2);
  }
  try {
    const files = ap242Files(out);
    if (args.includes("--list")) for (const f of files) console.log(relative(process.cwd(), f) || f);
    else console.error(`${files.length} AP242 STEP files in ${dirname(files[0] ?? unpack(out))}`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
