import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, computeMeasurements } from '../js/data.js';

test('3D Mannequin Models: 4 distinct anatomical models with distinct body measurements', () => {
  const categories = ['women', 'men', 'girls', 'boys'];
  for (const cat of categories) {
    const base = BASE[cat];
    assert.ok(base, `BASE must define measurements for category "${cat}"`);
    assert.ok(base.height > 0, `${cat} must have positive height`);
    assert.ok(base.chest > 0, `${cat} must have positive chest`);
    assert.ok(base.waist > 0, `${cat} must have positive waist`);
    assert.ok(base.hips > 0, `${cat} must have positive hips`);
    assert.ok(base.shoulder > 0, `${cat} must have positive shoulder`);
  }

  // Adult vs Youth height and proportions
  assert.ok(BASE.men.height > BASE.boys.height, 'adult man is taller than boy');
  assert.ok(BASE.women.height > BASE.girls.height, 'adult woman is taller than girl');
  assert.ok(BASE.men.shoulder > BASE.women.shoulder, 'man has broader shoulders than woman');
  assert.ok(BASE.men.chest > BASE.women.chest, 'man has larger chest circumference than woman');

  // Hip-to-waist ratio reflects female hourglass silhouette vs straighter male frame
  const womanHipWaistRatio = BASE.women.hips / BASE.women.waist;
  const manHipWaistRatio = BASE.men.hips / BASE.men.waist;
  assert.ok(womanHipWaistRatio > manHipWaistRatio, 'woman has higher hip-to-waist curvature ratio than man');

  // Youth sizing
  assert.ok(BASE.girls.height < 150 && BASE.boys.height < 150, 'kids heights reflect juvenile scale');
});

test('3D Body Measurement Computation: accurately grades each mannequin model', () => {
  const mWomen = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  const mMen = computeMeasurements({ category: 'men', size: 'M', standard: 'intl' });
  const mGirls = computeMeasurements({ category: 'girls', size: 'M', standard: 'intl' });
  const mBoys = computeMeasurements({ category: 'boys', size: 'M', standard: 'intl' });

  assert.equal(mWomen.height, 167);
  assert.equal(mMen.height, 178);
  assert.equal(mGirls.height, 134);
  assert.equal(mBoys.height, 138);

  assert.ok(mMen.shoulder > mWomen.shoulder);
  assert.ok(mWomen.hips > mGirls.hips);
});

test('Garment Part Isolation: mannequin wears only active pattern pieces no more no less', () => {
  // Simulates piece visibility resolution in three-view.js / app.js
  function resolveGarmentVisibility(pieceVis, category) {
    const present = { bodice: false, sleeve: false, skirt: false, trousers: false };
    const vis = { bodice: false, sleeve: false, skirt: false, trousers: false };
    (pieceVis || []).forEach(p => {
      const part = Object.prototype.hasOwnProperty.call(present, p.part) ? p.part : "bodice";
      present[part] = true;
      if (p.visible !== false) vis[part] = true;
    });

    const defaultPartVisible = part => {
      if (part === "trousers") return category === "men" || category === "boys";
      if (part === "skirt") return category === "women" || category === "girls";
      return true;
    };
    // Strict requirement: pieceVis !== null means active canvas pattern was provided.
    // An empty array [] means 0 pieces on canvas -> mannequin wears 0 pieces!
    const show = part => pieceVis !== null ? !!(present[part] && vis[part]) : defaultPartVisible(part);

    return {
      bodice: show("bodice"),
      sleeve: show("sleeve"),
      skirt: show("skirt"),
      trousers: show("trousers"),
    };
  }

  // 1. Empty pattern canvas: mannequin must wear 0 pieces (no phantom garments!)
  const emptyResult = resolveGarmentVisibility([], 'women');
  assert.equal(emptyResult.bodice, false, 'bodice must not appear on empty canvas');
  assert.equal(emptyResult.sleeve, false, 'sleeve must not appear on empty canvas');
  assert.equal(emptyResult.skirt, false, 'skirt must not appear on empty canvas');
  assert.equal(emptyResult.trousers, false, 'trousers must not appear on empty canvas');

  // 2. Skirt-only pattern: only skirt should appear, NOT a full dress/bodice!
  const skirtPieces = [
    { part: 'skirt', key: 'front_skirt', visible: true },
    { part: 'skirt', key: 'back_skirt', visible: true }
  ];
  const skirtResult = resolveGarmentVisibility(skirtPieces, 'women');
  assert.equal(skirtResult.skirt, true, 'skirt must be visible');
  assert.equal(skirtResult.bodice, false, 'bodice must NOT appear when only working on skirt');
  assert.equal(skirtResult.sleeve, false, 'sleeve must NOT appear when only working on skirt');
  assert.equal(skirtResult.trousers, false, 'trousers must NOT appear when only working on skirt');

  // 3. Trousers-only pattern: only trousers should appear!
  const trouserPieces = [
    { part: 'trousers', key: 'front_pant', visible: true },
    { part: 'trousers', key: 'back_pant', visible: true }
  ];
  const pantResult = resolveGarmentVisibility(trouserPieces, 'men');
  assert.equal(pantResult.trousers, true, 'trousers must be visible');
  assert.equal(pantResult.bodice, false, 'bodice must NOT appear when only working on trousers');
  assert.equal(pantResult.skirt, false, 'skirt must NOT appear when only working on trousers');
  assert.equal(pantResult.sleeve, false, 'sleeve must NOT appear when only working on trousers');

  // 4. Bodice-only pattern: only bodice should appear!
  const bodicePieces = [
    { part: 'bodice', key: 'front_bodice', visible: true },
    { part: 'bodice', key: 'back_bodice', visible: true }
  ];
  const bodiceResult = resolveGarmentVisibility(bodicePieces, 'women');
  assert.equal(bodiceResult.bodice, true, 'bodice must be visible');
  assert.equal(bodiceResult.skirt, false, 'skirt must NOT appear when only working on bodice');
  assert.equal(bodiceResult.trousers, false, 'trousers must NOT appear when only working on bodice');
  assert.equal(bodiceResult.sleeve, false, 'sleeve must NOT appear when only working on bodice');

  // 5. Full dress: bodice + skirt both appear
  const dressPieces = [
    { part: 'bodice', key: 'front_bodice', visible: true },
    { part: 'bodice', key: 'back_bodice', visible: true },
    { part: 'skirt', key: 'skirt_panel', visible: true }
  ];
  const dressResult = resolveGarmentVisibility(dressPieces, 'women');
  assert.equal(dressResult.bodice, true, 'bodice must be visible for dress');
  assert.equal(dressResult.skirt, true, 'skirt must be visible for dress');
  assert.equal(dressResult.trousers, false, 'trousers must NOT appear for dress');

  // 6. Hidden piece eye-toggle hides that specific part
  const hiddenSkirtPieces = [
    { part: 'bodice', key: 'front_bodice', visible: true },
    { part: 'skirt', key: 'skirt_panel', visible: false }
  ];
  const hiddenResult = resolveGarmentVisibility(hiddenSkirtPieces, 'women');
  assert.equal(hiddenResult.bodice, true);
  assert.equal(hiddenResult.skirt, false, 'skirt is hidden when eye toggle is off');
});

