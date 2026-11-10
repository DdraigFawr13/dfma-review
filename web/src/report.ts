// The PDF report (spec J6, S7): page 1 holds the part summary and the machine plan as the screen shows it, the
// tools, tool loads and cost drivers; then each finding has its own page with a picture of the model with that
// finding highlighted; the assumptions come last. Built in the browser with jsPDF, so the file never leaves the computer (APP-01).

// Imported up front, not on demand: the view-only demo page inlines one script and has no chunks to load (D-009).
import { NOT_WORKED_OUT, POCKETS_LATER, noChecksRun, notCheckedLine, partial, planNotWorkedOut, pocketsLater } from "./notrun";
import { jsPDF } from "jspdf";
import type { Analysis, Finding } from "./api";
import { axisText, blendCounts, blendFaces, blendKinds, blendTitle, holeCopies, holeCounts, holeFeatureSize, holeNamesSeen, holeFeatureTitle, checkedLine, driverLine, inMm, meta, notPlanned, planFoot, planWhy, setupHead, stockText, threadCallout, threadCounts, threadSize, toolName } from "./findings";
import { formatIn, formatRatio, formatSize } from "./format";
import { sevWord } from "./words";

/** What the report needs besides the analysis: the labels the reader chose, today's date, and a picture per finding. */
export interface ReportInput {
  result: Analysis;
  processLabel: string;
  materialLabel: string;
  date: string; // YYYY-MM-DD
  /** A picture of the model with this finding selected and framed. */
  picture: (f: Finding) => { url: string; width: number; height: number; spot: [number, number] | null };
}

const PAGE = { w: 612, h: 792, margin: 48 };
const WIDTH = PAGE.w - 2 * PAGE.margin;
// jsPDF's built-in fonts hold Latin-1 only: swap the few other characters the app uses.
const SWAPS: Record<string, string> = { "−": "-", "≤": "<=", "≥": ">=", "…": "...", "✓": "ok", "–": "-", "—": "-" };

/** Text the PDF's standard fonts can draw. */
export function ascii(text: string): string {
  return [...text].map((c) => SWAPS[c] ?? (c.charCodeAt(0) > 255 ? "?" : c)).join("");
}

/** "No findings", or "6 findings: 5 Fix, 1 Review.": the answer, in plain words (D-042 words). */
export function verdictText(result: Analysis): string {
  const n = result.findings.length;
  if (n === 0) return "No findings. Every feature checked passed its rules.";
  const by = (s: string) => result.findings.filter((f) => f.severity === s).length;
  const parts = [`${by("high")} Fix`, `${by("medium")} Review`].filter((p) => !p.startsWith("0 "));
  return `${n} ${n === 1 ? "finding" : "findings"}: ${parts.join(", ")}.`;
}

/** A finding's measured value or limit in the screen's units (spec Units): inches to 0.001, ratios to 0.1 (to 0.01
 *  when 0.1 would show the measured value equal to its limit), degrees and percent to 0.1. */
export function valueText(value: number, unit: string, other?: number): string {
  if (unit === "in") return formatIn(value);
  if (unit === "ratio") {
    const close = other !== undefined && value !== other && value.toFixed(1) === other.toFixed(1);
    return close ? `${value.toFixed(2)}×` : formatRatio(value);
  }
  if (unit === "deg") return `${value.toFixed(1)}°`;
  if (unit === "%") return `${value.toFixed(1)}%`;
  return `${value} ${unit}`;
}

/** The file name the download gets: the part's name without its extension, then "-dfma-review.pdf". */
export function reportName(partName: string): string {
  return `${partName.replace(/\.(step|stp)$/i, "").replace(/[^\w.-]+/g, "_") || "part"}-dfma-review.pdf`;
}

class Page {
  y = PAGE.margin;
  constructor(readonly doc: jsPDF) {}

  newPage(): void {
    this.doc.addPage();
    this.y = PAGE.margin;
  }

  /** Write wrapped text at the cursor, breaking to a new page when it does not fit. */
  text(text: string, o: { size?: number; bold?: boolean; mono?: boolean; indent?: number; gap?: number; colour?: [number, number, number] } = {}): void {
    const size = o.size ?? 10, indent = o.indent ?? 0, lead = size * 1.3;
    this.doc.setFont(o.mono ? "courier" : "helvetica", o.bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...(o.colour ?? [22, 38, 61]));
    const lines = this.doc.splitTextToSize(ascii(text), WIDTH - indent) as string[];
    for (const line of lines) {
      if (this.y + lead > PAGE.h - PAGE.margin) this.newPage();
      this.doc.text(line, PAGE.margin + indent, this.y + size);
      this.y += lead;
    }
    this.y += o.gap ?? 2;
  }

