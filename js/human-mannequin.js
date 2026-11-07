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
  const { hipY, span, chestR, waistR, hipR } = d;
  return {
    breast: { centerY: hipY + span * 0.72, halfWidth: span * 0.16, amplitude: chestR * 0.155, phi0: 0.48, phiHalfWidth: 0.46 },
    lumbar: { centerY: hipY + span * 0.38, halfWidth: span * 0.15, amplitude: waistR * 0.115 },
    glute: { centerY: hipY - span * 0.02, halfWidth: span * 0.13, amplitude: hipR * 0.165 },
  };
}

export function torsoZBump(y, phi, d) {
  const { breast, lumbar, glute } = femaleTorsoSculpt(d);
  let dz = 0;
  // Natural teardrop bust contour: gentler upper pole slope, fuller lower cup
  const lobe = bumpWindow(phi, breast.phi0, breast.phiHalfWidth) + bumpWindow(phi, -breast.phi0, breast.phiHalfWidth);
  const yRel = (y - breast.centerY) / (breast.halfWidth || 1);
  const teardrop = yRel > 0 ? Math.max(0, 1 - yRel * 0.18) : 1 + Math.min(0.14, -yRel * 0.12);
  dz += breast.amplitude * bumpWindow(y, breast.centerY, breast.halfWidth) * lobe * teardrop;

  const backWeight = Math.max(0, -Math.cos(phi));
  dz += lumbar.amplitude * bumpWindow(y, lumbar.centerY, lumbar.halfWidth) * backWeight;

  // Bilateral gluteus maximus fullness with subtle sacral/intergluteal cleft
  const gluteCleft = 1 - 0.28 * bumpWindow(phi - Math.PI, 0, 0.20) - 0.28 * bumpWindow(phi + Math.PI, 0, 0.20);
  dz -= glute.amplitude * bumpWindow(y, glute.centerY, glute.halfWidth) * backWeight * gluteCleft;
  return dz;
}

export function maleTorsoSculpt(d) {
  const { hipY, span, chestR, waistR, hipR } = d;
  return {
    chest: { centerY: hipY + span * 0.74, halfWidth: span * 0.15, amplitude: chestR * 0.095, phiHalfWidth: 0.84 },
    lumbar: { centerY: hipY + span * 0.38, halfWidth: span * 0.13, amplitude: waistR * 0.075 },
    glute: { centerY: hipY - span * 0.02, halfWidth: span * 0.12, amplitude: hipR * 0.115 },
  };
}

export function maleTorsoZBump(y, phi, d) {
  const { chest, lumbar, glute } = maleTorsoSculpt(d);
  let dz = 0;
  const pecLobe = bumpWindow(phi, 0.44, 0.40) + bumpWindow(phi, -0.44, 0.40);
  dz += chest.amplitude * bumpWindow(y, chest.centerY, chest.halfWidth) * (pecLobe * 0.82 + bumpWindow(phi, 0, chest.phiHalfWidth) * 0.32);
  const backWeight = Math.max(0, -Math.cos(phi));
  dz += lumbar.amplitude * bumpWindow(y, lumbar.centerY, lumbar.halfWidth) * backWeight;
  const gluteCleft = 1 - 0.24 * bumpWindow(phi - Math.PI, 0, 0.18) - 0.24 * bumpWindow(phi + Math.PI, 0, 0.18);
  dz -= glute.amplitude * bumpWindow(y, glute.centerY, glute.halfWidth) * backWeight * gluteCleft;
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
  const headH = H * (kid ? 0.16 : 0.128);
  const neckTopY = H - headH;
  const shoulderY = H * (landmarks ? landmarks.shoulderYFrac : (kid ? 0.80 : 0.82));
  const hipY = H * (landmarks ? landmarks.hipYFrac : (kid ? 0.47 : 0.52));

  let chestR = radiusFromCirc(chestCm);
  let waistR = radiusFromCirc(waistCm);
  let hipR = radiusFromCirc(hipsCm);
  let shoulderHalf = cm(shoulderCm) / 2;
  const neckR = radiusFromCirc(neckCm) * 0.85;

  if (female) {
    waistR *= 0.86;
    hipR *= 1.03;
  } else {
    waistR *= 0.97;
    shoulderHalf *= 1.07;
    chestR *= 1.03;
  }
  if (kid) {
    waistR = ((waistR + chestR) / 2) * 0.96;
    hipR *= 0.97;
    shoulderHalf *= 0.98;
  }
  if (landmarks && landmarks.radiusScale) {
    chestR *= landmarks.radiusScale;
    waistR *= landmarks.radiusScale;
    hipR *= landmarks.radiusScale;
    shoulderHalf *= landmarks.radiusScale;
  }

  const span = shoulderY - hipY;
  const armLen = m.sleeve ? cm(m.sleeve) : H * (kid ? 0.40 : 0.44);
  const upperR = radiusFromCirc(bicepCm) * (female ? 0.9 : 1.0);
  const legLen = hipY;
  const thighR = radiusFromCirc(thighCm) * (female ? 1.0 : 0.98);

  return {
    female, kid, H, headH, neckTopY, shoulderY, hipY, span,
    chestR, waistR, hipR, shoulderHalf, neckR, armLen, upperR, legLen, thighR,
  };
}

