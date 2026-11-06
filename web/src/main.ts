// Page wiring: analyse as soon as a file is chosen, and again when process or material
// changes while a file is loaded. No submit button (spec S1, settled at build).

import { analyze, ApiError, type Material, type Process } from "./api";
import { formatSize } from "./format";
import { Viewer } from "./viewer";

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
const viewer = new Viewer(byId<HTMLCanvasElement>("viewer"));

let run = 0;

async function analyse(): Promise<void> {
  const file = fileInput.files?.[0];
  if (!file) return;
  const mine = ++run;
  status.textContent = `Analysing ${file.name}…`;
  error.hidden = true;
  try {
    const result = await analyze(file, processSelect.value as Process, materialSelect.value as Material);
    if (mine !== run) return; // a newer upload replaced this one
    byId("part-name").textContent = result.part.name;
    byId("part-size").textContent = formatSize(result.part.bbox_in);
    byId("face-count").textContent = `${result.part.face_count} faces`;
    byId("part-units").textContent = result.part.units_in_file;
    summary.hidden = false;
    viewer.show(result.faces);
    status.textContent = `Showing ${result.part.name}.`;
  } catch (e) {
    if (mine !== run) return;
    error.textContent = e instanceof ApiError ? e.message : "Something went wrong showing this part.";
    error.hidden = false;
    status.textContent = "Choose another file, or try again.";
    if (!(e instanceof ApiError)) console.error(e);
  }
}

fileInput.addEventListener("change", analyse);
processSelect.addEventListener("change", analyse);
materialSelect.addEventListener("change", analyse);
