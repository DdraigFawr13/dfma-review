// UI fixes slice A, the model (spec docs/specs/ui-fixes.md J1-J6 and A7; D-076, D-078): mouse like Inventor with a
// free orbit, view buttons, the part-axes triad, pins hidden while the camera moves, one feature at a time, keys on the
// focused model and on the open row.
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { load, openStep, PARTS, shown } from "./helpers";

type Vec = [number, number, number];
type View = { position: Vec; target: Vec; up: Vec };
type Part = { center: Vec; radius: number; box: [number, number, number, number, number, number] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = any;

const BOX = resolve(PARTS, "box_through_hole.step");
const SAMPLE = resolve(PARTS, "report_sample.step");
const FOV = 35; // the viewer's camera, degrees (viewer.ts)

const sub = (a: number[], b: number[]): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: number[], b: number[]): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: number[], k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: number[]): Vec => mul(a, 1 / len(a));
const deg = (a: number[], b: number[]) => (Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (len(a) * len(b))))) * 180) / Math.PI;

/** The camera's up as the screen shows it: `up` made square to the view direction. */
function screenUp(v: View): Vec {
  const f = unit(sub(v.target, v.position));
  return unit(sub(v.up, mul(f, dot(v.up, f))));
}

/** Where a point lands on the canvas (px from its top-left), for a camera `v` on a canvas w × h. */
function project(v: View, p: number[], w: number, h: number): [number, number] {
  const f = unit(sub(v.target, v.position)), r = unit(cross(f, v.up)), u = cross(r, f);
  const d = sub(p, v.position), z = dot(d, f), t = Math.tan((FOV / 2) * (Math.PI / 180));
  const x = dot(d, r) / (z * t * (w / h)), y = dot(d, u) / (z * t);
  return [((x + 1) / 2) * w, ((1 - y) / 2) * h];
}

/** The ray from the camera through canvas pixel (px, py). */
function rayAt(v: View, px: number, py: number, w: number, h: number): { o: Vec; d: Vec } {
  const f = unit(sub(v.target, v.position)), r = unit(cross(f, v.up)), u = cross(r, f);
  const t = Math.tan((FOV / 2) * (Math.PI / 180));
  const x = ((px / w) * 2 - 1) * t * (w / h), y = (1 - (py / h) * 2) * t;
  return { o: v.position, d: unit(add(add(f, mul(r, x)), mul(u, y))) };
}

/** The nearest hit of a ray on the part's triangles (Möller-Trumbore), or null. */
function hitOf(result: Result, o: Vec, d: Vec): Vec | null {
  let best = Infinity;
  for (const face of result.faces as { positions: number[]; indices: number[] }[]) {
    const P = face.positions, I = face.indices;
    for (let i = 0; i < I.length; i += 3) {
      const a = [P[3 * I[i]], P[3 * I[i] + 1], P[3 * I[i] + 2]], b = [P[3 * I[i + 1]], P[3 * I[i + 1] + 1], P[3 * I[i + 1] + 2]];
      const c = [P[3 * I[i + 2]], P[3 * I[i + 2] + 1], P[3 * I[i + 2] + 2]];
      const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
      if (Math.abs(det) < 1e-12) continue;
      const s = sub(o, a), uu = dot(s, p) / det;
      if (uu < 0 || uu > 1) continue;
      const q = cross(s, e1), vv = dot(d, q) / det;
      if (vv < 0 || uu + vv > 1) continue;
      const tt = dot(e2, q) / det;
      if (tt > 1e-6 && tt < best) best = tt;
    }
  }
  return best === Infinity ? null : add(o, mul(d, best));
}

const view = (page: Page) => page.evaluate(() => window.__dfma.view()) as Promise<View>;
const partOf = (page: Page) => page.evaluate(() => window.__dfma.part()) as Promise<Part>;

async function canvasBox(page: Page) {
  return (await page.getByTestId("viewer-canvas").boundingBox())!;
}

/** A drag of (dx, dy) px in `steps` moves from the canvas centre with `button`, Shift held if asked. */
async function drag(page: Page, button: "left" | "middle" | "right", dx: number, dy: number, shift = false, steps = 8) {
  const box = await canvasBox(page);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down({ button });
  await page.mouse.move(cx + dx, cy + dy, { steps });
  await page.mouse.up({ button });
  if (shift) await page.keyboard.up("Shift");
}

