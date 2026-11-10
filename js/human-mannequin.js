/* ============================================================
   Unified Lifelike Human Mannequin — BerryStudio 3D System
   Shared between 3D Preview (js/three-view.js) and Cloth Lab
   (cloth-lab/src/body/Avatar.jsx).

   Generates a single continuous, watertight, 2-manifold human
   body surface (feet -> legs -> groin cobordism -> pelvis ->
   sculpted torso -> shoulder cobordism -> arms/hands + neck/head)
   bound to an articulated 17-bone humanoid skeleton with smooth
   4-bone linear-blend skinning, refined facial details, and
   category-specific studio hairstyles.
   ============================================================ */

export const HUMAN_SKIN_PALETTE = {
  women: 0xdca98e,
  men: 0xcb9578,
  girls: 0xe3b59b,
  boys: 0xd5a286,
};

export const HUMAN_HAIR_PALETTE = {
  women: 0x261812,
  men: 0x201610,
  girls: 0x3b2416,
  boys: 0x2a1c13,
};

const cm = (v) => v * 0.01;
const radiusFromCirc = (circ) => cm(circ) / (2 * Math.PI);

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0, edge1, x) {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function bumpWindow(x, center, halfWidth) {
  const d = Math.abs(x - center);
  return d >= halfWidth ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / halfWidth));
}

export function femaleTorsoSculpt(d) {
  const { hipY, span, chestR, waistR, hipR, kid } = d;
  return {
    breast: {
      centerY: hipY + span * 0.715,
      halfWidth: span * 0.165,
      amplitude: kid ? chestR * 0.035 : chestR * 0.165,
      phi0: 0.46,
      phiHalfWidth: 0.46,
    },
    lumbar: {
      centerY: hipY + span * 0.39,
      halfWidth: span * 0.17,
      amplitude: waistR * (kid ? 0.065 : 0.105),
    },
    glute: {
      centerY: hipY - span * 0.035,
      halfWidth: span * 0.175,
      amplitude: hipR * (kid ? 0.095 : 0.145),
    },
  };
}

export function torsoZBump(y, phi, d) {
  const { breast, lumbar, glute } = femaleTorsoSculpt(d);
  let dz = 0;
  // Natural teardrop bust contour: gentle upper pole slope, fuller lower cup
  const lobe = bumpWindow(phi, breast.phi0, breast.phiHalfWidth) + bumpWindow(phi, -breast.phi0, breast.phiHalfWidth);
  const yRel = (y - breast.centerY) / (breast.halfWidth || 1);
  const teardrop = yRel > 0 ? Math.max(0, 1 - yRel * 0.22) : 1 + Math.min(0.16, -yRel * 0.14);
  dz += breast.amplitude * bumpWindow(y, breast.centerY, breast.halfWidth) * lobe * teardrop;

  // Soft lower-abdominal fullness with subtle navel indentation
  if (!d.kid) {
    const bellyWin = bumpWindow(y, d.hipY + d.span * 0.21, d.span * 0.16) * bumpWindow(phi, 0, 0.72);
    dz += d.waistR * 0.038 * bellyWin;
    dz -= d.waistR * 0.016 * bumpWindow(y, d.hipY + d.span * 0.30, d.span * 0.035) * bumpWindow(phi, 0, 0.10);
  }

  const backWeight = Math.max(0, -Math.cos(phi));
  dz += lumbar.amplitude * bumpWindow(y, lumbar.centerY, lumbar.halfWidth) * backWeight;

  // Smooth, rounded gluteus maximus contour (broad vertical envelope -> zero pointy side spike)
  const gluteCleft = 1 - 0.26 * bumpWindow(phi - Math.PI, 0, 0.19) - 0.26 * bumpWindow(phi + Math.PI, 0, 0.19);
  const gluteRound = Math.pow(bumpWindow(y, glute.centerY, glute.halfWidth), 0.85);
  dz -= glute.amplitude * gluteRound * Math.pow(backWeight, 0.9) * gluteCleft;
  return dz;
}

export function maleTorsoSculpt(d) {
  const { hipY, span, chestR, waistR, hipR, kid } = d;
  return {
    chest: {
      centerY: hipY + span * 0.74,
      halfWidth: span * 0.155,
      amplitude: chestR * (kid ? 0.045 : 0.098),
      phiHalfWidth: 0.84,
    },
    lumbar: {
      centerY: hipY + span * 0.39,
      halfWidth: span * 0.16,
      amplitude: waistR * (kid ? 0.055 : 0.075),
    },
    glute: {
      centerY: hipY - span * 0.035,
      halfWidth: span * 0.165,
      amplitude: hipR * (kid ? 0.085 : 0.112),
    },
  };
}

export function maleTorsoZBump(y, phi, d) {
  const { chest, lumbar, glute } = maleTorsoSculpt(d);
  let dz = 0;
  const pecLobe = bumpWindow(phi, 0.44, 0.40) + bumpWindow(phi, -0.44, 0.40);
  dz += chest.amplitude * bumpWindow(y, chest.centerY, chest.halfWidth) * (pecLobe * 0.84 + bumpWindow(phi, 0, chest.phiHalfWidth) * 0.28);
  if (!d.kid) {
    dz += d.waistR * 0.024 * bumpWindow(y, d.hipY + d.span * 0.46, d.span * 0.16) * bumpWindow(phi, 0, 0.58);
  }
  const backWeight = Math.max(0, -Math.cos(phi));
  dz += lumbar.amplitude * bumpWindow(y, lumbar.centerY, lumbar.halfWidth) * backWeight;
  const gluteCleft = 1 - 0.22 * bumpWindow(phi - Math.PI, 0, 0.17) - 0.22 * bumpWindow(phi + Math.PI, 0, 0.17);
  const gluteRound = Math.pow(bumpWindow(y, glute.centerY, glute.halfWidth), 0.85);
  dz -= glute.amplitude * gluteRound * Math.pow(backWeight, 0.9) * gluteCleft;
  return dz;
}

/**
 * Normalizes either raw measurements (in cm) or pre-computed dims (in meters)
 * into a complete anatomical dimensions object in meters.
 */
export function computeHumanBodyDims(category, measurementsOrDims, landmarks) {
  if (measurementsOrDims && typeof measurementsOrDims.H === "number" && typeof measurementsOrDims.hipY === "number") {
    return measurementsOrDims;
  }
  const m = measurementsOrDims || {};
  const female = category === "women" || category === "girls";
  const kid = category === "girls" || category === "boys";

  const heightCm = Number(m.height) || (kid ? 136 : female ? 167 : 178);
  const chestCm = Number(m.chest) || (kid ? 68 : female ? 88 : 98);
  const waistCm = Number(m.waist) || (kid ? 60 : female ? 70 : 82);
  const hipsCm = Number(m.hips) || (kid ? 72 : female ? 96 : 96);
  const shoulderCm = Number(m.shoulder) || (kid ? 31 : female ? 39 : 45);
  const neckCm = Number(m.neck) || (kid ? 29 : female ? 35 : 39);
  const bicepCm = Number(m.bicep) || (kid ? 21 : female ? 27 : 32);
  const thighCm = Number(m.thigh) || (kid ? 41 : female ? 55 : 56);

  const H = cm(heightCm);
  const headH = H * (kid ? 0.142 : 0.130);
  const neckTopY = H - headH;
  const shoulderY = H * (landmarks ? landmarks.shoulderYFrac : (kid ? 0.805 : 0.822));
  const hipY = H * (landmarks ? landmarks.hipYFrac : (kid ? 0.485 : 0.520));

  let chestR = radiusFromCirc(chestCm);
  let waistR = radiusFromCirc(waistCm);
  let hipR = radiusFromCirc(hipsCm);
  let shoulderHalf = cm(shoulderCm) / 2;
  const neckR = radiusFromCirc(neckCm) * 0.84;

  if (female) {
    waistR *= 0.87;
    hipR *= 1.03;
  } else {
    waistR *= 0.96;
    shoulderHalf *= 1.06;
    chestR *= 1.03;
  }
  if (kid) {
    waistR = (waistR * 0.62 + chestR * 0.38) * 0.96;
    hipR *= 0.98;
    shoulderHalf *= 0.99;
  }
  if (landmarks && landmarks.radiusScale) {
    chestR *= landmarks.radiusScale;
    waistR *= landmarks.radiusScale;
    hipR *= landmarks.radiusScale;
    shoulderHalf *= landmarks.radiusScale;
  }

  const span = shoulderY - hipY;
  const armLen = m.sleeve ? cm(m.sleeve) : H * (kid ? 0.40 : 0.44);
  const upperR = radiusFromCirc(bicepCm) * (female ? 0.92 : 1.0);
  const legLen = hipY;
  const thighR = radiusFromCirc(thighCm) * (female ? 1.0 : 0.98);

  return {
    female, kid, H, headH, neckTopY, shoulderY, hipY, span,
    chestR, waistR, hipR, shoulderHalf, neckR, armLen, upperR, legLen, thighR,
  };
}

export function createHumanSkinMaterial(THREE, category, customColor, lowPower = false) {
  const color = customColor != null ? customColor : (HUMAN_SKIN_PALETTE[category] || 0xdca98e);
  if (lowPower) {
    const mat = new THREE.MeshPhongMaterial({
      color,
      shininess: 18,
      specular: 0x221b17,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    mat.sheen = 0.0;
    return mat;
  }
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.52,
    metalness: 0.0,
    clearcoat: 0.07,
    clearcoatRoughness: 0.64,
    sheen: 0.0,
    transparent: false,
    opacity: 1.0,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

// Bone indices in the 17-bone humanoid skeleton:
export const BONE_IDX = {
  pelvis: 0,
  spine: 1,
  chest: 2,
  neck: 3,
  head: 4,
  armL: 5,      // +X side (s = +1)
  elbowL: 6,
  handL: 7,
  armR: 8,      // -X side (s = -1)
  elbowR: 9,
  handR: 10,
  legL: 11,     // +X side (s = +1)
  kneeL: 12,
  footL: 13,
  legR: 14,     // -X side (s = -1)
  kneeR: 15,
  footR: 16,
};

function createSkeletonRig(THREE, d) {
  const { hipY, shoulderY, neckTopY, headH, span, shoulderHalf, hipR, armLen, female } = d;
  const waistY = hipY + span * 0.44;
  const chestBoneY = hipY + span * 0.68;
  const neckBaseY = shoulderY + span * 0.02;
  const headCenterY = neckTopY + headH * 0.50;

  const shoulderPivotY = shoulderY - span * 0.035;
  const shoulderPivotX = shoulderHalf * 0.82;
  const upperArmLen = armLen * 0.48;
  const forearmLen = armLen * 0.46;

  const hipPivotY = hipY - span * 0.04;
  const hipPivotX = hipR * (female ? 0.45 : 0.47);
  const ankleY = Math.max(0.054, HFrac(d.H, 0.047));
  const totalLegSpan = Math.max(0.25, hipPivotY - ankleY);
  const thighLen = totalLegSpan * 0.53;
  const calfLen = totalLegSpan * 0.47;

  const bones = Array.from({ length: 17 });
  const mk = (idx, name, parent, x, y, z) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent) parent.add(b);
    bones[idx] = b;
    return b;
  };

  const pelvis = mk(BONE_IDX.pelvis, "pelvis", null, 0, hipY, 0);
  const spine = mk(BONE_IDX.spine, "spine", pelvis, 0, waistY - hipY, 0);
  const chest = mk(BONE_IDX.chest, "chest", spine, 0, chestBoneY - waistY, 0);
  const neck = mk(BONE_IDX.neck, "neck", chest, 0, neckBaseY - chestBoneY, 0);
  const head = mk(BONE_IDX.head, "head", neck, 0, headCenterY - neckBaseY, 0);

  // Left (+X, s = 1) and Right (-X, s = -1) arms
  const armL = mk(BONE_IDX.armL, "arm1", chest, shoulderPivotX, shoulderPivotY - chestBoneY, 0);
  const elbowL = mk(BONE_IDX.elbowL, "elbow1", armL, 0, -upperArmLen, 0);
  const handL = mk(BONE_IDX.handL, "hand1", elbowL, 0, -forearmLen, 0);

  const armR = mk(BONE_IDX.armR, "arm-1", chest, -shoulderPivotX, shoulderPivotY - chestBoneY, 0);
  const elbowR = mk(BONE_IDX.elbowR, "elbow-1", armR, 0, -upperArmLen, 0);
  const handR = mk(BONE_IDX.handR, "hand-1", elbowR, 0, -forearmLen, 0);

  // Left (+X, s = 1) and Right (-X, s = -1) legs
  const legL = mk(BONE_IDX.legL, "leg1", pelvis, hipPivotX, hipPivotY - hipY, 0);
  const kneeL = mk(BONE_IDX.kneeL, "knee1", legL, 0, -thighLen, 0);
  const footL = mk(BONE_IDX.footL, "foot1", kneeL, 0, -calfLen, 0);

  const legR = mk(BONE_IDX.legR, "leg-1", pelvis, -hipPivotX, hipPivotY - hipY, 0);
  const kneeR = mk(BONE_IDX.kneeR, "knee-1", legR, 0, -thighLen, 0);
  const footR = mk(BONE_IDX.footR, "foot-1", kneeR, 0, -calfLen, 0);

  pelvis.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const limbs = {
    pelvis,
    spine,
    chest,
    neck,
    head,
    arm1: armL,
    "arm-1": armR,
    elbow1: elbowL,
    "elbow-1": elbowR,
    hand1: handL,
    "hand-1": handR,
    leg1: legL,
    "leg-1": legR,
    knee1: kneeL,
    "knee-1": kneeR,
    foot1: footL,
    "foot-1": footR,
  };

  return {
    skeleton,
    bones,
    limbs,
    landmarks: {
      waistY,
      chestBoneY,
      neckBaseY,
      headCenterY,
      shoulderPivotY,
      shoulderPivotX,
      upperArmLen,
      forearmLen,
      hipPivotY,
      hipPivotX,
      ankleY,
      thighLen,
      calfLen,
      kneeY: hipPivotY - thighLen,
    },
  };
}

function HFrac(H, f) {
  return H * f;
}

function packWeights(entries) {
  const filtered = entries.filter((e) => e[1] > 1e-5).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!filtered.length) return [[0, 0, 0, 0], [1, 0, 0, 0]];
  let sum = 0;
  for (const e of filtered) sum += e[1];
  const idx = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  for (let i = 0; i < filtered.length; i++) {
    idx[i] = filtered[i][0];
    w[i] = filtered[i][1] / (sum || 1);
  }
  return [idx, w];
}

