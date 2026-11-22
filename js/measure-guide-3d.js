/* ============================================================
   BerryStudio 3D Interactive Measurement Teaching Studio
   Renders the real sculpted 3D mannequin with oriented centimeter-graduated
   tailor tapes, animated wrap tracers, named anatomical pins, horizontal level
   rings, auto-focus camera choreography, and an expandable Studio Modal.
   Shared by js/measure-form.js across both Measures pane and BodyForm.
   ============================================================ */

import { buildHumanMannequin } from "./human-mannequin.js";
import { MEAS_GUIDE_KEYS, MEAS_GUIDE_SPECS, buildMeasurementPaths } from "./measure-guide-data.js";

const THREE_VERSION = "0.185.1";
const DEP_TIERS = [
  { base: null, controls: "three/addons/controls/OrbitControls.js" },
  {
    base: `https://unpkg.com/three@${THREE_VERSION}/build/three.module.js`,
    controls: `https://unpkg.com/three@${THREE_VERSION}/examples/jsm/controls/OrbitControls.js`,
  },
  {
    base: `https://esm.sh/three@${THREE_VERSION}`,
    controls: `https://esm.sh/three@${THREE_VERSION}/examples/jsm/controls/OrbitControls.js`,
  },
];

let cachedDeps = null;
let depsPromise = null;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("threeTimeout")), ms)),
  ]);
}

async function loadThreeDeps() {
  if (cachedDeps) return cachedDeps;
  if (depsPromise) return depsPromise;
  depsPromise = (async () => {
    for (const tier of DEP_TIERS) {
      try {
        const [THREE, { OrbitControls }] = await withTimeout(
          Promise.all([
            tier.base ? import(/* @vite-ignore */ tier.base) : import(/* @vite-ignore */ "three"),
            import(/* @vite-ignore */ tier.controls),
          ]),
          8000,
        );
        cachedDeps = { THREE, OrbitControls };
        return cachedDeps;
      } catch {
        /* try next CDN tier */
      }
    }
    depsPromise = null;
    throw new Error("threeLoadFailed");
  })();
  return depsPromise;
}

function createRulerTapeTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  // Warm couture amber-gold tape gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, "#fff2c6");
  grad.addColorStop(0.18, "#f3c75c");
  grad.addColorStop(0.82, "#df9c24");
  grad.addColorStop(1, "#b87412");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 64);

  // Subtle stitched edge border
  ctx.fillStyle = "rgba(84, 48, 8, 0.32)";
  ctx.fillRect(0, 2, 512, 2);
  ctx.fillRect(0, 60, 512, 2);

  // Repeating 10 cm graduation pattern across 512px (51.2px per 1 cm -> 5.12px per 1 mm)
  const ticks = 40;
  const step = 512 / ticks; // 4 ticks per cm cluster (every 2.5mm visual tick)
  for (let i = 0; i < ticks; i++) {
    const x = i * step;
    const isCm = i % 4 === 0;
    const isHalf = i % 2 === 0 && !isCm;
    const h = isCm ? 22 : isHalf ? 15 : 9;
    ctx.fillStyle = isCm ? "#3b2104" : "rgba(59, 33, 4, 0.65)";
    ctx.fillRect(x, 0, isCm ? 3 : 1.6, h);
    ctx.fillRect(x, 64 - h, isCm ? 3 : 1.6, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildTapeRibbonGeometry(THREE, points, normals, closed, halfWidth) {
  const n = points.length;
  const ringCount = closed ? n + 1 : n;
  const positions = new Float32Array(ringCount * 2 * 3);
  const uvs = new Float32Array(ringCount * 2 * 2);
  const indices = [];

  // Compute accumulated arc length for crisp graduation UV repeat
  const dists = [0];
  let total = 0;
  for (let i = 1; i < ringCount; i++) {
    const a = points[(i - 1) % n];
    const b = points[i % n];
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    dists.push(total);
  }

  const tmpT = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const prevB = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < ringCount; i++) {
    const idx = i % n;
    const pCurr = points[idx];
    const pPrev = points[(idx - 1 + n) % n];
    const pNext = points[(idx + 1) % n];
    if (!closed && idx === 0) {
      tmpT.set(pNext[0] - pCurr[0], pNext[1] - pCurr[1], pNext[2] - pCurr[2]);
    } else if (!closed && idx === n - 1) {
      tmpT.set(pCurr[0] - pPrev[0], pCurr[1] - pPrev[1], pCurr[2] - pPrev[2]);
    } else {
      tmpT.set(pNext[0] - pPrev[0], pNext[1] - pPrev[1], pNext[2] - pPrev[2]);
    }
    if (tmpT.lengthSq() < 1e-10) tmpT.set(0, 1, 0);
    tmpT.normalize();

    const nArr = normals[idx] || [0, 0, 1];
    tmpN.set(nArr[0], nArr[1], nArr[2]);
    if (tmpN.lengthSq() < 1e-10) tmpN.set(0, 0, 1);
    tmpN.normalize();

    tmpB.crossVectors(tmpT, tmpN);
    if (tmpB.lengthSq() < 1e-8) {
      tmpB.crossVectors(tmpT, prevB);
      if (tmpB.lengthSq() < 1e-8) tmpB.set(0, 1, 0);
    }
    tmpB.normalize();
    if (i > 0 && tmpB.dot(prevB) < 0) tmpB.negate();
    prevB.copy(tmpB);

    const v0 = (i * 2) * 3;
    positions[v0] = pCurr[0] - tmpB.x * halfWidth;
    positions[v0 + 1] = pCurr[1] - tmpB.y * halfWidth;
    positions[v0 + 2] = pCurr[2] - tmpB.z * halfWidth;

    const v1 = (i * 2 + 1) * 3;
    positions[v1] = pCurr[0] + tmpB.x * halfWidth;
    positions[v1 + 1] = pCurr[1] + tmpB.y * halfWidth;
    positions[v1 + 2] = pCurr[2] + tmpB.z * halfWidth;

    const u = dists[i] * 8.5; // scaled so 10cm marks repeat naturally
    uvs[(i * 2) * 2] = u;
    uvs[(i * 2) * 2 + 1] = 0;
    uvs[(i * 2 + 1) * 2] = u;
    uvs[(i * 2 + 1) * 2 + 1] = 1;
  }

  for (let i = 0; i < ringCount - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = (i + 1) * 2;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function pointAlongPath(points, closed, tFrac) {
  const n = points.length;
  if (!n) return [0, 0, 0];
  const segCount = closed ? n : n - 1;
  if (segCount <= 0) return points[0].slice();
  const clamped = Math.max(0, Math.min(1, tFrac));
  const scaled = clamped * segCount;
  const idx = Math.min(segCount - 1, Math.floor(scaled));
  const u = scaled - idx;
  const a = points[idx];
  const b = points[(idx + 1) % n];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) m?.dispose?.();
    }
  });
}

function shortestAngleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Mounts an interactive Three.js 3D Measurement Teaching Studio into `hostEl`.
 * Returns a controller `{ setActive, setViewPreset, setSpin, replayAnimation, setPaused, update, dispose }`.
 */