/** Back to the opening view: the Home view the part opened with, by reading the part again. */
async function reopen(page: Page, file: string) {
  await load(page, file);
}

test("test_mouse_like_inventor", async ({ page }) => {
  await reopen(page, BOX);
  const R = (await partOf(page)).radius;
  const rotated = (a: View, b: View) => { // target unchanged, camera moved
    expect(len(sub(b.target, a.target))).toBeLessThan(1e-6 * R);
    expect(len(sub(b.position, a.position))).toBeGreaterThan(1e-3 * R);
  };
  const moved = (a: View, b: View) => { // target and camera moved by the same vector
    const dt = sub(b.target, a.target), dc = sub(b.position, a.position);
    expect(len(dt)).toBeGreaterThan(1e-3 * R);
    expect(len(sub(dt, dc))).toBeLessThan(1e-6 * R);
  };
  const cases: [string, "left" | "middle" | "right", boolean, (a: View, b: View) => void][] = [
    ["left-drag rotates", "left", false, rotated],
    ["Shift + left-drag moves", "left", true, moved],
    ["middle-drag moves", "middle", false, moved],
    ["Shift + middle-drag rotates", "middle", true, rotated],
    ["right-drag moves", "right", false, moved],
  ];
  for (const [name, button, shift, check] of cases) {
    await test.step(name, async () => {
      await reopen(page, BOX);
      const a = await view(page);
      await drag(page, button, 120, 0, shift);
      check(a, await view(page));
    });
  }
  await test.step("a horizontal left-drag turns about the screen's up, at the same distance", async () => {
    await reopen(page, BOX);
    const a = await view(page);
    await drag(page, "left", 120, 0);
    const b = await view(page);
    expect(deg(screenUp(a), screenUp(b))).toBeLessThan(1);
    expect(Math.abs(len(sub(b.position, b.target)) - len(sub(a.position, a.target)))).toBeLessThan(1e-6 * R);
    expect(deg(sub(a.position, a.target), sub(b.position, b.target))).toBeGreaterThan(5);
  });
  await test.step("a vertical left-drag of 400 px goes over the top (free orbit)", async () => {
    await reopen(page, BOX);
    const a = await view(page);
    await drag(page, "left", 0, 400, false, 20);
    expect(deg(screenUp(a), screenUp(await view(page)))).toBeGreaterThan(90);
  });
  await test.step("wheel forward zooms in, towards the point under the mouse", async () => {
    await reopen(page, BOX);
    const result = (await page.evaluate(() => window.__dfma.analysis())) as Result;
    const box = await canvasBox(page);
    const mx = box.width / 2 - 150, my = box.height / 2;
    const a = await view(page);
    const hit = hitOf(result, ...Object.values(rayAt(a, mx, my, box.width, box.height)) as [Vec, Vec]);
    expect(hit).not.toBeNull();
    await page.mouse.move(box.x + mx, box.y + my);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);
    const b = await view(page);
    expect(len(sub(b.position, b.target))).toBeLessThan(len(sub(a.position, a.target))); // closer
    // the target moved towards the point under the mouse
    expect(len(sub(b.target, hit!))).toBeLessThan(len(sub(a.target, hit!)) - 1e-3 * R);
    const [px, py] = project(b, hit!, box.width, box.height);
    expect(Math.hypot(px - mx, py - my)).toBeLessThan(4);
  });
});

