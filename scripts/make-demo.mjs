// Build the view-only demo page (D-009): the browser copy's page in one HTML file, with the test parts analysed in
// advance by the browser engine. Node 22, no dependencies; replaces scripts/make_demo.py (its `--engine browser` path).
//
//   node scripts/make-demo.mjs [out.html] [--no-build]     (npm run demo)
//
// out.html defaults to web/dist-demo/demo.html. Unless --no-build, it first runs `npm --prefix web run build:pages -- --demo`
// (the browser copy's page answered through fetch, into web/dist-demo/; web/dist-pages answers in a worker, so it
// has nothing to fetch). The answers come from `npm --prefix web run demo-results` (web/src/engine/demo-results.test.ts,
// the browser engine in Node). A row of part buttons stands in for the file picker (Morgan uses a phone, D-009) and
// `fetch("/api/analyze")` is answered from those results, one per part, process and material. Nothing is sent anywhere.
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ap242Files } from "./unpack-nist.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROCESSES = ["mill", "turn"];
const MATERIALS = ["al6061", "steel1018", "ss304", "plastic"]; // web/src/engine/settings.ts
const PARTS = "tests/parts", SET3 = "tests/grading/sets/hole_ends_walls";
const DEMO = [ // [file, what Morgan looks for, the process a tap picks: turning parts open on Turning]
  [`${PARTS}/report_sample.step`, "Review steps S1: the overview, then walk Part · Features · Machining · Cost · Report"],
  [`${PARTS}/slender_shaft.step`, "S6: opens on Turning; switch to Milling to compare", "turn"],
  [`${PARTS}/flange_bolt_hole.step`, "S6 (Turning): off-centre bolt hole", "turn"],
  [`${PARTS}/stout_shaft.step`, "S6 (Turning): length 5× diameter", "turn"],
  [`${PARTS}/shaft_with_groove_and_bore.step`, "S6 (Turning): grooves and a bore", "turn"],
  [`${PARTS}/clean_shaft.step`, "S6 (Turning): clean", "turn"],
  [`${PARTS}/block_as_turn.step`, "S6 (Turning): no turning axis", "turn"],
  [`${PARTS}/two_sided_block.step`, "S5: 3 setups, 3 tool loads"],
  [`${PARTS}/angled_hole.step`, "S5: access finding, 4/5-axis"],
  [`${PARTS}/angled_hole_in_pocket.step`, "S5: angled hole in a pocket floor"],
  [`${PARTS}/clean_one_setup.step`, "S5: 1 setup"],
  [`${PARTS}/rotated_block.step`, "S5: modelled 30° off the axes"],
  [`${PARTS}/countersunk_hole.step`, "S5: drill, then countersink"],
  [`${SET3}/cs_mixed.step`, "set 3: two countersink angles"],
  [`${SET3}/sx_bottom_20.step`, "set 3: sloped exit"],
  [`${SET3}/hw_top.step`, "set 3: thin wall near the top"],
  [`${PARTS}/deep_hole.step`, "S2: deep hole"],
  [`${PARTS}/pocket_long_thin_tool.step`, "S3: pocket"],
  [`${PARTS}/thin_floor.step`, "S4: thin floor"],
];
const INV = "tests/inventor/files";
// I1 S1: NIST pairs the app refuses (step stem, .ipt, what Morgan looks for)
const PAIRS = [
  ["nist_ctc_04_asme1_ap242", "INV_nist_ctc_04_asme1_2021.ipt", "I1: NIST CTC 04 + its .ipt, refused (other CAD wrote the STEP)"],
  ["nist_ctc_03_asme1_ap242", "INV_nist_ctc_03_asme1_2021.ipt", "I1: NIST CTC 03 + its .ipt, sheet metal refused"],
];
// I1 S2: NIST pairs lined up by the test harness, so their threads show. Their file names get " (lined up)", so the
// shim's key differs from the refused entry of the same files.
const HARNESS = [
  ["nist_ctc_04_asme1_ap242-e1.stp", "INV_nist_ctc_04_asme1_2021.ipt", "I1 S2 + I2 S1: 4 threads M12x1.75 - 6H, matched; 9 Hole features, 54 holes (13 disagree: NIST's two files differ)"],
  ["nist_stc_10_asme1_ap242-e2.stp", "INV_nist_ftc_10_asme1_2024.ipt", "I1 S2 + I2 S1: 6 threads, one 0.10 mm off its hole (a finding); 9 Hole features, 24 holes"],
];
const LINED_UP = " (lined up)";
const DEMO_LABEL = "NIST pair lined up by the test harness; the app itself refuses this pair"; // web/src/inventor-harness/nistPair.ts
const NOTE = "<b>View-only demo</b> of the test copy that runs in the browser, with these test parts analyzed in advance by "
  + "its own engine. Tap a part (a turning part opens on Turning): it opens on its overview; walk the five "
  + "steps with the tabs, Next and Back. From S7 it runs every check, the .ipt checks too: the first two "
  + ".ipt pairs show its refusals; the two marked \"lined up\" were lined up by the test harness so their "
  + "threads, Hole features and fillets show (the copy itself refuses them). Your files can't be uploaded "
  + "here. Export PDF saves nothing in this viewer, which blocks downloads; it works in the app.";

