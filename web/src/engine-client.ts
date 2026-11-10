// The page's side of the browser engine (port spec Design "Worker", "web/src/api.ts"): compile the wasm once, then
// one worker per analysis, terminated after its reply, an error or the time limit. The TIME_LIMIT_S timer starts
// when the worker posts "ready", so a slow first download of the engine is not a timeout.
import wasmUrl from "@taucad/opencascade.js/wasm?url";
import type { Analysis, Material, Process } from "./api";
import { MAX_UPLOAD_BYTES, MSG_FAILED, MSG_IPT_NEEDS_STEP, MSG_TOO_LARGE, MSG_TOO_LONG, TIME_LIMIT_S } from "./engine/settings";

export class EngineError extends Error {
  constructor(message: string, readonly retry: boolean) {
    super(message);
  }
}

let compiled: Promise<WebAssembly.Module> | null = null;
let workersMade = 0;
let nextId = 1;

function engineModule(): Promise<WebAssembly.Module> {
  if (!compiled) {
    compiled = WebAssembly.compileStreaming(fetch(wasmUrl)).catch((e) => {
      compiled = null; // try the download again next time
      throw e;
    });
  }
  return compiled;
}

/** The time limit; the test build honours ?time_limit_s= (J4, J5). */
function timeLimitS(): number {
  if (import.meta.env.VITE_TEST === "1") {
    const v = Number(new URLSearchParams(location.search).get("time_limit_s"));
    if (v > 0) return v;
  }
  return TIME_LIMIT_S;
}

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // a compound file, as olefile.isOleFile (app.py)

export async function analyzeInBrowser(file: File, ipt: File | null, process: Process, material: Material): Promise<Analysis> {
  if (file.size > MAX_UPLOAD_BYTES || (ipt && ipt.size > MAX_UPLOAD_BYTES)) throw new EngineError(MSG_TOO_LARGE, false);
  const step = await file.arrayBuffer();
  const head = new Uint8Array(step, 0, Math.min(8, step.byteLength));
  if (head.length === 8 && OLE_MAGIC.every((b, i) => head[i] === b)) throw new EngineError(MSG_IPT_NEEDS_STEP, false);
  const iptBytes = ipt ? await ipt.arrayBuffer() : null;
  let module: WebAssembly.Module;
  try {
    module = await engineModule();
  } catch {
    throw new EngineError(MSG_FAILED, true);
  }
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  workersMade++;
  const id = nextId++;
  return new Promise<Analysis>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (fn: () => void) => {
      clearTimeout(timer);
      worker.terminate(); // everything the engine made goes with it
      fn();
    };
    worker.onerror = () => done(() => reject(new EngineError(MSG_FAILED, true)));
    worker.onmessage = (event: MessageEvent) => {
      const m = event.data;
      if (m.type === "ready") {
        timer = setTimeout(() => done(() => reject(new EngineError(MSG_TOO_LONG, true))), timeLimitS() * 1000);
        return;
      }
      if (m.id !== id) return;
      if (m.ok) {
        const extra = import.meta.env.VITE_TEST === "1" ? { worker: workersMade } : {}; // test build only (J4)
        done(() => resolve({ ...m.analysis, ...extra }));
      } else {
        done(() => reject(new EngineError(m.message, m.retry)));
      }
    };
    const transfer: Transferable[] = [step];
    if (iptBytes) transfer.push(iptBytes);
    worker.postMessage({ id, module, step, name: file.name, process, material,
      ipt: iptBytes && ipt ? { bytes: iptBytes, name: ipt.name } : undefined }, transfer);
  });
}