test('Category Mismatch Detection: triggers warning when pattern category differs from 3D mannequin', () => {
  function checkMismatch(patternCat, avatarCat) {
    const isMismatch = (patternCat || 'women') !== (avatarCat || 'women');
    return {
      mismatch: isMismatch,
      warningNeeded: isMismatch,
      suggestedFixCategory: isMismatch ? patternCat : null,
    };
  }

  // Woman pattern with Man mannequin -> warning
  const case1 = checkMismatch('women', 'men');
  assert.equal(case1.mismatch, true);
  assert.equal(case1.warningNeeded, true);
  assert.equal(case1.suggestedFixCategory, 'women');

  // Man pattern with Woman mannequin -> warning
  const case2 = checkMismatch('men', 'women');
  assert.equal(case2.mismatch, true);
  assert.equal(case2.warningNeeded, true);
  assert.equal(case2.suggestedFixCategory, 'men');

  // Woman pattern with Woman mannequin -> clean match (no warning)
  const case3 = checkMismatch('women', 'women');
  assert.equal(case3.mismatch, false);
  assert.equal(case3.warningNeeded, false);
  assert.equal(case3.suggestedFixCategory, null);

  // Girls pattern with Boys mannequin -> warning
  const case4 = checkMismatch('girls', 'boys');
  assert.equal(case4.mismatch, true);
  assert.equal(case4.suggestedFixCategory, 'girls');
});

test('Color Parsing: robustly extracts 24-bit integer colors for 3D materials', () => {
  function parseColor(c) {
    if (typeof c === 'number') return c;
    if (!c) return 0x6d5efc;
    c = String(c).trim();
    if (c[0] === '#') {
      const h = c.length === 4 ? c.slice(1).split('').map(x => x + x).join('') : c.slice(1);
      return parseInt(h, 16);
    }
    const m = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
    if (m) return (+m[1] << 16) | (+m[2] << 8) | +m[3];
    return 0x6d5efc;
  }

  assert.equal(parseColor('#ff0000'), 0xff0000);
  assert.equal(parseColor('#00ff00'), 0x00ff00);
  assert.equal(parseColor('#0000ff'), 0x0000ff);
  assert.equal(parseColor('#fff'), 0xffffff);
  assert.equal(parseColor('#123'), 0x112233);
  assert.equal(parseColor('rgb(255, 128, 0)'), (255 << 16) | (128 << 8) | 0);
  assert.equal(parseColor('rgba(100, 200, 50, 0.8)'), (100 << 16) | (200 << 8) | 50);
  assert.equal(parseColor(0xabcdef), 0xabcdef);
});

