// The findings list in severity groups, the machine plan and the .ipt panels (spec "Web page", D-012), shown in the
// Features and Machining steps (review-steps S1, D-045).

import type { Analysis, Blend, CostDriver, Feature, Finding, HoleFeature, IptHole, Severity, Thread, Tool } from "./api";
import { sevMark, sevWord } from "./words";

export const RULE_NAMES: Record<string, string> = {
  hole_depth: "hole depth", hole_size: "hole size", corner_radius: "corner radius", pocket_depth: "pocket depth",
  undercut: "undercut", thin_wall: "thin wall", access: "access",
  turn_axis: "turning axis", turn_slender: "length to diameter", turn_offaxis: "off the turning axis",
  bore_depth: "bore depth", looks_turned: "looks turned", thread_mismatch: "thread vs hole", // I1 S2
  hole_mismatch: "Hole feature vs hole", // I2 S1 (D-040)
  blend_mismatch: "fillet vs face", // I3 S3
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
  return el("span", `sev ${severity}`, sevWord(severity));
}

/** "2 holes checked", or "1 pocket and 4 corners checked": the kinds the part has; a part with none of them still
 *  says "0 holes checked". */
export function checkedCount(result: Analysis): string {
  const parts = KIND_NAMES.map(([kind, one, many]) => {
    const n = result.features.filter((f) => f.kind === kind).length;
    return n ? `${n} ${n === 1 ? one : many}` : "";
  }).filter(Boolean);
  const counted = parts.length === 0 ? "0 holes" : parts.length === 1 ? parts[0]
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${counted} checked`;
}

/** The PDF summary's line: "2 holes checked · Rules run: Hole depth check, …." (check names, review-steps S1). */
export function checkedLine(result: Analysis): string {
  return `${checkedCount(result)} · Rules run: ${result.checks_run.join(", ")}.`;
}

/** Features with no finding that passed a check: the OK count and the Passed list (D-023). */
export function okFeatures(result: Analysis): Feature[] {
  const flagged = new Set<string | null>(result.findings.map((f) => f.feature));
  return result.features.filter((f) => !flagged.has(f.id) && result.passed.some((p) => p.feature === f.id));
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
  parts.push(f.limit_text); // "limit is an estimate": plain words, no decision ids (review-steps S1)
  const thread = holeThreads(feature, result); // I1 S2 (D-036)
  if (thread) parts.push(thread);
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
    head.append(el("span", undefined, `${sevMark(severity)} ${sevWord(severity)}`), el("span", undefined, String(items.length)));
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
  const ok = okFeatures(result);
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
      const thread = holeThreads(f, result); // I1 S2 (D-036)
      if (thread) row.append(el("span", "pcheck", thread));
      for (const p of result.passed.filter((x) => x.feature === f.id)) {
        const check = el("span", "pcheck");
        check.append(el("span", "prule", `✓ ${RULE_NAMES[p.rule] ?? p.rule}: `), document.createTextNode(p.title));
        const math = el("span", "pmath", `${p.math} · ${p.limit_text}`);
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

// --- I1 S2: threads from the .ipt (D-036, mockups/threads-panel.html) ---

const STATE_WORD: Record<Thread["state"], string> = { matched: "matched", disagrees: "disagrees", not_mapped: "not mapped" };

/** A stored mm value as written: "25", "10.25" (as the .ipt holds it, no padding). */
function mmText(mm: number): string {
  return String(Math.round(mm * 100) / 100);
}

/** "0.984 in [25 mm]": inches first, the stored mm in brackets (D-005, D-036). */
export function inMm(mm: number, digits?: number): string {
  return `${(mm / 25.4).toFixed(3)} in [${digits === undefined ? mmText(mm) : mm.toFixed(digits)} mm]`;
}

/** "M12x1.75 - 6H". */
export function threadCallout(t: Thread): string {
  return [t.designation ?? "thread", t.class].filter(Boolean).join(" - ");
}

/** "0.984 in [25 mm] deep · tap drill 0.404 in [10.25 mm] (as stored in the .ipt)". */
export function threadSize(t: Thread): string {
  const parts = [];
  if (t.depth_mm !== null) parts.push(`${inMm(t.depth_mm)} deep`);
  if (t.tap_drill_mm !== null) parts.push(`tap drill ${inMm(t.tap_drill_mm)} (as stored in the .ipt)`);
  return parts.join(" · ");
}

/** One gap: the axis gap in inches with its mm, the others as the service words them. */
function gapText(g: Thread["gaps"][number]): string {
  return g.what === "axis" ? `${inMm(g.mm, 2)} off the hole's axis` : g.text;
}

