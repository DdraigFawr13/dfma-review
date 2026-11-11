// Reach spike: the tool list and the cell-size rules, shared by time-node.mjs and time-browser.mjs.
export const TOOLS_IN = [0.03125, 0.0625, 0.09375, 0.125, 0.1875, 0.25, 0.375, 0.5, 0.625, 0.75, 1.0]; // config/tools.toml

export function cellRule(rule, soup) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.length; i++) { const k = i % 3; if (soup[i] < lo[k]) lo[k] = soup[i]; if (soup[i] > hi[k]) hi[k] = soup[i]; }
  const s = hi.map((h, k) => h - lo[k]).sort((a, b) => b - a), area = s[0] * s[1]; // the largest of the six maps
  const [kind, a, b] = rule.split(":");
  if (kind === "one") return () => Number(a);
  const floorCell = Math.sqrt(area / (Number(b) * 1e6));
  return (d) => Math.max(d / Number(a), floorCell);
}