/**
 * Builds the unified, closed, 2-manifold human body BufferGeometry with smooth
 * Taubin relaxation at anatomical saddle transitions and 4-bone skin weights.
 */
export function buildWatertightBodyGeometry(THREE, category, d, rigLandmarks, opts = {}) {
  const {
    female, kid, H, headH, neckTopY, shoulderY, hipY, span,
    chestR, waistR, hipR, shoulderHalf, neckR, upperR, thighR,
  } = d;
  const lm = rigLandmarks;
  const zScale = female ? 0.72 : 0.78;
  const collisionSafe = Boolean(opts.collisionSafe);
  const bumpScale = collisionSafe ? 0.68 : 1.0;
  const radCap = collisionSafe ? 0.975 : 1.0;

  const positions = [];   // flat [x, y, z, ...]
  const smoothW = [];     // per-vertex Taubin smoothing weight [0..1]
  const floorLock = [];   // boolean: lock plantar sole y >= 0
  const skinIdx = [];     // flat [i0, i1, i2, i3, ...]
  const skinWgt = [];     // flat [w0, w1, w2, w3, ...]
  const indices = [];     // triangle indices

  function addVertex(x, y, z, sw, weights, lockFloor = false) {
    const id = positions.length / 3;
    positions.push(x, lockFloor ? Math.max(0, y) : y, z);
    smoothW.push(sw);
    floorLock.push(lockFloor);
    const [bi, bw] = packWeights(weights);
    skinIdx.push(bi[0], bi[1], bi[2], bi[3]);
    skinWgt.push(bw[0], bw[1], bw[2], bw[3]);
    return id;
  }

  function connectRings(lower, upper) {
    const n = lower.length;
    const half = n >> 1;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      const a0 = lower[k], a1 = lower[k1];
      const b0 = upper[k], b1 = upper[k1];
      if (k < half) {
        indices.push(a0, a1, b1);
        indices.push(a0, b1, b0);
      } else {
        indices.push(a0, a1, b0);
        indices.push(a1, b1, b0);
      }
    }
  }

  function capBottom(apex, ring) {
    const n = ring.length;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      indices.push(apex, ring[k1], ring[k]);
    }
  }

  function capTop(ring, apex) {
    const n = ring.length;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      indices.push(ring[k], ring[k1], apex);
    }
  }

  const N_LEG = 48;
  const N_TORSO = 48;
  const N_ARM = 28;

  // =========================================================================
  // 1. LEFT & RIGHT FEET -> ANKLES -> CALVES -> KNEES -> THIGHS (N = 48 each)
  // =========================================================================
  const footLen = clamp(H * (kid ? 0.148 : (female ? 0.142 : 0.150)), 0.17, 0.29);
  const footW = footLen * (female ? 0.37 : 0.39);
  const ankleY = lm.ankleY;
  const kneeY = lm.kneeY;
  const crotchMergeY = hipY - span * 0.106;
  const legTopY = hipY - span * 0.088;

  function legWeightsAtY(y, side) {
    const bHip = side > 0 ? BONE_IDX.legL : BONE_IDX.legR;
    const bKnee = side > 0 ? BONE_IDX.kneeL : BONE_IDX.kneeR;
    const bFoot = side > 0 ? BONE_IDX.footL : BONE_IDX.footR;

    if (y <= ankleY + 0.032) {
      const f = smoothstep(ankleY - 0.025, ankleY + 0.032, y);
      return [[bFoot, 1 - f], [bKnee, f]];
    }
    if (y <= kneeY + 0.065) {
      const f = smoothstep(kneeY - 0.065, kneeY + 0.065, y);
      return [[bKnee, 1 - f], [bHip, f]];
    }
    const pelvBlend = smoothstep(crotchMergeY - 0.04, hipY + 0.02, y) * 0.45;
    return [[bHip, 1 - pelvBlend], [BONE_IDX.pelvis, pelvBlend]];
  }

  function buildLegBranch(side) {
    // side = +1 (left, +X) or -1 (right, -X)
    const legX = side * lm.hipPivotX;
    const bFoot = side > 0 ? BONE_IDX.footL : BONE_IDX.footR;

    const toeTipZ = footLen * 0.66;
    const heelBackZ = -footLen * 0.31;

    // Closed toe cap apex
    const toeApex = addVertex(
      legX - side * footW * 0.06,
      0.011,
      toeTipZ,
      0.15,
      [[bFoot, 1]],
      true
    );

    // Monotonic anatomical foot-to-ankle cross-sections (seamless talocrural transition)
    const footSpecs = [
      // [yPlantar, yDorsal, zFront, zBack, rxMed, rxLat, sw, clampSole]
      [0.000, 0.023, toeTipZ * 0.92,  toeTipZ * 0.72,  footW * 0.43, footW * 0.37, 0.22, true],
      [0.000, 0.034, toeTipZ * 0.74,  toeTipZ * 0.42,  footW * 0.51, footW * 0.47, 0.25, true],
      [0.000, 0.052, toeTipZ * 0.46, -footLen * 0.14,  footW * 0.45, footW * 0.41, 0.30, true],
      [0.002, ankleY * 0.78, toeTipZ * 0.20, heelBackZ * 0.94, footW * 0.37, footW * 0.36, 0.42, true],
      [ankleY * 0.56, ankleY * 0.96, thighR * 0.39, -thighR * 0.44, thighR * 0.36, thighR * 0.35, 0.58, false],
    ];

    let prevRing = null;
    for (let sIdx = 0; sIdx < footSpecs.length; sIdx++) {
      const [yPlant, yDors, zFront, zBack, rxMed, rxLat, sw, clampSole] = footSpecs[sIdx];
      const ring = [];
      const cy = 0.5 * (yPlant + yDors);
      const ry = Math.max(0.009, 0.5 * (yDors - yPlant));
      const cz = 0.5 * (zFront + zBack);
      const rz = Math.max(0.012, 0.5 * (zFront - zBack));

      for (let k = 0; k < N_LEG; k++) {
        const phi = (2 * Math.PI * k) / N_LEG;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        const isMedial = sinP * side < 0;
        const rx = isMedial ? rxMed : rxLat;

        let archLift = 0;
        if (sIdx === 2 && cosP < -0.1 && isMedial) {
          archLift = 0.0055 * (-cosP) * Math.abs(sinP);
        }
        let halluxZ = 0;
        if (sIdx <= 1 && isMedial && cosP > 0) {
          halluxZ = footLen * 0.016 * cosP * Math.abs(sinP);
        }

        const x = legX + rx * sinP;
        const yAngle = sIdx <= 2 ? cosP : (cosP * (1 - (sIdx - 2) * 0.28));
        let y = cy + ry * yAngle + archLift;
        const z = cz + rz * cosP + halluxZ;
        const lock = clampSole && cosP < -0.20;
        if (lock && y < 0) y = 0;

        ring.push(addVertex(x, y, z, sw, legWeightsAtY(y, side), lock));
      }
      if (!prevRing) capBottom(toeApex, ring);
      else connectRings(prevRing, ring);
      prevRing = ring;
    }

    // Vertical anatomical leg sections with 3 knee loops and diagonal inguinal hip blend
    const legSpan = legTopY - ankleY;
    const kneeFrac = clamp((kneeY - ankleY) / legSpan, 0.44, 0.56);

    const pelvicOuterAtMerge = hipR * (female ? 0.99 : 0.96);

    const legFracs = [
      0.00,             // malleoli ankle
      0.08,             // Achilles tendon narrowest waist
      0.20,             // soleus lower calf transition
      0.33,             // gastrocnemius calf belly peak
      0.43,             // upper calf taper
      kneeFrac - 0.04,  // infrapatellar knee loop
      kneeFrac,         // patella / popliteal knee center
      kneeFrac + 0.04,  // suprapatellar knee loop
      kneeFrac + 0.13,  // vastus medialis teardrop
      kneeFrac + 0.26,  // mid quadriceps
      0.80,             // upper quadriceps / hamstrings
      0.88,             // sub-gluteal / upper adductor transition
      0.945,            // inguinal ramp blend
      1.00,             // groin cobordism merge ring
    ];

    for (let i = 0; i < legFracs.length; i++) {
      const f = legFracs[i];
      const y = ankleY + legSpan * f;
      const ring = [];

      let baseR;
      if (f <= 0.08) {
        const u = f / 0.08;
        baseR = thighR * (0.378 * (1 - u) + 0.354 * u);
      } else if (f <= 0.33) {
        const u = smoothstep(0.08, 0.33, f);
        const calfPeak = female ? 0.66 : (kid ? 0.63 : 0.69);
        baseR = thighR * (0.354 * (1 - u) + calfPeak * u);
      } else if (f <= kneeFrac) {
        const u = smoothstep(0.33, kneeFrac, f);
        const calfPeak = female ? 0.66 : (kid ? 0.63 : 0.69);
        baseR = thighR * (calfPeak * (1 - u) + 0.59 * u);
      } else {
        const u = smoothstep(kneeFrac, 1.0, f);
        baseR = thighR * (0.59 * (1 - u) + 0.95 * u);
      }

      const topInward = smoothstep(0.68, 1.0, f);
      const stanceOffset = side * smoothstep(0.0, 0.26, f) * (1 - f) * (-hipR * 0.018);
      const cx = legX * (1 - 0.18 * topInward) + stanceOffset;
      const cz = -thighR * 0.024 * (1 - smoothstep(0.0, 0.14, f)) - 0.005 * Math.sin(Math.PI * clamp(f / kneeFrac, 0, 1));

      const outerReachAtTop = Math.max(thighR * 0.88, pelvicOuterAtMerge - Math.abs(cx));
      const innerReachAtTop = Math.max(thighR * 0.56, Math.abs(cx) - 0.0028);

      const topBlend = smoothstep(0.66, 1.0, f);
      const calfWindow = bumpWindow(f, 0.33, 0.16);
      const ankleWindow = bumpWindow(f, 0.01, 0.045);
      const kneeWindow = bumpWindow(f, kneeFrac, 0.065);
      const quadWindow = bumpWindow(f, kneeFrac + 0.24, 0.22);

      for (let k = 0; k < N_LEG; k++) {
        const phi = (2 * Math.PI * k) / N_LEG;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        const isMedial = sinP * side < 0;

        let rx = baseR * 0.96;
        let rz = baseR * 1.02;

        const malYShift = ankleWindow * (isMedial ? 0.004 : -0.003) * Math.abs(sinP);
        rx += thighR * 0.036 * ankleWindow * Math.abs(sinP);

        if (cosP < 0) {
          rz += thighR * 0.105 * calfWindow * (-cosP) * (isMedial ? 1.08 : 0.96);
        } else {
          rz -= thighR * 0.030 * calfWindow * cosP;
        }

        if (cosP > 0.25) {
          rz += thighR * 0.034 * kneeWindow * bumpWindow(phi, 0, 0.58);
        } else if (cosP < -0.25) {
          rz -= thighR * 0.020 * kneeWindow * (-cosP);
        }

        if (cosP > 0) {
          rz += thighR * 0.058 * quadWindow * cosP;
        } else {
          rz += thighR * 0.048 * smoothstep(0.62, 1.0, f) * (-cosP);
        }

        const targetRx = isMedial ? innerReachAtTop : outerReachAtTop;
        const targetRz = hipR * zScale * (cosP >= 0 ? 0.92 : 1.01);
        rx = rx * (1 - topBlend) + targetRx * topBlend;
        rz = rz * (1 - topBlend) + targetRz * topBlend;

        const x = cx + rx * sinP;
        const topArchBlend = smoothstep(0.76, 1.0, f);
        const inguinalSlopeY = isMedial
          ? (-span * 0.011 * (1 - 0.45 * Math.max(0, cosP))) * Math.pow(Math.abs(sinP), 1.2) * topArchBlend
          : (span * 0.014 * Math.pow(Math.abs(sinP), 1.15)) * topArchBlend;
        const yVert = y + inguinalSlopeY + malYShift;
        const z = cz + rz * cosP + (i >= legFracs.length - 3
          ? (female ? torsoZBump(yVert, phi, d) : maleTorsoZBump(yVert, phi, d)) * smoothstep(0.78, 1.0, f) * 0.58 * bumpScale
          : 0);

        const sw = i <= 1 ? 0.60 : (i >= legFracs.length - 4 ? 0.94 : 0.24);
        ring.push(addVertex(x, yVert, z, sw, legWeightsAtY(yVert, side), false));
      }

      connectRings(prevRing, ring);
      prevRing = ring;
    }

    return prevRing; // 48-vertex top thigh ring
  }

  const topLegL = buildLegBranch(1);   // +X
  const topLegR = buildLegBranch(-1);  // -X

  // =========================================================================
  // 2. PELVIS & TORSO RINGS + GROIN PANTS-COBORDISM (N = 48)
  // =========================================================================
  function torsoWeightsAtY(y, x) {
    const waistY = lm.waistY;
    const chestY = lm.chestBoneY;
    const neckY = lm.neckBaseY;

    if (y < hipY + span * 0.16) {
      const fSpine = smoothstep(hipY + span * 0.02, hipY + span * 0.28, y);
      const latFrac = clamp(Math.abs(x) / (hipR || 0.15), 0, 1) * (1 - smoothstep(hipY - span * 0.12, hipY + span * 0.06, y)) * 0.28;
      const leftRatio = smoothstep(-0.04, 0.04, x);
      return [
        [BONE_IDX.pelvis, (1 - fSpine) * (1 - latFrac)],
        [BONE_IDX.spine, fSpine * (1 - latFrac)],
        [BONE_IDX.legL, latFrac * leftRatio],
        [BONE_IDX.legR, latFrac * (1 - leftRatio)],
      ];
    }
    if (y < chestY) {
      const fSpine = smoothstep(hipY + span * 0.06, waistY + span * 0.04, y);
      const fChest = smoothstep(waistY - span * 0.04, chestY + span * 0.05, y);
      const wPelvis = Math.max(0, 1 - fSpine);
      const wChest = fChest;
      const wSpine = Math.max(0, 1 - wPelvis - wChest);
      return [[BONE_IDX.pelvis, wPelvis], [BONE_IDX.spine, wSpine], [BONE_IDX.chest, wChest]];
    }
    const fNeck = smoothstep(shoulderY - span * 0.02, neckY + 0.02, y) * 0.25;
    return [[BONE_IDX.chest, 1 - fNeck], [BONE_IDX.neck, fNeck]];
  }

  // Coaxial axillary fossa & V-tapered pectoral/latissimus upper torso eliminate T-bar shelves and armpit caves
  const axillaRibRx = Math.max(chestR * (female ? 0.94 : 0.99), lm.shoulderPivotX - upperR * 0.80);
  const upperRibRx = Math.max(chestR * (female ? 0.96 : 1.02), lm.shoulderPivotX - upperR * 0.66);

  // Denser pelvic & thoracic slices eliminate gluteal side-profile spikes and origami shoulder steps
  const torsoSlices = [
    // [y, rx, rzBase, sw]
    [hipY - span * 0.068, hipR * 0.985, hipR * 0.94, 0.96],  // T0: pelvic base (diagonal inguinal merge)
    [hipY - span * 0.042, hipR * 1.005, hipR * 0.98, 0.78],  // lower gluteal round
    [hipY - span * 0.014, hipR * 1.015, hipR * 0.99, 0.56],  // trochanter / gluteal fullness
    [hipY + span * 0.030, hipR * 1.005, hipR * 0.98, 0.38],  // upper glute / sacrum
    [hipY + span * 0.085, hipR * 0.985, hipR * 0.96, 0.28],  // iliac crest
    [hipY + span * 0.19,  hipR * 0.91 + waistR * 0.09, hipR * 0.90 + waistR * 0.10, 0.24],
    [hipY + span * 0.32,  hipR * 0.42 + waistR * 0.58, hipR * 0.44 + waistR * 0.56, 0.22],
    [hipY + span * 0.44,  waistR * 1.00, waistR * 0.98, 0.20], // natural waist anchor
    [hipY + span * 0.55,  waistR * 0.60 + chestR * 0.42, waistR * 0.63 + chestR * 0.39, 0.22], // lower ribcage
    [hipY + span * 0.65,  chestR * (female ? 0.97 : 1.01), chestR * 0.96, 0.24], // underbust / lower pecs
    [hipY + span * 0.73,  chestR * (female ? 1.01 : 1.06), chestR * (female ? 1.00 : 1.02), 0.28], // bust / chest apex
    [hipY + span * 0.81,  chestR * (female ? 1.00 : 1.07), chestR * 0.95, 0.44], // upper chest / lat V-taper
    [hipY + span * 0.88,  upperRibRx, chestR * 0.90, 0.68], // deltopectoral & teres flare
    [shoulderY - span * 0.046, axillaRibRx, chestR * 0.84, 0.88], // smooth axillary & deltopectoral dome
  ];

  const medAxillaIndent = Math.min(
    upperR * 0.60,
    Math.max(upperR * 0.26, lm.shoulderPivotX - chestR * (female ? 0.90 : 0.94))
  ) * radCap;
  const shoulderSeamRx = lm.shoulderPivotX * radCap - medAxillaIndent * 0.36;

  function buildTorsoRing(y, rx, rzBase, sw, isTopAxilla = false, isPelvisBase = false) {
    const ring = [];
    const upperVBlend = smoothstep(hipY + span * 0.76, hipY + span * 0.90, y) * (isTopAxilla ? 0 : 1);
    for (let k = 0; k < N_TORSO; k++) {
      const phi = (2 * Math.PI * k) / N_TORSO;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const absSin = Math.abs(sinP);

      let x = rx * radCap * sinP;
      let z = rzBase * radCap * zScale * cosP;

      z += (female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d)) * bumpScale;

      if (cosP < -0.7 && y > hipY + span * 0.12 && y < shoulderY - span * 0.04) {
        const furrow = bumpWindow(phi - Math.PI, 0, 0.16) + bumpWindow(phi + Math.PI, 0, 0.16);
        z += 0.0042 * furrow * bumpWindow(y, hipY + span * 0.52, span * 0.38);
      }

      if (cosP > 0.4 && y > hipY + span * 0.80) {
        const clavLobe = bumpWindow(phi, 0.45, 0.36) + bumpWindow(phi, -0.45, 0.36);
        z += 0.0036 * clavLobe * smoothstep(hipY + span * 0.78, shoulderY, y);
      }

      if (upperVBlend > 0.001) {
        const pecLatTargetX = shoulderSeamRx;
        const foldBell = 1 - Math.pow(absSin, 3.0);
        const vRx = rx * radCap + (pecLatTargetX - rx * radCap) * 0.52 * upperVBlend * foldBell;
        x = vRx * sinP;
      }

      let yLocal = y;
      const axillaBlend = isTopAxilla ? 1.0 : smoothstep(hipY + span * 0.84, hipY + span * 0.92, y) * 0.42;
      if (axillaBlend > 0.001) {
        // Monotonic, pinch-free deltopectoral & axillary contour:
        // kSym=0..5 sweeps sternum -> deltopectoral seamRx without lateral overshoot;
        // kSym=5..19 forms a gentle axillary hollow; kSym=19..24 sweeps teres -> spine.
        const kSym = k <= 24 ? k : 48 - k;
        const sideSign = (k === 0 || k === 24) ? 0 : (k < 24 ? 1 : -1);
        const zArm = upperR * 0.98 * radCap;
        let xAx, zAx, yAx;
        if (kSym <= 5) {
          const uChest = kSym / 5;
          xAx = sideSign * shoulderSeamRx * Math.sin((Math.PI * 0.5) * uChest);
          const blendZ = smoothstep(0.0, 1.0, uChest);
          zAx = z * (1 - blendZ) + zArm * blendZ;
          yAx = y + span * 0.020 * (1 - 0.65 * uChest);
        } else if (kSym >= 19) {
          const uBack = (24 - kSym) / 5;
          xAx = sideSign * shoulderSeamRx * Math.sin((Math.PI * 0.5) * uBack);
          const blendZ = smoothstep(0.0, 1.0, uBack);
          zAx = z * (1 - blendZ) - zArm * blendZ;
          yAx = y + span * 0.020 * (1 - 0.65 * uBack);
        } else {
          const thetaArm = (Math.PI * (kSym - 5)) / 14;
          const sinArm = Math.sin(thetaArm);
          const cosArm = Math.cos(thetaArm);
          xAx = sideSign * (shoulderSeamRx - medAxillaIndent * 0.54 * sinArm);
          zAx = zArm * cosArm;
          yAx = y + span * 0.007 * (1 - sinArm) - span * 0.006 * sinArm;
        }
        x = x * (1 - axillaBlend) + xAx * axillaBlend;
        z = z * (1 - axillaBlend) + zAx * axillaBlend;
        yLocal = y * (1 - axillaBlend) + yAx * axillaBlend;
      } else if (isPelvisBase) {
        // Diagonal human inguinal ramp: dips softly at pubic/perineal midline, rises over outer trochanter
        const frontCenter = Math.max(0, cosP) * Math.pow(1 - absSin, 1.35);
        z *= 1 - 0.11 * frontCenter;
        yLocal = y - span * 0.011 * Math.pow(1 - absSin, 1.3) + span * 0.012 * Math.pow(absSin, 1.2);
      }

      ring.push(addVertex(x, yLocal, z, sw, torsoWeightsAtY(yLocal, x), false));
    }
    return ring;
  }

  const pelvisRing = buildTorsoRing(
    torsoSlices[0][0],
    torsoSlices[0][1],
    torsoSlices[0][2],
    torsoSlices[0][3],
    false,
    true
  );

  // Build 23-vertex Sagittal Groin / Perineal / Intergluteal Saddle Chain M_1..M_23
  const p0Idx = pelvisRing[0];
  const pBackIdx = pelvisRing[24];
  const p0Z = positions[p0Idx * 3 + 2];
  const p0Y = positions[p0Idx * 3 + 1];
  const pBackZ = positions[pBackIdx * 3 + 2];
  const pBackY = positions[pBackIdx * 3 + 1];
  const crotchArchY = legTopY - span * 0.006;

  const groinMid = [];
  for (let j = 1; j <= 23; j++) {
    const u = j / 24;
    const z = p0Z * (1 - u) + pBackZ * u;
    const endY = p0Y * (1 - u) + pBackY * u;
    const archDip = Math.pow(Math.sin(Math.PI * u), 0.85);
    const y = endY * (1 - archDip) + crotchArchY * archDip;
    groinMid.push(addVertex(0, y, z, 0.96, [[BONE_IDX.pelvis, 1]], false));
  }

  const upperLegL = [
    pelvisRing[0],
    ...pelvisRing.slice(1, 24),
    pelvisRing[24],
    ...[...groinMid].reverse(),
  ];
  const upperLegR = [
    pelvisRing[0],
    ...groinMid,
    pelvisRing[24],
    ...pelvisRing.slice(25, 48),
  ];

  connectRings(topLegL, upperLegL);
  connectRings(topLegR, upperLegR);

  let prevTorsoRing = pelvisRing;
  for (let i = 1; i < torsoSlices.length; i++) {
    const [y, rx, rzBase, sw] = torsoSlices[i];
    const nextRing = buildTorsoRing(y, rx, rzBase, sw, i === torsoSlices.length - 1, false);
    connectRings(prevTorsoRing, nextRing);
    prevTorsoRing = nextRing;
  }
  const axillaRing = prevTorsoRing; // 48 vertices

  // =========================================================================
  // 3. SHOULDER TRIFURCATION COBORDISM -> NECK (48) + LEFT ARM (28) + RIGHT ARM (28)
  // =========================================================================
  function buildShoulderSaddle(frontIdx, backIdx, side) {
    const fy = positions[frontIdx * 3 + 1];
    const by = positions[backIdx * 3 + 1];
    const bArm = side > 0 ? BONE_IDX.armL : BONE_IDX.armR;
    // Rounded human acromion-to-deltoid cap curving seamlessly from shoulderSeamRx into lateral deltoid
    const outerAcromionX = (lm.shoulderPivotX + upperR * 0.78) * radCap;
    const zArm = upperR * 0.98 * radCap;
    const acromionTargetY = shoulderY - span * 0.014;
    const saddle = [];
    for (let j = 1; j <= 13; j++) {
      const u = j / 14; // 0 = front seam, 0.5 = lateral acromion dome, 1 = back seam
      const sinU = Math.sin(Math.PI * u);
      const cosU = Math.cos(Math.PI * u);
      const x = side * (shoulderSeamRx + (outerAcromionX - shoulderSeamRx) * Math.pow(sinU, 0.82));
      const baseLineY = fy * (1 - u) + by * u;
      const y = baseLineY * (1 - sinU) + acromionTargetY * sinU;
      const z = zArm * cosU;
      saddle.push(addVertex(x, y, z, 0.86, [[BONE_IDX.chest, 0.52], [bArm, 0.42], [BONE_IDX.neck, 0.06]], false));
    }
    return saddle;
  }

  const saddleL = buildShoulderSaddle(axillaRing[5], axillaRing[19], 1);
  const saddleR = buildShoulderSaddle(axillaRing[43], axillaRing[29], -1);

  // 28-vertex Left Arm Base Ring: [axillaRing[5..19] (15), SL_13..SL_1 (13)]
  const armBaseL = [
    ...axillaRing.slice(5, 20),
    ...[...saddleL].reverse(),
  ];
  // 28-vertex Right Arm Base Ring: [axillaRing[29..43] (15), SR_1..SR_13 (13)]
  const armBaseR = [
    ...axillaRing.slice(29, 44),
    ...saddleR,
  ];
  // 48-vertex Neck Base Ring: 6 + 13 + 11 + 13 + 5 = 48 vertices
  const neckBaseRing = [
    ...axillaRing.slice(0, 6),
    ...saddleL,
    ...axillaRing.slice(19, 30),
    ...[...saddleR].reverse(),
    ...axillaRing.slice(43, 48),
  ];

  // =========================================================================
  // 4. ARMS, FOREARMS & CONTOURED HUMAN HANDS (N = 28 per arm)
  // =========================================================================
  function armWeightsAtOffset(dyDown, side) {
    const bArm = side > 0 ? BONE_IDX.armL : BONE_IDX.armR;
    const bElbow = side > 0 ? BONE_IDX.elbowL : BONE_IDX.elbowR;
    const bHand = side > 0 ? BONE_IDX.handL : BONE_IDX.handR;
    const upperLen = lm.upperArmLen;
    const foreLen = lm.forearmLen;

    if (dyDown < 0.048) {
      const f = smoothstep(-0.035, 0.048, dyDown);
      return [[BONE_IDX.chest, 1 - f], [bArm, f]];
    }
    if (dyDown < upperLen + 0.042) {
      const f = smoothstep(upperLen - 0.042, upperLen + 0.042, dyDown);
      return [[bArm, 1 - f], [bElbow, f]];
    }
    const wristDist = upperLen + foreLen;
    const fHand = smoothstep(wristDist - 0.025, wristDist + 0.020, dyDown);
    return [[bElbow, 1 - fHand], [bHand, fHand]];
  }

  function buildArmAndHandBranch(baseRing, side) {
    const sx = side * lm.shoulderPivotX;
    const sy = lm.shoulderPivotY;
    const upperLen = lm.upperArmLen;
    const foreLen = lm.forearmLen;
    const wristDist = upperLen + foreLen;
    const wristR = upperR * (female ? 0.34 : 0.36);
    const palmLen = wristR * 2.15;
    const fingerLen = wristR * 2.65;

    // Strictly convex lateral deltoid contour expanding smoothly from sloped acromion -> deltoid belly -> 3 elbow loops
    const armStops = [
      // [dyDown, rMedLat, rAntPost, xShiftOut, zShift, sw, tiltScale]
      [0.016, upperR * 0.90, upperR * 1.00, side * upperR * 0.025, 0.001, 0.86, 0.30],         // proximal deltoid cap blend
      [upperLen * 0.13, upperR * 0.96, upperR * 1.01, side * upperR * 0.03, 0.001, 0.62, 0.14], // lateral deltoid roundness
      [upperLen * 0.26, upperR * 0.95, upperR * 0.99, side * upperR * 0.02, 0.001, 0.40, 0.07], // deltoid tuberosity
      [upperLen * 0.50, upperR * 0.90, upperR * 0.96, side * upperR * 0.015, 0.002, 0.24, 0.0], // bicep / tricep belly
      [upperLen * 0.78, upperR * 0.80, upperR * 0.82, side * upperR * 0.01, 0.001, 0.22, 0.0], // distal brachium
      [upperLen * 0.93, upperR * 0.74, upperR * 0.73, 0.0, -0.001, 0.25, 0.0],             // supracondylar elbow loop
      [upperLen,        upperR * 0.71, upperR * 0.70, 0.0, -0.002, 0.26, 0.0],             // elbow joint center
      [upperLen + foreLen * 0.08, upperR * 0.73, upperR * 0.74, 0.0, 0.001, 0.25, 0.0],    // proximal forearm loop
      [upperLen + foreLen * 0.22, upperR * 0.75, upperR * 0.77, 0.0, 0.002, 0.22, 0.0],    // brachioradialis swell
      [upperLen + foreLen * 0.50, upperR * 0.60, upperR * 0.64, 0.0, 0.002, 0.20, 0.0],    // mid forearm
      [upperLen + foreLen * 0.80, upperR * 0.45, upperR * 0.50, 0.0, 0.001, 0.20, 0.0],    // distal forearm
      [wristDist,                 wristR * 0.80, wristR * 1.14, 0.0, 0.0, 0.30, 0.0],      // oval carpal wrist
      [wristDist + palmLen * 0.48, wristR * 0.64, wristR * 1.40, -side * wristR * 0.06, wristR * 0.12, 0.45, 0.0], // palm + thenar swell
      [wristDist + palmLen * 0.92, wristR * 0.54, wristR * 1.36, -side * wristR * 0.12, wristR * 0.04, 0.65, 0.0], // metacarpal web split
    ];

    let prev = baseRing;
    for (let sIdx = 0; sIdx < armStops.length; sIdx++) {
      const [dy, rML, rAP, xOff, zOff, sw, tiltScale] = armStops[sIdx];
      const ring = [];
      for (let k = 0; k < N_ARM; k++) {
        const theta = (2 * Math.PI * k) / N_ARM;
        const zDir = side > 0 ? Math.cos(theta) : -Math.cos(theta);
        const xDir = side > 0 ? -Math.sin(theta) : Math.sin(theta);

        let rx = rML;
        let rz = rAP;
        // Proximal pectoral-deltoid anterior/posterior bridge eliminates under-shoulder Z step
        if (sIdx <= 1 && Math.abs(xDir) < 0.65) {
          rz *= 1 + (sIdx === 0 ? 0.14 : 0.06) * (1 - Math.abs(xDir) / 0.65);
        }
        // Olecranon bony contour at back of elbow
        if (sIdx === 6 && zDir < -0.5) rz *= 1.07;
        // Bicep anterior fullness
        if (sIdx === 3 && zDir > 0.3) rz *= (female ? 1.03 : 1.07);
        // Thenar eminence fullness on thumb side of palm
        if (sIdx >= 12 && zDir > 0.2 && xDir * side < 0) {
          rx *= 1.14;
          rz *= 1.08;
        }

        const latSign = xDir * side; // +1 at lateral deltoid, -1 at medial axilla
        const capTiltY = tiltScale > 0
          ? tiltScale * (latSign >= 0 ? upperR * 0.26 * latSign : upperR * 0.04 * latSign)
          : 0;

        const x = sx + xOff + rx * xDir;
        const y = sy - dy + capTiltY;
        const z = zOff + rz * zDir;
        ring.push(addVertex(x, y, z, sw, armWeightsAtOffset(dy, side), false));
      }
      connectRings(prev, ring);
      prev = ring;
    }

    const palmSplitRing = prev; // 28 vertices
    const bHand = side > 0 ? BONE_IDX.handL : BONE_IDX.handR;
    const handWeights = [[bHand, 1]];

    // Thumb-web cobordism on 28-vertex palmSplitRing:
    // Left (+1): thumb centered at k=0 -> [26,27,0,1,2] + 3 webVerts = 8; fingers = [2..26] (25) + 3 webVerts = 28
    // Right (-1): thumb centered at k=14 -> [12,13,14,15,16] + 3 webVerts = 8; fingers = [16..27, 0..12] (25) + 3 webVerts = 28
    const webStartIdx = side > 0 ? 2 : 16;
    const webEndIdx = side > 0 ? 26 : 12;
    const wsX = positions[palmSplitRing[webStartIdx] * 3];
    const wsY = positions[palmSplitRing[webStartIdx] * 3 + 1];
    const wsZ = positions[palmSplitRing[webStartIdx] * 3 + 2];
    const weX = positions[palmSplitRing[webEndIdx] * 3];
    const weY = positions[palmSplitRing[webEndIdx] * 3 + 1];
    const weZ = positions[palmSplitRing[webEndIdx] * 3 + 2];

    const webVerts = [];
    for (let j = 1; j <= 3; j++) {
      const u = j / 4;
      const arch = Math.sin(Math.PI * u);
      webVerts.push(addVertex(
        wsX * (1 - u) + weX * u,
        (wsY * (1 - u) + weY * u) - wristR * 0.16 * arch,
        (wsZ * (1 - u) + weZ * u) - wristR * 0.10 * arch,
        0.80,
        handWeights,
        false
      ));
    }

    let thumbBase, fingersBase;
    if (side > 0) {
      thumbBase = [
        palmSplitRing[26], palmSplitRing[27], palmSplitRing[0], palmSplitRing[1], palmSplitRing[2],
        ...webVerts,
      ]; // 8 vertices
      fingersBase = [
        ...palmSplitRing.slice(2, 27),
        ...[...webVerts].reverse(),
      ]; // 28 vertices
    } else {
      thumbBase = [
        palmSplitRing[12], palmSplitRing[13], palmSplitRing[14], palmSplitRing[15], palmSplitRing[16],
        ...webVerts,
      ]; // 8 vertices
      fingersBase = [
        ...palmSplitRing.slice(16, 28),
        ...palmSplitRing.slice(0, 13),
        ...[...webVerts].reverse(),
      ]; // 28 vertices
    }

    let tPrev = thumbBase;
    let tcx = 0, tcy = 0, tcz = 0;
    for (const vid of thumbBase) {
      tcx += positions[vid * 3];
      tcy += positions[vid * 3 + 1];
      tcz += positions[vid * 3 + 2];
    }
    tcx /= 8; tcy /= 8; tcz /= 8;

    const thumbLen = wristR * 1.52;
    for (const [f, radScale] of [[0.48, 0.78], [0.88, 0.56]]) {
      const tRing = [];
      const cx = tcx - side * wristR * 0.15 * f;
      const cy = tcy - thumbLen * f;
      const cz = tcz + wristR * 0.56 * f;
      for (let k = 0; k < 8; k++) {
        const vx = positions[thumbBase[k] * 3] - tcx;
        const vz = positions[thumbBase[k] * 3 + 2] - tcz;
        tRing.push(addVertex(
          cx + vx * radScale,
          cy,
          cz + vz * radScale,
          0.32,
          handWeights,
          false
        ));
      }
      connectRings(tPrev, tRing);
      tPrev = tRing;
    }
    const thumbTip = addVertex(
      tcx - side * wristR * 0.19,
      tcy - thumbLen * 1.06,
      tcz + wristR * 0.65,
      0.28,
      handWeights,
      false
    );
    capTop(tPrev, thumbTip);

    let fcx = 0, fcy = 0, fcz = 0;
    for (const vid of fingersBase) {
      fcx += positions[vid * 3];
      fcy += positions[vid * 3 + 1];
      fcz += positions[vid * 3 + 2];
    }
    fcx /= 28; fcy /= 28; fcz /= 28;

    let fPrev = fingersBase;
    const fingerStops = [
      [0.34, 0.91, 0.84, -side * wristR * 0.10],
      [0.68, 0.79, 0.66, -side * wristR * 0.24],
      [0.93, 0.56, 0.46, -side * wristR * 0.36],
    ];
    for (const [f, zScaleF, xScaleF, curlX] of fingerStops) {
      const fRing = [];
      const cy = fcy - fingerLen * f;
      const cx = fcx + curlX;
      const cz = fcz - wristR * 0.08 * f;
      for (let k = 0; k < 28; k++) {
        const dx0 = positions[fingersBase[k] * 3] - fcx;
        const dz0 = positions[fingersBase[k] * 3 + 2] - fcz;
        // Distinct 4-finger interdigital fluting along dorsal & palmar surfaces
        const flute = 1 - 0.11 * Math.cos((dz0 / (wristR * 1.22 || 0.02)) * Math.PI * 3.5);
        const archLen = (1 - Math.pow(clamp(dz0 / (wristR * 1.32 || 0.02), -1, 1), 2)) * fingerLen * 0.12 * f;
        fRing.push(addVertex(
          cx + dx0 * xScaleF * flute,
          cy - archLen,
          cz + dz0 * zScaleF,
          0.22,
          handWeights,
          false
        ));
      }
      connectRings(fPrev, fRing);
      fPrev = fRing;
    }
    const fingerTip = addVertex(
      fcx - side * wristR * 0.42,
      fcy - fingerLen * 1.07,
      fcz - wristR * 0.06,
      0.22,
      handWeights,
      false
    );
    capTop(fPrev, fingerTip);
  }

  buildArmAndHandBranch(armBaseL, 1);
  buildArmAndHandBranch(armBaseR, -1);

  // =========================================================================
  // 5. NECK -> SUBMENTAL TUCK -> SCULPTED HUMAN JAW, FACE, EARS & CRANIUM (N = 48)
  // =========================================================================
  const neckSpan = Math.max(0.04, neckTopY - shoulderY);
  const headCenterY = neckTopY + headH * 0.50;

  // Smooth equilateral anterior azimuth (d(phi)/d(theta) >= 0.74 -> zero sliver triangles & zero x=0 normal crease!)
  function headAzimuth(k, frontFocus) {
    const wrapped = k <= 24 ? k : k - 48; // (-24 .. +24]
    const theta = (2 * Math.PI * wrapped) / 48;
    return theta - frontFocus * 0.26 * Math.sin(theta);
  }

  function superGauss(x, center, halfW, power = 2.4) {
    const u = Math.abs(x - center) / (halfW || 1e-4);
    return u >= 3.2 ? 0 : Math.exp(-Math.pow(u, power));
  }

  const neckSpecs = [
    // [ny, nrx, nrz, zShift, sw, focus]
    [shoulderY + neckSpan * 0.44, neckR * 1.05, neckR * 1.04, 0.002, 0.42, 0.25],
    [shoulderY + neckSpan * 0.68, neckR * 0.94, neckR * 0.97, 0.004, 0.30, 0.55],
    [shoulderY + neckSpan * 0.90, neckR * 0.89, neckR * 0.93, 0.006, 0.20, 0.82],
  ];

  // Two naturally sloped trapezius / supraclavicular rings rise ~15-18 deg from sloped acromion up to side of neck!
  let prevHeadRing = neckBaseRing;
  for (const [trapFrac, yLiftFrac, swTrap] of [[0.36, 0.16, 0.46], [0.70, 0.31, 0.44]]) {
    const tRing = [];
    const targetNy = shoulderY + neckSpan * yLiftFrac;
    for (let k = 0; k < 48; k++) {
      const baseVid = neckBaseRing[k] * 3;
      const bx0 = positions[baseVid], by0 = positions[baseVid + 1], bz0 = positions[baseVid + 2];
      const phi = headAzimuth(k, 0.14 * trapFrac);
      const tx = neckR * 1.10 * Math.sin(phi);
      const tz = 0.002 + neckR * 1.06 * Math.cos(phi);
      const x = bx0 * (1 - trapFrac) + tx * trapFrac;
      // Natural slightly concave human trapezius slope from acromion up to side of neck
      const trapArch = Math.pow(trapFrac, 0.92);
      const y = by0 * (1 - trapArch) + targetNy * trapArch;
      const z = bz0 * (1 - trapFrac) + tz * trapFrac;
      const bArm = x >= 0 ? BONE_IDX.armL : BONE_IDX.armR;
      const latRatio = clamp((Math.abs(x) - neckR * 1.15) / Math.max(0.04, shoulderHalf * 0.8), 0, 1);
      const weights = [
        [BONE_IDX.chest, 0.72 - 0.18 * trapFrac],
        [BONE_IDX.neck, 0.28 * trapFrac],
        [bArm, 0.22 * latRatio * (1 - trapFrac)],
      ];
      tRing.push(addVertex(x, y, z, swTrap, weights, false));
    }
    connectRings(prevHeadRing, tRing);
    prevHeadRing = tRing;
  }

  for (const [ny, nrx, nrz, zShift, sw, focus] of neckSpecs) {
    const ring = [];
    const fHead = smoothstep(shoulderY + neckSpan * 0.65, neckTopY + headH * 0.10, ny);
    const fNeck = smoothstep(shoulderY - 0.02, shoulderY + neckSpan * 0.35, ny);
    const wChest = Math.max(0, 1 - fNeck) * 0.35;
    const wHead = fHead * 0.35;
    const wNeck = Math.max(0, 1 - wChest - wHead);
    const weights = [[BONE_IDX.neck, wNeck], [BONE_IDX.chest, wChest], [BONE_IDX.head, wHead]];

    for (let k = 0; k < 48; k++) {
      const phi = headAzimuth(k, focus);
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const scm = 1 + 0.020 * (bumpWindow(phi, 0.65, 0.35) + bumpWindow(phi, -0.65, 0.35));
      ring.push(addVertex(
        nrx * sinP * scm,
        ny,
        zShift + nrz * cosP,
        sw,
        weights,
        false
      ));
    }
    connectRings(prevHeadRing, ring);
    prevHeadRing = ring;
  }

  // Authentic Classical Human Craniofacial Profile (Loomis / Bammes canon):
  // Flat-bottomed central chin pad (|phi| < 0.32) transitions into a diagonal mandibular
  // border rising to gonial jaw corner (-0.27) and occipital skull base (-0.13).
  const headWidthScale = kid ? 0.82 : (female ? 0.78 : 0.81);
  const headDepthScale = 0.92;
  const neckRxFrac = clamp((neckR * 0.89) / headH, 0.175, 0.235);
  const neckRzFrac = clamp((neckR * 0.93) / headH, 0.185, 0.245);

  const headSlices = [
    // [yFrac, craniumFrac, sw]
    [-0.485, 0.370, 0.16], // upper throat / hyoid junction
    [-0.445, 0.382, 0.12], // smooth submental transition
    [-0.405, 0.390, 0.10], // chin (menton) rounded pad
    [-0.348, 0.396, 0.09], // mentolabial hollow & anterior jaw taper
    [-0.285, 0.400, 0.09], // lower lip cushion & gonial mandibular angle
    [-0.238, 0.403, 0.08], // oral rima / mouth corners
    [-0.196, 0.405, 0.08], // upper lip Cupid's bow & philtrum
    [-0.158, 0.407, 0.08], // subnasale / columella septum beneath nose
    [-0.125, 0.409, 0.08], // pronasale rounded nasal tip & nostril alae
    [-0.075, 0.411, 0.08], // mid nasal dorsum & malar cheeks
    [-0.020, 0.412, 0.08], // upper nasal bridge & infraorbital rim
    [0.036,  0.412, 0.08], // almond eyes & nasion root
    [0.092,  0.413, 0.09], // supraorbital brow arch & glabella
    [0.175,  0.410, 0.10], // frontal forehead
    [0.280,  0.390, 0.11], // upper forehead / trichion
    [0.380,  0.332, 0.12], // parietal cranial vault
    [0.460,  0.212, 0.14], // crown arch
  ];

  const jawSlopeRise = category === "men" ? 0.138 : (kid ? 0.170 : 0.158);
  const ovalChinNarrow = category === "men" ? 0.18 : (kid ? 0.22 : 0.23);

  for (const [yf, crFrac, sw] of headSlices) {
    const yLocal = yf * headH;
    const yWorld = headCenterY + yLocal;
    const fHead = smoothstep(-0.48 * headH, -0.36 * headH, yLocal);
    const weights = [[BONE_IDX.head, 0.52 + 0.48 * fHead], [BONE_IDX.neck, 0.48 * (1 - fHead)]];

    const ring = [];
    for (let k = 0; k < 48; k++) {
      const phi = headAzimuth(k, 1.0);
      const absPhi = Math.abs(phi);
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      // Flat-bottomed central chin (|phi| <= 0.30 -> constant -0.422, zero midline notch!) sloping up along mandible
      const latMandible = smoothstep(0.30, 1.52, absPhi);
      const jawLineY = -0.422 + jawSlopeRise * Math.pow(latMandible, 1.28) + 0.145 * smoothstep(1.38, 2.35, absPhi);
      const skullProg = smoothstep(jawLineY - 0.055, jawLineY + 0.045, yf);

      // Natural oval face silhouette tapering from cheekbones (-0.02) down to rounded chin (-0.42)
      const ovalTaper = yf < -0.01
        ? (1 - ovalChinNarrow * Math.pow(smoothstep(-0.01, -0.425, yf), 1.20))
        : 1.0;

      const rxFrac = neckRxFrac * (1 - skullProg) + (crFrac * headWidthScale * ovalTaper) * skullProg;
      const rzFrac = neckRzFrac * (1 - skullProg) + (crFrac * headDepthScale) * skullProg;

      const zShift = headH * (
        0.008 * (1 - skullProg)
        + (yf < 0.04 ? 0.016 : 0.016 * (1 - smoothstep(0.04, 0.36, yf)) - 0.008 * smoothstep(0.04, 0.36, yf)) * skullProg
      );

      const x = rxFrac * headH * sinP;
      const zRaw = rzFrac * headH * cosP;
      let dz = 0;
      let dx = 0;

      // 1. Supraorbital brow ridge & gentle nasion saddle
      const browAmp = headH * (category === "men" ? 0.016 : (kid ? 0.007 : 0.010));
      dz += browAmp * bumpWindow(yLocal, headH * 0.090, headH * 0.048) * superGauss(phi, 0, 0.56, 2.6);
      dz -= headH * 0.004 * bumpWindow(yLocal, headH * 0.046, headH * 0.032) * superGauss(phi, 0, 0.20, 2.6);

      // 2. Gently recessed almond orbital eye sockets
      const orbitAmp = -headH * 0.009;
      const orbitLobe = superGauss(phi, 0.37, 0.19, 2.2) + superGauss(phi, -0.37, 0.19, 2.2);
      dz += orbitAmp * bumpWindow(yLocal, headH * 0.036, headH * 0.044) * orbitLobe;

      // 3. Sculpted human nose with rounded dorsum, columella septum & soft nostril wings
      const noseProfile = smoothstep(headH * 0.046, -headH * 0.035, yLocal)
        * (0.60 + 0.40 * smoothstep(-headH * 0.020, -headH * 0.120, yLocal))
        * (1 - smoothstep(-headH * 0.118, -headH * 0.172, yLocal));
      const noseAmp = headH * (category === "men" ? 0.046 : (kid ? 0.035 : 0.041));
      dz += noseAmp * noseProfile * superGauss(phi, 0, 0.165, 3.0);

      // Rounded nasal tip globe, central columella bridge, & soft nostril wings (alae)
      const tipGlobe = headH * (category === "men" ? 0.010 : 0.008);
      dz += tipGlobe * bumpWindow(yLocal, -headH * 0.122, headH * 0.038) * superGauss(phi, 0, 0.185, 2.8);
      dz += headH * 0.011 * bumpWindow(yLocal, -headH * 0.156, headH * 0.028) * superGauss(phi, 0, 0.12, 2.4);
      const alarLobe = superGauss(phi, 0.185, 0.085, 2.2) + superGauss(phi, -0.185, 0.085, 2.2);
      dz += headH * 0.009 * bumpWindow(yLocal, -headH * 0.130, headH * 0.030) * alarLobe;

      // 4. Soft upper/lower lip fullness & oral rima
      dz += headH * 0.014 * bumpWindow(yLocal, -headH * 0.200, headH * 0.036) * superGauss(phi, 0, 0.28, 2.6);
      dz -= headH * 0.004 * bumpWindow(yLocal, -headH * 0.238, headH * 0.020) * superGauss(phi, 0, 0.26, 2.4);
      dz += headH * 0.013 * bumpWindow(yLocal, -headH * 0.276, headH * 0.036) * superGauss(phi, 0, 0.26, 2.6);

      // 5. Mentolabial hollow & ultra-broad, smooth rounded human chin pad
      dz -= headH * 0.006 * bumpWindow(yLocal, -headH * 0.340, headH * 0.032) * superGauss(phi, 0, 0.34, 2.6);
      const chinAmp = headH * (category === "men" ? 0.016 : (kid ? 0.011 : 0.014));
      const chinSigma = category === "men" ? 0.56 : 0.50;
      dz += chinAmp * bumpWindow(yLocal, -headH * 0.398, headH * 0.052) * superGauss(phi, 0, chinSigma, 3.0);

      // Subtle mandibular gonial definition below ears
      const gonialAmp = headH * (category === "men" ? 0.016 : 0.007);
      const jawLobe = superGauss(phi, 1.15, 0.28, 2.0) + superGauss(phi, -1.15, 0.28, 2.0);
      dx += Math.sign(sinP) * gonialAmp * bumpWindow(yLocal, -headH * 0.265, headH * 0.075) * jawLobe;

      // 6. Healthy anterior midface & malar cheek fullness
      const cheekAmp = headH * (female ? 0.020 : (kid ? 0.022 : 0.016));
      const cheekLobe = superGauss(phi, 0.50, 0.35, 2.2) + superGauss(phi, -0.50, 0.35, 2.2);
      dz += cheekAmp * bumpWindow(yLocal, -headH * 0.075, headH * 0.140) * cheekLobe;

      // 7. Integrated sculpted human ears (helix + concha hollow) aligned between brow (+0.08) and nose base (-0.14)
      const earLobe = bumpWindow(phi, 1.62, 0.18) + bumpWindow(phi, -1.62, 0.18);
      const earConcha = bumpWindow(phi, 1.58, 0.08) + bumpWindow(phi, -1.58, 0.08);
      const earYWin = bumpWindow(yLocal, -headH * 0.03, headH * 0.115);
      dx += Math.sign(sinP) * headH * (0.040 * earLobe - 0.010 * earConcha) * earYWin;
      dz -= headH * 0.012 * earLobe * earYWin;

      // 8. Natural occipital skull curve at back of head
      const backWeight = Math.max(0, -cosP);
      dz -= headH * 0.046 * bumpWindow(yLocal, headH * 0.11, headH * 0.26) * backWeight;

      ring.push(addVertex(x + dx, yWorld, zShift + zRaw + dz, sw, weights, false));
    }

    connectRings(prevHeadRing, ring);
    prevHeadRing = ring;
  }

  const cranialApex = addVertex(0, headCenterY + headH * 0.50, -headH * 0.02, 0.18, [[BONE_IDX.head, 1]], false);
  capTop(prevHeadRing, cranialApex);

  // =========================================================================
  // 6. VOLUME-PRESERVING TAUBIN SMOOTHING ON SADDLE JUNCTIONS & FACIAL CONTOURS
  // =========================================================================
  const vCount = positions.length / 3;
  const neighbors = Array.from({ length: vCount }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    neighbors[a].add(b); neighbors[a].add(c);
    neighbors[b].add(a); neighbors[b].add(c);
    neighbors[c].add(a); neighbors[c].add(b);
  }
  const adj = neighbors.map((s) => Array.from(s));
  const tempPos = new Float64Array(positions.length);

  function laplacianStep(factor) {
    tempPos.set(positions);
    for (let v = 0; v < vCount; v++) {
      const w = smoothW[v];
      if (w <= 0.001) continue;
      const nb = adj[v];
      const deg = nb.length;
      if (!deg) continue;
      let ax = 0, ay = 0, az = 0;
      for (let i = 0; i < deg; i++) {
        const u = nb[i] * 3;
        ax += tempPos[u];
        ay += tempPos[u + 1];
        az += tempPos[u + 2];
      }
      ax /= deg; ay /= deg; az /= deg;
      const idx3 = v * 3;
      const step = factor * w;
      positions[idx3] = tempPos[idx3] + step * (ax - tempPos[idx3]);
      const newY = tempPos[idx3 + 1] + step * (ay - tempPos[idx3 + 1]);
      positions[idx3 + 1] = floorLock[v] ? Math.max(0, newY) : newY;
      positions[idx3 + 2] = tempPos[idx3 + 2] + step * (az - tempPos[idx3 + 2]);
    }
  }

  for (let iter = 0; iter < 7; iter++) {
    laplacianStep(0.46);
    laplacianStep(-0.486);
  }

  // Grounding pass: shift entire mesh vertically by millimeter residual if needed so plantar soles touch y = 0.000
  let minY = Infinity;
  for (let v = 0; v < vCount; v++) {
    const y = positions[v * 3 + 1];
    if (y < minY) minY = y;
  }
  if (Number.isFinite(minY) && Math.abs(minY) > 1e-6) {
    for (let v = 0; v < vCount; v++) {
      positions[v * 3 + 1] -= minY;
    }
  }

  // Assemble Three.js BufferGeometry
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWgt, 4));

  // Cylindrical-vertical UV mapping so textures/decals behave predictably if inspected
  const uvs = new Float32Array(vCount * 2);
  for (let v = 0; v < vCount; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const u = (Math.atan2(x, z) / (2 * Math.PI)) + 0.5;
    uvs[v * 2] = u;
    uvs[v * 2 + 1] = clamp(y / (H || 1.7), 0, 1);
  }
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  const IndexArray = vCount > 65535 ? Uint32Array : Uint16Array;
  geo.setIndex(new THREE.BufferAttribute(new IndexArray(indices), 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  return geo;
}

/**
 * Attaches refined, flush facial details (almond eyes, iris/pupil/catchlight,
 * feathered brows, subtle satin lip glaze) and natural couture hairstyles
 * directly onto the `head` bone, sampling exact triangle coordinates from
 * `bodyGeo` so features never get buried by skin or cause Z-fighting.
 */
function populateHeadFeatures(THREE, headBone, headH, category, customHairColor, bodyGeo = null, headCenterY = 0, lowPower = false, customSkinColor = null) {
  const female = category === "women" || category === "girls";
  const kid = category === "girls" || category === "boys";
  const headWidthScale = kid ? 0.82 : (female ? 0.78 : 0.81);
  const headDepthScale = 0.92;

  const baseSkin = new THREE.Color(customSkinColor != null ? customSkinColor : (HUMAN_SKIN_PALETTE[category] || 0xdca98e));
  const skinLuma = 0.2126 * baseSkin.r + 0.7152 * baseSkin.g + 0.0722 * baseSkin.b;
  const deepSkinBlend = clamp((0.42 - skinLuma) / 0.34, 0, 1);

  const defaultHairHex = deepSkinBlend > 0.45 ? 0x1b120e : (HUMAN_HAIR_PALETTE[category] || 0x241913);
  const hairColor = customHairColor != null ? customHairColor : defaultHairHex;

  const scleraTint = new THREE.Color(0xf8f5f0).lerp(new THREE.Color(0xefe8e0), deepSkinBlend * 0.55);
  const eyeWhiteMat = lowPower
    ? new THREE.MeshPhongMaterial({ color: scleraTint, shininess: 56, specular: 0x444444 })
    : new THREE.MeshStandardMaterial({ color: scleraTint, roughness: 0.20 });
  const baseIrisHex = category === "women" ? 0x4e3524 : (category === "girls" ? 0x593c28 : (category === "boys" ? 0x3d2b1e : 0x312319));
  const irisColor = new THREE.Color(baseIrisHex).lerp(new THREE.Color(0x261811), deepSkinBlend * 0.6);
  const irisMat = lowPower
    ? new THREE.MeshPhongMaterial({ color: irisColor, shininess: 70, specular: 0x555555 })
    : new THREE.MeshStandardMaterial({ color: irisColor, roughness: 0.14 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x08080a });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Natural mucosal lip tone blended harmoniously with the active skin tone across Porcelain -> Ebony
  const lightLipHex = category === "women" ? 0xbc6766 : (category === "girls" ? 0xc47777 : (category === "boys" ? 0xb3776a : 0xa86d62));
  const deepLipHex = female ? 0x592b30 : 0x4b2728;
  const targetLipPigment = new THREE.Color(lightLipHex).lerp(new THREE.Color(deepLipHex), deepSkinBlend);
  const lipColor = baseSkin.clone().lerp(targetLipPigment, female ? 0.64 : 0.50);
  const lipMat = lowPower
    ? new THREE.MeshPhongMaterial({ color: lipColor, shininess: 32, specular: 0x332222, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({
        color: lipColor,
        roughness: 0.43,
        clearcoat: 0.14,
        clearcoatRoughness: 0.46,
        sheen: 0.0,
        side: THREE.DoubleSide,
      });

  const browMat = lowPower
    ? new THREE.MeshPhongMaterial({ color: hairColor, shininess: 10 })
    : new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.78 });
  const lashMat = lowPower
    ? new THREE.MeshPhongMaterial({ color: 0x16100d, shininess: 16 })
    : new THREE.MeshStandardMaterial({ color: 0x16100d, roughness: 0.58 });
  const lidColor = baseSkin.clone().multiplyScalar(0.86);
  const lidMat = lowPower
    ? new THREE.MeshPhongMaterial({ color: lidColor, shininess: 18 })
    : new THREE.MeshStandardMaterial({ color: lidColor, roughness: 0.54 });

  const hairMat = lowPower
    ? new THREE.MeshPhongMaterial({ color: hairColor, shininess: 22, specular: 0x2b1e16, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({
        color: hairColor,
        roughness: 0.66,
        metalness: 0.02,
        sheen: 0.28,
        sheenRoughness: 0.56,
        sheenColor: new THREE.Color(0x6b4b37),
        side: THREE.DoubleSide,
      });

  // Extract head triangles & cranial vertices from `bodyGeo` in headBone-local coordinates
  const frontHeadTris = [];
  const headVertsLocal = [];
  if (bodyGeo && bodyGeo.attributes && bodyGeo.attributes.position && bodyGeo.index) {
    const posAttr = bodyGeo.attributes.position;
    const idxAttr = bodyGeo.index;
    const minHeadY = -headH * 0.50;
    for (let v = 0; v < posAttr.count; v++) {
      const yl = posAttr.getY(v) - headCenterY;
      if (yl >= minHeadY) {
        headVertsLocal.push([posAttr.getX(v), yl, posAttr.getZ(v)]);
      }
    }
    for (let t = 0; t < idxAttr.count; t += 3) {
      const a = idxAttr.getX(t), b = idxAttr.getX(t + 1), c = idxAttr.getX(t + 2);
      const ay = posAttr.getY(a) - headCenterY;
      const by = posAttr.getY(b) - headCenterY;
      const cy = posAttr.getY(c) - headCenterY;
      if (ay < minHeadY && by < minHeadY && cy < minHeadY) continue;
      const az = posAttr.getZ(a), bz = posAttr.getZ(b), cz = posAttr.getZ(c);
      if (az > -headH * 0.05 || bz > -headH * 0.05 || cz > -headH * 0.05) {
        frontHeadTris.push([
          posAttr.getX(a), ay, az,
          posAttr.getX(b), by, bz,
          posAttr.getX(c), cy, cz,
        ]);
      }
    }
  }

  function analyticFrontZ(yLocal, phi) {
    const rf = yLocal < -headH * 0.24 ? 0.37 : 0.405;
    return headH * (0.015 + rf * Math.cos(phi) * headDepthScale);
  }

  function sampleHeadFrontZ(xLocal, yLocal) {
    let bestZ = -Infinity;
    for (let i = 0; i < frontHeadTris.length; i++) {
      const T = frontHeadTris[i];
      const x0 = T[0], y0 = T[1], z0 = T[2];
      const x1 = T[3], y1 = T[4], z1 = T[5];
      const x2 = T[6], y2 = T[7], z2 = T[8];
      const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(denom) < 1e-10) continue;
      const u = ((y1 - y2) * (xLocal - x2) + (x2 - x1) * (yLocal - y2)) / denom;
      if (u < -0.02 || u > 1.02) continue;
      const v = ((y2 - y0) * (xLocal - x2) + (x0 - x2) * (yLocal - y2)) / denom;
      if (v < -0.02 || v > 1.02) continue;
      const w = 1 - u - v;
      if (w < -0.02 || w > 1.02) continue;
      const z = u * z0 + v * z1 + w * z2;
      if (z > bestZ) bestZ = z;
    }
    if (bestZ > -Infinity) return bestZ;
    const phi = Math.atan2(xLocal, headH * 0.36);
    return analyticFrontZ(yLocal, phi);
  }

  function projectGeoOntoFace(geo, minClearance, domeScaleZ = 1.0, refZ = 0) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const zSkin = sampleHeadFrontZ(vx, vy);
      const relZ = Math.max(0, (vz - refZ) * domeScaleZ);
      pos.setZ(i, zSkin + minClearance + relZ);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // Classical human mid-head eye placement (5-eye facial width proportion & soft upper eyelid fold)
  const ey = headH * (kid ? 0.014 : 0.036);
  const ex = headH * (kid ? 0.130 : 0.134);
  const eyeHalfW = headH * (kid ? 0.064 : 0.062);
  const eyeHalfH = headH * (kid ? 0.033 : 0.030);

  [-1, 1].forEach((s) => {
    const eyeCenterX = s * ex;
    const scleraGeo = new THREE.SphereGeometry(eyeHalfW, 20, 14);
    scleraGeo.scale(1.0, eyeHalfH / eyeHalfW, 0.20);
    scleraGeo.translate(eyeCenterX, ey, 0);
    projectGeoOntoFace(scleraGeo, headH * 0.0020, 0.44, -headH * 0.006);
    const sclera = new THREE.Mesh(scleraGeo, eyeWhiteMat);
    sclera.castShadow = false;
    headBone.add(sclera);

    const irisR = headH * (kid ? 0.032 : 0.030);
    const irisGeo = new THREE.SphereGeometry(irisR, 18, 12);
    irisGeo.scale(0.96, 0.96, 0.15);
    irisGeo.translate(eyeCenterX * 0.98, ey + headH * 0.002, 0);
    projectGeoOntoFace(irisGeo, headH * 0.0074, 0.30, -headH * 0.002);
    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.castShadow = false;
    headBone.add(iris);

    const pupilGeo = new THREE.SphereGeometry(irisR * 0.48, 14, 10);
    pupilGeo.scale(0.96, 0.96, 0.11);
    pupilGeo.translate(eyeCenterX * 0.98, ey + headH * 0.002, 0);
    projectGeoOntoFace(pupilGeo, headH * 0.0100, 0.22, -headH * 0.001);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.castShadow = false;
    headBone.add(pupil);

    const gx = eyeCenterX * 0.98 + headH * 0.007;
    const gy = ey + headH * 0.007;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.0046, 8, 8), glintMat);
    glint.position.set(gx, gy, sampleHeadFrontZ(gx, gy) + headH * 0.0128);
    glint.castShadow = false;
    headBone.add(glint);

    // Warm skin-toned upper eyelid fold resting naturally over upper sclera/iris
    const lid0x = s * (ex - eyeHalfW * 0.98), lid0y = ey - eyeHalfH * 0.06;
    const lid1x = s * (ex + eyeHalfW * 0.02), lid1y = ey + eyeHalfH * 0.88;
    const lid2x = s * (ex + eyeHalfW * 1.02), lid2y = ey + (female ? eyeHalfH * 0.06 : -eyeHalfH * 0.06);
    const lidCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(lid0x, lid0y + headH * 0.005, sampleHeadFrontZ(lid0x, lid0y) + headH * 0.0055),
      new THREE.Vector3(lid1x, lid1y + headH * 0.005, sampleHeadFrontZ(lid1x, lid1y) + headH * 0.0105),
      new THREE.Vector3(lid2x, lid2y + headH * 0.005, sampleHeadFrontZ(lid2x, lid2y) + headH * 0.0055),
    ]);
    const lidGeo = new THREE.TubeGeometry(lidCurve, 14, headH * 0.0068, 6, false);
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.castShadow = false;
    headBone.add(lid);

    // Almond upper lash line hugging upper eyelid margin
    const lashCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(lid0x, lid0y, sampleHeadFrontZ(lid0x, lid0y) + headH * 0.0062),
      new THREE.Vector3(lid1x, lid1y - headH * 0.002, sampleHeadFrontZ(lid1x, lid1y) + headH * 0.0112),
      new THREE.Vector3(lid2x, lid2y, sampleHeadFrontZ(lid2x, lid2y) + headH * 0.0062),
    ]);
    const lashGeo = new THREE.TubeGeometry(lashCurve, 14, headH * (female ? 0.0036 : 0.0028), 6, false);
    const lash = new THREE.Mesh(lashGeo, lashMat);
    lash.castShadow = false;
    headBone.add(lash);

    // Softly tapered human eyebrow along the supraorbital arch
    const browY = ey + headH * (category === "men" ? 0.048 : 0.054);
    const b0x = s * (ex - eyeHalfW * 0.94), b0y = browY - headH * 0.003;
    const b1x = s * (ex + eyeHalfW * 0.24), b1y = browY + headH * (female ? 0.013 : 0.008);
    const b2x = s * (ex + eyeHalfW * 1.15), b2y = browY - headH * 0.008;
    const browPts = [
      new THREE.Vector3(b0x, b0y, sampleHeadFrontZ(b0x, b0y) + headH * 0.0042),
      new THREE.Vector3(b1x, b1y, sampleHeadFrontZ(b1x, b1y) + headH * 0.0052),
      new THREE.Vector3(b2x, b2y, sampleHeadFrontZ(b2x, b2y) + headH * 0.0038),
    ];
    const browCurve = new THREE.CatmullRomCurve3(browPts);
    const browRadius = headH * (category === "men" ? 0.0092 : (kid ? 0.0064 : 0.0068));
    const browGeo = new THREE.TubeGeometry(browCurve, 16, browRadius, 6, false);
    const bPos = browGeo.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      const vx = bPos.getX(i), vy = bPos.getY(i), vz = bPos.getZ(i);
      const uParam = clamp((Math.abs(vx) - Math.abs(b0x)) / Math.max(1e-4, Math.abs(b2x) - Math.abs(b0x)), 0, 1);
      const cPt = browCurve.getPoint(uParam);
      const taper = uParam > 0.55 ? (1 - 0.70 * smoothstep(0.55, 1.0, uParam)) : (0.76 + 0.24 * smoothstep(0, 0.25, uParam));
      const nx = cPt.x + (vx - cPt.x) * taper;
      const ny = cPt.y + (vy - cPt.y) * taper;
      const nz = cPt.z + (vz - cPt.z) * taper * 0.65;
      bPos.setXYZ(i, nx, ny, Math.max(nz, sampleHeadFrontZ(nx, ny) + headH * 0.0018));
    }
    bPos.needsUpdate = true;
    browGeo.computeVertexNormals();
    const brow = new THREE.Mesh(browGeo, browMat);
    brow.castShadow = false;
    headBone.add(brow);
  });

  // Proportional human Cupid's-bow lips (exact 30% subnasale-to-chin canon below nose tip -0.125)
  const mouthY = -headH * 0.238;
  const mouthHalfW = headH * (kid ? 0.092 : (category === "men" ? 0.106 : 0.100));
  const uLipCurve = new THREE.CatmullRomCurve3([
    [-mouthHalfW,        mouthY - headH * 0.002],
    [-mouthHalfW * 0.34, mouthY + headH * 0.011],
    [0,                  mouthY + headH * 0.007],
    [mouthHalfW * 0.34,  mouthY + headH * 0.011],
    [mouthHalfW,         mouthY - headH * 0.002],
  ].map(([lx, ly]) => new THREE.Vector3(lx, ly, sampleHeadFrontZ(lx, ly) + headH * 0.0030)));
  const uLipGeo = new THREE.TubeGeometry(uLipCurve, 22, headH * 0.0082, 8, false);
  const uPos = uLipGeo.attributes.position;
  for (let i = 0; i < uPos.count; i++) {
    const vx = uPos.getX(i), vy = uPos.getY(i), vz = uPos.getZ(i);
    const uParam = clamp((vx / mouthHalfW + 1) * 0.5, 0, 1);
    const cPt = uLipCurve.getPoint(uParam);
    const cornerTaper = 1 - 0.72 * Math.pow(clamp(Math.abs(vx) / mouthHalfW, 0, 1), 2);
    const ny = cPt.y + (vy - cPt.y) * cornerTaper;
    const nz = cPt.z + (vz - cPt.z) * cornerTaper * 0.55;
    uPos.setXYZ(i, vx, ny, Math.max(nz, sampleHeadFrontZ(vx, ny) + headH * 0.0014));
  }
  uPos.needsUpdate = true;
  uLipGeo.computeVertexNormals();
  const uLip = new THREE.Mesh(uLipGeo, lipMat);
  uLip.castShadow = false;
  headBone.add(uLip);

  const lLipCurve = new THREE.CatmullRomCurve3([
    [-mouthHalfW * 0.92, mouthY - headH * 0.002],
    [0,                  mouthY - headH * 0.012],
    [mouthHalfW * 0.92,  mouthY - headH * 0.002],
  ].map(([lx, ly]) => new THREE.Vector3(lx, ly, sampleHeadFrontZ(lx, ly) + headH * 0.0036)));
  const lLipGeo = new THREE.TubeGeometry(lLipCurve, 20, headH * 0.0096, 8, false);
  const lPos = lLipGeo.attributes.position;
  for (let i = 0; i < lPos.count; i++) {
    const vx = lPos.getX(i), vy = lPos.getY(i), vz = lPos.getZ(i);
    const uParam = clamp((vx / (mouthHalfW * 0.92) + 1) * 0.5, 0, 1);
    const cPt = lLipCurve.getPoint(uParam);
    const cornerTaper = 1 - 0.74 * Math.pow(clamp(Math.abs(vx) / (mouthHalfW * 0.92), 0, 1), 2);
    const ny = cPt.y + (vy - cPt.y) * cornerTaper;
    const nz = cPt.z + (vz - cPt.z) * cornerTaper * 0.55;
    lPos.setXYZ(i, vx, ny, Math.max(nz, sampleHeadFrontZ(vx, ny) + headH * 0.0015));
  }
  lPos.needsUpdate = true;
  lLipGeo.computeVertexNormals();
  const lLip = new THREE.Mesh(lLipGeo, lipMat);
  lLip.castShadow = false;
  headBone.add(lLip);

  // =========================================================================
  // Smooth Parametric Couture Hair Shell (rounded oval temple hairline, matte-satin finish)
  // =========================================================================
  function skullRadiusAlongDir(ux, uy, uz) {
    let maxProj = headH * 0.34;
    for (let j = 0; j < headVertsLocal.length; j++) {
      const hv = headVertsLocal[j];
      const hr = Math.hypot(hv[0], hv[1], hv[2]) || 1;
      const dot = (hv[0] * ux + hv[1] * uy + hv[2] * uz) / hr;
      if (dot > 0.93 && hr > maxProj) maxProj = hr;
    }
    return maxProj;
  }

  function buildParametricHairShell({
    frontYFrac = 0.255,
    templeSweep = 0.085,
    napeYFrac = -0.28,
    crownLiftFrac = 0.052,
    sideLoftFrac = 0.036,
    backLoftFrac = 0.056,
    partPhi = 0.0,
    partDepth = 0.006,
  }) {
    const U_SEGS = 64;
    const V_SEGS = 18;
    const positions = [];
    const indices = [];

    for (let iv = 0; iv <= V_SEGS; iv++) {
      const v = iv / V_SEGS; // 0 = continuous hairline edge, 1 = crown apex
      for (let iu = 0; iu <= U_SEGS; iu++) {
        const phi = -Math.PI + (iu / U_SEGS) * 2 * Math.PI;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);

        // Smooth rounded oval hairline curving softly down across the temples into sideburns & behind ears
        const faceW = smoothstep(-0.28, 0.36, cosP);
        const templeCurve = templeSweep * Math.pow(clamp(Math.abs(phi) / 1.32, 0, 1), 1.65);
        const partPeak = partDepth > 0 ? 0.014 * bumpWindow(phi, partPhi, 0.22) : 0;
        const sideburnDip = bumpWindow(phi, 1.35, 0.16) + bumpWindow(phi, -1.35, 0.16);
        const earArch = bumpWindow(phi, 1.66, 0.22) + bumpWindow(phi, -1.66, 0.22);
        const frontEdgeY = headH * (frontYFrac + partPeak - templeCurve - 0.035 * sideburnDip);
        const backEdgeY = headH * napeYFrac;
        const yEdge = backEdgeY * (1 - faceW) + frontEdgeY * faceW + earArch * headH * 0.115;

        // Smooth analytical ellipsoidal skull envelope + real vertex floor prevents bumpy specular ripples!
        const thetaEdge = Math.asin(clamp(yEdge / (headH * 0.50), -0.92, 0.92));
        const theta = thetaEdge * (1 - v) + (Math.PI * 0.5) * v;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const dx = cosT * sinP * headWidthScale;
        const dy = sinT;
        const dz = cosT * cosP * headDepthScale - 0.025 * (1 - v);
        const dLen = Math.hypot(dx, dy, dz) || 1;
        const ux = dx / dLen, uy = dy / dLen, uz = dz / dLen;

        const rAnalytic = headH * 0.416 * Math.hypot(cosT * sinP * headWidthScale, sinT * 1.18, cosT * cosP * headDepthScale);
        const rSampled = skullRadiusAlongDir(ux, uy, uz);
        const rSkull = Math.max(rSampled, rAnalytic);
        const edgeFeather = smoothstep(0.0, 0.22, v);
        const partGroove = partDepth > 0 ? partDepth * bumpWindow(phi, partPhi, 0.10) * smoothstep(0.08, 0.70, v) * Math.max(0, cosP + 0.15) : 0;

        const loft = headH * (
          0.0045
          + edgeFeather * (
            crownLiftFrac * Math.max(0, uy)
            + sideLoftFrac * Math.abs(ux)
            + backLoftFrac * Math.max(0, -uz)
            - partGroove
          )
        );

        const rFinal = rSkull + Math.max(headH * 0.004, loft);
        positions.push(ux * rFinal, uy * rFinal, uz * rFinal);
      }
    }

    const stride = U_SEGS + 1;
    for (let iv = 0; iv < V_SEGS; iv++) {
      for (let iu = 0; iu < U_SEGS; iu++) {
        const a0 = iv * stride + iu;
        const a1 = a0 + 1;
        const b0 = (iv + 1) * stride + iu;
        const b1 = b0 + 1;
        indices.push(a0, a1, b1, a0, b1, b0);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, hairMat);
    mesh.castShadow = true;
    return mesh;
  }

  if (category === "women") {
    // Sleek softly parted salon hairstyle framing temples in an oval arch into a sculpted low chignon
    headBone.add(buildParametricHairShell({
      frontYFrac: 0.260,
      templeSweep: 0.105,
      napeYFrac: -0.32,
      crownLiftFrac: 0.052,
      sideLoftFrac: 0.038,
      backLoftFrac: 0.064,
      partPhi: 0.16,
      partDepth: 0.008,
    }));

    const chignon = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.185, 24, 18), hairMat);
    chignon.scale.set(1.16, 0.88, 0.86);
    chignon.position.set(0, -headH * 0.16, -headH * 0.43);
    chignon.castShadow = true;
    headBone.add(chignon);

    const twistWrap = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.135, headH * 0.030, 10, 22), hairMat);
    twistWrap.position.set(0, -headH * 0.16, -headH * 0.39);
    twistWrap.rotation.x = 0.24;
    headBone.add(twistWrap);
  } else if (category === "men") {
    // Tailored tapered menswear cut with natural rounded temple hairline
    headBone.add(buildParametricHairShell({
      frontYFrac: 0.265,
      templeSweep: 0.068,
      napeYFrac: -0.25,
      crownLiftFrac: 0.048,
      sideLoftFrac: 0.024,
      backLoftFrac: 0.036,
      partPhi: -0.28,
      partDepth: 0.007,
    }));
  } else if (category === "girls") {
    // Youthful parted crown hair framing temples + soft tapered ponytails behind ears
    headBone.add(buildParametricHairShell({
      frontYFrac: 0.250,
      templeSweep: 0.100,
      napeYFrac: -0.28,
      crownLiftFrac: 0.048,
      sideLoftFrac: 0.034,
      backLoftFrac: 0.048,
      partPhi: 0.0,
      partDepth: 0.007,
    }));
    const tieMat = lowPower
      ? new THREE.MeshPhongMaterial({ color: 0xe0568c, shininess: 35 })
      : new THREE.MeshStandardMaterial({ color: 0xe0568c, roughness: 0.38 });

    [-1, 1].forEach((s) => {
      const tie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.048, headH * 0.016, 8, 16), tieMat);
      tie.position.set(s * headH * 0.31, headH * 0.04, -headH * 0.27);
      tie.rotation.y = s * 0.45;
      headBone.add(tie);

      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * headH * 0.32, headH * 0.04, -headH * 0.28),
        new THREE.Vector3(s * headH * 0.40, -headH * 0.14, -headH * 0.33),
        new THREE.Vector3(s * headH * 0.36, -headH * 0.42, -headH * 0.31),
      ]);
      const tailGeo = new THREE.TubeGeometry(tailCurve, 16, headH * 0.062, 10, false);
      const tp = tailGeo.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const vy = tp.getY(i);
        const f = smoothstep(headH * 0.03, -headH * 0.42, vy);
        const shrink = 1 - 0.68 * f;
        const cPt = tailCurve.getPoint(clamp(f, 0, 1));
        tp.setXYZ(
          i,
          cPt.x + (tp.getX(i) - cPt.x) * shrink,
          vy,
          cPt.z + (tp.getZ(i) - cPt.z) * shrink
        );
      }
      tp.needsUpdate = true;
      tailGeo.computeVertexNormals();
      const tail = new THREE.Mesh(tailGeo, hairMat);
      tail.castShadow = true;
      headBone.add(tail);
    });
  } else {
    // Boys: neat side-parted youthful textured crop
    headBone.add(buildParametricHairShell({
      frontYFrac: 0.252,
      templeSweep: 0.068,
      napeYFrac: -0.25,
      crownLiftFrac: 0.044,
      sideLoftFrac: 0.024,
      backLoftFrac: 0.035,
      partPhi: -0.24,
      partDepth: 0.006,
    }));
  }
}