export async function mountMeasureGuide3D(hostEl, initialOpts = {}) {
  const { THREE, OrbitControls } = await loadThreeDeps();
  if (!hostEl || !hostEl.isConnected) throw new Error("hostDisconnected");

  const opts = {
    category: initialOpts.category || "women",
    measurements: initialOpts.measurements || {},
    mannequin: initialOpts.mannequin || null,
    lang: initialOpts.lang || "en",
    activeKey: initialOpts.activeKey || null,
    onSelect: typeof initialOpts.onSelect === "function" ? initialOpts.onSelect : () => {},
    onPathsReady: typeof initialOpts.onPathsReady === "function" ? initialOpts.onPathsReady : () => {},
  };

  hostEl.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.className = "mg3d-canvas";
  const pinLayer = document.createElement("div");
  pinLayer.className = "mg3d-pins";
  const landmarkLayer = document.createElement("div");
  landmarkLayer.className = "mg3d-landmarks";
  hostEl.append(canvas, pinLayer, landmarkLayer);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 30);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.enablePan = false;
  controls.minPolarAngle = 0.22;
  controls.maxPolarAngle = Math.PI - 0.14;
  controls.minDistance = 0.35;
  controls.maxDistance = 4.2;

  // Atelier 3-point lighting
  const hemiLight = new THREE.HemisphereLight(0xfff9f0, 0xbdb6aa, 1.05);
  const keyLight = new THREE.DirectionalLight(0xfff4e2, 1.35);
  keyLight.position.set(1.6, 2.8, 2.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.55);
  fillLight.position.set(-2.0, 1.5, 1.4);
  const rimLight = new THREE.DirectionalLight(0xffe9c7, 0.65);
  rimLight.position.set(0.2, 2.1, -2.2);
  scene.add(hemiLight, keyLight, fillLight, rimLight);

  // Subtle translucent floor plinth ring
  const floorRingGeo = new THREE.RingGeometry(0.18, 0.44, 64);
  floorRingGeo.rotateX(-Math.PI / 2);
  const floorRingMat = new THREE.MeshBasicMaterial({
    color: 0xd4942a,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
  });
  const floorRing = new THREE.Mesh(floorRingGeo, floorRingMat);
  floorRing.position.y = 0.002;
  scene.add(floorRing);

  const rulerTexture = createRulerTapeTexture(THREE);

  let modelGroup = null;
  let tapeGroup = null;
  let tracerGroup = null;
  let tracerOrb = null;
  let landmarkMeshes = [];
  let currentPaths = {};
  let currentHeightM = 1.67;

  const tapeEntries = new Map(); // key -> { mesh, group, witnessMeshes, levelRing, baseMat }
  const pinButtons = new Map();
  const landmarkElements = [];

  let activeKey = opts.activeKey;
  let paused = false;
  let autoSpin = activeKey == null;
  let disposed = false;
  let rafId = null;

  // Smooth camera fly-to target state
  const camAnim = {
    active: false,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    fromSph: new THREE.Spherical(),
    toSph: new THREE.Spherical(),
    t: 1,
    duration: 0.65,
  };

  let wrapT = 0;
  let lastFrameTime = performance.now();
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  controls.addEventListener("start", () => {
    camAnim.active = false;
    autoSpin = false;
  });

  function resize() {
    if (disposed) return;
    const w = Math.max(hostEl.clientWidth || 300, 120);
    const h = Math.max(hostEl.clientHeight || 300, 120);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  let resizeObs = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObs = new ResizeObserver(resize);
    resizeObs.observe(hostEl);
  }
  resize();

  function buildTracer() {
    if (tracerGroup) scene.remove(tracerGroup);
    disposeObject3D(tracerGroup);
    tracerGroup = new THREE.Group();
    const orbGeo = new THREE.SphereGeometry(0.011, 20, 16);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xfff8d6 });
    tracerOrb = new THREE.Mesh(orbGeo, orbMat);
    const haloGeo = new THREE.SphereGeometry(0.019, 16, 12);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.42 });
    tracerOrb.add(new THREE.Mesh(haloGeo, haloMat));
    tracerGroup.visible = false;
    tracerGroup.add(tracerOrb);
    scene.add(tracerGroup);
  }
  buildTracer();

  function rebuildAvatarAndTapes() {
    if (disposed) return;
    if (modelGroup) {
      scene.remove(modelGroup);
      disposeObject3D(modelGroup);
      modelGroup = null;
    }
    if (tapeGroup) {
      scene.remove(tapeGroup);
      disposeObject3D(tapeGroup);
      tapeGroup = null;
    }
    tapeEntries.clear();
    pinLayer.innerHTML = "";
    pinButtons.clear();

    const posedJoints = {};
    let bindDims = null;
    let bindLandmarks = null;

    const built = buildHumanMannequin(THREE, opts.category, opts.measurements, {
      mannequin: opts.mannequin,
      pose: "standing",
      bakeStatic: true,
      onBindData: ({ limbs, landmarks, dims }) => {
        bindDims = dims;
        bindLandmarks = landmarks;
        for (const jKey of ["arm1", "elbow1", "hand1", "arm-1", "elbow-1", "hand-1", "leg1", "knee1", "foot1"]) {
          const bone = limbs?.[jKey];
          if (bone && bone.getWorldPosition) {
            const v = new THREE.Vector3();
            bone.getWorldPosition(v);
            posedJoints[jKey] = [v.x, v.y, v.z];
          }
        }
      },
    });

    modelGroup = built.group;
    modelGroup.updateMatrixWorld(true);
    scene.add(modelGroup);

    const bbox = new THREE.Box3().setFromObject(built.bodyMesh);
    if (built.headGroup) bbox.expandByObject(built.headGroup);
    const bodyBounds = { minY: bbox.min.y, maxY: bbox.max.y };
    currentHeightM = Math.max(0.85, bbox.max.y - bbox.min.y);

    // Raycast helper against baked body mesh (`hits[0]` = nearest wall)
    const raycaster = new THREE.Raycaster();
    const origVec = new THREE.Vector3();
    const dirVec = new THREE.Vector3();
    const raycastFn = (origin, dir, far = 0.5, near = 0.002) => {
      origVec.set(origin[0], origin[1], origin[2]);
      dirVec.set(dir[0], dir[1], dir[2]).normalize();
      raycaster.set(origVec, dirVec);
      raycaster.near = near;
      raycaster.far = far;
      const hits = raycaster.intersectObject(built.bodyMesh, false);
      if (!hits.length) return null;
      const h = hits[0];
      return {
        point: [h.point.x, h.point.y, h.point.z],
        normal: h.face ? [h.face.normal.x, h.face.normal.y, h.face.normal.z] : [0, 0, 1],
      };
    };

    currentPaths = buildMeasurementPaths(
      bindDims || built.dims,
      bindLandmarks || built.landmarks,
      posedJoints,
      bodyBounds,
      raycastFn,
    );

    tapeGroup = new THREE.Group();
    for (const k of MEAS_GUIDE_KEYS) {
      const path = currentPaths[k];
      const spec = MEAS_GUIDE_SPECS[k];
      if (!path) continue;
      const itemGroup = new THREE.Group();

      const activeMat = new THREE.MeshStandardMaterial({
        map: rulerTexture,
        color: 0xffffff,
        emissive: 0xd97706,
        emissiveIntensity: 0.24,
        roughness: 0.42,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.98,
        depthWrite: true,
      });

      const dimMat = new THREE.MeshStandardMaterial({
        map: rulerTexture,
        color: 0xd8d2c6,
        roughness: 0.65,
        metalness: 0.02,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.46,
      });

      const ribbonGeo = buildTapeRibbonGeometry(THREE, path.points, path.normals, path.closed, 0.0072);
      const ribbonMesh = new THREE.Mesh(ribbonGeo, activeMat);
      ribbonMesh.renderOrder = 3;
      itemGroup.add(ribbonMesh);

      const witnessMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 });
      const witnessMeshes = [];
      for (const seg of path.witnessLines || []) {
        const wGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...seg[0]),
          new THREE.Vector3(...seg[1]),
        ]);
        const line = new THREE.Line(wGeo, witnessMat);
        line.visible = false;
        itemGroup.add(line);
        witnessMeshes.push(line);
      }

      let levelRing = null;
      if (path.levelPlane) {
        const { y, rx, rz, centerX = 0 } = path.levelPlane;
        const pts = [];
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          pts.push(new THREE.Vector3(centerX + Math.sin(a) * rx, y, Math.cos(a) * rz));
        }
        const lGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const lMat = new THREE.LineBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.34 });
        levelRing = new THREE.Line(lGeo, lMat);
        levelRing.visible = false;
        itemGroup.add(levelRing);
      }

      tapeGroup.add(itemGroup);
      tapeEntries.set(k, { itemGroup, ribbonMesh, activeMat, dimMat, witnessMeshes, levelRing });

      // Create interactive HTML callout pin
      const pinBtn = document.createElement("button");
      pinBtn.type = "button";
      pinBtn.className = "mg3d-pin";
      pinBtn.dataset.meas = k;
      pinBtn.textContent = String(spec.index);
      pinBtn.setAttribute("aria-label", `${spec.index}. ${spec.title[opts.lang === "ar" ? "ar" : "en"]}`);
      pinBtn.onclick = (e) => {
        e.stopPropagation();
        opts.onSelect(k, { pin: true });
      };
      pinLayer.appendChild(pinBtn);
      pinButtons.set(k, pinBtn);
    }

    scene.add(tapeGroup);
    opts.onPathsReady(currentPaths);
    applyActiveVisuals();
  }

  function rebuildLandmarks() {
    for (const m of landmarkMeshes) {
      scene.remove(m);
      disposeObject3D(m);
    }
    landmarkMeshes = [];
    landmarkLayer.innerHTML = "";
    landmarkElements.length = 0;

    if (!activeKey || !currentPaths[activeKey]) return;
    const pins = currentPaths[activeKey].landmarkPins || [];
    const ar = opts.lang === "ar";
    for (const lp of pins) {
      const grp = new THREE.Group();
      grp.position.set(lp.position[0], lp.position[1], lp.position[2]);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.0085, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.45, roughness: 0.25 }),
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.011, 0.0155, 24),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }),
      );
      grp.add(head, ring);
      scene.add(grp);
      landmarkMeshes.push(grp);

      const tag = document.createElement("span");
      tag.className = "mg3d-landmark-tag";
      tag.textContent = ar ? lp.ar : lp.en;
      landmarkLayer.appendChild(tag);
      landmarkElements.push({ el: tag, pos: new THREE.Vector3(...lp.position) });
    }
  }

  function applyActiveVisuals() {
    for (const [k, entry] of tapeEntries.entries()) {
      const isSelected = activeKey === k;
      const isDimmed = Boolean(activeKey) && !isSelected;
      entry.ribbonMesh.material = isSelected || !activeKey ? entry.activeMat : entry.dimMat;
      entry.activeMat.opacity = isSelected ? 1.0 : isDimmed ? 0.25 : 0.88;
      entry.activeMat.emissiveIntensity = isSelected ? 0.34 : 0.14;
      entry.ribbonMesh.scale.setScalar(1);
      for (const w of entry.witnessMeshes) w.visible = isSelected;
      if (entry.levelRing) entry.levelRing.visible = isSelected;
    }
    for (const [k, btn] of pinButtons.entries()) {
      btn.classList.toggle("is-active", activeKey === k);
      btn.classList.toggle("is-dim", Boolean(activeKey) && activeKey !== k);
    }
    rebuildLandmarks();
    tracerGroup.visible = Boolean(activeKey && currentPaths[activeKey] && !reduceMotion);
  }

  function flyCameraTo(azimuth, elevation, distance, targetVec, immediate = false) {
    if (immediate || reduceMotion) {
      const sph = new THREE.Spherical(distance, Math.PI * 0.5 - elevation, azimuth);
      const pos = new THREE.Vector3().setFromSpherical(sph).add(targetVec);
      controls.target.copy(targetVec);
      camera.position.copy(pos);
      controls.update();
      camAnim.active = false;
      return;
    }
    const offset = camera.position.clone().sub(controls.target);
    camAnim.fromSph.setFromVector3(offset);
    camAnim.toSph.set(distance, Math.PI * 0.5 - elevation, azimuth);
    camAnim.fromTarget.copy(controls.target);
    camAnim.toTarget.copy(targetVec);
    camAnim.t = 0;
    camAnim.active = true;
  }

  function focusMeasurement(key, { animate = true, replay = true } = {}) {
    if (key && MEAS_GUIDE_SPECS[key] && currentPaths[key]) {
      const spec = MEAS_GUIDE_SPECS[key];
      const path = currentPaths[key];
      const cam = spec.camera;
      const tgt = new THREE.Vector3(
        path.cameraTarget[0] * (cam.targetXScale ?? 1),
        path.cameraTarget[1] + (cam.targetOffsetY || 0),
        path.cameraTarget[2],
      );
      const dist = currentHeightM * (cam.distanceFactor || 0.65);
      autoSpin = false;
      flyCameraTo(cam.azimuth, cam.elevation, dist, tgt, !animate);
      if (replay) wrapT = 0;
    } else {
      const tgt = new THREE.Vector3(0, currentHeightM * 0.51, 0);
      flyCameraTo(0.28, 0.08, currentHeightM * 1.48, tgt, !animate);
    }
  }

  function projectToOverlay() {
    const w = hostEl.clientWidth || 300;
    const h = hostEl.clientHeight || 300;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const v = new THREE.Vector3();
    const worldCenter = new THREE.Vector3(0, currentHeightM * 0.5, 0);

    for (const [k, btn] of pinButtons.entries()) {
      const path = currentPaths[k];
      if (!path) continue;
      v.set(path.pinAnchor[0], path.pinAnchor[1], path.pinAnchor[2]);
      const ndc = v.clone().project(camera);
      const onScreen = ndc.z >= -1 && ndc.z <= 1;
      btn.style.display = onScreen ? "" : "none";
      if (!onScreen) continue;

      const x = Math.max(14, Math.min(w - 14, (ndc.x * 0.5 + 0.5) * w));
      const y = Math.max(14, Math.min(h - 14, (-ndc.y * 0.5 + 0.5) * h));
      btn.style.left = `${x.toFixed(1)}px`;
      btn.style.top = `${y.toFixed(1)}px`;

      // Subtle back-side fade if pin lies on opposite hemisphere from camera
      const fromCenter = v.clone().sub(worldCenter);
      const facingCam = fromCenter.dot(camDir) < 0.08;
      btn.classList.toggle("is-back", !facingCam && activeKey !== k);
    }

    for (const item of landmarkElements) {
      const ndc = item.pos.clone().project(camera);
      const vis = ndc.z >= -1 && ndc.z <= 1;
      item.el.style.display = vis ? "" : "none";
      if (!vis) continue;
      const x = Math.max(26, Math.min(w - 26, (ndc.x * 0.5 + 0.5) * w));
      const y = Math.max(16, Math.min(h - 16, (-ndc.y * 0.5 + 0.5) * h));
      item.el.style.left = `${x.toFixed(1)}px`;
      item.el.style.top = `${y.toFixed(1)}px`;
    }
  }

  function tick(now) {
    if (disposed) return;
    rafId = requestAnimationFrame(tick);
    if (paused) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
    lastFrameTime = now;

    if (camAnim.active) {
      camAnim.t = Math.min(1, camAnim.t + dt / camAnim.duration);
      const ease = 1 - Math.pow(1 - camAnim.t, 3);
      controls.target.lerpVectors(camAnim.fromTarget, camAnim.toTarget, ease);
      const r = camAnim.fromSph.radius + (camAnim.toSph.radius - camAnim.fromSph.radius) * ease;
      const phi = camAnim.fromSph.phi + (camAnim.toSph.phi - camAnim.fromSph.phi) * ease;
      const theta = camAnim.fromSph.theta + shortestAngleDiff(camAnim.fromSph.theta, camAnim.toSph.theta) * ease;
      const sph = new THREE.Spherical(r, phi, theta);
      camera.position.setFromSpherical(sph).add(controls.target);
      if (camAnim.t >= 1) camAnim.active = false;
    } else if (autoSpin && !reduceMotion) {
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.theta += dt * 0.32;
      camera.position.setFromSpherical(sph).add(controls.target);
    }

    if (activeKey && currentPaths[activeKey] && tracerOrb && tracerGroup.visible) {
      wrapT = (wrapT + dt * 0.65) % 1;
      const pt = pointAlongPath(currentPaths[activeKey].points, currentPaths[activeKey].closed, wrapT);
      tracerOrb.position.set(pt[0], pt[1], pt[2]);
    }

    for (const grp of landmarkMeshes) {
      grp.lookAt(camera.position);
    }

    controls.update();
    renderer.render(scene, camera);
    projectToOverlay();
  }

  rebuildAvatarAndTapes();
  focusMeasurement(activeKey, { animate: false, replay: true });
  lastFrameTime = performance.now();
  rafId = requestAnimationFrame(tick);

  return {
    getPaths: () => currentPaths,
    setActive(key, { animate = true, replay = true } = {}) {
      const next = key && MEAS_GUIDE_SPECS[key] ? key : null;
      if (activeKey === next && !replay) return;
      activeKey = next;
      applyActiveVisuals();
      focusMeasurement(activeKey, { animate, replay });
    },
    setViewPreset(preset) {
      autoSpin = preset === "spin";
      const targetY = activeKey && currentPaths[activeKey]
        ? currentPaths[activeKey].cameraTarget[1]
        : currentHeightM * 0.51;
      const dist = activeKey && MEAS_GUIDE_SPECS[activeKey]
        ? currentHeightM * MEAS_GUIDE_SPECS[activeKey].camera.distanceFactor
        : currentHeightM * 1.48;
      const tgt = new THREE.Vector3(0, targetY, 0);
      if (preset === "front") flyCameraTo(0, 0.08, dist, tgt);
      else if (preset === "side") flyCameraTo(-Math.PI * 0.48, 0.08, dist, tgt);
      else if (preset === "back") flyCameraTo(Math.PI, 0.12, dist, tgt);
      else if (preset === "overview") {
        activeKey = null;
        applyActiveVisuals();
        focusMeasurement(null, { animate: true, replay: false });
      }
    },
    setSpin(flag) {
      autoSpin = Boolean(flag);
    },
    replayAnimation() {
      wrapT = 0;
      if (activeKey) focusMeasurement(activeKey, { animate: true, replay: true });
    },
    setPaused(flag) {
      paused = Boolean(flag);
      if (!paused) lastFrameTime = performance.now();
    },
    update({ category, measurements, mannequin, lang } = {}) {
      if (disposed) return;
      if (category) opts.category = category;
      if (measurements) opts.measurements = measurements;
      if (mannequin !== undefined) opts.mannequin = mannequin;
      if (lang) opts.lang = lang;
      rebuildAvatarAndTapes();
      for (const [k, btn] of pinButtons.entries()) {
        const sp = MEAS_GUIDE_SPECS[k];
        btn.setAttribute("aria-label", `${sp.index}. ${sp.title[opts.lang === "ar" ? "ar" : "en"]}`);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (resizeObs) resizeObs.disconnect();
      controls.dispose();
      disposeObject3D(modelGroup);
      disposeObject3D(tapeGroup);
      disposeObject3D(tracerGroup);
      for (const m of landmarkMeshes) disposeObject3D(m);
      floorRingGeo.dispose();
      floorRingMat.dispose();
      rulerTexture.dispose();
      renderer.dispose();
      hostEl.innerHTML = "";
    },
  };
}

