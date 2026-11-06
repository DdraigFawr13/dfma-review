// three.js viewer: shows the part's faces and orbits. S2: faces with a finding are drawn in their
// severity colour with an "F1 MEDIUM" flag; selecting a finding turns its faces the accent colour,
// fades the rest (opacity 0.35) and frames the camera on them (spec "Web page", D-012).

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Face, Finding } from "./api";

const GHOST_OPACITY = 0.35;

function token(name: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(value || "#888888");
}

export class Viewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
  private readonly controls: OrbitControls;
  private readonly part = new THREE.Group();
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly flags: { el: HTMLElement; points: THREE.Vector3[] }[] = [];
  private findings: Finding[] = [];
  private selected: Finding | null = null;
  private frame = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer: the canvas can be read back (tests now, the PDF in S7).
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    const edgeMaterial = new THREE.LineBasicMaterial({ color: token("--ink") });
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
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeMaterial));
      this.part.add(mesh);
      this.meshes.set(face.id, mesh);
    }
    this.findings = [];
    this.selected = null;
    this.paint();
    if (!keepView || faces.length === 0) this.fit();
    else this.render();
  }

  /** Colour faces by their findings' severity and place a flag per finding. */
  setFindings(findings: Finding[]): void {
    this.findings = findings;
    for (const f of this.flags) f.el.remove();
    this.flags.length = 0;
    const host = this.canvas.parentElement;
    for (const finding of findings) {
      const points = this.pointsOf(finding.faces);
      if (!host || points.length === 0) continue;
      const el = document.createElement("span");
      el.className = "flag";
      el.setAttribute("aria-hidden", "true"); // the findings list carries the same text
      const id = document.createElement("span");
      id.textContent = finding.id;
      const sev = document.createElement("span");
      sev.className = `sev ${finding.severity}`;
      sev.textContent = finding.severity;
      el.append(id, sev);
      host.append(el);
      this.flags.push({ el, points });
    }
    this.paint();
    this.render();
  }

  /** Select a finding (or clear with null): accent on its faces, the rest faded, camera framed. */
  select(finding: Finding | null): void {
    this.selected = finding;
    this.paint();
    if (finding) this.frameFaces(finding.faces);
    else this.render();
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
      for (const id of f.faces) {
        const prev = severity.get(id) as keyof typeof rank | undefined;
        if (!prev || rank[f.severity] > rank[prev]) severity.set(id, f.severity);
      }
    }
    const chosen = new Set(this.selected?.faces ?? []);
    for (const [id, mesh] of this.meshes) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const sev = severity.get(id);
      material.color.copy(chosen.has(id) ? accent : sev ? token(`--${sev}`) : part);
      const ghost = this.selected !== null && !chosen.has(id);
      material.transparent = ghost;
      material.opacity = ghost ? GHOST_OPACITY : 1;
      material.depthWrite = !ghost;
      material.needsUpdate = true;
    }
    this.flags.forEach((flag, i) => {
      const finding = this.findings[i];
      const on = this.selected?.id === finding?.id;
      flag.el.style.borderColor = getComputedStyle(document.documentElement)
        .getPropertyValue(on ? "--accent" : `--${finding?.severity ?? "line"}`).trim();
    });
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

  private frameFaces(faceIds: number[]): void {
    const box = this.boxOf(faceIds);
    if (box.isEmpty()) return this.render();
    this.place(box.getBoundingSphere(new THREE.Sphere()), this.viewDirection());
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

  private placeFlags(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const left = this.canvas.offsetLeft;
    const top = this.canvas.offsetTop;
    const eye = this.camera.position;
    for (const { el, points } of this.flags) {
      const at = points.reduce((best, q) => (q.distanceToSquared(eye) < best.distanceToSquared(eye) ? q : best));
      const p = at.clone().project(this.camera);
      const visible = p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
      el.hidden = !visible;
      el.style.left = `${left + ((p.x + 1) / 2) * w}px`;
      el.style.top = `${top + ((1 - p.y) / 2) * h}px`;
    }
  }

  private render(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.renderer.render(this.scene, this.camera);
      this.placeFlags();
    });
  }
}