  heading(text: string): void {
    this.y += 6;
    this.text(text, { size: 13, bold: true, gap: 4 });
  }

  rule(): void {
    this.doc.setDrawColor(196, 207, 220);
    this.doc.line(PAGE.margin, this.y, PAGE.w - PAGE.margin, this.y);
    this.y += 6;
  }
}

function summaryPage(p: Page, input: ReportInput): void {
  const { result } = input, part = result.part;
  p.text("DFMA Review report", { size: 20, bold: true, gap: 4 });
  p.text(part.name, { size: 13, bold: true, gap: 2 });
  p.text(`${input.processLabel} · ${input.materialLabel} · ${input.date}`, { colour: [85, 101, 122], gap: 8 });
  const notChecked = notCheckedLine(result); // the browser copy (port spec "Not checked yet", D-057)
  if (!noChecksRun(result)) {
    p.text(verdictText(result), { size: 13, bold: true, gap: 2 });
    p.text(checkedLine(result), { colour: [85, 101, 122], gap: notChecked ? 2 : 4 });
  }
  if (notChecked) p.text(notChecked, { bold: noChecksRun(result), gap: 4 });
  p.rule();

  p.heading("Part summary");
  p.text(`Size: ${formatSize(part.bbox_in)}`);
  p.text(`Faces: ${part.face_count}`);
  p.text(`Units in file: ${part.units_in_file}`);
  if (result.stock && !planNotWorkedOut(result)) p.text(`Stock: ${stockText(result.stock)}`); // the plan's (D-057)

  p.heading("Machine plan");
  if (planNotWorkedOut(result)) {
    p.text(NOT_WORKED_OUT);
  } else if (!result.machine) {
    p.text("No machine could be chosen for this part, so nothing is planned.");
  } else {
    if (pocketsLater(result)) p.text(POCKETS_LATER); // the browser copy before S4 (D-061)
    p.text(`Machine: ${result.machine}`, { bold: true });
    const lathe = result.setups.length === 1 && result.setups[0].direction === "turn";
    if (lathe && result.turn_axis) p.text(`Turning axis: ${axisText(result.turn_axis, result)}`);
    p.text(`Tool loads: ${result.tool_changes} (the first in each setup counts)`); // as on screen (audit F6)
    const why = planWhy(result);
    if (why) p.text(why, { colour: [85, 101, 122] });
    const tools = new Map(result.tools.map((t) => [t.id, t]));
    result.setups.forEach((s, i) => {
      p.text(setupHead(s, i), { bold: true, gap: 1 });
      const ops = result.operations.filter((o) => o.setup === i);
      if (!ops.length) p.text("Nothing to cut from this side.", { indent: 12 });
      for (const o of ops) {
        const t = tools.get(o.tool);
        // Numbered in the order they run, across all setups, as on the screen
        p.text(`${result.operations.indexOf(o) + 1}. ${t ? toolName(t) : o.tool} (${o.tool})  ${o.features.join(", ")}`, { indent: 12, gap: 1 });
      }
      p.y += 3;
    });
    const away = notPlanned(result);
    if (away) p.text(away);
    p.text(planFoot(result), { colour: [85, 101, 122] });
    p.heading(`Tools (${result.tools.length})`);
    for (const t of result.tools) p.text(`${toolName(t)} (${t.id})`, { indent: 12, gap: 1 });
    if (!result.tools.length) p.text("None.", { indent: 12 });
  }

  p.heading("Cost drivers");
  if (planNotWorkedOut(result)) p.text(NOT_WORKED_OUT);
  else if (!result.cost_drivers.length) p.text("None: one setup and no tools to load.");
  for (const d of result.cost_drivers) p.text(driverLine(d), { indent: 12, gap: 1 });
  if (result.cost_total !== null && !planNotWorkedOut(result)) { // D-061: the total, as on screen
    p.text(`Total score: ${result.cost_total.toFixed(1)} points${partial(result)}`, { indent: 12, bold: true, gap: 1 });
  }
  if (result.cost_drivers.length) {
    const sources = [...new Set(result.cost_drivers.map((d) => d.weight_source))].join(", ");
    p.text(`Score is count x weight, highest first. Every weight is an ${sources}. No time or dollars yet.`, { colour: [85, 101, 122] }); // weights: config/drivers.toml
  }
  if (result.inventor) threadsSection(p, input);
  if (result.inventor) holeFeaturesSection(p, input);
  if (result.inventor) blendsSection(p, input);
}