/**
 * Generates clean HTML for the detailed teaching card of a selected measurement
 * or the neutral overview prompt when no measurement is pinned.
 */
export function renderGuideLessonHTML(key, { valueCm, lang = "en", T }) {
  const ar = lang === "ar";
  if (!key || !MEAS_GUIDE_SPECS[key]) {
    return `
      <div class="mg3d-card-empty">
        <strong>${T("measGuideOverviewTitle")}</strong>
        <p>${T("measGuideOverviewHint")}</p>
      </div>
    `;
  }
  const spec = MEAS_GUIDE_SPECS[key];
  const valTxt = valueCm != null && valueCm !== "" ? `${Number(valueCm)} ${ar ? "سم" : "cm"}` : "";
  const steps = spec.steps[ar ? "ar" : "en"];
  const landmarks = spec.landmarkLabels.map((l) => `<span class="mg3d-lm-pill">${l[ar ? "ar" : "en"]}</span>`).join("");

  return `
    <div class="mg3d-card-head">
      <div class="mg3d-card-title-wrap">
        <span class="mg3d-card-badge">${spec.index}</span>
        <div>
          <strong class="mg3d-card-title">${spec.title[ar ? "ar" : "en"]}</strong>
          <div class="mg3d-card-sub">${T("measGuideStepOf").replace("{n}", String(spec.index)).replace("{total}", String(MEAS_GUIDE_KEYS.length))}</div>
        </div>
      </div>
      ${valTxt ? `<span class="mg3d-card-val">${valTxt}</span>` : ""}
    </div>
    <p class="mg3d-card-anatomy">${spec.anatomy[ar ? "ar" : "en"]}</p>
    <div class="mg3d-card-landmarks">
      <span class="mg3d-card-sec-lbl">${T("measGuideLandmarksTitle")}:</span>
      <div class="mg3d-lm-list">${landmarks}</div>
    </div>
    <div class="mg3d-card-sec">
      <div class="mg3d-card-sec-lbl">${T("measGuideStepsTitle")}</div>
      <ol class="mg3d-steps-list">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    </div>
    <div class="mg3d-tip-box is-ease">
      <strong>${T("measGuideTensionTitle")}:</strong> ${spec.easeTip[ar ? "ar" : "en"]}
    </div>
    <div class="mg3d-tip-box is-avoid">
      <strong>${T("measGuideAvoidTitle")}:</strong> ${spec.avoid[ar ? "ar" : "en"]}
    </div>
    <div class="mg3d-card-nav">
      <button type="button" class="mg3d-nav-btn" data-guide-act="prev">${T("measGuidePrev")}</button>
      <button type="button" class="mg3d-nav-btn is-replay" data-guide-act="replay">${T("measGuideReplay")}</button>
      <button type="button" class="mg3d-nav-btn" data-guide-act="next">${T("measGuideNext")}</button>
    </div>
  `;
}

