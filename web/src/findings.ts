// The verdict line and the findings list in severity groups (spec "Web page", D-012).

import type { Analysis, CostDriver, Feature, Finding, Severity, Tool } from "./api";

export const RULE_NAMES: Record<string, string> = {
  hole_depth: "hole depth", hole_size: "hole size", corner_radius: "corner radius", pocket_depth: "pocket depth",
  undercut: "undercut", thin_wall: "thin wall", access: "access",
  turn_axis: "turning axis", turn_slender: "length to diameter", turn_offaxis: "off the turning axis",
  bore_depth: "bore depth", looks_turned: "looks turned",
};
const KIND_NAMES: [string, string, string][] = [["profile", "turned profile", "turned profiles"], ["hole", "hole", "holes"], ["bore", "bore", "bores"], ["groove", "groove", "grooves"],
  ["pocket", "pocket", "pockets"], ["corner", "corner", "corners"], ["wall", "wall", "walls"]];
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

export function meta(f: Finding, result: Analysis): string {
  const feature = result.features.find((x) => x.id === f.feature);
  const parts: string[] = f.feature ? [f.feature] : []; // turn_axis judges the whole part: no feature
  if (feature?.kind === "profile") {
    parts.push(`${diameterText(feature.dims_mm.diameter / 25.4)} diameter, ${(feature.dims_mm.length / 25.4).toFixed(3)} in long`);
  } else if (feature?.kind === "pocket") {
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

/** Something a row selects on the model: a finding, a passed feature or a setup. */
export interface Pick { id: string; faces: number[] }

export function renderFindings(host: HTMLElement, result: Analysis | null, message: string,
                               onSelect: (f: Pick) => void, selected: string | null): void {
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
  renderPassed(host, result, onSelect, selected);
}

let passedOpen = false;

/** A new file starts with the Passed list collapsed again (D-023: collapsed by default). */
export function collapsePassed(): void {
  passedOpen = false;
}

const PASS_KINDS: [string, string][] = [["profile", "Turned profile"], ["hole", "Holes"], ["bore", "Bores"], ["pocket", "Pockets"],
  ["corner", "Corners"], ["wall", "Walls"]];

/** One line on what a feature is, for the Passed list. */
function featureLine(f: Feature): string {
  const d = f.dims_mm, inch = (mm: number) => `${(mm / 25.4).toFixed(3)} in`;
  if (f.kind === "hole" || f.kind === "bore") return `${diameterText(d.diameter / 25.4)} diameter, ${inch(d.depth)} deep`;
  if (f.kind === "profile") return `${diameterText(d.diameter / 25.4)} diameter, ${inch(d.length)} long`;
  if (f.kind === "pocket") return `${inch(d.depth)} deep, ${toolText(d.end_mill_mm / 25.4)} end mill fits`;
  if (f.kind === "corner") return `radius ${inch(d.radius)}`;
  if (f.kind === "wall") return `${inch(d.thickness)} thick`;
  return "";
}

/** D-023 (accepted): the features with no finding, each with the checks it passed and the math.
 *  Collapsed by default; a row selects its faces like a finding and opens its math. */
function renderPassed(host: HTMLElement, result: Analysis, onSelect: (f: Pick) => void, selected: string | null): void {
  const flagged = new Set<string | null>(result.findings.map((f) => f.feature));
  const ok = result.features.filter((f) => !flagged.has(f.id) && result.passed.some((p) => p.feature === f.id));
  const box = el("details", "passed");
  box.dataset.testid = "passed";
  box.open = passedOpen; // collapsed by default; stays as the reader left it while they select rows
  box.addEventListener("toggle", () => { passedOpen = box.open; });
  const checks = result.passed.filter((p) => !flagged.has(p.feature)).length;
  const summary = el("summary", "ghead ok");
  summary.append(el("span", undefined, "passed"), el("span", undefined, `${ok.length} ${ok.length === 1 ? "feature" : "features"} · ${checks} ${checks === 1 ? "check" : "checks"}`));
  box.append(summary);
  for (const [kind, label] of PASS_KINDS) {
    const items = ok.filter((f) => f.kind === kind);
    if (!items.length) continue;
    box.append(el("p", "pkind", `${label} (${items.length})`));
    for (const f of items) {
      const id = `pass:${f.id}`;
      const row = el("button", "pass-row");
      row.type = "button";
      row.dataset.testid = `passed-${f.id}`;
      row.setAttribute("aria-pressed", String(selected === id));
      const line = el("span", "row1");
      line.append(el("span", "sev ok", "ok"), el("span", "ftitle", featureLine(f)), el("span", "fid", f.id));
      row.append(line);
      for (const p of result.passed.filter((x) => x.feature === f.id)) {
        const check = el("span", "pcheck");
        check.append(el("span", "prule", `✓ ${RULE_NAMES[p.rule] ?? p.rule}: `), document.createTextNode(p.title));
        const math = el("span", "pmath", `${p.math} · limit: ${p.threshold_source}`);
        math.hidden = selected !== id;
        row.append(check, math);
      }
      row.addEventListener("click", () => onSelect({ id, faces: f.faces }));
      box.append(row);
    }
  }
  host.append(box);
}

/** "1/4 in end mill", "0.250 in (1/4) drill", "6.5 mm drill", "82° countersink" (S5). */
export function toolName(t: Tool): string {
  if (t.kind === "countersink") return `${t.id.replace(/^cs-/, "")}° countersink`;
  if (t.kind === "turn") return t.id.endsWith("finish") ? "Finish turning tool" : "Rough turning tool";
  if (t.kind === "bore") return t.id.endsWith("finish") ? "Finish boring bar" : "Rough boring bar";
  if (t.kind === "groove") {
    const name = `${toolText(t.width_in ?? 0)} grooving tool`;
    return t.undersized ? `${name} (narrowest; wider than the groove)` : name;
  }
  const metric = /^dr-(.+)mm$/.exec(t.id);
  if (metric) return `${metric[1]} mm drill`;
  const d = t.diameter_in ?? 0;
  const name = t.kind === "drill" ? `${diameterText(d)} drill` : `${toolText(d)} end mill`;
  return t.undersized ? `${name} (smallest; nothing fits)` : name;
}

/** The machine plan panel (S5, spec Plan): machine, tool loads, each setup with its tools and features,
 *  and the features in no setup (the access finding). */
export const dir = (d: string) => d.replace("-", "−");
const dirs = (ds: string[]) => ds.map(dir).join(" and ");

/** Why each tool in a setup cuts this feature, from the feature's own numbers. */
function toolWhy(f: Feature, result: Analysis, setup: number, only?: string): string {
  const d = f.dims_mm, inch = (mm: number) => `${(mm / 25.4).toFixed(3)} in`;
  const ops = result.operations.filter((o) => o.setup === setup && o.features.includes(f.id) && (!only || o.tool === only));
  return ops.map((o) => {
    const t = result.tools.find((x) => x.id === o.tool);
    if (!t) return "";
    if (t.kind === "countersink") return `${toolName(t)}: its countersink faces this way.`;
    if (t.kind === "turn") return t.id.endsWith("finish") ? `${toolName(t)}: the finishing passes to size.`
      : `${toolName(t)}: turns the ${inch(d.diameter)} outside and faces the ends, leaving stock for finishing.`;
    if (t.kind === "bore") return t.id.endsWith("finish") ? `${toolName(t)}: the finishing pass to size.`
      : `${toolName(t)}: bores its ${inch(d.diameter)} diameter, ${inch(d.depth)} deep, leaving stock for finishing.`;
    if (t.kind === "groove") return `${toolName(t)}: its ${inch(d.width)} width.`;
    if (f.kind === "pocket" && (t.diameter_in ?? 0) * 25.4 > d.end_mill_mm + 1e-6) // D-029: the roughing tool
      return `${toolName(t)}: roughs it out, the largest at most 75% of its ${inch(d.narrowest_width)} gap.`;
    if (f.kind === "pocket") {
      const gap = d.narrowest_width !== undefined ? ` and its ${inch(d.narrowest_width)} gap` : "";
      return `${toolName(t)}: the largest that fits its ${inch(d.min_corner_radius)} corners${gap}.`;
    }
    return t.kind === "drill" ? `${toolName(t)}: matches its ${inch(d.diameter)} diameter.`
      : `${toolName(t)}: no drill matches ${inch(d.diameter)}, so an end mill.`;
  }).join(" ");
}

export function renderPlan(host: HTMLElement, count: HTMLElement, result: Analysis | null,
                           onSelect: (p: Pick) => void = () => {}, selected: string | null = null): void {
  host.replaceChildren();
  count.textContent = "";
  if (!result || !result.machine) return;
  const n = result.setups.length;
  count.textContent = `${n} ${n === 1 ? "setup" : "setups"}`;
  const dl = el("dl");
  const row = (term: string, value: string, id: string) => {
    const dd = el("dd", undefined, value);
    dd.dataset.testid = id;
    dl.append(el("dt", undefined, term), dd);
  };
  row("Machine", result.machine, "plan-machine");
  if (result.stock) row("Stock", stockText(result.stock), "plan-stock");
  const lathe = result.setups.length === 1 && result.setups[0].direction === "turn";
  if (lathe && result.turn_axis) row("Turning axis", axisText(result.turn_axis, result), "plan-turn-axis");
  row("Tool loads", `${result.tool_changes} (including the first in each setup)`, "plan-loads");
  host.append(dl);
  const tools = new Map(result.tools.map((t) => [t.id, t]));
  const byId = new Map(result.features.map((f) => [f.id, f]));
  const whyText = planWhy(result);
  if (whyText) {
    const why = el("p", "note");
    why.dataset.testid = "plan-why";
    why.textContent = whyText;
    host.append(why);
  }
  result.setups.forEach((s, i) => {
    const id = `setup:${i}`;
    // The faces this setup's tools cut: a countersink lights its own cone, not the bore it was drilled through.
    const faces = [...new Set(result.operations.filter((o) => o.setup === i).flatMap((o) => o.faces))];
    const box = el("button", "setup");
    box.type = "button";
    box.dataset.testid = `plan-setup-${i + 1}`;
    box.setAttribute("aria-pressed", String(selected === id));
    box.addEventListener("click", () => onSelect({ id, faces }));
    box.append(el("span", "shead", setupHead(s, i)));
    const ops = result.operations.filter((o) => o.setup === i);
    if (ops.length === 0) box.append(el("p", "note", "Nothing to cut from this side."));
    for (const o of ops) {
      const line = el("span", "op");
      const t = tools.get(o.tool);
      const name = el("span");
      // Operations numbered in the order they run, across all setups (Morgan, 2026-11-08)
      name.append(el("span", "onum", `${result.operations.indexOf(o) + 1}.`), document.createTextNode(" "),
        document.createTextNode(t ? toolName(t) : o.tool), document.createTextNode(" "), el("span", "tid", o.tool));
      line.append(name, el("span", "ofeat", o.features.join(", ")));
      box.append(line);
    }
    if (selected === id) {
      const why = el("span", "swhy");
      why.dataset.testid = `plan-setup-why-${i + 1}`;
      // In the order the operations run: each operation's features, each with why that tool cuts it.
      for (const o of ops) {
        const num = `${result.operations.indexOf(o) + 1}.`;
        for (const fid of o.features) {
          const f = byId.get(fid);
          if (!f) continue;
          if (s.direction === "turn") {
            const off = result.findings.some((x) => x.rule === "turn_offaxis" && x.feature === fid);
            const where = f.kind === "profile" ? "is the turned outside" : off ? "is off the turning axis: live tooling"
              : f.kind === "groove" ? (f.outside === false
                ? "is an inside groove on the axis; not every shop cuts inside grooves (Protolabs does not, D-026)"
                : "is a groove on the axis") : "is on the turning axis";
            why.append(el("span", undefined, `${num} ${fid} ${where}. ${toolWhy(f, result, i, o.tool)}`));
            continue;
          }
          const earlier = result.setups.slice(0, i).map((x) => x.direction).filter((d) => f.open_dirs.includes(d));
          const reach = earlier.length ? "" : f.open_dirs.length > 1 ? `; ${dir(s.direction)} is the first setup that reaches it` : "";
          why.append(el("span", undefined, `${num} ${fid} opens ${dirs(f.open_dirs)}${reach}. ${toolWhy(f, result, i, o.tool)}`));
        }
      }
      box.append(why);
    }
    host.append(box);
  });
  const away = notPlanned(result);
  if (away) {
    const note = el("p", "note", away);
    note.dataset.testid = "plan-not-planned";
    host.append(note);
  }
  host.append(el("p", "note", planFoot(result)));
}

const isLathe = (result: Analysis) => result.setups.length === 1 && result.setups[0].direction === "turn";

/** "Setup 2 · from −Z": a setup's heading in the plan, on screen and in the report. */
export function setupHead(s: { direction: string }, i: number): string {
  return s.direction === "turn" ? `Setup ${i + 1} · on the lathe, about the turning axis` : `Setup ${i + 1} · from ${dir(s.direction)}`;
}

/** The sentence under the machine facts: how each feature is reached and why these setups. */
export function planWhy(result: Analysis): string | null {
  const planned = result.setups.flatMap((s) => s.features);
  if (!planned.length) return null;
  if (isLathe(result)) {
    const off = planned.filter((id) => result.findings.some((x) => x.rule === "turn_offaxis" && x.feature === id));
    return "Turned in one setup about its axis. "
      + (off.length ? `Off the axis, cut with live tooling: ${off.join(", ")}.` : "Every feature is on the axis.");
  }
  const byId = new Map(result.features.map((f) => [f.id, f]));
  return `Each can be cut from: ${planned.map((id) => `${id} ${dirs(byId.get(id)?.open_dirs ?? [])}`).join(" · ")}. `
    + `The fewest directions that reach them all: ${result.setups.map((s) => dir(s.direction)).join(", ")}.`;
}

/** The features the access rule left out of every setup, or null. */
export function notPlanned(result: Analysis): string | null {
  const away = result.findings.filter((f) => f.rule === "access");
  return away.length ? `In no setup: ${away.map((f) => `${f.feature} (${f.id})`).join(", ")}. `
    + "Each needs a 4/5-axis mill or a fixture; its tools are not listed." : null;
}

/** The last line of the plan: what its directions or axis mean. */
export function planFoot(result: Analysis): string {
  return isLathe(result) ? "The turning axis is the line carrying the most round faces."
    : "Directions are the part's own axes: +Z is the outward normal of its largest flat face.";
}

/** One cost driver as a line: "Distinct tools: 4 × 1.0 = 4.0". */
export function driverLine(d: CostDriver): string {
  return `${d.label}: ${d.count} × ${d.weight.toFixed(1)} = ${d.score.toFixed(1)}`;
}

/** The cost drivers panel (S7, spec "Cost drivers"): counts and weights, ranked by score. No time or dollars. */
export function renderDrivers(host: HTMLElement, result: Analysis | null): void {
  host.replaceChildren();
  if (!result) return;
  if (!result.cost_drivers.length) {
    host.append(el("p", "none", "No cost drivers: one setup and no tools to load."));
    return;
  }
  const list = el("ul", "drivers");
  for (const d of result.cost_drivers) {
    const li = el("li");
    li.dataset.testid = `driver-${d.driver}`;
    li.append(el("span", "dlabel", d.label), el("span", "dscore", `${d.count} × ${d.weight.toFixed(1)} = ${d.score.toFixed(1)}`));
    list.append(li);
  }
  host.append(list, el("p", "note", `Score is count × weight. Every weight is an ${[...new Set(result.cost_drivers.map((d) => d.weight_source))].join(", ")} `
    + "(config/drivers.toml). No time or dollars yet."));
}

/** "0.500 in round bar, 4.500 in long" or "2.000 × 3.000 × 1.500 in block": the part's own size, no allowance. */
export function stockText(s: NonNullable<Analysis["stock"]>): string {
  const f = (v: number) => v.toFixed(3);
  return s.shape === "bar"
    ? `${f(s.diameter_in ?? 0)} in round bar, ${f(s.length_in ?? 0)} in long (the part's size; no allowance added)`
    : `${(s.size_in ?? []).map(f).join(" × ")} in block (the part's size; no allowance added)`;
}

/** The turning axis in the part's own axes: "+Z" when it lies along one, else its components. */
export function axisText(v: number[], result: Analysis): string {
  const f = result.part.frame;
  const c = [f.x, f.y, f.z].map((a) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2]);
  const k = c.findIndex((x) => Math.abs(x) >= Math.cos(0.5 * Math.PI / 180));
  if (k >= 0) return `along ${c[k] > 0 ? "+" : "−"}${"XYZ"[k]} of the part`;
  return `(${c.map((x) => x.toFixed(2)).join(", ")}) in the part's axes`;
}
