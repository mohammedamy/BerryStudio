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
const View3D = (() => {
  let THREE, OrbitControls, GLTFLoader;
  let renderer, scene, camera, controls, raf = null;
  let root, bodyGroup, garmentGroup, limbs = {};
  let ready = false, spinning = true, walking = true, t = 0;
  let host, curCategory = "women", curH = 1.7;
  let onLoading = () => {};
  let noiseTex = null;
  const avatarURLs = {};                       // category -> optional GLB url

  // ---------- dependency loading (uses the page import map) ----------
  async function loadDeps() {
    if (THREE) return true;
    try {
      THREE = await import("three");
      ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
      try { ({ GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")); } catch (e) { GLTFLoader = null; }
      return true;
    } catch (e) { return false; }
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

    camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    camera.position.set(0.15, 1.0, 3.6);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 0.9; controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.autoRotate = spinning; controls.autoRotateSpeed = 1.6;
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
  const FABRIC = {
    cotton:  { rough: 0.85, metal: 0.0,  sheen: 0.2, clear: 0.0,  om: 1 },
    denim:   { rough: 0.9,  metal: 0.02, sheen: 0.1, clear: 0.0,  om: 1 },
    silk:    { rough: 0.26, metal: 0.05, sheen: 0.9, clear: 0.15, om: 0.98 },
    satin:   { rough: 0.2,  metal: 0.12, sheen: 0.85,clear: 0.22, om: 1 },
    chiffon: { rough: 0.5,  metal: 0.0,  sheen: 0.45,clear: 0.0,  om: 0.55 },
    wool:    { rough: 0.96, metal: 0.0,  sheen: 0.08,clear: 0.0,  om: 1 },
    linen:   { rough: 0.82, metal: 0.0,  sheen: 0.15,clear: 0.0,  om: 1 },
    leather: { rough: 0.4,  metal: 0.2,  sheen: 0.2, clear: 0.35, om: 1 },
  };
  let fabricState = { color: 0x6d5efc, material: "cotton", opacity: 0.85 };
  function fabricMat() {
    const f = FABRIC[fabricState.material] || FABRIC.cotton;
    const op = Math.max(0.25, Math.min(1, fabricState.opacity * f.om));
    return new THREE.MeshPhysicalMaterial({
      color: fabricState.color, roughness: f.rough, metalness: f.metal,
      sheen: f.sheen, sheenRoughness: 0.5, clearcoat: f.clear, clearcoatRoughness: 0.4,
      transparent: op < 0.99, opacity: op, side: THREE.DoubleSide,
    });
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
  function sphere(r, mat) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat); m.castShadow = true; return m; }

  // ---------- procedural body ----------
  function buildProcedural(category, m) {
    curCategory = category;
    root.clear(); limbs = {};
    bodyGroup = new THREE.Group(); root.add(bodyGroup);

    const female = category === "women" || category === "girls";
    const kid = category === "girls" || category === "boys";
    const skin = skinMat(category);

    const H = cm(m.height); curH = H;
    const headH = H * (kid ? 0.16 : 0.128);
    const neckTopY = H - headH;
    const shoulderY = H * (kid ? 0.80 : 0.82);
    const hipY = H * (kid ? 0.47 : 0.52);

    let chestR = R(m.chest), waistR = R(m.waist), hipR = R(m.hips);
    let shoulderHalf = cm(m.shoulder) / 2;
    const neckR = R(m.neck) * 0.85;
    if (female) { waistR *= 0.86; hipR *= 1.03; }
    else { waistR *= 0.97; shoulderHalf *= 1.07; chestR *= 1.03; }
    if (kid) { waistR = (waistR + chestR) / 2 * 0.96; hipR *= 0.97; shoulderHalf *= 0.98; }

    const span = shoulderY - hipY;
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
    const armLen = H * (kid ? 0.40 : 0.44);
    const upperR = R(m.bicep) * (female ? 0.9 : 1.0);
    [-1, 1].forEach(s => {
      const g = new THREE.Group(); g.position.set(s * shoulderHalf * 0.95, shoulderY - span * 0.04, 0);
      const upper = capsule(upperR, armLen * 0.42, skin); upper.position.y = -armLen * 0.26; g.add(upper);
      const fore = capsule(upperR * 0.72, armLen * 0.4, skin); fore.position.y = -armLen * 0.66; g.add(fore);
      const hand = capsule(upperR * 0.6, armLen * 0.12, skin); hand.position.y = -armLen * 0.92; hand.scale.z = 0.6; g.add(hand);
      g.rotation.z = s * 0.08;
      bodyGroup.add(g); limbs["arm" + s] = g;
    });

    // legs — pivot groups at the hip
    const legLen = hipY;
    const thighR = R(m.thigh) * (female ? 1.0 : 0.98);
    [-1, 1].forEach(s => {
      const g = new THREE.Group(); g.position.set(s * hipR * 0.5, hipY - span * 0.05, 0);
      const thigh = capsule(thighR, legLen * 0.4, skin); thigh.position.y = -legLen * 0.24; g.add(thigh);
      const calf = capsule(thighR * 0.62, legLen * 0.4, skin); calf.position.y = -legLen * 0.66; g.add(calf);
      const foot = capsule(thighR * 0.5, legLen * 0.12, skin);
      foot.rotation.x = Math.PI / 2; foot.position.set(0, -legLen * 0.97, legLen * 0.06); foot.scale.set(1, 1.3, 1); g.add(foot);
      bodyGroup.add(g); limbs["leg" + s] = g;
    });

    buildGarment(category, m, { chestR, waistR, hipR, shoulderHalf, shoulderY, hipY, span, H, armLen, upperR, legLen, thighR });
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
    // back-of-head coverage (does not reach the face)
    const backCap = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.54, 24, 18, 0, Math.PI, Math.PI * 0.32, Math.PI * 0.55), mat);
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
    const mkMat = () => fabricMat();

    // bodice — a slightly larger torso shell from waist to shoulders
    const t = 0.014; // ease / thickness
    const topY = d.shoulderY - d.span * 0.06;
    const waistYY = d.hipY + d.span * 0.44;
    const bodice = lathe([
      [d.hipR + t, d.hipY + d.span * 0.02],
      [d.waistR + t, waistYY],
      [d.chestR * (female ? 1.08 : 1.05) + t, d.hipY + d.span * 0.76],
      [d.chestR * (female ? 0.98 : 1.08) + t, topY],
    ], mkMat(), 32);
    bodice.scale.z = female ? 0.82 : 0.82; bodice.name = "bodice"; garmentGroup.add(bodice);

    // skirt / lower — dress for women & girls, trousers for men & boys
    if (female) {
      const hemY = category === "girls" ? d.H * 0.30 : d.H * 0.14;
      const flare = category === "girls" ? 1.9 : 1.7;
      const skirt = lathe([
        [d.waistR + t, waistYY + 0.005],
        [d.hipR + t, d.hipY],
        [d.hipR * 1.25, (d.hipY + hemY) / 2],
        [d.hipR * flare, hemY],
      ], mkMat(), 40);
      skirt.name = "skirt"; garmentGroup.add(skirt);
    } else {
      const hemY = category === "boys" ? d.H * 0.30 : d.H * 0.02;
      // hip / seat cover bridging the two legs (closes the crotch gap)
      const seat = lathe([
        [d.waistR * 1.02 + t, waistYY],
        [d.hipR * 1.12 + t, d.hipY],
        [d.hipR * 1.08 + t, d.hipY - d.span * 0.16],
      ], mkMat(), 26);
      seat.scale.z = 0.86; seat.name = "trousers"; garmentGroup.add(seat);
      [-1, 1].forEach(s => {
        const leg = lathe([
          [d.thighR * 1.3, d.hipY + d.span * 0.02],
          [d.thighR * 1.28, d.hipY - d.span * 0.05],
          [d.thighR * 1.12, (d.hipY + hemY) * 0.5],
          [d.thighR * 1.02, hemY],
        ], mkMat(), 22);
        leg.position.x = s * d.hipR * 0.5; leg.name = "trousers"; garmentGroup.add(leg);
      });
    }

    // sleeves — parented to the arm pivot groups so they swing with the walk
    const longSleeve = category === "men" || category === "women";
    const slLen = d.armLen * (longSleeve ? 0.9 : (category === "girls" ? 0.34 : 0.45));
    const slR = category === "girls" ? 1.4 : category === "boys" ? 1.15 : 1.03;
    [-1, 1].forEach(s => {
      const sl = capsule(d.upperR * slR + t, slLen, mkMat());
      sl.position.y = -slLen * 0.5 - d.armLen * 0.02;
      sl.name = "sleeve";
      (limbs["arm" + s] || garmentGroup).add(sl);
    });
    applyPieceVisibility();
  }

  // ---------- optional GLB avatar ----------
  async function loadGLB(category, m) {
    if (!GLTFLoader) throw new Error("no loader");
    const gltf = await new Promise((res, rej) => new GLTFLoader().load(avatarURLs[category], res, undefined, rej));
    root.clear(); bodyGroup = gltf.scene; root.add(bodyGroup);
    bodyGroup.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // normalise to the requested height
    const box = new THREE.Box3().setFromObject(bodyGroup);
    const size = new THREE.Vector3(); box.getSize(size);
    const H = cm(m.height); curH = H;
    const sc = H / (size.y || 1); bodyGroup.scale.setScalar(sc);
    const box2 = new THREE.Box3().setFromObject(bodyGroup); bodyGroup.position.y -= box2.min.y;
    controls.target.set(0, H * 0.5, 0); frameCamera(H);
  }

  // ---------- public build ----------
  let buildToken = 0;
  async function build(category, m, opts) {
    if (!ready) return;
    opts = opts || {};
    if (typeof opts === "number") opts = { color: opts };   // back-compat
    if (opts.color != null) fabricState.color = opts.color;
    if (opts.material) fabricState.material = opts.material;
    if (opts.opacity != null) fabricState.opacity = opts.opacity;
    lastPieceVis = opts.pieces || lastPieceVis;

    const token = ++buildToken;
    onLoading(true);
    await nextFrame();                       // let the spinner paint
    if (token !== buildToken) return;
    scene.background = gradientBackdrop();    // follow light/dark theme
    try {
      if (avatarURLs[category]) { await loadGLB(category, m); applyFabric(); }
      else buildProcedural(category, m);
    } catch (e) { buildProcedural(category, m); }
    if (token !== buildToken) return;
    onLoading(false);
  }

  function frameCamera(H) {
    camera.near = 0.05; camera.far = 100;
    camera.position.set(0, H * 0.55, H * 2.15);   // full body head-to-toe with margin
    if (controls) { controls.target.set(0, H * 0.52, 0); controls.update(); }
    camera.updateProjectionMatrix();
  }

  // ---------- live fabric / visibility ----------
  function setFabric({ color, material, opacity } = {}) {
    if (color != null) fabricState.color = color;
    if (material) fabricState.material = material;
    if (opacity != null) fabricState.opacity = opacity;
    applyFabric();
  }
  function applyFabric() {
    if (!garmentGroup) return;
    garmentGroup.traverse(o => { if (o.isMesh) o.material = fabricMat(); });
    // sleeves live under the arm groups
    Object.values(limbs).forEach(g => g.traverse(o => { if (o.isMesh && o.name === "sleeve") o.material = fabricMat(); }));
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
    const present = { bodice: false, sleeve: false, skirt: false, trousers: false };
    const vis = { bodice: false, sleeve: false, skirt: false, trousers: false };
    (lastPieceVis || []).forEach(p => {
      const k = (p.key || "").toLowerCase();
      const part = /sleeve|كم/.test(k) ? "sleeve"
        : /skirt|تنور/.test(k) ? "skirt"
        : /trouser|بنطل|pant|\bleg\b/.test(k) ? "trousers" : "bodice";
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
    if (!ready) return;
    const r = host.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = (r.width || 1) / (r.height || 1); camera.updateProjectionMatrix();
  }
  function fallback() {
    const c = host.getContext && host.getContext("2d"); if (!c) return;
    host.width = host.clientWidth; host.height = host.clientHeight;
    c.fillStyle = "#8b93a7"; c.font = "600 14px Inter, sans-serif"; c.textAlign = "center";
    c.fillText("3D preview needs WebGL and a first-load connection.", host.width / 2, host.height / 2);
  }
  function setAvatarURL(category, url) { if (url) avatarURLs[category] = url; else delete avatarURLs[category]; }

  return {
    init, build, resize, setFabric, setPieceVisibility,
    setSpin: v => { spinning = v; if (controls) controls.autoRotate = v; },
    setWalk: v => walking = v,
    setLoadingCallback: cb => onLoading = cb || (() => {}),
    setAvatarURL, isReady: () => ready,
  };
})();
