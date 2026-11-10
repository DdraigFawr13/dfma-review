// One module worker per analysis (port spec Design "Worker"). The page sends
// {id, module, step, name, process, material, ipt?}; the worker loads the engine from the module, posts
// {type: "ready"}, analyzes, and replies {id, ok: true, analysis} or {id, ok: false, message, retry}.
import { analyze } from "./engine/analyze";
import { loadOc } from "./engine/oc";
import { ReadError } from "./engine/read";
import { MSG_FAILED } from "./engine/settings";
import type { Material, Process } from "./api";

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
    const ipt = r.ipt ? { bytes: new Uint8Array(r.ipt.bytes), name: r.ipt.name } : undefined;
    const analysis = analyze(loaded.oc, new Uint8Array(r.step), r.name, r.process, r.material, ipt);
    const extra = import.meta.env.VITE_TEST === "1" ? { wasm_bytes: loaded.memory() } : {}; // test build only (J4)
    post({ id: r.id, ok: true, analysis: { ...analysis, ...extra } });
  } catch (e) {
    // A refusal keeps its message; anything else (an engine abort) is MSG_FAILED, which trying again can help.
    post(e instanceof ReadError ? { id: r.id, ok: false, message: e.message, retry: false } : { id: r.id, ok: false, message: MSG_FAILED, retry: true });
  }
};
