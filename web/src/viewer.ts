// three.js viewer: shows the part's faces and orbits. S2: faces with a finding are drawn in their
// severity colour with a pin ("F1"; D-017: on the feature, merged when pins overlap); selecting a finding turns its faces the accent colour,
// fades the rest (opacity 0.35) and frames the camera on them (spec "Web page", D-012).

import { sevMark, sevWord } from "./words";
import * as THREE from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls.js";
import type { Face, Finding } from "./api";

const GHOST_OPACITY = 0.35;
const PIN_REST_MS = 150; // pins come back this long after the last mouse or wheel move (UI fixes A4, D-076)
const KEY_REST_MS = 600; // ... and after the last key: longer than a key's repeat delay (about 500 ms)
const TRIAD_COLOURS = ["#c62828", "#2e7d32", "#1565c0"]; // X, Y, Z (UI fixes A3)

/** The view buttons (UI fixes A2, D-078): direction from the part's centre to the camera, and the screen's up, in file axes. */
export const VIEWS = {
  home: { direction: [1, -1.2, 0.9], up: [0, 0, 1] },
  front: { direction: [0, -1, 0], up: [0, 0, 1] },
  top: { direction: [0, 0, 1], up: [0, 1, 0] },
  right: { direction: [1, 0, 0], up: [0, 0, 1] },
  iso: { direction: [1, -1, 1], up: [0, 0, 1] },
} as const;
export type ViewName = keyof typeof VIEWS;

/** A letter for the triad, drawn bold in the ink colour on a canvas texture. */
function letter(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#16263d";
  g.font = "bold 48px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 32, 34);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sprite.scale.set(0.42, 0.42, 1);
  return sprite;
}

const MIN_FRAME = 0.4; // a selected finding is framed at no less than this share of the part's size (S3)

/** Feature kinds the legend can tint when checked with no finding (D-014), and their tokens. */
export type CheckedKind = "hole" | "pocket" | "corner" | "wall";
const CHECKED_TOKEN: Record<CheckedKind, string> = {
  hole: "--low", pocket: "--ok-pocket", corner: "--ok-corner", wall: "--ok-wall",
};

function token(name: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(value || "#888888");
}

