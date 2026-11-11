// Shared by the ported tests/service/test_inventor_*.py files (group E): the committed NIST .ipt files, the NIST STEP
// files unpacked by the Python side into tests/nist/.cache, and the pair analysis the Python harness
// (tests/inventor/nist_pair.py analyze_registered) ran. The harness's registration (register.py) is test-only Python
// and is not ported; its result, the transform of each pair, is read from the frozen parity key (`__harness`).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { parse } from "smol-toml";
import { analyzeOrRefuse, loadNodeOc } from "../node";
import { readIpt, type IptPart } from "../inventor/part";
import type { OC } from "../oc";
import type { Transform } from "../inventor/threads";

export const ROOT = resolve(__dirname, "../../../..");
export const INV = resolve(ROOT, "tests/inventor");
export const FILES = resolve(INV, "files");
export const PARTS = resolve(ROOT, "tests/parts");
const NIST = resolve(ROOT, "tests/nist/.cache/NIST-PMI-STEP-Files");
const KEYS = resolve(ROOT, "tests/parity/key");

export const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(path));
export const toml = (path: string): any => parse(readFileSync(path, "utf8"));
export const json = (path: string): any => JSON.parse(readFileSync(path, "utf8"));

let ocPromise: Promise<OC> | null = null;
export const getOc = (): Promise<OC> => (ocPromise ??= loadNodeOc());

const parts = new Map<string, IptPart>();
/** The .ipt in tests/inventor/files, read once (a refusal throws). */
export async function ipt(name: string): Promise<IptPart> {
  let p = parts.get(name);
  if (!p) {
    const r = await readIpt(bytesOf(resolve(FILES, name)));
    if (r.error) throw r.error;
    p = r.part;
    parts.set(name, p);
  }
  return p;
}

/** A fresh copy of the part (for tests that change fields), as Python's setattr on a new read_ipt. */
export async function freshIpt(name: string): Promise<IptPart> {
  const r = await readIpt(bytesOf(resolve(FILES, name)));
  if (r.error) throw r.error;
  return r.part;
}

export function stepBytes(stepName: string): Uint8Array {
  const p = resolve(NIST, stepName);
  if (!existsSync(p)) throw new Error(`${p} is missing: unpack the NIST zip first (python -c "from nist_files import ap242_files; ap242_files()" in tests/)`);
  return bytesOf(p);
}

/** The transform the Python harness found for the pair (frozen in the parity key). */
export function pairTransform(stepName: string, iptName: string): Transform {
  const file = resolve(KEYS, `tests__nist__.cache__NIST-PMI-STEP-Files__${stepName}+${iptName}+harness.json.gz`);
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  return JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")).__harness.transform;
}

const done = new Map<string, any>();
/** analyze() on a NIST pair lined up by the harness's transform, no pair check (never the app path), mill, al6061. */
export async function registered(stepName: string, iptName: string): Promise<any> {
  const k = `${stepName}|${iptName}`;
  let r = done.get(k);
  if (!r) {
    const oc = await getOc();
    const bytes = new Uint8Array(readFileSync(resolve(FILES, iptName)));
    r = await analyzeOrRefuse(oc, stepBytes(stepName), stepName, "mill", "al6061", { bytes, name: iptName },
      { transform: pairTransform(stepName, iptName), check: false });
    if (r.error) throw new Error(r.error);
    done.set(k, r);
  }
  return r;
}

/** The record list of the main model (most faces) of an .ipt, as the Python tests' _main_model / feature_ids read it. */
export async function mainModel(name: string): Promise<import("../inventor/sab").Record[]> {
  const { Ipt, find } = await import("../inventor/ole");
  const { HEADER, split } = await import("../inventor/sab");
  const f = await Ipt.open(bytesOf(resolve(FILES, name)));
  let best: [import("../inventor/sab").Record[], number] | null = null;
  for (const d of f.models()) {
    let k = find(d, HEADER);
    while (k >= 0) {
      const [, recs] = split(d, k);
      const n = recs.reduce((c, r) => c + (r.name === "face" ? 1 : 0), 0);
      if (best === null || n > best[1]) best = [recs, n];
      k = find(d, HEADER, k + 1);
    }
  }
  return best![0];
}

/** pytest.approx(want, abs=tol) with its default relative 1e-6: |got - want| <= max(tol, 1e-6 * |want|). */
export const near = (got: number | null | undefined, want: number, tol: number): boolean =>
  typeof got === "number" && Math.abs(got - want) <= Math.max(tol, 1e-6 * Math.abs(want));

const offAxis = (p: number[], origin: number[], axis: number[]): number => {
  const d = [0, 1, 2].map((k) => p[k] - origin[k]);
  const t = d.reduce((a, x, k) => a + x * axis[k], 0);
  return Math.sqrt(Math.max(0.0, d.reduce((a, x) => a + x * x, 0) - t * t));
};
const along = (p: number[], origin: number[], axis: number[]): number => [0, 1, 2].reduce((a, k) => a + (p[k] - origin[k]) * axis[k], 0);

/** (file, key Hole, .ipt feature) for each key Hole whose centre lies on an .ipt hole's axis at one end of the hole, with
 *  the key's diameter (as docs/research/inventor-i2-probe/s28.py): tests/service/test_inventor_holes.py `_pairs`. */
export async function holePairs(): Promise<[string, any, import("../inventor/holes").HoleFeature][]> {
  const key = json(resolve(INV, "holes_key.json")).holes as Record<string, any[]>;
  const out: [string, any, import("../inventor/holes").HoleFeature][] = [];
  for (const name of Object.keys(key).sort()) {
    const feats = (await ipt(name)).hole_features;
    for (const k of key[name]) {
      const hits = new Map<number, import("../inventor/holes").HoleFeature>();
      for (const f of feats) for (const h of f.holes) for (const c of k.centres_mm) {
        if (h.reason === null && offAxis(c, h.start, h.axis) <= 0.01
          && Math.min(...[along(c, h.start, h.axis), along(c, h.start, h.axis) - h.length_mm!].map(Math.abs)) <= 0.01
          && Math.abs(h.diameter_mm! - k.Diameter) <= 0.01) hits.set(f.feature_id, f);
      }
      if (hits.size === 1) out.push([name, k, [...hits.values()][0]]);
    }
  }
  return out;
}

/** The frozen hostile .ipt of tests/service/test_inventor_safety.py (tests/parity/key/ipt, written by key.py --freeze
 *  from the same cases, gzipped). */
export const hostileBytes = (name: string): Uint8Array => new Uint8Array(gunzipSync(readFileSync(resolve(KEYS, "ipt", `${name}.ipt.gz`))));
