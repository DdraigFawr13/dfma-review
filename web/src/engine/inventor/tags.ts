// Port of service/dfma/inventor/tags.py: feature tags on the faces of an .ipt's main model (spec I2+I3 "Hole
// features"). Inventor 2021 names a tag record `NMx_Hole_Brep_tag-...-attrib` or `NMx_blend_tag-...-attrib`; 2024
// writes `ATTRIB_CUSTOM-attrib` whose first string is `INV_NMX_HOLE_TAG` or `INV_NMX_BLEND_TAG`. After the version come
// pairs (k, feature id) up to k == -1; the last id made the face. Its owner is its 4th pointer, a `face` record.
import { ref, type Record } from "./sab";

export const MAX_PAIRS = 64; // a tag with more (k, id) pairs is dropped (spec Builder defaults)
const KINDS_2021: { [k: string]: "hole" | "blend" } = { NMx_Hole_Brep_tag: "hole", NMx_blend_tag: "blend" };
const KINDS_2024: { [k: string]: "hole" | "blend" } = { INV_NMX_HOLE_TAG: "hole", INV_NMX_BLEND_TAG: "blend" };

export interface Tag { kind: "hole" | "blend"; ids: number[] } // feature ids in record order; the last made the face

function kindAndInts(r: Record): [string | null, number[]] {
  const name = r.name ?? "";
  const ints = r.of("i");
  if (name.startsWith("ATTRIB_CUSTOM")) {
    const s = r.of("s");
    return [s.length ? (Object.hasOwn(KINDS_2024, s[0]) ? KINDS_2024[s[0]] : null) : null, ints.slice(3)]; // after -1, 1, version
  }
  const head = name.split("-")[0];
  return [Object.hasOwn(KINDS_2021, head) ? KINDS_2021[head] : null, ints.slice(2)]; // after -1, version
}

/** The ids of the (k, id) pairs up to k == -1; null when the list doesn't end in -1 or holds over 64 pairs. */
export function pairIds(ints: number[]): number[] | null {
  const out: number[] = [];
  let k = 0;
  while (k < ints.length) {
    if (ints[k] === -1) return out;
    if (k + 1 >= ints.length || out.length >= MAX_PAIRS) return null;
    out.push(ints[k + 1]);
    k += 2;
  }
  return null;
}

/** Hole and blend tags by the index of the face record they sit on, in Python dict order (first seen first). */
export function featureTags(recs: Record[]): Map<number, Tag[]> {
  const out = new Map<number, Tag[]>();
  for (const r of recs) {
    const [kind, ints] = kindAndInts(r);
    if (kind === null) continue;
    const ptrs = r.of("p");
    const face = ptrs.length > 3 ? ref(recs, ptrs[3], "face") : null;
    if (face === null) continue;
    const ids = pairIds(ints);
    if (!ids || !ids.length || !ids.every((x) => Number.isInteger(x) && x > 0)) continue;
    if (!out.has(face)) out.set(face, []);
    out.get(face)!.push({ kind: kind as "hole" | "blend", ids });
  }
  return out;
}
