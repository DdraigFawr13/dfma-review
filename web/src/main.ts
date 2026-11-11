// Page wiring: analyse as soon as a file is chosen, and again when process or material
// changes while a file is loaded. No submit button (spec S1, settled at build).
// The review reads as five steps, one shown at a time, named in the address (review-steps spec J1, J2; D-042, D-045).

import { EXAMPLES } from "./examples";
import { NOT_WORKED_OUT, noChecksRun, notCheckedLine, planNotWorkedOut } from "./notrun";
import { analyze, ApiError, type Analysis, type Material, type Process } from "./api";
import { blendKinds, renderBlends, renderHoleFeatures, renderPlan, renderThreads, setupHead, type Pick } from "./findings";
import { formatSize } from "./format";
import { buildReport, reportName } from "./report";
import { STEPS, STEP_NAMES, groupTally, placeRows, placedLine, renderChips, renderCost, renderOverview, renderReport,
  renderRows, renderSetupChips, rowFaces, stepCounts, type Placed, type RowFilter, type Step } from "./steps";
import { Viewer, VIEWS, type CheckedKind, type ViewName } from "./viewer";

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
// UI fixes A2: the view buttons move the camera, never the part
for (const name of Object.keys(VIEWS) as ViewName[]) byId(`view-${name}`).addEventListener("click", () => viewer.showView(name));

let run = 0;
/** What is selected (review-steps spec Design "Parts"): a row and the finding it shows, or one thing by its id
 *  ("pass:wall-3", "setup:1", "thread:t1", "hf:hf-3", "hfh:hf-3.1", "bl:bl-2"). */
type Sel = { kind: "row"; row: string; at: number }
  | { kind: "finding" | "pass" | "setup" | "op" | "thread" | "hf" | "hfh" | "bl"; id: string } | null;
let sel: Sel = null;
let openRow: string | null = null; // the Features row shown open (a passed feature can be selected inside it)
let rowFilter: RowFilter = "issues";
let shownFile: File | null = null;
let shownIpt: File | null = null;
let stepFile: File | null = null; // what was picked or loaded as an example: a material or process change reads it again
let iptFile: File | null = null;
let machine = false; // UI fixes B3: the Machine view, on the Machining step only

