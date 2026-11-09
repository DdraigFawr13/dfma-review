// Page wiring: analyse as soon as a file is chosen, and again when process or material
// changes while a file is loaded. No submit button (spec S1, settled at build).
// The review reads as five steps, one shown at a time, named in the address (review-steps spec J1, J2; D-042, D-045).

import { analyze, ApiError, type Analysis, type Material, type Process } from "./api";
import { blendKinds, renderBlends, renderHoleFeatures, renderPlan, renderThreads, setupHead, type Pick } from "./findings";
import { formatSize } from "./format";
import { buildReport, reportName } from "./report";
import { STEPS, STEP_NAMES, groupTally, placeRows, placedLine, renderChips, renderCost, renderOverview, renderReport,
  renderRows, renderSetupChips, rowFaces, stepCounts, type RowFilter, type Step } from "./steps";
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
const rowsHost = byId<HTMLElement>("rows");
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
/** What is selected (review-steps spec Design "Parts"): a row and the finding it shows, or one thing by its id
 *  ("pass:wall-3", "setup:1", "thread:t1", "hf:hf-3", "hfh:hf-3.1", "bl:bl-2"). */
type Sel = { kind: "row"; row: string; at: number }
  | { kind: "finding" | "pass" | "setup" | "thread" | "hf" | "hfh" | "bl"; id: string } | null;
let sel: Sel = null;
let openRow: string | null = null; // the Features row shown open (a passed feature can be selected inside it)
let rowFilter: RowFilter = "issues";
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

/** The selection id the panels mark as pressed; a row's selection is marked by the row itself. */
function selId(): string | null {
  return sel && sel.kind !== "row" ? sel.id : null;
}

function kindOf(id: string): Exclude<NonNullable<Sel>, { kind: "row" }>["kind"] {
  const k = id.split(":")[0];
  return (["pass", "setup", "thread", "hf", "hfh", "bl"].includes(k) ? k : "finding") as "finding";
}

/** What the viewer shows for a selection in `result`, or null when it isn't there (a new result of the same file:
 *  a material change). A row shows all its findings' faces, its pin the shown finding's. */
function pickOf(result: Analysis, s: Sel): Pick | null {
  if (!s) return null;
  if (s.kind === "row") {
    const r = [...result.rows, ...result.passed_rows].find((x) => x.id === s.row);
    if (!r) return null;
    return { id: r.findings[Math.min(s.at, r.findings.length - 1)] ?? r.id, faces: rowFaces(r, result) };
  }
  return stillThere(result, s.id);
}

/** One selected thing by its id, if it is still there. */
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

/** Show the selection on the model and redraw the lists. */
function apply(frame = true): void {
  viewer.select(shown ? pickOf(shown, sel) : null, frame);
  showFindings(shown, "");
}

/** Select a passed feature, a setup or an .ipt row by its id (tapping the selected one again clears it). */
function select(f: Pick): void {
  sel = selId() === f.id ? null : { kind: kindOf(f.id), id: f.id };
  openRow = null; // a setup or .ipt selection replaces the open row
  apply();
}

const rowHandlers = {
  onRow(r: { id: string }) { // a row opens with its first finding; tapping the open row closes it
    openRow = openRow === r.id ? null : r.id;
    sel = openRow ? { kind: "row", row: r.id, at: 0 } : null;
    apply();
  },
  onStep(delta: number) { // ‹ ›: the next finding in the open row, the row stays open
    if (sel?.kind !== "row") sel = openRow ? { kind: "row", row: openRow, at: 0 } : null;
    if (sel?.kind === "row") sel = { ...sel, at: Math.max(0, sel.at + delta) };
    apply();
  },
  onPass(fid: string) { // one feature of an open passed row alone; again: the whole row
    const id = `pass:${fid}`;
    sel = selId() === id ? (openRow ? { kind: "row", row: openRow, at: 0 } : null) : { kind: "pass", id };
    apply();
  },
};