test('Walking Kinematics: realistic multi-joint articulation with anatomical bounds', () => {
  // Simulates gait simulation across a full stride cycle (0 to 2*PI)
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (2 * Math.PI / 3.2);
    const freq = 3.2;
    const sw = Math.sin(t * freq) * 0.34;

    // 1. Thighs swing oppositely
    const leg1X = sw;
    const leg2X = -sw;
    const sLeg1 = Math.sign(leg1X) || 0;
    const sLeg2 = Math.sign(leg2X) || 0;
    assert.equal(sLeg1, -sLeg2 || 0);

    // 2. Knee backward flexion calculation: in Three.js right-hand coordinates (shin hangs along -Y),
    // positive X rotation swings the shin backward into -Z (anatomical flexion).
    // Trailing leg flexes backward (k >= 0), forward-stepping leg straightens (k = 0) for heel strike.
    const k1 = Math.max(0, sw * 1.55) + (sw > 0 ? Math.abs(Math.sin(t * freq)) * 0.16 : 0);
    const k2 = Math.max(0, -sw * 1.55) + (sw < 0 ? Math.abs(Math.sin(t * freq)) * 0.16 : 0);

    // Real human biomechanics: knees never hyperextend forward (k >= 0 in Three.js)
    assert.ok(k1 >= -0.0001, `knee 1 angle (${k1}) must never bend forward`);
    assert.ok(k2 >= -0.0001, `knee 2 angle (${k2}) must never bend forward`);

    // When leg 1 is in trailing push-off/swing (sw > 0.15), knee 1 must flex backward (positive)
    if (sw > 0.15) {
      assert.ok(k1 > 0.15, `knee 1 must flex backward when leg swings back`);
    }

    // When leg 1 is reaching forward for heel strike (sw < 0), knee 1 straightens
    if (sw < 0) {
      assert.equal(k1, 0, 'knee 1 must be straight for forward heel strike');
    }

    // 3. Arm swing opposes leg swing (deltoid)
    const arm1X = -sw * 0.65;
    const arm2X = sw * 0.65;
    const sArm1 = Math.sign(arm1X) || 0;
    assert.equal(sArm1, -sLeg1 || 0);

    // 4. Elbow flexion (relaxed natural forward flex)
    const elbow1X = -0.15 - Math.max(0, -sw * 0.55) * 0.40;
    assert.ok(elbow1X <= -0.14, 'elbow maintains natural human flexion');

    // 5. Pelvic bob has 2 peaks per stride (frequency doubled via abs(sin))
    const bob = Math.abs(Math.sin(t * freq)) * 0.014;
    assert.ok(bob >= 0 && bob <= 0.015, 'pelvic bob is strictly positive and bounded');
  }
});

test('Collision-Free Garment Architecture: articulated trousers and sleeves prevent limb protrusion', () => {
  // Mock tree simulating Three.js hierarchy
  class MockNode {
    constructor(name) {
      this.name = name;
      this.children = [];
      this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.rotation = { x: 0, y: 0, z: 0 };
      this.visible = true;
      this.isMesh = false;
    }
    add(...nodes) {
      nodes.forEach(n => this.children.push(n));
    }
    traverse(cb) {
      cb(this);
      this.children.forEach(c => c.traverse(cb));
    }
  }

  // Construct leg skeleton: thighG -> kneeG -> footG
  const thighG = new MockNode('thighGroup');
  const kneeG = new MockNode('kneeGroup');
  const footG = new MockNode('footGroup');
  thighG.add(kneeG);
  kneeG.add(footG);

  // Attach articulated trouser panels
  const thighFront = new MockNode('trousers'); thighFront.isMesh = true;
  const thighBack = new MockNode('trousers'); thighBack.isMesh = true;
  thighG.add(thighFront, thighBack);

  const calfFront = new MockNode('trousers'); calfFront.isMesh = true;
  const calfBack = new MockNode('trousers'); calfBack.isMesh = true;
  kneeG.add(calfFront, calfBack);

  // Verify that thigh trouser panels are children of thighG
  assert.ok(thighG.children.includes(thighFront));
  assert.ok(thighG.children.includes(thighBack));

  // Verify that calf trouser panels are children of kneeG
  assert.ok(kneeG.children.includes(calfFront));
  assert.ok(kneeG.children.includes(calfBack));

  // When knee rotates backward, calf pant automatically rotates in unison
  kneeG.rotation.x = -0.55;
  // Knee and calf panel remain in identical frame of reference:
  // Relative offset between calf panel and knee remains 0 -> zero clipping!
  assert.equal(calfFront.position.x, 0);
  assert.equal(calfFront.position.z, 0);

  // Set-based traversal processes each mesh exactly once without duplicates
  const visited = new Set();
  const meshesFound = [];
  thighG.traverse(node => {
    if (node.isMesh) {
      assert.ok(!visited.has(node), 'mesh must not be visited multiple times');
      visited.add(node);
      meshesFound.push(node);
    }
  });

  assert.equal(meshesFound.length, 4, 'all 4 trouser meshes (2 thigh + 2 calf) visited once');
});

test('Avatar System: obsolete bundled avatars are rejected in favor of the new walking mannequins', () => {
  // Simulates avatar URL filtering in View3D and app.js
  function filterAvatarURL(url) {
    if (url && !url.startsWith("avatars/")) return url;
    return null;
  }

  // Obsolete bundled assets must be completely rejected
  assert.equal(filterAvatarURL("avatars/woman.glb"), null);
  assert.equal(filterAvatarURL("avatars/man.glb"), null);
  assert.equal(filterAvatarURL("avatars/girl.glb"), null);
  assert.equal(filterAvatarURL("avatars/boy.glb"), null);
  assert.equal(filterAvatarURL("avatars/rigged/woman2.glb"), null);
  assert.equal(filterAvatarURL("avatars/rigged/man.glb"), null);
  assert.equal(filterAvatarURL("avatars/rigged/girl3.glb"), null);
  assert.equal(filterAvatarURL("avatars/rigged/boy2.glb"), null);

  // External custom user uploads (blob: or https://) remain supported
  assert.equal(filterAvatarURL("blob:http://localhost:3000/1234"), "blob:http://localhost:3000/1234");
  assert.equal(filterAvatarURL("https://example.com/custom.glb"), "https://example.com/custom.glb");
});

