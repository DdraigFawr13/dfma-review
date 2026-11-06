// Page wiring: analyse as soon as a file is chosen, and again when process or material
// changes while a file is loaded. No submit button (spec S1, settled at build).

import { analyze, ApiError, type Analysis, type Finding, type Material, type Process } from "./api";
import { renderFindings, renderVerdict } from "./findings";
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
    };
  }
}
window.__dfma = {
  highlightedFaces: () => viewer.highlightedFaces(),
  cameraTarget: () => viewer.cameraTarget(),
  paintedFaces: () => viewer.paintedFaces(), // test hook: what is actually drawn in the accent colour
  opacities: () => viewer.opacities(),
  checkedFaces: (kind?: CheckedKind) => viewer.checkedFaces(kind), // test hook: drawn in a kind's "checked" colour
};

/** Faces of the features checked with no finding, by kind; corners go last so a corner fillet
 *  (also a pocket wall) shows the corner colour. */
function checkedFaces(result: Analysis): Map<number, CheckedKind> {
  const flagged = new Set(result.findings.map((f) => f.feature));
  const out = new Map<number, CheckedKind>();
  for (const kind of ["hole", "pocket", "corner"] as CheckedKind[]) {
    for (const f of result.features) {
      if (f.kind === kind && !flagged.has(f.id)) for (const id of f.faces) out.set(id, kind);
    }
  }
  return out;
}

function select(f: Finding): void {
  selected = selected === f.id ? null : f.id; // clicking the selected finding again clears it
  viewer.select(selected ? f : null);
  for (const row of list.querySelectorAll<HTMLButtonElement>(".finding")) {
    row.setAttribute("aria-pressed", String(row.dataset.testid === `finding-${selected}`));
  }
}

function showFindings(result: Analysis | null, message: string): void {
  renderFindings(list, result, message, select, selected);
  count.textContent = result ? String(result.findings.length) : "";
  assumptions.hidden = !result;
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
    viewer.setFindings(result.findings);
    viewer.setChecked(checkedFaces(result));
    for (const [kind, box] of SWITCHES) viewer.setShowChecked(kind, box.checked);
    shownFile = file;
    const keep = samePart ? result.findings.find((f) => f.id === selected) ?? null : null;
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
