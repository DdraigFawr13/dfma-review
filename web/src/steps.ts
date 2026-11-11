// The review in steps (review-steps spec, D-042, D-045): the Part step's overview, the Features rows, where each row
// sits in the machine plan, the Cost step and the Report step, drawn to the approved round 3 frames
// (mockups/ui-direction/round3-frames.html: r3-overview, r3-features, r3-passed, r3-mach, r3-cost, r3-report) and the
// Features groups mock-up (mockups/review-steps-features.html, D-049).

import { NOT_WORKED_OUT, noChecksRun, notCheckedLine, partial, planNotWorkedOut } from "./notrun";
import type { Analysis, Finding, Row } from "./api";
import { checkedCount, featureLine, holeThreads, measured, okFeatures } from "./findings";
import { idRange, plural, sevMark, sevWord } from "./words";

export const STEPS = ["part", "features", "machining", "cost", "report"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_NAMES: Record<Step, string> = { part: "Part", features: "Features", machining: "Machining", cost: "Cost", report: "Report" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "▲ Fix" as a mark and a word, the word in its severity colour. */
function sevTag(severity: string): HTMLElement[] {
  const mark = el("span", `mk ${severity}`, sevMark(severity));
  mark.setAttribute("aria-hidden", "true");
  return [mark, el("b", `sev ${severity}`, sevWord(severity))];
}

const fnum = (id: string) => Number(id.replace(/^\D+/, ""));

/** "Fix first" with the first Fix row (lowest first F id), else "Review first" with the first Review row, else null. */
export function firstRow(result: Analysis): Row | null {
  for (const severity of ["high", "medium"]) {
    const found = result.rows.filter((r) => r.severity === severity).sort((a, b) => fnum(a.findings[0]) - fnum(b.findings[0]));
    if (found.length) return found[0];
  }
  return null;
}

/** "Sharp corner ×4", "Drill size" (no "×1"). */
export function rowTitle(r: Row): string {
  return r.count > 1 ? `${r.short} ×${r.count}` : r.short;
}

/** The first sentence of a row's sentence ("Inside corners have no radius."), for Fix first. */
function firstSentence(text: string): string {
  const i = text.indexOf(". ");
  return i < 0 ? text : text.slice(0, i + 1);
}

/** "distinct tools 4.0 points, deep pockets 1.0 points (weights are estimates)", or "distinct tools and sharp or
 *  small inside corners, tied at 4.0 points (…)": the first two drivers as the service orders them (audit F22). */
export function biggestDrivers(result: Analysis): string {
  const top = result.cost_drivers.slice(0, 2);
  const name = (label: string) => `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  const pts = (score: number) => `${score.toFixed(1)} points`;
  const words = top.length === 2 && top[0].score.toFixed(1) === top[1].score.toFixed(1)
    ? `${name(top[0].label)} and ${name(top[1].label)}, tied at ${pts(top[0].score)}`
    : top.map((d) => `${name(d.label)} ${pts(d.score)}`).join(", ");
  const sources = [...new Set(result.cost_drivers.map((d) => d.weight_source))];
  const note = sources.length === 1 ? `weights are ${sources[0]}s` : `weights: ${sources.join(", ")}`;
  return `${words} (${note})`;
}

/** "3-axis mill", "Lathe with live tooling": the plan's machine with a capital. */
function machineName(machine: string): string {
  return machine.charAt(0).toUpperCase() + machine.slice(1);
}

function card(step: Step, n: number, onOpen: (s: Step) => void): HTMLElement {
  const box = el("div", "card");
  box.dataset.testid = `overview-${step}`;
  const open = el("button", "open", `${n} · ${STEP_NAMES[step]} `); // the heading is the link (audit F24)
  open.type = "button";
  open.dataset.testid = `open-${step}`;
  const arrow = el("span", undefined, "›");
  arrow.setAttribute("aria-hidden", "true");
  open.append(arrow);
  open.addEventListener("click", () => onOpen(step));
  const head = el("h3");
  head.append(open);
  box.append(head);
  return box;
}

function sub(...children: (Node | string)[]): HTMLElement {
  const line = el("div", "sub");
  line.append(...children);
  return line;
}

/** The overview cards (frame r3-overview) and Fix first. */
export function renderOverview(cards: HTMLElement, first: HTMLElement, result: Analysis, onOpen: (s: Step) => void): void {
  cards.replaceChildren();
  const features = card("features", 2, onOpen);
  const notChecked = notCheckedLine(result); // the browser copy (D-057): the checks it has not run, under the counts
  if (noChecksRun(result)) {
    // nothing checked: no counts, and no "No findings" (it would be false)
  } else if (result.findings.length === 0) {
    features.append(sub("No findings. Every feature checked passed its rules."));
  } else {
    const tally = (severity: string, n: number) => {
      const span = el("span", "tally");
      span.append(...sevTag(severity), document.createTextNode(` ${n}`));
      return span;
    };
    const count = (s: string) => result.findings.filter((f) => f.severity === s).length;
    features.append(sub(tally("high", count("high")), tally("medium", count("medium")), tally("ok", okFeatures(result).length)));
  }
  if (!noChecksRun(result)) features.append(sub(checkedCount(result)));
  if (notChecked) features.append(el("p", "notrun", notChecked));

  const machining = card("machining", 3, onOpen);
  if (planNotWorkedOut(result)) {
    machining.append(el("p", "notrun", NOT_WORKED_OUT));
  } else if (!result.machine) {
    machining.append(sub("No machine plan for this part."));
  } else {
    machining.append(sub(el("span", undefined, machineName(result.machine)), el("span", "num", plural(result.setups.length, "setup")),
      el("span", "num", plural(result.tool_changes, "tool load"))));
  }

  const cost = card("cost", 4, onOpen);
  if (planNotWorkedOut(result)) {
    cost.append(el("p", "notrun", NOT_WORKED_OUT));
  } else if (!result.cost_drivers.length) {
    cost.append(sub("None: one setup and no tools to load."));
  } else {
    cost.append(sub(el("span", "num", `${plural(result.cost_drivers.length, "cost driver")}${partial(result)}`), // D-061
      el("span", undefined, `Biggest: ${biggestDrivers(result)}`)));
  }

  const report = card("report", 5, onOpen);
  report.append(sub("PDF of all of the above"));
  cards.append(features, machining, cost, report);

  const r = firstRow(result);
  first.hidden = !r;
  first.replaceChildren();
  if (!r) return;
  const line = el("div", "firstline");
  line.append(...sevTag(r.severity), document.createTextNode(" "), el("span", "ftitle", rowTitle(r)), document.createTextNode(" "),
    el("span", "fid", r.range), document.createTextNode(" "), el("span", "muted", firstSentence(r.sentence)));
  first.append(el("span", "label", r.severity === "high" ? "Fix first" : "Review first"), line);
}

/** The Cost step (frame r3-cost): each driver's count × weight = score, its findings or "from the machine plan",
 *  the total, and what the score is. No time or dollars (D-003). */
export function renderCost(host: HTMLElement, result: Analysis): void {
  host.replaceChildren();
  if (planNotWorkedOut(result)) {
    host.append(el("p", "notrun", NOT_WORKED_OUT)); // no drivers and no total in this copy yet (D-057)
    return;
  }
  // The browser copy (D-061): which checks the drivers can't count yet, above them
  const notChecked = result.cost_partial ? notCheckedLine(result) : null;
  if (notChecked) host.append(el("p", "notrun", notChecked));
  if (!result.cost_drivers.length) {
    host.append(el("p", "none pad", "None: one setup and no tools to load."));
    return;
  }
  for (const d of result.cost_drivers) {
    const row = el("div", "driver");
    row.dataset.testid = `driver-${d.driver}`;
    row.append(el("b", undefined, d.label), el("span", "num muted", `${d.count} × ${d.weight.toFixed(1)}`), el("span", "num", d.score.toFixed(1)));
    row.append(el("span", d.findings.length ? "f num" : "f", d.findings.length ? idRange(d.findings) : "from the machine plan"));
    host.append(row);
  }
  if (result.cost_total !== null) {
    const total = el("div", "driver total");
    total.dataset.testid = "cost-total";
    total.append(el("b", undefined, "Total score"), el("span"), el("span", "num", `${result.cost_total.toFixed(1)} points${partial(result)}`));
    host.append(total);
  }
  const sources = [...new Set(result.cost_drivers.map((d) => d.weight_source))];
  const weights = sources.length === 1 ? `Every weight is an ${sources[0]}.` : `Weights: ${sources.join(", ")}.`;
  host.append(el("p", "note pad", `Score is count × weight. ${weights} No time or dollars yet.`));
}

/** The Report step (frame r3-report): each check run with its finding count (audit F23), and the assumptions, folded. */
export function renderReport(rules: HTMLElement, assumptions: HTMLDetailsElement, result: Analysis): void {
  rules.replaceChildren(...result.checks_run.map((check) => {
    const n = result.rows.filter((r) => r.check === check).reduce((sum, r) => sum + r.findings.length, 0);
    return el("li", undefined, `${check}: ${n ? plural(n, "finding") : "none"}`);
  }));
  assumptions.querySelector("summary")!.textContent = `Assumptions (${result.assumptions.length})`;
  assumptions.querySelector("ul")!.replaceChildren(...result.assumptions.map((a) => el("li", undefined, a)));
}

/** The Features tab's counts, "▲ 4 ◆ 4": findings, not rows (spec J2). */
export function stepCounts(host: HTMLElement, result: Analysis | null): string {
  host.replaceChildren();
  if (!result || !result.findings.length) return "";
  const parts: string[] = [];
  for (const severity of ["high", "medium"]) {
    const n = result.findings.filter((f) => f.severity === severity).length;
    if (!n) continue;
    if (host.childNodes.length) host.append(document.createTextNode(" "));
    const mark = el("span", `mk ${severity}`, sevMark(severity));
    host.append(mark, document.createTextNode(` ${n}`));
    parts.push(`${sevWord(severity)} ${n}`);
  }
  return parts.join(", ");
}


// --- S2: the Features step's rows (spec J3, frames r3-features and r3-passed) ---

export type RowFilter = "issues" | "passed" | "all";

/** What the Features list has open: a row, the finding it shows (`at`) and, in a passed row, one feature alone. */
export interface RowState { row: string | null; at: number; pass: string | null }

export interface RowHandlers {
  onRow(row: Row): void; // tap a row: open it (or close it when open)
  onStep(delta: number): void; // ‹ › in an open finding row
  onPass(featureId: string): void; // one feature of an open passed row
}

/** A row as a button: mark and word, short title ×n, ids, sentence, check and limit. */
function rowButton(r: Row, open: boolean, onRow: (r: Row) => void): HTMLButtonElement {
  const b = el("button", `srow ${r.severity}`);
  b.type = "button";
  b.dataset.testid = `row-${r.id.replace(/^row:/, "")}`;
  b.setAttribute("aria-expanded", String(open)); // one state: open or closed (audit F15)
  if (open) b.setAttribute("aria-controls", detailId(r));
  const t = el("span", "t");
  t.append(el("b", `sev ${r.severity}`, sevWord(r.severity)), document.createTextNode(` ${rowTitle(r)}`));
  const mark = el("span", `mk ${r.severity}`, sevMark(r.severity));
  mark.setAttribute("aria-hidden", "true");
  b.append(mark, t, el("span", "ids num", r.range), el("span", "s", r.sentence), el("span", "chk", `${r.check} · ${r.limit}`));
  b.addEventListener("click", () => onRow(r));
  return b;
}

/** The id of a row's detail, for its button's aria-controls ("detail-F4"). */
const detailId = (r: Row) => `detail-${r.id.replace(/^row:/, "").replace(/[^\w-]/g, "_")}`;

/** The open finding row's detail: "‹ F4 · corner-1 · 1 of 4 ›", what was measured and the advice. */
function findingDetail(r: Row, at: number, result: Analysis, h: RowHandlers): HTMLElement {
  const f = result.findings.find((x) => x.id === r.findings[at]) as Finding;
  const dl = el("dl", "more");
  dl.id = detailId(r);
  dl.dataset.testid = "row-detail";
  const showing = el("dd", "num showing");
  const step = (text: string, label: string, testid: string, delta: number, off: boolean) => {
    const b = el("button", "stepper", text);
    b.type = "button";
    b.dataset.testid = testid;
    b.setAttribute("aria-label", label);
    b.disabled = off;
    b.addEventListener("click", () => h.onStep(delta));
    return b;
  };
  const where = [f.id, f.feature, `${at + 1} of ${r.findings.length}`].filter(Boolean).join(" · ");
  showing.append(el("span", undefined, where));
  if (r.findings.length > 1) { // ‹ › together on one line, never split by a wrap (audit F4)
    const nav = el("span", "nav");
    nav.append(step("‹", "Previous finding", "row-prev", -1, at === 0), step("›", "Next finding", "row-next", 1, at === r.findings.length - 1));
    showing.append(nav);
  }
  dl.append(el("dt", undefined, "Showing"), showing, el("dt", undefined, "Measured"), el("dd", "num", measured(f, result)),
    el("dt", undefined, "What to do"), el("dd", undefined, f.suggestion)); // one label for both severities, as the PDF (D-053)
  return dl;
}

/** The open passed row's detail (D-023): each feature with the check it passed and the math; a feature selects alone. */
function passedDetail(r: Row, state: RowState, result: Analysis, h: RowHandlers): HTMLElement {
  const box = el("div", "more passes");
  box.id = detailId(r);
  box.dataset.testid = "row-detail";
  for (const fid of r.features) {
    const p = result.passed.find((x) => x.feature === fid && x.rule === r.rule);
    if (!p) continue;
    const b = el("button", "pfeat");
    b.type = "button";
    b.dataset.testid = `passed-${fid}`;
    b.setAttribute("aria-pressed", String(state.pass === fid));
    const feature = result.features.find((x) => x.id === fid);
    // the size line only when the check's title doesn't already state it (audit F14: a wall said its thickness 3 times)
    const size = feature ? featureLine(feature) : "";
    const lead = /^[^\d]*([\d.]+)/.exec(size)?.[1];
    const said = !size || (lead !== undefined && new RegExp(`(^|[^\\d.])${lead.replace(".", "\\.")} in`).test(p.title));
    b.append(el("span", "pt", said ? `${fid} · ✓ ${p.title}` : `${fid} · ${size}`));
    if (!said) b.append(el("span", "pt", `✓ ${p.title}`));
    const thread = holeThreads(feature, result); // I1 S2 (D-036): its callout
    if (thread) b.append(el("span", "pt", thread));
    b.append(el("span", "pmath", `${p.math} · ${p.limit_text}`));
    b.addEventListener("click", () => h.onPass(fid));
    box.append(b);
  }
  return box;
}

/** The chips' counts: findings (not rows) and OK features, as the frames show ("Issues 8 · Passed 9"). */
export function renderChips(host: HTMLElement, result: Analysis, filter: RowFilter, onFilter: (f: RowFilter) => void): void {
  host.replaceChildren();
  const chip = (f: RowFilter, text: string) => {
    const b = el("button", "chip", text);
    b.type = "button";
    b.dataset.testid = `chip-${f}`;
    b.setAttribute("aria-pressed", String(filter === f));
    b.addEventListener("click", () => onFilter(f));
    host.append(b);
  };
  chip("issues", `Issues ${result.findings.length}`);
  chip("passed", `Passed ${okFeatures(result).length}`);
  chip("all", "All");
}

/** The Features step's rows: Issues (finding rows), Passed (passed rows) or All, the open row with its detail. */
export function renderRows(host: HTMLElement, result: Analysis, filter: RowFilter, state: RowState, h: RowHandlers): void {
  host.replaceChildren();
  const list = filter === "issues" ? result.rows : filter === "passed" ? result.passed_rows : [...result.rows, ...result.passed_rows];
  if (!list.length) {
    host.append(el("p", "none pad", filter === "passed" ? "No feature passed with no finding."
      : "No findings. Every feature checked passed its rules."));
    return;
  }
  for (const r of list) {
    const open = state.row === r.id;
    const box = el("div", open ? "rowbox open" : "rowbox");
    box.append(rowButton(r, open, h.onRow));
    if (open) box.append(r.findings.length ? findingDetail(r, Math.min(state.at, r.findings.length - 1), result, h) : passedDetail(r, state, result, h));
    // UI fixes A7: ← → on the open row, its ‹ or › step through its findings, as ‹ › do
    if (open && r.findings.length > 1) {
      for (const b of box.querySelectorAll<HTMLButtonElement>(".srow, .stepper")) b.addEventListener("keydown", (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        e.preventDefault();
        h.onStep(e.key === "ArrowLeft" ? -1 : 1);
      });
    }
    host.append(box);
  }
}

/** The faces a row selects: all its findings' faces, or its passed features' faces. */
export function rowFaces(r: Row, result: Analysis): number[] {
  const faces = r.findings.length
    ? r.findings.flatMap((id) => result.findings.find((f) => f.id === id)?.faces ?? [])
    : r.features.flatMap((id) => result.features.find((f) => f.id === id)?.faces ?? []);
  return [...new Set(faces)];
}

/** A group's tally in the approved words, nonzero states only: "DISAGREES 1 · MATCHED 5" (D-049). */
export function groupTally(host: HTMLElement, states: string[], lead = ""): void {
  host.replaceChildren();
  if (lead) host.append(document.createTextNode(lead));
  const order: [string, string, string][] = [["disagrees", "disagree", "medium"], ["not_mapped", "not mapped", "nm"], ["matched", "matched", "ok"]];
  let first = true;
  for (const [state, many, cls] of order) {
    const n = states.filter((s) => s === state).length;
    if (!n) continue;
    const word = state === "disagrees" && n === 1 ? "disagrees" : many; // "disagrees 1", "disagree 7" (D-036, D-040)
    if (!first) host.append(document.createTextNode(" · "));
    first = false;
    host.append(el("span", `sev ${cls}`, word), document.createTextNode(` ${n}`));
  }
}

// --- S3: where each row sits in the machine plan (spec J4, frame r3-mach, D-049) ---

/** A row's findings in one place: "Sharp corner ×2" under Setup 2 when two of its four corners are there. */
export interface Placed { row: Row; ids: string[] }

/** Each row's findings placed in a setup (by its feature, a corner by its pocket), under "Whole part" (no feature, or
 *  a thin wall) or "In no setup". Keys: "whole", "none" or the setup's index. Counted once per place. */
export function placeRows(result: Analysis): Map<string | number, Placed[]> {
  const out = new Map<string | number, Placed[]>();
  const feats = new Map(result.features.map((f) => [f.id, f]));
  for (const r of result.rows) {
    const here = new Map<string | number, string[]>();
    for (const id of r.findings) {
      const f = result.findings.find((x) => x.id === id);
      const feature = f?.feature ? feats.get(f.feature) : undefined;
      let at: string | number;
      if (!feature || feature.kind === "wall") at = "whole";
      else {
        const target = feature.kind === "corner" ? feature.pocket ?? null : feature.id;
        const i = result.setups.findIndex((s) => target !== null && s.features.includes(target));
        at = i >= 0 ? i : "none";
      }
      here.set(at, [...(here.get(at) ?? []), id]);
    }
    for (const [at, ids] of here) out.set(at, [...(out.get(at) ?? []), { row: r, ids }]);
  }
  return out;
}

/** "▲ Fix Sharp corner ×2 F4 F5": one placed row as a button that opens its row on Features (audit F27). */
export function placedLine(p: Placed, onOpen: (p: Placed) => void = () => {}): HTMLElement {
  const line = el("button", "placed");
  line.type = "button";
  line.addEventListener("click", () => onOpen(p));
  const mark = el("span", `mk ${p.row.severity}`, sevMark(p.row.severity));
  mark.setAttribute("aria-hidden", "true");
  const title = p.ids.length > 1 ? `${p.row.short} ×${p.ids.length}` : p.row.short;
  line.append(mark, el("b", `sev ${p.row.severity}`, sevWord(p.row.severity)), document.createTextNode(` ${title} `),
    el("span", "num muted", idRange(p.ids)));
  return line;
}

/** The setup chips over the model (frame r3-mach): one per setup; a tap is the setup's selection. */
export function renderSetupChips(host: HTMLElement, result: Analysis, heads: string[], selected: string | null,
                                 onPick: (i: number) => void): void {
  host.replaceChildren();
  result.setups.forEach((_, i) => {
    const b = el("button", "chip", heads[i]);
    b.type = "button";
    b.dataset.testid = `setup-chip-${i + 1}`;
    b.setAttribute("aria-pressed", String(selected === `setup:${i}`));
    b.addEventListener("click", () => onPick(i));
    host.append(b);
  });
}