test("test_middle_click_blocked", async ({ page }) => {
  await reopen(page, BOX);
  const prevented = await page.evaluate(() => {
    const e = new MouseEvent("mousedown", { button: 1, cancelable: true, bubbles: true });
    document.querySelector('[data-testid="viewer-canvas"]')!.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true); // no autoscroll, no paste
});

// Spec A2: direction from the part's centre to the camera, then the screen's up, in file axes.
const VIEWS: [string, Vec, Vec][] = [
  ["home", [1, -1.2, 0.9], [0, 0, 1]],
  ["front", [0, -1, 0], [0, 0, 1]],
  ["top", [0, 0, 1], [0, 1, 0]],
  ["right", [1, 0, 0], [0, 0, 1]],
  ["iso", [1, -1, 1], [0, 0, 1]],
];

test("test_view_buttons", async ({ page }) => {
  await reopen(page, SAMPLE);
  const part = await partOf(page), R = part.radius;
  const opening = await view(page);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  await drag(page, "left", 90, 40); // the views put a turned part back
  for (const [name, direction, up] of VIEWS) {
    await test.step(name, async () => {
      await page.getByTestId(`view-${name}`).click();
      const v = await view(page);
      expect(deg(sub(v.position, v.target), direction)).toBeLessThan(0.1);
      // the screen's up: a point above the target along Up lands straight above it on screen
      const box = await canvasBox(page);
      const [tx, ty] = project(v, v.target, box.width, box.height);
      const [ux, uy] = project(v, add(v.target, mul(unit(up), 0.1 * R)), box.width, box.height);
      expect((Math.atan2(ux - tx, ty - uy) * 180) / Math.PI).toBeCloseTo(0, 1);
      expect(Math.abs((Math.atan2(ux - tx, ty - uy) * 180) / Math.PI)).toBeLessThan(0.1);
      const [x0, y0, z0, x1, y1, z1] = part.box;
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
        const [px, py] = project(v, [x, y, z], box.width, box.height);
        expect(px).toBeGreaterThanOrEqual(0); expect(px).toBeLessThanOrEqual(box.width);
        expect(py).toBeGreaterThanOrEqual(0); expect(py).toBeLessThanOrEqual(box.height);
      }
      expect(await page.evaluate(() => window.__dfma.partMatrix())).toEqual(identity); // views move the camera only
      if (name === "home") {
        for (const k of ["position", "target"] as const) expect(len(sub(v[k], opening[k]))).toBeLessThan(1e-6 * R);
        expect(deg(screenUp(v), screenUp(opening))).toBeLessThan(1e-4);
      }
    });
  }
  await test.step("at 360 px the view buttons and the triad don't overlap (A12)", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    const group = page.locator(".viewfoot").getByRole("group", { name: "Views" }); // moved under the model (A12)
    await expect(group).toBeVisible();
    const g = (await group.boundingBox())!, c = await canvasBox(page);
    const triad = { x: c.x, y: c.y + c.height - 72, width: 72, height: 72 }; // 64 px, 8 px in from the corner
    const apart = g.x >= triad.x + triad.width || triad.x >= g.x + g.width || g.y >= triad.y + triad.height || triad.y >= g.y + g.height;
    expect(apart).toBe(true);
  });
});

test("test_axis_triad", async ({ page }) => {
  await reopen(page, SAMPLE);
  const frame = ((await page.evaluate(() => window.__dfma.analysis())) as Result).part.frame as { x: Vec; y: Vec; z: Vec };
  const expectArrows = async (screen: (a: Vec) => [number, number]) => {
    const arrows = await page.evaluate(() => window.__dfma.triad()) as { axis: "X" | "Y" | "Z"; dx: number; dy: number }[];
    expect(arrows.map((a) => a.axis).sort()).toEqual(["X", "Y", "Z"]);
    let checked = 0;
    for (const a of arrows) {
      const [ex, ey] = screen(frame[a.axis.toLowerCase() as "x" | "y" | "z"]);
      if (Math.hypot(ex, ey) <= 0.2) continue; // pointing at the viewer
      const angle = (Math.acos(Math.min(1, (a.dx * ex + a.dy * ey) / Math.hypot(ex, ey) / Math.hypot(a.dx, a.dy))) * 180) / Math.PI;
      expect(angle, `${a.axis}`).toBeLessThan(2);
      checked++;
    }
    return { arrows, checked };
  };
  await page.getByTestId("view-front").click(); // looking towards +Y, up +Z: (a·X, a·Z)
  const front = await expectArrows((a) => [a[0], a[2]]);
  expect(front.checked).toBeGreaterThanOrEqual(2);
  // report_sample: part x = file −Z, y = file +X, z = file −Y; after Front X points down, Y right, Z is skipped
  const x = front.arrows.find((a) => a.axis === "X")!, y = front.arrows.find((a) => a.axis === "Y")!;
  expect(x.dy).toBeLessThan(-0.99);
  expect(y.dx).toBeGreaterThan(0.99);
  await page.getByTestId("view-top").click(); // looking towards −Z, up +Y: (a·X, a·Y)
  expect((await expectArrows((a) => [a[0], a[1]])).checked).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".stage .triad-caption")).toHaveText("Part axes");
});

