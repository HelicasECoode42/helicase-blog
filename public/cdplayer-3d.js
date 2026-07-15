// HELICASE CD Player — Three.js 3D transparent deck
// Shared by canvas CDPlayer and /music page.
import * as THREE from '/vendor/three.module.min.js';

export function createCDPlayer(container, options) {
  const { width, height } = Object.assign({ width: 300, height: 200 }, options);

  // ── Scene ───────────────────────────────────
  const scene = new THREE.Scene();

  // ── Camera ──────────────────────────────────
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 20);
  camera.position.set(3.5, 2.2, 5);
  camera.lookAt(0, -0.1, 0);

  // ── Renderer ────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // ── Lighting ────────────────────────────────
  scene.add(new THREE.AmbientLight('#d8dbe0', 1.8));
  const key = new THREE.DirectionalLight('#ffffff', 2.5);
  key.position.set(5, 5, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#334ed5', 0.6);
  fill.position.set(-3, 1, -2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#c8ff00', 0.3);
  rim.position.set(0, -1, 3);
  scene.add(rim);

  // ── Materials ───────────────────────────────
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#e8ecf1',
    metalness: 0.05,
    roughness: 0.15,
    transparent: true,
    opacity: 0.30,
    envMapIntensity: 0.3,
    clearcoat: 0.1,
  });

  const frameMat = new THREE.MeshStandardMaterial({
    color: '#b0b3b8',
    metalness: 0.6,
    roughness: 0.25,
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: '#0a0c12',
    metalness: 0.1,
    roughness: 0.5,
  });

  // ── Body group ──────────────────────────────
  const body = new THREE.Group();

  // Outer shell: transparent cuboid
  const shellGeo = new THREE.BoxGeometry(3.2, 1.0, 2.2);
  const shell = new THREE.Mesh(shellGeo, glassMat);
  body.add(shell);

  // Wireframe edges (blueprint feel)
  const edgesGeo = new THREE.EdgesGeometry(shellGeo);
  const edgesLine = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: '#b0b3b8', transparent: true, opacity: 0.4 }));
  body.add(edgesLine);

  // Frame borders (silver strips along edges)
  function addFrameBorder(w, h, d, x, y, z) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, frameMat);
    m.position.set(x, y, z);
    body.add(m);
  }
  // Horizontal edge strips
  addFrameBorder(3.22, 0.06, 0.06, 0, 0.5, 1.1);
  addFrameBorder(3.22, 0.06, 0.06, 0, -0.5, 1.1);
  addFrameBorder(3.22, 0.06, 0.06, 0, 0.5, -1.1);
  addFrameBorder(3.22, 0.06, 0.06, 0, -0.5, -1.1);
  // Vertical corner strips
  addFrameBorder(0.06, 1.02, 0.06, 1.6, 0, 1.1);
  addFrameBorder(0.06, 1.02, 0.06, -1.6, 0, 1.1);
  addFrameBorder(0.06, 1.02, 0.06, 1.6, 0, -1.1);
  addFrameBorder(0.06, 1.02, 0.06, -1.6, 0, -1.1);

  // ── Interior dark cavity ────────────────────
  const cavityGeo = new THREE.BoxGeometry(2.9, 0.85, 1.9);
  const cavity = new THREE.Mesh(cavityGeo, darkMat);
  cavity.position.z = 0;
  body.add(cavity);

  // ── Disc ────────────────────────────────────
  const discGroup = new THREE.Group();
  discGroup.position.set(0, 0, 1.11); // just behind front glass

  // Disc base (metallic)
  const discBaseGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.04, 64);
  const discBase = new THREE.Mesh(discBaseGeo, new THREE.MeshStandardMaterial({
    color: '#1a1e2e',
    metalness: 0.7,
    roughness: 0.2,
  }));
  discBase.rotation.x = Math.PI / 2;
  discGroup.add(discBase);

  // Album cover layer
  const coverGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.005, 64);
  const coverMat = new THREE.MeshStandardMaterial({
    roughness: 0.4,
    metalness: 0.05,
  });
  const coverMesh = new THREE.Mesh(coverGeo, coverMat);
  coverMesh.rotation.x = Math.PI / 2;
  coverMesh.position.z = 0.022;
  coverMesh.name = 'coverDisc';
  discGroup.add(coverMesh);

  // Spindle
  const spindleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 32);
  const spindle = new THREE.Mesh(spindleGeo, new THREE.MeshStandardMaterial({
    color: '#b0b3b8', metalness: 0.8, roughness: 0.2,
  }));
  spindle.rotation.x = Math.PI / 2;
  spindle.position.z = 0.03;
  discGroup.add(spindle);

  // Disc ring (decorative groove)
  const ringGeo = new THREE.TorusGeometry(0.55, 0.008, 16, 64);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({
    color: '#334ed5', metalness: 0.3, roughness: 0.3, emissive: '#334ed5', emissiveIntensity: 0.15,
  }));
  ring.position.z = 0.024;
  discGroup.add(ring);

  body.add(discGroup);

  // ── Window ring (circular frame on front glass) ──
  const windowRingGeo = new THREE.TorusGeometry(0.68, 0.025, 16, 64);
  const windowRing = new THREE.Mesh(windowRingGeo, frameMat);
  windowRing.position.z = 1.12;
  body.add(windowRing);

  // ── Tonearm (simple stylized) ───────────────
  const armGroup = new THREE.Group();
  armGroup.position.set(1.1, 0.3, 1.1);
  // Base pivot
  const pivotGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.15, 16);
  const pivot = new THREE.Mesh(pivotGeo, frameMat);
  armGroup.add(pivot);
  // Arm beam
  const beamGeo = new THREE.BoxGeometry(0.02, 0.02, 0.55);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshStandardMaterial({ color: '#b0b3b8', metalness: 0.7, roughness: 0.2 }));
  beam.position.set(0, 0.06, -0.25);
  beam.rotation.x = -0.3;
  armGroup.add(beam);
  // Headshell
  const headGeo = new THREE.BoxGeometry(0.04, 0.03, 0.08);
  const head = new THREE.Mesh(headGeo, frameMat);
  head.position.set(0, -0.02, -0.52);
  armGroup.add(head);

  body.add(armGroup);

  scene.add(body);

  // ── Animate ─────────────────────────────────
  let animId;
  let paused = false;
  function animate() {
    animId = requestAnimationFrame(animate);
    if (paused) return;
    discGroup.rotation.z += 0.008; // slow rotation
    renderer.render(scene, camera);
  }
  animate();

  // ── Visibility: pause when off-screen ───────
  if (typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        paused = !entry.isIntersecting;
      }
    }, { threshold: 0.1 });
    io.observe(container);
  }

  // ── Public API ──────────────────────────────
  return {
    setCover(url) {
      const loader = new THREE.TextureLoader();
      loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        coverMat.map = tex;
        coverMat.needsUpdate = true;
      });
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() {
      cancelAnimationFrame(animId);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    }
  };
}