/** The disagreeing or not-mapped line of a thread, or "" when it matched. */
export function threadNote(t: Thread, result: Analysis): string {
  if (t.state === "not_mapped") return `Not mapped: ${t.reason ?? "unknown"}. Our limit, not a finding.`;
  if (t.state !== "disagrees") return "";
  const f = result.findings.find((x) => x.rule === "thread_mismatch" && x.thread === t.id);
  return t.gaps.map(gapText).join("; ") + (f ? ` · finding ${f.id}` : "");
}

/** "N matched, N disagrees, N not mapped". */
export function threadCounts(threads: Thread[]): string {
  return (["matched", "disagrees", "not_mapped"] as const)
    .map((s) => `${threads.filter((t) => t.state === s).length} ${STATE_WORD[s]}`).join(", ");
}

/** "Thread: M12x1.75 - 6H (from the .ipt)" for a hole a thread is mapped to, or "" (D-036). */
export function holeThreads(f: Feature | undefined, result: Analysis): string {
  const ids = f?.thread ?? [];
  const threads = (result.inventor?.threads ?? []).filter((t) => ids.includes(t.id));
  return threads.length ? `Thread: ${[...new Set(threads.map(threadCallout))].join(", ")} (from the .ipt)` : "";
}

/** The Threads panel's rows (D-036): one per thread in record order; a mapped row selects its hole. */
export function renderThreads(host: HTMLElement, result: Analysis | null, onSelect: (f: Pick) => void, selected: string | null): void {
  host.replaceChildren();
  const inv = result?.inventor;
  if (!result || !inv) return;
  const threads = inv.threads ?? [];
  if (!threads.length) {
    host.append(el("p", "none", "No threads in this .ipt."));
    return;
  }
  host.append(el("p", "none", `From ${inv.name}: ${threadCounts(threads)}. Tap a thread to show its hole.`));
  const holes = new Map(result.features.map((f) => [f.id, f]));
  for (const t of threads) {
    const hole = t.hole ? holes.get(t.hole) : undefined;
    const cls = t.state === "matched" ? "ok" : t.state === "disagrees" ? "medium" : "nm";
    const id = `thread:${t.id}`;
    const row = el(hole ? "button" : "div", `pass-row thread-row ${cls}`);
    row.dataset.testid = "thread-row";
    const line = el("span", "row1");
    line.append(el("span", `sev ${cls}`, STATE_WORD[t.state]), el("span", "ftitle", threadCallout(t)), el("span", "fid", t.hole ?? t.id));
    row.append(line);
    const size = threadSize(t);
    if (size) row.append(el("span", "fmeta", size));
    if (t.feature_name) row.append(el("span", "fmeta fname", t.feature_name)); // I2 S2: small print, never guessed
    const note = threadNote(t, result);
    if (note) row.append(el("span", "fmeta", note));
    if (hole && row instanceof HTMLButtonElement) {
      row.type = "button";
      row.setAttribute("aria-pressed", String(selected === id));
      row.addEventListener("click", () => onSelect({ id, faces: hole.faces }));
    }
    host.append(row);
  }
}

// --- I2 S1: Hole features from the .ipt (D-040, mockups/hole-features-panel.html) ---

const HOLE_TYPE: Record<HoleFeature["type"], string> = { simple: "Simple hole", counterbore: "Counterbore", countersink: "Countersink" };

function holeCount(n: number): string {
  return `${n} ${n === 1 ? "hole" : "holes"}`;
}

/** "Countersink · 30 holes". */
export function holeFeatureTitle(f: HoleFeature): string {
  return `${HOLE_TYPE[f.type]} · ${holeCount(f.holes.length)}`;
}

/** "Ø0.551 in [14 mm] through, countersink Ø0.787 in [20 mm] × 90°": the sizes as designed, inches first (D-005). */
export function holeFeatureSize(f: HoleFeature, sep = " · "): string {
  if (f.diameter_mm === null) return "";
  const out = [f.through || f.depth_mm === null ? `Ø${inMm(f.diameter_mm)} through` : `Ø${inMm(f.diameter_mm)} × ${inMm(f.depth_mm)} deep`];
  if (f.cbore_diameter_mm !== null && f.cbore_depth_mm !== null) out.push(`counterbore Ø${inMm(f.cbore_diameter_mm)} × ${inMm(f.cbore_depth_mm)}`);
  if (f.csink_diameter_mm !== null && f.csink_deg !== null) out.push(`countersink Ø${inMm(f.csink_diameter_mm)} × ${mmText(f.csink_deg)}°`);
  if (f.point_deg !== null && !f.through) out.push(`${mmText(f.point_deg)}° drill point`);
  return out.join(sep);
}

/** "4 holes: 1 drawn, 3 copied by 2 pattern or mirror features", or "" when none is copied (I2 S2, D-039). */
export function holeCopies(f: HoleFeature): string {
  const copied = f.holes.filter((h) => h.copied_by.length);
  if (!copied.length) return "";
  const p = new Set(copied.flatMap((h) => h.copied_by)).size;
  return `${holeCount(f.holes.length)}: ${f.holes.length - copied.length} drawn, ${copied.length} copied by ${p} pattern or mirror ${p === 1 ? "feature" : "features"}`;
}

