// three.js viewer: shows the part's faces and orbits. S2 adds highlight and framing.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Face } from "./api";

export class Viewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
  private readonly controls: OrbitControls;
  private readonly part = new THREE.Group();
  private frame = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer: the canvas can be read back (tests now, the PDF in S7).
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0xf4f5f7);
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

  show(faces: Face[]): void {
    for (const child of [...this.part.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.part.remove(mesh);
    }
    const material = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.1, roughness: 0.6 });
    for (const face of faces) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(face.positions, 3));
      geometry.setIndex(face.indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.faceId = face.id;
      this.part.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30),
        new THREE.LineBasicMaterial({ color: 0x3b4150 }));
      mesh.add(edges);
    }
    this.fit();
  }

  private fit(): void {
    const box = new THREE.Box3().setFromObject(this.part);
    if (box.isEmpty()) {
      this.render(); // cleared: draw the empty scene
      return;
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    // Fit the narrower of the two view angles, so tall phone views don't clip the sides.
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const distance = (sphere.radius / Math.sin(Math.min(vertical, horizontal))) * 1.15;
    const direction = new THREE.Vector3(1, -1.2, 0.9).normalize();
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

  private render(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.renderer.render(this.scene, this.camera));
  }
}
