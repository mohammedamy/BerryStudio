/* ============================================================
   3D Preview — BerryStudio premium avatar system.

   • Four procedural bodies with correct feminine / masculine / child
     proportions, sculpted head + hair + subtle face, PBR skin.
   • Studio lighting + soft contact shadow + gradient backdrop.
   • Smooth OrbitControls (orbit / zoom / pan, touch friendly) + auto-spin
     + natural limb-swing walk cycle.
   • Live fabric material (cotton…leather), colour & transparency.
   • Per-piece show/hide synced with the Layers panel.
   • Optional drop-in GLB avatars: place avatars/<category>.glb in the
     repo and they are used instead, auto-scaled to the measurements.
   • Graceful fallback when WebGL / network is unavailable.
   ============================================================ */
export const View3D = (() => {
  let THREE, OrbitControls, GLTFLoader, RGBELoader, cloneSkeleton;
  let renderer, scene, camera, controls, raf = null;
  let root, bodyGroup, garmentGroup, limbs = {};
  let ready = false, spinning = true, walking = true, t = 0;
  // WP-17: an OS/app-level "prefers-reduced-motion" override — always wins
  // over the spin toggle's own saved value, never the other way around.
  let reduceMotion = false;
  let host, curCategory = "women", curH = 1.7;
  let curMeasurements = null, lastDims = null;
  let tensionMapEnabled = false;
  let lastTensionMetrics = { avgEase: 4.5, peakStrain: 0.0, status: "fitOptimal", fabric: "cotton" };
  let onTensionMetricsUpdate = () => {};
  let onLoading = () => {};
  let onAvatarIssue = () => {};
  let onFatalError = () => {};
  let noiseTex = null;
  let skirtFrontMesh = null, skirtBackMesh = null;
  let accessoriesGroup = null;
  let accessoriesState = {
    buttons: { enabled: false, style: "gold", placement: "front_placket", count: 6 },
    zipper: { enabled: false, style: "silver", placement: "center_front", openPct: 0 },
    belt: { enabled: false, style: "leather_gold", width: "medium" }
  };
  const avatarURLs = {};                       // category -> optional GLB url

  // ---------- GLB robustness: timeout, retry, in-memory cache ----------
  // Bundled/uploaded avatars are optional overrides on top of the always-
  // available procedural body, but a hung fetch (flaky network, a stalled
  // service-worker intercept, a very slow disk on first install) used to
  // leave the loading spinner showing forever, since GLTFLoader.load() has
  // no built-in timeout and its promise then never settles either way.
  const GLB_TIMEOUT_MS = 10000;
  const GLB_MAX_RETRIES = 2;
  const GLB_CACHE_LIMIT = 6;                   // cap memory for many custom URLs in one session
  const glbCache = new Map();                  // url -> raw loaded gltf (untouched, reused via .scene.clone())
  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
  function fetchGLTF(url, onProgress) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, resolve, (evt) => {
        if (onProgress && evt.total) onProgress(Math.max(0, Math.min(99, Math.round(evt.loaded / evt.total * 100))));
      }, reject);
    });
  }
  async function loadGLTFWithRetry(url, onProgress) {
    if (glbCache.has(url)) { onProgress && onProgress(100); return glbCache.get(url); }
    let lastErr;
    for (let attempt = 0; attempt <= GLB_MAX_RETRIES; attempt++) {
      try {
        const gltf = await withTimeout(fetchGLTF(url, onProgress), GLB_TIMEOUT_MS);
        if (glbCache.size >= GLB_CACHE_LIMIT) glbCache.delete(glbCache.keys().next().value);
        glbCache.set(url, gltf);
        return gltf;
      } catch (e) {
        lastErr = e;
        if (attempt < GLB_MAX_RETRIES) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  // ---------- disposal (avoid leaking geometries/materials/textures on
  // every avatar/category swap). Geometries and materials on a GLB body
  // may be shared-by-reference with a cached gltf (see loadGLB — clone(true)
  // shares leaf geometry/material, it doesn't deep-copy them), but dispose()
  // is safe to call repeatedly in three.js: it just drops the GPU-side
  // buffer/texture handles, which the renderer transparently re-creates the
  // next time that same geometry/material is used, so re-visiting a cached
  // category after leaving it still renders correctly. `noiseTex` is a
  // single texture shared by every procedural skin material for the whole
  // app lifetime and must never be disposed here.
  function disposeMaterial(mat) {
    if (!mat) return;
    ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap",
     "alphaMap", "bumpMap", "sheenColorMap", "clearcoatMap", "transmissionMap", "thicknessMap"]
      .forEach(key => { const tex = mat[key]; if (tex && tex.isTexture && tex !== noiseTex) tex.dispose(); });
    mat.dispose();
  }
  function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse(o => {
      if (!o.isMesh) return;
      if (o.geometry) o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach(disposeMaterial); else disposeMaterial(o.material);
    });
  }

  // ---------- dependency loading (uses the page import map) ----------
  // A bare specifier ("three") only resolves via the <script type="importmap">
  // in index.html — some browser engines have been observed to throw
  // "Failed to resolve module specifier" for a bare specifier passed to a
  // *dynamic* import() even though the identical map correctly resolves
  // static imports (confirmed directly: import("three") throws in that
  // engine while import("https://unpkg.com/.../three.module.js") succeeds
  // immediately after, same page, same load).
  //
  // Real-world follow-up: even with the CDN fallback below, one user's 3D
  // Preview still failed to load while Cloth Lab (a separately Vite-bundled
  // app with no runtime CDN dependency) and /3d-test.html (a raw WebGL2
  // probe that never imports three.js at all) both worked fine on the same
  // device — pointing at something blocking unpkg.com specifically (an
  // ad-blocker/privacy extension/network filter), not a bare-specifier
  // resolution quirk or a WebGL capability gap. A second CDN on a genuinely
  // different domain — esm.sh, already in this page's own CSP script-src
  // for other features — is a real, meaningfully independent fallback for
  // exactly that failure mode; a same-domain retry wouldn't be.
  //
  // Each tier is tried as a whole (main three.js + all addons from the SAME
  // source) rather than mixed per-file, since three.js addon modules import
  // "three" internally and mixing sources risks two different module
  // instances of the library coexisting.
  const THREE_VERSION = "0.185.1";
  const DEP_TIERS = [
    { label: "importmap", base: null, addons: null },
    { label: "unpkg", base: `https://unpkg.com/three@${THREE_VERSION}/build/three.module.js`, addons: `https://unpkg.com/three@${THREE_VERSION}/examples/jsm` },
    { label: "esm.sh", base: `https://esm.sh/three@${THREE_VERSION}`, addons: `https://esm.sh/three@${THREE_VERSION}/examples/jsm` },
  ];
  async function loadDepsFromTier(tier) {
    const THREE_ = tier.base ? await import(/* @vite-ignore */ tier.base) : await import(/* @vite-ignore */ "three");
    const addonUrl = (path) => tier.addons ? `${tier.addons}/${path}` : `three/addons/${path}`;
    const { OrbitControls: OC } = await import(/* @vite-ignore */ addonUrl("controls/OrbitControls.js"));
    const { clone: cloneSkeleton_ } = await import(/* @vite-ignore */ addonUrl("utils/SkeletonUtils.js"));
    let GL = null, RGBE = null;
    try { ({ GLTFLoader: GL } = await import(/* @vite-ignore */ addonUrl("loaders/GLTFLoader.js"))); } catch (e) { /* optional */ }
    try { ({ RGBELoader: RGBE } = await import(/* @vite-ignore */ addonUrl("loaders/RGBELoader.js"))); } catch (e) { /* optional */ }
    return { THREE_, OC, GL, RGBE, cloneSkeleton_ };
  }
  async function loadDeps() {
    if (THREE) return true;
    for (const tier of DEP_TIERS) {
      try {
        const { THREE_, OC, GL, RGBE, cloneSkeleton_ } = await loadDepsFromTier(tier);
        THREE = THREE_; OrbitControls = OC; GLTFLoader = GL; RGBELoader = RGBE; cloneSkeleton = cloneSkeleton_;
        return true;
      } catch (e) { /* try the next tier */ }
    }
    return false;
  }

  // WP-9.3: same CC0 studio-softbox HDRI cloth-lab already uses (see
  // env/README.md for provenance) — set as `scene.environment` ONLY, for
  // ambient reflection/sheen quality on fabric and skin. `scene.background`
  // stays the existing gradient (setupLights/gradientBackdrop below) for
  // brand consistency — this is lighting data, not a visible backdrop
  // swap. Loaded once and cached; a load failure just leaves ambient
  // lighting exactly as it already was (no environment map), never blocks
  // init or breaks the fallback path.
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
        () => { pmrem.dispose(); resolve(null); },
      );
    });
    return envMapPromise
  }

  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

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
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    scene.background = gradientBackdrop();
    loadEnvironmentMap().then((envMap) => { if (envMap && scene) scene.environment = envMap; });

    camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    camera.position.set(0.15, 1.0, 3.6);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 0.9; controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.autoRotate = spinning && !reduceMotion; controls.autoRotateSpeed = 1.6;
    controls.target.set(0, 0.92, 0);

    setupLights();
    setupGround();

    root = new THREE.Group(); scene.add(root);
    noiseTex = makeNoise();

    ready = true;
    resize();
    loop();
  }

  // ---------- studio environment ----------
  function gradientBackdrop() {
    const c = document.createElement("canvas"); c.width = 16; c.height = 256;
    const g = c.getContext("2d").createLinearGradient(0, 0, 0, 256);
    const dark = document.body.getAttribute("data-mode") === "dark";
    if (dark) { g.addColorStop(0, "#20242e"); g.addColorStop(0.55, "#171a22"); g.addColorStop(1, "#0e1015"); }
    else { g.addColorStop(0, "#eef1f6"); g.addColorStop(0.55, "#dfe4ec"); g.addColorStop(1, "#cdd3dd"); }
    const ctx = c.getContext("2d"); ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  function setupLights() {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8577, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2.5, 4.5, 3.2); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1; key.shadow.camera.far = 14;
    key.shadow.camera.left = -2; key.shadow.camera.right = 2;
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -1;
    key.shadow.bias = -0.0004; key.shadow.radius = 6;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe6ff, 0.55); fill.position.set(-3, 2, 2); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe9c8, 0.9); rim.position.set(-1.5, 3, -4); scene.add(rim);
  }
  function setupGround() {
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.ShadowMaterial({ opacity: 0.22 })
    );
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.001; shadow.receiveShadow = true; scene.add(shadow);
    // soft radial contact patch for grounding on the gradient
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const rg = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    rg.addColorStop(0, "rgba(0,0,0,0.28)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, 128, 128);
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.0),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
    );
    patch.rotation.x = -Math.PI / 2; patch.position.y = 0.002; scene.add(patch);
  }
  function makeNoise() {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const ctx = c.getContext("2d"); const img = ctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 150 + Math.random() * 105;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 5);
    return tex;
  }

  // ---------- materials ----------
  const SKIN = {
    women: 0xedd6c7, men: 0xd4a88b, girls: 0xf5ddcf, boys: 0xdec0a7,
  };
  const SKIN_SHEEN = {
    women: 0xe89582, men: 0xc87a5a, girls: 0xefa08c, boys: 0xd98d72,
  };
  const HAIR = { women: 0x221610, men: 0x1f150e, girls: 0x362114, boys: 0x26190f };
  function skinMat(category) {
    return new THREE.MeshPhysicalMaterial({
      color: SKIN[category] || 0xe5baa0,
      roughness: 0.58,
      metalness: 0.0,
      clearcoat: 0.0,
      sheen: 0.0,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
  }
  // WP-9.2: transmission (chiffon)/anisotropy (silk/satin) — confirmed
  // present on MeshPhysicalMaterial in this file's own pinned three@0.160.0
  // (checked against the actual source at that version, not assumed), so
  // no import-map bump needed. Mirrors cloth-lab's fabricPresets.js so the
  // two separate 3D views agree on what each fabric looks like, same as
  // every other field in this table already does.
  const FABRIC = {
    cotton:  { label: 'Cotton Poplin', massDensity: 150, structStiff: 0.96, bendStiff: 0.35, maxStrain: 1.05, damping: 0.970, friction: 0.90, rough: 0.85, metal: 0.0,  sheen: 0.2,  clear: 0.0,  om: 1 },
    denim:   { label: 'Denim',         massDensity: 400, structStiff: 0.98, bendStiff: 0.80, maxStrain: 1.03, damping: 0.930, friction: 0.96, rough: 0.9,  metal: 0.02, sheen: 0.1,  clear: 0.0,  om: 1 },
    silk:    { label: 'Silk Charmeuse',massDensity: 60,  structStiff: 0.94, bendStiff: 0.15, maxStrain: 1.07, damping: 0.980, friction: 0.80, rough: 0.26, metal: 0.05, sheen: 0.9,  clear: 0.15, om: 0.98, anisotropy: 0.6, anisoRot: 0 },
    satin:   { label: 'Satin',         massDensity: 90,  structStiff: 0.95, bendStiff: 0.20, maxStrain: 1.06, damping: 0.980, friction: 0.82, rough: 0.2,  metal: 0.12, sheen: 0.85, clear: 0.22, om: 1,    anisotropy: 0.5, anisoRot: 0 },
    chiffon: { label: 'Chiffon',       massDensity: 30,  structStiff: 0.92, bendStiff: 0.10, maxStrain: 1.08, damping: 0.985, friction: 0.75, rough: 0.5,  metal: 0.0,  sheen: 0.45, clear: 0.0,  om: 0.55, transmission: 0.18 },
    wool:    { label: 'Wool Crepe',    massDensity: 300, structStiff: 0.97, bendStiff: 0.58, maxStrain: 1.04, damping: 0.950, friction: 0.93, rough: 0.96, metal: 0.0,  sheen: 0.08, clear: 0.0,  om: 1 },
    linen:   { label: 'Linen',         massDensity: 170, structStiff: 0.96, bendStiff: 0.42, maxStrain: 1.05, damping: 0.970, friction: 0.87, rough: 0.82, metal: 0.0,  sheen: 0.15, clear: 0.0,  om: 1 },
    leather: { label: 'Leather',       massDensity: 550, structStiff: 0.98, bendStiff: 0.92, maxStrain: 1.02, damping: 0.900, friction: 0.97, rough: 0.4,  metal: 0.2,  sheen: 0.2,  clear: 0.35, om: 1 },
    jersey:  { label: 'Cotton Jersey', massDensity: 180, structStiff: 0.90, bendStiff: 0.22, maxStrain: 1.18, damping: 0.965, friction: 0.88, rough: 0.7,  metal: 0.0,  sheen: 0.18, clear: 0.0,  om: 1 },
    scuba:   { label: 'Scuba Knit',    massDensity: 260, structStiff: 0.91, bendStiff: 0.45, maxStrain: 1.14, damping: 0.955, friction: 0.85, rough: 0.35, metal: 0.0,  sheen: 0.35, clear: 0.05, om: 1 },
    tulle:   { label: 'Tulle',         massDensity: 18,  structStiff: 0.80, bendStiff: 0.06, maxStrain: 1.12, damping: 0.988, friction: 0.55, rough: 0.55, metal: 0.0,  sheen: 0.3,  clear: 0.0,  om: 0.35, transmission: 0.12 },
  };
  // One fabric slot per garment part — the procedural body only has 4 named mesh
  // groups (bodice/sleeve/skirt/trousers). Each slot now holds a real `front` and
  // (optionally) `back` sub-material rather than one flat color+material, so a
  // front-bodice/back-bodice pair with different fabrics doesn't collapse into
  // "whichever piece was set last wins" (WP-28). `back` is null whenever the
  // pattern has no distinct back piece for that part — the back sub-mesh (see
  // latheHalves() below) then just mirrors `front`, so a single-piece part still
  // renders as one seamless whole exactly as before this change. Each front/back
  // sub-material also carries its own optional `textureDataURL` (WP-39, Tailornova
  // feature study) — a real uploaded fabric-swatch photo, not just the 8 preset
  // color/roughness recipes above; front and back can hold two different photos
  // exactly the way they can hold two different colors.
  const defaultFabricSlot = () => ({ front: { color: 0x6d5efc, material: "cotton", textureDataURL: null, rawDrawingURL: null }, back: null, opacity: 0.85 });
  let fabricState = { bodice: defaultFabricSlot(), sleeve: defaultFabricSlot(), skirt: defaultFabricSlot(), trousers: defaultFabricSlot() };
  // A fresh Texture is loaded per fabricMat() call rather than cached across
  // calls — fabricMat() already builds a brand-new material every time it's
  // called (never reused), and disposeMaterial() (top of this file) disposes
  // whatever texture sits on the OLD material's `.map` on every swap; a shared
  // cache keyed by dataURL would get disposed out from under any other material
  // still referencing it. A data-URL decode has no network round trip, so
  // reloading per call is cheap — this mirrors the "always own what you
  // dispose" contract disposeMaterial() already enforces everywhere else.
  // `THREE` isn't assigned until ensureDeps()'s dynamic import resolves (see
  // `let THREE` up top) — a module-level `new THREE.TextureLoader()` here
  // would run at parse time, before that assignment, and throw. Lazy getter,
  // same reason every other THREE.* construction in this file happens inside
  // a function, never at module scope.
  let fabricTexLoader = null;
  function getFabricTexLoader(){ return fabricTexLoader ||= new THREE.TextureLoader(); }
  const FABRIC_TEXTURE_REPEAT = 6; // tile count so an uploaded swatch photo reads as a fabric print, not one giant smear across the whole part
  function fabricMat(part, side) {
    const st = fabricState[part] || fabricState.bodice;
    const slot = (side === "back" && st.back) ? st.back : st.front;
    const f = FABRIC[slot.material] || FABRIC.cotton;
    const op = Math.max(0.25, Math.min(1, st.opacity * f.om));
    const mat = new THREE.MeshPhysicalMaterial({
      // When a texture map (print, swatch photo, or cloth drawing) is applied,
      // setting color to white preserves both the fabric background and drawing
      // artwork faithfully without multiplicative color distortion or blackouts!
      color: slot.textureDataURL ? 0xffffff : slot.color, roughness: f.rough, metalness: f.metal,
      sheen: f.sheen, sheenRoughness: 0.5, clearcoat: f.clear, clearcoatRoughness: 0.4,
      transparent: op < 0.99, opacity: op, side: THREE.DoubleSide,
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

  // ---------- geometry helpers ----------
  const cm = v => v * 0.01;
  const R = circ => cm(circ) / (2 * Math.PI);
  function capsule(radius, len, mat) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 6, 16), mat);
    m.castShadow = true; return m;
  }
  function lathe(profile, mat, seg = 28) {
    const isDecreasing = profile.length > 1 && profile[0][1] > profile[profile.length - 1][1];
    const ptsList = isDecreasing ? [...profile].reverse() : profile;
    const pts = ptsList.map(p => new THREE.Vector2(Math.max(0.001, p[0]), p[1]));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat);
    m.castShadow = true; return m;
  }
  // Garment panels (bodice/skirt/trousers) as two independent sub-meshes split
  // at the body's side seams, instead of one full-revolution shell — so a
  // front piece and a back piece with different fabrics/colors (WP-28) each
  // get their own real material, not a shared one. three.js's own
  // LatheGeometry source (geometries/LatheGeometry.js) builds each vertex as
  // x = radius*sin(phi), z = radius*cos(phi); cos(phi) >= 0 exactly for
  // phi in [-PI/2, PI/2], so a phiStart=-PI/2/phiLength=PI half is exactly
  // the Z>=0 ("front", matching frameCamera's camera.position.z>0 convention
  // above) half of a full revolution, and phiStart=PI/2/phiLength=PI is
  // exactly the back. Both halves are built from the same profile at the
  // same angles as a full-revolution lathe would use, so they share vertex
  // positions along the phi=+-PI/2 side seams with no gap — front and back
  // meet seamlessly when their materials match, and show a real (correct)
  // seam line only where the fabrics actually differ.
  function latheHalves(profile, matFront, matBack, part, seg = 32) {
    const isDecreasing = profile.length > 1 && profile[0][1] > profile[profile.length - 1][1];
    const ptsList = isDecreasing ? [...profile].reverse() : profile;
    const pts = ptsList.map(p => new THREE.Vector2(Math.max(0.001, p[0]), p[1]));
    const half = Math.max(2, Math.round(seg / 2));
    const front = new THREE.Mesh(new THREE.LatheGeometry(pts, half, -Math.PI / 2, Math.PI), matFront);
    const back = new THREE.Mesh(new THREE.LatheGeometry(pts, half, Math.PI / 2, Math.PI), matBack);
    front.castShadow = back.castShadow = true;
    front.name = back.name = part;
    front.userData.side = "front"; back.userData.side = "back";
    return [front, back];
  }
  function sphere(r, mat) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat); m.castShadow = true; return m; }

  // Front/back torso sculpting for the female body — user-requested: "it
  // should have a breast and a lower back so its front body differ
  // significantly from back body." A lathe (surface of revolution) is
  // radially symmetric by construction, so the plain torso() lathe below
  // reads identically from front and back apart from the two bust spheres
  // that used to be glued onto the front only. This displaces the torso
  // lathe's own vertices instead: a breast bulge (front, two separate
  // lobes with a flat "valley" between them, not one central mound) and a
  // lower-back curve (a concave lumbar dip above a convex glute swell,
  // back only). Direct port of cloth-lab/src/body/torsoSculpt.js's own
  // bumpWindow()/femaleTorsoSculpt()/torsoZBump() — same numbers, same
  // math, expressed as plain functions the way every other helper in this
  // file already is (this file isn't an ES module cloth-lab can import
  // from). No collision-margin counterpart is needed here the way
  // collisionRig.js needed one for cloth-lab's real cloth sim — this
  // file's own garments (buildGarment() below) are a fixed static shell,
  // not physics, and were sized with generous fixed ease specifically
  // checked against these same bump amplitudes before picking them.
  function bumpWindow(x, center, halfWidth) {
    const d = Math.abs(x - center);
    return d >= halfWidth ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / halfWidth));
  }
  function femaleTorsoSculpt(d) {
    const { hipY, span, chestR, waistR, hipR } = d;
    return {
      breast: { centerY: hipY + span * 0.73, halfWidth: span * 0.15, amplitude: chestR * 0.15, phi0: 0.50, phiHalfWidth: 0.46 },
      lumbar: { centerY: hipY + span * 0.38, halfWidth: span * 0.14, amplitude: waistR * 0.12 },
      glute: { centerY: hipY - span * 0.02, halfWidth: span * 0.12, amplitude: hipR * 0.17 },
    };
  }
  function torsoZBump(y, phi, d) {
    const { breast, lumbar, glute } = femaleTorsoSculpt(d);
    let dz = 0;
    const lobe = bumpWindow(phi, breast.phi0, breast.phiHalfWidth) + bumpWindow(phi, -breast.phi0, breast.phiHalfWidth);
    dz += breast.amplitude * bumpWindow(y, breast.centerY, breast.halfWidth) * lobe;
    const backWeight = Math.max(0, -Math.cos(phi)); // 1 at phi=PI (straight back), 0 at the side seams
    dz += lumbar.amplitude * bumpWindow(y, lumbar.centerY, lumbar.halfWidth) * backWeight;
    dz -= glute.amplitude * bumpWindow(y, glute.centerY, glute.halfWidth) * backWeight;
    return dz;
  }
  function maleTorsoSculpt(d) {
    const { hipY, span, chestR, waistR, hipR } = d;
    return {
      chest: { centerY: hipY + span * 0.74, halfWidth: span * 0.15, amplitude: chestR * 0.09, phiHalfWidth: 0.84 },
      lumbar: { centerY: hipY + span * 0.38, halfWidth: span * 0.13, amplitude: waistR * 0.07 },
      glute: { centerY: hipY - span * 0.02, halfWidth: span * 0.11, amplitude: hipR * 0.11 },
    };
  }
  function maleTorsoZBump(y, phi, d) {
    const { chest, lumbar, glute } = maleTorsoSculpt(d);
    let dz = 0;
    // Pectoral twin plates with central sternal notch
    const pecLobe = bumpWindow(phi, 0.44, 0.40) + bumpWindow(phi, -0.44, 0.40);
    dz += chest.amplitude * bumpWindow(y, chest.centerY, chest.halfWidth) * (pecLobe * 0.82 + bumpWindow(phi, 0, chest.phiHalfWidth) * 0.35);
    const backWeight = Math.max(0, -Math.cos(phi));
    dz += lumbar.amplitude * bumpWindow(y, lumbar.centerY, lumbar.halfWidth) * backWeight;
    dz -= glute.amplitude * bumpWindow(y, glute.centerY, glute.halfWidth) * backWeight;
    return dz;
  }
  // Builds the torso the same way lathe() does, then bakes in the Z
  // flatten (instead of leaving it as a mesh-level scale.z) and, for adult
  // female bodies, displaces each vertex by torsoZBump() — see that
  // function's own header. Recomputes normals afterward since the flatten
  // is now baked into the geometry's own vertex positions rather than left
  // for three.js's automatic scale-to-normal-matrix handling to fix up.
  function sculptedTorso(profile, mat, zScale, female, kid, dims, seg = 32) {
    const pts = profile.map(p => new THREE.Vector2(Math.max(0.001, p[0]), p[1]));
    const geo = new THREE.LatheGeometry(pts, seg);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), zRaw = pos.getZ(i);
      let z = zRaw * zScale;
      const phi = Math.atan2(x, zRaw);
      if (female && !kid) z += torsoZBump(y, phi, dims);
      else if (!female && !kid) z += maleTorsoZBump(y, phi, dims);
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }

  // Continuous anatomical head sculpture: cranium, supraorbital arches, recessed orbital
  // eye sockets, nasal dorsum/bridge/tip, Cupid's bow, lips, and chin seamlessly displaced into one mesh.
  function sculptedHead(headH, skin, female, kid, category, seg = 32) {
    const profile = [
      [headH * 0.06, -headH * 0.48],  // submental junction
      [headH * 0.13, -headH * 0.45],  // chin (mentum)
      [headH * 0.22, -headH * 0.34],  // mandibular angle / lower jaw
      [headH * 0.30, -headH * 0.20],  // mid cheek / maxilla
      [headH * 0.37, -headH * 0.06],  // zygomatic cheekbone level
      [headH * 0.40, headH * 0.08],   // supraorbital brow line
      [headH * 0.41, headH * 0.22],   // temporal plane
      [headH * 0.35, headH * 0.38],   // parietal vault
      [headH * 0.22, headH * 0.47],   // upper parietal arch
      [headH * 0.02, headH * 0.50],   // apex of cranium
    ];
    const pts = profile.map(p => new THREE.Vector2(Math.max(0.001, p[0]), p[1]));
    const geo = new THREE.LatheGeometry(pts, seg);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), zRaw = pos.getZ(i);
      const phi = Math.atan2(x, zRaw);
      let dz = 0;

      // 1. Supraorbital Brow Ridge
      const browAmp = headH * (category === "men" ? 0.026 : (kid ? 0.014 : 0.018));
      dz += browAmp * bumpWindow(y, headH * 0.08, headH * 0.06) * bumpWindow(phi, 0, 0.65);

      // 2. Recessed Orbital Cavities (eye sockets indented backward)
      const orbitAmp = -headH * 0.038;
      const orbitLobe = bumpWindow(phi, 0.38, 0.24) + bumpWindow(phi, -0.38, 0.24);
      dz += orbitAmp * bumpWindow(y, headH * 0.03, headH * 0.07) * orbitLobe;

      // 3. Nasal Dorsum and Bridge
      const noseAmp = headH * (category === "men" ? 0.066 : (kid ? 0.045 : 0.056));
      dz += noseAmp * bumpWindow(y, -headH * 0.04, headH * 0.10) * bumpWindow(phi, 0, 0.18);

      // 4. Refined Nasal Tip
      const tipAmp = headH * (category === "men" ? 0.034 : (kid ? 0.024 : 0.030));
      dz += tipAmp * bumpWindow(y, -headH * 0.12, headH * 0.05) * bumpWindow(phi, 0, 0.14);

      // 5. Upper Lip & Cupid's bow
      const uLipAmp = headH * 0.024;
      dz += uLipAmp * bumpWindow(y, -headH * 0.21, headH * 0.04) * bumpWindow(phi, 0, 0.28);

      // 6. Lower Lip
      const lLipAmp = headH * 0.028;
      dz += lLipAmp * bumpWindow(y, -headH * 0.26, headH * 0.04) * bumpWindow(phi, 0, 0.25);

      // 7. Mentolabial Sulcus (groove under lower lip)
      const sulcusAmp = -headH * 0.015;
      dz += sulcusAmp * bumpWindow(y, -headH * 0.31, headH * 0.035) * bumpWindow(phi, 0, 0.25);

      // 8. Chin (Mental Protuberance)
      const chinAmp = headH * (category === "men" ? 0.045 : (kid ? 0.028 : 0.036));
      dz += chinAmp * bumpWindow(y, -headH * 0.38, headH * 0.08) * bumpWindow(phi, 0, 0.32);

      // 9. Cheekbones (Zygomatic Prominence)
      const cheekAmp = headH * (female ? 0.022 : 0.018);
      const cheekLobe = bumpWindow(phi, 0.62, 0.32) + bumpWindow(phi, -0.62, 0.32);
      dz += cheekAmp * bumpWindow(y, -headH * 0.04, headH * 0.08) * cheekLobe;

      // 10. Occipital Vault (back of skull)
      const backWeight = Math.max(0, -Math.cos(phi));
      dz -= headH * 0.042 * bumpWindow(y, headH * 0.12, headH * 0.26) * backWeight;

      pos.setXYZ(i, x * 0.82, y, zRaw * 0.92 + dz);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, skin);
    m.castShadow = true;
    return m;
  }

  // One hand — a flattened palm capsule + 4 fingers + angled thumb,
  // posed gracefully in a relaxed runway fashion posture.
  function addHand(parentGroup, r, armLen, mat, side = 1) {
    const handG = new THREE.Group();
    handG.position.set(0, -armLen, 0);
    const fingerR = r * 0.32, fingerLen = r * 3.2, palmLen = r * 1.6;
    const palm = capsule(r * 0.88, palmLen * 0.35, mat);
    palm.scale.set(1.25, 1, 0.58);
    palm.position.set(0, -palmLen * 0.5, 0);
    handG.add(palm);
    [-1.6, -0.55, 0.55, 1.6].forEach((fx, i) => {
      const long = i === 1 || i === 2;
      const finger = capsule(fingerR, fingerLen * (long ? 0.60 : 0.48), mat);
      finger.position.set(fx * fingerR * 1.80, -palmLen * 0.95 - fingerLen * (long ? 0.32 : 0.26), 0.005);
      finger.rotation.z = fx * 0.045;
      finger.rotation.x = -0.06;
      handG.add(finger);
    });
    const thumb = capsule(fingerR * 1.25, fingerLen * 0.38, mat);
    thumb.position.set(side * r * 1.40, -palmLen * 0.35, r * 0.45);
    thumb.rotation.set(0.22, 0, -side * 0.80);
    handG.add(thumb);
    parentGroup.add(handG);
    return handG;
  }

  // One foot — anatomical heel, arch, ball, and tapered toe cap.
  function addFoot(parentGroup, r, footLen, ankleY = 0, mat) {
    // If ankleY is passed as a material, reorder gracefully for backward compat
    if (ankleY && typeof ankleY === 'object' && ankleY.isMaterial) {
      mat = ankleY; ankleY = 0;
    }
    const footG = new THREE.Group();
    const baseY = -ankleY - footLen * 0.11;

    // Tarsus and metatarsus bridge (instep, contoured with smooth top and flat bottom)
    const bridge = capsule(r * 0.95, footLen * 0.44, mat);
    bridge.rotation.x = Math.PI * 0.46;
    bridge.scale.set(0.85, 0.46, 1.15);
    bridge.position.set(0, baseY + footLen * 0.04, footLen * 0.18);
    footG.add(bridge);

    // Calcaneus (heel counter)
    const heel = capsule(r * 0.88, footLen * 0.22, mat);
    heel.rotation.x = Math.PI * 0.42;
    heel.scale.set(0.80, 0.52, 0.85);
    heel.position.set(0, baseY + footLen * 0.04, -footLen * 0.14);
    footG.add(heel);

    // Forefoot & toe sweep (tapered)
    const toes = capsule(r * 0.72, footLen * 0.28, mat);
    toes.rotation.z = Math.PI * 0.5;
    toes.scale.set(0.68, 0.30, 0.65);
    toes.position.set(0, baseY - footLen * 0.02, footLen * 0.45);
    footG.add(toes);

    parentGroup.add(footG);
    return footG;
  }

  // Per-bundled-avatar landmark overrides — keyed by the GLB's filename
  // stem (see BUNDLED_AVATARS in js/app.js), not by category, since these
  // correct one specific mesh's own proportions, not every avatar sharing
  // its category. computeBodyDims()'s generic shoulderY/hipY fractions
  // assume ordinary human proportions; some single-image AI-reconstructed
  // avatars don't match them closely enough for the garment shell to land
  // outside the skin surface (BerryStudio-Upgrade-Plan-v3 WP-31).
  //
  // boy2.glb specifically: direct glTF POSITION-accessor measurement (a
  // per-Y-band XZ-cluster scan on the cleaned mesh — see the "direct
  // measurement, not guesswork" methodology already used for
  // stripPedestal()/keepLargestComponent() above) found its actual
  // crotch/leg-split at ~0.33 of total mesh height and its actual
  // underarm/shoulder line at ~0.65 — both ~14-15 points below the
  // generic kid assumption of 0.47/0.80. The consistent, near-uniform
  // offset points to one root cause: this mesh's head is proportionally
  // larger than the generic kid headH (0.16H) assumes, which compresses
  // every landmark below it as a fraction of total height.
  //
  // Y-position alone (shoulderYFrac/hipYFrac) was NOT sufficient on its
  // own, contrary to the initial hypothesis — verified directly in-browser
  // (garmentGroup temporarily forced visible/hidden to isolate it from the
  // body mesh) by holding radiusScale at 1 with the corrected fractions:
  // the shell still rendered fully inside the skin. boy2's chest/waist/hip
  // radii, derived the same way as every other avatar from the entered
  // body measurements, are simply too small for this specific mesh's own
  // scale. The earlier radius-only attempt (v2/v3 WP-31 §3 Attempt 2) had
  // tried 1.32x-3.0x and found "no stable middle ground" — but that search
  // was done against the WRONG (default) Y position, so it was scaling a
  // shell that was sitting mostly up around the neck, not the torso, and
  // could never have looked right at any radius. With the Y position fixed
  // first, radiusScale 2.3 (re-testing the same range the old attempt
  // already flagged as promising) lands a correctly-shaped, outside-the-
  // skin shell — verified by screenshot, back view, WP-31 acceptance met.
  const AVATAR_LANDMARK_OVERRIDES = {
    boy2: { shoulderYFrac: 0.65, hipYFrac: 0.33, radiusScale: 2.3 },
  };

  // Measurement-only body proportions — independent of which mesh (procedural
  // or a loaded GLB) they get applied to, so loadGLB() can reuse it to size
  // and place a garment on a custom avatar the same way buildProcedural() does.
  // `landmarks` is an optional { shoulderYFrac, hipYFrac, radiusScale? }
  // override (see AVATAR_LANDMARK_OVERRIDES above) — omitted for
  // buildProcedural() and every GLB avatar that doesn't need one, so their
  // behavior is unchanged.
  function computeBodyDims(category, m, landmarks) {
    const female = category === "women" || category === "girls";
    const kid = category === "girls" || category === "boys";
    const H = cm(m.height);
    const headH = H * (kid ? 0.16 : 0.128);
    const neckTopY = H - headH;
    const shoulderY = H * (landmarks ? landmarks.shoulderYFrac : (kid ? 0.80 : 0.82));
    const hipY = H * (landmarks ? landmarks.hipYFrac : (kid ? 0.47 : 0.52));

    let chestR = R(m.chest), waistR = R(m.waist), hipR = R(m.hips);
    let shoulderHalf = cm(m.shoulder) / 2;
    const neckR = R(m.neck) * 0.85;
    if (female) { waistR *= 0.86; hipR *= 1.03; }
    else { waistR *= 0.97; shoulderHalf *= 1.07; chestR *= 1.03; }
    if (kid) { waistR = (waistR + chestR) / 2 * 0.96; hipR *= 0.97; shoulderHalf *= 0.98; }
    if (landmarks && landmarks.radiusScale) { chestR *= landmarks.radiusScale; waistR *= landmarks.radiusScale; hipR *= landmarks.radiusScale; shoulderHalf *= landmarks.radiusScale; }

    const span = shoulderY - hipY;
    const armLen = H * (kid ? 0.40 : 0.44);
    const upperR = R(m.bicep) * (female ? 0.9 : 1.0);
    const legLen = hipY;
    const thighR = R(m.thigh) * (female ? 1.0 : 0.98);
    return { female, kid, H, headH, neckTopY, shoulderY, hipY, chestR, waistR, hipR, shoulderHalf, neckR, span, armLen, upperR, legLen, thighR };
  }

  // ---------- procedural body ----------
  function buildProcedural(category, m) {
    curCategory = category;
    curMeasurements = m;
    disposeObject3D(bodyGroup); disposeObject3D(garmentGroup);
    root.clear(); limbs = {};
    bodyGroup = new THREE.Group(); root.add(bodyGroup);

    const d0 = computeBodyDims(category, m);
    lastDims = d0;
    const { female, kid, H, headH, neckTopY, shoulderY, hipY, chestR, waistR, hipR, shoulderHalf, neckR, span } = d0;
    curH = H;
    const skin = skinMat(category);
    // torso lathe (round) then flattened front-to-back. A real waist->
    // ribcage->bust S-curve, not three straight lerped segments — same
    // pass cloth-lab/src/body/computeBodyDims.js's own torsoProfile() got
    // (that file's the fuller writeup of why: 2 extra smoothing points,
    // capped there by a hard collision-capsule budget this file has no
    // equivalent of, but kept to the same count here for one shared
    // silhouette language between the two apps). Every anchor Y this
    // file's OWN buildGarment() below also hardcodes (waist at
    // hipY+span*0.44, chest at hipY+span*0.76) is unchanged — only the
    // curve BETWEEN them picked up the 2 new points.
    //
    // Built via sculptedTorso(), not the plain lathe() helper — a second
    // pass, still user-requested: the female torso now has a real breast
    // and lower-back curve displaced into its own mesh (see that
    // function's own header), not just two spheres glued onto an
    // otherwise front/back-symmetric shell. The old glued-on bust spheres
    // below are gone; the torso surface itself now carries that volume.
    const torso = sculptedTorso([
      [hipR * 0.52, hipY - span * 0.16],
      [hipR * 0.94, hipY - span * 0.06], // glute / pelvic base
      [hipR * 1.02, hipY],               // widest hip / greater trochanter
      [hipR * 0.98, hipY + span * 0.08], // iliac crest
      [hipR * 0.90, hipY + span * 0.22], // hip->waist taper
      [waistR, hipY + span * 0.44],      // natural waist
      [waistR * 1.08, hipY + span * 0.58], // ribcage flare
      [chestR * (female ? 1.02 : 1.04), hipY + span * 0.74], // chest / bust line
      [chestR * (female ? 0.92 : 1.06), shoulderY - span * 0.03], // upper chest / deltoid line
      [neckR * 1.22, shoulderY + span * 0.02], // trapezius neck base
    ], skin, female ? 0.72 : 0.78, female, kid, d0, 32);
    bodyGroup.add(torso);

    // sculpted anatomical neck
    const neck = lathe([
      [neckR * 1.30, shoulderY - span * 0.02],
      [neckR * 1.10, shoulderY + (neckTopY - shoulderY) * 0.25],
      [neckR * 0.96, shoulderY + (neckTopY - shoulderY) * 0.60],
      [neckR * 0.92, neckTopY],
    ], skin, 32);
    bodyGroup.add(neck);

    const headG = new THREE.Group();
    headG.position.y = neckTopY + headH * 0.5;
    const headMesh = sculptedHead(headH, skin, female, kid, category, 36);
    headG.add(headMesh);

    addFace(headG, headH, category, skin);
    addHair(headG, headH, category);
    bodyGroup.add(headG);
    limbs.head = headG;

    // arms — multi-joint articulated skeleton (shoulder -> elbow -> wrist & hand)
    const { armLen, upperR } = d0;
    const upperArmLen = armLen * 0.48;
    const forearmLen = armLen * 0.46;

    [-1, 1].forEach(s => {
      // Shoulder pivot group
      const shoulderG = new THREE.Group();
      shoulderG.position.set(s * shoulderHalf * 0.94, shoulderY - span * 0.03, 0);

      // Upper arm mesh with anatomical deltoid shoulder cap covering the pivot
      const upperArm = lathe([
        [upperR * 1.35, upperArmLen * 0.08], // deltoid upper cap seamlessly capping the shoulder pivot
        [upperR * 1.28, 0],                  // deltoid lateral contour
        [upperR * 1.12, -upperArmLen * 0.24],// deltoid insertion / bicep fullness
        [upperR * 0.98, -upperArmLen * 0.52],// mid brachium
        [upperR * 0.82, -upperArmLen * 0.80],// distal taper
        [upperR * 0.72, -upperArmLen],       // elbow joint
      ], skin, 24);
      shoulderG.add(upperArm);

      // Elbow pivot group (child of shoulder group!)
      const elbowG = new THREE.Group();
      elbowG.position.set(0, -upperArmLen, 0);

      // Forearm mesh — begins seamlessly at upper arm termination
      const forearm = lathe([
        [upperR * 0.72, 0],                  // elbow joint
        [upperR * 0.76, -forearmLen * 0.18], // brachioradialis muscular fullness
        [upperR * 0.64, -forearmLen * 0.44], // forearm muscular taper
        [upperR * 0.48, -forearmLen * 0.76], // distal forearm
        [upperR * 0.35, -forearmLen],        // carpal wrist
      ], skin, 24);
      elbowG.add(forearm);

      // Hand added at the end of the forearm with articulated wrist group
      const handG = addHand(elbowG, upperR * 0.32, forearmLen, skin, s);

      shoulderG.add(elbowG);
      shoulderG.rotation.z = s * 0.09;
      bodyGroup.add(shoulderG);

      limbs["arm" + s] = shoulderG;
      limbs["elbow" + s] = elbowG;
      limbs["hand" + s] = handG;
    });

    // legs — multi-joint articulated skeleton (hip -> knee -> ankle & foot)
    const { legLen, thighR } = d0;
    const thighLen = legLen * 0.50;
    const calfLen = legLen * 0.44;
    const footLen = thighR * 2.8;

    [-1, 1].forEach(s => {
      // Hip / Thigh pivot group
      const thighG = new THREE.Group();
      thighG.position.set(s * hipR * 0.50, hipY - span * 0.04, 0);

      // Upper leg mesh (thigh / quadriceps / hamstrings)
      const thigh = lathe([
        [thighR * 1.24, 0],                  // trochanter / upper thigh
        [thighR * 1.14, -thighLen * 0.20],   // quadriceps fullness
        [thighR * 0.98, -thighLen * 0.48],   // mid thigh
        [thighR * 0.82, -thighLen * 0.76],   // vastus medialis / lateralis
        [thighR * 0.68, -thighLen * 0.94],   // suprapatellar
        [thighR * 0.62, -thighLen],          // knee line
      ], skin, 28);
      thighG.add(thigh);

      // Knee pivot group (child of thigh group!)
      const kneeG = new THREE.Group();
      kneeG.position.set(0, -thighLen, 0);

      // Lower leg mesh (shin, gastrocnemius calf, Achilles tendon)
      const calf = lathe([
        [thighR * 0.62, 0],                  // knee joint
        [thighR * 0.65, -calfLen * 0.08],    // patellar tendon transition
        [thighR * 0.76, -calfLen * 0.24],    // gastrocnemius calf muscle apex
        [thighR * 0.66, -calfLen * 0.44],    // soleus taper
        [thighR * 0.48, -calfLen * 0.72],    // Achilles tendon
        [thighR * 0.38, -calfLen * 0.90],    // supramalleolar
        [thighR * 0.36, -calfLen],           // medial/lateral malleoli (ankle)
      ], skin, 28);
      kneeG.add(calf);

      // Foot pivot group (child of knee group!)
      const footG = new THREE.Group();
      footG.position.set(0, -calfLen, 0);
      addFoot(footG, thighR * 0.36, footLen, 0, skin);
      kneeG.add(footG);

      thighG.add(kneeG);
      bodyGroup.add(thighG);

      limbs["leg" + s] = thighG;
      limbs["knee" + s] = kneeG;
      limbs["foot" + s] = footG;
    });

    buildGarment(category, m, d0);
    controls.target.set(0, H * 0.5, 0);
    frameCamera(H);
  }

  // ---------- face ----------
  function addFace(headG, headH, category, skin) {
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xfbf9f6, roughness: 0.15 });
    const irisColor = category === "women" ? 0x3d271d : (category === "girls" ? 0x4a2e1f : 0x221812);
    const irisMat = new THREE.MeshStandardMaterial({ color: irisColor, roughness: 0.12 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lipColor = category === "women" ? 0xb55358 : (category === "girls" ? 0xce6c72 : (category === "boys" ? 0xa8675a : 0x9e5b50));
    const lipMat = new THREE.MeshStandardMaterial({
      color: lipColor,
      roughness: 0.42,
      side: THREE.DoubleSide,
    });
    const browMat = new THREE.MeshStandardMaterial({ color: HAIR[category] || 0x241913, roughness: 0.65 });
    const ey = headH * 0.03, ex = headH * 0.15;
    const eyeZ = headH * 0.285; // recessed flush inside the orbital sockets!

    [-1, 1].forEach(s => {
      // Sclera (eyeball) set deep inside the recessed orbital socket
      const white = sphere(headH * 0.060, eyeMat);
      white.scale.set(0.88, 0.50, 0.44);
      white.position.set(s * ex, ey, eyeZ);
      headG.add(white);

      // Iris sitting flush on the sclera
      const iris = sphere(headH * 0.032, irisMat);
      iris.scale.set(1, 1, 0.3);
      iris.position.set(s * ex, ey, eyeZ + headH * 0.015);
      headG.add(iris);

      // Pupil flush on iris
      const pupil = sphere(headH * 0.015, pupilMat);
      pupil.scale.set(1, 1, 0.2);
      pupil.position.set(s * ex, ey, eyeZ + headH * 0.022);
      headG.add(pupil);

      // Corneal specular catchlight
      const glint = sphere(headH * 0.006, glintMat);
      glint.position.set(s * ex + headH * 0.009, ey + headH * 0.009, eyeZ + headH * 0.026);
      headG.add(glint);

      // Delicate upper eyelid crease / lash line framing the orbit
      const upperLash = capsule(headH * 0.008, headH * 0.12, browMat);
      upperLash.rotation.z = Math.PI * 0.5 + s * 0.12;
      upperLash.position.set(s * ex, ey + headH * 0.025, eyeZ + headH * 0.012);
      headG.add(upperLash);

      // Delicate lower eyelid contour
      const lowerLash = capsule(headH * 0.006, headH * 0.10, skin);
      lowerLash.rotation.z = Math.PI * 0.5 - s * 0.08;
      lowerLash.position.set(s * ex, ey - headH * 0.024, eyeZ + headH * 0.010);
      headG.add(lowerLash);

      // Natural arched editorial eyebrow following the supraorbital rim
      const brow = capsule(headH * (category === "men" ? 0.016 : 0.011), headH * 0.17, browMat);
      brow.rotation.z = Math.PI * 0.5 - s * 0.14;
      brow.rotation.y = s * 0.15;
      brow.position.set(s * ex, ey + headH * 0.075, headH * 0.355);
      headG.add(brow);

      // Elegant ear hugging the temporal contour
      const earG = new THREE.Group();
      earG.position.set(s * headH * 0.37, ey - headH * 0.04, -headH * 0.04);
      earG.rotation.y = -s * 0.15;
      const helix = capsule(headH * 0.020, headH * 0.12, skin);
      helix.scale.set(0.65, 1.1, 0.85);
      earG.add(helix);
      headG.add(earG);
    });

    // Subtle vermilion lip tint accentuating the sculpted Cupid's bow and lower fullness
    const upperVermilion = capsule(headH * 0.011, headH * 0.11, lipMat);
    upperVermilion.rotation.z = Math.PI * 0.5;
    upperVermilion.position.set(0, -headH * 0.215, headH * 0.302);
    upperVermilion.scale.set(1.0, 0.65, 0.45);
    headG.add(upperVermilion);

    const lowerVermilion = capsule(headH * 0.014, headH * 0.09, lipMat);
    lowerVermilion.rotation.z = Math.PI * 0.5;
    lowerVermilion.position.set(0, -headH * 0.260, headH * 0.298);
    lowerVermilion.scale.set(1.0, 0.70, 0.45);
    headG.add(lowerVermilion);
  }

  // ---------- hair ----------
  function addHair(headG, headH, category) {
    const hairColor = HAIR[category] || 0x241913;
    const mat = new THREE.MeshPhysicalMaterial({
      color: hairColor,
      roughness: 0.40,
      metalness: 0.08,
      sheen: 0.70,
      sheenColor: new THREE.Color(0x8a624a),
      side: THREE.DoubleSide
    });

    // Crown scalp cap
    const cap = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.54, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.46), mat);
    cap.position.y = headH * 0.08; cap.castShadow = true; headG.add(cap);

    const backCap = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.53, 24, 18, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.55), mat);
    backCap.rotation.y = -Math.PI / 2; backCap.position.z = -headH * 0.02; backCap.castShadow = true; headG.add(backCap);

    if (category === "women") {
      // Elegant fashion chignon updo bun at occipital nape
      const bun = sphere(headH * 0.25, mat);
      bun.scale.set(1.15, 0.95, 0.88);
      bun.position.set(0, headH * 0.12, -headH * 0.46);
      headG.add(bun);

      // Chignon braid / twist wrap around bun base
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.19, headH * 0.045, 8, 16), mat);
      wrap.position.set(0, headH * 0.12, -headH * 0.42);
      headG.add(wrap);

      // Swept front volume / bangs
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.22, 16, 12, 0, Math.PI * 0.9, 0, Math.PI * 0.6), mat);
      fringe.position.set(-headH * 0.08, headH * 0.28, headH * 0.28);
      fringe.rotation.set(0.3, 0.4, -0.2);
      headG.add(fringe);

      // Face-framing side tendrils
      [-1, 1].forEach(s => {
        const sideLock = capsule(headH * 0.042, headH * 0.68, mat);
        sideLock.position.set(s * headH * 0.42, -headH * 0.16, -headH * 0.02);
        sideLock.rotation.z = s * 0.08;
        sideLock.rotation.x = 0.05;
        headG.add(sideLock);
      });
    } else if (category === "men") {
      // Modern textured taper crop with volume
      const topVolume = sphere(headH * 0.38, mat);
      topVolume.scale.set(0.92, 0.42, 1.08);
      topVolume.position.set(0, headH * 0.30, headH * 0.02);
      headG.add(topVolume);

      // Front quiff / pompadour lift
      const quiff = capsule(headH * 0.08, headH * 0.32, mat);
      quiff.rotation.z = Math.PI * 0.5;
      quiff.position.set(0, headH * 0.36, headH * 0.24);
      headG.add(quiff);

      // Clean sideburns alongside ears
      [-1, 1].forEach(s => {
        const burn = capsule(headH * 0.038, headH * 0.22, mat);
        burn.position.set(s * headH * 0.41, headH * 0.02, headH * 0.06);
        headG.add(burn);
      });
    } else if (category === "girls") {
      // Sweet twin high pigtails with vibrant hair ties
      const tieMat = new THREE.MeshStandardMaterial({ color: 0xff4d88, roughness: 0.3 });
      [-1, 1].forEach(s => {
        // Hair tie
        const tie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.07, headH * 0.024, 6, 12), tieMat);
        tie.position.set(s * headH * 0.44, headH * 0.18, -headH * 0.12);
        tie.rotation.y = s * 0.4;
        headG.add(tie);

        // Pigtail bunch
        const p = capsule(headH * 0.09, headH * 0.70, mat);
        p.position.set(s * headH * 0.52, headH * 0.02, -headH * 0.15);
        p.rotation.z = s * 0.48;
        p.rotation.x = -0.18;
        p.castShadow = true;
        headG.add(p);
      });

      // Front wispy bangs
      const bangs = capsule(headH * 0.045, headH * 0.36, mat);
      bangs.rotation.z = Math.PI * 0.5;
      bangs.position.set(0, headH * 0.25, headH * 0.36);
      headG.add(bangs);
    } else if (category === "boys") {
      // Neat youthful side crop
      const topCrop = sphere(headH * 0.36, mat);
      topCrop.scale.set(0.90, 0.36, 1.02);
      topCrop.position.set(headH * 0.04, headH * 0.28, 0);
      headG.add(topCrop);

      // Layered boyish fringe
      const fringe = capsule(headH * 0.05, headH * 0.30, mat);
      fringe.rotation.z = Math.PI * 0.46;
      fringe.position.set(headH * 0.02, headH * 0.26, headH * 0.33);
      headG.add(fringe);
    }
  }

  // ---------- garment (representative, per category) ----------
  function buildGarment(category, m, d) {
    garmentGroup = new THREE.Group(); root.add(garmentGroup);
    const female = category === "women" || category === "girls";

    // bodice — a slightly larger torso shell from waist to shoulders
    const t = 0.014; // ease / thickness
    const topY = d.shoulderY - d.span * 0.06;
    const waistYY = d.hipY + d.span * 0.44;
    const bodiceProfile = [
      [d.hipR + t, d.hipY + d.span * 0.02],
      [d.waistR + t, waistYY],
      [d.chestR * (female ? 1.08 : 1.05) + t, d.hipY + d.span * 0.76],
      [d.chestR * (female ? 0.98 : 1.08) + t, topY],
    ];
    const [bodiceFront, bodiceBack] = latheHalves(bodiceProfile, fabricMat("bodice", "front"), fabricMat("bodice", "back"), "bodice", 32);
    bodiceFront.scale.z = bodiceBack.scale.z = female ? 0.82 : 0.82;
    bodiceFront.userData.garmentType = bodiceBack.userData.garmentType = "full";
    garmentGroup.add(bodiceFront, bodiceBack);

    // bra / cropped bustier shell — dedicated wireless soft-cup & underband silhouette
    const braUnderbandY = waistYY + d.span * 0.08;
    const braTopY = d.shoulderY - d.span * 0.12;
    const braProfile = [
      [d.waistR * 1.04 + t, braUnderbandY],
      [d.chestR * (female ? 1.08 : 1.04) + t, d.hipY + d.span * 0.74],
      [d.chestR * (female ? 0.96 : 1.02) + t, braTopY],
    ];
    const [braFront, braBack] = latheHalves(braProfile, fabricMat("bodice", "front"), fabricMat("bodice", "back"), "bodice", 32);
    braFront.scale.z = braBack.scale.z = female ? 0.84 : 0.82;
    braFront.userData.garmentType = braBack.userData.garmentType = "bra";
    garmentGroup.add(braFront, braBack);

    // skirt — dress/skirt shell for all categories (visibility decides if shown)
    const skirtHemY = (category === "girls" || category === "boys") ? d.H * 0.30 : d.H * 0.14;
    const flare = (category === "girls" || category === "boys") ? 2.1 : 1.95;
    const skirtProfile = [
      [d.waistR + t, waistYY + 0.005],
      [d.hipR * 1.08 + t, d.hipY],
      [d.hipR * 1.38, (d.hipY + skirtHemY) * 0.55],
      [d.hipR * flare, skirtHemY],
    ];
    const [skirtFront, skirtBack] = latheHalves(skirtProfile, fabricMat("skirt", "front"), fabricMat("skirt", "back"), "skirt", 40);
    skirtFrontMesh = skirtFront;
    skirtBackMesh = skirtBack;
    garmentGroup.add(skirtFront, skirtBack);

    // trousers — seat bridge + leg panels
    const pantHemY = (category === "boys" || category === "girls") ? d.H * 0.28 : d.H * 0.03;
    const seatProfile = [
      [d.waistR * 1.02 + t, waistYY],
      [d.hipR * 1.15 + t, d.hipY],
      [d.hipR * 1.16 + t, d.hipY - d.span * 0.14],
      [d.hipR * 1.12 + t, d.hipY - d.span * 0.24],
    ];
    const [seatFront, seatBack] = latheHalves(seatProfile, fabricMat("trousers", "front"), fabricMat("trousers", "back"), "trousers", 28);
    seatFront.scale.z = seatBack.scale.z = 0.88;
    seatFront.userData.subPart = seatBack.userData.subPart = "seat";
    garmentGroup.add(seatFront, seatBack);

    const pivotY = d.hipY - d.span * 0.05;
    const thighLen = d.legLen * 0.50;
    const calfLen = d.legLen * 0.44;

    [-1, 1].forEach(s => {
      const legPivot = limbs["leg" + s];
      const kneePivot = limbs["knee" + s];

      if (legPivot && kneePivot) {
        // Multi-joint articulated trousers: thigh panel follows femur, calf panel follows tibia.
        // Deeply overlapping cuffs across knee joint guarantee 100% enclosed limbs throughout stride!
        const thighProfile = [
          [d.thighR * 1.48, d.span * 0.08],
          [d.thighR * 1.42, 0],
          [d.thighR * 1.32, -thighLen * 0.35],
          [d.thighR * 1.28, -thighLen * 0.70],
          [d.thighR * 1.25, -thighLen * 0.95],
          [d.thighR * 1.22, -thighLen * 1.15], // deep overlapping knee cuff down past knee
        ];
        const [thighFront, thighBack] = latheHalves(thighProfile, fabricMat("trousers", "front"), fabricMat("trousers", "back"), "trousers", 24);
        thighFront.position.set(0, 0, 0);
        thighBack.position.set(0, 0, 0);
        thighFront.userData.subPart = thighBack.userData.subPart = "thigh";
        legPivot.add(thighFront, thighBack);

        const hemLocalY = Math.max(-calfLen * 0.96, pantHemY - (pivotY - thighLen));
        if (hemLocalY < -calfLen * 0.08) {
          const calfProfile = [
            [d.thighR * 1.20, thighLen * 0.12],  // upward telescoping cuff inside thigh cuff
            [d.thighR * 1.22, 0],               // knee joint
            [d.thighR * 1.18, -calfLen * 0.28], // calf muscle clearance
            [d.thighR * 1.10, -calfLen * 0.65], // lower shin clearance
            [d.thighR * 1.04, hemLocalY],       // trouser cuff
          ];
          const [calfFront, calfBack] = latheHalves(calfProfile, fabricMat("trousers", "front"), fabricMat("trousers", "back"), "trousers", 24);
          calfFront.position.set(0, 0, 0);
          calfBack.position.set(0, 0, 0);
          calfFront.userData.subPart = calfBack.userData.subPart = "calf";
          kneePivot.add(calfFront, calfBack);
        }
      } else if (legPivot) {
        // Fallback for single-joint avatars
        const legProfileLocal = [
          [d.thighR * 1.45, d.span * 0.07],
          [d.thighR * 1.40, 0],
          [d.thighR * 1.28, -d.legLen * 0.28],
          [d.thighR * 1.22, -d.legLen * 0.52],
          [d.thighR * 1.20, -d.legLen * 0.70],
          [d.thighR * 1.18, -(pivotY - pantHemY)],
        ];
        const [legFront, legBack] = latheHalves(legProfileLocal, fabricMat("trousers", "front"), fabricMat("trousers", "back"), "trousers", 24);
        legFront.position.set(0, 0, 0);
        legBack.position.set(0, 0, 0);
        legPivot.add(legFront, legBack);
      } else {
        const legProfileWorld = [
          [d.thighR * 1.45, d.hipY + d.span * 0.02],
          [d.thighR * 1.40, pivotY],
          [d.thighR * 1.28, pivotY - d.legLen * 0.28],
          [d.thighR * 1.22, pivotY - d.legLen * 0.52],
          [d.thighR * 1.20, pivotY - d.legLen * 0.70],
          [d.thighR * 1.18, pantHemY],
        ];
        const [legFront, legBack] = latheHalves(legProfileWorld, fabricMat("trousers", "front"), fabricMat("trousers", "back"), "trousers", 24);
        legFront.position.x = legBack.position.x = s * d.hipR * 0.5;
        garmentGroup.add(legFront, legBack);
      }
    });

    // sleeves — parented to arm & elbow pivots for natural articulated flexing
    const longSleeve = category === "men" || category === "women";
    const upperArmLen = d.armLen * 0.48;
    const forearmLen = d.armLen * 0.46;
    const slR = category === "girls" ? 1.35 : category === "boys" ? 1.18 : 1.10;
    const upperSlLen = category === "girls" ? d.armLen * 0.34 : (category === "boys" ? d.armLen * 0.42 : upperArmLen * 1.04);

    [-1, 1].forEach(s => {
      const armPivot = limbs["arm" + s];
      const elbowPivot = limbs["elbow" + s];

      if (armPivot) {
        const upperSl = capsule(d.upperR * slR + t, upperSlLen, fabricMat("sleeve"));
        upperSl.name = "sleeve";
        upperSl.position.y = -upperSlLen * 0.5 - d.armLen * 0.02;
        armPivot.add(upperSl);

        if (longSleeve && elbowPivot) {
          const lowerSlLen = forearmLen * 0.92;
          const lowerSl = capsule(d.upperR * slR * 0.88 + t, lowerSlLen, fabricMat("sleeve"));
          lowerSl.name = "sleeve";
          lowerSl.position.y = -lowerSlLen * 0.48;
          elbowPivot.add(lowerSl);
        }
      } else {
        const fullSlLen = d.armLen * (longSleeve ? 0.9 : (category === "girls" ? 0.34 : 0.45));
        const sl = capsule(d.upperR * slR + t, fullSlLen, fabricMat("sleeve"));
        sl.name = "sleeve";
        sl.position.set(s * d.shoulderHalf * 0.95, d.shoulderY - d.span * 0.04 - fullSlLen * 0.5 - d.armLen * 0.02, 0);
        garmentGroup.add(sl);
      }
    });

    buildAccessories(d);
    applyPieceVisibility();
  }

  // ---------- Accessories & Trims: Buttons & Zippers ----------
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
      mat = new THREE.MeshPhysicalMaterial({ color: baseColor || 0x6d5efc, roughness: 0.5 });
    }

    const r = (size || 1.0) * 0.007; // approx 7mm radius
    const thick = r * 0.25;

    // Outer rim: Torus
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.88, r * 0.16, 12, 24), mat);
    rim.castShadow = true;
    btnG.add(rim);

    // Concave face disc
    const faceGeom = new THREE.CylinderGeometry(r * 0.85, r * 0.85, thick, 24);
    faceGeom.rotateX(Math.PI / 2);
    const face = new THREE.Mesh(faceGeom, mat);
    face.position.z = -thick * 0.15;
    face.castShadow = true;
    btnG.add(face);

    // 4 Stitch Holes
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const holeR = r * 0.12;
    const holeOffset = r * 0.32;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([hx, hy]) => {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(holeR, 10), holeMat);
      hole.position.set(hx * holeOffset, hy * holeOffset, thick * 0.38);
      btnG.add(hole);
    });

    // Cross thread stitches
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

    // Fabric tape backing
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.024, len), tapeMat);
    tape.position.set(0, midY, radius + 0.002);
    zipG.add(tape);

    // Interlocking metallic teeth
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

    // Slider box & pull tab
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

  function createBeltMesh(waistY, waistR, style, width = "medium", baseCol = 0x6d5efc) {
    const beltG = new THREE.Group();
    const h = width === "slim" ? 0.024 : (width === "wide" ? 0.062 : 0.038);
    const r = waistR * 1.035 + 0.016;

    let strapMat;
    let buckleMat;
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

    // Cylindrical curved strap around waist
    const strapGeo = new THREE.CylinderGeometry(r, r, h, 36, 1, true);
    const strapMesh = new THREE.Mesh(strapGeo, strapMat);
    strapMesh.position.y = waistY;
    strapMesh.scale.z = 0.85;
    beltG.add(strapMesh);

    // Sculpted Metallic Buckle at center front
    const bW = h * 1.45;
    const bH = h * 1.25;
    const bThick = 0.006;
    const buckleG = new THREE.Group();
    buckleG.position.set(0, waistY, r * 0.85 + 0.006);

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

    // --- Buttons ---
    if (bCfg && bCfg.enabled) {
      const count = Math.max(1, Math.min(12, bCfg.count || 6));
      const style = bCfg.style || "gold";
      const baseCol = fabricState.bodice?.front?.color || 0x6d5efc;

      if (bCfg.placement === "front_placket") {
        const startY = d.hipY + d.span * 0.74;
        const endY = waistYY;
        const step = (startY - endY) / (count + 1);
        for (let i = 1; i <= count; i++) {
          const y = startY - step * i;
          const frac = (y - waistYY) / (startY - waistYY);
          const r = (d.waistR * (1 - frac) + d.chestR * 1.05 * frac) + 0.018;
          const btn = createButtonMesh(1.0, style, baseCol);
          btn.position.set(0, y, r);
          btn.userData.parentPart = "bodice";
          accessoriesGroup.add(btn);
        }
      } else if (bCfg.placement === "double_breasted") {
        const startY = d.hipY + d.span * 0.74;
        const endY = waistYY;
        const rows = Math.max(1, Math.round(count / 2));
        const step = (startY - endY) / (rows + 1);
        const colOffset = 0.045; // 4.5 cm
        for (let i = 1; i <= rows; i++) {
          const y = startY - step * i;
          const frac = (y - waistYY) / (startY - waistYY);
          const r = (d.waistR * (1 - frac) + d.chestR * 1.05 * frac) + 0.016;
          [-1, 1].forEach(col => {
            const btn = createButtonMesh(1.0, style, baseCol);
            btn.position.set(col * colOffset, y, r * 0.96);
            btn.userData.parentPart = "bodice";
            accessoriesGroup.add(btn);
          });
        }
      } else if (bCfg.placement === "waistband") {
        const r = d.waistR * 1.04 + 0.018;
        const btn = createButtonMesh(1.15, style, baseCol);
        btn.position.set(0, waistYY, r);
        btn.userData.parentPart = "trousers";
        accessoriesGroup.add(btn);
      } else if (bCfg.placement === "cuffs") {
        [-1, 1].forEach(s => {
          const armG = limbs["elbow" + s] || limbs["arm" + s];
          if (armG) {
            for (let i = 0; i < Math.min(3, count); i++) {
              const btn = createButtonMesh(0.75, style, baseCol);
              btn.position.set(s * (d.upperR * 1.15), -d.armLen * (0.35 + i * 0.04), 0);
              btn.rotation.y = s * Math.PI / 2;
              btn.userData.parentPart = "sleeve";
              accessoriesGroup.add(btn);
            }
          }
        });
      }
    }

    // --- Zipper ---
    if (zCfg && zCfg.enabled) {
      const style = zCfg.style || "silver";
      const openPct = zCfg.openPct || 0;

      if (zCfg.placement === "center_front") {
        const startY = d.hipY + d.span * 0.74;
        const endY = waistYY;
        const r = d.waistR * 1.04 + 0.015;
        const zip = createZipperMesh(startY, endY, r, style, openPct);
        zip.userData.parentPart = "bodice";
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "center_back") {
        const startY = d.hipY + d.span * 0.74;
        const endY = d.hipY;
        const r = d.waistR * 1.04 + 0.015;
        const zip = createZipperMesh(startY, endY, -r, style, openPct);
        zip.rotation.y = Math.PI;
        zip.userData.parentPart = "bodice";
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "biker_asymmetric") {
        const startY = d.shoulderY - d.span * 0.08;
        const endY = waistYY;
        const r = d.waistR * 1.04 + 0.016;
        const zip = createZipperMesh(startY, endY, r, style, openPct);
        zip.position.x = 0.035;
        zip.rotation.z = -0.15; // diagonal biker angle
        zip.userData.parentPart = "bodice";
        accessoriesGroup.add(zip);
      } else if (zCfg.placement === "trouser_fly") {
        const startY = waistYY;
        const endY = d.hipY - d.span * 0.12;
        const r = d.hipR * 1.14 + 0.016;
        const zip = createZipperMesh(startY, endY, r, style, openPct);
        zip.userData.parentPart = "trousers";
        accessoriesGroup.add(zip);
      }
    }

    // --- Belt & Buckle ---
    if (beltCfg && beltCfg.enabled) {
      const bStyle = beltCfg.style || "leather_gold";
      const bWidth = beltCfg.width || "medium";
      const baseCol = fabricState.bodice?.front?.color || fabricState.skirt?.front?.color || fabricState.trousers?.front?.color || 0x6d5efc;
      const belt = createBeltMesh(waistYY, d.waistR, bStyle, bWidth, baseCol);
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

    // Stems & vines
    ctx.strokeStyle = "#4a6b57";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 128); ctx.bezierCurveTo(140, 80, 180, 220, 256, 128);
    ctx.bezierCurveTo(340, 40, 420, 200, 512, 128);
    ctx.moveTo(0, 384); ctx.bezierCurveTo(140, 320, 180, 480, 256, 384);
    ctx.bezierCurveTo(340, 300, 420, 460, 512, 384);
    ctx.stroke();

    // Leaves
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
    [[100, 110, 0.4], [200, 170, -0.5], [300, 90, 0.6], [410, 160, -0.4],
     [100, 360, 0.4], [200, 430, -0.5], [300, 350, 0.6], [410, 420, -0.4]].forEach(([x, y, a]) => drawLeaf(x, y, a));

    // Blooming Flowers
    function drawFlower(cx, cy, color, petalColor, scale = 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.fillStyle = petalColor;
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        const px = Math.cos(a) * 16;
        const py = Math.sin(a) * 16;
        ctx.beginPath();
        ctx.arc(px, py, 13, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    [[128, 128, "#fcd34d", "#f472b6", 1.2],
     [384, 128, "#fbbf24", "#fb7185", 1.1],
     [256, 256, "#fcd34d", "#c084fc", 1.3],
     [128, 384, "#fbbf24", "#fb7185", 1.1],
     [384, 384, "#fcd34d", "#f472b6", 1.2]].forEach(([x, y, c1, c2, s]) => drawFlower(x, y, c1, c2, s));

    return c.toDataURL("image/png");
  }

  function generateMonogramPattern() {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#1e1b18";
    ctx.fillRect(0, 0, 512, 512);

    // Diagonal gold geometric grid
    ctx.strokeStyle = "rgba(212, 175, 55, 0.28)";
    ctx.lineWidth = 1.5;
    const step = 64;
    for (let x = -512; x <= 1024; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 512, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 512); ctx.lineTo(x + 512, 0); ctx.stroke();
    }

    // Monogram 'B' emblems at diamond intersections
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
          // Diamond star ornament
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
        ctx.lineTo(ox, oy + 3 * s / 4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(ox + s / 2, oy);
        ctx.lineTo(ox + s / 2, oy + s / 4);
        ctx.lineTo(ox + 3 * s / 4, oy);
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

    ctx.fillStyle = "#1e3a8a"; // navy stripe
    ctx.fillRect(0, 0, 24, 64);

    ctx.fillStyle = "#dc2626"; // thin red accent pinstripe
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
    const dots = [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]];
    dots.forEach(([x, y]) => {
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

    const partsToUpdate = (target === "all" || !target)
      ? ["bodice", "skirt", "trousers", "sleeve"]
      : [target];

    partsToUpdate.forEach(part => {
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

  // Some single-mesh AI-generated avatars (image-to-3D pipelines like the
  // ComfyUI exports bundled in avatars/) bake in a flat circular turntable
  // base under the feet, in the same mesh as the body (confirmed by direct
  // glTF POSITION-accessor inspection: girl.glb, girl3.glb, boy2.glb each
  // have a bottom Y-band with several times the vertex density and radius
  // of the leg cross-section directly above it; man/fatman/boy/girl2/woman2
  // don't). Left in place, the whole bounding box — including the disc —
  // gets grounded, which pushes the disc up through the ankles and reads as
  // the avatar being "sunk into the ground". This scans the mesh's local Y
  // histogram for that signature and drops the offending triangles before
  // grounding. Heuristic, not a general mesh-cleanup tool — tuned against
  // the 8 bundled models (see the "50%-under-the-ground" fix in CHANGELOG).
  function stripPedestal(group) {
    group.traverse(o => {
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
        let bin = Math.floor((y - bb.min.y) / height * nBins);
        if (bin >= nBins) bin = nBins - 1; if (bin < 0) bin = 0;
        counts[bin]++;
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        if (r > maxR[bin]) maxR[bin] = r;
      }
      // reference radius/density: a band clearly on the leg (above any
      // pedestal, below the hips) — 15%-30% of the mesh's own height.
      let refN = 0, refR = 0, n = 0;
      for (let b = 3; b < 6; b++) { if (counts[b] > 0) { refN += counts[b]; refR += maxR[b]; n++; } }
      if (!n) return;
      refN /= n; refR /= n;
      if (!refR || !refN) return;
      // contiguous wide/dense bins from the very bottom = the pedestal.
      const pedestalBins = [];
      for (let b = 0; b < 3; b++) {
        if (counts[b] / refN > 3.5 || maxR[b] / refR > 1.8) pedestalBins.push(b);
        else break;
      }
      if (!pedestalBins.length) return;
      const cutoffY = bb.min.y + height * (pedestalBins[pedestalBins.length - 1] + 1) / nBins;
      // The radius test above is only used to DETECT that a pedestal band
      // exists — a solid disc is a smooth, continuous surface welded right
      // into the body mesh (confirmed: single connected component, not a
      // separate object), so its interior spans every radius from the rim
      // down to ~0 at the center, same as a real ankle's cross-section. A
      // radius test at removal time can only ever catch the wide rim,
      // leaving the disc's narrower center intact as a stray stub/spike.
      // Once a pedestal band is flagged, clip it by Y alone — drop the
      // whole triangle if any vertex falls below cutoffY, full stop.
      const idx = geo.getIndex();
      const triCount = idx ? idx.count / 3 : pos.count / 3;
      const vIdx = (k) => idx ? idx.getX(k) : k;
      const keep = [];
      for (let t = 0; t < triCount; t++) {
        const i0 = vIdx(t * 3), i1 = vIdx(t * 3 + 1), i2 = vIdx(t * 3 + 2);
        if (pos.getY(i0) < cutoffY || pos.getY(i1) < cutoffY || pos.getY(i2) < cutoffY) continue; // pedestal band — drop
        keep.push(i0, i1, i2);
      }
      if (keep.length === triCount * 3) return; // nothing matched — leave geometry untouched
      const Arr = pos.count > 65535 ? Uint32Array : Uint16Array;
      geo.setIndex(new THREE.BufferAttribute(new Arr(keep), 1));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
    });
  }

  // Separate, pre-existing defect confirmed on top of the pedestal: girl3.glb
  // has a ~3200-vertex island (plus a couple of smaller ones) with over 2x
  // the body's own radius, floating near the shoulder/head — a disconnected
  // reconstruction artifact from the source pipeline, rendering as a long
  // diagonal spike. The disc handled by stripPedestal() is welded into the
  // body's own connected component (confirmed above) so this needs a
  // different test: any island that is NOT the body itself. Real character
  // geometry is one connected surface in every bundled model; small genuine
  // extra bits (an unwelded eyelash/accessory island, seen as 60-190
  // vertices in a couple of the clean models) are kept via a size-relative
  // threshold so this doesn't quietly delete legitimate detail.
  function keepLargestComponent(group) {
    group.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const geo = o.geometry;
      const pos = geo.attributes.position;
      const idx = geo.getIndex();
      const triCount = idx ? idx.count / 3 : pos.count / 3;
      const vIdx = (k) => idx ? idx.getX(k) : k;
      const parent = new Int32Array(pos.count);
      for (let i = 0; i < parent.length; i++) parent[i] = i;
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
      const tris = new Array(triCount);
      for (let t = 0; t < triCount; t++) {
        const i0 = vIdx(t * 3), i1 = vIdx(t * 3 + 1), i2 = vIdx(t * 3 + 2);
        tris[t] = [i0, i1, i2];
        union(i0, i1); union(i1, i2);
      }
      const sizes = new Map();
      for (let i = 0; i < parent.length; i++) { const r = find(i); sizes.set(r, (sizes.get(r) || 0) + 1); }
      let largestRoot = -1, largestSize = -1;
      sizes.forEach((size, root) => { if (size > largestSize) { largestSize = size; largestRoot = root; } });
      if (largestRoot < 0) return;
      const dropThreshold = pos.count * 0.005; // >0.5% of the mesh's own vertices
      const keep = [];
      let dropped = false;
      for (const [i0, i1, i2] of tris) {
        const root = find(i0);
        if (root !== largestRoot && sizes.get(root) > dropThreshold) { dropped = true; continue; }
        keep.push(i0, i1, i2);
      }
      if (!dropped) return;
      const Arr = pos.count > 65535 ? Uint32Array : Uint16Array;
      geo.setIndex(new THREE.BufferAttribute(new Arr(keep), 1));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
    });
  }

  // ---------- optional GLB avatar ----------
  async function loadGLB(category, m, onProgress) {
    if (!GLTFLoader) throw new Error("no loader");
    const url = avatarURLs[category];
    // Bundled avatars follow the "avatars/<id>.glb" convention (see
    // BUNDLED_AVATARS in js/app.js) — the filename stem doubles as the id
    // AVATAR_LANDMARK_OVERRIDES is keyed by. Custom/uploaded URLs (a
    // user's own file, or a blob: URL) simply won't match any override,
    // same as every other bundled avatar that doesn't need one.
    const avatarId = (url.match(/([^/]+)\.glb(?:[?#].*)?$/i) || [])[1];
    const gltf = await loadGLTFWithRetry(url, onProgress);
    disposeObject3D(bodyGroup); disposeObject3D(garmentGroup);
    // A plain Object3D.clone(true) leaves a SkinnedMesh's Skeleton pointing
    // at the cached source bones. Scaling and grounding that clone can then
    // evaluate the mesh against a different hierarchy, making the model look
    // partly buried. SkeletonUtils rebinds each copied SkinnedMesh to its
    // copied bones while still sharing immutable geometry/material buffers.
    root.clear(); limbs = {}; bodyGroup = cloneSkeleton(gltf.scene); root.add(bodyGroup);
    bodyGroup.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    stripPedestal(bodyGroup);
    keepLargestComponent(bodyGroup);
    // normalise to the requested height
    const box = new THREE.Box3().setFromObject(bodyGroup);
    const size = new THREE.Vector3(); box.getSize(size);
    const H = cm(m.height); curH = H;
    const sc = H / (size.y || 1); bodyGroup.scale.setScalar(sc);
    const box2 = new THREE.Box3().setFromObject(bodyGroup); bodyGroup.position.y -= box2.min.y;
    // Wear the currently loaded pattern: the same measurement-derived garment
    // shapes buildProcedural() uses, placed in the same absolute-Y frame
    // (feet ~0, head ~H) that grounding just put this GLB body into. Visible
    // parts/fabric are decided by the existing pieceVisMap()/applyFabric()
    // plumbing, unchanged — this just gives it a garmentGroup to act on.
    // The garment shell is sized from generic measurements, not this specific
    // mesh, so its fit is approximate — on a build stockier than that generic
    // assumption the shell can sit partly inside the skin surface rather than
    // hugging it exactly (see the Honest note in README/CHANGELOG). A
    // general, automated per-mesh auto-fit was tried and reverted: these
    // AI-generated avatars don't share one rest pose (some hold arms out
    // near shoulder height, others lower, closer to the waist — confirmed
    // by direct vertex inspection), so any fixed "safe" Y-band for
    // measuring torso-only girth ends up sampling outstretched-arm geometry
    // on at least one bundled model, which blew the garment size up several
    // times over. Approximate but stable beats precise but occasionally
    // wildly wrong — that's still true for the 7 avatars with no entry in
    // AVATAR_LANDMARK_OVERRIDES above; boy2 got a one-off measured
    // correction instead because its default fit wasn't "approximate", it
    // was fully swallowed (see that table's own comment).
    curCategory = category; curMeasurements = m;
    lastDims = computeBodyDims(category, m, AVATAR_LANDMARK_OVERRIDES[avatarId]);
    buildGarment(category, m, lastDims);
    controls.target.set(0, H * 0.5, 0); frameCamera(H);
  }

  // ---------- public build ----------
  let buildToken = 0;
  async function build(category, m, opts) {
    if (!ready) return;
    curCategory = category;
    curMeasurements = m;
    opts = opts || {};
    if (typeof opts === "number") opts = { color: opts };   // back-compat
    if (opts.parts) {
      Object.entries(opts.parts).forEach(([part, v]) => {
        if (!fabricState[part] || !v) return;
        if (v.front) {
          if (v.front.color != null) fabricState[part].front.color = v.front.color;
          if (v.front.material) fabricState[part].front.material = v.front.material;
          if (v.front.textureDataURL !== undefined) fabricState[part].front.textureDataURL = v.front.textureDataURL || null;
        }
        fabricState[part].back = v.back ? { ...fabricState[part].back, ...v.back } : null;
      });
    } else {
      Object.values(fabricState).forEach(st => {
        if (opts.color != null) st.front.color = opts.color;
        if (opts.material) st.front.material = opts.material;
        st.back = null;
      });
    }
    if (opts.opacity != null) Object.values(fabricState).forEach(st => st.opacity = opts.opacity);
    lastPieceVis = opts.pieces || lastPieceVis;

    const token = ++buildToken;
    onLoading(true, { progress: 0 });
    await nextFrame();                       // let the spinner paint
    if (token !== buildToken) return;
    scene.background = gradientBackdrop();    // follow light/dark theme
    // The spinner must NEVER stay stuck: onLoading(false) always fires in
    // `finally`, whether the GLB loads, times out, errors, or even if the
    // procedural fallback itself throws (a real render bug, not a network
    // one — surfaced via onAvatarIssue instead of leaving a dead screen).
    try {
      const url = avatarURLs[category];
      const isCustomUserUpload = url && !url.startsWith("avatars/") && !opts.forceMannequin;
      if (isCustomUserUpload) {
        try {
          await loadGLB(category, m, pct => { if (token === buildToken) onLoading(true, { progress: pct }); });
          if (tensionMapEnabled) applyTensionHeatmap();
          else applyFabric();
          applyPieceVisibility();
        } catch (e) {
          if (token === buildToken) onAvatarIssue(category, e);
          buildProcedural(category, m);
          if (tensionMapEnabled) applyTensionHeatmap();
          else applyFabric();
          applyPieceVisibility();
        }
      } else {
        buildProcedural(category, m);
        if (tensionMapEnabled) applyTensionHeatmap();
        else applyFabric();
        applyPieceVisibility();
      }
    } catch (e) {
      console.error("[View3D] avatar build failed:", e);
      if (token === buildToken) onAvatarIssue(category, e);
    } finally {
      if (token === buildToken) onLoading(false);
    }
  }

  function frameCamera(H) {
    camera.near = 0.05; camera.far = 100;
    camera.position.set(0, H * 0.55, H * 2.15);   // full body head-to-toe with margin
    if (controls) { controls.target.set(0, H * 0.52, 0); controls.update(); }
    camera.updateProjectionMatrix();
  }

  // Re-composite drawings dynamically when the base garment color changes
  function retextureDrawingSlot(slot, colorVal) {
    if (!slot || !slot.rawDrawingURL || typeof document === 'undefined') return;
    const hex = typeof colorVal === 'number' ? '#' + colorVal.toString(16).padStart(6, '0') : colorVal;
    try {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 512;
        c.height = img.naturalHeight || 512;
        const ctx = c.getContext('2d');
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        slot.textureDataURL = c.toDataURL('image/png');
        applyFabric();
      };
      img.src = slot.rawDrawingURL;
    } catch (_) {}
  }

  // ---------- live fabric / visibility ----------
  function setFabric({ parts, color, material, opacity } = {}) {
    if (opacity != null) Object.values(fabricState).forEach(st => st.opacity = opacity);
    // back-compat: a flat {color,material} with no `parts` applies to every part
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
        }
      });
    } else if (color != null || material) {
      Object.values(fabricState).forEach(st => {
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
    const applyToMesh = o => {
      if (!o.isMesh || visited.has(o)) return;
      visited.add(o);
      if (fabricState[o.name]) {
        o.material = fabricMat(o.name, o.userData.side || "front");
        o.userData.origMat = o.material;
      }
    };
    garmentGroup.traverse(applyToMesh);
    Object.values(limbs).forEach(g => g.traverse(applyToMesh));
  }

  // ---------- Tension Simulation, Heatmap & 3D OBJ Export ----------
  function computeTensionHeatmapColor(easeCm, fPreset) {
    let r = 0, g = 0, b = 0;
    const stiffRatio = (fPreset.structStiff || 0.95) / (fPreset.maxStrain || 1.05);

    if (easeCm >= 8.0) {
      // Loose ease: Cool Blue (0.15, 0.40, 0.95) to Soft Cyan
      const t = Math.min(1, (easeCm - 8.0) / 8.0);
      r = 0.15 * (1 - t) + 0.10 * t;
      g = 0.45 * (1 - t) + 0.70 * t;
      b = 0.95;
    } else if (easeCm >= 3.0) {
      // Optimal ease: Emerald / Vibrant Green (0.10, 0.82, 0.35)
      const t = (easeCm - 3.0) / 5.0;
      r = 0.10 * (1 - t) + 0.15 * t;
      g = 0.82 * (1 - t) + 0.65 * t;
      b = 0.35 * (1 - t) + 0.95 * t;
    } else if (easeCm >= 0.8) {
      // Snug fit: Emerald Green to Golden Amber (0.96, 0.75, 0.10)
      const t = (3.0 - easeCm) / 2.2;
      r = 0.10 * (1 - t) + 0.96 * t;
      g = 0.82 * (1 - t) + 0.75 * t;
      b = 0.35 * (1 - t) + 0.10 * t;
    } else {
      // High Strain / Compression: Golden Amber to Crimson Red (0.95, 0.18, 0.15)
      const t = Math.min(1, Math.max(0, (0.8 - easeCm) / 1.8 * stiffRatio));
      r = 0.96 * (1 - t) + 0.95 * t;
      g = 0.75 * (1 - t) + 0.18 * t;
      b = 0.10 * (1 - t) + 0.15 * t;
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
      if (!mesh || !mesh.isMesh || !mesh.geometry) return;
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
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const y = v.y;
        let bodyR = d.waistR;
        let garmentR = Math.hypot(v.x, v.z);

        if (isSleeve) {
          bodyR = d.upperR;
          garmentR = Math.hypot(pos.getX(i), pos.getZ(i));
        } else if (isTrousers) {
          if (y < d.hipY) {
            const legCenterSign = v.x >= 0 ? 1 : -1;
            const legCenterX = legCenterSign * d.hipR * 0.5;
            garmentR = Math.hypot(v.x - legCenterX, v.z);
            const legFrac = Math.max(0, Math.min(1, (d.hipY - y) / (d.hipY || 1)));
            bodyR = d.thighR * (1.3 - legFrac * 0.4);
          } else {
            bodyR = d.hipR;
          }
        } else {
          if (y > d.waistR && y <= d.shoulderY) {
            const frac = Math.max(0, Math.min(1, (y - d.hipY - d.span * 0.44) / (d.span * 0.32 || 1)));
            bodyR = d.waistR + (d.chestR - d.waistR) * frac;
          } else if (y <= d.waistR) {
            const frac = Math.max(0, Math.min(1, (d.hipY + d.span * 0.44 - y) / (d.span * 0.44 || 1)));
            bodyR = d.waistR + (d.hipR - d.waistR) * frac;
          }
        }

        const easeCm = (garmentR - bodyR) * 100;
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
          roughness: 0.6,
          metalness: 0.05,
          side: THREE.DoubleSide
        });
      }
      mesh.material = mesh.userData.tensionMat;
    };

    const visitedTension = new Set();
    const processMeshSafe = o => {
      if (!o.isMesh || visitedTension.has(o)) return;
      visitedTension.add(o);
      if (fabricState[o.name]) processMesh(o);
    };
    garmentGroup.traverse(processMeshSafe);
    Object.values(limbs).forEach(g => g.traverse(processMeshSafe));

    const avgEase = vertexCount > 0 ? (totalEase / vertexCount) : 4.5;
    let status = "fitOptimal";
    if (maxStrainPct > 5 || minEase < 0) status = "fitTight";
    else if (minEase < 2.0) status = "fitSnug";
    else if (avgEase > 10.0) status = "fitLoose";

    lastTensionMetrics = {
      avgEase: parseFloat(avgEase.toFixed(1)),
      peakStrain: parseFloat(maxStrainPct.toFixed(1)),
      status,
      fabric: currentFabricKey
    };

    onTensionMetricsUpdate(lastTensionMetrics);
  }

  function restoreOriginalMaterials() {
    if (!garmentGroup) return;
    const visitedRestore = new Set();
    const restoreMesh = o => {
      if (!o.isMesh || visitedRestore.has(o)) return;
      visitedRestore.add(o);
      if (o.userData.origMat) o.material = o.userData.origMat;
      else if (fabricState[o.name]) o.material = fabricMat(o.name, o.userData.side || "front");
    };
    garmentGroup.traverse(restoreMesh);
    Object.values(limbs).forEach(g => g.traverse(restoreMesh));
  }

  function setTensionMap(v) {
    tensionMapEnabled = !!v;
    if (tensionMapEnabled) {
      applyTensionHeatmap();
    } else {
      restoreOriginalMaterials();
    }
  }

  function setFabricPreset(key) {
    if (!FABRIC[key]) return;
    Object.values(fabricState).forEach(st => {
      if (st.front) st.front.material = key;
      if (st.back) st.back.material = key;
    });
    if (tensionMapEnabled) {
      applyTensionHeatmap();
    } else {
      applyFabric();
    }
  }

  function exportOBJ(filename = "garment_3d.obj") {
    if (!garmentGroup) return null;
    let obj = "# BerryStudio 3D Garment Mesh Export\n";
    obj += `# Generated: ${new Date().toISOString()}\n`;
    obj += `# Category: ${curCategory}\n\n`;

    let vOffset = 1;
    let vnOffset = 1;
    let vtOffset = 1;

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
        v.fromBufferAttribute(pos, i).applyMatrix4(matrixWorld);
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

      for (let t = 0; t < triCount; t++) {
        const i0 = (idx ? idx.getX(t * 3) : t * 3) + vOffset;
        const i1 = (idx ? idx.getX(t * 3 + 1) : t * 3 + 1) + vOffset;
        const i2 = (idx ? idx.getX(t * 3 + 2) : t * 3 + 2) + vOffset;

        if (hasUv && hasNorm) {
          const u0 = (idx ? idx.getX(t * 3) : t * 3) + vtOffset;
          const u1 = (idx ? idx.getX(t * 3 + 1) : t * 3 + 1) + vtOffset;
          const u2 = (idx ? idx.getX(t * 3 + 2) : t * 3 + 2) + vtOffset;
          const n0 = (idx ? idx.getX(t * 3) : t * 3) + vnOffset;
          const n1 = (idx ? idx.getX(t * 3 + 1) : t * 3 + 1) + vnOffset;
          const n2 = (idx ? idx.getX(t * 3 + 2) : t * 3 + 2) + vnOffset;
          obj += `f ${i0}/${u0}/${n0} ${i1}/${u1}/${n1} ${i2}/${u2}/${n2}\n`;
        } else if (hasNorm) {
          const n0 = (idx ? idx.getX(t * 3) : t * 3) + vnOffset;
          const n1 = (idx ? idx.getX(t * 3 + 1) : t * 3 + 1) + vnOffset;
          const n2 = (idx ? idx.getX(t * 3 + 2) : t * 3 + 2) + vnOffset;
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

    garmentGroup.traverse(o => {
      exportOnce(o, `${o.name}_${o.userData.side || "mesh"}`);
    });

    Object.entries(limbs).forEach(([limbName, group]) => {
      group.traverse(o => {
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
  function setPieceVisibility(pieces) { lastPieceVis = pieces; applyPieceVisibility(); }
  function applyPieceVisibility() {
    if (!garmentGroup) return;

    const isBrief = (lastPieceVis || []).some(p => p.role === "brief-front" || p.role === "brief-back" || /brief|panties|كيلوت|سروال داخلي/i.test(p.name || p.key || ""));
    const isTrunk = !isBrief && (lastPieceVis || []).some(p => /trunk|boxer|short|شورت/i.test(p.name || p.key || ""));
    const isBra = (lastPieceVis || []).some(p => p.role === "cup" || p.role === "band" || p.role === "strap" || /bra|bralette|bandeau|حمالة/i.test(p.name || p.key || ""));

    const setVis = (name, v) => {
      const visited = new Set();
      const visit = o => {
        if (visited.has(o)) return;
        visited.add(o);
        if (o.name === name) {
          if (name === "bodice") {
            if (o.userData && o.userData.garmentType === "bra") {
              o.visible = v && isBra;
            } else if (o.userData && o.userData.garmentType === "full") {
              o.visible = v && !isBra;
            } else {
              o.visible = v;
            }
          } else if (name === "trousers") {
            if (o.userData && o.userData.subPart === "calf") {
              o.visible = v && !isBrief && !isTrunk;
            } else if (o.userData && o.userData.subPart === "thigh") {
              o.visible = v && !isBrief;
            } else {
              o.visible = v;
            }
          } else {
            o.visible = v;
          }
        }
      };
      garmentGroup.traverse(visit);
      Object.values(limbs).forEach(g => g.traverse(visit));
    };
    // A garment part is shown unless the pattern has piece(s) mapping to it
    // that are ALL hidden. Parts with no matching piece stay on (full outfit).
    //
    // WP-49: `p.part` arrives PRE-CLASSIFIED — js/app.js's classifyPart()
    // (pieceVisMap()'s caller) is now the one and only place that decides
    // which of these 4 buckets a piece belongs to, consulting the piece's
    // explicit/role-derived body zone (js/body-zone.js) before ever
    // falling back to a name guess. This function used to re-derive the
    // same classification from `p.key` (the piece's raw name) via its OWN
    // separate regex — a second, independently-hand-copied copy of
    // js/app.js's classifyPart() that could (and did — see body-zone.js's
    // header comment) silently disagree with it. Trusting the given part
    // outright removes that whole class of drift.
    const present = { bodice: false, sleeve: false, skirt: false, trousers: false };
    const vis = { bodice: false, sleeve: false, skirt: false, trousers: false };
    (lastPieceVis || []).forEach(p => {
      const part = Object.prototype.hasOwnProperty.call(present, p.part) ? p.part : "bodice";
      present[part] = true; if (p.visible) vis[part] = true;
    });
    // When an active pattern is loaded (lastPieceVis has items), ONLY show the garment
    // When lastPieceVis is provided (even an empty array []), ONLY show the garment
    // parts that belong to the active pattern and are set visible (e.g., if working on
    // trousers alone, only trousers will appear on the mannequin, not a full dress).
    // If no pattern pieces are provided (lastPieceVis === null), fallback to default outfit.
    const defaultPartVisible = part => {
      if (part === "trousers") return lastCategory === "men" || lastCategory === "boys";
      if (part === "skirt") return lastCategory === "women" || lastCategory === "girls";
      return true;
    };
    const show = part => lastPieceVis !== null ? !!(present[part] && vis[part]) : defaultPartVisible(part);
    setVis("bodice", show("bodice")); setVis("sleeve", show("sleeve"));
    setVis("skirt", show("skirt")); setVis("trousers", show("trousers"));

    if (accessoriesGroup) {
      const accVisited = new Set();
      accessoriesGroup.traverse(o => {
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

  // ---------- loop ----------
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!ready) return;
    t += 0.016;
    if (walking && limbs.leg1) {
      const isKid = curCategory === "girls" || curCategory === "boys";
      const isWoman = curCategory === "women";
      const freq = isKid ? 3.6 : 3.1;
      const sw = Math.sin(t * freq) * (isKid ? 0.30 : (isWoman ? 0.33 : 0.35));

      // Hip / thigh swing
      limbs["leg1"].rotation.x = sw;
      limbs["leg-1"].rotation.x = -sw;

      // Knee backward flexion: trailing leg flexes backward to clear ground smoothly.
      // In Three.js coordinates (shin along -Y), positive X rotation swings the shin backward into -Z.
      if (limbs.knee1 && limbs["knee-1"]) {
        const k1 = Math.max(0, sw * 1.55) + (sw > 0 ? Math.abs(Math.sin(t * freq)) * 0.16 : 0);
        const k2 = Math.max(0, -sw * 1.55) + (sw < 0 ? Math.abs(Math.sin(t * freq)) * 0.16 : 0);
        limbs["knee1"].rotation.x = k1;
        limbs["knee-1"].rotation.x = k2;
      }

      // Ankle pitch / foot roll (runway toe trailing & heel strike)
      if (limbs.foot1 && limbs["foot-1"]) {
        limbs["foot1"].rotation.x = sw * 0.28;
        limbs["foot-1"].rotation.x = -sw * 0.28;
      }

      // Arm swing (shoulder / deltoid)
      limbs["arm1"].rotation.x = -sw * 0.65;
      limbs["arm-1"].rotation.x = sw * 0.65;
      limbs["arm1"].rotation.z = -0.08 - Math.abs(sw) * 0.02;
      limbs["arm-1"].rotation.z = 0.08 + Math.abs(sw) * 0.02;

      // Elbow flexion (natural forward flex during forward swing)
      if (limbs.elbow1 && limbs["elbow-1"]) {
        limbs["elbow1"].rotation.x = -0.15 - Math.max(0, -sw * 0.55) * 0.40;
        limbs["elbow-1"].rotation.x = -0.15 - Math.max(0, sw * 0.55) * 0.40;
      }

      // Wrist / hand cadence
      if (limbs.hand1 && limbs["hand-1"]) {
        limbs.hand1.rotation.x = sw * 0.14;
        limbs["hand-1"].rotation.x = -sw * 0.14;
      }

      // Pelvic vertical bob (two peaks per stride)
      const bob = Math.abs(Math.sin(t * freq)) * (isKid ? 0.016 : 0.013);
      if (bodyGroup) bodyGroup.position.y = bob;
      if (garmentGroup) garmentGroup.position.y = bob;

      // Subtle pelvic roll (weight transfer across hips — catwalk sway for women)
      const rollAmp = isWoman ? 0.024 : (isKid ? 0.016 : 0.012);
      const roll = Math.sin(t * freq) * rollAmp;
      if (bodyGroup) bodyGroup.rotation.z = roll;
      if (garmentGroup) garmentGroup.rotation.z = roll;

      // Spinal counter-twist (thorax yaws opposite to hip swing)
      const yawAmp = isWoman ? 0.024 : (isKid ? 0.018 : 0.032);
      const yaw = -Math.sin(t * freq) * yawAmp;
      if (bodyGroup) bodyGroup.rotation.y = yaw;
      if (garmentGroup) garmentGroup.rotation.y = yaw;

      // Head stabilization: counter-yaw and roll keeps model gaze fixed down the runway
      if (limbs.head) {
        limbs.head.rotation.y = -yaw * 0.85;
        limbs.head.rotation.z = -roll * 0.70;
      }

      // Dynamic skirt billowing & stride flare: clothes move with walking so legs stay inside
      if (skirtFrontMesh && skirtBackMesh) {
        const strideMag = Math.abs(sw);
        // Forward swing flares and pushes the front panel forward over leading thigh/knee
        skirtFrontMesh.position.z = strideMag * (curH * 0.08);
        skirtFrontMesh.rotation.x = -strideMag * 0.36;
        skirtFrontMesh.scale.z = 1.0 + strideMag * 0.85;
        skirtFrontMesh.scale.x = 1.0 + strideMag * 0.22;

        // Trailing swing sweeps the back panel backward over trailing calf/heel
        skirtBackMesh.position.z = -strideMag * (curH * 0.07);
        skirtBackMesh.rotation.x = strideMag * 0.30;
        skirtBackMesh.scale.z = 1.0 + strideMag * 0.75;
        skirtBackMesh.scale.x = 1.0 + strideMag * 0.20;

        // Dynamic lateral sway matching stride
        skirtFrontMesh.rotation.y = sw * 0.10;
        skirtBackMesh.rotation.y = sw * 0.10;
        skirtFrontMesh.position.x = sw * 0.015;
      }
    } else if (limbs.leg1) {
      // Smooth damping back to neutral runway stance
      limbs["leg1"].rotation.x *= 0.88;
      limbs["leg-1"].rotation.x *= 0.88;
      if (limbs.knee1 && limbs["knee-1"]) {
        limbs["knee1"].rotation.x *= 0.88;
        limbs["knee-1"].rotation.x *= 0.88;
      }
      if (limbs.foot1 && limbs["foot-1"]) {
        limbs["foot1"].rotation.x *= 0.88;
        limbs["foot-1"].rotation.x *= 0.88;
      }
      limbs["arm1"].rotation.x *= 0.88;
      limbs["arm-1"].rotation.x *= 0.88;
      if (limbs.elbow1 && limbs["elbow-1"]) {
        limbs["elbow1"].rotation.x = limbs["elbow1"].rotation.x * 0.88 + (-0.15) * 0.12;
        limbs["elbow-1"].rotation.x = limbs["elbow-1"].rotation.x * 0.88 + (-0.15) * 0.12;
      }
      if (limbs.hand1 && limbs["hand-1"]) {
        limbs.hand1.rotation.x *= 0.88;
        limbs["hand-1"].rotation.x *= 0.88;
      }
      if (limbs.head) {
        limbs.head.rotation.y *= 0.88;
        limbs.head.rotation.z *= 0.88;
      }
      if (bodyGroup) {
        bodyGroup.position.y *= 0.88;
        bodyGroup.rotation.z *= 0.88;
        bodyGroup.rotation.y *= 0.88;
      }
      if (garmentGroup) {
        garmentGroup.position.y *= 0.88;
        garmentGroup.rotation.z *= 0.88;
        garmentGroup.rotation.y *= 0.88;
      }
      if (skirtFrontMesh && skirtBackMesh) {
        skirtFrontMesh.position.z *= 0.85;
        skirtFrontMesh.position.x *= 0.85;
        skirtFrontMesh.rotation.x *= 0.85;
        skirtFrontMesh.rotation.y *= 0.85;
        skirtFrontMesh.scale.z = skirtFrontMesh.scale.z * 0.85 + 1.0 * 0.15;
        skirtFrontMesh.scale.x = skirtFrontMesh.scale.x * 0.85 + 1.0 * 0.15;

        skirtBackMesh.position.z *= 0.85;
        skirtBackMesh.rotation.x *= 0.85;
        skirtBackMesh.rotation.y *= 0.85;
        skirtBackMesh.scale.z = skirtBackMesh.scale.z * 0.85 + 1.0 * 0.15;
        skirtBackMesh.scale.x = skirtBackMesh.scale.x * 0.85 + 1.0 * 0.15;
      }
    }
    controls.update();
    renderer.render(scene, camera);
  }

  // ---------- misc ----------
  function resize() {
    // init() runs at app boot, before the user has ever switched to the 3D
    // tab — if WebGL/deps genuinely aren't available, fallback() draws its
    // message onto a canvas that's still invisible (zero-sized) at that
    // exact moment, and nothing ever redraws it. Re-attempt with the real,
    // now-correct size whenever a later resize (e.g. the view switch that
    // makes the canvas visible for the first time) calls back in here.
    if (!ready) { fallback(); return; }
    const r = host.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = (r.width || 1) / (r.height || 1); camera.updateProjectionMatrix();
  }
  function fallback() {
    // Primary UX is the DOM overlay app.js shows via onFatalError (Retry /
    // Continue in 2D) — this canvas text is just a last-resort safety net
    // in case that callback was never wired up.
    onFatalError();
    const c = host.getContext && host.getContext("2d"); if (!c) return;
    host.width = host.clientWidth; host.height = host.clientHeight;
    c.fillStyle = "#8b93a7"; c.font = "600 14px Inter, sans-serif"; c.textAlign = "center";
    c.fillText("3D preview needs WebGL and a first-load connection.", host.width / 2, host.height / 2);
  }
  function setAvatarURL(category, url) {
    if (url && !url.startsWith("avatars/")) avatarURLs[category] = url;
    else delete avatarURLs[category];
  }
  // Re-attempt loading three.js/WebGL from scratch (the "Retry" action on the
  // fatal-error overlay). loadDeps() itself already tries every CDN tier
  // again since THREE is still null at this point.
  async function retryInit() { if (ready) return true; await init(host); return ready; }

  // Real bug fix: the page's zoombar (js/app.js's #zin/#zout/#zfit) used to
  // be wired ONLY to Canvas.zoom()/Canvas.fit() (the 2D pattern canvas)
  // regardless of which tab was open — so its buttons silently did nothing
  // while viewing 3D Preview (this module) or Cloth Lab. `dolly()` mirrors
  // Canvas.zoom(f)'s convention exactly: f>1 moves the camera closer
  // (zoom in), f<1 moves it away, clamped to OrbitControls' own
  // min/maxDistance so this can never punch through the model or drift
  // past its already-tuned zoom-out limit. `fit()` reuses frameCamera()
  // with `curH` (the last-built avatar's height, already tracked at
  // module scope for exactly this kind of "what am I looking at right
  // now" query) — the same framing a fresh build already lands on.
  function dolly(f) {
    if (!controls || !camera || !f) return;
    const dir = camera.position.clone().sub(controls.target);
    const dist = Math.min(controls.maxDistance, Math.max(controls.minDistance, dir.length() / f));
    camera.position.copy(controls.target).add(dir.setLength(dist));
    controls.update();
  }
  function fit() { if (ready && camera) frameCamera(curH); }

  return {
    init, build, resize, setFabric, setPieceVisibility, zoom: dolly, fit,
    setSpin: v => { spinning = v; if (controls) controls.autoRotate = v && !reduceMotion; },
    setWalk: v => walking = v,
    setReduceMotion: v => { reduceMotion = !!v; if (controls) controls.autoRotate = spinning && !reduceMotion; },
    setLoadingCallback: cb => onLoading = cb || (() => {}),
    setAvatarIssueCallback: cb => onAvatarIssue = cb || (() => {}),
    setFatalErrorCallback: cb => onFatalError = cb || (() => {}),
    setAvatarURL, isReady: () => ready, retryInit,
    // 3D Tension Simulation & Wavefront OBJ Export
    setTensionMap,
    getTensionMap: () => tensionMapEnabled,
    setFabricPreset,
    getFabricPreset: () => fabricState.bodice?.front?.material || "cotton",
    getFabricPresets: () => FABRIC,
    getTensionMetrics: () => lastTensionMetrics,
    setTensionMetricsCallback: cb => onTensionMetricsUpdate = cb || (() => {}),
    exportOBJ,
    // 3D Accessories (Buttons & Zippers)
    setAccessories,
    getAccessories: () => JSON.parse(JSON.stringify(accessoriesState)),
    // 3D Prints, Graphics & Drawing
    setGarmentPrint,
    generatePatternPreset,
    getGarmentColor: (part = "bodice") => {
      const col = fabricState[part]?.front?.color;
      return col != null ? (typeof col === "number" ? "#" + col.toString(16).padStart(6, "0") : col) : "#6d5efc";
    },
    getFabricState: () => JSON.parse(JSON.stringify(fabricState)),
  };
})();
// TEMP compat alias for one release — see BerryStudio-Upgrade-Plan WP-0.1.
if (typeof window !== 'undefined') window.View3D = View3D;
