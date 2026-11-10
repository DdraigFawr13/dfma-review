// Port of service/dfma/inventor/part.py: readIpt, what the app needs from an .ipt (spec I1 Design "Parts"; layouts
// measured on the 16 NIST files). Python reads the .ipt after the STEP; here the file is read first (the browser
// inflates asynchronously) and a refusal is kept as a value, so analyze.ts raises it after the STEP's own refusals,
// in Python's order.
import { ReadError } from "../read";
import { MSG_IPT_FORMAT, MSG_IPT_NO_MODEL } from "../settings";
import { DESIGN_TRACKING, find, Ipt, STREAM_CAP } from "./ole";
import { HEADER, link, Record, split, type Vec } from "./sab";
import { featureTags } from "./tags";
import { readHoleFeatures, type HoleFeature } from "./holes";
import { assign, holeNames, nameThreads } from "./names";
import { readThreads, type Thread } from "./threads";
import { readBlends, type Blend } from "./blends";
import { surfaceOf } from "./surfaces";

export const PLAIN_PART = "4D29B490-49B2-11D0-93C3-7E0706000000"; // Design Tracking property 31 of 13 NIST files
export const SHEET_METAL = "9C464203-9BAE-11D3-8BAD-0060B0CE6BB4"; // CTC 03, FTC 09 2021 and 2024
// UFRxDoc: this 16-byte marker appears three times; after the second, a u32 count, one byte, then that many names
// (u32 length + UTF-16). Assumption: a part with two Model States has count 2 here (no sample, D-033).
const STATES_MARK = [0x90, 0xb4, 0x29, 0x4d, 0xd0, 0x11, 0xb2, 0x49, 0x07, 0x7e, 0xc3, 0x93, 0x00, 0x00, 0x00, 0x06];

export interface IptPart {
  saved_with: string; // property 67 up to the first NUL, e.g. "2024.1 (Build 281209000, 209)"
  acis_version: string; // the main model's asmheader version
  subtype: string | null; // property 31, a document-type id
  model_state_names: string[];
  solid_bodies: number; // in the main model; a body of under 4 faces, all planes, is a surface body
  corners_mm: Vec[]; // the point of each vertex record of the main model
  face_count: number;
  threads: Thread[];
  hole_features: HoleFeature[];
  hole_names: string[];
  hole_names_seen: number;
  blends: Blend[];
}

/** What reading the .ipt gave: the part, or the refusal analyze.ts raises after the STEP's. */
export type IptRead = { part: IptPart; error?: undefined } | { part?: undefined; error: ReadError };

function text(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return String(v).split("\x00")[0].trim();
}

const u32 = (d: Uint8Array, j: number) => (d[j] | (d[j + 1] << 8) | (d[j + 2] << 16) | (d[j + 3] << 24)) >>> 0;

/** Model State names from a UFRxDoc stream; [] when the layout isn't found (see STATES_MARK). */
export function modelStates(d: Uint8Array): string[] {
  let i = find(d, STATES_MARK);
  i = i >= 0 ? find(d, STATES_MARK, i + 1) : -1;
  if (i < 0) return [];
  let j = i + STATES_MARK.length;
  if (j + 5 > d.length) return [];
  const n = u32(d, j);
  j += 5;
  const names: string[] = [];
  const dec = new TextDecoder("utf-16le");
  for (let c = 0; c < Math.min(n, 1000); c++) {
    if (j + 4 > d.length) return names;
    const k = u32(d, j);
    if (j + 4 + 2 * k > d.length) return names;
    names.push(dec.decode(d.subarray(j + 4, j + 4 + 2 * k)));
    j += 4 + 2 * k;
  }
  return names;
}

function bodies(recs: Record[]): number {
  const facesOf = new Map<number, number[]>();
  recs.forEach((r, i) => {
    if (r.name !== "face") return;
    const shell = link(recs, r, "shell");
    const lump = shell !== null ? link(recs, recs[shell], "lump") : null;
    const body = lump !== null ? link(recs, recs[lump], "body") : null;
    if (body !== null) {
      if (!facesOf.has(body)) facesOf.set(body, []);
      facesOf.get(body)!.push(i);
    }
  });
  const plane = (f: number) => {
    const s = surfaceOf(recs, f);
    return s !== null && (recs[s].name ?? "").startsWith("plane");
  };
  let n = 0;
  for (const fs of facesOf.values()) if (!(fs.length < 4 && fs.every(plane))) n++;
  return n;
}

/** Python's str(uuid.UUID(s)).upper(), or null when `s` is not a UUID. */
function uuidText(s: string): string | null {
  const hex = s.replace(/urn:/g, "").replace(/uuid:/g, "").replace(/^[{}]+|[{}]+$/g, "").replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) return null;
  const h = hex.toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function readIptSync(f: Ipt): IptPart {
  const dtp = f.names.find((n) => n.endsWith(DESIGN_TRACKING));
  const props = dtp ? f.properties(dtp, [31, 67]) : new Map();
  const ufr = f.names.find((n) => n.split("/").pop() === "UFRxDoc");
  const states = ufr ? modelStates(f.read(ufr)) : [];
  const names = holeNames(f);
  let best: [string, Record[], number] | null = null;
  for (const d of f.models()) {
    let k = find(d, HEADER);
    while (k >= 0) { // a stream may hold several models one after another (FTC 11, measured)
      const [version, recs] = split(d, k);
      const n = recs.reduce((c, r) => c + (r.name === "face" ? 1 : 0), 0);
      if (best === null || n > best[2]) best = [version, recs, n];
      k = find(d, HEADER, k + 1);
    }
  }
  if (best === null || best[2] === 0) throw new ReadError(MSG_IPT_NO_MODEL);
  const [version, recs, nFaces] = best;
  const corners: Vec[] = [];
  for (const r of recs) {
    if (r.name !== "vertex") continue;
    const p = link(recs, r, "point");
    const v = p !== null ? recs[p].of("v") : [];
    if (!v.length) throw new ReadError(MSG_IPT_FORMAT.replace("{version}", version));
    corners.push([10.0 * v[0][0], 10.0 * v[0][1], 10.0 * v[0][2]]); // cm -> mm
  }
  let sub = text(props.get(31));
  if (sub) sub = uuidText(sub) ?? sub;
  const tags = featureTags(recs);
  const features = readHoleFeatures(recs, tags);
  assign(features, names);
  const threads = readThreads(recs);
  nameThreads(threads, features);
  return {
    saved_with: text(props.get(67)) || "unknown", acis_version: version, subtype: sub,
    model_state_names: states, solid_bodies: bodies(recs), corners_mm: corners, face_count: nFaces, threads,
    hole_features: features, hole_names: names, hole_names_seen: names.length, blends: readBlends(recs, tags),
  };
}

/** Read an .ipt's bytes; a refusal comes back as `error` (see IptRead). */
export async function readIpt(bytes: Uint8Array, streamCap = STREAM_CAP): Promise<IptRead> {
  try {
    return { part: readIptSync(await Ipt.open(bytes, streamCap)) };
  } catch (e) {
    if (e instanceof ReadError) return { error: e };
    throw e;
  }
}
