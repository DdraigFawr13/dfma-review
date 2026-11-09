// Page wiring: analyse as soon as a file is chosen, and again when process or material
// changes while a file is loaded. No submit button (spec S1, settled at build).
// The review reads as five steps, one shown at a time, named in the address (review-steps spec J1, J2; D-042, D-045).

import { analyze, ApiError, type Analysis, type Material, type Process } from "./api";
import { collapsePassed, renderBlends, renderFindings, renderHoleFeatures, renderPlan, renderThreads, type Pick } from "./findings";
import { formatSize } from "./format";
import { buildReport, reportName } from "./report";
import { STEPS, STEP_NAMES, renderCost, renderOverview, renderReport, stepCounts, type Step } from "./steps";
import { Viewer, type CheckedKind } from "./viewer";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const fileInput = byId<HTMLInputElement>("file");
const iptInput = byId<HTMLInputElement>("ipt");
const processSelect = byId<HTMLSelectElement>("process");
const materialSelect = byId<HTMLSelectElement>("material");
const status = byId<HTMLParagraphElement>("status");
const error = byId<HTMLParagraphElement>("error");
const errorNext = byId<HTMLParagraphElement>("error-next");
const startForm = byId<HTMLFormElement>("start");
const overview = byId<HTMLElement>("overview");
const settings = byId<HTMLElement>("settings");
const note = byId<HTMLElement>("viewer-note");
const list = byId<HTMLElement>("findings");
const count = byId<HTMLElement>("findings-count");
const back = byId<HTMLButtonElement>("step-back");
const next = byId<HTMLButtonElement>("step-next");
const tabs = new Map(STEPS.map((s) => [s, document.querySelector<HTMLButtonElement>(`[data-testid="step-${s}"]`)!]));
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
let shownIpt: File | null = null;
// The same words as settings.MSG_IPT_NEEDS_STEP in the service (I1 spec Builder defaults)
const NEEDS_STEP = "Add the STEP export of this part: the shape is read from the STEP";

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
  const flagged = new Set<string | null>(result.findings.map((f) => f.feature));
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
  if (id.startsWith("thread:")) { // I1 S2: a thread row selects its hole
    const t = result.inventor?.threads?.find((x) => `thread:${x.id}` === id);
    const hole = t?.hole ? result.features.find((x) => x.id === t.hole) : undefined;
    return hole ? { id, faces: hole.faces } : null;
  }
  if (id.startsWith("hf:") || id.startsWith("hfh:")) { // I2 S1 (D-040): a feature's holes, or one hole
    const feats = result.inventor?.hole_features ?? [];
    const holes = id.startsWith("hf:") ? feats.find((f) => `hf:${f.id}` === id)?.holes ?? []
      : feats.flatMap((f) => f.holes).filter((h) => `hfh:${h.id}` === id);
    const faces = [...new Set(holes.flatMap((h) => result.features.find((x) => x.id === h.hole)?.faces ?? []))];
    return faces.length ? { id, faces } : null;
  }
  if (id.startsWith("bl:")) { // I3 S3: a blend's STEP faces
    const b = result.inventor?.blends?.find((x) => `bl:${x.id}` === id);
    return b?.step_faces.length ? { id, faces: b.step_faces } : null;
  }
  if (id.startsWith("setup:")) {
    const s = result.setups[Number(id.slice(6))];
    const i = Number(id.slice(6));
    return s ? { id, faces: [...new Set(result.operations.filter((o) => o.setup === i).flatMap((o) => o.faces))] } : null;
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
  const side = document.querySelector<HTMLElement>(".side")!, keepScroll = side.scrollTop; // keep the reader's place
  renderFindings(list, result, message, select, selected);
  count.textContent = result ? String(result.findings.length) : "";
  shown = result;
  renderPlan(byId("plan"), byId("plan-count"), result, select, selected);
  byId("plan-panel").hidden = !result?.machine;
  byId("plan-none").hidden = !result || !!result.machine;
  const threadsBox = byId<HTMLDetailsElement>("threads-panel");
  renderThreads(byId("threads"), result, select, selected); // I1 S2 (D-036)
  threadsBox.hidden = !result?.inventor;
  byId("threads-count").textContent = result?.inventor ? String(result.inventor.threads?.length ?? 0) : "";
  renderHoleFeatures(byId("hole-features"), result, select, selected); // I2 S1 (D-040)
  byId("hole-features-panel").hidden = !result?.inventor;
  byId("hole-features-count").textContent = result?.inventor ? String(result.inventor.hole_features?.length ?? 0) : "";
  renderBlends(byId("blends"), result, select, selected); // I3 S3 (D-043)
  byId("blends-panel").hidden = !result?.inventor;
  byId("blends-count").textContent = result?.inventor ? String(result.inventor.blends?.length ?? 0) : "";
  side.scrollTop = keepScroll;
  const counts = stepCounts(byId("step-counts"), result);
  tabs.get("features")!.setAttribute("aria-label", counts ? `2 Features: ${counts}` : "2 Features");
  byId<HTMLButtonElement>("export-pdf").disabled = !result;
  byId("export-pdf").hidden = !result;
  byId("top-file").hidden = !result;
  byId("top-file").textContent = result?.part.name ?? "";
  for (const s of STEPS) if (s !== "part") tabs.get(s)!.disabled = !result;
  overview.hidden = !result;
  startForm.hidden = !!result;
  // Process and material: in the form, then in the overview. Moved only when that changes, so a select keeps focus.
  if (settings.parentElement !== (result ? byId("settings-slot") : startForm)) {
    (result ? byId("settings-slot") : error).insertAdjacentElement(result ? "beforeend" : "beforebegin", settings);
  }
  if (!result) return;
  renderOverview(byId("overview-cards"), byId("fix-first"), result, (s) => showStep(s));
  renderCost(byId("cost"), result);
  renderReport(byId("report-rules"), byId<HTMLDetailsElement>("report-assumptions"), result);
}

