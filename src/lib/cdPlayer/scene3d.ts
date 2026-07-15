// HELICASE — Three.js CD Player Scene Builder
// Creates a transparent CD deck with rotating disc.
import * as THREE from 'three';

export interface CDPlayerOptions {
  width: number;
  height: number;
  coverUrl?: string;
}

export interface CDPlayerAPI {
  setCover(url: string): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

export function createCDPlayer(container: HTMLElement, opts: CDPlayerOptions): CDPlayerAPI {
  const { width, height, coverUrl } = Object.assign({ width: 300, height: 200, coverUrl: '' }, opts);

  // ── Scene / Camera / Renderer ──────────────
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 20);
  camera.position.set(3.5, 2.2, 5);
  camera.lookAt(0, -0.1, 0);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // ── Lighting ───────────────────────────────
  scene.add(new THREE.AmbientLight('#d8dbe0', 1.8));
  const key = new THREE.DirectionalLight('#ffffff', 2.5);
  key.position.set(5, 5, 5); scene.add(key);
  const fill = new THREE.DirectionalLight('#334ed5', 0.6);
  fill.position.set(-3, 1, -2); scene.add(fill);
  const rim = new THREE.DirectionalLight('#c8ff00', 0.3);
  rim.position.set(0, -1, 3); scene.add(rim);

  // ── Materials ──────────────────────────────
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#e8ecf1', metalness: 0.05, roughness: 0.15,
    transparent: true, opacity: 0.30, clearcoat: 0.1,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: '#b0b3b8', metalness: 0.6, roughness: 0.25,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: '#0a0c12', metalness: 0.1, roughness: 0.5,
  });

  // ── Body group ─────────────────────────────
  const body = new THREE.Group();

  // Outer shell
  const shellGeo = new THREE.BoxGeometry(3.2, 1.0, 2.2);
  body.add(new THREE.Mesh(shellGeo, glassMat));

  // Wireframe edges
  const edges = new THREE.EdgesGeometry(shellGeo);
  body.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#b0b3b8', transparent: true, opacity: 0.4 })));

  // Frame strips
  function strip(w: number, h: number, d: number, x: number, y: number, z: number) {
    body.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat)).position.set(x, y, z);
  }
  // Horizontal edges
  strip(3.22, 0.06, 0.06, 0, 0.5, 1.1); strip(3.22, 0.06, 0.06, 0, -0.5, 1.1);
  strip(3.22, 0.06, 0.06, 0, 0.5, -1.1); strip(3.22, 0.06, 0.06, 0, -0.5, -1.1);
  // Vertical corners
  strip(0.06, 1.02, 0.06, 1.6, 0, 1.1); strip(0.06, 1.02, 0.06, -1.6, 0, 1.1);
  strip(0.06, 1.02, 0.06, 1.6, 0, -1.1); strip(0.06, 1.02, 0.06, -1.6, 0, -1.1);

  // Interior cavity
  const cavity = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.85, 1.9), darkMat);
  body.add(cavity);

  // ── Disc ───────────────────────────────────
  const discGroup = new THREE.Group();
  discGroup.position.set(0, 0, 1.11);

  const discBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.04, 64),
    new THREE.MeshStandardMaterial({ color: '#1a1e2e', metalness: 0.7, roughness: 0.2 })
  );
  discBase.rotation.x = Math.PI / 2;
  discGroup.add(discBase);

  const coverMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 });
  const coverMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.005, 64), coverMat);
  coverMesh.rotation.x = Math.PI / 2;
  coverMesh.position.z = 0.022;
  coverMesh.name = 'coverDisc';
  discGroup.add(coverMesh);

  // Spindle
  discGroup.add(new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.06, 32),
    new THREE.MeshStandardMaterial({ color: '#b0b3b8', metalness: 0.8, roughness: 0.2 })
  )).rotation.x = Math.PI / 2; discGroup.children[discGroup.children.length - 1].position.z = 0.03;

  // Decorative ring
  discGroup.add(new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.008, 16, 64),
    new THREE.MeshStandardMaterial({ color: '#334ed5', metalness: 0.3, roughness: 0.3, emissive: '#334ed5', emissiveIntensity: 0.15 })
  )).position.z = 0.024;

  body.add(discGroup);

  // Window ring
  body.add(new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.025, 16, 64), frameMat)).position.z = 1.12;

  // ── Tonearm ────────────────────────────────
  const armG = new THREE.Group();
  armG.position.set(1.1, 0.3, 1.1);
  armG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.15, 16), frameMat));
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.55), new THREE.MeshStandardMaterial({ color: '#b0b3b8', metalness: 0.7, roughness: 0.2 }));
  beam.position.set(0, 0.06, -0.25); beam.rotation.x = -0.3;
  armG.add(beam);
  armG.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.08), frameMat)).position.set(0, -0.02, -0.52);
  body.add(armG);

  scene.add(body);

  // ── Load initial cover ─────────────────────
  const texLoader = new THREE.TextureLoader();
  if (coverUrl) {
    texLoader.load(coverUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      coverMat.map = tex;
      coverMat.needsUpdate = true;
    });
  }

  // ── Animation loop ─────────────────────────
  let animId: number;
  function animate() {
    animId = requestAnimationFrame(animate);
    discGroup.rotation.z += 0.008;
    renderer.render(scene, camera);
  }
  animate();

  // ── Public API ─────────────────────────────
  return {
    setCover(url: string) {
      texLoader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        coverMat.map = tex;
        coverMat.needsUpdate = true;
      });
    },
    resize(w: number, h: number) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    destroy() {
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };
}
