// The verdict line and the findings list in severity groups (spec "Web page", D-012).

import type { Analysis, Finding, Severity } from "./api";

const RULE_NAMES: Record<string, string> = {
  hole_depth: "hole depth", hole_size: "hole size", corner_radius: "corner radius", pocket_depth: "pocket depth",
  thin_wall: "thin wall",
};
const KIND_NAMES: [string, string, string][] = [["hole", "hole", "holes"], ["pocket", "pocket", "pockets"], ["corner", "corner", "corners"], ["wall", "wall", "walls"]];
const GROUPS: Severity[] = ["high", "medium"];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sevLabel(severity: Severity): HTMLElement {
  return el("span", `sev ${severity}`, severity);
}

/** "2 holes checked · Rules run: …", or "1 pocket and 4 corners checked · …": the kinds the part
 *  has; a part with none of them still says "0 holes checked". */
export function checkedLine(result: Analysis): string {
  const parts = KIND_NAMES.map(([kind, one, many]) => {
    const n = result.features.filter((f) => f.kind === kind).length;
    return n ? `${n} ${n === 1 ? one : many}` : "";
  }).filter(Boolean);
  const counted = parts.length === 0 ? "0 holes" : parts.length === 1 ? parts[0]
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const rules = result.rules_run.map((r) => RULE_NAMES[r] ?? r.replace(/_/g, " ")).join(", ");
  return `${counted} checked · Rules run: ${rules}.`;
}

export function renderVerdict(host: HTMLElement, result: Analysis | null, waiting = false): void {
  host.replaceChildren();
  if (!result) {
    host.append(el("span", "tally zero", waiting ? "Analysing…" : "No part loaded"));
    return;
  }
  if (result.findings.length === 0) {
    const clean = el("span", "tally clean");
    clean.append(el("span", "sev", "clean"), document.createTextNode(" no findings"));
    host.append(clean);
  }
  for (const severity of GROUPS) {
    const n = result.findings.filter((f) => f.severity === severity).length;
    const tally = el("span", n ? "tally" : "tally zero");
    const label = el("span", n ? `sev ${severity}` : "sev", severity);
    tally.append(label, document.createTextNode(` ${n}`));
    host.append(tally);
  }
  host.append(el("span", "rules", checkedLine(result)));
}

function meta(f: Finding, result: Analysis): string {
  const feature = result.features.find((x) => x.id === f.feature);
  const parts = [f.feature];
  if (feature?.kind === "pocket") {
    parts.push(`${(feature.dims_mm.depth / 25.4).toFixed(3)} in deep, ${toolText(feature.dims_mm.end_mill_mm / 25.4)} end mill fits`);
  } else if (feature?.kind === "corner") {
    parts.push(`radius ${(feature.dims_mm.radius / 25.4).toFixed(3)} in, pocket ${(feature.dims_mm.depth / 25.4).toFixed(3)} in deep`);
  } else if (feature?.kind === "wall") {
    parts.push(`${(feature.dims_mm.thickness / 25.4).toFixed(3)} in thick`);
  } else if (feature?.dims_mm.diameter !== undefined) {
    const d = feature.dims_mm.diameter / 25.4;
    parts.push(f.rule === "hole_size" ? `${d.toFixed(3)} in diameter` : `${diameterText(d)} diameter, ${(feature.dims_mm.depth / 25.4).toFixed(3)} in deep`);
  }
  parts.push(f.rule === "hole_size" ? `limit: ${f.threshold_source}, within 0.0005 in` : `limit: ${f.threshold_source}`);
  return parts.join(" · ");
}

/** "3/32 in" for an end mill on the 1/64 in grid, else "0.300 in". */
function toolText(inches: number): string {
  const text = diameterText(inches);
  const m = /\((.+)\)$/.exec(text);
  return m ? `${m[1]} in` : text;
}

function diameterText(inches: number): string {
  const sixtyFourths = Math.round(inches * 64);
  if (sixtyFourths > 0 && Math.abs(inches - sixtyFourths / 64) <= 0.0005) {
    let n = sixtyFourths % 64, d = 64;
    const whole = Math.floor(sixtyFourths / 64);
    while (n && n % 2 === 0) { n /= 2; d /= 2; }
    const frac = n === 0 ? `${whole}` : whole ? `${whole} ${n}/${d}` : `${n}/${d}`;
    return `${inches.toFixed(3)} in (${frac})`;
  }
  return `${inches.toFixed(3)} in`;
}

export function renderFindings(host: HTMLElement, result: Analysis | null, message: string,
                               onSelect: (f: Finding) => void, selected: string | null): void {
  host.replaceChildren();
  if (!result) {
    host.append(el("p", "none", message));
    return;
  }
  for (const severity of GROUPS) {
    const items = result.findings.filter((f) => f.severity === severity);
    const head = el("p", `ghead ${severity}`);
    head.append(el("span", undefined, severity), el("span", undefined, String(items.length)));
    host.append(head);
    if (items.length === 0) host.append(el("p", "none", "None."));
    for (const f of items) {
      const row = el("button", `finding ${f.severity}`);
      row.type = "button";
      row.dataset.testid = `finding-${f.id}`;
      row.setAttribute("aria-pressed", String(selected === f.id));
      const line = el("span", "row1");
      line.append(sevLabel(f.severity), el("span", "ftitle", f.title), el("span", "fid", f.id));
      row.append(line, el("span", "fmeta", meta(f, result)), el("span", "fsug", f.suggestion));
      row.addEventListener("click", () => onSelect(f));
      host.append(row);
    }
  }
}
