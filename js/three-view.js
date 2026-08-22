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
  let THREE, OrbitControls, GLTFLoader, RGBELoader;
  let renderer, scene, camera, controls, raf = null;
  let root, bodyGroup, garmentGroup, limbs = {};
  let ready = false, spinning = true, walking = true, t = 0;
  // WP-17: an OS/app-level "prefers-reduced-motion" override — always wins
  // over the spin toggle's own saved value, never the other way around.
  let reduceMotion = false;
  let host, curCategory = "women", curH = 1.7;
  let onLoading = () => {};
  let onAvatarIssue = () => {};
  let onFatalError = () => {};
  let noiseTex = null;
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
    let GL = null, RGBE = null;
    try { ({ GLTFLoader: GL } = await import(/* @vite-ignore */ addonUrl("loaders/GLTFLoader.js"))); } catch (e) { /* optional */ }
    try { ({ RGBELoader: RGBE } = await import(/* @vite-ignore */ addonUrl("loaders/RGBELoader.js"))); } catch (e) { /* optional */ }
    return { THREE_, OC, GL, RGBE };
  }
  async function loadDeps() {
    if (THREE) return true;
    for (const tier of DEP_TIERS) {
      try {
        const { THREE_, OC, GL, RGBE } = await loadDepsFromTier(tier);
        THREE = THREE_; OrbitControls = OC; GLTFLoader = GL; RGBELoader = RGBE;
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
    women: 0xe4b596, men: 0xd3a074, girls: 0xf0c3a2, boys: 0xdcaa84,
  };
  const HAIR = { women: 0x2a1c14, men: 0x241a12, girls: 0x3a2416, boys: 0x2c1e14 };
  function skinMat(category) {
    return new THREE.MeshPhysicalMaterial({
      color: SKIN[category] || 0xd8a889, roughness: 0.62, metalness: 0,
      sheen: 0.5, sheenRoughness: 0.85, sheenColor: new THREE.Color(0xff9d7a),
      clearcoat: 0.06, clearcoatRoughness: 0.6, roughnessMap: noiseTex,
    });
  }
  // WP-9.2: transmission (chiffon)/anisotropy (silk/satin) — confirmed
  // present on MeshPhysicalMaterial in this file's own pinned three@0.160.0
  // (checked against the actual source at that version, not assumed), so
  // no import-map bump needed. Mirrors cloth-lab's fabricPresets.js so the
  // two separate 3D views agree on what each fabric looks like, same as
  // every other field in this table already does.
  const FABRIC = {
    cotton:  { rough: 0.85, metal: 0.0,  sheen: 0.2, clear: 0.0,  om: 1 },
    denim:   { rough: 0.9,  metal: 0.02, sheen: 0.1, clear: 0.0,  om: 1 },
    silk:    { rough: 0.26, metal: 0.05, sheen: 0.9, clear: 0.15, om: 0.98, anisotropy: 0.6, anisoRot: 0 },
    satin:   { rough: 0.2,  metal: 0.12, sheen: 0.85,clear: 0.22, om: 1, anisotropy: 0.5, anisoRot: 0 },
    chiffon: { rough: 0.5,  metal: 0.0,  sheen: 0.45,clear: 0.0,  om: 0.55, transmission: 0.18 },
    wool:    { rough: 0.96, metal: 0.0,  sheen: 0.08,clear: 0.0,  om: 1 },
    linen:   { rough: 0.82, metal: 0.0,  sheen: 0.15,clear: 0.0,  om: 1 },
    leather: { rough: 0.4,  metal: 0.2,  sheen: 0.2, clear: 0.35, om: 1 },
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
  const defaultFabricSlot = () => ({ front: { color: 0x6d5efc, material: "cotton", textureDataURL: null }, back: null, opacity: 0.85 });
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
      // a texture map multiplies against `color` — white keeps the uploaded
      // photo's own colour true instead of tinting it with the preset swatch colour
      color: slot.textureDataURL ? 0xffffff : slot.color, roughness: f.rough, metalness: f.metal,
      sheen: f.sheen, sheenRoughness: 0.5, clearcoat: f.clear, clearcoatRoughness: 0.4,
      transparent: op < 0.99, opacity: op, side: THREE.DoubleSide,
      ...(f.transmission != null && { transmission: f.transmission, thickness: 0.001 }),
      ...(f.anisotropy != null && { anisotropy: f.anisotropy, anisotropyRotation: f.anisoRot ?? 0 }),
    });
    if (slot.textureDataURL) {
      const tex = getFabricTexLoader().load(slot.textureDataURL);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(FABRIC_TEXTURE_REPEAT, FABRIC_TEXTURE_REPEAT);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex; // TextureLoader.load() populates the image asynchronously; the RAF loop (loop(), end of this file) renders every frame regardless, so the swatch simply appears once decoded
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
    const pts = profile.map(p => new THREE.Vector2(Math.max(0.001, p[0]), p[1]));
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
    const pts = profile.map(p => new THREE.Vector2(Math.max(0.001, p[0]), p[1]));
    const half = Math.max(2, Math.round(seg / 2));
    const front = new THREE.Mesh(new THREE.LatheGeometry(pts, half, -Math.PI / 2, Math.PI), matFront);
    const back = new THREE.Mesh(new THREE.LatheGeometry(pts, half, Math.PI / 2, Math.PI), matBack);
    front.castShadow = back.castShadow = true;
    front.name = back.name = part;
    front.userData.side = "front"; back.userData.side = "back";
    return [front, back];
  }
  function sphere(r, mat) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat); m.castShadow = true; return m; }

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
    disposeObject3D(bodyGroup); disposeObject3D(garmentGroup);
    root.clear(); limbs = {};
    bodyGroup = new THREE.Group(); root.add(bodyGroup);

    const d0 = computeBodyDims(category, m);
    const { female, kid, H, headH, neckTopY, shoulderY, hipY, chestR, waistR, hipR, shoulderHalf, neckR, span } = d0;
    curH = H;
    const skin = skinMat(category);
    // torso lathe (round) then flattened front-to-back
    const torso = lathe([
      [hipR * 0.55, hipY - span * 0.16],
      [hipR * 0.98, hipY],
      [hipR, hipY + span * 0.06],
      [waistR, hipY + span * 0.44],
      [chestR * (female ? 0.98 : 1.02), hipY + span * 0.76],
      [chestR * (female ? 0.9 : 1.06), shoulderY - span * 0.03],
      [neckR * 1.15, shoulderY + span * 0.02],
    ], skin, 32);
    torso.scale.z = female ? 0.72 : 0.78;
    bodyGroup.add(torso);

    // bust (female adults) — kept close to the chest so the bodice covers it
    if (female && !kid) {
      const bustR = chestR * 0.32;
      [-1, 1].forEach(s => {
        const b = sphere(bustR, skin);
        b.scale.set(1, 0.8, 0.62);
        b.position.set(s * chestR * 0.38, hipY + span * 0.72, chestR * 0.3);
        bodyGroup.add(b);
      });
    }

    // neck + head
    const neck = capsule(neckR, headH * 0.35, skin);
    neck.position.y = (neckTopY + shoulderY) / 2 + 0.01; bodyGroup.add(neck);
    const headG = new THREE.Group(); headG.position.y = neckTopY + headH * 0.5;
    const head = sphere(headH * 0.5, skin);
    head.scale.set(0.82, 1.02, 0.9); headG.add(head);
    // jaw taper
    const jaw = sphere(headH * 0.34, skin); jaw.scale.set(0.9, 0.7, 0.85); jaw.position.y = -headH * 0.24; jaw.position.z = headH * 0.03; headG.add(jaw);
    addFace(headG, headH, category, skin);
    addHair(headG, headH, category);
    bodyGroup.add(headG);

    // shoulders (deltoids)
    [-1, 1].forEach(s => {
      const d = sphere(chestR * 0.3, skin);
      d.scale.set(1, 0.8, 0.9);
      d.position.set(s * shoulderHalf * 0.9, shoulderY - span * 0.04, 0);
      bodyGroup.add(d);
    });

    // arms — pivot groups at the shoulder so the walk swings naturally
    const { armLen, upperR } = d0;
    [-1, 1].forEach(s => {
      const g = new THREE.Group(); g.position.set(s * shoulderHalf * 0.95, shoulderY - span * 0.04, 0);
      const upper = capsule(upperR, armLen * 0.42, skin); upper.position.y = -armLen * 0.26; g.add(upper);
      const fore = capsule(upperR * 0.72, armLen * 0.4, skin); fore.position.y = -armLen * 0.66; g.add(fore);
      const hand = capsule(upperR * 0.6, armLen * 0.12, skin); hand.position.y = -armLen * 0.92; hand.scale.z = 0.6; g.add(hand);
      g.rotation.z = s * 0.08;
      bodyGroup.add(g); limbs["arm" + s] = g;
    });

    // legs — pivot groups at the hip
    const { legLen, thighR } = d0;
    [-1, 1].forEach(s => {
      const g = new THREE.Group(); g.position.set(s * hipR * 0.5, hipY - span * 0.05, 0);
      const thigh = capsule(thighR, legLen * 0.4, skin); thigh.position.y = -legLen * 0.24; g.add(thigh);
      const calf = capsule(thighR * 0.62, legLen * 0.4, skin); calf.position.y = -legLen * 0.66; g.add(calf);
      const foot = capsule(thighR * 0.5, legLen * 0.12, skin);
      foot.rotation.x = Math.PI / 2; foot.position.set(0, -legLen * 0.97, legLen * 0.06); foot.scale.set(1, 1.3, 1); g.add(foot);
      bodyGroup.add(g); limbs["leg" + s] = g;
    });

    buildGarment(category, m, d0);
    controls.target.set(0, H * 0.5, 0);
    frameCamera(H);
  }

  // ---------- face ----------
  function addFace(headG, headH, category, skin) {
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
    const irisMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.2 });
    const lipMat = new THREE.MeshPhysicalMaterial({ color: category === "women" ? 0xb85b57 : 0xa9685c, roughness: 0.45, sheen: 0.4 });
    const browMat = new THREE.MeshStandardMaterial({ color: HAIR[category] || 0x2a1c14, roughness: 0.7 });
    const z = headH * 0.42, ey = headH * 0.06, ex = headH * 0.17;
    [-1, 1].forEach(s => {
      const white = sphere(headH * 0.075, eyeMat); white.scale.set(1, 0.62, 0.5); white.position.set(s * ex, ey, z); headG.add(white);
      const iris = sphere(headH * 0.036, irisMat); iris.position.set(s * ex, ey, z + headH * 0.03); headG.add(iris);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(headH * 0.16, headH * 0.02, headH * 0.03), browMat);
      brow.position.set(s * ex, ey + headH * 0.11, z * 0.98); brow.rotation.z = -s * 0.12; headG.add(brow);
      const ear = sphere(headH * 0.09, skin); ear.scale.set(0.4, 0.9, 0.6); ear.position.set(s * headH * 0.42, ey - headH * 0.02, 0); headG.add(ear);
    });
    // nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(headH * 0.06, headH * 0.18, 8), skin);
    nose.rotation.x = Math.PI * 0.52; nose.position.set(0, ey - headH * 0.08, z + headH * 0.05); headG.add(nose);
    // lips
    const lips = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.09, headH * 0.028, 8, 16, Math.PI), lipMat);
    lips.rotation.x = Math.PI * 0.5; lips.position.set(0, ey - headH * 0.24, z * 0.96); headG.add(lips);
  }

  // ---------- hair ----------
  function addHair(headG, headH, category) {
    const mat = new THREE.MeshStandardMaterial({ color: HAIR[category] || 0x2a1c14, roughness: 0.5, metalness: 0.05, sheen: 0.6, side: THREE.DoubleSide });
    // crown cap — hairline lifted above the eyes so the face stays visible
    const cap = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.55, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.46), mat);
    cap.position.y = headH * 0.08; cap.castShadow = true; headG.add(cap);
    // Back-of-head coverage. phiStart=0/phiLength=Math.PI used to mean "sweep
    // a full 180deg arc" — combined with the -Math.PI/2 Y-rotation below,
    // phi=0 lands at the true back but phi=Math.PI lands directly at the
    // FRONT, so that arc wrapped continuously across one entire side of the
    // head (at a theta band reaching up to eye height) and covered half the
    // face in the near-black hair material instead of stopping at the back.
    // A symmetric +-0.35*PI arc centered on phi=0 (the back) stays a safe
    // ~20deg short of the true side (+-0.5*PI) on each side, so it never
    // reaches the ear line, let alone the face.
    const backCap = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.54, 24, 18, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.55), mat);
    backCap.rotation.y = -Math.PI / 2; backCap.position.z = -headH * 0.02; backCap.castShadow = true; headG.add(backCap);
    if (category === "women") {
      // long hair falling down the back
      const hair = lathe([
        [headH * 0.52, headH * 0.34], [headH * 0.62, 0], [headH * 0.6, -headH * 1.2],
        [headH * 0.5, -headH * 2.4], [headH * 0.3, -headH * 2.9],
      ], mat, 20);
      hair.scale.z = 0.5; hair.position.z = -headH * 0.16; headG.add(hair);
      // side locks behind the ears (kept off the face)
      [-1, 1].forEach(s => { const f = capsule(headH * 0.06, headH * 1.0, mat); f.position.set(s * headH * 0.44, -headH * 0.5, -headH * 0.06); f.rotation.z = s * 0.06; headG.add(f); });
    } else if (category === "girls") {
      // ponytails
      [-1, 1].forEach(s => {
        const p = capsule(headH * 0.12, headH * 0.7, mat);
        p.position.set(s * headH * 0.5, headH * 0.1, -headH * 0.1); p.rotation.z = s * 0.5; p.castShadow = true; headG.add(p);
      });
    }
    // boys & men keep the short cap
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
    garmentGroup.add(bodiceFront, bodiceBack);

    // skirt / lower — dress for women & girls, trousers for men & boys
    if (female) {
      const hemY = category === "girls" ? d.H * 0.30 : d.H * 0.14;
      const flare = category === "girls" ? 1.9 : 1.7;
      const skirtProfile = [
        [d.waistR + t, waistYY + 0.005],
        [d.hipR + t, d.hipY],
        [d.hipR * 1.25, (d.hipY + hemY) / 2],
        [d.hipR * flare, hemY],
      ];
      const [skirtFront, skirtBack] = latheHalves(skirtProfile, fabricMat("skirt", "front"), fabricMat("skirt", "back"), "skirt", 40);
      garmentGroup.add(skirtFront, skirtBack);
    } else {
      const hemY = category === "boys" ? d.H * 0.30 : d.H * 0.02;
      // hip / seat cover bridging the two legs (closes the crotch gap)
      const seatProfile = [
        [d.waistR * 1.02 + t, waistYY],
        [d.hipR * 1.12 + t, d.hipY],
        [d.hipR * 1.08 + t, d.hipY - d.span * 0.16],
      ];
      const [seatFront, seatBack] = latheHalves(seatProfile, fabricMat("trousers", "front"), fabricMat("trousers", "back"), "trousers", 26);
      seatFront.scale.z = seatBack.scale.z = 0.86;
      garmentGroup.add(seatFront, seatBack);
      [-1, 1].forEach(s => {
        const legProfile = [
          [d.thighR * 1.3, d.hipY + d.span * 0.02],
          [d.thighR * 1.28, d.hipY - d.span * 0.05],
          [d.thighR * 1.12, (d.hipY + hemY) * 0.5],
          [d.thighR * 1.02, hemY],
        ];
        const [legFront, legBack] = latheHalves(legProfile, fabricMat("trousers", "front"), fabricMat("trousers", "back"), "trousers", 22);
        legFront.position.x = legBack.position.x = s * d.hipR * 0.5;
        garmentGroup.add(legFront, legBack);
      });
    }

    // sleeves — parented to the arm pivot groups so they swing with the walk
    const longSleeve = category === "men" || category === "women";
    const slLen = d.armLen * (longSleeve ? 0.9 : (category === "girls" ? 0.34 : 0.45));
    const slR = category === "girls" ? 1.4 : category === "boys" ? 1.15 : 1.03;
    [-1, 1].forEach(s => {
      const sl = capsule(d.upperR * slR + t, slLen, fabricMat("sleeve"));
      sl.name = "sleeve";
      const armPivot = limbs["arm" + s];
      if (armPivot) {
        sl.position.y = -slLen * 0.5 - d.armLen * 0.02;
        armPivot.add(sl);
      } else {
        // No arm-pivot group to hang the sleeve under — a GLB avatar body
        // (loadGLB() has no procedural limb rig). Place it in garmentGroup's
        // own (world) space instead, at the same spot the pivot group itself
        // would sit in buildProcedural() plus the same local offset — static,
        // no walk-swing, but correctly at the shoulder instead of collapsing
        // to the origin (mid-body) the way parenting to garmentGroup with a
        // pivot-relative position previously did.
        sl.position.set(s * d.shoulderHalf * 0.95, d.shoulderY - d.span * 0.04 - slLen * 0.5 - d.armLen * 0.02, 0);
        garmentGroup.add(sl);
      }
    });
    applyPieceVisibility();
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
    // clone(true) copies the scenegraph/transform hierarchy but shares leaf
    // geometry/material with the cached original (three.js clone() is
    // shallow on those) — so this category's height/pose changes never
    // corrupt the cached copy other avatars/rebuilds reuse, while the one-
    // time pedestal/spike cleanup below (which mutates geometry in place)
    // still only has to run once per URL, not on every rebuild.
    root.clear(); limbs = {}; bodyGroup = gltf.scene.clone(true); root.add(bodyGroup);
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
    buildGarment(category, m, computeBodyDims(category, m, AVATAR_LANDMARK_OVERRIDES[avatarId]));
    controls.target.set(0, H * 0.5, 0); frameCamera(H);
  }

  // ---------- public build ----------
  let buildToken = 0;
  async function build(category, m, opts) {
    if (!ready) return;
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
      if (avatarURLs[category]) {
        try {
          await loadGLB(category, m, pct => { if (token === buildToken) onLoading(true, { progress: pct }); });
          applyFabric();
        } catch (e) {
          if (token === buildToken) onAvatarIssue(category, e);
          buildProcedural(category, m);
        }
      } else {
        buildProcedural(category, m);
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

  // ---------- live fabric / visibility ----------
  // parts: { bodice:{front:{color,material},back:{color,material}|null}, sleeve:{...},
  // skirt:{...}, trousers:{...} } — any subset; `back` omitted/falsy means "no distinct
  // back piece, mirror front" (WP-28). opacity applies to all 4 slots (there's no
  // per-part transparency control).
  function setFabric({ parts, color, material, opacity } = {}) {
    if (opacity != null) Object.values(fabricState).forEach(st => st.opacity = opacity);
    // back-compat: a flat {color,material} with no `parts` applies to every part
    if (parts) {
      Object.entries(parts).forEach(([part, v]) => {
        if (!fabricState[part] || !v) return;
        if (v.front) {
          if (v.front.color != null) fabricState[part].front.color = v.front.color;
          if (v.front.material) fabricState[part].front.material = v.front.material;
          if (v.front.textureDataURL !== undefined) fabricState[part].front.textureDataURL = v.front.textureDataURL || null;
        }
        fabricState[part].back = v.back ? { ...fabricState[part].back, ...v.back } : null;
      });
    } else if (color != null || material) {
      Object.values(fabricState).forEach(st => {
        if (color != null) st.front.color = color;
        if (material) st.front.material = material;
        st.back = null;
      });
    }
    applyFabric();
  }
  // Each garment part is now (WP-28) two real sub-meshes — front and back,
  // tagged via userData.side by latheHalves() — sharing the same `mesh.name`
  // so this traversal and applyPieceVisibility() below don't need to change.
  function applyFabric() {
    if (!garmentGroup) return;
    garmentGroup.traverse(o => { if (o.isMesh && fabricState[o.name]) o.material = fabricMat(o.name, o.userData.side || "front"); });
    // sleeves live under the arm groups
    Object.values(limbs).forEach(g => g.traverse(o => { if (o.isMesh && o.name === "sleeve") o.material = fabricMat("sleeve", "front"); }));
  }
  let lastPieceVis = null;
  function setPieceVisibility(pieces) { lastPieceVis = pieces; applyPieceVisibility(); }
  function applyPieceVisibility() {
    if (!garmentGroup) return;
    const setVis = (name, v) => {
      garmentGroup.traverse(o => { if (o.name === name) o.visible = v; });
      Object.values(limbs).forEach(g => g.traverse(o => { if (o.name === name) o.visible = v; }));
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
    const show = part => !present[part] || vis[part];
    setVis("bodice", show("bodice")); setVis("sleeve", show("sleeve"));
    setVis("skirt", show("skirt")); setVis("trousers", show("trousers"));
  }

  // ---------- loop ----------
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!ready) return;
    t += 0.016;
    if (walking && limbs.leg1) {
      const sw = Math.sin(t * 3.2) * 0.32;
      limbs["leg1"].rotation.x = sw; limbs["leg-1"].rotation.x = -sw;
      limbs["arm1"].rotation.x = -sw * 0.7; limbs["arm-1"].rotation.x = sw * 0.7;
      if (bodyGroup) bodyGroup.position.y = Math.abs(Math.sin(t * 3.2)) * 0.012;
    } else if (limbs.leg1) {
      limbs["leg1"].rotation.x *= 0.9; limbs["leg-1"].rotation.x *= 0.9;
      limbs["arm1"].rotation.x *= 0.9; limbs["arm-1"].rotation.x *= 0.9;
      if (bodyGroup) bodyGroup.position.y *= 0.9;
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
  function setAvatarURL(category, url) { if (url) avatarURLs[category] = url; else delete avatarURLs[category]; }
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
  };
})();
// TEMP compat alias for one release — see BerryStudio-Upgrade-Plan WP-0.1.
if (typeof window !== 'undefined') window.View3D = View3D;