/** Pins on report_sample, once placed at rest. */
async function pinsShown(page: Page) {
  await reopen(page, SAMPLE);
  await page.waitForFunction(() => window.__dfma.flagBoxes().length >= 1, undefined, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__dfma.placements())).toBeGreaterThan(0);
}

const moving = (page: Page) => page.evaluate(() => document.querySelector(".stage")?.classList.contains("moving") ?? false);
const pinsHidden = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".stage .flag, .stage .leaders")]
  .every((el) => getComputedStyle(el).visibility === "hidden"));

/** Milliseconds from now until the stage drops `moving`. */
async function msUntilRest(page: Page, limit = 5000): Promise<number> {
  return page.evaluate((limit) => new Promise<number>((done) => {
    const t0 = performance.now();
    const look = () => {
      if (!document.querySelector(".stage")!.classList.contains("moving") || performance.now() - t0 > limit) done(performance.now() - t0);
      else requestAnimationFrame(look);
    };
    look();
  }), limit);
}

test("test_pins_stay_hidden_while_held", { tag: "@timed" }, async ({ page }) => {
  await pinsShown(page);
  await page.getByTestId("view-front").click();
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.__dfma.flagState());
  const box = await canvasBox(page);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 20, { steps: 4 });
  expect(await moving(page)).toBe(true);
  expect(await pinsHidden(page)).toBe(true);
  const placed = await page.evaluate(() => window.__dfma.placements());
  await page.waitForTimeout(400); // the mouse rests mid-drag: still no placement
  expect(await page.evaluate(() => window.__dfma.placements())).toBe(placed);
  expect(await page.evaluate(() => window.__dfma.flagState().some((f) => f.shown))).toBe(false);
  await page.mouse.move(cx, cy, { steps: 4 }); // back to where the drag began: the same view as Front
  expect(await page.evaluate(() => window.__dfma.placements())).toBe(placed);
  await page.mouse.up();
  const t0 = Date.now();
  const ms = await msUntilRest(page);
  const elapsed = Math.max(ms, Date.now() - t0 - 50);
  expect(elapsed).toBeGreaterThanOrEqual(150);
  expect(elapsed).toBeLessThanOrEqual(1500);
  expect(await pinsHidden(page)).toBe(false);
  const after = await page.evaluate(() => window.__dfma.flagState());
  await page.getByTestId("view-front").click(); // the same view again, no move: the same pins
  await page.waitForTimeout(300);
  expect(after).toEqual(await page.evaluate(() => window.__dfma.flagState()));
  expect(after).toEqual(before);
});

test("test_pins_return_after_moving", { tag: "@timed" }, async ({ page }) => {
  await pinsShown(page);
  const box = await canvasBox(page);
  await test.step("a wheel notch hides pins; back within 150-1,500 ms", async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -100);
    const t0 = Date.now();
    expect(await moving(page)).toBe(true);
    const ms = await msUntilRest(page);
    const elapsed = Date.now() - t0;
    expect(ms).toBeGreaterThanOrEqual(100); // the poll starts a little after the notch
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThanOrEqual(1500);
  });
  await test.step("an arrow key on the model hides pins; back within 600-2,000 ms", async () => {
    await page.getByTestId("view-front").click();
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.__dfma.flagState());
    await page.getByTestId("viewer-canvas").focus();
    await page.keyboard.press("ArrowRight");
    const t0 = Date.now();
    expect(await moving(page)).toBe(true);
    await page.keyboard.press("ArrowLeft"); // and back: the Front view again
    const t1 = Date.now();
    await msUntilRest(page);
    expect(Date.now() - t1).toBeGreaterThanOrEqual(600);
    expect(Date.now() - t0).toBeLessThanOrEqual(2000 + (t1 - t0));
    const after = await page.evaluate(() => window.__dfma.flagState());
    await page.getByTestId("view-front").click();
    await page.waitForTimeout(300);
    expect(after).toEqual(await page.evaluate(() => window.__dfma.flagState()));
    expect(after).toEqual(before);
  });
  await test.step("a view button, a row pick or a setup chip never hides pins and places them once", async () => {
    const once = async (act: () => Promise<void>) => {
      await page.waitForTimeout(300);
      const n = await page.evaluate(() => window.__dfma.placements());
      await act();
      expect(await moving(page)).toBe(false);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.__dfma.placements())).toBe(n + 1);
    };
    await once(() => page.getByTestId("view-iso").click());
    await openStep(page, "features");
    await once(() => page.getByTestId("row-F1").click());
    await openStep(page, "machining");
    await once(() => page.getByTestId("setup-chip-1").click());
  });
});

