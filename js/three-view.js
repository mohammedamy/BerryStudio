/* ============================================================
   3D Preview — BerryStudio Studio Polish & Unified Human System.

   • Unified watertight 2-manifold human mannequin (`js/human-mannequin.js`)
     with 17-bone skeleton & smooth linear-blend skinning across all 4
     categories (`women`, `men`, `girls`, `boys`) — zero separated pieces.
   • Pattern-responsive tailored 3D garments (`js/pattern-3d-metrics.js`):
     sculpted bodices with real shoulder seams, armholes, necklines & collars;
     tailored skinned sleeves (cap, puff, fitted, 3/4, full, bell, bishop);
     draped/pleated skirts (mini, knee, midi, maxi); and single-surface
     Y-branched tailored trousers/shorts/briefs.
   • Studio 3-point lighting, soft floor contact shadow + atelier turntable,
     procedural micro-weave fabric bump maps, tension heatmap, & OBJ export.
   ============================================================ */

import {
  BONE_IDX,
  buildHumanMannequin,
  bumpWindow,
  computeHumanBodyDims,
  createHumanSkinMaterial,
  maleTorsoZBump,
  torsoZBump,
} from "./human-mannequin.js";
import { computePatternMetrics3D } from "./pattern-3d-metrics.js";

export const View3D = (() => {
  let THREE, OrbitControls, GLTFLoader, RGBELoader, cloneSkeleton;
  let renderer, scene, camera, controls, raf = null;
  let root, bodyGroup, garmentGroup, limbs = {};
  let activeMannequin = null;
  let ready = false, spinning = true, walking = true, t = 0;
  let reduceMotion = false;
  let host, curCategory = "women", curH = 1.7;
  let curMeasurements = null, lastDims = null, curPatternMetrics = null;
  let tensionMapEnabled = false;
  let lastTensionMetrics = { avgEase: 4.5, peakStrain: 0.0, status: "fitOptimal", fabric: "cotton" };
  let onTensionMetricsUpdate = () => {};
  let onLoading = () => {};
  let onAvatarIssue = () => {};
  let onFatalError = () => {};
  let noiseTex = null;
  const sharedTextures = new Set();
  const weaveBumpCache = new Map();
  let skirtFrontMesh = null, skirtBackMesh = null;
  let accessoriesGroup = null;
  let accessoriesState = {
    buttons: { enabled: false, style: "gold", placement: "front_placket", count: 6 },
    zipper: { enabled: false, style: "silver", placement: "center_front", openPct: 0 },
    belt: { enabled: false, style: "leather_gold", width: "medium" },
  };
  const avatarURLs = {};

  // ---------- GLB robustness: timeout, retry, in-memory cache ----------
  const GLB_TIMEOUT_MS = 10000;
  const GLB_MAX_RETRIES = 2;
  const GLB_CACHE_LIMIT = 6;
  const glbCache = new Map();

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function fetchGLTF(url, onProgress) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        url,
        resolve,
        (evt) => {
          if (onProgress && evt.total) {
            onProgress(Math.max(0, Math.min(99, Math.round((evt.loaded / evt.total) * 100))));
          }
        },
        reject
      );
    });
  }

  async function loadGLTFWithRetry(url, onProgress) {
    if (glbCache.has(url)) {
      if (onProgress) onProgress(100);
      return glbCache.get(url);
    }
    let lastErr;
    for (let attempt = 0; attempt <= GLB_MAX_RETRIES; attempt++) {
      try {
        const gltf = await withTimeout(fetchGLTF(url, onProgress), GLB_TIMEOUT_MS);
        if (glbCache.size >= GLB_CACHE_LIMIT) glbCache.delete(glbCache.keys().next().value);
        glbCache.set(url, gltf);
        return gltf;
      } catch (e) {
        lastErr = e;
        if (attempt < GLB_MAX_RETRIES) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  function disposeMaterial(mat) {
    if (!mat) return;
    [
      "map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap",
      "alphaMap", "bumpMap", "sheenColorMap", "clearcoatMap", "transmissionMap", "thicknessMap",
    ].forEach((key) => {
      const tex = mat[key];
      if (tex && tex.isTexture && tex !== noiseTex && !sharedTextures.has(tex)) {
        tex.dispose();
      }
    });
    mat.dispose();
  }

  function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry) o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach(disposeMaterial);
      else disposeMaterial(o.material);
    });
  }

  // ---------- dependency loading ----------
  const THREE_VERSION = "0.185.1";
  const DEP_TIERS = [
    { label: "importmap", base: null, addons: null },
    { label: "unpkg", base: `https://unpkg.com/three@${THREE_VERSION}/build/three.module.js`, addons: `https://unpkg.com/three@${THREE_VERSION}/examples/jsm` },
    { label: "esm.sh", base: `https://esm.sh/three@${THREE_VERSION}`, addons: `https://esm.sh/three@${THREE_VERSION}/examples/jsm` },
  ];

  async function loadDepsFromTier(tier) {
    const THREE_ = tier.base ? await import(/* @vite-ignore */ tier.base) : await import(/* @vite-ignore */ "three");
    const addonUrl = (path) => (tier.addons ? `${tier.addons}/${path}` : `three/addons/${path}`);
    const { OrbitControls: OC } = await import(/* @vite-ignore */ addonUrl("controls/OrbitControls.js"));
    const { clone: cloneSkeleton_ } = await import(/* @vite-ignore */ addonUrl("utils/SkeletonUtils.js"));
    let GL = null, RGBE = null;
    try { ({ GLTFLoader: GL } = await import(/* @vite-ignore */ addonUrl("loaders/GLTFLoader.js"))); } catch (_) { /* optional */ }
    try { ({ RGBELoader: RGBE } = await import(/* @vite-ignore */ addonUrl("loaders/RGBELoader.js"))); } catch (_) { /* optional */ }
    return { THREE_, OC, GL, RGBE, cloneSkeleton_ };
  }

  async function loadDeps() {
    if (THREE) return true;
    for (const tier of DEP_TIERS) {
      try {
        const { THREE_, OC, GL, RGBE, cloneSkeleton_ } = await loadDepsFromTier(tier);
        THREE = THREE_;
        OrbitControls = OC;
        GLTFLoader = GL;
        RGBELoader = RGBE;
        cloneSkeleton = cloneSkeleton_;
        return true;
      } catch (_) { /* try next tier */ }
    }
    return false;
  }

  let envMapPromise = null;
  function loadEnvironmentMap() {
    if (envMapPromise) return envMapPromise;
    if (!RGBELoader) return Promise.resolve(null);
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    envMapPromise = new Promise((resolve) => {
      new RGBELoader().load(
        "env/studio_small_08_1k.hdr",
        (hdrTex) => {
          const envMap = pmrem.fromEquirectangular(hdrTex).texture;
          hdrTex.dispose();
          pmrem.dispose();
          resolve(envMap);
        },
        undefined,
        () => { pmrem.dispose(); resolve(null); }
      );
    });
    return envMapPromise;
  }

  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // ---------- init ----------
  async function init(canvas) {
    host = canvas;
    const ok = await loadDeps();
    if (!ok || !window.WebGLRenderingContext) { fallback(); return; }

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    scene.background = gradientBackdrop();
    loadEnvironmentMap().then((envMap) => {
      if (envMap && scene) {
        scene.environment = envMap;
        scene.environmentIntensity = 0.45;
      }
    });

    camera = new THREE.PerspectiveCamera(31, 1, 0.05, 100);
    camera.position.set(0.36, 0.98, 3.55);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.75;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.93;
    controls.autoRotate = spinning && !reduceMotion;
    controls.autoRotateSpeed = 1.35;
    controls.target.set(0, 0.90, 0);

    setupLights();
    setupGround();

    root = new THREE.Group();
    scene.add(root);
    noiseTex = makeNoise();
    sharedTextures.add(noiseTex);

    ready = true;
    resize();
    loop();
  }

  // ---------- studio environment ----------
  function gradientBackdrop() {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    const dark = document.body.getAttribute("data-mode") === "dark";
    if (dark) {
      g.addColorStop(0, "#212634");
      g.addColorStop(0.56, "#161a24");
      g.addColorStop(1, "#0d1017");
    } else {
      g.addColorStop(0, "#e7ecf4");
      g.addColorStop(0.58, "#d7dee9");
      g.addColorStop(1, "#c3ccd9");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function setupLights() {
    scene.add(new THREE.HemisphereLight(0xfffdf9, 0x7d7770, 0.48));

    const key = new THREE.DirectionalLight(0xfffaf2, 1.68);
    key.position.set(2.4, 4.2, 3.3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -1.6;
    key.shadow.camera.right = 1.6;
    key.shadow.camera.top = 2.6;
    key.shadow.camera.bottom = -0.5;
    key.shadow.bias = -0.0003;
    key.shadow.radius = 5;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xdce6ff, 0.50);
    fill.position.set(-2.8, 2.1, 2.2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffe8c9, 0.78);
    rim.position.set(-1.4, 3.0, -3.6);
    scene.add(rim);
  }

  function setupGround() {
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.ShadowMaterial({ opacity: 0.20 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.0005;
    shadow.receiveShadow = true;
    scene.add(shadow);

    // Dual-falloff studio contact shadow under feet
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const rg = ctx.createRadialGradient(128, 128, 6, 128, 128, 124);
    rg.addColorStop(0, "rgba(18,22,32,0.30)");
    rg.addColorStop(0.45, "rgba(18,22,32,0.11)");
    rg.addColorStop(1, "rgba(18,22,32,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 256, 256);
    const patchTex = new THREE.CanvasTexture(c);
    sharedTextures.add(patchTex);
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 1.05),
      new THREE.MeshBasicMaterial({ map: patchTex, transparent: true, depthWrite: false })
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.y = 0.0012;
    scene.add(patch);

    // Subtle atelier turntable hairline ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.472, 72),
      new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.0015;
    scene.add(ring);
  }

  function makeNoise() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 150 + Math.random() * 105;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 5);
    return tex;
  }

  // ---------- Procedural micro-weave bump maps for realistic textiles ----------
  function getWeaveBumpMap(materialKey) {
    if (typeof document === "undefined" || !THREE) return null;
    let style = "plain";
    if (materialKey === "denim" || materialKey === "wool") style = "twill";
    else if (materialKey === "linen") style = "linen";
    else if (materialKey === "jersey" || materialKey === "scuba") style = "knit";
    else if (materialKey === "leather") style = "leather";
    else if (materialKey === "silk" || materialKey === "satin") style = "satin";

    if (weaveBumpCache.has(style)) return weaveBumpCache.get(style);

    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(64, 64);
    const d = img.data;

    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        let v = 128;
        if (style === "twill") {
          const diag = (x + y * 2) % 6;
          v = diag < 3 ? 175 : 92;
        } else if (style === "linen") {
          const wx = Math.sin(x * 1.57) * 28;
          const wy = Math.sin(y * 1.57) * 28;
          const slub = ((x * 13 + y * 7) % 19) < 2 ? 26 : 0;
          v = 128 + wx + wy + slub;
        } else if (style === "knit") {
          const col = (x % 8) - 4;
          const row = (y + Math.abs(col)) % 6;
          v = row < 3 ? 168 : 96;
        } else if (style === "leather") {
          const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          v = 110 + (hash - Math.floor(hash)) * 55;
        } else if (style === "satin") {
          v = 124 + ((x + y * 4) % 5 === 0 ? 18 : -4);
        } else {
          // Crisp cotton poplin plain cross-weave
          v = ((x + y) % 2 === 0) ? 156 : 108;
        }
        const idx = (y * 64 + x) * 4;
        d[idx] = d[idx + 1] = d[idx + 2] = Math.max(0, Math.min(255, v));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(26, 26);
    weaveBumpCache.set(style, tex);
    sharedTextures.add(tex);
    return tex;
  }

  // ---------- materials ----------
  const FABRIC = {
    cotton:  { label: 'Cotton Poplin', massDensity: 150, structStiff: 0.96, bendStiff: 0.35, maxStrain: 1.05, damping: 0.970, friction: 0.90, rough: 0.82, metal: 0.0,  sheen: 0.25, clear: 0.0,  om: 1, bump: 0.0012 },
    denim:   { label: 'Denim',         massDensity: 400, structStiff: 0.98, bendStiff: 0.80, maxStrain: 1.03, damping: 0.930, friction: 0.96, rough: 0.88, metal: 0.02, sheen: 0.14, clear: 0.0,  om: 1, bump: 0.0024 },
    silk:    { label: 'Silk Charmeuse',massDensity: 60,  structStiff: 0.94, bendStiff: 0.15, maxStrain: 1.07, damping: 0.980, friction: 0.80, rough: 0.26, metal: 0.05, sheen: 0.9,  clear: 0.15, om: 0.98, anisotropy: 0.6, anisoRot: 0, bump: 0.0004 },
    satin:   { label: 'Satin',         massDensity: 90,  structStiff: 0.95, bendStiff: 0.20, maxStrain: 1.06, damping: 0.980, friction: 0.82, rough: 0.2,  metal: 0.12, sheen: 0.85, clear: 0.22, om: 1,    anisotropy: 0.5, anisoRot: 0, bump: 0.0004 },
    chiffon: { label: 'Chiffon',       massDensity: 30,  structStiff: 0.92, bendStiff: 0.10, maxStrain: 1.08, damping: 0.985, friction: 0.75, rough: 0.5,  metal: 0.0,  sheen: 0.45, clear: 0.0,  om: 0.55, transmission: 0.18, bump: 0.0006 },
    wool:    { label: 'Wool Crepe',    massDensity: 300, structStiff: 0.97, bendStiff: 0.58, maxStrain: 1.04, damping: 0.950, friction: 0.93, rough: 0.94, metal: 0.0,  sheen: 0.12, clear: 0.0,  om: 1, bump: 0.0022 },
    linen:   { label: 'Linen',         massDensity: 170, structStiff: 0.96, bendStiff: 0.42, maxStrain: 1.05, damping: 0.970, friction: 0.87, rough: 0.82, metal: 0.0,  sheen: 0.16, clear: 0.0,  om: 1, bump: 0.0020 },
    leather: { label: 'Leather',       massDensity: 550, structStiff: 0.98, bendStiff: 0.92, maxStrain: 1.02, damping: 0.900, friction: 0.97, rough: 0.38, metal: 0.18, sheen: 0.2,  clear: 0.35, om: 1, bump: 0.0018 },
    jersey:  { label: 'Cotton Jersey', massDensity: 180, structStiff: 0.90, bendStiff: 0.22, maxStrain: 1.18, damping: 0.965, friction: 0.88, rough: 0.68, metal: 0.0,  sheen: 0.22, clear: 0.0,  om: 1, bump: 0.0014 },
    scuba:   { label: 'Scuba Knit',    massDensity: 260, structStiff: 0.91, bendStiff: 0.45, maxStrain: 1.14, damping: 0.955, friction: 0.85, rough: 0.35, metal: 0.0,  sheen: 0.35, clear: 0.05, om: 1, bump: 0.0008 },
    tulle:   { label: 'Tulle',         massDensity: 18,  structStiff: 0.80, bendStiff: 0.06, maxStrain: 1.12, damping: 0.988, friction: 0.55, rough: 0.55, metal: 0.0,  sheen: 0.3,  clear: 0.0,  om: 0.35, transmission: 0.12, bump: 0.0010 },
  };

  const defaultFabricSlot = () => ({
    front: { color: 0x4f46e5, material: "cotton", textureDataURL: null, rawDrawingURL: null },
    back: null,
    opacity: 1.0,
  });
  let fabricState = {
    bodice: defaultFabricSlot(),
    sleeve: defaultFabricSlot(),
    skirt: defaultFabricSlot(),
    trousers: defaultFabricSlot(),
  };

  let fabricTexLoader = null;
  function getFabricTexLoader() {
    return (fabricTexLoader ||= new THREE.TextureLoader());
  }
  const FABRIC_TEXTURE_REPEAT = 6;

  function fabricMat(part, side) {
    const st = fabricState[part] || fabricState.bodice;
    const slot = side === "back" && st.back ? st.back : st.front;
    const f = FABRIC[slot.material] || FABRIC.cotton;
    const op = Math.max(0.25, Math.min(1, st.opacity * f.om));
    const weaveBump = getWeaveBumpMap(slot.material || "cotton");

    const mat = new THREE.MeshPhysicalMaterial({
      color: slot.textureDataURL ? 0xffffff : slot.color,
      roughness: f.rough,
      metalness: f.metal,
      sheen: f.sheen,
      sheenRoughness: 0.48,
      sheenColor: new THREE.Color(slot.textureDataURL ? 0xf8fafc : slot.color).lerp(new THREE.Color(0xffffff), 0.55),
      clearcoat: f.clear,
      clearcoatRoughness: 0.4,
      bumpMap: weaveBump || null,
      bumpScale: f.bump || 0.001,
      transparent: op < 0.99,
      opacity: op,
      depthWrite: op >= 0.55,
      side: THREE.DoubleSide,
      ...(f.transmission != null && { transmission: f.transmission, thickness: 0.001 }),
      ...(f.anisotropy != null && { anisotropy: f.anisotropy, anisotropyRotation: f.anisoRot ?? 0 }),
    });

    if (slot.textureDataURL) {
      const tex = getFabricTexLoader().load(slot.textureDataURL, () => {
        tex.needsUpdate = true;
        mat.needsUpdate = true;
      });
      const rep = slot.textureRepeat != null ? slot.textureRepeat : (slot.isDrawing ? 1 : FABRIC_TEXTURE_REPEAT);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(rep, rep);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
    }
    return mat;
  }

  // ---------- geometry & skinning helpers ----------
  const cm = (v) => v * 0.01;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smoothstep = (e0, e1, x) => {
    if (e1 === e0) return x < e0 ? 0 : 1;
    const u = clamp((x - e0) / (e1 - e0), 0, 1);
    return u * u * (3 - 2 * u);
  };

  function packSkinWeights(entries) {
    const valid = entries.filter((e) => e[1] > 1e-5).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (!valid.length) return [[0, 0, 0, 0], [1, 0, 0, 0]];
    let sum = 0;
    for (const e of valid) sum += e[1];
    const idx = [0, 0, 0, 0];
    const w = [0, 0, 0, 0];
    for (let i = 0; i < valid.length; i++) {
      idx[i] = valid[i][0];
      w[i] = valid[i][1] / (sum || 1);
    }
    return [idx, w];
  }

  function createGarmentMesh(geo, mat, partName, sideName, skeleton) {
    let mesh;
    if (skeleton && geo.attributes.skinIndex && geo.attributes.skinWeight) {
      mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.bind(skeleton, new THREE.Matrix4());
    } else {
      mesh = new THREE.Mesh(geo, mat);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = partName;
    mesh.userData.side = sideName;
    mesh.userData.origMat = mat;
    return mesh;
  }

  const AVATAR_LANDMARK_OVERRIDES = {
    boy2: { shoulderYFrac: 0.65, hipYFrac: 0.33, radiusScale: 2.3 },
  };

  function computeBodyDims(category, m, landmarks) {
    return computeHumanBodyDims(category, m, landmarks);
  }

  // ---------- Unified Lifelike Human Mannequin ----------
  function buildProcedural(category, m, patternMetrics = null, preserveCamera = false) {
    curCategory = category;
    curMeasurements = m;
    const prevH = curH;
    disposeObject3D(bodyGroup);
    disposeObject3D(garmentGroup);
    root.clear();
    limbs = {};
    activeMannequin = null;

    bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    const skin = createHumanSkinMaterial(THREE, category);
    activeMannequin = buildHumanMannequin(THREE, category, m, {
      skinMaterial: skin,
      pose: "standing",
    });

    bodyGroup.add(activeMannequin.group);
    limbs = activeMannequin.limbs;
    lastDims = activeMannequin.dims;
    curH = lastDims.H;

    buildGarment(category, m, lastDims, patternMetrics);
    if (preserveCamera && controls && camera) {
      const oldTarget = controls.target.clone();
      const offset = camera.position.clone().sub(oldTarget);
      if (prevH > 0.1 && Math.abs(curH - prevH) > 0.005) {
        offset.multiplyScalar(curH / prevH);
      }
      controls.target.set(0, curH * 0.525, 0);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    } else {
      controls.target.set(0, curH * 0.525, 0);
      frameCamera(curH);
    }
  }

  // =========================================================================
  // TAILORED, PATTERN-RESPONSIVE SKINNED GARMENT ENGINE
  // =========================================================================
  function getBodySurfacePoint(y, phi, d, extraEase = 0.014, waistRelax = 0) {
    const { female, kid, hipY, shoulderY, span, chestR, waistR, hipR, shoulderHalf } = d;
    const zScale = female ? 0.72 : 0.78;
    const effWaistR = waistR * (1 - waistRelax) + Math.max(waistR, hipR * 0.93, chestR * 0.95) * waistRelax;

    // Match the exact anatomical torso profile of human-mannequin.js so garments never pinch inside iliac crest or chest
    const stops = [
      [hipY - span * 0.08, hipR * 1.02, hipR * 1.00],
      [hipY - span * 0.02, hipR * 1.03, hipR * 1.01],
      [hipY + span * 0.06, hipR * 1.01, hipR * 0.99],
      [hipY + span * 0.19, hipR * 0.93 + effWaistR * 0.09, hipR * 0.92 + effWaistR * 0.10],
      [hipY + span * 0.32, hipR * 0.44 + effWaistR * 0.58, hipR * 0.46 + effWaistR * 0.56],
      [hipY + span * 0.44, effWaistR * 1.02, effWaistR * 1.00],
      [hipY + span * 0.56, effWaistR * 0.62 + chestR * 0.40, effWaistR * 0.65 + chestR * 0.37],
      [hipY + span * 0.65, chestR * (female ? 0.99 : 1.03), chestR * 0.98],
      [hipY + span * 0.74, chestR * (female ? 1.03 : 1.07), chestR * (female ? 1.02 : 1.04)],
      [hipY + span * 0.84, shoulderHalf * (female ? 0.88 : 0.92), chestR * 0.95],
      [shoulderY,          shoulderHalf * 0.95, chestR * 0.88],
    ];

    let rx, rzBase;
    if (y <= stops[0][0]) {
      const f = clamp((stops[0][0] - y) / Math.max(0.15, hipY), 0, 1);
      rx = hipR * (1.02 - 0.12 * f);
      rzBase = hipR * (1.00 - 0.08 * f);
    } else if (y >= stops[stops.length - 1][0]) {
      rx = stops[stops.length - 1][1];
      rzBase = stops[stops.length - 1][2];
    } else {
      rx = stops[0][1];
      rzBase = stops[0][2];
      for (let i = 0; i < stops.length - 1; i++) {
        const y0 = stops[i][0], y1 = stops[i + 1][0];
        if (y >= y0 && y <= y1) {
          const u = (y - y0) / Math.max(1e-5, y1 - y0);
          rx = stops[i][1] * (1 - u) + stops[i + 1][1] * u;
          rzBase = stops[i][2] * (1 - u) + stops[i + 1][2] * u;
          break;
        }
      }
    }

    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    const x = (rx + extraEase) * sinP;
    let z = (rzBase * zScale + extraEase) * cosP;
    if (!kid && y >= hipY - span * 0.15 && y <= shoulderY + span * 0.06) {
      z += female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d);
    }
    if (cosP > 0.35 && y > hipY + span * 0.78) {
      const clavLobe = bumpWindow(phi, 0.45, 0.36) + bumpWindow(phi, -0.45, 0.36);
      z += 0.005 * clavLobe * smoothstep(hipY + span * 0.78, shoulderY, y);
    }
    return [x, z];
  }

  function torsoGarmentWeights(y, x, d) {
    const { hipY, shoulderY, span } = d;
    const waistY = hipY + span * 0.44;
    const chestY = hipY + span * 0.68;

    if (y < hipY - 0.02) {
      const legBlend = smoothstep(hipY - 0.02, hipY - 0.34, y) * 0.85;
      const bLeg = x >= 0 ? BONE_IDX.legL : BONE_IDX.legR;
      const kneeY = hipY * 0.50;
      const kneeBlend = y < kneeY ? smoothstep(kneeY + 0.04, kneeY - 0.14, y) * 0.70 : 0;
      const bKnee = x >= 0 ? BONE_IDX.kneeL : BONE_IDX.kneeR;
      return [
        [BONE_IDX.pelvis, 1 - legBlend],
        [bLeg, legBlend * (1 - kneeBlend)],
        [bKnee, legBlend * kneeBlend],
      ];
    }
    if (y < chestY) {
      const fSpine = smoothstep(hipY + span * 0.04, waistY + span * 0.04, y);
      const fChest = smoothstep(waistY - span * 0.04, chestY + span * 0.04, y);
      const wPelvis = Math.max(0, 1 - fSpine);
      const wChest = fChest;
      const wSpine = Math.max(0, 1 - wPelvis - wChest);
      return [[BONE_IDX.pelvis, wPelvis], [BONE_IDX.spine, wSpine], [BONE_IDX.chest, wChest]];
    }
    const lat = clamp((Math.abs(x) - d.neckR * 1.4) / Math.max(0.06, d.shoulderHalf), 0, 1);
    const armW = smoothstep(shoulderY - span * 0.08, shoulderY + span * 0.04, y) * lat * 0.22;
    const bArm = x >= 0 ? BONE_IDX.armL : BONE_IDX.armR;
    return [[BONE_IDX.chest, 1 - armW], [bArm, armW]];
  }

  /**
   * Builds a tailored bodice / blouse / shirt / jacket / robe with real
   * shoulder straps, contoured armholes, sculpted neckline, and optional collar.
   */
  function buildTailoredBodice(d, pm, skeleton) {
    const bSpec = pm.bodice;
    const { hipY, shoulderY, span, neckR, shoulderHalf, chestR } = d;
    const waistY = hipY + span * 0.44;
    const underarmY = shoulderY - span * 0.09;
    const shoulderTopY = shoulderY + span * 0.052;

    const easeBase = 0.015 + Math.max(-0.002, (bSpec.easeRatio - 1.0) * 0.042);
    const waistRelax = bSpec.style === "robe" ? 0.88 : (bSpec.style === "tunic" ? 0.52 : 0);

    // Determine bottom hem Y based on actual 2D bodice style & lengthCm
    let hemY = hipY + span * 0.06;
    if (bSpec.style === "bra") {
      hemY = waistY + span * 0.14;
    } else if (bSpec.style === "crop") {
      hemY = waistY + span * 0.07;
    } else if (bSpec.style === "waist") {
      hemY = waistY - 0.012;
    } else if (bSpec.style === "hip" || bSpec.style === "leotard") {
      hemY = clamp(shoulderTopY - cm(bSpec.lengthCm), hipY - span * 0.08, waistY - 0.03);
    } else if (bSpec.style === "tunic") {
      hemY = clamp(shoulderTopY - cm(bSpec.lengthCm), hipY - 0.22, hipY - 0.04);
    } else if (bSpec.style === "robe") {
      hemY = clamp(shoulderTopY - cm(bSpec.lengthCm), 0.05, hipY - 0.12);
    }

    const isStrapless = bSpec.neckline === "strapless";
    const isBra = bSpec.style === "bra";

    // Neckline opening width & depth on Front vs Back
    const neckHalfW = neckR * (bSpec.neckline === "boat" ? 1.62 : (bSpec.neckline === "high" || bSpec.neckline === "collar" ? 1.15 : 1.30));
    let frontNeckBottomY = shoulderY - span * 0.12;
    if (bSpec.neckline === "v-neck") frontNeckBottomY = hipY + span * 0.66;
    else if (bSpec.neckline === "scoop" || isBra) frontNeckBottomY = hipY + span * 0.72;
    else if (bSpec.neckline === "square") frontNeckBottomY = hipY + span * 0.75;
    else if (bSpec.neckline === "boat") frontNeckBottomY = shoulderY - span * 0.04;
    else if (bSpec.neckline === "high" || bSpec.neckline === "collar") frontNeckBottomY = shoulderY - span * 0.015;

    const backNeckBottomY = isBra
      ? hipY + span * 0.74
      : (bSpec.neckline === "scoop" ? shoulderY - span * 0.10 : shoulderY - span * 0.02);

    const shoulderTipX = isBra
      ? neckHalfW + (shoulderHalf * 0.86 - neckHalfW) * 0.52
      : shoulderHalf * 0.90;

    function buildBodiceSide(isFront) {
      const positions = [];
      const uvs = [];
      const skinIdx = [];
      const skinWgt = [];
      const indices = [];

      const ROWS_LOWER = bSpec.style === "robe" ? 16 : 9;
      const ROWS_UPPER = isStrapless ? 2 : 8;
      const totalRows = ROWS_LOWER + ROWS_UPPER;
      const HALF_COLS = 9; // 0..8 on right (-X), 9..17 on left (+X) -> 18 columns per row
      const rowVerts = [];

      const neckBottomY = isFront ? frontNeckBottomY : backNeckBottomY;

      for (let r = 0; r <= totalRows; r++) {
        let y;
        if (r <= ROWS_LOWER) {
          const u = r / ROWS_LOWER;
          y = hemY * (1 - u) + underarmY * u;
        } else {
          const u = (r - ROWS_LOWER) / ROWS_UPPER;
          y = underarmY * (1 - u) + (isStrapless ? (underarmY + span * 0.02) : shoulderTopY) * u;
        }

        const upperFrac = r <= ROWS_LOWER ? 0 : (r - ROWS_LOWER) / ROWS_UPPER;

        // Flare multiplier below waist for tunics / robes / abayas / peplums
        let lowerFlare = 1.0;
        let pleatAmp = 0;
        if (y < waistY && bSpec.hemFlare > 1.04) {
          const drop = clamp((waistY - y) / Math.max(0.15, waistY - hemY), 0, 1);
          lowerFlare = 1 + (bSpec.hemFlare - 1) * Math.pow(drop, 1.12);
          if (pm.skirt.pleats > 0 && bSpec.style === "robe") {
            pleatAmp = 0.007 * Math.pow(drop, 1.3);
          }
        }

        // Inner neckline X cutoff (0 below neckline, opening to neckHalfW at shoulder seam)
        let innerX = 0;
        if (bSpec.isOpenFront && isFront && !isBra) {
          innerX = 0.008; // clean open-front jacket/cardigan/abaya slit
        }
        if (!isStrapless && y > neckBottomY) {
          const nu = clamp((y - neckBottomY) / Math.max(0.02, shoulderTopY - neckBottomY), 0, 1);
          let curve;
          if (isFront && bSpec.neckline === "v-neck") curve = Math.pow(nu, 0.88);
          else if (isFront && bSpec.neckline === "square") curve = nu < 0.16 ? nu * 5.2 : 0.84 + (nu - 0.16) * 0.19;
          else curve = Math.sqrt(nu);
          innerX = Math.max(innerX, neckHalfW * clamp(curve, 0, 1));
        }

        // Outer armscye X cutoff above underarmY (curves smoothly into shoulder strap!)
        const bodyHalfWAtUnderarm = Math.abs(getBodySurfacePoint(underarmY, Math.PI / 2, d, easeBase, waistRelax)[0]);
        let outerMaxX = Math.abs(getBodySurfacePoint(Math.min(y, underarmY), Math.PI / 2, d, easeBase, waistRelax)[0]) * lowerFlare;
        if (r > ROWS_LOWER && !isStrapless) {
          const armscyeIndent = Math.sin(Math.PI * Math.min(1, upperFrac * 0.85)) * (isBra ? chestR * 0.20 : chestR * 0.045);
          outerMaxX = bodyHalfWAtUnderarm * (1 - upperFrac) + shoulderTipX * upperFrac - armscyeIndent;
          outerMaxX = Math.max(innerX + (isBra ? 0.016 : 0.032), outerMaxX);
        }

        const row = [];
        for (const sideSign of [-1, 1]) {
          for (let c = 0; c < HALF_COLS; c++) {
            const tCol = sideSign < 0 ? (1 - c / (HALF_COLS - 1)) : (c / (HALF_COLS - 1));
            const xMag = innerX + (outerMaxX - innerX) * tCol;
            const x = sideSign * xMag;

            // Map x onto surface angle phi on front [-PI/2..+PI/2] or back [PI/2..3PI/2]
            const refOuterW = Math.max(outerMaxX, shoulderHalf * 0.92);
            const sinPhi = clamp(x / Math.max(0.04, (r > ROWS_LOWER ? refOuterW : outerMaxX)), -0.985, 0.985);
            const phi = isFront ? Math.asin(sinPhi) : (Math.PI - Math.asin(sinPhi));

            let [, zSurf] = getBodySurfacePoint(Math.min(y, shoulderY), phi, d, easeBase, waistRelax);
            zSurf *= lowerFlare;
            if (pleatAmp > 0) {
              zSurf += (isFront ? 1 : -1) * pleatAmp * Math.cos(phi * pm.skirt.pleats);
            }

            // Over the top of the shoulder strap (upperFrac in [0.76, 1.0]), arch smoothly over the
            // trapezius/acromion crown before welding to z=0 right at the top shoulder seam (r === totalRows)
            let yFinal = y;
            if (!isStrapless && upperFrac > 0) {
              const ridgeCrownY = shoulderY + span * 0.062 - Math.abs(tCol) * span * 0.022;
              const archLift = smoothstep(0.45, 1.0, upperFrac);
              yFinal = y * (1 - archLift * 0.75) + ridgeCrownY * (archLift * 0.75);
              if (upperFrac > 0.76) {
                const capAngle = (Math.PI * 0.5) * smoothstep(0.76, 1.0, upperFrac);
                zSurf *= Math.cos(capAngle);
              }
            }

            const id = positions.length / 3;
            positions.push(x, yFinal, zSurf);
            uvs.push((x / (shoulderHalf * 2.2)) + 0.5, clamp((yFinal - hemY) / Math.max(0.2, shoulderTopY - hemY), 0, 1));
            const [bi, bw] = packSkinWeights(torsoGarmentWeights(yFinal, x, d));
            skinIdx.push(bi[0], bi[1], bi[2], bi[3]);
            skinWgt.push(bw[0], bw[1], bw[2], bw[3]);
            row.push({ id, innerX });
          }
        }
        rowVerts.push(row);
      }

      // Triangulate grid: connect right half (0..HALF_COLS-1), left half (HALF_COLS..2*HALF_COLS-1),
      // and center bridge (HALF_COLS-1 <-> HALF_COLS) where neckline/slit is closed (innerX < 0.002)
      for (let r = 0; r < totalRows; r++) {
        const r0 = rowVerts[r];
        const r1 = rowVerts[r + 1];
        for (let c = 0; c < HALF_COLS * 2 - 1; c++) {
          const isCenterBridge = c === HALF_COLS - 1;
          if (isCenterBridge && (r0[c].innerX > 0.002 || r1[c].innerX > 0.002)) continue;

          const a0 = r0[c].id, a1 = r0[c + 1].id;
          const b0 = r1[c].id, b1 = r1[c + 1].id;
          if (isFront) {
            indices.push(a0, a1, b1, a0, b1, b0);
          } else {
            indices.push(a0, b1, a1, a0, b0, b1);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const sideName = isFront ? "front" : "back";
      const mesh = createGarmentMesh(geo, fabricMat("bodice", sideName), "bodice", sideName, skeleton);
      mesh.userData.garmentType = isBra ? "bra" : "full";
      return mesh;
    }

    const frontMesh = buildBodiceSide(true);
    const backMesh = buildBodiceSide(false);
    garmentGroup.add(frontMesh, backMesh);

    // Optional sculpted 3D collar stitched directly into the bodice neckline (zero floating-ring skin gap!)
    if (bSpec.hasCollar && !isBra && !isStrapless) {
      const collarCols = 32;
      const cPos = [], cUvs = [], cSi = [], cSw = [], cIdx = [];
      const collarH = 0.038;
      const rCol = neckHalfW * 1.02;
      const isStandOnly = bSpec.neckline === "high";
      const sideNeckY = shoulderY + span * 0.042;

      for (let row = 0; row <= 2; row++) {
        for (let k = 0; k <= collarCols; k++) {
          const u = k / collarCols;
          // Span phi from +0.08 to 2*PI - 0.08 (neat front placket kiss)
          const phi = 0.08 + u * (2 * Math.PI - 0.16);
          const cosP = Math.cos(phi);
          const sinP = Math.sin(phi);

          // Contour collar base Y along the actual front/side/back bodice neckline seam!
          const frontW = Math.max(0, cosP);
          const backW = Math.max(0, -cosP);
          const sideW = Math.abs(sinP);
          const seamY = (frontNeckBottomY - 0.004) * frontW * frontW
            + (backNeckBottomY - 0.002) * backW * backW
            + sideNeckY * sideW * sideW;

          const [, bodyNeckZ] = getBodySurfacePoint(Math.min(seamY, shoulderY), phi, d, easeBase, waistRelax);
          const baseZ = Math.abs(cosP) > 0.15 ? bodyNeckZ * 0.92 : rCol * cosP;

          let radX = rCol;
          let z = baseZ;
          let y = seamY;
          if (row === 1) {
            radX = rCol * 0.96;
            z = baseZ * 0.90 + 0.004 * cosP;
            y = seamY + collarH * 0.78;
          } else if (row === 2) {
            radX = isStandOnly ? rCol * 0.94 : rCol * (1.16 + 0.08 * Math.max(0, cosP));
            z = isStandOnly ? (baseZ * 0.88 + 0.004 * cosP) : (baseZ * 1.06 + 0.012 * cosP);
            y = isStandOnly ? (seamY + collarH) : (seamY + collarH * 0.22);
          }
          const x = radX * sinP;
          cPos.push(x, y, z);
          cUvs.push(u, row * 0.5);
          const [bi, bw] = packSkinWeights([[BONE_IDX.neck, 0.55], [BONE_IDX.chest, 0.45]]);
          cSi.push(bi[0], bi[1], bi[2], bi[3]);
          cSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
        if (row > 0) {
          const prevOffset = (row - 1) * (collarCols + 1);
          const curOffset = row * (collarCols + 1);
          for (let k = 0; k < collarCols; k++) {
            const a0 = prevOffset + k, a1 = prevOffset + k + 1;
            const b0 = curOffset + k, b1 = curOffset + k + 1;
            cIdx.push(a0, a1, b1, a0, b1, b0);
          }
        }
      }

      const colGeo = new THREE.BufferGeometry();
      colGeo.setAttribute("position", new THREE.Float32BufferAttribute(cPos, 3));
      colGeo.setAttribute("uv", new THREE.Float32BufferAttribute(cUvs, 2));
      colGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(cSi, 4));
      colGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(cSw, 4));
      colGeo.setIndex(cIdx);
      colGeo.computeVertexNormals();
      const collarMesh = createGarmentMesh(colGeo, fabricMat("bodice", "front"), "bodice", "front", skeleton);
      collarMesh.userData.garmentType = "full";
      garmentGroup.add(collarMesh);
    }
  }

  /**
   * Builds tailored, armscye-fitted skinned sleeves (cap, puff, fitted, 3/4,
   * full, bell, bishop) using a vertical-oval-to-horizontal-tube deltoid sweep
   * so the sleeve head welds directly into the bodice armhole with zero skin gap
   * and zero pagoda/capsule protrusion.
   */
  function buildTailoredSleeves(d, pm, skeleton) {
    const sSpec = pm.sleeve;
    const { shoulderHalf, shoulderY, span, armLen, upperR, chestR } = d;
    const pivotX = shoulderHalf * 0.80;
    const pivotY = shoulderY - span * 0.04;
    const upperArmLen = armLen * 0.48;
    const totalSlLen = armLen * clamp(sSpec.lengthFrac, 0.16, 1.02);

    // Armscye vertical oval anchor coordinates on the bodice shoulder/underarm seam
    const armscyeX = shoulderHalf * 0.80;
    const armscyeTopY = shoulderY + span * 0.050;
    const armscyeBotY = shoulderY - span * 0.095;
    const armscyeMidY = 0.5 * (armscyeTopY + armscyeBotY);
    const armscyeHalfH = 0.5 * (armscyeTopY - armscyeBotY);
    const armscyeDepthZ = Math.max(upperR * 1.25, chestR * 0.56);

    const N_SEG = 24;
    const N_RINGS = 16;

    [-1, 1].forEach((side) => {
      const positions = [];
      const uvs = [];
      const skinIdx = [];
      const skinWgt = [];
      const indices = [];

      const sx = side * pivotX;

      for (let r = 0; r <= N_RINGS; r++) {
        const f = r / N_RINGS; // 0 = armscye seam, 1 = cuff/hem
        const dyBase = f * totalSlLen;

        // Body arm radius at this distance down the arm
        let bodyArmR;
        if (dyBase <= upperArmLen) {
          const u = dyBase / Math.max(0.1, upperArmLen);
          bodyArmR = upperR * (1.06 * (1 - u) + 0.75 * u);
        } else {
          const u = clamp((dyBase - upperArmLen) / Math.max(0.1, armLen * 0.48), 0, 1);
          bodyArmR = upperR * (0.76 * (1 - u) + 0.39 * u);
        }

        // Tailored silhouette radius envelope
        let sleeveR = bodyArmR + 0.013;
        if (sSpec.style === "puff") {
          const puffBell = Math.sin(Math.PI * Math.pow(f, 0.75));
          sleeveR = bodyArmR + 0.012 + upperR * 0.46 * puffBell;
          if (f > 0.88) sleeveR = bodyArmR + 0.008;
        } else if (sSpec.style === "bishop") {
          const billow = Math.sin(Math.PI * Math.pow(f, 0.65));
          sleeveR = bodyArmR + 0.013 + upperR * 0.55 * billow;
          if (f > 0.90) sleeveR = bodyArmR + 0.009;
        } else if (sSpec.style === "bell") {
          sleeveR = bodyArmR + 0.013 + upperR * 0.58 * Math.pow(f, 1.35);
        } else if (sSpec.style === "cap") {
          sleeveR = bodyArmR + 0.012 + upperR * 0.08 * (1 - f);
        } else {
          const easeExtra = Math.max(0, (sSpec.hemRatio - 0.68) * upperR * 0.35 * f);
          sleeveR = bodyArmR + 0.013 + easeExtra;
        }

        // Skin weights: match armWeightsAtOffset so sleeve deforms in lockstep with the arm and shoulder saddle
        const bArm = side > 0 ? BONE_IDX.armL : BONE_IDX.armR;
        const bElbow = side > 0 ? BONE_IDX.elbowL : BONE_IDX.elbowR;
        const chestAnchor = (1 - smoothstep(0.0, 0.16, f)) * 0.65;
        const elbowBlend = smoothstep(upperArmLen - 0.035, upperArmLen + 0.035, dyBase);
        const weights = [
          [BONE_IDX.chest, chestAnchor],
          [bArm, (1 - chestAnchor) * (1 - elbowBlend)],
          [bElbow, (1 - chestAnchor) * elbowBlend],
        ];
        const [bi, bw] = packSkinWeights(weights);

        const capBlend = 1 - smoothstep(0.0, 0.22, f);
        const deltoidArc = Math.sin(Math.PI * clamp(f / 0.22, 0, 1));

        for (let k = 0; k <= N_SEG; k++) {
          const u = k / N_SEG;
          const theta = u * 2 * Math.PI;
          const sCrown = Math.sin(theta); // +1 = top shoulder crown / lateral outer arm, -1 = bottom underarm / medial inner arm
          const cFront = Math.cos(theta); // +1 = front (+Z), -1 = back (-Z)

          const gatherFlute = sSpec.style === "puff" ? 0.003 * Math.sin(theta * 10) * Math.sin(Math.PI * f) : 0;
          const rEff = sleeveR + gatherFlute;

          // 1. Vertical armscye oval on the bodice at f = 0
          const xArmscye = side * (armscyeX + 0.012 * Math.max(0, sCrown));
          const yArmscye = armscyeMidY + armscyeHalfH * sCrown;
          const zArmscye = (armscyeDepthZ + gatherFlute) * cFront;

          // 2. Horizontal hanging sleeve tube along the arm
          const xTube = sx + side * rEff * sCrown;
          const yTube = pivotY - dyBase;
          const zTube = rEff * 0.96 * cFront;

          // 3. Smoothly sweep from the vertical bodice armhole over the rounded deltoid cap into the vertical arm tube
          const overDeltoidOut = side * upperR * 0.24 * deltoidArc * Math.max(0, sCrown);
          const overDeltoidUp = span * 0.024 * deltoidArc * Math.max(0, sCrown);

          const x = xArmscye * capBlend + xTube * (1 - capBlend) + overDeltoidOut;
          const y = yArmscye * capBlend + yTube * (1 - capBlend) + overDeltoidUp;
          const z = zArmscye * capBlend + zTube * (1 - capBlend);

          positions.push(x, y, z);
          uvs.push(u, 1 - f);
          skinIdx.push(bi[0], bi[1], bi[2], bi[3]);
          skinWgt.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }

      const stride = N_SEG + 1;
      for (let r = 0; r < N_RINGS; r++) {
        for (let k = 0; k < N_SEG; k++) {
          const a0 = r * stride + k;
          const a1 = a0 + 1;
          const b0 = (r + 1) * stride + k;
          const b1 = b0 + 1;
          if (side > 0) {
            indices.push(a0, b1, a1, a0, b0, b1);
          } else {
            indices.push(a0, a1, b1, a0, b1, b0);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const slMesh = createGarmentMesh(geo, fabricMat("sleeve", "front"), "sleeve", "front", skeleton);
      if (skeleton) {
        garmentGroup.add(slMesh);
      } else if (limbs["arm" + side]) {
        limbs["arm" + side].add(slMesh);
      } else {
        garmentGroup.add(slMesh);
      }
    });
  }

  /**
   * Builds a sculpted, draped/pleated skirt (mini, knee, midi, maxi; pencil,
   * straight, A-line, flared, pleated) split cleanly into front & back halves.
   */
  function buildTailoredSkirt(d, pm, skeleton) {
    const skSpec = pm.skirt;
    const { hipY, span, waistR, hipR, female, kid } = d;
    const zScale = female ? 0.72 : 0.78;
    const waistY = hipY + span * 0.44;
    const topY = waistY + 0.004;
    const hemY = clamp(waistY - cm(skSpec.lengthCm), 0.045, hipY - 0.08);
    const totalDrop = Math.max(0.16, topY - hemY);

    const N_RINGS = 16;
    const HALF_SEG = 24;

    function buildSkirtHalf(isFront) {
      const positions = [];
      const uvs = [];
      const skinIdx = [];
      const skinWgt = [];
      const indices = [];

      const phiStart = isFront ? -Math.PI / 2 : Math.PI / 2;

      for (let r = 0; r <= N_RINGS; r++) {
        const f = r / N_RINGS; // 0 = waist, 1 = hem
        const y = topY - f * totalDrop;

        // Smooth waist -> hip -> flared hem curve
        let baseRx, baseRz;
        if (y >= hipY) {
          const u = clamp((topY - y) / Math.max(0.05, topY - hipY), 0, 1);
          baseRx = (waistR + 0.012) * (1 - u) + (hipR * 1.05 + 0.016) * u;
          baseRz = (waistR * zScale + 0.012) * (1 - u) + (hipR * zScale * 1.06 + 0.018) * u;
        } else {
          const hipDrop = clamp((hipY - y) / Math.max(0.10, hipY - hemY), 0, 1);
          const flareEase = skSpec.flare <= 1.08
            ? (1.0 - 0.04 * hipDrop) // sleek pencil taper
            : (1.0 + (skSpec.flare - 1.05) * Math.pow(hipDrop, 1.12));
          baseRx = (hipR * 1.05 + 0.016) * flareEase;
          // Gradually relax elliptical squash into graceful round drape toward hem
          const roundBlend = smoothstep(0.0, 0.85, hipDrop) * clamp((skSpec.flare - 1.0) * 0.8, 0.15, 0.75);
          const effZScale = zScale * (1 - roundBlend) + 0.94 * roundBlend;
          baseRz = (hipR * 1.05 + 0.018) * effZScale * flareEase;
        }

        const pleatDepth = skSpec.pleats > 0 ? 0.0085 * Math.pow(f, 1.35) : 0;

        for (let k = 0; k <= HALF_SEG; k++) {
          const u = k / HALF_SEG;
          const phi = phiStart + u * Math.PI;
          const sinP = Math.sin(phi);
          const cosP = Math.cos(phi);

          const flute = pleatDepth > 0 ? pleatDepth * Math.cos(phi * skSpec.pleats * 2) : 0;
          const x = (baseRx + flute) * sinP;
          let z = (baseRz + flute) * cosP;

          if (!kid && y > hipY - span * 0.14) {
            const bumpFade = smoothstep(hipY - span * 0.14, hipY + span * 0.04, y);
            z += (female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d)) * bumpFade;
          }

          positions.push(x, y, z);
          uvs.push(u, 1 - f);

          // Waist stays 100% locked to pelvis; lower skirt subtly follows left/right leg swing
          const legFollow = smoothstep(hipY + 0.02, hipY - 0.30, y) * (skSpec.flare < 1.25 ? 0.72 : 0.42);
          const bLeg = x >= 0 ? BONE_IDX.legL : BONE_IDX.legR;
          const [bi, bw] = packSkinWeights([
            [BONE_IDX.pelvis, 1 - legFollow],
            [bLeg, legFollow],
          ]);
          skinIdx.push(bi[0], bi[1], bi[2], bi[3]);
          skinWgt.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }

      const stride = HALF_SEG + 1;
      for (let r = 0; r < N_RINGS; r++) {
        for (let k = 0; k < HALF_SEG; k++) {
          const a0 = r * stride + k;
          const a1 = a0 + 1;
          const b0 = (r + 1) * stride + k;
          const b1 = b0 + 1;
          indices.push(a0, b1, a1, a0, b0, b1);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const sideName = isFront ? "front" : "back";
      return createGarmentMesh(geo, fabricMat("skirt", sideName), "skirt", sideName, skeleton);
    }

    skirtFrontMesh = buildSkirtHalf(true);
    skirtBackMesh = buildSkirtHalf(false);
    garmentGroup.add(skirtFrontMesh, skirtBackMesh);
  }

  /**
   * Builds a SINGLE continuous, Y-branched tailored trouser / shorts / brief
   * surface (using our 2-manifold pants-cobordism across waist -> seat ->
   * crotch rise -> left & right legs), partitioned cleanly into front & back
   * halves with ZERO overlapping seat cones or knee buckets!
   */
  function buildTailoredTrousers(d, pm, skeleton) {
    const tSpec = pm.trousers;
    const { hipY, span, waistR, hipR, thighR, female, kid, H } = d;
    const zScale = female ? 0.72 : 0.78;
    const waistY = hipY + span * 0.44;
    const hipPivotX = hipR * (female ? 0.47 : 0.49);
    const ankleY = Math.max(0.055, H * 0.048);
    const kneeY = ankleY + (hipY - span * 0.04 - ankleY) * 0.47;

    const crotchSplitY = hipY - span * (tSpec.isBrief ? 0.13 : 0.165);
    const legStartY = crotchSplitY - 0.014;
    const fullInseamSpan = Math.max(0.20, legStartY - (ankleY + 0.012));
    const legDrop = tSpec.isBrief
      ? 0.018
      : fullInseamSpan * clamp(tSpec.inseamFrac, 0.14, 1.0);
    const pantHemY = Math.max(ankleY + 0.010, legStartY - legDrop);

    const N = 32;
    const positions = [];
    const uvs = [];
    const skinIdx = [];
    const skinWgt = [];
    const allTris = [];

    function addV(x, y, z, u, v, weights) {
      const id = positions.length / 3;
      positions.push(x, y, z);
      uvs.push(u, v);
      const [bi, bw] = packSkinWeights(weights);
      skinIdx.push(bi[0], bi[1], bi[2], bi[3]);
      skinWgt.push(bw[0], bw[1], bw[2], bw[3]);
      return id;
    }

    function connect(lower, upper) {
      for (let k = 0; k < N; k++) {
        const k1 = (k + 1) % N;
        const a0 = lower[k], a1 = lower[k1];
        const b0 = upper[k], b1 = upper[k1];
        allTris.push([a0, a1, b1], [a0, b1, b0]);
      }
    }

    function pantLegWeights(y, side) {
      const bHip = side > 0 ? BONE_IDX.legL : BONE_IDX.legR;
      const bKnee = side > 0 ? BONE_IDX.kneeL : BONE_IDX.kneeR;
      if (y <= kneeY + 0.05) {
        const f = smoothstep(kneeY - 0.05, kneeY + 0.05, y);
        return [[bKnee, 1 - f], [bHip, f]];
      }
      const pelvBlend = smoothstep(legStartY - 0.04, hipY + 0.03, y) * 0.45;
      return [[bHip, 1 - pelvBlend], [BONE_IDX.pelvis, pelvBlend]];
    }

    function buildPantLeg(side) {
      const legX = side * hipPivotX;
      const legSteps = tSpec.isBrief ? 2 : 9;
      const outerPelvicReach = Math.max(thighR * 0.96, hipR * 1.04 + 0.015 - Math.abs(legX));
      const innerPelvicReach = Math.max(thighR * 0.68, Math.abs(legX) - 0.006);

      let prev = null;
      for (let i = 0; i <= legSteps; i++) {
        const f = i / legSteps; // 0 = hem, 1 = crotch merge
        const y = pantHemY * (1 - f) + legStartY * f;
        const legFracUp = clamp((y - ankleY) / Math.max(0.2, legStartY - ankleY), 0, 1);

        // Body leg clearance + tailored cut (slim / straight chino / wide palazzo)
        const bodyLegR = thighR * (0.42 + 0.58 * Math.pow(legFracUp, 0.85)) + 0.013;
        const cutR = thighR * (0.64 * tSpec.hemMult * (1 - legFracUp) + 1.06 * legFracUp) + 0.012;
        const baseR = Math.max(bodyLegR, cutR);

        const topBlend = smoothstep(0.72, 1.0, legFracUp);
        const stanceX = legX + side * (1 - legFracUp) * (-hipR * 0.025);
        const ring = [];

        for (let k = 0; k < N; k++) {
          const phi = (2 * Math.PI * k) / N;
          const sinP = Math.sin(phi);
          const cosP = Math.cos(phi);
          const isMedial = sinP * side < 0;

          const targetRx = isMedial ? innerPelvicReach : outerPelvicReach;
          const targetRz = (hipR * zScale + 0.016) * (cosP >= 0 ? 0.94 : 1.04);

          const rx = baseR * 0.96 * (1 - topBlend) + targetRx * topBlend;
          let rz = baseR * 1.02 * (1 - topBlend) + targetRz * topBlend;

          // Subtle tailored center-front & center-back trouser press crease on woven trousers
          if (!tSpec.isBrief && tSpec.hemMult >= 0.88) {
            const crease = bumpWindow(phi, 0, 0.16) + bumpWindow(phi - Math.PI, 0, 0.16) + bumpWindow(phi + Math.PI, 0, 0.16);
            rz += 0.0035 * crease * (1 - topBlend * 0.7);
          }

          const x = stanceX + rx * sinP;
          const z = rz * cosP + (i === legSteps && !kid
            ? (female ? torsoZBump(y, phi, d) * 0.45 : maleTorsoZBump(y, phi, d) * 0.45)
            : 0);

          ring.push(addV(x, y, z, k / N, clamp((y - pantHemY) / Math.max(0.2, waistY - pantHemY), 0, 1), pantLegWeights(y, side)));
        }

        if (prev) connect(prev, ring);
        prev = ring;
      }
      return prev;
    }

    const topLegL = buildPantLeg(1);
    const topLegR = buildPantLeg(-1);

    // Pelvis & Waistband slices from crotch rise up to waistY
    const waistTopY = tSpec.isBrief ? (hipY + span * 0.18) : waistY;
    const pelvisSlices = [
      [hipY - span * 0.075, hipR * 1.04 + 0.015, hipR * 1.02 + 0.016],
      [hipY,                hipR * 1.05 + 0.016, hipR * 1.04 + 0.017],
      [hipY + span * 0.18,  (hipR * 0.72 + waistR * 0.30) + 0.015, (hipR * 0.72 + waistR * 0.30) + 0.015],
    ];
    if (!tSpec.isBrief) {
      pelvisSlices.push(
        [waistY - 0.032, (hipR * 0.18 + waistR * 0.84) + 0.014, (hipR * 0.18 + waistR * 0.84) + 0.014],
        [waistTopY,      waistR * 1.02 + 0.015, waistR * 1.02 + 0.015]
      );
    }

    function buildPelvisRing(y, rx, rzBase, isWaistbandRim = false) {
      const ring = [];
      for (let k = 0; k < N; k++) {
        const phi = (2 * Math.PI * k) / N;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        const wbBump = isWaistbandRim && tSpec.hasWaistband ? 0.0025 : 0;
        const x = (rx + wbBump) * sinP;
        let z = ((rzBase + wbBump) * zScale) * cosP;
        if (!kid) {
          z += female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d);
        }
        const fSpine = smoothstep(hipY + span * 0.05, waistY, y) * 0.45;
        const lat = clamp(Math.abs(x) / Math.max(0.1, hipR), 0, 1) * (1 - smoothstep(hipY - span * 0.10, hipY + span * 0.08, y)) * 0.30;
        const bLeg = x >= 0 ? BONE_IDX.legL : BONE_IDX.legR;
        ring.push(addV(
          x,
          y,
          z,
          k / N,
          clamp((y - pantHemY) / Math.max(0.2, waistTopY - pantHemY), 0, 1),
          [[BONE_IDX.pelvis, (1 - fSpine) * (1 - lat)], [BONE_IDX.spine, fSpine * (1 - lat)], [bLeg, lat]]
        ));
      }
      return ring;
    }

    const pelv0 = buildPelvisRing(pelvisSlices[0][0], pelvisSlices[0][1], pelvisSlices[0][2], false);

    // 15-vertex Crotch Rise Saddle M_1..M_15 (connecting front rise pelv0[0] under crotch to back rise pelv0[16])
    const p0Y = positions[pelv0[0] * 3 + 1], p0Z = positions[pelv0[0] * 3 + 2];
    const p16Y = positions[pelv0[16] * 3 + 1], p16Z = positions[pelv0[16] * 3 + 2];
    const saddleMid = [];
    for (let j = 1; j <= 15; j++) {
      const u = j / 16;
      const z = p0Z * (1 - u) + p16Z * u;
      const endY = p0Y * (1 - u) + p16Y * u;
      const arch = Math.sin(Math.PI * u);
      const y = endY * (1 - arch) + crotchSplitY * arch;
      saddleMid.push(addV(0, y, z, 0.5, 0.5, [[BONE_IDX.pelvis, 1]]));
    }

    const upperL = [pelv0[0], ...pelv0.slice(1, 16), pelv0[16], ...[...saddleMid].reverse()];
    const upperR = [pelv0[0], ...saddleMid, pelv0[16], ...pelvisSlices && pelv0.slice(17, 32)];
    connect(topLegL, upperL);
    connect(topLegR, upperR);

    let prevP = pelv0;
    for (let i = 1; i < pelvisSlices.length; i++) {
      const [y, rx, rzB] = pelvisSlices[i];
      const nextP = buildPelvisRing(y, rx, rzB, i === pelvisSlices.length - 1);
      connect(prevP, nextP);
      prevP = nextP;
    }

    // Partition into seamless Front (z >= 0) and Back (z < 0) sub-meshes
    const frontIdx = [];
    const backIdx = [];
    for (const [a, b, c] of allTris) {
      const cz = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3;
      if (cz >= 0) frontIdx.push(a, b, c);
      else backIdx.push(a, b, c);
    }

    const mkSubMesh = (triList, sideName) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
      geo.setIndex(triList);
      geo.computeVertexNormals();
      const mesh = createGarmentMesh(geo, fabricMat("trousers", sideName), "trousers", sideName, skeleton);
      mesh.userData.subPart = "unified";
      return mesh;
    };

    garmentGroup.add(mkSubMesh(frontIdx, "front"), mkSubMesh(backIdx, "back"));
  }

  function buildGarment(category, m, d, explicitMetrics = null) {
    if (garmentGroup) {
      root.remove(garmentGroup);
      disposeObject3D(garmentGroup);
    }
    garmentGroup = new THREE.Group();
    garmentGroup.name = "garmentGroup";
    root.add(garmentGroup);
    skirtFrontMesh = null;
    skirtBackMesh = null;

    const pm = explicitMetrics || curPatternMetrics || computePatternMetrics3D(lastPieceVis || [], m, category);
    curPatternMetrics = pm;
    const skeleton = activeMannequin ? activeMannequin.skeleton : null;

    buildTailoredBodice(d, pm, skeleton);
    buildTailoredSkirt(d, pm, skeleton);
    buildTailoredTrousers(d, pm, skeleton);
    buildTailoredSleeves(d, pm, skeleton);

    buildAccessories(d);
    applyPieceVisibility();
  }

  // ---------- Accessories & Trims: Buttons, Zippers & Belts ----------
  function createButtonMesh(size, style, baseColor) {
    const btnG = new THREE.Group();
    let mat;
    if (style === "gold") {
      mat = new THREE.MeshPhysicalMaterial({ color: 0xd4af37, metalness: 0.94, roughness: 0.22, clearcoat: 0.5 });
    } else if (style === "silver") {
      mat = new THREE.MeshPhysicalMaterial({ color: 0xe5e7eb, metalness: 0.95, roughness: 0.18, clearcoat: 0.6 });
    } else if (style === "horn") {
      mat = new THREE.MeshPhysicalMaterial({ color: 0x362112, roughness: 0.42, clearcoat: 0.65 });
    } else if (style === "pearl") {
      mat = new THREE.MeshPhysicalMaterial({ color: 0xf5f3ea, roughness: 0.28, sheen: 0.95, sheenRoughness: 0.4 });
    } else if (style === "matte_black") {
      mat = new THREE.MeshPhysicalMaterial({ color: 0x18181b, roughness: 0.78, metalness: 0.08 });
    } else if (style === "wood") {
      mat = new THREE.MeshPhysicalMaterial({ color: 0x7c4f27, roughness: 0.68, metalness: 0.02 });
    } else {
      mat = new THREE.MeshPhysicalMaterial({ color: baseColor || 0x4f46e5, roughness: 0.5 });
    }

    const r = (size || 1.0) * 0.007;
    const thick = r * 0.25;

    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.88, r * 0.16, 12, 24), mat);
    rim.castShadow = true;
    btnG.add(rim);

    const faceGeom = new THREE.CylinderGeometry(r * 0.85, r * 0.85, thick, 24);
    faceGeom.rotateX(Math.PI / 2);
    const face = new THREE.Mesh(faceGeom, mat);
    face.position.z = -thick * 0.15;
    face.castShadow = true;
    btnG.add(face);

    const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const holeR = r * 0.12;
    const holeOffset = r * 0.32;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([hx, hy]) => {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(holeR, 10), holeMat);
      hole.position.set(hx * holeOffset, hy * holeOffset, thick * 0.38);
      btnG.add(hole);
    });

    const threadMat = new THREE.MeshBasicMaterial({ color: style === "matte_black" ? 0x666666 : 0xdddddd });
    const thread1 = new THREE.Mesh(new THREE.BoxGeometry(holeOffset * 2.1, r * 0.08, r * 0.06), threadMat);
    thread1.position.z = thick * 0.40;
    btnG.add(thread1);
    const thread2 = new THREE.Mesh(new THREE.BoxGeometry(r * 0.08, holeOffset * 2.1, r * 0.06), threadMat);
    thread2.position.z = thick * 0.40;
    btnG.add(thread2);

    return btnG;
  }

  function createZipperMesh(startY, endY, radius, style, openPct = 0) {
    const zipG = new THREE.Group();
    let teethMat;
    if (style === "silver") {
      teethMat = new THREE.MeshPhysicalMaterial({ color: 0xe0e0e0, metalness: 0.95, roughness: 0.2 });
    } else if (style === "brass") {
      teethMat = new THREE.MeshPhysicalMaterial({ color: 0xc8963e, metalness: 0.88, roughness: 0.28 });
    } else if (style === "gunmetal") {
      teethMat = new THREE.MeshPhysicalMaterial({ color: 0x222226, metalness: 0.85, roughness: 0.35 });
    } else {
      teethMat = new THREE.MeshPhysicalMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });
    }
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85 });

    const len = Math.abs(startY - endY);
    const midY = (startY + endY) / 2;

    const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.024, len), tapeMat);
    tape.position.set(0, midY, radius + 0.002);
    zipG.add(tape);

    const teethCount = Math.max(12, Math.round(len / 0.008));
    const closedLimitY = startY - (startY - endY) * Math.min(0.5, openPct);

    for (let i = 0; i < teethCount; i++) {
      const frac = i / teethCount;
      const ty = startY - len * frac;
      const toothLen = 0.004;
      const toothThick = 0.002;
      const toothW = 0.007;

      if (ty < closedLimitY) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(toothW, toothLen, toothThick), teethMat);
        tooth.position.set(0, ty, radius + 0.004);
        zipG.add(tooth);
      } else {
        const spread = (ty - closedLimitY) * 0.25;
        const toothL = new THREE.Mesh(new THREE.BoxGeometry(toothW * 0.5, toothLen, toothThick), teethMat);
        toothL.position.set(-spread - 0.003, ty, radius + 0.004);
        const toothR = new THREE.Mesh(new THREE.BoxGeometry(toothW * 0.5, toothLen, toothThick), teethMat);
        toothR.position.set(spread + 0.003, ty, radius + 0.004);
        zipG.add(toothL, toothR);
      }
    }

    const sliderG = new THREE.Group();
    const sliderBody = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.008), teethMat);
    sliderG.add(sliderBody);

    const pullTab = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.028, 0.002), teethMat);
    pullTab.position.set(0, -0.018, 0.004);
    pullTab.rotation.x = 0.15;
    sliderG.add(pullTab);

    sliderG.position.set(0, closedLimitY, radius + 0.008);
    zipG.add(sliderG);

    return zipG;
  }

  function createBeltMesh(waistY, waistR, zScale, style, width = "medium", baseCol = 0x4f46e5) {
    const beltG = new THREE.Group();
    const h = width === "slim" ? 0.024 : (width === "wide" ? 0.058 : 0.036);
    const r = waistR * 1.035 + 0.016;

    let strapMat, buckleMat;
    if (style === "leather_gold") {
      strapMat = new THREE.MeshStandardMaterial({ color: 0x1a1918, roughness: 0.38, metalness: 0.05 });
      buckleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.22, metalness: 0.92 });
    } else if (style === "leather_silver") {
      strapMat = new THREE.MeshStandardMaterial({ color: 0x54392b, roughness: 0.42, metalness: 0.05 });
      buckleMat = new THREE.MeshStandardMaterial({ color: 0xe0e4e8, roughness: 0.18, metalness: 0.90 });
    } else if (style === "matte_black") {
      strapMat = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.65, metalness: 0.02 });
      buckleMat = new THREE.MeshStandardMaterial({ color: 0x222224, roughness: 0.45, metalness: 0.70 });
    } else {
      strapMat = new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.50, metalness: 0.05 });
      buckleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.22, metalness: 0.92 });
    }

    const strapGeo = new THREE.CylinderGeometry(r, r, h, 40, 1, true);
    const strapMesh = new THREE.Mesh(strapGeo, strapMat);
    strapMesh.position.y = waistY;
    strapMesh.scale.z = zScale;
    beltG.add(strapMesh);

    const bW = h * 1.45;
    const bH = h * 1.25;
    const bThick = 0.006;
    const buckleG = new THREE.Group();
    buckleG.position.set(0, waistY, r * zScale + 0.005);

    const shape = new THREE.Shape();
    shape.moveTo(-bW / 2, -bH / 2);
    shape.lineTo(bW / 2, -bH / 2);
    shape.lineTo(bW / 2, bH / 2);
    shape.lineTo(-bW / 2, bH / 2);
    shape.closePath();

    const hole = new THREE.Path();
    const inset = bH * 0.25;
    hole.moveTo(-bW / 2 + inset, -bH / 2 + inset);
    hole.lineTo(bW / 2 - inset, -bH / 2 + inset);
    hole.lineTo(bW / 2 - inset, bH / 2 - inset);
    hole.lineTo(-bW / 2 + inset, bH / 2 - inset);
    hole.closePath();
    shape.holes.push(hole);

    const buckleGeo = new THREE.ExtrudeGeometry(shape, { depth: bThick, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
    const buckleMesh = new THREE.Mesh(buckleGeo, buckleMat);
    buckleMesh.position.z = -bThick / 2;
    buckleG.add(buckleMesh);

    const prongGeo = new THREE.CylinderGeometry(0.002, 0.002, bH * 0.82, 8);
    const prongMesh = new THREE.Mesh(prongGeo, buckleMat);
    prongMesh.position.set(0, 0, bThick * 0.5);
    buckleG.add(prongMesh);

    beltG.add(buckleG);
    return beltG;
  }

  function buildAccessories(d) {
    if (!garmentGroup) return;
    if (accessoriesGroup) {
      garmentGroup.remove(accessoriesGroup);
      disposeObject3D(accessoriesGroup);
    }
    accessoriesGroup = new THREE.Group();
    accessoriesGroup.name = "accessories";
    garmentGroup.add(accessoriesGroup);

    const bCfg = accessoriesState.buttons;
    const zCfg = accessoriesState.zipper;
    const beltCfg = accessoriesState.belt;
    const waistYY = d.hipY + d.span * 0.44;
    const zScale = d.female ? 0.72 : 0.78;

    if (bCfg && bCfg.enabled) {
      const count = Math.max(1, Math.min(12, bCfg.count || 6));
      const style = bCfg.style || "gold";
      const baseCol = fabricState.bodice?.front?.color || 0x4f46e5;

      if (bCfg.placement === "front_placket") {
        const startY = d.hipY + d.span * 0.72;
        const endY = waistYY;
        const step = (startY - endY) / (count + 1);
        for (let i = 1; i <= count; i++) {
          const y = startY - step * i;
          const [, zFront] = getBodySurfacePoint(y, 0, d, 0.015);
          const btn = createButtonMesh(1.0, style, baseCol);
          btn.position.set(0, y, zFront);
          btn.userData.parentPart = "bodice";
          accessoriesGroup.add(btn);
        }
      } else if (bCfg.placement === "double_breasted") {
        const startY = d.hipY + d.span * 0.72;
        const endY = waistYY;
        const rows = Math.max(1, Math.round(count / 2));
        const step = (startY - endY) / (rows + 1);
        const colOffset = 0.042;
        for (let i = 1; i <= rows; i++) {
          const y = startY - step * i;
          const [, zFront] = getBodySurfacePoint(y, 0.28, d, 0.015);
          [-1, 1].forEach((col) => {
            const btn = createButtonMesh(1.0, style, baseCol);
            btn.position.set(col * colOffset, y, zFront);
            btn.userData.parentPart = "bodice";
            accessoriesGroup.add(btn);
          });
        }
      } else if (bCfg.placement === "waistband") {
        const [, zFront] = getBodySurfacePoint(waistYY, 0, d, 0.017);
        const btn = createButtonMesh(1.15, style, baseCol);
        btn.position.set(0, waistYY, zFront);
        btn.userData.parentPart = "trousers";
        accessoriesGroup.add(btn);
      } else if (bCfg.placement === "cuffs") {
        [-1, 1].forEach((s) => {
          for (let i = 0; i < Math.min(3, count); i++) {
            const btn = createButtonMesh(0.75, style, baseCol);
            btn.position.set(s * (d.shoulderHalf * 0.92 + d.upperR * 0.65), d.shoulderY - d.armLen * (0.82 + i * 0.04), 0);
            btn.rotation.y = (s * Math.PI) / 2;
            btn.userData.parentPart = "sleeve";
            accessoriesGroup.add(btn);
          }
        });
      }
    }

    if (zCfg && zCfg.enabled) {
      const style = zCfg.style || "silver";
      const openPct = zCfg.openPct || 0;
      const [, waistFrontZ] = getBodySurfacePoint(waistYY, 0, d, 0.015);
      const [, waistBackZ] = getBodySurfacePoint(waistYY, Math.PI, d, 0.015);

      if (zCfg.placement === "center_front") {
        const zip = createZipperMesh(d.hipY + d.span * 0.72, waistYY, waistFrontZ, style, openPct);
        zip.userData.parentPart = "bodice";
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "center_back") {
        const zip = createZipperMesh(d.hipY + d.span * 0.74, d.hipY, Math.abs(waistBackZ), style, openPct);
        zip.rotation.y = Math.PI;
        zip.userData.parentPart = "bodice";
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "biker_asymmetric") {
        const zip = createZipperMesh(d.shoulderY - d.span * 0.10, waistYY, waistFrontZ + 0.002, style, openPct);
        zip.position.x = 0.035;
        zip.rotation.z = -0.15;
        zip.userData.parentPart = "bodice";
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "trouser_fly") {
        const [, hipFrontZ] = getBodySurfacePoint(d.hipY, 0, d, 0.018);
        const zip = createZipperMesh(waistYY, d.hipY - d.span * 0.11, hipFrontZ, style, openPct);
        zip.userData.parentPart = "trousers";
        accessoriesGroup.add(zip);
      }
    }

    if (beltCfg && beltCfg.enabled) {
      const bStyle = beltCfg.style || "leather_gold";
      const bWidth = beltCfg.width || "medium";
      const baseCol = fabricState.bodice?.front?.color || fabricState.skirt?.front?.color || fabricState.trousers?.front?.color || 0x4f46e5;
      const belt = createBeltMesh(waistYY, d.waistR, zScale, bStyle, bWidth, baseCol);
      belt.userData.parentPart = "waist";
      accessoriesGroup.add(belt);
    }
  }

  function setAccessories(cfg) {
    if (!cfg) return;
    if (cfg.buttons) accessoriesState.buttons = { ...accessoriesState.buttons, ...cfg.buttons };
    if (cfg.zipper) accessoriesState.zipper = { ...accessoriesState.zipper, ...cfg.zipper };
    if (cfg.belt) accessoriesState.belt = { ...accessoriesState.belt, ...cfg.belt };
    if (ready && lastDims) {
      buildAccessories(lastDims);
      applyPieceVisibility();
    }
  }

  // ---------- Procedural Fashion Pattern & Print Generators ----------
  function generateFloralPattern() {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#faf7f2";
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = "#4a6b57";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 128); ctx.bezierCurveTo(140, 80, 180, 220, 256, 128);
    ctx.bezierCurveTo(340, 40, 420, 200, 512, 128);
    ctx.moveTo(0, 384); ctx.bezierCurveTo(140, 320, 180, 480, 256, 384);
    ctx.bezierCurveTo(340, 300, 420, 460, 512, 384);
    ctx.stroke();

    function drawLeaf(x, y, angle) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = "#5c8269";
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    [[90, 110, -0.4], [210, 150, 0.5], [340, 100, -0.3], [140, 360, 0.4], [310, 410, -0.5], [440, 370, 0.3]]
      .forEach(([x, y, a]) => drawLeaf(x, y, a));

    function drawFlower(x, y, centerCol, petalCol, scale = 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 3);
        ctx.fillStyle = petalCol;
        ctx.beginPath();
        ctx.ellipse(0, -18, 11, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = centerCol;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    [
      [128, 128, "#fcd34d", "#f472b6", 1.2],
      [384, 128, "#fbbf24", "#fb7185", 1.1],
      [256, 256, "#fcd34d", "#c084fc", 1.3],
      [128, 384, "#fbbf24", "#fb7185", 1.1],
      [384, 384, "#fcd34d", "#f472b6", 1.2],
    ].forEach(([x, y, c1, c2, s]) => drawFlower(x, y, c1, c2, s));

    return c.toDataURL("image/png");
  }

  function generateMonogramPattern() {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#1e1b18";
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = "rgba(212, 175, 55, 0.28)";
    ctx.lineWidth = 1.5;
    const step = 64;
    for (let x = -512; x <= 1024; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 512, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 512); ctx.lineTo(x + 512, 0); ctx.stroke();
    }

    ctx.fillStyle = "#d4af37";
    ctx.font = "bold 26px 'Playfair Display', serif, Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let y = 32; y < 512; y += 64) {
      for (let x = 32; x < 512; x += 64) {
        if (((x + y) / 64) % 2 === 0) {
          ctx.beginPath();
          ctx.arc(x, y, 18, 0, Math.PI * 2);
          ctx.strokeStyle = "#d4af37";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillText("B", x, y + 1);
        } else {
          ctx.beginPath();
          ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 5, y); ctx.closePath();
          ctx.fill();
        }
      }
    }
    return c.toDataURL("image/png");
  }

  function generateHoundstoothPattern() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = "#18181b";
    const s = 64;
    for (let ox = 0; ox < 128; ox += s) {
      for (let oy = 0; oy < 128; oy += s) {
        ctx.fillRect(ox, oy, s / 2, s / 2);
        ctx.beginPath();
        ctx.moveTo(ox + s / 2, oy + s / 2);
        ctx.lineTo(ox + s, oy + s / 2);
        ctx.lineTo(ox + s / 2, oy + s);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(ox, oy + s / 2);
        ctx.lineTo(ox + s / 4, oy + s / 2);
        ctx.lineTo(ox, oy + (3 * s) / 4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(ox + s / 2, oy);
        ctx.lineTo(ox + s / 2, oy + s / 4);
        ctx.lineTo(ox + (3 * s) / 4, oy);
        ctx.closePath();
        ctx.fill();
      }
    }
    return c.toDataURL("image/png");
  }

  function generateStripesPattern() {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 64, 64);

    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(0, 0, 24, 64);

    ctx.fillStyle = "#dc2626";
    ctx.fillRect(38, 0, 4, 64);

    return c.toDataURL("image/png");
  }

  function generatePolkaPattern() {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = "#18181b";
    [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
    });
    return c.toDataURL("image/png");
  }

  function generateAtelierPattern() {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BERRY ATELIER", 256, 180);

    ctx.font = "600 16px sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("• HAUTE COUTURE • EST. 2026 •", 256, 230);

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.strokeRect(64, 120, 384, 160);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 30px sans-serif";
    ctx.fillText("PARIS  •  MILAN  •  CAIRO", 256, 400);

    return c.toDataURL("image/png");
  }

  function generatePatternPreset(preset) {
    if (preset === "floral") return generateFloralPattern();
    if (preset === "monogram") return generateMonogramPattern();
    if (preset === "houndstooth") return generateHoundstoothPattern();
    if (preset === "stripes") return generateStripesPattern();
    if (preset === "polka") return generatePolkaPattern();
    if (preset === "atelier") return generateAtelierPattern();
    return null;
  }

  function setGarmentPrint(opts, maybeTarget) {
    if (typeof opts === "string") {
      const isPreset = ["none", "floral", "monogram", "houndstooth", "stripes", "polka", "atelier"].includes(opts);
      if (isPreset) opts = { preset: opts, target: maybeTarget || "all" };
      else opts = { dataURL: opts, target: maybeTarget || "all", isDrawing: opts.startsWith("data:image/png") };
    }
    opts = opts || {};
    const { target = "all", preset, dataURL, rawDrawingURL, repeat, isDrawing } = opts;
    let url = dataURL;
    if (preset) {
      url = preset === "none" ? null : generatePatternPreset(preset);
    }

    const partsToUpdate = target === "all" || !target
      ? ["bodice", "skirt", "trousers", "sleeve"]
      : [target];

    partsToUpdate.forEach((part) => {
      if (!fabricState[part]) return;
      fabricState[part].front.textureDataURL = url;
      fabricState[part].front.rawDrawingURL = url ? (rawDrawingURL || (isDrawing ? url : null)) : null;
      fabricState[part].front.isDrawing = !!isDrawing;
      if (repeat != null) fabricState[part].front.textureRepeat = repeat;
      else if (isDrawing) fabricState[part].front.textureRepeat = 1;
      else if (preset && (preset === "houndstooth" || preset === "polka" || preset === "stripes")) fabricState[part].front.textureRepeat = 8;
      else fabricState[part].front.textureRepeat = FABRIC_TEXTURE_REPEAT;

      if (fabricState[part].back) {
        fabricState[part].back.textureDataURL = url;
        fabricState[part].back.rawDrawingURL = fabricState[part].front.rawDrawingURL;
        fabricState[part].back.isDrawing = !!isDrawing;
        fabricState[part].back.textureRepeat = fabricState[part].front.textureRepeat;
      }
    });

    applyFabric();
    return url;
  }

  // ---------- Optional custom GLB upload cleanup helpers ----------
  function stripPedestal(group) {
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const geo = o.geometry;
      const pos = geo.attributes.position;
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const height = bb.max.y - bb.min.y;
      if (height <= 0) return;
      const nBins = 20;
      const counts = new Array(nBins).fill(0);
      const maxR = new Array(nBins).fill(0);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        let bin = Math.floor(((y - bb.min.y) / height) * nBins);
        if (bin >= nBins) bin = nBins - 1;
        if (bin < 0) bin = 0;
        counts[bin]++;
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        if (r > maxR[bin]) maxR[bin] = r;
      }
      let refN = 0, refR = 0, n = 0;
      for (let b = 3; b < 6; b++) {
        if (counts[b] > 0) { refN += counts[b]; refR += maxR[b]; n++; }
      }
      if (!n) return;
      refN /= n; refR /= n;
      if (!refR || !refN) return;
      const pedestalBins = [];
      for (let b = 0; b < 3; b++) {
        if (counts[b] / refN > 3.5 || maxR[b] / refR > 1.8) pedestalBins.push(b);
        else break;
      }
      if (!pedestalBins.length) return;
      const cutoffY = bb.min.y + (height * (pedestalBins[pedestalBins.length - 1] + 1)) / nBins;
      const idx = geo.getIndex();
      const triCount = idx ? idx.count / 3 : pos.count / 3;
      const vIdx = (k) => (idx ? idx.getX(k) : k);
      const keep = [];
      for (let tIdx = 0; tIdx < triCount; tIdx++) {
        const i0 = vIdx(tIdx * 3), i1 = vIdx(tIdx * 3 + 1), i2 = vIdx(tIdx * 3 + 2);
        if (pos.getY(i0) < cutoffY || pos.getY(i1) < cutoffY || pos.getY(i2) < cutoffY) continue;
        keep.push(i0, i1, i2);
      }
      if (keep.length === triCount * 3) return;
      const Arr = pos.count > 65535 ? Uint32Array : Uint16Array;
      geo.setIndex(new THREE.BufferAttribute(new Arr(keep), 1));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
    });
  }

  function keepLargestComponent(group) {
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const geo = o.geometry;
      const pos = geo.attributes.position;
      const idx = geo.getIndex();
      const triCount = idx ? idx.count / 3 : pos.count / 3;
      const vIdx = (k) => (idx ? idx.getX(k) : k);
      const parent = new Int32Array(pos.count);
      for (let i = 0; i < parent.length; i++) parent[i] = i;
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
      const tris = new Array(triCount);
      for (let tIdx = 0; tIdx < triCount; tIdx++) {
        const i0 = vIdx(tIdx * 3), i1 = vIdx(tIdx * 3 + 1), i2 = vIdx(tIdx * 3 + 2);
        tris[tIdx] = [i0, i1, i2];
        union(i0, i1); union(i1, i2);
      }
      const sizes = new Map();
      for (let i = 0; i < parent.length; i++) { const r = find(i); sizes.set(r, (sizes.get(r) || 0) + 1); }
      let largestRoot = -1, largestSize = -1;
      sizes.forEach((size, r) => { if (size > largestSize) { largestSize = size; largestRoot = r; } });
      if (largestRoot < 0) return;
      const dropThreshold = pos.count * 0.005;
      const keep = [];
      let dropped = false;
      for (const [i0, i1, i2] of tris) {
        const r = find(i0);
        if (r !== largestRoot && sizes.get(r) > dropThreshold) { dropped = true; continue; }
        keep.push(i0, i1, i2);
      }
      if (!dropped) return;
      const Arr = pos.count > 65535 ? Uint32Array : Uint16Array;
      geo.setIndex(new THREE.BufferAttribute(new Arr(keep), 1));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
    });
  }

  async function loadGLB(category, m, onProgress, patternMetrics = null) {
    if (!GLTFLoader) throw new Error("no loader");
    const url = avatarURLs[category];
    const avatarId = (url.match(/([^/]+)\.glb(?:[?#].*)?$/i) || [])[1];
    const gltf = await loadGLTFWithRetry(url, onProgress);
    disposeObject3D(bodyGroup);
    disposeObject3D(garmentGroup);
    root.clear();
    limbs = {};
    activeMannequin = null;
    bodyGroup = cloneSkeleton(gltf.scene);
    root.add(bodyGroup);
    bodyGroup.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    stripPedestal(bodyGroup);
    keepLargestComponent(bodyGroup);
    const box = new THREE.Box3().setFromObject(bodyGroup);
    const size = new THREE.Vector3();
    box.getSize(size);
    const H = cm(m.height);
    curH = H;
    const sc = H / (size.y || 1);
    bodyGroup.scale.setScalar(sc);
    const box2 = new THREE.Box3().setFromObject(bodyGroup);
    bodyGroup.position.y -= box2.min.y;
    curCategory = category;
    curMeasurements = m;
    lastDims = computeBodyDims(category, m, AVATAR_LANDMARK_OVERRIDES[avatarId]);
    buildGarment(category, m, lastDims, patternMetrics);
    controls.target.set(0, H * 0.51, 0);
    frameCamera(H);
  }

  // ---------- public build ----------
  let buildToken = 0;
  let hasFramedOnce = false;
  let lastFramedCategory = null;
  async function build(category, m, opts) {
    if (!ready) return;
    curCategory = category;
    curMeasurements = m;
    opts = opts || {};
    if (typeof opts === "number") opts = { color: opts };

    if (opts.resetPrints) {
      Object.values(fabricState).forEach((st) => {
        st.front.textureDataURL = null;
        st.front.rawDrawingURL = null;
        st.front.isDrawing = false;
        if (st.back) {
          st.back.textureDataURL = null;
          st.back.rawDrawingURL = null;
          st.back.isDrawing = false;
        }
      });
    }

    if (opts.parts) {
      Object.entries(opts.parts).forEach(([part, v]) => {
        if (!fabricState[part] || !v) return;
        if (v.front) {
          if (v.front.color != null) {
            fabricState[part].front.color = v.front.color;
            if (fabricState[part].front.isDrawing && fabricState[part].front.rawDrawingURL) {
              retextureDrawingSlot(fabricState[part].front, v.front.color);
            }
          }
          if (v.front.material) fabricState[part].front.material = v.front.material;
          if (v.front.textureDataURL) {
            fabricState[part].front.textureDataURL = v.front.textureDataURL;
            fabricState[part].front.isDrawing = false;
            fabricState[part].front.rawDrawingURL = null;
          } else if (v.front.textureDataURL === null && !fabricState[part].front.isDrawing && !fabricState[part].front.textureDataURL) {
            fabricState[part].front.textureDataURL = null;
          }
        }
        fabricState[part].back = v.back ? { ...fabricState[part].back, ...v.back } : null;
      });
    } else {
      Object.values(fabricState).forEach((st) => {
        if (opts.color != null) st.front.color = opts.color;
        if (opts.material) st.front.material = opts.material;
        st.back = null;
      });
    }
    if (opts.opacity != null) Object.values(fabricState).forEach((st) => { st.opacity = opts.opacity; });
    if (opts.pieces !== undefined) lastPieceVis = opts.pieces;
    const incomingMetrics = opts.patternMetrics || null;
    const preserveCamera = hasFramedOnce && lastFramedCategory === category && !opts.resetCamera;

    const token = ++buildToken;
    onLoading(true, { progress: 0 });
    await nextFrame();
    if (token !== buildToken) return;
    scene.background = gradientBackdrop();

    try {
      const url = avatarURLs[category];
      const isCustomUserUpload = url && !url.startsWith("avatars/") && !opts.forceMannequin;
      if (isCustomUserUpload) {
        try {
          await loadGLB(category, m, (pct) => { if (token === buildToken) onLoading(true, { progress: pct }); }, incomingMetrics);
          if (tensionMapEnabled) applyTensionHeatmap();
          else applyFabric();
          applyPieceVisibility();
        } catch (e) {
          if (token === buildToken) onAvatarIssue(category, e);
          buildProcedural(category, m, incomingMetrics, preserveCamera);
          if (tensionMapEnabled) applyTensionHeatmap();
          else applyFabric();
          applyPieceVisibility();
        }
      } else {
        buildProcedural(category, m, incomingMetrics, preserveCamera);
        if (tensionMapEnabled) applyTensionHeatmap();
        else applyFabric();
        applyPieceVisibility();
      }
      hasFramedOnce = true;
      lastFramedCategory = category;
    } catch (e) {
      console.error("[View3D] avatar build failed:", e);
      if (token === buildToken) onAvatarIssue(category, e);
    } finally {
      if (token === buildToken) onLoading(false);
    }
  }

  function frameCamera(H) {
    camera.near = 0.05;
    camera.far = 100;
    const narrow = host && host.clientWidth > 0 && host.clientWidth < 560;
    const dMul = narrow ? 1.12 : 1.0;
    const tY = H * (narrow ? 0.555 : 0.52);
    camera.position.set(H * 0.24 * dMul, H * 0.56, H * 2.12 * dMul);
    if (controls) {
      controls.target.set(0, tY, 0);
      controls.update();
    }
    camera.updateProjectionMatrix();
  }

  function setCameraPreset(preset = "front") {
    if (!ready || !camera || !controls) return;
    const H = curH || 1.7;
    const narrow = host && host.clientWidth > 0 && host.clientWidth < 560;
    const dMul = narrow ? 1.12 : 1.0;
    const tY = H * (narrow ? 0.555 : 0.52);
    if (preset === "front") {
      camera.position.set(0, H * 0.55, H * 2.12 * dMul);
      controls.target.set(0, tY, 0);
    } else if (preset === "threeQuarter") {
      camera.position.set(H * 0.72 * dMul, H * 0.57, H * 1.98 * dMul);
      controls.target.set(0, tY, 0);
    } else if (preset === "side") {
      camera.position.set(H * 2.08 * dMul, H * 0.55, 0.04);
      controls.target.set(0, tY, 0);
    } else if (preset === "back") {
      camera.position.set(0, H * 0.56, -H * 2.12 * dMul);
      controls.target.set(0, tY, 0);
    } else if (preset === "face") {
      camera.position.set(H * 0.12, H * 0.89, H * 0.72);
      controls.target.set(0, H * 0.86, 0);
    }
    controls.update();
    camera.updateProjectionMatrix();
  }

  function retextureDrawingSlot(slot, colorVal) {
    if (!slot || !slot.rawDrawingURL || typeof document === "undefined") return;
    const hex = typeof colorVal === "number" ? "#" + colorVal.toString(16).padStart(6, "0") : colorVal;
    try {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || 512;
        c.height = img.naturalHeight || 512;
        const ctx = c.getContext("2d");
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        slot.textureDataURL = c.toDataURL("image/png");
        applyFabric();
      };
      img.src = slot.rawDrawingURL;
    } catch (_) { /* ignore */ }
  }

  // ---------- live fabric / visibility ----------
  function setFabric({ parts, color, material, opacity } = {}) {
    if (opacity != null) Object.values(fabricState).forEach((st) => { st.opacity = opacity; });
    if (parts) {
      Object.entries(parts).forEach(([part, v]) => {
        if (!fabricState[part] || !v) return;
        if (v.front) {
          if (v.front.color != null) {
            fabricState[part].front.color = v.front.color;
            if (fabricState[part].front.rawDrawingURL) retextureDrawingSlot(fabricState[part].front, v.front.color);
          }
          if (v.front.material) fabricState[part].front.material = v.front.material;
          if (v.front.textureDataURL !== undefined) {
            fabricState[part].front.textureDataURL = v.front.textureDataURL || null;
            if (!v.front.textureDataURL) fabricState[part].front.rawDrawingURL = null;
          }
        }
        if (v.back) {
          fabricState[part].back = v.back ? { ...fabricState[part].back, ...v.back } : null;
          if (fabricState[part].back && fabricState[part].back.color != null && fabricState[part].back.rawDrawingURL) {
            retextureDrawingSlot(fabricState[part].back, fabricState[part].back.color);
          }
        } else {
          fabricState[part].back = null;
        }
      });
    } else if (color != null || material) {
      Object.values(fabricState).forEach((st) => {
        if (color != null) {
          st.front.color = color;
          if (st.front.rawDrawingURL) retextureDrawingSlot(st.front, color);
        }
        if (material) st.front.material = material;
        st.back = null;
      });
    }
    applyFabric();
  }

  function applyFabric() {
    if (!garmentGroup) return;
    if (tensionMapEnabled) {
      applyTensionHeatmap();
      return;
    }
    const visited = new Set();
    const applyToMesh = (o) => {
      if (!o.isMesh || visited.has(o)) return;
      visited.add(o);
      if (fabricState[o.name]) {
        const oldMat = o.userData.origMat;
        o.material = fabricMat(o.name, o.userData.side || "front");
        o.userData.origMat = o.material;
        if (oldMat && oldMat !== o.material) disposeMaterial(oldMat);
      }
    };
    garmentGroup.traverse(applyToMesh);
    Object.values(limbs).forEach((g) => g && g.traverse && g.traverse(applyToMesh));
  }

  // ---------- Tension Simulation, Heatmap & 3D OBJ Export ----------
  function computeTensionHeatmapColor(easeCm, fPreset) {
    let r = 0, g = 0, b = 0;
    const stiffRatio = (fPreset.structStiff || 0.95) / (fPreset.maxStrain || 1.05);

    if (easeCm >= 8.0) {
      const u = Math.min(1, (easeCm - 8.0) / 8.0);
      r = 0.15 * (1 - u) + 0.10 * u;
      g = 0.45 * (1 - u) + 0.70 * u;
      b = 0.95;
    } else if (easeCm >= 3.0) {
      const u = (easeCm - 3.0) / 5.0;
      r = 0.10 * (1 - u) + 0.15 * u;
      g = 0.82 * (1 - u) + 0.65 * u;
      b = 0.35 * (1 - u) + 0.95 * u;
    } else if (easeCm >= 0.8) {
      const u = (3.0 - easeCm) / 2.2;
      r = 0.10 * (1 - u) + 0.96 * u;
      g = 0.82 * (1 - u) + 0.75 * u;
      b = 0.35 * (1 - u) + 0.10 * u;
    } else {
      const u = Math.min(1, Math.max(0, ((0.8 - easeCm) / 1.8) * stiffRatio));
      r = 0.96 * (1 - u) + 0.95 * u;
      g = 0.75 * (1 - u) + 0.18 * u;
      b = 0.10 * (1 - u) + 0.15 * u;
    }
    return [r, g, b];
  }

  function computeVertexStrain(easeCm, fPreset) {
    const stiffRatio = (fPreset.structStiff || 0.95) / (fPreset.maxStrain || 1.05);
    if (easeCm < 0) {
      return Math.min(100, (Math.abs(easeCm) / 5.0) * 100 * stiffRatio);
    }
    if (easeCm < 2.0) {
      return ((2.0 - easeCm) / 2.0) * 5.0 * stiffRatio;
    }
    return 0.0;
  }

  function applyTensionHeatmap() {
    if (!garmentGroup || !ready) return;
    const d = lastDims || computeBodyDims(curCategory, curMeasurements || { height: 170, chest: 92, waist: 72, hips: 98, shoulder: 40, neck: 36, bicep: 28, thigh: 54 });
    const currentFabricKey = fabricState.bodice?.front?.material || "cotton";
    const fPreset = FABRIC[currentFabricKey] || FABRIC.cotton;

    let totalEase = 0;
    let vertexCount = 0;
    let maxStrainPct = 0;
    let minEase = 999;

    const processMesh = (mesh) => {
      if (!mesh || !mesh.isMesh || !mesh.geometry || !mesh.visible) return;
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      if (!pos) return;

      const count = pos.count;
      let colAttr = geo.attributes.color;
      if (!colAttr || colAttr.count !== count) {
        colAttr = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3);
        geo.setAttribute("color", colAttr);
      }
      const colArray = colAttr.array;

      mesh.updateMatrixWorld(true);
      const isSleeve = mesh.name === "sleeve";
      const isTrousers = mesh.name === "trousers";

      const v = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        // Sample bind-pose coordinates for stable anatomical ease comparison
        v.fromBufferAttribute(pos, i);
        const y = v.y;
        let easeCm = 3.6;

        if (isSleeve) {
          const sideSign = v.x >= 0 ? 1 : -1;
          const armLocalX = v.x - sideSign * d.shoulderHalf * 0.90;
          const garmentR = Math.hypot(armLocalX, v.z);
          const dy = Math.max(0, d.shoulderY - d.span * 0.04 - y);
          const armFrac = clamp(dy / Math.max(0.2, d.armLen), 0, 1);
          const bodyArmR = d.upperR * (1.02 * (1 - armFrac) + 0.44 * armFrac);
          easeCm = (garmentR - bodyArmR) * 100 * 2 * Math.PI * 0.25;
        } else if (isTrousers && y < d.hipY - d.span * 0.14) {
          const legSign = v.x >= 0 ? 1 : -1;
          const legCx = legSign * d.hipR * (d.female ? 0.47 : 0.49);
          const garmentR = Math.hypot(v.x - legCx, v.z);
          const legFrac = clamp((y - d.H * 0.05) / Math.max(0.2, d.hipY - d.H * 0.05), 0, 1);
          const bodyLegR = d.thighR * (0.42 + 0.56 * legFrac);
          easeCm = (garmentR - bodyLegR) * 100 * 2.2;
        } else {
          const phi = Math.atan2(v.x, v.z);
          const [bx, bz] = getBodySurfacePoint(y, phi, d, 0);
          const garmentR = Math.hypot(v.x, v.z);
          const bodyR = Math.hypot(bx, bz);
          easeCm = (garmentR - bodyR) * 100 * 2.5;
        }

        totalEase += easeCm;
        vertexCount++;
        if (easeCm < minEase) minEase = easeCm;

        const strainPct = computeVertexStrain(easeCm, fPreset);
        if (strainPct > maxStrainPct) maxStrainPct = strainPct;

        const [r, g, b] = computeTensionHeatmapColor(easeCm, fPreset);
        colArray[i * 3] = r;
        colArray[i * 3 + 1] = g;
        colArray[i * 3 + 2] = b;
      }

      colAttr.needsUpdate = true;

      if (!mesh.userData.origMat) {
        mesh.userData.origMat = mesh.material;
      }
      if (!mesh.userData.tensionMat) {
        mesh.userData.tensionMat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.58,
          metalness: 0.04,
          side: THREE.DoubleSide,
        });
      }
      mesh.material = mesh.userData.tensionMat;
    };

    const visitedTension = new Set();
    const processMeshSafe = (o) => {
      if (!o.isMesh || visitedTension.has(o)) return;
      visitedTension.add(o);
      if (fabricState[o.name]) processMesh(o);
    };
    garmentGroup.traverse(processMeshSafe);
    Object.values(limbs).forEach((g) => g && g.traverse && g.traverse(processMeshSafe));

    const avgEase = vertexCount > 0 ? totalEase / vertexCount : 4.5;
    let status = "fitOptimal";
    if (maxStrainPct > 5 || minEase < 0) status = "fitTight";
    else if (minEase < 2.0) status = "fitSnug";
    else if (avgEase > 10.0) status = "fitLoose";

    lastTensionMetrics = {
      avgEase: parseFloat(avgEase.toFixed(1)),
      peakStrain: parseFloat(maxStrainPct.toFixed(1)),
      status,
      fabric: currentFabricKey,
    };

    onTensionMetricsUpdate(lastTensionMetrics);
  }

  function restoreOriginalMaterials() {
    if (!garmentGroup) return;
    const visitedRestore = new Set();
    const restoreMesh = (o) => {
      if (!o.isMesh || visitedRestore.has(o)) return;
      visitedRestore.add(o);
      if (o.userData.origMat) o.material = o.userData.origMat;
      else if (fabricState[o.name]) o.material = fabricMat(o.name, o.userData.side || "front");
    };
    garmentGroup.traverse(restoreMesh);
    Object.values(limbs).forEach((g) => g && g.traverse && g.traverse(restoreMesh));
  }

  function setTensionMap(v) {
    tensionMapEnabled = !!v;
    if (tensionMapEnabled) applyTensionHeatmap();
    else restoreOriginalMaterials();
  }

  function setFabricPreset(key) {
    if (!FABRIC[key]) return;
    Object.values(fabricState).forEach((st) => {
      if (st.front) st.front.material = key;
      if (st.back) st.back.material = key;
    });
    if (tensionMapEnabled) applyTensionHeatmap();
    else applyFabric();
  }

  function exportOBJ(filename = "garment_3d.obj") {
    if (!garmentGroup) return null;
    let obj = "# BerryStudio 3D Garment Mesh Export\n";
    obj += `# Generated: ${new Date().toISOString()}\n`;
    obj += `# Category: ${curCategory}\n\n`;

    let vOffset = 1;
    let vnOffset = 1;
    let vtOffset = 1;

    if (activeMannequin && activeMannequin.skeleton) {
      bodyGroup.updateMatrixWorld(true);
      activeMannequin.skeleton.update();
    }

    const exportMesh = (mesh, name) => {
      if (!mesh || !mesh.isMesh || !mesh.geometry) return;
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      if (!pos) return;

      mesh.updateMatrixWorld(true);
      const matrixWorld = mesh.matrixWorld;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);

      obj += `o ${name || mesh.name || "garment_piece"}\n`;

      const norm = geo.attributes.normal;
      const uv = geo.attributes.uv;
      const idx = geo.index;

      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        if (mesh.isSkinnedMesh && typeof mesh.getVertexPosition === "function") {
          mesh.getVertexPosition(i, v).applyMatrix4(matrixWorld);
        } else {
          v.fromBufferAttribute(pos, i).applyMatrix4(matrixWorld);
        }
        obj += `v ${v.x.toFixed(5)} ${v.y.toFixed(5)} ${v.z.toFixed(5)}\n`;
      }

      if (norm) {
        const n = new THREE.Vector3();
        for (let i = 0; i < norm.count; i++) {
          n.fromBufferAttribute(norm, i).applyMatrix3(normalMatrix).normalize();
          obj += `vn ${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)}\n`;
        }
      }

      if (uv) {
        for (let i = 0; i < uv.count; i++) {
          obj += `vt ${uv.getX(i).toFixed(4)} ${uv.getY(i).toFixed(4)}\n`;
        }
      }

      const hasNorm = !!norm;
      const hasUv = !!uv;
      const triCount = idx ? idx.count / 3 : pos.count / 3;

      for (let tIdx = 0; tIdx < triCount; tIdx++) {
        const i0 = (idx ? idx.getX(tIdx * 3) : tIdx * 3) + vOffset;
        const i1 = (idx ? idx.getX(tIdx * 3 + 1) : tIdx * 3 + 1) + vOffset;
        const i2 = (idx ? idx.getX(tIdx * 3 + 2) : tIdx * 3 + 2) + vOffset;

        if (hasUv && hasNorm) {
          const u0 = (idx ? idx.getX(tIdx * 3) : tIdx * 3) + vtOffset;
          const u1 = (idx ? idx.getX(tIdx * 3 + 1) : tIdx * 3 + 1) + vtOffset;
          const u2 = (idx ? idx.getX(tIdx * 3 + 2) : tIdx * 3 + 2) + vtOffset;
          const n0 = (idx ? idx.getX(tIdx * 3) : tIdx * 3) + vnOffset;
          const n1 = (idx ? idx.getX(tIdx * 3 + 1) : tIdx * 3 + 1) + vnOffset;
          const n2 = (idx ? idx.getX(tIdx * 3 + 2) : tIdx * 3 + 2) + vnOffset;
          obj += `f ${i0}/${u0}/${n0} ${i1}/${u1}/${n1} ${i2}/${u2}/${n2}\n`;
        } else if (hasNorm) {
          const n0 = (idx ? idx.getX(tIdx * 3) : tIdx * 3) + vnOffset;
          const n1 = (idx ? idx.getX(tIdx * 3 + 1) : tIdx * 3 + 1) + vnOffset;
          const n2 = (idx ? idx.getX(tIdx * 3 + 2) : tIdx * 3 + 2) + vnOffset;
          obj += `f ${i0}//${n0} ${i1}//${n1} ${i2}//${n2}\n`;
        } else {
          obj += `f ${i0} ${i1} ${i2}\n`;
        }
      }

      vOffset += pos.count;
      if (norm) vnOffset += norm.count;
      if (uv) vtOffset += uv.count;
      obj += "\n";
    };

    const exportedMeshes = new Set();
    const exportOnce = (o, defaultName) => {
      if (!o.isMesh || !o.visible || exportedMeshes.has(o)) return;
      exportedMeshes.add(o);
      exportMesh(o, defaultName);
    };

    garmentGroup.traverse((o) => {
      exportOnce(o, `${o.name}_${o.userData.side || "mesh"}`);
    });

    Object.entries(limbs).forEach(([limbName, group]) => {
      if (!group || !group.traverse) return;
      group.traverse((o) => {
        if (o.name === "sleeve" || o.name === "trousers") {
          exportOnce(o, `${o.name}_${limbName}`);
        }
      });
    });

    if (typeof document !== "undefined" && typeof Blob !== "undefined") {
      try {
        const blob = new Blob([obj], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch (e) {
        console.warn("[View3D] Blob download failed:", e);
      }
    }

    return obj;
  }

  let lastPieceVis = null;
  function setPieceVisibility(pieces) {
    lastPieceVis = pieces;
    applyPieceVisibility();
  }

  function applyPieceVisibility() {
    if (!garmentGroup) return;

    const setVis = (name, v) => {
      const visited = new Set();
      const visit = (o) => {
        if (visited.has(o)) return;
        visited.add(o);
        if (o.name === name) {
          o.visible = v;
        }
      };
      garmentGroup.traverse(visit);
      Object.values(limbs).forEach((g) => g && g.traverse && g.traverse(visit));
    };

    const present = { bodice: false, sleeve: false, skirt: false, trousers: false };
    const vis = { bodice: false, sleeve: false, skirt: false, trousers: false };
    (lastPieceVis || []).forEach((p) => {
      const part = Object.prototype.hasOwnProperty.call(present, p.part) ? p.part : "bodice";
      present[part] = true;
      if (p.visible !== false) vis[part] = true;
    });

    const defaultPartVisible = (part) => {
      if (part === "trousers") return curCategory === "men" || curCategory === "boys";
      if (part === "skirt") return curCategory === "women" || curCategory === "girls";
      return true;
    };
    const show = (part) => (lastPieceVis !== null ? !!(present[part] && vis[part]) : defaultPartVisible(part));

    setVis("bodice", show("bodice"));
    setVis("sleeve", show("sleeve"));
    setVis("skirt", show("skirt"));
    setVis("trousers", show("trousers"));

    if (accessoriesGroup) {
      const accVisited = new Set();
      accessoriesGroup.traverse((o) => {
        if (accVisited.has(o)) return;
        accVisited.add(o);
        if (o.userData && o.userData.parentPart) {
          if (o.userData.parentPart === "waist") {
            o.visible = show("bodice") || show("skirt") || show("trousers");
          } else {
            o.visible = show(o.userData.parentPart);
          }
        }
      });
    }
  }

  // ---------- Natural Runway Gait & Animation Loop ----------
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!ready) return;
    t += 0.016;
    if (walking && limbs.leg1) {
      const isKid = curCategory === "girls" || curCategory === "boys";
      const isWoman = curCategory === "women";
      const freq = isKid ? 3.6 : 3.1;
      const sw = Math.sin(t * freq) * (isKid ? 0.28 : (isWoman ? 0.31 : 0.33));

      // Hip / thigh swing
      limbs.leg1.rotation.x = sw;
      limbs["leg-1"].rotation.x = -sw;

      // Knee backward flexion (trailing leg clears ground smoothly, forward leg straightens for heel strike)
      if (limbs.knee1 && limbs["knee-1"]) {
        const k1 = Math.max(0, sw * 1.48) + (sw > 0 ? Math.abs(Math.sin(t * freq)) * 0.14 : 0);
        const k2 = Math.max(0, -sw * 1.48) + (sw < 0 ? Math.abs(Math.sin(t * freq)) * 0.14 : 0);
        limbs.knee1.rotation.x = k1;
        limbs["knee-1"].rotation.x = k2;
      }

      // Ankle pitch / foot roll
      if (limbs.foot1 && limbs["foot-1"]) {
        limbs.foot1.rotation.x = sw * 0.24;
        limbs["foot-1"].rotation.x = -sw * 0.24;
      }

      // Arm swing opposing leg swing; outward abduction (+angle on +X arm1, -angle on -X arm-1)
      limbs.arm1.rotation.x = -sw * 0.62;
      limbs["arm-1"].rotation.x = sw * 0.62;
      const abduct = 0.088 + Math.abs(sw) * 0.024;
      limbs.arm1.rotation.z = abduct;
      limbs["arm-1"].rotation.z = -abduct;

      // Elbow natural forward flexion
      if (limbs.elbow1 && limbs["elbow-1"]) {
        limbs.elbow1.rotation.x = -0.14 - Math.max(0, -sw * 0.55) * 0.36;
        limbs["elbow-1"].rotation.x = -0.14 - Math.max(0, sw * 0.55) * 0.36;
      }

      // Subtle wrist cadence
      if (limbs.hand1 && limbs["hand-1"]) {
        limbs.hand1.rotation.x = sw * 0.12;
        limbs["hand-1"].rotation.x = -sw * 0.12;
      }

      // Pelvic vertical bob & subtle organic spinal S-motion
      const bob = Math.abs(Math.sin(t * freq)) * (isKid ? 0.013 : 0.011);
      if (bodyGroup) bodyGroup.position.y = bob;
      if (garmentGroup) garmentGroup.position.y = bob;

      const rollAmp = isWoman ? 0.022 : (isKid ? 0.014 : 0.011);
      const roll = Math.sin(t * freq) * rollAmp;
      const yawAmp = isWoman ? 0.022 : (isKid ? 0.016 : 0.028);
      const yaw = -Math.sin(t * freq) * yawAmp;

      if (limbs.pelvis && limbs.chest) {
        limbs.pelvis.rotation.z = roll;
        limbs.pelvis.rotation.y = -yaw * 0.45;
        if (limbs.spine) limbs.spine.rotation.z = -roll * 0.55;
        limbs.chest.rotation.y = yaw * 0.85;
        limbs.chest.rotation.z = -roll * 0.35;
      } else {
        if (bodyGroup) { bodyGroup.rotation.z = roll; bodyGroup.rotation.y = yaw; }
        if (garmentGroup) { garmentGroup.rotation.z = roll; garmentGroup.rotation.y = yaw; }
      }

      // Head stabilization keeps gaze steady down the runway
      if (limbs.head) {
        limbs.head.rotation.y = -yaw * 0.55;
        limbs.head.rotation.z = -roll * 0.20;
      }

      // Gentle dynamic hem flare on skirts during stride
      if (skirtFrontMesh && skirtBackMesh) {
        const strideMag = Math.abs(sw);
        skirtFrontMesh.position.z = strideMag * (curH * 0.035);
        skirtFrontMesh.scale.z = 1.0 + strideMag * 0.32;
        skirtBackMesh.position.z = -strideMag * (curH * 0.030);
        skirtBackMesh.scale.z = 1.0 + strideMag * 0.28;
      }
    } else if (limbs.leg1) {
      // Smooth damping back to neutral fashion stance
      limbs.leg1.rotation.x *= 0.86;
      limbs["leg-1"].rotation.x *= 0.86;
      if (limbs.knee1 && limbs["knee-1"]) {
        limbs.knee1.rotation.x *= 0.86;
        limbs["knee-1"].rotation.x *= 0.86;
      }
      if (limbs.foot1 && limbs["foot-1"]) {
        limbs.foot1.rotation.x *= 0.86;
        limbs["foot-1"].rotation.x *= 0.86;
      }
      limbs.arm1.rotation.x *= 0.86;
      limbs["arm-1"].rotation.x *= 0.86;
      limbs.arm1.rotation.z = limbs.arm1.rotation.z * 0.86 + 0.085 * 0.14;
      limbs["arm-1"].rotation.z = limbs["arm-1"].rotation.z * 0.86 + (-0.085) * 0.14;
      if (limbs.elbow1 && limbs["elbow-1"]) {
        limbs.elbow1.rotation.x = limbs.elbow1.rotation.x * 0.86 + (-0.10) * 0.14;
        limbs["elbow-1"].rotation.x = limbs["elbow-1"].rotation.x * 0.86 + (-0.10) * 0.14;
      }
      if (limbs.hand1 && limbs["hand-1"]) {
        limbs.hand1.rotation.x *= 0.86;
        limbs["hand-1"].rotation.x *= 0.86;
      }
      if (limbs.pelvis) {
        limbs.pelvis.rotation.z *= 0.86;
        limbs.pelvis.rotation.y *= 0.86;
      }
      if (limbs.spine) limbs.spine.rotation.z *= 0.86;
      if (limbs.chest) {
        limbs.chest.rotation.y *= 0.86;
        limbs.chest.rotation.z *= 0.86;
      }
      if (limbs.head) {
        limbs.head.rotation.y *= 0.86;
        limbs.head.rotation.z *= 0.86;
      }
      if (bodyGroup) {
        bodyGroup.position.y *= 0.86;
        bodyGroup.rotation.z *= 0.86;
        bodyGroup.rotation.y *= 0.86;
      }
      if (garmentGroup) {
        garmentGroup.position.y *= 0.86;
        garmentGroup.rotation.z *= 0.86;
        garmentGroup.rotation.y *= 0.86;
      }
      if (skirtFrontMesh && skirtBackMesh) {
        skirtFrontMesh.position.z *= 0.85;
        skirtFrontMesh.scale.z = skirtFrontMesh.scale.z * 0.85 + 0.15;
        skirtBackMesh.position.z *= 0.85;
        skirtBackMesh.scale.z = skirtBackMesh.scale.z * 0.85 + 0.15;
      }
    }
    controls.update();
    renderer.render(scene, camera);
  }

  // ---------- misc ----------
  function resize() {
    if (!ready) { fallback(); return; }
    const r = host.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = (r.width || 1) / (r.height || 1);
    camera.updateProjectionMatrix();
  }

  function fallback() {
    onFatalError();
    const c = host.getContext && host.getContext("2d");
    if (!c) return;
    host.width = host.clientWidth;
    host.height = host.clientHeight;
    c.fillStyle = "#8b93a7";
    c.font = "600 14px Inter, sans-serif";
    c.textAlign = "center";
    c.fillText("3D preview needs WebGL and a first-load connection.", host.width / 2, host.height / 2);
  }

  function setAvatarURL(category, url) {
    if (url && !url.startsWith("avatars/")) avatarURLs[category] = url;
    else delete avatarURLs[category];
  }

  async function retryInit() {
    if (ready) return true;
    await init(host);
    return ready;
  }

  function dolly(f) {
    if (!controls || !camera || !f) return;
    const dir = camera.position.clone().sub(controls.target);
    const dist = Math.min(controls.maxDistance, Math.max(controls.minDistance, dir.length() / f));
    camera.position.copy(controls.target).add(dir.setLength(dist));
    controls.update();
  }

  function fit() {
    if (ready && camera) frameCamera(curH);
  }

  return {
    init,
    build,
    resize,
    setFabric,
    setPieceVisibility,
    zoom: dolly,
    fit,
    setCameraPreset,
    setSpin: (v) => {
      spinning = v;
      if (controls) controls.autoRotate = v && !reduceMotion;
    },
    setWalk: (v) => { walking = v; },
    setReduceMotion: (v) => {
      reduceMotion = !!v;
      if (controls) controls.autoRotate = spinning && !reduceMotion;
    },
    setLoadingCallback: (cb) => { onLoading = cb || (() => {}); },
    setAvatarIssueCallback: (cb) => { onAvatarIssue = cb || (() => {}); },
    setFatalErrorCallback: (cb) => { onFatalError = cb || (() => {}); },
    setAvatarURL,
    isReady: () => ready,
    retryInit,
    // 3D Tension Simulation & Wavefront OBJ Export
    setTensionMap,
    getTensionMap: () => tensionMapEnabled,
    setFabricPreset,
    getFabricPreset: () => fabricState.bodice?.front?.material || "cotton",
    getFabricPresets: () => FABRIC,
    getTensionMetrics: () => lastTensionMetrics,
    setTensionMetricsCallback: (cb) => { onTensionMetricsUpdate = cb || (() => {}); },
    exportOBJ,
    // 3D Accessories
    setAccessories,
    getAccessories: () => JSON.parse(JSON.stringify(accessoriesState)),
    // 3D Prints, Graphics & Drawing
    setGarmentPrint,
    generatePatternPreset,
    getGarmentColor: (part = "bodice") => {
      const col = fabricState[part]?.front?.color;
      return col != null ? (typeof col === "number" ? "#" + col.toString(16).padStart(6, "0") : col) : "#4f46e5";
    },
    getFabricState: () => JSON.parse(JSON.stringify(fabricState)),
  };
})();

if (typeof window !== "undefined") window.View3D = View3D;
