// The review in steps (review-steps spec, D-042, D-045): the Part step's overview, the Cost step and the Report
// step, drawn to the approved round 3 frames (mockups/ui-direction/round3-frames.html: r3-overview, r3-cost,
// r3-report). Features and Machining reuse findings.ts until S2 and S3.

import type { Analysis, Finding } from "./api";
import { checkedCount, okFeatures } from "./findings";
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

const byNumber = (a: Finding, b: Finding) => Number(a.id.slice(1)) - Number(b.id.slice(1));

/** "Fix first" with the first Fix finding (lowest F id), else "Review first" with the first Review one, else null.
 *  S1 shows a finding's word, id and title; S2 swaps in the first row of that severity. */
export function firstFinding(result: Analysis): Finding | null {
  for (const severity of ["high", "medium"]) {
    const found = result.findings.filter((f) => f.severity === severity).sort(byNumber);
    if (found.length) return found[0];
  }
  return null;
}

/** "distinct tools 4.0, sharp or small inside corners 4.0 (weights are estimates)": the first two drivers as the
 *  service orders them. */
export function biggestDrivers(result: Analysis): string {
  const top = result.cost_drivers.slice(0, 2).map((d) => `${d.label.charAt(0).toLowerCase()}${d.label.slice(1)} ${d.score.toFixed(1)}`);
  const sources = [...new Set(result.cost_drivers.map((d) => d.weight_source))];
  const note = sources.length === 1 ? `weights are ${sources[0]}s` : `weights: ${sources.join(", ")}`;
  return `${top.join(", ")} (${note})`;
}

/** "3-axis mill", "Lathe with live tooling": the plan's machine with a capital. */
function machineName(machine: string): string {
  return machine.charAt(0).toUpperCase() + machine.slice(1);
}

function card(step: Step, n: number, onOpen: (s: Step) => void): HTMLElement {
  const box = el("div", "card");
  box.dataset.testid = `overview-${step}`;
  const open = el("button", "open", "Open ›");
  open.type = "button";
  open.dataset.testid = `open-${step}`;
  open.setAttribute("aria-label", `Open ${STEP_NAMES[step]}`);
  open.addEventListener("click", () => onOpen(step));
  box.append(el("h3", undefined, `${n} · ${STEP_NAMES[step]}`), open);
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
  if (result.findings.length === 0) {
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
  features.append(sub(checkedCount(result)));

  const machining = card("machining", 3, onOpen);
  if (!result.machine) {
    machining.append(sub("No machine plan for this part."));
  } else {
    machining.append(sub(el("span", undefined, machineName(result.machine)), el("span", "num", plural(result.setups.length, "setup")),
      el("span", "num", plural(result.tool_changes, "tool load"))));
  }

  const cost = card("cost", 4, onOpen);
  if (!result.cost_drivers.length) {
    cost.append(sub("None: one setup and no tools to load."));
  } else {
    cost.append(sub(el("span", "num", plural(result.cost_drivers.length, "driver")), el("span", undefined, `Biggest: ${biggestDrivers(result)}`)));
  }

  const report = card("report", 5, onOpen);
  report.append(sub("PDF of all of the above"));
  cards.append(features, machining, cost, report);

  const f = firstFinding(result);
  first.hidden = !f;
  first.replaceChildren();
  if (!f) return;
  const line = el("div", "firstline");
  line.append(...sevTag(f.severity), document.createTextNode(" "), el("span", "fid", f.id), document.createTextNode(" "), el("span", "ftitle", f.title));
  first.append(el("span", "label", f.severity === "high" ? "Fix first" : "Review first"), line);
}

/** The Cost step (frame r3-cost): each driver's count × weight = score, its findings or "from the machine plan",
 *  the total, and what the score is. No time or dollars (D-003). */
export function renderCost(host: HTMLElement, result: Analysis): void {
  host.replaceChildren();
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
    total.append(el("b", undefined, "Total score"), el("span"), el("span", "num", `${result.cost_total.toFixed(1)} points`));
    host.append(total);
  }
  const sources = [...new Set(result.cost_drivers.map((d) => d.weight_source))];
  const weights = sources.length === 1 ? `Every weight is an ${sources[0]}.` : `Weights: ${sources.join(", ")}.`;
  host.append(el("p", "note pad", `Score is count × weight. ${weights} No time or dollars yet.`));
}

/** The Report step (frame r3-report): the checks run by name and the assumptions, folded. */
export function renderReport(rules: HTMLElement, assumptions: HTMLDetailsElement, result: Analysis): void {
  rules.textContent = `${result.checks_run.join(", ")}.`;
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
