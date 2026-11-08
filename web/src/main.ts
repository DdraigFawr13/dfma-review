// Page wiring: analyse as soon as a file is chosen, and again when process or material
// changes while a file is loaded. No submit button (spec S1, settled at build).

import { analyze, ApiError, type Analysis, type Material, type Process } from "./api";
import { collapsePassed, renderFindings, renderPlan, renderVerdict, type Pick } from "./findings";
import { formatSize } from "./format";
import { Viewer, type CheckedKind } from "./viewer";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const fileInput = byId<HTMLInputElement>("file");
const processSelect = byId<HTMLSelectElement>("process");
const materialSelect = byId<HTMLSelectElement>("material");
const status = byId<HTMLParagraphElement>("status");
const error = byId<HTMLParagraphElement>("error");
const summary = byId<HTMLElement>("summary");
const verdict = byId<HTMLElement>("verdict");
const list = byId<HTMLElement>("findings");
const count = byId<HTMLElement>("findings-count");
const assumptions = byId<HTMLDetailsElement>("assumptions");
const viewer = new Viewer(byId<HTMLCanvasElement>("viewer"));
// One switch per feature kind checked with no finding (D-014); the holes box keeps its S2 id.
const SWITCHES: [CheckedKind, HTMLInputElement][] = [
  ["hole", byId<HTMLInputElement>("show-checked")],
  ["pocket", byId<HTMLInputElement>("show-checked-pockets")],
  ["corner", byId<HTMLInputElement>("show-checked-corners")],
  ["wall", byId<HTMLInputElement>("show-checked-walls")],
];
for (const [kind, box] of SWITCHES) box.addEventListener("change", () => viewer.setShowChecked(kind, box.checked));

let run = 0;
let selected: string | null = null;
let shownFile: File | null = null;

declare global {
  interface Window {
    __dfma: {
      highlightedFaces(): number[];
      cameraTarget(): [number, number, number];
      paintedFaces(): number[];
      opacities(): Record<number, number>;
      checkedFaces(kind?: CheckedKind): number[];
      flagBoxes(): { id: string; x: number; y: number; w: number; h: number }[];
      flagState(): { id: string; shown: boolean; mergedInto: string }[];
    };
  }
}
window.__dfma = {
  highlightedFaces: () => viewer.highlightedFaces(),
  cameraTarget: () => viewer.cameraTarget(),
  paintedFaces: () => viewer.paintedFaces(), // test hook: what is actually drawn in the accent colour
  opacities: () => viewer.opacities(),
  flagBoxes: () => viewer.flagBoxes(), // test hook: where each visible finding label sits
  flagState: () => viewer.flagState(), // test hook: each pin shown, folded into another, or hidden
  checkedFaces: (kind?: CheckedKind) => viewer.checkedFaces(kind), // test hook: drawn in a kind's "checked" colour
};

/** Faces of the features checked with no finding, by kind. Walls go first, so a face that is also
 *  in a hole or pocket shows that kind's colour; corners go last, so a corner fillet (also a pocket
 *  wall) shows the corner colour. */
function checkedFaces(result: Analysis): Map<number, CheckedKind> {
  const flagged = new Set(result.findings.map((f) => f.feature));
  const out = new Map<number, CheckedKind>();
  for (const kind of ["wall", "hole", "pocket", "corner"] as CheckedKind[]) {
    for (const f of result.features) {
      if (f.kind === kind && !flagged.has(f.id)) for (const id of f.faces) out.set(id, kind);
    }
  }
  return out;
}

/** Sharp inside corners have no face of their own: their findings are drawn along the corner edge. */
function edgesOf(result: Analysis): Map<string, number[][]> {
  const out = new Map<string, number[][]>();
  for (const f of result.findings) {
    const edge = result.features.find((x) => x.id === f.feature)?.edge_mm;
    if (edge) out.set(f.id, edge);
  }
  return out;
}