/**
 * Applies a named static fashion/simulation pose to the skeleton.
 */
export function applyMannequinPose(limbs, pose = "standing", dims = null) {
  if (!limbs) return;
  Object.values(limbs).forEach((b) => {
    if (b && b.rotation) b.rotation.set(0, 0, 0);
  });
  if (limbs.pelvis && dims) {
    limbs.pelvis.position.set(0, dims.hipY, 0);
  }

  const p = pose || "standing";
  if (p === "standing") {
    limbs.arm1.rotation.z = 0.095;
    limbs["arm-1"].rotation.z = -0.095;
    limbs.elbow1.rotation.x = -0.11;
    limbs["elbow-1"].rotation.x = -0.11;
  } else if (p === "apose") {
    limbs.arm1.rotation.z = 0.45;
    limbs["arm-1"].rotation.z = -0.45;
    limbs.elbow1.rotation.x = -0.06;
    limbs["elbow-1"].rotation.x = -0.06;
  } else if (p === "tpose") {
    limbs.arm1.rotation.z = Math.PI / 2 - 0.04;
    limbs["arm-1"].rotation.z = -(Math.PI / 2 - 0.04);
  } else if (p === "contrapposto") {
    limbs.pelvis.rotation.z = -0.045;
    limbs.spine.rotation.z = 0.035;
    limbs.chest.rotation.z = 0.025;
    limbs.head.rotation.z = -0.015;
    limbs.arm1.rotation.z = 0.14;
    limbs["arm-1"].rotation.z = -0.08;
    limbs.elbow1.rotation.x = -0.16;
    limbs["elbow-1"].rotation.x = -0.09;
    limbs.leg1.rotation.z = 0.06;
    limbs.leg1.rotation.x = -0.08;
    limbs.knee1.rotation.x = 0.16;
    limbs["leg-1"].rotation.z = 0.03;
  } else if (p === "seated") {
    limbs.arm1.rotation.z = 0.09;
    limbs["arm-1"].rotation.z = -0.09;
    limbs.elbow1.rotation.x = -0.22;
    limbs["elbow-1"].rotation.x = -0.22;
    limbs.leg1.rotation.x = -Math.PI / 2;
    limbs["leg-1"].rotation.x = -Math.PI / 2;
    limbs.knee1.rotation.x = Math.PI / 2;
    limbs["knee-1"].rotation.x = Math.PI / 2;
  }
}

