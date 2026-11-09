// three.js viewer: shows the part's faces and orbits. S2: faces with a finding are drawn in their
// severity colour with a pin ("F1"; D-017: on the feature, merged when pins overlap); selecting a finding turns its faces the accent colour,
// fades the rest (opacity 0.35) and frames the camera on them (spec "Web page", D-012).

import { sevMark, sevWord } from "./words";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Face, Finding } from "./api";

const GHOST_OPACITY = 0.35;
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
  private readonly controls: OrbitControls;
  private readonly part = new THREE.Group();
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly flags: { el: HTMLElement; points: THREE.Vector3[]; finding: Finding }[] = [];
  private pinned: { el: HTMLElement; at: { x: number; y: number } }[] = []; // the pins shown and their spots (host coordinates)
  private findings: Finding[] = [];
  private readonly edges = new Map<string, THREE.Mesh>(); // finding id -> its sharp-corner edge, drawn as a bar
  private readonly edgeMaterial = new THREE.LineBasicMaterial({ color: token("--ink") }); // one for every part
  private checked = new Map<number, CheckedKind>(); // faces of features checked with no finding
  private readonly showChecked: Record<CheckedKind, boolean> = { hole: false, pocket: false, corner: false, wall: false };
  private okStep = false; // review-steps S2: OK tints only while the Features step shows
  private selected: Selection | null = null;
  private frame = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer: the canvas can be read back (tests now, the PDF in S7).
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => this.render());
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  /** Show a part. keepView keeps the camera (the same part re-analysed with another material). */
  show(faces: Face[], keepView = false): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      for (const child of mesh.children) (child as THREE.LineSegments).geometry.dispose();
      this.part.remove(mesh);
    }
    this.meshes.clear();
    for (const face of faces) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(face.positions, 3));
      geometry.setIndex(face.indices);
      geometry.computeVertexNormals();
      // polygonOffset pushes faces back a little so their edge lines are never hidden by them.
      const material = new THREE.MeshStandardMaterial({ metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.faceId = face.id;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), this.edgeMaterial));
      this.part.add(mesh);
      this.meshes.set(face.id, mesh);
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
    const keep = { selected: this.selected, position: this.camera.position.clone(), target: this.controls.target.clone(),
                   near: this.camera.near, far: this.camera.far };
    this.selected = finding;
    this.paint();
    if (finding) this.frameFaces(finding.faces, this.edges.get(finding.id));
    this.renderer.render(this.scene, this.camera); // now: the queued frame would come after the read
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
    this.camera.near = keep.near; // framing moves the clip planes with the camera: put the reader's back
    this.camera.far = keep.far;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(keep.target);
    this.controls.update();
    // update() rebuilds the position from angles and re-clamps the target about its cursor, which can round both:
    // put the reader's own back exactly
    this.camera.position.copy(keep.position);
    this.controls.target.copy(keep.target);
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
    const t = this.controls.target;
    return [t.x, t.y, t.z];
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
    const selectedBar = this.selected ? this.edges.get(this.selected.id) : undefined;
    const chosen = new Set(selectedBar ? [] : this.selected?.faces ?? []);
    const kept = new Set(selectedBar ? this.selected?.faces ?? [] : []); // a sharp corner's walls stay solid
    for (const [id, bar] of this.edges) {
      const f = this.findings.find((x) => x.id === id);
      const material = bar.material as THREE.MeshStandardMaterial;
      material.color.copy(this.selected?.id === id ? accent : token(`--${f?.severity ?? "high"}`));
      const ghost = this.selected !== null && this.selected.id !== id; // fades with the rest of the part
      material.transparent = ghost;
      material.opacity = ghost ? GHOST_OPACITY : 1;
      material.needsUpdate = true;
    }
    for (const [id, mesh] of this.meshes) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const sev = severity.get(id);
      const kind = this.checked.get(id);
      const ok = kind !== undefined && this.showChecked[kind] && this.okStep;
      material.color.copy(chosen.has(id) ? accent : sev ? token(`--${sev}`) : ok ? token(CHECKED_TOKEN[kind]) : part);
      const ghost = this.selected !== null && !chosen.has(id) && !kept.has(id);
      material.transparent = ghost;
      material.opacity = ghost ? GHOST_OPACITY : 1;
      material.depthWrite = !ghost;
      material.needsUpdate = true;
    }

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
    this.place(box.getBoundingSphere(new THREE.Sphere()), new THREE.Vector3(1, -1.2, 0.9).normalize());
  }

  private viewDirection(): THREE.Vector3 {
    return this.camera.position.clone().sub(this.controls.target).normalize();
  }

  private place(sphere: THREE.Sphere, direction: THREE.Vector3): void {
    // Fit the narrower of the two view angles, so tall views don't clip the sides. Immediate, no animation.
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const radius = Math.max(sphere.radius, 1);
    const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.15;
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.camera.up.set(0, 0, 1);
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(sphere.center);
    this.controls.update();
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
    return this.flags.map(({ el, finding }) => ({ id: finding.id, shown: !el.hidden, mergedInto: el.dataset.mergedInto ?? "" }));
  }

  /** Each visible pin's box with its stem and dot, for the overlap test (audit F27). */
  pinFootprints(): { id: string; x: number; y: number; w: number; h: number }[] {
    const host = this.canvas.parentElement?.getBoundingClientRect();
    return this.pinned.filter((p) => !p.el.hidden).map(({ el, at }) => {
      const f = footprint(el.getBoundingClientRect(), (host?.left ?? 0) + at.x, (host?.top ?? 0) + at.y);
      return { id: el.dataset.id ?? "", x: f.x, y: f.y, w: f.width, h: f.height };
    });
  }

  /** Screen boxes of the visible flags, for the overlap test. */
  flagBoxes(): { id: string; x: number; y: number; w: number; h: number }[] {
    return this.flags.filter((f) => !f.el.hidden).map(({ el, finding }) => {
      const r = el.getBoundingClientRect();
      return { id: finding.id, x: r.x, y: r.y, w: r.width, h: r.height };
    });
  }

  private render(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.renderer.render(this.scene, this.camera);
      this.placeFlags();
    });
  }
}