// --- Steps (review-steps J2): the address names the step; Back and Forward walk them ---

let step: Step = "part";

function fromHash(): Step {
  const name = location.hash.slice(1);
  return (STEPS as readonly string[]).includes(name) ? (name as Step) : "part";
}

/** Show one step: its tab current, its section alone, Back / Next named after their neighbours, focus on its
 *  heading. Before a part is read only Part shows. */
function showStep(name: Step, focus = true): void {
  if (!shown) name = "part";
  step = name;
  if (location.hash !== `#${name}`) {
    if (shown && location.hash) location.hash = name; // a history entry, so the phone's Back walks the steps
    else history.replaceState(null, "", `#${name}`);
  }
  for (const s of STEPS) {
    byId(`page-${s}`).hidden = s !== name;
    const tab = tabs.get(s)!;
    if (s === name) tab.setAttribute("aria-current", "step");
    else tab.removeAttribute("aria-current");
  }
  const i = STEPS.indexOf(name);
  back.hidden = !shown || i === 0;
  next.hidden = !shown || i === STEPS.length - 1;
  if (i > 0) back.textContent = `‹ ${STEP_NAMES[STEPS[i - 1]]}`;
  if (i < STEPS.length - 1) next.textContent = `${STEP_NAMES[STEPS[i + 1]]} ›`;
  byId("legend").hidden = name !== "features"; // the legend describes the Features tints (spec Builder defaults)
  if (focus) [...byId(`page-${name}`).querySelectorAll<HTMLElement>("h2")].find((h) => h.offsetParent !== null)?.focus();
}

for (const [s, tab] of tabs) tab.addEventListener("click", () => showStep(s));
back.addEventListener("click", () => showStep(STEPS[STEPS.indexOf(step) - 1]));
next.addEventListener("click", () => showStep(STEPS[STEPS.indexOf(step) + 1]));
window.addEventListener("hashchange", () => {
  if (fromHash() !== step || !shown) showStep(fromHash());
});
showStep(fromHash(), false);

/** The words over the model: what to do, "Analysing …", or "No part loaded." after a refused file. */
function viewerNote(text: string | null, busy = false): void {
  note.hidden = text === null;
  byId("viewer-note-text").textContent = text ?? "";
  byId("spin").hidden = !busy;
}