/** How far a finding's visible spots spread on screen (the diagonal of their box, px); 0 for none. */
function spread(spots: { x: number; y: number }[]): number {
  if (!spots.length) return 0;
  const xs = spots.map((p) => p.x), ys = spots.map((p) => p.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** A pin's box grown down to the dot on its spot (`dotX`, `dotY` in page coordinates): what it covers on screen,
 *  stem included (audit F27: a stem and dot drawn over another pin hid it). */
function footprint(r: DOMRect, dotX: number, dotY: number): DOMRect {
  const left = Math.min(r.left, dotX - 6), right = Math.max(r.right, dotX + 6);
  return new DOMRect(left, r.top, right - left, Math.max(r.bottom, dotY + 6) - r.top);
}

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** What can be selected: a finding, a passed feature or a setup (D-023 proposed): an id and its faces. */
export type Selection = Pick<Finding, "id" | "faces">;

export class Viewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
  private readonly controls: ArcballControls;
  private readonly part = new THREE.Group();
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly flags: { el: HTMLElement; points: THREE.Vector3[]; finding: Finding }[] = [];
  private pinned: { el: HTMLElement; at: { x: number; y: number } }[] = []; // the pins shown and their spots (host coordinates)
  private findings: Finding[] = [];
  private readonly edges = new Map<string, THREE.Mesh>(); // finding id -> its sharp-corner edge, drawn as a bar
  private readonly edgeMaterial = new THREE.LineBasicMaterial({ color: token("--ink") }); // one for every part
  private edgeLines: THREE.LineSegments | null = null; // every face's edges, in one object
  private checked = new Map<number, CheckedKind>(); // faces of features checked with no finding
  private readonly showChecked: Record<CheckedKind, boolean> = { hole: false, pocket: false, corner: false, wall: false };
  private okStep = false; // review-steps S2: OK tints only while the Features step shows
  private selected: Selection | null = null;
  private frame = 0;
  // UI fixes A4: while the camera moves, pins are hidden and not placed
  private moving = false;
  private settling = false; // the next frame places pins and ends `moving`
  private held = false; // a press or touch the controls are following
  private restTimer = 0;
  private placed = 0; // placeFlags() runs since page load, for the test hook
  // UI fixes A3: the part-axes triad, drawn in the canvas's bottom-left corner
  private readonly triadScene = new THREE.Scene();
  private readonly triadCamera = new THREE.OrthographicCamera(-1.55, 1.55, 1.55, -1.55, 0.1, 10);
  private readonly triadAxes: THREE.Vector3[] = [];
  private triadOff = false; // snapshot() draws its picture without the triad (A13)
  private readonly small = window.matchMedia("(max-width: 500px)");

  constructor(private readonly canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer: the canvas can be read back (tests now, the PDF in S7).
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Port J3: skip three's synchronous shader error checks (they wait for each compile; about 150 ms measured).
    this.renderer.debug.checkShaderErrors = false;
    // Pins are measured to place them: when the pins' font arrives after the first placement their boxes change size,
    // so place them again (audit F27: a stem and dot ended up over a neighbour's pin).
    document.fonts?.addEventListener?.("loadingdone", () => this.render());
    this.scene.background = token("--view");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(1, 1.5, 2);
    this.camera.add(key); // the light follows the camera so every side reads
    this.scene.add(this.camera, this.part);
    this.camera.position.set(0, 0, 100);

    // UI fixes A1 (D-078): free rotation like Inventor's free orbit. No scene: no gizmos, no double-click focus.
    this.controls = new ArcballControls(this.camera, canvas, null);
    this.controls.setGizmosVisible(false);
    this.controls.enableAnimations = false;
    this.controls.enableGrid = false;
    this.controls.enableFocus = false;
    this.controls.cursorZoom = true; // zoom to the mouse
    this.controls.adjustNearFar = true;
    this.controls.setMouseAction("ROTATE", 0);
    this.controls.setMouseAction("ROTATE", 1, "SHIFT");
    this.controls.setMouseAction("PAN", 1);
    this.controls.setMouseAction("PAN", 0, "SHIFT");
    this.controls.setMouseAction("PAN", 2);
    this.controls.setMouseAction("ZOOM", "WHEEL");
    this.controls.unsetMouseAction("WHEEL", "SHIFT"); // no field-of-view change
    this.controls.unsetMouseAction(0, "CTRL");
    this.controls.addEventListener("start", () => { this.held = true; this.startMoving(); });
    this.controls.addEventListener("end", () => { this.held = false; this.restIn(PIN_REST_MS); });
    // three 0.187's ArcballControls sends no `end` on a cancelled pointer (a touch taken by the system): end the move here
    canvas.addEventListener("pointercancel", () => { if (this.held) { this.held = false; this.restIn(PIN_REST_MS); } });
    canvas.addEventListener("keydown", (e) => this.onKey(e));
    this.controls.addEventListener("change", () => {
      // three 0.187 turns camera.up as if it were in the camera's own axes; keep it the screen's up instead
      this.camera.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.render();
    });
    // Middle-click: no autoscroll, no paste over the model
    const noMiddle = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    canvas.addEventListener("mousedown", noMiddle);
    canvas.addEventListener("auxclick", noMiddle);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  /** Show a part. keepView keeps the camera (the same part re-analysed with another material). */
  show(faces: Face[], keepView = false): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.part.remove(mesh);
    }
    this.meshes.clear();
    if (this.edgeLines) {
      this.edgeLines.geometry.dispose();
      this.part.remove(this.edgeLines);
      this.edgeLines = null;
    }
    const edgeParts: ArrayLike<number>[] = [];
    for (const face of faces) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(face.positions, 3));
      geometry.setIndex(face.indices);
      if (face.view) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(face.view.normals, 3));
      else geometry.computeVertexNormals();
      // polygonOffset pushes faces back a little so their edge lines are never hidden by them.
      const material = new THREE.MeshStandardMaterial({ metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.faceId = face.id;
      // Edge lines: from the worker in the browser copy (worker.ts faceView), else worked out here
      edgeParts.push(face.view ? face.view.edges : new THREE.EdgesGeometry(geometry, 30).getAttribute("position").array);
      this.part.add(mesh);
      this.meshes.set(face.id, mesh);
    }
    // Every face's edge lines in one object: one draw instead of one per face (port J3: a 635-face part drew 1,270
    // objects in the frame that showed it). They share one material, so nothing changes on screen.
    const total = edgeParts.reduce((n, e) => n + e.length, 0);
    if (total) {
      const all = new Float32Array(total);
      let at = 0;
      for (const e of edgeParts) { all.set(e, at); at += e.length; }
      this.edgeLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(all, 3)), this.edgeMaterial);
      this.part.add(this.edgeLines);
    }
    this.findings = [];
    this.clearEdges();
    for (const f of this.flags) f.el.remove(); // a failed upload calls show([]) with no setFindings
    this.leaders?.replaceChildren();
    this.flags.length = 0;
    this.checked = new Map();
    this.selected = null;
    this.paint();
    if (!keepView || faces.length === 0) this.fit();
    else this.render();
  }

  /** Colour faces by their findings' severity and place a flag per finding. A finding with an edge
   *  (a sharp inside corner, which has no face of its own) is drawn as a bar along that edge instead
   *  of colouring the two walls that meet there. */
  setFindings(findings: Finding[], edges: Map<string, number[][]> = new Map()): void {
    this.findings = findings;
    this.clearEdges();
    const size = new THREE.Box3().setFromObject(this.part).getSize(new THREE.Vector3()).length();
    for (const [id, [a, b]] of edges) {
      const p = new THREE.Vector3(...a), q = new THREE.Vector3(...b);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12),
        new THREE.MeshStandardMaterial({ metalness: 0.1, roughness: 0.6 }));
      const r = Math.max(size * 0.004, 0.2);
      bar.scale.set(r, p.distanceTo(q), r);
      bar.position.copy(p).add(q).multiplyScalar(0.5);
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize());
      bar.userData.points = [p, q];
      this.scene.add(bar);
      this.edges.set(id, bar);
    }
    for (const f of this.flags) f.el.remove();
    this.flags.length = 0;
    const host = this.canvas.parentElement;
    for (const finding of findings) {
      const bar = this.edges.get(finding.id);
      const points = bar ? (bar.userData.points as THREE.Vector3[]) : this.pointsOf(finding.faces);
      if (!host || points.length === 0) continue;
      const el = document.createElement("span");
      el.className = "flag";
      el.dataset.id = finding.id;
      el.style.setProperty("--sev", `var(--${finding.severity})`);
      el.setAttribute("aria-hidden", "true"); // the findings list carries the same text
      el.dataset.sev = finding.severity;
      const mark = document.createElement("span"); // ▲ or ◆ on every pin, not only the ring's colour (D-053, audit F26)
      mark.className = "mk";
      mark.textContent = sevMark(finding.severity);
      const id = document.createElement("span");
      id.textContent = finding.id;
      const sev = document.createElement("span");
      sev.className = `sev ${finding.severity}`;
      sev.textContent = sevWord(finding.severity); // "F4 FIX" on the selected pin (D-042)
      el.append(mark, id, sev);
      host.append(el);
      this.flags.push({ el, points, finding });
    }
    this.paint();
    this.render();
  }

  /** Faces of the features that were checked and passed, by kind, for the legend's switches.
   *  A face in two features (a corner fillet is also a pocket wall) takes the later kind. */
  setChecked(faces: Map<number, CheckedKind>): void {
    this.checked = faces;
    this.paint();
    this.render();
  }

  setShowChecked(kind: CheckedKind, on: boolean): void {
    this.showChecked[kind] = on;
    this.paint();
    this.render();
  }

  /** Whether the Features step shows, the only step with OK tints (review-steps J3). */
  setOkStep(on: boolean): void {
    if (this.okStep === on) return;
    this.okStep = on;
    this.paint();
    this.render();
  }

  /** Faces drawn in a kind's "checked" colour, read from the materials themselves. */
  checkedFaces(kind: CheckedKind = "hole"): number[] {
    const colour = token(CHECKED_TOKEN[kind]);
    return [...this.meshes].filter(([, m]) => (m.material as THREE.MeshStandardMaterial).color.equals(colour))
      .map(([id]) => id).sort((a, b) => a - b);
  }

  /** Select a finding (or clear with null): accent on its faces, the rest faded, camera framed.
   *  frame = false keeps the camera (restoring a selection after the material changes). */
  select(finding: Selection | null, frame = true): void {
    this.selected = finding;
    this.paint();
    if (finding && frame) this.frameFaces(finding.faces, this.edges.get(finding.id));
    else this.render();
  }

  /** A picture of the canvas with `finding` selected and framed, for the PDF report (S7); the selection and
   *  camera the reader had come back afterwards. JPEG: the view background is opaque. */
  snapshot(finding: Selection | null): { url: string; width: number; height: number; spot: [number, number] | null } {
    const keep = { selected: this.selected, position: this.camera.position.clone(), target: this.pivot(), up: this.camera.up.clone(),
                   near: this.camera.near, far: this.camera.far };
    this.selected = finding;
    this.paint();
    if (finding) this.frameFaces(finding.faces, this.edges.get(finding.id));
    this.triadOff = true; // the PDF picture has no triad (A13)
    this.renderer.render(this.scene, this.camera); // now: the queued frame would come after the read
    this.triadOff = false;
    const url = this.canvas.toDataURL("image/jpeg", 0.85);
    // Where the finding's centre lands in the picture (0-1 across, 0-1 down), for the report's ring (D-017's pin)
    let spot: [number, number] | null = null;
    if (finding) {
      const bar = this.edges.get(finding.id);
      const box = bar ? new THREE.Box3().setFromObject(bar) : this.boxOf(finding.faces);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3()).project(this.camera);
        spot = [(c.x + 1) / 2, (1 - c.y) / 2];
      }
    }
    this.selected = keep.selected;
    this.camera.position.copy(keep.position);
    this.camera.up.copy(keep.up);
    this.camera.near = keep.near; // framing moves the clip planes with the camera: put the reader's back
    this.camera.far = keep.far;
    this.camera.updateProjectionMatrix();
    this.setView(keep.target);
    this.paint();
    this.render();
    return { url, width: this.canvas.width, height: this.canvas.height, spot };
  }

  /** The faces drawn in the accent colour, read from the materials themselves. */
  paintedFaces(): number[] {
    const accent = token("--accent");
    return [...this.meshes].filter(([, m]) => (m.material as THREE.MeshStandardMaterial).color.equals(accent))
      .map(([id]) => id).sort((a, b) => a - b);
  }

  /** Opacity of each face, for the fade check. */
  opacities(): Record<number, number> {
    return Object.fromEntries([...this.meshes].map(([id, m]) => [id, (m.material as THREE.Material).opacity]));
  }

  highlightedFaces(): number[] {
    return this.selected ? [...this.selected.faces].sort((a, b) => a - b) : [];
  }

  cameraTarget(): [number, number, number] {
    const t = this.pivot();
    return [t.x, t.y, t.z];
  }

  /** The camera and the point it turns about, in file axes (UI fixes A10). */
  view(): { position: [number, number, number]; target: [number, number, number]; up: [number, number, number] } {
    const v = (p: THREE.Vector3): [number, number, number] => [p.x, p.y, p.z];
    return { position: v(this.camera.position), target: v(this.pivot()), up: v(this.camera.up) };
  }

  /** The part's bounding sphere and box (UI fixes A10). */
  partBounds(): { center: [number, number, number]; radius: number; box: [number, number, number, number, number, number] } {
    const box = new THREE.Box3().setFromObject(this.part);
    const s = box.getBoundingSphere(new THREE.Sphere());
    return { center: [s.center.x, s.center.y, s.center.z], radius: s.radius,
      box: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z] };
  }

  /** The part group's world matrix (16 numbers): views move the camera, never the part (A2). */
  partMatrix(): number[] {
    this.part.updateMatrixWorld();
    return [...this.part.matrixWorld.elements];
  }

  /** The point the controls turn about. ArcballControls moves its gizmo on a pan or a zoom to the mouse but not its
   *  public `target`, so the pivot is read from the gizmo (three 0.187, ArcballControls.js `_gizmos`). */
  private pivot(): THREE.Vector3 {
    const gizmos = (this.controls as unknown as { _gizmos: THREE.Object3D })._gizmos;
    return gizmos.position.clone();
  }

  /** The camera was moved in code: point it at `target` and let the controls re-read it (A1). */
  private setView(target: THREE.Vector3): void {
    // `target` is in three's ArcballControls.js (0.187) but not in @types/three 0.187
    (this.controls as unknown as { target: THREE.Vector3 }).target.copy(target);
    this.controls.setCamera(this.camera);
    // three 0.187: setCamera() moves the gizmo to the target but leaves its matrix stale, which the next pan or zoom
    // starts from (with no scene nothing else updates it): the pivot jumped to the old spot (measured in the A1 probe).
    (this.controls as unknown as { _gizmos: THREE.Object3D })._gizmos.updateMatrix();
  }

  private paint(): void {
    const part = token("--part");
    const accent = token("--accent");
    const severity = new Map<number, string>();
    const rank = { high: 3, medium: 2, low: 1 } as const;
    for (const f of this.findings) {
      if (this.edges.has(f.id)) continue; // drawn as its edge bar, not by its walls
      for (const id of f.faces) {
        const prev = severity.get(id) as keyof typeof rank | undefined;
        if (!prev || rank[f.severity] > rank[prev]) severity.set(id, f.severity);
      }
    }
    // UI fixes A5 (D-076): while anything is selected, everything not chosen is plain grey: no severity or OK colour
    const any = this.selected !== null;
    const selectedBar = this.selected ? this.edges.get(this.selected.id) : undefined;
    const chosen = new Set(selectedBar ? [] : this.selected?.faces ?? []);
    const kept = new Set(selectedBar ? this.selected?.faces ?? [] : []); // a sharp corner's walls stay solid
    for (const [id, bar] of this.edges) {
      const f = this.findings.find((x) => x.id === id);
      const material = bar.material as THREE.MeshStandardMaterial;
      const on = this.selected?.id === id;
      material.color.copy(on ? accent : any ? part : token(`--${f?.severity ?? "high"}`));
      const ghost = any && !on; // fades with the rest of the part
      material.transparent = ghost;
      material.opacity = ghost ? GHOST_OPACITY : 1;
      material.needsUpdate = true;
    }
    for (const [id, mesh] of this.meshes) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const sev = severity.get(id);
      const kind = this.checked.get(id);
      const ok = kind !== undefined && this.showChecked[kind] && this.okStep;
      material.color.copy(chosen.has(id) ? accent : any ? part : sev ? token(`--${sev}`) : ok ? token(CHECKED_TOKEN[kind]) : part);
      const ghost = any && !chosen.has(id) && !kept.has(id);
      material.transparent = ghost;
      material.opacity = ghost ? GHOST_OPACITY : 1;
      material.depthWrite = !ghost;
      material.needsUpdate = true;
    }
  }

  /** Each face's colour as drawn, lower-case #rrggbb (UI fixes A10). */
  faceColours(): Record<number, string> {
    return Object.fromEntries([...this.meshes].map(([id, m]) => [id, `#${(m.material as THREE.MeshStandardMaterial).color.getHexString()}`]));
  }

  /** Each sharp-corner bar's colour and opacity, by finding id (UI fixes A10). */
  barColours(): Record<string, { colour: string; opacity: number }> {
    return Object.fromEntries([...this.edges].map(([id, bar]) => {
      const m = bar.material as THREE.MeshStandardMaterial;
      return [id, { colour: `#${m.color.getHexString()}`, opacity: m.opacity }];
    }));
  }

  /** How many times pins were placed since the page loaded (UI fixes A4). */
  placements(): number {
    return this.placed;
  }

  /** The renderer's state after a frame or a snapshot (UI fixes A13). */
  renderState(): { autoClear: boolean; scissorTest: boolean } {
    return { autoClear: this.renderer.autoClear, scissorTest: this.renderer.getScissorTest() };
  }

  /** The part's own axes (part.frame, in file coordinates) for the triad; null draws none (UI fixes A3). */
  setFrame(frame: { x: number[]; y: number[]; z: number[] } | null): void {
    for (const child of [...this.triadScene.children]) {
      this.triadScene.remove(child);
      child.traverse((o) => {
        const any = o as THREE.Mesh;
        any.geometry?.dispose();
        const m = any.material as THREE.Material | undefined;
        (m as THREE.SpriteMaterial | undefined)?.map?.dispose();
        m?.dispose();
      });
    }
    this.triadAxes.length = 0;
    if (frame) {
      [frame.x, frame.y, frame.z].forEach((a, i) => {
        const dir = new THREE.Vector3(a[0], a[1], a[2]).normalize();
        this.triadAxes.push(dir);
        this.triadScene.add(new THREE.ArrowHelper(dir, new THREE.Vector3(), 1, TRIAD_COLOURS[i], 0.28, 0.16));
        const label = letter("XYZ"[i]);
        label.position.copy(dir).multiplyScalar(1.32);
        this.triadScene.add(label);
      });
    }
    this.render();
  }

  /** Each triad arrow's direction on screen, a unit vector with y up (UI fixes A3); (0, 0) for one pointing at the viewer. */
  triad(): { axis: "X" | "Y" | "Z"; dx: number; dy: number }[] {
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    return this.triadAxes.map((a, i) => {
      const dx = a.dot(right), dy = a.dot(up), n = Math.hypot(dx, dy);
      return { axis: "XYZ"[i] as "X" | "Y" | "Z", dx: n > 1e-9 ? dx / n : 0, dy: n > 1e-9 ? dy / n : 0 };
    });
  }

  /** Show the part from one of the view buttons' directions (UI fixes A2): the whole part, at once. */
  showView(name: ViewName): void {
    const box = new THREE.Box3().setFromObject(this.part);
    if (box.isEmpty()) return;
    const v = VIEWS[name];
    this.place(box.getBoundingSphere(new THREE.Sphere()), new THREE.Vector3(...v.direction).normalize(), new THREE.Vector3(...v.up));
  }

  // --- UI fixes A4: pins while the camera moves ---

  private startMoving(): void {
    clearTimeout(this.restTimer);
    this.settling = false;
    if (this.moving) return;
    this.moving = true;
    this.canvas.parentElement?.classList.add("moving");
  }

  /** Pins come back `ms` after the last move: the next frame places them, and only then shows them. */
  private restIn(ms: number): void {
    clearTimeout(this.restTimer);
    if (!this.moving) return;
    this.restTimer = window.setTimeout(() => { this.settling = true; this.render(); }, ms);
  }

  /** A move made in code (a view, a pick, Home) while moving: pins come back with this frame. */
  private settleNow(): void {
    if (!this.moving || this.held) return; // mid-drag (H pressed, a re-analysis): the release brings pins back
    clearTimeout(this.restTimer);
    this.settling = true;
  }

  // --- UI fixes A6: keys on the focused model ---

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey || this.meshes.size === 0) return; // no part: nothing to turn
    const target = this.pivot();
    const offset = this.camera.position.clone().sub(target);
    const forward = offset.clone().negate().normalize();
    const up = this.camera.up.clone().sub(forward.clone().multiplyScalar(this.camera.up.dot(forward))).normalize();
    const right = forward.clone().cross(up).normalize();
    const turn = (axis: THREE.Vector3, deg: number) => {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
      this.camera.position.copy(target).add(offset.applyQuaternion(q));
      this.camera.up.copy(up.applyQuaternion(q));
    };
    const height = 2 * offset.length() * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const shift = (v: THREE.Vector3) => { target.add(v); this.camera.position.add(v); };
    const key = e.key;
    if (key === "h" || key === "H") {
      e.preventDefault();
      this.fit();
      return;
    }
    const arrows: Record<string, THREE.Vector3> = { ArrowLeft: right.clone().negate(), ArrowRight: right, ArrowUp: up, ArrowDown: up.clone().negate() };
    // Builder default (spec S1): the camera goes the arrow's way: ← turns or moves it left, ↑ up over the part
    if (key in arrows) {
      if (e.shiftKey) shift(arrows[key].clone().multiplyScalar(0.1 * height));
      else if (key === "ArrowLeft" || key === "ArrowRight") turn(up.clone(), key === "ArrowLeft" ? -10 : 10);
      else turn(right.clone(), key === "ArrowUp" ? -10 : 10);
    } else if (key === "+" || key === "=" || e.code === "NumpadAdd") {
      this.camera.position.copy(target).addScaledVector(offset, 1 / 1.25);
    } else if (key === "-" || e.code === "NumpadSubtract") {
      this.camera.position.copy(target).addScaledVector(offset, 1.25);
    } else return;
    e.preventDefault();
    this.startMoving();
    this.setView(target);
    if (!this.held) this.restIn(KEY_REST_MS); // while a button is held, its release brings the pins back
    this.render();
  }

  private boxOf(faceIds: number[]): THREE.Box3 {
    const box = new THREE.Box3();
    for (const id of faceIds) {
      const mesh = this.meshes.get(id);
      if (mesh) box.expandByObject(mesh);
    }
    return box;
  }

  /** Up to 200 vertices of the faces; the flag sits at the one nearest the camera (a hole's mouth). */
  private pointsOf(faceIds: number[]): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const id of faceIds) {
      const pos = this.meshes.get(id)?.geometry.getAttribute("position");
      if (!pos) continue;
      const step = Math.max(1, Math.floor(pos.count / 50));
      for (let i = 0; i < pos.count; i += step) out.push(new THREE.Vector3().fromBufferAttribute(pos, i));
    }
    return out.slice(0, 200);
  }

  private frameFaces(faceIds: number[], bar?: THREE.Mesh): void {
    const box = bar ? new THREE.Box3().setFromObject(bar) : this.boxOf(faceIds);
    if (box.isEmpty()) return this.render();
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    // Keep the part around a small face in view: a corner fillet alone fills the screen otherwise.
    const whole = new THREE.Box3().setFromObject(this.part).getBoundingSphere(new THREE.Sphere());
    sphere.radius = Math.max(sphere.radius, whole.radius * MIN_FRAME);
    this.place(sphere, this.viewDirection());
  }

  private clearEdges(): void {
    for (const bar of this.edges.values()) {
      bar.geometry.dispose();
      (bar.material as THREE.Material).dispose();
      this.scene.remove(bar);
    }
    this.edges.clear();
  }

  private fit(): void {
    const box = new THREE.Box3().setFromObject(this.part);
    if (box.isEmpty()) {
      this.render(); // cleared: draw the empty scene
      return;
    }
    this.place(box.getBoundingSphere(new THREE.Sphere()), new THREE.Vector3(1, -1.2, 0.9).normalize(), new THREE.Vector3(0, 0, 1));
  }

  private viewDirection(): THREE.Vector3 {
    return this.camera.position.clone().sub(this.pivot()).normalize();
  }

  private place(sphere: THREE.Sphere, direction: THREE.Vector3, up: THREE.Vector3 = this.camera.up.clone()): void {
    // Fit the narrower of the two view angles, so tall views don't clip the sides. Immediate, no animation.
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const radius = Math.max(sphere.radius, 1);
    const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.15;
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.settleNow(); // a view, a pick or Home while moving: pins come back with this frame (A4)
    this.camera.up.copy(up);
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.setView(sphere.center);
    this.render();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private leaders: SVGSVGElement | null = null;

  /** A finding's spots on screen: of up to 24 of its sampled points, those the camera can see (nothing
   *  nearer on the ray to them), nearest the middle of them first; empty if none is visible. */
  private anchorsOf(points: THREE.Vector3[]): { x: number; y: number }[] {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const left = this.canvas.offsetLeft, top = this.canvas.offsetTop;
    const eye = this.camera.position;
    const ray = new THREE.Raycaster();
    const solid = [...this.meshes.values()].filter((m) => !(m.material as THREE.MeshStandardMaterial).transparent);
    const step = Math.max(1, Math.floor(points.length / 24));
    const seen: { x: number; y: number }[] = [];
    for (let i = 0; i < points.length; i += step) {
      const q = points[i];
      const dir = q.clone().sub(eye);
      const dist = dir.length();
      ray.set(eye, dir.normalize());
      ray.far = dist + 1e-3;
      const hit = ray.intersectObjects(solid, false)[0];
      if (hit && hit.distance < dist - Math.max(dist * 1e-4, 0.05)) continue; // behind the part
      const p = q.clone().project(this.camera);
      if (p.z >= 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
      seen.push({ x: left + ((p.x + 1) / 2) * w, y: top + ((1 - p.y) / 2) * h });
    }
    if (seen.length === 0) return [];
    const cx = seen.reduce((a, s) => a + s.x, 0) / seen.length, cy = seen.reduce((a, s) => a + s.y, 0) / seen.length;
    return seen.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  }

  /** The leader layer over the canvas, emptied. */
  private leaderLayer(): SVGSVGElement {
    if (!this.leaders) {
      this.leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.leaders.setAttribute("class", "leaders");
      this.leaders.setAttribute("aria-hidden", "true");
      this.canvas.parentElement?.append(this.leaders);
    }
    const c = this.canvas;
    Object.assign(this.leaders.style, { left: `${c.offsetLeft}px`, top: `${c.offsetTop}px`, width: `${c.clientWidth}px`, height: `${c.clientHeight}px` });
    this.leaders.replaceChildren();
    return this.leaders;
  }

  /** A stem from (x1, y1) to a dot at (x2, y2), in host coordinates. */
  private stem(svg: SVGSVGElement, x1: number, y1: number, x2: number, y2: number, colour: string): void {
    const ns = "http://www.w3.org/2000/svg";
    const ox = this.canvas.offsetLeft, oy = this.canvas.offsetTop;
    const line = document.createElementNS(ns, "line");
    const dot = document.createElementNS(ns, "circle");
    const set = (el: Element, attrs: Record<string, string | number>) => Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    set(line, { x1: x1 - ox, y1: y1 - oy, x2: x2 - ox, y2: y2 - oy, stroke: colour, "stroke-width": 2.5 });
    set(dot, { cx: x2 - ox, cy: y2 - oy, r: 5, fill: colour, stroke: "#ffffff", "stroke-width": 2 });
    svg.append(line, dot);
  }

  /** Pins (D-017, D-027): each finding's pin sits on a visible spot of its faces. The selected finding's pin
   *  is placed first, solid in its severity colour, larger, with its severity word, raised on a stem to a dot
   *  on its spot; then the findings whose visible spots spread least on screen (a hole before the whole outside of a shaft).
   *  A pin tries its spots nearest its middle first and takes the first that covers no pin already placed
   *  (D-027: so a part-wide pin no longer hides a small feature); only when every spot is covered does it
   *  fold into the pin there ("F4 +2"). A pin whose spots are all behind the part is hidden. */
  private placeFlags(): void {
    const svg = this.leaderLayer();
    const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const STEM = 26, LIFT = 22; // D-029: every pin stands above its spot, so the feature under it stays visible
    const spots = new Map(this.flags.map((f) => [f, f.points.length ? this.anchorsOf(f.points) : []]));
    const order = this.flags.map((f, i) => ({ f, i })).sort((a, b) =>
      Number(this.selected?.id === b.f.finding.id) - Number(this.selected?.id === a.f.finding.id)
      || spread(spots.get(a.f)!) - spread(spots.get(b.f)!) || a.i - b.i).map((x) => x.f);
    const placed: { r: DOMRect; el: HTMLElement; more: number; at: { x: number; y: number }; sev: string }[] = [];
    const host = this.canvas.parentElement?.getBoundingClientRect();
    const foot = (r: DOMRect, at: { x: number; y: number }) => footprint(r, (host?.left ?? 0) + at.x, (host?.top ?? 0) + at.y);
    const clash = (o: { r: DOMRect; at: { x: number; y: number } }, r: DOMRect, at: { x: number; y: number }) =>
      overlaps(foot(o.r, o.at), foot(r, at));
    for (const flag of order) {
      const { el, finding } = flag;
      el.dataset.more = "";
      el.dataset.mergedInto = "";
      const mine = spots.get(flag)!;
      const on = this.selected?.id === finding.id;
      el.classList.toggle("chosen", on);
      el.hidden = mine.length === 0;
      if (!mine.length) continue;
      const put = (p: { x: number; y: number }): DOMRect => {
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y - (on ? STEM : LIFT)}px`;
        el.style.transform = "translate(-50%, -100%)";
        return el.getBoundingClientRect();
      };
      let at = mine[0];
      let r = put(at);
      for (const p of mine) { // the first spot that covers no placed pin or stem (D-027, audit F27)
        const tried = put(p);
        if (!placed.some((o) => clash(o, tried, p))) { at = p; r = tried; break; }
      }
      if (placed.some((o) => clash(o, r, at))) r = put(at); // none free: back to its middle, and fold
      const near = placed.find((o) => clash(o, r, at));
      if (near) { // fold into the pin already there
        el.hidden = true;
        el.dataset.mergedInto = near.el.dataset.id ?? "";
        near.more += 1;
        near.el.dataset.more = `+${near.more}`;
        continue;
      }
      placed.push({ r, el, more: 0, at, sev: finding.severity });
    }
    // A "+n" makes a pin wider after it was placed: fold any pin it now covers, until none overlap.
    for (let changed = true, round = 0; changed && round < 20; round++) {
      changed = false;
      for (let i = 0; i < placed.length && !changed; i++) {
        placed[i].r = placed[i].el.getBoundingClientRect();
        for (let j = i + 1; j < placed.length; j++) {
          const later = placed[j];
          later.r = later.el.getBoundingClientRect();
          if (!clash(placed[i], later.r, later.at) || later.el.classList.contains("chosen")) continue;
          later.el.hidden = true;
          later.el.dataset.mergedInto = placed[i].el.dataset.id ?? "";
          for (const f of this.flags) if (f.el.dataset.mergedInto === later.el.dataset.id) f.el.dataset.mergedInto = placed[i].el.dataset.id ?? "";
          placed[i].more += 1 + later.more;
          placed[i].el.dataset.more = `+${placed[i].more}`;
          placed.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
    this.pinned = placed.map(({ el, at }) => ({ el, at }));
    // A stem from each pin shown down to a dot on its spot, in its severity colour (D-029).
    if (host) for (const p of placed) {
      const r = p.el.getBoundingClientRect();
      this.stem(svg, r.left - host.left + r.width / 2, r.bottom - host.top, p.at.x, p.at.y, css(`--${p.sev}`));
    }
  }

  /** Where each finding's pin went: shown, folded into another pin, or hidden behind the part. */
  flagState(): { id: string; shown: boolean; mergedInto: string }[] {
    return this.flags.map(({ el, finding }) => ({ id: finding.id, shown: !el.hidden && !this.moving, mergedInto: el.dataset.mergedInto ?? "" }));
  }

  /** Each visible pin's box with its stem and dot, for the overlap test (audit F27). */
  pinFootprints(): { id: string; x: number; y: number; w: number; h: number }[] {
    if (this.moving) return [];
    const host = this.canvas.parentElement?.getBoundingClientRect();
    return this.pinned.filter((p) => !p.el.hidden).map(({ el, at }) => {
      const f = footprint(el.getBoundingClientRect(), (host?.left ?? 0) + at.x, (host?.top ?? 0) + at.y);
      return { id: el.dataset.id ?? "", x: f.x, y: f.y, w: f.width, h: f.height };
    });
  }

  /** Screen boxes of the visible flags, for the overlap test. */
  flagBoxes(): { id: string; x: number; y: number; w: number; h: number }[] {
    if (this.moving) return [];
    return this.flags.filter((f) => !f.el.hidden).map(({ el, finding }) => {
      const r = el.getBoundingClientRect();
      return { id: finding.id, x: r.x, y: r.y, w: r.width, h: r.height };
    });
  }

  /** The triad pass (A3, A13): a square in the bottom-left corner, then the renderer as it was. */
  private drawTriad(): void {
    if (this.triadOff || !this.triadAxes.length || !this.meshes.size) return;
    // 8 px in from the left; from the bottom 8 px at 500 px and below, else 24 px so the "Part axes" caption fits under it
    const size = this.small.matches ? 64 : 96, inset = 8, lift = this.small.matches ? 8 : 24;
    const full = this.renderer.getSize(new THREE.Vector2());
    const back = this.camera.position.clone().sub(this.pivot()).normalize();
    this.triadCamera.position.copy(back).multiplyScalar(3);
    this.triadCamera.up.copy(this.camera.up);
    this.triadCamera.lookAt(0, 0, 0);
    this.renderer.autoClear = false;
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(inset, lift, size, size);
    this.renderer.setViewport(inset, lift, size, size);
    this.renderer.clearDepth();
    this.renderer.render(this.triadScene, this.triadCamera);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, full.x, full.y);
    this.renderer.autoClear = true;
  }

  private render(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.renderer.render(this.scene, this.camera);
      this.drawTriad();
      if (this.moving && !this.settling) return; // pins wait until the camera rests (A4)
      this.placeFlags();
      this.placed++;
      if (this.moving) { // only now, so pins never flash at their old spots
        this.moving = this.settling = false;
        this.canvas.parentElement?.classList.remove("moving");
      }
    });
  }
}