/**
 * Evaluates fluid, biomechanically grounded human walking & living idle breathing
 * motion onto the 17-bone skeleton, with garment-aware arm clearance and exact
 * plantar foot grounding (`minFootY === 0`).
 */
export function applyNaturalHumanMotion(limbs, dims, landmarks, opts = {}) {
  if (!limbs || !limbs.leg1 || !dims) return { phase: 0, stride: 0, bobY: 0, swayX: 0 };
  const {
    time = 0,
    walking = true,
    reduceMotion = false,
    category = "women",
    minArmAbduct = 0.095,
    blendAlpha = 1.0,
  } = opts;

  const isKid = category === "girls" || category === "boys";
  const isWoman = category === "women";
  const lm = landmarks || {
    thighLen: dims.hipY * 0.48,
    calfLen: dims.hipY * 0.43,
    ankleY: dims.H * 0.047,
  };

  const lerpAngle = (cur, target) => cur + (target - cur) * blendAlpha;

  if (walking && !reduceMotion) {
    const freq = isKid ? 3.35 : 2.95;
    const phase = time * freq;
    const strideAmp = isKid ? 0.27 : (isWoman ? 0.30 : 0.32);

    // Biomechanical leg kinematics for left (+1, phase) and right (-1, phase + PI):
    // In Three.js: hip rotation.x < 0 swings thigh FORWARD (+Z); > 0 extends thigh BACKWARD (-Z).
    // Knee rotation.x >= 0 flexes shin BACKWARD (-Z).
    const evalLeg = (p) => {
      const s = Math.sin(p);
      const c = Math.cos(p);
      // Slight forward-stride asymmetry (-0.025 bias) + smooth harmonic swing
      const hipX = -0.024 + s * strideAmp - 0.032 * Math.sin(2 * p);
      // Two-peak human knee curve: high swing clearance when lifting from rear + gentle stance shock absorption
      const swingLift = Math.pow(Math.max(0, Math.sin(p - 0.32)), 1.35) * (isKid ? 0.56 : 0.62);
      const stanceYield = Math.pow(Math.max(0, -Math.sin(p + 0.55)), 2.0) * 0.075;
      const kneeX = Math.max(0, swingLift + stanceYield);
      // Ankle roll: dorsiflex (-X) on forward heel reach & mid-swing toe clearance; plantarflex (+X) at push-off
      const pushOff = Math.pow(Math.max(0, Math.sin(p - 0.15)), 1.6) * 0.24;
      const heelReach = Math.pow(Math.max(0, -s), 1.2) * 0.13;
      const swingClear = Math.max(0, c) * Math.max(0, s) * 0.12;
      const footX = pushOff - heelReach - swingClear;
      return { hipX, kneeX, footX, stanceWeight: clamp(0.5 - 0.5 * s, 0, 1) };
    };

    const L = evalLeg(phase);
    const R = evalLeg(phase + Math.PI);

    limbs.leg1.rotation.x = lerpAngle(limbs.leg1.rotation.x, L.hipX);
    limbs["leg-1"].rotation.x = lerpAngle(limbs["leg-1"].rotation.x, R.hipX);
    // Subtle natural runway foot tracking (slight stance adduction without leg crossing)
    const addu = isWoman ? -0.018 : -0.008;
    limbs.leg1.rotation.z = lerpAngle(limbs.leg1.rotation.z, addu * L.stanceWeight);
    limbs["leg-1"].rotation.z = lerpAngle(limbs["leg-1"].rotation.z, -addu * R.stanceWeight);

    if (limbs.knee1 && limbs["knee-1"]) {
      limbs.knee1.rotation.x = lerpAngle(limbs.knee1.rotation.x, L.kneeX);
      limbs["knee-1"].rotation.x = lerpAngle(limbs["knee-1"].rotation.x, R.kneeX);
    }
    if (limbs.foot1 && limbs["foot-1"]) {
      limbs.foot1.rotation.x = lerpAngle(limbs.foot1.rotation.x, L.footX);
      limbs["foot-1"].rotation.x = lerpAngle(limbs["foot-1"].rotation.x, R.footX);
    }

    // Counter-swinging arms with garment-safe outward abduction
    const armSwingAmp = strideAmp * (isWoman ? 0.58 : 0.64);
    const armLX = -Math.sin(phase) * armSwingAmp - 0.02;
    const armRX = Math.sin(phase) * armSwingAmp - 0.02;
    limbs.arm1.rotation.x = lerpAngle(limbs.arm1.rotation.x, armLX);
    limbs["arm-1"].rotation.x = lerpAngle(limbs["arm-1"].rotation.x, armRX);

    const dynamicAbduct = Math.max(0.095, minArmAbduct) + 0.022 * Math.abs(Math.sin(phase));
    limbs.arm1.rotation.z = lerpAngle(limbs.arm1.rotation.z, dynamicAbduct);
    limbs["arm-1"].rotation.z = lerpAngle(limbs["arm-1"].rotation.z, -dynamicAbduct);

    if (limbs.elbow1 && limbs["elbow-1"]) {
      const elbL = -0.14 - Math.max(0, -armLX) * 0.52 - 0.04 * Math.abs(Math.sin(phase));
      const elbR = -0.14 - Math.max(0, -armRX) * 0.52 - 0.04 * Math.abs(Math.sin(phase));
      limbs.elbow1.rotation.x = lerpAngle(limbs.elbow1.rotation.x, elbL);
      limbs["elbow-1"].rotation.x = lerpAngle(limbs["elbow-1"].rotation.x, elbR);
      // Slight outward forearm carry when clearing flared skirts
      const elbowOut = Math.max(0, minArmAbduct - 0.11) * 0.35;
      limbs.elbow1.rotation.z = lerpAngle(limbs.elbow1.rotation.z || 0, elbowOut);
      limbs["elbow-1"].rotation.z = lerpAngle(limbs["elbow-1"].rotation.z || 0, -elbowOut);
    }

    if (limbs.hand1 && limbs["hand-1"]) {
      limbs.hand1.rotation.x = lerpAngle(limbs.hand1.rotation.x, armLX * 0.22);
      limbs["hand-1"].rotation.x = lerpAngle(limbs["hand-1"].rotation.x, armRX * 0.22);
    }

    // 3D Pelvis, Spine, Chest, Neck & Head counter-rotation
    const rollAmp = isWoman ? 0.030 : (isKid ? 0.018 : 0.016);
    const yawAmp = isWoman ? 0.042 : (isKid ? 0.028 : 0.038);
    const pelvRoll = Math.sin(phase) * rollAmp;
    const pelvYaw = Math.sin(phase) * yawAmp;
    const swayX = -Math.cos(phase) * (isWoman ? 0.011 : 0.008);

    // Exact kinematic heel-to-toe plantar sole grounding: stance foot rolls on y = 0.000m (zero floating or sinking!)
    const footLen = clamp(dims.H * (isKid ? 0.148 : (isWoman ? 0.142 : 0.150)), 0.17, 0.29);
    const evalSoleWorldY = (leg, sideSign) => {
      const pitch = leg.hipX + leg.kneeX + leg.footX;
      const soleBelowAnkle = lm.ankleY * Math.cos(pitch)
        + (pitch >= 0 ? footLen * 0.54 * Math.sin(pitch) : footLen * 0.26 * Math.sin(-pitch));
      return lm.hipPivotY
        + sideSign * lm.hipPivotX * Math.sin(pelvRoll)
        - (lm.thighLen * Math.cos(leg.hipX) + lm.calfLen * Math.cos(leg.hipX + leg.kneeX))
        - soleBelowAnkle;
    };
    const minSoleUnadjusted = Math.min(evalSoleWorldY(L, 1), evalSoleWorldY(R, -1));
    const groundedBobY = clamp(-minSoleUnadjusted, -0.055, 0.035);

    if (limbs.pelvis) {
      limbs.pelvis.position.x = lerpAngle(limbs.pelvis.position.x, swayX);
      limbs.pelvis.position.y = lerpAngle(limbs.pelvis.position.y, dims.hipY + groundedBobY);
      limbs.pelvis.rotation.z = lerpAngle(limbs.pelvis.rotation.z, pelvRoll);
      limbs.pelvis.rotation.y = lerpAngle(limbs.pelvis.rotation.y, pelvYaw);
      limbs.pelvis.rotation.x = lerpAngle(limbs.pelvis.rotation.x, 0.016 + 0.008 * Math.cos(2 * phase));
    }
    if (limbs.spine) {
      limbs.spine.rotation.z = lerpAngle(limbs.spine.rotation.z, -pelvRoll * 0.58);
      limbs.spine.rotation.y = lerpAngle(limbs.spine.rotation.y, -pelvYaw * 0.62);
      limbs.spine.rotation.x = lerpAngle(limbs.spine.rotation.x, -0.010);
    }
    if (limbs.chest) {
      limbs.chest.rotation.z = lerpAngle(limbs.chest.rotation.z, -pelvRoll * 0.42);
      limbs.chest.rotation.y = lerpAngle(limbs.chest.rotation.y, -pelvYaw * 0.78);
      limbs.chest.rotation.x = lerpAngle(limbs.chest.rotation.x, 0.008 * Math.sin(2 * phase));
    }
    if (limbs.neck) {
      limbs.neck.rotation.y = lerpAngle(limbs.neck.rotation.y, pelvYaw * 0.22);
      limbs.neck.rotation.z = lerpAngle(limbs.neck.rotation.z, pelvRoll * 0.12);
    }
    if (limbs.head) {
      limbs.head.rotation.y = lerpAngle(limbs.head.rotation.y, pelvYaw * 0.18);
      limbs.head.rotation.z = lerpAngle(limbs.head.rotation.z, -pelvRoll * 0.10);
      limbs.head.rotation.x = lerpAngle(limbs.head.rotation.x, -0.008);
    }

    return { phase, stride: Math.sin(phase) * strideAmp, bobY: groundedBobY, swayX };
  }

  // Living idle stance: gentle respiratory breathing + subtle balance micro-sway
  const breath = reduceMotion ? 0 : Math.sin(time * 1.45);
  const idleSway = reduceMotion ? 0 : Math.sin(time * 0.72) * 0.004;
  const idleAbduct = Math.max(0.095, minArmAbduct) + (reduceMotion ? 0 : 0.005 * (breath * 0.5 + 0.5));
  const damp = 0.14;

  const dampTo = (cur, target) => cur + (target - cur) * damp;
  limbs.leg1.rotation.x = dampTo(limbs.leg1.rotation.x, 0);
  limbs["leg-1"].rotation.x = dampTo(limbs["leg-1"].rotation.x, 0);
  limbs.leg1.rotation.z = dampTo(limbs.leg1.rotation.z, 0.006);
  limbs["leg-1"].rotation.z = dampTo(limbs["leg-1"].rotation.z, -0.006);
  if (limbs.knee1 && limbs["knee-1"]) {
    limbs.knee1.rotation.x = dampTo(limbs.knee1.rotation.x, 0.012);
    limbs["knee-1"].rotation.x = dampTo(limbs["knee-1"].rotation.x, 0.012);
  }
  if (limbs.foot1 && limbs["foot-1"]) {
    limbs.foot1.rotation.x = dampTo(limbs.foot1.rotation.x, 0);
    limbs["foot-1"].rotation.x = dampTo(limbs["foot-1"].rotation.x, 0);
  }
  limbs.arm1.rotation.x = dampTo(limbs.arm1.rotation.x, -0.015 + breath * 0.006);
  limbs["arm-1"].rotation.x = dampTo(limbs["arm-1"].rotation.x, -0.015 + breath * 0.006);
  limbs.arm1.rotation.z = dampTo(limbs.arm1.rotation.z, idleAbduct);
  limbs["arm-1"].rotation.z = dampTo(limbs["arm-1"].rotation.z, -idleAbduct);
  if (limbs.elbow1 && limbs["elbow-1"]) {
    const elbowOut = Math.max(0, minArmAbduct - 0.11) * 0.35;
    limbs.elbow1.rotation.x = dampTo(limbs.elbow1.rotation.x, -0.11 - breath * 0.008);
    limbs["elbow-1"].rotation.x = dampTo(limbs["elbow-1"].rotation.x, -0.11 - breath * 0.008);
    limbs.elbow1.rotation.z = dampTo(limbs.elbow1.rotation.z || 0, elbowOut);
    limbs["elbow-1"].rotation.z = dampTo(limbs["elbow-1"].rotation.z || 0, -elbowOut);
  }
  if (limbs.hand1 && limbs["hand-1"]) {
    limbs.hand1.rotation.x = dampTo(limbs.hand1.rotation.x, 0);
    limbs["hand-1"].rotation.x = dampTo(limbs["hand-1"].rotation.x, 0);
  }
  if (limbs.pelvis) {
    limbs.pelvis.position.x = dampTo(limbs.pelvis.position.x, idleSway);
    limbs.pelvis.position.y = dampTo(limbs.pelvis.position.y, dims.hipY);
    limbs.pelvis.rotation.z = dampTo(limbs.pelvis.rotation.z, -idleSway * 1.2);
    limbs.pelvis.rotation.y = dampTo(limbs.pelvis.rotation.y, idleSway * 0.8);
    limbs.pelvis.rotation.x = dampTo(limbs.pelvis.rotation.x, 0);
  }
  if (limbs.spine) {
    limbs.spine.rotation.z = dampTo(limbs.spine.rotation.z, idleSway * 0.8);
    limbs.spine.rotation.y = dampTo(limbs.spine.rotation.y, 0);
    limbs.spine.rotation.x = dampTo(limbs.spine.rotation.x, -breath * 0.006);
  }
  if (limbs.chest) {
    limbs.chest.rotation.z = dampTo(limbs.chest.rotation.z, 0);
    limbs.chest.rotation.y = dampTo(limbs.chest.rotation.y, -idleSway * 0.6);
    limbs.chest.rotation.x = dampTo(limbs.chest.rotation.x, -breath * 0.010);
  }
  if (limbs.neck) {
    limbs.neck.rotation.y = dampTo(limbs.neck.rotation.y, 0);
    limbs.neck.rotation.z = dampTo(limbs.neck.rotation.z, 0);
  }
  if (limbs.head) {
    limbs.head.rotation.y = dampTo(limbs.head.rotation.y, idleSway * 0.5);
    limbs.head.rotation.z = dampTo(limbs.head.rotation.z, 0);
    limbs.head.rotation.x = dampTo(limbs.head.rotation.x, breath * 0.005);
  }
  return { phase: 0, stride: 0, bobY: 0, swayX: idleSway };
}

