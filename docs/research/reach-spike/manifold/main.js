// Scratch probe: load Manifold the way the app would (a dynamic import, only when reach needs it), time it.
window.loadManifold = async () => {
  const t0 = performance.now();
  const { default: Module } = await import("manifold-3d");
  const t1 = performance.now();
  const wasm = await Module();
  wasm.setup();
  const t2 = performance.now();
  const cube = wasm.Manifold.cube([10, 10, 10]);
  const vol = cube.volume();
  return { import_ms: t1 - t0, instantiate_ms: t2 - t1, total_ms: t2 - t0, cube_volume: vol };
};