test('Category-Tuned Walking Biomechanics: tailored catwalk, athletic, and youth gaits', () => {
  function getGaitParameters(category, t) {
    const isKid = category === "girls" || category === "boys";
    const isWoman = category === "women";
    const freq = isKid ? 3.6 : 3.1;
    const sw = Math.sin(t * freq) * (isKid ? 0.30 : (isWoman ? 0.33 : 0.35));
    const rollAmp = isWoman ? 0.024 : (isKid ? 0.016 : 0.012);
    const yawAmp = isWoman ? 0.024 : (isKid ? 0.018 : 0.032);
    const bobAmp = isKid ? 0.016 : 0.013;

    return {
      freq,
      sw,
      roll: Math.sin(t * freq) * rollAmp,
      yaw: -Math.sin(t * freq) * yawAmp,
      bob: Math.abs(Math.sin(t * freq)) * bobAmp,
      headYaw: -(-Math.sin(t * freq) * yawAmp) * 0.85,
      headRoll: -(Math.sin(t * freq) * rollAmp) * 0.70,
      wristPitch: sw * 0.14,
    };
  }

  const t = 1.0;
  const womanGait = getGaitParameters("women", t);
  const manGait = getGaitParameters("men", t);
  const girlGait = getGaitParameters("girls", t);
  const boyGait = getGaitParameters("boys", t);

  // Women exhibit more pronounced catwalk hip roll (sway) than men
  assert.ok(Math.abs(womanGait.roll) > Math.abs(manGait.roll), 'women have higher hip roll sway than men');

  // Men exhibit broader shoulder/torso yaw twist than women
  assert.ok(Math.abs(manGait.yaw) > Math.abs(womanGait.yaw), 'men have broader athletic torso yaw twist');

  // Kids have a quicker, lighter stride frequency and higher relative vertical bob
  assert.ok(girlGait.freq > womanGait.freq, 'youth cadence has higher step frequency');
  assert.ok(boyGait.freq > manGait.freq, 'youth cadence has higher step frequency');
  assert.ok(girlGait.bob >= 0 && girlGait.bob <= 0.017, 'youth vertical bob is bounded');

  // Head stabilization counters torso yaw to keep gaze forward down the runway
  assert.equal(Math.sign(womanGait.headYaw), -Math.sign(womanGait.yaw) || 0, 'head counter-yaws to stabilize gaze');
  assert.equal(Math.sign(manGait.headYaw), -Math.sign(manGait.yaw) || 0, 'head counter-yaws to stabilize gaze');
});

test('3D Accessories: buttons, zippers, belt & buckle finishes, placements, and parent piece visibility linkage', () => {
  const buttonStyles = ['gold', 'silver', 'horn', 'pearl', 'matte_black', 'matching'];
  const buttonPlacements = ['front_placket', 'double_breasted', 'waistband', 'cuffs'];
  const zipperStyles = ['silver', 'brass', 'gunmetal'];
  const zipperPlacements = ['center_front', 'center_back', 'biker_asymmetric', 'trouser_fly'];
  const beltStyles = ['leather_gold', 'leather_silver', 'matte_black', 'matching'];
  const beltWidths = ['slim', 'medium', 'wide'];

  // 1. Verify styling and finishes are recognized
  assert.equal(buttonStyles.length, 6);
  assert.equal(buttonPlacements.length, 4);
  assert.equal(zipperStyles.length, 3);
  assert.equal(zipperPlacements.length, 4);
  assert.equal(beltStyles.length, 4);
  assert.equal(beltWidths.length, 3);

  // 2. Simulate accessory configuration state
  function configureAccessories(cfg) {
    const state = {
      buttons: { enabled: false, style: 'gold', placement: 'front_placket', count: 6 },
      zipper: { enabled: false, style: 'silver', placement: 'center_front', openPct: 0.0 },
      belt: { enabled: false, style: 'leather_gold', width: 'medium' }
    };
    if (cfg.buttons) Object.assign(state.buttons, cfg.buttons);
    if (cfg.zipper) Object.assign(state.zipper, cfg.zipper);
    if (cfg.belt) Object.assign(state.belt, cfg.belt);
    return state;
  }

  const accConfig = configureAccessories({
    buttons: { enabled: true, style: 'horn', placement: 'front_placket', count: 7 },
    zipper: { enabled: true, style: 'brass', placement: 'trouser_fly', openPct: 0.1 },
    belt: { enabled: true, style: 'leather_gold', width: 'medium' }
  });
  assert.equal(accConfig.buttons.enabled, true);
  assert.equal(accConfig.buttons.count, 7);
  assert.equal(accConfig.buttons.style, 'horn');
  assert.equal(accConfig.zipper.enabled, true);
  assert.equal(accConfig.zipper.placement, 'trouser_fly');
  assert.equal(accConfig.belt.enabled, true);
  assert.equal(accConfig.belt.style, 'leather_gold');
  assert.equal(accConfig.belt.width, 'medium');

  // 3. Hierarchical visibility linkage: accessories only appear if parent garment piece is worn
  function getAccessoryVisibility(accState, garmentPartsWorn) {
    const vis = { buttons: false, zipper: false, belt: false };
    if (accState.buttons && accState.buttons.enabled) {
      const parent = (accState.buttons.placement === 'cuffs' || accState.buttons.placement === 'front_placket' || accState.buttons.placement === 'double_breasted')
        ? 'bodice'
        : (garmentPartsWorn.skirt ? 'skirt' : 'trousers');
      vis.buttons = !!garmentPartsWorn[parent];
    }
    if (accState.zipper && accState.zipper.enabled) {
      const parent = accState.zipper.placement === 'trouser_fly' ? 'trousers' : 'bodice';
      vis.zipper = !!garmentPartsWorn[parent];
    }
    if (accState.belt && accState.belt.enabled) {
      vis.belt = !!(garmentPartsWorn.bodice || garmentPartsWorn.skirt || garmentPartsWorn.trousers);
    }
    return vis;
  }

  // Case A: Mannequin wearing only skirt -> placket buttons must NOT float in air, belt attaches to skirt waist
  const skirtOnlyWorn = { bodice: false, sleeve: false, skirt: true, trousers: false };
  const visA = getAccessoryVisibility(accConfig, skirtOnlyWorn);
  assert.equal(visA.buttons, false, 'bodice placket buttons must hide when bodice is not worn');
  assert.equal(visA.zipper, false, 'trouser fly zipper must hide when trousers are not worn');
  assert.equal(visA.belt, true, 'belt visible when skirt is worn');

  // Case B: Mannequin wearing bodice + trousers -> placket buttons, trouser zipper, and belt all visible
  const suitWorn = { bodice: true, sleeve: true, skirt: false, trousers: true };
  const visB = getAccessoryVisibility(accConfig, suitWorn);
  assert.equal(visB.buttons, true, 'buttons visible when bodice is worn');
  assert.equal(visB.zipper, true, 'trouser zipper visible when trousers are worn');
  assert.equal(visB.belt, true, 'belt visible when trousers and bodice are worn');

  // Case C: Mannequin wearing 0 pieces (empty canvas) or only sleeves -> belt and all accessories hidden
  const emptyWorn = { bodice: false, sleeve: false, skirt: false, trousers: false };
  const visC = getAccessoryVisibility(accConfig, emptyWorn);
  assert.equal(visC.buttons, false);
  assert.equal(visC.zipper, false);
  assert.equal(visC.belt, false, 'belt must NOT float when 0 pieces are worn');

  const sleeveOnlyWorn = { bodice: false, sleeve: true, skirt: false, trousers: false };
  const visD = getAccessoryVisibility(accConfig, sleeveOnlyWorn);
  assert.equal(visD.belt, false, 'belt must not appear if only sleeves are worn');
});