/**
 * Bakes a posed SkinnedMesh into a standalone static BufferGeometry in group-local
 * space (used by Cloth Lab's Avatar.jsx for zero-overhead static collision/rendering
 * and 100% compatibility with GLTFExporter, OBJExporter, and USDZExporter).
 */
export function bakeSkinnedMeshGeometry(THREE, skinnedMesh, rootGroup) {
  rootGroup.updateMatrixWorld(true);
  skinnedMesh.skeleton.update();

  const srcGeo = skinnedMesh.geometry;
  const srcPos = srcGeo.attributes.position;
  const bakedGeo = new THREE.BufferGeometry();

  const outPos = new Float32Array(srcPos.count * 3);
  const v = new THREE.Vector3();
  const invRoot = new THREE.Matrix4().copy(rootGroup.matrixWorld).invert();

  for (let i = 0; i < srcPos.count; i++) {
    v.fromBufferAttribute(srcPos, i);
    skinnedMesh.applyBoneTransform(i, v);
    v.applyMatrix4(skinnedMesh.matrixWorld).applyMatrix4(invRoot);
    outPos[i * 3] = v.x;
    outPos[i * 3 + 1] = v.y;
    outPos[i * 3 + 2] = v.z;
  }

  bakedGeo.setAttribute("position", new THREE.Float32BufferAttribute(outPos, 3));
  if (srcGeo.attributes.uv) {
    bakedGeo.setAttribute("uv", srcGeo.attributes.uv.clone());
  }
  if (srcGeo.index) {
    bakedGeo.setIndex(srcGeo.index.clone());
  }
  bakedGeo.computeVertexNormals();
  bakedGeo.computeBoundingBox();
  bakedGeo.computeBoundingSphere();
  return bakedGeo;
}