test("test_one_feature_at_a_time", async ({ page }) => {
  await reopen(page, SAMPLE);
  await shown(page, "report_sample.step");
  const result = (await page.evaluate(() => window.__dfma.analysis())) as Result;
  const R = (await partOf(page)).radius;
  const css = (name: string) => page.evaluate((n) => {
    const probe = document.createElement("i");
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    document.body.append(probe);
    const [r, g, b] = getComputedStyle(probe).color.match(/\d+/g)!.map(Number);
    probe.remove();
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }, name);
  const part = await css("--part"), accent = await css("--accent");
  const finding = (id: string) => result.findings.find((f: Result) => f.id === id);
  const lit = async (id: string) => { // only `id` lights; everything else is plain grey and faded
    const faces = await page.evaluate(() => window.__dfma.faceColours());
    const bars = await page.evaluate(() => window.__dfma.barColours());
    const opacity = (await page.evaluate(() => window.__dfma.opacities())) as Record<number, number>;
    const walls = new Set<number>(finding(id).faces);
    for (const [fid, colour] of Object.entries(faces)) {
      expect(colour, `face ${fid}`).toBe(part);
      expect(opacity[Number(fid)], `face ${fid}`).toBe(walls.has(Number(fid)) ? 1 : 0.35);
    }
    for (const [bid, bar] of Object.entries(bars)) {
      expect(bar, `bar ${bid}`).toEqual(bid === id ? { colour: accent, opacity: 1 } : { colour: part, opacity: 0.35 });
    }
  };
  const row = page.getByTestId("row-F4");
  await row.click();
  await expect(page.getByTestId("row-detail")).toContainText("1 of 4");
  await lit("F4");
  await page.getByTestId("row-next").click();
  await expect(page.getByTestId("row-detail")).toContainText("F5 · corner-2 · 2 of 4");
  await lit("F5");
  const edge = result.features.find((x: Result) => x.id === finding("F5").feature).edge_mm as number[][];
  const mid = mul(add(edge[0], edge[1]), 0.5);
  expect(len(sub(await page.evaluate(() => window.__dfma.cameraTarget()), mid))).toBeLessThan(1e-6 * R);
  await row.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("row-detail")).toContainText("F6 · corner-3 · 3 of 4");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("row-detail")).toContainText("F5 · corner-2 · 2 of 4");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("row-detail")).toContainText("F4 · corner-1 · 1 of 4");
  await lit("F4");
  // a row of holes lights the shown hole only
  await page.getByTestId("row-F1").click();
  const sortNum = (a: number[]) => [...a].sort((x, y) => x - y);
  expect(sortNum(await page.evaluate(() => window.__dfma.highlightedFaces()))).toEqual(sortNum(finding("F1").faces));
  const faces = await page.evaluate(() => window.__dfma.faceColours());
  for (const [fid, colour] of Object.entries(faces)) expect(colour).toBe(finding("F1").faces.includes(Number(fid)) ? accent : part);
});