async function analyse(): Promise<void> {
  const file = fileInput.files?.[0] ?? null;
  const ipt = iptInput.files?.[0] ?? null;
  if (!file) {
    // D-034: an .ipt picked first waits for its STEP
    if (ipt) status.textContent = "Now choose the STEP file that Inventor exported from this .ipt.";
    return;
  }
  const mine = ++run;
  if (/\.ipt$/i.test(file.name)) { // the shape comes from the STEP (D-031): no upload
    showError(NEEDS_STEP);
    return;
  }
  const both = ipt ? ` with ${ipt.name}` : "";
  status.textContent = `Analysing ${file.name}${both}…`;
  error.hidden = true;
  errorNext.hidden = true;
  if (!shown) viewerNote(`Analysing ${file.name}${both}…`, true);
  try {
    const result = await analyze(file, ipt, processSelect.value as Process, materialSelect.value as Material);
    if (mine !== run) return; // a newer upload replaced this one
    const samePart = shownFile === file && shownIpt === ipt; // a new .ipt is a new part (spec Builder defaults)
    byId("part-size").textContent = formatSize(result.part.bbox_in);
    byId("face-count").textContent = `${result.part.face_count} faces`;
    byId("part-units").textContent = result.part.units_in_file;
    byId("part-name").textContent = result.part.name + (result.inventor ? ` with ${result.inventor.name}` : "");
    byId("ipt-build").textContent = result.inventor?.saved_with ?? "";
    byId("inventor-meta").hidden = !result.inventor;
    viewerNote(null);
    viewer.show(result.faces, samePart); // the same file re-analysed keeps the camera
    viewer.setFindings(result.findings, edgesOf(result));
    viewer.setChecked(checkedFaces(result));
    for (const [kind, box] of SWITCHES) viewer.setShowChecked(kind, box.checked);
    shownFile = file;
    shownIpt = ipt;
    if (!samePart) {
      collapsePassed();
      byId<HTMLDetailsElement>("report-assumptions").open = false; // folded for each new part (spec J5)
      // D-036: the Threads panel opens when a new part's .ipt has threads; after that it stays as the reader left it
      byId<HTMLDetailsElement>("threads-panel").open = (result.inventor?.threads?.length ?? 0) > 0;
      // D-040: the Hole features panel opens when a hole disagrees or isn't mapped
      byId<HTMLDetailsElement>("hole-features-panel").open = (result.inventor?.hole_features ?? []).some((f) => f.state !== "matched");
      // I3 S3: likewise the Fillets and chamfers panel, when a blend disagrees or isn't mapped
      byId<HTMLDetailsElement>("blends-panel").open = (result.inventor?.blends ?? []).some((b) => b.state !== "matched");
    }
    const keep = samePart ? stillThere(result, selected) : null; // a finding, passed feature or setup
    selected = keep?.id ?? null;
    if (keep) viewer.select(keep, false); // restore the selection without moving the camera
    showFindings(result, "");
    if (!samePart) showStep("part"); // a new part opens on its overview; a material change keeps the step
    status.textContent = `Showing ${result.part.name}${result.inventor ? ` with ${result.inventor.name}` : ""}.`;
  } catch (e) {
    if (mine !== run) return;
    showError(e instanceof ApiError ? e.message : "Something went wrong showing this part.");
    if (!(e instanceof ApiError)) console.error(e);
  }
}

/** A refused or failed part: the reason, and nothing left of the previous part on screen. */
function showError(message: string): void {
  clearPart();
  error.textContent = message;
  error.hidden = false;
  errorNext.hidden = false;
  viewerNote("No part loaded.");
  status.textContent = "";
}

/** No part on screen: the start form, nothing left of the previous part (its numbers, model or selection). */
function clearPart(): void {
  viewer.show([]);
  shownFile = null;
  shownIpt = null;
  selected = null;
  showFindings(null, "No findings: this file could not be read.");
  showStep("part", false);
}

/** "Change file" (spec Design "Parts"): the start form again; process and material keep their values, both file
 *  inputs clear, an analysis in flight is dropped and the selection clears. */
byId("change-file").addEventListener("click", () => {
  run++;
  fileInput.value = "";
  iptInput.value = "";
  error.hidden = true;
  errorNext.hidden = true;
  clearPart();
  viewerNote("The part shows here once it's read.");
  status.textContent = "Choose a STEP file to start. Add its .ipt too, if you have one.";
  startForm.querySelector("h2")!.focus();
});
startForm.addEventListener("submit", (e) => e.preventDefault());

fileInput.addEventListener("change", analyse);
iptInput.addEventListener("change", analyse);
processSelect.addEventListener("change", analyse);
materialSelect.addEventListener("change", analyse);

/** Export PDF (spec J6): the report for the part on screen, built here in the browser. In the top bar on every
 *  step, and on the Report step. */
async function exportPdf(): Promise<void> {
  const result = shown;
  if (!result) return;
  const button = byId<HTMLButtonElement>("export-pdf"), again = byId<HTMLButtonElement>("report-export-pdf");
  button.disabled = again.disabled = true;
  status.classList.remove("failed"); // a failed export before this one no longer applies
  status.textContent = "Building the PDF…";
  await new Promise((r) => setTimeout(r, 0)); // let the message show before the build holds the page
  try {
    const label = (select: HTMLSelectElement) => select.selectedOptions[0]?.textContent ?? select.value;
    const doc = buildReport({
      result,
      processLabel: label(processSelect),
      materialLabel: label(materialSelect),
      date: new Date().toISOString().slice(0, 10),
      picture: (f) => viewer.snapshot(f),
    });
    doc.save(reportName(result.part.name));
    status.textContent = `Saved the PDF for ${result.part.name}.`;
  } catch (e) {
    console.error(e);
    status.textContent = "The PDF could not be built. Try again.";
    status.classList.add("failed"); // "Error: " before it, as in the start form
  } finally {
    button.disabled = again.disabled = shown === null;
  }
}
byId("export-pdf").addEventListener("click", exportPdf);
byId("report-export-pdf").addEventListener("click", exportPdf);
