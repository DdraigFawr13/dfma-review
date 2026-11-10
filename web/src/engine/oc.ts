// Loads the engine: @taucad/opencascade.js 3.0.0-beta.3 (OpenCascade V8_0_0; D-054, port spec Design "Engine loading").
// The page compiles the wasm once and hands each worker the WebAssembly.Module; the worker instantiates it through
// the loader's `instantiateWasm` option. In Node (tests, demo results) the loader reads the .wasm by its path.
import init from "@taucad/opencascade.js";

// The engine's own typings are large; the port uses it untyped, as the Python code uses pythonocc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OC = any;

export interface Loaded {
  oc: OC;
  memory: () => number; // the byteLength of the wasm memory the instance exports (J4)
}

export interface LoadOptions {
  module?: WebAssembly.Module; // compiled once by the page (browser)
  wasmPath?: string; // a file path to the .wasm (Node)
  wasmUrl?: string; // a URL to the .wasm (browser, when no module is given)
}

export async function loadOc(opts: LoadOptions = {}): Promise<Loaded> {
  let mem: WebAssembly.Memory | null = null;
  const keep = (instance: WebAssembly.Instance) => {
    mem = (Object.values(instance.exports).find((v) => v instanceof WebAssembly.Memory) as WebAssembly.Memory) ?? null;
  };
  const args: Record<string, unknown> = {};
  if (opts.module) {
    const module = opts.module;
    args.instantiateWasm = (imports: WebAssembly.Imports, receive: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) => {
      WebAssembly.instantiate(module, imports).then((instance) => {
        keep(instance);
        receive(instance, module);
      });
      return {};
    };
  } else {
    const where = opts.wasmPath ?? opts.wasmUrl;
    if (where) args.locateFile = () => where;
    // Keep the instance's memory when the loader instantiates the wasm itself.
    const original = WebAssembly.instantiate;
    const wrapped = (async (...a: Parameters<typeof WebAssembly.instantiate>) => {
      const r = (await (original as (...b: unknown[]) => Promise<unknown>)(...a)) as { instance?: WebAssembly.Instance } | WebAssembly.Instance;
      keep("instance" in r && r.instance ? r.instance : (r as WebAssembly.Instance));
      return r;
    }) as typeof WebAssembly.instantiate;
    WebAssembly.instantiate = wrapped;
    try {
      const oc = await (init as (o: unknown) => Promise<OC>)(args);
      return { oc, memory: () => (mem ? (mem as WebAssembly.Memory).buffer.byteLength : 0) };
    } finally {
      WebAssembly.instantiate = original;
    }
  }
  const oc = await (init as (o: unknown) => Promise<OC>)(args);
  return { oc, memory: () => (mem ? (mem as WebAssembly.Memory).buffer.byteLength : 0) };
}