test("test_model_keys", async ({ page }) => {
  await reopen(page, BOX);
  const R = (await partOf(page)).radius;
  const canvas = page.getByTestId("viewer-canvas");
  for (let i = 0; i < 60 && !(await canvas.evaluate((c) => c === document.activeElement)); i++) await page.keyboard.press("Tab");
  expect(await canvas.evaluate((c) => c === document.activeElement)).toBe(true);
  expect(await canvas.evaluate((c) => getComputedStyle(c).outlineWidth)).toBe("3px");
  expect(await canvas.evaluate((c) => getComputedStyle(c).outlineOffset)).toBe("-3px");
  const scroll = () => page.evaluate(() => [window.scrollY, document.querySelector(".side")!.scrollTop]);
  const scrolled = await scroll();
  const press = async (key: string) => { const a = await view(page); await page.keyboard.press(key); return [a, await view(page)] as const; };
  const offset = (v: View) => sub(v.position, v.target);
  const right = (v: View) => unit(cross(unit(sub(v.target, v.position)), screenUp(v)));
  for (const key of ["ArrowLeft", "ArrowRight"]) { // a turn of 10° about the screen's up, through the target
    const [a, b] = await press(key);
    expect(len(sub(b.target, a.target))).toBeLessThan(1e-6 * R);
    expect(deg(offset(a), offset(b))).toBeCloseTo(10, 3);
    expect(Math.abs(dot(offset(b), screenUp(a)) - dot(offset(a), screenUp(a)))).toBeLessThan(1e-6 * R);
    expect(deg(screenUp(a), screenUp(b))).toBeLessThan(1e-3);
    // the camera goes the arrow's way (builder default, spec S1): ← left, → right
    expect(Math.sign(dot(sub(b.position, a.position), right(a)))).toBe(key === "ArrowLeft" ? -1 : 1);
  }
  for (const key of ["ArrowUp", "ArrowDown"]) { // a tilt of 10° about the screen's horizontal axis
    const [a, b] = await press(key);
    expect(len(sub(b.target, a.target))).toBeLessThan(1e-6 * R);
    expect(deg(offset(a), offset(b))).toBeCloseTo(10, 3);
    expect(deg(screenUp(a), screenUp(b))).toBeCloseTo(10, 3);
    // ↑ the camera goes up over the part, ↓ down
    expect(Math.sign(dot(sub(b.position, a.position), screenUp(a)))).toBe(key === "ArrowUp" ? 1 : -1);
  }
  // Shift + arrows move camera and target together by 10% of the view height, the arrow's way on screen (A6)
  for (const [key, along, sign] of [["Shift+ArrowLeft", right, -1], ["Shift+ArrowRight", right, 1],
    ["Shift+ArrowUp", screenUp, 1], ["Shift+ArrowDown", screenUp, -1]] as const) {
    const [a, b] = await press(key);
    const height = 2 * len(offset(a)) * Math.tan((FOV / 2) * (Math.PI / 180));
    const step = sub(b.target, a.target);
    expect(len(sub(step, sub(b.position, a.position)))).toBeLessThan(1e-6 * R);
    expect(len(step) / height).toBeCloseTo(0.1, 6);
    expect(dot(step, along(a)) / len(step)).toBeCloseTo(sign, 6);
  }
  for (const [key, k] of [["+", 1 / 1.25], ["=", 1 / 1.25], ["NumpadAdd", 1 / 1.25], ["-", 1.25], ["NumpadSubtract", 1.25]] as const) {
    const [a, b] = await press(key);
    expect(len(sub(b.target, a.target))).toBeLessThan(1e-6 * R);
    expect(len(offset(b)) / len(offset(a))).toBeCloseTo(k, 6);
  }
  await page.keyboard.press("h");
  await page.waitForTimeout(100);
  expect(await moving(page)).toBe(false); // H is the Home view, not a move
  const home = await view(page);
  await page.getByTestId("view-home").click();
  const button = await view(page);
  for (const k of ["position", "target"] as const) expect(len(sub(home[k], button[k]))).toBeLessThan(1e-6 * R);
  expect(await scroll()).toEqual(scrolled); // the page does not scroll
});

test("test_row_arrow_keys", async ({ page }) => {
  await reopen(page, SAMPLE);
  await shown(page, "report_sample.step");
  const row = page.getByTestId("row-F4");
  await row.click();
  const detail = page.getByTestId("row-detail");
  await row.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect(detail).toContainText("4 of 4");
  await page.keyboard.press("ArrowRight"); // stays at the last
  await expect(detail).toContainText("4 of 4");
  await page.keyboard.press("ArrowLeft");
  await expect(detail).toContainText("3 of 4");
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.testid)).toBe("row-F4");
});