const args = process.argv.slice(2);
const noBuild = args.includes("--no-build");
const rest = args.filter((a) => a !== "--no-build");
if (rest.some((a) => a.startsWith("--")) || rest.length > 1) {
  console.error("usage: node scripts/make-demo.mjs [out.html] [--no-build]");
  process.exit(2);
}
const dist = join(ROOT, "web", "dist-demo");
const out = resolve(rest[0] ?? join(dist, "demo.html"));
const run = (cmd, argv, env = {}) => {
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" });
  if (r.status !== 0) { console.error(`${cmd} ${argv.join(" ")} failed (${r.status})`); process.exit(1); }
};
const rel = (p) => relative(ROOT, p).split("\\").join("/");

if (!noBuild) run("npm", ["--prefix", "web", "run", "build:pages", "--", "--demo"]);

const nist = ap242Files();
const stepFor = (stem) => nist.find((p) => basename(p).startsWith(stem));
// The transform the Python harness found for a lined-up pair, frozen in the parity key (tests/parity/key).
const keyTransform = (step, ipt) => {
  const f = join(ROOT, "tests", "parity", "key", `${rel(step).split("/").join("__")}+${ipt}+harness.json.gz`);
  const t = JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")).__harness?.transform;
  if (!t) throw new Error(`no harness transform in ${f}`);
  return t;
};

