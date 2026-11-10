// Node helpers for the parity run and the demo results: load the engine from its .wasm file and run analyze() as
// the worker does (a refusal becomes {error}, any other failure MSG_FAILED).
import { createRequire } from "node:module";
import type { Material, Process } from "../api";
import { analyze } from "./analyze";
import { loadOc, type OC } from "./oc";
import { ReadError } from "./read";
import { MSG_FAILED } from "./settings";

export async function loadNodeOc(): Promise<OC> {
  const wasmPath = createRequire(import.meta.url).resolve("@taucad/opencascade.js/wasm");
  return (await loadOc({ wasmPath })).oc;
}

export function analyzeOrRefuse(oc: OC, bytes: Uint8Array, name: string, process: Process, material: Material = "al6061"): object {
  try {
    return analyze(oc, bytes, name, process, material);
  } catch (e) {
    return { error: e instanceof ReadError ? e.message : MSG_FAILED };
  }
}