export function createHumanSkinMaterial(THREE, category, customColor) {
  const color = customColor != null ? customColor : (HUMAN_SKIN_PALETTE[category] || 0xdca98e);
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.54,
    metalness: 0.0,
    clearcoat: 0.06,
    clearcoatRoughness: 0.68,
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

  const shoulderPivotY = shoulderY - span * 0.04;
  const shoulderPivotX = shoulderHalf * 0.80;
  const upperArmLen = armLen * 0.48;
  const forearmLen = armLen * 0.46;

  const hipPivotY = hipY - span * 0.04;
  const hipPivotX = hipR * (female ? 0.47 : 0.49);
  const ankleY = Math.max(0.052, HFrac(d.H, 0.046));
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

  const N_LEG = 32;
  const N_TORSO = 32;
  const N_ARM = 20;

  // =========================================================================
  // 1. LEFT & RIGHT FEET -> ANKLES -> CALVES -> KNEES -> THIGHS (N = 32 each)
  // =========================================================================
  const footLen = clamp(H * (kid ? 0.148 : (female ? 0.142 : 0.150)), 0.17, 0.29);
  const footW = footLen * (female ? 0.37 : 0.39);
  const ankleY = lm.ankleY;
  const kneeY = lm.kneeY;
  const crotchMergeY = hipY - span * 0.155;
  const legTopY = hipY - span * 0.135;

  function legWeightsAtY(y, side) {
    const bHip = side > 0 ? BONE_IDX.legL : BONE_IDX.legR;
    const bKnee = side > 0 ? BONE_IDX.kneeL : BONE_IDX.kneeR;
    const bFoot = side > 0 ? BONE_IDX.footL : BONE_IDX.footR;

    if (y <= ankleY + 0.025) {
      const f = smoothstep(ankleY - 0.020, ankleY + 0.025, y);
      return [[bFoot, 1 - f], [bKnee, f]];
    }
    if (y <= kneeY + 0.055) {
      const f = smoothstep(kneeY - 0.055, kneeY + 0.055, y);
      return [[bKnee, 1 - f], [bHip, f]];
    }
    const pelvBlend = smoothstep(crotchMergeY - 0.04, hipY + 0.02, y) * 0.45;
    return [[bHip, 1 - pelvBlend], [BONE_IDX.pelvis, pelvBlend]];
  }

  function buildLegBranch(side) {
    // side = +1 (left, +X) or -1 (right, -X)
    const legX = side * lm.hipPivotX;
    const bFoot = side > 0 ? BONE_IDX.footL : BONE_IDX.footR;

    const toeTipZ = footLen * 0.68;
    const heelBackZ = -footLen * 0.30;

    // Closed toe cap apex
    const toeApex = addVertex(
      legX - side * footW * 0.06,
      0.011,
      toeTipZ,
      0.15,
      [[bFoot, 1]],
      true
    );

    // Foot cross-sections using smooth Frenet pitch rotation (alpha: 78 deg -> 0 deg)
    const footSpecs = [
      // [cy, cz, alphaRad, rxMed, rxLat, rDorsal, rPlantar, sw, clampPlantar]
      [0.013, toeTipZ * 0.86, 1.34, footW * 0.44, footW * 0.38, 0.013, 0.013, 0.25, true],
      [0.018, toeTipZ * 0.62, 1.24, footW * 0.52, footW * 0.48, 0.019, 0.018, 0.28, true],
      [0.026, toeTipZ * 0.28, 0.98, footW * 0.45, footW * 0.42, 0.025, 0.026, 0.35, true],
      [0.036, -footLen * 0.02, 0.56, footW * 0.38, footW * 0.37, 0.033, 0.036, 0.55, true],
      [ankleY * 0.76, heelBackZ * 0.16, 0.22, thighR * 0.35, thighR * 0.34, thighR * 0.36, thighR * 0.41, 0.65, false],
    ];

    let prevRing = null;
    for (let sIdx = 0; sIdx < footSpecs.length; sIdx++) {
      const [cy, cz, alpha, rxMed, rxLat, rDors, rPlant, sw, clampSole] = footSpecs[sIdx];
      const ring = [];
      const sinA = Math.sin(alpha);
      const cosA = Math.cos(alpha);

      for (let k = 0; k < N_LEG; k++) {
        const phi = (2 * Math.PI * k) / N_LEG;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        // Medial is toward X = 0 (sinP * side < 0)
        const isMedial = sinP * side < 0;
        const rx = isMedial ? rxMed : rxLat;
        const rn = cosP >= 0 ? rDors : rPlant;

        // Slight medial arch lift at midfoot (sIdx === 2)
        let archLift = 0;
        if (sIdx === 2 && cosP < -0.2 && isMedial) {
          archLift = 0.0045 * (-cosP);
        }
        // Subtle hallux (big toe) forward extension on distal toe ring
        let halluxZ = 0;
        if (sIdx <= 1 && isMedial && Math.abs(sinP) > 0.25) {
          halluxZ = footLen * 0.018 * Math.abs(sinP);
        }

        const x = legX + rx * sinP;
        let y = cy + rn * cosP * sinA + archLift;
        const z = cz + rn * cosP * cosA + halluxZ;
        const lock = clampSole && cosP < -0.15;
        if (lock && y < 0) y = 0;

        ring.push(addVertex(x, y, z, sw, legWeightsAtY(y, side), lock));
      }
      if (!prevRing) capBottom(toeApex, ring);
      else connectRings(prevRing, ring);
      prevRing = ring;
    }

    // Vertical anatomical leg sections from malleoli ankle up to upper thigh
    const legSpan = legTopY - ankleY;
    const kneeFrac = clamp((kneeY - ankleY) / legSpan, 0.44, 0.56);

    // Outer hip target at legTopY so outer hip-to-thigh curve has ZERO shelf:
    const pelvicOuterAtMerge = hipR * (female ? 0.99 : 0.96);
    const outerReachAtTop = Math.max(thighR * 0.86, pelvicOuterAtMerge - Math.abs(legX));
    const innerReachAtTop = Math.max(thighR * 0.62, Math.abs(legX) - 0.009);

    const legFracs = [
      0.00, // malleoli ankle
      0.09, // Achilles tendon narrowest waist
      0.24, // soleus lower calf transition
      0.35, // gastrocnemius calf belly peak
      0.44, // upper calf taper
      kneeFrac, // patella / popliteal knee joint
      kneeFrac + 0.08, // suprapatellar / vastus medialis teardrop
      kneeFrac + 0.21, // lower-mid thigh
      kneeFrac + 0.34, // quadriceps mid-upper sweep
      0.93, // sub-gluteal / adductor upper thigh
      1.00, // groin cobordism merge ring
    ];

    for (let i = 0; i < legFracs.length; i++) {
      const f = legFracs[i];
      const y = ankleY + legSpan * f;
      const ring = [];

      // Base anatomical radius curve
      let baseR;
      if (f <= 0.09) {
        const u = f / 0.09;
        baseR = thighR * (0.37 * (1 - u) + 0.345 * u);
      } else if (f <= 0.35) {
        const u = smoothstep(0.09, 0.35, f);
        const calfPeak = female ? 0.66 : (kid ? 0.63 : 0.69);
        baseR = thighR * (0.345 * (1 - u) + calfPeak * u);
      } else if (f <= kneeFrac) {
        const u = smoothstep(0.35, kneeFrac, f);
        const calfPeak = female ? 0.66 : (kid ? 0.63 : 0.69);
        baseR = thighR * (calfPeak * (1 - u) + 0.585 * u);
      } else {
        const u = smoothstep(kneeFrac, 1.0, f);
        baseR = thighR * (0.585 * (1 - u) + 0.96 * u);
      }

      // Slight natural leg stance axis convergence (hip slightly wider than ankle, or straight runway line)
      const stanceOffset = side * (1 - f) * (-hipR * 0.03);
      const cx = legX + stanceOffset;
      // Subtle anatomical knee/calf S-profile in Z
      const cz = -0.006 * Math.sin(Math.PI * clamp(f / kneeFrac, 0, 1));

      const topBlend = smoothstep(0.74, 1.0, f);
      const calfWindow = bumpWindow(f, 0.34, 0.16);
      const ankleWindow = bumpWindow(f, 0.01, 0.04);
      const kneeWindow = bumpWindow(f, kneeFrac, 0.06);
      const quadWindow = bumpWindow(f, kneeFrac + 0.24, 0.20);

      for (let k = 0; k < N_LEG; k++) {
        const phi = (2 * Math.PI * k) / N_LEG;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        const isMedial = sinP * side < 0;

        let rx = baseR * 0.96;
        let rz = baseR * 1.02;

        // Malleoli ankle bony prominence
        rx += thighR * 0.032 * ankleWindow * Math.abs(sinP);

        // Gastrocnemius posterior muscle belly + sleek anterior shin
        if (cosP < 0) {
          rz += thighR * 0.10 * calfWindow * (-cosP) * (isMedial ? 1.08 : 0.96);
        } else {
          rz -= thighR * 0.035 * calfWindow * cosP;
        }

        // Patella cap (+Z) & popliteal hollow (-Z) at knee
        if (cosP > 0.3) {
          rz += thighR * 0.032 * kneeWindow * bumpWindow(phi, 0, 0.55);
        } else if (cosP < -0.3) {
          rz -= thighR * 0.025 * kneeWindow * (-cosP);
        }

        // Quadriceps anterior sweep & hamstring fullness
        if (cosP > 0) {
          rz += thighR * 0.055 * quadWindow * cosP;
        } else {
          rz += thighR * 0.045 * smoothstep(0.65, 1.0, f) * (-cosP);
        }

        // Smooth blend at top of thigh into D-shaped pelvic/groin junction (ZERO lateral shelf!)
        const targetRx = isMedial ? innerReachAtTop : outerReachAtTop;
        const targetRz = hipR * zScale * (cosP >= 0 ? 0.90 : 1.02);
        rx = rx * (1 - topBlend) + targetRx * topBlend;
        rz = rz * (1 - topBlend) + targetRz * topBlend;

        const x = cx + rx * sinP;
        // Slight groin arch lift on medial side at very top ring so leg merges cleanly into crotch saddle
        const medialArchY = (i === legFracs.length - 1 && isMedial) ? -span * 0.012 * Math.abs(sinP) : 0;
        const yVert = y + medialArchY;
        const z = cz + rz * cosP + (i === legFracs.length - 1 && !kid
          ? (female ? torsoZBump(yVert, phi, d) * 0.45 : maleTorsoZBump(yVert, phi, d) * 0.45)
          : 0);

        const sw = i <= 1 ? 0.58 : (i >= legFracs.length - 2 ? 0.85 : 0.24);
        ring.push(addVertex(x, yVert, z, sw, legWeightsAtY(yVert, side), false));
      }

      connectRings(prevRing, ring);
      prevRing = ring;
    }

    return prevRing; // 32-vertex top thigh ring
  }

  const topLegL = buildLegBranch(1);   // +X
  const topLegR = buildLegBranch(-1);  // -X

  // =========================================================================
  // 2. PELVIS & TORSO RINGS + GROIN PANTS-COBORDISM (N = 32)
  // =========================================================================
  function torsoWeightsAtY(y, x) {
    const waistY = lm.waistY;
    const chestY = lm.chestBoneY;
    const neckY = lm.neckBaseY;

    if (y < hipY + span * 0.16) {
      // Blend pelvis with subtle left/right hip influence laterally near lower pelvis
      const fSpine = smoothstep(hipY + span * 0.02, hipY + span * 0.28, y);
      const latFrac = clamp(Math.abs(x) / (hipR || 0.15), 0, 1) * (1 - smoothstep(hipY - span * 0.12, hipY + span * 0.06, y)) * 0.28;
      const bLeg = x >= 0 ? BONE_IDX.legL : BONE_IDX.legR;
      return [
        [BONE_IDX.pelvis, (1 - fSpine) * (1 - latFrac)],
        [BONE_IDX.spine, fSpine * (1 - latFrac)],
        [bLeg, latFrac],
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

  // Torso profile from pelvic base (hipY - span*0.07) up to axilla/clavicle (shoulderY - span*0.02)
  const torsoSlices = [
    // [y, rx, rzBase, sw]
    [hipY - span * 0.075, hipR * 0.985, hipR * 0.95, 0.85],  // T0: pelvic base (cobordism target)
    [hipY - span * 0.02,  hipR * 1.015, hipR * 0.99, 0.45],  // widest trochanter / gluteal apex
    [hipY + span * 0.06,  hipR * 0.995, hipR * 0.97, 0.30],  // iliac crest
    [hipY + span * 0.19,  hipR * 0.92 + waistR * 0.08, hipR * 0.91 + waistR * 0.09, 0.25],
    [hipY + span * 0.32,   hipR * 0.42 + waistR * 0.58, hipR * 0.44 + waistR * 0.56, 0.22],
    [hipY + span * 0.44,  waistR * 1.00, waistR * 0.98, 0.20], // natural waist anchor
    [hipY + span * 0.56,  waistR * 0.62 + chestR * 0.40, waistR * 0.65 + chestR * 0.37, 0.22], // lower ribcage
    [hipY + span * 0.65,  chestR * (female ? 0.97 : 1.01), chestR * 0.96, 0.22], // underbust / lower pecs
    [hipY + span * 0.74,  chestR * (female ? 1.01 : 1.05), chestR * (female ? 1.00 : 1.02), 0.24], // bust / chest anchor
    [hipY + span * 0.84,  chestR * (female ? 1.00 : 1.05), chestR * 0.93, 0.38], // axillary / upper chest
    [shoulderY - span * 0.045, chestR * (female ? 0.98 : 1.03), chestR * 0.86, 0.82], // shoulder/axilla trifurcation base
  ];

  function buildTorsoRing(y, rx, rzBase, sw, isTopAxilla = false) {
    const ring = [];
    for (let k = 0; k < N_TORSO; k++) {
      const phi = (2 * Math.PI * k) / N_TORSO;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      let x = rx * radCap * sinP;
      let z = rzBase * radCap * zScale * cosP;

      if (!kid) {
        z += (female ? torsoZBump(y, phi, d) : maleTorsoZBump(y, phi, d)) * bumpScale;
      }

      // Subtle anatomical spinal furrow along center back
      if (cosP < -0.7 && y > hipY + span * 0.12 && y < shoulderY - span * 0.04) {
        const furrow = bumpWindow(phi - Math.PI, 0, 0.16) + bumpWindow(phi + Math.PI, 0, 0.16);
        z += 0.0045 * furrow * bumpWindow(y, hipY + span * 0.52, span * 0.38);
      }

      // Subtle clavicle highlight on upper chest
      if (cosP > 0.4 && y > hipY + span * 0.82) {
        const clavLobe = bumpWindow(phi, 0.45, 0.36) + bumpWindow(phi, -0.45, 0.36);
        z += 0.004 * clavLobe * smoothstep(hipY + span * 0.80, shoulderY, y);
      }

      // At the axillary/shoulder split ring, gently tuck armpit bottom & round lateral deltoid entry
      let yLocal = y;
      if (isTopAxilla) {
        const lat = Math.abs(sinP);
        yLocal -= span * 0.018 * Math.pow(lat, 3);
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
    false
  );

  // Build 15-vertex Sagittal Groin / Perineal / Intergluteal Saddle Chain M_1..M_15
  // connecting pelvisRing[0] (front pubic symphysis) down under the crotch and up to pelvisRing[16] (sacrum).
  const p0Idx = pelvisRing[0];
  const p16Idx = pelvisRing[16];
  const p0Z = positions[p0Idx * 3 + 2];
  const p0Y = positions[p0Idx * 3 + 1];
  const p16Z = positions[p16Idx * 3 + 2];
  const p16Y = positions[p16Idx * 3 + 1];
  const crotchArchY = crotchMergeY + span * 0.016;

  const groinMid = []; // M_1 .. M_15
  for (let j = 1; j <= 15; j++) {
    const u = j / 16; // 0 = front, 0.5 = perineum center, 1 = back sacrum
    const z = p0Z * (1 - u) + p16Z * u;
    const endY = p0Y * (1 - u) + p16Y * u;
    const archDip = Math.sin(Math.PI * u);
    const y = endY * (1 - archDip) + crotchArchY * archDip;
    groinMid.push(addVertex(0, y, z, 0.95, [[BONE_IDX.pelvis, 1]], false));
  }

  // Pants-cobordism rings above Left Leg (+X) and Right Leg (-X):
  // Exact 2-manifold edge cancellation across pelvisRing[0..31] and groinMid[0..14]!
  const upperLegL = [
    pelvisRing[0],
    ...pelvisRing.slice(1, 16),
    pelvisRing[16],
    ...[...groinMid].reverse(),
  ];
  const upperLegR = [
    pelvisRing[0],
    ...groinMid,
    pelvisRing[16],
    ...pelvisRing.slice(17, 32),
  ];

  connectRings(topLegL, upperLegL);
  connectRings(topLegR, upperLegR);

  // Extrude Pelvis -> Chest -> Axilla
  let prevTorsoRing = pelvisRing;
  for (let i = 1; i < torsoSlices.length; i++) {
    const [y, rx, rzBase, sw] = torsoSlices[i];
    const nextRing = buildTorsoRing(y, rx, rzBase, sw, i === torsoSlices.length - 1);
    connectRings(prevTorsoRing, nextRing);
    prevTorsoRing = nextRing;
  }
  const axillaRing = prevTorsoRing; // 32 vertices

  // =========================================================================
  // 3. SHOULDER TRIFURCATION COBORDISM -> NECK (32) + LEFT ARM (20) + RIGHT ARM (20)
  // =========================================================================
  // Left shoulder saddle SL_1..SL_9 connects axillaRing[3] (front-left clavicle)
  // over the acromion/trapezius ridge to axillaRing[13] (back-left scapula).
  // Right shoulder saddle SR_1..SR_9 connects axillaRing[29] (front-right clavicle)
  // over the acromion/trapezius ridge to axillaRing[19] (back-right scapula).
  function buildShoulderSaddle(frontIdx, backIdx, side) {
    const fx = positions[frontIdx * 3], fy = positions[frontIdx * 3 + 1], fz = positions[frontIdx * 3 + 2];
    const bx = positions[backIdx * 3], by = positions[backIdx * 3 + 1], bz = positions[backIdx * 3 + 2];
    const bArm = side > 0 ? BONE_IDX.armL : BONE_IDX.armR;
    const saddle = [];
    for (let j = 1; j <= 9; j++) {
      const u = j / 10; // 0 = front clavicle, 0.5 = top shoulder ridge, 1 = back scapula
      const arch = Math.sin(Math.PI * u);
      const acromionX = side * shoulderHalf * 0.82;
      const x = (fx * (1 - u) + bx * u) * (1 - 0.65 * arch) + acromionX * (0.65 * arch);
      const y = (fy * (1 - u) + by * u) + span * 0.095 * arch;
      const z = (fz * (1 - u) + bz * u) * (1 - 0.14 * arch);
      saddle.push(addVertex(x, y, z, 0.92, [[BONE_IDX.chest, 0.72], [bArm, 0.20], [BONE_IDX.neck, 0.08]], false));
    }
    return saddle;
  }

  const saddleL = buildShoulderSaddle(axillaRing[3], axillaRing[13], 1);
  const saddleR = buildShoulderSaddle(axillaRing[29], axillaRing[19], -1);

  // 20-vertex Left Arm Base Ring: [axillaRing[3..13], SL_9..SL_1]
  const armBaseL = [
    ...axillaRing.slice(3, 14),
    ...[...saddleL].reverse(),
  ];
  // 20-vertex Right Arm Base Ring: [axillaRing[19..29], SR_1..SR_9]
  const armBaseR = [
    ...axillaRing.slice(19, 30),
    ...saddleR,
  ];
  // 32-vertex Neck Base Ring: [axillaRing[0..3], SL_1..SL_9, axillaRing[13..19], SR_9..SR_1, axillaRing[29..31]]
  const neckBaseRing = [
    ...axillaRing.slice(0, 4),
    ...saddleL,
    ...axillaRing.slice(13, 20),
    ...[...saddleR].reverse(),
    ...axillaRing.slice(29, 32),
  ];

  // =========================================================================
  // 4. ARMS, FOREARMS & CONTOURED RUNWAY HANDS (N = 20 per arm)
  // =========================================================================
  function armWeightsAtOffset(dyDown, side) {
    // dyDown = distance below shoulderPivotY along -Y in bind pose
    const bArm = side > 0 ? BONE_IDX.armL : BONE_IDX.armR;
    const bElbow = side > 0 ? BONE_IDX.elbowL : BONE_IDX.elbowR;
    const bHand = side > 0 ? BONE_IDX.handL : BONE_IDX.handR;
    const upperLen = lm.upperArmLen;
    const foreLen = lm.forearmLen;

    if (dyDown < 0.04) {
      const f = smoothstep(-0.03, 0.045, dyDown);
      return [[BONE_IDX.chest, 1 - f], [bArm, f]];
    }
    if (dyDown < upperLen + 0.035) {
      const f = smoothstep(upperLen - 0.035, upperLen + 0.035, dyDown);
      return [[bArm, 1 - f], [bElbow, f]];
    }
    const wristDist = upperLen + foreLen;
    const fHand = smoothstep(wristDist - 0.025, wristDist + 0.020, dyDown);
    return [[bElbow, 1 - fHand], [bHand, fHand]];
  }

  function buildArmAndHandBranch(baseRing, side) {
    // Angle mapping around the 20-vertex arm ring so every vertex stays untwisted from axillaRing:
    // For Left Arm (+X, s = 1):
    //   k=0 -> front (+Z, phi=0), k=5 -> medial armpit (-X_local), k=10 -> back (-Z, phi=PI), k=15 -> outer deltoid (+X_local)
    // For Right Arm (-X, s = -1):
    //   k=0 -> back (-Z, phi=PI), k=5 -> medial armpit (+X_local), k=10 -> front (+Z, phi=0), k=15 -> outer deltoid (-X_local)
    const sx = side * lm.shoulderPivotX;
    const sy = lm.shoulderPivotY;
    const upperLen = lm.upperArmLen;
    const foreLen = lm.forearmLen;
    const wristDist = upperLen + foreLen;
    const wristR = upperR * (female ? 0.34 : 0.36);
    const palmLen = wristR * 2.05;
    const fingerLen = wristR * 2.55;

    const armStops = [
      // [dyDown, rMedLat, rAntPost, xShiftOut, zShift, sw]
      [0.014, upperR * 0.95, upperR * 0.98, 0.0, 0.0, 0.85],                            // deltoid cap
      [upperLen * 0.18, upperR * 0.98, upperR * 1.00, side * upperR * 0.02, 0.0, 0.55], // deltoid insertion
      [upperLen * 0.46, upperR * 0.92, upperR * 0.97, side * upperR * 0.02, 0.002, 0.28], // bicep / tricep mid
      [upperLen * 0.78, upperR * 0.80, upperR * 0.82, side * upperR * 0.01, 0.001, 0.22], // distal brachium
      [upperLen,        upperR * 0.71, upperR * 0.70, 0.0, -0.002, 0.25],              // elbow joint
      [upperLen + foreLen * 0.18, upperR * 0.74, upperR * 0.76, 0.0, 0.002, 0.22],     // brachioradialis swell
      [upperLen + foreLen * 0.48, upperR * 0.61, upperR * 0.64, 0.0, 0.002, 0.20],     // mid forearm
      [upperLen + foreLen * 0.80, upperR * 0.45, upperR * 0.50, 0.0, 0.001, 0.20],     // distal forearm
      [wristDist,                 wristR * 0.82, wristR * 1.12, 0.0, 0.0, 0.30],       // oval carpal wrist (flat med-lat, wide ant-post)
      [wristDist + palmLen * 0.48, wristR * 0.66, wristR * 1.38, -side * wristR * 0.06, wristR * 0.12, 0.45], // proximal palm + thenar swell
      [wristDist + palmLen * 0.92, wristR * 0.56, wristR * 1.34, -side * wristR * 0.12, wristR * 0.04, 0.65], // metacarpal web split
    ];

    let prev = baseRing;
    for (let sIdx = 0; sIdx < armStops.length; sIdx++) {
      const [dy, rML, rAP, xOff, zOff, sw] = armStops[sIdx];
      const ring = [];
      for (let k = 0; k < N_ARM; k++) {
        const theta = (2 * Math.PI * k) / N_ARM;
        // Local cross-section coordinates matching baseRing's exact half-edge order:
        // Left (+1):  zDir = cos(theta), xDir = -sin(theta)  (k=5 -> -X medial, k=15 -> +X lateral)
        // Right (-1): zDir = -cos(theta), xDir = +sin(theta) (k=5 -> +X medial, k=15 -> -X lateral)
        const zDir = side > 0 ? Math.cos(theta) : -Math.cos(theta);
        const xDir = side > 0 ? -Math.sin(theta) : Math.sin(theta);

        let rx = rML;
        let rz = rAP;
        // Subtle olecranon point at back of elbow
        if (sIdx === 4 && zDir < -0.5) rz *= 1.07;
        // Subtle thenar muscle fullness on thumb-palmar quadrant of palm
        if (sIdx >= 9 && zDir > 0.2 && xDir * side < 0) {
          rx *= 1.12;
          rz *= 1.08;
        }

        // Smooth oblique-to-horizontal plane transition on top deltoid ring
        const latSign = xDir * side; // +1 at lateral deltoid, -1 at medial axilla
        const capTiltY = sIdx === 0 ? (latSign > 0 ? upperR * 0.14 * latSign : upperR * 0.06 * latSign) : 0;

        const x = sx + xOff + rx * xDir;
        const y = sy - dy + capTiltY;
        const z = zOff + rz * zDir;
        ring.push(addVertex(x, y, z, sw, armWeightsAtOffset(dy, side), false));
      }
      connectRings(prev, ring);
      prev = ring;
    }

    const palmSplitRing = prev; // 20 vertices
    const bHand = side > 0 ? BONE_IDX.handL : BONE_IDX.handR;
    const handWeights = [[bHand, 1]];

    // Pants-cobordism thumb-web split at the first interdigital space:
    // On Left Hand (+1), thumb is centered at k = 0 (indices 18,19,0,1,2).
    // On Right Hand (-1), thumb is centered at k = 10 (indices 8,9,10,11,12).
    const webStartIdx = side > 0 ? 2 : 12;
    const webEndIdx = side > 0 ? 18 : 8;
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
        palmSplitRing[18], palmSplitRing[19], palmSplitRing[0], palmSplitRing[1], palmSplitRing[2],
        ...webVerts,
      ]; // 8 vertices
      fingersBase = [
        ...palmSplitRing.slice(2, 19),
        ...[...webVerts].reverse(),
      ]; // 20 vertices
    } else {
      thumbBase = [
        palmSplitRing[8], palmSplitRing[9], palmSplitRing[10], palmSplitRing[11], palmSplitRing[12],
        ...webVerts,
      ]; // 8 vertices
      fingersBase = [
        ...palmSplitRing.slice(12, 20),
        ...palmSplitRing.slice(0, 9),
        ...[...webVerts].reverse(),
      ]; // 20 vertices
    }

    // Extrude 8-vertex Thumb (2 phalanges + rounded tip)
    let tPrev = thumbBase;
    // Compute thumb base centroid
    let tcx = 0, tcy = 0, tcz = 0;
    for (const vid of thumbBase) {
      tcx += positions[vid * 3];
      tcy += positions[vid * 3 + 1];
      tcz += positions[vid * 3 + 2];
    }
    tcx /= 8; tcy /= 8; tcz /= 8;

    const thumbLen = wristR * 1.45;
    for (const [f, radScale] of [[0.52, 0.78], [0.92, 0.56]]) {
      const tRing = [];
      const cx = tcx - side * wristR * 0.14 * f;
      const cy = tcy - thumbLen * f;
      const cz = tcz + wristR * 0.55 * f;
      for (let k = 0; k < 8; k++) {
        // Offset around thumb centroid preserving exact rotational order of thumbBase
        const vx = positions[thumbBase[k] * 3] - tcx;
        const vz = positions[thumbBase[k] * 3 + 2] - tcz;
        tRing.push(addVertex(
          cx + vx * radScale,
          cy,
          cz + vz * radScale,
          0.35,
          handWeights,
          false
        ));
      }
      connectRings(tPrev, tRing);
      tPrev = tRing;
    }
    const thumbTip = addVertex(
      tcx - side * wristR * 0.18,
      tcy - thumbLen * 1.08,
      tcz + wristR * 0.64,
      0.30,
      handWeights,
      false
    );
    capBottom(thumbTip, tPrev); // Wait: let's verify thumb/finger cap winding!
    // NOTE: In connectRings(prev, ring) down the arm, `prev` is ABOVE `ring` (y decreases!).
    // Earlier we checked: along the arm, `AL_base -> AL_next` (going DOWN the arm) used `connectRings(AL_base, AL_next)`
    // and produced OUTWARD normals! In `connectRings(a, b)`, `b` is the second argument, so closing `b` at the distal end
    // uses `capTop(b, tip)` (edges `b[k] -> b[k+1] -> tip`), NOT `capBottom`!
    // Let's undo those 8 triangles and use `capTop(tPrev, thumbTip)`!
    indices.length -= 8 * 3;
    capTop(tPrev, thumbTip);

    // Extrude 20-vertex Sculpted Runway Fingers Silhouette (graceful slight inward curl + interdigital flutes)
    let fcx = 0, fcy = 0, fcz = 0;
    for (const vid of fingersBase) {
      fcx += positions[vid * 3];
      fcy += positions[vid * 3 + 1];
      fcz += positions[vid * 3 + 2];
    }
    fcx /= 20; fcy /= 20; fcz /= 20;

    let fPrev = fingersBase;
    const fingerStops = [
      [0.36, 0.90, 0.84, -side * wristR * 0.10],
      [0.70, 0.78, 0.68, -side * wristR * 0.24],
      [0.94, 0.56, 0.48, -side * wristR * 0.36],
    ];
    for (const [f, zScaleF, xScaleF, curlX] of fingerStops) {
      const fRing = [];
      const cy = fcy - fingerLen * f;
      const cx = fcx + curlX;
      const cz = fcz - wristR * 0.08 * f;
      for (let k = 0; k < 20; k++) {
        const dx0 = positions[fingersBase[k] * 3] - fcx;
        const dz0 = positions[fingersBase[k] * 3 + 2] - fcz;
        // Subtle 4-finger interdigital fluting along dorsal/palmar faces
        const flute = 1 - 0.06 * Math.cos((dz0 / (wristR * 1.2 || 0.02)) * Math.PI * 3.5);
        // Middle fingers longer than index/pinky (arch profile at distal ring)
        const archLen = (1 - Math.pow(clamp(dz0 / (wristR * 1.3 || 0.02), -1, 1), 2)) * fingerLen * 0.10 * f;
        fRing.push(addVertex(
          cx + dx0 * xScaleF * flute,
          cy - archLen,
          cz + dz0 * zScaleF,
          0.25,
          handWeights,
          false
        ));
      }
      connectRings(fPrev, fRing);
      fPrev = fRing;
    }
    const fingerTip = addVertex(
      fcx - side * wristR * 0.42,
      fcy - fingerLen * 1.06,
      fcz - wristR * 0.06,
      0.25,
      handWeights,
      false
    );
    capTop(fPrev, fingerTip);
  }

  buildArmAndHandBranch(armBaseL, 1);
  buildArmAndHandBranch(armBaseR, -1);

  // =========================================================================
  // 5. NECK -> SUBMENTAL JAW -> SCULPTED HUMAN FACE & EARS -> CRANIUM (N = 32)
  // =========================================================================
  const neckSpan = Math.max(0.04, neckTopY - shoulderY);
  const headCenterY = neckTopY + headH * 0.50;

  // Neck transition rings from shoulder collar up to submental jaw base
  const neckSpecs = [
    [shoulderY + neckSpan * 0.26, neckR * 1.12, neckR * 1.10, 0.002, 0.55],
    [shoulderY + neckSpan * 0.58, neckR * 0.98, neckR * 1.00, 0.006, 0.35],
    [shoulderY + neckSpan * 0.88, neckR * 0.93, neckR * 0.98, 0.010, 0.40],
  ];

  let prevHeadRing = neckBaseRing;
  for (const [ny, nrx, nrz, zShift, sw] of neckSpecs) {
    const ring = [];
    const fHead = smoothstep(shoulderY + neckSpan * 0.65, neckTopY + headH * 0.12, ny);
    const fNeck = smoothstep(shoulderY - 0.02, shoulderY + neckSpan * 0.35, ny);
    const wChest = Math.max(0, 1 - fNeck) * 0.35;
    const wHead = fHead * 0.35;
    const wNeck = Math.max(0, 1 - wChest - wHead);
    const weights = [[BONE_IDX.neck, wNeck], [BONE_IDX.chest, wChest], [BONE_IDX.head, wHead]];

    for (let k = 0; k < 32; k++) {
      const phi = (2 * Math.PI * k) / 32;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      // Subtle sternocleidomastoid side-front definition
      const scm = 1 + 0.03 * (bumpWindow(phi, 0.65, 0.35) + bumpWindow(phi, -0.65, 0.35));
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

  // Sculpted Anatomical Head Slices (local yRel in [-0.47, +0.50] * headH around headCenterY)
  const headSlices = [
    // [yFrac, baseRadiusFrac, zCenterShiftFrac, sw]
    [-0.47, 0.235, 0.032, 0.46], // submental throat root
    [-0.42, 0.268, 0.045, 0.30], // submental slope under mandible
    [-0.37, 0.298, 0.050, 0.16], // chin (mentum) & lower mandible
    [-0.31, 0.324, 0.038, 0.09], // mentolabial sulcus & gonial jaw angle
    [-0.25, 0.342, 0.030, 0.05], // lower lip
    [-0.20, 0.352, 0.030, 0.05], // mouth rima / oral commissures
    [-0.16, 0.362, 0.030, 0.05], // upper lip & Cupid's bow
    [-0.10, 0.372, 0.020, 0.05], // subnasale & alar nostrils
    [-0.04, 0.386, 0.010, 0.05], // nasal tip & zygomatic arch
    [0.03,  0.396, 0.000, 0.05], // orbital eye sockets & nasal bridge
    [0.09,  0.406, 0.000, 0.06], // supraorbital brow ridge
    [0.18,  0.410, -0.008, 0.10], // frontal forehead
    [0.29,  0.392, -0.015, 0.12], // upper forehead / parietal
    [0.39,  0.332, -0.016, 0.15], // parietal vault
    [0.46,  0.212, -0.010, 0.18], // crown arch
  ];

  const headWidthScale = kid ? 0.85 : (female ? 0.81 : 0.83);
  const headDepthScale = 0.92;

  for (const [yf, rf, zf, sw] of headSlices) {
    const yLocal = yf * headH;
    const yWorld = headCenterY + yLocal;
    const rBase = rf * headH;
    const zShift = zf * headH;
    const fHead = smoothstep(-0.46 * headH, -0.34 * headH, yLocal);
    const weights = [[BONE_IDX.head, 0.45 + 0.55 * fHead], [BONE_IDX.neck, 0.55 * (1 - fHead)]];

    const ring = [];
    for (let k = 0; k < 32; k++) {
      const phi = (2 * Math.PI * k) / 32;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      let x = rBase * sinP * headWidthScale;
      let zRaw = rBase * cosP * headDepthScale;
      let dz = 0;
      let dx = 0;

      // 1. Supraorbital brow ridge
      const browAmp = headH * (category === "men" ? 0.024 : (kid ? 0.012 : 0.016));
      dz += browAmp * bumpWindow(yLocal, headH * 0.085, headH * 0.055) * bumpWindow(phi, 0, 0.62);

      // 2. Recessed almond orbital eye sockets
      const orbitAmp = -headH * 0.028;
      const orbitLobe = bumpWindow(phi, 0.38, 0.22) + bumpWindow(phi, -0.38, 0.22);
      dz += orbitAmp * bumpWindow(yLocal, headH * 0.03, headH * 0.060) * orbitLobe;

      // 3. Nasal bridge & dorsum
      const noseAmp = headH * (category === "men" ? 0.060 : (kid ? 0.042 : 0.052));
      dz += noseAmp * bumpWindow(yLocal, -headH * 0.03, headH * 0.095) * bumpWindow(phi, 0, 0.16);

      // 4. Refined nasal tip & subtle alar wings
      const tipAmp = headH * (category === "men" ? 0.034 : (kid ? 0.024 : 0.030));
      dz += tipAmp * bumpWindow(yLocal, -headH * 0.09, headH * 0.048) * bumpWindow(phi, 0, 0.14);
      const alarLobe = bumpWindow(phi, 0.16, 0.09) + bumpWindow(phi, -0.16, 0.09);
      dz += headH * 0.013 * bumpWindow(yLocal, -headH * 0.10, headH * 0.035) * alarLobe;

      // 5. Upper lip with Cupid's bow & subtle oral rima groove
      const cupid = 1 - 0.18 * bumpWindow(phi, 0, 0.06);
      dz += headH * 0.022 * cupid * bumpWindow(yLocal, -headH * 0.165, headH * 0.038) * bumpWindow(phi, 0, 0.27);
      dz -= headH * 0.008 * bumpWindow(yLocal, -headH * 0.205, headH * 0.022) * bumpWindow(phi, 0, 0.25);

      // 6. Lower lip & mentolabial sulcus
      dz += headH * 0.022 * bumpWindow(yLocal, -headH * 0.245, headH * 0.038) * bumpWindow(phi, 0, 0.24);
      dz -= headH * 0.012 * bumpWindow(yLocal, -headH * 0.305, headH * 0.035) * bumpWindow(phi, 0, 0.26);

      // 7. Chin (mentum) & jawline taper
      const chinAmp = headH * (category === "men" ? 0.036 : (kid ? 0.022 : 0.028));
      dz += chinAmp * bumpWindow(yLocal, -headH * 0.365, headH * 0.065) * bumpWindow(phi, 0, 0.34);
      if (category === "men") {
        // Slightly stronger mandibular angle for men
        const jawLobe = bumpWindow(phi, 0.95, 0.35) + bumpWindow(phi, -0.95, 0.35);
        dx += Math.sign(sinP) * headH * 0.016 * bumpWindow(yLocal, -headH * 0.30, headH * 0.09) * jawLobe;
      }

      // 8. Zygomatic cheekbones
      const cheekAmp = headH * (female ? 0.020 : 0.016);
      const cheekLobe = bumpWindow(phi, 0.62, 0.30) + bumpWindow(phi, -0.62, 0.30);
      dz += cheekAmp * bumpWindow(yLocal, -headH * 0.035, headH * 0.085) * cheekLobe;

      // 9. Integrated sculpted human ears (at phi ~ +-1.65 rad)
      const earLobe = bumpWindow(phi, 1.66, 0.20) + bumpWindow(phi, -1.66, 0.20);
      const earYWin = bumpWindow(yLocal, -headH * 0.02, headH * 0.11);
      dx += Math.sign(sinP) * headH * 0.042 * earLobe * earYWin;
      dz -= headH * 0.014 * earLobe * earYWin;

      // 10. Occipital cranial fullness at back of skull
      const backWeight = Math.max(0, -cosP);
      dz -= headH * 0.044 * bumpWindow(yLocal, headH * 0.12, headH * 0.26) * backWeight;

      ring.push(addVertex(x + dx, yWorld, zShift + zRaw + dz, sw, weights, false));
    }

    connectRings(prevHeadRing, ring);
    prevHeadRing = ring;
  }

  const cranialApex = addVertex(0, headCenterY + headH * 0.50, -headH * 0.02, 0.15, [[BONE_IDX.head, 1]], false);
  capTop(prevHeadRing, cranialApex);

  // =========================================================================
  // 6. VOLUME-PRESERVING TAUBIN SMOOTHING ON SADDLE JUNCTIONS
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

  for (let iter = 0; iter < 4; iter++) {
    laplacianStep(0.46);
    laplacianStep(-0.485);
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
function populateHeadFeatures(THREE, headBone, headH, category, customHairColor, bodyGeo = null, headCenterY = 0) {
  const female = category === "women" || category === "girls";
  const kid = category === "girls" || category === "boys";
  const headWidthScale = kid ? 0.85 : (female ? 0.81 : 0.83);
  const headDepthScale = 0.92;

  const hairColor = customHairColor != null ? customHairColor : (HUMAN_HAIR_PALETTE[category] || 0x241913);

  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf9f6f2, roughness: 0.16 });
  const irisColor = category === "women" ? 0x4b3222 : (category === "girls" ? 0x563926 : (category === "boys" ? 0x3b2a1d : 0x2d2018));
  const irisMat = new THREE.MeshStandardMaterial({ color: irisColor, roughness: 0.12 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x070708 });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const lipColor = category === "women" ? 0xbe6868 : (category === "girls" ? 0xc97b7c : (category === "boys" ? 0xb5776a : 0xad6e62));
  const lipMat = new THREE.MeshPhysicalMaterial({
    color: lipColor,
    roughness: 0.42,
    clearcoat: 0.14,
    clearcoatRoughness: 0.45,
    sheen: 0.0,
    side: THREE.DoubleSide,
  });

  const browMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.72 });
  const lashMat = new THREE.MeshStandardMaterial({ color: 0x181210, roughness: 0.55 });

  const hairMat = new THREE.MeshPhysicalMaterial({
    color: hairColor,
    roughness: 0.44,
    metalness: 0.04,
    sheen: 0.55,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(0x7c5842),
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

  // Analytical fallback + exact triangle-interpolated front skin surface Z at (xLocal, yLocal)
  function analyticFrontZ(yLocal, phi) {
    let rf = 0.396, zf = 0.0;
    if (yLocal < -headH * 0.22) { rf = 0.342; zf = 0.03; }
    else if (yLocal < -headH * 0.18) { rf = 0.352; zf = 0.03; }
    else if (yLocal < -headH * 0.13) { rf = 0.362; zf = 0.03; }
    else if (yLocal < headH * 0.06) { rf = 0.396; zf = 0.00; }
    else { rf = 0.406; zf = 0.00; }
    return zf * headH + rf * headH * Math.cos(phi) * headDepthScale;
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

  // Projects a geometry's vertices so every vertex sits cleanly outside the front skin triangles
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

  const eyePhi = 0.37;
  const ey = headH * 0.032;
  const ex = headH * 0.395 * Math.sin(eyePhi) * headWidthScale;

  [-1, 1].forEach((s) => {
    const eyeCenterX = s * ex;
    // Almond sclera conformed directly to the orbital skin surface (100% visible & symmetrical!)
    const scleraGeo = new THREE.SphereGeometry(headH * 0.045, 18, 14);
    scleraGeo.scale(0.98, 0.50, 0.22);
    scleraGeo.translate(eyeCenterX, ey, 0);
    projectGeoOntoFace(scleraGeo, headH * 0.0028, 0.55, -headH * 0.008);
    const sclera = new THREE.Mesh(scleraGeo, eyeWhiteMat);
    sclera.castShadow = false;
    headBone.add(sclera);

    const irisGeo = new THREE.SphereGeometry(headH * 0.0235, 16, 12);
    irisGeo.scale(0.96, 0.96, 0.18);
    irisGeo.translate(eyeCenterX * 0.985, ey - headH * 0.001, 0);
    projectGeoOntoFace(irisGeo, headH * 0.0095, 0.40, -headH * 0.003);
    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.castShadow = false;
    headBone.add(iris);

    const pupilGeo = new THREE.SphereGeometry(headH * 0.0125, 12, 10);
    pupilGeo.scale(0.96, 0.96, 0.14);
    pupilGeo.translate(eyeCenterX * 0.985, ey - headH * 0.001, 0);
    projectGeoOntoFace(pupilGeo, headH * 0.0125, 0.28, -headH * 0.001);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.castShadow = false;
    headBone.add(pupil);

    const gx = eyeCenterX * 0.985 + headH * 0.006;
    const gy = ey + headH * 0.005;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.0042, 8, 8), glintMat);
    glint.position.set(gx, gy, sampleHeadFrontZ(gx, gy) + headH * 0.0155);
    glint.castShadow = false;
    headBone.add(glint);

    // Delicate curved upper lash line hugging the upper eyelid border
    const l0x = s * (ex - headH * 0.043), l0y = ey - headH * 0.002;
    const l1x = s * ex,                   l1y = ey + headH * 0.024;
    const l2x = s * (ex + headH * 0.045), l2y = ey + (female ? headH * 0.002 : -headH * 0.002);
    const lashCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(l0x, l0y, sampleHeadFrontZ(l0x, l0y) + headH * 0.006),
      new THREE.Vector3(l1x, l1y, sampleHeadFrontZ(l1x, l1y) + headH * 0.011),
      new THREE.Vector3(l2x, l2y, sampleHeadFrontZ(l2x, l2y) + headH * 0.006),
    ]);
    const lashGeo = new THREE.TubeGeometry(lashCurve, 12, headH * (female ? 0.0038 : 0.0030), 6, false);
    const lash = new THREE.Mesh(lashGeo, lashMat);
    lash.castShadow = false;
    headBone.add(lash);

    // Tapered arched eyebrow hugging the supraorbital ridge
    const browY = ey + headH * 0.064;
    const b0x = s * (ex - headH * 0.050), b0y = browY - headH * 0.005;
    const b1x = s * (ex + headH * 0.008), b1y = browY + headH * 0.012;
    const b2x = s * (ex + headH * 0.060), b2y = browY - headH * 0.007;
    const browPts = [
      new THREE.Vector3(b0x, b0y, sampleHeadFrontZ(b0x, b0y) + headH * 0.006),
      new THREE.Vector3(b1x, b1y, sampleHeadFrontZ(b1x, b1y) + headH * 0.007),
      new THREE.Vector3(b2x, b2y, sampleHeadFrontZ(b2x, b2y) + headH * 0.006),
    ];
    const browCurve = new THREE.CatmullRomCurve3(browPts);
    const browRadius = headH * (category === "men" ? 0.0090 : 0.0065);
    const browGeo = new THREE.TubeGeometry(browCurve, 14, browRadius, 6, false);
    const bPos = browGeo.attributes.position;
    const tailPt = browPts[2];
    for (let i = 0; i < bPos.count; i++) {
      const vx = bPos.getX(i), vy = bPos.getY(i), vz = bPos.getZ(i);
      const distTail = Math.hypot(vx - tailPt.x, vy - tailPt.y, vz - tailPt.z);
      let nx = vx, ny = vy, nz = vz;
      if (distTail < headH * 0.045) {
        const shrink = clamp(distTail / (headH * 0.045), 0.25, 1);
        const cPt = browCurve.getPoint(0.88);
        nx = cPt.x + (vx - cPt.x) * shrink;
        ny = cPt.y + (vy - cPt.y) * shrink;
        nz = cPt.z + (vz - cPt.z) * shrink;
      }
      const zFloor = sampleHeadFrontZ(nx, ny) + headH * 0.0020;
      bPos.setXYZ(i, nx, ny, Math.max(nz, zFloor));
    }
    bPos.needsUpdate = true;
    browGeo.computeVertexNormals();
    const brow = new THREE.Mesh(browGeo, browMat);
    brow.castShadow = false;
    headBone.add(brow);
  });

  // Closed, softly sculpted Cupid's-bow lips with tapered oral commissures
  const mouthY = -headH * 0.192;
  const mouthHalfW = headH * 0.064;
  const uLipCurve = new THREE.CatmullRomCurve3([
    [-mouthHalfW,        mouthY - headH * 0.002],
    [-mouthHalfW * 0.34, mouthY + headH * 0.011],
    [0,                  mouthY + headH * 0.007],
    [mouthHalfW * 0.34,  mouthY + headH * 0.011],
    [mouthHalfW,         mouthY - headH * 0.002],
  ].map(([lx, ly]) => new THREE.Vector3(lx, ly, sampleHeadFrontZ(lx, ly) + headH * 0.0040)));
  const uLipGeo = new THREE.TubeGeometry(uLipCurve, 20, headH * 0.0078, 8, false);
  const uPos = uLipGeo.attributes.position;
  for (let i = 0; i < uPos.count; i++) {
    const vx = uPos.getX(i), vy = uPos.getY(i), vz = uPos.getZ(i);
    const uParam = clamp((vx / mouthHalfW + 1) * 0.5, 0, 1);
    const cPt = uLipCurve.getPoint(uParam);
    const cornerTaper = 1 - 0.62 * Math.pow(clamp(Math.abs(vx) / mouthHalfW, 0, 1), 2);
    const ny = cPt.y + (vy - cPt.y) * cornerTaper;
    const nz = cPt.z + (vz - cPt.z) * cornerTaper;
    uPos.setXYZ(i, vx, ny, Math.max(nz, sampleHeadFrontZ(vx, ny) + headH * 0.0018));
  }
  uPos.needsUpdate = true;
  uLipGeo.computeVertexNormals();
  const uLip = new THREE.Mesh(uLipGeo, lipMat);
  uLip.castShadow = false;
  headBone.add(uLip);

  const lLipCurve = new THREE.CatmullRomCurve3([
    [-mouthHalfW * 0.94, mouthY - headH * 0.002],
    [0,                  mouthY - headH * 0.011],
    [mouthHalfW * 0.94,  mouthY - headH * 0.002],
  ].map(([lx, ly]) => new THREE.Vector3(lx, ly, sampleHeadFrontZ(lx, ly) + headH * 0.0048)));
  const lLipGeo = new THREE.TubeGeometry(lLipCurve, 18, headH * 0.0092, 8, false);
  const lPos = lLipGeo.attributes.position;
  for (let i = 0; i < lPos.count; i++) {
    const vx = lPos.getX(i), vy = lPos.getY(i), vz = lPos.getZ(i);
    const uParam = clamp((vx / (mouthHalfW * 0.94) + 1) * 0.5, 0, 1);
    const cPt = lLipCurve.getPoint(uParam);
    const cornerTaper = 1 - 0.65 * Math.pow(clamp(Math.abs(vx) / (mouthHalfW * 0.94), 0, 1), 2);
    const ny = cPt.y + (vy - cPt.y) * cornerTaper;
    const nz = cPt.z + (vz - cPt.z) * cornerTaper;
    lPos.setXYZ(i, vx, ny, Math.max(nz, sampleHeadFrontZ(vx, ny) + headH * 0.0020));
  }
  lPos.needsUpdate = true;
  lLipGeo.computeVertexNormals();
  const lLip = new THREE.Mesh(lLipGeo, lipMat);
  lLip.castShadow = false;
  headBone.add(lLip);

  // =========================================================================
  // Sculpted Couture Hair Shell (strictly outside cranial skin -> ZERO Z-fighting!)
  // =========================================================================
  function ensureOutsideCranium(geo, minClearance) {
    if (!headVertsLocal.length) return;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const r = Math.hypot(vx, vy, vz) || 1;
      const ux = vx / r, uy = vy / r, uz = vz / r;
      let maxSkullProj = 0;
      for (let j = 0; j < headVertsLocal.length; j++) {
        const hv = headVertsLocal[j];
        const hr = Math.hypot(hv[0], hv[1], hv[2]) || 1;
        const dot = (hv[0] * ux + hv[1] * uy + hv[2] * uz) / hr;
        if (dot > 0.92) {
          if (hr > maxSkullProj) maxSkullProj = hr;
        }
      }
      const targetMinR = maxSkullProj + minClearance;
      if (r < targetMinR) {
        const scale = targetMinR / r;
        pos.setXYZ(i, vx * scale, vy * scale, vz * scale);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  function buildSculptedHairCap(hairlineFrontYFrac, napeBottomYFrac, crownThickness) {
    const capGeo = new THREE.SphereGeometry(headH * 0.43, 36, 26);
    const pos = capGeo.attributes.position;
    const keepTris = [];
    const idx = capGeo.getIndex();

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const rOrig = Math.hypot(vx, vy, vz) || 1;
      const nx = vx / rOrig, ny = vy / rOrig, nz = vz / rOrig;
      const phi = Math.atan2(nx, nz);

      // Map onto cranial contour with natural hair volume strictly outside the skull
      const yLocal = ny * headH * 0.52;
      const crownLift = Math.max(0, ny) * headH * crownThickness;
      const backFullness = Math.max(0, -nz) * headH * 0.055;
      const sideFullness = Math.abs(nx) * headH * 0.032;

      const x = nx * headH * 0.445 * headWidthScale + Math.sign(nx) * sideFullness;
      const y = yLocal + crownLift;
      const z = nz * headH * 0.455 * headDepthScale - headH * 0.006 - backFullness;
      pos.setXYZ(i, x, y, z);

      // Open face window cleanly on +Z below hairline & around ears
      const earCut = (bumpWindow(phi, 1.66, 0.25) + bumpWindow(phi, -1.66, 0.25)) * headH * 0.13;
      const templeArch = bumpWindow(phi, 0.65, 0.35) + bumpWindow(phi, -0.65, 0.35);
      const frontCutY = headH * (hairlineFrontYFrac - 0.04 * templeArch) + earCut;
      const backCutY = headH * napeBottomYFrac;
      const faceWeight = smoothstep(-0.12, 0.42, Math.cos(phi));
      const minAllowedY = backCutY * (1 - faceWeight) + frontCutY * faceWeight;
      pos._keep = pos._keep || new Uint8Array(pos.count);
      pos._keep[i] = y >= minAllowedY ? 1 : 0;
    }

    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      if (pos._keep[a] && pos._keep[b] && pos._keep[c]) {
        keepTris.push(a, b, c);
      }
    }
    delete pos._keep;
    capGeo.setIndex(keepTris);
    ensureOutsideCranium(capGeo, headH * 0.016);
    const mesh = new THREE.Mesh(capGeo, hairMat);
    mesh.castShadow = true;
    return mesh;
  }

  if (category === "women") {
    // Sleek center-parted crown swept gracefully behind the ears into a low couture chignon bun
    headBone.add(buildSculptedHairCap(0.28, -0.30, 0.052));

    // Soft side-parted hairline sweep framing the upper crown/temples & tucking behind ears (strictly outside skull)
    [-1, 1].forEach((s) => {
      const sweepCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * headH * 0.04, headH * 0.42, headH * 0.33),
        new THREE.Vector3(s * headH * 0.25, headH * 0.33, headH * 0.26),
        new THREE.Vector3(s * headH * 0.37, headH * 0.14, headH * 0.04),
        new THREE.Vector3(s * headH * 0.30, -headH * 0.12, -headH * 0.24),
        new THREE.Vector3(s * headH * 0.10, -headH * 0.18, -headH * 0.42),
      ]);
      const sweepGeo = new THREE.TubeGeometry(sweepCurve, 20, headH * 0.044, 10, false);
      ensureOutsideCranium(sweepGeo, headH * 0.012);
      const sweep = new THREE.Mesh(sweepGeo, hairMat);
      sweep.castShadow = false;
      headBone.add(sweep);
    });

    // Sculpted low couture chignon at the occipital nape
    const chignon = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.21, 24, 18), hairMat);
    chignon.scale.set(1.18, 0.92, 0.88);
    chignon.position.set(0, -headH * 0.14, -headH * 0.45);
    chignon.castShadow = true;
    headBone.add(chignon);

    const twistWrap = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.15, headH * 0.036, 10, 20), hairMat);
    twistWrap.position.set(0, -headH * 0.14, -headH * 0.41);
    twistWrap.rotation.x = 0.22;
    headBone.add(twistWrap);
  } else if (category === "men") {
    // Tailored short tapered crop with sculpted crown wave above the hairline
    headBone.add(buildSculptedHairCap(0.30, -0.24, 0.046));

    const crownWaveCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-headH * 0.15, headH * 0.42, headH * 0.28),
      new THREE.Vector3(0,             headH * 0.46, headH * 0.32),
      new THREE.Vector3(headH * 0.16,  headH * 0.41, headH * 0.26),
    ]);
    const waveGeo = new THREE.TubeGeometry(crownWaveCurve, 16, headH * 0.046, 10, false);
    ensureOutsideCranium(waveGeo, headH * 0.014);
    const wave = new THREE.Mesh(waveGeo, hairMat);
    wave.castShadow = false;
    headBone.add(wave);
  } else if (category === "girls") {
    // Smooth crown hair + soft high-swept ponytails tucked behind ears
    headBone.add(buildSculptedHairCap(0.27, -0.26, 0.048));
    const tieMat = new THREE.MeshStandardMaterial({ color: 0xe0568c, roughness: 0.38 });

    [-1, 1].forEach((s) => {
      const tie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.052, headH * 0.018, 8, 16), tieMat);
      tie.position.set(s * headH * 0.33, headH * 0.06, -headH * 0.27);
      tie.rotation.y = s * 0.45;
      headBone.add(tie);

      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * headH * 0.34, headH * 0.06, -headH * 0.28),
        new THREE.Vector3(s * headH * 0.43, -headH * 0.14, -headH * 0.33),
        new THREE.Vector3(s * headH * 0.39, -headH * 0.44, -headH * 0.31),
      ]);
      const tailGeo = new THREE.TubeGeometry(tailCurve, 16, headH * 0.068, 10, false);
      const tp = tailGeo.attributes.position;
      const endPt = tailCurve.getPoint(1);
      for (let i = 0; i < tp.count; i++) {
        const vy = tp.getY(i);
        const f = smoothstep(headH * 0.04, -headH * 0.44, vy);
        const shrink = 1 - 0.68 * f;
        const cPt = tailCurve.getPoint(clamp(f, 0, 1));
        tp.setXYZ(
          i,
          cPt.x + (tp.getX(i) - cPt.x) * shrink,
          vy,
          cPt.z + (tp.getZ(i) - cPt.z) * shrink
        );
      }
      if (tp && endPt) tp.needsUpdate = true;
      tailGeo.computeVertexNormals();
      const tail = new THREE.Mesh(tailGeo, hairMat);
      tail.castShadow = true;
      headBone.add(tail);
    });
  } else {
    // Boys: neat side-parted youthful crop above the forehead hairline
    headBone.add(buildSculptedHairCap(0.29, -0.24, 0.046));
    const sideSweepCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-headH * 0.16, headH * 0.40, headH * 0.29),
      new THREE.Vector3(headH * 0.02,  headH * 0.44, headH * 0.33),
      new THREE.Vector3(headH * 0.18,  headH * 0.38, headH * 0.27),
    ]);
    const fringeGeo = new THREE.TubeGeometry(sideSweepCurve, 14, headH * 0.040, 8, false);
    ensureOutsideCranium(fringeGeo, headH * 0.014);
    const fringe = new THREE.Mesh(fringeGeo, hairMat);
    fringe.castShadow = false;
    headBone.add(fringe);
  }
}