/** "11 Hole features in the browser, 9 read" when the .ipt names more Holes than were read, else "" (I2 S2). */
export function holeNamesSeen(seen: number | undefined, read: number): string {
  return seen !== undefined && seen > read ? `${seen} Hole features in the browser, ${read} read` : "";
}

/** "N matched, N disagree, N not mapped" over holes. */
export function holeCounts(holes: IptHole[]): string {
  const n = (s: IptHole["state"]) => holes.filter((h) => h.state === s).length;
  return `${n("matched")} matched, ${n("disagrees")} disagree, ${n("not_mapped")} not mapped`;
}

function holeNum(id: string): number {
  return parseInt(id.replace(/^\D+/, ""), 10);
}

/** The Hole features panel (D-040): one row per feature; a tapped feature unfolds its holes. Selection ids:
 *  `hf:<feature id>` (all its mapped holes) and `hfh:<hole id>` (one hole). */
export function renderHoleFeatures(host: HTMLElement, result: Analysis | null, onSelect: (f: Pick) => void, selected: string | null): void {
  host.replaceChildren();
  const inv = result?.inventor;
  if (!result || !inv) return;
  const feats = inv.hole_features ?? [];
  if (!feats.length) {
    host.append(el("p", "none", "No Hole features in this .ipt."));
    return;
  }
  const all = feats.flatMap((f) => f.holes);
  const seen = holeNamesSeen(inv.hole_names_seen, feats.length);
  host.append(el("p", "none", `From ${inv.name}: ${feats.length} Hole features, ${holeCount(all.length)}: ${holeCounts(all)}.${seen ? ` ${seen}.` : ""} Tap a feature to show its holes; tap a hole to show it alone.`));
  const steps = new Map(result.features.map((f) => [f.id, f]));
  for (const f of feats) {
    const cls = f.state === "matched" ? "ok" : f.state === "disagrees" ? "medium" : "nm";
    const mapped = [...new Set(f.holes.map((h) => h.hole).filter((x): x is string => !!x))];
    const faces = [...new Set(mapped.flatMap((id) => steps.get(id)?.faces ?? []))];
    const id = `hf:${f.id}`;
    const open = selected === id || f.holes.some((h) => selected === `hfh:${h.id}`);
    const unfolds = f.holes.some((h) => h.state !== "matched");
    const row = el(faces.length || unfolds ? "button" : "div", `pass-row thread-row hf-row ${cls}`);
    row.dataset.testid = "hole-feature-row";
    const line = el("span", "row1");
    line.append(el("span", `sev ${cls}`, STATE_WORD[f.state]), el("span", "ftitle", holeFeatureTitle(f)), el("span", "fid", f.id));
    row.append(line);
    const size = holeFeatureSize(f);
    if (size) row.append(el("span", "fmeta", `${size} (as designed in the .ipt)`));
    if (f.name) row.append(el("span", "fmeta fname", f.name)); // I2 S2: small print, never guessed
    if (f.reason) row.append(el("span", "fmeta", `Not mapped: ${f.reason}. Our limit, not a finding.`));
    const copies = holeCopies(f);
    if (copies) row.append(el("span", "fmeta", copies));
    row.append(el("span", "fmeta", holeCounts(f.holes) + (open || !(faces.length || unfolds) ? "" : " · tap to show its holes")));
    if (row instanceof HTMLButtonElement) {
      row.type = "button";
      row.setAttribute("aria-pressed", String(selected === id));
      row.setAttribute("aria-expanded", String(open));
      row.addEventListener("click", () => onSelect({ id, faces }));
    }
    host.append(row);
    if (!open) continue;
    if (mapped.length) host.append(el("p", "none hf-on", `On ${[...mapped].sort((a, b) => holeNum(a) - holeNum(b)).join(", ")}.`));
    for (const h of f.holes.filter((x) => x.state !== "matched")) {
      const hcls = h.state === "disagrees" ? "medium" : "nm";
      const step = h.hole ? steps.get(h.hole) : undefined;
      const hid = `hfh:${h.id}`;
      const sub = el(step ? "button" : "div", `pass-row thread-row hf-hole ${hcls}`);
      sub.dataset.testid = "hole-feature-hole";
      const l1 = el("span", "row1");
      l1.append(el("span", `sev ${hcls}`, STATE_WORD[h.state]), el("span", "ftitle", h.hole ? `on ${h.hole}` : h.id), el("span", "fid", h.id));
      sub.append(l1);
      if (h.state === "not_mapped") {
        sub.append(el("span", "fmeta", `Not mapped: ${h.reason ?? "unknown"}. Our limit, not a finding.`));
      } else {
        const fd = result.findings.find((x) => x.rule === "hole_mismatch" && x.ipt_hole === h.id);
        sub.append(el("span", "fmeta", h.gaps.map((g) => g.text).join("; ") + (fd ? ` · finding ${fd.id}` : "")));
      }
      if (step && sub instanceof HTMLButtonElement) {
        sub.type = "button";
        sub.setAttribute("aria-pressed", String(selected === hid));
        sub.addEventListener("click", () => onSelect({ id: hid, faces: step.faces }));
      }
      host.append(sub);
    }
  }
}