/**
 * Primary factory: builds a complete unified human mannequin.
 *
 * Options:
 * - `skinColor`: optional color override (hex number or CSS string)
 * - `hairColor`: optional hair color override
 * - `pose`: `'standing' | 'apose' | 'tpose' | 'contrapposto' | 'seated'` (default `'standing'`)
 * - `bakeStatic`: boolean — if true, bakes the posed SkinnedMesh into a plain `THREE.Mesh`
 *   and re-parents head features in world-baked coordinates (ideal for Cloth Lab exports).
 */
export function buildHumanMannequin(THREE, category = "women", measurementsOrDims = null, options = {}) {
  const lowPower = Boolean(options.lowPower);
  const dims = computeHumanBodyDims(category, measurementsOrDims, options.landmarks);
  const skinMat = options.skinMaterial || createHumanSkinMaterial(THREE, category, options.skinColor, lowPower);

  const group = new THREE.Group();
  group.name = "avatar";

  const rig = createSkeletonRig(THREE, dims);
  const bodyGeo = buildWatertightBodyGeometry(THREE, category, dims, rig.landmarks, {
    collisionSafe: options.collisionSafe ?? Boolean(options.bakeStatic),
  });

  const skinnedBody = new THREE.SkinnedMesh(bodyGeo, skinMat);
  skinnedBody.name = "humanBody";
  skinnedBody.castShadow = true;
  skinnedBody.receiveShadow = true;
  // Prevent frustum culling artifacts when bones animate away from origin
  skinnedBody.frustumCulled = false;

  group.add(rig.bones[BONE_IDX.pelvis]);
  group.add(skinnedBody);
  group.updateMatrixWorld(true);
  skinnedBody.bind(rig.skeleton);

  populateHeadFeatures(
    THREE,
    rig.limbs.head,
    dims.headH,
    category,
    options.hairColor,
    bodyGeo,
    rig.landmarks.headCenterY,
    lowPower,
    options.skinColor
  );
  applyMannequinPose(rig.limbs, options.pose || "standing", dims);
  group.updateMatrixWorld(true);
  rig.skeleton.update();

  if (typeof options.onBindData === "function") {
    options.onBindData({
      bindGeometry: bodyGeo,
      limbs: rig.limbs,
      bones: rig.bones,
      landmarks: rig.landmarks,
      dims,
    });
  }

  if (options.bakeStatic) {
    const bakedGeo = bakeSkinnedMeshGeometry(THREE, skinnedBody, group);
    bodyGeo.dispose();

    const headWorldMatrix = new THREE.Matrix4().copy(rig.limbs.head.matrixWorld);
    const invGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const headLocalMatrix = new THREE.Matrix4().multiplyMatrices(invGroup, headWorldMatrix);

    const headContainer = new THREE.Group();
    headContainer.name = "headFeatures";
    while (rig.limbs.head.children.length > 0) {
      headContainer.add(rig.limbs.head.children[0]);
    }
    headLocalMatrix.decompose(headContainer.position, headContainer.quaternion, headContainer.scale);

    group.remove(skinnedBody);
    group.remove(rig.bones[BONE_IDX.pelvis]);

    const staticBody = new THREE.Mesh(bakedGeo, skinMat);
    staticBody.name = "humanBody";
    staticBody.castShadow = true;
    staticBody.receiveShadow = true;
    group.add(staticBody);
    group.add(headContainer);

    return {
      group,
      bodyMesh: staticBody,
      headGroup: headContainer,
      skeleton: null,
      bones: [],
      limbs: {},
      dims,
      landmarks: rig.landmarks,
    };
  }

  return {
    group,
    bodyMesh: skinnedBody,
    headGroup: rig.limbs.head,
    skeleton: rig.skeleton,
    bones: rig.bones,
    limbs: rig.limbs,
    dims,
    landmarks: rig.landmarks,
  };
}