// Every part and .ipt pair, process and material, through the browser engine (demo-results.test.ts).
const every = PROCESSES.flatMap((process) => MATERIALS.map((material) => ({ process, material })));
const jobs = [
  ...DEMO.flatMap(([path]) => every.map((e) => ({ path, ...e }))),
  ...PAIRS.flatMap(([stem, ipt]) => every.map((e) => ({ path: rel(stepFor(stem)), ipt: `${INV}/${ipt}`, ...e }))),
  ...HARNESS.flatMap(([name, ipt]) => {
    const step = stepFor(name);
    const shown = basename(step).replace(/\.stp$/, LINED_UP + ".stp");
    return every.map((e) => ({ path: rel(step), ipt: `${INV}/${ipt}`, shown, transform: keyTransform(step, ipt), ...e }));
  }),
];
const tmp = mkdtempSync(join(tmpdir(), "dfma-demo-"));
let results;
try {
  writeFileSync(join(tmp, "in.json"), JSON.stringify(jobs));
  run("npm", ["--prefix", "web", "run", "demo-results"], { DEMO_IN: join(tmp, "in.json"), DEMO_OUT: join(tmp, "out.json") });
  results = JSON.parse(readFileSync(join(tmp, "out.json"), "utf8"));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
for (const [k, v] of Object.entries(results)) if ("error" in v) results[k] = { __status: 422, ...v }; // a refusal, as the app's 422

const pairs = PAIRS.map(([stem, ipt, what]) => [basename(stepFor(stem)), ipt, what]);
for (const [name, ipt, what] of HARNESS) pairs.push([basename(stepFor(name)).replace(/\.stp$/, LINED_UP + ".stp"), ipt, `${what}. ${DEMO_LABEL}`]);

// Each part's mesh is the same for every process and material: keep one copy and point at it, so the page stays small.
const meshes = {};
for (const [key, hit] of Object.entries(results)) {
  if (Array.isArray(hit.faces)) {
    const part = key.split("|")[0];
    meshes[part] ??= hit.faces;
    if (JSON.stringify(meshes[part]) === JSON.stringify(hit.faces)) results[key] = { ...hit, faces: part };
  }
}

const read = (p) => readFileSync(join(dist, p.replace(/^\/+/, "")));
let html = read("index.html").toString("utf8");
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const css = read(href).toString("utf8").replace(/url\((\/fonts\/[^)]+)\)/g,
    (_f, u) => `url(data:font/woff2;base64,${read(u).toString("base64")})`);
  return `<style>${css}</style>`;
});
const jsTag = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/.exec(html);
if (!jsTag) throw new Error("no module script in web/dist-demo/index.html");
const js = read(jsTag[1]).toString("utf8");
html = html.replace(jsTag[0], "");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const json = (v) => JSON.stringify(v).replace(/</g, "\\u003c"); // never closes the inline <script>
const shim = `
<script>
window.__DEMO = ${json(results)};
window.__MESH = ${json(meshes)};
const realFetch = window.fetch;
window.fetch = async (url, init) => {
  if (String(url).endsWith("/api/analyze")) {
    const b = init.body, ipt = b.get("ipt");
    const key = [b.get("file").name + (ipt ? "+" + ipt.name : ""), b.get("process"), b.get("material")].join("|");
    await new Promise((r) => setTimeout(r, 150));
    let hit = window.__DEMO[key];
    if (hit && typeof hit.faces === "string") hit = {...hit, faces: window.__MESH[hit.faces]};
    const code = !hit ? 422 : (hit.__status || 200);
    return new Response(JSON.stringify(hit || {error: "Not in this demo"}), {status: code});
  }
  return realFetch(url, init);
};
</script>`;
const buttons = pairs.map(([s, i, w]) => `<button type="button" data-name="${esc(s)}" data-ipt="${esc(i)}" data-process="mill" aria-pressed="false">${esc(s.replace(/\.stp$/, ""))} + .ipt<small>${esc(w)}</small></button>`).join("")
  + DEMO.map(([p, w, pr = "mill"]) => `<button type="button" data-name="${basename(p)}" data-process="${pr}" aria-pressed="false">${basename(p).replace(/\.step$/, "")}<small>${esc(w)}</small></button>`).join("");
const picker = `
<div class="demo-bar" role="group" aria-label="Demo parts">
  <p class="demo-note">${NOTE}</p>
  <div class="demo-parts">${buttons}</div>
</div>
<style>
.demo-bar{padding:var(--space-2) var(--space-4);background:var(--panel);border-bottom:1px solid var(--line);display:grid;gap:var(--space-2)}
.demo-note{margin:0;font-size:.875rem;color:var(--muted)}
.demo-parts{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.demo-parts button{font:600 .875rem var(--sans);min-height:32px;padding:4px 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg);color:var(--ink);cursor:pointer;text-align:left}
.demo-parts button[aria-pressed=true]{border-color:var(--accent);outline:2px solid var(--accent)}
.demo-parts small{display:block;font-weight:400;color:var(--muted)}
</style>
<script>
for (const b of document.querySelectorAll(".demo-parts button")) b.addEventListener("click", () => {
  for (const o of document.querySelectorAll(".demo-parts button")) o.setAttribute("aria-pressed", String(o === b));
  document.getElementById("process").value = b.dataset.process; // a turning part opens on Turning
  const input = document.getElementById("file"), dt = new DataTransfer();
  const ipt = document.getElementById("ipt"), dti = new DataTransfer();
  if (b.dataset.ipt) dti.items.add(new File(["demo"], b.dataset.ipt));
  ipt.files = dti.files; // set first, without its own change event: one analysis per tap
  dt.items.add(new File(["demo"], b.dataset.name));
  input.files = dt.files;
  input.dispatchEvent(new Event("change"));
});
</script>`;
html = html.replace("<title>DFMA Review</title>", "<title>DFMA Review Demo</title>");
html = html.replace("<head>", () => "<head>" + shim);
html = html.replace(/(<body[^>]*>)/, (m) => m + picker);
html = html.replace("</body>", () => `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script></body>`);
writeFileSync(out, html);
console.log(`wrote ${out} (${Math.floor(statSync(out).size / 1024)} KB, ${Object.keys(results).length} results)`);