/** One Hole feature as a PDF line (D-040): "hf-7 Countersink · 30 holes: <sizes>. 26 matched, 4 disagree, 0 not
 *  mapped (findings F35, F36, F37, F38)". */
export function holeFeatureLine(f: NonNullable<NonNullable<Analysis["inventor"]>["hole_features"]>[number], result: Analysis): string {
  const ids = result.findings.filter((x) => x.rule === "hole_mismatch" && x.hole_feature === f.id).map((x) => x.id);
  let line = `${f.id} ${holeFeatureTitle(f)}${f.name ? ` · ${f.name}` : ""}: ${holeFeatureSize(f, ", ")}. ${holeCounts(f.holes)}`;
  if (ids.length) line += ` (${ids.length === 1 ? "finding" : "findings"} ${ids.join(", ")})`;
  const reasons = [...new Set(f.holes.filter((h) => h.state === "not_mapped").map((h) => h.reason ?? "unknown"))];
  if (reasons.length) line += `; not mapped: ${reasons.join(", ")} (our limit, not a finding)`;
  const copies = holeCopies(f);
  if (copies) line += `; ${copies}`;
  return `${line}.`;
}

/** One blend as a PDF line (D-043): "bl-8 Fillet · R0.197 in [5 mm]: matched; 32 of 36 faces found in the STEP;
 *  copied by 1 pattern or mirror feature." */
export function blendLine(b: NonNullable<NonNullable<Analysis["inventor"]>["blends"]>[number], result: Analysis): string {
  let state: string = b.state === "not_mapped" ? `not mapped: ${b.reason ?? "unknown"} (our limit, not a finding)` : b.state;
  if (b.state === "disagrees") {
    const f = result.findings.find((x) => x.rule === "blend_mismatch" && x.blend === b.id);
    state = `disagrees: ${b.gaps.map((g) => g.text).join("; ")}${f ? `; finding ${f.id}` : ""}`;
  }
  const faces = blendFaces(b).replace(" · ", "; ");
  return `${b.id} ${blendTitle(b)}: ${state}${faces ? `; ${faces}` : ""}.`;
}

/** The summary page's Fillets and chamfers section, after Hole features (D-043). */
function blendsSection(p: Page, input: ReportInput): void {
  const inv = input.result.inventor!, blends = inv.blends ?? [];
  p.heading(`Fillets and chamfers (from ${inv.name})`);
  if (!blends.length) {
    p.text("No fillets or chamfers in this .ipt.");
    return;
  }
  p.text(`${blendKinds(blends)}: ${blendCounts(blends)}. Sizes as designed in the .ipt.`);
  for (const b of blends) p.text(blendLine(b, input.result), { indent: 12, gap: 1 });
}

/** The summary page's Hole features section, after Threads (D-040). */
function holeFeaturesSection(p: Page, input: ReportInput): void {
  const inv = input.result.inventor!, feats = inv.hole_features ?? [];
  p.heading(`Hole features (from ${inv.name})`);
  if (!feats.length) {
    p.text("No Hole features in this .ipt.");
    return;
  }
  const all = feats.flatMap((f) => f.holes);
  const seen = holeNamesSeen(inv.hole_names_seen, feats.length);
  p.text(`${feats.length} Hole features, ${all.length} holes: ${holeCounts(all)}.${seen ? ` ${seen}.` : ""} Sizes as designed in the .ipt.`);
  for (const f of feats) p.text(holeFeatureLine(f, input.result), { indent: 12, gap: 1 });
}

/** One thread as a PDF line (D-036): "hole-38  M3x0.5 - 6H  0.236 in [6 mm] deep  tap drill 0.098 in [2.5 mm]  matched". */
export function threadLine(t: NonNullable<NonNullable<Analysis["inventor"]>["threads"]>[number], result: Analysis): string {
  const size = threadSize(t).replace(" · ", "  ").replace(" (as stored in the .ipt)", "");
  let state: string = t.state === "not_mapped" ? `not mapped: ${t.reason ?? "unknown"} (our limit, not a finding)` : t.state;
  if (t.state === "disagrees") {
    const f = result.findings.find((x) => x.rule === "thread_mismatch" && x.thread === t.id);
    const gaps = t.gaps.map((g) => (g.what === "axis" ? `${inMm(g.mm, 2)} off the hole's axis` : g.text)).join("; ");
    state = `disagrees: ${gaps}${f ? `; see ${f.id}` : ""}`;
  }
  return [t.hole ?? t.id, threadCallout(t), t.feature_name, size, state].filter(Boolean).join("  ");
}