// --- I3 S3: fillets and chamfers from the .ipt (mockups/blends-panel.html) ---

/** "Fillet · R0.197 in [5 mm]", "Chamfer · 0.197 in [5 mm] × 0.197 in [5 mm], 90°", "Blend · shape not understood". */
export function blendTitle(b: Blend): string {
  if (b.kind === "fillet") return b.radius_mm === null ? "Fillet" : `Fillet · R${inMm(b.radius_mm)}`;
  if (b.kind === "chamfer") {
    if (!b.distances_mm) return "Chamfer";
    const [a, c] = b.distances_mm;
    return `Chamfer · ${inMm(a)} × ${inMm(c)}${b.angle_deg === null ? "" : `, ${mmText(b.angle_deg)}°`}`;
  }
  return "Blend · shape not understood";
}

/** "7 fillets, 1 chamfer" (and "2 not understood"). */
export function blendKinds(blends: Blend[]): string {
  const n = (k: Blend["kind"]) => blends.filter((b) => b.kind === k).length;
  const word = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
  const out = [word(n("fillet"), "fillet", "fillets"), word(n("chamfer"), "chamfer", "chamfers")];
  if (n(null)) out.push(`${n(null)} not understood`);
  return out.join(", ");
}

/** "N matched, N disagree, N not mapped" over blends. */
export function blendCounts(blends: Blend[]): string {
  const n = (s: Blend["state"]) => blends.filter((b) => b.state === s).length;
  return `${n("matched")} matched, ${n("disagrees")} disagree, ${n("not_mapped")} not mapped`;
}

/** "22 of 42 faces found in the STEP", plus "copied by 1 pattern or mirror feature" (D-039's words). */
export function blendFaces(b: Blend): string {
  if (b.kind === null) return "";
  const copies = b.copied_by.length ? ` · copied by ${b.copied_by.length} pattern or mirror ${b.copied_by.length === 1 ? "feature" : "features"}` : "";
  return `${b.faces_mapped} of ${b.faces} ${b.faces === 1 ? "face" : "faces"} found in the STEP${copies}`;
}

/** The disagreeing or not-mapped line of a blend, or "" when it matched. */
export function blendNote(b: Blend, result: Analysis): string {
  if (b.state === "not_mapped") return `Not mapped: ${b.reason ?? "unknown"}. Our limit, not a finding.`;
  if (b.state !== "disagrees") return "";
  const f = result.findings.find((x) => x.rule === "blend_mismatch" && x.blend === b.id);
  return b.gaps.map((g) => g.text).join("; ") + (f ? ` · finding ${f.id}` : "");
}

/** The Fillets and chamfers panel: one row per blend in feature-id order; a row with STEP faces selects them. */
export function renderBlends(host: HTMLElement, result: Analysis | null, onSelect: (f: Pick) => void, selected: string | null): void {
  host.replaceChildren();
  const inv = result?.inventor;
  if (!result || !inv) return;
  const blends = inv.blends ?? [];
  if (!blends.length) {
    host.append(el("p", "none", "No fillets or chamfers in this .ipt."));
    return;
  }
  host.append(el("p", "none", `From ${inv.name}: ${blendKinds(blends)}: ${blendCounts(blends)}. Sizes as designed in the .ipt. Tap one to show its faces.`));
  for (const b of blends) {
    const cls = b.state === "matched" ? "ok" : b.state === "disagrees" ? "medium" : "nm";
    const id = `bl:${b.id}`;
    const row = el(b.step_faces.length ? "button" : "div", `pass-row thread-row bl-row ${cls}`);
    row.dataset.testid = "blend-row";
    const line = el("span", "row1");
    line.append(el("span", `sev ${cls}`, STATE_WORD[b.state]), el("span", "ftitle", blendTitle(b)), el("span", "fid", b.id));
    row.append(line);
    const faces = blendFaces(b);
    if (faces) row.append(el("span", "fmeta", faces));
    const note = blendNote(b, result);
    if (note) row.append(el("span", "fmeta", note));
    if (row instanceof HTMLButtonElement) {
      row.type = "button";
      row.setAttribute("aria-pressed", String(selected === id));
      row.addEventListener("click", () => onSelect({ id, faces: b.step_faces }));
    }
    host.append(row);
  }
}