/**
 * Opens an expanded full-screen interactive 3D Measurement Teaching Studio modal.
 */
export function openExpandedMeasureGuideModal({
  category = "women",
  measurements = {},
  mannequin = null,
  lang = "en",
  T,
  initialKey = "chest",
  onSelectKey,
  onClose,
}) {
  const overlay = document.createElement("div");
  overlay.className = "mg3d-modal-backdrop";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", T("measGuideModalTitle"));

  const dialog = document.createElement("div");
  dialog.className = "mg3d-modal";
  dialog.innerHTML = `
    <div class="mg3d-modal-head">
      <div>
        <h2>${T("measGuideModalTitle")}</h2>
        <p>${T("measGuideModalSub")}</p>
      </div>
      <button type="button" class="mg3d-close-btn" aria-label="${T("measGuideClose")}">✕</button>
    </div>
    <div class="mg3d-modal-body">
      <div class="mg3d-modal-left">
        <div class="mg3d-toolbar">
          <div class="mg3d-seg">
            <button type="button" data-view="front">${T("measGuideFront")}</button>
            <button type="button" data-view="side">${T("measGuideSide")}</button>
            <button type="button" data-view="back">${T("measGuideBack")}</button>
            <button type="button" data-view="overview">${T("measGuideSpin")}</button>
          </div>
          <button type="button" class="mg3d-act-btn" data-act="replay">${T("measGuideReplay")}</button>
        </div>
        <div class="mg3d-viewport is-modal">
          <div class="mg3d-host"></div>
          <div class="mg3d-drag-hint">${T("measGuideDragHint")}</div>
        </div>
      </div>
      <div class="mg3d-modal-right">
        <div class="mg3d-modal-picker">${MEAS_GUIDE_KEYS.map((k, idx) => `
          <button type="button" class="mg3d-pick-btn" data-meas="${k}">
            <span class="mg3d-pick-num">${idx + 1}</span>
            <span class="mg3d-pick-lbl">${T("m_" + k)}</span>
            <span class="mg3d-pick-val">${measurements[k] ?? ""}</span>
          </button>
        `).join("")}</div>
        <div class="mg3d-card is-modal"></div>
      </div>
    </div>
  `;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  let active = initialKey && MEAS_GUIDE_SPECS[initialKey] ? initialKey : "chest";
  let ctrl = null;
  let closed = false;

  const cardEl = dialog.querySelector(".mg3d-card");
  const hostEl = dialog.querySelector(".mg3d-host");

  function syncModalUI() {
    dialog.querySelectorAll(".mg3d-pick-btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.meas === active);
    });
    cardEl.innerHTML = renderGuideLessonHTML(active, {
      valueCm: measurements[active],
      lang,
      T,
    });
    cardEl.querySelectorAll("[data-guide-act]").forEach((btn) => {
      btn.onclick = () => stepActive(btn.dataset.guideAct);
    });
  }

  function stepActive(act) {
    if (act === "replay") {
      ctrl?.replayAnimation();
      return;
    }
    const idx = MEAS_GUIDE_KEYS.indexOf(active);
    const nextIdx = act === "prev"
      ? (idx - 1 + MEAS_GUIDE_KEYS.length) % MEAS_GUIDE_KEYS.length
      : (idx + 1) % MEAS_GUIDE_KEYS.length;
    selectKey(MEAS_GUIDE_KEYS[nextIdx]);
  }

  function selectKey(k) {
    active = k;
    syncModalUI();
    ctrl?.setActive(k, { animate: true, replay: true });
    if (onSelectKey) onSelectKey(k);
  }

  dialog.querySelectorAll(".mg3d-pick-btn").forEach((b) => {
    b.onclick = () => selectKey(b.dataset.meas);
  });
  dialog.querySelectorAll("[data-view]").forEach((b) => {
    b.onclick = () => ctrl?.setViewPreset(b.dataset.view);
  });
  dialog.querySelector('[data-act="replay"]').onclick = () => ctrl?.replayAnimation();

  function closeModal() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeyDown);
    ctrl?.dispose();
    overlay.remove();
    if (onClose) onClose();
  }
  function onKeyDown(e) {
    if (e.key === "Escape") closeModal();
  }

  dialog.querySelector(".mg3d-close-btn").onclick = closeModal;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", onKeyDown);

  syncModalUI();
  mountMeasureGuide3D(hostEl, {
    category,
    measurements,
    mannequin,
    lang,
    activeKey: active,
    onSelect: (k) => selectKey(k),
  }).then((c) => {
    if (closed) {
      c.dispose();
      return;
    }
    ctrl = c;
  }).catch(() => {
    hostEl.innerHTML = `<div class="mg3d-loading">${T("measGuideFallback2D")}</div>`;
  });

  return { close: closeModal };
}
