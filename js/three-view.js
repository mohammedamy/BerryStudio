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
  applyNaturalHumanMotion,
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
  let ready = false, initPromise = null, initFailed = false;
  let spinning = true, walking = true, t = 0;
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
  let bodiceFrontMesh = null, bodiceBackMesh = null;
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
    const addonUrl = (path) => (tier.addons ? `${tier.addons}/${path}` : `three/addons/${path}`);
    const [THREE_, { OrbitControls: OC }] = await withTimeout(
      Promise.all([
        tier.base ? import(/* @vite-ignore */ tier.base) : import(/* @vite-ignore */ "three"),
        import(/* @vite-ignore */ addonUrl("controls/OrbitControls.js")),
      ]),
      8000
    );
    let cloneSkeleton_ = null, GL = null, RGBE = null;
    await withTimeout(
      Promise.allSettled([
        import(/* @vite-ignore */ addonUrl("utils/SkeletonUtils.js")).then((m) => { cloneSkeleton_ = m.clone; }),
        import(/* @vite-ignore */ addonUrl("loaders/GLTFLoader.js")).then((m) => { GL = m.GLTFLoader; }),
        import(/* @vite-ignore */ addonUrl("loaders/RGBELoader.js")).then((m) => { RGBE = m.RGBELoader; }),
      ]),
      6000
    ).catch(() => {});
    return { THREE_, OC, GL, RGBE, cloneSkeleton_ };
  }

  async function loadDeps() {
    if (THREE && OrbitControls) return true;
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

  function createWebGLRenderer(targetCanvas, antialias = true) {
    try {
      return new THREE.WebGLRenderer({
        canvas: targetCanvas,
        antialias,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch (_) {
      try {
        return new THREE.WebGLRenderer({ canvas: targetCanvas, antialias: false, alpha: true });
      } catch (err2) {
        // If the canvas element was previously bound to a non-WebGL context, replace with a clean clone
        if (targetCanvas && targetCanvas.parentNode) {
          const fresh = targetCanvas.cloneNode(false);
          targetCanvas.parentNode.replaceChild(fresh, targetCanvas);
          host = fresh;
          return new THREE.WebGLRenderer({ canvas: fresh, antialias, alpha: true });
        }
        throw err2;
      }
    }
  }

  let isSoftwareGL = false;
  function isSoftwareRendererString(str) {
    return /SwiftShader|SubZero|llvmpipe|softpipe|Software|Basic Render Driver/i.test(String(str || ""));
  }

  function detectSoftwareGL(glRenderer) {
    try {
      const gl = glRenderer.getContext();
      if (!gl) return false;
      const dbg = gl.getExtension && gl.getExtension("WEBGL_debug_renderer_info");
      const unmasked = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "";
      const rendererStr = gl.getParameter(gl.RENDERER) || "";
      return isSoftwareRendererString(unmasked) || isSoftwareRendererString(rendererStr);
    } catch (_) {
      return false;
    }
  }

  // ---------- init ----------
  async function init(canvas) {
    if (canvas) host = canvas;
    if (ready) return true;
    if (initPromise) return initPromise;

    initFailed = false;
    initPromise = (async () => {
      try {
        const ok = await loadDeps();
        if (!ok || !window.WebGLRenderingContext || !host) {
          initFailed = true;
          fallback();
          return false;
        }

        renderer = createWebGLRenderer(host);
        const softGL = detectSoftwareGL(renderer);
        isSoftwareGL = softGL;
        renderer.setPixelRatio(softGL ? 1 : Math.min(2, devicePixelRatio || 1));
        renderer.shadowMap.enabled = !softGL;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = softGL ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.98;
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        scene = new THREE.Scene();
        scene.background = gradientBackdrop();
        if (!softGL) {
          loadEnvironmentMap().then((envMap) => {
            if (envMap && scene) {
              scene.environment = envMap;
              scene.environmentIntensity = 0.45;
            }
          });
        }

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
        initFailed = false;
        if (typeof document !== "undefined") {
          const errEl = document.getElementById("v3dError");
          if (errEl) errEl.classList.remove("show");
        }
        resize();
        if (!raf) scheduleNextFrame(0);
        return true;
      } catch (err) {
        console.error("[View3D] init failed:", err);
        initFailed = true;
        fallback();
        return false;
      } finally {
        initPromise = null;
      }
    })();

    return initPromise;
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
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -1.6;
    key.shadow.camera.right = 1.6;
    key.shadow.camera.top = 2.6;
    key.shadow.camera.bottom = -0.5;
    key.shadow.bias = -0.0003;
    key.shadow.radius = 3;
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

    const mat = isSoftwareGL
      ? new THREE.MeshPhongMaterial({
          color: slot.textureDataURL ? 0xffffff : slot.color,
          shininess: Math.round((1 - f.rough) * 60 + 8),
          specular: new THREE.Color(0x1f1f1f).lerp(new THREE.Color(0x7a7a7a), 1 - f.rough),
          bumpMap: weaveBump || null,
          bumpScale: f.bump || 0.001,
          transparent: op < 0.99,
          opacity: op,
          depthWrite: op >= 0.55,
          side: THREE.DoubleSide,
        })
      : new THREE.MeshPhysicalMaterial({
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
    const posAttr = geo.attributes.position;
    if (posAttr && !geo.userData.restPos) {
      geo.userData.restPos = new Float32Array(posAttr.array);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    if (skeleton && geo.attributes.skinIndex && geo.attributes.skinWeight) {
      geo.userData.skinIdx = geo.attributes.skinIndex.array;
      geo.userData.skinWgt = geo.attributes.skinWeight.array;
      mesh.userData.cpuSkinned = true;
    } else {
      mesh.userData.cpuSkinned = false;
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

    const skin = createHumanSkinMaterial(THREE, category, undefined, isSoftwareGL);
    activeMannequin = buildHumanMannequin(THREE, category, m, {
      skinMaterial: skin,
      pose: "standing",
      lowPower: isSoftwareGL,
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
    const { female, hipY, shoulderY, span, chestR, waistR, hipR, shoulderHalf } = d;
    const zScale = female ? 0.72 : 0.78;
    const effWaistR = waistR * (1 - waistRelax) + Math.max(waistR, hipR * 0.93, chestR * 0.95) * waistRelax;

    // Match the exact 14-slice anatomical torso profile of human-mannequin.js across all 4 categories
    const stops = [
      [hipY - span * 0.085, hipR * 1.01, hipR * 0.98],
      [hipY - span * 0.050, hipR * 1.025, hipR * 1.00],
      [hipY - span * 0.015, hipR * 1.035, hipR * 1.01],
      [hipY + span * 0.030, hipR * 1.025, hipR * 1.00],
      [hipY + span * 0.085, hipR * 1.005, hipR * 0.98],
      [hipY + span * 0.19,  hipR * 0.92 + effWaistR * 0.10, hipR * 0.91 + effWaistR * 0.11],
      [hipY + span * 0.32,  hipR * 0.43 + effWaistR * 0.59, hipR * 0.45 + effWaistR * 0.57],
      [hipY + span * 0.44,  effWaistR * 1.02, effWaistR * 1.00],
      [hipY + span * 0.55,  effWaistR * 0.61 + chestR * 0.43, effWaistR * 0.64 + chestR * 0.40],
      [hipY + span * 0.65,  chestR * (female ? 0.99 : 1.03), chestR * 0.98],
      [hipY + span * 0.73,  chestR * (female ? 1.03 : 1.07), chestR * (female ? 1.02 : 1.04)],
      [hipY + span * 0.81,  chestR * (female ? 1.02 : 1.08), chestR * 0.95],
      [hipY + span * 0.88,  chestR * (female ? 1.03 : 1.09), chestR * 0.90],
      [shoulderY - span * 0.03, shoulderHalf * 0.86, chestR * 0.84],
      [shoulderY + span * 0.04, shoulderHalf * 0.84, chestR * 0.78],
    ];

    let rx, rzBase;
    if (y <= stops[0][0]) {
      const f = clamp((stops[0][0] - y) / Math.max(0.15, hipY), 0, 1);
      rx = hipR * (1.01 - 0.10 * f);
      rzBase = hipR * (0.98 - 0.07 * f);
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
    if (y >= hipY - span * 0.18 && y <= shoulderY + span * 0.06) {
      z += female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d);
    }
    if (cosP > 0.35 && y > hipY + span * 0.78) {
      const clavLobe = bumpWindow(phi, 0.45, 0.36) + bumpWindow(phi, -0.45, 0.36);
      z += 0.005 * clavLobe * smoothstep(hipY + span * 0.78, shoulderY, y);
    }
    return [x, z];
  }

  function torsoGarmentWeights(y, x, d) {
    const { hipY, shoulderY, span, hipR } = d;
    const waistY = hipY + span * 0.44;
    const chestY = hipY + span * 0.68;

    if (y < hipY + span * 0.08) {
      const legBlend = smoothstep(hipY + span * 0.04, hipY - 0.36, y) * 0.72;
      const blendHalfW = Math.max(0.075, hipR * 0.62);
      const wLeft = smoothstep(-blendHalfW, blendHalfW, x);
      const wRight = 1 - wLeft;
      const kneeY = hipY * 0.49;
      const kneeBlend = y < kneeY + 0.04 ? smoothstep(kneeY + 0.04, kneeY - 0.16, y) * 0.62 : 0;
      const fSpine = y > hipY ? smoothstep(hipY, waistY, y) * 0.35 : 0;
      const wTorso = 1 - legBlend;
      return [
        [BONE_IDX.pelvis, wTorso * (1 - fSpine)],
        [BONE_IDX.spine, wTorso * fSpine],
        [BONE_IDX.legL, legBlend * (1 - kneeBlend) * wLeft],
        [BONE_IDX.legR, legBlend * (1 - kneeFollowClamp(kneeBlend)) * wRight],
        [BONE_IDX.kneeL, legBlend * kneeBlend * wLeft],
        [BONE_IDX.kneeR, legBlend * kneeBlend * wRight],
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
    const lat = clamp((Math.abs(x) - d.neckR * 1.35) / Math.max(0.06, d.shoulderHalf), 0, 1);
    const armW = smoothstep(shoulderY - span * 0.09, shoulderY + span * 0.04, y) * lat * 0.24;
    const wLeft = smoothstep(-0.04, 0.04, x);
    return [
      [BONE_IDX.chest, 1 - armW],
      [BONE_IDX.armL, armW * wLeft],
      [BONE_IDX.armR, armW * (1 - wLeft)],
    ];
  }

  function kneeFollowClamp(v) {
    return clamp(v, 0, 1);
  }

  /**
   * Builds a tailored bodice / blouse / shirt / jacket / robe with watertight
   * side seams, contoured armholes, sculpted neckline, and optional collar.
   */
  function buildTailoredBodice(d, pm, skeleton) {
    const bSpec = pm.bodice;
    const { hipY, shoulderY, span, neckR, shoulderHalf, chestR } = d;
    const waistY = hipY + span * 0.44;
    const underarmY = shoulderY - span * 0.09;
    // Natural human shoulder slope (~16 deg) clearing High Point Shoulder trapezius down to outer acromion tip
    const shoulderTopY = shoulderY + span * 0.044;
    const shoulderAcromionY = shoulderY - span * 0.004;

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
      : shoulderHalf * 0.86;

    function buildBodiceSide(isFront) {
      const positions = [];
      const uvs = [];
      const skinIdx = [];
      const skinWgt = [];
      const indices = [];

      const ROWS_LOWER = bSpec.style === "robe" ? 18 : 10;
      const ROWS_UPPER = isStrapless ? 2 : 12;
      const totalRows = ROWS_LOWER + ROWS_UPPER;
      const HALF_COLS = 10; // 0..9 on right (-X), 10..19 on left (+X) -> 20 columns per row
      const rowVerts = [];

      const neckBottomY = isFront ? frontNeckBottomY : backNeckBottomY;

      for (let r = 0; r <= totalRows; r++) {
        const upperFrac = r <= ROWS_LOWER ? 0 : (r - ROWS_LOWER) / ROWS_UPPER;
        // Positive-slope rise from underarmY + elliptical top arch (cos(archAngle)) eliminates underarm pile-up and collarbone peek!
        const archAngle = (Math.PI * 0.5) * Math.pow(upperFrac, 2.15);
        const yArchFrac = 1 - Math.pow(1 - upperFrac, 1.52);
        const armholeZBlend = smoothstep(0.0, 0.36, upperFrac);

        let y;
        if (r <= ROWS_LOWER) {
          const u = r / ROWS_LOWER;
          y = hemY * (1 - u) + underarmY * u;
        } else if (isStrapless) {
          y = underarmY + span * 0.02 * upperFrac;
        } else {
          y = underarmY * (1 - yArchFrac) + shoulderTopY * yArchFrac;
        }

        let lowerFlare = 1.0;
        let pleatAmp = 0;
        if (y < waistY && bSpec.hemFlare > 1.04) {
          const drop = clamp((waistY - y) / Math.max(0.15, waistY - hemY), 0, 1);
          lowerFlare = 1 + (bSpec.hemFlare - 1) * Math.pow(drop, 1.12);
          if (pm.skirt.pleats > 0 && bSpec.style === "robe") {
            pleatAmp = 0.007 * Math.pow(drop, 1.3);
          }
        }

        let innerX = 0;
        if (bSpec.isOpenFront && isFront && !isBra) {
          innerX = 0.008;
        }
        if (!isStrapless && y > neckBottomY) {
          const neckCompleteY = shoulderTopY - span * 0.012;
          const nu = clamp((y - neckBottomY) / Math.max(0.02, neckCompleteY - neckBottomY), 0, 1);
          let curve;
          if (isFront && bSpec.neckline === "v-neck") curve = Math.pow(nu, 0.86);
          else if (isFront && bSpec.neckline === "square") curve = nu < 0.16 ? nu * 5.2 : 0.84 + (nu - 0.16) * 0.19;
          else curve = Math.sqrt(nu);
          innerX = Math.max(innerX, neckHalfW * clamp(curve, 0, 1));
        }

        const bodyHalfWAtUnderarm = Math.abs(getBodySurfacePoint(underarmY, Math.PI / 2, d, easeBase, waistRelax)[0]);
        let outerMaxX = Math.abs(getBodySurfacePoint(Math.min(y, underarmY), Math.PI / 2, d, easeBase, waistRelax)[0]) * lowerFlare;
        if (r > ROWS_LOWER && !isStrapless) {
          const armscyeIndent = Math.sin(Math.PI * upperFrac) * (isBra ? chestR * 0.20 : chestR * 0.016);
          outerMaxX = bodyHalfWAtUnderarm * (1 - upperFrac) + shoulderTipX * upperFrac - armscyeIndent;
          outerMaxX = Math.max(innerX + (isBra ? 0.016 : 0.028), outerMaxX);
        }

        const row = [];
        for (const sideSign of [-1, 1]) {
          for (let c = 0; c < HALF_COLS; c++) {
            const tCol = sideSign < 0 ? (1 - c / (HALF_COLS - 1)) : (c / (HALF_COLS - 1));
            const xMag = innerX + (outerMaxX - innerX) * tCol;
            const x = sideSign * xMag;

            // Smoothly transition from exact [-1, 1] side seam below underarm to full Z depth around the armhole!
            const refOuterW = outerMaxX * (1 - armholeZBlend) + Math.max(outerMaxX, shoulderHalf * 1.12) * armholeZBlend;
            const sinCap = 1.0 - 0.12 * armholeZBlend;
            const sinPhi = r <= ROWS_LOWER
              ? clamp(x / Math.max(0.04, outerMaxX), -1, 1)
              : clamp(x / Math.max(0.04, refOuterW), -sinCap, sinCap);
            const asinVal = Math.asin(sinPhi);
            const phi = isFront ? asinVal : (Math.PI - asinVal);

            let yFinal = y;
            let ySampleZ = y;
            if (!isStrapless && upperFrac > 0) {
              const shoulderSpanFrac = clamp((xMag - neckHalfW) / Math.max(0.025, shoulderTipX - neckHalfW), 0, 1);
              const ySeam = shoulderTopY * (1 - shoulderSpanFrac) + shoulderAcromionY * shoulderSpanFrac;
              yFinal = underarmY * (1 - yArchFrac) + ySeam * yArchFrac;
              ySampleZ = Math.min(yFinal, shoulderY - span * 0.02);
            }

            const capEase = !isStrapless && upperFrac > 0 ? easeBase + 0.008 * yArchFrac : easeBase;
            let [, zSurf] = getBodySurfacePoint(ySampleZ, phi, d, capEase, waistRelax);
            zSurf *= lowerFlare;
            if (pleatAmp > 0) {
              zSurf += (isFront ? 1 : -1) * pleatAmp * Math.cos(phi * pm.skirt.pleats);
            }
            if (!isStrapless && upperFrac > 0) {
              // Elliptical shoulder arch: cos(archAngle) rounds smoothly over trapezius/clavicle to z = 0 with horizontal tangent
              zSurf *= Math.cos(archAngle);
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
      geo.userData.gridMeta = {
        rows: totalRows + 1,
        cols: HALF_COLS * 2,
        lowerRows: ROWS_LOWER,
        hemY,
        waistY,
        style: bSpec.style,
        hemFlare: bSpec.hemFlare,
      };

      const sideName = isFront ? "front" : "back";
      const mesh = createGarmentMesh(geo, fabricMat("bodice", sideName), "bodice", sideName, skeleton);
      mesh.userData.garmentType = isBra ? "bra" : "full";
      return mesh;
    }

    bodiceFrontMesh = buildBodiceSide(true);
    bodiceBackMesh = buildBodiceSide(false);
    garmentGroup.add(bodiceFrontMesh, bodiceBackMesh);

    if (bSpec.hasCollar && !isBra && !isStrapless) {
      const collarCols = 36;
      const cPos = [], cUvs = [], cSi = [], cSw = [], cIdx = [];
      const collarH = 0.038;
      const rCol = neckHalfW * 1.03;
      const isStandOnly = bSpec.neckline === "high";
      const sideNeckY = shoulderTopY;

      for (let row = 0; row <= 2; row++) {
        for (let k = 0; k <= collarCols; k++) {
          const u = k / collarCols;
          const phi = 0.08 + u * (2 * Math.PI - 0.16);
          const cosP = Math.cos(phi);
          const sinP = Math.sin(phi);

          const frontW = Math.max(0, cosP);
          const backW = Math.max(0, -cosP);
          const sideW = Math.abs(sinP);
          const seamY = (frontNeckBottomY - 0.003) * frontW * frontW
            + (backNeckBottomY - 0.002) * backW * backW
            + sideNeckY * sideW * sideW;

          const [, bodyNeckZ] = getBodySurfacePoint(Math.min(seamY, shoulderY), phi, d, easeBase, waistRelax);
          const baseZ = Math.abs(cosP) > 0.15 ? bodyNeckZ * 0.94 : rCol * cosP;

          let radX = rCol;
          let z = baseZ;
          let y = seamY;
          if (row === 1) {
            radX = rCol * 0.97;
            z = baseZ * 0.92 + 0.004 * cosP;
            y = seamY + collarH * 0.78;
          } else if (row === 2) {
            radX = isStandOnly ? rCol * 0.95 : rCol * (1.16 + 0.08 * Math.max(0, cosP));
            z = isStandOnly ? (baseZ * 0.90 + 0.004 * cosP) : (baseZ * 1.07 + 0.012 * cosP);
            y = isStandOnly ? (seamY + collarH) : (seamY + collarH * 0.22);
          }
          const x = radX * sinP;
          cPos.push(x, y, z);
          cUvs.push(u, row * 0.5);
          const [bi, bw] = packSkinWeights([[BONE_IDX.neck, 0.52], [BONE_IDX.chest, 0.48]]);
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
      collarMesh.userData.garmentType = "collar";
      garmentGroup.add(collarMesh);
    }
  }

  /**
   * Builds tailored, armscye-fitted skinned sleeves (cap, puff, fitted, 3/4,
   * full, bell, bishop) aligned 1:1 with createSkeletonRig & armWeightsAtOffset.
   */
  function buildTailoredSleeves(d, pm, skeleton) {
    const sSpec = pm.sleeve;
    const { shoulderHalf, shoulderY, span, armLen, upperR, chestR, female } = d;
    const zScale = female ? 0.72 : 0.78;
    const pivotX = shoulderHalf * 0.82;
    const pivotY = shoulderY - span * 0.035;
    const upperArmLen = armLen * 0.48;
    const forearmLen = armLen * 0.46;
    const wristDist = upperArmLen + forearmLen;
    const wristR = upperR * (female ? 0.34 : 0.36);
    const totalSlLen = armLen * clamp(sSpec.lengthFrac, 0.16, 1.02);

    // Tuck r=0 sleeve root cleanly inside sloped bodice armhole (shoulderTipX = 0.85) with full overlap!
    const armscyeTopX = shoulderHalf * 0.78;
    const armscyeBotX = chestR * (female ? 0.88 : 0.93);
    const armscyeTopY = shoulderY - span * 0.003;
    const armscyeBotY = shoulderY - span * 0.094;
    const armscyeMidY = 0.5 * (armscyeTopY + armscyeBotY);
    const armscyeHalfH = 0.5 * (armscyeTopY - armscyeBotY);
    const armscyeDepthZ = Math.max(upperR * 1.24 + 0.012, chestR * zScale * 0.82 + 0.012);
    const capHeight = Math.max(0.065, Math.min(totalSlLen * 0.85, upperArmLen * 0.44));

    const N_SEG = 28;
    const N_RINGS = 20;

    [-1, 1].forEach((side) => {
      const positions = [];
      const uvs = [];
      const skinIdx = [];
      const skinWgt = [];
      const indices = [];

      const sx = side * pivotX;

      for (let r = 0; r <= N_RINGS; r++) {
        const f = r / N_RINGS;
        const dyBase = f * totalSlLen;

        // Match anatomical arm envelope (deltoid -> bicep -> olecranon elbow -> brachioradialis -> carpal wrist)
        let bodyArmR;
        if (dyBase <= upperArmLen) {
          const u = dyBase / Math.max(0.1, upperArmLen);
          bodyArmR = upperR * (1.04 * (1 - u) + 0.79 * u);
        } else if (dyBase <= wristDist) {
          const u = clamp((dyBase - upperArmLen) / Math.max(0.1, forearmLen), 0, 1);
          const forePeak = u < 0.28 ? (0.79 + 0.04 * Math.sin((Math.PI * u) / 0.28)) : (0.79 * (1 - (u - 0.28) / 0.72) + (wristR / upperR) * 1.18 * ((u - 0.28) / 0.72));
          bodyArmR = upperR * forePeak;
        } else {
          bodyArmR = wristR * 1.38;
        }

        let sleeveR = bodyArmR + 0.013;
        if (sSpec.style === "puff") {
          const puffBell = Math.sin(Math.PI * Math.pow(f, 0.75));
          sleeveR = bodyArmR + 0.013 + upperR * 0.46 * puffBell;
          if (f > 0.88) sleeveR = bodyArmR + 0.010;
        } else if (sSpec.style === "bishop") {
          const billow = Math.sin(Math.PI * Math.pow(f, 0.65));
          sleeveR = bodyArmR + 0.014 + upperR * 0.55 * billow;
          if (f > 0.90) sleeveR = bodyArmR + 0.011;
        } else if (sSpec.style === "bell") {
          sleeveR = bodyArmR + 0.014 + upperR * 0.58 * Math.pow(f, 1.35);
        } else if (sSpec.style === "cap") {
          sleeveR = bodyArmR + 0.012 + upperR * 0.06 * (1 - f);
        } else {
          const easeExtra = Math.max(0, (sSpec.hemRatio - 0.68) * upperR * 0.35 * f);
          sleeveR = bodyArmR + 0.013 + easeExtra;
        }

        // Metric skinning weights matching bodice armhole at dyBase=0 -> arm bone down the limb
        const bArm = side > 0 ? BONE_IDX.armL : BONE_IDX.armR;
        const bElbow = side > 0 ? BONE_IDX.elbowL : BONE_IDX.elbowR;
        const bHand = side > 0 ? BONE_IDX.handL : BONE_IDX.handR;
        let weights;
        if (dyBase < 0.055) {
          const fArm = smoothstep(-0.012, 0.055, dyBase);
          weights = [[BONE_IDX.chest, (1 - fArm) * 0.88], [bArm, 1 - (1 - fArm) * 0.88]];
        } else if (dyBase < upperArmLen + 0.042) {
          const fElb = smoothstep(upperArmLen - 0.042, upperArmLen + 0.042, dyBase);
          weights = [[bArm, 1 - fElb], [bElbow, fElb]];
        } else {
          const fHand = smoothstep(wristDist - 0.025, wristDist + 0.020, dyBase);
          weights = [[bElbow, 1 - fHand], [bHand, fHand]];
        }
        const [bi, bw] = packSkinWeights(weights);

        const capBlend = Math.pow(1 - smoothstep(0.0, capHeight, dyBase), 1.35);
        const deltoidArc = Math.sin(Math.PI * clamp(dyBase / 0.095, 0, 1));

        for (let k = 0; k <= N_SEG; k++) {
          const u = k / N_SEG;
          const theta = u * 2 * Math.PI;
          const sCrown = Math.sin(theta);
          const cFront = Math.cos(theta);

          const gatherFlute = sSpec.style === "puff" ? 0.003 * Math.sin(theta * 10) * Math.sin(Math.PI * f) : 0;
          const rEff = sleeveR + gatherFlute;

          const crownFrac = 0.5 * (1 + sCrown);
          const xArmscye = side * (armscyeBotX * (1 - crownFrac) + armscyeTopX * crownFrac);
          const yArmscye = armscyeMidY + armscyeHalfH * sCrown;
          // Superelliptical Z depth keeps upper-front/upper-back sleeve crown cleanly outside clavicle & scapula!
          const zArmscye = (armscyeDepthZ + gatherFlute) * Math.sign(cFront) * Math.pow(Math.abs(cFront), 0.72);

          const xTube = sx + side * rEff * sCrown;
          const tubeCapTiltY = Math.pow(capBlend, 1.8) * Math.max(0, armscyeTopY - pivotY) * Math.max(0, sCrown);
          const yTube = pivotY - dyBase + tubeCapTiltY;
          const zTube = rEff * 1.02 * cFront;

          const overDeltoidOut = sSpec.style === "puff" ? side * upperR * 0.14 * deltoidArc * Math.max(0, sCrown) : 0;
          const overDeltoidUp = sSpec.style === "puff" ? span * 0.022 * deltoidArc * Math.max(0, sCrown) : 0;

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
      geo.setAttribute("skinIndex", new THREE.Float32BufferAttribute(skinIdx, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      geo.userData.gridMeta = {
        rows: N_RINGS + 1,
        cols: N_SEG + 1,
        totalSlLen,
        style: sSpec.style,
      };

      const slMesh = createGarmentMesh(geo, fabricMat("sleeve", "front"), "sleeve", "front", skeleton);
      slMesh.userData.armSide = side;
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
   * straight, A-line, flared, pleated) with smooth bilateral leg/knee skinning
   * and welded front/back side seams.
   */
  function buildTailoredSkirt(d, pm, skeleton) {
    const skSpec = pm.skirt;
    const { hipY, span, waistR, hipR, female } = d;
    const zScale = female ? 0.72 : 0.78;
    const waistY = hipY + span * 0.44;
    const topY = waistY + 0.004;
    const hemY = clamp(waistY - cm(skSpec.lengthCm), 0.045, hipY - 0.08);
    const totalDrop = Math.max(0.16, topY - hemY);

    const N_RINGS = 20;
    const HALF_SEG = 28;
    const blendHalfW = Math.max(0.08, hipR * 0.65);
    const kneeY = hipY * 0.49;

    function buildSkirtHalf(isFront) {
      const positions = [];
      const uvs = [];
      const skinIdx = [];
      const skinWgt = [];
      const indices = [];

      const phiStart = isFront ? -Math.PI / 2 : Math.PI / 2;

      for (let r = 0; r <= N_RINGS; r++) {
        const f = r / N_RINGS;
        const y = topY - f * totalDrop;

        let baseRx, baseRz;
        if (y >= hipY) {
          const u = clamp((topY - y) / Math.max(0.05, topY - hipY), 0, 1);
          baseRx = (waistR + 0.013) * (1 - u) + (hipR * 1.055 + 0.017) * u;
          baseRz = (waistR * zScale + 0.013) * (1 - u) + (hipR * zScale * 1.065 + 0.019) * u;
        } else {
          const hipDrop = clamp((hipY - y) / Math.max(0.10, hipY - hemY), 0, 1);
          const flareEase = skSpec.flare <= 1.08
            ? (1.0 - 0.03 * hipDrop)
            : (1.0 + (skSpec.flare - 1.05) * Math.pow(hipDrop, 1.10));
          baseRx = (hipR * 1.055 + 0.017) * flareEase;
          const roundBlend = smoothstep(0.0, 0.82, hipDrop) * clamp((skSpec.flare - 1.0) * 0.85, 0.18, 0.78);
          const effZScale = zScale * (1 - roundBlend) + 0.95 * roundBlend;
          baseRz = (hipR * 1.055 + 0.019) * effZScale * flareEase;
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

          if (y > hipY - span * 0.16) {
            const bumpFade = smoothstep(hipY - span * 0.16, hipY + span * 0.04, y);
            z += (female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d)) * bumpFade;
          }

          positions.push(x, y, z);
          uvs.push(u, 1 - f);

          // Smooth bilateral leg & knee weights across x = 0 -> zero center-seam tear!
          const legFollow = smoothstep(hipY + 0.03, hipY - 0.32, y) * (skSpec.flare < 1.25 ? 0.74 : 0.52);
          const kneeFollow = y < kneeY + 0.05 ? smoothstep(kneeY + 0.05, kneeY - 0.16, y) * 0.58 : 0;
          const wLeft = smoothstep(-blendHalfW, blendHalfW, x);
          const wRight = 1 - wLeft;
          const [bi, bw] = packSkinWeights([
            [BONE_IDX.pelvis, 1 - legFollow],
            [BONE_IDX.legL, legFollow * (1 - kneeFollow) * wLeft],
            [BONE_IDX.legR, legFollow * (1 - kneeFollow) * wRight],
            [BONE_IDX.kneeL, legFollow * kneeFollow * wLeft],
            [BONE_IDX.kneeR, legFollow * kneeFollow * wRight],
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
      geo.userData.gridMeta = {
        rows: N_RINGS + 1,
        cols: HALF_SEG + 1,
        topY,
        hemY,
        flare: skSpec.flare,
        pleats: skSpec.pleats,
      };

      const sideName = isFront ? "front" : "back";
      return createGarmentMesh(geo, fabricMat("skirt", sideName), "skirt", sideName, skeleton);
    }

    skirtFrontMesh = buildSkirtHalf(true);
    skirtBackMesh = buildSkirtHalf(false);
    garmentGroup.add(skirtFrontMesh, skirtBackMesh);
  }

  /**
   * Builds a SINGLE continuous, Y-branched tailored trouser / shorts / brief
   * surface aligned with createSkeletonRig hip/knee/ankle pivots.
   */
  function buildTailoredTrousers(d, pm, skeleton) {
    const tSpec = pm.trousers;
    const { hipY, span, waistR, hipR, thighR, female, H } = d;
    const zScale = female ? 0.72 : 0.78;
    const waistY = hipY + span * 0.44;
    const hipPivotX = hipR * (female ? 0.45 : 0.47);
    const ankleY = Math.max(0.054, H * 0.047);
    const kneeY = ankleY + (hipY - span * 0.04 - ankleY) * 0.47;

    const crotchSplitY = hipY - span * (tSpec.isBrief ? 0.114 : 0.128);
    const legStartY = crotchSplitY - 0.010;
    const fullInseamSpan = Math.max(0.20, legStartY - (ankleY + 0.012));
    const legDrop = tSpec.isBrief
      ? 0.018
      : fullInseamSpan * clamp(tSpec.inseamFrac, 0.14, 1.0);
    const pantHemY = Math.max(ankleY + 0.010, legStartY - legDrop);

    const N = 36;
    const HALF_N = N >> 1;
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
      if (y <= kneeY + 0.065) {
        const f = smoothstep(kneeY - 0.065, kneeY + 0.065, y);
        return [[bKnee, 1 - f], [bHip, f]];
      }
      const pelvBlend = smoothstep(legStartY - 0.04, hipY + 0.02, y) * 0.45;
      return [[bHip, 1 - pelvBlend], [BONE_IDX.pelvis, pelvBlend]];
    }

    function buildPantLeg(side) {
      const legX = side * hipPivotX;
      const legSteps = tSpec.isBrief ? 3 : 14;
      const outerPelvicReach = Math.max(thighR * 1.02 + 0.012, hipR * 1.045 + 0.016 - Math.abs(legX));
      const innerPelvicReach = Math.max(thighR * 0.80 + 0.012, Math.abs(legX) + 0.004);

      let prev = null;
      for (let i = 0; i <= legSteps; i++) {
        const f = i / legSteps;
        const y = pantHemY * (1 - f) + legStartY * f;
        const legFracUp = clamp((y - ankleY) / Math.max(0.2, legStartY - ankleY), 0, 1);

        // Include gastrocnemius calf swell (legFracUp ~ 0.33, posterior reach ~0.82*thighR) & patella clearance
        const calfSwell = thighR * 0.21 * bumpWindow(legFracUp, 0.33, 0.22);
        const bodyLegR = thighR * (0.45 + 0.61 * Math.pow(legFracUp, 0.82)) + calfSwell + 0.016;
        const cutR = thighR * (0.65 * tSpec.hemMult * (1 - legFracUp) + 1.08 * legFracUp) + 0.014;
        const baseR = Math.max(bodyLegR, cutR);

        const topBlend = smoothstep(0.74, 1.0, legFracUp);
        const stanceX = legX + side * (1 - legFracUp) * (-hipR * 0.022);
        const ring = [];

        for (let k = 0; k < N; k++) {
          const phi = (2 * Math.PI * k) / N;
          const sinP = Math.sin(phi);
          const cosP = Math.cos(phi);
          const isMedial = sinP * side < 0;

          const targetRx = isMedial ? innerPelvicReach : outerPelvicReach;
          const targetRz = (hipR * zScale + 0.017) * (cosP >= 0 ? 0.95 : 1.05);

          const rx = baseR * 0.97 * (1 - topBlend) + targetRx * topBlend;
          let rz = baseR * 1.04 * (1 - topBlend) + targetRz * topBlend;

          if (!tSpec.isBrief && tSpec.hemMult >= 0.88) {
            const crease = bumpWindow(phi, 0, 0.16) + bumpWindow(phi - Math.PI, 0, 0.16) + bumpWindow(phi + Math.PI, 0, 0.16);
            rz += 0.0035 * crease * (1 - topBlend * 0.7);
          }

          const x = stanceX + rx * sinP;
          const z = rz * cosP + (i >= legSteps - 1
            ? (female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d)) * (i === legSteps ? 0.50 : 0.25)
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

    const waistTopY = tSpec.isBrief ? (hipY + span * 0.18) : waistY;
    const pelvisSlices = [
      [hipY - span * 0.075, hipR * 1.045 + 0.016, hipR * 1.025 + 0.017],
      [hipY,                hipR * 1.055 + 0.017, hipR * 1.045 + 0.018],
      [hipY + span * 0.18,  (hipR * 0.72 + waistR * 0.30) + 0.016, (hipR * 0.72 + waistR * 0.30) + 0.016],
    ];
    if (!tSpec.isBrief) {
      pelvisSlices.push(
        [waistY - 0.032, (hipR * 0.18 + waistR * 0.84) + 0.015, (hipR * 0.18 + waistR * 0.84) + 0.015],
        [waistTopY,      waistR * 1.025 + 0.016, waistR * 1.025 + 0.016]
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
        z += female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d);

        const fSpine = smoothstep(hipY + span * 0.05, waistY, y) * 0.45;
        const lat = clamp(Math.abs(x) / Math.max(0.1, hipR), 0, 1) * (1 - smoothstep(hipY - span * 0.10, hipY + span * 0.08, y)) * 0.28;
        const wLeft = smoothstep(-0.05, 0.05, x);
        ring.push(addV(
          x,
          y,
          z,
          k / N,
          clamp((y - pantHemY) / Math.max(0.2, waistTopY - pantHemY), 0, 1),
          [
            [BONE_IDX.pelvis, (1 - fSpine) * (1 - lat)],
            [BONE_IDX.spine, fSpine * (1 - lat)],
            [BONE_IDX.legL, lat * wLeft],
            [BONE_IDX.legR, lat * (1 - wLeft)],
          ]
        ));
      }
      return ring;
    }

    const pelv0 = buildPelvisRing(pelvisSlices[0][0], pelvisSlices[0][1], pelvisSlices[0][2], false);

    // (HALF_N - 1)-vertex Crotch Rise Saddle connecting pelv0[0] under crotch to pelv0[HALF_N]
    const p0Y = positions[pelv0[0] * 3 + 1], p0Z = positions[pelv0[0] * 3 + 2];
    const pBackY = positions[pelv0[HALF_N] * 3 + 1], pBackZ = positions[pelv0[HALF_N] * 3 + 2];
    const saddleMid = [];
    for (let j = 1; j < HALF_N; j++) {
      const u = j / HALF_N;
      const z = p0Z * (1 - u) + pBackZ * u;
      const endY = p0Y * (1 - u) + pBackY * u;
      const arch = Math.sin(Math.PI * u);
      const y = endY * (1 - arch) + crotchSplitY * arch;
      saddleMid.push(addV(0, y, z, 0.5, 0.5, [[BONE_IDX.pelvis, 1]]));
    }

    const upperL = [pelv0[0], ...pelv0.slice(1, HALF_N), pelv0[HALF_N], ...[...saddleMid].reverse()];
    const upperR = [pelv0[0], ...saddleMid, pelv0[HALF_N], ...pelv0.slice(HALF_N + 1, N)];
    connect(topLegL, upperL);
    connect(topLegR, upperR);

    let prevP = pelv0;
    for (let i = 1; i < pelvisSlices.length; i++) {
      const [y, rx, rzB] = pelvisSlices[i];
      const nextP = buildPelvisRing(y, rx, rzB, i === pelvisSlices.length - 1);
      connect(prevP, nextP);
      prevP = nextP;
    }

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

  // ---------- Live Cloth Drape, Posed Capsule Collision & Bone-Tracked Trims ----------
  let _dynMats = null;
  let _dynInvMats = null;
  let _tmpRootInv = null;
  let _tmpBoneWorld = null;
  let _tmpAccMat = null;
  let _tmpVecA = null;

  function ensureDynamicsScratch() {
    if (_dynMats) return;
    _dynMats = Array.from({ length: 17 }, () => new THREE.Matrix4());
    _dynInvMats = Array.from({ length: 17 }, () => new THREE.Matrix4());
    _tmpRootInv = new THREE.Matrix4();
    _tmpBoneWorld = new THREE.Matrix4();
    _tmpAccMat = new THREE.Matrix4();
    _tmpVecA = new THREE.Vector3();
  }

  function isPartCurrentlyShown(part) {
    if (!garmentGroup) return false;
    let shown = false;
    garmentGroup.traverse((o) => {
      if (o.isMesh && o.name === part && o.visible) shown = true;
    });
    return shown;
  }

  /**
   * Computes the minimum outward arm abduction angle (radians) so the swinging
   * elbows, forearms, wrists, and hands clear flared skirts, dresses, tunics,
   * robes, and wide-leg trousers with zero overlap.
   */
  function computeSafeArmAbduction(d) {
    if (!d) return 0.105;
    const pm = curPatternMetrics;
    const pivotX = d.shoulderHalf * 0.82;
    const pivotY = d.shoulderY - d.span * 0.035;
    const wristDist = d.armLen * 0.94;
    const handTipDist = d.armLen * 1.08;
    const wristY = pivotY - wristDist;
    const handTipY = pivotY - handTipDist;
    const waistY = d.hipY + d.span * 0.44;
    const armBuffer = d.upperR * 0.65 + 0.024;

    // Base clearance over bare/clothed hips
    let maxReqAngle = Math.asin(clamp((d.hipR * 1.06 + armBuffer - pivotX) / Math.max(0.22, wristDist), 0.08, 0.52));

    if (pm) {
      // Check visible skirt lateral width at wrist and hand-tip heights
      if (isPartCurrentlyShown("skirt") && pm.skirt) {
        const sk = pm.skirt;
        const skHemY = clamp(waistY - cm(sk.lengthCm), 0.045, d.hipY - 0.08);
        for (const [sampleY, reachDist] of [
          [ pivotY - d.armLen * 0.68, d.armLen * 0.68 ],
          [ wristY, wristDist ],
          [ handTipY, handTipDist ],
        ]) {
          if (sampleY <= waistY + 0.02 && sampleY >= skHemY - 0.03) {
            let rx;
            if (sampleY >= d.hipY) {
              const u = clamp((waistY - sampleY) / Math.max(0.05, waistY - d.hipY), 0, 1);
              rx = (d.waistR + 0.014) * (1 - u) + (d.hipR * 1.06 + 0.018) * u;
            } else {
              const hipDrop = clamp((d.hipY - sampleY) / Math.max(0.10, d.hipY - skHemY), 0, 1);
              const flareEase = sk.flare <= 1.08
                ? (1.0 - 0.03 * hipDrop)
                : (1.0 + (sk.flare - 1.05) * Math.pow(hipDrop, 1.10));
              rx = (d.hipR * 1.06 + 0.018) * flareEase + (sk.pleats > 0 ? 0.009 : 0);
            }
            const req = Math.asin(clamp((rx + armBuffer - pivotX) / Math.max(0.20, reachDist), 0.08, 0.56));
            if (req > maxReqAngle) maxReqAngle = req;
          }
        }
      }

      // Check visible bodice / tunic / robe flare at hip & wrist level
      if (isPartCurrentlyShown("bodice") && pm.bodice && pm.bodice.hemFlare > 1.04) {
        const bSpec = pm.bodice;
        const shoulderTopY = d.shoulderY + d.span * 0.054;
        const bHemY = clamp(shoulderTopY - cm(bSpec.lengthCm), 0.05, waistY);
        for (const [sampleY, reachDist] of [[wristY, wristDist], [handTipY, handTipDist]]) {
          if (sampleY <= waistY && sampleY >= bHemY - 0.03) {
            const drop = clamp((waistY - sampleY) / Math.max(0.15, waistY - bHemY), 0, 1);
            const flare = 1 + (bSpec.hemFlare - 1) * Math.pow(drop, 1.12);
            const rx = (d.hipR * 1.04 + 0.018) * flare;
            const req = Math.asin(clamp((rx + armBuffer - pivotX) / Math.max(0.20, reachDist), 0.08, 0.56));
            if (req > maxReqAngle) maxReqAngle = req;
          }
        }
      }

      // Check wide-leg / palazzo trousers
      if (isPartCurrentlyShown("trousers") && pm.trousers) {
        const rx = d.hipR * 1.07 + 0.020 + Math.max(0, pm.trousers.hemMult - 1.0) * d.thighR * 0.35;
        const req = Math.asin(clamp((rx + armBuffer - pivotX) / Math.max(0.22, wristDist), 0.08, 0.48));
        if (req > maxReqAngle) maxReqAngle = req;
      }
    }

    return clamp(Math.max(0.105, maxReqAngle), 0.105, 0.56);
  }

  function pushPointOutOfAnisoCapsule(p, ax, ay, az, bx, by, bz, rxMedA, rxLatA, rzA, rxMedB, rxLatB, rzB, side) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const lenSq = abx * abx + aby * aby + abz * abz;
    const u = lenSq > 1e-8 ? clamp(((p.x - ax) * abx + (p.y - ay) * aby + (p.z - az) * abz) / lenSq, 0, 1) : 0;
    const cx = ax + abx * u, cy = ay + aby * u, cz = az + abz * u;

    let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    // Remove axial component along interior of bone segment so projection is purely radial
    if (u > 0.001 && u < 0.999 && lenSq > 1e-8) {
      const invLen = 1 / Math.sqrt(lenSq);
      const ux = abx * invLen, uy = aby * invLen, uz = abz * invLen;
      const proj = dx * ux + dy * uy + dz * uz;
      dx -= proj * ux;
      dy -= proj * uy;
      dz -= proj * uz;
    }

    const isMedial = side !== 0 && (dx * side < 0);
    const rxA = isMedial ? rxMedA : rxLatA;
    const rxB = isMedial ? rxMedB : rxLatB;
    const rx = Math.max(0.01, rxA * (1 - u) + rxB * u);
    const rz = Math.max(0.01, rzA * (1 - u) + rzB * u);

    const qx = dx / rx;
    const qy = dy / rz;
    const qz = dz / rz;
    const qSq = qx * qx + qy * qy + qz * qz;
    if (qSq < 1.0) {
      if (qSq < 1e-8) {
        p.z += rz;
      } else {
        const scale = 1.0 / Math.sqrt(qSq) - 1.0;
        p.x += dx * scale;
        p.y += dy * scale;
        p.z += dz * scale;
      }
      return true;
    }
    return false;
  }

  function pushPointOutOfCapsule(p, ax, ay, az, bx, by, bz, rA, rB, extraCurveFn = null) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const lenSq = abx * abx + aby * aby + abz * abz;
    const u = lenSq > 1e-8 ? clamp(((p.x - ax) * abx + (p.y - ay) * aby + (p.z - az) * abz) / lenSq, 0, 1) : 0;
    const cx = ax + abx * u, cy = ay + aby * u, cz = az + abz * u;

    let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    if (u > 0.001 && u < 0.999 && lenSq > 1e-8) {
      const invLen = 1 / Math.sqrt(lenSq);
      const ux = abx * invLen, uy = aby * invLen, uz = abz * invLen;
      const proj = dx * ux + dy * uy + dz * uz;
      dx -= proj * ux;
      dy -= proj * uy;
      dz -= proj * uz;
    }

    const r = Math.max(0.008, rA * (1 - u) + rB * u + (extraCurveFn ? extraCurveFn(u) : 0));
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq < r * r) {
      if (dSq < 1e-8) {
        p.z += r;
      } else {
        const scale = r / Math.sqrt(dSq) - 1.0;
        p.x += dx * scale;
        p.y += dy * scale;
        p.z += dz * scale;
      }
      return true;
    }
    return false;
  }

  function enforceBoneSculptedSurface(p, boneIdx, yMin, yMax, d, clearance) {
    const m = _dynMats[boneIdx];
    const invM = _dynInvMats[boneIdx];
    const me = invM.elements;
    const lx = me[0] * p.x + me[4] * p.y + me[8] * p.z + me[12];
    const ly = me[1] * p.x + me[5] * p.y + me[9] * p.z + me[13];
    const lz = me[2] * p.x + me[6] * p.y + me[10] * p.z + me[14];
    if (ly < yMin || ly > yMax) return;

    const phi = Math.atan2(lx, lz);
    const [bx, bz] = getBodySurfacePoint(ly, phi, d, clearance, 0);
    const bodyR = Math.hypot(bx, bz);
    const curR = Math.hypot(lx, lz);
    if (curR < bodyR && bodyR > 1e-4) {
      const sc = bodyR / Math.max(1e-4, curR);
      const nx = lx * sc;
      const nz = lz * sc;
      const fe = m.elements;
      p.x = fe[0] * nx + fe[4] * ly + fe[8] * nz + fe[12];
      p.y = fe[1] * nx + fe[5] * ly + fe[9] * nz + fe[13];
      p.z = fe[2] * nx + fe[6] * ly + fe[10] * nz + fe[14];
    }
  }

  function getRootBonePoint(bone, ox, oy, oz) {
    _tmpVecA.set(ox, oy, oz).applyMatrix4(bone.matrixWorld).applyMatrix4(_tmpRootInv);
    return [_tmpVecA.x, _tmpVecA.y, _tmpVecA.z];
  }

  /**
   * Evaluates CPU linear-blend skinning, fabric-aware secondary drape waves,
   * strict posed anatomical body-capsule push-out (zero skin poke-through),
   * circumferential skirt drape tenting + side-seam welding, and bidirectional
   * arm-outside-garment separation.
   */
  function updateGarmentDynamics(time = 0, isWalking = false) {
    if (!garmentGroup || !lastDims || !activeMannequin || !activeMannequin.skeleton) return;
    ensureDynamicsScratch();

    const d = lastDims;
    const skeleton = activeMannequin.skeleton;
    const bones = skeleton.bones;
    const boneInverses = skeleton.boneInverses;
    if (!bones || bones.length < 17) return;

    root.updateMatrixWorld(true);
    bodyGroup.updateMatrixWorld(true);
    skeleton.update();

    _tmpRootInv.copy(root.matrixWorld).invert();
    for (let b = 0; b < 17; b++) {
      _tmpBoneWorld.multiplyMatrices(_tmpRootInv, bones[b].matrixWorld);
      _dynMats[b].multiplyMatrices(_tmpBoneWorld, boneInverses[b]);
      _dynInvMats[b].copy(_dynMats[b]).invert();
    }

    // Extract posed anatomical capsule endpoints in root space
    const [pelvX, , pelvZ] = getRootBonePoint(bones[BONE_IDX.pelvis], 0, 0, 0);
    const [hipLX, hipLY, hipLZ] = getRootBonePoint(bones[BONE_IDX.legL], 0, 0, 0);
    const [kneeLX, kneeLY, kneeLZ] = getRootBonePoint(bones[BONE_IDX.kneeL], 0, 0, 0);
    const [ankLX, ankLY, ankLZ] = getRootBonePoint(bones[BONE_IDX.footL], 0, 0, 0);
    const footLen = clamp(d.H * (d.kid ? 0.148 : (d.female ? 0.142 : 0.150)), 0.17, 0.29);
    const [toeLX, toeLY, toeLZ] = getRootBonePoint(bones[BONE_IDX.footL], 0, -d.H * 0.025, footLen * 0.56);

    const [hipRX, hipRY, hipRZ] = getRootBonePoint(bones[BONE_IDX.legR], 0, 0, 0);
    const [kneeRX, kneeRY, kneeRZ] = getRootBonePoint(bones[BONE_IDX.kneeR], 0, 0, 0);
    const [ankRX, ankRY, ankRZ] = getRootBonePoint(bones[BONE_IDX.footR], 0, 0, 0);
    const [toeRX, toeRY, toeRZ] = getRootBonePoint(bones[BONE_IDX.footR], 0, -d.H * 0.025, footLen * 0.56);

    const wristR = d.upperR * (d.female ? 0.34 : 0.36);
    const handTipOffset = wristR * 4.6;
    const [shoLX, shoLY, shoLZ] = getRootBonePoint(bones[BONE_IDX.armL], 0, -d.upperR * 0.72, 0);
    const [elbLX, elbLY, elbLZ] = getRootBonePoint(bones[BONE_IDX.elbowL], 0, 0, 0);
    const [wriLX, wriLY, wriLZ] = getRootBonePoint(bones[BONE_IDX.handL], 0, 0, 0);
    const [tipLX, tipLY, tipLZ] = getRootBonePoint(bones[BONE_IDX.handL], 0, -handTipOffset, 0);

    const [shoRX, shoRY, shoRZ] = getRootBonePoint(bones[BONE_IDX.armR], 0, -d.upperR * 0.72, 0);
    const [elbRX, elbRY, elbRZ] = getRootBonePoint(bones[BONE_IDX.elbowR], 0, 0, 0);
    const [wriRX, wriRY, wriRZ] = getRootBonePoint(bones[BONE_IDX.handR], 0, 0, 0);
    const [tipRX, tipRY, tipRZ] = getRootBonePoint(bones[BONE_IDX.handR], 0, -handTipOffset, 0);

    const isKid = curCategory === "girls" || curCategory === "boys";
    const freq = isKid ? 3.35 : 2.95;
    const phase = time * freq;
    const waistY = d.hipY + d.span * 0.44;
    const underarmY = d.shoulderY - d.span * 0.09;
    const hipPivotMag = d.hipR * (d.female ? 0.45 : 0.47);

    const FLUIDITY_MAP = {
      chiffon: 1.38, silk: 1.25, satin: 1.15, linen: 1.0,
      cotton: 0.92, velvet: 0.85, wool: 0.72, denim: 0.62, leather: 0.50,
    };
    const matKey = fabricState.bodice?.front?.material || "cotton";
    const fluidity = FLUIDITY_MAP[matKey] || 0.95;

    const p = { x: 0, y: 0, z: 0 };
    const calfSwellFn = (u) => d.thighR * 0.25 * bumpWindow(u, 0.31, 0.28);
    const forearmSwellFn = (u) => (u < 0.32 ? d.upperR * 0.04 * Math.sin((Math.PI * u) / 0.32) : 0);

    // Push any lower-body garment vertex away from outer bare/clothed forearms & hands so arms never enter skirts/bodices
    const guardArmOutsideGarment = (pt, restY) => {
      if (restY > underarmY - 0.04) return;
      const armGuardL = [elbLX, elbLY, elbLZ, tipLX, tipLY, tipLZ];
      const armGuardR = [elbRX, elbRY, elbRZ, tipRX, tipRY, tipRZ];
      const guardR = d.upperR * 0.76 + 0.015;
      for (const [ax, ay, az, bx, by, bz] of [armGuardL, armGuardR]) {
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const lenSq = abx * abx + aby * aby + abz * abz;
        const u = lenSq > 1e-8 ? clamp(((pt.x - ax) * abx + (pt.y - ay) * aby + (pt.z - az) * abz) / lenSq, 0, 1) : 0;
        const cx = ax + abx * u, cy = ay + aby * u, cz = az + abz * u;
        const dx = pt.x - cx, dy = pt.y - cy, dz = pt.z - cz;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < guardR * guardR) {
          // Gently press flared skirt/robe inward toward body axis away from the arm
          const toCenterX = pelvX - cx;
          const toCenterZ = pelvZ - cz;
          const tcLen = Math.hypot(toCenterX, toCenterZ) || 1;
          const pen = guardR - Math.sqrt(dSq);
          pt.x += (toCenterX / tcLen) * pen;
          pt.z += (toCenterZ / tcLen) * pen * 0.5;
        }
      }
    };

    const collideTorsoAndLegs = (pt, restY, isTrousers) => {
      const margin = 0.0105;
      // 1. Sculpted chest / bust / ribcage & pelvis / glutes / iliac crest in live bone frames
      if (restY >= d.hipY + d.span * 0.20 && restY <= d.shoulderY - d.span * 0.055) {
        enforceBoneSculptedSurface(pt, BONE_IDX.chest, d.hipY + d.span * 0.24, d.shoulderY - d.span * 0.055, d, 0.0095);
      }
      if (restY >= d.hipY - d.span * 0.14 && restY <= waistY + d.span * 0.22) {
        enforceBoneSculptedSurface(pt, BONE_IDX.spine, d.hipY + d.span * 0.05, waistY + d.span * 0.20, d, 0.0095);
      }
      if (restY <= waistY + 0.05 && restY >= d.hipY - d.span * 0.16) {
        enforceBoneSculptedSurface(pt, BONE_IDX.pelvis, d.hipY - d.span * 0.13, waistY + 0.03, d, 0.010);
      }

      // 2. Posed Left & Right Thighs, Knees, Calves & Feet
      if (restY <= d.hipY + 0.04) {
        const medTop = isTrousers ? Math.max(d.thighR * 0.66, hipPivotMag - 0.013) : d.thighR * 0.85;
        const latTop = d.thighR * 1.04 + margin;
        const zTop = d.thighR * 1.11 + margin;
        const kneeRad = d.thighR * 0.68 + margin;
        const ankRad = d.thighR * 0.44 + margin;

        pushPointOutOfAnisoCapsule(pt, hipLX, hipLY, hipLZ, kneeLX, kneeLY, kneeLZ, medTop, latTop, zTop, kneeRad, kneeRad, kneeRad + 0.004, 1);
        pushPointOutOfAnisoCapsule(pt, hipRX, hipRY, hipRZ, kneeRX, kneeRY, kneeRZ, medTop, latTop, zTop, kneeRad, kneeRad, kneeRad + 0.004, -1);

        pushPointOutOfCapsule(pt, kneeLX, kneeLY, kneeLZ, ankLX, ankLY, ankLZ, kneeRad, ankRad, calfSwellFn);
        pushPointOutOfCapsule(pt, kneeRX, kneeRY, kneeRZ, ankRX, ankRY, ankRZ, kneeRad, ankRad, calfSwellFn);

        if (restY < d.H * 0.12) {
          const footR = footLen * 0.21 + margin;
          pushPointOutOfCapsule(pt, ankLX, ankLY, ankLZ, toeLX, toeLY, toeLZ, ankRad, footR);
          pushPointOutOfCapsule(pt, ankRX, ankRY, ankRZ, toeRX, toeRY, toeRZ, ankRad, footR);
        }
      }
    };

    garmentGroup.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.visible || !mesh.userData.cpuSkinned) return;
      const geo = mesh.geometry;
      const restPos = geo.userData.restPos;
      const skinIdx = geo.userData.skinIdx;
      const skinWgt = geo.userData.skinWgt;
      const posAttr = geo.attributes.position;
      if (!restPos || !skinIdx || !skinWgt || !posAttr) return;

      const out = posAttr.array;
      const count = posAttr.count;
      const part = mesh.name;
      const meta = geo.userData.gridMeta;
      const isTrousers = part === "trousers";
      const isSkirt = part === "skirt";
      const isSleeve = part === "sleeve";
      const isBodice = part === "bodice";
      const isCollar = mesh.userData.garmentType === "collar";

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const i4 = i * 4;
        const rx = restPos[i3], ry = restPos[i3 + 1], rz = restPos[i3 + 2];

        // 4-bone CPU Linear Blend Skinning in root space
        let sx = 0, sy = 0, sz = 0;
        for (let slot = 0; slot < 4; slot++) {
          const w = skinWgt[i4 + slot];
          if (w <= 1e-6) continue;
          const m = _dynMats[skinIdx[i4 + slot]].elements;
          sx += w * (m[0] * rx + m[4] * ry + m[8] * rz + m[12]);
          sy += w * (m[1] * rx + m[5] * ry + m[9] * rz + m[13]);
          sz += w * (m[2] * rx + m[6] * ry + m[10] * rz + m[14]);
        }

        p.x = sx; p.y = sy; p.z = sz;

        // Secondary fabric motion (continuous in phi so front/back side seams never split!)
        if (!reduceMotion && !isCollar) {
          if (isSkirt && meta) {
            const drop = clamp((meta.topY - ry) / Math.max(0.14, meta.topY - meta.hemY), 0, 1);
            const wDrop = Math.pow(drop, 1.45) * fluidity;
            const phi = Math.atan2(rx, rz);
            if (isWalking) {
              const flareBoost = clamp(meta.flare || 1.15, 0.9, 1.9);
              p.z += wDrop * flareBoost * (0.0085 * Math.sin(2 * phase - 1.1) + 0.006 * Math.sin(phase + 2 * phi) - 0.004 * Math.cos(phi));
              p.x += wDrop * flareBoost * (0.0055 * Math.cos(phase - 0.5) + 0.0035 * Math.sin(2 * phase) * Math.sin(phi));
            } else {
              p.z += wDrop * 0.0018 * Math.sin(time * 1.7 + 2 * phi);
              p.x += wDrop * 0.0014 * Math.cos(time * 1.4 + phi);
            }
          } else if (isBodice && meta && ry < meta.waistY) {
            const drop = clamp((meta.waistY - ry) / Math.max(0.14, meta.waistY - meta.hemY), 0, 1);
            const wDrop = Math.pow(drop, 1.4) * fluidity * (meta.style === "robe" || meta.style === "tunic" ? 1.0 : 0.35);
            const phi = Math.atan2(rx, rz);
            if (isWalking) {
              p.z += wDrop * (0.007 * Math.sin(2 * phase - 1.0) + 0.0045 * Math.sin(phase + 2 * phi));
              p.x += wDrop * 0.0045 * Math.cos(phase - 0.5);
            } else {
              p.z += wDrop * 0.0014 * Math.sin(time * 1.6 + 2 * phi);
            }
          } else if (isSleeve && meta) {
            const dy = clamp((d.shoulderY - d.span * 0.035 - ry) / Math.max(0.10, meta.totalSlLen || 0.25), 0, 1);
            const looseMult = (meta.style === "bell" || meta.style === "bishop" || meta.style === "puff") ? 1.35 : 0.45;
            if (isWalking) {
              const sSign = mesh.userData.armSide || 1;
              p.z += Math.pow(dy, 1.3) * fluidity * looseMult * 0.0055 * Math.cos(phase) * sSign;
            }
          }
        }

        // Strict Anatomical Collision Resolution
        if (isSleeve) {
          const sSide = mesh.userData.armSide || (rx >= 0 ? 1 : -1);
          const margin = 0.0095;
          if (sSide > 0) {
            pushPointOutOfCapsule(p, shoLX, shoLY, shoLZ, elbLX, elbLY, elbLZ, d.upperR * 1.00 + margin, d.upperR * 0.79 + margin);
            pushPointOutOfCapsule(p, elbLX, elbLY, elbLZ, wriLX, wriLY, wriLZ, d.upperR * 0.80 + margin, wristR * 1.18 + margin, forearmSwellFn);
            pushPointOutOfCapsule(p, wriLX, wriLY, wriLZ, tipLX, tipLY, tipLZ, wristR * 1.24 + margin, wristR * 1.36 + margin);
          } else {
            pushPointOutOfCapsule(p, shoRX, shoRY, shoRZ, elbRX, elbRY, elbRZ, d.upperR * 1.00 + margin, d.upperR * 0.79 + margin);
            pushPointOutOfCapsule(p, elbRX, elbRY, elbRZ, wriRX, wriRY, wriRZ, d.upperR * 0.80 + margin, wristR * 1.18 + margin, forearmSwellFn);
            pushPointOutOfCapsule(p, wriRX, wriRY, wriRZ, tipRX, tipRY, tipRZ, wristR * 1.24 + margin, wristR * 1.36 + margin);
          }
          if (ry < d.shoulderY - d.span * 0.07) {
            enforceBoneSculptedSurface(p, BONE_IDX.chest, d.hipY + d.span * 0.30, d.shoulderY - d.span * 0.05, d, 0.011);
          }
        } else if (!isCollar) {
          // First keep flared cloth outside the swinging arms/hands, then strictly enforce body-inside-garment push-out!
          if (!isPartCurrentlyShown("sleeve") || ry < d.hipY + d.span * 0.18) {
            guardArmOutsideGarment(p, ry);
          }
          collideTorsoAndLegs(p, ry, isTrousers);
          if (isBodice && ry > d.shoulderY - d.span * 0.14 && ry < d.shoulderY - d.span * 0.022 && Math.abs(rx) > d.shoulderHalf * 0.62) {
            // Keep lateral bodice armholes cleanly outside the proximal upper-arm deltoid without splitting top shoulder seam
            if (rx >= 0) {
              pushPointOutOfCapsule(p, shoLX, shoLY, shoLZ, elbLX, elbLY, elbLZ, d.upperR * 0.90 + 0.006, d.upperR * 0.78 + 0.006);
            } else {
              pushPointOutOfCapsule(p, shoRX, shoRY, shoRZ, elbRX, elbRY, elbRZ, d.upperR * 0.90 + 0.006, d.upperR * 0.78 + 0.006);
            }
          }
        }

        // Prevent floor-length skirts/robes from dipping below studio floor y = 0.008
        if (p.y < 0.008) p.y = 0.008;

        out[i3] = p.x;
        out[i3 + 1] = p.y;
        out[i3 + 2] = p.z;
      }

      posAttr.needsUpdate = true;
    });

    // Exact bodice front/back shoulder-seam & side-seam welding
    if (bodiceFrontMesh && bodiceBackMesh && bodiceFrontMesh.visible && bodiceBackMesh.visible) {
      const fGeo = bodiceFrontMesh.geometry;
      const bGeo = bodiceBackMesh.geometry;
      const fRest = fGeo.userData.restPos;
      const bRest = bGeo.userData.restPos;
      if (fRest && bRest && fGeo.attributes.position && bGeo.attributes.position && fRest.length === bRest.length) {
        const fArr = fGeo.attributes.position.array;
        const bArr = bGeo.attributes.position.array;
        const nVerts = fGeo.attributes.position.count;
        for (let i = 0; i < nVerts; i++) {
          const i3 = i * 3;
          const dxR = fRest[i3] - bRest[i3];
          const dyR = fRest[i3 + 1] - bRest[i3 + 1];
          const dzR = fRest[i3 + 2] - bRest[i3 + 2];
          if (dxR * dxR + dyR * dyR + dzR * dzR < 1.6e-5) {
            const mx = 0.5 * (fArr[i3] + bArr[i3]);
            const my = 0.5 * (fArr[i3 + 1] + bArr[i3 + 1]);
            const mz = 0.5 * (fArr[i3 + 2] + bArr[i3 + 2]);
            fArr[i3] = bArr[i3] = mx;
            fArr[i3 + 1] = bArr[i3 + 1] = my;
            fArr[i3 + 2] = bArr[i3 + 2] = mz;
          }
        }
        fGeo.attributes.position.needsUpdate = true;
        bGeo.attributes.position.needsUpdate = true;
      }
    }

    // Circumferential skirt drape tenting & exact front/back side-seam welding
    if (skirtFrontMesh && skirtBackMesh && skirtFrontMesh.visible && skirtBackMesh.visible) {
      const fGeo = skirtFrontMesh.geometry;
      const bGeo = skirtBackMesh.geometry;
      const meta = fGeo.userData.gridMeta;
      if (meta && fGeo.attributes.position && bGeo.attributes.position) {
        const fArr = fGeo.attributes.position.array;
        const bArr = bGeo.attributes.position.array;
        const rows = meta.rows;
        const cols = meta.cols; // HALF_SEG + 1 (e.g. 29 -> 56 unique ring points)
        const halfSeg = cols - 1;
        const fullN = halfSeg * 2;
        const ringR = new Float32Array(fullN);
        const nextR = new Float32Array(fullN);

        for (let r = 0; r < rows; r++) {
          const rowOff = r * cols;
          // 1. Weld left (+X: front[halfSeg] <-> back[0]) and right (-X: front[0] <-> back[halfSeg]) side seams
          const fLeft = (rowOff + halfSeg) * 3, bLeft = rowOff * 3;
          const lx = 0.5 * (fArr[fLeft] + bArr[bLeft]);
          const ly = 0.5 * (fArr[fLeft + 1] + bArr[bLeft + 1]);
          const lz = 0.5 * (fArr[fLeft + 2] + bArr[bLeft + 2]);
          fArr[fLeft] = bArr[bLeft] = lx;
          fArr[fLeft + 1] = bArr[bLeft + 1] = ly;
          fArr[fLeft + 2] = bArr[bLeft + 2] = lz;

          const fRight = rowOff * 3, bRight = (rowOff + halfSeg) * 3;
          const rx0 = 0.5 * (fArr[fRight] + bArr[bRight]);
          const ry0 = 0.5 * (fArr[fRight + 1] + bArr[bRight + 1]);
          const rz0 = 0.5 * (fArr[fRight + 2] + bArr[bRight + 2]);
          fArr[fRight] = bArr[bRight] = rx0;
          fArr[fRight + 1] = bArr[bRight + 1] = ry0;
          fArr[fRight + 2] = bArr[bRight + 2] = rz0;

          // 2. Smooth outward circumferential tenting around posed pelvis axis so advancing knees create graceful cloth folds
          if (r >= 4 && (meta.pleats || 0) === 0) {
            for (let k = 0; k < halfSeg; k++) {
              const fi = (rowOff + k) * 3;
              ringR[k] = Math.hypot(fArr[fi] - pelvX, fArr[fi + 2] - pelvZ);
              const bi = (rowOff + k) * 3;
              ringR[halfSeg + k] = Math.hypot(bArr[bi] - pelvX, bArr[bi + 2] - pelvZ);
            }
            for (let pass = 0; pass < 2; pass++) {
              for (let k = 0; k < fullN; k++) {
                const prev = ringR[(k + fullN - 1) % fullN];
                const next = ringR[(k + 1) % fullN];
                const avg = 0.28 * prev + 0.44 * ringR[k] + 0.28 * next;
                nextR[k] = Math.max(ringR[k], avg);
              }
              ringR.set(nextR);
            }
            for (let k = 0; k < halfSeg; k++) {
              const fi = (rowOff + k) * 3;
              const curF = Math.hypot(fArr[fi] - pelvX, fArr[fi + 2] - pelvZ);
              if (ringR[k] > curF + 1e-5 && curF > 1e-4) {
                const sc = ringR[k] / curF;
                fArr[fi] = pelvX + (fArr[fi] - pelvX) * sc;
                fArr[fi + 2] = pelvZ + (fArr[fi + 2] - pelvZ) * sc;
              }
              const bi = (rowOff + k) * 3;
              const curB = Math.hypot(bArr[bi] - pelvX, bArr[bi + 2] - pelvZ);
              if (ringR[halfSeg + k] > curB + 1e-5 && curB > 1e-4) {
                const sc = ringR[halfSeg + k] / curB;
                bArr[bi] = pelvX + (bArr[bi] - pelvX) * sc;
                bArr[bi + 2] = pelvZ + (bArr[bi + 2] - pelvZ) * sc;
              }
            }
            // Re-sync side-seam endpoints after tenting
            fArr[fLeft] = bArr[bLeft]; fArr[fLeft + 2] = bArr[bLeft + 2];
            bArr[bRight] = fArr[fRight]; bArr[bRight + 2] = fArr[fRight + 2];
          }
        }
        fGeo.attributes.position.needsUpdate = true;
        bGeo.attributes.position.needsUpdate = true;
      }
    }

    // Recompute smooth lighting normals for all updated visible garment meshes
    garmentGroup.traverse((mesh) => {
      if (mesh.isMesh && mesh.visible && mesh.userData.cpuSkinned) {
        mesh.geometry.computeVertexNormals();
      }
    });

    // Smooth vertex normals across welded bodice shoulder/side seams and skirt side seams (C1 shading continuity)
    if (bodiceFrontMesh && bodiceBackMesh && bodiceFrontMesh.visible && bodiceBackMesh.visible) {
      const fGeo = bodiceFrontMesh.geometry;
      const bGeo = bodiceBackMesh.geometry;
      const fRest = fGeo.userData.restPos;
      const bRest = bGeo.userData.restPos;
      if (fRest && bRest && fGeo.attributes.normal && bGeo.attributes.normal && fRest.length === bRest.length) {
        const fN = fGeo.attributes.normal.array;
        const bN = bGeo.attributes.normal.array;
        const nVerts = fGeo.attributes.normal.count;
        for (let i = 0; i < nVerts; i++) {
          const i3 = i * 3;
          const dxR = fRest[i3] - bRest[i3];
          const dyR = fRest[i3 + 1] - bRest[i3 + 1];
          const dzR = fRest[i3 + 2] - bRest[i3 + 2];
          if (dxR * dxR + dyR * dyR + dzR * dzR < 1.6e-5) {
            let nx = fN[i3] + bN[i3];
            let ny = fN[i3 + 1] + bN[i3 + 1];
            let nz = fN[i3 + 2] + bN[i3 + 2];
            const len = Math.hypot(nx, ny, nz) || 1;
            nx /= len; ny /= len; nz /= len;
            fN[i3] = bN[i3] = nx;
            fN[i3 + 1] = bN[i3 + 1] = ny;
            fN[i3 + 2] = bN[i3 + 2] = nz;
          }
        }
        fGeo.attributes.normal.needsUpdate = true;
        bGeo.attributes.normal.needsUpdate = true;
      }
    }

    if (skirtFrontMesh && skirtBackMesh && skirtFrontMesh.visible && skirtBackMesh.visible) {
      const fGeo = skirtFrontMesh.geometry;
      const bGeo = skirtBackMesh.geometry;
      const meta = fGeo.userData.gridMeta;
      if (meta && fGeo.attributes.normal && bGeo.attributes.normal) {
        const fN = fGeo.attributes.normal.array;
        const bN = bGeo.attributes.normal.array;
        const rows = meta.rows;
        const cols = meta.cols;
        const halfSeg = cols - 1;
        for (let r = 0; r < rows; r++) {
          const rowOff = r * cols;
          for (const [fIdx, bIdx] of [
            [(rowOff + halfSeg) * 3, rowOff * 3],
            [rowOff * 3, (rowOff + halfSeg) * 3],
          ]) {
            let nx = fN[fIdx] + bN[bIdx];
            let ny = fN[fIdx + 1] + bN[bIdx + 1];
            let nz = fN[fIdx + 2] + bN[bIdx + 2];
            const len = Math.hypot(nx, ny, nz) || 1;
            nx /= len; ny /= len; nz /= len;
            fN[fIdx] = bN[bIdx] = nx;
            fN[fIdx + 1] = bN[bIdx + 1] = ny;
            fN[fIdx + 2] = bN[bIdx + 2] = nz;
          }
        }
        fGeo.attributes.normal.needsUpdate = true;
        bGeo.attributes.normal.needsUpdate = true;
      }
    }

    updateAccessoriesPose();
  }

  function attachAccessoryRigAnchor(obj, weights) {
    obj.updateMatrix();
    obj.userData.bindMatrix = obj.matrix.clone();
    const [bi, bw] = packSkinWeights(weights);
    obj.userData.skinIdx = bi;
    obj.userData.skinWgt = bw;
    obj.matrixAutoUpdate = false;
  }

  function updateAccessoriesPose() {
    if (!accessoriesGroup || !_dynMats || !activeMannequin || !activeMannequin.skeleton) return;
    for (const child of accessoriesGroup.children) {
      if (!child.visible || !child.userData.bindMatrix || !child.userData.skinIdx) continue;
      const bi = child.userData.skinIdx;
      const bw = child.userData.skinWgt;
      const te = _tmpAccMat.elements;
      for (let k = 0; k < 16; k++) te[k] = 0;
      for (let slot = 0; slot < 4; slot++) {
        const w = bw[slot];
        if (w <= 1e-6) continue;
        const me = _dynMats[bi[slot]].elements;
        for (let k = 0; k < 16; k++) te[k] += w * me[k];
      }
      // Orthonormalize upper-left 3x3 basis so rigid metal buttons/buckles never shear
      const xLen = Math.hypot(te[0], te[1], te[2]) || 1;
      te[0] /= xLen; te[1] /= xLen; te[2] /= xLen;
      const yLen = Math.hypot(te[4], te[5], te[6]) || 1;
      te[4] /= yLen; te[5] /= yLen; te[6] /= yLen;
      const zLen = Math.hypot(te[8], te[9], te[10]) || 1;
      te[8] /= zLen; te[9] /= zLen; te[10] /= zLen;
      te[15] = 1;

      child.matrix.multiplyMatrices(_tmpAccMat, child.userData.bindMatrix);
      child.matrixWorldNeedsUpdate = true;
    }
  }

  function buildGarment(category, m, d, explicitMetrics = null) {
    if (garmentGroup) {
      root.remove(garmentGroup);
      disposeObject3D(garmentGroup);
    }
    garmentGroup = new THREE.Group();
    garmentGroup.name = "garmentGroup";
    root.add(garmentGroup);
    bodiceFrontMesh = null;
    bodiceBackMesh = null;
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
    if (activeMannequin && limbs && limbs.leg1) {
      applyNaturalHumanMotion(limbs, d, activeMannequin.landmarks, {
        time: t,
        walking: walking && !reduceMotion,
        reduceMotion,
        category,
        minArmAbduct: computeSafeArmAbduction(d),
        blendAlpha: 1.0,
      });
      updateGarmentDynamics(t, walking && !reduceMotion);
    }
  }

  // ---------- Accessories & Trims: Buttons, Zippers & Belts ----------
  function createButtonMesh(size, style, baseColor) {
    const btnG = new THREE.Group();
    let mat;
    if (isSoftwareGL) {
      const colMap = {
        gold: [0xd4af37, 85],
        silver: [0xe5e7eb, 90],
        horn: [0x362112, 48],
        pearl: [0xf5f3ea, 62],
        matte_black: [0x18181b, 14],
        wood: [0x7c4f27, 20],
      };
      const [c, sh] = colMap[style] || [baseColor || 0x4f46e5, 32];
      mat = new THREE.MeshPhongMaterial({ color: c, shininess: sh, specular: 0x666666 });
    } else if (style === "gold") {
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
    if (isSoftwareGL) {
      const zCol = style === "silver" ? 0xe0e0e0 : (style === "brass" ? 0xc8963e : (style === "gunmetal" ? 0x222226 : 0x888888));
      teethMat = new THREE.MeshPhongMaterial({ color: zCol, shininess: 78, specular: 0x777777 });
    } else if (style === "silver") {
      teethMat = new THREE.MeshPhysicalMaterial({ color: 0xe0e0e0, metalness: 0.95, roughness: 0.2 });
    } else if (style === "brass") {
      teethMat = new THREE.MeshPhysicalMaterial({ color: 0xc8963e, metalness: 0.88, roughness: 0.28 });
    } else if (style === "gunmetal") {
      teethMat = new THREE.MeshPhysicalMaterial({ color: 0x222226, metalness: 0.85, roughness: 0.35 });
    } else {
      teethMat = new THREE.MeshPhysicalMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });
    }
    const tapeMat = isSoftwareGL
      ? new THREE.MeshPhongMaterial({ color: 0x1f2937, shininess: 10 })
      : new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85 });

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

  function createBeltMesh(waistY, waistR, zScale, style, width = "medium", baseCol = 0x4f46e5, d = null, waistEase = 0.020) {
    const beltG = new THREE.Group();
    const h = width === "slim" ? 0.024 : (width === "wide" ? 0.056 : 0.036);
    const strapThick = 0.004;

    let strapMat, buckleMat;
    if (isSoftwareGL) {
      const sCol = style === "leather_gold" ? 0x1a1918 : (style === "leather_silver" ? 0x54392b : (style === "matte_black" ? 0x111112 : baseCol));
      const bCol = style === "leather_silver" ? 0xe0e4e8 : (style === "matte_black" ? 0x222224 : 0xd4af37);
      strapMat = new THREE.MeshPhongMaterial({ color: sCol, shininess: 32, specular: 0x333333, side: THREE.DoubleSide });
      buckleMat = new THREE.MeshPhongMaterial({ color: bCol, shininess: 85, specular: 0x888888 });
    } else if (style === "leather_gold") {
      strapMat = new THREE.MeshStandardMaterial({ color: 0x1a1918, roughness: 0.38, metalness: 0.05, side: THREE.DoubleSide });
      buckleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.22, metalness: 0.92 });
    } else if (style === "leather_silver") {
      strapMat = new THREE.MeshStandardMaterial({ color: 0x54392b, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide });
      buckleMat = new THREE.MeshStandardMaterial({ color: 0xe0e4e8, roughness: 0.18, metalness: 0.90 });
    } else if (style === "matte_black") {
      strapMat = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.65, metalness: 0.02, side: THREE.DoubleSide });
      buckleMat = new THREE.MeshStandardMaterial({ color: 0x222224, roughness: 0.45, metalness: 0.70 });
    } else {
      strapMat = new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.50, metalness: 0.05, side: THREE.DoubleSide });
      buckleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.22, metalness: 0.92 });
    }

    const N = 48;
    const sPos = [];
    const sIdx = [];
    let frontOuterZ = (waistR * 1.035 + 0.022) * zScale;
    for (let k = 0; k <= N; k++) {
      const phi = (k / N) * Math.PI * 2;
      let xi, zi, xo, zo;
      if (d) {
        [xi, zi] = getBodySurfacePoint(waistY, phi, d, waistEase + 0.004);
        [xo, zo] = getBodySurfacePoint(waistY, phi, d, waistEase + 0.004 + strapThick);
      } else {
        const rIn = waistR * 1.03 + waistEase;
        const rOut = rIn + strapThick;
        xi = rIn * Math.sin(phi);
        zi = rIn * zScale * Math.cos(phi);
        xo = rOut * Math.sin(phi);
        zo = rOut * zScale * Math.cos(phi);
      }
      if (k === 0) frontOuterZ = zo;
      const yBot = waistY - h * 0.5;
      const yTop = waistY + h * 0.5;
      // 4 vertices per slice: 0=outerBot, 1=outerTop, 2=innerTop, 3=innerBot
      sPos.push(xo, yBot, zo, xo, yTop, zo, xi, yTop, zi, xi, yBot, zi);
    }
    for (let k = 0; k < N; k++) {
      const a = k * 4;
      const b = (k + 1) * 4;
      for (let side = 0; side < 4; side++) {
        const s1 = (side + 1) % 4;
        sIdx.push(a + side, b + side, b + s1, a + side, b + s1, a + s1);
      }
    }
    const strapGeo = new THREE.BufferGeometry();
    strapGeo.setAttribute("position", new THREE.Float32BufferAttribute(sPos, 3));
    strapGeo.setIndex(sIdx);
    strapGeo.computeVertexNormals();
    const strapMesh = new THREE.Mesh(strapGeo, strapMat);
    beltG.add(strapMesh);

    const bW = h * 1.45;
    const bH = h * 1.25;
    const bThick = 0.006;
    const buckleG = new THREE.Group();
    buckleG.position.set(0, waistY, frontOuterZ + 0.003);

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
    const easeBodice = 0.017 + Math.max(-0.002, ((curPatternMetrics?.bodice?.easeRatio || 1.04) - 1.0) * 0.042);

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
          const [, zFront] = getBodySurfacePoint(y, 0, d, easeBodice);
          const btn = createButtonMesh(1.0, style, baseCol);
          btn.position.set(0, y, zFront);
          btn.userData.parentPart = "bodice";
          attachAccessoryRigAnchor(btn, torsoGarmentWeights(y, 0, d));
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
          const [, zFront] = getBodySurfacePoint(y, 0.28, d, easeBodice);
          [-1, 1].forEach((col) => {
            const btn = createButtonMesh(1.0, style, baseCol);
            btn.position.set(col * colOffset, y, zFront);
            btn.userData.parentPart = "bodice";
            attachAccessoryRigAnchor(btn, torsoGarmentWeights(y, col * colOffset, d));
            accessoriesGroup.add(btn);
          });
        }
      } else if (bCfg.placement === "waistband") {
        const [, zFront] = getBodySurfacePoint(waistYY, 0, d, 0.019);
        const btn = createButtonMesh(1.15, style, baseCol);
        btn.position.set(0, waistYY, zFront);
        btn.userData.parentPart = "trousers";
        attachAccessoryRigAnchor(btn, [[BONE_IDX.pelvis, 0.62], [BONE_IDX.spine, 0.38]]);
        accessoriesGroup.add(btn);
      } else if (bCfg.placement === "cuffs") {
        const slFrac = clamp(curPatternMetrics?.sleeve?.lengthFrac || 0.96, 0.16, 1.02);
        const totalSlLen = d.armLen * slFrac;
        const pivotX = d.shoulderHalf * 0.82;
        const pivotY = d.shoulderY - d.span * 0.035;
        const upperArmLen = d.armLen * 0.48;
        const wristDist = d.armLen * 0.94;
        const wristR = d.upperR * (d.female ? 0.34 : 0.36);

        [-1, 1].forEach((s) => {
          const bArm = s > 0 ? BONE_IDX.armL : BONE_IDX.armR;
          const bElbow = s > 0 ? BONE_IDX.elbowL : BONE_IDX.elbowR;
          const bHand = s > 0 ? BONE_IDX.handL : BONE_IDX.handR;
          const cuffCount = Math.min(3, count);
          for (let i = 0; i < cuffCount; i++) {
            const dy = clamp(totalSlLen - 0.018 - i * 0.018, 0.028, totalSlLen - 0.008);
            const armRad = dy <= upperArmLen
              ? d.upperR * (1.07 * (1 - dy / upperArmLen) + 0.79 * (dy / upperArmLen))
              : d.upperR * (0.79 * (1 - clamp((dy - upperArmLen) / (d.armLen * 0.46), 0, 1)) + (wristR / d.upperR) * 1.18 * clamp((dy - upperArmLen) / (d.armLen * 0.46), 0, 1));
            const cuffR = armRad + 0.016;
            const btn = createButtonMesh(0.75, style, baseCol);
            btn.position.set(s * (pivotX + cuffR), pivotY - dy, -0.003);
            btn.rotation.y = (s * Math.PI) / 2;
            btn.userData.parentPart = "sleeve";

            let cWeights;
            if (dy < upperArmLen) cWeights = [[bArm, 1]];
            else {
              const fHand = smoothstep(wristDist - 0.025, wristDist + 0.020, dy);
              cWeights = [[bElbow, 1 - fHand], [bHand, fHand]];
            }
            attachAccessoryRigAnchor(btn, cWeights);
            accessoriesGroup.add(btn);
          }
        });
      }
    }

    if (zCfg && zCfg.enabled) {
      const style = zCfg.style || "silver";
      const openPct = zCfg.openPct || 0;
      const [, waistFrontZ] = getBodySurfacePoint(waistYY, 0, d, easeBodice);
      const [, waistBackZ] = getBodySurfacePoint(waistYY, Math.PI, d, easeBodice);

      if (zCfg.placement === "center_front") {
        const zip = createZipperMesh(d.hipY + d.span * 0.72, waistYY, waistFrontZ, style, openPct);
        zip.userData.parentPart = "bodice";
        attachAccessoryRigAnchor(zip, [[BONE_IDX.chest, 0.62], [BONE_IDX.spine, 0.38]]);
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "center_back") {
        const zip = createZipperMesh(d.hipY + d.span * 0.74, d.hipY, Math.abs(waistBackZ), style, openPct);
        zip.rotation.y = Math.PI;
        zip.userData.parentPart = "bodice";
        attachAccessoryRigAnchor(zip, [[BONE_IDX.chest, 0.48], [BONE_IDX.spine, 0.34], [BONE_IDX.pelvis, 0.18]]);
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "biker_asymmetric") {
        const zip = createZipperMesh(d.shoulderY - d.span * 0.10, waistYY, waistFrontZ + 0.002, style, openPct);
        zip.position.x = 0.035;
        zip.rotation.z = -0.15;
        zip.userData.parentPart = "bodice";
        attachAccessoryRigAnchor(zip, [[BONE_IDX.chest, 0.65], [BONE_IDX.spine, 0.35]]);
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "trouser_fly") {
        const [, hipFrontZ] = getBodySurfacePoint(d.hipY, 0, d, 0.020);
        const zip = createZipperMesh(waistYY, d.hipY - d.span * 0.11, hipFrontZ, style, openPct);
        zip.userData.parentPart = "trousers";
        attachAccessoryRigAnchor(zip, [[BONE_IDX.pelvis, 0.85], [BONE_IDX.spine, 0.15]]);
        accessoriesGroup.add(zip);
      }
    }

    if (beltCfg && beltCfg.enabled) {
      const bStyle = beltCfg.style || "leather_gold";
      const bWidth = beltCfg.width || "medium";
      const baseCol = fabricState.bodice?.front?.color || fabricState.skirt?.front?.color || fabricState.trousers?.front?.color || 0x4f46e5;
      const belt = createBeltMesh(waistYY, d.waistR, zScale, bStyle, bWidth, baseCol, d, easeBodice);
      belt.userData.parentPart = "waist";
      attachAccessoryRigAnchor(belt, [[BONE_IDX.pelvis, 0.58], [BONE_IDX.spine, 0.42]]);
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
      updateAccessoriesPose();
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

    const token = ++buildToken;
    if (!ready) {
      onLoading(true, { progress: 0 });
      if (initPromise) await initPromise;
      else if (host && !initFailed) await init(host);
      if (token !== buildToken) return;
      if (!ready) {
        onLoading(false);
        return;
      }
      resize();
    } else if (token !== buildToken) {
      return;
    }

    const preserveCamera = hasFramedOnce && lastFramedCategory === category && !opts.resetCamera;
    if (scene.background && scene.background.isTexture) scene.background.dispose();
    scene.background = gradientBackdrop();

    try {
      const url = avatarURLs[category];
      const isCustomUserUpload = url && !url.startsWith("avatars/") && !opts.forceMannequin;
      if (isCustomUserUpload) {
        onLoading(true, { progress: 0 });
        await nextFrame();
        if (token !== buildToken) return;
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
      if (renderer && scene && camera && !isSoftwareGL) {
        renderer.render(scene, camera);
      }
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

      const restPos = geo.userData.restPos;
      const v = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        // Sample bind-pose coordinates for stable anatomical ease comparison
        if (restPos) {
          v.set(restPos[i * 3], restPos[i * 3 + 1], restPos[i * 3 + 2]);
        } else {
          v.fromBufferAttribute(pos, i);
        }
        const y = v.y;
        let easeCm = 3.6;

        if (isSleeve) {
          const sideSign = v.x >= 0 ? 1 : -1;
          const armLocalX = v.x - sideSign * d.shoulderHalf * 0.82;
          const garmentR = Math.hypot(armLocalX, v.z);
          const dy = Math.max(0, d.shoulderY - d.span * 0.035 - y);
          const armFrac = clamp(dy / Math.max(0.2, d.armLen), 0, 1);
          const bodyArmR = d.upperR * (1.04 * (1 - armFrac) + 0.42 * armFrac);
          easeCm = (garmentR - bodyArmR) * 100 * 2 * Math.PI * 0.25;
        } else if (isTrousers && y < d.hipY - d.span * 0.14) {
          const legSign = v.x >= 0 ? 1 : -1;
          const legCx = legSign * d.hipR * (d.female ? 0.45 : 0.47);
          const garmentR = Math.hypot(v.x - legCx, v.z);
          const legFrac = clamp((y - d.H * 0.047) / Math.max(0.2, d.hipY - d.H * 0.047), 0, 1);
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
        mesh.userData.tensionMat = isSoftwareGL
          ? new THREE.MeshPhongMaterial({
              vertexColors: true,
              shininess: 18,
              side: THREE.DoubleSide,
            })
          : new THREE.MeshStandardMaterial({
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
    if (ready && activeMannequin && lastDims && limbs && limbs.leg1) {
      applyNaturalHumanMotion(limbs, lastDims, activeMannequin.landmarks, {
        time: t,
        walking: walking && !reduceMotion,
        reduceMotion,
        category: curCategory,
        minArmAbduct: computeSafeArmAbduction(lastDims),
        blendAlpha: 1.0,
      });
      updateGarmentDynamics(t, walking && !reduceMotion);
    }
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

  // ---------- Natural Biomechanical Gait, Living Idle Posture & Cloth Loop ----------
  function stepMotion(timeSec, blendAlpha = 1.0) {
    t = timeSec;
    if (activeMannequin && lastDims && limbs && limbs.leg1) {
      if (bodyGroup) {
        bodyGroup.position.y = 0;
        bodyGroup.rotation.set(0, 0, 0);
      }
      if (garmentGroup) {
        garmentGroup.position.y = 0;
        garmentGroup.rotation.set(0, 0, 0);
      }
      applyNaturalHumanMotion(limbs, lastDims, activeMannequin.landmarks, {
        time: t,
        walking: walking && !reduceMotion,
        reduceMotion,
        category: curCategory,
        minArmAbduct: computeSafeArmAbduction(lastDims),
        blendAlpha,
      });
      updateGarmentDynamics(t, walking && !reduceMotion);
      if (ready && controls && renderer && scene && camera) {
        controls.update();
        renderer.render(scene, camera);
      }
    } else if (walking && !reduceMotion && bodyGroup) {
      const bob = Math.abs(Math.sin(t * 3.0)) * 0.008;
      bodyGroup.position.y = bob;
      if (garmentGroup) garmentGroup.position.y = bob;
    }
  }

  function scheduleNextFrame(delayMs = 0) {
    if (delayMs > 0) {
      setTimeout(() => { raf = requestAnimationFrame(loop); }, delayMs);
    } else {
      raf = requestAnimationFrame(loop);
    }
  }

  function loop() {
    if (!ready || !host || host.clientWidth === 0 || host.clientHeight === 0) {
      scheduleNextFrame(120);
      return;
    }
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const nextT = t + 0.016;
    t = nextT;
    if (activeMannequin && lastDims && limbs && limbs.leg1) {
      if (bodyGroup) {
        bodyGroup.position.y = 0;
        bodyGroup.rotation.set(0, 0, 0);
      }
      if (garmentGroup) {
        garmentGroup.position.y = 0;
        garmentGroup.rotation.set(0, 0, 0);
      }
      applyNaturalHumanMotion(limbs, lastDims, activeMannequin.landmarks, {
        time: t,
        walking: walking && !reduceMotion,
        reduceMotion,
        category: curCategory,
        minArmAbduct: computeSafeArmAbduction(lastDims),
        blendAlpha: walking ? 0.34 : 0.16,
      });
      updateGarmentDynamics(t, walking && !reduceMotion);
    } else if (walking && !reduceMotion && bodyGroup) {
      const bob = Math.abs(Math.sin(t * 3.0)) * 0.008;
      bodyGroup.position.y = bob;
      if (garmentGroup) garmentGroup.position.y = bob;
    }

    controls.update();
    renderer.render(scene, camera);
    const frameMs = typeof performance !== "undefined" ? performance.now() - t0 : 0;
    if (frameMs > 30 && renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = false;
    }
    const delayMs = isSoftwareGL
      ? (frameMs > 24 ? Math.min(140, Math.round(frameMs * 0.85)) : 16)
      : (frameMs > 22 ? Math.min(60, Math.round(frameMs)) : 0);
    scheduleNextFrame(delayMs);
  }

  // ---------- misc ----------
  function resize() {
    if (!ready) {
      if (initFailed) fallback();
      return;
    }
    if (!host || !renderer || !camera) return;
    const r = host.getBoundingClientRect();
    const w = r.width || host.clientWidth || 0;
    const h = r.height || host.clientHeight || 0;
    if (w <= 0 || h <= 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function fallback() {
    onFatalError();
  }

  function setAvatarURL(category, url) {
    if (url && !url.startsWith("avatars/")) avatarURLs[category] = url;
    else delete avatarURLs[category];
  }

  async function retryInit() {
    if (ready) return true;
    initFailed = false;
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
    stepMotion,
    getSceneDebugRefs: () => ({ root, bodyGroup, garmentGroup, activeMannequin, limbs, lastDims }),
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