let shown: Analysis | null = null;

/** The selection again in a new result of the same file (a material change), if it is still there. */
function stillThere(result: Analysis, id: string | null): Pick | null {
  if (!id) return null;
  if (id.startsWith("pass:")) {
    const f = result.features.find((x) => `pass:${x.id}` === id);
    const ok = f && !result.findings.some((x) => x.feature === f.id) && result.passed.some((p) => p.feature === f.id);
    return ok ? { id, faces: f.faces } : null;
  }
  if (id.startsWith("setup:")) {
    const s = result.setups[Number(id.slice(6))];
    return s ? { id, faces: s.features.flatMap((fid) => result.features.find((x) => x.id === fid)?.faces ?? []) } : null;
  }
  return result.findings.find((f) => f.id === id) ?? null;
}

/** Select a finding, a passed feature or a setup (clicking the selected one again clears it). */
function select(f: Pick): void {
  selected = selected === f.id ? null : f.id;
  viewer.select(selected ? f : null);
  showFindings(shown, "");
}

function showFindings(result: Analysis | null, message: string): void {
  const keepScroll = list.scrollTop, planBox = byId("plan-panel"), keepPlan = planBox.scrollTop; // keep the reader's place
  renderFindings(list, result, message, select, selected);
  count.textContent = result ? String(result.findings.length) : "";
  assumptions.hidden = !result;
  shown = result;
  renderPlan(byId("plan"), byId("plan-count"), result, select, selected);
  list.scrollTop = keepScroll;
  planBox.scrollTop = keepPlan;
  byId("plan-panel").hidden = !result?.machine;
  if (result) {
    byId("assumption-list").replaceChildren(...result.assumptions.map((a) => {
      const li = document.createElement("li");
      li.textContent = a;
      return li;
    }));
    assumptions.querySelector("summary")!.textContent = `Assumptions (${result.assumptions.length})`;
  }
}

async function analyse(): Promise<void> {
  const file = fileInput.files?.[0];
  if (!file) return;
  const mine = ++run;
  status.textContent = `Analysing ${file.name}…`;
  error.hidden = true;
  renderVerdict(verdict, null, true);
  try {
    const result = await analyze(file, processSelect.value as Process, materialSelect.value as Material);
    if (mine !== run) return; // a newer upload replaced this one
    const samePart = shownFile === file;
    byId("part-size").textContent = formatSize(result.part.bbox_in);
    byId("face-count").textContent = `${result.part.face_count} faces`;
    byId("part-units").textContent = result.part.units_in_file;
    summary.hidden = false;
    viewer.show(result.faces, samePart); // the same file re-analysed keeps the camera
    viewer.setFindings(result.findings, edgesOf(result));
    viewer.setChecked(checkedFaces(result));
    for (const [kind, box] of SWITCHES) viewer.setShowChecked(kind, box.checked);
    shownFile = file;
    if (!samePart) collapsePassed();
    const keep = samePart ? stillThere(result, selected) : null; // a finding, passed feature or setup
    selected = keep?.id ?? null;
    if (keep) viewer.select(keep, false); // restore the selection without moving the camera
    renderVerdict(verdict, result);
    showFindings(result, "");
    status.textContent = `Showing ${result.part.name}.`;
  } catch (e) {
    if (mine !== run) return;
    error.textContent = e instanceof ApiError ? e.message : "Something went wrong showing this part.";
    error.hidden = false;
    summary.hidden = true; // don't leave the previous part's numbers beside the error
    viewer.show([]);
    shownFile = null;
    selected = null;
    renderVerdict(verdict, null);
    showFindings(null, "No findings: this file could not be read.");
    status.textContent = "Choose another file, or try again.";
    if (!(e instanceof ApiError)) console.error(e);
  }
}

fileInput.addEventListener("change", analyse);
processSelect.addEventListener("change", analyse);
materialSelect.addEventListener("change", analyse);