function showFindings(result: Analysis | null, message: string): void {
  const side = document.querySelector<HTMLElement>(".side")!, keepScroll = side.scrollTop; // keep the reader's place
  const active = document.activeElement as HTMLElement | null; // redrawn lists keep keyboard focus (APP-02)
  const focusId = active && side.contains(active) ? active.dataset.testid : undefined;
  const page = byId("page-features"), keepRows = page.scrollTop;
  shown = result;
  const selected = selId();
  if (!result) {
    rowsHost.replaceChildren(Object.assign(document.createElement("p"), { className: "none pad", textContent: message }));
    byId("row-chips").replaceChildren();
  } else {
    renderChips(byId("row-chips"), result, rowFilter, (f) => {
      rowFilter = f;
      const list = f === "issues" ? result.rows : f === "passed" ? result.passed_rows : [...result.rows, ...result.passed_rows];
      if (openRow && !list.some((r) => r.id === openRow)) { // the open row is hidden: nothing stays selected unseen
        openRow = null;
        sel = null;
        viewer.select(null, false);
      }
      showFindings(shown, "");
    });
    const at = sel?.kind === "row" ? sel.at : 0;
    renderRows(rowsHost, result, rowFilter, { row: openRow, at, pass: sel?.kind === "pass" ? sel.id.slice(5) : null }, rowHandlers);
  }
  // S3 (frame r3-mach, D-049): each row's findings placed in a setup, the whole part or no setup
  const placed = result ? placeRows(result) : new Map();
  renderPlan(byId("plan"), byId("plan-count"), result, select, selected,
    (where) => (placed.get(where) ?? []).map(placedLine));
  byId("plan-panel").hidden = !result?.machine;
  byId("plan-none").hidden = !result || !!result.machine;
  if (result) renderSetupChips(byId("setup-chips"), result, result.setups.map((s, i) => setupHead(s, i).replace(", about the turning axis", "")),
    selected, (i) => select({ id: `setup:${i}`, faces: stillThere(result, `setup:${i}`)?.faces ?? [] }));
  // The .ipt groups at the foot of the Features step (D-049): one folding row each, its tally in the approved words
  const inv = result?.inventor;
  byId("ipt-groups").hidden = !inv;
  byId("ipt-source").textContent = inv ? `From ${inv.name}` : "";
  renderThreads(byId("threads"), result, select, selected); // I1 S2 (D-036)
  byId("threads-count").textContent = inv ? String(inv.threads?.length ?? 0) : "";
  groupTally(byId("threads-tally"), (inv?.threads ?? []).map((t) => t.state));
  renderHoleFeatures(byId("hole-features"), result, select, selected); // I2 S1 (D-040)
  byId("hole-features-count").textContent = inv ? String(inv.hole_features?.length ?? 0) : "";
  const holes = (inv?.hole_features ?? []).flatMap((f) => f.holes);
  groupTally(byId("hole-features-tally"), holes.map((h) => h.state),
    inv?.hole_features?.length ? `${inv.hole_features.length} Hole features, ${holes.length} ${holes.length === 1 ? "hole" : "holes"}: ` : "");
  renderBlends(byId("blends"), result, select, selected); // I3 S3 (D-043)
  byId("blends-count").textContent = inv ? String(inv.blends?.length ?? 0) : "";
  const blends = inv?.blends ?? [];
  groupTally(byId("blends-tally"), blends.map((b) => b.state), blends.length ? `${blendKinds(blends)}: ` : "");
  side.scrollTop = keepScroll;
  page.scrollTop = keepRows;
  if (focusId && !side.contains(document.activeElement)) {
    side.querySelector<HTMLElement>(`[data-testid="${focusId}"]`)?.focus({ preventScroll: true });
  }
  byId("setup-chips").hidden = !result || step !== "machining" || !result.setups.length;
  const counts = stepCounts(byId("step-counts"), result);
  tabs.get("features")!.setAttribute("aria-label", counts ? `2 Features: ${counts}` : "2 Features");
  byId<HTMLButtonElement>("export-pdf").disabled = !result;
  byId("export-pdf").hidden = !result;
  byId("top-file").hidden = !result;
  byId("top-file").textContent = result?.part.name ?? "";
  for (const s of STEPS) if (s !== "part") { // focusable while closed, with the reason (audit F19)
    const tab = tabs.get(s)!;
    if (result) { tab.removeAttribute("aria-disabled"); tab.removeAttribute("aria-describedby"); tab.removeAttribute("title"); }
    else { tab.setAttribute("aria-disabled", "true"); tab.setAttribute("aria-describedby", "steps-why"); tab.title = "Read a STEP file to open steps 2 to 5"; }
  }
  overview.hidden = !result;
  startForm.hidden = !!result;
  // Process and material: in the form, then in the overview. Moved only when that changes, so a select keeps focus.
  if (settings.parentElement !== (result ? byId("settings-slot") : startForm)) {
    (result ? byId("settings-slot") : byId("ipt-field")).insertAdjacentElement(result ? "beforeend" : "afterend", settings);
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
  // Show OK and the OK tints on Features only (J3); the setup chips on Machining only (J4)
  byId("show-ok").hidden = !shown || name !== "features";
  viewer.setOkStep(!!shown && name === "features");
  byId("setup-chips").hidden = !shown || name !== "machining" || !shown.setups.length;
  if (focus) [...byId(`page-${name}`).querySelectorAll<HTMLElement>("h2")].find((h) => h.offsetParent !== null)?.focus();
}

for (const [s, tab] of tabs) tab.addEventListener("click", () => { if (tab.getAttribute("aria-disabled") !== "true") showStep(s); });

// audit F18: below 900 px the model sits above the list, so Show OK moves under the chips; back at the model's foot when wide
const narrow = window.matchMedia("(max-width: 900px)");
function placeShowOk(): void {
  const showOk = byId("show-ok");
  if (narrow.matches) byId("row-chips").insertAdjacentElement("afterend", showOk);
  else document.querySelector(".viewfoot")!.append(showOk);
}
narrow.addEventListener("change", placeShowOk);
placeShowOk();
back.addEventListener("click", () => showStep(STEPS[STEPS.indexOf(step) - 1]));
next.addEventListener("click", () => showStep(STEPS[STEPS.indexOf(step) + 1]));
window.addEventListener("hashchange", () => {
  if (fromHash() !== step || !shown) showStep(fromHash());
});
showStep(fromHash(), false);

/** The words over the model: what to do, "Analyzing …", or "No part loaded." after a refused file. */
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
  status.textContent = `Analyzing ${file.name}${both}…`;
  error.hidden = true;
  errorNext.hidden = true;
  fileInput.removeAttribute("aria-describedby");
  if (!shown) viewerNote(`Analyzing ${file.name}${both}…`, true);
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
      rowFilter = "issues"; // a new part opens on its issues, no row open
      openRow = null;
      byId<HTMLDetailsElement>("report-assumptions").open = false; // folded for each new part (spec J5)
      // D-036: the Threads panel opens when a new part's .ipt has threads; after that it stays as the reader left it
      byId<HTMLDetailsElement>("threads-panel").open = (result.inventor?.threads?.length ?? 0) > 0;
      // D-040: the Hole features panel opens when a hole disagrees or isn't mapped
      byId<HTMLDetailsElement>("hole-features-panel").open = (result.inventor?.hole_features ?? []).some((f) => f.state !== "matched");
      // I3 S3: likewise the Fillets and chamfers panel, when a blend disagrees or isn't mapped
      byId<HTMLDetailsElement>("blends-panel").open = (result.inventor?.blends ?? []).some((b) => b.state !== "matched");
    }
    const keep = samePart ? pickOf(result, sel) : null; // a row, passed feature, setup or .ipt row
    if (!keep) { sel = null; openRow = null; }
    if (openRow && ![...result.rows, ...result.passed_rows].some((r) => r.id === openRow)) openRow = null;
    shown = result;
    viewer.select(keep, false); // restore the selection without moving the camera
    showFindings(result, "");
    if (!samePart) showStep("part"); // a new part opens on its overview; a material change keeps the step
    status.textContent = `Showing ${result.part.name}${result.inventor ? ` with ${result.inventor.name}` : ""}.`;
  } catch (e) {
    if (mine !== run) return;
    showError(e instanceof ApiError ? e.message : "Something went wrong showing this part.", e instanceof ApiError ? e.retry : true);
    if (!(e instanceof ApiError)) console.error(e);
  }
}

/** A refused or failed part: the reason, and nothing left of the previous part on screen. */
function showError(message: string, retry = false): void {
  clearPart();
  error.textContent = message;
  error.hidden = false;
  errorNext.hidden = !retry; // "try again" only when it can help (audit F3)
  fileInput.setAttribute("aria-describedby", "error");
  viewerNote("No part loaded.");
  status.textContent = "";
}

/** No part on screen: the start form, nothing left of the previous part (its numbers, model or selection). */
function clearPart(): void {
  viewer.show([]);
  shownFile = null;
  shownIpt = null;
  sel = null;
  openRow = null;
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
  fileInput.removeAttribute("aria-describedby");
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