declare global {
  interface Window {
    __dfma: {
      highlightedFaces(): number[];
      cameraTarget(): [number, number, number];
      paintedFaces(): number[];
      opacities(): Record<number, number>;
      checkedFaces(kind?: CheckedKind): number[];
      analysis(): Analysis | null;
      flagBoxes(): { id: string; x: number; y: number; w: number; h: number }[];
      flagState(): { id: string; shown: boolean; mergedInto: string }[];
      pinFootprints(): { id: string; x: number; y: number; w: number; h: number }[];
      view(): { position: [number, number, number]; target: [number, number, number]; up: [number, number, number] };
      part(): { center: [number, number, number]; radius: number; box: [number, number, number, number, number, number] };
      partMatrix(): number[];
      triad(): { axis: "X" | "Y" | "Z"; dx: number; dy: number }[];
      renderState(): { autoClear: boolean; scissorTest: boolean };
      placements(): number;
      faceColours(): Record<number, string>;
      barColours(): Record<string, { colour: string; opacity: number }>;
      spindle(): { diameter_mm: number } | null;
      chuck(): boolean;
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
  pinFootprints: () => viewer.pinFootprints(), // test hook: each pin shown with its stem and dot (audit F27)
  checkedFaces: (kind?: CheckedKind) => viewer.checkedFaces(kind),
  view: () => viewer.view(), // test hooks (UI fixes A10): the camera, the part's bounds and matrix
  part: () => viewer.partBounds(),
  partMatrix: () => viewer.partMatrix(),
  triad: () => viewer.triad(),
  renderState: () => viewer.renderState(),
  placements: () => viewer.placements(),
  faceColours: () => viewer.faceColours(),
  barColours: () => viewer.barColours(), // test hook: drawn in a kind's "checked" colour
  spindle: () => viewer.spindle(), // test hooks (UI fixes B3): the placeholder spindle and chuck
  chuck: () => viewer.chuck(),
  // test hook: the result on screen, without the view buffers the worker adds (port J4, J6b; the test build adds
  // wasm_bytes and worker)
  analysis: () => shown && { ...shown, faces: shown.faces.map(({ view: _view, ...f }) => f) },
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
  return (["pass", "setup", "op", "thread", "hf", "hfh", "bl"].includes(k) ? k : "finding") as "finding";
}

/** What the viewer shows for a selection in `result`, or null when it isn't there (a new result of the same file:
 *  a material change). A row shows the finding it shows, one at a time (UI fixes A5); a passed row all its features. */
function pickOf(result: Analysis, s: Sel): Pick | null {
  if (!s) return null;
  if (s.kind === "row") {
    const r = [...result.rows, ...result.passed_rows].find((x) => x.id === s.row);
    if (!r) return null;
    const id = r.findings[Math.min(s.at, r.findings.length - 1)];
    const f = id ? result.findings.find((x) => x.id === id) : undefined;
    return f ? { id: f.id, faces: f.faces } : { id: r.id, faces: rowFaces(r, result) };
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
  if (id.startsWith("op:")) { // B3: the faces one tool cuts in one setup
    const m = /^op:(\d+):(.+)$/.exec(id);
    const faces = m ? [...new Set(result.operations.filter((o) => o.setup === Number(m[1]) && o.tool === m[2]).flatMap((o) => o.faces))] : [];
    return faces.length ? { id, faces } : null;
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
  syncMachine();
  showFindings(shown, "");
}

/** Select a passed feature, a setup or an .ipt row by its id (tapping the selected one again clears it). */
function select(f: Pick, frame = true): void {
  sel = selId() === f.id ? null : { kind: kindOf(f.id), id: f.id };
  openRow = null; // a setup or .ipt selection replaces the open row
  apply(frame);
}

// --- Machine view (UI fixes B3) ---

type Vec3 = [number, number, number];

/** A setup's direction name ("+Z", "-X") in file coordinates, through the part's own axes (plan.ts ORDER). */
function directionOf(name: string): Vec3 | null {
  const axis = shown?.part.frame?.["xyz"["XYZ".indexOf(name[1])] as "x" | "y" | "z"];
  if (!axis) return null;
  const sign = name[0] === "+" ? 1 : -1;
  return [sign * axis[0], sign * axis[1], sign * axis[2]];
}

/** The camera for setup `i` in the Machine view: its direction up, or the turning axis across the screen. */
function lookSetup(i: number): void {
  const s = shown?.setups[i];
  if (!shown || !s) return;
  if (s.direction === "turn") { if (shown.turn_axis) viewer.showLathe(shown.turn_axis as Vec3); return; }
  const d = directionOf(s.direction);
  if (d) viewer.showSetup(d);
}

/** A setup picked (chip or plan box): selected as before; in the Machine view the camera goes to its side. */
function selectSetup(p: Pick): void {
  select(p);
  if (machine && sel?.kind === "setup" && sel.id === p.id) lookSetup(Number(p.id.slice(6)));
}

/** A tool row: lights the faces it cuts in that setup, with the spindle for a tool that has a diameter. */
function selectTool(setup: number, tool: string): void {
  const id = `op:${setup}:${tool}`;
  select({ id, faces: shown ? stillThere(shown, id)?.faces ?? [] : [] }, false); // the setup's view stays, spindle in sight
}

let toolsKey = "";
/** The placeholder spindle and chuck follow the Machine view and the tool row selected (B3). */
function syncMachine(): void {
  const on = machine && !!shown && step === "machining";
  const lathe = !!shown?.turn_axis && shown.setups.length === 1 && shown.setups[0].direction === "turn";
  const chuck = on && lathe ? (shown!.turn_axis as Vec3) : null;
  let spindle: { diameterMm: number; axis: Vec3; faces: number[] } | null = null;
  if (on && !lathe && sel?.kind === "op") {
    const m = /^op:(\d+):(.+)$/.exec(sel.id);
    const tool = m && shown!.tools.find((t) => t.id === m[2]);
    const axis = m && directionOf(shown!.setups[Number(m[1])]?.direction ?? "");
    const faces = stillThere(shown!, sel.id)?.faces ?? [];
    if (tool && tool.diameter_in !== null && axis && faces.length) spindle = { diameterMm: tool.diameter_in * 25.4, axis, faces };
  }
  const key = JSON.stringify([chuck, spindle]);
  if (key === toolsKey) return;
  toolsKey = key;
  viewer.setChuck(chuck);
  viewer.setSpindle(spindle);
}

/** Part or Machine. Leaving Machine drops the spindle and chuck and goes Home. */
function setMachine(on: boolean): void {
  if (machine === on) return;
  machine = on;
  byId<HTMLInputElement>(on ? "mode-machine" : "mode-part").checked = true;
  if (!on && sel?.kind === "op") sel = null;
  if (on) {
    if (sel?.kind === "setup") lookSetup(Number(sel.id.slice(6)));
    else if (shown?.setups.length === 1 && shown.setups[0].direction === "turn") lookSetup(0);
  } else viewer.showView("home");
  syncMachine();
  viewer.select(shown ? pickOf(shown, sel) : null, false);
  showFindings(shown, "");
}

/** What the model's overlays show: the setup chips and the Part / Machine switch on Machining; the view buttons not in Machine. */
function overlays(): void {
  const here = !!shown && step === "machining" && !!shown.setups.length;
  byId("setup-chips").hidden = !here;
  byId("mode-switch").hidden = !here;
  byId("views").hidden = !shown || machine;
}

const rowHandlers = {
  onRow(r: { id: string }) { // a row opens with its first finding; tapping the open row closes it
    openRow = openRow === r.id ? null : r.id;
    sel = openRow ? { kind: "row", row: r.id, at: 0 } : null;
    apply();
  },
  onStep(delta: number) { // ‹ ›: the next finding in the open row, the row stays open
    if (sel?.kind !== "row") sel = openRow ? { kind: "row", row: openRow, at: 0 } : null;
    if (sel?.kind === "row") { // clamped at both ends (UI fixes A7)
      const r = shown && [...shown.rows, ...shown.passed_rows].find((x) => x.id === (sel as { row: string }).row);
      sel = { ...sel, at: Math.min(Math.max(0, sel.at + delta), Math.max(0, (r?.findings.length ?? 1) - 1)) };
    }
    apply();
  },
  onPass(fid: string) { // one feature of an open passed row alone; again: the whole row
    const id = `pass:${fid}`;
    sel = selId() === id ? (openRow ? { kind: "row", row: openRow, at: 0 } : null) : { kind: "pass", id };
    apply();
  },
};

/** An issue line on Machining: open its row on Features at its first finding there, with keyboard focus on it (audit F27). */
function openPlaced(p: Placed): void {
  rowFilter = "issues";
  openRow = p.row.id;
  sel = { kind: "row", row: p.row.id, at: Math.max(0, p.row.findings.indexOf(p.ids[0])) };
  apply();
  showStep("features", false);
  const row = rowsHost.querySelector<HTMLElement>('.srow[aria-expanded="true"]');
  row?.scrollIntoView({ block: "nearest" });
  row?.focus();
}

function showFindings(result: Analysis | null, message: string): void {
  const side = document.querySelector<HTMLElement>(".side")!, keepScroll = side.scrollTop; // keep the reader's place
  const active = document.activeElement as HTMLElement | null; // redrawn lists keep keyboard focus (APP-02)
  const focusId = active && side.contains(active) ? active.dataset.testid : undefined;
  const page = byId("page-features"), keepRows = page.scrollTop;
  shown = result;
  const selected = selId();
  // The browser copy (D-057): the checks it has not run, over the rows; with none run, only that line
  const notChecked = result ? notCheckedLine(result) : null;
  byId("row-chips").hidden = !!result && noChecksRun(result); // no empty chips bar under the line (D-057 mock-up)
  byId("features-notrun").hidden = !notChecked;
  byId("features-notrun").textContent = notChecked ?? "";
  if (!result) {
    rowsHost.replaceChildren(Object.assign(document.createElement("p"), { className: "none pad", textContent: message }));
    byId("row-chips").replaceChildren();
  } else if (noChecksRun(result)) {
    rowsHost.replaceChildren();
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
  renderPlan(byId("plan"), byId("plan-count"), result, selectSetup, selected,
    (where) => (placed.get(where) ?? []).map((p: Placed) => placedLine(p, openPlaced)),
    machine ? { onTool: selectTool } : null);
  const later = !!result && planNotWorkedOut(result); // the browser copy until S3 (D-057)
  byId("plan-notrun").hidden = !later;
  byId("plan-notrun").textContent = later ? NOT_WORKED_OUT : "";
  byId("plan-panel").hidden = later || !result?.machine;
  byId("plan-none").hidden = later || !result || !!result.machine;
  if (result) renderSetupChips(byId("setup-chips"), result, result.setups.map((s, i) => setupHead(s, i).replace(", about the turning axis", "")),
    selected, (i) => selectSetup({ id: `setup:${i}`, faces: stillThere(result, `setup:${i}`)?.faces ?? [] }));
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
  overlays();
  const counts = stepCounts(byId("step-counts"), result);
  tabs.get("features")!.setAttribute("aria-label", counts ? `2 Features: ${counts}` : "2 Features");
  byId<HTMLButtonElement>("export-pdf").disabled = !result;
  byId("export-pdf").hidden = !result;
  byId("triad-caption").hidden = !result;
  for (const s of STEPS) if (s !== "part") { // focusable while closed, with the reason (audit F19)
    const tab = tabs.get(s)!;
    if (result) { tab.removeAttribute("aria-disabled"); tab.removeAttribute("aria-describedby"); tab.removeAttribute("title"); }
    else { tab.setAttribute("aria-disabled", "true"); tab.setAttribute("aria-describedby", "steps-why"); tab.title = "Read a STEP file to open steps 2 to 5"; }
  }
  overview.hidden = !result;
  startForm.hidden = !!result;
  // Process and material: in the form, then in the overview. Moved only when that changes, so a select keeps focus.
  if (settings.parentElement !== (result ? byId("settings-slot") : startForm)) {
    (result ? byId("settings-slot") : byId("example-field")).insertAdjacentElement(result ? "beforeend" : "afterend", settings);
  }
  if (!result) return;
  renderOverview(byId("overview-cards"), byId("fix-first"), result, (s) => showStep(s));
  renderCost(byId("cost"), result);
  renderReport(byId("report-rules"), byId<HTMLDetailsElement>("report-assumptions"), result);
  // The browser copy (D-057): the line under the heading; no empty "Checks run"; "The PDF holds" lists only what it has
  const reportLine = notCheckedLine(result);
  byId("report-notrun").hidden = !reportLine;
  byId("report-notrun").textContent = reportLine ?? "";
  byId("report-checks").hidden = noChecksRun(result);
  for (const li of document.querySelectorAll<HTMLElement>("#page-report [data-pdf]")) {
    const what = li.dataset.pdf;
    li.hidden = (what === "plan" && planNotWorkedOut(result)) || (what === "findings" && noChecksRun(result))
      || (what === "ipt" && result.checks_not_run !== undefined && result.checks_not_run.includes(".ipt check"));
  }
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
    if (s === name) { tab.setAttribute("aria-current", "step"); tab.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } // in view when the bar scrolls (F20)
    else tab.removeAttribute("aria-current");
  }
  const i = STEPS.indexOf(name);
  back.hidden = !shown || i === 0;
  next.hidden = !shown || i === STEPS.length - 1;
  if (i > 0) back.textContent = `‹ ${STEP_NAMES[STEPS[i - 1]]}`;
  if (i < STEPS.length - 1) next.textContent = `${STEP_NAMES[STEPS[i + 1]]} ›`;
  // Show OK and the OK tints on Features only (J3); the setup chips on Machining only (J4)
  byId("show-ok").hidden = !shown || name !== "features" || noChecksRun(shown);
  viewer.setOkStep(!!shown && name === "features");
  if (name !== "machining") setMachine(false); // leaving Machining: spindle and chuck go, Home view (B3)
  syncMachine();
  overlays();
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
// UI fixes A12: at 500 px and below the view buttons move under the model, before the hint (moved, not copied)
const small = window.matchMedia("(max-width: 500px)");
function placeViews(): void {
  const views = byId("views");
  if (small.matches) document.querySelector(".viewfoot .hint")!.insertAdjacentElement("beforebegin", views);
  else byId("viewer").insertAdjacentElement("afterend", views);
}
small.addEventListener("change", placeViews);
placeViews();
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
  const file = stepFile, ipt = iptFile;
  if (!file) return;
  const mine = ++run;
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
    viewer.setFrame(result.part.frame ?? null); // the triad, in part axes (UI fixes A3)
    for (const [kind, box] of SWITCHES) viewer.setShowChecked(kind, box.checked);
    shownFile = file;
    shownIpt = ipt;
    if (!samePart) {
      machine = false; // a new part opens in the Part view (B3)
      byId<HTMLInputElement>("mode-part").checked = true;
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
  viewer.setFrame(null);
  shownFile = null;
  shownIpt = null;
  sel = null;
  openRow = null;
  showFindings(null, "No findings: this file could not be read.");
  showStep("part", false);
}

/** The one picker (UI fixes B2): a STEP and, if there is one, its .ipt, sorted by extension. */
const PICK_ERROR = "Choose one STEP file and, if you have it, its .ipt.";
function pick(list: File[]): void {
  if (!list.length) return;
  const ipts = list.filter((f) => /\.ipt$/i.test(f.name)), steps = list.filter((f) => !/\.ipt$/i.test(f.name));
  if (list.length > 2 || steps.length > 1 || ipts.length > 1) {
    run++;
    stepFile = iptFile = null;
    showError(PICK_ERROR);
    return;
  }
  if (!steps.length) { // D-034: an .ipt picked alone waits for its STEP
    status.textContent = "Now choose the STEP file that Inventor exported from this .ipt.";
    return;
  }
  stepFile = steps[0];
  iptFile = ipts[0] ?? null;
  void analyse();
}

fileInput.addEventListener("change", () => {
  const list = [...(fileInput.files ?? [])];
  fileInput.value = ""; // the same files can be picked again
  pick(list);
});
byId("open-button").addEventListener("click", () => fileInput.click());
byId("start-open").addEventListener("click", () => fileInput.click());

// --- Examples (UI fixes B1): the start form's buttons and the top bar's menu ---

const exButton = byId<HTMLButtonElement>("examples-button");
const exMenu = byId("examples-menu");
const exItems: HTMLButtonElement[] = [];
function closeMenu(refocus: boolean): void {
  exMenu.hidden = true;
  exButton.setAttribute("aria-expanded", "false");
  if (refocus) exButton.focus();
}
function openMenu(): void {
  exMenu.hidden = false;
  exButton.setAttribute("aria-expanded", "true");
  exItems[0]?.focus();
}
async function openExample(name: string): Promise<void> {
  const example = EXAMPLES.find((e) => e.name === name);
  if (!example) return;
  closeMenu(true);
  const mine = ++run;
  let file: File;
  try {
    const res = await fetch(`${(import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL}examples/${name}.step`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    file = new File([await res.blob()], `${name}.step`);
  } catch (e) {
    if (mine === run) showError("The example could not be loaded. Try again.", true);
    console.error(e);
    return;
  }
  if (mine !== run) return; // a newer pick replaced it
  processSelect.value = example.process; // Material stays as it is
  stepFile = file;
  iptFile = null;
  await analyse();
}
for (const e of EXAMPLES) {
  const item = document.createElement("button");
  item.type = "button";
  item.setAttribute("role", "menuitem");
  item.tabIndex = -1;
  item.dataset.testid = `examples-item-${e.name}`;
  item.textContent = e.name;
  item.addEventListener("click", () => void openExample(e.name));
  exMenu.append(item);
  exItems.push(item);
  const start = document.createElement("button");
  start.type = "button";
  start.className = "ghostbtn";
  start.dataset.testid = `example-${e.name}`;
  start.textContent = e.name;
  start.addEventListener("click", () => void openExample(e.name));
  byId("example-list").append(start);
}
exButton.addEventListener("click", () => (exMenu.hidden ? openMenu() : closeMenu(true)));
exMenu.addEventListener("keydown", (e) => {
  const at = exItems.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === "Escape") { e.preventDefault(); closeMenu(true); return; }
  if (e.key === "Tab") { closeMenu(false); return; }
  const to = e.key === "ArrowDown" ? (at + 1) % exItems.length : e.key === "ArrowUp" ? (at + exItems.length - 1) % exItems.length
    : e.key === "Home" ? 0 : e.key === "End" ? exItems.length - 1 : -1;
  if (to >= 0) { e.preventDefault(); exItems[to].focus(); }
});
document.addEventListener("click", (e) => {
  if (!exMenu.hidden && !(e.target as Element).closest(".exwrap")) closeMenu(false);
});
for (const id of ["mode-part", "mode-machine"]) byId<HTMLInputElement>(id).addEventListener("change", (e) => setMachine((e.target as HTMLInputElement).value === "machine"));
startForm.addEventListener("submit", (e) => e.preventDefault());

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