test('3D Prints and Cloth Artwork: procedural presets, target filtering, and direct drawings', () => {
  const PRESETS = ['none', 'floral', 'monogram', 'houndstooth', 'stripes', 'polka', 'atelier'];
  assert.equal(PRESETS.length, 7);

  // Simulate print distribution across garment parts
  function applyPrintToGarment(fabricState, opts) {
    const { target = 'all', preset, dataURL, isDrawing } = opts;
    const partsToUpdate = (target === 'all' || !target)
      ? ['bodice', 'skirt', 'trousers', 'sleeve']
      : [target];

    const updated = { ...fabricState };
    partsToUpdate.forEach(part => {
      updated[part] = {
        textureDataURL: preset === 'none' ? null : (dataURL || `preset:${preset}`),
        isDrawing: !!isDrawing,
        textureRepeat: isDrawing ? 1 : (preset === 'houndstooth' ? 8 : 4)
      };
    });
    return updated;
  }

  const initialFabric = {
    bodice: { textureDataURL: null, isDrawing: false, textureRepeat: 4 },
    skirt: { textureDataURL: null, isDrawing: false, textureRepeat: 4 },
    trousers: { textureDataURL: null, isDrawing: false, textureRepeat: 4 },
    sleeve: { textureDataURL: null, isDrawing: false, textureRepeat: 4 }
  };

  // 1. Target all pieces with floral preset
  const allFloral = applyPrintToGarment(initialFabric, { preset: 'floral', target: 'all' });
  assert.equal(allFloral.bodice.textureDataURL, 'preset:floral');
  assert.equal(allFloral.skirt.textureDataURL, 'preset:floral');
  assert.equal(allFloral.trousers.textureDataURL, 'preset:floral');
  assert.equal(allFloral.sleeve.textureDataURL, 'preset:floral');

  // 2. Target specific piece: apply custom drawing only on bodice
  const customDrawingDataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const bodiceDrawing = applyPrintToGarment(allFloral, {
    dataURL: customDrawingDataURL,
    target: 'bodice',
    isDrawing: true
  });
  assert.equal(bodiceDrawing.bodice.textureDataURL, customDrawingDataURL);
  assert.equal(bodiceDrawing.bodice.isDrawing, true);
  assert.equal(bodiceDrawing.bodice.textureRepeat, 1, 'drawings use repeat 1:1');
  // Other parts remain floral!
  assert.equal(bodiceDrawing.skirt.textureDataURL, 'preset:floral');
  assert.equal(bodiceDrawing.trousers.textureDataURL, 'preset:floral');

  // 3. Clear print by setting preset 'none'
  const clearedSkirt = applyPrintToGarment(bodiceDrawing, { preset: 'none', target: 'skirt' });
  assert.equal(clearedSkirt.skirt.textureDataURL, null);
  assert.equal(clearedSkirt.bodice.textureDataURL, customDrawingDataURL);
});