/** The summary page's Threads section, after Cost drivers (D-036); a long list runs onto the next page. */
function threadsSection(p: Page, input: ReportInput): void {
  const inv = input.result.inventor!, threads = inv.threads ?? [];
  p.heading(`Threads (from ${inv.name})`);
  if (!threads.length) {
    p.text("No threads in this .ipt.");
    return;
  }
  p.text(`${threadCounts(threads)}. Callout, depth and tap drill as stored in the .ipt.`);
  for (const t of threads) p.text(threadLine(t, input.result), { indent: 12, gap: 1 });
}

function findingPage(p: Page, f: Finding, input: ReportInput): void {
  const { result } = input;
  p.newPage();
  const row = result.rows.find((r) => r.findings.includes(f.id)); // the row's own names, as on screen (audit F2)
  p.text(`${f.id} · ${sevWord(f.severity).toUpperCase()} · ${row?.short ?? f.title} · ${f.check}`, { size: 11, bold: true, colour: f.severity === "high" ? [179, 38, 30] : [163, 90, 0], gap: 2 });
  p.text(f.title, { size: 14, bold: true, gap: 6 });
  const pic = input.picture(f);
  const h = Math.min(330, WIDTH * pic.height / pic.width), w = h * pic.width / pic.height;
  const colour: [number, number, number] = f.severity === "high" ? [179, 38, 30] : [163, 90, 0];
  p.doc.addImage(pic.url, "JPEG", PAGE.margin, p.y, w, h);
  p.doc.setDrawColor(196, 207, 220);
  p.doc.rect(PAGE.margin, p.y, w, h);
  const at = pic.spot, ringed = !!at && at[0] >= 0 && at[0] <= 1 && at[1] >= 0 && at[1] <= 1;
  if (at && ringed) { // a ring and the finding's id on its spot, as its pin on screen (D-017): small features stay findable
    const cx = PAGE.margin + at[0] * w, cy = p.y + at[1] * h;
    p.doc.setDrawColor(...colour);
    p.doc.setLineWidth(2);
    p.doc.circle(cx, cy, 16);
    p.doc.setLineWidth(0.5);
    p.doc.setFont("helvetica", "bold");
    p.doc.setFontSize(10);
    p.doc.setTextColor(...colour);
    p.doc.text(f.id, Math.min(cx + 19, PAGE.margin + w - p.doc.getTextWidth(f.id) - 3), Math.max(cy - 14, p.y + 12));
  }
  p.y += h + 8;
  p.text(`The faces in blue are the ones this finding is about${ringed ? ", ringed" : ""}; the rest of the part is faded.`,
    { size: 9, colour: [85, 101, 122], gap: 8 });
  p.text(`Measured ${valueText(f.measured, f.unit, f.limit)}; limit ${valueText(f.limit, f.unit, f.measured)}; ${f.limit_text}.`);
  p.text(`Where: ${meta(f, result)}`);
  const feature = result.features.find((x) => x.id === f.feature);
  p.text(f.feature ? `Feature ${f.feature}; face ids ${f.faces.join(", ")}${feature ? ` (${feature.kind})` : ""}.` : `Whole part; face ids ${f.faces.join(", ")}.`);
  p.text(`What to do: ${f.suggestion}`, { bold: true });
}

/** Build the whole report. */
export function buildReport(input: ReportInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setProperties({ title: `DFMA Review: ${input.result.part.name}`, creator: "DFMA Review" });
  const p = new Page(doc);
  summaryPage(p, input);
  for (const f of input.result.findings) findingPage(p, f, input);
  p.newPage();
  p.text(`Assumptions (${input.result.assumptions.length})`, { size: 13, bold: true, gap: 4 });
  for (const a of input.result.assumptions) p.text(`- ${a}`, { size: 9, indent: 6, gap: 3 });
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(85, 101, 122);
    doc.text(ascii(`DFMA Review · ${input.result.part.name} · page ${n} of ${pages}`), PAGE.margin, PAGE.h - 24);
  }
  return doc;
}
