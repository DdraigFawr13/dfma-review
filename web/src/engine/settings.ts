// Port of service/dfma/settings.py (port spec Design "settings.ts"). The constants below must equal
// settings.py's (settings.test.ts compares them with `python tests/parity/key.py --settings` until S8).
// The config loaders read config/*.toml as text and parse it with smol-toml, so the shop's TOML stays the one source.
import { parse } from "smol-toml";
import thresholdsToml from "../../../config/thresholds.toml?raw";
import toolsToml from "../../../config/tools.toml?raw";
import driversToml from "../../../config/drivers.toml?raw";

export const MAX_UPLOAD_BYTES = 52428800;
export const TIME_LIMIT_S = 60;
export const MESH_LINEAR_MM = 0.05;
export const MESH_ANGULAR_RAD = 0.5;
export const PROCESSES = ["mill", "turn"] as const;
export const MATERIALS = ["al6061", "steel1018", "ss304", "plastic"] as const;
export const MSG_NOT_STEP = "This is not a STEP file this tool can read. Export it again as .step or .stp from your CAD.";
export const MSG_NO_SOLID = "No solid found in this file. Export the part as a solid body, not surfaces or a drawing.";
export const MSG_OPEN_SHELL = "The solid in this file has a gap: {n} of its edges belong to one face only. It was closed and analyzed as a solid, so results near the gap may be wrong. Check the file for gaps and export it again.";
export const MSG_NO_UNIT = "This file declares no length unit. It was read as millimeters; if it was drawn in inches, every size here is 25.4 times too small. Set the unit in your CAD export, then upload again.";
export const MSG_TOO_LARGE = "File is larger than 50 MB. Export a single body or a smaller part.";
export const MSG_TOO_LONG = "This file took too long to analyze. Try again; if it stops again, export a single body or a smaller part.";
export const MSG_FAILED = "The analysis failed on this file. Try again, or try another file.";
export const MSG_IPT_NOT_IPT = "This is not an Inventor part file (.ipt) this tool can read. Choose the .ipt saved from Inventor, or upload the STEP on its own.";
export const MSG_IPT_NEEDS_STEP = "Add the STEP export of this part: the shape is read from the STEP";
export const MSG_IPT_TYPE = "This Inventor part is a {kind}. Only plain single-body parts can be read for now. Upload the STEP on its own, without the .ipt.";
export const MSG_PAIR_MISMATCH = "These files don't match: {reason}. Export the STEP again from this .ipt and upload both.";
export const MSG_IPT_TOO_BIG = "This .ipt holds more data than this tool will unpack. Upload the STEP on its own, without the .ipt.";
export const MSG_IPT_NO_MODEL = "No 3D model found inside this .ipt. Upload the STEP on its own, without the .ipt.";
export const MSG_IPT_FORMAT = "This .ipt uses a format this tool can't read yet (model version {version}). Upload the STEP on its own, without the .ipt.";
export const IPT_ASSUMPTION = "iParts, derived and Content Center parts are not detected yet; the thread data of such a part may not match its STEP.";
export const MSG_FEATURE_BAD = "feature data not understood";
export const MSG_NO_HOLE_ON_AXIS = "no hole on this axis";
export const MSG_BLEND_SHAPE = "blend shape not understood";
export const MSG_CHAMFER_NEIGHBOURS = "chamfer neighbors not understood";
export const MSG_NO_BLEND_FACE = "no STEP face of its shape at its place";
export const PAIR_TOL_MM = 0.01;
export const ASSUMPTIONS = ["Mesh deflection 0.05 mm linear, 0.5 rad angular (assumption).", "Exterior profiles, steps, open-sided pockets, threads and floor fillets are not planned or ruled on in this version.", "End mills are the inch list of standard sizes for every file; no metric end mills in this version (assumption).", "Walls are pairs of planar faces, parallel or up to 15 deg from it (draft, measured at the thinnest place), with at least 10 mm2 of overlap and material between them (assumption), plus the material around a hole's side and under a drill point, measured up to 0.250 in (assumption); other curved walls, such as thin cylindrical shells, are not measured.", "Tool loads count every tool loaded, including the first in each setup.", "Setups cover the holes and pockets a 3-axis mill reaches along the part's axes; a feature that needs a 4/5-axis mill or a fixture, and a void sealed inside the part, are in no setup and their tools are not listed.", "A countersink or entry chamfer is cut from its own end after drilling, with one countersink tool per angle.", "Engraved text and logos are read as pockets: their sharp corners are real geometry, but engraving tools may accept them."];
export const TURN_ASSUMPTIONS = ["Turning: the diameter is the largest outside diameter and the length the extent along the axis, so a thin section behind a large head can read as stocky.", "Turning: no turning axis is found when round faces on one axis are under 40% of the part's surface (assumption).", "Turning: one setup; one tool load per tool (turn, drills on the axis, bore, groove, then off-axis tools). Bores are on-axis holes of 0.500 in and over; parting off, threads and flipping the part are not planned."];

type Table = Record<string, unknown>;
const cache = new Map<string, Table>();

function toml(name: string, text: string): Table {
  if (!cache.has(name)) cache.set(name, parse(text) as Table);
  return cache.get(name)!;
}

/** The rule limits for one material, from config/thresholds.toml. */
export function thresholds(material: string): Table {
  return toml("thresholds", thresholdsToml)[material] as Table;
}

export function toolsConfig(): Table {
  return toml("tools", toolsToml);
}

/** The cost drivers from config/drivers.toml, in file order. */
export function driversConfig(): Table {
  return toml("drivers", driversToml);
}
