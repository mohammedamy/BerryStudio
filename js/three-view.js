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
import { getMannequinFor } from "./mannequin-catalog.js";
import { computePatternMetrics3D } from "./pattern-3d-metrics.js";
import { getFabricTextureSet } from "./fabric-textures.js";
import {
  createDefaultStitchConfig,
  normalizeStitchConfig,
  normalizeThreadHex,
  resolveStitchThreadColor,
  STITCH_PART_INDEX,
  STITCH_STYLES,
} from "./stitch-config.js";

export const View3D = (() => {
  let THREE, OrbitControls, GLTFLoader, RGBELoader, cloneSkeleton;
  let renderer, scene, camera, controls, raf = null;
  let root, bodyGroup, garmentGroup, limbs = {};
  let activeMannequin = null;
  let curMannequin = null;
  let ready = false, initPromise = null, initFailed = false;
  let spinning = true, walking = true, t = 0;
  let reduceMotion = false;
  let host, curCategory = "women", curH = 1.7;
  let curMeasurements = null, lastDims = null, curPatternMetrics = null;
  let tensionMapEnabled = false;
  let lastTensionMetrics = { avgEase: 4.5, peakStrain: 0.0, status: "fitOptimal", fabric: "cotton" };
  let onTensionMetricsUpdate = () => { };
  let onLoading = () => { };
  let onAvatarIssue = () => { };
  let onFatalError = () => { };
  let noiseTex = null;
  const sharedTextures = new Set();
  let bodiceFrontMesh = null, bodiceBackMesh = null;
  let outerFrontMesh = null, outerBackMesh = null;
  let skirtFrontMesh = null, skirtBackMesh = null;
  let accessoriesGroup = null;
  function createDefaultAccessoriesState() {
    return {
      buttons: {
        enabled: false,
        shape: "classic_round",
        style: "gold",
        placement: "front_placket",
        count: 6,
        lengthFrac: 0.5,
        size: 1.0,
        color: null,
      },
      zipper: {
        enabled: false,
        shape: "classic_tab",
        style: "silver",
        placement: "center_front",
        lengthFrac: 0.5,
        size: 1.0,
        openPct: 0,
        color: null,
        tapeColor: null,
      },
      belt: {
        enabled: false,
        shape: null,
        style: "leather_gold",
        width: "medium",
        size: null,
        length: 0.35,
        color: null,
        buckleColor: null,
      },
      bow: {
        enabled: false,
        shape: "classic_ribbon",
        style: "satin",
        placement: "center_chest",
        size: null,
        length: null,
        color: "#f8fafc",
      },
      brooch: {
        enabled: false,
        shape: "floral_star",
        style: "gold",
        placement: "left_chest",
        size: 1.0,
        length: 0.35,
        color: null,
      },
    };
  }
  function normAccHex(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number" && Number.isFinite(v)) {
      return "#" + (v >>> 0 & 0xffffff).toString(16).padStart(6, "0");
    }
    const s = String(v).trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      return ("#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    return null;
  }
  function normalizeAccessoriesState(base, cfg, isLookbookReset = false) {
    const out = base ? JSON.parse(JSON.stringify(base)) : createDefaultAccessoriesState();
    const def = createDefaultAccessoriesState();
    if (!cfg || typeof cfg !== "object") return out;

    if (cfg.buttons) {
      const b = { ...out.buttons, ...cfg.buttons };
      b.enabled = Boolean(b.enabled);
      b.shape = String(b.shape || def.buttons.shape);
      b.style = String(b.style || def.buttons.style);
      b.placement = String(b.placement || def.buttons.placement);
      b.count = Math.max(1, Math.min(14, Math.round(Number(b.count) || def.buttons.count)));
      b.lengthFrac = clamp(Number.isFinite(Number(b.lengthFrac)) ? Number(b.lengthFrac) : def.buttons.lengthFrac, 0.2, 1.0);
      b.size = clamp(Number.isFinite(Number(b.size)) ? Number(b.size) : def.buttons.size, 0.5, 2.0);
      if ("color" in cfg.buttons) b.color = normAccHex(cfg.buttons.color);
      else if (isLookbookReset) b.color = null;
      out.buttons = b;
    }
    if (cfg.zipper) {
      const z = { ...out.zipper, ...cfg.zipper };
      z.enabled = Boolean(z.enabled);
      z.shape = String(z.shape || def.zipper.shape);
      z.style = String(z.style || def.zipper.style);
      z.placement = String(z.placement || def.zipper.placement);
      z.lengthFrac = clamp(Number.isFinite(Number(z.lengthFrac)) ? Number(z.lengthFrac) : def.zipper.lengthFrac, 0.2, 1.0);
      z.size = clamp(Number.isFinite(Number(z.size)) ? Number(z.size) : def.zipper.size, 0.6, 1.8);
      z.openPct = clamp(Number.isFinite(Number(z.openPct)) ? Number(z.openPct) : 0, 0, 0.75);
      if ("color" in cfg.zipper) z.color = normAccHex(cfg.zipper.color);
      else if (isLookbookReset) z.color = null;
      if ("tapeColor" in cfg.zipper) z.tapeColor = normAccHex(cfg.zipper.tapeColor);
      else if (isLookbookReset) z.tapeColor = null;
      out.zipper = z;
    }
    if (cfg.belt) {
      const bl = { ...out.belt, ...cfg.belt };
      bl.enabled = Boolean(bl.enabled);
      bl.style = String(bl.style || def.belt.style);
      if ("shape" in cfg.belt) bl.shape = cfg.belt.shape ? String(cfg.belt.shape) : null;
      else if (isLookbookReset) bl.shape = null;
      if ("size" in cfg.belt && cfg.belt.size != null && Number.isFinite(Number(cfg.belt.size))) {
        bl.size = clamp(Number(cfg.belt.size), 0.5, 1.85);
        bl.width = bl.size <= 0.8 ? "slim" : (bl.size >= 1.3 ? "wide" : "medium");
      } else if ("width" in cfg.belt) {
        bl.width = String(cfg.belt.width || "medium");
        if (!("size" in cfg.belt)) bl.size = null;
      }
      bl.length = clamp(Number.isFinite(Number(bl.length)) ? Number(bl.length) : def.belt.length, 0.0, 1.0);
      if ("color" in cfg.belt) bl.color = normAccHex(cfg.belt.color);
      else if (isLookbookReset) bl.color = null;
      if ("buckleColor" in cfg.belt) bl.buckleColor = normAccHex(cfg.belt.buckleColor);
      else if (isLookbookReset) bl.buckleColor = null;
      out.belt = bl;
    }
    if (cfg.bow) {
      const bw = { ...out.bow, ...cfg.bow };
      bw.enabled = Boolean(bw.enabled);
      bw.shape = String(bw.shape || def.bow.shape);
      bw.style = String(bw.style || def.bow.style);
      bw.placement = String(bw.placement || def.bow.placement);
      if ("size" in cfg.bow) {
        bw.size = (cfg.bow.size != null && Number.isFinite(Number(cfg.bow.size)))
          ? clamp(Number(cfg.bow.size), 0.4, 2.2)
          : null;
      } else if (isLookbookReset) bw.size = null;
      if ("length" in cfg.bow) {
        bw.length = (cfg.bow.length != null && Number.isFinite(Number(cfg.bow.length)))
          ? clamp(Number(cfg.bow.length), 0.0, 1.0)
          : null;
      } else if (isLookbookReset) bw.length = null;
      if ("color" in cfg.bow) bw.color = normAccHex(cfg.bow.color) || "#f8fafc";
      else if (isLookbookReset) bw.color = "#f8fafc";
      out.bow = bw;
    }
    if (cfg.brooch) {
      const br = { ...out.brooch, ...cfg.brooch };
      br.enabled = Boolean(br.enabled);
      br.shape = String(br.shape || def.brooch.shape);
      br.style = String(br.style || def.brooch.style);
      br.placement = String(br.placement || def.brooch.placement);
      br.size = clamp(Number.isFinite(Number(br.size)) ? Number(br.size) : def.brooch.size, 0.5, 2.0);
      br.length = clamp(Number.isFinite(Number(br.length)) ? Number(br.length) : def.brooch.length, 0.0, 1.0);
      if ("color" in cfg.brooch) br.color = normAccHex(cfg.brooch.color);
      else if (isLookbookReset) br.color = null;
      out.brooch = br;
    }
    return out;
  }
  let accessoriesState = createDefaultAccessoriesState();
  let stitchesGroup = null;
  let stitchState = createDefaultStitchConfig();
  let stitchMaterialsByPart = {};
  let lastLookbookContrastHex = null;
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
    ).catch(() => { });
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
              scene.environmentIntensity = 0.72;
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

  const smax = (a, b, k = 0.014) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));

  // ---------- materials ----------
  const FABRIC = {
    cotton: { label: 'Cotton Poplin', massDensity: 150, structStiff: 0.96, bendStiff: 0.36, maxStrain: 1.04, damping: 0.968, friction: 0.91, rough: 0.80, metal: 0.0, sheen: 0.28, sheenRough: 0.74, clear: 0.0, om: 1, bump: 0.0014 },
    denim: { label: 'Denim', massDensity: 400, structStiff: 0.97, bendStiff: 0.78, maxStrain: 1.02, damping: 0.952, friction: 0.96, rough: 0.88, metal: 0.01, sheen: 0.18, sheenRough: 0.82, clear: 0.0, om: 1, bump: 0.0024 },
    silk: { label: 'Silk Charmeuse', massDensity: 65, structStiff: 0.91, bendStiff: 0.10, maxStrain: 1.06, damping: 0.964, friction: 0.80, rough: 0.28, metal: 0.04, sheen: 0.72, sheenRough: 0.34, clear: 0.12, om: 0.98, anisotropy: 0.6, anisoRot: 0, bump: 0.0005 },
    satin: { label: 'Satin', massDensity: 95, structStiff: 0.93, bendStiff: 0.16, maxStrain: 1.05, damping: 0.966, friction: 0.82, rough: 0.36, metal: 0.04, sheen: 0.62, sheenRough: 0.42, clear: 0.06, om: 1, anisotropy: 0.25, anisoRot: 0, bump: 0.0005 },
    chiffon: { label: 'Chiffon', massDensity: 35, structStiff: 0.89, bendStiff: 0.08, maxStrain: 1.07, damping: 0.968, friction: 0.82, rough: 0.62, metal: 0.0, sheen: 0.55, sheenRough: 0.55, clear: 0.0, om: 0.58, transmission: 0.16, bump: 0.0008 },
    wool: { label: 'Wool Crepe', massDensity: 310, structStiff: 0.95, bendStiff: 0.48, maxStrain: 1.04, damping: 0.962, friction: 0.93, rough: 0.86, metal: 0.0, sheen: 0.52, sheenRough: 0.62, clear: 0.0, om: 1, bump: 0.0022 },
    linen: { label: 'Linen', massDensity: 175, structStiff: 0.96, bendStiff: 0.46, maxStrain: 1.03, damping: 0.966, friction: 0.92, rough: 0.86, metal: 0.0, sheen: 0.22, sheenRough: 0.80, clear: 0.0, om: 1, bump: 0.0022 },
    leather: { label: 'Leather', massDensity: 550, structStiff: 0.98, bendStiff: 0.90, maxStrain: 1.015, damping: 0.945, friction: 0.97, rough: 0.42, metal: 0.08, sheen: 0.20, sheenRough: 0.48, clear: 0.18, om: 1, bump: 0.0020 },
    jersey: { label: 'Cotton Jersey', massDensity: 185, structStiff: 0.90, bendStiff: 0.16, maxStrain: 1.16, damping: 0.960, friction: 0.93, rough: 0.82, metal: 0.0, sheen: 0.42, sheenRough: 0.68, clear: 0.0, om: 1, bump: 0.0016 },
    scuba: { label: 'Scuba Knit', massDensity: 260, structStiff: 0.94, bendStiff: 0.52, maxStrain: 1.12, damping: 0.958, friction: 0.94, rough: 0.56, metal: 0.0, sheen: 0.45, sheenRough: 0.52, clear: 0.05, om: 1, bump: 0.0010 },
    tulle: { label: 'Tulle', massDensity: 20, structStiff: 0.84, bendStiff: 0.18, maxStrain: 1.06, damping: 0.966, friction: 0.80, rough: 0.56, metal: 0.0, sheen: 0.48, sheenRough: 0.48, clear: 0.0, om: 0.42, transmission: 0.12, bump: 0.0014 },
    velvet: { label: 'Velvet', massDensity: 330, structStiff: 0.94, bendStiff: 0.36, maxStrain: 1.05, damping: 0.958, friction: 0.95, rough: 0.84, metal: 0.0, sheen: 0.95, sheenRough: 0.32, clear: 0.0, om: 1, bump: 0.0020 },
    lace: { label: 'Lace', massDensity: 75, structStiff: 0.91, bendStiff: 0.24, maxStrain: 1.05, damping: 0.968, friction: 0.86, rough: 0.74, metal: 0.0, sheen: 0.45, sheenRough: 0.58, clear: 0.0, om: 0.82, transmission: 0.08, bump: 0.0026 },
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
    outer: defaultFabricSlot(),
    trim: defaultFabricSlot(),
  };

  let fabricTexLoader = null;
  function getFabricTexLoader() {
    return (fabricTexLoader ||= new THREE.TextureLoader());
  }
  const FABRIC_TEXTURE_REPEAT = 6;

  function fabricMat(part, side) {
    const st = fabricState[part] || fabricState.bodice;
    const slot = side === "back" && st.back ? st.back : st.front;
    const fabricKey = slot.material || "cotton";
    const f = FABRIC[fabricKey] || FABRIC.cotton;
    const op = Math.max(0.25, Math.min(1, st.opacity * f.om));
    const maxAniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    const pbr = getFabricTextureSet(THREE, fabricKey, { uvSpanCm: 52, anisotropy: maxAniso });
    if (pbr) {
      sharedTextures.add(pbr.map);
      sharedTextures.add(pbr.normalMap);
      sharedTextures.add(pbr.roughnessMap);
    }
    const normScaleVal = pbr?.spec?.normalScale ?? 0.72;

    const mat = isSoftwareGL
      ? new THREE.MeshPhongMaterial({
        color: slot.textureDataURL ? 0xffffff : slot.color,
        shininess: Math.round((1 - f.rough) * 60 + 8),
        specular: new THREE.Color(0x1f1f1f).lerp(new THREE.Color(0x7a7a7a), 1 - f.rough),
        map: (!slot.textureDataURL && pbr?.map) ? pbr.map : null,
        normalMap: pbr?.normalMap || null,
        normalScale: new THREE.Vector2(normScaleVal, normScaleVal),
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
        sheenRoughness: f.sheenRough ?? pbr?.spec?.sheenRoughness ?? 0.52,
        sheenColor: new THREE.Color(slot.textureDataURL ? 0xf8fafc : slot.color).lerp(new THREE.Color(0xffffff), 0.58),
        clearcoat: f.clear,
        clearcoatRoughness: pbr?.spec?.clearcoatRoughness ?? 0.38,
        map: (!slot.textureDataURL && pbr?.map) ? pbr.map : null,
        normalMap: pbr?.normalMap || null,
        normalScale: new THREE.Vector2(normScaleVal, normScaleVal),
        roughnessMap: pbr?.roughnessMap || null,
        envMapIntensity: pbr?.spec?.envMapIntensity ?? 0.85,
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
  const lerp = (a, b, t) => a + (b - a) * t;
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
  function buildProcedural(category, m, patternMetrics = null, preserveCamera = false, mannequinPreset = null) {
    curCategory = category;
    curMeasurements = m;
    curMannequin = mannequinPreset || null;
    const prevH = curH;
    disposeObject3D(bodyGroup);
    disposeObject3D(garmentGroup);
    root.clear();
    limbs = {};
    activeMannequin = null;

    bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    const skin = createHumanSkinMaterial(THREE, category, mannequinPreset?.skinColor, isSoftwareGL);
    activeMannequin = buildHumanMannequin(THREE, category, m, {
      skinMaterial: skin,
      mannequin: mannequinPreset,
      morph: mannequinPreset?.morph,
      hairColor: mannequinPreset?.hairColor,
      hairStyle: mannequinPreset?.hairStyle,
      hairType: mannequinPreset?.hairType,
      hairLength: mannequinPreset?.hairLength,
      hairHighlight: mannequinPreset?.hairHighlight,
      headwear: mannequinPreset?.headwear,
      headwearColor: mannequinPreset?.headwearColor,
      headwearFabric: mannequinPreset?.headwearFabric,
      headwearLength: mannequinPreset?.headwearLength,
      undercapColor: mannequinPreset?.undercapColor,
      niqabEyeScreen: mannequinPreset?.niqabEyeScreen,
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
  function getBodySurfacePoint(y, phi, d, extraEase = 0.014, waistRelax = 0, bodyconBelowHip = false) {
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
      [hipY + span * 0.19, hipR * 0.92 + effWaistR * 0.10, hipR * 0.91 + effWaistR * 0.11],
      [hipY + span * 0.32, hipR * 0.43 + effWaistR * 0.59, hipR * 0.45 + effWaistR * 0.57],
      [hipY + span * 0.44, effWaistR * 1.02, effWaistR * 1.00],
      [hipY + span * 0.55, effWaistR * 0.61 + chestR * 0.43, effWaistR * 0.64 + chestR * 0.40],
      [hipY + span * 0.65, chestR * (female ? 0.99 : 1.03), chestR * 0.98],
      [hipY + span * 0.73, chestR * (female ? 1.03 : 1.07), chestR * (female ? 1.02 : 1.04)],
      [hipY + span * 0.81, chestR * (female ? 1.02 : 1.08), chestR * 0.95],
      [hipY + span * 0.88, chestR * (female ? 1.03 : 1.09), chestR * 0.90],
      [shoulderY - span * 0.03, shoulderHalf * 0.88, chestR * 0.84],
      [shoulderY + span * 0.072, shoulderHalf * 0.90, chestR * 0.80],
    ];

    let rx, rzBase;
    if (y <= stops[0][0]) {
      const f = clamp((stops[0][0] - y) / Math.max(0.15, hipY), 0, 1);
      rx = hipR * (1.01 - (bodyconBelowHip ? 0.22 : 0.10) * f);
      rzBase = hipR * (0.98 - (bodyconBelowHip ? 0.18 : 0.07) * f);
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
    const lat = clamp((Math.abs(x) - d.neckR * 1.30) / Math.max(0.06, d.shoulderHalf * 0.72), 0, 1);
    const armW = smoothstep(shoulderY - span * 0.09, shoulderY + span * 0.04, y) * Math.pow(lat, 1.25) * 0.34;
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

  function getAnatomicalShoulderTopY(xMag, d, extraLift = 0.005) {
    const { shoulderY, span, shoulderHalf, neckR, kid } = d;
    const f = clamp((xMag - neckR * 1.15) / Math.max(0.03, shoulderHalf * 0.90 - neckR * 1.15), 0, 1);
    const innerY = shoulderY + span * (kid ? 0.046 : 0.032);
    const outerY = shoulderY - span * 0.018;
    const ySkin = innerY * (1 - Math.pow(f, 0.85)) + outerY * Math.pow(f, 0.85);
    return ySkin + extraLift;
  }

  function smoothShoulderCrestNormals(geo, totalRows, halfCols, neckHalfW, shoulderTipX, shoulderTopY, shoulderAcromionY) {
    const nAttr = geo.attributes.normal;
    const pAttr = geo.attributes.position;
    if (!nAttr || !pAttr) return;
    const slopeX = Math.max(0.02, shoulderTipX - neckHalfW);
    const slopeY = shoulderAcromionY - shoulderTopY;
    const stride = halfCols * 2;
    for (const [r, blend] of [[totalRows, 0.82], [totalRows - 1, 0.32]]) {
      if (r < 0 || r > totalRows) continue;
      for (let c = 0; c < stride; c++) {
        const vi = r * stride + c;
        if (vi >= pAttr.count) continue;
        const x = pAttr.getX(vi);
        if (Math.abs(x) < neckHalfW * 0.92) continue;
        const sideSign = x >= 0 ? 1 : -1;
        // Outward perpendicular to trapezius-to-acromion shoulder crest in X-Y plane
        let tx = -sideSign * slopeY;
        let ty = slopeX;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const nx = nAttr.getX(vi);
        const ny = nAttr.getY(vi);
        const nz = nAttr.getZ(vi);
        const bx = nx * (1 - blend) + tx * blend;
        const by = ny * (1 - blend) + ty * blend;
        const bz = nz * (1 - blend);
        const bl = Math.hypot(bx, by, bz) || 1;
        nAttr.setXYZ(vi, bx / bl, by / bl, bz / bl);
      }
    }
    nAttr.needsUpdate = true;
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
    const hasSleeves = Boolean(pm.present?.sleeve);
    const hasOuter = Boolean(bSpec.outerLayer?.enabled);
    const hasSleevedOuter = Boolean(hasOuter && bSpec.outerLayer.style !== "vest" && bSpec.outerLayer.style !== "pinafore");
    // Natural trapezius slope from High Point Shoulder down to acromion seam
    const shoulderTopY = shoulderY + span * (hasOuter ? (d.kid ? 0.044 : 0.036) : (d.kid ? 0.052 : 0.042));
    const shoulderAcromionY = shoulderY + span * (hasOuter ? (hasSleeves ? -0.008 : 0.004) : (hasSleeves ? 0.002 : 0.010));

    const bFit = bSpec.fitTier || "regular";
    const isSecondSkin = bFit === "second-skin";
    const isFitted = bFit === "fitted";
    const rawEaseBase = isSecondSkin
      ? 0.0038
      : (isFitted ? 0.0072 : (0.015 + Math.max(-0.002, (bSpec.easeRatio - 1.0) * 0.042)));
    const easeBase = hasSleevedOuter ? Math.min(rawEaseBase, 0.004) : (hasOuter ? Math.min(rawEaseBase, 0.0085) : rawEaseBase);
    const waistRelax = (isSecondSkin || isFitted) ? 0 : (bSpec.style === "robe" ? 0.88 : (bSpec.style === "tunic" ? 0.52 : 0));

    // Determine bottom hem Y based on actual 2D bodice style & lengthCm
    let hemY = hipY + span * 0.06;
    if (bSpec.style === "bra") {
      hemY = waistY + span * 0.14;
    } else if (bSpec.style === "crop") {
      hemY = waistY + span * 0.07;
    } else if (bSpec.style === "waist") {
      hemY = waistY - 0.012;
    } else if (bSpec.style === "hip" || bSpec.style === "leotard") {
      hemY = clamp(shoulderTopY - cm(bSpec.lengthCm), hipY - span * 0.04, waistY - 0.03);
    } else if (bSpec.style === "tunic") {
      hemY = clamp(shoulderTopY - cm(bSpec.lengthCm), hipY - 0.22, hipY - 0.04);
    } else if (bSpec.style === "robe") {
      hemY = clamp(shoulderTopY - cm(bSpec.lengthCm), 0.05, hipY - 0.12);
    }

    const isStrapless = bSpec.neckline === "strapless" || bSpec.neckline === "off-shoulder" || bSpec.neckline === "offshoulder";
    const isOffShoulder = bSpec.neckline === "off-shoulder" || bSpec.neckline === "offshoulder";
    const isHalter = bSpec.neckline === "halter";
    const isBra = bSpec.style === "bra";

    const neckHalfW = neckR * (bSpec.neckline === "boat" ? 1.62 : (bSpec.neckline === "high" || bSpec.neckline === "collar" || bSpec.neckline === "mandarin" || isHalter ? 1.12 : 1.30));
    let frontNeckBottomY = shoulderY - span * 0.12;
    if (bSpec.neckline === "v-neck" || bSpec.neckline === "surplice") frontNeckBottomY = hipY + span * 0.64;
    else if (bSpec.neckline === "sweetheart") frontNeckBottomY = hipY + span * 0.67;
    else if (bSpec.neckline === "scoop" || isBra) frontNeckBottomY = hipY + span * 0.72;
    else if (bSpec.neckline === "square") frontNeckBottomY = hipY + span * 0.75;
    else if (bSpec.neckline === "boat") frontNeckBottomY = shoulderY - span * 0.04;
    else if (bSpec.neckline === "high" || bSpec.neckline === "collar" || bSpec.neckline === "mandarin") frontNeckBottomY = shoulderY - span * 0.015;
    else if (isHalter) frontNeckBottomY = shoulderY - span * 0.03;
    if (bSpec.hasCollar && !isBra && !isStrapless && (!hasOuter || bSpec.outerLayer.innerNeckline === "collar")) {
      frontNeckBottomY = Math.max(frontNeckBottomY, shoulderY - span * 0.024);
    }

    const isHighOrCollaredBack = !isBra && !isStrapless && (bSpec.hasCollar || bSpec.neckline === "high" || bSpec.neckline === "collar" || bSpec.neckline === "mandarin");
    const backNeckBottomY = isBra
      ? hipY + span * 0.74
      : (bSpec.neckline === "scoop"
        ? shoulderY - span * 0.10
        : (isHighOrCollaredBack ? shoulderTopY - span * 0.016 : shoulderY - span * 0.016));

    const effectiveTopY = isStrapless
      ? (isOffShoulder ? shoulderY - span * 0.065 : underarmY + span * 0.018)
      : shoulderTopY;

    const shoulderTipX = isBra
      ? neckHalfW + (shoulderHalf * 0.74 - neckHalfW) * 0.52
      : (isHalter ? neckHalfW * 1.14 : (hasSleevedOuter ? shoulderHalf * 0.78 : shoulderHalf * (hasSleeves ? 0.90 : 0.74)));

    function computeUpperFracs(rowsUpper, neckBotY) {
      const fracs = [];
      for (let i = 1; i <= rowsUpper; i++) fracs.push(i / rowsUpper);
      if (!isStrapless && neckBotY > underarmY + 0.004 && neckBotY < shoulderTopY - 0.006) {
        const targetArch = clamp((neckBotY - underarmY) / Math.max(0.02, shoulderTopY - underarmY), 0.05, 0.94);
        const uSnap = clamp((2 / Math.PI) * Math.asin(clamp(Math.pow(targetArch, 1 / 0.82), 0, 1)), 0.04, 0.96);
        let bestIdx = 0, bestDiff = Infinity;
        for (let i = 0; i < fracs.length - 1; i++) {
          const dVal = Math.abs(fracs[i] - uSnap);
          if (dVal < bestDiff) { bestDiff = dVal; bestIdx = i; }
        }
        fracs[bestIdx] = uSnap;
      }
      return fracs;
    }

    function buildBodiceSide(isFront) {
      const positions = [];
      const uvs = [];
      const skinIdx = [];
      const skinWgt = [];
      const indices = [];

      const ROWS_LOWER = bSpec.style === "robe" ? 18 : 10;
      const ROWS_UPPER = isStrapless ? 2 : 14;
      const totalRows = ROWS_LOWER + ROWS_UPPER;
      const HALF_COLS = 10; // 0..9 on right (-X), 10..19 on left (+X) -> 20 columns per row
      const rowVerts = [];

      const neckBottomY = isFront ? frontNeckBottomY : backNeckBottomY;
      const upperFracs = computeUpperFracs(ROWS_UPPER, neckBottomY);
      const effBodiceFlare = isSecondSkin
        ? 1.0
        : (isFitted
          ? Math.min(bSpec.hemFlare, 1.04)
          : ((bSpec.outerLayer?.enabled && (bSpec.outerLayer.lengthStyle === "robe" || bSpec.outerLayer.style === "bisht"))
            ? Math.min(bSpec.hemFlare, 1.12)
            : bSpec.hemFlare));

      for (let r = 0; r <= totalRows; r++) {
        const upperFrac = r <= ROWS_LOWER ? 0 : upperFracs[r - ROWS_LOWER - 1];
        // Smooth super-elliptical shoulder arch: climbs chest wall, rolls smoothly over top seam
        const thetaArch = (Math.PI * 0.5) * upperFrac;
        const yArchFrac = Math.pow(Math.sin(thetaArch), 0.85);
        const zArchScale = Math.cos(thetaArch);
        const armholeZBlend = smoothstep(0.0, 0.36, upperFrac);

        let y;
        if (r <= ROWS_LOWER) {
          const u = r / ROWS_LOWER;
          y = hemY * (1 - u) + underarmY * u;
        } else if (isStrapless) {
          const topDrop = isOffShoulder ? (shoulderY - span * 0.065) : (underarmY + span * 0.02);
          y = underarmY + (topDrop - underarmY) * upperFrac;
        } else {
          y = underarmY * (1 - yArchFrac) + shoulderTopY * yArchFrac;
        }

        let lowerFlare = 1.0;
        let pleatAmp = 0;
        if (y < waistY && effBodiceFlare > 1.04) {
          const drop = clamp((waistY - y) / Math.max(0.15, waistY - hemY), 0, 1);
          lowerFlare = 1 + (effBodiceFlare - 1) * Math.pow(drop, 1.12);
          if (pm.skirt.pleats > 0 && bSpec.style === "robe") {
            pleatAmp = 0.007 * Math.pow(drop, 1.3);
          }
        }

        let innerX = 0;
        if (bSpec.isOpenFront && isFront && !isBra && !bSpec.outerLayer?.enabled) {
          innerX = bSpec.style === "robe" ? 0.018 : 0.010;
        }
        if (!isStrapless && y > neckBottomY + 0.0005) {
          const neckCompleteY = (isHighOrCollaredBack && !isFront) ? shoulderTopY - span * 0.003 : shoulderTopY - span * 0.010;
          const nu = clamp((y - neckBottomY) / Math.max(0.02, neckCompleteY - neckBottomY), 0, 1);
          let curve;
          if (isFront && (bSpec.neckline === "v-neck" || bSpec.neckline === "surplice")) curve = Math.pow(nu, 0.86);
          else if (isFront && bSpec.neckline === "sweetheart") curve = Math.pow(nu, 0.68) * (1 - 0.14 * Math.sin(Math.PI * nu));
          else if (isFront && bSpec.neckline === "square") curve = nu < 0.16 ? nu * 5.2 : 0.84 + (nu - 0.16) * 0.19;
          else curve = Math.sqrt(Math.max(0, 1 - Math.pow(1 - nu, 2)));
          innerX = Math.max(innerX, neckHalfW * clamp(curve, 0, 1));
        } else if (isOffShoulder && isFront && y > underarmY + span * 0.01) {
          innerX = Math.max(innerX, 0.012 * upperFrac);
        }

        const bodyHalfWAtUnderarm = Math.abs(getBodySurfacePoint(underarmY, Math.PI / 2, d, easeBase, waistRelax)[0]) * (hasSleevedOuter ? 0.94 : 1.0);
        let outerMaxX = Math.abs(getBodySurfacePoint(Math.min(y, underarmY), Math.PI / 2, d, easeBase, waistRelax)[0]) * lowerFlare;
        if (r > ROWS_LOWER && !isStrapless) {
          const armscyeIndent = Math.sin(Math.PI * upperFrac) * (isBra ? chestR * 0.18 : (isHalter ? chestR * 0.08 : (hasSleeves ? chestR * 0.012 : chestR * 0.036)));
          outerMaxX = bodyHalfWAtUnderarm * (1 - upperFrac) + shoulderTipX * upperFrac - armscyeIndent;
          outerMaxX = Math.max(innerX + (isBra ? 0.016 : 0.028), outerMaxX);
        }

        const row = [];
        for (const sideSign of [-1, 1]) {
          for (let c = 0; c < HALF_COLS; c++) {
            const tCol = sideSign < 0 ? (1 - c / (HALF_COLS - 1)) : (c / (HALF_COLS - 1));
            const xMag = innerX + (outerMaxX - innerX) * tCol;
            const x = sideSign * xMag;

            // Keep side seam closed (`|sinPhi| -> 1` -> `z -> 0`) above underarm while opening
            // an anatomical elliptical armscye at `tCol -> 1` so front/back never flap outward
            // as detached horizontal wings across the shoulders.
            const sinPhi = clamp(x / Math.max(0.04, outerMaxX * (!isStrapless && upperFrac > 0 ? 1.12 : 1.0)), -1, 1);
            const asinVal = Math.asin(sinPhi);
            const phi = isFront ? asinVal : (Math.PI - asinVal);

            let yFinal = y;
            let ySampleZ = y;
            if (!isStrapless && upperFrac > 0) {
              const shoulderSpanFrac = clamp((xMag - neckHalfW) / Math.max(0.025, shoulderTipX - neckHalfW), 0, 1);
              const sCurve = Math.pow(shoulderSpanFrac, 1.08);
              const trapArch = 0.0055 * Math.sin(Math.PI * shoulderSpanFrac);
              const ySeam = shoulderTopY * (1 - sCurve) + shoulderAcromionY * sCurve + trapArch;
              yFinal = underarmY * (1 - yArchFrac) + ySeam * yArchFrac;
              if (!hasOuter && upperFrac > 0.72 && xMag >= neckHalfW * 0.95) {
                const crestBlend = smoothstep(0.72, 0.95, upperFrac);
                yFinal = Math.max(yFinal, getAnatomicalShoulderTopY(xMag, d, 0.0065) * crestBlend + yFinal * (1 - crestBlend));
              }
              ySampleZ = Math.min(yFinal, underarmY + span * 0.04);
            }

            const capEase = !isStrapless && upperFrac > 0 ? easeBase + (isSecondSkin ? 0.0020 : (isFitted ? 0.0035 : 0.005)) * Math.sin(Math.PI * upperFrac) : easeBase;
            let [, zSurf] = getBodySurfacePoint(ySampleZ, phi, d, capEase, waistRelax, isSecondSkin);
            zSurf *= lowerFlare;
            if (pleatAmp > 0) {
              zSurf += (isFront ? 1 : -1) * pleatAmp * Math.cos(phi * pm.skirt.pleats);
            }
            if (!isStrapless && upperFrac > 0) {
              const neckRatio = Math.min(1, xMag / Math.max(0.02, neckHalfW));
              const neckCylZ = (isFront ? 1 : -1) * (neckR * 1.14 + 0.008) * Math.sqrt(Math.max(0, 1 - neckRatio * neckRatio));
              zSurf = neckCylZ + (zSurf - neckCylZ) * zArchScale;
              if (!hasSleevedOuter) {
                const armOpenHalfZ = d.upperR * (isSecondSkin ? 1.01 : (hasSleeves ? 1.08 : 1.04));
                const armOpen = armOpenHalfZ * Math.pow(Math.sin(Math.PI * upperFrac), 0.88) * Math.pow(tCol, 1.45);
                zSurf = isFront ? smax(zSurf, armOpen, 0.014) : -smax(-zSurf, armOpen, 0.014);
              } else {
                const latRecess = smoothstep(neckHalfW * 0.90, Math.max(neckHalfW * 1.15, shoulderTipX), xMag);
                zSurf -= (isFront ? 1 : -1) * 0.022 * latRecess;
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
      if (!isStrapless) {
        smoothShoulderCrestNormals(geo, totalRows, HALF_COLS, neckHalfW, shoulderTipX, shoulderTopY, shoulderAcromionY);
      }
      geo.userData.gridMeta = {
        rows: totalRows + 1,
        cols: HALF_COLS * 2,
        lowerRows: ROWS_LOWER,
        hemY,
        waistY,
        style: bSpec.style,
        hemFlare: effBodiceFlare,
        fitTier: bFit,
      };

      const sideName = isFront ? "front" : "back";
      const mesh = createGarmentMesh(geo, fabricMat("bodice", sideName), "bodice", sideName, skeleton);
      mesh.userData.garmentType = isBra ? "bra" : "full";
      mesh.userData.fitTier = bFit;
      return mesh;
    }

    bodiceFrontMesh = buildBodiceSide(true);
    bodiceBackMesh = buildBodiceSide(false);
    bodiceFrontMesh.userData.isUnderOuter = hasOuter;
    bodiceBackMesh.userData.isUnderOuter = hasOuter;
    garmentGroup.add(bodiceFrontMesh, bodiceBackMesh);

    if (bSpec.hasCollar && !isBra && !isStrapless) {
      const collarCols = 40;
      const cPos = [], cUvs = [], cSi = [], cSw = [], cIdx = [];
      const collarStyle = bSpec.outerLayer?.enabled && bSpec.outerLayer.innerNeckline === "collar"
        ? "pointed"
        : (bSpec.outerLayer?.enabled ? "none" : (bSpec.collarStyle || "pointed"));
      if (collarStyle !== "none") {
        const collarH = collarStyle === "sailor" ? 0.068 : (collarStyle === "peter-pan" ? 0.044 : 0.036);
        const rCol = neckR * (hasOuter ? 1.15 : 1.18) + 0.005;
        const neckZScale = 0.94;
        const isStandOnly = bSpec.neckline === "high" || collarStyle === "mandarin" || collarStyle === "stand";
        const openPhi = isStandOnly ? 0.04 : 0.015;
        const standH = isStandOnly ? (collarH * 0.94) : 0.028;
        const backBaseY = shoulderTopY - span * 0.019;
        const sideBaseY = shoulderTopY - span * 0.021;
        const frontBaseY = frontNeckBottomY - 0.004;
        const numRows = isStandOnly ? 2 : 4;

        for (let row = 0; row <= numRows; row++) {
          const rowOpenPhi = isStandOnly ? openPhi : (openPhi + Math.max(0, row - 2) * (hasOuter ? 0.15 : 0.14));
          for (let k = 0; k <= collarCols; k++) {
            const u = k / collarCols;
            const phi = rowOpenPhi + u * (2 * Math.PI - 2 * rowOpenPhi);
            const cosP = Math.cos(phi);
            const sinP = Math.sin(phi);

            const frontW = Math.max(0, cosP);
            const backW = Math.max(0, -cosP);
            const sideW = Math.abs(sinP);
            const baseY = frontBaseY * frontW * frontW
              + backBaseY * backW * backW
              + sideBaseY * sideW * sideW;
            const frontProx = Math.pow(frontW, 1.5);

            let rad = rCol;
            let y = baseY;
            let zShift = 0;
            if (row === 1) {
              rad = rCol * 1.02;
              y = baseY + standH * 0.55;
            } else if (row === 2) {
              rad = rCol * (isStandOnly ? 1.04 : 1.07);
              y = baseY + standH;
            } else if (row === 3) {
              if (collarStyle === "sailor") {
                rad = rCol * (1.16 + 0.09 * backW);
                y = baseY + standH * 0.45 - 0.030 * backW;
                zShift = -0.010 * backW;
              } else if (collarStyle === "peter-pan") {
                rad = rCol * 1.17;
                y = baseY + standH * 0.48;
              } else {
                rad = rCol * (1.12 + 0.05 * frontProx);
                y = baseY + standH * 0.60 - 0.010 * frontProx;
              }
            } else if (row === 4) {
              if (collarStyle === "sailor") {
                rad = rCol * (1.28 + 0.18 * backW);
                y = baseY - 0.010 - 0.070 * backW;
                zShift = -0.022 * backW + 0.006 * frontW;
              } else if (collarStyle === "peter-pan") {
                rad = rCol * 1.28;
                y = baseY + 0.002;
                zShift = 0.008 * frontW;
              } else {
                rad = rCol * (1.16 + 0.08 * frontProx);
                y = baseY + standH * 0.22 - 0.026 * frontProx;
                zShift = 0.009 * frontW;
              }
            }

            const x = rad * sinP;
            const zNeck = rad * neckZScale * cosP + torsoZBump(shoulderY, phi, d) * 0.18 + zShift;
            let z = zNeck;
            if (frontW > 0.05) {
              const yBodSamp = Math.min(shoulderY + span * 0.02, Math.max(hemY, y));
              const [, zBody] = getBodySurfacePoint(yBodSamp, phi, d, easeBase + 0.008, waistRelax);
              if (row === 0) {
                z = Math.max(zNeck, zBody * frontW + zNeck * (1 - frontW));
              } else if (row <= 2) {
                const standMix = row === 1 ? 0.55 : 0.22;
                z = zNeck + Math.max(0, zBody - zNeck) * frontW * standMix;
              } else {
                const wingPad = row === 4 ? 0.011 : 0.007;
                z = zNeck + Math.max(0, (zBody + wingPad) - zNeck) * Math.min(1, frontW * 1.35);
              }
            }
            if (backW > 0.05 && row === 0) {
              const yBackSamp = Math.min(shoulderY + span * 0.02, Math.max(hemY, y));
              const [, zBackBody] = getBodySurfacePoint(yBackSamp, phi, d, easeBase + 0.006, waistRelax);
              z = Math.min(zNeck, zBackBody * backW + zNeck * (1 - backW));
            }
            cPos.push(x, y, z);
            cUvs.push(u, row / numRows);
            const wColNeck = 0.06 * (row / Math.max(1, numRows));
            const [bi, bw] = packSkinWeights([[BONE_IDX.chest, 1 - wColNeck], [BONE_IDX.neck, wColNeck]]);
            cSi.push(bi[0], bi[1], bi[2], bi[3]);
            cSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
          if (row > 0) {
            const prevOffset = (row - 1) * (collarCols + 1);
            const curOffset = row * (collarCols + 1);
            const flipLeaf = row >= 3;
            for (let k = 0; k < collarCols; k++) {
              const a0 = prevOffset + k, a1 = prevOffset + k + 1;
              const b0 = curOffset + k, b1 = curOffset + k + 1;
              if (flipLeaf) cIdx.push(a0, b1, a1, a0, b0, b1);
              else cIdx.push(a0, a1, b1, a0, b1, b0);
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
        const colPart = (bSpec.contrastCollar && fabricState.trim) ? "trim" : "bodice";
        const collarMesh = createGarmentMesh(colGeo, fabricMat(colPart, "front"), colPart, "front", skeleton);
        collarMesh.userData.garmentType = "collar";
        collarMesh.userData.parentPart = "bodice";
        collarMesh.userData.isUnderOuter = hasOuter;
        garmentGroup.add(collarMesh);
      }
    }

    // Avoid unused local and keep off-shoulder top cap anchored cleanly
    if (effectiveTopY < 0) return;

    // Lapels & continuous back roll collar for standalone coats/blazer-dresses (non-outerLayer path)
    if (!bSpec.outerLayer?.enabled && bSpec.lapelStyle && bSpec.lapelStyle !== "none" && !isBra) {
      const lpPart = bSpec.lapelStyle === "shawl" && fabricState.trim ? "trim" : "bodice";
      const evalBodiceFrontZ = (xMag, yVal, extraZ = 0) => {
        const yClamped = clamp(yVal, hemY, shoulderTopY);
        const dropF = yClamped < waistY && bSpec.hemFlare > 1.04
          ? 1 + (bSpec.hemFlare - 1) * Math.pow(clamp((waistY - yClamped) / Math.max(0.15, waistY - hemY), 0, 1), 1.12)
          : 1.0;
        const uF = yClamped <= underarmY
          ? 0
          : clamp(Math.pow(clamp((yClamped - underarmY) / Math.max(0.02, shoulderTopY - underarmY), 0, 1), 1 / 0.85) * (2 / Math.PI), 0, 1);
        const zAS = Math.cos(Math.PI * 0.5 * uF);
        const bodyHalfU = Math.abs(getBodySurfacePoint(underarmY, Math.PI / 2, d, easeBase, waistRelax)[0]);
        let maxX = Math.abs(getBodySurfacePoint(Math.min(yClamped, underarmY), Math.PI / 2, d, easeBase, waistRelax)[0]) * dropF;
        if (uF > 0) maxX = Math.max(neckHalfW + 0.028, bodyHalfU * (1 - uF) + shoulderTipX * uF);
        const phiS = Math.asin(clamp(xMag / Math.max(0.04, maxX * (uF > 0 ? 1.12 : 1.0)), -1, 1));
        const [, zB] = getBodySurfacePoint(Math.min(yClamped, underarmY + span * 0.04), phiS, d, easeBase + (uF > 0 ? 0.005 * Math.sin(Math.PI * uF) : 0), waistRelax);
        let zS = zB * dropF;
        if (uF > 0) {
          const nR = Math.min(1, xMag / Math.max(0.02, neckHalfW));
          const nCZ = (neckR * 1.14 + 0.008) * Math.sqrt(Math.max(0, 1 - nR * nR));
          zS = nCZ + (zS - nCZ) * zAS;
        }
        return zS + extraZ;
      };

      // Continuous back & side jacket roll collar connecting smoothly to both front lapels
      {
        const colSegs = 28;
        const rJCol = neckR * 1.19 + 0.008;
        const zScaleJ = 0.95;
        const gorgePhi = 0.94;
        const jcPos = [], jcUvs = [], jcSi = [], jcSw = [], jcIdx = [];
        for (let row = 0; row <= 3; row++) {
          for (let k = 0; k <= colSegs; k++) {
            const u = k / colSegs;
            const phi = gorgePhi + u * (2 * Math.PI - 2 * gorgePhi);
            const sinP = Math.sin(phi), cosP = Math.cos(phi);
            const frontProx = clamp((cosP + 0.35) / 1.25, 0, 1);
            const endTaper = smoothstep(0.0, 0.20, u) * smoothstep(0.0, 0.20, 1 - u);
            const baseY = (shoulderTopY + 0.001) * (1 - frontProx * 0.55) + (shoulderTopY - span * 0.016) * (frontProx * 0.55);
            let rad = Math.max(neckR * 1.08, neckHalfW * 0.96), y = baseY - 0.004;
            if (row === 1) { rad = rJCol * 1.02; y = baseY + 0.022 * endTaper; }
            else if (row === 2) { rad = rJCol * 1.06; y = baseY + 0.027 * endTaper; }
            else if (row === 3) { rad = rJCol * (1.10 + 0.10 * endTaper); y = baseY + 0.004 * endTaper; }
            let jz = rad * zScaleJ * cosP + torsoZBump(shoulderY, phi, d) * 0.16;
            if (row === 3 && cosP > -0.25) {
              const [, zChest] = getBodySurfacePoint(Math.min(y, shoulderY - 0.004), phi, d, easeBase + 0.010, waistRelax);
              jz = cosP > 0 ? Math.max(jz, zChest + 0.006) : Math.min(jz, zChest - 0.004);
            }
            jcPos.push(rad * sinP, y, jz);
            jcUvs.push(u, row / 3);
            const wJNeck = 0.05 * (row / 3);
            const [bi, bw] = packSkinWeights([[BONE_IDX.chest, 1 - wJNeck], [BONE_IDX.neck, wJNeck]]);
            jcSi.push(bi[0], bi[1], bi[2], bi[3]);
            jcSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
          if (row > 0) {
            const pOff = (row - 1) * (colSegs + 1), cOff = row * (colSegs + 1);
            const flipLeaf = row >= 3;
            for (let k = 0; k < colSegs; k++) {
              const a0 = pOff + k, a1 = a0 + 1, b0 = cOff + k, b1 = b0 + 1;
              if (flipLeaf) jcIdx.push(a0, b1, a1, a0, b0, b1);
              else jcIdx.push(a0, a1, b1, a0, b1, b0);
            }
          }
        }
        const jcGeo = new THREE.BufferGeometry();
        jcGeo.setAttribute("position", new THREE.Float32BufferAttribute(jcPos, 3));
        jcGeo.setAttribute("uv", new THREE.Float32BufferAttribute(jcUvs, 2));
        jcGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(jcSi, 4));
        jcGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(jcSw, 4));
        jcGeo.setIndex(jcIdx);
        jcGeo.computeVertexNormals();
        const jcMesh = createGarmentMesh(jcGeo, fabricMat(lpPart, "front"), lpPart, "front", skeleton);
        jcMesh.userData.garmentType = "collar";
        jcMesh.userData.parentPart = "bodice";
        garmentGroup.add(jcMesh);
      }

      [-1, 1].forEach((side) => {
        const lPos = [], lUvs = [], lSi = [], lSw = [], lIdx = [];
        const topY = shoulderTopY + 0.002;
        const botY = waistY + span * 0.08;
        const rowsL = 12;
        for (let r = 0; r <= rowsL; r++) {
          const u = r / rowsL;
          const y = topY * (1 - u) + botY * u;
          const openFrac = 1 - u;
          const innerX = 0.012 + (neckHalfW * 0.72) * Math.pow(openFrac, 0.85);
          let wLapel;
          if (bSpec.lapelStyle === "shawl") {
            wLapel = Math.max(0.022 * (1 - u), 0.044 * Math.pow(Math.sin(Math.PI * clamp(0.14 + u * 0.84, 0.08, 0.98)), 0.68));
          } else {
            const notchCut = (bSpec.lapelStyle === "notched" && u > 0.16 && u < 0.28) ? 0.62 : 1.0;
            wLapel = Math.max(0.022 * (1 - u), 0.052 * Math.sin(Math.PI * clamp(u * 0.90 + 0.10, 0.08, 0.98)) * notchCut);
          }
          const x0 = innerX, x1 = innerX + wLapel * 0.48, x2 = innerX + wLapel;
          const z0 = evalBodiceFrontZ(x0, y, 0.0055);
          const z1 = evalBodiceFrontZ(x1, y, 0.0110);
          const z2 = evalBodiceFrontZ(x2, y, 0.0070);
          lPos.push(side * x0, y, z0, side * x1, y, z1, side * x2, y, z2);
          lUvs.push(0, u, 0.5, u, 1, u);
          const [bi, bw] = packSkinWeights(torsoGarmentWeights(y, side * x1, d));
          for (let q = 0; q < 3; q++) {
            lSi.push(bi[0], bi[1], bi[2], bi[3]);
            lSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
          if (r > 0) {
            const p = (r - 1) * 3, c = r * 3;
            for (let seg = 0; seg < 2; seg++) {
              const a0 = p + seg, a1 = a0 + 1, b0 = c + seg, b1 = b0 + 1;
              if (side > 0) lIdx.push(a0, a1, b1, a0, b1, b0);
              else lIdx.push(a0, b1, a1, a0, b0, b1);
            }
          }
        }
        const lGeo = new THREE.BufferGeometry();
        lGeo.setAttribute("position", new THREE.Float32BufferAttribute(lPos, 3));
        lGeo.setAttribute("uv", new THREE.Float32BufferAttribute(lUvs, 2));
        lGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(lSi, 4));
        lGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(lSw, 4));
        lGeo.setIndex(lIdx);
        lGeo.computeVertexNormals();
        const lpMesh = createGarmentMesh(lGeo, fabricMat(lpPart, "front"), lpPart, "front", skeleton);
        lpMesh.userData.isLapel = true;
        lpMesh.userData.parentPart = "bodice";
        garmentGroup.add(lpMesh);
      });
    }

    // Draped hood behind shoulders/upper back (with optional faux-fur rim)
    if (bSpec.hasHood && !isBra) {
      const hPos = [], hUvs = [], hSi = [], hSw = [], hIdx = [];
      const uSteps = 18, vSteps = 8;
      for (let v = 0; v <= vSteps; v++) {
        const fv = v / vSteps;
        const y = (shoulderTopY + 0.002) - fv * span * 0.24;
        const radScale = 1.12 + 0.36 * Math.sin(Math.PI * fv);
        for (let k = 0; k <= uSteps; k++) {
          const fu = k / uSteps;
          const phi = Math.PI * (0.58 + fu * 0.84);
          const x = neckHalfW * radScale * Math.sin(phi) * 1.18;
          const [, bz] = getBodySurfacePoint(Math.min(y, shoulderY), phi, d, easeBase + 0.010, waistRelax);
          const hoodDepth = (0.048 + 0.045 * Math.sin(Math.PI * fv));
          const z = bz - hoodDepth;
          hPos.push(x, y, z);
          hUvs.push(fu, 1 - fv);
          const [bi, bw] = packSkinWeights([[BONE_IDX.neck, 0.25 * (1 - fv)], [BONE_IDX.chest, 0.75 + 0.25 * fv]]);
          hSi.push(bi[0], bi[1], bi[2], bi[3]);
          hSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }
      const strideH = uSteps + 1;
      for (let v = 0; v < vSteps; v++) {
        for (let k = 0; k < uSteps; k++) {
          const a0 = v * strideH + k, a1 = a0 + 1;
          const b0 = (v + 1) * strideH + k, b1 = b0 + 1;
          hIdx.push(a0, a1, b1, a0, b1, b0);
        }
      }
      const hGeo = new THREE.BufferGeometry();
      hGeo.setAttribute("position", new THREE.Float32BufferAttribute(hPos, 3));
      hGeo.setAttribute("uv", new THREE.Float32BufferAttribute(hUvs, 2));
      hGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(hSi, 4));
      hGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(hSw, 4));
      hGeo.setIndex(hIdx);
      hGeo.computeVertexNormals();
      const hoodPart = bSpec.outerLayer?.enabled ? "outer" : (bSpec.furTrim && fabricState.trim ? "trim" : "bodice");
      const hoodMesh = createGarmentMesh(hGeo, fabricMat(hoodPart, "back"), hoodPart, "back", skeleton);
      hoodMesh.userData.parentPart = "bodice";
      garmentGroup.add(hoodMesh);
    }

    // Flowing back cape overlay (w09, wf05, wf14, g12, gf03, gf11)
    if (bSpec.hasCape && !isBra) {
      const cPos = [], cUvs = [], cSi = [], cSw = [], cIdx = [];
      const uSeg = 22, vSeg = 14;
      const topCapeY = shoulderTopY + 0.002;
      const botCapeY = Math.max(0.14, hemY - (bSpec.style === "robe" || pm.skirt.lengthCm > d.legLen * 55 ? 0.45 : 0.16));
      for (let v = 0; v <= vSeg; v++) {
        const fv = v / vSeg;
        const y = topCapeY * (1 - fv) + botCapeY * fv;
        for (let k = 0; k <= uSeg; k++) {
          const fu = k / uSeg;
          const phi = Math.PI * (0.48 + fu * 1.04);
          const halfW = (shoulderHalf * 0.88) * (1 + fv * 0.95);
          const x = halfW * Math.sin(phi);
          const [, zSurf] = getBodySurfacePoint(Math.min(Math.max(y, hipY - 0.1), shoulderY - 0.02), phi, d, easeBase + 0.014, 0.25);
          const flareZ = Math.min(-0.04, zSurf) - (0.015 + fv * 0.095);
          cPos.push(x, y, flareZ);
          cUvs.push(fu, 1 - fv);
          const fPelv = smoothstep(waistY + 0.06, hipY - 0.15, y) * 0.55;
          const [bi, bw] = packSkinWeights([[BONE_IDX.chest, 1 - fPelv], [BONE_IDX.pelvis, fPelv]]);
          cSi.push(bi[0], bi[1], bi[2], bi[3]);
          cSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }
      const strideC = uSeg + 1;
      for (let v = 0; v < vSeg; v++) {
        for (let k = 0; k < uSeg; k++) {
          const a0 = v * strideC + k, a1 = a0 + 1;
          const b0 = (v + 1) * strideC + k, b1 = b0 + 1;
          cIdx.push(a0, a1, b1, a0, b1, b0);
        }
      }
      const capeGeo = new THREE.BufferGeometry();
      capeGeo.setAttribute("position", new THREE.Float32BufferAttribute(cPos, 3));
      capeGeo.setAttribute("uv", new THREE.Float32BufferAttribute(cUvs, 2));
      capeGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(cSi, 4));
      capeGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(cSw, 4));
      capeGeo.setIndex(cIdx);
      capeGeo.computeVertexNormals();
      const capeMesh = createGarmentMesh(capeGeo, fabricMat("bodice", "back"), "bodice", "back", skeleton);
      capeMesh.userData.parentPart = "bodice";
      garmentGroup.add(capeMesh);
    }

    // Flared waist peplum flounce (wf06, wf11, gf13, gf14, gf16, ref_g_top)
    if (bSpec.hasPeplum && !isBra) {
      const pPos = [], pUvs = [], pSi = [], pSw = [], pIdx = [];
      const uSeg = 36, vSeg = 8;
      const topPY = waistY + 0.008;
      const dropP = (pm.skirt?.lengthCm > 12 && !pm.present?.skirt)
        ? clamp(cm(pm.skirt.lengthCm), 0.14, 0.36)
        : clamp(span * 0.36, 0.12, 0.21);
      const zScaleP = d.female ? 0.72 : 0.78;
      for (let v = 0; v <= vSeg; v++) {
        const fv = v / vSeg;
        const y = topPY - fv * dropP;
        const baseR = lerp(d.waistR + 0.016, d.hipR * 1.24 + 0.024, Math.pow(fv, 0.9));
        for (let k = 0; k <= uSeg; k++) {
          const fu = k / uSeg;
          const phi = fu * Math.PI * 2;
          const flute = Math.sin(phi * 10) * 0.008 * Math.pow(fv, 1.3);
          const x = (baseR + flute) * Math.sin(phi);
          const z = (baseR * zScaleP + flute) * Math.cos(phi) + (d.female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d));
          pPos.push(x, y, z);
          pUvs.push(fu, 1 - fv);
          const [bi, bw] = packSkinWeights([[BONE_IDX.pelvis, 0.68], [BONE_IDX.spine, 0.32]]);
          pSi.push(bi[0], bi[1], bi[2], bi[3]);
          pSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }
      const strideP = uSeg + 1;
      for (let v = 0; v < vSeg; v++) {
        for (let k = 0; k < uSeg; k++) {
          const a0 = v * strideP + k, a1 = a0 + 1;
          const b0 = (v + 1) * strideP + k, b1 = b0 + 1;
          pIdx.push(a0, b1, a1, a0, b0, b1);
        }
      }
      const pepGeo = new THREE.BufferGeometry();
      pepGeo.setAttribute("position", new THREE.Float32BufferAttribute(pPos, 3));
      pepGeo.setAttribute("uv", new THREE.Float32BufferAttribute(pUvs, 2));
      pepGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(pSi, 4));
      pepGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(pSw, 4));
      pepGeo.setIndex(pIdx);
      pepGeo.computeVertexNormals();
      const pepPart = bSpec.outerLayer?.enabled ? "outer" : "bodice";
      const pepMesh = createGarmentMesh(pepGeo, fabricMat(pepPart, "front"), pepPart, "front", skeleton);
      pepMesh.userData.parentPart = "bodice";
      garmentGroup.add(pepMesh);
    }
  }

  /**
   * Builds a sculpted, second-skin gymnastics/dance leotard with contoured
   * front/back necklines, racerback/crossback/keyhole cutouts, arched leg
   * openings, and optional waist-attached flowing ballet skirt.
   */
  function buildTailoredLeotard(d, pm, skeleton) {
    const lSpec = pm.bodice.leotard || {};
    const { hipY, shoulderY, span, neckR, shoulderHalf, chestR, waistR, hipR } = d;
    const waistY = hipY + span * 0.44;
    const underarmY = shoulderY - span * 0.09;
    const shoulderTopY = shoulderY + span * (d.kid ? 0.050 : 0.040);
    const hasLeoSleeves = Boolean(pm.present?.sleeve);
    const shoulderAcromionY = shoulderY + span * (hasLeoSleeves ? -0.004 : 0.012);
    const crotchY = hipY - span * 0.115;
    const isHighCut = lSpec.legHeight === "highcut";
    const hipLegArchY = hipY + span * (isHighCut ? 0.025 : -0.028);

    const neckType = lSpec.neckline || "round";
    const backType = lSpec.backStyle || "full";
    const isHalter = neckType === "halter";
    const isOffSh = neckType === "offshoulder" || neckType === "off-shoulder";
    const isStraplessLike = isOffSh;

    const neckHalfW = neckR * (neckType === "boat" ? 1.56 : (neckType === "mock" || isHalter ? 1.06 : 1.24));
    let frontNeckBotY = shoulderY - span * 0.11;
    if (neckType === "v" || neckType === "v-neck") frontNeckBotY = hipY + span * 0.65;
    else if (neckType === "mock") frontNeckBotY = shoulderY - span * 0.01;
    else if (neckType === "boat") frontNeckBotY = shoulderY - span * 0.04;
    else if (isHalter) frontNeckBotY = shoulderY - span * 0.025;
    else if (isOffSh) frontNeckBotY = shoulderY - span * 0.075;

    let backNeckBotY = shoulderY - span * 0.04;
    if (backType === "lowscoop") backNeckBotY = waistY + span * 0.14;
    else if (backType === "racerback") backNeckBotY = shoulderY - span * 0.06;
    else if (backType === "crossback") backNeckBotY = waistY + span * 0.18;
    else if (backType === "keyhole") backNeckBotY = shoulderY - span * 0.02;

    const shoulderTipX = isHalter ? neckHalfW * 1.15 : shoulderHalf * (hasLeoSleeves ? 0.855 : 0.70);
    const easeLeo = 0.0036;
    const zScale = d.female ? 0.72 : 0.78;

    function buildLeoSide(isFront) {
      const positions = [], uvs = [], skinIdx = [], skinWgt = [], indices = [];
      const ROWS_LEG = 9;
      const ROWS_MID = 9;
      const ROWS_UPPER = 12;
      const ROWS = ROWS_LEG + ROWS_MID + ROWS_UPPER;
      const HALF_COLS = 11;
      const crotchWidthFrac = 0.22;
      const neckBotY = isFront ? frontNeckBotY : backNeckBotY;
      const rowVerts = [];

      for (let r = 0; r <= ROWS; r++) {
        const f = r / ROWS;
        let y;
        if (r <= ROWS_LEG) {
          const u = r / ROWS_LEG;
          y = crotchY * (1 - u) + hipLegArchY * u;
        } else if (r <= ROWS_LEG + ROWS_MID) {
          const u = (r - ROWS_LEG) / ROWS_MID;
          y = hipLegArchY * (1 - u) + underarmY * u;
        } else {
          const u = (r - ROWS_LEG - ROWS_MID) / ROWS_UPPER;
          const arch = Math.pow(Math.sin((Math.PI * 0.5) * u), 0.82);
          y = isOffSh
            ? underarmY + (shoulderY - span * 0.065 - underarmY) * u
            : underarmY * (1 - arch) + shoulderTopY * arch;
        }

        const upperFrac = r > ROWS_LEG + ROWS_MID ? (r - ROWS_LEG - ROWS_MID) / ROWS_UPPER : 0;
        const zArchScale = Math.pow(Math.cos((Math.PI * 0.5) * upperFrac), 0.58);

        let innerX = 0;
        if (y > neckBotY + 0.0005 && !isOffSh) {
          const neckCompleteY = shoulderTopY - span * 0.015;
          const nu = clamp((y - neckBotY) / Math.max(0.02, neckCompleteY - neckBotY), 0, 1);
          const curve = (isFront && (neckType === "v" || neckType === "v-neck")) ? Math.pow(nu, 0.85) : Math.sqrt(Math.max(0, 1 - Math.pow(1 - nu, 2)));
          innerX = neckHalfW * clamp(curve, 0, 1);
        }
        // Keyhole circular rear opening between scapulae
        if (!isFront && backType === "keyhole" && y > underarmY - span * 0.06 && y < shoulderY - span * 0.03) {
          const khMid = underarmY + span * 0.015;
          const khRad = span * 0.048;
          const dyK = Math.abs(y - khMid) / khRad;
          if (dyK < 1) innerX = Math.max(innerX, shoulderHalf * 0.22 * Math.sqrt(1 - dyK * dyK));
        }

        const surfHalfW = Math.abs(getBodySurfacePoint(Math.max(hipY, Math.min(y, underarmY)), Math.PI / 2, d, easeLeo, 0)[0]);
        let outerMaxX = surfHalfW;
        if (r <= ROWS_LEG) {
          const u = r / ROWS_LEG;
          const legFlare = Math.pow(u, 0.72);
          outerMaxX = surfHalfW * (crotchWidthFrac + (1 - crotchWidthFrac) * legFlare);
        } else if (upperFrac > 0 && !isOffSh) {
          const bodyHalfWAtU = Math.abs(getBodySurfacePoint(underarmY, Math.PI / 2, d, easeLeo, 0)[0]);
          let cutIndent = Math.sin(Math.PI * upperFrac) * chestR * (hasLeoSleeves ? 0.012 : 0.03);
          if (!isFront && (backType === "racerback" || backType === "crossback")) {
            cutIndent = Math.sin(Math.PI * Math.pow(upperFrac, 0.8)) * shoulderHalf * 0.42;
          } else if (isFront && isHalter) {
            cutIndent = Math.sin(Math.PI * upperFrac) * shoulderHalf * 0.16;
          }
          outerMaxX = Math.max(innerX + 0.018, bodyHalfWAtU * (1 - upperFrac) + shoulderTipX * upperFrac - cutIndent);
        }

        const row = [];
        for (const sideSign of [-1, 1]) {
          for (let c = 0; c < HALF_COLS; c++) {
            const tCol = sideSign < 0 ? (1 - c / (HALF_COLS - 1)) : (c / (HALF_COLS - 1));
            const xMag = innerX + (outerMaxX - innerX) * tCol;
            const x = sideSign * xMag;

            let yFinal = y;
            if (r <= ROWS_LEG) {
              // Leg-opening arch curves UP gracefully from center crotch to lateral iliac hip
              const legCurve = Math.pow(tCol, 1.35);
              const legFrac = r / ROWS_LEG;
              yFinal = crotchY + (hipLegArchY - crotchY) * legCurve * (1 - legFrac) + (y - crotchY) * legFrac;
            } else if (!isStraplessLike && upperFrac > 0) {
              const sFrac = clamp((xMag - neckHalfW) / Math.max(0.025, shoulderTipX - neckHalfW), 0, 1);
              const sCurve = Math.pow(sFrac, 1.08);
              const ySeam = shoulderTopY * (1 - sCurve) + shoulderAcromionY * sCurve;
              const yArch = Math.pow(Math.sin((Math.PI * 0.5) * upperFrac), 0.82);
              yFinal = underarmY * (1 - yArch) + ySeam * yArch;
            }

            const sinPhi = clamp(x / Math.max(0.04, outerMaxX * (!isOffSh && upperFrac > 0 ? 1.12 : 1.0)), -1, 1);
            const phi = isFront ? Math.asin(sinPhi) : (Math.PI - Math.asin(sinPhi));

            let zSurf;
            if (yFinal < hipY) {
              const bellyZ = (waistR * 0.25 + hipR * 0.78) * zScale + easeLeo;
              const uCrotch = clamp((hipY - yFinal) / Math.max(0.05, hipY - crotchY), 0, 1);
              zSurf = (isFront ? 1 : -1) * Math.max(0.028, bellyZ * Math.sqrt(Math.max(0.04, 1 - sinPhi * sinPhi)) * (1 - 0.58 * uCrotch));
            } else {
              const ySample = Math.min(yFinal, underarmY + span * 0.04);
              const lCapEase = upperFrac > 0 ? easeLeo + 0.0020 * Math.sin(Math.PI * upperFrac) : easeLeo;
              [, zSurf] = getBodySurfacePoint(ySample, phi, d, lCapEase, 0);
            }
            if (!isOffSh && upperFrac > 0) {
              const neckRatio = Math.min(1, xMag / Math.max(0.02, neckHalfW));
              const neckCylZ = (isFront ? 1 : -1) * (neckR * 1.12 + 0.007) * Math.sqrt(Math.max(0, 1 - neckRatio * neckRatio));
              zSurf = neckCylZ + (zSurf - neckCylZ) * zArchScale;
              const lArmOpen = d.upperR * 1.04 * Math.pow(Math.sin(Math.PI * upperFrac), 0.88) * Math.pow(tCol, 1.45);
              zSurf = isFront ? Math.max(zSurf, lArmOpen) : Math.min(zSurf, -lArmOpen);
            }

            const id = positions.length / 3;
            positions.push(x, yFinal, zSurf);
            uvs.push(clamp(x / (shoulderHalf * 2.0) + 0.5, 0, 1), f);
            const [bi, bw] = packSkinWeights(torsoGarmentWeights(Math.max(yFinal, hipY - 0.04), x, d));
            skinIdx.push(bi[0], bi[1], bi[2], bi[3]);
            skinWgt.push(bw[0], bw[1], bw[2], bw[3]);
            row.push({ id, innerX });
          }
        }
        rowVerts.push(row);
      }

      for (let r = 0; r < ROWS; r++) {
        const r0 = rowVerts[r], r1 = rowVerts[r + 1];
        for (let c = 0; c < HALF_COLS * 2 - 1; c++) {
          if (c === HALF_COLS - 1 && (r0[c].innerX > 0.002 || r1[c].innerX > 0.002)) continue;
          const a0 = r0[c].id, a1 = r0[c + 1].id, b0 = r1[c].id, b1 = r1[c + 1].id;
          if (isFront) indices.push(a0, a1, b1, a0, b1, b0);
          else indices.push(a0, b1, a1, a0, b0, b1);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return createGarmentMesh(geo, fabricMat("bodice", isFront ? "front" : "back"), "bodice", isFront ? "front" : "back", skeleton);
    }

    bodiceFrontMesh = buildLeoSide(true);
    bodiceBackMesh = buildLeoSide(false);
    bodiceFrontMesh.userData.fitTier = "second-skin";
    bodiceBackMesh.userData.fitTier = "second-skin";
    garmentGroup.add(bodiceFrontMesh, bodiceBackMesh);

    if (lSpec.skirt) {
      const skTopY = waistY + 0.006;
      const skDrop = clamp(span * 0.58, 0.16, 0.28);
      const skHemY = skTopY - skDrop;
      const SEG = 40, RINGS = 8;
      [true, false].forEach((isF) => {
        const sPos = [], sUvs = [], sSi = [], sSw = [], sIdx = [];
        const phiStart = isF ? -Math.PI / 2 : Math.PI / 2;
        const hSeg = SEG >> 1;
        for (let r = 0; r <= RINGS; r++) {
          const rf = r / RINGS;
          const y = skTopY - rf * skDrop;
          const rx = lerp(waistR + 0.011, hipR * 1.48 + 0.028, Math.pow(rf, 0.85));
          const rz = lerp(waistR * zScale + 0.011, (hipR * 1.48 + 0.028) * 0.90, Math.pow(rf, 0.85));
          for (let k = 0; k <= hSeg; k++) {
            const u = k / hSeg;
            const phi = phiStart + u * Math.PI;
            const flute = 0.007 * Math.sin(phi * 16) * Math.pow(rf, 1.25);
            const x = (rx + flute) * Math.sin(phi);
            const z = (rz + flute) * Math.cos(phi) + (y > hipY - 0.05 ? torsoZBump(y, phi, d) * 0.5 : 0);
            sPos.push(x, y, z);
            sUvs.push(u, 1 - rf);
            const fLeg = smoothstep(waistY - 0.02, hipY - 0.12, y) * 0.45;
            const wL = smoothstep(-0.08, 0.08, x);
            const [bi, bw] = packSkinWeights([[BONE_IDX.pelvis, 1 - fLeg], [BONE_IDX.legL, fLeg * wL], [BONE_IDX.legR, fLeg * (1 - wL)]]);
            sSi.push(bi[0], bi[1], bi[2], bi[3]);
            sSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
        }
        const st = hSeg + 1;
        for (let r = 0; r < RINGS; r++) {
          for (let k = 0; k < hSeg; k++) {
            const a0 = r * st + k, a1 = a0 + 1, b0 = (r + 1) * st + k, b1 = b0 + 1;
            sIdx.push(a0, b1, a1, a0, b0, b1);
          }
        }
        const sGeo = new THREE.BufferGeometry();
        sGeo.setAttribute("position", new THREE.Float32BufferAttribute(sPos, 3));
        sGeo.setAttribute("uv", new THREE.Float32BufferAttribute(sUvs, 2));
        sGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(sSi, 4));
        sGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sSw, 4));
        sGeo.setIndex(sIdx);
        sGeo.computeVertexNormals();
        sGeo.userData.gridMeta = { rows: RINGS + 1, cols: st, topY: skTopY, hemY: skHemY, flare: 1.55 };
        const sideN = isF ? "front" : "back";
        const skM = createGarmentMesh(sGeo, fabricMat("skirt", sideN), "skirt", sideN, skeleton);
        skM.userData.fitTier = "loose";
        if (isF) skirtFrontMesh = skM;
        else skirtBackMesh = skM;
        garmentGroup.add(skM);
      });
    }
  }

  /**
   * Builds anatomically sculpted 3D bras and sport bralettes with contoured
   * underbust cradle/gore, tapered wing band, bilateral styled cups
   * (soft-cup, balconette, plunge, triangle, strapless, bandeau), sculpted
   * racerback/sport scoop silhouettes, trim bindings, and body-hugging straps.
   */
  function buildTailoredBra(d, pm, skeleton) {
    const bra = pm.bodice.bra || {};
    const { hipY, shoulderY, span, chestR, waistR, shoulderHalf, neckR } = d;
    const isSport = bra.style === "sport";
    const isBandeau = bra.style === "bandeau";
    const isStrapless = bra.strapStyle === "none" || isBandeau || bra.style === "strapless";
    const cupDepthF = clamp(bra.cupDepthF || 1.0, 0.35, 1.3);
    const bandBotY = hipY + span * (bra.longline ? 0.45 : 0.56);
    const underbustY = hipY + span * 0.605;
    const cupTopY = isSport
      ? shoulderY - span * 0.08
      : hipY + span * (isBandeau ? 0.745 : (0.64 + 0.145 * Math.min(1.15, cupDepthF)));
    const braEase = 0.0032;
    const SEG = 48;
    const stride = SEG + 1;

    if (isSport) {
      // Sculpted compression sport bralette with front scoop neck, arched
      // armhole cutouts, tapered Y-racerback panel, and contrast elastic band
      const isRacer = bra.strapStyle === "racerback";
      const bandRows = 12;
      const bPos = [], bUvs = [], bSi = [], bSw = [], bIdx = [];
      for (let r = 0; r <= bandRows; r++) {
        const f = r / bandRows;
        for (let k = 0; k <= SEG; k++) {
          const u = k / SEG;
          const phi = u * Math.PI * 2;
          const cosP = Math.cos(phi);
          const sinP = Math.sin(phi);
          let topAtPhi = cupTopY;
          if (cosP > 0) {
            const frontCenterDip = Math.pow(cosP, 2.2) * (shoulderY - underbustY) * 0.28;
            const armCutout = Math.pow(Math.abs(sinP), 2.8) * (shoulderY - underbustY) * 0.36;
            topAtPhi -= frontCenterDip + armCutout;
          } else {
            const backArmCutout = Math.pow(Math.abs(sinP), isRacer ? 1.5 : 2.6) * (shoulderY - underbustY) * (isRacer ? 0.46 : 0.34);
            const backNeckDip = Math.pow(-cosP, 2.0) * (shoulderY - underbustY) * (isRacer ? 0.12 : 0.24);
            topAtPhi -= backArmCutout + backNeckDip;
          }
          const yEff = bandBotY * (1 - f) + topAtPhi * f;
          const [bx, bz] = getBodySurfacePoint(yEff, phi, d, braEase + 0.0008, 0);
          bPos.push(bx, yEff, bz);
          bUvs.push(u, f);
          const [bi, bw] = packSkinWeights(torsoGarmentWeights(yEff, bx, d));
          bSi.push(bi[0], bi[1], bi[2], bi[3]);
          bSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }
      for (let r = 0; r < bandRows; r++) {
        for (let k = 0; k < SEG; k++) {
          const a0 = r * stride + k, a1 = a0 + 1, b0 = (r + 1) * stride + k, b1 = b0 + 1;
          bIdx.push(a0, b1, a1, a0, b0, b1);
        }
      }
      const bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute("position", new THREE.Float32BufferAttribute(bPos, 3));
      bGeo.setAttribute("uv", new THREE.Float32BufferAttribute(bUvs, 2));
      bGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(bSi, 4));
      bGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(bSw, 4));
      bGeo.setIndex(bIdx);
      bGeo.computeVertexNormals();
      bodiceFrontMesh = createGarmentMesh(bGeo, fabricMat("bodice", "front"), "bodice", "front", skeleton);
      bodiceFrontMesh.userData.garmentType = "bra";
      bodiceFrontMesh.userData.fitTier = "second-skin";
      garmentGroup.add(bodiceFrontMesh);

      if (fabricState.trim) {
        const ePos = [], eUvs = [], eSi = [], eSw = [], eIdx = [];
        const eH = span * 0.056;
        const eRows = 6;
        for (let r = 0; r <= eRows; r++) {
          const y = bandBotY - 0.003 + (r / eRows) * eH;
          for (let k = 0; k <= SEG; k++) {
            const u = k / SEG;
            const phi = u * Math.PI * 2;
            const [bx, bz] = getBodySurfacePoint(y, phi, d, braEase + 0.0014, 0);
            ePos.push(bx, y, bz);
            eUvs.push(u, r / eRows);
            const [bi, bw] = packSkinWeights(torsoGarmentWeights(y, bx, d));
            eSi.push(bi[0], bi[1], bi[2], bi[3]);
            eSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
        }
        for (let r = 0; r < eRows; r++) {
          for (let k = 0; k < SEG; k++) {
            const a0 = r * stride + k, a1 = a0 + 1, b0 = (r + 1) * stride + k, b1 = b0 + 1;
            eIdx.push(a0, b1, a1, a0, b0, b1);
          }
        }
        const eGeo = new THREE.BufferGeometry();
        eGeo.setAttribute("position", new THREE.Float32BufferAttribute(ePos, 3));
        eGeo.setAttribute("uv", new THREE.Float32BufferAttribute(eUvs, 2));
        eGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(eSi, 4));
        eGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(eSw, 4));
        eGeo.setIndex(eIdx);
        eGeo.computeVertexNormals();
        const elMesh = createGarmentMesh(eGeo, fabricMat("trim", "front"), "trim", "front", skeleton);
        elMesh.userData.parentPart = "bodice";
        elMesh.userData.garmentType = "bra";
        elMesh.userData.fitTier = "second-skin";
        garmentGroup.add(elMesh);
      }
    } else if (isBandeau) {
      // Contour-molded bandeau wrapping from curved front top edge down to sleek back band
      const bandRows = 9;
      const bPos = [], bUvs = [], bSi = [], bSw = [], bIdx = [];
      for (let r = 0; r <= bandRows; r++) {
        const f = r / bandRows;
        for (let k = 0; k <= SEG; k++) {
          const u = k / SEG;
          const phi = u * Math.PI * 2;
          const cosP = Math.cos(phi);
          const sideT = clamp((1 - cosP) * 0.5, 0, 1);
          const sweetheartDip = Math.exp(-Math.pow(phi / 0.25, 2)) * 0.012 + Math.exp(-Math.pow((phi - 2 * Math.PI) / 0.25, 2)) * 0.012;
          const topAtPhi = lerp(cupTopY, underbustY + span * 0.085, sideT) - sweetheartDip;
          const botAtPhi = lerp(bandBotY + span * 0.02, underbustY - span * 0.015, sideT);
          const yEff = botAtPhi * (1 - f) + topAtPhi * f;
          const ruche = cosP > 0 ? 0.0020 * Math.sin(f * Math.PI) * Math.cos(phi * 10) : 0;
          const [bx, bz] = getBodySurfacePoint(yEff, phi, d, braEase + 0.0010 + ruche, 0);
          bPos.push(bx, yEff, bz);
          bUvs.push(u, f);
          const [bi, bw] = packSkinWeights(torsoGarmentWeights(yEff, bx, d));
          bSi.push(bi[0], bi[1], bi[2], bi[3]);
          bSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }
      for (let r = 0; r < bandRows; r++) {
        for (let k = 0; k < SEG; k++) {
          const a0 = r * stride + k, a1 = a0 + 1, b0 = (r + 1) * stride + k, b1 = b0 + 1;
          bIdx.push(a0, b1, a1, a0, b0, b1);
        }
      }
      const bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute("position", new THREE.Float32BufferAttribute(bPos, 3));
      bGeo.setAttribute("uv", new THREE.Float32BufferAttribute(bUvs, 2));
      bGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(bSi, 4));
      bGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(bSw, 4));
      bGeo.setIndex(bIdx);
      bGeo.computeVertexNormals();
      bodiceFrontMesh = createGarmentMesh(bGeo, fabricMat("bodice", "front"), "bodice", "front", skeleton);
      bodiceFrontMesh.userData.garmentType = "bra";
      bodiceFrontMesh.userData.fitTier = "second-skin";
      garmentGroup.add(bodiceFrontMesh);
    } else {
      // 1. Sleek underbust cradle + gore + tapered wing band (never covers front breasts)
      const bandRows = bra.longline ? 8 : 5;
      const bPos = [], bUvs = [], bSi = [], bSw = [], bIdx = [];
      for (let r = 0; r <= bandRows; r++) {
        const f = r / bandRows;
        for (let k = 0; k <= SEG; k++) {
          const u = k / SEG;
          const phi = u * Math.PI * 2;
          const cosP = Math.cos(phi);
          const backFrac = clamp((-cosP + 0.15) / 1.15, 0, 1);
          const goreBridge = cosP > 0.80
            ? lerp(bra.style === "plunge" ? 0.015 : 0.034, 0.004, Math.pow(1 - (cosP - 0.80) / 0.20, 1.5))
            : 0.006;
          const topAtPhi = underbustY + lerp(goreBridge, -0.004, backFrac);
          const botAtPhi = bandBotY + (bra.longline ? 0 : 0.012 * backFrac);
          const yEff = botAtPhi * (1 - f) + topAtPhi * f;
          const [bx, bz] = getBodySurfacePoint(yEff, phi, d, braEase + 0.001, 0);
          bPos.push(bx, yEff, bz);
          bUvs.push(u, f);
          const [bi, bw] = packSkinWeights(torsoGarmentWeights(yEff, bx, d));
          bSi.push(bi[0], bi[1], bi[2], bi[3]);
          bSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }
      for (let r = 0; r < bandRows; r++) {
        for (let k = 0; k < SEG; k++) {
          const a0 = r * stride + k, a1 = a0 + 1, b0 = (r + 1) * stride + k, b1 = b0 + 1;
          bIdx.push(a0, b1, a1, a0, b0, b1);
        }
      }
      const bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute("position", new THREE.Float32BufferAttribute(bPos, 3));
      bGeo.setAttribute("uv", new THREE.Float32BufferAttribute(bUvs, 2));
      bGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(bSi, 4));
      bGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(bSw, 4));
      bGeo.setIndex(bIdx);
      bGeo.computeVertexNormals();
      bodiceFrontMesh = createGarmentMesh(bGeo, fabricMat("bodice", "front"), "bodice", "front", skeleton);
      bodiceFrontMesh.userData.garmentType = "bra";
      garmentGroup.add(bodiceFrontMesh);

      // 2. Sculpted bilateral cups styled by plunge / triangle / balconette / strapless / soft-cup
      const trimDiffers = Boolean(
        fabricState.trim && fabricState.bodice &&
        fabricState.trim.front.color !== fabricState.bodice.front.color
      );
      [-1, 1].forEach((side) => {
        const cPos = [], cUvs = [], cSi = [], cSw = [], cIdx = [];
        const cRows = 11, cCols = 13;
        const innerGap = bra.style === "plunge" ? 0.012 : 0.005;
        const outerPhiSide = side * Math.PI * (bra.style === "balconette" ? 0.45 : 0.43);
        const trimPts = [];
        for (let r = 0; r <= cRows; r++) {
          const vr = r / cRows;
          for (let c = 0; c <= cCols; c++) {
            const uc = c / cCols;
            let rowTopY = cupTopY;
            if (bra.style === "plunge") {
              rowTopY = underbustY + (cupTopY - underbustY) * (0.28 + 0.72 * Math.pow(uc, 0.72));
            } else if (bra.style === "balconette") {
              rowTopY = underbustY + (cupTopY - underbustY) * (0.74 + 0.20 * Math.sin(Math.PI * uc * 0.85));
            } else if (isStrapless) {
              rowTopY = underbustY + (cupTopY - underbustY) * (0.76 + 0.22 * Math.sin(Math.PI * uc));
            }
            const xFrac = bra.style === "triangle" ? lerp(uc, 0.56, 0.74 * vr) : uc;
            const phiMax = Math.abs(outerPhiSide) * (1 - 0.14 * vr);
            const phi = side * lerp(innerGap / Math.max(0.05, chestR), phiMax, xFrac);
            const cupBotY = underbustY - 0.004 * Math.sin(Math.PI * uc);
            const cupY = cupBotY + vr * (rowTopY - cupBotY);
            const cupDomeEase = braEase + 0.0035 * Math.sin(Math.PI * vr) * Math.sin(Math.PI * uc);
            const [bx, bz] = getBodySurfacePoint(cupY, phi, d, cupDomeEase, 0);
            cPos.push(bx, cupY, bz);
            cUvs.push(uc, vr);
            const [bi, bw] = packSkinWeights(torsoGarmentWeights(cupY, bx, d));
            cSi.push(bi[0], bi[1], bi[2], bi[3]);
            cSw.push(bw[0], bw[1], bw[2], bw[3]);
            if (r === cRows) trimPts.push({ x: bx, y: cupY, z: bz, u: uc });
          }
        }
        const stC = cCols + 1;
        for (let r = 0; r < cRows; r++) {
          for (let c = 0; c < cCols; c++) {
            const a0 = r * stC + c, a1 = a0 + 1, b0 = (r + 1) * stC + c, b1 = b0 + 1;
            if (side > 0) cIdx.push(a0, a1, b1, a0, b1, b0);
            else cIdx.push(a0, b1, a1, a0, b0, b1);
          }
        }
        const cGeo = new THREE.BufferGeometry();
        cGeo.setAttribute("position", new THREE.Float32BufferAttribute(cPos, 3));
        cGeo.setAttribute("uv", new THREE.Float32BufferAttribute(cUvs, 2));
        cGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(cSi, 4));
        cGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(cSw, 4));
        cGeo.setIndex(cIdx);
        cGeo.computeVertexNormals();
        const cupMesh = createGarmentMesh(cGeo, fabricMat("bodice", "front"), "bodice", "front", skeleton);
        cupMesh.userData.garmentType = "bra";
        cupMesh.userData.fitTier = "second-skin";
        garmentGroup.add(cupMesh);

        if (trimDiffers && trimPts.length > 2) {
          const tPos = [], tUvs = [], tSi = [], tSw = [], tIdx = [];
          const ribbonH = 0.008;
          trimPts.forEach((pt, ti) => {
            tPos.push(pt.x, pt.y - ribbonH, pt.z + 0.0015, pt.x, pt.y + 0.001, pt.z + 0.0018);
            tUvs.push(pt.u, 0, pt.u, 1);
            const [bi, bw] = packSkinWeights(torsoGarmentWeights(pt.y, pt.x, d));
            for (let q = 0; q < 2; q++) {
              tSi.push(bi[0], bi[1], bi[2], bi[3]);
              tSw.push(bw[0], bw[1], bw[2], bw[3]);
            }
            if (ti > 0) {
              const p = (ti - 1) * 2, cur = ti * 2;
              if (side > 0) tIdx.push(p, p + 1, cur + 1, p, cur + 1, cur);
              else tIdx.push(p, cur + 1, p + 1, p, cur, cur + 1);
            }
          });
          const tGeo = new THREE.BufferGeometry();
          tGeo.setAttribute("position", new THREE.Float32BufferAttribute(tPos, 3));
          tGeo.setAttribute("uv", new THREE.Float32BufferAttribute(tUvs, 2));
          tGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(tSi, 4));
          tGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(tSw, 4));
          tGeo.setIndex(tIdx);
          tGeo.computeVertexNormals();
          const tm = createGarmentMesh(tGeo, fabricMat("trim", "front"), "trim", "front", skeleton);
          tm.userData.parentPart = "bodice";
          tm.userData.garmentType = "bra";
          tm.userData.fitTier = "second-skin";
          garmentGroup.add(tm);
        }
      });
    }

    // 3. Skin-hugging straps anchored cleanly inside actual front cup/bra & back rims
    if (!isStrapless) {
      const strapW = bra.wideStrap ? 0.022 : 0.010;
      const isRacer = bra.strapStyle === "racerback";
      [-1, 1].forEach((side) => {
        const sPos = [], sUvs = [], sSi = [], sSw = [], sIdx = [];
        const stepsS = 26;
        const wideSet = bra.style === "balconette" ? 0.56 : 0.44;
        const anchorFrontX = side * (neckR * 1.15 + (shoulderHalf * 0.78 - neckR * 1.15) * wideSet);
        const anchorBackX = isRacer ? side * neckR * 0.50 : anchorFrontX * 0.90;
        const phiFront = side * clamp(Math.abs(anchorFrontX) / Math.max(0.05, chestR), 0, 0.70);
        const phiBack = Math.PI - side * clamp(Math.abs(anchorBackX) / Math.max(0.05, chestR), 0, 0.70);

        let frontRimY = cupTopY;
        let backRimY = underbustY + 0.012;
        if (isSport) {
          const cosF = Math.cos(phiFront), sinF = Math.sin(phiFront);
          frontRimY = cupTopY
            - Math.pow(Math.max(0, cosF), 2.2) * (shoulderY - underbustY) * 0.28
            - Math.pow(Math.abs(sinF), 2.8) * (shoulderY - underbustY) * 0.36;
          const cosB = Math.cos(phiBack), sinB = Math.sin(phiBack);
          backRimY = cupTopY
            - Math.pow(Math.abs(sinB), isRacer ? 1.5 : 2.6) * (shoulderY - underbustY) * (isRacer ? 0.46 : 0.34)
            - Math.pow(Math.max(0, -cosB), 2.0) * (shoulderY - underbustY) * (isRacer ? 0.12 : 0.24);
        } else if (bra.style === "plunge") {
          frontRimY = underbustY + (cupTopY - underbustY) * 0.76;
        } else if (bra.style === "balconette") {
          frontRimY = underbustY + (cupTopY - underbustY) * 0.88;
        }
        const startY = frontRimY - 0.010;
        const endY = backRimY - 0.010;
        const strapEase = braEase + 0.0035;

        for (let i = 0; i <= stepsS; i++) {
          const tS = i / stepsS;
          const cx = tS <= 0.5 ? anchorFrontX : lerp(anchorFrontX, anchorBackX, (tS - 0.5) / 0.5);
          const xL = cx - strapW * 0.5;
          const xR = cx + strapW * 0.5;
          const apexL = getAnatomicalShoulderTopY(Math.abs(xL), d, 0.0115);
          const apexR = getAnatomicalShoulderTopY(Math.abs(xR), d, 0.0115);
          const apexC = 0.5 * (apexL + apexR);
          const edgeDY = (apexR - apexL) * 0.5;

          let yC, zCenter, crestW;
          if (tS <= 0.5) {
            const u = tS / 0.5;
            crestW = Math.sin(u * Math.PI * 0.5);
            yC = lerp(startY, apexC, crestW);
            const ySurf = clamp(yC, underbustY, shoulderY - span * 0.020);
            const [, zS] = getBodySurfacePoint(ySurf, phiFront, d, strapEase, 0);
            zCenter = zS * Math.pow(Math.max(0, Math.cos(u * Math.PI * 0.5)), 0.54);
          } else {
            const u = (tS - 0.5) / 0.5;
            crestW = Math.cos(u * Math.PI * 0.5);
            yC = lerp(apexC, endY, 1 - crestW);
            const phiCur = Math.PI - side * clamp(Math.abs(cx) / Math.max(0.05, chestR), 0, 0.70);
            const ySurf = clamp(yC, underbustY, shoulderY - span * 0.020);
            const [, zS] = getBodySurfacePoint(ySurf, phiCur, d, strapEase, 0);
            zCenter = zS * Math.pow(Math.max(0, Math.sin(u * Math.PI * 0.5)), 0.54);
          }
          // Slope the strap ribbon gently across its width near the shoulder crest so it lies flat on skin
          const yL = yC - edgeDY * crestW;
          const yR = yC + edgeDY * crestW;
          sPos.push(xL, yL, zCenter, xR, yR, zCenter);
          sUvs.push(0, tS, 1, tS);
          const [bi, bw] = packSkinWeights(torsoGarmentWeights(Math.min(yC, shoulderY), cx, d));
          for (let q = 0; q < 2; q++) {
            sSi.push(bi[0], bi[1], bi[2], bi[3]);
            sSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
          if (i > 0) {
            const p = (i - 1) * 2, c = i * 2;
            sIdx.push(p, p + 1, c + 1, p, c + 1, c);
          }
        }
        const sGeo = new THREE.BufferGeometry();
        sGeo.setAttribute("position", new THREE.Float32BufferAttribute(sPos, 3));
        sGeo.setAttribute("uv", new THREE.Float32BufferAttribute(sUvs, 2));
        sGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(sSi, 4));
        sGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sSw, 4));
        sGeo.setIndex(sIdx);
        sGeo.computeVertexNormals();
        const sm = createGarmentMesh(sGeo, fabricMat("bodice", "front"), "bodice", "front", skeleton);
        sm.userData.garmentType = "bra";
        sm.userData.isBraStrap = true;
        sm.userData.fitTier = "second-skin";
        sm.userData.strapSteps = stepsS;
        garmentGroup.add(sm);
      });
    }
    void waistR;
  }

  /**
   * Builds a cleanly layered outer garment (blazer, tuxedo, vest, overcoat, trench,
   * parka, bomber, denim jacket, pinafore, bisht) offset radially outside the inner bodice.
   */
  function buildOuterLayer(d, pm, skeleton) {
    const ol = pm.bodice.outerLayer;
    if (!ol || !ol.enabled) return;
    const { hipY, shoulderY, span, neckR, shoulderHalf, chestR } = d;
    const waistY = hipY + span * 0.44;
    const underarmY = shoulderY - span * 0.09;
    const isNarrowStrap = ol.style === "pinafore";
    const isVest = ol.style === "vest" || ol.style === "pinafore";
    const isStructuredTailored = !isVest && ol.style !== "bisht" && ol.style !== "cape";
    const shoulderTopY = shoulderY + span * (d.kid ? 0.072 : (isStructuredTailored ? 0.065 : 0.060));
    const shoulderAcromionY = shoulderY + span * (isStructuredTailored ? 0.019 : 0.012);
    const innerEase = 0.015 + Math.max(-0.002, ((pm.bodice?.easeRatio || 1.0) - 1.0) * 0.042);
    const outerEase = Math.max(0.028 + Math.max(0, ((pm.bodice.easeRatio || 1.04) - 1.0) * 0.040), innerEase + 0.016);

    let hemY = hipY + span * 0.04;
    if (ol.lengthStyle === "waist") hemY = waistY - 0.015;
    else if (ol.lengthStyle === "tunic") hemY = hipY - 0.16;
    else if (ol.lengthStyle === "dress" || ol.lengthStyle === "coat") hemY = Math.max(0.18, hipY - span * 1.08);
    else if (ol.lengthStyle === "robe") hemY = 0.06;

    const waistRelax = (ol.lengthStyle === "robe" || ol.style === "bisht") ? 0.78 : (ol.lengthStyle === "coat" || ol.style === "trench" ? 0.25 : 0.08);
    const neckHalfW = neckR * 1.24;
    const frontBreakY = ol.openFront ? waistY + span * 0.08 : (ol.style === "pinafore" ? hipY + span * 0.72 : shoulderY - span * 0.16);
    const shoulderTipX = isNarrowStrap ? neckHalfW * 1.55 : (isVest ? shoulderHalf * 0.85 : (isStructuredTailored ? shoulderHalf * 0.93 : shoulderHalf * 0.91));

    function computeOuterFracs(rowsU, snapY) {
      const fracs = [];
      for (let i = 1; i <= rowsU; i++) fracs.push(i / rowsU);
      if (snapY > underarmY + 0.004 && snapY < shoulderTopY - 0.006) {
        const targetA = clamp((snapY - underarmY) / Math.max(0.02, shoulderTopY - underarmY), 0.05, 0.94);
        const uSnap = clamp((2 / Math.PI) * Math.asin(clamp(Math.pow(targetA, 1 / 0.82), 0, 1)), 0.04, 0.96);
        let bi = 0, bd = Infinity;
        for (let i = 0; i < fracs.length - 1; i++) {
          const dv = Math.abs(fracs[i] - uSnap);
          if (dv < bd) { bd = dv; bi = i; }
        }
        fracs[bi] = uSnap;
      }
      return fracs;
    }

    function buildOuterSide(isFront) {
      const positions = [], uvs = [], skinIdx = [], skinWgt = [], indices = [];
      const ROWS_L = 12, ROWS_U = 12, totalRows = ROWS_L + ROWS_U, HALF_COLS = 10;
      const rowVerts = [];
      const flareF = (ol.style === "pinafore" || ol.style === "bisht" || ol.lengthStyle === "coat" || ol.lengthStyle === "robe")
        ? Math.max(1.26, (pm.bodice?.hemFlare || 1.0) + 0.06)
        : 1.04;
      const upperFracs = computeOuterFracs(ROWS_U, isFront ? frontBreakY : (shoulderTopY - span * 0.022));

      for (let r = 0; r <= totalRows; r++) {
        const upperFrac = r <= ROWS_L ? 0 : upperFracs[r - ROWS_L - 1];
        const thetaArch = (Math.PI * 0.5) * upperFrac;
        const yArchFrac = Math.pow(Math.sin(thetaArch), 0.85);
        const zArchScale = Math.cos(thetaArch);

        const y = r <= ROWS_L
          ? hemY * (1 - r / ROWS_L) + underarmY * (r / ROWS_L)
          : underarmY * (1 - yArchFrac) + shoulderTopY * yArchFrac;

        let lowerFlare = 1.0;
        if (y < waistY && flareF > 1.02) {
          lowerFlare = 1 + (flareF - 1) * Math.pow(clamp((waistY - y) / Math.max(0.15, waistY - hemY), 0, 1), 1.06);
        }

        let innerX = 0;
        if (isFront) {
          if (ol.openFront && ol.style !== "pinafore") {
            const openY = y > frontBreakY
              ? clamp((y - frontBreakY) / Math.max(0.04, shoulderTopY - frontBreakY), 0, 1) * (neckHalfW * 0.85)
              : 0;
            innerX = Math.max(ol.style === "bisht" ? 0.048 : 0.022, openY + (ol.style === "bisht" ? 0.02 : 0.016));
          } else if (ol.style === "pinafore" && y > frontBreakY + 0.0005) {
            const nu = clamp((y - frontBreakY) / Math.max(0.02, shoulderTopY - frontBreakY), 0, 1);
            innerX = neckHalfW * 1.15 * Math.pow(nu, 0.72);
          } else if (y > frontBreakY + 0.0005) {
            const nu = clamp((y - frontBreakY) / Math.max(0.02, shoulderTopY - frontBreakY), 0, 1);
            innerX = neckHalfW * Math.pow(nu, 0.85);
          }
        } else if (y > shoulderTopY - span * 0.022 + 0.0005) {
          const nu = clamp((y - (shoulderTopY - span * 0.022)) / Math.max(0.02, shoulderTopY - (shoulderTopY - span * 0.022)), 0, 1);
          innerX = neckHalfW * Math.sin(nu * Math.PI * 0.5);
        }

        const bodyHalfW = Math.abs(getBodySurfacePoint(underarmY, Math.PI / 2, d, outerEase, waistRelax)[0]);
        let outerMaxX = Math.abs(getBodySurfacePoint(Math.min(y, underarmY), Math.PI / 2, d, outerEase, waistRelax)[0]) * lowerFlare;
        if (r > ROWS_L) {
          outerMaxX = Math.max(innerX + 0.025, bodyHalfW * (1 - upperFrac) + shoulderTipX * upperFrac);
        }

        const row = [];
        for (const sideSign of [-1, 1]) {
          for (let c = 0; c < HALF_COLS; c++) {
            const tCol = sideSign < 0 ? (1 - c / (HALF_COLS - 1)) : (c / (HALF_COLS - 1));
            const xMag = innerX + (outerMaxX - innerX) * tCol;
            const x = sideSign * xMag;
            const sinPhi = clamp(x / Math.max(0.04, outerMaxX * (upperFrac > 0 ? 1.12 : 1.0)), -1, 1);
            const phi = isFront ? Math.asin(sinPhi) : (Math.PI - Math.asin(sinPhi));
            let yFinal = y, ySample = y;
            if (upperFrac > 0) {
              const sFrac = clamp((xMag - neckHalfW) / Math.max(0.025, shoulderTipX - neckHalfW), 0, 1);
              const sCurve = Math.pow(sFrac, 1.08);
              const padArch = (isStructuredTailored ? 0.0065 : 0.0032) * Math.sin(Math.PI * sFrac);
              yFinal = underarmY * (1 - yArchFrac) + (shoulderTopY * (1 - sCurve) + shoulderAcromionY * sCurve + padArch) * yArchFrac;
              ySample = Math.min(yFinal, underarmY + span * 0.04);
            }
            const oCapEase = upperFrac > 0 ? outerEase + 0.005 * Math.sin(Math.PI * upperFrac) : outerEase;
            const [, zS] = getBodySurfacePoint(ySample, phi, d, oCapEase, waistRelax);
            let zSurf = zS * lowerFlare;
            if (upperFrac > 0) {
              const neckRatio = Math.min(1, xMag / Math.max(0.02, neckHalfW));
              const neckCylZ = (isFront ? 1 : -1) * (neckR * 1.18 + 0.012) * Math.sqrt(Math.max(0, 1 - neckRatio * neckRatio));
              zSurf = neckCylZ + (zSurf - neckCylZ) * zArchScale;
              const oArmOpenHalfZ = (!isVest) ? (d.upperR * (isStructuredTailored ? 1.24 : 1.14)) : (d.upperR * 1.04);
              const oArmOpen = oArmOpenHalfZ * Math.pow(Math.sin(Math.PI * upperFrac), 0.88) * Math.pow(tCol, 1.45);
              zSurf = isFront ? smax(zSurf, oArmOpen, 0.014) : -smax(-zSurf, oArmOpen, 0.014);
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
        const r0 = rowVerts[r], r1 = rowVerts[r + 1];
        for (let c = 0; c < HALF_COLS * 2 - 1; c++) {
          if (c === HALF_COLS - 1 && (r0[c].innerX > 0.002 || r1[c].innerX > 0.002)) continue;
          const a0 = r0[c].id, a1 = r0[c + 1].id, b0 = r1[c].id, b1 = r1[c + 1].id;
          if (isFront) indices.push(a0, a1, b1, a0, b1, b0);
          else indices.push(a0, b1, a1, a0, b0, b1);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      smoothShoulderCrestNormals(geo, totalRows, HALF_COLS, neckHalfW, shoulderTipX, shoulderTopY, shoulderAcromionY);
      geo.userData.gridMeta = { rows: totalRows + 1, cols: HALF_COLS * 2, lowerRows: ROWS_L, hemY, waistY, style: ol.lengthStyle || "hip", hemFlare: flareF };
      const mesh = createGarmentMesh(geo, fabricMat("outer", isFront ? "front" : "back"), "outer", isFront ? "front" : "back", skeleton);
      mesh.userData.isOuterLayer = true;
      return mesh;
    }

    outerFrontMesh = buildOuterSide(true);
    outerBackMesh = buildOuterSide(false);
    garmentGroup.add(outerFrontMesh, outerBackMesh);

    const evalOuterFrontZ = (xMag, yVal) => {
      const yC = clamp(yVal, hemY, shoulderTopY);
      const flareF = (ol.style === "pinafore" || ol.style === "bisht" || ol.lengthStyle === "coat" || ol.lengthStyle === "robe")
        ? Math.max(1.26, (pm.bodice?.hemFlare || 1.0) + 0.06)
        : 1.04;
      const lowerF = (yC < waistY && flareF > 1.02)
        ? 1 + (flareF - 1) * Math.pow(clamp((waistY - yC) / Math.max(0.15, waistY - hemY), 0, 1), 1.06)
        : 1.0;
      const uFrac = yC <= underarmY
        ? 0
        : clamp((2 / Math.PI) * Math.asin(Math.pow(clamp((yC - underarmY) / Math.max(0.02, shoulderTopY - underarmY), 0, 1), 1 / 0.85)), 0, 1);
      const thetaA = Math.PI * 0.5 * uFrac;
      const zAS = Math.cos(thetaA);
      const bodyHalfW = Math.abs(getBodySurfacePoint(underarmY, Math.PI / 2, d, outerEase, waistRelax)[0]);
      let oMaxX = Math.abs(getBodySurfacePoint(Math.min(yC, underarmY), Math.PI / 2, d, outerEase, waistRelax)[0]) * lowerF;
      if (uFrac > 0) oMaxX = Math.max(neckHalfW * 0.85 + 0.025, bodyHalfW * (1 - uFrac) + shoulderTipX * uFrac);
      const tCol = clamp((xMag - neckHalfW * 0.35) / Math.max(0.03, oMaxX - neckHalfW * 0.35), 0, 1);
      const sinPhi = clamp(xMag / Math.max(0.04, oMaxX * (uFrac > 0 ? 1.12 : 1.0)), -1, 1);
      const phi = Math.asin(sinPhi);
      const ySamp = uFrac > 0 ? Math.min(yC, underarmY + span * 0.04) : yC;
      const oCapEase = uFrac > 0 ? outerEase + 0.005 * Math.sin(Math.PI * uFrac) : outerEase;
      const [, zS] = getBodySurfacePoint(ySamp, phi, d, oCapEase, waistRelax);
      let zSurf = zS * lowerF;
      if (uFrac > 0) {
        const nR = Math.min(1, xMag / Math.max(0.02, neckHalfW));
        const nCZ = (neckR * 1.18 + 0.012) * Math.sqrt(Math.max(0, 1 - nR * nR));
        zSurf = nCZ + (zSurf - nCZ) * zAS;
        const oArmOpenHalfZ = (!isVest) ? (d.upperR * (isStructuredTailored ? 1.24 : 1.14)) : (d.upperR * 1.04);
        const oArmOpen = oArmOpenHalfZ * Math.pow(Math.sin(Math.PI * uFrac), 0.88) * Math.pow(tCol, 1.45);
        zSurf = smax(zSurf, oArmOpen, 0.014);
      }
      return zSurf;
    };

    // Gold bisht/embroidered trim panels along front opening (mf14, bf13)
    if ((ol.style === "bisht" || ol.trimColor) && fabricState.trim) {
      [-1, 1].forEach((side) => {
        const tPos = [], tUvs = [], tSi = [], tSw = [], tIdx = [];
        const rowsT = 12;
        const innerOff = ol.style === "bisht" ? 0.045 : 0.022;
        const bandW = ol.style === "bisht" ? 0.032 : 0.018;
        for (let r = 0; r <= rowsT; r++) {
          const u = r / rowsT;
          const y = hemY * (1 - u) + (shoulderTopY - span * 0.02) * u;
          const trimFlare = (y < waistY && (ol.style === "bisht" || ol.lengthStyle === "coat"))
            ? 1 + 0.22 * Math.pow(clamp((waistY - y) / Math.max(0.15, waistY - hemY), 0, 1), 1.1)
            : 1.0;
          const xIn = side * innerOff * trimFlare;
          const xOut = side * (innerOff + bandW) * trimFlare;
          const [, zIn] = getBodySurfacePoint(y, side * 0.16, d, outerEase + 0.006, waistRelax);
          const [, zOut] = getBodySurfacePoint(y, side * 0.28, d, outerEase + 0.006, waistRelax);
          tPos.push(xIn, y, Math.max(zIn, evalOuterFrontZ(innerOff * trimFlare, y)) + 0.004, xOut, y, Math.max(zOut, evalOuterFrontZ((innerOff + bandW) * trimFlare, y)) + 0.004);
          tUvs.push(0, u, 1, u);
          const [bi, bw] = packSkinWeights(torsoGarmentWeights(y, xIn, d));
          for (let q = 0; q < 2; q++) {
            tSi.push(bi[0], bi[1], bi[2], bi[3]);
            tSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
          if (r > 0) {
            const p = (r - 1) * 2, c = r * 2;
            if (side > 0) tIdx.push(p, p + 1, c + 1, p, c + 1, c);
            else tIdx.push(p, c + 1, p + 1, p, c, c + 1);
          }
        }
        const tGeo = new THREE.BufferGeometry();
        tGeo.setAttribute("position", new THREE.Float32BufferAttribute(tPos, 3));
        tGeo.setAttribute("uv", new THREE.Float32BufferAttribute(tUvs, 2));
        tGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(tSi, 4));
        tGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(tSw, 4));
        tGeo.setIndex(tIdx);
        tGeo.computeVertexNormals();
        const tMesh = createGarmentMesh(tGeo, fabricMat("trim", "front"), "trim", "front", skeleton);
        tMesh.userData.parentPart = "bodice";
        garmentGroup.add(tMesh);
      });
    }

    // Outer layer continuous back roll collar + sculpted front lapels (blazer / tuxedo / overcoat / trench / peacoat)
    if (ol.lapelStyle && ol.lapelStyle !== "none") {
      const lpPart = (ol.style === "tuxedo" && fabricState.trim) ? "trim" : "outer";
      // A. Continuous Back & Side Jacket Roll Collar
      {
        const colSegs = 28;
        const rJCol = neckR * 1.24 + 0.013;
        const zScaleJ = 0.96;
        const gorgePhi = 0.90;
        const jcPos = [], jcUvs = [], jcSi = [], jcSw = [], jcIdx = [];
        for (let row = 0; row <= 3; row++) {
          for (let k = 0; k <= colSegs; k++) {
            const u = k / colSegs;
            const phi = gorgePhi + u * (2 * Math.PI - 2 * gorgePhi);
            const sinP = Math.sin(phi), cosP = Math.cos(phi);
            const frontProx = clamp((cosP + 0.32) / 1.20, 0, 1);
            const endTaper = smoothstep(0.0, 0.20, u) * smoothstep(0.0, 0.20, 1 - u);
            const baseY = (shoulderTopY + 0.002) * (1 - frontProx * 0.58) + (shoulderTopY - span * 0.016) * (frontProx * 0.58);
            let rad = Math.max(neckR * 1.08, neckHalfW * 0.96), y = baseY - 0.004;
            if (row === 1) { rad = rJCol * 1.02; y = baseY + 0.025 * endTaper; }
            else if (row === 2) { rad = rJCol * 1.07; y = baseY + 0.031 * endTaper; }
            else if (row === 3) { rad = rJCol * (1.12 + 0.11 * endTaper); y = baseY + 0.005 * endTaper; }
            let jz = rad * zScaleJ * cosP + torsoZBump(shoulderY, phi, d) * 0.16;
            if (row === 3 && cosP > -0.25) {
              const [, zChest] = getBodySurfacePoint(Math.min(y, shoulderY - 0.004), phi, d, outerEase + 0.008, waistRelax);
              jz = cosP > 0 ? Math.max(jz, zChest + 0.006) : Math.min(jz, zChest - 0.004);
            }
            jcPos.push(rad * sinP, y, jz);
            jcUvs.push(u, row / 3);
            const wJNeck = 0.05 * (row / 3);
            const [bi, bw] = packSkinWeights([[BONE_IDX.chest, 1 - wJNeck], [BONE_IDX.neck, wJNeck]]);
            jcSi.push(bi[0], bi[1], bi[2], bi[3]);
            jcSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
          if (row > 0) {
            const pOff = (row - 1) * (colSegs + 1), cOff = row * (colSegs + 1);
            const flipLeaf = row >= 3;
            for (let k = 0; k < colSegs; k++) {
              const a0 = pOff + k, a1 = a0 + 1, b0 = cOff + k, b1 = b0 + 1;
              if (flipLeaf) jcIdx.push(a0, b1, a1, a0, b0, b1);
              else jcIdx.push(a0, a1, b1, a0, b1, b0);
            }
          }
        }
        const jcGeo = new THREE.BufferGeometry();
        jcGeo.setAttribute("position", new THREE.Float32BufferAttribute(jcPos, 3));
        jcGeo.setAttribute("uv", new THREE.Float32BufferAttribute(jcUvs, 2));
        jcGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(jcSi, 4));
        jcGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(jcSw, 4));
        jcGeo.setIndex(jcIdx);
        jcGeo.computeVertexNormals();
        const jcMesh = createGarmentMesh(jcGeo, fabricMat(lpPart, "front"), lpPart, "front", skeleton);
        jcMesh.userData.garmentType = "collar";
        jcMesh.userData.isOuterLayer = true;
        jcMesh.userData.parentPart = "outer";
        garmentGroup.add(jcMesh);
      }

      // B. Sculpted 12-Row × 3-Column Front Lapels sitting proud atop the outer jacket surface
      [-1, 1].forEach((side) => {
        const lPos = [], lUvs = [], lSi = [], lSw = [], lIdx = [];
        const topY = shoulderTopY + 0.002;
        const botY = frontBreakY;
        const rowsL = 12;
        for (let r = 0; r <= rowsL; r++) {
          const u = r / rowsL;
          const y = topY * (1 - u) + botY * u;
          const openFrac = clamp((y - frontBreakY) / Math.max(0.04, shoulderTopY - frontBreakY), 0, 1);
          const innerX = ol.openFront
            ? Math.max(0.016, openFrac * (neckHalfW * 0.85) + 0.014)
            : (0.010 + neckHalfW * 0.85 * Math.pow(openFrac, 0.85));
          let wLapel;
          if (ol.lapelStyle === "shawl") {
            wLapel = Math.max(0.022 * (1 - u), 0.044 * Math.pow(Math.sin(Math.PI * clamp(0.14 + u * 0.84, 0.08, 0.98)), 0.68));
          } else if (ol.lapelStyle === "peak") {
            const peakBoost = (u > 0.24 && u < 0.36) ? 1.18 : 1.0;
            wLapel = Math.max(0.022 * (1 - u), 0.056 * Math.sin(Math.PI * clamp(u * 0.90 + 0.10, 0.08, 0.98)) * peakBoost);
          } else {
            const notchCut = (ol.lapelStyle === "notched" && u > 0.16 && u < 0.28) ? 0.62 : 1.0;
            wLapel = Math.max(0.022 * (1 - u), 0.052 * Math.sin(Math.PI * clamp(u * 0.90 + 0.10, 0.08, 0.98)) * notchCut);
          }
          const x0 = innerX, x1 = innerX + wLapel * 0.48, x2 = innerX + wLapel;
          const z0 = evalOuterFrontZ(x0, y) + 0.0055;
          const z1 = evalOuterFrontZ(x1, y) + 0.0110;
          const z2 = evalOuterFrontZ(x2, y) + 0.0070;
          lPos.push(side * x0, y, z0, side * x1, y, z1, side * x2, y, z2);
          lUvs.push(0, u, 0.5, u, 1, u);
          const [bi, bw] = packSkinWeights(torsoGarmentWeights(y, side * x1, d));
          for (let q = 0; q < 3; q++) {
            lSi.push(bi[0], bi[1], bi[2], bi[3]);
            lSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
          if (r > 0) {
            const p = (r - 1) * 3, c = r * 3;
            for (let seg = 0; seg < 2; seg++) {
              const a0 = p + seg, a1 = a0 + 1, b0 = c + seg, b1 = b0 + 1;
              if (side > 0) lIdx.push(a0, a1, b1, a0, b1, b0);
              else lIdx.push(a0, b1, a1, a0, b0, b1);
            }
          }
        }
        const lGeo = new THREE.BufferGeometry();
        lGeo.setAttribute("position", new THREE.Float32BufferAttribute(lPos, 3));
        lGeo.setAttribute("uv", new THREE.Float32BufferAttribute(lUvs, 2));
        lGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(lSi, 4));
        lGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(lSw, 4));
        lGeo.setIndex(lIdx);
        lGeo.computeVertexNormals();
        const lpMesh = createGarmentMesh(lGeo, fabricMat(lpPart, "front"), lpPart, "front", skeleton);
        lpMesh.userData.isOuterLayer = true;
        lpMesh.userData.isLapel = true;
        lpMesh.userData.parentPart = "outer";
        garmentGroup.add(lpMesh);
      });
    }
    if (ol.collarStyle && ol.collarStyle !== "none" && (!ol.lapelStyle || ol.lapelStyle === "none") && !isVest) {
      const colCols = 36;
      const ocPos = [], ocUvs = [], ocSi = [], ocSw = [], ocIdx = [];
      const isStandCol = ol.collarStyle === "mandarin" || ol.collarStyle === "stand";
      const rOCol = neckR * 1.24 + 0.008;
      const neckZScaleO = 0.95;
      const openPhiO = ol.openFront ? 0.14 : 0.04;
      const standHO = isStandCol ? 0.032 : 0.026;
      const baseYO = shoulderTopY - span * 0.020;
      const numRowsO = isStandCol ? 2 : 4;
      for (let row = 0; row <= numRowsO; row++) {
        const rOpenPhi = isStandCol ? openPhiO : (openPhiO + Math.max(0, row - 2) * 0.14);
        for (let k = 0; k <= colCols; k++) {
          const u = k / colCols;
          const phi = rOpenPhi + u * (2 * Math.PI - 2 * rOpenPhi);
          const cosP = Math.cos(phi), sinP = Math.sin(phi);
          const frontW = Math.max(0, cosP);
          let rad = rOCol, y = baseYO;
          if (row === 1) { rad = rOCol * 1.02; y = baseYO + standHO * 0.55; }
          else if (row === 2) { rad = rOCol * 1.05; y = baseYO + standHO; }
          else if (row === 3) { rad = rOCol * (1.12 + 0.05 * frontW); y = baseYO + standHO * 0.56 - 0.010 * frontW; }
          else if (row === 4) { rad = rOCol * (1.16 + 0.07 * frontW); y = baseYO + standHO * 0.16 - 0.022 * frontW; }
          const x = rad * sinP;
          const z = rad * neckZScaleO * cosP + torsoZBump(shoulderY, phi, d) * 0.16;
          ocPos.push(x, y, z);
          ocUvs.push(u, row / numRowsO);
          const wNeckO = 0.06 * (row / Math.max(1, numRowsO));
          const [bi, bw] = packSkinWeights([[BONE_IDX.chest, 1 - wNeckO], [BONE_IDX.neck, wNeckO]]);
          ocSi.push(bi[0], bi[1], bi[2], bi[3]);
          ocSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
        if (row > 0) {
          const pOff = (row - 1) * (colCols + 1), cOff = row * (colCols + 1);
          const flipLeaf = row >= 3;
          for (let k = 0; k < colCols; k++) {
            const a0 = pOff + k, a1 = a0 + 1, b0 = cOff + k, b1 = b0 + 1;
            if (flipLeaf) ocIdx.push(a0, b1, a1, a0, b0, b1);
            else ocIdx.push(a0, a1, b1, a0, b1, b0);
          }
        }
      }
      const ocGeo = new THREE.BufferGeometry();
      ocGeo.setAttribute("position", new THREE.Float32BufferAttribute(ocPos, 3));
      ocGeo.setAttribute("uv", new THREE.Float32BufferAttribute(ocUvs, 2));
      ocGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(ocSi, 4));
      ocGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(ocSw, 4));
      ocGeo.setIndex(ocIdx);
      ocGeo.computeVertexNormals();
      const ocMesh = createGarmentMesh(ocGeo, fabricMat("outer", "front"), "outer", "front", skeleton);
      ocMesh.userData.garmentType = "collar";
      ocMesh.userData.isOuterLayer = true;
      ocMesh.userData.parentPart = "outer";
      garmentGroup.add(ocMesh);
    }
    void chestR;
  }

  /**
   * Builds tailored, armscye-fitted skinned sleeves (cap, puff, fitted, 3/4,
   * full, bell, bishop) aligned 1:1 with createSkeletonRig & armWeightsAtOffset.
   */
  function buildTailoredSleeves(d, pm, skeleton) {
    const sSpec = pm.sleeve;
    const ol = pm.bodice?.outerLayer;
    const hasOuterSleeved = Boolean(ol && ol.enabled && ol.style !== "vest" && ol.style !== "pinafore");
    const isLeo = pm.bodice?.style === "leotard";
    const slFit = hasOuterSleeved ? "regular" : (sSpec.fitTier || (isLeo ? "second-skin" : "regular"));
    const isTightSl = slFit === "second-skin";
    const isFittedSl = slFit === "fitted";
    const { shoulderHalf, shoulderY, span, armLen, upperR, chestR, female } = d;
    const zScale = female ? 0.72 : 0.78;
    const pivotX = shoulderHalf * 0.82;
    const isShoulderCut = Boolean(sSpec.isOffShoulder || sSpec.isColdShoulder);
    const pivotY = shoulderY - span * (sSpec.isColdShoulder ? 0.092 : (sSpec.isOffShoulder ? 0.085 : 0.035));
    const upperArmLen = armLen * 0.48;
    const forearmLen = armLen * 0.46;
    const wristDist = upperArmLen + forearmLen;
    const handLen = d.H * (d.kid ? 0.108 : (female ? 0.104 : 0.107));
    const wristBroadR = Math.max(upperR * 0.44, handLen * (female ? 0.212 : 0.224) * 0.70);
    const wristR = Math.max(upperR * (female ? 0.50 : 0.53), wristBroadR * 1.06, d.H * 0.0148);
    const totalSlLen = armLen * clamp(sSpec.lengthFrac, 0.16, 1.02) * (sSpec.isColdShoulder ? 0.90 : 1.0);

    // Match the active upper garment (outer coat/blazer vs bodice vs leotard) armhole ring seamlessly
    const isOuterTailored = hasOuterSleeved && ol.style !== "bisht" && ol.style !== "cape";
    const activeTipX = isOuterTailored
      ? shoulderHalf * 0.93
      : (hasOuterSleeved ? shoulderHalf * 0.91 : (isLeo ? shoulderHalf * 0.82 : shoulderHalf * 0.89));
    const activeAcromionY = shoulderY + span * (isOuterTailored ? 0.019 : (hasOuterSleeved ? 0.012 : 0.002));
    const activeEase = hasOuterSleeved
      ? (0.028 + Math.max(0, ((pm.bodice?.easeRatio || 1.04) - 1.0) * 0.040))
      : (isTightSl ? 0.0038 : (isFittedSl ? 0.0075 : (0.015 + Math.max(-0.002, ((pm.bodice?.easeRatio || 1.0) - 1.0) * 0.042))));

    const armscyeTopX = sSpec.isColdShoulder
      ? (activeTipX + upperR * 0.55)
      : (activeTipX - 0.010);
    const armscyeBotY = shoulderY - span * (sSpec.isColdShoulder ? 0.122 : 0.125);
    const armscyeBotX = Math.abs(getBodySurfacePoint(armscyeBotY, Math.PI / 2, d, activeEase, 0)[0]) - 0.010;
    const armscyeTopY = sSpec.isColdShoulder
      ? (shoulderY - span * 0.088)
      : (sSpec.isOffShoulder ? (shoulderY - span * 0.065) : activeAcromionY);
    const armscyeMidY = 0.5 * (armscyeTopY + armscyeBotY);
    const armscyeHalfH = 0.5 * (armscyeTopY - armscyeBotY);
    const armscyeDepthZ = isTightSl
      ? (upperR * 1.05 + 0.004)
      : (isFittedSl ? (upperR * 1.08 + 0.008) : (upperR * (isOuterTailored ? 1.16 : (hasOuterSleeved ? 1.15 : 1.14)) + 0.011));
    const capHeight = Math.max(0.075, Math.min(totalSlLen * 0.82, upperArmLen * 0.44));

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

        // Match anatomical arm envelope (deltoid 1.08 -> bicep -> olecranon elbow -> brachioradialis -> carpal wrist)
        let bodyArmR;
        if (dyBase <= upperArmLen) {
          const u = dyBase / Math.max(0.1, upperArmLen);
          bodyArmR = upperR * (1.09 * (1 - u) + 0.79 * u);
        } else if (dyBase <= wristDist) {
          const u = clamp((dyBase - upperArmLen) / Math.max(0.1, forearmLen), 0, 1);
          const forePeak = u < 0.28 ? (0.79 + 0.04 * Math.sin((Math.PI * u) / 0.28)) : (0.79 * (1 - (u - 0.28) / 0.72) + (wristR / upperR) * 1.18 * ((u - 0.28) / 0.72));
          bodyArmR = upperR * forePeak;
        } else {
          bodyArmR = wristR * 1.38;
        }

        const easeOffset = hasOuterSleeved ? 0.022 : (isTightSl ? 0.0038 : (isFittedSl ? 0.0072 : 0.015));
        let sleeveR = bodyArmR + easeOffset;
        if (sSpec.style === "puff") {
          const puffBell = Math.sin(Math.PI * Math.pow(f, 0.75));
          sleeveR = bodyArmR + easeOffset + upperR * 0.44 * puffBell;
          if (f > 0.88) sleeveR = bodyArmR + 0.016;
        } else if (sSpec.style === "bishop") {
          const billow = Math.sin(Math.PI * Math.pow(f, 0.65));
          sleeveR = bodyArmR + easeOffset + upperR * 0.52 * billow;
          if (f > 0.90) sleeveR = bodyArmR + 0.016;
        } else if (sSpec.style === "bell") {
          sleeveR = bodyArmR + easeOffset + upperR * 0.56 * Math.pow(f, 1.35);
        } else if (sSpec.style === "cap") {
          sleeveR = bodyArmR + easeOffset + upperR * (isTightSl ? 0.01 : 0.05) * (1 - f);
        } else {
          const easeExtra = isTightSl
            ? 0
            : (isFittedSl ? Math.max(0, (sSpec.hemRatio - 0.72) * upperR * 0.18 * f) : Math.max(0, (sSpec.hemRatio - 0.68) * upperR * 0.35 * f));
          sleeveR = bodyArmR + easeOffset + easeExtra;
        }

        // Metric skinning weights matching bodice armhole at dyBase=0 -> arm bone down the limb
        const bArm = side > 0 ? BONE_IDX.armL : BONE_IDX.armR;
        const bElbow = side > 0 ? BONE_IDX.elbowL : BONE_IDX.elbowR;
        const bHand = side > 0 ? BONE_IDX.handL : BONE_IDX.handR;
        let weights;
        if (dyBase < capHeight * 1.05) {
          const fArm = smoothstep(0.0, capHeight * 1.05, dyBase);
          const wChest = 0.78 * (1 - fArm);
          weights = [[BONE_IDX.chest, wChest], [bArm, 1 - wChest]];
        } else if (dyBase < upperArmLen + 0.042) {
          const fElb = smoothstep(upperArmLen - 0.042, upperArmLen + 0.042, dyBase);
          weights = [[bArm, 1 - fElb], [bElbow, fElb]];
        } else {
          const fHand = smoothstep(wristDist - 0.025, wristDist + 0.020, dyBase);
          weights = [[bElbow, 1 - fHand], [bHand, fHand]];
        }
        const [bi, bw] = packSkinWeights(weights);

        const fCap = clamp(dyBase / capHeight, 0, 1);
        const capBlendX = Math.pow(1 - clamp(dyBase / (capHeight * 0.82), 0, 1), 1.38);
        const capBlendY = Math.pow(Math.cos((Math.PI * 0.5) * fCap), 0.72);
        const capBlendZ = Math.pow(1 - fCap, 1.4);
        const deltoidArc = Math.sin(Math.PI * clamp(dyBase / Math.max(0.08, upperArmLen * 0.52), 0, 1));

        for (let k = 0; k <= N_SEG; k++) {
          const u = k / N_SEG;
          const theta = u * 2 * Math.PI;
          const sCrown = Math.sin(theta);
          const cFront = Math.cos(theta);

          const gatherFlute = sSpec.style === "puff" ? 0.003 * Math.sin(theta * 10) * Math.sin(Math.PI * f) : 0;
          const deltoidSwell = isShoulderCut
            ? 0
            : upperR * (sSpec.style === "puff" ? 0.28 : (isTightSl ? 0.055 : 0.08)) * deltoidArc * Math.max(0, sCrown + 0.25);
          const sleeveHeadFullness = isShoulderCut
            ? 0
            : (isTightSl ? 0.0012 : 0.0018) * Math.pow(Math.max(0, sCrown), 1.5) * (1 - fCap);
          const rEff = sleeveR + gatherFlute + deltoidSwell + sleeveHeadFullness;

          const crownFrac = 0.5 * (1 + sCrown);
          const xArmscye = side * (armscyeBotX * (1 - crownFrac) + armscyeTopX * crownFrac);
          const armscyeBowY = (!isShoulderCut && sCrown > 0)
            ? 0.007 * Math.sin(Math.PI * clamp(sCrown, 0, 1)) * Math.abs(cFront)
            : 0;
          const yArmscye = armscyeMidY + armscyeHalfH * sCrown + armscyeBowY + (hasOuterSleeved ? 0.0015 : 0.0025) * Math.max(0, sCrown) + sleeveHeadFullness;
          const zArmscye = (armscyeDepthZ + gatherFlute) * Math.sign(cFront) * Math.pow(Math.abs(cFront), 0.56);

          const xTube = sx + side * rEff * sCrown;
          const crownTopTargetY = isShoulderCut ? (shoulderY - span * 0.084) : (shoulderY - span * 0.014);
          const crownLiftY = Math.max(0, sCrown) * (crownTopTargetY - pivotY) * (1 - smoothstep(0.0, upperArmLen * 0.65, dyBase));
          const underarmDropY = Math.min(0, sCrown) * Math.max(0, pivotY - armscyeBotY) * (1 - smoothstep(0.0, upperArmLen * 0.45, dyBase));
          const yTube = pivotY + crownLiftY + underarmDropY - dyBase;
          const zTube = (sleeveR + gatherFlute) * (isTightSl ? 1.01 : 1.06) * cFront;

          const overDeltoidUp = isShoulderCut
            ? 0
            : (sSpec.style === "puff" ? span * 0.022 : span * 0.002) * deltoidArc * Math.max(0, sCrown);

          const x = xArmscye * capBlendX + xTube * (1 - capBlendX);
          const capBlendYMix = capBlendZ + (capBlendY - capBlendZ) * smoothstep(-0.02, 0.08, sCrown);
          const y = (yArmscye * capBlendYMix + yTube * (1 - capBlendYMix)) + overDeltoidUp;
          const z = zArmscye * capBlendZ + zTube * (1 - capBlendZ);

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
      // Gently align top sleeve-cap seam normals with the bodice armhole crown
      const nAttr = geo.attributes.normal;
      for (let k = 0; k <= N_SEG; k++) {
        const theta = (k / N_SEG) * 2 * Math.PI;
        const sCrown = Math.sin(theta);
        if (sCrown <= 0) continue;
        const nx = nAttr.getX(k), ny = nAttr.getY(k), nz = nAttr.getZ(k);
        const wBlend = 0.28 * sCrown;
        const bx = nx * (1 - wBlend) + side * 0.85 * wBlend;
        const by = ny * (1 - wBlend) + 0.52 * wBlend;
        const bz = nz * (1 - wBlend);
        const bl = Math.hypot(bx, by, bz) || 1;
        nAttr.setXYZ(k, bx / bl, by / bl, bz / bl);
      }
      nAttr.needsUpdate = true;
      geo.userData.gridMeta = {
        rows: N_RINGS + 1,
        cols: N_SEG + 1,
        totalSlLen,
        style: sSpec.style,
        fitTier: slFit,
      };

      const slMesh = createGarmentMesh(geo, fabricMat("sleeve", "front"), "sleeve", "front", skeleton);
      slMesh.userData.armSide = side;
      slMesh.userData.fitTier = slFit;
      if (skeleton) {
        garmentGroup.add(slMesh);
      } else if (limbs["arm" + side]) {
        limbs["arm" + side].add(slMesh);
      } else {
        garmentGroup.add(slMesh);
      }

      // Contrasting wrist cuff ring (bombers, abaya, rugby/varsity sleeves)
      if (sSpec.contrastCuffs && fabricState.trim) {
        const cPos = [], cUvs = [], cSi = [], cSw = [], cIdx = [];
        const cuffStart = Math.max(2, N_RINGS - 2);
        for (let r = cuffStart; r <= N_RINGS; r++) {
          const base = r * stride;
          for (let k = 0; k <= N_SEG; k++) {
            const vi = base + k;
            const px = positions[vi * 3], py = positions[vi * 3 + 1], pz = positions[vi * 3 + 2];
            const radX = px - sx;
            const cOut = 1.045;
            cPos.push(sx + radX * cOut, py, pz * cOut);
            cUvs.push(uvs[vi * 2], (r - cuffStart) / Math.max(1, N_RINGS - cuffStart));
            cSi.push(skinIdx[vi * 4], skinIdx[vi * 4 + 1], skinIdx[vi * 4 + 2], skinIdx[vi * 4 + 3]);
            cSw.push(skinWgt[vi * 4], skinWgt[vi * 4 + 1], skinWgt[vi * 4 + 2], skinWgt[vi * 4 + 3]);
          }
        }
        const rowsC = N_RINGS - cuffStart;
        for (let r = 0; r < rowsC; r++) {
          for (let k = 0; k < N_SEG; k++) {
            const a0 = r * stride + k, a1 = a0 + 1, b0 = (r + 1) * stride + k, b1 = b0 + 1;
            if (side > 0) cIdx.push(a0, b1, a1, a0, b0, b1);
            else cIdx.push(a0, a1, b1, a0, b1, b0);
          }
        }
        const cGeo = new THREE.BufferGeometry();
        cGeo.setAttribute("position", new THREE.Float32BufferAttribute(cPos, 3));
        cGeo.setAttribute("uv", new THREE.Float32BufferAttribute(cUvs, 2));
        cGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(cSi, 4));
        cGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(cSw, 4));
        cGeo.setIndex(cIdx);
        cGeo.computeVertexNormals();
        const cuffM = createGarmentMesh(cGeo, fabricMat("trim", "front"), "trim", "front", skeleton);
        cuffM.userData.parentPart = "sleeve";
        cuffM.userData.armSide = side;
        cuffM.userData.fitTier = slFit;
        if (skeleton) garmentGroup.add(cuffM);
        else if (limbs["arm" + side]) limbs["arm" + side].add(cuffM);
        else garmentGroup.add(cuffM);
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
        const skFit = skSpec.fitTier || "regular";
        const isTightSk = skFit === "second-skin";
        const isFittedSk = skFit === "fitted";
        const skirtWaistEase = isTightSk ? 0.0042 : (isFittedSk ? 0.0075 : (pm.bodice?.style === "leotard" ? 0.011 : 0.0155));
        const hipOffX = isTightSk ? 0.0042 : (isFittedSk ? 0.0072 : 0.017);
        const hipOffZ = isTightSk ? 0.0044 : (isFittedSk ? 0.0078 : 0.019);
        const hipMult = isTightSk ? 1.010 : (isFittedSk ? 1.022 : 1.055);
        const hipMultZ = isTightSk ? 1.012 : (isFittedSk ? 1.026 : 1.065);
        if (y >= hipY) {
          const u = clamp((topY - y) / Math.max(0.05, topY - hipY), 0, 1);
          baseRx = (waistR + skirtWaistEase) * (1 - u) + (hipR * hipMult + hipOffX) * u;
          baseRz = (waistR * zScale + skirtWaistEase) * (1 - u) + (hipR * zScale * hipMultZ + hipOffZ) * u;
        } else {
          const hipDrop = clamp((hipY - y) / Math.max(0.10, hipY - hemY), 0, 1);
          const flareEase = skSpec.flare <= 1.08
            ? (1.0 - (isTightSk || isFittedSk ? 0.065 : 0.03) * hipDrop)
            : (1.0 + (skSpec.flare - 1.05) * Math.pow(hipDrop, 1.10));
          baseRx = (hipR * hipMult + hipOffX) * flareEase;
          const roundBlend = smoothstep(0.0, 0.82, hipDrop) * clamp((skSpec.flare - 1.0) * 0.85, (isTightSk || isFittedSk ? 0.05 : 0.18), 0.78);
          const effZScale = zScale * (1 - roundBlend) + 0.95 * roundBlend;
          baseRz = (hipR * hipMult + hipOffZ) * effZScale * flareEase;
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
        fitTier: skSpec.fitTier || "regular",
      };

      const sideName = isFront ? "front" : "back";
      const skMesh = createGarmentMesh(geo, fabricMat("skirt", sideName), "skirt", sideName, skeleton);
      skMesh.userData.fitTier = skSpec.fitTier || "regular";
      return skMesh;
    }

    skirtFrontMesh = buildSkirtHalf(true);
    skirtBackMesh = buildSkirtHalf(false);
    garmentGroup.add(skirtFrontMesh, skirtBackMesh);

    // Multi-tier ruffled flounces (girls_dress, w23, wf04, wf13, gf01, gf02, gf04, gf08, gf10, wa13)
    const tiersCount = Math.max(0, Math.min(4, skSpec.tiers || 0));
    if (tiersCount >= 2) {
      const SEG = 40;
      const TIER_ROWS = 6;
      for (let ti = 1; ti <= tiersCount; ti++) {
        const startF = Math.max(0.05, ((ti - 1) / tiersCount) * 0.86 + 0.06);
        const endF = Math.min(1.0, (ti / tiersCount) * 0.94 + 0.06);
        const y0 = topY - clamp(startF, 0.05, 0.9) * totalDrop;
        const y1 = topY - clamp(endF, 0.25, 1.0) * totalDrop;
        const flareMult = 1.0 + 0.055 * (tiersCount - ti + 1) + 0.045 * (ti / tiersCount);
        const tPos = [], tUvs = [], tSi = [], tSw = [], tIdx = [];
        for (let row = 0; row <= TIER_ROWS; row++) {
          const rf = row / TIER_ROWS;
          const y = y0 * (1 - rf) + y1 * rf;
          const f = (topY - y) / totalDrop;
          const tierScale = lerp(1.004, flareMult * 1.06, Math.pow(rf, 0.72));
          let bRx, bRz;
          if (y >= hipY) {
            const u = clamp((topY - y) / Math.max(0.05, topY - hipY), 0, 1);
            bRx = ((waistR + 0.016) * (1 - u) + (hipR * 1.08 + 0.020) * u) * tierScale;
            bRz = ((waistR * zScale + 0.016) * (1 - u) + (hipR * zScale * 1.09 + 0.022) * u) * tierScale;
          } else {
            const hDrop = clamp((hipY - y) / Math.max(0.10, hipY - hemY), 0, 1);
            const flE = 1.0 + Math.max(0.25, skSpec.flare - 1.0) * Math.pow(hDrop, 1.08);
            bRx = (hipR * 1.08 + 0.020) * flE * tierScale;
            const rB = smoothstep(0.0, 0.82, hDrop) * 0.58;
            bRz = (hipR * 1.08 + 0.022) * (zScale * (1 - rB) + 0.95 * rB) * flE * tierScale;
          }
          for (let k = 0; k <= SEG; k++) {
            const u = k / SEG;
            const phi = u * Math.PI * 2;
            const flute = 0.008 * Math.sin(phi * 16 + ti * 0.9) * Math.pow(rf, 1.15);
            const x = (bRx + flute) * Math.sin(phi);
            const z = (bRz + flute) * Math.cos(phi);
            tPos.push(x, y, z);
            tUvs.push(u, 1 - f);
            const legF = smoothstep(hipY + 0.03, hipY - 0.32, y) * 0.52;
            const wL = smoothstep(-blendHalfW, blendHalfW, x);
            const [bi, bw] = packSkinWeights([[BONE_IDX.pelvis, 1 - legF], [BONE_IDX.legL, legF * wL], [BONE_IDX.legR, legF * (1 - wL)]]);
            tSi.push(bi[0], bi[1], bi[2], bi[3]);
            tSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
        }
        const stT = SEG + 1;
        for (let row = 0; row < TIER_ROWS; row++) {
          for (let k = 0; k < SEG; k++) {
            const a0 = row * stT + k, a1 = a0 + 1, b0 = (row + 1) * stT + k, b1 = b0 + 1;
            tIdx.push(a0, b1, a1, a0, b0, b1);
          }
        }
        const tGeo = new THREE.BufferGeometry();
        tGeo.setAttribute("position", new THREE.Float32BufferAttribute(tPos, 3));
        tGeo.setAttribute("uv", new THREE.Float32BufferAttribute(tUvs, 2));
        tGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(tSi, 4));
        tGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(tSw, 4));
        tGeo.setIndex(tIdx);
        tGeo.computeVertexNormals();
        tGeo.userData.gridMeta = { rows: TIER_ROWS + 1, cols: stT, topY, hemY, flare: skSpec.flare };
        const tierMesh = createGarmentMesh(tGeo, fabricMat("skirt", "front"), "skirt", "front", skeleton);
        tierMesh.userData.parentPart = "skirt";
        garmentGroup.add(tierMesh);
      }
    }

    // Contrast skirt waistband (e.g. ref_g_skirt white waistband)
    if (skSpec.waistbandColor && fabricState.trim) {
      const wbPos = [], wbUvs = [], wbSi = [], wbSw = [], wbIdx = [];
      const wbSeg = 40;
      for (let r = 0; r <= 2; r++) {
        const y = topY - (r / 2) * 0.032;
        const rx = waistR + 0.017, rz = waistR * zScale + 0.017;
        for (let k = 0; k <= wbSeg; k++) {
          const u = k / wbSeg, phi = u * Math.PI * 2;
          wbPos.push(rx * Math.sin(phi), y, rz * Math.cos(phi));
          wbUvs.push(u, r / 2);
          const [bi, bw] = packSkinWeights([[BONE_IDX.pelvis, 0.65], [BONE_IDX.spine, 0.35]]);
          wbSi.push(bi[0], bi[1], bi[2], bi[3]);
          wbSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }
      const stW = wbSeg + 1;
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < wbSeg; k++) {
          const a0 = r * stW + k, a1 = a0 + 1, b0 = (r + 1) * stW + k, b1 = b0 + 1;
          wbIdx.push(a0, b1, a1, a0, b0, b1);
        }
      }
      const wbGeo = new THREE.BufferGeometry();
      wbGeo.setAttribute("position", new THREE.Float32BufferAttribute(wbPos, 3));
      wbGeo.setAttribute("uv", new THREE.Float32BufferAttribute(wbUvs, 2));
      wbGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(wbSi, 4));
      wbGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wbSw, 4));
      wbGeo.setIndex(wbIdx);
      wbGeo.computeVertexNormals();
      const wbMesh = createGarmentMesh(wbGeo, fabricMat("trim", "front"), "trim", "front", skeleton);
      wbMesh.userData.parentPart = "skirt";
      garmentGroup.add(wbMesh);
    }
  }

  /**
   * Builds anatomically contoured legless briefs (full, bikini, hipster)
   * with diagonal/arched inguinal leg openings, full glute seat coverage,
   * seamless crotch gusset saddle, bound leg trims, and contrast waistband.
   */
  function buildTailoredBrief(d, pm, skeleton) {
    const tSpec = pm.trousers;
    const { hipY, span, waistR, hipR, female } = d;
    const zScale = female ? 0.72 : 0.78;
    const briefCut = tSpec.briefCut || "full";
    const briefRise = tSpec.briefRise || "mid";
    const riseSpanMult = briefRise === "high" ? 0.36 : (briefRise === "low" ? 0.11 : 0.21);
    const waistTopY = hipY + span * riseSpanMult;
    const sideH = briefCut === "bikini" ? span * 0.068 : (briefCut === "hipster" ? span * 0.125 : span * (briefRise === "high" ? 0.22 : 0.155));
    const sideHipBotY = waistTopY - sideH;
    const crotchY = hipY - span * 0.115;
    const briefEase = 0.0034;

    const N = 40;
    const ROWS = 10;
    const gussetS = 0.24;
    const positions = [];
    const uvs = [];
    const skinIdx = [];
    const skinWgt = [];
    const frontIdx = [];
    const backIdx = [];
    const rings = [];

    function addBriefVert(x, y, z, u, v) {
      const id = positions.length / 3;
      positions.push(x, y, z);
      uvs.push(u, v);
      const fSpine = smoothstep(hipY + span * 0.05, hipY + span * 0.44, y) * 0.45;
      const lat = clamp(Math.abs(x) / Math.max(0.1, hipR), 0, 1) * (1 - smoothstep(hipY - span * 0.08, hipY + span * 0.08, y)) * 0.22;
      const wLeft = smoothstep(-0.05, 0.05, x);
      const [bi, bw] = packSkinWeights([
        [BONE_IDX.pelvis, (1 - fSpine) * (1 - lat)],
        [BONE_IDX.spine, fSpine * (1 - lat)],
        [BONE_IDX.legL, lat * wLeft],
        [BONE_IDX.legR, lat * (1 - wLeft)],
      ]);
      skinIdx.push(bi[0], bi[1], bi[2], bi[3]);
      skinWgt.push(bw[0], bw[1], bw[2], bw[3]);
      return id;
    }

    function lowerYAtPhi(phi) {
      const cosP = Math.cos(phi);
      const absS = Math.abs(Math.sin(phi));
      const tSide = clamp((absS - gussetS) / (1 - gussetS), 0, 1);
      if (cosP >= 0) {
        const exp = briefCut === "bikini" ? 0.65 : (briefCut === "hipster" ? 1.15 : 0.85);
        const frontStart = crotchY + span * (briefCut === "bikini" ? 0.028 : 0.014);
        return absS <= gussetS
          ? lerp(crotchY, frontStart, smoothstep(0, gussetS, absS))
          : lerp(frontStart, sideHipBotY, Math.pow(tSide, exp));
      }
      const backCov = briefCut === "bikini" ? 0.85 : (briefCut === "hipster" ? 1.10 : 1.32);
      const backStart = crotchY + span * 0.012;
      return absS <= gussetS
        ? lerp(crotchY, backStart, smoothstep(0, gussetS, absS))
        : lerp(backStart, sideHipBotY, Math.pow(tSide, backCov));
    }

    const legOpeningVerts = [];
    for (let r = 0; r <= ROWS; r++) {
      const v = r / ROWS;
      const ring = [];
      for (let k = 0; k < N; k++) {
        const phi = (2 * Math.PI * k) / N;
        const cosP = Math.cos(phi);
        const yBot = lowerYAtPhi(phi);
        const y = lerp(yBot, waistTopY, v);
        let [bx, bz] = getBodySurfacePoint(Math.max(hipY - span * 0.06, y), phi, d, briefEase, 0);
        if (!female && cosP > 0.35 && y < hipY) {
          bz += 0.007 * cosP * (1 - v) * smoothstep(hipY, hipY - span * 0.09, y);
        }
        const splitFade = smoothstep(hipY - span * 0.045, crotchY, y);
        if (splitFade > 0) {
          const saddleHalfW = hipR * 0.21;
          const targetX = clamp(bx, -saddleHalfW, saddleHalfW);
          const targetZ = (cosP >= 0 ? 1 : -1) * hipR * zScale * 0.34 * Math.abs(cosP);
          bx = lerp(bx, targetX, splitFade);
          bz = lerp(bz, targetZ, splitFade);
        }
        const vid = addBriefVert(bx, y, bz, k / N, v);
        ring.push(vid);
        if (r === 0) legOpeningVerts.push({ phi, x: bx, y, z: bz });
      }
      rings.push(ring);
    }

    const pushTri = (a, b, c) => {
      const cz = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3;
      if (cz >= 0) frontIdx.push(a, b, c);
      else backIdx.push(a, b, c);
    };

    for (let r = 0; r < ROWS; r++) {
      for (let k = 0; k < N; k++) {
        const k1 = (k + 1) % N;
        const a0 = rings[r][k], a1 = rings[r][k1], b0 = rings[r + 1][k], b1 = rings[r + 1][k1];
        pushTri(a0, a1, b1);
        pushTri(a0, b1, b0);
      }
    }

    // Seamless crotch gusset connecting narrow front arch to narrow back arch underneath perineum
    const gHalfK = Math.max(2, Math.round((Math.asin(gussetS) / (2 * Math.PI)) * N));
    const gRows = 6;
    const gussetGrid = [];
    for (let ir = 0; ir <= gRows; ir++) {
      const u = ir / gRows;
      const gRow = [];
      for (let j = -gHalfK; j <= gHalfK; j++) {
        const jf = (j + gHalfK) / (2 * gHalfK);
        const kFront = ((j % N) + N) % N;
        const kBack = (N / 2 - j + N) % N;
        const vFront = rings[0][kFront], vBack = rings[0][kBack];
        if (ir === 0) {
          gRow.push(vFront);
        } else if (ir === gRows) {
          gRow.push(vBack);
        } else {
          const x = lerp(positions[vFront * 3], positions[vBack * 3], u);
          const z = lerp(positions[vFront * 3 + 2], positions[vBack * 3 + 2], u);
          const endY = lerp(positions[vFront * 3 + 1], positions[vBack * 3 + 1], u);
          const y = lerp(endY, crotchY - 0.002, Math.sin(Math.PI * u));
          gRow.push(addBriefVert(x, y, z, jf, 0.5));
        }
      }
      gussetGrid.push(gRow);
    }
    for (let ir = 0; ir < gRows; ir++) {
      for (let j = 0; j < 2 * gHalfK; j++) {
        const a0 = gussetGrid[ir][j], a1 = gussetGrid[ir][j + 1];
        const b0 = gussetGrid[ir + 1][j], b1 = gussetGrid[ir + 1][j + 1];
        const cz = (positions[a0 * 3 + 2] + positions[b1 * 3 + 2]) * 0.5;
        const targetArr = cz >= 0 ? frontIdx : backIdx;
        targetArr.push(a0, b0, b1, a0, b1, a1);
      }
    }

    const mkBriefMesh = (triList, sideName) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));
      geo.setIndex(triList);
      geo.computeVertexNormals();
      const mesh = createGarmentMesh(geo, fabricMat("trousers", sideName), "trousers", sideName, skeleton);
      mesh.userData.subPart = "unified";
      mesh.userData.fitTier = "second-skin";
      return mesh;
    };
    garmentGroup.add(mkBriefMesh(frontIdx, "front"), mkBriefMesh(backIdx, "back"));

    // Contrast elastic waistband at waistTopY
    const trimDiffers = Boolean(
      tSpec.waistbandColor || (fabricState.trim && fabricState.trousers && fabricState.trim.front.color !== fabricState.trousers.front.color)
    );
    if (trimDiffers) {
      const ePos = [], eUvs = [], eSi = [], eSw = [], eIdx = [];
      const wbH = clamp(sideH * 0.24, 0.014, 0.026);
      const eBotY = waistTopY - wbH;
      for (let r = 0; r <= 2; r++) {
        const y = lerp(eBotY, waistTopY + 0.002, r / 2);
        for (let k = 0; k <= N; k++) {
          const phi = (2 * Math.PI * k) / N;
          const [bx, bz] = getBodySurfacePoint(y, phi, d, briefEase + 0.0014, 0);
          ePos.push(bx, y, bz);
          eUvs.push(k / N, r / 2);
          const [bi, bw] = packSkinWeights([[BONE_IDX.pelvis, 0.72], [BONE_IDX.spine, 0.28]]);
          eSi.push(bi[0], bi[1], bi[2], bi[3]);
          eSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }
      const stE = N + 1;
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < N; k++) {
          const a0 = r * stE + k, a1 = a0 + 1, b0 = (r + 1) * stE + k, b1 = b0 + 1;
          eIdx.push(a0, a1, b1, a0, b1, b0);
        }
      }
      const eGeo = new THREE.BufferGeometry();
      eGeo.setAttribute("position", new THREE.Float32BufferAttribute(ePos, 3));
      eGeo.setAttribute("uv", new THREE.Float32BufferAttribute(eUvs, 2));
      eGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(eSi, 4));
      eGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(eSw, 4));
      eGeo.setIndex(eIdx);
      eGeo.computeVertexNormals();
      const wbM = createGarmentMesh(eGeo, fabricMat("trim", "front"), "trim", "front", skeleton);
      wbM.userData.parentPart = "trousers";
      wbM.userData.fitTier = "second-skin";
      garmentGroup.add(wbM);

      // Slim bound leg-opening trim around right & left arched leg cutouts
      [-1, 1].forEach((sideSign) => {
        const legPts = legOpeningVerts.filter((pt) => {
          const s = Math.sin(pt.phi);
          return (sideSign > 0 ? s >= gussetS * 0.9 : s <= -gussetS * 0.9);
        });
        if (sideSign > 0) legPts.sort((a, b) => Math.cos(b.phi) - Math.cos(a.phi));
        else legPts.sort((a, b) => Math.cos(a.phi) - Math.cos(b.phi));
        if (legPts.length < 3) return;
        const lPos = [], lUvs = [], lSi = [], lSw = [], lIdx = [];
        const trimW = 0.008;
        legPts.forEach((pt, i) => {
          const outX = pt.x * 1.005, outZ = pt.z * 1.005;
          lPos.push(outX, pt.y - 0.001, outZ, outX, pt.y + trimW, outZ);
          lUvs.push(i / (legPts.length - 1), 0, i / (legPts.length - 1), 1);
          const [bi, bw] = packSkinWeights([[BONE_IDX.pelvis, 0.85], [sideSign > 0 ? BONE_IDX.legL : BONE_IDX.legR, 0.15]]);
          for (let q = 0; q < 2; q++) {
            lSi.push(bi[0], bi[1], bi[2], bi[3]);
            lSw.push(bw[0], bw[1], bw[2], bw[3]);
          }
          if (i > 0) {
            const p = (i - 1) * 2, c = i * 2;
            if (sideSign > 0) lIdx.push(p, p + 1, c + 1, p, c + 1, c);
            else lIdx.push(p, c + 1, p + 1, p, c, c + 1);
          }
        });
        const lGeo = new THREE.BufferGeometry();
        lGeo.setAttribute("position", new THREE.Float32BufferAttribute(lPos, 3));
        lGeo.setAttribute("uv", new THREE.Float32BufferAttribute(lUvs, 2));
        lGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(lSi, 4));
        lGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(lSw, 4));
        lGeo.setIndex(lIdx);
        lGeo.computeVertexNormals();
        const lm = createGarmentMesh(lGeo, fabricMat("trim", "front"), "trim", "front", skeleton);
        lm.userData.parentPart = "trousers";
        lm.userData.fitTier = "second-skin";
        garmentGroup.add(lm);
      });
    }
    void waistR;
  }

  /**
   * Builds a SINGLE continuous, Y-branched tailored trouser / shorts / brief
   * surface aligned with createSkeletonRig hip/knee/ankle pivots.
   */
  function buildTailoredTrousers(d, pm, skeleton) {
    const tSpec = pm.trousers;
    const briefCut = tSpec.briefCut || "full";
    const isExtendedBrief = tSpec.isBrief && (briefCut === "boxer" || briefCut === "trunk" || briefCut === "boyshort");
    const isLegging = !tSpec.isBrief && tSpec.fitTier === "second-skin";
    const isSlimTrouser = !tSpec.isBrief && tSpec.fitTier === "fitted";
    const isTightLeg = isExtendedBrief || isLegging;
    if (tSpec.isBrief && !isExtendedBrief) {
      buildTailoredBrief(d, pm, skeleton);
      return;
    }
    const { hipY, span, waistR, hipR, thighR, female, H } = d;
    const zScale = female ? 0.72 : 0.78;
    const waistY = hipY + span * 0.44;
    const hipPivotX = hipR * (female ? 0.45 : 0.47);
    const ankleY = Math.max(0.054, H * 0.047);
    const kneeY = ankleY + (hipY - span * 0.04 - ankleY) * 0.47;

    const crotchSplitY = hipY - span * (tSpec.isBrief ? 0.114 : 0.128);
    const legStartY = crotchSplitY - 0.010;
    const fullInseamSpan = Math.max(0.20, legStartY - (ankleY + 0.012));
    const briefRise = tSpec.briefRise || "mid";
    const legDrop = tSpec.isBrief
      ? fullInseamSpan * clamp(tSpec.briefLegDropFrac || (briefCut === "boxer" ? 0.25 : (briefCut === "boyshort" ? 0.12 : 0.16)), 0.10, 0.30)
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
      const legSteps = tSpec.isBrief ? 7 : 14;
      const outerPelvicReach = isTightLeg
        ? Math.max(thighR * 1.00 + 0.004, hipR * 1.012 + 0.0045 - Math.abs(legX))
        : (isSlimTrouser
          ? Math.max(thighR * 1.01 + 0.008, hipR * 1.028 + 0.009 - Math.abs(legX))
          : Math.max(thighR * 1.02 + 0.012, hipR * 1.045 + 0.016 - Math.abs(legX)));
      const innerPelvicReach = isTightLeg
        ? Math.min(Math.max(thighR * 0.74 + 0.003, Math.abs(legX) - 0.002), Math.abs(legX) - 0.0015)
        : Math.min(Math.max(thighR * 0.76 + 0.006, Math.abs(legX) - 0.002), Math.abs(legX) - 0.0015);

      let prev = null;
      for (let i = 0; i <= legSteps; i++) {
        const f = i / legSteps;
        const y = pantHemY * (1 - f) + legStartY * f;
        const legFracUp = clamp((y - ankleY) / Math.max(0.2, legStartY - ankleY), 0, 1);

        // Include gastrocnemius calf swell (legFracUp ~ 0.33, posterior reach ~0.88*thighR) & patella clearance
        const calfSwell = thighR * 0.25 * bumpWindow(legFracUp, 0.33, 0.22);
        const bodyLegR = isLegging
          ? (thighR * (0.45 + 0.56 * Math.pow(legFracUp, 0.82)) + calfSwell + 0.0038)
          : (thighR * ((isSlimTrouser ? 0.47 : 0.49) + 0.56 * Math.pow(legFracUp, 0.82)) + calfSwell + (isExtendedBrief ? 0.0038 : (isSlimTrouser ? 0.0085 : 0.016)));
        const cutR = isLegging
          ? bodyLegR
          : (thighR * (0.68 * tSpec.hemMult * (1 - legFracUp) + 1.08 * legFracUp) + (isExtendedBrief ? 0.0036 : (isSlimTrouser ? 0.0080 : 0.014)));
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
          const targetRz = (hipR * zScale + (isTightLeg ? 0.0045 : (isSlimTrouser ? 0.0095 : 0.017))) * (cosP >= 0 ? 0.95 : 1.05);

          const rx = baseR * 0.97 * (1 - topBlend) + targetRx * topBlend;
          let rz = baseR * 1.04 * (1 - topBlend) + targetRz * topBlend;

          if (!tSpec.isBrief && !isTightLeg && tSpec.hemMult >= 0.88) {
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

    const riseSpanMult = briefRise === "high" ? 0.38 : (briefRise === "low" ? 0.10 : 0.20);
    const waistTopY = tSpec.isBrief ? (hipY + span * riseSpanMult) : waistY;
    const briefTopRx = lerp(hipR, waistR, briefRise === "high" ? 0.86 : (briefRise === "low" ? 0.22 : 0.45));
    const pelvisSlices = tSpec.isBrief
      ? [
        [hipY - span * 0.075, hipR * 1.010 + 0.0042, hipR * 1.008 + 0.0042],
        [hipY, hipR * 1.014 + 0.0045, hipR * 1.012 + 0.0045],
        [waistTopY, briefTopRx * 1.006 + 0.0036, briefTopRx * 1.006 + 0.0036],
      ]
      : (isLegging
        ? [
          [hipY - span * 0.075, hipR * 1.010 + 0.0042, hipR * 1.008 + 0.0042],
          [hipY, hipR * 1.014 + 0.0045, hipR * 1.012 + 0.0045],
          [hipY + span * 0.18, (hipR * 0.72 + waistR * 0.30) + 0.0042, (hipR * 0.72 + waistR * 0.30) + 0.0042],
          [waistY - 0.032, (hipR * 0.18 + waistR * 0.84) + 0.0040, (hipR * 0.18 + waistR * 0.84) + 0.0040],
          [waistTopY, waistR * 1.008 + 0.0038, waistR * 1.008 + 0.0038],
        ]
        : (isSlimTrouser
          ? [
            [hipY - span * 0.075, hipR * 1.028 + 0.0090, hipR * 1.016 + 0.0090],
            [hipY, hipR * 1.035 + 0.0095, hipR * 1.028 + 0.0095],
            [hipY + span * 0.18, (hipR * 0.72 + waistR * 0.30) + 0.0090, (hipR * 0.72 + waistR * 0.30) + 0.0090],
            [waistY - 0.032, (hipR * 0.18 + waistR * 0.84) + 0.0085, (hipR * 0.18 + waistR * 0.84) + 0.0085],
            [waistTopY, waistR * 1.015 + 0.0085, waistR * 1.015 + 0.0085],
          ]
          : [
            [hipY - span * 0.075, hipR * 1.045 + 0.016, hipR * 1.025 + 0.017],
            [hipY, hipR * 1.055 + 0.017, hipR * 1.045 + 0.018],
            [hipY + span * 0.18, (hipR * 0.72 + waistR * 0.30) + 0.016, (hipR * 0.72 + waistR * 0.30) + 0.016],
            [waistY - 0.032, (hipR * 0.18 + waistR * 0.84) + 0.015, (hipR * 0.18 + waistR * 0.84) + 0.015],
            [waistTopY, waistR * 1.025 + 0.016, waistR * 1.025 + 0.016],
          ]));

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
      mesh.userData.fitTier = tSpec.isBrief ? "second-skin" : (tSpec.fitTier || "regular");
      return mesh;
    };

    garmentGroup.add(mkSubMesh(frontIdx, "front"), mkSubMesh(backIdx, "back"));

    // Distinct elastic waistband ring on briefs/boxers/trunks with waistband contrast
    if (tSpec.isBrief && (tSpec.waistbandColor || fabricState.trim)) {
      const ePos = [], eUvs = [], eSi = [], eSw = [], eIdx = [];
      const eBotY = waistTopY - span * 0.045;
      const eTopY = waistTopY + 0.002;
      const eRx = briefTopRx * 1.008 + 0.0052;
      for (let r = 0; r <= 2; r++) {
        const y = eBotY + (r / 2) * (eTopY - eBotY);
        for (let k = 0; k <= N; k++) {
          const phi = (2 * Math.PI * k) / N;
          const x = eRx * Math.sin(phi);
          const z = (eRx * zScale) * Math.cos(phi) + (female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d));
          ePos.push(x, y, z);
          eUvs.push(k / N, r / 2);
          const [bi, bw] = packSkinWeights([[BONE_IDX.pelvis, 0.72], [BONE_IDX.spine, 0.28]]);
          eSi.push(bi[0], bi[1], bi[2], bi[3]);
          eSw.push(bw[0], bw[1], bw[2], bw[3]);
        }
      }
      const stE = N + 1;
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < N; k++) {
          const a0 = r * stE + k, a1 = a0 + 1, b0 = (r + 1) * stE + k, b1 = b0 + 1;
          eIdx.push(a0, a1, b1, a0, b1, b0);
        }
      }
      const eGeo = new THREE.BufferGeometry();
      eGeo.setAttribute("position", new THREE.Float32BufferAttribute(ePos, 3));
      eGeo.setAttribute("uv", new THREE.Float32BufferAttribute(eUvs, 2));
      eGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(eSi, 4));
      eGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(eSw, 4));
      eGeo.setIndex(eIdx);
      eGeo.computeVertexNormals();
      const wbM = createGarmentMesh(eGeo, fabricMat("trim", "front"), "trim", "front", skeleton);
      wbM.userData.parentPart = "trousers";
      wbM.userData.fitTier = "second-skin";
      garmentGroup.add(wbM);
    }
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
    const handLen = d.H * (d.kid ? 0.108 : (d.female ? 0.104 : 0.107));
    const midHandDist = wristDist + handLen * 0.50;
    const handTipDist = wristDist + handLen;
    const wristY = pivotY - wristDist;
    const midHandY = pivotY - midHandDist;
    const handTipY = pivotY - handTipDist;
    const waistY = d.hipY + d.span * 0.44;
    const slStyle = pm?.sleeve?.style;
    const slExtra = isPartCurrentlyShown("sleeve") ? ((slStyle === "bishop" || slStyle === "bell" || slStyle === "puff") ? 0.026 : 0.016) : 0;
    const armBuffer = Math.max(d.upperR * 0.85, handLen * 0.17) + Math.max(0.032, 0.014 + slExtra);

    // Base clearance over bare/clothed hips
    let maxReqAngle = Math.asin(clamp((d.hipR * 1.06 + armBuffer - pivotX) / Math.max(0.22, wristDist), 0.08, 0.52));

    if (pm) {
      // Check visible skirt lateral width at elbow, forearm, wrist, palm, and fingertip heights
      if (isPartCurrentlyShown("skirt") && pm.skirt) {
        const sk = pm.skirt;
        const skHemY = clamp(waistY - cm(sk.lengthCm), 0.045, d.hipY - 0.08);
        for (const [sampleY, reachDist] of [
          [pivotY - d.armLen * 0.48, d.armLen * 0.48],
          [pivotY - d.armLen * 0.68, d.armLen * 0.68],
          [wristY, wristDist],
          [midHandY, midHandDist],
          [handTipY, handTipDist],
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

      // Check visible bodice / outer / tunic / robe lateral width across arm, wrist, palm & fingertip heights
      if (pm.bodice) {
        const bSpec = pm.bodice;
        const ol = bSpec.outerLayer;
        const hasOuter = isPartCurrentlyShown("outer") && Boolean(ol?.enabled);
        if (isPartCurrentlyShown("bodice") || hasOuter) {
          const shoulderTopY = d.shoulderY + d.span * (d.kid ? 0.052 : 0.042);
          const easeRatio = Math.max(1.0, bSpec.easeRatio || 1.0);
          const extraOuter = hasOuter ? 0.022 : 0.008;
          let outerHemY = Infinity;
          if (hasOuter) {
            if (ol.lengthStyle === "waist") outerHemY = waistY - 0.015;
            else if (ol.lengthStyle === "tunic") outerHemY = d.hipY - 0.16;
            else if (ol.lengthStyle === "dress" || ol.lengthStyle === "coat") outerHemY = Math.max(0.18, d.hipY - d.span * 1.08);
            else if (ol.lengthStyle === "robe") outerHemY = 0.06;
            else outerHemY = d.hipY + d.span * 0.04;
          }
          const bHemY = Math.min(outerHemY, clamp(shoulderTopY - cm(bSpec.lengthCm || 62), 0.05, waistY + 0.12));
          const flareTarget = Math.max(
            bSpec.hemFlare || 1.0,
            hasOuter && (ol.style === "pinafore" || ol.style === "bisht" || ol.lengthStyle === "coat" || ol.lengthStyle === "robe")
              ? Math.max(1.26, (bSpec.hemFlare || 1.0) + 0.06)
              : (hasOuter && ol.lengthStyle === "dress" ? 1.18 : 1.0)
          );
          const upperArmY = pivotY - d.armLen * 0.32;
          if (upperArmY >= bHemY - 0.02) {
            const rxUp = d.chestR * 0.90 * easeRatio + extraOuter;
            const reqUp = Math.asin(clamp((rxUp + d.upperR * 0.92 + 0.016 - pivotX) / Math.max(0.18, d.armLen * 0.32), 0.08, 0.26));
            if (reqUp > maxReqAngle) maxReqAngle = reqUp;
          }
          for (const [sampleY, reachDist] of [
            [pivotY - d.armLen * 0.50, d.armLen * 0.50],
            [pivotY - d.armLen * 0.68, d.armLen * 0.68],
            [wristY, wristDist],
            [midHandY, midHandDist],
            [handTipY, handTipDist],
          ]) {
            if (sampleY <= waistY + 0.18 && sampleY >= bHemY - 0.03) {
              const baseW = sampleY > waistY
                ? lerp(d.waistR * 1.02, d.chestR * 0.92, clamp((sampleY - waistY) / Math.max(0.08, d.shoulderY - waistY), 0, 1))
                : lerp(d.waistR * 1.02, d.hipR * 1.05, clamp((waistY - sampleY) / Math.max(0.08, waistY - d.hipY), 0, 1));
              const flare = (sampleY < waistY && flareTarget > 1.02)
                ? (1 + (flareTarget - 1) * Math.pow(clamp((waistY - sampleY) / Math.max(0.15, waistY - bHemY), 0, 1), 1.12))
                : 1.0;
              const rx = (baseW * easeRatio + extraOuter) * flare;
              const req = Math.asin(clamp((rx + armBuffer - pivotX) / Math.max(0.20, reachDist), 0.08, 0.56));
              if (req > maxReqAngle) maxReqAngle = req;
            }
          }
        }
      }

      // Check wide-leg / palazzo trousers
      if (isPartCurrentlyShown("trousers") && pm.trousers) {
        const rx = d.hipR * 1.07 + 0.020 + Math.max(0, pm.trousers.hemMult - 1.0) * d.thighR * 0.35;
        const req = Math.asin(clamp((rx + armBuffer - pivotX) / Math.max(0.22, wristDist), 0.08, 0.48));
        if (req > maxReqAngle) maxReqAngle = req;
      }
      if (isPartCurrentlyShown("sleeve")) maxReqAngle = Math.max(maxReqAngle, 0.155);
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

  function enforceBoneSculptedSurface(p, boneIdx, yMin, yMax, d, clearance, topFadeBand = 0) {
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
      const fade = topFadeBand > 0 ? (1 - smoothstep(yMax - topFadeBand, yMax, ly)) : 1.0;
      if (fade <= 1e-4) return;
      const sc = 1 + ((bodyR / Math.max(1e-4, curR)) - 1) * fade;
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

  // ---------- Exact 13-Segment Per-Bone Bind-Pose Mannequin Envelope (Zero Penetration) ----------
  const ENV_SEG_N = 13;
  const ENV_PHI_BINS = 72;
  const ENV_T_BINS = 48;
  const ENV_SH_XBINS = 48;
  const ENV_SH_ZBINS = 32;
  let _envMatTmp = null;
  let _envVecTmp = null;

  function computeExactBindEnvParams(d) {
    const crotchY = d.hipY - d.span * 0.145;
    const pelvisStartY = d.hipY - d.span * 0.088;
    const pivotY = d.shoulderY - d.span * 0.035;
    const pivotX = d.shoulderHalf * 0.82;
    const upperArmLen = d.armLen * 0.48;
    const forearmLen = d.armLen * 0.46;
    const handReach = d.H * (d.kid ? 0.108 : (d.female ? 0.104 : 0.107)) * 1.05;
    const hipPivotY = d.hipY - d.span * 0.04;
    const hipPivotX = d.hipR * (d.female ? 0.45 : 0.47);
    const ankleY = Math.max(0.054, d.H * 0.047);
    const thighStartY = hipPivotY + d.span * 0.055;
    const thighLen = Math.max(0.25, hipPivotY - ankleY) * 0.53;
    return {
      crotchY, pelvisStartY, pivotY, pivotX, upperArmLen, forearmLen, handReach,
      hipPivotY, hipPivotX, ankleY, thighStartY, thighLen,
      shCutY: d.shoulderY - d.span * 0.025,
      groinCutY: d.hipY - d.span * 0.085,
      shHalfSpan: d.shoulderHalf + d.upperR * 1.25,
      shMaxZ: d.chestR * (d.female ? 0.80 : 0.84) + d.upperR * 1.15,
    };
  }

  function ensureExactMannequinEnvelope(mannequin, d) {
    if (!mannequin?.bodyMesh?.geometry?.attributes?.position || !d) return null;
    const cacheHost = (mannequin.userData ||= {});
    if (cacheHost.exactEnvelope) return cacheHost.exactEnvelope;

    const geo = mannequin.bodyMesh.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const skinIdx = geo.attributes.skinIndex;
    const skinWgt = geo.attributes.skinWeight;
    if (!skinIdx || !skinWgt || !idx) return null;

    _envMatTmp ||= new THREE.Matrix4();
    _envVecTmp ||= new THREE.Vector3();
    const invs = mannequin.skeleton?.boneInverses;
    const bindOrigin = (bIdx, fb) => {
      if (!invs?.[bIdx]) return fb;
      _envMatTmp.copy(invs[bIdx]).invert();
      return [_envMatTmp.elements[12], _envMatTmp.elements[13], _envMatTmp.elements[14]];
    };
    const toBoneLocal = (bIdx, wx, wy, wz) => {
      if (!invs?.[bIdx]) return [0, 0, 0];
      _envVecTmp.set(wx, wy, wz).applyMatrix4(invs[bIdx]);
      return [_envVecTmp.x, _envVecTmp.y, _envVecTmp.z];
    };

    const p = computeExactBindEnvParams(d);
    const oPelv = bindOrigin(BONE_IDX.pelvis, [0, d.hipY, 0]);
    const oSpine = bindOrigin(BONE_IDX.spine, [0, d.hipY + d.span * 0.34, 0]);
    const oChest = bindOrigin(BONE_IDX.chest, [0, d.hipY + d.span * 0.62, 0]);
    const oNeck = bindOrigin(BONE_IDX.neck, [0, d.shoulderY, 0]);
    const oHead = bindOrigin(BONE_IDX.head, [0, d.neckTopY + d.headH * 0.50, 0]);

    const rawSegSpecs = [
      { bA: BONE_IDX.pelvis, a: [0, p.pelvisStartY, 0], bB: BONE_IDX.spine, b: [0, oSpine[1] + 0.025, 0], fBone: BONE_IDX.pelvis, bones: [0, 1], minW: 0.24 },
      { bA: BONE_IDX.spine, a: [0, oSpine[1] - 0.025, 0], bB: BONE_IDX.chest, b: [0, oChest[1] + 0.025, 0], fBone: BONE_IDX.spine, bones: [0, 1, 2], minW: 0.24 },
      { bA: BONE_IDX.chest, a: [0, oChest[1] - 0.025, 0], bB: BONE_IDX.neck, b: [0, oNeck[1] + 0.020, 0], fBone: BONE_IDX.chest, bones: [1, 2, 3], minW: 0.24 },
      { bA: BONE_IDX.neck, a: [0, oNeck[1] - 0.020, 0], bB: BONE_IDX.head, b: [0, oHead[1] + 0.015, 0], fBone: BONE_IDX.neck, bones: [3, 4], minW: 0.22 },
      { bA: BONE_IDX.head, a: [0, oHead[1] - 0.015, 0], bB: BONE_IDX.head, b: [0, d.H, 0], fBone: BONE_IDX.head, bones: [4], minW: 0.25 },
      { bA: BONE_IDX.armL, a: [p.pivotX, p.pivotY + d.upperR * 0.22, 0], bB: BONE_IDX.elbowL, b: [p.pivotX, p.pivotY - p.upperArmLen, 0], fBone: BONE_IDX.armL, bones: [5], minW: 0.12 },
      { bA: BONE_IDX.armR, a: [-p.pivotX, p.pivotY + d.upperR * 0.22, 0], bB: BONE_IDX.elbowR, b: [-p.pivotX, p.pivotY - p.upperArmLen, 0], fBone: BONE_IDX.armR, bones: [8], minW: 0.12 },
      { bA: BONE_IDX.elbowL, a: [p.pivotX, p.pivotY - p.upperArmLen, 0], bB: BONE_IDX.handL, b: [p.pivotX, p.pivotY - p.upperArmLen - p.forearmLen - p.handReach, 0], fBone: BONE_IDX.elbowL, bones: [6, 7], minW: 0.20 },
      { bA: BONE_IDX.elbowR, a: [-p.pivotX, p.pivotY - p.upperArmLen, 0], bB: BONE_IDX.handR, b: [-p.pivotX, p.pivotY - p.upperArmLen - p.forearmLen - p.handReach, 0], fBone: BONE_IDX.elbowR, bones: [9, 10], minW: 0.20 },
      { bA: BONE_IDX.legL, a: [p.hipPivotX, p.thighStartY, 0], bB: BONE_IDX.kneeL, b: [p.hipPivotX, p.hipPivotY - p.thighLen, 0], fBone: BONE_IDX.legL, bones: [11], minW: 0.16 },
      { bA: BONE_IDX.legR, a: [-p.hipPivotX, p.thighStartY, 0], bB: BONE_IDX.kneeR, b: [-p.hipPivotX, p.hipPivotY - p.thighLen, 0], fBone: BONE_IDX.legR, bones: [14], minW: 0.16 },
      { bA: BONE_IDX.kneeL, a: [p.hipPivotX, p.hipPivotY - p.thighLen, 0], bB: BONE_IDX.footL, b: [p.hipPivotX, 0.01, 0], fBone: BONE_IDX.kneeL, bones: [12, 13], minW: 0.20 },
      { bA: BONE_IDX.kneeR, a: [-p.hipPivotX, p.hipPivotY - p.thighLen, 0], bB: BONE_IDX.footR, b: [-p.hipPivotX, 0.01, 0], fBone: BONE_IDX.kneeR, bones: [15, 16], minW: 0.20 },
    ];
    void oPelv;
    const segDefs = rawSegSpecs.map((spec) => ({
      ...spec,
      aLoc: toBoneLocal(spec.bA, spec.a[0], spec.a[1], spec.a[2]),
      bLoc: toBoneLocal(spec.bB, spec.b[0], spec.b[1], spec.b[2]),
    }));

    const wFor = (v, bones) => {
      let sum = 0;
      const bi = [skinIdx.getX(v), skinIdx.getY(v), skinIdx.getZ(v), skinIdx.getW(v)];
      const bw = [skinWgt.getX(v), skinWgt.getY(v), skinWgt.getZ(v), skinWgt.getW(v)];
      for (let c = 0; c < 4; c++) if (bones.includes(bi[c])) sum += bw[c];
      return sum;
    };

    const raw = new Float32Array(ENV_SEG_N * ENV_T_BINS * ENV_PHI_BINS);
    const shTopRaw = new Float32Array(ENV_SH_XBINS * ENV_SH_ZBINS).fill(-1);
    const vertMask = new Uint16Array(pos.count);
    for (let v = 0; v < pos.count; v++) {
      let mask = 0;
      for (let s = 0; s < ENV_SEG_N; s++) {
        if (wFor(v, segDefs[s].bones) >= segDefs[s].minW) mask |= 1 << s;
      }
      vertMask[v] = mask;
    }

    const TWO_PI = Math.PI * 2;
    const splat = (s, px, py, pz) => {
      if (s === 0 && py < p.groinCutY && Math.abs(px) > p.hipPivotX * 0.78) return;
      if (s === 2 && Math.abs(px) > p.pivotX + d.upperR * 0.42) return;
      if (s === 3 && Math.hypot(px, pz) > d.neckR * 1.48) return;
      if ((s === 5 || s === 7) && px < p.pivotX - d.upperR * 1.18) return;
      if ((s === 6 || s === 8) && px > -(p.pivotX - d.upperR * 1.18)) return;
      if ((s === 9 || s === 11) && px < -0.008) return;
      if ((s === 10 || s === 12) && px > 0.008) return;
      const seg = segDefs[s];
      const abx = seg.b[0] - seg.a[0], aby = seg.b[1] - seg.a[1], abz = seg.b[2] - seg.a[2];
      const len2 = abx * abx + aby * aby + abz * abz || 1e-8;
      const t = ((px - seg.a[0]) * abx + (py - seg.a[1]) * aby + (pz - seg.a[2]) * abz) / len2;
      if (t < -0.025 || t > 1.025) return;
      const lx = px - (seg.a[0] + abx * t);
      const lz = pz - (seg.a[2] + abz * t);
      const r = Math.hypot(lx, lz);
      let uNorm = Math.atan2(lx, lz) / TWO_PI + 0.5;
      uNorm -= Math.floor(uNorm);
      const iu = Math.min(ENV_PHI_BINS - 1, Math.floor(uNorm * ENV_PHI_BINS));
      const iv = clamp(Math.floor(clamp(t, 0, 0.9999) * ENV_T_BINS), 0, ENV_T_BINS - 1);
      const cIdx = (s * ENV_T_BINS + iv) * ENV_PHI_BINS + iu;
      if (r > raw[cIdx]) raw[cIdx] = r;
    };

    const splatSh = (px, py, pz) => {
      if (py < p.shCutY - d.span * 0.03 || py > d.shoulderY + d.span * 0.14) return;
      if (Math.abs(px) > p.shHalfSpan || Math.abs(pz) > p.shMaxZ) return;
      const ix = clamp(Math.floor(((px + p.shHalfSpan) / (2 * p.shHalfSpan)) * ENV_SH_XBINS), 0, ENV_SH_XBINS - 1);
      const iz = clamp(Math.floor(((pz + p.shMaxZ) / (2 * p.shMaxZ)) * ENV_SH_ZBINS), 0, ENV_SH_ZBINS - 1);
      const idxSh = iz * ENV_SH_XBINS + ix;
      if (py > shTopRaw[idxSh]) shTopRaw[idxSh] = py;
    };

    const N_SUB = 6;
    for (let i = 0; i < idx.count; i += 3) {
      const i0 = idx.getX(i), i1 = idx.getX(i + 1), i2 = idx.getX(i + 2);
      const shared = vertMask[i0] | vertMask[i1] | vertMask[i2];
      if (!shared) continue;
      const x0 = pos.getX(i0), y0 = pos.getY(i0), z0 = pos.getZ(i0);
      const x1 = pos.getX(i1), y1 = pos.getY(i1), z1 = pos.getZ(i1);
      const x2 = pos.getX(i2), y2 = pos.getY(i2), z2 = pos.getZ(i2);
      const pts = [];
      for (let a = 0; a <= N_SUB; a++) {
        for (let b = 0; b <= N_SUB - a; b++) {
          const c = N_SUB - a - b;
          const wa = a / N_SUB, wb = b / N_SUB, wc = c / N_SUB;
          pts.push([wa * x0 + wb * x1 + wc * x2, wa * y0 + wb * y1 + wc * y2, wa * z0 + wb * z1 + wc * z2]);
        }
      }
      if ((wFor(i0, [2, 3, 5, 8]) + wFor(i1, [2, 3, 5, 8]) + wFor(i2, [2, 3, 5, 8])) >= 1.0) {
        for (const qpt of pts) splatSh(qpt[0], qpt[1], qpt[2]);
      }
      for (let s = 0; s < ENV_SEG_N; s++) {
        if (!(shared & (1 << s))) continue;
        const cnt = ((vertMask[i0] >> s) & 1) + ((vertMask[i1] >> s) & 1) + ((vertMask[i2] >> s) & 1);
        if (cnt < (s >= 5 ? 1 : 2)) continue;
        for (const qpt of pts) splat(s, qpt[0], qpt[1], qpt[2]);
      }
    }

    const filled = new Float32Array(raw);
    const chSeg = segDefs[2];
    const chShCutIv = clamp(Math.floor(((p.shCutY - chSeg.a[1]) / Math.max(0.05, chSeg.b[1] - chSeg.a[1])) * ENV_T_BINS), 0, ENV_T_BINS - 1);
    const snap = new Float32Array(filled.length);
    for (let s = 0; s < ENV_SEG_N; s++) {
      const segBase = s * ENV_T_BINS * ENV_PHI_BINS;
      for (let iv = 0; iv < ENV_T_BINS; iv++) {
        const rowOff = segBase + iv * ENV_PHI_BINS;
        let rowMax = 0;
        for (let iu = 0; iu < ENV_PHI_BINS; iu++) if (filled[rowOff + iu] > rowMax) rowMax = filled[rowOff + iu];
        if (rowMax <= 0) continue;
        for (let pass = 0; pass < 6; pass++) {
          for (let iu = 0; iu < ENV_PHI_BINS; iu++) {
            if (filled[rowOff + iu] <= 0) {
              const prev = filled[rowOff + ((iu + ENV_PHI_BINS - 1) % ENV_PHI_BINS)];
              const next = filled[rowOff + ((iu + 1) % ENV_PHI_BINS)];
              filled[rowOff + iu] = (prev > 0 && next > 0) ? 0.5 * (prev + next) : Math.max(prev, next);
            }
          }
        }
      }
      for (let pass = 0; pass < 6; pass++) {
        snap.set(filled.subarray(segBase, segBase + ENV_T_BINS * ENV_PHI_BINS), segBase);
        for (let iv = 0; iv < ENV_T_BINS; iv++) {
          if (s === 2 && iv >= chShCutIv) continue;
          const rowOff = segBase + iv * ENV_PHI_BINS;
          for (let iu = 0; iu < ENV_PHI_BINS; iu++) {
            if (snap[rowOff + iu] <= 0) {
              const below = iv > 0 ? snap[segBase + (iv - 1) * ENV_PHI_BINS + iu] : 0;
              const above = iv + 1 < ENV_T_BINS ? snap[segBase + (iv + 1) * ENV_PHI_BINS + iu] : 0;
              filled[rowOff + iu] = Math.max(below, above);
            }
          }
        }
      }
    }

    const dilated = new Float32Array(filled.length);
    for (let s = 0; s < ENV_SEG_N; s++) {
      const segBase = s * ENV_T_BINS * ENV_PHI_BINS;
      for (let iv = 0; iv < ENV_T_BINS; iv++) {
        for (let iu = 0; iu < ENV_PHI_BINS; iu++) {
          let best = 0;
          for (let du = -1; du <= 1; du++) {
            const val = filled[segBase + iv * ENV_PHI_BINS + ((iu + du + ENV_PHI_BINS) % ENV_PHI_BINS)];
            if (val > best) best = val;
          }
          const dvs = (s === 2 && iv >= chShCutIv) ? [1] : ((s === 5 || s === 6) && iv <= 5) ? [-1] : [-1, 1];
          for (const dv of dvs) {
            const nv = clamp(iv + dv, 0, ENV_T_BINS - 1);
            const rOff = segBase + nv * ENV_PHI_BINS;
            for (let du = -1; du <= 1; du++) {
              const val = filled[rOff + ((iu + du + ENV_PHI_BINS) % ENV_PHI_BINS)];
              if (val > best) best = val;
            }
          }
          dilated[segBase + iv * ENV_PHI_BINS + iu] = best;
        }
      }
    }

    const shTop = new Float32Array(shTopRaw.length);
    for (let iz = 0; iz < ENV_SH_ZBINS; iz++) {
      for (let ix = 0; ix < ENV_SH_XBINS; ix++) {
        let best = shTopRaw[iz * ENV_SH_XBINS + ix];
        for (let dz = -1; dz <= 1; dz++) {
          const z2 = iz + dz;
          if (z2 < 0 || z2 >= ENV_SH_ZBINS) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const x2 = ix + dx;
            if (x2 < 0 || x2 >= ENV_SH_XBINS) continue;
            const v = shTopRaw[z2 * ENV_SH_XBINS + x2];
            if (v > best) best = v;
          }
        }
        shTop[iz * ENV_SH_XBINS + ix] = best;
      }
    }

    const env = { p, segDefs, grid: dilated, skinGrid: filled, shTop };
    mannequin.userData.exactEnvelope = env;
    return env;
  }

  function extractPosedMannequinEnvFrames(env, bones, d) {
    if (!env || !bones || bones.length < 17) return null;
    void d;
    const makeFrame = (bone, a, b) => {
      const m = new THREE.Matrix4().multiplyMatrices(_tmpRootInv, bone.matrixWorld);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
      const len = Math.hypot(ax, ay, az);
      if (len > 1e-6) {
        const ux = ax / len, uy = ay / len, uz = az / len;
        const dr = right.x * ux + right.y * uy + right.z * uz;
        right.set(right.x - ux * dr, right.y - uy * dr, right.z - uz * dr);
        if (right.lengthSq() > 1e-8) right.normalize();
        const df = fwd.x * ux + fwd.y * uy + fwd.z * uz;
        fwd.set(fwd.x - ux * df, fwd.y - uy * df, fwd.z - uz * df);
        const dp = fwd.x * right.x + fwd.y * right.y + fwd.z * right.z;
        fwd.set(fwd.x - right.x * dp, fwd.y - right.y * dp, fwd.z - right.z * dp);
        if (fwd.lengthSq() > 1e-8) fwd.normalize();
      }
      return { a, b, right: [right.x, right.y, right.z], fwd: [fwd.x, fwd.y, fwd.z] };
    };

    return env.segDefs.map((seg) => {
      const a = getRootBonePoint(bones[seg.bA], seg.aLoc[0], seg.aLoc[1], seg.aLoc[2]);
      const b = getRootBonePoint(bones[seg.bB], seg.bLoc[0], seg.bLoc[1], seg.bLoc[2]);
      return makeFrame(bones[seg.fBone], a, b);
    });
  }

  function projectOutsideExactMannequinEnvelope(pt, env, frames, d, margin = 0.0065, opts = {}) {
    if (!env || !frames) return;
    const TWO_PI = Math.PI * 2;
    const segs = opts.segments || [9, 10, 11, 12, 5, 6, 7, 8, 0, 1, 2, 3, 4];
    const bindMode = Boolean(opts.bindMode);
    const passes = env.skinGrid ? 4 : 2;
    const tightMargin = Math.min(margin, 0.0024);

    for (let pass = 0; pass < passes; pass++) {
      const isSkinPass = pass > 0 && Boolean(env.skinGrid);
      const grid = isSkinPass ? env.skinGrid : env.grid;
      const curMargin = isSkinPass ? tightMargin : margin;
      let pushedPosX = false;
      let pushedNegX = false;

      for (const s of segs) {
        const f = frames[s];
        if (!f) continue;
        const abx = f.b[0] - f.a[0], aby = f.b[1] - f.a[1], abz = f.b[2] - f.a[2];
        const len2 = Math.max(abx * abx + aby * aby + abz * abz, 1e-8);
        const t = ((pt.x - f.a[0]) * abx + (pt.y - f.a[1]) * aby + (pt.z - f.a[2]) * abz) / len2;
        if (t <= -0.02 || t >= 1.02) continue;
        const tC = clamp(t, 0, 0.9999);
        const cx = f.a[0] + abx * tC, cy = f.a[1] + aby * tC, cz = f.a[2] + abz * tC;
        const rx = pt.x - cx, ry = pt.y - cy, rz = pt.z - cz;
        const lx = rx * f.right[0] + ry * f.right[1] + rz * f.right[2];
        const lz = rx * f.fwd[0] + ry * f.fwd[1] + rz * f.fwd[2];
        const dist = Math.hypot(lx, lz);

        let uNorm = Math.atan2(lx, lz) / TWO_PI + 0.5;
        uNorm -= Math.floor(uNorm);
        const uS = uNorm * ENV_PHI_BINS;
        const iu = Math.min(ENV_PHI_BINS - 1, Math.floor(uS)), fu = uS - iu, iu1 = (iu + 1) % ENV_PHI_BINS;
        const vS = tC * ENV_T_BINS;
        const iv = Math.min(ENV_T_BINS - 1, Math.floor(vS)), fv = vS - iv, iv1 = Math.min(ENV_T_BINS - 1, iv + 1);

        const segBase = s * ENV_T_BINS * ENV_PHI_BINS;
        const r00 = grid[segBase + iv * ENV_PHI_BINS + iu];
        const r10 = grid[segBase + iv * ENV_PHI_BINS + iu1];
        const r01 = grid[segBase + iv1 * ENV_PHI_BINS + iu];
        const r11 = grid[segBase + iv1 * ENV_PHI_BINS + iu1];
        const bilinear = (r00 * (1 - fu) + r10 * fu) * (1 - fv) + (r01 * (1 - fu) + r11 * fu) * fv;
        const maxCorner = Math.max(r00, r10, r01, r11);
        const rawR = Math.max(bilinear, maxCorner);
        if (rawR <= 0.005) continue;
        const targetR = rawR + curMargin;
        if (dist < targetR) {
          const safeDist = Math.max(dist, 1e-5);
          const nlx = dist > 1e-5 ? (lx * targetR) / safeDist : 0;
          const nlz = dist > 1e-5 ? (lz * targetR) / safeDist : targetR;
          const dlx = nlx - lx, dlz = nlz - lz;
          let dx = dlx * f.right[0] + dlz * f.fwd[0];
          const dy = dlx * f.right[1] + dlz * f.fwd[1];
          const dz = dlx * f.right[2] + dlz * f.fwd[2];
          const strideSepZ = (!bindMode && frames[9] && frames[10]) ? Math.abs(frames[9].b[2] - frames[10].b[2]) : 0;
          const xMidLimit = strideSepZ > 0.015 ? 0.0045 : 0.0005;
          if ((s === 9 || s === 11) && pt.x + dx < -xMidLimit) dx = Math.max(0, -xMidLimit - pt.x);
          if ((s === 10 || s === 12) && pt.x + dx > xMidLimit) dx = Math.min(0, xMidLimit - pt.x);
          if (dx > 1e-4) pushedPosX = true;
          else if (dx < -1e-4) pushedNegX = true;
          pt.x += dx;
          pt.y += dy;
          pt.z += dz;
        }
      }

      // If two adjacent cylinders (e.g., arm + chest in high axilla or thigh + thigh in groin) pinch X,
      // step Z gently toward the open anterior/posterior cleft valley so Passes 1..3 clear both cleanly.
      if (isSkinPass && pushedPosX && pushedNegX && !bindMode) {
        pt.z += (Math.abs(pt.z) > 1e-4 ? Math.sign(pt.z) : 1) * (opts.isSleeve ? 0.016 : 0.011);
      }

      // Upward clavicle/trapezius/deltoid shoulder heightfield protection (in chest bone frame)
      if ((pass === 0 || pass === 2) && !opts.skipShoulderTop && _dynInvMats) {
        const m = _dynMats[BONE_IDX.chest];
        const invM = _dynInvMats[BONE_IDX.chest];
        const ie = invM.elements;
        const lx = ie[0] * pt.x + ie[4] * pt.y + ie[8] * pt.z + ie[12];
        const ly = ie[1] * pt.x + ie[5] * pt.y + ie[9] * pt.z + ie[13];
        const lz = ie[2] * pt.x + ie[6] * pt.y + ie[10] * pt.z + ie[14];
        const ep = env.p;
        const shDepthBand = Math.min(0.026, d.upperR * 0.62);
        const shCrestMaxZ = Math.min(ep.shMaxZ, Math.max(d.upperR * 0.78, ep.shMaxZ * 0.56));
        if (Math.abs(lx) <= ep.shHalfSpan && Math.abs(lz) <= shCrestMaxZ && ly >= ep.shCutY - d.span * 0.03 && ly <= d.shoulderY + d.span * 0.14) {
          const topY = sampleShoulderTopY(env, lx, lz);
          if (topY > 0 && ly < topY + curMargin && ly > topY - shDepthBand) {
            const zBlend = 1 - smoothstep(shCrestMaxZ * 0.42, shCrestMaxZ, Math.abs(lz));
            const yFade = smoothstep(topY - shDepthBand, topY - shDepthBand * 0.25, ly);
            const need = (topY + curMargin) - ly;
            const nextLy = ly + need * zBlend * yFade;
            const nextLz = lz + (Math.abs(lz) > 1e-4 ? Math.sign(lz) : 1) * need * (1 - zBlend) * 0.65 * yFade;
            const fe = m.elements;
            pt.x = fe[0] * lx + fe[4] * nextLy + fe[8] * nextLz + fe[12];
            pt.y = fe[1] * lx + fe[5] * nextLy + fe[9] * nextLz + fe[13];
            pt.z = fe[2] * lx + fe[6] * nextLy + fe[10] * nextLz + fe[14];
          }
        }
      }
    }
  }

  function resolveLayerEnvelopeMargin(mesh, baseFitTier = "regular") {
    const part = mesh?.name;
    const ud = mesh?.userData || {};
    const isStitch = Boolean(ud.isStitch);
    const isLapel = Boolean(ud.isLapel);
    const isOuter = part === "outer" || ud.parentPart === "outer" || Boolean(ud.isOuterLayer);
    const isUnderOuter = Boolean(ud.isUnderOuter);
    const isCollar = ud.garmentType === "collar" || (!isLapel && (part === "trim" || ud.parentPart === "trim"));
    const isBra = ud.garmentType === "bra";
    let base;
    if (isLapel) base = isOuter ? 0.0195 : 0.0120;
    else if (isCollar) base = isOuter ? 0.0115 : (baseFitTier === "second-skin" ? 0.0036 : 0.0046);
    else if (isOuter) base = 0.0155;
    else if (isUnderOuter) base = 0.0034;
    else if (isBra) base = 0.0060;
    else if (baseFitTier === "second-skin") base = 0.0034;
    else if (baseFitTier === "fitted") base = 0.0048;
    else base = 0.0068;
    return isStitch ? base + 0.0018 : base;
  }

  function sampleShoulderTopY(env, lx, lz) {
    const ep = env?.p;
    if (!ep || !env.shTop) return -1;
    if (Math.abs(lx) > ep.shHalfSpan || Math.abs(lz) > ep.shMaxZ) return -1;
    const fx = clamp(((lx + ep.shHalfSpan) / (2 * ep.shHalfSpan)) * ENV_SH_XBINS - 0.5, 0, ENV_SH_XBINS - 1);
    const fz = clamp(((lz + ep.shMaxZ) / (2 * ep.shMaxZ)) * ENV_SH_ZBINS - 0.5, 0, ENV_SH_ZBINS - 1);
    const ix0 = Math.floor(fx), ix1 = Math.min(ENV_SH_XBINS - 1, ix0 + 1), tx = fx - ix0;
    const iz0 = Math.floor(fz), iz1 = Math.min(ENV_SH_ZBINS - 1, iz0 + 1), tz = fz - iz0;
    const c00 = env.shTop[iz0 * ENV_SH_XBINS + ix0];
    const c10 = env.shTop[iz0 * ENV_SH_XBINS + ix1];
    const c01 = env.shTop[iz1 * ENV_SH_XBINS + ix0];
    const c11 = env.shTop[iz1 * ENV_SH_XBINS + ix1];
    const w00 = c00 > 0 ? (1 - tx) * (1 - tz) : 0;
    const w10 = c10 > 0 ? tx * (1 - tz) : 0;
    const w01 = c01 > 0 ? (1 - tx) * tz : 0;
    const w11 = c11 > 0 ? tx * tz : 0;
    const wSum = w00 + w10 + w01 + w11;
    return wSum > 1e-5 ? ((c00 * w00 + c10 * w10 + c01 * w01 + c11 * w11) / wSum) : -1;
  }

  function projectBraStrapRibbon(posArr, count, env, frames, d, margin = 0.0056, useBindFrame = false) {
    if (!env || !frames || count < 4 || count % 2 !== 0) return;
    const TWO_PI = Math.PI * 2;
    const useMats = !useBindFrame && _dynInvMats && _dynMats;
    const ie = useMats ? _dynInvMats[BONE_IDX.chest].elements : null;
    const fe = useMats ? _dynMats[BONE_IDX.chest].elements : null;

    const lxArr = new Float32Array(count);
    const lyArr = new Float32Array(count);
    const lzArr = new Float32Array(count);
    for (let v = 0; v < count; v++) {
      const v3 = v * 3;
      const x = posArr[v3], y = posArr[v3 + 1], z = posArr[v3 + 2];
      if (ie) {
        lxArr[v] = ie[0] * x + ie[4] * y + ie[8] * z + ie[12];
        lyArr[v] = ie[1] * x + ie[5] * y + ie[9] * z + ie[13];
        lzArr[v] = ie[2] * x + ie[6] * y + ie[10] * z + ie[14];
      } else {
        lxArr[v] = x; lyArr[v] = y; lzArr[v] = z;
      }
    }

    const sampleMaxTorsoR = (px, py, pz) => {
      let maxR = 0;
      for (let pass = 0; pass < 2; pass++) {
        const isSkinPass = pass > 0 && Boolean(env.skinGrid);
        if (pass > 0 && !isSkinPass) break;
        const grid = isSkinPass ? env.skinGrid : env.grid;
        const curMargin = isSkinPass ? Math.min(margin, 0.0024) : margin;
        for (const s of [2, 1]) {
          const seg = env.segDefs[s];
          if (!seg) continue;
          const abx = seg.b[0] - seg.a[0], aby = seg.b[1] - seg.a[1], abz = seg.b[2] - seg.a[2];
          const len2 = Math.max(abx * abx + aby * aby + abz * abz, 1e-8);
          const t = ((px - seg.a[0]) * abx + (py - seg.a[1]) * aby + (pz - seg.a[2]) * abz) / len2;
          if (t <= -0.02 || t >= 1.02) continue;
          const tC = clamp(t, 0, 0.9999);
          const cx = seg.a[0] + abx * tC, cz = seg.a[2] + abz * tC;
          const dx = px - cx, dz = pz - cz;
          let uNorm = Math.atan2(dx, dz) / TWO_PI + 0.5;
          uNorm -= Math.floor(uNorm);
          const uS = uNorm * ENV_PHI_BINS;
          const iu = Math.min(ENV_PHI_BINS - 1, Math.floor(uS)), fu = uS - iu, iu1 = (iu + 1) % ENV_PHI_BINS;
          const vS = tC * ENV_T_BINS;
          const iv = Math.min(ENV_T_BINS - 1, Math.floor(vS)), fv = vS - iv, iv1 = Math.min(ENV_T_BINS - 1, iv + 1);
          const segBase = s * ENV_T_BINS * ENV_PHI_BINS;
          const r00 = grid[segBase + iv * ENV_PHI_BINS + iu];
          const r10 = grid[segBase + iv * ENV_PHI_BINS + iu1];
          const r01 = grid[segBase + iv1 * ENV_PHI_BINS + iu];
          const r11 = grid[segBase + iv1 * ENV_PHI_BINS + iu1];
          const bilinear = (r00 * (1 - fu) + r10 * fu) * (1 - fv) + (r01 * (1 - fu) + r11 * fu) * fv;
          const rawR = Math.max(bilinear, r00, r10, r01, r11);
          if (rawR > 0.005) {
            const targetR = rawR + curMargin;
            if (targetR > maxR) maxR = targetR;
          }
        }
      }
      return maxR;
    };

    const nSeg = count / 2;
    const clampAllVerts = () => {
      for (let v = 0; v < count; v++) {
        const tS = Math.floor(v / 2) / Math.max(1, nSeg - 1);
        const lx = lxArr[v];
        let ly = lyArr[v];
        let lz = lzArr[v];
        const topY = sampleShoulderTopY(env, lx, lz);
        if (topY > 0 && (ly >= env.p.shCutY - d.span * 0.025 || (tS >= 0.22 && tS <= 0.78))) {
          if (ly < topY + margin) ly = topY + margin;
        }
        if (ly < env.p.shCutY + d.span * 0.008) {
          const signZ = lz >= 0 ? 1 : -1;
          for (let zIter = 0; zIter < 2; zIter++) {
            const maxR = sampleMaxTorsoR(lx, ly, lz);
            if (maxR > 0.005 && Math.hypot(lx, lz) < maxR) {
              const reqZ = Math.sqrt(Math.max(0, maxR * maxR - lx * lx));
              lz = signZ * Math.max(Math.abs(lz), reqZ);
            }
          }
        }
        lyArr[v] = ly;
        lzArr[v] = lz;
      }
    };

    clampAllVerts();
    const tmpY = new Float32Array(count);
    const tmpZ = new Float32Array(count);
    for (let pass = 0; pass < 2; pass++) {
      tmpY.set(lyArr);
      tmpZ.set(lzArr);
      for (let i = 1; i < nSeg - 1; i++) {
        for (let e = 0; e < 2; e++) {
          const v = i * 2 + e;
          const prev = (i - 1) * 2 + e;
          const next = (i + 1) * 2 + e;
          tmpY[v] = lyArr[v] + (0.5 * (lyArr[prev] + lyArr[next]) - lyArr[v]) * 0.38;
          tmpZ[v] = lzArr[v] + (0.5 * (lzArr[prev] + lzArr[next]) - lzArr[v]) * 0.38;
        }
      }
      lyArr.set(tmpY);
      lzArr.set(tmpZ);
    }
    clampAllVerts();

    for (let v = 0; v < count; v++) {
      const v3 = v * 3;
      const lx = lxArr[v], ly = lyArr[v], lz = lzArr[v];
      if (fe) {
        posArr[v3] = fe[0] * lx + fe[4] * ly + fe[8] * lz + fe[12];
        posArr[v3 + 1] = fe[1] * lx + fe[5] * ly + fe[9] * lz + fe[13];
        posArr[v3 + 2] = fe[2] * lx + fe[6] * ly + fe[10] * lz + fe[14];
      } else {
        posArr[v3] = lx; posArr[v3 + 1] = ly; posArr[v3 + 2] = lz;
      }
    }
  }

  /**
   * Evaluates CPU linear-blend skinning, fabric-aware secondary drape waves,
   * strict posed anatomical body-capsule push-out (zero skin poke-through),
   * exact 9-segment humanBody surface clearance, circumferential skirt drape
   * tenting + side-seam welding, and bidirectional arm-outside-garment separation.
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

    const exactEnv = ensureExactMannequinEnvelope(activeMannequin, d);
    const exactFrames = exactEnv ? extractPosedMannequinEnvFrames(exactEnv, bones, d) : null;

    // Extract posed anatomical capsule endpoints in root space
    const [pelvX, , pelvZ] = getRootBonePoint(bones[BONE_IDX.pelvis], 0, 0, 0);
    const [hipLX, hipLY, hipLZ] = getRootBonePoint(bones[BONE_IDX.legL], 0, 0, 0);
    const [kneeLX, kneeLY, kneeLZ] = getRootBonePoint(bones[BONE_IDX.kneeL], 0, 0, 0);
    const [ankLX, ankLY, ankLZ] = getRootBonePoint(bones[BONE_IDX.footL], 0, 0, 0);
    const footLen = clamp(d.H * (d.kid ? 0.148 : (d.female ? 0.142 : 0.150)), 0.14, 0.29);
    const [toeLX, toeLY, toeLZ] = getRootBonePoint(bones[BONE_IDX.footL], 0, -d.H * 0.025, footLen * 0.56);

    const [hipRX, hipRY, hipRZ] = getRootBonePoint(bones[BONE_IDX.legR], 0, 0, 0);
    const [kneeRX, kneeRY, kneeRZ] = getRootBonePoint(bones[BONE_IDX.kneeR], 0, 0, 0);
    const [ankRX, ankRY, ankRZ] = getRootBonePoint(bones[BONE_IDX.footR], 0, 0, 0);
    const [toeRX, toeRY, toeRZ] = getRootBonePoint(bones[BONE_IDX.footR], 0, -d.H * 0.025, footLen * 0.56);

    const handLen = d.H * (d.kid ? 0.108 : (d.female ? 0.104 : 0.107));
    const wristBroadR = Math.max(d.upperR * 0.44, handLen * (d.female ? 0.212 : 0.224) * 0.70);
    const wristR = Math.max(d.upperR * (d.female ? 0.50 : 0.53), wristBroadR * 1.06, d.H * 0.0148);
    const handTipOffset = handLen;
    const [shoLX, shoLY, shoLZ] = getRootBonePoint(bones[BONE_IDX.armL], 0, 0, 0);
    const [elbLX, elbLY, elbLZ] = getRootBonePoint(bones[BONE_IDX.elbowL], 0, 0, 0);
    const [wriLX, wriLY, wriLZ] = getRootBonePoint(bones[BONE_IDX.handL], 0, 0, 0);
    const [tipLX, tipLY, tipLZ] = getRootBonePoint(bones[BONE_IDX.handL], 0, -handTipOffset, 0);

    const [shoRX, shoRY, shoRZ] = getRootBonePoint(bones[BONE_IDX.armR], 0, 0, 0);
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
      tulle: 1.44, chiffon: 1.38, silk: 1.25, lace: 1.18, satin: 1.15, linen: 1.0,
      jersey: 0.96, cotton: 0.92, scuba: 0.88, velvet: 0.85, wool: 0.72, denim: 0.62, leather: 0.50,
    };
    const matKey = fabricState.bodice?.front?.material || "cotton";
    const fluidity = FLUIDITY_MAP[matKey] || 0.95;

    const p = { x: 0, y: 0, z: 0 };
    const calfSwellFn = (u) => d.thighR * 0.28 * bumpWindow(u, 0.31, 0.28);
    const forearmSwellFn = (u) => (u < 0.32 ? d.upperR * 0.04 * Math.sin((Math.PI * u) / 0.32) : 0);

    // Push any lower-body garment vertex away from outer bare/clothed forearms & hands so arms never enter skirts/bodices
    const guardArmOutsideGarment = (pt, restY) => {
      if (restY > underarmY - 0.04) return;
      const armGuardL = [elbLX, elbLY, elbLZ, tipLX, tipLY, tipLZ];
      const armGuardR = [elbRX, elbRY, elbRZ, tipRX, tipRY, tipRZ];
      const guardR = Math.max(d.upperR * 0.84, handLen * 0.14) + 0.026;
      for (const [ax, ay, az, bx, by, bz] of [armGuardL, armGuardR]) {
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const lenSq = abx * abx + aby * aby + abz * abz;
        const u = lenSq > 1e-8 ? clamp(((pt.x - ax) * abx + (pt.y - ay) * aby + (pt.z - az) * abz) / lenSq, 0, 1) : 0;
        const cx = ax + abx * u, cy = ay + aby * u, cz = az + abz * u;
        const dx = pt.x - cx, dy = pt.y - cy, dz = pt.z - cz;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < guardR * guardR) {
          // Gently press flared skirt/robe inward toward body axis away from the arm, never pushing inside hip radius
          const toCenterX = pelvX - cx;
          const toCenterZ = pelvZ - cz;
          const tcLen = Math.hypot(toCenterX, toCenterZ) || 1;
          const pen = guardR - Math.sqrt(dSq);
          const nextX = pt.x + (toCenterX / tcLen) * pen;
          const minHipX = d.hipR * 1.08;
          pt.x = Math.abs(nextX) < minHipX ? Math.sign(pt.x || toCenterX || 1) * minHipX : nextX;
          pt.z += (toCenterZ / tcLen) * pen * 0.5;
        }
      }
    };

    const collideTorsoAndLegs = (pt, restY, isTrousers, fitTier = "regular", extraMargin = 0) => {
      const margin = Math.max(0.0028, (fitTier === "second-skin" ? 0.0036 : (fitTier === "fitted" ? 0.0062 : 0.0105)) + extraMargin);
      const chestM = Math.max(0.0028, (fitTier === "second-skin" ? 0.0034 : (fitTier === "fitted" ? 0.0060 : 0.0105)) + extraMargin);
      const spineM = Math.max(0.0028, (fitTier === "second-skin" ? 0.0032 : (fitTier === "fitted" ? 0.0056 : 0.0095)) + extraMargin);
      const pelvM = Math.max(0.0028, (fitTier === "second-skin" ? 0.0034 : (fitTier === "fitted" ? 0.0060 : 0.010)) + extraMargin);
      // 1. Sculpted chest / bust / ribcage & pelvis / glutes / iliac crest in live bone frames
      if (restY >= d.hipY + d.span * 0.20 && restY <= d.shoulderY - d.span * 0.012) {
        enforceBoneSculptedSurface(pt, BONE_IDX.chest, d.hipY + d.span * 0.24, d.shoulderY - d.span * 0.012, d, chestM, d.span * 0.11);
      }
      if (restY >= d.hipY - d.span * 0.14 && restY <= waistY + d.span * 0.22) {
        enforceBoneSculptedSurface(pt, BONE_IDX.spine, d.hipY + d.span * 0.05, waistY + d.span * 0.20, d, spineM);
      }
      if (restY <= waistY + 0.05 && restY >= d.hipY - d.span * 0.095) {
        enforceBoneSculptedSurface(pt, BONE_IDX.pelvis, d.hipY - d.span * 0.085, waistY + 0.03, d, pelvM);
      }

      // 2. Posed Left & Right Thighs, Knees, Calves & Feet
      if (restY <= d.hipY + 0.04) {
        const medTop = isTrousers ? Math.min(Math.max(d.thighR * 0.66, hipPivotMag - 0.013), hipPivotMag - 0.005) : d.thighR * 0.85;
        const latTop = d.thighR * 1.04 + margin;
        const zTop = d.thighR * 1.11 + margin;
        const kneeRad = d.thighR * 0.72 + margin;
        const ankRad = d.thighR * 0.50 + margin;

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
      const isStitch = Boolean(mesh.userData.isStitch);
      const isLapel = Boolean(mesh.userData.isLapel);
      const isOuter = part === "outer" || mesh.userData.parentPart === "outer" || Boolean(mesh.userData.isOuterLayer);
      const isUnderOuter = Boolean(mesh.userData.isUnderOuter);
      const isTrousers = part === "trousers" || mesh.userData.parentPart === "trousers";
      const isSkirt = part === "skirt" || mesh.userData.parentPart === "skirt";
      const isSleeve = part === "sleeve" || mesh.userData.parentPart === "sleeve";
      const isBodice = part === "bodice" || part === "outer" || mesh.userData.parentPart === "bodice" || mesh.userData.parentPart === "outer";
      const isCollar = mesh.userData.garmentType === "collar" || (!isLapel && (part === "trim" || mesh.userData.parentPart === "trim"));
      const isBra = mesh.userData.garmentType === "bra";
      const isBraStrap = Boolean(mesh.userData.isBraStrap);
      const fitTier = mesh.userData.fitTier || (isBra ? "second-skin" : "regular");
      const isTight = fitTier === "second-skin";
      const isFittedTier = fitTier === "fitted";
      const flutterMult = isStitch ? 0.0 : (isTight ? 0.0 : (isFittedTier ? 0.22 : 1.0));
      const dynEnvMargin = resolveLayerEnvelopeMargin(mesh, fitTier);
      const extraTorsoMargin = isOuter ? 0.0075 : (isUnderOuter ? -0.0032 : 0);

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
        if (!reduceMotion && !isCollar && flutterMult > 0) {
          if (isSkirt && meta) {
            const drop = clamp((meta.topY - ry) / Math.max(0.14, meta.topY - meta.hemY), 0, 1);
            const wDrop = Math.pow(drop, 1.45) * fluidity * flutterMult;
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
            const wDrop = Math.pow(drop, 1.4) * fluidity * flutterMult * (meta.style === "robe" || meta.style === "tunic" ? 1.0 : 0.35);
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
              p.z += Math.pow(dy, 1.3) * fluidity * flutterMult * looseMult * 0.0055 * Math.cos(phase) * sSign;
            }
          }
        }

        // Strict Anatomical Collision Resolution + Exact Bind-Derived Envelope Guard
        if (isSleeve) {
          const slRow = meta ? Math.floor(i / meta.cols) : 4;
          const armPushFade = isStitch ? 1.0 : smoothstep(0, 2.5, slRow);
          const preX = p.x, preY = p.y;
          const sSide = mesh.userData.armSide || (rx >= 0 ? 1 : -1);
          const margin = isTight ? 0.0038 : (isFittedTier ? 0.0058 : 0.0095);
          const shMargin = isTight ? 0.0036 : (isFittedTier ? 0.0052 : 0.0072);
          const shScale = isTight ? 1.06 : 1.08;
          if (sSide > 0) {
            const shLX = shoLX + (elbLX - shoLX) * 0.06, shLY = shoLY + (elbLY - shoLY) * 0.06, shLZ = shoLZ + (elbLZ - shoLZ) * 0.06;
            pushPointOutOfCapsule(p, shLX, shLY, shLZ, elbLX, elbLY, elbLZ, d.upperR * shScale + shMargin, d.upperR * 0.79 + margin);
            pushPointOutOfCapsule(p, elbLX, elbLY, elbLZ, wriLX, wriLY, wriLZ, d.upperR * 0.80 + margin, wristR * 1.18 + margin, forearmSwellFn);
            pushPointOutOfCapsule(p, wriLX, wriLY, wriLZ, tipLX, tipLY, tipLZ, wristR * 1.24 + margin, wristR * 1.36 + margin);
          } else {
            const shRX = shoRX + (elbRX - shoRX) * 0.06, shRY = shoRY + (elbRY - shoRY) * 0.06, shRZ = shoRZ + (elbRZ - shoRZ) * 0.06;
            pushPointOutOfCapsule(p, shRX, shRY, shRZ, elbRX, elbRY, elbRZ, d.upperR * shScale + shMargin, d.upperR * 0.79 + margin);
            pushPointOutOfCapsule(p, elbRX, elbRY, elbRZ, wriRX, wriRY, wriRZ, d.upperR * 0.80 + margin, wristR * 1.18 + margin, forearmSwellFn);
            pushPointOutOfCapsule(p, wriRX, wriRY, wriRZ, tipRX, tipRY, tipRZ, wristR * 1.24 + margin, wristR * 1.36 + margin);
          }
          if (exactEnv && exactFrames) {
            projectOutsideExactMannequinEnvelope(p, exactEnv, exactFrames, d, dynEnvMargin, {
              segments: sSide > 0 ? [0, 1, 2, 3, 5, 7] : [0, 1, 2, 3, 6, 8],
              isSleeve: true,
              skipShoulderTop: true,
            });
          }
          if (armPushFade < 0.999) {
            p.x = preX + (p.x - preX) * armPushFade;
            p.y = preY + (p.y - preY) * armPushFade;
          }
        } else if (isBraStrap) {
          // Handled after vertex loop by width-preserving projectBraStrapRibbon()
        } else if (!isCollar && !isLapel) {
          // Keep flared cloth outside swinging arms/hands (excluding fitted trousers), then enforce body clearance!
          if (!isTrousers && !isTight && (!isPartCurrentlyShown("sleeve") || ry < d.hipY + d.span * 0.18)) {
            guardArmOutsideGarment(p, ry);
          }
          collideTorsoAndLegs(p, ry, isTrousers, fitTier, extraTorsoMargin);
          const hasSleevesActive = isPartCurrentlyShown("sleeve");
          if (isBodice && !hasSleevesActive && ry > d.shoulderY - d.span * 0.14 && ry < d.shoulderY + d.span * 0.015 && Math.abs(rx) > d.shoulderHalf * 0.62) {
            const capOff = isTight ? 0.0034 : 0.006;
            if (rx >= 0) {
              pushPointOutOfCapsule(p, shoLX, shoLY, shoLZ, elbLX, elbLY, elbLZ, d.upperR * 1.04 + capOff, d.upperR * 0.78 + capOff);
            } else {
              pushPointOutOfCapsule(p, shoRX, shoRY, shoRZ, elbRX, elbRY, elbRZ, d.upperR * 1.04 + capOff, d.upperR * 0.78 + capOff);
            }
          }
          if (exactEnv && exactFrames) {
            const bodEnvOpts = (isBodice && hasSleevesActive && ry >= d.shoulderY - d.span * 0.34)
              ? { isTrousers, segments: [9, 10, 11, 12, 0, 1, 2, 3, 4] }
              : { isTrousers };
            projectOutsideExactMannequinEnvelope(p, exactEnv, exactFrames, d, dynEnvMargin, bodEnvOpts);
          }
        } else if (exactEnv && exactFrames) {
          if (isLapel) {
            projectOutsideExactMannequinEnvelope(p, exactEnv, exactFrames, d, dynEnvMargin, {
              segments: [0, 1, 2, 3],
              skipShoulderTop: true,
            });
          } else {
            // Keep collars stabilized to the chest frame so neck counter-yaw during Walk never swings them sideways.
            projectOutsideExactMannequinEnvelope(p, exactEnv, exactFrames, d, dynEnvMargin, {
              segments: [2],
              skipShoulderTop: true,
            });
            const invC = _dynInvMats[BONE_IDX.chest].elements;
            const fwdC = _dynMats[BONE_IDX.chest].elements;
            const lx = invC[0] * p.x + invC[4] * p.y + invC[8] * p.z + invC[12];
            const ly = invC[1] * p.x + invC[5] * p.y + invC[9] * p.z + invC[13];
            const lz = invC[2] * p.x + invC[6] * p.y + invC[10] * p.z + invC[14];
            if (ly > d.shoulderY - d.span * 0.02) {
              const nZScale = 0.94;
              const nRad = Math.hypot(lx, lz / nZScale);
              const minNRad = d.neckR * 1.08 + 0.003;
              if (nRad < minNRad && nRad > 1e-5) {
                const sc = minNRad / nRad;
                const nlx = lx * sc, nlz = lz * sc;
                p.x = fwdC[0] * nlx + fwdC[4] * ly + fwdC[8] * nlz + fwdC[12];
                p.y = fwdC[1] * nlx + fwdC[5] * ly + fwdC[9] * nlz + fwdC[13];
                p.z = fwdC[2] * nlx + fwdC[6] * ly + fwdC[10] * nlz + fwdC[14];
              }
            }
          }
        }

        // Prevent floor-length skirts/robes from dipping below studio floor y = 0.008
        if (p.y < 0.008) p.y = 0.008;

        out[i3] = p.x;
        out[i3 + 1] = p.y;
        out[i3 + 2] = p.z;
      }

      if (isBraStrap && exactEnv && exactFrames) {
        projectBraStrapRibbon(out, count, exactEnv, exactFrames, d, 0.0056, false);
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
            p.x = 0.5 * (fArr[i3] + bArr[i3]);
            p.y = 0.5 * (fArr[i3 + 1] + bArr[i3 + 1]);
            p.z = 0.5 * (fArr[i3 + 2] + bArr[i3 + 2]);
            if (exactEnv && exactFrames) {
              const weldOpts = (isPartCurrentlyShown("sleeve") && p.y >= d.shoulderY - d.span * 0.34)
                ? { segments: [9, 10, 11, 12, 0, 1, 2, 3, 4] }
                : {};
              projectOutsideExactMannequinEnvelope(p, exactEnv, exactFrames, d, bodiceFrontMesh.userData.isUnderOuter ? 0.0034 : 0.0062, weldOpts);
            }
            fArr[i3] = bArr[i3] = p.x;
            fArr[i3 + 1] = bArr[i3 + 1] = p.y;
            fArr[i3 + 2] = bArr[i3 + 2] = p.z;
          }
        }
        fGeo.attributes.position.needsUpdate = true;
        bGeo.attributes.position.needsUpdate = true;
      }
    }

    // Exact outer layer front/back shoulder-seam & side-seam welding
    if (outerFrontMesh && outerBackMesh && outerFrontMesh.visible && outerBackMesh.visible) {
      const fGeo = outerFrontMesh.geometry;
      const bGeo = outerBackMesh.geometry;
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
            p.x = 0.5 * (fArr[i3] + bArr[i3]);
            p.y = 0.5 * (fArr[i3 + 1] + bArr[i3 + 1]);
            p.z = 0.5 * (fArr[i3 + 2] + bArr[i3 + 2]);
            if (exactEnv && exactFrames) {
              const outerWeldOpts = (isPartCurrentlyShown("sleeve") && p.y >= d.shoulderY - d.span * 0.34)
                ? { segments: [9, 10, 11, 12, 0, 1, 2, 3, 4] }
                : {};
              projectOutsideExactMannequinEnvelope(p, exactEnv, exactFrames, d, 0.0155, outerWeldOpts);
            }
            fArr[i3] = bArr[i3] = p.x;
            fArr[i3 + 1] = bArr[i3 + 1] = p.y;
            fArr[i3 + 2] = bArr[i3 + 2] = p.z;
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
          p.x = 0.5 * (fArr[fLeft] + bArr[bLeft]);
          p.y = 0.5 * (fArr[fLeft + 1] + bArr[bLeft + 1]);
          p.z = 0.5 * (fArr[fLeft + 2] + bArr[bLeft + 2]);
          if (exactEnv && exactFrames) projectOutsideExactMannequinEnvelope(p, exactEnv, exactFrames, d, 0.0062);
          fArr[fLeft] = bArr[bLeft] = p.x;
          fArr[fLeft + 1] = bArr[bLeft + 1] = p.y;
          fArr[fLeft + 2] = bArr[bLeft + 2] = p.z;

          const fRight = rowOff * 3, bRight = (rowOff + halfSeg) * 3;
          p.x = 0.5 * (fArr[fRight] + bArr[bRight]);
          p.y = 0.5 * (fArr[fRight + 1] + bArr[bRight + 1]);
          p.z = 0.5 * (fArr[fRight + 2] + bArr[bRight + 2]);
          if (exactEnv && exactFrames) projectOutsideExactMannequinEnvelope(p, exactEnv, exactFrames, d, 0.0062);
          fArr[fRight] = bArr[bRight] = p.x;
          fArr[fRight + 1] = bArr[bRight + 1] = p.y;
          fArr[fRight + 2] = bArr[bRight + 2] = p.z;

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

    // Final post-weld & post-tenting exact mannequin envelope pass + smooth lighting normals
    const segsSleeveL = [0, 1, 2, 3, 5, 7];
    const segsSleeveR = [0, 1, 2, 3, 6, 8];
    const segsTorsoLegs = [9, 10, 11, 12, 0, 1, 2, 3, 4];
    const segsFullBody = [9, 10, 11, 12, 5, 6, 7, 8, 0, 1, 2, 3, 4];
    const hasSleevesFinal = isPartCurrentlyShown("sleeve");
    garmentGroup.traverse((mesh) => {
      if (mesh.isMesh && mesh.visible && mesh.userData.cpuSkinned) {
        if (exactEnv && exactFrames && mesh.geometry.attributes.position && !mesh.userData.isBraStrap) {
          const posAttr = mesh.geometry.attributes.position;
          const arr = posAttr.array;
          const part = mesh.name;
          const isLapel = Boolean(mesh.userData.isLapel);
          const isCollar = mesh.userData.garmentType === "collar" || (!isLapel && (part === "trim" || mesh.userData.parentPart === "trim"));
          const isBra = mesh.userData.garmentType === "bra";
          const isTrousers = part === "trousers";
          const isSleeve = part === "sleeve" || mesh.userData.parentPart === "sleeve";
          const isBodiceFinal = part === "bodice" || part === "outer" || mesh.userData.parentPart === "bodice" || mesh.userData.parentPart === "outer";
          const fitTier = mesh.userData.fitTier || (isBra ? "second-skin" : "regular");
          const margin = resolveLayerEnvelopeMargin(mesh, fitTier);
          const slMeta = mesh.geometry.userData?.gridMeta;
          const isStitch = Boolean(mesh.userData.isStitch);
          const fixedSide = mesh.userData.armSide || 0;
          const fixedSegs = isSleeve
            ? (fixedSide > 0 ? segsSleeveL : (fixedSide < 0 ? segsSleeveR : null))
            : (isCollar ? [2, 3] : (isLapel ? [0, 1, 2, 3] : segsFullBody));
          let pushed = false;
          for (let i = 0; i < posAttr.count; i++) {
            const slRow = (isSleeve && slMeta && !isStitch) ? Math.floor(i / slMeta.cols) : 4;
            const armPushFade = (isSleeve && !isStitch) ? smoothstep(0, 2.5, slRow) : 1.0;
            const i3 = i * 3;
            p.x = arr[i3];
            p.y = arr[i3 + 1];
            p.z = arr[i3 + 2];
            const ox = p.x, oy = p.y, oz = p.z;
            const useSegs = (isBodiceFinal && hasSleevesFinal && p.y >= d.shoulderY - d.span * 0.34)
              ? segsTorsoLegs
              : (fixedSegs || (p.x >= 0 ? segsSleeveL : segsSleeveR));
            projectOutsideExactMannequinEnvelope(p, exactEnv, exactFrames, d, margin, {
              segments: useSegs,
              isSleeve,
              isTrousers,
              skipShoulderTop: isCollar || isLapel || isSleeve,
            });
            if (p.x !== ox || p.y !== oy || p.z !== oz) {
              arr[i3] = ox + (p.x - ox) * armPushFade;
              arr[i3 + 1] = oy + (p.y - oy) * armPushFade;
              arr[i3 + 2] = p.z;
              pushed = true;
            }
          }
          if (pushed) posAttr.needsUpdate = true;
        }
        mesh.geometry.computeVertexNormals();
      }
    });

    // Keep inner-shirt shoulder regions hidden behind visible opaque outer jackets cleanly recessed
    if (outerFrontMesh && outerFrontMesh.visible && bodiceFrontMesh && bodiceFrontMesh.visible && bodiceFrontMesh.userData.isUnderOuter) {
      const shMinY = d.shoulderY - d.span * 0.28;
      const xStart = d.neckR * 1.45;
      const xFull = Math.max(xStart + 0.025, d.shoulderHalf * 0.72);
      for (const [bMesh, zSign] of [[bodiceFrontMesh, 1], [bodiceBackMesh, -1]]) {
        if (!bMesh || !bMesh.visible || !bMesh.geometry?.attributes?.position) continue;
        const bPos = bMesh.geometry.attributes.position;
        const bArr = bPos.array;
        for (let i = 0; i < bPos.count; i++) {
          const i3 = i * 3;
          const ax = Math.abs(bArr[i3]);
          const ay = bArr[i3 + 1];
          if (ay >= shMinY && ax > xStart) {
            const wLat = smoothstep(xStart, xFull, ax) * smoothstep(shMinY, d.shoulderY - d.span * 0.14, ay);
            bArr[i3 + 2] -= zSign * 0.018 * wLat;
          }
        }
        bPos.needsUpdate = true;
        bMesh.geometry.computeVertexNormals();
      }
    }

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

    if (outerFrontMesh && outerBackMesh && outerFrontMesh.visible && outerBackMesh.visible) {
      const fGeo = outerFrontMesh.geometry;
      const bGeo = outerBackMesh.geometry;
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
    fitHeadwearCapeOverGarment();
  }

  function attachAccessoryRigAnchor(obj, weights) {
    obj.updateMatrix();
    obj.userData.bindMatrix = obj.matrix.clone();
    const [bi, bw] = packSkinWeights(weights);
    obj.userData.skinIdx = bi;
    obj.userData.skinWgt = bw;
    obj.matrixAutoUpdate = false;
  }

  function applyAccBoneMatrixToLocal(matOut, weightsIdx, weightsVal) {
    const te = matOut.elements;
    for (let k = 0; k < 16; k++) te[k] = 0;
    for (let slot = 0; slot < 4; slot++) {
      const w = weightsVal[slot];
      if (w <= 1e-6) continue;
      const me = _dynMats[weightsIdx[slot]].elements;
      for (let k = 0; k < 16; k++) te[k] += w * me[k];
    }
    // Orthonormalize upper-left 3x3 basis so rigid buttons/buckles never shear
    const xLen = Math.hypot(te[0], te[1], te[2]) || 1;
    te[0] /= xLen; te[1] /= xLen; te[2] /= xLen;
    const yLen = Math.hypot(te[4], te[5], te[6]) || 1;
    te[4] /= yLen; te[5] /= yLen; te[6] /= yLen;
    const zLen = Math.hypot(te[8], te[9], te[10]) || 1;
    te[8] /= zLen; te[9] /= zLen; te[10] /= zLen;
    te[15] = 1;
  }

  function updateAccessoriesPose() {
    if (!accessoriesGroup || !_dynMats || !activeMannequin || !activeMannequin.skeleton) return;
    for (const child of accessoriesGroup.children) {
      if (!child.visible) continue;
      if (child.userData.accSkinnedRoot) {
        child.matrix.identity();
        child.matrixWorldNeedsUpdate = true;
        for (const sub of child.children) {
          if (sub.userData?.accVertSkin && sub.geometry?.attributes?.position) {
            const sk = sub.userData.accVertSkin;
            const pos = sub.geometry.attributes.position;
            const orig = sk.origPos;
            const sIdx = sk.skinIdx;
            const sWgt = sk.skinWgt;
            for (let i = 0; i < pos.count; i++) {
              const bx = orig[i * 3], by = orig[i * 3 + 1], bz = orig[i * 3 + 2];
              let rx = 0, ry = 0, rz = 0;
              for (let s = 0; s < 4; s++) {
                const w = sWgt[i * 4 + s];
                if (w <= 1e-6) continue;
                const me = _dynMats[sIdx[i * 4 + s]].elements;
                rx += w * (me[0] * bx + me[4] * by + me[8] * bz + me[12]);
                ry += w * (me[1] * bx + me[5] * by + me[9] * bz + me[13]);
                rz += w * (me[2] * bx + me[6] * by + me[10] * bz + me[14]);
              }
              pos.setXYZ(i, rx, ry, rz);
            }
            pos.needsUpdate = true;
          } else if (sub.userData?.bindMatrix && sub.userData?.skinIdx) {
            applyAccBoneMatrixToLocal(_tmpAccMat, sub.userData.skinIdx, sub.userData.skinWgt);
            sub.matrix.multiplyMatrices(_tmpAccMat, sub.userData.bindMatrix);
            sub.matrixWorldNeedsUpdate = true;
          }
        }
        continue;
      }
      if (!child.userData.bindMatrix || !child.userData.skinIdx) continue;
      applyAccBoneMatrixToLocal(_tmpAccMat, child.userData.skinIdx, child.userData.skinWgt);
      child.matrix.multiplyMatrices(_tmpAccMat, child.userData.bindMatrix);
      child.matrixWorldNeedsUpdate = true;
    }
  }

  let _capeInvHwMat = null;
  let _capeRootToHwMat = null;
  let _capeEnvGrid = null;
  let _capeEnvMono = null;
  let _capeEnvSmooth = null;

  /**
   * Fits full khimar / niqab cape drapes cleanly outside active 3D garments
   * (e.g. puff sleeves, structured bodices, outer layers) so sleeves and dresses
   * never poke through or slice the draped Islamic headwear.
   */
  function fitHeadwearCapeOverGarment() {
    if (!garmentGroup || !activeMannequin?.headGroup) return;
    const hwGroup = activeMannequin.headGroup.getObjectByName("headwearGroup");
    if (!hwGroup) return;

    const capeMeshes = [];
    for (const ch of hwGroup.children) {
      if (ch.isMesh && ch.visible && ch.userData?.isCapeDrape && ch.geometry?.userData?.baseCapePos) {
        capeMeshes.push(ch);
      }
    }
    if (!capeMeshes.length) return;

    root.updateMatrixWorld(true);
    hwGroup.updateMatrixWorld(true);
    _capeInvHwMat ||= new THREE.Matrix4();
    _capeRootToHwMat ||= new THREE.Matrix4();
    _capeInvHwMat.copy(hwGroup.matrixWorld).invert();
    _capeRootToHwMat.multiplyMatrices(_capeInvHwMat, root.matrixWorld);
    const te = _capeRootToHwMat.elements;

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const cm of capeMeshes) {
      const base = cm.geometry.userData.baseCapePos;
      for (let i = 1; i < base.length; i += 3) {
        const y = base[i];
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
    if (!Number.isFinite(yMin) || yMax <= yMin) return;
    yMin -= 0.04;
    yMax += 0.04;

    const Y_BINS = 36;
    const PHI_BINS = 48;
    const cellCount = Y_BINS * PHI_BINS;
    if (!_capeEnvGrid || _capeEnvGrid.length !== cellCount) {
      _capeEnvGrid = new Float32Array(cellCount);
      _capeEnvMono = new Float32Array(cellCount);
      _capeEnvSmooth = new Float32Array(cellCount);
    } else {
      _capeEnvGrid.fill(0);
    }
    const gEnv = _capeEnvGrid;
    const TWO_PI = Math.PI * 2;
    const invSpanY = (Y_BINS - 1) / Math.max(0.05, yMax - yMin);

    const splatPoint = (lx, ly, lz, scaleR = 1.0) => {
      if (ly < yMin || ly > yMax) return;
      const r = Math.hypot(lx, lz) * scaleR;
      if (r < 0.015) return;
      const iy = clamp(Math.round((yMax - ly) * invSpanY), 0, Y_BINS - 1);
      let uNorm = Math.atan2(lx, lz) / TWO_PI + 0.5;
      uNorm -= Math.floor(uNorm);
      const ip = Math.floor(uNorm * PHI_BINS) % PHI_BINS;
      const rPad = r * 0.996;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = clamp(iy + dy, 0, Y_BINS - 1);
        for (let dp = -1; dp <= 1; dp++) {
          const pp = (ip + dp + PHI_BINS) % PHI_BINS;
          const idxCell = yy * PHI_BINS + pp;
          const val = (dy === 0 && dp === 0) ? r : rPad;
          if (val > gEnv[idxCell]) gEnv[idxCell] = val;
        }
      }
    };

    garmentGroup.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.visible || mesh.userData?.isStitch) return;
      const posAttr = mesh.geometry?.attributes?.position;
      if (!posAttr) return;
      const arr = posAttr.array;
      const idxAttr = mesh.geometry.index;
      if (idxAttr) {
        const triIdx = idxAttr.array;
        for (let t = 0; t < triIdx.length; t += 3) {
          const i0 = triIdx[t] * 3, i1 = triIdx[t + 1] * 3, i2 = triIdx[t + 2] * 3;
          const x0 = te[0] * arr[i0] + te[4] * arr[i0 + 1] + te[8] * arr[i0 + 2] + te[12];
          const y0 = te[1] * arr[i0] + te[5] * arr[i0 + 1] + te[9] * arr[i0 + 2] + te[13];
          const z0 = te[2] * arr[i0] + te[6] * arr[i0 + 1] + te[10] * arr[i0 + 2] + te[14];
          const x1 = te[0] * arr[i1] + te[4] * arr[i1 + 1] + te[8] * arr[i1 + 2] + te[12];
          const y1 = te[1] * arr[i1] + te[5] * arr[i1 + 1] + te[9] * arr[i1 + 2] + te[13];
          const z1 = te[2] * arr[i1] + te[6] * arr[i1 + 1] + te[10] * arr[i1 + 2] + te[14];
          const x2 = te[0] * arr[i2] + te[4] * arr[i2 + 1] + te[8] * arr[i2 + 2] + te[12];
          const y2 = te[1] * arr[i2] + te[5] * arr[i2 + 1] + te[9] * arr[i2 + 2] + te[13];
          const z2 = te[2] * arr[i2] + te[6] * arr[i2 + 1] + te[10] * arr[i2 + 2] + te[14];
          if (Math.max(y0, y1, y2) < yMin || Math.min(y0, y1, y2) > yMax) continue;
          splatPoint(x0, y0, z0, 1.0);
          splatPoint(x1, y1, z1, 1.0);
          splatPoint(x2, y2, z2, 1.0);
          splatPoint(0.5 * (x0 + x1), 0.5 * (y0 + y1), 0.5 * (z0 + z1), 1.0);
          splatPoint(0.5 * (x1 + x2), 0.5 * (y1 + y2), 0.5 * (z1 + z2), 1.0);
          splatPoint(0.5 * (x2 + x0), 0.5 * (y2 + y0), 0.5 * (z2 + z0), 1.0);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          const i3 = i * 3;
          splatPoint(
            te[0] * arr[i3] + te[4] * arr[i3 + 1] + te[8] * arr[i3 + 2] + te[12],
            te[1] * arr[i3] + te[5] * arr[i3 + 1] + te[9] * arr[i3 + 2] + te[13],
            te[2] * arr[i3] + te[6] * arr[i3 + 1] + te[10] * arr[i3 + 2] + te[14],
            1.0
          );
        }
      }
    });

    // Angular smoothing + monotonic downward garment envelope for natural fabric drape
    const gSmooth = _capeEnvSmooth;
    gSmooth.set(gEnv);
    for (let pass = 0; pass < 2; pass++) {
      for (let iy = 0; iy < Y_BINS; iy++) {
        const row = iy * PHI_BINS;
        for (let ip = 0; ip < PHI_BINS; ip++) {
          const prev = gSmooth[row + ((ip + PHI_BINS - 1) % PHI_BINS)];
          const next = gSmooth[row + ((ip + 1) % PHI_BINS)];
          const cur = gSmooth[row + ip];
          _capeEnvMono[row + ip] = Math.max(cur, 0.25 * prev + 0.50 * cur + 0.25 * next);
        }
      }
      gSmooth.set(_capeEnvMono);
    }
    const gMono = _capeEnvMono;
    for (let ip = 0; ip < PHI_BINS; ip++) {
      gMono[ip] = gSmooth[ip];
      for (let iy = 1; iy < Y_BINS; iy++) {
        gMono[iy * PHI_BINS + ip] = Math.max(gSmooth[iy * PHI_BINS + ip], gMono[(iy - 1) * PHI_BINS + ip] * 0.996);
      }
    }

    const sampleEnv = (tbl, yVal, phiVal) => {
      const fyS = clamp((yMax - yVal) * invSpanY, 0, Y_BINS - 1);
      const iy0 = Math.floor(fyS);
      const iy1 = Math.min(Y_BINS - 1, iy0 + 1);
      const fy = fyS - iy0;
      let uNorm = phiVal / TWO_PI + 0.5;
      uNorm -= Math.floor(uNorm);
      const fpS = uNorm * PHI_BINS;
      const ip0 = Math.floor(fpS) % PHI_BINS;
      const ip1 = (ip0 + 1) % PHI_BINS;
      const fp = fpS - Math.floor(fpS);
      const r00 = tbl[iy0 * PHI_BINS + ip0];
      const r10 = tbl[iy0 * PHI_BINS + ip1];
      const r01 = tbl[iy1 * PHI_BINS + ip0];
      const r11 = tbl[iy1 * PHI_BINS + ip1];
      const bil = lerp(lerp(r00, r10, fp), lerp(r01, r11, fp), fy);
      return Math.max(bil, 0.98 * Math.max(r00, r10, r01, r11));
    };

    for (const cm of capeMeshes) {
      const geo = cm.geometry;
      const posAttr = geo.attributes.position;
      const base = geo.userData.baseCapePos;
      if (!posAttr || !base) continue;
      const arr = posAttr.array;
      arr.set(base);

      const isNiqabVeil = Boolean(cm.userData.isNiqabVeil);
      const isFullCape = Boolean(cm.userData.isFullCape);
      const grid = cm.userData.capeGrid || { U: 0, V: 0 };
      const tbl = isFullCape ? gMono : gSmooth;
      const margin = isNiqabVeil ? 0.018 : (isFullCape ? 0.015 : 0.010);

      if (grid.U > 0 && grid.V > 0 && posAttr.count === (grid.U + 1) * (grid.V + 1)) {
        const stride = grid.U + 1;
        const colMaxR = new Float32Array(stride);
        for (let iv = 0; iv <= grid.V; iv++) {
          const v = iv / grid.V;
          for (let iu = 0; iu <= grid.U; iu++) {
            const idx3 = (iv * stride + iu) * 3;
            const x = arr[idx3], y = arr[idx3 + 1], z = arr[idx3 + 2];
            const curR = Math.hypot(x, z) || 1e-4;
            if (isNiqabVeil && v < 0.26) {
              colMaxR[iu] = curR;
              continue;
            }
            const envR = sampleEnv(tbl, y, Math.atan2(x, z));
            let targetR = envR > 0.012 ? Math.max(curR, envR + margin) : curR;
            if (isFullCape && !isNiqabVeil && v >= 0.14) {
              targetR = Math.max(targetR, colMaxR[iu]);
            }
            colMaxR[iu] = targetR;
            if (targetR > curR + 1e-5) {
              const sc = targetR / curR;
              arr[idx3] = x * sc;
              arr[idx3 + 2] = z * sc;
            }
          }
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          const idx3 = i * 3;
          const x = arr[idx3], y = arr[idx3 + 1], z = arr[idx3 + 2];
          const curR = Math.hypot(x, z) || 1e-4;
          const envR = sampleEnv(tbl, y, Math.atan2(x, z));
          if (envR > 0.012 && envR + margin > curR) {
            const sc = (envR + margin) / curR;
            arr[idx3] = x * sc;
            arr[idx3 + 2] = z * sc;
          }
        }
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
    }
  }

  /**
   * Projects every bind-pose garment vertex outside the exact 9-segment
   * humanBody surface envelope (plus clavicle/trapezius shoulder heightfield)
   * so restPos and static/posed render start cleanly outside the mannequin.
   */
  function enforceBindPoseBodyClearance(group, mannequin, d) {
    const env = ensureExactMannequinEnvelope(mannequin, d);
    if (!env || !group || !d) return;
    const p = env.p;
    const bindFrames = [
      { a: env.segDefs[0].a, b: env.segDefs[0].b, right: [1, 0, 0], fwd: [0, 0, 1] },
      ...env.segDefs.slice(1).map((seg) => ({ a: seg.a, b: seg.b, right: [1, 0, 0], fwd: [0, 0, 1] })),
    ];
    void p;
    ensureDynamicsScratch();
    for (let b = 0; b < 17; b++) {
      _dynMats[b].identity();
      _dynInvMats[b].identity();
    }

    const pt = { x: 0, y: 0, z: 0 };
    group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const gPos = mesh.geometry.attributes.position;
      const restPos = mesh.geometry.userData.restPos;
      if (!gPos) return;

      const part = mesh.name;
      const isLapel = Boolean(mesh.userData.isLapel);
      const isCollar = mesh.userData.garmentType === "collar" || (!isLapel && (part === "trim" || mesh.userData.parentPart === "trim"));
      const isBra = mesh.userData.garmentType === "bra";
      const isBraStrap = Boolean(mesh.userData.isBraStrap);
      if (isBraStrap) {
        const tmp = new Float32Array(gPos.count * 3);
        for (let i = 0; i < gPos.count; i++) {
          tmp[i * 3] = gPos.getX(i);
          tmp[i * 3 + 1] = gPos.getY(i);
          tmp[i * 3 + 2] = gPos.getZ(i);
        }
        projectBraStrapRibbon(tmp, gPos.count, env, bindFrames, d, 0.0056, true);
        for (let i = 0; i < gPos.count; i++) {
          const x = tmp[i * 3], y = tmp[i * 3 + 1], z = tmp[i * 3 + 2];
          gPos.setXYZ(i, x, y, z);
          if (restPos) {
            restPos[i * 3] = x;
            restPos[i * 3 + 1] = y;
            restPos[i * 3 + 2] = z;
          }
        }
        gPos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        return;
      }
      const isTrousers = part === "trousers";
      const isSleeve = part === "sleeve" || mesh.userData.parentPart === "sleeve";
      const fitTier = mesh.userData.fitTier || (isBra ? "second-skin" : "regular");
      const margin = resolveLayerEnvelopeMargin(mesh, fitTier);
      const segs = isSleeve
        ? ((mesh.userData.armSide || 1) > 0 ? [0, 1, 2, 3, 5, 7] : [0, 1, 2, 3, 6, 8])
        : (isCollar ? [2, 3] : (isLapel ? [0, 1, 2, 3] : [9, 10, 11, 12, 0, 1, 2, 3, 4]));

      const slMeta = mesh.geometry.userData?.gridMeta;
      const isStitch = Boolean(mesh.userData.isStitch);
      let changed = false;
      for (let i = 0; i < gPos.count; i++) {
        const slRow = (isSleeve && slMeta && !isStitch) ? Math.floor(i / slMeta.cols) : 4;
        const armPushFade = (isSleeve && !isStitch) ? smoothstep(0, 2.5, slRow) : 1.0;
        pt.x = gPos.getX(i);
        pt.y = gPos.getY(i);
        pt.z = gPos.getZ(i);
        const ox = pt.x, oy = pt.y, oz = pt.z;
        projectOutsideExactMannequinEnvelope(pt, env, bindFrames, d, margin, {
          segments: segs,
          isSleeve,
          isTrousers,
          skipShoulderTop: isCollar || isLapel || isSleeve,
          bindMode: true,
        });
        if (Math.abs(pt.x - ox) > 1e-6 || Math.abs(pt.y - oy) > 1e-6 || Math.abs(pt.z - oz) > 1e-6) {
          const nx = ox + (pt.x - ox) * armPushFade;
          const ny = oy + (pt.y - oy) * armPushFade;
          const nz = pt.z;
          gPos.setXYZ(i, nx, ny, nz);
          if (restPos) {
            restPos[i * 3] = nx;
            restPos[i * 3 + 1] = ny;
            restPos[i * 3 + 2] = nz;
          }
          changed = true;
        }
      }
      if (changed) {
        gPos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
      }
    });
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
    outerFrontMesh = null;
    outerBackMesh = null;
    skirtFrontMesh = null;
    skirtBackMesh = null;

    const pm = explicitMetrics || curPatternMetrics || computePatternMetrics3D(lastPieceVis || [], m, category);
    curPatternMetrics = pm;
    const skeleton = activeMannequin ? activeMannequin.skeleton : null;

    if (pm.bodice.style === "leotard") {
      buildTailoredLeotard(d, pm, skeleton);
    } else if (pm.bodice.style === "bra") {
      buildTailoredBra(d, pm, skeleton);
    } else {
      buildTailoredBodice(d, pm, skeleton);
      buildOuterLayer(d, pm, skeleton);
      buildTailoredSkirt(d, pm, skeleton);
    }
    buildTailoredTrousers(d, pm, skeleton);
    buildTailoredSleeves(d, pm, skeleton);
    enforceBindPoseBodyClearance(garmentGroup, activeMannequin, d);

    buildAccessories(d);
    buildStitches(d, pm, skeleton);
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

  // ---------- Accessories & Trims: Buttons, Zippers, Belts, Bows & Brooches ----------
  function resolveGarmentHemY(d) {
    const waistYY = d.hipY + d.span * 0.44;
    let minGarmentY = waistYY - d.span * 0.14;
    if (!garmentGroup) return Math.max(d.ankleY + 0.06, minGarmentY);
    const meshes = [];
    if (isPartCurrentlyShown("outer") && outerFrontMesh) meshes.push(outerFrontMesh);
    if (isPartCurrentlyShown("skirt") && skirtFrontMesh) meshes.push(skirtFrontMesh);
    if (isPartCurrentlyShown("bodice") && bodiceFrontMesh) meshes.push(bodiceFrontMesh);
    for (const m of meshes) {
      const rest = m.geometry?.userData?.restPos;
      const pos = m.geometry?.attributes?.position?.array;
      const arr = rest || pos;
      if (!arr) continue;
      for (let i = 1; i < arr.length; i += 3) {
        if (arr[i] < minGarmentY) minGarmentY = arr[i];
      }
    }
    const minAnkleY = Math.max(0.06, (d.H || 1.68) * 0.055);
    return Math.max(minAnkleY, Math.min(waistYY - 0.03, minGarmentY + 0.04));
  }

  function sampleGarmentSurfaceAbsZ(y, x, isFront, d, fallbackEase = 0.017) {
    const phi = clamp(Math.atan2(x, Math.max(0.06, d.waistR || 0.12)), -1.25, 1.25);
    const phiSample = isFront ? phi : (Math.PI - phi);
    const [, zBody] = getBodySurfacePoint(y, phiSample, d, fallbackEase);
    let bestAbsZ = Math.abs(zBody);
    if (garmentGroup) {
      const candidates = [];
      if (isPartCurrentlyShown("outer")) candidates.push(isFront ? outerFrontMesh : outerBackMesh);
      if (isPartCurrentlyShown("bodice")) candidates.push(isFront ? bodiceFrontMesh : bodiceBackMesh);
      if (isPartCurrentlyShown("skirt")) candidates.push(isFront ? skirtFrontMesh : skirtBackMesh);
      if (isPartCurrentlyShown("trousers")) {
        garmentGroup.traverse((o) => {
          if (o.isMesh && o.name === "trousers") candidates.push(o);
        });
      }
      for (const m of candidates) {
        if (!m || !m.geometry) continue;
        const arr = m.geometry.userData?.restPos || m.geometry.attributes?.position?.array;
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 3) {
          const vx = arr[i], vy = arr[i + 1], vz = arr[i + 2];
          if (isFront ? vz < -0.01 : vz > 0.01) continue;
          if (Math.abs(vy - y) <= 0.042 && Math.abs(vx - x) <= 0.048) {
            const az = Math.abs(vz);
            if (az > bestAbsZ) bestAbsZ = az;
          }
        }
      }
    }
    return bestAbsZ;
  }

  function createAccessorySkinRecord(posAttr, d) {
    const count = posAttr.count;
    const origPos = new Float32Array(posAttr.array);
    const skinIdx = new Uint8Array(count * 4);
    const skinWgt = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const [bi, bw] = packSkinWeights(torsoGarmentWeights(y, x, d));
      for (let s = 0; s < 4; s++) {
        skinIdx[i * 4 + s] = bi[s];
        skinWgt[i * 4 + s] = bw[s];
      }
    }
    return { origPos, skinIdx, skinWgt };
  }

  function createAccessoryFinishMaterial(style, customColor, baseColor = 0x4f46e5, kind = "hardware") {
    const presets = {
      gold: { color: 0xd4af37, metal: 0.94, rough: 0.20, clear: 0.55, sheen: 0.0, shin: 88 },
      silver: { color: 0xe5e7eb, metal: 0.95, rough: 0.16, clear: 0.62, sheen: 0.0, shin: 92 },
      rose_gold: { color: 0xe2a898, metal: 0.92, rough: 0.22, clear: 0.52, sheen: 0.0, shin: 85 },
      brass: { color: 0xc8963e, metal: 0.88, rough: 0.26, clear: 0.35, sheen: 0.0, shin: 78 },
      antique_bronze: { color: 0x8b673c, metal: 0.80, rough: 0.36, clear: 0.20, sheen: 0.0, shin: 65 },
      gunmetal: { color: 0x26262b, metal: 0.85, rough: 0.34, clear: 0.25, sheen: 0.0, shin: 72 },
      horn: { color: 0x3b2414, metal: 0.04, rough: 0.38, clear: 0.65, sheen: 0.0, shin: 50 },
      tortoise: { color: 0x6b3a1b, metal: 0.04, rough: 0.32, clear: 0.72, sheen: 0.0, shin: 65 },
      pearl: { color: 0xf6f3ea, metal: 0.02, rough: 0.24, clear: 0.45, sheen: 0.95, shin: 68 },
      pearl_crystal: { color: 0xe5e7eb, metal: 0.90, rough: 0.18, clear: 0.70, sheen: 0.25, shin: 90 },
      matte_black: { color: 0x18181b, metal: 0.08, rough: 0.78, clear: 0.0, sheen: 0.0, shin: 14 },
      wood: { color: 0x7c4f27, metal: 0.02, rough: 0.68, clear: 0.0, sheen: 0.0, shin: 22 },
      matching: { color: baseColor || 0x4f46e5, metal: 0.04, rough: 0.48, clear: 0.15, sheen: 0.35, shin: 36 },
    };
    const p = presets[style] || presets.matching;
    const colHex = customColor != null ? customColor : p.color;
    if (isSoftwareGL) {
      return new THREE.MeshPhongMaterial({
        color: colHex,
        shininess: p.shin,
        specular: p.metal > 0.5 ? 0x777777 : 0x333333,
        side: kind === "double" ? THREE.DoubleSide : THREE.FrontSide,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: colHex,
      metalness: p.metal,
      roughness: p.rough,
      clearcoat: p.clear,
      sheen: p.sheen,
      sheenRoughness: 0.38,
      side: kind === "double" ? THREE.DoubleSide : THREE.FrontSide,
    });
  }

  function createButtonMesh(size, style, baseColor, shape = "classic_round", customColor = null) {
    const btnG = new THREE.Group();
    const effStyle = customColor && (style === "gold" || style === "silver" || style === "rose_gold")
      ? style
      : (style || "gold");
    const resolvedCustom = customColor != null ? new THREE.Color(customColor).getHex() : null;
    const mat = createAccessoryFinishMaterial(effStyle, resolvedCustom, baseColor);

    const sc = clamp(Number(size) || 1.0, 0.5, 2.0);
    const r = sc * 0.0072;
    const thick = r * 0.28;
    const threadColor = (effStyle === "matte_black" || (resolvedCustom != null && resolvedCustom < 0x333333)) ? 0x888888 : 0xdddddd;

    if (shape === "domed_shank") {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), mat);
      cap.rotation.x = Math.PI * 0.5;
      cap.scale.set(1, 0.68, 1);
      cap.castShadow = true;
      btnG.add(cap);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(r * 0.88, r * 0.12, 10, 22), mat);
      collar.position.z = thick * 0.08;
      btnG.add(collar);
    } else if (shape === "square_bevel") {
      const hw = r * 0.86;
      const cr = r * 0.18;
      const sq = new THREE.Shape();
      sq.moveTo(-hw + cr, -hw);
      sq.lineTo(hw - cr, -hw);
      sq.quadraticCurveTo(hw, -hw, hw, -hw + cr);
      sq.lineTo(hw, hw - cr);
      sq.quadraticCurveTo(hw, hw, hw - cr, hw);
      sq.lineTo(-hw + cr, hw);
      sq.quadraticCurveTo(-hw, hw, -hw, hw - cr);
      sq.lineTo(-hw, -hw + cr);
      sq.quadraticCurveTo(-hw, -hw, -hw + cr, -hw);
      const sqGeo = new THREE.ExtrudeGeometry(sq, {
        depth: thick,
        bevelEnabled: true,
        bevelThickness: thick * 0.35,
        bevelSize: r * 0.10,
        bevelSegments: 2,
      });
      sqGeo.center();
      const sqMesh = new THREE.Mesh(sqGeo, mat);
      sqMesh.castShadow = true;
      btnG.add(sqMesh);
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
      const holeOffset = r * 0.30;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([hx, hy]) => {
        const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.10, 8), holeMat);
        hole.position.set(hx * holeOffset, hy * holeOffset, thick * 0.88);
        btnG.add(hole);
      });
      const tMat = new THREE.MeshBasicMaterial({ color: threadColor });
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(holeOffset * 2.0, r * 0.08, r * 0.05), tMat);
      t1.position.z = thick * 0.90;
      btnG.add(t1);
    } else if (shape === "diamond") {
      const dm = new THREE.Shape();
      dm.moveTo(0, r * 1.12);
      dm.lineTo(r * 0.88, 0);
      dm.lineTo(0, -r * 1.12);
      dm.lineTo(-r * 0.88, 0);
      dm.closePath();
      const bezelGeo = new THREE.ExtrudeGeometry(dm, {
        depth: thick * 0.9,
        bevelEnabled: true,
        bevelThickness: thick * 0.38,
        bevelSize: r * 0.12,
        bevelSegments: 2,
      });
      bezelGeo.center();
      const bezel = new THREE.Mesh(bezelGeo, mat);
      bezel.castShadow = true;
      btnG.add(bezel);
      const gemMat = createAccessoryFinishMaterial(
        resolvedCustom != null ? "pearl" : "pearl_crystal",
        resolvedCustom != null ? resolvedCustom : 0xf8fafc,
        baseColor
      );
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.56, 0), gemMat);
      gem.scale.set(0.85, 1.05, 0.52);
      gem.position.z = thick * 0.95;
      btnG.add(gem);
    } else if (shape === "toggle_bar") {
      const toggleMat = createAccessoryFinishMaterial(
        style === "gold" || style === "silver" ? style : (style || "horn"),
        resolvedCustom,
        baseColor
      );
      const barGeo = new THREE.CylinderGeometry(r * 0.34, r * 0.28, r * 2.9, 14);
      barGeo.rotateZ(Math.PI * 0.5);
      const bar = new THREE.Mesh(barGeo, toggleMat);
      bar.castShadow = true;
      btnG.add(bar);
      const tipCapGeo = new THREE.SphereGeometry(r * 0.34, 10, 10);
      [-1, 1].forEach((s) => {
        const cap = new THREE.Mesh(tipCapGeo, toggleMat);
        cap.position.set(s * r * 1.45, 0, 0);
        cap.scale.set(0.75, s > 0 ? 1 : 0.82, 1);
        btnG.add(cap);
      });
      const cordMat = createAccessoryFinishMaterial("matte_black", 0x1e293b, baseColor);
      const loop = new THREE.Mesh(new THREE.TorusGeometry(r * 0.48, r * 0.09, 8, 18), cordMat);
      loop.rotation.y = Math.PI * 0.5;
      loop.position.set(0, 0, -r * 0.18);
      btnG.add(loop);
    } else if (shape === "covered_flor") {
      const petalMat = createAccessoryFinishMaterial("matching", resolvedCustom, baseColor);
      for (let p = 0; p < 6; p++) {
        const ang = (p / 6) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.SphereGeometry(r * 0.44, 12, 10), petalMat);
        petal.scale.set(1.0, 1.0, 0.42);
        petal.position.set(Math.cos(ang) * r * 0.56, Math.sin(ang) * r * 0.56, 0);
        petal.castShadow = true;
        btnG.add(petal);
      }
      const centerPearl = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.36, 12, 10),
        createAccessoryFinishMaterial(style === "matte_black" ? "matte_black" : "pearl", null, baseColor)
      );
      centerPearl.scale.set(1, 1, 0.72);
      centerPearl.position.z = thick * 0.65;
      btnG.add(centerPearl);
    } else {
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

      const threadMat = new THREE.MeshBasicMaterial({ color: threadColor });
      const thread1 = new THREE.Mesh(new THREE.BoxGeometry(holeOffset * 2.1, r * 0.08, r * 0.06), threadMat);
      thread1.position.z = thick * 0.40;
      btnG.add(thread1);
      const thread2 = new THREE.Mesh(new THREE.BoxGeometry(r * 0.08, holeOffset * 2.1, r * 0.06), threadMat);
      thread2.position.z = thick * 0.40;
      btnG.add(thread2);
    }

    return btnG;
  }

  function createZipperMesh(startY, endY, radiusOrZFn, style, openPct = 0, opts = {}) {
    const zipG = new THREE.Group();
    const getZ = typeof radiusOrZFn === "function" ? radiusOrZFn : () => radiusOrZFn;
    const shape = opts.shape || "classic_tab";
    const sc = clamp(Number(opts.size) || 1.0, 0.6, 1.8);
    const customCol = opts.customColor != null ? new THREE.Color(opts.customColor).getHex() : null;
    const tapeCol = opts.tapeColor != null
      ? new THREE.Color(opts.tapeColor).getHex()
      : (shape === "invisible_seam" ? (opts.fabricCol ?? 0x1f2937) : 0x1f2937);

    const teethMat = createAccessoryFinishMaterial(style || "silver", customCol, 0x888888);
    const tapeMat = isSoftwareGL
      ? new THREE.MeshPhongMaterial({ color: tapeCol, shininess: 10, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: tapeCol, roughness: 0.85, side: THREE.DoubleSide });

    const isInvisible = shape === "invisible_seam";
    const isChunky = shape === "chunky_molded";
    const isBack = Boolean(opts.isBack);
    const zSign = isBack ? -1 : 1;
    const xC = Number(opts.xCenter) || 0;
    const tapeHalfW = (isInvisible ? 0.0045 : isChunky ? 0.016 : 0.012) * sc;
    const toothLen = (isChunky ? 0.0055 : 0.004) * sc;
    const toothThick = (isChunky ? 0.0034 : 0.002) * sc;
    const toothW = (isChunky ? 0.011 : isInvisible ? 0.0026 : 0.0072) * sc;

    const len = Math.max(0.05, Math.abs(startY - endY));
    const TAPE_SEGS = Math.max(16, Math.round(len / 0.018));
    const tPos = [];
    const tIdx = [];
    for (let r = 0; r <= TAPE_SEGS; r++) {
      const ty = startY + (endY - startY) * (r / TAPE_SEGS);
      const z = zSign * (getZ(ty) + 0.0045);
      if (isBack) {
        tPos.push(xC + tapeHalfW, ty, z, xC - tapeHalfW, ty, z);
      } else {
        tPos.push(xC - tapeHalfW, ty, z, xC + tapeHalfW, ty, z);
      }
      if (r > 0) {
        const p = (r - 1) * 2;
        const c = r * 2;
        tIdx.push(p, p + 1, c + 1, p, c + 1, c);
      }
    }
    const tapeGeo = new THREE.BufferGeometry();
    tapeGeo.setAttribute("position", new THREE.Float32BufferAttribute(tPos, 3));
    tapeGeo.setIndex(tIdx);
    tapeGeo.computeVertexNormals();
    const tape = new THREE.Mesh(tapeGeo, tapeMat);
    if (opts.skinD) {
      tape.userData.accVertSkin = createAccessorySkinRecord(tapeGeo.attributes.position, opts.skinD);
    }
    zipG.add(tape);

    const teethStep = isChunky ? 0.0095 * sc : 0.008 * Math.max(0.8, sc * 0.9);
    const teethCount = Math.max(10, Math.round(len / teethStep));
    const clampedOpen = clamp(Number(openPct) || 0, 0, 0.75);
    const closedLimitY = startY - (startY - endY) * clampedOpen;

    const attachToothAnchor = (mesh, ty) => {
      if (!opts.skinD) return;
      const w = opts.weightsFn ? opts.weightsFn(ty) : torsoGarmentWeights(ty, xC, opts.skinD);
      attachAccessoryRigAnchor(mesh, w);
    };

    if (isInvisible) {
      // Subtle seam welt piping + concealed slim top slider only
      const seamLineGeo = new THREE.CylinderGeometry(0.0011 * sc, 0.0011 * sc, len, 8);
      const seamY = (startY + endY) * 0.5;
      const seamLine = new THREE.Mesh(seamLineGeo, tapeMat);
      seamLine.position.set(xC, seamY, zSign * (getZ(seamY) + 0.0052));
      attachToothAnchor(seamLine, seamY);
      zipG.add(seamLine);
    } else {
      for (let i = 0; i < teethCount; i++) {
        const frac = i / teethCount;
        const ty = startY + (endY - startY) * frac;
        const tz = zSign * (getZ(ty) + 0.0065);

        if (ty < closedLimitY) {
          const tooth = new THREE.Mesh(new THREE.BoxGeometry(toothW, toothLen, toothThick), teethMat);
          tooth.position.set(xC, ty, tz);
          attachToothAnchor(tooth, ty);
          zipG.add(tooth);
        } else {
          const spread = (ty - closedLimitY) * 0.25;
          const toothL = new THREE.Mesh(new THREE.BoxGeometry(toothW * 0.5, toothLen, toothThick), teethMat);
          toothL.position.set(xC - spread - 0.003 * sc, ty, tz);
          attachToothAnchor(toothL, ty);
          const toothR = new THREE.Mesh(new THREE.BoxGeometry(toothW * 0.5, toothLen, toothThick), teethMat);
          toothR.position.set(xC + spread + 0.003 * sc, ty, tz);
          attachToothAnchor(toothR, ty);
          zipG.add(toothL, toothR);
        }
      }
    }

    const sliderG = new THREE.Group();
    const sScale = isInvisible ? sc * 0.65 : isChunky ? sc * 1.25 : sc;
    const sliderBody = new THREE.Mesh(new THREE.BoxGeometry(0.013 * sScale, 0.015 * sScale, 0.0075 * sScale), teethMat);
    sliderG.add(sliderBody);

    if (shape === "ring_pull") {
      const loopBridge = new THREE.Mesh(new THREE.BoxGeometry(0.005 * sScale, 0.006 * sScale, 0.004 * sScale), teethMat);
      loopBridge.position.set(0, -0.007 * sScale, 0.004 * sScale);
      sliderG.add(loopBridge);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0115 * sScale, 0.0022 * sScale, 10, 24), teethMat);
      ring.position.set(0, -0.0185 * sScale, 0.0045 * sScale);
      ring.rotation.x = 0.14;
      sliderG.add(ring);
    } else if (shape === "teardrop" || isInvisible) {
      const td = new THREE.Shape();
      const tw = 0.0052 * sScale;
      const th = 0.022 * sScale;
      td.moveTo(0, 0);
      td.bezierCurveTo(tw, -th * 0.42, tw * 1.15, -th, 0, -th);
      td.bezierCurveTo(-tw * 1.15, -th, -tw, -th * 0.42, 0, 0);
      const tdGeo = new THREE.ExtrudeGeometry(td, { depth: 0.0022 * sScale, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1 });
      const pullMesh = new THREE.Mesh(tdGeo, teethMat);
      pullMesh.position.set(0, -0.004 * sScale, 0.003 * sScale);
      pullMesh.rotation.x = 0.14;
      sliderG.add(pullMesh);
    } else {
      const pullW = (isChunky ? 0.0105 : 0.008) * sScale;
      const pullH = (isChunky ? 0.030 : 0.026) * sScale;
      const pullTab = new THREE.Mesh(new THREE.BoxGeometry(pullW, pullH, 0.0024 * sScale), teethMat);
      pullTab.position.set(0, -0.018 * sScale, 0.004 * sScale);
      pullTab.rotation.x = 0.15;
      sliderG.add(pullTab);
    }

    sliderG.position.set(xC, closedLimitY, zSign * (getZ(closedLimitY) + (isInvisible ? 0.0082 : 0.0105)));
    if (isBack) sliderG.rotation.y = Math.PI;
    attachToothAnchor(sliderG, closedLimitY);
    zipG.add(sliderG);

    if (opts.skinD) {
      zipG.userData.accSkinnedRoot = true;
    }

    return zipG;
  }

  function createBeltMesh(waistY, waistR, zScale, style, width = "medium", baseCol = 0x4f46e5, d = null, waistEase = 0.020, customColor = null, opts = {}) {
    const beltG = new THREE.Group();
    const effSize = opts.size != null && Number.isFinite(Number(opts.size))
      ? clamp(Number(opts.size), 0.5, 1.85)
      : ((width === "slim" || width === "narrow") ? 0.68 : (width === "wide" ? 1.55 : 1.0));
    const h = 0.036 * effSize;
    const strapThick = 0.0042;
    const shape = opts.shape || (style === "fabric_sash" ? "sash_tie" : "rect_frame");
    const lengthNorm = clamp(opts.length != null && Number.isFinite(Number(opts.length)) ? Number(opts.length) : 0.35, 0.0, 1.0);

    const strapPresetCols = {
      leather_gold: 0x1a1918,
      leather_silver: 0x54392b,
      matte_black: 0x111112,
      patent_gloss: 0x141416,
      fabric_sash: baseCol,
      matching: baseCol,
    };
    const resolvedStrapCol = customColor != null ? customColor : (strapPresetCols[style] ?? baseCol);
    const bucklePresetCols = {
      leather_gold: 0xd4af37,
      leather_silver: 0xe0e4e8,
      patent_gloss: 0xe0e4e8,
      matte_black: 0x26262b,
      fabric_sash: 0xd4af37,
      matching: 0xd4af37,
    };
    const resolvedBuckleCol = opts.buckleColor != null
      ? new THREE.Color(opts.buckleColor).getHex()
      : (bucklePresetCols[style] ?? 0xd4af37);

    let strapMat, buckleMat;
    if (isSoftwareGL) {
      strapMat = new THREE.MeshPhongMaterial({
        color: resolvedStrapCol,
        shininess: style === "patent_gloss" ? 90 : (style === "matte_black" ? 12 : 34),
        specular: style === "patent_gloss" ? 0x888888 : 0x333333,
        side: THREE.DoubleSide,
      });
      buckleMat = new THREE.MeshPhongMaterial({ color: resolvedBuckleCol, shininess: 85, specular: 0x888888 });
    } else if (style === "patent_gloss") {
      strapMat = new THREE.MeshPhysicalMaterial({ color: resolvedStrapCol, roughness: 0.14, metalness: 0.04, clearcoat: 0.92, clearcoatRoughness: 0.12, side: THREE.DoubleSide });
      buckleMat = new THREE.MeshStandardMaterial({ color: resolvedBuckleCol, roughness: 0.18, metalness: 0.92 });
    } else if (style === "matte_black") {
      strapMat = new THREE.MeshStandardMaterial({ color: resolvedStrapCol, roughness: 0.68, metalness: 0.02, side: THREE.DoubleSide });
      buckleMat = new THREE.MeshStandardMaterial({ color: resolvedBuckleCol, roughness: 0.42, metalness: 0.72 });
    } else if (style === "fabric_sash" || style === "matching") {
      strapMat = new THREE.MeshStandardMaterial({ color: resolvedStrapCol, roughness: 0.52, metalness: 0.04, side: THREE.DoubleSide });
      buckleMat = new THREE.MeshStandardMaterial({ color: resolvedBuckleCol, roughness: 0.22, metalness: 0.92 });
    } else {
      strapMat = new THREE.MeshStandardMaterial({ color: resolvedStrapCol, roughness: 0.38, metalness: 0.06, side: THREE.DoubleSide });
      buckleMat = new THREE.MeshStandardMaterial({ color: resolvedBuckleCol, roughness: 0.20, metalness: 0.92 });
    }

    const N = 48;
    const sPos = [];
    const sIdx = [];
    const yBot = waistY - h * 0.5;
    const yTop = waistY + h * 0.5;
    const corsetFrontMul = shape === "corset_cinch" ? 1.85 : 1.0;
    let frontOuterZ = (waistR * 1.035 + 0.024) * zScale;
    let sideStrapAbsX = waistR * 0.85;
    for (let k = 0; k <= N; k++) {
      const phi = (k / N) * Math.PI * 2;
      const frontBell = Math.exp(-Math.pow(Math.sin(phi * 0.5), 2) * 14);
      const localHalfH = h * 0.5 * (1 + (corsetFrontMul - 1) * frontBell);
      const lyBot = waistY - localHalfH;
      const lyTop = waistY + localHalfH;

      let xiB, ziB, xoB, zoB, xiT, ziT, xoT, zoT;
      if (d) {
        [xiB, ziB] = getBodySurfacePoint(lyBot, phi, d, waistEase + 0.006);
        [xoB, zoB] = getBodySurfacePoint(lyBot, phi, d, waistEase + 0.006 + strapThick);
        [xiT, ziT] = getBodySurfacePoint(lyTop, phi, d, waistEase + 0.006);
        [xoT, zoT] = getBodySurfacePoint(lyTop, phi, d, waistEase + 0.006 + strapThick);
        const surfZ = sampleGarmentSurfaceAbsZ(waistY, xoB, Math.cos(phi) >= 0, d, waistEase + 0.006);
        if (Math.cos(phi) >= 0.45 && surfZ + 0.003 > zoB) {
          const push = surfZ + 0.003 - zoB;
          zoB += push; ziB += push;
          zoT += push; ziT += push;
        }
      } else {
        const rIn = waistR * 1.03 + waistEase;
        const rOut = rIn + strapThick;
        xiB = xiT = rIn * Math.sin(phi);
        ziB = ziT = rIn * zScale * Math.cos(phi);
        xoB = xoT = rOut * Math.sin(phi);
        zoB = zoT = rOut * zScale * Math.cos(phi);
      }
      if (k === 0) frontOuterZ = Math.max(zoB, zoT);
      if (Math.abs(phi - Math.PI * 0.5) < 0.16) sideStrapAbsX = Math.max(sideStrapAbsX, Math.abs(xoB));
      sPos.push(xoB, lyBot, zoB, xoT, lyTop, zoT, xiT, lyTop, ziT, xiB, lyBot, ziB);
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
    // INVARIANT: beltG.children[0] MUST remain strapMesh for dynamic stride tracker
    beltG.add(strapMesh);

    const bW = h * 1.45;
    const bH = h * 1.25;
    const bThick = 0.006;

    if (shape === "sash_tie" || (opts.shape == null && style === "fabric_sash")) {
      const knotG = new THREE.Group();
      knotG.position.set(0.012, waistY, frontOuterZ + 0.006);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(h * 0.52, 14, 12), strapMat);
      knot.scale.set(1.15, 0.95, 0.75);
      knotG.add(knot);
      // INVARIANT: beltG.children[1] MUST remain center waist knot/buckle anchor
      beltG.add(knotG);

      [-1, 1].forEach((side) => {
        const tieLen = h * (1.8 + lengthNorm * 9.5);
        const R_SEGS = Math.max(10, Math.round(tieLen / 0.025));
        const halfW = h * 0.375;
        const rPos = [];
        const rIdx = [];
        for (let r = 0; r <= R_SEGS; r++) {
          const u = r / R_SEGS;
          const y = waistY - u * tieLen;
          const cx = 0.012 + side * (h * 0.35 + u * Math.min(0.075, tieLen * 0.16));
          const xL = cx - halfW;
          const xR = cx + halfW;
          let zIn = frontOuterZ + 0.005;
          if (d) {
            const zMid = sampleGarmentSurfaceAbsZ(y, cx, true, d, waistEase + 0.010);
            const zLeft = sampleGarmentSurfaceAbsZ(y, xL, true, d, waistEase + 0.010);
            const zRight = sampleGarmentSurfaceAbsZ(y, xR, true, d, waistEase + 0.010);
            zIn = Math.max(frontOuterZ * 0.85, Math.max(zMid, zLeft, zRight) + 0.006);
          }
          const zOut = zIn + 0.004;
          rPos.push(xL, y, zOut, xR, y, zOut, xR, y, zIn, xL, y, zIn);
          if (r > 0) {
            const a = (r - 1) * 4;
            const b = r * 4;
            for (let sIdxSide = 0; sIdxSide < 4; sIdxSide++) {
              const s1 = (sIdxSide + 1) % 4;
              rIdx.push(a + sIdxSide, b + sIdxSide, b + s1, a + sIdxSide, b + s1, a + s1);
            }
          }
        }
        const ribGeo = new THREE.BufferGeometry();
        ribGeo.setAttribute("position", new THREE.Float32BufferAttribute(rPos, 3));
        ribGeo.setIndex(rIdx);
        ribGeo.computeVertexNormals();
        beltG.add(new THREE.Mesh(ribGeo, strapMat));
      });
    } else {
      const buckleG = new THREE.Group();
      buckleG.position.set(0, waistY, frontOuterZ + 0.0045);

      if (shape === "round_ring") {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(bH * 0.56, bH * 0.13, 14, 28), buckleMat);
        buckleG.add(ring);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(bH * 0.075, bH * 0.075, bH * 1.05, 8), buckleMat);
        bar.position.z = 0.001;
        buckleG.add(bar);
      } else if (shape === "double_ring") {
        [-1, 1].forEach((side) => {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(bH * 0.48, bH * 0.11, 12, 24), buckleMat);
          ring.position.set(side * bH * 0.34, 0, side * 0.002);
          ring.rotation.y = side * 0.18;
          buckleG.add(ring);
        });
      } else if (shape === "oval_medallion") {
        const ov = new THREE.Shape();
        ov.absellipse(0, 0, bW * 0.56, bH * 0.54, 0, Math.PI * 2, false, 0);
        const plaqueGeo = new THREE.ExtrudeGeometry(ov, { depth: bThick * 0.85, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
        const plaque = new THREE.Mesh(plaqueGeo, buckleMat);
        plaque.position.z = -bThick * 0.4;
        buckleG.add(plaque);
        const innerRing = new THREE.Mesh(new THREE.TorusGeometry(bH * 0.36, bH * 0.06, 10, 24), strapMat);
        innerRing.scale.set(bW / bH, 1, 1);
        innerRing.position.z = bThick * 0.65;
        buckleG.add(innerRing);
      } else if (shape === "corset_cinch") {
        const barW = bW * 0.46;
        const barH = bH * 1.75;
        [-1, 1].forEach((side) => {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(barW * 0.24, barH, bThick), buckleMat);
          bar.position.set(side * barW * 0.42, 0, 0);
          buckleG.add(bar);
        });
        for (let r = -1; r <= 1; r++) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(barW * 0.95, 0.004, 0.004), buckleMat);
          brace.position.set(0, r * barH * 0.30, bThick * 0.35);
          buckleG.add(brace);
        }
      } else {
        const bShape = new THREE.Shape();
        bShape.moveTo(-bW / 2, -bH / 2);
        bShape.lineTo(bW / 2, -bH / 2);
        bShape.lineTo(bW / 2, bH / 2);
        bShape.lineTo(-bW / 2, bH / 2);
        bShape.closePath();

        const hole = new THREE.Path();
        const inset = bH * 0.25;
        hole.moveTo(-bW / 2 + inset, -bH / 2 + inset);
        hole.lineTo(bW / 2 - inset, -bH / 2 + inset);
        hole.lineTo(bW / 2 - inset, bH / 2 - inset);
        hole.lineTo(-bW / 2 + inset, bH / 2 - inset);
        hole.closePath();
        bShape.holes.push(hole);

        const buckleGeo = new THREE.ExtrudeGeometry(bShape, { depth: bThick, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
        const buckleMesh = new THREE.Mesh(buckleGeo, buckleMat);
        buckleMesh.position.z = -bThick / 2;
        buckleG.add(buckleMesh);

        const prongGeo = new THREE.CylinderGeometry(0.002, 0.002, bH * 0.82, 8);
        const prongMesh = new THREE.Mesh(prongGeo, buckleMat);
        prongMesh.position.set(0, 0, bThick * 0.5);
        buckleG.add(prongMesh);
      }

      // INVARIANT: beltG.children[1] MUST remain buckleG for dynamic stride tracker
      beltG.add(buckleG);

      // Tailored belt keeper loop + horizontal wrap tongue / runway hanging drop tail
      if (lengthNorm > 0.03) {
        const keeperPhi = clamp(0.055 / Math.max(0.10, sideStrapAbsX), 0.15, 0.65);
        const [, kSurfZ] = d ? getBodySurfacePoint(waistY, keeperPhi, d, waistEase + 0.011) : [0, frontOuterZ];
        const keeperZ = Math.max(frontOuterZ * Math.cos(keeperPhi), kSurfZ) + 0.003;
        const keeper = new THREE.Mesh(new THREE.BoxGeometry(0.012, h * 1.18, strapThick * 2.2), strapMat);
        keeper.position.set(Math.sin(keeperPhi) * sideStrapAbsX * 0.72, waistY, keeperZ);
        keeper.rotation.y = keeperPhi * 0.75;
        beltG.add(keeper);

        // Horizontal belt tongue wrapping around waist up to lengthNorm = 0.35
        const wrapSpanPhi = clamp(lengthNorm, 0, 0.40) * 1.45;
        const W_SEGS = 10;
        const tPos = [];
        const tIdx = [];
        const tyB = waistY - h * 0.44;
        const tyT = waistY + h * 0.44;
        for (let i = 0; i <= W_SEGS; i++) {
          const u = i / W_SEGS;
          const phi = 0.04 + u * wrapSpanPhi;
          const surfZ = d
            ? sampleGarmentSurfaceAbsZ(waistY, Math.sin(phi) * sideStrapAbsX, true, d, waistEase + 0.013)
            : (waistR * 1.06 + waistEase) * zScale * Math.cos(phi);
          const tx = Math.sin(phi) * (sideStrapAbsX * 0.96);
          const zIn = surfZ + 0.0055;
          const zOut = zIn + strapThick;
          tPos.push(tx, tyB, zOut, tx, tyT, zOut, tx, tyT, zIn, tx, tyB, zIn);
          if (i > 0) {
            const a = (i - 1) * 4;
            const b = i * 4;
            for (let s = 0; s < 4; s++) {
              const s1 = (s + 1) % 4;
              tIdx.push(a + s, b + s, b + s1, a + s, b + s1, a + s1);
            }
          }
        }
        const tongueGeo = new THREE.BufferGeometry();
        tongueGeo.setAttribute("position", new THREE.Float32BufferAttribute(tPos, 3));
        tongueGeo.setIndex(tIdx);
        tongueGeo.computeVertexNormals();
        beltG.add(new THREE.Mesh(tongueGeo, strapMat));

        // Vertical runway hanging tail when lengthNorm > 0.35
        if (lengthNorm > 0.35) {
          const dropFrac = (lengthNorm - 0.35) / 0.65;
          const dropLen = 0.06 + dropFrac * 0.38;
          const anchorX = Math.sin(0.04 + wrapSpanPhi) * (sideStrapAbsX * 0.92);
          const halfW = h * 0.44;
          const D_SEGS = Math.max(8, Math.round(dropLen / 0.03));
          const dPos = [];
          const dIdx = [];
          for (let r = 0; r <= D_SEGS; r++) {
            const u = r / D_SEGS;
            const y = waistY - u * dropLen;
            const taper = u > 0.88 ? (1 - (u - 0.88) / 0.14) : 1.0;
            const cx = anchorX + u * 0.018;
            const xL = cx - halfW * taper;
            const xR = cx + halfW * taper;
            const zMid = d ? sampleGarmentSurfaceAbsZ(y, cx, true, d, waistEase + 0.014) : frontOuterZ;
            const zL = d ? sampleGarmentSurfaceAbsZ(y, xL, true, d, waistEase + 0.014) : frontOuterZ;
            const zR = d ? sampleGarmentSurfaceAbsZ(y, xR, true, d, waistEase + 0.014) : frontOuterZ;
            const zIn = Math.max(frontOuterZ * 0.82, Math.max(zMid, zL, zR) + 0.008);
            const zOut = zIn + strapThick;
            dPos.push(xL, y, zOut, xR, y, zOut, xR, y, zIn, xL, y, zIn);
            if (r > 0) {
              const a = (r - 1) * 4;
              const b = r * 4;
              for (let s = 0; s < 4; s++) {
                const s1 = (s + 1) % 4;
                dIdx.push(a + s, b + s, b + s1, a + s, b + s1, a + s1);
              }
            }
          }
          const dropGeo = new THREE.BufferGeometry();
          dropGeo.setAttribute("position", new THREE.Float32BufferAttribute(dPos, 3));
          dropGeo.setIndex(dIdx);
          dropGeo.computeVertexNormals();
          const dropMesh = new THREE.Mesh(dropGeo, strapMat);
          beltG.add(dropMesh);

          // Metallic tip cap at bottom of belt tail
          const tipY = waistY - dropLen;
          const tipZ = (d ? sampleGarmentSurfaceAbsZ(tipY, anchorX + 0.018, true, d, waistEase + 0.014) : frontOuterZ) + 0.010;
          const tipCap = new THREE.Mesh(new THREE.BoxGeometry(halfW * 1.15, 0.011, strapThick * 1.4), buckleMat);
          tipCap.position.set(anchorX + 0.018, tipY + 0.004, tipZ);
          beltG.add(tipCap);
        }
      }
    }
    return beltG;
  }

  function createBowTailRibbonMesh(side, tailLen, halfW, bowPos, isFront, d, accEase, mat) {
    const segs = Math.max(8, Math.round(tailLen / 0.025));
    const rPos = [];
    const rIdx = [];
    for (let r = 0; r <= segs; r++) {
      const u = r / segs;
      const y = bowPos.y - u * tailLen;
      const splay = side * (halfW * 1.05 + u * tailLen * 0.34);
      const cx = bowPos.x + splay;
      const flare = 1 + u * 0.25;
      const xL = cx - halfW * flare;
      const xR = cx + halfW * flare;
      const zMid = d ? sampleGarmentSurfaceAbsZ(y, cx, isFront, d, accEase + 0.006) : Math.abs(bowPos.z);
      const zL = d ? sampleGarmentSurfaceAbsZ(y, xL, isFront, d, accEase + 0.006) : Math.abs(bowPos.z);
      const zR = d ? sampleGarmentSurfaceAbsZ(y, xR, isFront, d, accEase + 0.006) : Math.abs(bowPos.z);
      const absZ = Math.max(Math.abs(bowPos.z) * 0.85, Math.max(zMid, zL, zR) + 0.006);
      const signZ = isFront ? 1 : -1;
      const zFront = signZ * (absZ + 0.003);
      const zBack = signZ * absZ;
      if (r === segs) {
        // V-notched swallowtail ends
        const notchY = y + halfW * 0.95;
        rPos.push(xL, y, zFront, cx, notchY, zFront, xR, y, zFront);
      } else {
        rPos.push(xL, y, zFront, cx, y, zFront, xR, y, zFront);
      }
      if (r > 0) {
        const a = (r - 1) * 3;
        const b = r * 3;
        if (isFront) {
          rIdx.push(a, b, b + 1, a, b + 1, a + 1, a + 1, b + 1, b + 2, a + 1, b + 2, a + 2);
        } else {
          rIdx.push(a, b + 1, b, a, a + 1, b + 1, a + 1, b + 2, b + 1, a + 1, a + 2, b + 2);
        }
      }
      void zBack;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(rPos, 3));
    geo.setIndex(rIdx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  }

  function createBowMesh(cfg, bowPos, isFront, d, accEase, fabricCol = 0x4f46e5) {
    const g = new THREE.Group();
    const shape = cfg.shape || "classic_ribbon";
    const style = cfg.style || "satin";
    const sc = clamp(Number(cfg.size) || 1.0, 0.4, 2.2);
    const lenNorm = clamp(Number(cfg.length) || 0.0, 0.0, 1.0);
    const colHex = style === "matching" && !cfg._explicitColor
      ? fabricCol
      : (cfg.color || "#f8fafc");

    const mat = isSoftwareGL
      ? new THREE.MeshPhongMaterial({ color: colHex, shininess: style === "velvet" ? 16 : 52, specular: 0x444444, side: THREE.DoubleSide })
      : new THREE.MeshPhysicalMaterial({
        color: colHex,
        roughness: style === "velvet" ? 0.84 : (style === "organza" ? 0.42 : 0.28),
        sheen: style === "velvet" ? 0.95 : 0.82,
        sheenRoughness: 0.35,
        transparent: style === "organza",
        opacity: style === "organza" ? 0.82 : 1.0,
        side: THREE.DoubleSide,
      });

    const headG = new THREE.Group();
    headG.position.set(bowPos.x, bowPos.y, bowPos.z);

    if (shape === "rosette_knot") {
      const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.020 * sc, 0.022 * sc, 0.006 * sc, 20), mat);
      baseDisc.rotation.x = Math.PI * 0.5;
      headG.add(baseDisc);
      for (let ring = 0; ring < 2; ring++) {
        const countP = ring === 0 ? 7 : 5;
        const rad = (ring === 0 ? 0.017 : 0.0095) * sc;
        for (let i = 0; i < countP; i++) {
          const ang = (i / countP) * Math.PI * 2 + ring * 0.35;
          const pet = new THREE.Mesh(new THREE.SphereGeometry(0.0095 * sc, 10, 10), mat);
          pet.scale.set(1.18, 0.85, 0.58);
          pet.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, (ring === 0 ? 0.0025 : 0.006) * sc);
          pet.rotation.z = ang;
          headG.add(pet);
        }
      }
      const centerKnot = new THREE.Mesh(new THREE.SphereGeometry(0.0068 * sc, 10, 10), mat);
      centerKnot.position.z = 0.0085 * sc;
      headG.add(centerKnot);
    } else if (shape === "couture_flat") {
      const barW = 0.058 * sc;
      const barH = 0.020 * sc;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(barW, barH, 0.0065 * sc), mat);
      plate.castShadow = true;
      headG.add(plate);
      [-1, 1].forEach((side) => {
        const fold = new THREE.Mesh(new THREE.BoxGeometry(barW * 0.40, barH * 1.15, 0.0085 * sc), mat);
        fold.position.set(side * barW * 0.28, 0, 0.0016 * sc);
        fold.rotation.y = side * -0.14;
        headG.add(fold);
      });
      const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.011 * sc, barH * 1.22, 0.011 * sc), mat);
      wrap.position.z = 0.002 * sc;
      headG.add(wrap);
    } else {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.0078 * sc, 12, 10), mat);
      knot.scale.set(0.95, 1.15, 0.90);
      headG.add(knot);

      const drawLoopHalf = (side, wSpan, hSpan, tiltZ, zOff = 0) => {
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.bezierCurveTo(side * wSpan * 0.45, hSpan * 0.78, side * wSpan, hSpan * 0.64, side * wSpan, 0);
        s.bezierCurveTo(side * wSpan, -hSpan * 0.64, side * wSpan * 0.45, -hSpan * 0.78, 0, 0);
        const lGeo = new THREE.ExtrudeGeometry(s, {
          depth: 0.0068 * sc,
          bevelEnabled: true,
          bevelThickness: 0.0018 * sc,
          bevelSize: 0.0018 * sc,
          bevelSegments: 2,
        });
        const lMesh = new THREE.Mesh(lGeo, mat);
        lMesh.rotation.z = side * tiltZ;
        lMesh.rotation.y = side * -0.12;
        lMesh.position.z = -0.002 * sc + zOff;
        lMesh.castShadow = true;
        return lMesh;
      };

      [-1, 1].forEach((side) => {
        headG.add(drawLoopHalf(side, 0.036 * sc, 0.025 * sc, 0.14, 0));
        if (shape === "butterfly_double") {
          headG.add(drawLoopHalf(side, 0.029 * sc, 0.019 * sc, -0.40, 0.0016 * sc));
        }
      });
    }

    if (!isFront) headG.rotation.y = Math.PI;
    g.add(headG);

    if (lenNorm > 0.02) {
      const tailLen = lenNorm * (0.28 + 0.14 * clamp(sc, 0.6, 1.5));
      const halfW = 0.0055 * sc;
      [-1, 1].forEach((side) => {
        const rib = createBowTailRibbonMesh(side, tailLen, halfW, bowPos, isFront, d, accEase, mat);
        g.add(rib);
      });
    }
    return g;
  }

  function createBroochMesh(cfg, posVec, d, accEase, fabricCol = 0x4f46e5) {
    const brG = new THREE.Group();
    const shape = cfg.shape || "floral_star";
    const style = cfg.style || "gold";
    const sc = clamp(Number(cfg.size) || 1.0, 0.5, 2.0);
    const lenNorm = clamp(Number(cfg.length) || 0.0, 0.0, 1.0);
    const metalMat = createAccessoryFinishMaterial(style, null, fabricCol);
    const defaultAccent = style === "pearl_crystal" ? 0xf8fafc : (style === "silver" ? 0x1d4ed8 : 0xbe123c);
    const accentHex = cfg.color != null ? new THREE.Color(cfg.color).getHex() : defaultAccent;
    const gemMat = createAccessoryFinishMaterial("pearl", accentHex, fabricCol);
    const tasselMat = isSoftwareGL
      ? new THREE.MeshPhongMaterial({ color: accentHex, shininess: 22, specular: 0x333333, side: THREE.DoubleSide })
      : new THREE.MeshPhysicalMaterial({ color: accentHex, roughness: 0.42, sheen: 0.75, sheenRoughness: 0.4, side: THREE.DoubleSide });

    const headG = new THREE.Group();
    headG.position.set(posVec.x, posVec.y, posVec.z);

    const r = 0.014 * sc;
    if (shape === "geometric_diamond") {
      const dm = new THREE.Shape();
      dm.moveTo(0, r * 1.25);
      dm.lineTo(r * 0.95, 0);
      dm.lineTo(0, -r * 1.25);
      dm.lineTo(-r * 0.95, 0);
      dm.closePath();
      const hole = new THREE.Path();
      hole.moveTo(0, r * 0.65);
      hole.lineTo(r * 0.48, 0);
      hole.lineTo(0, -r * 0.65);
      hole.lineTo(-r * 0.48, 0);
      hole.closePath();
      dm.holes.push(hole);
      const frame = new THREE.Mesh(
        new THREE.ExtrudeGeometry(dm, { depth: 0.003 * sc, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 2 }),
        metalMat
      );
      headG.add(frame);
      const stone = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.44, 0), gemMat);
      stone.scale.set(0.8, 1.1, 0.55);
      stone.position.z = 0.0035 * sc;
      headG.add(stone);
    } else if (shape === "crescent_pearl") {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r * 0.85, r * 0.16, 12, 24, Math.PI * 1.35), metalMat);
      arc.rotation.z = Math.PI * 0.35;
      headG.add(arc);
      const pearlMat = createAccessoryFinishMaterial("pearl", 0xf8fafc, fabricCol);
      for (let i = -2; i <= 2; i++) {
        const ang = Math.PI * 0.5 + i * 0.32;
        const pRad = (0.28 - Math.abs(i) * 0.04) * r;
        const prl = new THREE.Mesh(new THREE.SphereGeometry(pRad, 10, 10), i === 0 ? gemMat : pearlMat);
        prl.position.set(Math.cos(ang) * r * 0.85, Math.sin(ang) * r * 0.85, 0.002 * sc);
        headG.add(prl);
      }
    } else if (shape === "bar_pin") {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.14, r * 0.14, r * 3.1, 10), metalMat);
      bar.rotation.z = Math.PI * 0.5;
      headG.add(bar);
      [-1, 1].forEach((s) => {
        const finial = new THREE.Mesh(new THREE.SphereGeometry(r * 0.25, 10, 10), metalMat);
        finial.position.set(s * r * 1.55, 0, 0);
        headG.add(finial);
      });
      const solitaire = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 12, 12), gemMat);
      solitaire.scale.set(1, 1, 0.65);
      solitaire.position.z = 0.0025 * sc;
      headG.add(solitaire);
    } else {
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const ray = new THREE.Mesh(new THREE.ConeGeometry(r * 0.26, r * 1.05, 6), metalMat);
        ray.position.set(Math.cos(ang) * r * 0.52, Math.sin(ang) * r * 0.52, 0.001 * sc);
        ray.rotation.z = ang - Math.PI * 0.5;
        ray.scale.set(1, 1, 0.35);
        headG.add(ray);
      }
      const stone = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 14, 12), gemMat);
      stone.scale.set(1, 1, 0.58);
      stone.position.z = 0.003 * sc;
      headG.add(stone);
    }
    brG.add(headG);

    if (lenNorm > 0.02) {
      const dropLen = 0.025 + lenNorm * 0.22;
      const capY = posVec.y - r * 1.05;
      const capZ = (d ? sampleGarmentSurfaceAbsZ(capY, posVec.x, true, d, accEase + 0.005) : posVec.z) + 0.006;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.22, r * 0.06, 8, 16), metalMat);
      ring.position.set(posVec.x, posVec.y - r * 0.78, capZ);
      brG.add(ring);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, r * 0.55, 12), metalMat);
      cap.position.set(posVec.x, capY, capZ);
      brG.add(cap);

      const SEGS = Math.max(8, Math.round(dropLen / 0.022));
      const N_SIDES = 10;
      const tPos = [];
      const tIdx = [];
      for (let row = 0; row <= SEGS; row++) {
        const u = row / SEGS;
        const y = capY - r * 0.2 - u * dropLen;
        const rad = r * (0.30 + u * 0.52);
        const cz = (d ? sampleGarmentSurfaceAbsZ(y, posVec.x, true, d, accEase + 0.006) : posVec.z) + 0.006 + rad * 0.65;
        for (let k = 0; k <= N_SIDES; k++) {
          const ang = (k / N_SIDES) * Math.PI * 2;
          tPos.push(posVec.x + Math.cos(ang) * rad, y, cz + Math.sin(ang) * rad * 0.55);
        }
        if (row > 0) {
          const a = (row - 1) * (N_SIDES + 1);
          const b = row * (N_SIDES + 1);
          for (let k = 0; k < N_SIDES; k++) {
            tIdx.push(a + k, b + k, b + k + 1, a + k, b + k + 1, a + k + 1);
          }
        }
      }
      const tasselGeo = new THREE.BufferGeometry();
      tasselGeo.setAttribute("position", new THREE.Float32BufferAttribute(tPos, 3));
      tasselGeo.setIndex(tIdx);
      tasselGeo.computeVertexNormals();
      brG.add(new THREE.Mesh(tasselGeo, tasselMat));
    }

    return brG;
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
    const bowCfg = accessoriesState.bow;
    const broochCfg = accessoriesState.brooch;
    const waistYY = d.hipY + d.span * 0.44;
    const hemY = resolveGarmentHemY(d);
    const zScale = d.female ? 0.72 : 0.78;
    const easeBodice = 0.017 + Math.max(-0.002, ((curPatternMetrics?.bodice?.easeRatio || 1.04) - 1.0) * 0.042);
    const hasOuterVis = isPartCurrentlyShown("outer") && Boolean(curPatternMetrics?.bodice?.outerLayer?.enabled);
    const accEase = hasOuterVis ? (0.026 + Math.max(0, ((curPatternMetrics.bodice.easeRatio || 1.04) - 1.0) * 0.040)) : easeBodice;
    const baseCol = fabricState.bodice?.front?.color || 0x4f46e5;

    const spanTargetY = (topY, frac) => {
      if (frac <= 0.5) {
        const tLocal = clamp((frac - 0.15) / 0.35, 0.15, 1.0);
        return topY - (topY - waistYY) * tLocal;
      }
      const tExt = clamp((frac - 0.5) / 0.5, 0.0, 1.0);
      return waistYY - (waistYY - Math.min(waistYY - 0.04, hemY)) * tExt;
    };

    if (bCfg && bCfg.enabled) {
      const count = Math.max(1, Math.min(14, bCfg.count || 6));
      const style = bCfg.style || "gold";
      const shape = bCfg.shape || "classic_round";
      const size = clamp(Number(bCfg.size) || 1.0, 0.5, 2.0);
      const lenFrac = clamp(Number(bCfg.lengthFrac) || 0.5, 0.2, 1.0);
      const customCol = bCfg.color || null;

      const btnOutZ = 0.0038 + size * 0.0022;
      if (bCfg.placement === "front_placket") {
        const startY = d.hipY + d.span * 0.73;
        const endY = spanTargetY(startY, lenFrac);
        const step = (startY - endY) / (count + 1);
        for (let i = 1; i <= count; i++) {
          const y = startY - step * i;
          const zFront = sampleGarmentSurfaceAbsZ(y, 0, true, d, accEase);
          const btn = createButtonMesh(size, style, baseCol, shape, customCol);
          btn.position.set(0, y, zFront + btnOutZ);
          btn.userData.parentPart = y < waistYY - 0.03 && isPartCurrentlyShown("skirt") ? "skirt" : "bodice";
          btn.userData.accType = "buttons";
          attachAccessoryRigAnchor(btn, torsoGarmentWeights(y, 0, d));
          accessoriesGroup.add(btn);
        }
      } else if (bCfg.placement === "double_breasted") {
        const startY = d.hipY + d.span * 0.73;
        const endY = spanTargetY(startY, lenFrac);
        const rows = Math.max(1, Math.round(count / 2));
        const step = (startY - endY) / (rows + 1);
        const colOffset = 0.046;
        for (let i = 1; i <= rows; i++) {
          const y = startY - step * i;
          const zFront = sampleGarmentSurfaceAbsZ(y, colOffset, true, d, accEase);
          [-1, 1].forEach((col) => {
            const btn = createButtonMesh(size, style, baseCol, shape, customCol);
            btn.position.set(col * colOffset, y, zFront + btnOutZ);
            btn.userData.parentPart = y < waistYY - 0.03 && isPartCurrentlyShown("skirt") ? "skirt" : "bodice";
            btn.userData.accType = "buttons";
            attachAccessoryRigAnchor(btn, torsoGarmentWeights(y, col * colOffset, d));
            accessoriesGroup.add(btn);
          });
        }
      } else if (bCfg.placement === "center_back") {
        const startY = d.hipY + d.span * 0.74;
        const endY = spanTargetY(startY, lenFrac);
        const step = (startY - endY) / (count + 1);
        for (let i = 1; i <= count; i++) {
          const y = startY - step * i;
          const zBack = sampleGarmentSurfaceAbsZ(y, 0, false, d, accEase);
          const btn = createButtonMesh(size, style, baseCol, shape, customCol);
          btn.position.set(0, y, -(zBack + btnOutZ));
          btn.rotation.y = Math.PI;
          btn.userData.parentPart = y < waistYY - 0.03 && isPartCurrentlyShown("skirt") ? "skirt" : "bodice";
          btn.userData.accType = "buttons";
          attachAccessoryRigAnchor(btn, torsoGarmentWeights(y, 0, d));
          accessoriesGroup.add(btn);
        }
      } else if (bCfg.placement === "waistband") {
        const wbCount = Math.min(5, Math.max(1, count > 6 ? 2 : (count >= 4 ? 2 : 1)));
        const spread = 0.024 + (lenFrac - 0.2) * 0.05;
        for (let i = 0; i < wbCount; i++) {
          const bx = wbCount === 1 ? 0 : (i - (wbCount - 1) * 0.5) * spread;
          const zFront = sampleGarmentSurfaceAbsZ(waistYY, bx, true, d, 0.019);
          const btn = createButtonMesh(1.15 * size, style, baseCol, shape, customCol);
          btn.position.set(bx, waistYY, zFront + btnOutZ);
          btn.userData.parentPart = "trousers";
          btn.userData.accType = "buttons";
          attachAccessoryRigAnchor(btn, [[BONE_IDX.pelvis, 0.62], [BONE_IDX.spine, 0.38]]);
          accessoriesGroup.add(btn);
        }
      } else if (bCfg.placement === "shoulder_epaulette") {
        const perSide = Math.max(1, Math.min(4, Math.round(count / 2)));
        const spanW = 0.03 + lenFrac * 0.075;
        [-1, 1].forEach((side) => {
          for (let i = 0; i < perSide; i++) {
            const u = perSide === 1 ? 0.5 : i / (perSide - 1);
            const bx = side * (d.neckR + 0.018 + u * spanW);
            const by = d.shoulderY - 0.005 - u * 0.016;
            const zFront = sampleGarmentSurfaceAbsZ(by, bx, true, d, accEase);
            const btn = createButtonMesh(0.85 * size, style, baseCol, shape, customCol);
            btn.position.set(bx, by, zFront * 0.25 + 0.008);
            btn.rotation.x = -Math.PI * 0.42;
            btn.userData.parentPart = "bodice";
            btn.userData.accType = "buttons";
            attachAccessoryRigAnchor(btn, torsoGarmentWeights(by, bx, d));
            accessoriesGroup.add(btn);
          }
        });
      } else if (bCfg.placement === "cuffs") {
        const slFrac = clamp(curPatternMetrics?.sleeve?.lengthFrac || 0.96, 0.16, 1.02);
        const totalSlLen = d.armLen * slFrac;
        const pivotX = d.shoulderHalf * 0.82;
        const pivotY = d.shoulderY - d.span * 0.035;
        const upperArmLen = d.armLen * 0.48;
        const wristDist = d.armLen * 0.94;
        const wristR = Math.max(d.upperR * (d.female ? 0.50 : 0.53), d.H * 0.0148);
        const cuffStep = 0.014 + lenFrac * 0.016;
        const sleeveMeshes = [];
        garmentGroup.traverse((o) => {
          if (o.isMesh && (o.name === "sleeve" || o.userData?.parentPart === "sleeve")) sleeveMeshes.push(o);
        });

        [-1, 1].forEach((s) => {
          const bArm = s > 0 ? BONE_IDX.armL : BONE_IDX.armR;
          const bElbow = s > 0 ? BONE_IDX.elbowL : BONE_IDX.elbowR;
          const bHand = s > 0 ? BONE_IDX.handL : BONE_IDX.handR;
          const cuffCount = Math.min(4, count);
          for (let i = 0; i < cuffCount; i++) {
            const dy = clamp(totalSlLen - 0.018 - i * cuffStep, 0.028, totalSlLen - 0.008);
            const armRad = dy <= upperArmLen
              ? d.upperR * (1.07 * (1 - dy / upperArmLen) + 0.79 * (dy / upperArmLen))
              : d.upperR * (0.79 * (1 - clamp((dy - upperArmLen) / (d.armLen * 0.46), 0, 1)) + (wristR / d.upperR) * 1.18 * clamp((dy - upperArmLen) / (d.armLen * 0.46), 0, 1));
            const cuffR = armRad + 0.016;
            const by = pivotY - dy;
            let maxAbsX = pivotX + cuffR;
            for (const sm of sleeveMeshes) {
              const arr = sm.geometry?.userData?.restPos || sm.geometry?.attributes?.position?.array;
              if (!arr) continue;
              for (let vi = 0; vi < arr.length; vi += 3) {
                const vx = arr[vi], vy = arr[vi + 1], vz = arr[vi + 2];
                if (vx * s > 0 && Math.abs(vy - by) <= 0.032 && Math.abs(vz) <= 0.028) {
                  const ax = Math.abs(vx);
                  if (ax > maxAbsX) maxAbsX = ax;
                }
              }
            }
            const btn = createButtonMesh(0.75 * size, style, baseCol, shape, customCol);
            btn.position.set(s * (maxAbsX + 0.0038 + size * 0.0018), by, 0.002);
            btn.rotation.y = (s * Math.PI) / 2;
            btn.userData.parentPart = "sleeve";
            btn.userData.accType = "buttons";

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
      const shape = zCfg.shape || "classic_tab";
      const size = clamp(Number(zCfg.size) || 1.0, 0.6, 1.8);
      const lenFrac = clamp(Number(zCfg.lengthFrac) || 0.5, 0.2, 1.0);
      const openPct = clamp(Number(zCfg.openPct) || 0, 0, 0.75);
      const zOpts = {
        shape,
        size,
        customColor: zCfg.color || null,
        tapeColor: zCfg.tapeColor || null,
        fabricCol: baseCol,
        skinD: d,
        xCenter: 0,
      };

      if (zCfg.placement === "center_front") {
        const startY = d.hipY + d.span * 0.73;
        const endY = spanTargetY(startY, lenFrac);
        const zip = createZipperMesh(
          startY,
          endY,
          (y) => sampleGarmentSurfaceAbsZ(y, 0, true, d, accEase + 0.003),
          style,
          openPct,
          zOpts
        );
        zip.userData.parentPart = "bodice";
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "center_back") {
        const startY = d.hipY + d.span * 0.74;
        const backMid = lenFrac <= 0.5
          ? startY - (startY - d.hipY) * clamp((lenFrac - 0.15) / 0.35, 0.15, 1.0)
          : d.hipY - (d.hipY - Math.min(d.hipY - 0.02, hemY)) * clamp((lenFrac - 0.5) / 0.5, 0, 1);
        const zip = createZipperMesh(
          startY,
          backMid,
          (y) => sampleGarmentSurfaceAbsZ(y, 0, false, d, accEase + 0.003),
          style,
          openPct,
          { ...zOpts, isBack: true }
        );
        zip.userData.parentPart = "bodice";
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "biker_asymmetric") {
        const startY = d.shoulderY - d.span * 0.09;
        const endY = spanTargetY(startY, lenFrac);
        const zip = createZipperMesh(
          startY,
          endY,
          (y) => sampleGarmentSurfaceAbsZ(y, 0.032, true, d, accEase + 0.005),
          style,
          openPct,
          { ...zOpts, xCenter: 0.032 }
        );
        zip.userData.parentPart = "bodice";
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "trouser_fly") {
        const flyEnd = d.hipY - d.span * (0.04 + lenFrac * 0.14);
        const zip = createZipperMesh(
          waistYY,
          flyEnd,
          (y) => sampleGarmentSurfaceAbsZ(y, 0, true, d, 0.022),
          style,
          openPct,
          {
            ...zOpts,
            weightsFn: () => [[BONE_IDX.pelvis, 0.85], [BONE_IDX.spine, 0.15]],
          }
        );
        zip.userData.parentPart = "trousers";
        accessoriesGroup.add(zip);
      }
    }

    if (beltCfg && beltCfg.enabled) {
      const bStyle = beltCfg.style || "leather_gold";
      const bWidth = beltCfg.width || "medium";
      const customBeltCol = beltCfg.color ? new THREE.Color(beltCfg.color).getHex() : null;
      const beltBaseCol = fabricState.bodice?.front?.color || fabricState.skirt?.front?.color || fabricState.trousers?.front?.color || 0x4f46e5;
      const belt = createBeltMesh(waistYY, d.waistR, zScale, bStyle, bWidth, beltBaseCol, d, accEase, customBeltCol, {
        shape: beltCfg.shape || null,
        size: beltCfg.size,
        length: beltCfg.length,
        buckleColor: beltCfg.buckleColor || null,
      });
      belt.userData.parentPart = "waist";
      attachAccessoryRigAnchor(belt, [[BONE_IDX.pelvis, 0.58], [BONE_IDX.spine, 0.42]]);
      accessoriesGroup.add(belt);
    }

    if (bowCfg && bowCfg.enabled) {
      const isBrief = Boolean(curPatternMetrics?.trousers?.briefRise);
      const isIntimate = isBrief || curPatternMetrics?.bodice?.style === "bra";
      const bowSize = bowCfg.size != null ? clamp(Number(bowCfg.size), 0.4, 2.2) : (isIntimate ? 0.45 : 1.0);
      const bowLen = bowCfg.length != null ? clamp(Number(bowCfg.length), 0.0, 1.0) : (isIntimate ? 0.15 : 0.40);
      let bx = 0, by = d.hipY + d.span * 0.67, isFront = true;
      let parentPart = "bodice";
      if (bowCfg.placement === "waist") {
        by = isBrief
          ? (d.hipY + d.span * (curPatternMetrics.trousers.briefRise === "high" ? 0.36 : 0.14))
          : waistYY;
        parentPart = isBrief ? "trousers" : "waist";
      } else if (bowCfg.placement === "neck_tie") {
        by = d.hipY + d.span * 0.83;
      } else if (bowCfg.placement === "back_waist") {
        by = waistYY;
        isFront = false;
        parentPart = "waist";
      } else if (bowCfg.placement === "left_shoulder") {
        bx = -d.shoulderHalf * 0.62;
        by = d.shoulderY - d.span * 0.04;
      }
      const surfZ = sampleGarmentSurfaceAbsZ(by, bx, isFront, d, accEase);
      const bowPos = { x: bx, y: by, z: (isFront ? 1 : -1) * (surfZ + 0.005) };
      const bow = createBowMesh({
        ...bowCfg,
        size: bowSize,
        length: bowLen,
        _explicitColor: Boolean(bowCfg.color && bowCfg.color !== "#f8fafc"),
      }, bowPos, isFront, d, accEase, baseCol);
      bow.userData.parentPart = parentPart;
      attachAccessoryRigAnchor(bow, torsoGarmentWeights(by, bx, d));
      accessoriesGroup.add(bow);
    }

    if (broochCfg && broochCfg.enabled) {
      let px = d.chestHalf ? d.chestHalf * 0.46 : 0.075;
      let py = d.hipY + d.span * 0.72;
      let parentPart = "bodice";
      if (broochCfg.placement === "center_neck") {
        px = 0;
        py = d.hipY + d.span * 0.82;
      } else if (broochCfg.placement === "right_chest") {
        px = -(d.chestHalf ? d.chestHalf * 0.46 : 0.075);
      } else if (broochCfg.placement === "left_shoulder") {
        px = d.shoulderHalf * 0.56;
        py = d.shoulderY - d.span * 0.045;
      } else if (broochCfg.placement === "waist_side") {
        px = (d.waistR || 0.12) * 0.58;
        py = waistYY;
        parentPart = "waist";
      }
      const surfZ = sampleGarmentSurfaceAbsZ(py, px, true, d, accEase);
      const br = createBroochMesh(broochCfg, { x: px, y: py, z: surfZ + 0.005 }, d, accEase, baseCol);
      br.userData.parentPart = parentPart;
      attachAccessoryRigAnchor(br, torsoGarmentWeights(py, px, d));
      accessoriesGroup.add(br);
    }
  }

  function setAccessories(cfg) {
    if (!cfg) return;
    accessoriesState = normalizeAccessoriesState(accessoriesState, cfg, false);
    if (ready && lastDims) {
      buildAccessories(lastDims);
      applyPieceVisibility();
      updateAccessoriesPose();
    }
  }

  function resolveGarmentMeshStitchPart(mesh) {
    if (!mesh) return "bodice";
    if (mesh.userData?.garmentType === "collar" || mesh.name === "trim") return "trim";
    if (mesh.name === "outer" || mesh.userData?.parentPart === "outer") return "outer";
    if (mesh.name === "sleeve" || mesh.userData?.parentPart === "sleeve") return "sleeve";
    if (mesh.name === "skirt" || mesh.userData?.parentPart === "skirt") return "skirt";
    if (mesh.name === "trousers" || mesh.userData?.parentPart === "trousers") return "trousers";
    return "bodice";
  }

  function getActiveStitchParts() {
    const present = new Set();
    if (garmentGroup) {
      garmentGroup.traverse((o) => {
        if (!o.isMesh || o.userData?.isStitch || o.name === "accessories") return;
        let ancestor = o.parent;
        let isAcc = false;
        while (ancestor && ancestor !== garmentGroup) {
          if (ancestor.name === "accessories" || ancestor.name === "stitches") { isAcc = true; break; }
          ancestor = ancestor.parent;
        }
        if (isAcc || !o.visible) return;
        present.add(resolveGarmentMeshStitchPart(o));
      });
    }
    return Object.keys(STITCH_PART_INDEX).filter((k) => present.has(k));
  }

  function resolvePartThreadHex(partKey) {
    const baseNum = fabricState[partKey]?.front?.color ?? fabricState.bodice?.front?.color ?? 0x4f46e5;
    const baseHex = typeof baseNum === "number" ? ("#" + (baseNum & 0xffffff).toString(16).padStart(6, "0")) : baseNum;
    return resolveStitchThreadColor({
      partKey,
      baseFabricHex: baseHex,
      stitchConfig: stitchState,
      lookbookContrastHex: lastLookbookContrastHex,
    });
  }

  function extractBoundaryChainsFromMesh(mesh) {
    const geo = mesh.geometry;
    const restPos = geo.userData?.restPos;
    const posArr = restPos || geo.attributes?.position?.array;
    const indexAttr = geo.index;
    if (!posArr || !indexAttr) return null;

    const idxArr = indexAttr.array;
    const normAttr = geo.attributes?.normal || null;
    const triCount = Math.floor(idxArr.length / 3);
    const edgeMap = new Map();
    const recordEdge = (a, b, opp, ti) => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const existing = edgeMap.get(k);
      if (existing) existing.count += 1;
      else edgeMap.set(k, { a, b, opp, ti, count: 1 });
    };
    for (let t = 0; t < triCount; t++) {
      const i0 = idxArr[t * 3], i1 = idxArr[t * 3 + 1], i2 = idxArr[t * 3 + 2];
      recordEdge(i0, i1, i2, t);
      recordEdge(i1, i2, i0, t);
      recordEdge(i2, i0, i1, t);
    }

    const boundarySegs = [];
    for (const edge of edgeMap.values()) {
      if (edge.count !== 1) continue;
      const a3 = edge.a * 3, b3 = edge.b * 3, c3 = edge.opp * 3;
      const ax = posArr[a3], ay = posArr[a3 + 1], az = posArr[a3 + 2];
      const bx = posArr[b3], by = posArr[b3 + 1], bz = posArr[b3 + 2];
      const cx = posArr[c3], cy = posArr[c3 + 1], cz = posArr[c3 + 2];
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const segLen = Math.hypot(dx, dy, dz);
      if (segLen < 0.002) continue;

      const u1x = bx - ax, u1y = by - ay, u1z = bz - az;
      const u2x = cx - ax, u2y = cy - ay, u2z = cz - az;
      let nx = u1y * u2z - u1z * u2y;
      let ny = u1z * u2x - u1x * u2z;
      let nz = u1x * u2y - u1y * u2x;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen; ny /= nLen; nz /= nLen;

      const midX = (ax + bx) * 0.5, midZ = (az + bz) * 0.5;
      if (normAttr) {
        const vnx = normAttr.getX(edge.a) + normAttr.getX(edge.b);
        const vny = normAttr.getY(edge.a) + normAttr.getY(edge.b);
        const vnz = normAttr.getZ(edge.a) + normAttr.getZ(edge.b);
        if (Math.hypot(vnx, vny, vnz) > 1e-4) {
          if (nx * vnx + ny * vny + nz * vnz < 0) {
            nx = -nx; ny = -ny; nz = -nz;
          }
        } else if (Math.hypot(midX, midZ) > 0.02 && (nx * midX + nz * midZ) < 0) {
          nx = -nx; ny = -ny; nz = -nz;
        }
      } else if (Math.hypot(midX, midZ) > 0.02 && (nx * midX + nz * midZ) < 0) {
        nx = -nx; ny = -ny; nz = -nz;
      }

      const tx = dx / segLen, ty = dy / segLen, tz = dz / segLen;
      const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
      let ix = cx - mx, iy = cy - my, iz = cz - mz;
      const alongT = ix * tx + iy * ty + iz * tz;
      ix -= tx * alongT; iy -= ty * alongT; iz -= tz * alongT;
      const alongN = ix * nx + iy * ny + iz * nz;
      ix -= nx * alongN; iy -= ny * alongN; iz -= nz * alongN;
      const iLen = Math.hypot(ix, iy, iz) || 1;
      ix /= iLen; iy /= iLen; iz /= iLen;

      boundarySegs.push({
        a: edge.a, b: edge.b, segLen,
        ax, ay, az, bx, by, bz,
        tx, ty, tz, nx, ny, nz, ix, iy, iz,
      });
    }
    if (!boundarySegs.length) return null;

    // Group unordered boundary segments into connected chains for uniform stitch pitch
    const adj = new Map();
    boundarySegs.forEach((s, i) => {
      if (!adj.has(s.a)) adj.set(s.a, []);
      if (!adj.has(s.b)) adj.set(s.b, []);
      adj.get(s.a).push(i);
      adj.get(s.b).push(i);
    });

    const used = new Uint8Array(boundarySegs.length);
    const chains = [];
    const orderedFirst = [];
    for (let i = 0; i < boundarySegs.length; i++) {
      if ((adj.get(boundarySegs[i].a)?.length || 0) === 1 || (adj.get(boundarySegs[i].b)?.length || 0) === 1) {
        orderedFirst.push(i);
      }
    }
    for (let i = 0; i < boundarySegs.length; i++) orderedFirst.push(i);

    for (const startIdx of orderedFirst) {
      if (used[startIdx]) continue;
      let chain = [];
      let curIdx = startIdx;
      let forward = (adj.get(boundarySegs[curIdx].a)?.length || 0) === 1 || (adj.get(boundarySegs[curIdx].b)?.length || 0) !== 1;
      while (curIdx !== -1 && !used[curIdx]) {
        used[curIdx] = 1;
        const raw = boundarySegs[curIdx];
        const seg = forward
          ? raw
          : {
            ...raw,
            a: raw.b, b: raw.a,
            ax: raw.bx, ay: raw.by, az: raw.bz,
            bx: raw.ax, by: raw.ay, bz: raw.az,
            tx: -raw.tx, ty: -raw.ty, tz: -raw.tz,
          };
        if (chain.length > 0) {
          const prev = chain[chain.length - 1];
          const dot = prev.tx * seg.tx + prev.ty * seg.ty + prev.tz * seg.tz;
          if (dot < 0.25) {
            chains.push(chain);
            chain = [];
          }
        }
        chain.push(seg);
        let nextIdx = -1, nextFwd = true;
        const cands = adj.get(seg.b) || [];
        for (const cand of cands) {
          if (used[cand]) continue;
          nextIdx = cand;
          nextFwd = boundarySegs[cand].a === seg.b;
          break;
        }
        curIdx = nextIdx;
        forward = nextFwd;
      }
      if (chain.length) chains.push(chain);
    }

    return { chains, skinIdx: geo.userData?.skinIdx || null, skinWgt: geo.userData?.skinWgt || null };
  }

  function appendStitchDashQuad(buf, seg, u0, u1, insetM, halfW, liftM, isZig, zigStep, zigAmpM, skinIdx, skinWgt) {
    const SLICES = 3;
    const baseVert = buf.pos.length / 3;
    const endIdx = ((u0 + u1) * 0.5) < 0.5 ? seg.a : seg.b;
    const skOff = endIdx * 4;
    const si0 = skinIdx ? skinIdx[skOff] : 0;
    const si1 = skinIdx ? skinIdx[skOff + 1] : 0;
    const si2 = skinIdx ? skinIdx[skOff + 2] : 0;
    const si3 = skinIdx ? skinIdx[skOff + 3] : 0;
    const sw0 = skinWgt ? skinWgt[skOff] : 1;
    const sw1 = skinWgt ? skinWgt[skOff + 1] : 0;
    const sw2 = skinWgt ? skinWgt[skOff + 2] : 0;
    const sw3 = skinWgt ? skinWgt[skOff + 3] : 0;

    for (let s = 0; s <= SLICES; s++) {
      const f = s / SLICES;
      const u = u0 + (u1 - u0) * f;
      const px = seg.ax + (seg.bx - seg.ax) * u;
      const py = seg.ay + (seg.by - seg.ay) * u;
      const pz = seg.az + (seg.bz - seg.az) * u;

      const archLift = (0.00135 + liftM * Math.sin(Math.PI * f));
      const zag = isZig ? (((zigStep % 2) === 0 ? -1 : 1) * zigAmpM * (f - 0.5) * 2.0) : 0;
      const offIn = insetM + zag;

      for (const side of [-1, 1]) {
        const wOff = side * halfW;
        const vx = px + seg.ix * (offIn + wOff) + seg.nx * archLift;
        const vy = py + seg.iy * (offIn + wOff) + seg.ny * archLift;
        const vz = pz + seg.iz * (offIn + wOff) + seg.nz * archLift;
        buf.pos.push(vx, vy, vz);
        buf.uvs.push(u, side > 0 ? 1 : 0);
        buf.si.push(si0, si1, si2, si3);
        buf.sw.push(sw0, sw1, sw2, sw3);
      }
    }
    for (let s = 0; s < SLICES; s++) {
      const r0 = baseVert + s * 2;
      const r1 = r0 + 2;
      buf.idx.push(r0, r0 + 1, r1 + 1, r0, r1 + 1, r1);
    }
  }

  function buildStitches(d, pm, skeleton) {
    if (stitchesGroup) {
      if (garmentGroup) garmentGroup.remove(stitchesGroup);
      disposeObject3D(stitchesGroup);
    }
    stitchesGroup = new THREE.Group();
    stitchesGroup.name = "stitches";
    stitchMaterialsByPart = {};
    if (garmentGroup) garmentGroup.add(stitchesGroup);

    if (!stitchState.enabled || !garmentGroup) return;

    const styleSpec = STITCH_STYLES[stitchState.style] || STITCH_STYLES.lockstitch;
    const dashM = styleSpec.dashMm * 0.001;
    const gapM = styleSpec.gapMm * 0.001;
    const pitchM = Math.max(0.0015, dashM + gapM);
    const halfW = Math.max(0.00105, styleSpec.widthMm * 0.00145);
    const liftM = styleSpec.liftMm * 0.001 + 0.0004;
    const isZig = styleSpec.id === "zigzag";
    const zigAmpM = (styleSpec.amplitudeMm || 0) * 0.001;
    const rowOffsets = styleSpec.rows === 2
      ? [
        (styleSpec.insetMm - (styleSpec.rowSpacingMm || 3.2) * 0.5) * 0.001,
        (styleSpec.insetMm + (styleSpec.rowSpacingMm || 3.2) * 0.5) * 0.001,
      ]
      : [styleSpec.insetMm * 0.001];

    const isClosedOuterCover = Boolean(pm?.bodice?.outerLayer?.enabled && !pm.bodice.outerLayer.isOpenFront);
    const partBuckets = {};

    const sourceMeshes = [];
    garmentGroup.traverse((o) => {
      if (!o.isMesh || o.userData?.isStitch || !o.geometry?.attributes?.position) return;
      let ancestor = o.parent;
      while (ancestor && ancestor !== garmentGroup) {
        if (ancestor.name === "accessories" || ancestor.name === "stitches") return;
        ancestor = ancestor.parent;
      }
      if (o.userData?.isBraStrap) return;
      sourceMeshes.push(o);
    });

    for (const srcMesh of sourceMeshes) {
      const partKey = resolveGarmentMeshStitchPart(srcMesh);
      if (stitchState.visibility === "external" && srcMesh.userData?.isInternal) continue;
      if (stitchState.visibility === "external" && partKey === "bodice" && isClosedOuterCover) continue;

      const extracted = extractBoundaryChainsFromMesh(srcMesh);
      if (!extracted) continue;

      if (!partBuckets[partKey]) {
        partBuckets[partKey] = {
          pos: [], uvs: [], si: [], sw: [], idx: [],
          fitTier: srcMesh.userData?.fitTier || "regular",
          armSide: srcMesh.userData?.armSide || 0,
          garmentType: srcMesh.userData?.garmentType || null,
        };
      }
      const bucket = partBuckets[partKey];
      const { chains, skinIdx, skinWgt } = extracted;

      for (const insetM of rowOffsets) {
        for (const chain of chains) {
          let cursor = 0;
          let stepIdx = 0;
          let nextDashAt = 0;
          for (const seg of chain) {
            const sLen = seg.segLen;
            while (nextDashAt + dashM * 0.35 < cursor + sLen) {
              const localStart = Math.max(0, nextDashAt - cursor);
              const localEnd = Math.min(sLen, (nextDashAt + dashM) - cursor);
              if (localEnd - localStart > dashM * 0.25) {
                const u0 = localStart / sLen;
                const u1 = localEnd / sLen;
                appendStitchDashQuad(bucket, seg, u0, u1, insetM, halfW, liftM, isZig, stepIdx, zigAmpM, skinIdx, skinWgt);
              }
              if (nextDashAt + dashM <= cursor + sLen) {
                nextDashAt += pitchM;
                stepIdx++;
              } else {
                break;
              }
            }
            cursor += sLen;
            if (nextDashAt < cursor - dashM) {
              nextDashAt = cursor;
            }
          }
        }
      }
    }

    Object.entries(partBuckets).forEach(([partKey, bucket]) => {
      if (!bucket.pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(bucket.pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(bucket.si, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(bucket.sw, 4));
      geo.setIndex(bucket.idx);
      geo.computeVertexNormals();
      geo.userData.restPos = new Float32Array(bucket.pos);
      geo.userData.skinIdx = new Uint16Array(bucket.si);
      geo.userData.skinWgt = new Float32Array(bucket.sw);

      const threadHex = resolvePartThreadHex(partKey);
      const threadMat = isSoftwareGL
        ? new THREE.MeshPhongMaterial({
          color: new THREE.Color(threadHex),
          emissive: new THREE.Color(threadHex),
          emissiveIntensity: 0.12,
          shininess: 24,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        })
        : new THREE.MeshStandardMaterial({
          color: new THREE.Color(threadHex),
          emissive: new THREE.Color(threadHex),
          emissiveIntensity: 0.12,
          roughness: 0.42,
          metalness: 0.06,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });

      const sMesh = new THREE.Mesh(geo, threadMat);
      sMesh.name = `stitch_${partKey}`;
      sMesh.frustumCulled = false;
      sMesh.castShadow = false;
      sMesh.receiveShadow = true;
      sMesh.userData.isStitch = true;
      sMesh.userData.parentPart = partKey;
      sMesh.userData.stitchPart = partKey;
      sMesh.userData.fitTier = bucket.fitTier;
      sMesh.userData.armSide = bucket.armSide;
      if (bucket.garmentType) sMesh.userData.garmentType = bucket.garmentType;
      sMesh.userData.skinIdx = geo.userData.skinIdx;
      sMesh.userData.skinWgt = geo.userData.skinWgt;
      sMesh.userData.cpuSkinned = Boolean(skeleton);
      sMesh.userData.origMat = threadMat;
      sMesh.renderOrder = 1;

      stitchMaterialsByPart[partKey] = threadMat;
      stitchesGroup.add(sMesh);
    });
    void skeleton;
  }

  function setStitchConfig(nextCfg) {
    const prevEnabled = stitchState.enabled;
    const prevStyle = stitchState.style;
    const prevVis = stitchState.visibility;
    stitchState = normalizeStitchConfig(nextCfg || {});
    if (!ready || !garmentGroup) return;

    const topologyChanged = prevEnabled !== stitchState.enabled || prevStyle !== stitchState.style || prevVis !== stitchState.visibility;
    if (topologyChanged || (stitchState.enabled && Object.keys(stitchMaterialsByPart).length === 0)) {
      buildStitches(lastDims, curPatternMetrics, activeMannequin ? activeMannequin.skeleton : null);
      if (!walking && activeMannequin && limbs && limbs.leg1) {
        updateGarmentDynamics(0);
      } else if (activeMannequin && limbs && limbs.leg1) {
        updateGarmentDynamics(t);
      }
      applyPieceVisibility();
    } else {
      Object.entries(stitchMaterialsByPart).forEach(([partKey, mat]) => {
        if (mat && mat.color) {
          const hex = resolvePartThreadHex(partKey);
          mat.color.set(hex);
          if (mat.emissive) mat.emissive.set(hex);
        }
      });
      applyPieceVisibility();
    }
  }

  // ---------- Procedural Fashion Pattern & Print Generators ----------
  function generateFloralPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    const bg = (palette && palette[0]) || baseHex || "#faf7f2";
    const pCol1 = (palette && palette[1]) || "#f472b6";
    const pCol2 = (palette && palette[2]) || "#fb7185";
    const leafCol = (palette && palette[3]) || "#5c8269";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = leafCol;
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
      ctx.fillStyle = leafCol;
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
      [128, 128, "#fcd34d", pCol1, 1.2],
      [384, 128, "#fbbf24", pCol2, 1.1],
      [256, 256, "#fcd34d", pCol1, 1.3],
      [128, 384, "#fbbf24", pCol2, 1.1],
      [384, 384, "#fcd34d", pCol1, 1.2],
    ].forEach(([x, y, c1, c2, s]) => drawFlower(x, y, c1, c2, s));

    return c.toDataURL("image/png");
  }

  function generateMonogramPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = (palette && palette[0]) || baseHex || "#1e1b18";
    ctx.fillRect(0, 0, 512, 512);
    const gold = (palette && palette[1]) || "#d4af37";

    ctx.strokeStyle = "rgba(212, 175, 55, 0.28)";
    ctx.lineWidth = 1.5;
    const step = 64;
    for (let x = -512; x <= 1024; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 512, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 512); ctx.lineTo(x + 512, 0); ctx.stroke();
    }

    ctx.fillStyle = gold;
    ctx.font = "bold 26px 'Playfair Display', serif, Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let y = 32; y < 512; y += 64) {
      for (let x = 32; x < 512; x += 64) {
        if (((x + y) / 64) % 2 === 0) {
          ctx.beginPath();
          ctx.arc(x, y, 18, 0, Math.PI * 2);
          ctx.strokeStyle = gold;
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

  function generateHoundstoothPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = (palette && palette[1]) || "#ffffff";
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = (palette && palette[0]) || baseHex || "#18181b";
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

  function generateStripesPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const ctx = c.getContext("2d");
    const c0 = (palette && palette[0]) || baseHex || "#ffffff";
    const c1 = (palette && palette[1]) || "#1e3a8a";
    const c2 = (palette && palette[2]) || c1;
    ctx.fillStyle = c0;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, 42, 128);
    ctx.fillStyle = c2;
    ctx.fillRect(72, 0, 12, 128);
    return c.toDataURL("image/png");
  }

  function generatePolkaPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = (palette && palette[0]) || baseHex || "#ffffff";
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = (palette && palette[1]) || "#18181b";
    [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();
    });
    return c.toDataURL("image/png");
  }

  function generateAtelierPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = (palette && palette[0]) || baseHex || "#0f172a";
    ctx.fillRect(0, 0, 512, 512);
    const accent = (palette && palette[1]) || "#d4af37";

    ctx.fillStyle = accent;
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BERRY ATELIER", 256, 180);

    ctx.font = "600 16px sans-serif";
    ctx.fillStyle = (palette && palette[2]) || "#94a3b8";
    ctx.fillText("• HAUTE COUTURE • EST. 2026 •", 256, 230);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(64, 120, 384, 160);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("PARIS  •  MILAN  •  CAIRO", 256, 400);
    return c.toDataURL("image/png");
  }

  function generatePlaidPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const c0 = (palette && palette[0]) || baseHex || "#636569";
    const c1 = (palette && palette[1]) || "#9a9ca0";
    const c2 = (palette && palette[2]) || "#2f3136";
    ctx.fillStyle = c0;
    ctx.fillRect(0, 0, 256, 256);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, 88, 256);
    ctx.fillRect(0, 0, 256, 88);
    ctx.fillStyle = c2;
    ctx.fillRect(140, 0, 14, 256);
    ctx.fillRect(0, 140, 256, 14);
    ctx.fillRect(184, 0, 6, 256);
    ctx.fillRect(0, 184, 256, 6);
    ctx.globalAlpha = 1;
    return c.toDataURL("image/png");
  }

  function generateBrocadePattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const bg = (palette && palette[0]) || baseHex || "#12214b";
    const sub = (palette && palette[1]) || bg;
    const gold = (palette && palette[2]) || "#d4af37";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = sub;
    ctx.lineWidth = 4;
    for (const [cx, cy] of [[64, 64], [192, 64], [128, 128], [64, 192], [192, 192]]) {
      ctx.beginPath(); ctx.ellipse(cx, cy, 42, 54, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2.2;
    for (const [cx, cy] of [[64, 64], [192, 64], [128, 128], [64, 192], [192, 192]]) {
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate((i * Math.PI) / 4);
        ctx.beginPath(); ctx.ellipse(0, -18, 6, 15, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    }
    return c.toDataURL("image/png");
  }

  function generateEmbroideryPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = (palette && palette[0]) || baseHex || "#ebe8e0";
    ctx.fillRect(0, 0, 512, 512);
    const gold = (palette && palette[1]) || "#d4af37";
    const gold2 = (palette && palette[2]) || "#bfa054";
    const accent = (palette && palette[3]) || "#f8fafc";

    // Delicate scalloped border bands + satin-stitch rosettes
    [42, 470].forEach((bx) => {
      ctx.strokeStyle = gold2;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(bx - 18, 0); ctx.lineTo(bx - 18, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + 18, 0); ctx.lineTo(bx + 18, 512); ctx.stroke();
      for (let y = 16; y < 512; y += 32) {
        ctx.strokeStyle = gold;
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(bx, y, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(bx, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    });

    // Scattered delicate floral stitch clusters
    for (const [cx, cy] of [[168, 128], [344, 128], [256, 256], [168, 384], [344, 384]]) {
      ctx.strokeStyle = gold;
      ctx.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate((k * Math.PI) / 3);
        ctx.beginPath(); ctx.ellipse(0, -18, 5, 14, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = gold2;
      ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    return c.toDataURL("image/png");
  }

  function generateZariBorderPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    const bg = (palette && palette[0]) || baseHex || "#141518";
    const m1 = (palette && palette[1]) || "#d4af37";
    const m2 = (palette && palette[2]) || "#a67c2e";
    const hi = (palette && palette[3]) || "#f3df98";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    // Dual luxury braided Zari metallic trim rails + scalloped arches + paisley medallions
    const drawRail = (cx) => {
      ctx.fillStyle = m2;
      ctx.fillRect(cx - 26, 0, 52, 512);
      ctx.fillStyle = bg;
      ctx.fillRect(cx - 20, 0, 40, 512);
      ctx.strokeStyle = m1;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - 20, 0); ctx.lineTo(cx - 20, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 20, 0); ctx.lineTo(cx + 20, 512); ctx.stroke();
      for (let y = 0; y < 512; y += 32) {
        ctx.strokeStyle = m1;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx - 12, y);
        ctx.lineTo(cx, y + 16);
        ctx.lineTo(cx + 12, y);
        ctx.lineTo(cx, y - 16);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = hi;
        ctx.beginPath(); ctx.arc(cx, y, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = m2;
        ctx.beginPath();
        ctx.arc(cx + (cx < 256 ? 28 : -28), y + 16, 12, cx < 256 ? -Math.PI / 2 : Math.PI / 2, cx < 256 ? Math.PI / 2 : -Math.PI / 2);
        ctx.stroke();
      }
    };
    drawRail(52);
    drawRail(460);

    // Subtle tonal/metallic vertical filigree motif along center seam & sleeves
    for (let y = 64; y < 512; y += 128) {
      for (const cx of [176, 336]) {
        ctx.save(); ctx.translate(cx, y);
        ctx.strokeStyle = m1;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(0, -34);
        ctx.bezierCurveTo(22, -16, 20, 18, 0, 34);
        ctx.bezierCurveTo(-20, 18, -22, -16, 0, -34);
        ctx.stroke();
        ctx.fillStyle = hi;
        ctx.beginPath(); ctx.arc(0, -8, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 10, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    return c.toDataURL("image/png");
  }

  function generateArabesquePattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    const bg = (palette && palette[0]) || baseHex || "#084c38";
    const g1 = (palette && palette[1]) || "#d9b650";
    const g2 = (palette && palette[2]) || "#8e7330";
    const pearl = (palette && palette[3]) || "#f8fafc";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    // Interlacing arabesque scrollwork + 8-point geometric star medallions
    const centers = [[128, 128], [384, 128], [256, 256], [128, 384], [384, 384]];
    ctx.strokeStyle = g2;
    ctx.lineWidth = 1.6;
    for (let x = 0; x <= 512; x += 256) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 80, 128, x - 80, 384, x, 512);
      ctx.stroke();
    }
    for (const [cx, cy] of centers) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = g1;
      ctx.lineWidth = 2.0;
      for (const rot of [0, Math.PI / 4]) {
        ctx.save(); ctx.rotate(rot);
        ctx.strokeRect(-34, -34, 68, 68);
        ctx.restore();
      }
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate((i * Math.PI) / 4);
        ctx.beginPath(); ctx.ellipse(0, -24, 6, 16, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = pearl;
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return c.toDataURL("image/png");
  }

  function generateTatreezPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    const bg = (palette && palette[0]) || baseHex || "#1c1817";
    const c1 = (palette && palette[1]) || "#b91c1c";
    const c2 = (palette && palette[2]) || "#d4af37";
    const c3 = (palette && palette[3]) || "#f3ead8";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    const drawXStitch = (px, py, col, sz = 10) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(px - sz * 0.42, py - sz * 0.42);
      ctx.lineTo(px + sz * 0.42, py + sz * 0.42);
      ctx.moveTo(px + sz * 0.42, py - sz * 0.42);
      ctx.lineTo(px - sz * 0.42, py + sz * 0.42);
      ctx.stroke();
    };

    const motif = [
      "....2....",
      "...212...",
      "..21312..",
      ".2131312.",
      "213121312",
      ".2131312.",
      "..21312..",
      "...212...",
      "....2....",
    ];
    const colsMap = { 1: c1, 2: c2, 3: c3 };
    const cell = 11;
    for (const [ox, oy] of [[78, 86], [206, 214], [334, 86], [78, 342], [334, 342]]) {
      motif.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          const ch = row[rx];
          if (ch !== ".") drawXStitch(ox + rx * cell, oy + ry * cell, colsMap[ch], cell);
        }
      });
    }
    // Vertical tatreez border columns
    for (let y = 16; y < 512; y += 20) {
      drawXStitch(26, y, c1, 10);
      drawXStitch(38, y + 10, c2, 10);
      drawXStitch(474, y, c1, 10);
      drawXStitch(486, y + 10, c2, 10);
    }
    return c.toDataURL("image/png");
  }

  function generateFloralEmbroideryPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    const bg = (palette && palette[0]) || baseHex || "#b57c84";
    const t1 = (palette && palette[1]) || "#f3e5ab";
    const t2 = (palette && palette[2]) || "#d4af37";
    const leaf = (palette && palette[3]) || "#e6d8b5";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = leaf;
    ctx.lineWidth = 2.6;
    for (const bx of [96, 256, 416]) {
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.bezierCurveTo(bx + 36, 128, bx - 36, 384, bx, 512);
      ctx.stroke();
    }
    const pts = [[102, 96], [262, 176], [422, 96], [90, 272], [250, 352], [410, 272], [104, 432], [424, 432]];
    for (const [fx, fy] of pts) {
      ctx.save(); ctx.translate(fx, fy);
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate((i * Math.PI * 2) / 5);
        ctx.fillStyle = t1;
        ctx.beginPath(); ctx.ellipse(0, -14, 6, 13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = t2;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = t2;
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return c.toDataURL("image/png");
  }

  function generateLacePattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const bg = (palette && palette[0]) || baseHex || "#f5f3ee";
    const hi = (palette && palette[1]) || "#ffffff";
    const sh = (palette && palette[2]) || "#dfd7c8";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = sh;
    ctx.lineWidth = 1.6;
    for (let y = 0; y <= 128; y += 32) {
      for (let x = 0; x <= 128; x += 32) {
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = hi;
        ctx.beginPath(); ctx.arc(x + 16, y + 16, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = sh;
      }
    }
    return c.toDataURL("image/png");
  }

  function generateRibbedPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const c0 = (palette && palette[0]) || baseHex || "#728072";
    const c1 = (palette && palette[1]) || "#596659";
    ctx.fillStyle = c0;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = c1;
    for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 3, 64);
    return c.toDataURL("image/png");
  }

  function generateShimmerPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const c0 = (palette && palette[0]) || baseHex || "#aeb2b8";
    const c1 = (palette && palette[1]) || "#e5e7eb";
    const c2 = (palette && palette[2]) || "#6b7280";
    const g = ctx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, c2); g.addColorStop(0.5, c1); g.addColorStop(1, c0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    for (let i = 0; i < 160; i++) {
      const sx = (Math.sin(i * 19.3) * 0.5 + 0.5) * 256;
      const sy = (Math.cos(i * 41.7) * 0.5 + 0.5) * 256;
      ctx.beginPath(); ctx.arc(sx, sy, (i % 3) + 1, 0, Math.PI * 2); ctx.fill();
    }
    return c.toDataURL("image/png");
  }

  function generateOmbrePattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 512;
    const ctx = c.getContext("2d");
    const c0 = (palette && palette[0]) || baseHex || "#db2777";
    const c1 = (palette && palette[1]) || "#f4623a";
    const c2 = (palette && palette[2]) || c1;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 512);
    return c.toDataURL("image/png");
  }

  function generateColorblockPattern(preset, palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    const c0 = (palette && palette[0]) || baseHex || "#df3a93";
    const c1 = (palette && palette[1]) || "#f3f4f8";
    const c2 = (palette && palette[2]) || c0;
    ctx.fillStyle = c0;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = c1;
    if (preset === "colorblock_yoke") {
      ctx.fillRect(0, 0, 512, 165);
    } else if (preset === "mesh_inset") {
      ctx.fillRect(0, 0, 512, 140);
      ctx.strokeStyle = c0;
      ctx.lineWidth = 1.5;
      for (let x = 0; x < 512; x += 12) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 64, 140); ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(512, 0); ctx.lineTo(0, 390); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c2; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 390); ctx.lineTo(512, 0); ctx.stroke();
    }
    return c.toDataURL("image/png");
  }

  function generateDenimStitchPattern(palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const bg = (palette && palette[0]) || baseHex || "#2e4b70";
    const hi = (palette && palette[1]) || "#456896";
    const st = (palette && palette[2]) || "#c89248";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = hi;
    ctx.lineWidth = 1;
    for (let i = -256; i < 512; i += 6) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 256, 256); ctx.stroke();
    }
    ctx.strokeStyle = st;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 4]);
    ctx.strokeRect(10, 10, 236, 236);
    ctx.setLineDash([]);
    return c.toDataURL("image/png");
  }

  function generateArtisticPattern(preset, palette, baseHex) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    const cols = (palette && palette.length) ? palette : [baseHex || "#1e1b4b", "#5b21b6", "#db2777", "#60a5fa"];
    if (preset === "rainbow") {
      const g = ctx.createLinearGradient(0, 0, 512, 512);
      cols.forEach((col, i) => g.addColorStop(i / Math.max(1, cols.length - 1), col));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 512);
    } else if (preset === "galaxy" || preset === "aurora") {
      const g = ctx.createLinearGradient(0, 0, 256, 512);
      cols.forEach((col, i) => g.addColorStop(i / Math.max(1, cols.length - 1), col));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < 180; i++) {
        const sx = (Math.sin(i * 17.1) * 0.5 + 0.5) * 512;
        const sy = (Math.cos(i * 29.7) * 0.5 + 0.5) * 512;
        ctx.beginPath(); ctx.arc(sx, sy, (i % 5 === 0 ? 2.5 : 1.2), 0, Math.PI * 2); ctx.fill();
      }
    } else if (preset === "leopard" || preset === "tiger") {
      ctx.fillStyle = cols[0];
      ctx.fillRect(0, 0, 512, 512);
      if (preset === "tiger") {
        ctx.fillStyle = cols[2] || "#181412";
        for (let y = 24; y < 512; y += 52) {
          ctx.beginPath();
          ctx.moveTo(0, y); ctx.quadraticCurveTo(256, y + 18, 512, y - 8);
          ctx.lineTo(512, y + 12); ctx.quadraticCurveTo(256, y + 36, 0, y + 16);
          ctx.closePath(); ctx.fill();
        }
      } else {
        for (let i = 0; i < 65; i++) {
          const sx = (Math.sin(i * 23.1) * 0.5 + 0.5) * 480 + 16;
          const sy = (Math.cos(i * 41.3) * 0.5 + 0.5) * 480 + 16;
          ctx.fillStyle = cols[1] || "#c9a473";
          ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = cols[2] || "#1f1c18"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(sx, sy, 14, 0.3, Math.PI * 1.6); ctx.stroke();
        }
      }
    } else if (preset === "prism") {
      ctx.fillStyle = cols[0];
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 36; i++) {
        ctx.fillStyle = cols[i % cols.length];
        const x = (i * 97) % 512, y = (i * 149) % 512;
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo((x + 110) % 512, (y + 30) % 512); ctx.lineTo((x + 40) % 512, (y + 130) % 512);
        ctx.closePath(); ctx.fill();
      }
    } else {
      // marble / tiedye
      const g = ctx.createRadialGradient(256, 256, 16, 256, 256, 360);
      cols.forEach((col, i) => g.addColorStop(i / Math.max(1, cols.length - 1), col));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 4;
      for (let k = 0; k < 10; k++) {
        ctx.beginPath(); ctx.moveTo(0, k * 52);
        ctx.bezierCurveTo(180, k * 52 + 40, 320, k * 52 - 40, 512, k * 52 + 20);
        ctx.stroke();
      }
    }
    return c.toDataURL("image/png");
  }

  function generatePatternPreset(preset, palette, baseHex) {
    if (preset === "floral") return generateFloralPattern(palette, baseHex);
    if (preset === "monogram") return generateMonogramPattern(palette, baseHex);
    if (preset === "houndstooth") return generateHoundstoothPattern(palette, baseHex);
    if (preset === "stripes") return generateStripesPattern(palette, baseHex);
    if (preset === "polka") return generatePolkaPattern(palette, baseHex);
    if (preset === "atelier") return generateAtelierPattern(palette, baseHex);
    if (preset === "plaid") return generatePlaidPattern(palette, baseHex);
    if (preset === "brocade") return generateBrocadePattern(palette, baseHex);
    if (preset === "embroidery") return generateEmbroideryPattern(palette, baseHex);
    if (preset === "zari_border") return generateZariBorderPattern(palette, baseHex);
    if (preset === "arabesque") return generateArabesquePattern(palette, baseHex);
    if (preset === "tatreez") return generateTatreezPattern(palette, baseHex);
    if (preset === "floral_embroidery") return generateFloralEmbroideryPattern(palette, baseHex);
    if (preset === "lace") return generateLacePattern(palette, baseHex);
    if (preset === "ribbed") return generateRibbedPattern(palette, baseHex);
    if (preset === "shimmer") return generateShimmerPattern(palette, baseHex);
    if (preset === "ombre") return generateOmbrePattern(palette, baseHex);
    if (preset === "colorblock_diagonal" || preset === "colorblock_yoke" || preset === "mesh_inset") {
      return generateColorblockPattern(preset, palette, baseHex);
    }
    if (preset === "denim_stitch") return generateDenimStitchPattern(palette, baseHex);
    if (["leopard", "tiger", "galaxy", "aurora", "rainbow", "marble", "tiedye", "prism"].includes(preset)) {
      return generateArtisticPattern(preset, palette, baseHex);
    }
    return null;
  }

  function setGarmentPrint(opts, maybeTarget) {
    if (typeof opts === "string") {
      const knownPresets = [
        "none", "floral", "monogram", "houndstooth", "stripes", "polka", "atelier",
        "plaid", "brocade", "embroidery", "zari_border", "arabesque", "tatreez", "floral_embroidery", "lace", "ribbed", "shimmer", "ombre",
        "colorblock_diagonal", "colorblock_yoke", "mesh_inset", "denim_stitch",
        "leopard", "tiger", "galaxy", "aurora", "rainbow", "marble", "tiedye", "prism",
      ];
      const isPreset = knownPresets.includes(opts);
      if (isPreset) opts = { preset: opts, target: maybeTarget || "all" };
      else opts = { dataURL: opts, target: maybeTarget || "all", isDrawing: opts.startsWith("data:image/png") };
    }
    opts = opts || {};
    const { target = "all", preset, palette, baseColor, dataURL, rawDrawingURL, repeat, isDrawing } = opts;
    let url = dataURL;

    const partsToUpdate = Array.isArray(target)
      ? target
      : (target === "all" || !target ? ["bodice", "skirt", "trousers", "sleeve", "outer"] : [target]);

    partsToUpdate.forEach((part) => {
      if (!fabricState[part]) return;
      if (preset) {
        const partHex = baseColor || ("#" + (fabricState[part].front.color ?? 0x4f46e5).toString(16).padStart(6, "0"));
        url = preset === "none" ? null : generatePatternPreset(preset, palette, partHex);
      }
      fabricState[part].front.textureDataURL = url;
      fabricState[part].front.rawDrawingURL = url ? (rawDrawingURL || (isDrawing ? url : null)) : null;
      fabricState[part].front.isDrawing = !!isDrawing;
      if (repeat != null) fabricState[part].front.textureRepeat = repeat;
      else if (isDrawing || ["ombre", "colorblock_diagonal", "colorblock_yoke", "mesh_inset", "galaxy", "aurora", "rainbow"].includes(preset)) {
        fabricState[part].front.textureRepeat = 1;
      } else if (preset && ["houndstooth", "polka", "stripes", "plaid", "ribbed"].includes(preset)) {
        fabricState[part].front.textureRepeat = 8;
      } else {
        fabricState[part].front.textureRepeat = FABRIC_TEXTURE_REPEAT;
      }

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
      if (opts.lookbookStyle) {
        const acc = opts.lookbookStyle.accessories || {};
        accessoriesState = normalizeAccessoriesState(createDefaultAccessoriesState(), acc, true);
        lastLookbookContrastHex = normalizeThreadHex(opts.lookbookStyle?.silhouette?.contrastStitch, null);
      } else {
        lastLookbookContrastHex = null;
      }
    }
    if (opts.stitchConfig) {
      stitchState = normalizeStitchConfig(opts.stitchConfig);
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
    if (opts.resetPrints && opts.lookbookStyle?.print?.preset && opts.lookbookStyle.print.preset !== "none" && typeof document !== "undefined") {
      const pr = opts.lookbookStyle.print;
      const tgt = pr.target || "all";
      const targets = Array.isArray(tgt) ? tgt : (tgt === "all" ? ["bodice", "skirt", "trousers", "sleeve", "outer"] : [tgt]);
      targets.forEach((pKey) => {
        const slot = fabricState[pKey]?.front;
        if (!slot) return;
        const baseH = opts.lookbookStyle.primaryColor || ("#" + (slot.color ?? 0x4f46e5).toString(16).padStart(6, "0"));
        const pUrl = generatePatternPreset(pr.preset, pr.palette, baseH);
        if (pUrl) {
          slot.textureDataURL = pUrl;
          slot.rawDrawingURL = null;
          slot.isDrawing = false;
          slot.textureRepeat = pr.repeat != null ? pr.repeat : (["ombre", "colorblock_diagonal", "colorblock_yoke", "mesh_inset", "galaxy", "aurora", "rainbow"].includes(pr.preset) ? 1 : (["houndstooth", "polka", "stripes", "plaid", "ribbed"].includes(pr.preset) ? 8 : FABRIC_TEXTURE_REPEAT));
        }
      });
    }
    if (opts.opacity != null) Object.values(fabricState).forEach((st) => { st.opacity = opts.opacity; });
    if (opts.pieces !== undefined) lastPieceVis = opts.pieces;
    const incomingMetrics = opts.patternMetrics || null;
    const mannequinPreset = opts.mannequin || (opts.size ? getMannequinFor(category, opts.size) : null);
    curMannequin = mannequinPreset || null;

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
          buildProcedural(category, m, incomingMetrics, preserveCamera, mannequinPreset);
          if (tensionMapEnabled) applyTensionHeatmap();
          else applyFabric();
          applyPieceVisibility();
        }
      } else {
        buildProcedural(category, m, incomingMetrics, preserveCamera, mannequinPreset);
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
    setVis("outer", show("bodice") && Boolean(curPatternMetrics?.bodice?.outerLayer?.enabled));

    const trimVisited = new Set();
    const visitTrim = (o) => {
      if (trimVisited.has(o)) return;
      trimVisited.add(o);
      if (o.name === "trim") {
        const hostPart = o.userData?.parentPart || "bodice";
        o.visible = hostPart === "outer"
          ? (show("bodice") && Boolean(curPatternMetrics?.bodice?.outerLayer?.enabled))
          : show(hostPart);
      }
    };
    garmentGroup.traverse(visitTrim);
    Object.values(limbs).forEach((g) => g && g.traverse && g.traverse(visitTrim));

    if (accessoriesGroup) {
      const accVisited = new Set();
      accessoriesGroup.traverse((o) => {
        if (accVisited.has(o)) return;
        accVisited.add(o);
        if (o.userData && o.userData.parentPart) {
          if (o.userData.parentPart === "waist") {
            o.visible = show("bodice") || show("skirt") || show("trousers");
          } else if (o.userData.parentPart === "outer") {
            o.visible = show("bodice") && Boolean(curPatternMetrics?.bodice?.outerLayer?.enabled);
          } else {
            o.visible = show(o.userData.parentPart);
          }
        }
      });
    }

    if (stitchesGroup) {
      const stVisited = new Set();
      stitchesGroup.traverse((o) => {
        if (stVisited.has(o) || !o.isMesh) return;
        stVisited.add(o);
        const sPart = o.userData?.stitchPart || o.userData?.parentPart || "bodice";
        const partOn = stitchState.enabled && stitchState.parts?.[sPart]?.enabled !== false;
        const hostOn = sPart === "trim" ? (show("bodice") || show("skirt") || show("trousers") || show("outer")) : show(sPart);
        o.visible = Boolean(partOn && hostOn);
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
    getSceneDebugRefs: () => ({ root, bodyGroup, garmentGroup, activeMannequin, curMannequin, limbs, lastDims }),
    getActiveMannequin: () => curMannequin,
    setReduceMotion: (v) => {
      reduceMotion = !!v;
      if (controls) controls.autoRotate = spinning && !reduceMotion;
    },
    setLoadingCallback: (cb) => { onLoading = cb || (() => { }); },
    setAvatarIssueCallback: (cb) => { onAvatarIssue = cb || (() => { }); },
    setFatalErrorCallback: (cb) => { onFatalError = cb || (() => { }); },
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
    setTensionMetricsCallback: (cb) => { onTensionMetricsUpdate = cb || (() => { }); },
    exportOBJ,
    // 3D Accessories & Sewing Stitches
    setAccessories,
    getAccessories: () => JSON.parse(JSON.stringify(accessoriesState)),
    setStitchConfig,
    getStitchConfig: () => JSON.parse(JSON.stringify(stitchState)),
    getActiveStitchParts,
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