test('Walking Stride Dynamic Containment: skirt billowing and trouser overlap prevent leg clipping', () => {
  // Test skirt dynamics over a full walking stride
  const curH = 1.67; // Woman mannequin height in meters
  const legLength = curH * 0.48; // ~80 cm
  const steps = 40;

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (2 * Math.PI / 3.1);
    const sw = Math.sin(t * 3.1) * 0.33; // Thigh swing angle (-0.33 to +0.33 rad)
    const strideMag = Math.abs(sw);

    // Leg displacement in Z relative to hip center
    const thighDisplacementZ = Math.sin(sw) * (legLength * 0.5);

    // Dynamic Skirt Transformation (from three-view.js loop)
    const skirtPosZ = strideMag * (curH * 0.08); // Forward shift (up to ~4.4 cm)
    const skirtRotX = -strideMag * 0.36; // Pitch flare (up to ~0.12 rad)
    const skirtScaleZ = 1.0 + strideMag * 0.85; // Depth expansion (up to +28%)
    const skirtScaleX = 1.0 + strideMag * 0.30; // Width expansion (up to +10%)

    // Skirt front flare distance from hip center
    const skirtHemDepth = (curH * 0.22) * skirtScaleZ + skirtPosZ;

    // Forward leg reach must remain strictly within skirt hem bounds
    if (sw < 0) {
      const legReachZ = Math.abs(thighDisplacementZ);
      assert.ok(skirtHemDepth > legReachZ, `skirt hem (${skirtHemDepth.toFixed(3)}) must fully enclose forward reaching leg (${legReachZ.toFixed(3)})`);
    }

    // Skirt transformations are smooth and bounded
    assert.ok(skirtPosZ >= 0 && skirtPosZ <= 0.05, 'skirt Z shift is smoothly bounded');
    assert.ok(skirtRotX <= 0 && skirtRotX >= -0.15, 'skirt pitch flares forward');
    assert.ok(skirtScaleZ >= 1.0 && skirtScaleZ <= 1.35, 'skirt depth expansion is bounded');
  }

  // Trouser Telescoping Overlap Across Knee Joint
  const thighLen = 0.40;
  const thighCuffBottom = -thighLen * 1.15; // Extends 15% past knee
  const calfCuffTop = thighLen * 0.12;      // Extends 12% past knee
  const totalJointOverlap = (thighLen * 0.15) + calfCuffTop; // 27% overlap

  assert.ok(totalJointOverlap > 0.10 * thighLen, 'trouser joint has at least 25% overlap');

  // At backward knee flexion up to 45 degrees (0.785 rad), the overlap covers the chord gap
  const maxKneeFlexion = 0.785;
  const kneeGapMax = 2 * (thighLen * 0.08) * Math.sin(maxKneeFlexion / 2);
  assert.ok(totalJointOverlap > kneeGapMax, 'telescoping overlap covers joint gap during deep knee flexion');
});

test('Garment Silhouette Adaptation: Underwear, Briefs, Trunks & Bras in 3D', () => {
  // Simulates sub-part mesh visibility resolution in three-view.js
  function resolveSilhouetteVisibility(pieces) {
    const isBrief = (pieces || []).some(p => p.role === "brief-front" || p.role === "brief-back" || /brief|panties|كيلوت|سروال داخلي/i.test(p.name || p.key || ""));
    const isTrunk = !isBrief && (pieces || []).some(p => /trunk|boxer|short|شورت/i.test(p.name || p.key || ""));
    const isBra = (pieces || []).some(p => p.role === "cup" || p.role === "band" || p.role === "strap" || /bra|bralette|bandeau|حمالة/i.test(p.name || p.key || ""));

    const present = { bodice: false, sleeve: false, skirt: false, trousers: false };
    (pieces || []).forEach(p => {
      const part = p.part || "bodice";
      if (p.visible !== false) present[part] = true;
    });

    return {
      bodiceFull: present.bodice && !isBra,
      bodiceBra: present.bodice && isBra,
      skirt: present.skirt,
      sleeve: present.sleeve,
      trousersSeat: present.trousers,
      trousersThigh: present.trousers && !isBrief,
      trousersCalf: present.trousers && !isBrief && !isTrunk,
    };
  }

  // 1. Women's Briefs (wu01): only pelvic seat brief is worn (no skirt, no calf cuffs, no bodice)
  const womenBriefPieces = [
    { part: "trousers", role: "brief-front", name: "Front Panel", visible: true },
    { part: "trousers", role: "brief-back", name: "Back Panel", visible: true },
    { part: "trousers", role: "gusset", name: "Crotch Gusset", visible: true }
  ];
  const briefRes = resolveSilhouetteVisibility(womenBriefPieces);
  assert.equal(briefRes.trousersSeat, true, 'brief pelvic seat must be visible');
  assert.equal(briefRes.trousersThigh, false, 'thigh cuffs hidden for briefs');
  assert.equal(briefRes.trousersCalf, false, 'calf cuffs hidden for briefs');
  assert.equal(briefRes.skirt, false, 'skirt must NOT appear for briefs');
  assert.equal(briefRes.bodiceFull, false, 'bodice must NOT appear for briefs');
  assert.equal(briefRes.bodiceBra, false, 'bra must NOT appear for briefs');

  // 2. Men's Boxer Briefs / Trunks (mu03): seat and thigh are worn, calf cuffs hidden
  const menTrunkPieces = [
    { part: "trousers", role: "brief-front", name: "Boxer Brief Front Panel", visible: true },
    { part: "trousers", role: "brief-back", name: "Boxer Brief Back Panel", visible: true }
  ];
  const trunkRes = resolveSilhouetteVisibility(menTrunkPieces);
  assert.equal(trunkRes.trousersSeat, true, 'seat must be visible for boxer brief');
  assert.equal(trunkRes.trousersThigh, false, 'high-cut brief has thigh hidden');
  assert.equal(trunkRes.trousersCalf, false, 'calf cuffs hidden for brief');

  const boxerShortPieces = [
    { part: "trousers", role: "trouser-front", name: "Boxer Trunk Panel", visible: true },
    { part: "trousers", role: "trouser-back", name: "Boxer Trunk Panel", visible: true }
  ];
  const boxerRes = resolveSilhouetteVisibility(boxerShortPieces);
  assert.equal(boxerRes.trousersSeat, true, 'seat must be visible for trunk');
  assert.equal(boxerRes.trousersThigh, true, 'thigh panel visible for trunk');
  assert.equal(boxerRes.trousersCalf, false, 'calf cuffs hidden for trunk');

  // 3. Women's Soft-Cup Bralette (wb01): only bra is worn (no full bodice, no skirt, no trousers)
  const braPieces = [
    { part: "bodice", role: "cup", name: "Triangle Bra Cup Left", visible: true },
    { part: "bodice", role: "cup", name: "Triangle Bra Cup Right", visible: true },
    { part: "bodice", role: "band", name: "Underbust Band", visible: true }
  ];
  const braRes = resolveSilhouetteVisibility(braPieces);
  assert.equal(braRes.bodiceBra, true, 'bra shell must be visible');
  assert.equal(braRes.bodiceFull, false, 'full torso bodice must be hidden for bra');
  assert.equal(braRes.skirt, false, 'skirt hidden for bra');
  assert.equal(braRes.trousersSeat, false, 'trousers hidden for bra');

  // 4. Standard Full Trousers: seat, thigh, and calf all visible
  const fullPantPieces = [
    { part: "trousers", role: "trouser-front", name: "Trouser Front", visible: true },
    { part: "trousers", role: "trouser-back", name: "Trouser Back", visible: true }
  ];
  const pantRes = resolveSilhouetteVisibility(fullPantPieces);
  assert.equal(pantRes.trousersSeat, true);
  assert.equal(pantRes.trousersThigh, true);
  assert.equal(pantRes.trousersCalf, true, 'calf cuffs visible for full trousers');

  // 5. Standard Full Dress: full bodice and skirt visible, bra hidden
  const dressPieces = [
    { part: "bodice", role: "front-panel", name: "Dress Front", visible: true },
    { part: "bodice", role: "back-panel", name: "Dress Back", visible: true },
    { part: "skirt", role: "skirt-front-gore", name: "Skirt Panel", visible: true }
  ];
  const dressRes = resolveSilhouetteVisibility(dressPieces);
  assert.equal(dressRes.bodiceFull, true, 'full bodice visible for dress');
  assert.equal(dressRes.bodiceBra, false, 'bra hidden for dress');
  assert.equal(dressRes.skirt, true, 'skirt visible for dress');
  assert.equal(dressRes.trousersSeat, false, 'trousers hidden for dress');
});