/**
 * Applies a named static fashion/simulation pose to the skeleton.
 * Note on Three.js right-hand coordinate system (limbs hanging along -Y):
 * - Around +Z: positive rotation.z moves -Y toward +X!
 *   So `arm1` (+X side) abducts outward with POSITIVE rotation.z (+angle),
 *   and `arm-1` (-X side) abducts outward with NEGATIVE rotation.z (-angle).
 * - Around +X: positive rotation.x moves -Y toward -Z (backward extension / knee flexion);
 *   negative rotation.x moves -Y toward +Z (forward hip flexion / elbow flexion).
 */
export function applyMannequinPose(limbs, pose = "standing", dims = null) {
  if (!limbs) return;
  // Reset all rotations first
  Object.values(limbs).forEach((b) => {
    if (b && b.rotation) b.rotation.set(0, 0, 0);
  });
  if (limbs.pelvis && dims) {
    limbs.pelvis.position.set(0, dims.hipY, 0);
  }

  const p = pose || "standing";
  if (p === "standing") {
    limbs.arm1.rotation.z = 0.085;
    limbs["arm-1"].rotation.z = -0.085;
    limbs.elbow1.rotation.x = -0.10;
    limbs["elbow-1"].rotation.x = -0.10;
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
    // Flex hips forward (-PI/2) and flex knees backward (+PI/2) so calves hang vertically
    limbs.leg1.rotation.x = -Math.PI / 2;
    limbs["leg-1"].rotation.x = -Math.PI / 2;
    limbs.knee1.rotation.x = Math.PI / 2;
    limbs["knee-1"].rotation.x = Math.PI / 2;
  }
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
  const dims = computeHumanBodyDims(category, measurementsOrDims, options.landmarks);
  const skinMat = options.skinMaterial || createHumanSkinMaterial(THREE, category, options.skinColor);

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

  populateHeadFeatures(THREE, rig.limbs.head, dims.headH, category, options.hairColor, bodyGeo, rig.landmarks.headCenterY);
  applyMannequinPose(rig.limbs, options.pose || "standing", dims);
  group.updateMatrixWorld(true);
  rig.skeleton.update();

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
