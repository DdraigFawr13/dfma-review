// One module worker per analysis (port spec Design "Worker"). The page sends
// {id, module, step, name, process, material, ipt?}; the worker loads the engine from the module, posts
// {type: "ready"}, analyzes, and replies {id, ok: true, analysis} or {id, ok: false, message, retry}.
import { analyze } from "./engine/analyze";
import { readIpt } from "./engine/inventor/part";
import { loadOc } from "./engine/oc";
import { ReadError } from "./engine/read";
import { MSG_FAILED } from "./engine/settings";
import { BufferGeometry, EdgesGeometry, Float32BufferAttribute } from "three";
import type { Face, Material, Process } from "./api";

/** A face's normals and edge lines, as the viewer would work them out (viewer.ts show), done here so the page
 *  doesn't stall on a large part (port J3). */
function faceView(face: Face): { normals: Float32Array; edges: Float32Array } {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(face.positions, 3));
  geometry.setIndex(face.indices);
  geometry.computeVertexNormals();
  const edges = new EdgesGeometry(geometry, 30);
  const out = { normals: geometry.getAttribute("normal").array as Float32Array, edges: edges.getAttribute("position").array as Float32Array };
  geometry.dispose();
  edges.dispose();
  return out;
}

interface Request {
  id: number;
  module: WebAssembly.Module;
  step: ArrayBuffer;
  name: string;
  process: Process;
  material: Material;
  ipt?: { bytes: ArrayBuffer; name: string };
}

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (event: MessageEvent<Request>) => {
  const r = event.data;
  let loaded: Awaited<ReturnType<typeof loadOc>>;
  try {
    loaded = await loadOc({ module: r.module });
  } catch {
    post({ id: r.id, ok: false, message: MSG_FAILED, retry: true });
    return;
  }
  post({ type: "ready" });
  try {
    const ipt = r.ipt ? { read: await readIpt(new Uint8Array(r.ipt.bytes)), name: r.ipt.name } : undefined; // read first: it inflates asynchronously
    const analysis = analyze(loaded.oc, new Uint8Array(r.step), r.name, r.process, r.material, ipt);
    const extra = import.meta.env.VITE_TEST === "1" ? { wasm_bytes: loaded.memory() } : {}; // test build only (J4)
    const faces = analysis.faces.map((f) => ({ ...f, view: faceView(f) }));
    const buffers = faces.flatMap((f) => [f.view.normals.buffer, f.view.edges.buffer]) as ArrayBuffer[];
    (self as unknown as Worker).postMessage({ id: r.id, ok: true, analysis: { ...analysis, faces, ...extra } }, buffers); // moved, not copied
  } catch (e) {
    // A refusal keeps its message; anything else (an engine abort) is MSG_FAILED, which trying again can help.
    post(e instanceof ReadError ? { id: r.id, ok: false, message: e.message, retry: false } : { id: r.id, ok: false, message: MSG_FAILED, retry: true });
  }
};