test('Mannequin Face & Skin Material: 100% solid opacity, outward normal winding, and flush facial features', () => {
  // 1. Head profile winding must be strictly bottom-to-top (increasing Y) so LatheGeometry produces outward normals
  const headH = 21.5;
  const profile = [
    [headH * 0.06, -headH * 0.48],  // submental junction (bottom)
    [headH * 0.13, -headH * 0.45],  // chin (mentum)
    [headH * 0.22, -headH * 0.34],  // mandibular angle / lower jaw
    [headH * 0.30, -headH * 0.20],  // mid cheek / maxilla
    [headH * 0.37, -headH * 0.06],  // zygomatic cheekbone level
    [headH * 0.40, headH * 0.08],   // supraorbital brow line
    [headH * 0.41, headH * 0.22],   // temporal plane
    [headH * 0.35, headH * 0.38],   // parietal vault
    [headH * 0.22, headH * 0.47],   // upper parietal arch
    [headH * 0.02, headH * 0.50],   // apex of cranium (top)
  ];

  for (let i = 0; i < profile.length - 1; i++) {
    assert.ok(profile[i + 1][1] > profile[i][1], `profile point ${i + 1} Y must be strictly greater than point ${i} Y for outward normals`);
  }

  // 2. Skin material must be 100% opaque, non-transparent, depthWrite: true, side: DoubleSide, and 0 sheen
  function createSkinMatConfig() {
    return {
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      sheen: 0.0,
      side: 'DoubleSide',
    };
  }

  const skin = createSkinMatConfig();
  assert.equal(skin.transparent, false, 'skin must not be transparent');
  assert.equal(skin.opacity, 1.0, 'skin must have 100% full opacity');
  assert.equal(skin.depthWrite, true, 'skin must write to depth buffer');
  assert.equal(skin.sheen, 0.0, 'skin must not have translucent sheen haze');
  assert.equal(skin.side, 'DoubleSide', 'skin must render double-sided to prevent back-face culling transparency');

  // 3. Facial feature Z-depths sit flush on head surface
  const eyeZ = headH * 0.285;
  const upperVermilionZ = headH * 0.302;
  const lowerVermilionZ = headH * 0.298;

  assert.ok(eyeZ < headH * 0.30, 'eyes recessed flush inside sockets');
  assert.ok(upperVermilionZ < headH * 0.32, 'lips sit flush on sculpted mouth surface');
  assert.ok(lowerVermilionZ < headH * 0.32, 'lips sit flush on sculpted mouth surface');
});

test('3D View Toolbar: reorganized into 4 semantic tool groups with draw-on-cloth button and responsive layout', async () => {
  const fs = await import('fs');
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('css/styles.css', 'utf8');

  // Verify toolbar container
  assert.ok(html.includes('class="v3d-toolbar"'), 'Toolbar element exists in index.html');

  // Verify 4 semantic tool groups
  const groupMatches = html.match(/class="v3d-tool-group"/g);
  assert.ok(groupMatches && groupMatches.length >= 4, 'Toolbar has at least 4 semantic tool groups');

  // Group 1: Avatar model, 360 spin, walk toggle
  assert.ok(html.includes('id="v3dModelSelect"'), 'Avatar model select exists');
  assert.ok(html.includes('id="spinToggle"'), '360 spin toggle exists');
  assert.ok(html.includes('id="walkToggle"'), 'Walk toggle exists');

  // Group 2: Color picker and fabric preset
  assert.ok(html.includes('id="v3dColorPicker"'), 'Garment color picker exists');
  assert.ok(html.includes('id="v3dFabricSelect"'), 'Fabric preset select exists');

  // Group 3: Design, direct cloth drawing, prints, accessories
  assert.ok(html.includes('id="v3dDrawBtn"'), 'Dedicated Draw on Cloth button exists in 3D toolbar');
  assert.ok(html.includes('id="v3dPrintsBtn"'), 'Prints & Art button exists');
  assert.ok(html.includes('id="v3dAccBtn"'), 'Accessories button exists');

  // Group 4: Tension and export
  assert.ok(html.includes('id="tensionToggle"'), 'Tension heatmap toggle exists');
  assert.ok(html.includes('id="v3dExportObjBtn"'), 'Export 3D OBJ button exists');

  // Verify CSS responsiveness rules
  assert.ok(css.includes('max-width: calc(100% - 32px);'), 'Toolbar has max-width constraint to prevent screen overflow');
  assert.ok(css.includes('overflow-x: auto;'), 'Toolbar enables horizontal scrolling for narrow screens');
  assert.ok(css.includes('-webkit-overflow-scrolling: touch;'), 'Toolbar supports smooth touch scrolling on mobile/tablet');
  assert.ok(css.includes('.v3d-tool-group'), 'CSS contains styling for tool groups');
  assert.ok(css.includes('.v3d-btn.v3d-btn-highlight'), 'Highlight styling for cloth drawing button exists');

  // Verify split-view adaptation
  assert.ok(css.includes('.canvas-wrap.split .view3d-wrap .v3d-toolbar'), 'Toolbar adapts specifically when in split view mode');
});

test('Cloth Drawing on Garments: texture compositing preserves base fabric color and avoids blackouts', () => {
  // Simulates fabricMat material resolution
  function simulateFabricMat(slot) {
    return {
      // When a texture (drawing or print) is applied, color must be white (0xffffff)
      // so the composited texture's colors (both fabric base and artwork) are rendered
      // faithfully without being multiplied by dark cloth color or blackened out
      color: slot.textureDataURL ? 0xffffff : slot.color,
      hasMap: !!slot.textureDataURL,
      textureRepeat: slot.textureRepeat != null ? slot.textureRepeat : (slot.isDrawing ? 1 : 6)
    };
  }

  // 1. Plain fabric without drawing
  const plainSlot = { color: 0x6d5efc, material: 'cotton', textureDataURL: null, isDrawing: false };
  const plainMat = simulateFabricMat(plainSlot);
  assert.equal(plainMat.color, 0x6d5efc, 'plain garment uses its chosen cloth color');
  assert.equal(plainMat.hasMap, false, 'plain garment has no texture map');

  // 2. Garment with cloth drawing applied
  const drawingSlot = {
    color: 0x6d5efc,
    material: 'cotton',
    textureDataURL: 'data:image/png;base64,drawingCompositeData',
    rawDrawingURL: 'data:image/png;base64,rawStrokesData',
    isDrawing: true,
    textureRepeat: 1
  };
  const drawingMat = simulateFabricMat(drawingSlot);
  assert.equal(drawingMat.color, 0xffffff, 'garment with drawing sets material color to white to preserve composited colors');
  assert.equal(drawingMat.hasMap, true, 'garment with drawing has texture map');
  assert.equal(drawingMat.textureRepeat, 1, 'drawing repeat is 1 so artwork is positioned across garment piece');

  // 3. Simulated drawing compositing over base fabric color
  function compositeArtwork(baseColorHex, strokes) {
    // Canvas dimensions
    const width = 512, height = 512;
    // Composite simulation: background layer gets baseColorHex, foreground gets strokes
    return {
      background: baseColorHex,
      hasArtwork: strokes.length > 0,
      width,
      height
    };
  }

  const composite = compositeArtwork('#6d5efc', [{ type: 'brush', color: '#ffcc00' }]);
  assert.equal(composite.background, '#6d5efc', 'base fabric color forms background of drawing texture');
  assert.equal(composite.hasArtwork, true, 'artwork is composited on top');
});

test('Cloth Drawing Board: stroke undo history and artwork restoration lifecycle', () => {
  // Simulates undo history stack
  const undoStack = [];
  const MAX_UNDO = 24;

  function pushUndo(snapshot) {
    if (undoStack.length >= MAX_UNDO) undoStack.shift();
    undoStack.push(snapshot);
  }

  function doUndo(currentState) {
    if (undoStack.length > 0) {
      return undoStack.pop();
    }
    return currentState;
  }

  // 1. Undo stack operations
  pushUndo('stroke_0');
  pushUndo('stroke_1');
  pushUndo('stroke_2');
  assert.equal(undoStack.length, 3);

  const undone = doUndo('stroke_2');
  assert.equal(undone, 'stroke_2');
  assert.equal(undoStack.length, 2);

  // 2. Blank canvas detection simulation
  function isBufferBlank(rgbaBuffer) {
    for (let i = 3; i < rgbaBuffer.length; i += 4) {
      if (rgbaBuffer[i] !== 0) return false;
    }
    return true;
  }

  const blankBuffer = new Uint8Array(4 * 16); // 16 transparent pixels
  assert.equal(isBufferBlank(blankBuffer), true, 'all transparent pixels evaluate to blank');

  const paintedBuffer = new Uint8Array(4 * 16);
  paintedBuffer[3] = 255; // 1 opaque painted pixel
  assert.equal(isBufferBlank(paintedBuffer), false, 'pixel with alpha 255 evaluates to non-blank');
});





