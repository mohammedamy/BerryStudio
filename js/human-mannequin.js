import {
  getHairHighlightSpec,
  getHairLengthSpec,
  getHairTypeSpec,
  getHeadwearFabricSpec,
  getHeadwearLengthSpec,
  getHeadwearSpec,
  hexToInt,
} from "./mannequin-styling.js";

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

function lerp(a, b, t) {
  return a + (b - a) * t;
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
  const m = d.morph || null;
  const bustScale = m && m.bustScale != null ? m.bustScale : 1.0;
  const lumbarScale = m && m.lumbarScale != null ? m.lumbarScale : 1.0;
  const gluteScale = m && m.gluteFullness != null ? m.gluteFullness : 1.0;
  return {
    breast: {
      centerY: hipY + span * 0.715,
      halfWidth: span * 0.165,
      amplitude: (kid ? chestR * 0.035 : chestR * 0.160) * bustScale,
      phi0: 0.46,
      phiHalfWidth: 0.46,
    },
    lumbar: {
      centerY: hipY + span * 0.39,
      halfWidth: span * 0.17,
      amplitude: waistR * (kid ? 0.065 : 0.105) * lumbarScale,
    },
    glute: {
      centerY: hipY - span * 0.030,
      halfWidth: span * 0.175,
      amplitude: hipR * (kid ? 0.095 : 0.140) * gluteScale,
    },
  };
}

export function torsoZBump(y, phi, d) {
  const { breast, lumbar, glute } = femaleTorsoSculpt(d);
  let dz = 0;
  // Natural teardrop bust contour: gentle upper pole slope, smooth lower underbust curve
  const lobe = bumpWindow(phi, breast.phi0, breast.phiHalfWidth) + bumpWindow(phi, -breast.phi0, breast.phiHalfWidth);
  const yRel = (y - breast.centerY) / (breast.halfWidth || 1);
  const teardrop = yRel > 0 ? Math.max(0, 1 - yRel * 0.22) : 1 + Math.min(0.14, -yRel * 0.12);
  dz += breast.amplitude * bumpWindow(y, breast.centerY, breast.halfWidth) * lobe * teardrop;

  // Soft lower-abdominal fullness with subtle navel indentation
  if (!d.kid) {
    const bellyScale = clamp(d.morph?.bellyFullness ?? 1.0, 0.45, 2.8);
    const bellyWin = bumpWindow(y, d.hipY + d.span * 0.21, d.span * 0.16) * bumpWindow(phi, 0, 0.72);
    dz += d.waistR * 0.038 * bellyScale * bellyWin;
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
  const m = d.morph || null;
  const chestScale = m && m.bustScale != null ? m.bustScale : 1.0;
  const lumbarScale = m && m.lumbarScale != null ? m.lumbarScale : 1.0;
  const gluteScale = m && m.gluteFullness != null ? m.gluteFullness : 1.0;
  return {
    chest: {
      centerY: hipY + span * 0.74,
      halfWidth: span * 0.155,
      amplitude: chestR * (kid ? 0.045 : 0.098) * chestScale,
      phiHalfWidth: 0.84,
    },
    lumbar: {
      centerY: hipY + span * 0.39,
      halfWidth: span * 0.16,
      amplitude: waistR * (kid ? 0.055 : 0.075) * lumbarScale,
    },
    glute: {
      centerY: hipY - span * 0.035,
      halfWidth: span * 0.165,
      amplitude: hipR * (kid ? 0.085 : 0.112) * gluteScale,
    },
  };
}

export function maleTorsoZBump(y, phi, d) {
  const { chest, lumbar, glute } = maleTorsoSculpt(d);
  let dz = 0;
  const pecLobe = bumpWindow(phi, 0.44, 0.40) + bumpWindow(phi, -0.44, 0.40);
  dz += chest.amplitude * bumpWindow(y, chest.centerY, chest.halfWidth) * (pecLobe * 0.84 + bumpWindow(phi, 0, chest.phiHalfWidth) * 0.28);
  if (!d.kid) {
    const bellyScale = clamp(d.morph?.bellyFullness ?? 1.0, 0.45, 2.8);
    dz += d.waistR * 0.024 * bellyScale * bumpWindow(y, d.hipY + d.span * 0.46, d.span * 0.16) * bumpWindow(phi, 0, 0.58);
  }
  const backWeight = Math.max(0, -Math.cos(phi));
  dz += lumbar.amplitude * bumpWindow(y, lumbar.centerY, lumbar.halfWidth) * backWeight;
  const gluteCleft = 1 - 0.22 * bumpWindow(phi - Math.PI, 0, 0.17) - 0.22 * bumpWindow(phi + Math.PI, 0, 0.17);
  const gluteRound = Math.pow(bumpWindow(y, glute.centerY, glute.halfWidth), 0.85);
  dz -= glute.amplitude * gluteRound * Math.pow(backWeight, 0.9) * gluteCleft;
  return dz;
}

const HEAD_PROPORTION_REF = Object.freeze({
  women: { height: 167, shoulder: 39, neck: 37, chest: 88, baseRatio: 0.130, widthScale: 0.78, depthScale: 0.92, defaultShoulderYFrac: 0.822 },
  men:   { height: 178, shoulder: 46, neck: 40, chest: 100, baseRatio: 0.130, widthScale: 0.81, depthScale: 0.92, defaultShoulderYFrac: 0.822 },
  girls: { height: 134, shoulder: 31, neck: 30, chest: 68, baseRatio: 0.142, widthScale: 0.82, depthScale: 0.92, defaultShoulderYFrac: 0.805 },
  boys:  { height: 138, shoulder: 32, neck: 31, chest: 70, baseRatio: 0.142, widthScale: 0.82, depthScale: 0.92, defaultShoulderYFrac: 0.805 },
});

/**
 * Computes proportionally responsive head height, head-to-stature ratio, and
 * cranial width/depth scales driven by both height and torso/frame measurements
 * (`shoulder`, `neck`, `chest`) plus pediatric developmental ratios for kids.
 */
export function computeResponsiveHeadDims(category, opts = {}) {
  const ref = HEAD_PROPORTION_REF[category] || HEAD_PROPORTION_REF.women;
  const kid = category === "girls" || category === "boys";
  const heightCm = Number(opts.heightCm) || ref.height;
  const shoulderCm = Number(opts.shoulderCm) || ref.shoulder;
  const neckCm = Number(opts.neckCm) || ref.neck;
  const chestCm = Number(opts.chestCm) || ref.chest;
  const morph = opts.morph || null;
  const shoulderYFrac = opts.shoulderYFrac ?? ref.defaultShoulderYFrac;

  const H = cm(heightCm);
  const hFac = heightCm / ref.height;
  const gFac = 0.42 * (shoulderCm / ref.shoulder) + 0.33 * (neckCm / ref.neck) + 0.25 * (chestCm / ref.chest);
  const girthRel = clamp(gFac / Math.max(0.5, hFac), 0.78, 1.38);

  let baseRatio = ref.baseRatio;
  if (morph && morph.headRatio > 0) {
    baseRatio = morph.headRatio;
  } else if (kid) {
    baseRatio = clamp(0.142 - 0.046 * ((heightCm - ref.height) / 100), 0.131, 0.162);
  }

  const maxRatio = (1 - shoulderYFrac) - (kid ? 0.032 : 0.038);
  const headRatio = clamp(baseRatio * Math.pow(girthRel, 0.34), 0.118, maxRatio);
  const headH = H * headRatio;
  const headWidthScale = ref.widthScale * clamp(Math.pow(girthRel, 0.28), 0.93, 1.12);
  const headDepthScale = ref.depthScale * clamp(Math.pow(girthRel, 0.20), 0.95, 1.08);
  return { headH, headRatio, headWidthScale, headDepthScale };
}

/**
 * Normalizes either raw measurements (in cm) or pre-computed dims (in meters)
 * into a complete anatomical dimensions object in meters.
 */
export function computeHumanBodyDims(category, measurementsOrDims, landmarks, morph = null) {
  const female = category === "women" || category === "girls";
  const kid = category === "girls" || category === "boys";
  if (measurementsOrDims && typeof measurementsOrDims.H === "number" && typeof measurementsOrDims.hipY === "number") {
    const out = (morph && !measurementsOrDims.morph) ? { ...measurementsOrDims, morph } : { ...measurementsOrDims };
    if (out.headWidthScale == null || out.headDepthScale == null) {
      const ref = HEAD_PROPORTION_REF[category] || HEAD_PROPORTION_REF.women;
      out.headWidthScale = out.headWidthScale ?? ref.widthScale;
      out.headDepthScale = out.headDepthScale ?? ref.depthScale;
    }
    return out;
  }
  const m = measurementsOrDims || {};
  const activeMorph = morph || m.morph || null;

  const heightCm = Number(m.height) || (kid ? 136 : female ? 167 : 178);
  const chestCm = Number(m.chest) || (kid ? 68 : female ? 88 : 98);
  const waistCm = Number(m.waist) || (kid ? 60 : female ? 70 : 82);
  const hipsCm = Number(m.hips) || (kid ? 72 : female ? 96 : 96);
  const shoulderCm = Number(m.shoulder) || (kid ? 31 : female ? 39 : 45);
  const neckCm = Number(m.neck) || (kid ? 29 : female ? 35 : 39);
  const bicepCm = Number(m.bicep) || (kid ? 21 : female ? 27 : 32);
  const thighCm = Number(m.thigh) || (kid ? 38.5 : female ? 52 : 55);

  const H = cm(heightCm);
  const shoulderYFrac = landmarks ? landmarks.shoulderYFrac : (kid ? 0.805 : 0.822);
  const { headH, headWidthScale, headDepthScale } = computeResponsiveHeadDims(category, {
    heightCm,
    shoulderCm,
    neckCm,
    chestCm,
    shoulderYFrac,
    morph: activeMorph,
  });
  const neckTopY = H - headH;
  const shoulderY = H * shoulderYFrac;
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
  const thighR = radiusFromCirc(thighCm) * (female ? 0.86 : 0.85);

  return {
    female, kid, H, headH, headWidthScale, headDepthScale, neckTopY, shoulderY, hipY, span,
    chestR, waistR, hipR, shoulderHalf, neckR, armLen, upperR, legLen, thighR,
    morph: activeMorph,
  };
}

export function createHumanSkinMaterial(THREE, category, customColor, lowPower = false) {
  const color = customColor != null ? customColor : (HUMAN_SKIN_PALETTE[category] || 0xdca98e);
  if (lowPower) {
    const mat = new THREE.MeshPhongMaterial({
      color,
      vertexColors: true,
      shininess: 22,
      specular: 0x261d18,
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
    vertexColors: true,
    roughness: 0.46,
    metalness: 0.0,
    clearcoat: 0.09,
    clearcoatRoughness: 0.56,
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
  const footLen = clamp(H * (kid ? 0.148 : (female ? 0.142 : 0.150)), 0.14, 0.29);
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
      [0.000, 0.023, toeTipZ * 0.92, toeTipZ * 0.72, footW * 0.43, footW * 0.37, 0.22, true],
      [0.000, 0.034, toeTipZ * 0.74, toeTipZ * 0.42, footW * 0.51, footW * 0.47, 0.25, true],
      [0.000, 0.052, toeTipZ * 0.46, -footLen * 0.14, footW * 0.45, footW * 0.41, 0.30, true],
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
        baseR = thighR * (0.455 * (1 - u) + 0.430 * u);
      } else if (f <= 0.33) {
        const u = smoothstep(0.08, 0.33, f);
        const calfPeak = female ? 0.77 : (kid ? 0.73 : 0.80);
        baseR = thighR * (0.430 * (1 - u) + calfPeak * u);
      } else if (f <= kneeFrac) {
        const u = smoothstep(0.33, kneeFrac, f);
        const calfPeak = female ? 0.77 : (kid ? 0.73 : 0.80);
        baseR = thighR * (calfPeak * (1 - u) + 0.66 * u);
      } else {
        const u = smoothstep(kneeFrac, 1.0, f);
        baseR = thighR * (0.66 * (1 - u) + 0.92 * u);
      }

      const topInward = smoothstep(0.68, 1.0, f);
      const stanceOffset = side * smoothstep(0.0, 0.26, f) * (1 - f) * (-hipR * 0.018);
      const cx = legX * (1 - 0.08 * topInward) + stanceOffset;
      const cz = -thighR * 0.024 * (1 - smoothstep(0.0, 0.14, f)) - 0.005 * Math.sin(Math.PI * clamp(f / kneeFrac, 0, 1));

      const outerReachAtTop = Math.max(thighR * 0.94, pelvicOuterAtMerge - Math.abs(cx));
      const innerReachAtTop = Math.max(thighR * 0.56, Math.abs(cx) - 0.0038);

      const topBlend = smoothstep(0.68, 1.0, f);
      const upperThighBlend = smoothstep(kneeFrac, 1.0, f);
      const calfWindow = bumpWindow(f, 0.33, 0.16);
      const ankleWindow = bumpWindow(f, 0.01, 0.045);
      const kneeWindow = bumpWindow(f, kneeFrac, 0.065);
      const quadWindow = bumpWindow(f, kneeFrac + 0.24, 0.22);

      for (let k = 0; k < N_LEG; k++) {
        const phi = (2 * Math.PI * k) / N_LEG;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        const isMedial = sinP * side < 0;

        let rx = baseR * (0.94 - 0.055 * upperThighBlend);
        let rz = baseR * (1.01 + 0.02 * upperThighBlend);

        // Sleek upper inner-thigh taper for clean bikini & trouser clearance
        if (isMedial && f >= 0.68 && f <= 0.95) {
          const medSlim = Math.sin(Math.PI * clamp((f - 0.68) / 0.27, 0, 1)) * Math.abs(sinP);
          rx *= 1 - 0.038 * medSlim;
        }

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
          rz += thighR * 0.038 * quadWindow * cosP;
        } else {
          rz += thighR * 0.030 * smoothstep(0.62, 1.0, f) * (-cosP);
          // Smooth sub-gluteal transition
          if (f >= 0.86 && f <= 0.96) {
            const subGlute = bumpWindow(f, 0.91, 0.05) * smoothstep(-0.30, -0.85, cosP);
            rz -= thighR * 0.014 * subGlute;
          }
        }

        const targetRx = isMedial ? innerReachAtTop : outerReachAtTop;
        const targetRz = hipR * zScale * (cosP >= 0 ? 0.91 : 1.00);
        rx = rx * (1 - topBlend) + targetRx * topBlend;
        rz = rz * (1 - topBlend) + targetRz * topBlend;

        const x = cx + rx * sinP;
        const topArchBlend = smoothstep(0.76, 1.0, f);
        const inguinalSlopeY = isMedial
          ? (-span * 0.013 * (1 - 0.45 * Math.max(0, cosP))) * Math.pow(Math.abs(sinP), 1.2) * topArchBlend
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
    [hipY - span * 0.068, hipR * 0.975, hipR * 0.93, 0.96],  // T0: pelvic base (diagonal inguinal merge)
    [hipY - span * 0.042, hipR * 0.998, hipR * 0.97, 0.78],  // lower gluteal round
    [hipY - span * 0.014, hipR * 1.012, hipR * 0.99, 0.56],  // trochanter / gluteal fullness
    [hipY + span * 0.030, hipR * 1.005, hipR * 0.98, 0.38],  // upper glute / sacrum
    [hipY + span * 0.085, hipR * 0.980, hipR * 0.955, 0.28], // iliac crest
    [hipY + span * 0.19, hipR * 0.89 + waistR * 0.11, hipR * 0.88 + waistR * 0.12, 0.24],
    [hipY + span * 0.32, hipR * 0.38 + waistR * 0.62, hipR * 0.40 + waistR * 0.60, 0.22],
    [hipY + span * 0.44, waistR * 1.00, waistR * 0.98, 0.20], // natural waist anchor
    [hipY + span * 0.55, waistR * 0.60 + chestR * 0.42, waistR * 0.63 + chestR * 0.39, 0.22], // lower ribcage
    [hipY + span * 0.65, chestR * (female ? 0.97 : 1.01), chestR * 0.96, 0.24], // underbust / lower pecs
    [hipY + span * 0.73, chestR * (female ? 1.01 : 1.06), chestR * (female ? 1.00 : 1.02), 0.28], // bust / chest apex
    [hipY + span * 0.81, chestR * (female ? 1.00 : 1.07), chestR * 0.95, 0.44], // upper chest / lat V-taper
    [hipY + span * 0.88, upperRibRx, chestR * 0.90, 0.68], // deltopectoral & teres flare
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
        // Diagonal human inguinal ramp: smooth pubic taper and gentle lateral iliac rise
        const frontCenter = Math.max(0, cosP) * Math.pow(1 - absSin, 1.35);
        z *= 1 - 0.13 * frontCenter;
        yLocal = y - span * 0.013 * Math.pow(1 - absSin, 1.3) + span * 0.012 * Math.pow(absSin, 1.2);
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
  const crotchArchY = legTopY - span * 0.016;

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
    const outerAcromionX = (lm.shoulderPivotX + upperR * 0.80) * radCap;
    const zArm = upperR * 0.99 * radCap;
    const acromionTargetY = shoulderY - span * 0.011;
    const saddle = [];
    for (let j = 1; j <= 13; j++) {
      const u = j / 14; // 0 = front seam, 0.5 = lateral acromion dome, 1 = back seam
      const sinU = Math.sin(Math.PI * u);
      const cosU = Math.cos(Math.PI * u);
      const x = side * (shoulderSeamRx + (outerAcromionX - shoulderSeamRx) * Math.pow(sinU, 0.78));
      const baseLineY = fy * (1 - u) + by * u;
      const acromionCrown = upperR * 0.075 * Math.pow(sinU, 1.35);
      const y = baseLineY * (1 - sinU) + (acromionTargetY + acromionCrown) * sinU;
      const z = zArm * cosU;
      const wArm = 0.34 + 0.14 * sinU;
      const wNeck = 0.06 * (1 - 0.5 * sinU);
      const wChest = 1 - wArm - wNeck;
      saddle.push(addVertex(x, y, z, 0.85, [[BONE_IDX.chest, wChest], [bArm, wArm], [BONE_IDX.neck, wNeck]], false));
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

    if (dyDown < 0.056) {
      const f = smoothstep(-0.040, 0.056, dyDown);
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
    // True Vitruvian human hand proportions (~17.4cm women, ~19.0cm men, ~14.5cm kids)
    const handLen = H * (kid ? 0.108 : (female ? 0.104 : 0.107));
    const palmLen = handLen * 0.54;
    const fingerLen = handLen * 0.46;
    const palmHalfW = handLen * (female ? 0.212 : 0.224);
    const palmHalfThick = handLen * (female ? 0.070 : 0.076);
    const wristBroadR = Math.max(upperR * 0.44, palmHalfW * 0.70);
    const wristThickR = Math.max(upperR * 0.34, palmHalfThick * 1.28);

    // Strictly convex lateral deltoid contour expanding smoothly from sloped acromion -> deltoid belly -> 3 elbow loops -> anatomical wrist & metacarpal palm
    const armStops = [
      // [dyDown, rMedLat, rAntPost, xShiftOut, zShift, sw, tiltScale]
      [0.015, upperR * 0.92, upperR * 1.01, side * upperR * 0.030, 0.001, 0.84, 0.34],         // proximal deltoid cap blend
      [upperLen * 0.13, upperR * 0.98, upperR * 1.02, side * upperR * 0.034, 0.001, 0.58, 0.16], // lateral deltoid roundness
      [upperLen * 0.26, upperR * 0.95, upperR * 0.99, side * upperR * 0.02, 0.001, 0.40, 0.07], // deltoid tuberosity
      [upperLen * 0.50, upperR * 0.90, upperR * 0.96, side * upperR * 0.015, 0.002, 0.24, 0.0], // bicep / tricep belly
      [upperLen * 0.78, upperR * 0.80, upperR * 0.82, side * upperR * 0.01, 0.001, 0.22, 0.0], // distal brachium
      [upperLen * 0.93, upperR * 0.74, upperR * 0.73, 0.0, -0.001, 0.25, 0.0],             // supracondylar elbow loop
      [upperLen, upperR * 0.71, upperR * 0.70, 0.0, -0.002, 0.26, 0.0],             // elbow joint center
      [upperLen + foreLen * 0.08, upperR * 0.73, upperR * 0.74, 0.0, 0.001, 0.25, 0.0],    // proximal forearm loop
      [upperLen + foreLen * 0.22, upperR * 0.75, upperR * 0.77, 0.0, 0.002, 0.22, 0.0],    // brachioradialis swell
      [upperLen + foreLen * 0.50, upperR * 0.60, Math.max(upperR * 0.64, wristBroadR * 1.05), 0.0, 0.002, 0.20, 0.0], // mid forearm
      [upperLen + foreLen * 0.80, upperR * 0.46, Math.max(upperR * 0.54, wristBroadR * 0.94), 0.0, 0.001, 0.20, 0.0], // distal forearm
      [wristDist, wristThickR, wristBroadR, 0.0, 0.0, 0.30, 0.0],          // oval carpal wrist
      [wristDist + palmLen * 0.48, palmHalfThick * 1.12, palmHalfW * 0.96, -side * palmHalfThick * 0.14, palmHalfW * 0.10, 0.45, 0.0], // palm + thenar swell
      [wristDist + palmLen * 0.94, palmHalfThick * 0.94, palmHalfW * 1.00, -side * palmHalfThick * 0.28, palmHalfW * 0.04, 0.65, 0.0], // metacarpal web split
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
          rx *= 1.16;
          rz *= 1.07;
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
        (wsY * (1 - u) + weY * u) - palmHalfThick * 0.36 * arch,
        (wsZ * (1 - u) + weZ * u) - palmHalfW * 0.08 * arch,
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

    const thumbLen = handLen * 0.32;
    const baseAngs = thumbBase.map((vid) => Math.atan2(positions[vid * 3 + 2] - tcz, (positions[vid * 3] - tcx) * side));
    const thumbStops = [
      [0.34, 0.90, 0.45],
      [0.68, 0.78, 0.75],
      [0.92, 0.50, 0.92],
    ];
    for (const [f, radScale, ovalMix] of thumbStops) {
      const tRing = [];
      const cx = tcx - side * palmHalfThick * 0.34 * f;
      const cy = tcy - thumbLen * f;
      const cz = tcz + palmHalfW * 0.24 * f;
      const ovalRx = palmHalfThick * 0.64 * radScale;
      const ovalRz = palmHalfThick * 0.70 * radScale;
      for (let k = 0; k < 8; k++) {
        const vx = positions[thumbBase[k] * 3] - tcx;
        const vz = positions[thumbBase[k] * 3 + 2] - tcz;
        const ang = baseAngs[k];
        const ox = side * ovalRx * Math.cos(ang);
        const oz = ovalRz * Math.sin(ang);
        tRing.push(addVertex(
          cx + vx * radScale * (1 - ovalMix) + ox * ovalMix,
          cy,
          cz + vz * radScale * (1 - ovalMix) + oz * ovalMix,
          0.32,
          handWeights,
          false
        ));
      }
      connectRings(tPrev, tRing);
      tPrev = tRing;
    }
    const thumbTip = addVertex(
      tcx - side * palmHalfThick * 0.36,
      tcy - thumbLen * 1.00,
      tcz + palmHalfW * 0.25,
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
      [0.24, 0.96, 0.90, -side * palmHalfThick * 0.22],
      [0.52, 0.91, 0.76, -side * palmHalfThick * 0.56],
      [0.78, 0.82, 0.58, -side * palmHalfThick * 0.94],
      [0.95, 0.62, 0.40, -side * palmHalfThick * 1.22],
    ];
    for (const [f, zScaleF, xScaleF, curlX] of fingerStops) {
      const fRing = [];
      const cx = fcx + curlX;
      const cz = fcz - palmHalfW * 0.05 * f;
      for (let k = 0; k < 28; k++) {
        const dx0 = positions[fingersBase[k] * 3] - fcx;
        const dz0 = positions[fingersBase[k] * 3 + 2] - fcz;
        const uZ = clamp(dz0 / (palmHalfW * 0.92 || 0.02), -1, 1); // -1 = pinky edge, +1 = index edge
        // 4 distinct anatomical finger ridges (pinky, ring, middle, index) with deep dorsal/palmar interdigital grooves
        const digitWave = Math.abs(Math.sin((uZ + 1.0) * Math.PI * 2.0));
        const interdigitalPinch = Math.pow(digitWave, 0.65);
        const flute = f < 0.26
          ? (1 - 0.10 * (1 - interdigitalPinch))
          : (0.28 + 0.72 * interdigitalPinch);
        // Anatomical finger length stagger: middle (+0.08) longest, index (+0.02), ring (-0.01), pinky (-0.22)
        const digitLenCurve = (0.96 - 0.22 * smoothstep(-0.35, -0.96, uZ) + 0.10 * Math.exp(-Math.pow((uZ - 0.06) / 0.34, 2)));
        const tipFade = 1 - 0.25 * smoothstep(0.65, 1.0, f);
        const dropY = fingerLen * f * (1 - 0.28 * f + 0.28 * f * digitLenCurve) * tipFade + fingerLen * f * 0.25;
        fRing.push(addVertex(
          cx + dx0 * xScaleF * flute,
          fcy - Math.min(fingerLen * 1.02, dropY),
          cz + dz0 * zScaleF,
          f < 0.28 ? 0.32 : 0.16,
          handWeights,
          false
        ));
      }
      connectRings(fPrev, fRing);
      fPrev = fRing;
    }
    const fingerTip = addVertex(
      fcx - side * palmHalfThick * 1.34,
      fcy - fingerLen * 1.06,
      fcz - palmHalfW * 0.04,
      0.16,
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
  const neckSpan = Math.max(H * 0.025, neckTopY - shoulderY);
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
      const cosP = Math.cos(phi);
      const tx = neckR * 1.10 * Math.sin(phi);
      const tz = 0.002 + neckR * 1.06 * cosP;
      const x = bx0 * (1 - trapFrac) + tx * trapFrac;
      // Natural slightly concave human trapezius slope from acromion up to side of neck
      const trapArch = Math.pow(trapFrac, 0.92);
      const postTrapLift = span * 0.004 * Math.max(0, -cosP) * (1 - trapFrac);
      const y = by0 * (1 - trapArch) + targetNy * trapArch + postTrapLift;
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
  const headWidthScale = d.headWidthScale ?? (kid ? 0.82 : (female ? 0.78 : 0.81));
  const headDepthScale = d.headDepthScale ?? 0.92;
  const neckRxFrac = clamp((neckR * 0.89) / headH, 0.165, 0.255);
  const neckRzFrac = clamp((neckR * 0.93) / headH, 0.175, 0.265);

  const headSlices = [
    // [yFrac, craniumFrac, sw]
    [-0.485, 0.370, 0.26], // upper throat / hyoid junction
    [-0.445, 0.382, 0.24], // smooth submental transition
    [-0.425, 0.387, 0.24], // smoothed sub-chin pad blend
    [-0.405, 0.390, 0.20], // chin (menton) rounded pad
    [-0.348, 0.396, 0.09], // mentolabial hollow & anterior jaw taper
    [-0.285, 0.400, 0.09], // lower lip cushion & gonial mandibular angle
    [-0.238, 0.403, 0.08], // oral rima / mouth corners
    [-0.196, 0.405, 0.08], // upper lip Cupid's bow & philtrum
    [-0.158, 0.407, 0.08], // subnasale / columella septum beneath nose
    [-0.125, 0.409, 0.08], // pronasale rounded nasal tip & nostril alae
    [-0.075, 0.411, 0.08], // mid nasal dorsum & malar cheeks
    [-0.020, 0.412, 0.08], // upper nasal bridge & infraorbital rim
    [0.036, 0.412, 0.08], // almond eyes & nasion root
    [0.092, 0.413, 0.09], // supraorbital brow arch & glabella
    [0.175, 0.410, 0.10], // frontal forehead
    [0.280, 0.390, 0.11], // upper forehead / trichion
    [0.380, 0.332, 0.12], // parietal cranial vault
    [0.460, 0.212, 0.14], // crown arch
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

      // 4. Warm natural smiling lips, upturned oral rima & gentle corner dimples
      const smileAmp = headH * (category === "men" ? 0.015 : 0.0195);
      const smileRise = smileAmp * Math.pow(clamp(absPhi / 0.30, 0, 1), 1.55) * (1 - smoothstep(0.30, 0.46, absPhi));
      dz += headH * 0.014 * bumpWindow(yLocal - smileRise * 0.72, -headH * 0.200, headH * 0.036) * superGauss(phi, 0, 0.285, 2.6);
      dz -= headH * 0.0042 * bumpWindow(yLocal - smileRise, -headH * 0.238, headH * 0.020) * superGauss(phi, 0, 0.275, 2.4);
      dz += headH * 0.013 * bumpWindow(yLocal - smileRise * 0.85, -headH * 0.276, headH * 0.036) * superGauss(phi, 0, 0.265, 2.6);
      const cornerDimple = superGauss(phi, 0.28, 0.068, 2.2) + superGauss(phi, -0.28, 0.068, 2.2);
      dz -= headH * 0.0038 * bumpWindow(yLocal, -headH * 0.225, headH * 0.024) * cornerDimple;
      const smileCheekLift = superGauss(phi, 0.34, 0.14, 2.2) + superGauss(phi, -0.34, 0.14, 2.2);
      dz += headH * 0.0052 * bumpWindow(yLocal, -headH * 0.145, headH * 0.055) * smileCheekLift;

      // 5. Mentolabial hollow & ultra-broad, smooth rounded human chin pad
      dz -= headH * 0.006 * bumpWindow(yLocal, -headH * 0.340, headH * 0.032) * superGauss(phi, 0, 0.34, 2.6);
      const chinAmp = headH * (category === "men" ? 0.016 : (kid ? 0.011 : 0.014));
      const chinSigma = category === "men" ? 0.56 : 0.50;
      dz += chinAmp * bumpWindow(yLocal, -headH * 0.398, headH * 0.052) * superGauss(phi, 0, chinSigma, 3.0);

      // Subtle mandibular gonial definition below ears
      const gonialAmp = headH * (category === "men" ? 0.016 : 0.007);
      const jawLobe = superGauss(phi, 1.15, 0.28, 2.0) + superGauss(phi, -1.15, 0.28, 2.0);
      dx += Math.sign(sinP) * gonialAmp * bumpWindow(yLocal, -headH * 0.265, headH * 0.075) * jawLobe;

      // 6. Healthy anterior midface & malar cheek fullness (lifted for warm smile)
      const cheekAmp = headH * (female ? 0.023 : (kid ? 0.025 : 0.018));
      const cheekLobe = superGauss(phi, 0.50, 0.35, 2.2) + superGauss(phi, -0.50, 0.35, 2.2);
      dz += cheekAmp * bumpWindow(yLocal, -headH * 0.058, headH * 0.138) * cheekLobe;

      const cheekMorph = clamp(d.morph?.cheekFullness ?? 0, -0.15, 0.25);
      if (Math.abs(cheekMorph) > 1e-4) {
        const midFaceWin = bumpWindow(yLocal, -headH * 0.14, headH * 0.16);
        const latCheekLobe = superGauss(phi, 0.75, 0.42, 2.0) + superGauss(phi, -0.75, 0.42, 2.0);
        dx += Math.sign(sinP) * headH * 0.045 * cheekMorph * midFaceWin * latCheekLobe;
        dz += headH * 0.025 * cheekMorph * midFaceWin * (superGauss(phi, 0.50, 0.38, 2.0) + superGauss(phi, -0.50, 0.38, 2.0));
      }

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

  // Anatomical Subsurface Dermal & Ambient-Occlusion Vertex Shading (multiplicative tint ~[0.84..1.05])
  const vColors = new Float32Array(vCount * 3);
  const mouthYRel = -headH * 0.238;
  const lipSaturation = female ? 1.0 : (kid ? 0.68 : 0.60);
  for (let v = 0; v < vCount; v++) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    let cr = 1.0, cg = 1.0, cb = 1.0;

    // 1. Craniofacial subsurface flush & subtle AO pockets
    const yHead = y - headCenterY;
    if (yHead >= -headH * 0.65 && Math.abs(x) < headH * 0.55) {
      const zFront = Math.max(0, z - headH * 0.02);
      const phiF = Math.atan2(x, Math.max(0.01, zFront));
      const absPhiF = Math.abs(phiF);
      if (z > 0) {
        // Warm rosy malar cheek blush + nose bridge/tip warmth
        const cheek = bumpWindow(yHead, -headH * 0.048, headH * 0.115) * (bumpWindow(absPhiF, 0.52, 0.34));
        const noseTip = bumpWindow(yHead, -headH * 0.115, headH * 0.065) * bumpWindow(absPhiF, 0, 0.22);
        const warmFace = Math.min(1, cheek * (female || kid ? 0.88 : 0.50) + noseTip * 0.55);
        cr += 0.032 * warmFace;
        cg -= 0.038 * warmFace;
        cb -= 0.046 * warmFace;

        // Integrated natural smiling vermilion lip base tone blending smoothly into skin
        const smileAmpV = headH * (category === "men" ? 0.015 : 0.0195);
        const smileRiseV = smileAmpV * Math.pow(clamp(absPhiF / 0.30, 0, 1), 1.55) * (1 - smoothstep(0.30, 0.46, absPhiF));
        const cupidsY = mouthYRel + smileRiseV * 0.85 + headH * 0.010 * bumpWindow(absPhiF, 0.10, 0.10);
        const lipVert = bumpWindow(yHead, cupidsY, headH * 0.042);
        const lipHoriz = bumpWindow(absPhiF, 0, 0.35);
        const lipMask = lipVert * lipHoriz * smoothstep(0.02, 0.25, zFront / headH);
        if (lipMask > 0.01) {
          cr += 0.055 * lipMask * lipSaturation;
          cg -= 0.125 * lipMask * lipSaturation;
          cb -= 0.135 * lipMask * lipSaturation;
        }
        // Subtle upturned oral rima parting crease & gentle corner smile dimple
        const rimaCrease = bumpWindow(yHead, mouthYRel + smileRiseV - headH * 0.002, headH * 0.011) * bumpWindow(absPhiF, 0, 0.30);
        const cornerAO = bumpWindow(yHead, mouthYRel + smileAmpV * 0.90, headH * 0.018) * bumpWindow(absPhiF, 0.28, 0.065) * 0.045;
        cr -= 0.095 * rimaCrease + cornerAO; cg -= 0.115 * rimaCrease + cornerAO; cb -= 0.115 * rimaCrease + cornerAO;

        // Soft orbital socket + under-brow + subnasale AO depth
        const orbitAO = bumpWindow(yHead, headH * 0.038, headH * 0.052) * bumpWindow(absPhiF, 0.37, 0.22);
        const underNoseAO = bumpWindow(yHead, -headH * 0.162, headH * 0.028) * bumpWindow(absPhiF, 0, 0.18);
        const aoDrop = Math.min(0.14, orbitAO * 0.085 + underNoseAO * 0.08);
        cr -= aoDrop; cg -= aoDrop * 1.12; cb -= aoDrop * 1.15;
      }
      // Submental jawline & neck-base ambient shadow
      const jawAO = bumpWindow(yHead, -headH * 0.46, headH * 0.11) * smoothstep(0.3, -0.05, z / headH);
      const earWarm = bumpWindow(yHead, -headH * 0.03, headH * 0.11) * bumpWindow(Math.abs(x), headH * 0.32, headH * 0.09);
      cr += 0.025 * earWarm - 0.020 * jawAO;
      cg -= 0.035 * earWarm + 0.024 * jawAO;
      cb -= 0.040 * earWarm + 0.026 * jawAO;
    } else if (y < shoulderY + span * 0.04 && y > hipY * 0.25) {
      // 2. Subtle anatomical subsurface warmth on clavicles, palms/knuckles, knees & ankles
      const clavicle = bumpWindow(y, shoulderY - span * 0.02, span * 0.08) * bumpWindow(Math.abs(x), shoulderHalf * 0.45, shoulderHalf * 0.38) * Math.max(0, z / (chestR || 0.15));
      const kneeWarm = bumpWindow(y, lm.kneeY, H * 0.055) * Math.max(0, z / (thighR || 0.1));
      const axillaAO = bumpWindow(y, shoulderY - span * 0.09, span * 0.055) * bumpWindow(Math.abs(x), chestR * 0.96, upperR * 0.7);
      const warmB = Math.min(1, clavicle * 0.35 + kneeWarm * 0.45);
      cr += 0.020 * warmB - 0.055 * axillaAO;
      cg -= 0.022 * warmB + 0.062 * axillaAO;
      cb -= 0.026 * warmB + 0.066 * axillaAO;
    }
    // 3. Hand palm & interdigital shadow depth
    const wristWorldY = lm.shoulderPivotY - lm.upperArmLen - lm.forearmLen;
    if (y < wristWorldY + 0.01 && Math.abs(x) > shoulderHalf * 0.65) {
      const handSpanY = H * (kid ? 0.108 : (female ? 0.104 : 0.107));
      const palmFlush = smoothstep(wristWorldY + 0.01, wristWorldY - handSpanY * 0.78, y);
      cr += 0.028 * palmFlush;
      cg -= 0.026 * palmFlush;
      cb -= 0.032 * palmFlush;
    }

    vColors[v * 3] = clamp(cr, 0.76, 1.07);
    vColors[v * 3 + 1] = clamp(cg, 0.72, 1.05);
    vColors[v * 3 + 2] = clamp(cb, 0.70, 1.05);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(vColors, 3));

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
 * feathered brows, subtle satin lip glaze), customizable textured hairstyles,
 * and category-tailored 3D headwear (hijabs, ghutra/shemagh & iqal, shawls, hats)
 * directly onto the `head` bone, sampling exact triangle coordinates from
 * `bodyGeo` so features never get buried by skin or cause Z-fighting.
 */
function populateHeadFeatures(THREE, headBone, headH, category, customHairColor, bodyGeo = null, headCenterY = 0, lowPower = false, customSkinColor = null, hairStyle = null, styleOptions = {}) {
  const female = category === "women" || category === "girls";
  const kid = category === "girls" || category === "boys";
  const dims = styleOptions?.dims || null;
  const headWidthScale = styleOptions?.headWidthScale ?? (kid ? 0.82 : (female ? 0.78 : 0.81));
  const headDepthScale = styleOptions?.headDepthScale ?? 0.92;
  const hairTypeSpec = getHairTypeSpec(styleOptions?.hairType);
  const lengthSpec = getHairLengthSpec(styleOptions?.hairLength);
  const highlightSpec = getHairHighlightSpec(styleOptions?.hairHighlight);
  const headwearSpec = getHeadwearSpec(styleOptions?.headwear);
  const hasHeadwear = headwearSpec.id !== "none";
  const hidesHairUnderHeadwear = Boolean(hasHeadwear && headwearSpec.hidesHair);
  const crownCompression = hasHeadwear && headwearSpec.coversCrown && !hidesHairUnderHeadwear ? 0.28 : 1.0;
  const hwFabricSpec = getHeadwearFabricSpec(styleOptions?.headwearFabric || headwearSpec.defaultFabric);
  const hwLengthSpec = getHeadwearLengthSpec(styleOptions?.headwearLength || headwearSpec.defaultLength);
  const hasEyeScreen = Boolean(
    headwearSpec.isNiqab && (styleOptions?.niqabEyeScreen != null ? styleOptions.niqabEyeScreen : headwearSpec.defaultEyeScreen)
  );
  const undercapHex = hexToInt(
    styleOptions?.undercapColor ?? headwearSpec.defaultUndercapColor,
    0x18191e
  );

  // Anatomical torso landmarks in headBone-local coordinates (yLocal = yWorld - headCenterY)
  const yShoulder = (dims ? dims.shoulderY : headCenterY - headH * 0.90) - headCenterY;
  const yChest = (dims ? dims.hipY + dims.span * 0.715 : headCenterY - headH * 1.62) - headCenterY;
  const yUnderBust = (dims ? dims.hipY + dims.span * 0.54 : headCenterY - headH * 2.02) - headCenterY;
  const yWaist = (dims ? dims.hipY + dims.span * 0.34 : headCenterY - headH * 2.45) - headCenterY;
  const yHip = (dims ? dims.hipY + dims.span * 0.04 : headCenterY - headH * 3.12) - headCenterY;

  const baseSkin = new THREE.Color(customSkinColor != null ? customSkinColor : (HUMAN_SKIN_PALETTE[category] || 0xdca98e));
  const skinLuma = 0.2126 * baseSkin.r + 0.7152 * baseSkin.g + 0.0722 * baseSkin.b;
  const deepSkinBlend = clamp((0.42 - skinLuma) / 0.34, 0, 1);

  const defaultHairHex = deepSkinBlend > 0.45 ? 0x1b120e : (HUMAN_HAIR_PALETTE[category] || 0x241913);
  const hairColor = customHairColor != null ? customHairColor : defaultHairHex;

  const scleraTint = new THREE.Color(0xf8f5f0).lerp(new THREE.Color(0xefe8e0), deepSkinBlend * 0.55);
  const eyeWhiteMat = lowPower
    ? new THREE.MeshPhongMaterial({ color: scleraTint, shininess: 56, specular: 0x444444 })
    : new THREE.MeshStandardMaterial({ color: scleraTint, roughness: 0.20 });
  const baseIrisHex = category === "women" ? 0x5c3e28 : (category === "girls" ? 0x66462e : (category === "boys" ? 0x4a3322 : 0x3f2c1e));
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

  // Extract head triangles, cranial vertices, and torso-clearance cylindrical envelope from `bodyGeo`
  const frontHeadTris = [];
  const headVertsLocal = [];
  const TORSO_Y_BINS = 36;
  const TORSO_PHI_BINS = 36;
  const torsoEnvTopY = headH * 0.10;
  const torsoEnvBotY = Math.min(yHip - headH * 0.45, -headH * 3.4);
  const torsoBins = new Float32Array(TORSO_Y_BINS * TORSO_PHI_BINS);
  const fullBins = new Float32Array(TORSO_Y_BINS * TORSO_PHI_BINS);
  const defChestR = dims ? dims.chestR : headH * 0.72;
  const defWaistR = dims ? dims.waistR : headH * 0.56;
  const defHipR = dims ? dims.hipR : headH * 0.76;
  const defNeckR = dims ? dims.neckR : headH * 0.25;
  const defShoulderHalf = dims ? dims.shoulderHalf : headH * 0.94;
  for (let iy = 0; iy < TORSO_Y_BINS; iy++) {
    const f = iy / (TORSO_Y_BINS - 1);
    const y = lerp(torsoEnvTopY, torsoEnvBotY, f);
    let rxEst = defNeckR;
    let rzEst = defNeckR;
    if (y >= yShoulder) {
      const ft = clamp((headH * 0.05 - y) / Math.max(0.02, headH * 0.05 - yShoulder), 0, 1);
      rxEst = lerp(defNeckR * 1.15, defShoulderHalf * 0.96, ft);
      rzEst = lerp(defNeckR * 1.12, defChestR * 0.92, ft);
    } else if (y >= yChest) {
      const ft = clamp((yShoulder - y) / Math.max(0.02, yShoulder - yChest), 0, 1);
      rxEst = lerp(defShoulderHalf * 0.94, defChestR * 1.08, ft);
      rzEst = lerp(defChestR * 0.94, defChestR * (female ? 1.24 : 1.12), ft);
    } else if (y >= yWaist) {
      const ft = clamp((yChest - y) / Math.max(0.02, yChest - yWaist), 0, 1);
      rxEst = lerp(defChestR * 1.06, defWaistR * 1.04, ft);
      rzEst = lerp(defChestR * (female ? 1.20 : 1.08), defWaistR * 1.02, ft);
    } else {
      const ft = clamp((yWaist - y) / Math.max(0.02, yWaist - yHip), 0, 1);
      rxEst = lerp(defWaistR * 1.04, defHipR * 1.06, ft);
      rzEst = lerp(defWaistR * 1.02, defHipR * 1.10, ft);
    }
    for (let ip = 0; ip < TORSO_PHI_BINS; ip++) {
      const phi = -Math.PI + (ip / TORSO_PHI_BINS) * 2 * Math.PI;
      const rEst = Math.hypot(Math.sin(phi) * rxEst, Math.cos(phi) * rzEst);
      torsoBins[iy * TORSO_PHI_BINS + ip] = rEst;
      fullBins[iy * TORSO_PHI_BINS + ip] = y > yShoulder - headH * 0.45 ? Math.max(rEst, Math.abs(Math.sin(phi)) * defShoulderHalf * 1.10) : rEst;
    }
  }

  if (bodyGeo && bodyGeo.attributes && bodyGeo.attributes.position && bodyGeo.index) {
    const posAttr = bodyGeo.attributes.position;
    const idxAttr = bodyGeo.index;
    const minHeadY = -headH * 0.50;
    const armExcludeY = yShoulder - headH * 0.34;
    const armExcludeX = Math.max(defChestR, defHipR) * 1.09;
    for (let v = 0; v < posAttr.count; v++) {
      const px = posAttr.getX(v);
      const yl = posAttr.getY(v) - headCenterY;
      const pz = posAttr.getZ(v);
      if (yl >= minHeadY) {
        headVertsLocal.push([px, yl, pz]);
      }
      if (yl <= torsoEnvTopY && yl >= torsoEnvBotY) {
        const yFrac = clamp((torsoEnvTopY - yl) / (torsoEnvTopY - torsoEnvBotY), 0, 1);
        const iy = clamp(Math.round(yFrac * (TORSO_Y_BINS - 1)), 0, TORSO_Y_BINS - 1);
        const phi = Math.atan2(px, pz);
        const ip = ((Math.round(((phi + Math.PI) / (2 * Math.PI)) * TORSO_PHI_BINS) % TORSO_PHI_BINS) + TORSO_PHI_BINS) % TORSO_PHI_BINS;
        const rad = Math.hypot(px, pz);
        const cell = iy * TORSO_PHI_BINS + ip;
        if (rad > fullBins[cell]) fullBins[cell] = rad;
        const isLowerArm = yl < armExcludeY && Math.abs(px) > armExcludeX;
        if (!isLowerArm && rad > torsoBins[cell]) torsoBins[cell] = rad;
      }
    }
    // Smooth angular bins to prevent narrow inter-triangle dips
    for (let pass = 0; pass < 2; pass++) {
      for (let iy = 0; iy < TORSO_Y_BINS; iy++) {
        for (let ip = 0; ip < TORSO_PHI_BINS; ip++) {
          const prevIp = (ip + TORSO_PHI_BINS - 1) % TORSO_PHI_BINS;
          const nextIp = (ip + 1) % TORSO_PHI_BINS;
          const base = iy * TORSO_PHI_BINS;
          torsoBins[base + ip] = Math.max(torsoBins[base + ip], 0.94 * Math.max(torsoBins[base + prevIp], torsoBins[base + nextIp]));
          fullBins[base + ip] = Math.max(fullBins[base + ip], 0.94 * Math.max(fullBins[base + prevIp], fullBins[base + nextIp]));
        }
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

  function sampleTorsoClearance(yLocal, phi, includeArms = false) {
    const tbl = includeArms ? fullBins : torsoBins;
    const yFrac = clamp((torsoEnvTopY - yLocal) / (torsoEnvTopY - torsoEnvBotY), 0, 1);
    const yPos = yFrac * (TORSO_Y_BINS - 1);
    const iy0 = Math.floor(yPos);
    const iy1 = Math.min(TORSO_Y_BINS - 1, iy0 + 1);
    const fy = yPos - iy0;

    let normPhi = (phi + Math.PI) % (2 * Math.PI);
    if (normPhi < 0) normPhi += 2 * Math.PI;
    const pPos = (normPhi / (2 * Math.PI)) * TORSO_PHI_BINS;
    const ip0 = Math.floor(pPos) % TORSO_PHI_BINS;
    const ip1 = (ip0 + 1) % TORSO_PHI_BINS;
    const fp = pPos - Math.floor(pPos);

    const r00 = tbl[iy0 * TORSO_PHI_BINS + ip0];
    const r01 = tbl[iy0 * TORSO_PHI_BINS + ip1];
    const r10 = tbl[iy1 * TORSO_PHI_BINS + ip0];
    const r11 = tbl[iy1 * TORSO_PHI_BINS + ip1];
    return lerp(lerp(r00, r01, fp), lerp(r10, r11, fp), fy);
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

  function createConformedRibbonGeo(curvePts, widthAtU, radialColorFn, uSegs = 20, vSegs = 4, minOffset = 0.0008, domeOffset = 0.0012) {
    const curve = new THREE.CatmullRomCurve3(curvePts.map((p) => new THREE.Vector3(p[0], p[1], p[2] || 0)));
    const rPos = [];
    const rCol = [];
    const rIdx = [];
    const stride = uSegs + 1;
    for (let iv = 0; iv <= vSegs; iv++) {
      const vFrac = iv / vSegs; // 0 = bottom edge, 1 = top edge
      const vSigned = vFrac * 2 - 1; // [-1 .. +1]
      for (let iu = 0; iu <= uSegs; iu++) {
        const uFrac = iu / uSegs;
        const pt = curve.getPoint(uFrac);
        const tangent = curve.getTangent(uFrac);
        // Upward screen-plane normal perpendicular to tangent
        let nx = -tangent.y, ny = tangent.x;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        if (ny < 0) { nx = -nx; ny = -ny; }
        const halfW = widthAtU(uFrac);
        const vx = pt.x + nx * vSigned * halfW;
        const vy = pt.y + ny * vSigned * halfW;
        const edgeArch = Math.cos((vSigned * Math.PI) * 0.5);
        const endTaper = Math.sin(Math.PI * uFrac);
        const zSkin = sampleHeadFrontZ(vx, vy);
        const vz = zSkin + minOffset + domeOffset * edgeArch * (0.35 + 0.65 * endTaper);
        rPos.push(vx, vy, vz);
        const [r, g, b] = radialColorFn(uFrac, vFrac, vSigned);
        rCol.push(r, g, b);
      }
    }
    for (let iv = 0; iv < vSegs; iv++) {
      for (let iu = 0; iu < uSegs; iu++) {
        const a0 = iv * stride + iu, a1 = a0 + 1;
        const b0 = (iv + 1) * stride + iu, b1 = b0 + 1;
        rIdx.push(a0, a1, b1, a0, b1, b0);
      }
    }
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute("position", new THREE.Float32BufferAttribute(rPos, 3));
    rGeo.setAttribute("color", new THREE.Float32BufferAttribute(rCol, 3));
    rGeo.setIndex(rIdx);
    rGeo.computeVertexNormals();
    return rGeo;
  }

  // Classical human mid-head eye placement (5-eye facial width proportion & layered cornea/iris realism)
  const ey = headH * (kid ? 0.014 : 0.036);
  const ex = headH * (kid ? 0.130 : 0.134);
  const eyeHalfW = headH * (kid ? 0.064 : 0.060);
  const eyeHalfH = headH * (kid ? 0.032 : 0.029);

  const scleraVertMat = lowPower
    ? new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 48, specular: 0x3a3a3a })
    : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 0.35, clearcoatRoughness: 0.18 });
  const irisVertMat = lowPower
    ? new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 72, specular: 0x555555 })
    : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, clearcoat: 0.65, clearcoatRoughness: 0.10 });
  const browRibbonMat = lowPower
    ? new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 10, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide });
  const lashRibbonMat = lowPower
    ? new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 16, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, side: THREE.DoubleSide });
  const lipRibbonMat = lowPower
    ? new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 30, specular: 0x332222, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.16, clearcoatRoughness: 0.42, sheen: 0.0, side: THREE.DoubleSide });

  const caruncleCol = baseSkin.clone().lerp(new THREE.Color(0xc96f6b), 0.52);
  const caruncleMat = lowPower
    ? new THREE.MeshPhongMaterial({ color: caruncleCol, shininess: 36 })
    : new THREE.MeshStandardMaterial({ color: caruncleCol, roughness: 0.32 });
  const hairBaseC = new THREE.Color(hairColor);
  const browBaseC = hairBaseC.clone().lerp(baseSkin, 0.18);

  [-1, 1].forEach((s) => {
    const eyeCenterX = s * ex;
    // 1. Softly shaded sclera (warm eyelid rim blend + corner shadow so sclera never reads as flat white sticker ovals)
    const scleraGeo = new THREE.SphereGeometry(eyeHalfW, 24, 16);
    scleraGeo.scale(1.0, eyeHalfH / eyeHalfW, 0.12);
    scleraGeo.translate(eyeCenterX, ey, 0);
    projectGeoOntoFace(scleraGeo, headH * 0.0010, 0.18, -headH * 0.002);
    const sp = scleraGeo.attributes.position;
    const sCols = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i++) {
      const dxN = clamp((sp.getX(i) - eyeCenterX) / eyeHalfW, -1, 1);
      const dyN = clamp((sp.getY(i) - ey) / eyeHalfH, -1, 1);
      const cornerAO = 1 - 0.16 * (dxN * dxN) - 0.22 * smoothstep(0.15, 0.95, dyN);
      const rimBlend = smoothstep(0.72, 1.0, Math.hypot(dxN, dyN));
      sCols[i * 3] = lerp(scleraTint.r * cornerAO, lidColor.r, rimBlend * 0.65);
      sCols[i * 3 + 1] = lerp(scleraTint.g * (cornerAO * 0.985), lidColor.g, rimBlend * 0.65);
      sCols[i * 3 + 2] = lerp(scleraTint.b * (cornerAO * 0.97), lidColor.b, rimBlend * 0.65);
    }
    scleraGeo.setAttribute("color", new THREE.Float32BufferAttribute(sCols, 3));
    const sclera = new THREE.Mesh(scleraGeo, scleraVertMat);
    sclera.castShadow = false;
    headBone.add(sclera);

    // Subtle pink medial tear-duct caruncle
    const cxCar = eyeCenterX - s * eyeHalfW * 0.86;
    const cyCar = ey - eyeHalfH * 0.08;
    const caruncle = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.0052, 8, 8), caruncleMat);
    caruncle.scale.set(1.2, 0.85, 0.45);
    caruncle.position.set(cxCar, cyCar, sampleHeadFrontZ(cxCar, cyCar) + headH * 0.0030);
    headBone.add(caruncle);

    // 2. High-detail radially shaded Iris strictly in front of sclera peak Z (zero sclera occlusion!)
    const irisR = headH * (kid ? 0.031 : 0.0295);
    const irisCx = eyeCenterX * 0.98;
    const irisCy = ey + headH * 0.0015;
    const irisGeo = new THREE.SphereGeometry(irisR, 24, 16);
    irisGeo.scale(0.96, 0.96, 0.15);
    irisGeo.translate(irisCx, irisCy, 0);
    projectGeoOntoFace(irisGeo, headH * 0.0046, 0.25, -headH * 0.002);
    const ip = irisGeo.attributes.position;
    const iCols = new Float32Array(ip.count * 3);
    for (let i = 0; i < ip.count; i++) {
      const dx = ip.getX(i) - irisCx;
      const dy = ip.getY(i) - irisCy;
      const rad = clamp(Math.hypot(dx, dy) / irisR, 0, 1);
      const ang = Math.atan2(dy, dx);
      if (rad < 0.38) {
        // Deep pupil backing
        iCols[i * 3] = 0.035; iCols[i * 3 + 1] = 0.032; iCols[i * 3 + 2] = 0.04;
      } else if (rad > 0.78) {
        // Dark limbal ring framing the iris
        const fLimb = smoothstep(0.78, 1.0, rad);
        const m = 1 - 0.65 * fLimb;
        iCols[i * 3] = irisColor.r * m;
        iCols[i * 3 + 1] = irisColor.g * m;
        iCols[i * 3 + 2] = irisColor.b * m;
      } else {
        // Radial iris fibers + warm amber-hazel collarette around pupil
        const radialStriation = 0.90 + 0.16 * Math.sin(ang * 14 + rad * 5);
        const warmInner = 1 + 0.24 * (1 - smoothstep(0.38, 0.62, rad));
        iCols[i * 3] = clamp(irisColor.r * radialStriation * warmInner, 0, 1);
        iCols[i * 3 + 1] = clamp(irisColor.g * radialStriation * warmInner, 0, 1);
        iCols[i * 3 + 2] = clamp(irisColor.b * radialStriation, 0, 1);
      }
    }
    irisGeo.setAttribute("color", new THREE.Float32BufferAttribute(iCols, 3));
    const iris = new THREE.Mesh(irisGeo, irisVertMat);
    iris.castShadow = false;
    headBone.add(iris);

    // Explicit sharp pupil disc in front of iris center
    const pupilR = irisR * 0.40;
    const pupilGeo = new THREE.CircleGeometry(pupilR, 20);
    pupilGeo.translate(irisCx, irisCy, 0);
    projectGeoOntoFace(pupilGeo, headH * 0.0068, 0.0, 0);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.castShadow = false;
    headBone.add(pupil);

    // 3. Glossy specular cornea catchlights strictly in front of pupil & iris
    const gx = irisCx + headH * 0.0068;
    const gy = irisCy + headH * 0.0068;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.0044, 8, 8), glintMat);
    glint.position.set(gx, gy, sampleHeadFrontZ(gx, gy) + headH * 0.0086);
    headBone.add(glint);
    const gx2 = irisCx - headH * 0.0052;
    const gy2 = irisCy - headH * 0.0042;
    const glint2 = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.0022, 6, 6), glintMat);
    glint2.position.set(gx2, gy2, sampleHeadFrontZ(gx2, gy2) + headH * 0.0084);
    headBone.add(glint2);

    // 4. Surface-conformed upper lash line, softened smiling lower eyelid, and upper crease ribbon
    const lid0x = s * (ex - eyeHalfW * 1.00), lid0y = ey - eyeHalfH * 0.04;
    const lid1x = s * (ex + eyeHalfW * 0.02), lid1y = ey + eyeHalfH * 0.86;
    const lid2x = s * (ex + eyeHalfW * 1.04), lid2y = ey + (female ? eyeHalfH * 0.14 : eyeHalfH * 0.05);
    const lashRibbonGeo = createConformedRibbonGeo(
      [[lid0x, lid0y, 0], [lid1x, lid1y, 0], [lid2x, lid2y, 0]],
      (u) => headH * (female ? 0.0044 : 0.0032) * Math.pow(Math.sin(Math.PI * u), 0.7),
      (_u, v) => {
        const edgeFade = 1 - 0.15 * v;
        return [0.09 * edgeFade, 0.06 * edgeFade, 0.05 * edgeFade];
      },
      18,
      3,
      headH * 0.0048,
      headH * 0.0035
    );
    const lash = new THREE.Mesh(lashRibbonGeo, lashRibbonMat);
    lash.castShadow = false;
    headBone.add(lash);

    const lowerLidGeo = createConformedRibbonGeo(
      [[lid0x, lid0y, 0], [s * ex, ey - eyeHalfH * 0.84, 0], [lid2x, lid2y, 0]],
      (u) => headH * 0.0022 * Math.sin(Math.PI * u),
      () => [lidColor.r * 0.88, lidColor.g * 0.88, lidColor.b * 0.88],
      16,
      2,
      headH * 0.0026,
      headH * 0.0014
    );
    const lowerLid = new THREE.Mesh(lowerLidGeo, lashRibbonMat);
    lowerLid.castShadow = false;
    headBone.add(lowerLid);

    const creaseRibbonGeo = createConformedRibbonGeo(
      [[lid0x * 0.99, lid0y + eyeHalfH * 0.34, 0], [lid1x, lid1y + eyeHalfH * 0.34, 0], [lid2x * 0.99, lid2y + eyeHalfH * 0.28, 0]],
      (u) => headH * 0.0022 * Math.sin(Math.PI * u),
      () => [lidColor.r * 0.92, lidColor.g * 0.90, lidColor.b * 0.89],
      16,
      2,
      headH * 0.0005,
      headH * 0.0012
    );
    const crease = new THREE.Mesh(creaseRibbonGeo, lashRibbonMat);
    crease.castShadow = false;
    headBone.add(crease);

    // 5. Friendly tapered eyebrow ribbon conformed softly to supraorbital ridge
    const browY = ey + headH * (category === "men" ? 0.042 : 0.047);
    const b0x = s * (ex - eyeHalfW * 0.96), b0y = browY;
    const b1x = s * (ex + eyeHalfW * 0.22), b1y = browY + headH * (female ? 0.014 : 0.008);
    const b2x = s * (ex + eyeHalfW * 1.16), b2y = browY - headH * 0.005;
    const browMaxHalfW = headH * (category === "men" ? 0.0112 : (kid ? 0.0075 : 0.0080));
    const browGeo = createConformedRibbonGeo(
      [[b0x, b0y, 0], [b1x, b1y, 0], [b2x, b2y, 0]],
      (u) => {
        const taperHead = 0.65 + 0.35 * smoothstep(0.0, 0.22, u);
        const taperTail = 1.0 - 0.82 * smoothstep(0.48, 1.0, u);
        return browMaxHalfW * taperHead * taperTail;
      },
      (u, _v, vSigned) => {
        const featherV = 1 - 0.35 * Math.pow(Math.abs(vSigned), 1.4);
        const strandNoise = 0.92 + 0.10 * Math.sin(u * 42);
        const rC = lerp(baseSkin.r, browBaseC.r * strandNoise, featherV * (1 - 0.28 * smoothstep(0.75, 1.0, u)));
        const gC = lerp(baseSkin.g, browBaseC.g * strandNoise, featherV * (1 - 0.28 * smoothstep(0.75, 1.0, u)));
        const bC = lerp(baseSkin.b, browBaseC.b * strandNoise, featherV * (1 - 0.28 * smoothstep(0.75, 1.0, u)));
        return [rC, gC, bC];
      },
      22,
      4,
      headH * 0.0005,
      headH * 0.0014
    );
    const brow = new THREE.Mesh(browGeo, browRibbonMat);
    brow.castShadow = false;
    headBone.add(brow);
  });

  // 6. Sculpted surface-conformed smiling Cupid's-bow lips + warm upturned corner accents
  const mouthY = -headH * 0.238;
  const mouthHalfW = headH * (kid ? 0.108 : (category === "men" ? 0.116 : 0.114));
  const lipHalfH = headH * (female ? 0.0235 : 0.0205);
  const cornerLift = headH * (category === "men" ? 0.015 : 0.0195);
  const lipCenterPts = [
    [-mouthHalfW, mouthY + cornerLift, 0],
    [-mouthHalfW * 0.62, mouthY + cornerLift * 0.38, 0],
    [-mouthHalfW * 0.28, mouthY + cornerLift * 0.02, 0],
    [0, mouthY - headH * 0.0030, 0],
    [mouthHalfW * 0.28, mouthY + cornerLift * 0.02, 0],
    [mouthHalfW * 0.62, mouthY + cornerLift * 0.38, 0],
    [mouthHalfW, mouthY + cornerLift, 0],
  ];
  const lipGeo = createConformedRibbonGeo(
    lipCenterPts,
    (u) => {
      const xRel = u * 2 - 1;
      const bow = 1 + 0.18 * bumpWindow(Math.abs(xRel), 0.30, 0.26);
      const cornerFullness = 1 - 0.14 * smoothstep(0.70, 1.0, Math.abs(xRel));
      return lipHalfH * Math.pow(Math.max(0, 1 - xRel * xRel), 0.62) * bow * cornerFullness;
    },
    (u, _v, vSigned) => {
      const xRel = u * 2 - 1;
      const absX = Math.abs(xRel);
      const borderBlend = 1 - Math.pow(Math.abs(vSigned), 1.8);
      const cornerTint = 1 - 0.18 * Math.exp(-Math.pow((absX - 0.90) / 0.10, 2)) * Math.exp(-Math.pow(vSigned / 0.45, 2));
      const rimaDark = (1 - 0.48 * Math.exp(-Math.pow((vSigned - 0.04) / 0.16, 2)) * (1 - 0.22 * absX)) * cornerTint;
      const pillowHighlight = 1 + 0.09 * Math.exp(-Math.pow((vSigned + 0.44) / 0.28, 2));
      const cR = lerp(baseSkin.r, lipColor.r * pillowHighlight, borderBlend) * rimaDark;
      const cG = lerp(baseSkin.g, lipColor.g * pillowHighlight, borderBlend) * rimaDark;
      const cB = lerp(baseSkin.b, lipColor.b * pillowHighlight, borderBlend) * rimaDark;
      return [clamp(cR, 0, 1), clamp(cG, 0, 1), clamp(cB, 0, 1)];
    },
    32,
    6,
    headH * 0.0005,
    headH * 0.0018
  );
  const lipMesh = new THREE.Mesh(lipGeo, lipRibbonMat);
  lipMesh.name = "lipMesh";
  lipMesh.castShadow = false;
  headBone.add(lipMesh);
  void browMat; void lidMat; void lashMat; void eyeWhiteMat; void irisMat; void lipMat;

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

  const createHairStrandTexture = () => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#dadada";
    ctx.fillRect(0, 0, 256, 256);

    const curlShift = hairTypeSpec.curlAmp * 260;
    for (let i = 0; i < 190; i++) {
      const xBase = (i / 190) * 256 + ((i * 37) % 5) * 0.35;
      const tone = 176 + ((i * 53) % 76);
      ctx.strokeStyle = `rgb(${tone},${tone},${tone})`;
      ctx.lineWidth = 0.85 + ((i * 19) % 3) * 0.45;
      ctx.beginPath();
      for (let step = 0; step <= 16; step++) {
        const t = step / 16;
        const y = t * 256;
        const wave = Math.sin(t * Math.PI * (2 + (hairTypeSpec.curlFreq || 2) * 0.35) + i * 0.9) * (1.2 + curlShift);
        const x = xBase + wave;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Soft anisotropic mid-shaft Kajiya-Kay specular sheen band
    const sheenGrad = ctx.createLinearGradient(0, 0, 0, 256);
    sheenGrad.addColorStop(0.0, "rgba(0,0,0,0.08)");
    sheenGrad.addColorStop(0.28, "rgba(255,255,255,0.04)");
    sheenGrad.addColorStop(0.46, "rgba(255,255,255,0.22)");
    sheenGrad.addColorStop(0.64, "rgba(255,255,255,0.06)");
    sheenGrad.addColorStop(1.0, "rgba(0,0,0,0.04)");
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(0, 0, 256, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };

  const hairBaseCol = new THREE.Color(hairColor);
  const hairHighlightCol = highlightSpec.hex ? new THREE.Color(highlightSpec.hex) : null;
  const hairHighlightStrength = highlightSpec.strength || 0;
  const hairSheenCol = hairHighlightCol
    ? hairBaseCol.clone().lerp(hairHighlightCol, 0.55).lerp(new THREE.Color(0xffffff), 0.30)
    : hairBaseCol.clone().lerp(new THREE.Color(0xffffff), 0.40);
  const hairStrandTex = createHairStrandTexture();

  const hairVertMat = lowPower
    ? new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: hairStrandTex || null,
      vertexColors: true,
      shininess: hairTypeSpec.shininess || 30,
      specular: 0x423125,
      side: THREE.DoubleSide,
    })
    : new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: hairStrandTex || null,
      bumpMap: hairStrandTex || null,
      bumpScale: hairStrandTex ? headH * 0.009 : 0,
      vertexColors: true,
      roughness: hairTypeSpec.roughness ?? 0.52,
      metalness: 0.02,
      sheen: hairTypeSpec.sheen ?? 0.44,
      sheenRoughness: hairTypeSpec.sheenRoughness ?? 0.42,
      sheenColor: hairSheenCol,
      clearcoat: hairTypeSpec.id === "straight" ? 0.16 : (hairTypeSpec.id === "wavy" ? 0.11 : 0.04),
      clearcoatRoughness: 0.44,
      side: THREE.DoubleSide,
    });

  function computeHairVertexRGB(uNorm, tipFrac, lockWave = 0, partDarken = 0) {
    const shade = clamp(
      0.84
      + 0.20 * smoothstep(0.12, 0.68, tipFrac)
      + 0.13 * clamp(lockWave, -1.2, 1.2)
      - partDarken,
      0.54,
      1.26
    );
    let r = hairBaseCol.r;
    let g = hairBaseCol.g;
    let b = hairBaseCol.b;
    if (hairHighlightCol && hairHighlightStrength > 0) {
      const ribbon = 0.5 + 0.5 * Math.sin(uNorm * Math.PI * 14 + tipFrac * 1.8);
      const hlBlend = clamp(ribbon * smoothstep(0.08, 0.72, tipFrac) * hairHighlightStrength, 0, 0.85);
      r = lerp(r, hairHighlightCol.r, hlBlend);
      g = lerp(g, hairHighlightCol.g, hlBlend);
      b = lerp(b, hairHighlightCol.b, hlBlend);
    }
    return [clamp(r * shade, 0, 1), clamp(g * shade, 0, 1), clamp(b * shade, 0, 1)];
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
    strandFreq = 26,
    strandDepthFrac = 0.0065,
  }) {
    const U_SEGS = 84;
    const V_SEGS = 26;
    const positions = [];
    const hCols = [];
    const uvs = [];
    const indices = [];

    const effStrandFreq = strandFreq * hairTypeSpec.strandFreqMult;
    const effStrandDepth = strandDepthFrac * hairTypeSpec.strandDepthMult;
    const typeLoftMult = hairTypeSpec.loftMult;

    for (let iv = 0; iv <= V_SEGS; iv++) {
      const v = iv / V_SEGS; // 0 = continuous hairline edge, 1 = crown apex
      for (let iu = 0; iu <= U_SEGS; iu++) {
        const uNorm = iu / U_SEGS;
        const phi = -Math.PI + uNorm * 2 * Math.PI;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);

        // Smooth rounded oval hairline with soft baby-hair taper across temples & sideburns
        const faceW = smoothstep(-0.28, 0.36, cosP);
        const templeCurve = templeSweep * Math.pow(clamp(Math.abs(phi) / 1.32, 0, 1), 1.62);
        const partPeak = partDepth > 0 ? 0.015 * bumpWindow(phi, partPhi, 0.22) : 0;
        const babyFeather = 0.005 * Math.sin(phi * 26) * faceW;
        const sideburnDip = bumpWindow(phi, 1.35, 0.16) + bumpWindow(phi, -1.35, 0.16);
        const earArch = bumpWindow(phi, 1.66, 0.22) + bumpWindow(phi, -1.66, 0.22);
        const frontEdgeY = headH * (frontYFrac + partPeak + babyFeather - templeCurve - 0.035 * sideburnDip);
        const backEdgeY = headH * napeYFrac;
        const yEdge = backEdgeY * (1 - faceW) + frontEdgeY * faceW + earArch * headH * 0.115;

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
        const edgeFeather = smoothstep(0.0, 0.20, v);
        const partGroove = partDepth > 0 ? partDepth * bumpWindow(phi, partPhi, 0.10) * smoothstep(0.08, 0.72, v) * Math.max(0, cosP + 0.18) : 0;

        // Multi-frequency longitudinal hair strand locks + hair-type curl / braid modulation
        const sweepShift = Math.sin(v * Math.PI) * 0.38 * Math.sign(phi - partPhi);
        const lockWave = 0.55 * Math.sin((phi - partPhi) * effStrandFreq + sweepShift)
          + 0.35 * Math.sin((phi - partPhi) * (effStrandFreq * 1.9) - v * 2.5)
          + 0.10 * Math.cos(phi * 11 + v * 4.2);
        const curlDisp = hairTypeSpec.curlFreq > 0
          ? Math.sin(phi * hairTypeSpec.curlFreq + v * hairTypeSpec.curlFreq * 0.7) * Math.cos(v * hairTypeSpec.curlFreq * 0.65) * hairTypeSpec.curlAmp
          : 0;
        const braidDisp = hairTypeSpec.braidBands > 0
          ? 0.011 * Math.cos((phi - partPhi) * hairTypeSpec.braidBands + Math.sin(v * 8.0) * 0.35)
          : 0;
        const strandRelief = (effStrandDepth * lockWave + curlDisp + braidDisp) * smoothstep(0.04, 0.30, v) * (1 - 0.52 * smoothstep(0.75, 1.0, v));

        const hatSquash = lerp(1.0, crownCompression, smoothstep(0.24, 0.72, v));
        const loft = headH * (
          0.0045
          + edgeFeather * hatSquash * (
            crownLiftFrac * typeLoftMult * Math.max(0, uy)
            + sideLoftFrac * typeLoftMult * Math.abs(ux)
            + backLoftFrac * typeLoftMult * Math.max(0, -uz)
            - partGroove
            + strandRelief
          )
        );

        const rFinal = rSkull + Math.max(headH * 0.0038, loft);
        positions.push(ux * rFinal, uy * rFinal, uz * rFinal);
        uvs.push(uNorm * 2.5, 1 - v);

        const textureContrast = lockWave + curlDisp * 22 + braidDisp * 30;
        const partShadow = 0.26 * (partGroove / (partDepth || 1));
        const rgb = computeHairVertexRGB(uNorm, 1 - v * 0.45, textureContrast, partShadow);
        hCols.push(rgb[0], rgb[1], rgb[2]);
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
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(hCols, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, hairVertMat);
    mesh.castShadow = true;
    return mesh;
  }

  function addUniformHairColors(geo, mult = 0.94, tipStartY = 0.25, tipEndY = -1.6) {
    const cnt = geo.attributes.position.count;
    const arr = new Float32Array(cnt * 3);
    const uvArr = geo.attributes.uv ? null : new Float32Array(cnt * 2);
    const pos = geo.attributes.position;
    const ySpan = Math.max(0.05, headH * (tipStartY - tipEndY));
    for (let i = 0; i < cnt; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const tipFrac = clamp((headH * tipStartY - py) / ySpan, 0, 1);
      const uNorm = ((Math.atan2(px, pz) + Math.PI) / (2 * Math.PI)) % 1;
      const wave = 0.45 * Math.sin(px * 125 + py * 95 + pz * 60);
      const rgb = computeHairVertexRGB(uNorm, tipFrac, wave, (1 - mult) * 0.4);
      arr[i * 3] = rgb[0];
      arr[i * 3 + 1] = rgb[1];
      arr[i * 3 + 2] = rgb[2];
      if (uvArr) {
        uvArr[i * 2] = uNorm * 2.0;
        uvArr[i * 2 + 1] = tipFrac;
      }
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(arr, 3));
    if (uvArr) geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvArr, 2));
  }

  const activeHairStyle = hairStyle || (
    category === "women" ? "chignon" : (category === "men" ? "classic_men" : (category === "girls" ? "ponytails" : "boys_crop"))
  );

  const hairGroup = new THREE.Group();
  hairGroup.name = "hairGroup";
  headBone.add(hairGroup);

  const addHairMesh = (mesh) => {
    mesh.userData.part = "hair";
    mesh.castShadow = true;
    hairGroup.add(mesh);
    return mesh;
  };

  const addSculptedBun = (radius, scaleVec, posVec, freq = 7) => {
    if (hidesHairUnderHeadwear || crownCompression < 0.5) return null;
    const bunGeo = new THREE.SphereGeometry(headH * radius, 26, 18);
    const bp = bunGeo.attributes.position;
    const waveMult = hairTypeSpec.curlAmp > 0 ? 1.5 : 1.0;
    const effFreq = Math.round(freq * (hairTypeSpec.id === "braided" ? 1.4 : 1.0));
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const ang = Math.atan2(y, x);
      const twist = 1 + 0.085 * waveMult * Math.sin(ang * effFreq + z * 75);
      bp.setXYZ(i, x * twist, y * twist, z);
    }
    bunGeo.computeVertexNormals();
    addUniformHairColors(bunGeo, 0.96, 0.45, -0.35);
    const mesh = new THREE.Mesh(bunGeo, hairVertMat);
    mesh.scale.set(scaleVec[0], scaleVec[1], scaleVec[2]);
    mesh.position.set(headH * posVec[0], headH * posVec[1], headH * posVec[2]);
    return addHairMesh(mesh);
  };

  const pushPointOutFromBody = (x, y, z, extraClearFrac = 0.045, includeArms = false) => {
    const phiWorld = Math.atan2(x, z);
    const rad = Math.hypot(x, z) || 1e-4;
    const minRad = sampleTorsoClearance(y, phiWorld, includeArms) + headH * extraClearFrac;
    if (rad < minRad) {
      const s = minRad / rad;
      return [x * s, z * s];
    }
    return [x, z];
  };

  const addFlowingBackCurtain = (dropOrOpts = -1.16, widthScaleArg = 1.0, waveBoostArg = 0) => {
    const cfg = (dropOrOpts && typeof dropOrOpts === "object")
      ? dropOrOpts
      : { dropYFrac: dropOrOpts, widthScale: widthScaleArg, waveBoost: waveBoostArg };
    const baseDrop = cfg.dropYFrac ?? -1.16;
    const widthScale = cfg.widthScale ?? 1.0;
    const waveBoost = cfg.waveBoost ?? 0;
    const layers = cfg.layers ?? 2;
    const sideBias = cfg.sideBias ?? 0;
    const sCurveAmp = cfg.sCurveAmp ?? 0;
    const hemPoint = cfg.hemPoint ?? 0.08;
    const effDrop = clamp(baseDrop * lengthSpec.dropMult, -2.55, -0.45);
    const waveAmp = (hairTypeSpec.curlAmp > 0 ? hairTypeSpec.curlAmp * 0.95 : 0.006) + waveBoost;
    const waveFreq = hairTypeSpec.curlFreq > 0 ? hairTypeSpec.curlFreq * 0.85 : 5.5;

    for (let layerIdx = 0; layerIdx < layers; layerIdx++) {
      const layerDrop = lerp(-0.14, effDrop, layerIdx === 0 ? 1.0 : 0.86);
      const U = 42, V = 22;
      const pos = [], col = [], uvs = [], idx = [];
      for (let iv = 0; iv <= V; iv++) {
        const t = iv / V;
        const flareOut = Math.sin(Math.min(1, t * 1.12) * Math.PI * 0.65);
        const arcSpan = lerp(1.20, 0.98 - layerIdx * 0.06, t * 0.5) * widthScale;
        const radX = headH * (0.42 + 0.16 * flareOut + layerIdx * 0.025) * widthScale;
        const zCenter = headH * lerp(-0.08, -0.22 - 0.12 * flareOut - layerIdx * 0.032, t);
        const zRadBack = headH * lerp(0.39, 0.36 + layerIdx * 0.02, t);
        for (let iu = 0; iu <= U; iu++) {
          const uNorm = iu / U;
          const phi = -arcSpan + uNorm * (2 * arcSpan);
          const aBack = Math.PI + phi + sideBias * smoothstep(0.08, 0.92, t);
          const hemVDrop = -headH * hemPoint * Math.pow(Math.cos((uNorm - 0.5) * Math.PI), 1.45) * smoothstep(0.55, 1.0, t);
          const y = lerp(-0.16, layerDrop, t) * headH + hemVDrop;
          const lock = Math.sin(phi * 15 * hairTypeSpec.strandFreqMult + t * waveFreq);
          const ripple = waveAmp * headH * Math.sin(t * waveFreq * 1.45 + phi * 5 + layerIdx) * smoothstep(0.04, 0.35, t);
          const glamS = sCurveAmp * headH * Math.sin(t * Math.PI * 3.2 + phi * 1.6) * smoothstep(0.06, 0.9, t);
          const taper = 1 - 0.16 * Math.pow(t, 2.0) * (1 - Math.abs(uNorm - 0.5) * 1.35);
          let x = (Math.sin(aBack) * radX + ripple * 0.45 + glamS * 0.65) * taper;
          let z = zCenter + Math.cos(aBack) * zRadBack - Math.abs(lock) * headH * 0.013 - ripple * 0.55 - glamS * 0.42;
          [x, z] = pushPointOutFromBody(x, y, z, 0.048 + layerIdx * 0.024, t < 0.36);
          pos.push(x, y, z);
          uvs.push(uNorm * 2.5, t);
          const rgb = computeHairVertexRGB(uNorm, t, lock * 0.65 + (layerIdx === 0 ? -0.1 : 0.18), 0.04 * (layerIdx === 0 ? 1 : 0));
          col.push(rgb[0], rgb[1], rgb[2]);
        }
      }
      const stride = U + 1;
      for (let iv = 0; iv < V; iv++) {
        for (let iu = 0; iu < U; iu++) {
          const a = iv * stride + iu, b = a + 1, c = (iv + 1) * stride + iu, d = c + 1;
          idx.push(a, b, d, a, d, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      addHairMesh(new THREE.Mesh(g, hairVertMat));
    }
  };

  const addFrontShoulderLocks = (dropOrOpts = -0.84, radiusFracArg = 0.056) => {
    const cfg = (dropOrOpts && typeof dropOrOpts === "object")
      ? dropOrOpts
      : { dropYFrac: dropOrOpts, radiusFrac: radiusFracArg };
    const baseDrop = cfg.dropYFrac ?? -0.84;
    const radiusFrac = cfg.radiusFrac ?? 0.056;
    const sides = cfg.sides || [-1, 1];
    const strandsPerSide = cfg.strandsPerSide ?? 2;
    const effDrop = clamp(baseDrop * lengthSpec.dropMult, -1.72, -0.35);
    const wave = hairTypeSpec.curlAmp > 0 ? 0.036 : (cfg.waveAmp ?? 0.016);

    sides.forEach((s) => {
      for (let st = 0; st < strandsPerSide; st++) {
        const subScale = st === 0 ? 1.0 : 0.72;
        const subDrop = effDrop * (st === 0 ? 1.0 : 0.78);
        const xOff = st === 0 ? 0 : -0.05 * s;
        const zOff = st === 0 ? 0 : 0.045;
        const rawPts = [
          [s * headH * (0.34 + xOff * 0.4), headH * 0.02, headH * (0.04 + zOff)],
          [s * headH * (0.39 + wave + xOff), -headH * 0.34, headH * (0.12 + zOff)],
          [s * headH * (0.42 - wave * 0.6 + xOff), headH * (subDrop * 0.62), headH * (0.18 + zOff)],
          [s * headH * (0.40 + xOff), headH * subDrop, headH * (0.14 + zOff)],
        ];
        const pts = rawPts.map((p, pIdx) => {
          const [cx, cz] = pushPointOutFromBody(p[0], p[1], p[2], radiusFrac * 1.15 + 0.030, pIdx <= 1);
          return new THREE.Vector3(cx, p[1], cz);
        });
        const curve = new THREE.CatmullRomCurve3(pts);
        const tGeo = new THREE.TubeGeometry(curve, 20, headH * radiusFrac * subScale, 10, false);
        const tp = tGeo.attributes.position;
        for (let i = 0; i < tp.count; i++) {
          const vy = tp.getY(i);
          const f = clamp((headH * 0.02 - vy) / Math.max(0.02, headH * (0.02 - subDrop)), 0, 1);
          const cPt = curve.getPoint(f);
          const shrink = 1 - 0.66 * f;
          let nx = cPt.x + (tp.getX(i) - cPt.x) * shrink;
          let nz = cPt.z + (tp.getZ(i) - cPt.z) * shrink;
          [nx, nz] = pushPointOutFromBody(nx, vy, nz, 0.022, f < 0.35);
          tp.setXYZ(i, nx, vy, nz);
        }
        tGeo.computeVertexNormals();
        addUniformHairColors(tGeo, 0.98, 0.05, subDrop);
        addHairMesh(new THREE.Mesh(tGeo, hairVertMat));
      }
    });
  };

  const addSculptedBraid = ({ side = 1, dropYFrac = -1.58, radiusFrac = 0.048, isBack = false, tieHex = 0x2b2220 } = {}) => {
    const effDrop = clamp(dropYFrac * lengthSpec.dropMult, -2.35, -0.52);
    const rawPts = isBack
      ? [
        [0, headH * -0.14, -headH * 0.40],
        [0, headH * -0.46, -headH * 0.44],
        [0, headH * (effDrop * 0.62), -headH * 0.42],
        [0, headH * effDrop, -headH * 0.40],
      ]
      : [
        [side * headH * 0.27, headH * -0.12, -headH * 0.22],
        [side * headH * 0.40, headH * -0.44, headH * 0.05],
        [side * headH * 0.38, headH * (effDrop * 0.62), headH * 0.22],
        [side * headH * 0.35, headH * effDrop, headH * 0.20],
      ];
    const pts = rawPts.map((p, idx) => {
      const [cx, cz] = pushPointOutFromBody(p[0], p[1], p[2], radiusFrac * 1.15 + 0.036, idx <= 1);
      return new THREE.Vector3(cx, p[1], cz);
    });
    const curve = new THREE.CatmullRomCurve3(pts);
    const tGeo = new THREE.TubeGeometry(curve, 34, headH * radiusFrac, 12, false);
    const tp = tGeo.attributes.position;
    const totalDrop = Math.max(0.05, headH * (rawPts[0][1] / headH - effDrop));
    for (let i = 0; i < tp.count; i++) {
      const vx = tp.getX(i), vy = tp.getY(i), vz = tp.getZ(i);
      const f = clamp((rawPts[0][1] - vy) / totalDrop, 0, 1);
      const cPt = curve.getPoint(f);
      const dx = vx - cPt.x, dz = vz - cPt.z;
      const ang = Math.atan2(dz, dx);
      // Herringbone 3-strand plait modulation before elastic tie at f = 0.86
      const plaitMask = 1 - smoothstep(0.80, 0.88, f);
      const brushMask = smoothstep(0.86, 1.0, f);
      const chevron = 1 + plaitMask * 0.24 * Math.sin(f * 36 + (Math.sin(ang) > 0 ? 1.1 : -1.1));
      const scaleR = (1 - 0.56 * f) * chevron + brushMask * (0.22 * (1 - (f - 0.86) / 0.14));
      let nx = cPt.x + dx * scaleR;
      let nz = cPt.z + dz * scaleR;
      [nx, nz] = pushPointOutFromBody(nx, vy, nz, 0.022, f < 0.35);
      tp.setXYZ(i, nx, vy, nz);
    }
    tGeo.computeVertexNormals();
    addUniformHairColors(tGeo, 0.96, rawPts[0][1] / headH, effDrop);
    addHairMesh(new THREE.Mesh(tGeo, hairVertMat));

    const tiePt = curve.getPoint(0.85);
    const tieMat = lowPower
      ? new THREE.MeshPhongMaterial({ color: tieHex, shininess: 26 })
      : new THREE.MeshStandardMaterial({ color: tieHex, roughness: 0.45 });
    const tieRing = new THREE.Mesh(new THREE.TorusGeometry(headH * radiusFrac * 0.58, headH * 0.011, 8, 16), tieMat);
    tieRing.position.copy(tiePt);
    tieRing.rotation.x = Math.PI * 0.48;
    addHairMesh(tieRing);
  };

  const addHighFlowingPonytail = ({
    rootYFrac = 0.34,
    rootZFrac = -0.30,
    dropYFrac = -1.75,
    tieHex = 0x2a201d,
  } = {}) => {
    const effDrop = clamp(dropYFrac * lengthSpec.dropMult, -2.45, -0.52);
    const tieMat = lowPower
      ? new THREE.MeshPhongMaterial({ color: tieHex, shininess: 28 })
      : new THREE.MeshStandardMaterial({ color: tieHex, roughness: 0.42 });
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.064, headH * 0.017, 10, 20), tieMat);
    cuff.position.set(0, headH * rootYFrac, headH * rootZFrac);
    cuff.rotation.x = Math.PI * 0.34;
    addHairMesh(cuff);

    const U = 24, V = 24;
    const pos = [], col = [], uvs = [], idx = [];
    for (let iv = 0; iv <= V; iv++) {
      const t = iv / V;
      const y = lerp(rootYFrac, effDrop, Math.pow(t, 0.96)) * headH;
      const archOut = Math.sin(clamp(t * 2.2, 0, Math.PI)) * headH * 0.24;
      const width = headH * (0.045 + 0.19 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.6) * (1 - 0.35 * Math.pow(t, 2)));
      for (let iu = 0; iu <= U; iu++) {
        const uNorm = iu / U;
        const arc = -1.1 + uNorm * 2.2;
        const waveShift = (hairTypeSpec.curlAmp > 0 ? hairTypeSpec.curlAmp * 0.9 : 0.014) * headH * Math.sin(t * 9 + uNorm * 6);
        let x = Math.sin(arc) * width + waveShift;
        let z = headH * rootZFrac - archOut - Math.cos(arc) * width * 0.45 - Math.abs(Math.sin(arc * 7)) * headH * 0.012;
        [x, z] = pushPointOutFromBody(x, y, z, 0.050, t < 0.32);
        pos.push(x, y, z);
        uvs.push(uNorm * 1.8, t);
        const rgb = computeHairVertexRGB(uNorm, t, Math.sin(arc * 8 + t * 5) * 0.75, 0);
        col.push(rgb[0], rgb[1], rgb[2]);
      }
    }
    const stride = U + 1;
    for (let iv = 0; iv < V; iv++) {
      for (let iu = 0; iu < U; iu++) {
        const a = iv * stride + iu, b = a + 1, c = (iv + 1) * stride + iu, d = c + 1;
        idx.push(a, b, d, a, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    addHairMesh(new THREE.Mesh(g, hairVertMat));
  };

  const addLongLayeredCurls = (dropYFrac = -1.78, widthScale = 1.06) => {
    addFlowingBackCurtain({
      dropYFrac,
      widthScale,
      waveBoost: 0.026,
      layers: 2,
      sCurveAmp: 0.022,
      hemPoint: 0.12,
    });
    const effDrop = clamp(dropYFrac * lengthSpec.dropMult, -2.42, -0.58);
    // Cascading corkscrew spiral ringlets across back & shoulders
    const ringletSpecs = [
      [-0.26, -0.34, effDrop * 0.74, 0.040, 3.8],
      [0.26, -0.34, effDrop * 0.74, 0.040, 3.8],
      [-0.18, -0.40, effDrop * 0.90, 0.042, 4.4],
      [0.18, -0.40, effDrop * 0.90, 0.042, 4.4],
      [-0.08, -0.43, effDrop * 0.98, 0.044, 4.8],
      [0.08, -0.43, effDrop * 0.98, 0.044, 4.8],
      [-0.35, -0.10, effDrop * 0.62, 0.036, 3.2],
      [0.35, -0.10, effDrop * 0.62, 0.036, 3.2],
    ];
    ringletSpecs.forEach(([xFrac, zFrac, rDrop, radFrac, turns], idxR) => {
      const pts = [];
      const steps = 16;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const y = lerp(-0.14, rDrop, t) * headH;
        const spiralR = headH * (0.026 + 0.020 * Math.sin(t * Math.PI));
        const ang = t * Math.PI * 2 * turns + idxR * 0.9;
        let x = headH * xFrac * (1 + 0.25 * t) + Math.cos(ang) * spiralR;
        let z = headH * zFrac - headH * 0.08 * t + Math.sin(ang) * spiralR;
        [x, z] = pushPointOutFromBody(x, y, z, radFrac + 0.042, t < 0.38);
        pts.push(new THREE.Vector3(x, y, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 24, headH * radFrac, 8, false);
      const gp = geo.attributes.position;
      for (let i = 0; i < gp.count; i++) {
        const vy = gp.getY(i);
        const f = clamp((headH * -0.14 - vy) / Math.max(0.02, headH * (-0.14 - rDrop)), 0, 1);
        const cPt = curve.getPoint(f);
        const sh = 1 - 0.52 * f;
        gp.setXYZ(i, cPt.x + (gp.getX(i) - cPt.x) * sh, vy, cPt.z + (gp.getZ(i) - cPt.z) * sh);
      }
      geo.computeVertexNormals();
      addUniformHairColors(geo, 0.97, -0.12, rDrop);
      addHairMesh(new THREE.Mesh(geo, hairVertMat));
    });
  };

  if (hidesHairUnderHeadwear || activeHairStyle === "bald") {
    // Clean shaved or fully covered under hijab / niqab / ghutra / shemagh / shawl
  } else if (category === "women") {
    if (activeHairStyle === "long_straight" || activeHairStyle === "long_wavy") {
      const isWavyCut = activeHairStyle === "long_wavy";
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.246,
        templeSweep: 0.122,
        napeYFrac: -0.34,
        crownLiftFrac: isWavyCut ? 0.072 : 0.058,
        sideLoftFrac: isWavyCut ? 0.066 : 0.048,
        backLoftFrac: isWavyCut ? 0.088 : 0.070,
        partPhi: isWavyCut ? 0.18 : 0.0,
        partDepth: 0.009,
        strandFreq: isWavyCut ? 22 : 30,
        strandDepthFrac: isWavyCut ? 0.011 : 0.007,
      }));
      addFlowingBackCurtain({
        dropYFrac: isWavyCut ? -1.54 : -1.48,
        widthScale: 1.04,
        waveBoost: isWavyCut ? 0.022 : 0.0,
        layers: 2,
        sCurveAmp: isWavyCut ? 0.014 : 0.0,
      });
      addFrontShoulderLocks({ dropYFrac: isWavyCut ? -1.10 : -1.04, radiusFrac: 0.054, strandsPerSide: 2 });
    } else if (activeHairStyle === "long_waist_straight") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.248,
        templeSweep: 0.126,
        napeYFrac: -0.35,
        crownLiftFrac: 0.058,
        sideLoftFrac: 0.050,
        backLoftFrac: 0.072,
        partPhi: 0.0,
        partDepth: 0.011,
        strandFreq: 34,
        strandDepthFrac: 0.0075,
      }));
      addFlowingBackCurtain({
        dropYFrac: -2.14,
        widthScale: 1.06,
        waveBoost: 0.002,
        layers: 2,
        hemPoint: 0.12,
      });
      addFrontShoulderLocks({ dropYFrac: -1.36, radiusFrac: 0.056, strandsPerSide: 2, waveAmp: 0.006 });
    } else if (activeHairStyle === "long_hollywood_waves") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.244,
        templeSweep: 0.128,
        napeYFrac: -0.36,
        crownLiftFrac: 0.082,
        sideLoftFrac: 0.074,
        backLoftFrac: 0.094,
        partPhi: 0.36,
        partDepth: 0.012,
        strandFreq: 20,
        strandDepthFrac: 0.012,
      }));
      addFlowingBackCurtain({
        dropYFrac: -1.94,
        widthScale: 1.10,
        waveBoost: 0.028,
        layers: 2,
        sideBias: 0.14,
        sCurveAmp: 0.032,
        hemPoint: 0.10,
      });
      addFrontShoulderLocks({ dropYFrac: -1.38, radiusFrac: 0.060, sides: [1], strandsPerSide: 2, waveAmp: 0.028 });
      addFrontShoulderLocks({ dropYFrac: -1.06, radiusFrac: 0.048, sides: [-1], strandsPerSide: 1, waveAmp: 0.024 });
    } else if (activeHairStyle === "long_layered_curls") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.240,
        templeSweep: 0.120,
        napeYFrac: -0.36,
        crownLiftFrac: 0.094,
        sideLoftFrac: 0.086,
        backLoftFrac: 0.104,
        partPhi: 0.12,
        partDepth: 0.005,
        strandFreq: 24,
        strandDepthFrac: 0.014,
      }));
      addLongLayeredCurls(-1.82, 1.08);
      addFrontShoulderLocks({ dropYFrac: -1.24, radiusFrac: 0.058, strandsPerSide: 2, waveAmp: 0.034 });
    } else if (activeHairStyle === "long_half_up") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.252,
        templeSweep: 0.114,
        napeYFrac: -0.35,
        crownLiftFrac: 0.068,
        sideLoftFrac: 0.054,
        backLoftFrac: 0.078,
        partPhi: 0.0,
        partDepth: 0.008,
        strandFreq: 28,
        strandDepthFrac: 0.008,
      }));
      addSculptedBun(0.135, [1.08, 0.90, 1.02], [0, 0.38, -0.26], 8);
      addFlowingBackCurtain({
        dropYFrac: -1.80,
        widthScale: 1.04,
        waveBoost: 0.018,
        layers: 2,
        sCurveAmp: 0.016,
      });
      addFrontShoulderLocks({ dropYFrac: -1.16, radiusFrac: 0.052, strandsPerSide: 2 });
    } else if (activeHairStyle === "long_high_ponytail") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.260,
        templeSweep: 0.096,
        napeYFrac: -0.28,
        crownLiftFrac: 0.048,
        sideLoftFrac: 0.030,
        backLoftFrac: 0.048,
        partPhi: 0.0,
        partDepth: 0.004,
        strandFreq: 34,
        strandDepthFrac: 0.007,
      }));
      addHighFlowingPonytail({ rootYFrac: 0.36, rootZFrac: -0.28, dropYFrac: -1.82, tieHex: 0x2f2521 });
      addFrontShoulderLocks({ dropYFrac: -0.62, radiusFrac: 0.026, strandsPerSide: 1, waveAmp: 0.012 });
    } else if (activeHairStyle === "long_side_sweep") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.246,
        templeSweep: 0.122,
        napeYFrac: -0.34,
        crownLiftFrac: 0.072,
        sideLoftFrac: 0.062,
        backLoftFrac: 0.078,
        partPhi: -0.42,
        partDepth: 0.011,
        strandFreq: 24,
        strandDepthFrac: 0.0095,
      }));
      addFlowingBackCurtain({
        dropYFrac: -1.68,
        widthScale: 0.96,
        waveBoost: 0.016,
        layers: 2,
        sideBias: 0.42,
        sCurveAmp: 0.022,
      });
      addFrontShoulderLocks({ dropYFrac: -1.52, radiusFrac: 0.064, sides: [1], strandsPerSide: 3, waveAmp: 0.026 });
    } else if (activeHairStyle === "long_twin_braids") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.250,
        templeSweep: 0.114,
        napeYFrac: -0.34,
        crownLiftFrac: 0.056,
        sideLoftFrac: 0.044,
        backLoftFrac: 0.066,
        partPhi: 0.0,
        partDepth: 0.012,
        strandFreq: 26,
        strandDepthFrac: 0.0085,
      }));
      addSculptedBraid({ side: -1, dropYFrac: -1.62, radiusFrac: 0.048 });
      addSculptedBraid({ side: 1, dropYFrac: -1.62, radiusFrac: 0.048 });
    } else if (activeHairStyle === "curly_afro") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.236,
        templeSweep: 0.118,
        napeYFrac: -0.36,
        crownLiftFrac: 0.142,
        sideLoftFrac: 0.122,
        backLoftFrac: 0.132,
        partPhi: 0.0,
        partDepth: 0.001,
        strandFreq: 38,
        strandDepthFrac: 0.016,
      }));
      for (const [cx, cy, cz, cr] of [
        [0, 0.44, -0.06, 0.18], [-0.28, 0.24, -0.06, 0.17], [0.28, 0.24, -0.06, 0.17],
        [-0.24, -0.04, -0.24, 0.18], [0.24, -0.04, -0.24, 0.18], [0, -0.10, -0.36, 0.19],
      ]) {
        addSculptedBun(cr, [1.05, 1.0, 1.05], [cx, cy, cz], 11);
      }
    } else if (activeHairStyle === "pixie_crop") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.236,
        templeSweep: 0.088,
        napeYFrac: -0.22,
        crownLiftFrac: 0.052,
        sideLoftFrac: 0.026,
        backLoftFrac: 0.036,
        partPhi: 0.28,
        partDepth: 0.006,
        strandFreq: 32,
        strandDepthFrac: 0.007,
      }));
    } else if (activeHairStyle === "high_bun") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.258,
        templeSweep: 0.098,
        napeYFrac: -0.28,
        crownLiftFrac: 0.048,
        sideLoftFrac: 0.032,
        backLoftFrac: 0.048,
        partPhi: 0.0,
        partDepth: 0.006,
        strandFreq: 30,
        strandDepthFrac: 0.007,
      }));
      addSculptedBun(0.155, [1.05, 0.92, 1.02], [0, 0.49, -0.14], 8);
    } else if (activeHairStyle === "bob") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.244,
        templeSweep: 0.128,
        napeYFrac: -0.44,
        crownLiftFrac: 0.056,
        sideLoftFrac: 0.058,
        backLoftFrac: 0.088,
        partPhi: -0.20,
        partDepth: 0.009,
        strandFreq: 26,
        strandDepthFrac: 0.006,
      }));
    } else if (activeHairStyle === "waves") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.246,
        templeSweep: 0.120,
        napeYFrac: -0.40,
        crownLiftFrac: 0.064,
        sideLoftFrac: 0.064,
        backLoftFrac: 0.082,
        partPhi: 0.24,
        partDepth: 0.010,
        strandFreq: 20,
        strandDepthFrac: 0.011,
      }));
      addSculptedBun(0.165, [1.42, 0.72, 0.76], [0, -0.24, -0.41], 6);
    } else if (activeHairStyle === "side_chignon") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.250,
        templeSweep: 0.110,
        napeYFrac: -0.35,
        crownLiftFrac: 0.054,
        sideLoftFrac: 0.044,
        backLoftFrac: 0.066,
        partPhi: 0.36,
        partDepth: 0.009,
        strandFreq: 28,
        strandDepthFrac: 0.008,
      }));
      addSculptedBun(0.168, [1.06, 0.92, 0.88], [0.16, -0.18, -0.39], 7);
    } else if (activeHairStyle === "voluminous_updo") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.254,
        templeSweep: 0.106,
        napeYFrac: -0.32,
        crownLiftFrac: 0.088,
        sideLoftFrac: 0.056,
        backLoftFrac: 0.088,
        partPhi: 0.0,
        partDepth: 0.004,
        strandFreq: 26,
        strandDepthFrac: 0.0085,
      }));
      addSculptedBun(0.185, [0.92, 1.32, 0.84], [0, 0.02, -0.435], 7);
    } else if (activeHairStyle === "crown_braid") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.250,
        templeSweep: 0.104,
        napeYFrac: -0.33,
        crownLiftFrac: 0.054,
        sideLoftFrac: 0.042,
        backLoftFrac: 0.062,
        partPhi: 0.0,
        partDepth: 0.005,
        strandFreq: 24,
        strandDepthFrac: 0.008,
      }));
      if (crownCompression >= 0.5) {
        const braidGeo = new THREE.TorusGeometry(headH * 0.405, headH * 0.044, 12, 36);
        const brPos = braidGeo.attributes.position;
        for (let i = 0; i < brPos.count; i++) {
          const bx = brPos.getX(i), by = brPos.getY(i), bz = brPos.getZ(i);
          const w = 1 + 0.08 * Math.sin(Math.atan2(by, bx) * 18);
          brPos.setXYZ(i, bx * w, by * w, bz);
        }
        braidGeo.computeVertexNormals();
        addUniformHairColors(braidGeo, 0.96);
        const crown = new THREE.Mesh(braidGeo, hairVertMat);
        crown.position.set(0, headH * 0.20, -headH * 0.02);
        crown.rotation.x = Math.PI * 0.44;
        addHairMesh(crown);
      }
    } else if (activeHairStyle === "low_ponytail") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.250,
        templeSweep: 0.108,
        napeYFrac: -0.34,
        crownLiftFrac: 0.050,
        sideLoftFrac: 0.040,
        backLoftFrac: 0.058,
        partPhi: 0.0,
        partDepth: 0.006,
        strandFreq: 28,
        strandDepthFrac: 0.0075,
      }));
      const wTieMat = lowPower
        ? new THREE.MeshPhongMaterial({ color: 0x2f2521, shininess: 30 })
        : new THREE.MeshStandardMaterial({ color: 0x2f2521, roughness: 0.45 });
      const wTie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.054, headH * 0.015, 10, 18), wTieMat);
      wTie.position.set(0, -headH * 0.20, -headH * 0.42);
      addHairMesh(wTie);
      const lowDrop = clamp(-0.92 * lengthSpec.dropMult, -1.65, -0.45);
      const wCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -headH * 0.20, -headH * 0.42),
        new THREE.Vector3(0, -headH * 0.46, -headH * 0.50),
        new THREE.Vector3(0, headH * lowDrop, -headH * 0.48),
      ]);
      const wTailGeo = new THREE.TubeGeometry(wCurve, 20, headH * 0.074, 12, false);
      const wtp = wTailGeo.attributes.position;
      for (let i = 0; i < wtp.count; i++) {
        const vy = wtp.getY(i);
        const f = clamp((-headH * 0.20 - vy) / Math.max(0.02, headH * (-0.20 - lowDrop)), 0, 1);
        const cPt = wCurve.getPoint(f);
        const sh = 1 - 0.62 * f;
        wtp.setXYZ(i, cPt.x + (wtp.getX(i) - cPt.x) * sh, vy, cPt.z + (wtp.getZ(i) - cPt.z) * sh);
      }
      wTailGeo.computeVertexNormals();
      addUniformHairColors(wTailGeo, 0.96, -0.18, lowDrop);
      addHairMesh(new THREE.Mesh(wTailGeo, hairVertMat));
    } else if (activeHairStyle === "french_twist") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.252,
        templeSweep: 0.106,
        napeYFrac: -0.34,
        crownLiftFrac: 0.068,
        sideLoftFrac: 0.044,
        backLoftFrac: 0.066,
        partPhi: -0.14,
        partDepth: 0.005,
        strandFreq: 28,
        strandDepthFrac: 0.0075,
      }));
      addSculptedBun(0.155, [0.76, 1.55, 0.72], [0, -0.02, -0.435], 9);
    } else if (activeHairStyle === "glam_bun") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.254,
        templeSweep: 0.102,
        napeYFrac: -0.30,
        crownLiftFrac: 0.082,
        sideLoftFrac: 0.048,
        backLoftFrac: 0.072,
        partPhi: 0.0,
        partDepth: 0.004,
        strandFreq: 26,
        strandDepthFrac: 0.008,
      }));
      addSculptedBun(0.195, [1.14, 1.02, 0.94], [0, 0.34, -0.34], 8);
    } else {
      // "chignon" — Classic M baseline
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.252,
        templeSweep: 0.112,
        napeYFrac: -0.36,
        crownLiftFrac: 0.056,
        sideLoftFrac: 0.044,
        backLoftFrac: 0.072,
        partPhi: 0.18,
        partDepth: 0.009,
        strandFreq: 28,
        strandDepthFrac: 0.008,
      }));
      addSculptedBun(0.178, [1.18, 0.88, 0.84], [0, -0.17, -0.435], 7);
    }
  } else if (category === "men") {
    if (activeHairStyle === "curly_fade") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.244,
        templeSweep: 0.060,
        napeYFrac: -0.22,
        crownLiftFrac: 0.095,
        sideLoftFrac: 0.015,
        backLoftFrac: 0.022,
        partPhi: 0.0,
        partDepth: 0.001,
        strandFreq: 28,
        strandDepthFrac: 0.015,
      }));
      addSculptedBun(0.165, [1.45, 0.56, 1.52], [0, 0.39, 0.02], 12);
    } else if (activeHairStyle === "long_men") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.252,
        templeSweep: 0.096,
        napeYFrac: -0.44,
        crownLiftFrac: 0.064,
        sideLoftFrac: 0.050,
        backLoftFrac: 0.078,
        partPhi: 0.0,
        partDepth: 0.007,
        strandFreq: 24,
        strandDepthFrac: 0.0095,
      }));
      addFlowingBackCurtain({ dropYFrac: -0.88, widthScale: 0.96, waveBoost: 0.010, layers: 2 });
    } else if (activeHairStyle === "long_men_waves") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.246,
        templeSweep: 0.104,
        napeYFrac: -0.44,
        crownLiftFrac: 0.072,
        sideLoftFrac: 0.056,
        backLoftFrac: 0.086,
        partPhi: 0.16,
        partDepth: 0.008,
        strandFreq: 20,
        strandDepthFrac: 0.0115,
      }));
      addFlowingBackCurtain({ dropYFrac: -1.32, widthScale: 1.02, waveBoost: 0.022, layers: 2, sCurveAmp: 0.018 });
      addFrontShoulderLocks({ dropYFrac: -0.86, radiusFrac: 0.044, strandsPerSide: 1, waveAmp: 0.022 });
    } else if (activeHairStyle === "long_men_straight") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.250,
        templeSweep: 0.102,
        napeYFrac: -0.44,
        crownLiftFrac: 0.058,
        sideLoftFrac: 0.046,
        backLoftFrac: 0.074,
        partPhi: 0.0,
        partDepth: 0.009,
        strandFreq: 30,
        strandDepthFrac: 0.0075,
      }));
      addFlowingBackCurtain({ dropYFrac: -1.38, widthScale: 0.98, waveBoost: 0.004, layers: 2, hemPoint: 0.08 });
      addFrontShoulderLocks({ dropYFrac: -0.84, radiusFrac: 0.040, strandsPerSide: 1, waveAmp: 0.008 });
    } else if (activeHairStyle === "long_men_half_up") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.264,
        templeSweep: 0.078,
        napeYFrac: -0.34,
        crownLiftFrac: 0.050,
        sideLoftFrac: 0.030,
        backLoftFrac: 0.056,
        partPhi: 0.0,
        partDepth: 0.003,
        strandFreq: 32,
        strandDepthFrac: 0.007,
      }));
      const mbTieMat = lowPower
        ? new THREE.MeshPhongMaterial({ color: 0x1b1918, shininess: 20 })
        : new THREE.MeshStandardMaterial({ color: 0x1b1918, roughness: 0.6 });
      const mbTie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.050, headH * 0.013, 10, 18), mbTieMat);
      mbTie.position.set(0, headH * 0.24, -headH * 0.35);
      mbTie.rotation.x = Math.PI * 0.34;
      addHairMesh(mbTie);
      addSculptedBun(0.125, [0.95, 0.88, 0.96], [0, 0.26, -0.40], 7);
      addFlowingBackCurtain({ dropYFrac: -1.24, widthScale: 0.94, waveBoost: 0.014, layers: 2 });
    } else if (activeHairStyle === "man_bun") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.266,
        templeSweep: 0.068,
        napeYFrac: -0.26,
        crownLiftFrac: 0.044,
        sideLoftFrac: 0.020,
        backLoftFrac: 0.036,
        partPhi: 0.0,
        partDepth: 0.002,
        strandFreq: 34,
        strandDepthFrac: 0.006,
      }));
      const mbTieMat = lowPower
        ? new THREE.MeshPhongMaterial({ color: 0x1b1918, shininess: 20 })
        : new THREE.MeshStandardMaterial({ color: 0x1b1918, roughness: 0.6 });
      const mbTie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.052, headH * 0.013, 10, 18), mbTieMat);
      mbTie.position.set(0, headH * 0.22, -headH * 0.36);
      mbTie.rotation.x = Math.PI * 0.34;
      addHairMesh(mbTie);
      addSculptedBun(0.135, [0.95, 0.90, 0.98], [0, 0.24, -0.41], 7);
    } else if (activeHairStyle === "textured_crop") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.246,
        templeSweep: 0.064,
        napeYFrac: -0.22,
        crownLiftFrac: 0.048,
        sideLoftFrac: 0.020,
        backLoftFrac: 0.030,
        partPhi: 0.0,
        partDepth: 0.002,
        strandFreq: 30,
        strandDepthFrac: 0.011,
      }));
    } else if (activeHairStyle === "buzz_fade") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.270,
        templeSweep: 0.050,
        napeYFrac: -0.19,
        crownLiftFrac: 0.022,
        sideLoftFrac: 0.012,
        backLoftFrac: 0.018,
        partPhi: 0.0,
        partDepth: 0.0,
        strandFreq: 42,
        strandDepthFrac: 0.003,
      }));
    } else if (activeHairStyle === "parted_pomp") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.264,
        templeSweep: 0.074,
        napeYFrac: -0.25,
        crownLiftFrac: 0.072,
        sideLoftFrac: 0.022,
        backLoftFrac: 0.036,
        partPhi: -0.34,
        partDepth: 0.009,
        strandFreq: 28,
        strandDepthFrac: 0.0085,
      }));
      addSculptedBun(0.132, [1.18, 0.48, 1.38], [0.05, 0.40, 0.10], 7);
    } else if (activeHairStyle === "executive_comb") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.258,
        templeSweep: 0.074,
        napeYFrac: -0.25,
        crownLiftFrac: 0.058,
        sideLoftFrac: 0.028,
        backLoftFrac: 0.038,
        partPhi: 0.38,
        partDepth: 0.010,
        strandFreq: 30,
        strandDepthFrac: 0.0085,
      }));
    } else if (activeHairStyle === "classic_crown") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.250,
        templeSweep: 0.078,
        napeYFrac: -0.30,
        crownLiftFrac: 0.068,
        sideLoftFrac: 0.036,
        backLoftFrac: 0.052,
        partPhi: -0.18,
        partDepth: 0.007,
        strandFreq: 20,
        strandDepthFrac: 0.011,
      }));
    } else if (activeHairStyle === "side_crop") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.264,
        templeSweep: 0.068,
        napeYFrac: -0.24,
        crownLiftFrac: 0.044,
        sideLoftFrac: 0.020,
        backLoftFrac: 0.032,
        partPhi: 0.34,
        partDepth: 0.008,
        strandFreq: 34,
        strandDepthFrac: 0.0065,
      }));
    } else if (activeHairStyle === "quiff") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.258,
        templeSweep: 0.076,
        napeYFrac: -0.26,
        crownLiftFrac: 0.074,
        sideLoftFrac: 0.022,
        backLoftFrac: 0.038,
        partPhi: -0.20,
        partDepth: 0.004,
        strandFreq: 28,
        strandDepthFrac: 0.009,
      }));
      addSculptedBun(0.145, [1.22, 0.56, 1.35], [0.02, 0.38, 0.08], 6);
    } else if (activeHairStyle === "swept_back") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.272,
        templeSweep: 0.062,
        napeYFrac: -0.30,
        crownLiftFrac: 0.066,
        sideLoftFrac: 0.034,
        backLoftFrac: 0.052,
        partPhi: 0.0,
        partDepth: 0.002,
        strandFreq: 24,
        strandDepthFrac: 0.009,
      }));
    } else if (activeHairStyle === "short_taper") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.268,
        templeSweep: 0.058,
        napeYFrac: -0.22,
        crownLiftFrac: 0.032,
        sideLoftFrac: 0.016,
        backLoftFrac: 0.024,
        partPhi: -0.30,
        partDepth: 0.004,
        strandFreq: 36,
        strandDepthFrac: 0.005,
      }));
    } else if (activeHairStyle === "classic_wave") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.254,
        templeSweep: 0.082,
        napeYFrac: -0.29,
        crownLiftFrac: 0.062,
        sideLoftFrac: 0.032,
        backLoftFrac: 0.048,
        partPhi: 0.22,
        partDepth: 0.008,
        strandFreq: 22,
        strandDepthFrac: 0.010,
      }));
    } else {
      // "classic_men" — Classic M baseline
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.262,
        templeSweep: 0.070,
        napeYFrac: -0.26,
        crownLiftFrac: 0.050,
        sideLoftFrac: 0.024,
        backLoftFrac: 0.036,
        partPhi: -0.28,
        partDepth: 0.007,
        strandFreq: 32,
        strandDepthFrac: 0.007,
      }));
    }
  } else if (category === "girls") {
    const tieMat = lowPower
      ? new THREE.MeshPhongMaterial({ color: 0xe0568c, shininess: 35 })
      : new THREE.MeshStandardMaterial({ color: 0xe0568c, roughness: 0.38 });

    if (activeHairStyle === "long_straight" || activeHairStyle === "long_wavy") {
      const isWavy = activeHairStyle === "long_wavy";
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.244,
        templeSweep: 0.114,
        napeYFrac: -0.32,
        crownLiftFrac: isWavy ? 0.066 : 0.054,
        sideLoftFrac: isWavy ? 0.060 : 0.044,
        backLoftFrac: isWavy ? 0.080 : 0.062,
        partPhi: isWavy ? 0.14 : 0.0,
        partDepth: 0.008,
        strandFreq: isWavy ? 22 : 30,
        strandDepthFrac: isWavy ? 0.010 : 0.0065,
      }));
      addFlowingBackCurtain({
        dropYFrac: isWavy ? -1.42 : -1.36,
        widthScale: 0.98,
        waveBoost: isWavy ? 0.018 : 0.0,
        layers: 2,
      });
      addFrontShoulderLocks({ dropYFrac: isWavy ? -0.98 : -0.92, radiusFrac: 0.050, strandsPerSide: 2 });
    } else if (activeHairStyle === "long_waist_straight") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.246,
        templeSweep: 0.118,
        napeYFrac: -0.34,
        crownLiftFrac: 0.054,
        sideLoftFrac: 0.046,
        backLoftFrac: 0.066,
        partPhi: 0.0,
        partDepth: 0.009,
        strandFreq: 32,
        strandDepthFrac: 0.007,
      }));
      addFlowingBackCurtain({ dropYFrac: -1.92, widthScale: 1.0, waveBoost: 0.002, layers: 2, hemPoint: 0.10 });
      addFrontShoulderLocks({ dropYFrac: -1.18, radiusFrac: 0.050, strandsPerSide: 2, waveAmp: 0.006 });
    } else if (activeHairStyle === "long_hollywood_waves") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.244,
        templeSweep: 0.120,
        napeYFrac: -0.34,
        crownLiftFrac: 0.072,
        sideLoftFrac: 0.064,
        backLoftFrac: 0.084,
        partPhi: 0.28,
        partDepth: 0.010,
        strandFreq: 20,
        strandDepthFrac: 0.011,
      }));
      addFlowingBackCurtain({ dropYFrac: -1.72, widthScale: 1.04, waveBoost: 0.024, layers: 2, sCurveAmp: 0.026 });
      addFrontShoulderLocks({ dropYFrac: -1.14, radiusFrac: 0.052, strandsPerSide: 2, waveAmp: 0.024 });
    } else if (activeHairStyle === "long_layered_curls") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.240,
        templeSweep: 0.114,
        napeYFrac: -0.34,
        crownLiftFrac: 0.086,
        sideLoftFrac: 0.078,
        backLoftFrac: 0.094,
        partPhi: 0.0,
        partDepth: 0.004,
        strandFreq: 24,
        strandDepthFrac: 0.013,
      }));
      addLongLayeredCurls(-1.60, 1.02);
      addFrontShoulderLocks({ dropYFrac: -1.04, radiusFrac: 0.050, strandsPerSide: 2, waveAmp: 0.030 });
    } else if (activeHairStyle === "long_twin_braids") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.248,
        templeSweep: 0.108,
        napeYFrac: -0.32,
        crownLiftFrac: 0.052,
        sideLoftFrac: 0.040,
        backLoftFrac: 0.060,
        partPhi: 0.0,
        partDepth: 0.011,
        strandFreq: 26,
        strandDepthFrac: 0.008,
      }));
      addSculptedBraid({ side: -1, dropYFrac: -1.42, radiusFrac: 0.044, tieHex: 0xe0568c });
      addSculptedBraid({ side: 1, dropYFrac: -1.42, radiusFrac: 0.044, tieHex: 0xe0568c });
    } else if (activeHairStyle === "long_high_ponytail") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.254,
        templeSweep: 0.096,
        napeYFrac: -0.28,
        crownLiftFrac: 0.048,
        sideLoftFrac: 0.032,
        backLoftFrac: 0.048,
        partPhi: 0.0,
        partDepth: 0.004,
        strandFreq: 32,
        strandDepthFrac: 0.007,
      }));
      addHighFlowingPonytail({ rootYFrac: 0.34, rootZFrac: -0.28, dropYFrac: -1.56, tieHex: 0xe0568c });
      addFrontShoulderLocks({ dropYFrac: -0.56, radiusFrac: 0.024, strandsPerSide: 1, waveAmp: 0.010 });
    } else if (activeHairStyle === "curly_afro") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.236,
        templeSweep: 0.112,
        napeYFrac: -0.34,
        crownLiftFrac: 0.132,
        sideLoftFrac: 0.115,
        backLoftFrac: 0.122,
        partPhi: 0.0,
        partDepth: 0.001,
        strandFreq: 38,
        strandDepthFrac: 0.015,
      }));
      for (const [cx, cy, cz, cr] of [
        [0, 0.42, -0.06, 0.165], [-0.26, 0.22, -0.06, 0.155], [0.26, 0.22, -0.06, 0.155],
      ]) {
        addSculptedBun(cr, [1.05, 1.0, 1.05], [cx, cy, cz], 10);
      }
    } else if (activeHairStyle === "toddler_puffs") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.242,
        templeSweep: 0.094,
        napeYFrac: -0.26,
        crownLiftFrac: 0.044,
        sideLoftFrac: 0.030,
        backLoftFrac: 0.042,
        partPhi: 0.0,
        partDepth: 0.007,
        strandFreq: 26,
        strandDepthFrac: 0.008,
      }));
      [-1, 1].forEach((s) => {
        const pTie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.056, headH * 0.015, 10, 18), tieMat);
        pTie.position.set(s * headH * 0.28, headH * 0.34, -headH * 0.04);
        pTie.rotation.set(Math.PI * 0.38, 0, s * -0.45);
        addHairMesh(pTie);
        addSculptedBun(0.132, [1.02, 0.96, 1.0], [s * 0.30, 0.40, -0.04], 5);
      });
    } else if (activeHairStyle === "ribbon_ponytail") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.248,
        templeSweep: 0.102,
        napeYFrac: -0.29,
        crownLiftFrac: 0.050,
        sideLoftFrac: 0.036,
        backLoftFrac: 0.048,
        partPhi: 0.16,
        partDepth: 0.006,
        strandFreq: 28,
        strandDepthFrac: 0.007,
      }));
      const rTie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.054, headH * 0.016, 10, 18), tieMat);
      rTie.position.set(0, headH * 0.08, -headH * 0.41);
      addHairMesh(rTie);
      const rCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, headH * 0.08, -headH * 0.41),
        new THREE.Vector3(0, -headH * 0.10, -headH * 0.49),
        new THREE.Vector3(0, -headH * 0.36, -headH * 0.46),
      ]);
      const rTailGeo = new THREE.TubeGeometry(rCurve, 18, headH * 0.068, 12, false);
      rTailGeo.computeVertexNormals();
      addUniformHairColors(rTailGeo, 0.96);
      addHairMesh(new THREE.Mesh(rTailGeo, hairVertMat));
    } else if (activeHairStyle === "side_braid_bun") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.248,
        templeSweep: 0.106,
        napeYFrac: -0.32,
        crownLiftFrac: 0.050,
        sideLoftFrac: 0.036,
        backLoftFrac: 0.054,
        partPhi: -0.28,
        partDepth: 0.008,
        strandFreq: 28,
        strandDepthFrac: 0.0075,
      }));
      const sTie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.052, headH * 0.015, 10, 18), tieMat);
      sTie.position.set(-headH * 0.23, -headH * 0.12, -headH * 0.36);
      addHairMesh(sTie);
      addSculptedBun(0.145, [1.05, 0.94, 0.92], [-0.24, -0.12, -0.38], 10);
    } else if (activeHairStyle === "high_pony_wave") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.252,
        templeSweep: 0.100,
        napeYFrac: -0.27,
        crownLiftFrac: 0.056,
        sideLoftFrac: 0.034,
        backLoftFrac: 0.048,
        partPhi: 0.0,
        partDepth: 0.004,
        strandFreq: 26,
        strandDepthFrac: 0.0075,
      }));
      const hTie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.052, headH * 0.015, 10, 18), tieMat);
      hTie.position.set(0, headH * 0.28, -headH * 0.34);
      hTie.rotation.x = Math.PI * 0.28;
      addHairMesh(hTie);
      const hCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, headH * 0.28, -headH * 0.34),
        new THREE.Vector3(0, headH * 0.12, -headH * 0.48),
        new THREE.Vector3(0, -headH * 0.28, -headH * 0.48),
      ]);
      const hTailGeo = new THREE.TubeGeometry(hCurve, 18, headH * 0.070, 12, false);
      hTailGeo.computeVertexNormals();
      addUniformHairColors(hTailGeo, 0.96);
      addHairMesh(new THREE.Mesh(hTailGeo, hairVertMat));
    } else if (activeHairStyle === "double_braid_buns") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.246,
        templeSweep: 0.104,
        napeYFrac: -0.30,
        crownLiftFrac: 0.048,
        sideLoftFrac: 0.036,
        backLoftFrac: 0.050,
        partPhi: 0.0,
        partDepth: 0.008,
        strandFreq: 26,
        strandDepthFrac: 0.0075,
      }));
      [-1, 1].forEach((s) => {
        const dTie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.046, headH * 0.013, 10, 18), tieMat);
        dTie.position.set(s * headH * 0.27, -headH * 0.12, -headH * 0.32);
        dTie.rotation.y = s * 0.50;
        addHairMesh(dTie);
        addSculptedBun(0.130, [0.98, 0.95, 0.92], [s * 0.28, -0.12, -0.34], 9);
      });
    } else if (activeHairStyle === "twin_buns") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.248,
        templeSweep: 0.098,
        napeYFrac: -0.28,
        crownLiftFrac: 0.048,
        sideLoftFrac: 0.034,
        backLoftFrac: 0.046,
        partPhi: 0.0,
        partDepth: 0.008,
        strandFreq: 28,
        strandDepthFrac: 0.007,
      }));
      [-1, 1].forEach((s) => {
        const tie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.052, headH * 0.014, 10, 18), tieMat);
        tie.position.set(s * headH * 0.26, headH * 0.37, -headH * 0.05);
        tie.rotation.set(Math.PI * 0.38, 0, s * -0.45);
        addHairMesh(tie);
        addSculptedBun(0.118, [1.0, 0.92, 1.0], [s * 0.28, 0.43, -0.06], 6);
      });
    } else if (activeHairStyle === "headband_bob") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.240,
        templeSweep: 0.120,
        napeYFrac: -0.40,
        crownLiftFrac: 0.052,
        sideLoftFrac: 0.052,
        backLoftFrac: 0.072,
        partPhi: 0.0,
        partDepth: 0.006,
        strandFreq: 26,
        strandDepthFrac: 0.0065,
      }));
      if (crownCompression >= 0.5) {
        const bandMat = lowPower
          ? new THREE.MeshPhongMaterial({ color: 0xec4899, shininess: 42 })
          : new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.34 });
        const bandGeo = new THREE.TorusGeometry(headH * 0.372, headH * 0.018, 12, 42, Math.PI * 1.06);
        const band = new THREE.Mesh(bandGeo, bandMat);
        band.position.set(0, headH * 0.155, headH * 0.035);
        band.rotation.x = 0.24;
        band.rotation.z = -0.095;
        addHairMesh(band);
      }
    } else if (activeHairStyle === "single_ponytail") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.248,
        templeSweep: 0.100,
        napeYFrac: -0.28,
        crownLiftFrac: 0.048,
        sideLoftFrac: 0.034,
        backLoftFrac: 0.048,
        partPhi: 0.0,
        partDepth: 0.005,
        strandFreq: 28,
        strandDepthFrac: 0.007,
      }));
      const tie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.052, headH * 0.015, 10, 18), tieMat);
      tie.position.set(0, headH * 0.06, -headH * 0.42);
      addHairMesh(tie);
      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, headH * 0.06, -headH * 0.42),
        new THREE.Vector3(0, -headH * 0.14, -headH * 0.50),
        new THREE.Vector3(0, -headH * 0.38, -headH * 0.48),
      ]);
      const tailGeo = new THREE.TubeGeometry(tailCurve, 18, headH * 0.072, 12, false);
      const tp = tailGeo.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const vx = tp.getX(i), vy = tp.getY(i), vz = tp.getZ(i);
        const f = smoothstep(headH * 0.04, -headH * 0.40, vy);
        const shrink = (1 - 0.64 * f) * (1 + 0.07 * Math.sin(Math.atan2(vz, vx) * 6 + f * 6));
        const cPt = tailCurve.getPoint(clamp(f, 0, 1));
        tp.setXYZ(i, cPt.x + (vx - cPt.x) * shrink, vy, cPt.z + (vz - cPt.z) * shrink);
      }
      tp.needsUpdate = true;
      tailGeo.computeVertexNormals();
      addUniformHairColors(tailGeo, 0.96);
      addHairMesh(new THREE.Mesh(tailGeo, hairVertMat));
    } else if (activeHairStyle === "half_up") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.244,
        templeSweep: 0.114,
        napeYFrac: -0.42,
        crownLiftFrac: 0.054,
        sideLoftFrac: 0.048,
        backLoftFrac: 0.078,
        partPhi: 0.14,
        partDepth: 0.008,
        strandFreq: 24,
        strandDepthFrac: 0.0085,
      }));
      addSculptedBun(0.125, [1.04, 0.88, 1.0], [0, 0.34, -0.28], 7);
    } else if (activeHairStyle === "teen_bun") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.250,
        templeSweep: 0.106,
        napeYFrac: -0.32,
        crownLiftFrac: 0.052,
        sideLoftFrac: 0.038,
        backLoftFrac: 0.056,
        partPhi: 0.0,
        partDepth: 0.007,
        strandFreq: 30,
        strandDepthFrac: 0.0075,
      }));
      addSculptedBun(0.162, [1.10, 0.92, 0.92], [0, 0.08, -0.42], 8);
    } else {
      // "ponytails" — Classic M baseline
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.246,
        templeSweep: 0.104,
        napeYFrac: -0.30,
        crownLiftFrac: 0.050,
        sideLoftFrac: 0.036,
        backLoftFrac: 0.050,
        partPhi: 0.0,
        partDepth: 0.007,
        strandFreq: 26,
        strandDepthFrac: 0.007,
      }));

      [-1, 1].forEach((s) => {
        const tie = new THREE.Mesh(new THREE.TorusGeometry(headH * 0.044, headH * 0.013, 10, 18), tieMat);
        tie.position.set(s * headH * 0.27, headH * 0.05, -headH * 0.24);
        tie.rotation.y = s * 0.42;
        addHairMesh(tie);

        const tailCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(s * headH * 0.27, headH * 0.05, -headH * 0.24),
          new THREE.Vector3(s * headH * 0.31, -headH * 0.14, -headH * 0.30),
          new THREE.Vector3(s * headH * 0.29, -headH * 0.38, -headH * 0.29),
        ]);
        const tailGeo = new THREE.TubeGeometry(tailCurve, 18, headH * 0.062, 12, false);
        const tp = tailGeo.attributes.position;
        for (let i = 0; i < tp.count; i++) {
          const vx = tp.getX(i), vy = tp.getY(i), vz = tp.getZ(i);
          const f = smoothstep(headH * 0.03, -headH * 0.42, vy);
          const shrink = (1 - 0.68 * f) * (1 + 0.08 * Math.sin(Math.atan2(vz, vx) * 6 + f * 6));
          const cPt = tailCurve.getPoint(clamp(f, 0, 1));
          tp.setXYZ(i, cPt.x + (vx - cPt.x) * shrink, vy, cPt.z + (vz - cPt.z) * shrink);
        }
        tp.needsUpdate = true;
        tailGeo.computeVertexNormals();
        addUniformHairColors(tailGeo, 0.96);
        addHairMesh(new THREE.Mesh(tailGeo, hairVertMat));
      });
    }
  } else {
    if (activeHairStyle === "curly_fade") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.240,
        templeSweep: 0.060,
        napeYFrac: -0.22,
        crownLiftFrac: 0.090,
        sideLoftFrac: 0.014,
        backLoftFrac: 0.022,
        partPhi: 0.0,
        partDepth: 0.001,
        strandFreq: 28,
        strandDepthFrac: 0.015,
      }));
      addSculptedBun(0.158, [1.42, 0.54, 1.48], [0, 0.39, 0.02], 12);
    } else if (activeHairStyle === "long_men") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.246,
        templeSweep: 0.092,
        napeYFrac: -0.40,
        crownLiftFrac: 0.060,
        sideLoftFrac: 0.044,
        backLoftFrac: 0.068,
        partPhi: 0.0,
        partDepth: 0.006,
        strandFreq: 24,
        strandDepthFrac: 0.009,
      }));
      addFlowingBackCurtain({ dropYFrac: -0.80, widthScale: 0.94, waveBoost: 0.009, layers: 2 });
    } else if (activeHairStyle === "long_men_waves") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.242,
        templeSweep: 0.098,
        napeYFrac: -0.42,
        crownLiftFrac: 0.068,
        sideLoftFrac: 0.052,
        backLoftFrac: 0.078,
        partPhi: 0.18,
        partDepth: 0.007,
        strandFreq: 20,
        strandDepthFrac: 0.011,
      }));
      addFlowingBackCurtain({ dropYFrac: -1.18, widthScale: 0.98, waveBoost: 0.018, layers: 2, sCurveAmp: 0.014 });
      addFrontShoulderLocks({ dropYFrac: -0.74, radiusFrac: 0.040, strandsPerSide: 1, waveAmp: 0.018 });
    } else if (activeHairStyle === "long_men_straight") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.246,
        templeSweep: 0.096,
        napeYFrac: -0.42,
        crownLiftFrac: 0.054,
        sideLoftFrac: 0.044,
        backLoftFrac: 0.070,
        partPhi: 0.0,
        partDepth: 0.008,
        strandFreq: 30,
        strandDepthFrac: 0.007,
      }));
      addFlowingBackCurtain({ dropYFrac: -1.24, widthScale: 0.96, waveBoost: 0.003, layers: 2 });
      addFrontShoulderLocks({ dropYFrac: -0.72, radiusFrac: 0.036, strandsPerSide: 1, waveAmp: 0.006 });
    } else if (activeHairStyle === "toddler_curls") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.222,
        templeSweep: 0.082,
        napeYFrac: -0.30,
        crownLiftFrac: 0.064,
        sideLoftFrac: 0.042,
        backLoftFrac: 0.054,
        partPhi: 0.0,
        partDepth: 0.002,
        strandFreq: 18,
        strandDepthFrac: 0.013,
      }));
    } else if (activeHairStyle === "varsity_crop") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.258,
        templeSweep: 0.068,
        napeYFrac: -0.24,
        crownLiftFrac: 0.058,
        sideLoftFrac: 0.022,
        backLoftFrac: 0.032,
        partPhi: -0.26,
        partDepth: 0.008,
        strandFreq: 30,
        strandDepthFrac: 0.008,
      }));
    } else if (activeHairStyle === "side_sweep_jr") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.236,
        templeSweep: 0.080,
        napeYFrac: -0.28,
        crownLiftFrac: 0.054,
        sideLoftFrac: 0.030,
        backLoftFrac: 0.042,
        partPhi: 0.32,
        partDepth: 0.007,
        strandFreq: 24,
        strandDepthFrac: 0.009,
      }));
    } else if (activeHairStyle === "taper_quiff_jr") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.256,
        templeSweep: 0.068,
        napeYFrac: -0.24,
        crownLiftFrac: 0.066,
        sideLoftFrac: 0.020,
        backLoftFrac: 0.032,
        partPhi: -0.22,
        partDepth: 0.005,
        strandFreq: 30,
        strandDepthFrac: 0.008,
      }));
      addSculptedBun(0.118, [1.14, 0.46, 1.24], [0.02, 0.37, 0.09], 6);
    } else if (activeHairStyle === "classic_jr_wave") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.248,
        templeSweep: 0.082,
        napeYFrac: -0.29,
        crownLiftFrac: 0.062,
        sideLoftFrac: 0.034,
        backLoftFrac: 0.048,
        partPhi: 0.16,
        partDepth: 0.006,
        strandFreq: 20,
        strandDepthFrac: 0.011,
      }));
    } else if (activeHairStyle === "soft_fringe") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.228,
        templeSweep: 0.068,
        napeYFrac: -0.28,
        crownLiftFrac: 0.048,
        sideLoftFrac: 0.030,
        backLoftFrac: 0.042,
        partPhi: 0.0,
        partDepth: 0.002,
        strandFreq: 28,
        strandDepthFrac: 0.006,
      }));
    } else if (activeHairStyle === "sport_crop") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.256,
        templeSweep: 0.068,
        napeYFrac: -0.24,
        crownLiftFrac: 0.056,
        sideLoftFrac: 0.020,
        backLoftFrac: 0.032,
        partPhi: -0.18,
        partDepth: 0.004,
        strandFreq: 34,
        strandDepthFrac: 0.0095,
      }));
    } else if (activeHairStyle === "youth_fade") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.258,
        templeSweep: 0.062,
        napeYFrac: -0.23,
        crownLiftFrac: 0.064,
        sideLoftFrac: 0.017,
        backLoftFrac: 0.026,
        partPhi: 0.26,
        partDepth: 0.007,
        strandFreq: 32,
        strandDepthFrac: 0.008,
      }));
    } else if (activeHairStyle === "teen_wave") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.242,
        templeSweep: 0.084,
        napeYFrac: -0.28,
        crownLiftFrac: 0.058,
        sideLoftFrac: 0.032,
        backLoftFrac: 0.046,
        partPhi: 0.22,
        partDepth: 0.007,
        strandFreq: 22,
        strandDepthFrac: 0.0095,
      }));
    } else if (activeHairStyle === "athletic_cut") {
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.254,
        templeSweep: 0.072,
        napeYFrac: -0.25,
        crownLiftFrac: 0.050,
        sideLoftFrac: 0.022,
        backLoftFrac: 0.034,
        partPhi: -0.32,
        partDepth: 0.006,
        strandFreq: 34,
        strandDepthFrac: 0.007,
      }));
    } else {
      // "boys_crop" — Classic M baseline
      addHairMesh(buildParametricHairShell({
        frontYFrac: 0.248,
        templeSweep: 0.072,
        napeYFrac: -0.26,
        crownLiftFrac: 0.046,
        sideLoftFrac: 0.025,
        backLoftFrac: 0.038,
        partPhi: -0.24,
        partDepth: 0.006,
        strandFreq: 30,
        strandDepthFrac: 0.0068,
      }));
    }
  }

  // =========================================================================
  // SCULPTED 3D HEADWEAR ENGINE (Women's/Girls' Hijabs & Men's/Boys' Hats,
  // Ghutra/Shemagh & Iqal, Shawls, Fedora, Baseball Cap, Beanie, Beret)
  // =========================================================================
  if (hasHeadwear) {
    const hwGroup = new THREE.Group();
    hwGroup.name = "headwearGroup";
    headBone.add(hwGroup);

    const hwHex = hexToInt(
      styleOptions?.headwearColor != null ? styleOptions.headwearColor : headwearSpec.defaultColor,
      0xf3ece4
    );
    const hwColor = new THREE.Color(hwHex);

    const createHeadwearFabricTexture = (fabricSpec) => {
      if (typeof document === "undefined") return null;
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#e2e2e2";
      ctx.fillRect(0, 0, 128, 128);

      if (fabricSpec.id === "silk") {
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 1;
        for (let i = -128; i < 256; i += 4) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 64, 128);
          ctx.stroke();
        }
      } else if (fabricSpec.id === "chiffon") {
        ctx.strokeStyle = "rgba(180,180,180,0.34)";
        ctx.lineWidth = 0.75;
        for (let p = 0; p < 128; p += 3) {
          ctx.beginPath();
          ctx.moveTo(p, 0);
          ctx.lineTo(p, 128);
          ctx.moveTo(0, p);
          ctx.lineTo(128, p);
          ctx.stroke();
        }
      } else if (fabricSpec.id === "jersey") {
        ctx.strokeStyle = "rgba(170,170,170,0.35)";
        ctx.lineWidth = 1.1;
        for (let x = 0; x < 128; x += 3) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 128);
          ctx.stroke();
        }
      } else {
        // Matte crepe pebbly grain
        for (let y = 0; y < 128; y += 2) {
          for (let x = 0; x < 128; x += 2) {
            const n = ((x * 73 + y * 139 + (x * y)) % 29) / 29;
            const g = Math.round(198 + n * 44);
            ctx.fillStyle = `rgb(${g},${g},${g})`;
            ctx.fillRect(x, y, 2, 2);
          }
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3, 3);
      return tex;
    };

    const clothFabricTex = headwearSpec.isHijab ? createHeadwearFabricTexture(hwFabricSpec) : null;

    const makeClothMat = (colHex, optsMat = {}) => {
      const col = new THREE.Color(colHex);
      const useFab = optsMat.applyFabric !== false && headwearSpec.isHijab;
      const bumpMap = optsMat.bumpMap !== undefined ? optsMat.bumpMap : (useFab ? clothFabricTex : null);
      const roughness = optsMat.roughness ?? (useFab ? hwFabricSpec.roughness : 0.72);
      const sheen = optsMat.sheen ?? (useFab ? hwFabricSpec.sheen : 0.45);
      const sheenRoughness = optsMat.sheenRoughness ?? (useFab ? hwFabricSpec.sheenRoughness : 0.62);
      const shininess = optsMat.shininess ?? (useFab ? hwFabricSpec.shininess : 18);
      if (lowPower) {
        return new THREE.MeshPhongMaterial({
          color: optsMat.vertexColors ? 0xffffff : col,
          map: optsMat.map || null,
          vertexColors: Boolean(optsMat.vertexColors),
          shininess,
          transparent: Boolean(optsMat.transparent),
          opacity: optsMat.opacity ?? 1.0,
          depthWrite: optsMat.depthWrite ?? true,
          side: THREE.DoubleSide,
        });
      }
      return new THREE.MeshPhysicalMaterial({
        color: optsMat.vertexColors ? 0xffffff : col,
        map: optsMat.map || null,
        bumpMap: bumpMap || null,
        bumpScale: bumpMap ? (optsMat.bumpScale ?? headH * 0.0045 * hwFabricSpec.weaveStrength) : 0,
        vertexColors: Boolean(optsMat.vertexColors),
        roughness,
        metalness: optsMat.metalness ?? 0.0,
        sheen,
        sheenRoughness,
        sheenColor: col.clone().lerp(new THREE.Color(0xffffff), 0.35),
        transparent: Boolean(optsMat.transparent),
        opacity: optsMat.opacity ?? 1.0,
        depthWrite: optsMat.depthWrite ?? true,
        side: THREE.DoubleSide,
      });
    };

    const addHwMesh = (mesh) => {
      mesh.userData.part = "headwear";
      mesh.castShadow = !mesh.material?.transparent;
      mesh.receiveShadow = true;
      hwGroup.add(mesh);
      return mesh;
    };

    const skullSurfPoint = (ux, uy, uz, clearanceFrac = 0.022) => {
      const len = Math.hypot(ux, uy, uz) || 1;
      const nx = ux / len, ny = uy / len, nz = uz / len;
      const rAna = headH * 0.416 * Math.hypot(nx * headWidthScale, ny * 1.18, nz * headDepthScale);
      const rSample = skullRadiusAlongDir(nx, ny, nz);
      const r = Math.max(rSample, rAna) + headH * clearanceFrac;
      return [nx * r, ny * r, nz * r];
    };

    // Contoured hijab / scarf cranial hood that wraps the skull cleanly and frames the face oval
    const buildHijabHood = ({
      frontYFrac = 0.215,
      cheekDrop = 0.32,
      napeYFrac = -0.52,
      archLift = 0.018,
      crownLoft = 0.036,
      sideLoft = 0.044,
      backLoft = 0.068,
      backBunBoost = 0.14,
      pleatAmp = 0.010,
      mat = null,
    }) => {
      const U_SEGS = 76, V_SEGS = 24;
      const pos = [], uvs = [], idx = [];
      const pleatScale = headwearSpec.isHijab ? hwFabricSpec.pleatScale : 1.0;
      for (let iv = 0; iv <= V_SEGS; iv++) {
        const v = iv / V_SEGS;
        for (let iu = 0; iu <= U_SEGS; iu++) {
          const phi = -Math.PI + (iu / U_SEGS) * 2 * Math.PI;
          const sinP = Math.sin(phi), cosP = Math.cos(phi);
          const faceW = smoothstep(-0.34, 0.38, cosP);
          // Cheek framing wraps neatly inward at temples & lateral jawline while leaving eyes/nose/mouth clear
          const templeWrap = cheekDrop * Math.pow(clamp(Math.abs(phi) / 1.18, 0, 1), 1.55);
          const frontY = headH * (frontYFrac + archLift * Math.max(0, cosP) * Math.exp(-phi * phi * 1.8) - templeWrap);
          const backY = headH * napeYFrac;
          const yEdge = backY * (1 - faceW) + frontY * faceW;

          const thetaEdge = Math.asin(clamp(yEdge / (headH * 0.56), -0.94, 0.94));
          const theta = thetaEdge * (1 - v) + (Math.PI * 0.5) * v;
          const cosT = Math.cos(theta), sinT = Math.sin(theta);
          const dx = cosT * sinP * headWidthScale;
          const dy = sinT;
          const dz = cosT * cosP * headDepthScale - 0.018 * (1 - v);
          const dLen = Math.hypot(dx, dy, dz) || 1;
          const ux = dx / dLen, uy = dy / dLen, uz = dz / dLen;
          const rAna = headH * 0.416 * Math.hypot(cosT * sinP * headWidthScale, sinT * 1.18, cosT * cosP * headDepthScale);
          const rBase = Math.max(skullRadiusAlongDir(ux, uy, uz), rAna);

          const fold = pleatAmp * pleatScale * Math.sin(phi * 11 + v * 3.5) * smoothstep(0.06, 0.4, v);
          const bunBump = backBunBoost * Math.max(0, -uz) * smoothstep(-0.25, 0.20, uy) * (1 - smoothstep(0.42, 0.85, uy)) * Math.exp(-sinP * sinP * 2.2);
          const arch = archLift * Math.max(0, cosP) * (1 - smoothstep(0.0, 0.45, v)) * Math.exp(-phi * phi * 2.4);
          const loft = headH * (
            0.018
            + smoothstep(0.0, 0.25, v) * (crownLoft * Math.max(0, uy) + sideLoft * Math.abs(ux) + backLoft * Math.max(0, -uz) + bunBump)
            + arch
            + fold
          );
          const rFin = rBase + loft;
          pos.push(ux * rFin, uy * rFin, uz * rFin);
          uvs.push((iu / U_SEGS) * 2.0, v * 2.0);
        }
      }
      const stride = U_SEGS + 1;
      for (let iv = 0; iv < V_SEGS; iv++) {
        for (let iu = 0; iu < U_SEGS; iu++) {
          const a = iv * stride + iu, b = a + 1, c = (iv + 1) * stride + iu, d = c + 1;
          idx.push(a, b, d, a, d, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return addHwMesh(new THREE.Mesh(g, mat));
    };

    const getHijabDrapeTargets = ({
      stdFront = yChest + headH * 0.14,
      longFront = yUnderBust - headH * 0.14,
      extraFront = yWaist - headH * 0.22,
      stdBack = yChest + headH * 0.08,
      longBack = yUnderBust - headH * 0.22,
      extraBack = lerp(yWaist, yHip, 0.42),
    } = {}) => {
      if (hwLengthSpec.id === "extra_long") return { frontY: extraFront, backY: extraBack };
      if (hwLengthSpec.id === "long") return { frontY: longFront, backY: longBack };
      return { frontY: stdFront, backY: stdBack };
    };

    const buildContouredUndercap = (underMat, optsCap = {}) => buildHijabHood({
      frontYFrac: optsCap.frontYFrac ?? 0.246,
      cheekDrop: optsCap.cheekDrop ?? 0.13,
      napeYFrac: optsCap.napeYFrac ?? -0.25,
      archLift: 0.004,
      crownLoft: 0.015,
      sideLoft: 0.015,
      backLoft: 0.023,
      backBunBoost: optsCap.backBunBoost ?? 0.06,
      pleatAmp: 0.001,
      mat: underMat,
    });

    // Torso- and shoulder-clearing modest cape/drape builder supporting standard, long, and extra-long Islamic silhouettes
    const buildLongIslamicCapeDrape = ({
      topFrontYFrac = -0.34,
      topSideYFrac = -0.26,
      topBackYFrac = -0.32,
      targetFrontY = null,
      targetBackY = null,
      topRxFrac = 0.27,
      topRzFrac = 0.27,
      flareXFrac = 1.02,
      flareZFrontFrac = 0.62,
      flareZBackFrac = 0.56,
      pleatAmpFrac = 0.015,
      shoulderEaseFrac = 0.065,
      bustEaseFrac = 0.115,
      hemScoopFrac = 0.12,
      phiStart = -Math.PI,
      phiEnd = Math.PI,
      mat = null,
    }) => {
      const autoTargets = getHijabDrapeTargets();
      const finFrontY = targetFrontY != null ? targetFrontY : autoTargets.frontY;
      const finBackY = targetBackY != null ? targetBackY : autoTargets.backY;
      const isFullRing = Math.abs((phiEnd - phiStart) - Math.PI * 2) < 0.02;
      const U = isFullRing ? 72 : 40;
      const V = 28;
      const pos = [], uvs = [], idx = [];
      const pleatAmp = pleatAmpFrac * hwFabricSpec.pleatScale;
      for (let iv = 0; iv <= V; iv++) {
        const v = iv / V;
        const fEase = Math.pow(v, 0.96);
        for (let iu = 0; iu <= U; iu++) {
          const u = iu / U;
          const phi = lerp(phiStart, phiEnd, u);
          const sinP = Math.sin(phi), cosP = Math.cos(phi);
          const frontW = smoothstep(-0.38, 0.58, cosP);
          const sideW = Math.abs(sinP);
          const yTop = headH * (lerp(topBackYFrac, topFrontYFrac, frontW) + sideW * (topSideYFrac - topBackYFrac) * 0.45);
          const archHem = -headH * hemScoopFrac * (cosP * cosP);
          const yBot = lerp(finBackY, finFrontY, frontW) + archHem;
          const y = lerp(yTop, yBot, v);

          const rxBase = headH * lerp(topRxFrac, flareXFrac, fEase);
          const rzBase = headH * lerp(topRzFrac, cosP >= 0 ? flareZFrontFrac : flareZBackFrac, fEase);
          let ex = sinP * rxBase;
          let ez = cosP * rzBase - headH * lerp(0.02, -0.025 * frontW, v);

          const baseRad = Math.hypot(ex, ez) || 1e-4;
          const phiBody = Math.atan2(ex, ez);
          const bodyClearR = sampleTorsoClearance(y, phiBody, v < 0.46);
          const ease = headH * (0.032 + lerp(shoulderEaseFrac, bustEaseFrac, smoothstep(0.08, 0.72, v)));
          const minR = bodyClearR + ease;
          if (baseRad < minR) {
            const s = minR / baseRad;
            ex *= s;
            ez *= s;
          }

          const fold = pleatAmp * headH * (
            Math.sin(phi * 11 + v * 2.2) + 0.35 * Math.cos(phi * 21 - v * 3.1)
          ) * smoothstep(0.12, 0.90, v);
          const outRad = Math.hypot(ex, ez) || 1e-4;
          const x = ex + (ex / outRad) * fold;
          const z = ez + (ez / outRad) * fold;
          pos.push(x, y, z);
          uvs.push(u * 3.0, v * 3.0);
        }
      }
      const stride = U + 1;
      for (let iv = 0; iv < V; iv++) {
        for (let iu = 0; iu < U; iu++) {
          const a = iv * stride + iu, b = a + 1, c = (iv + 1) * stride + iu, d = c + 1;
          idx.push(a, c, d, a, d, b);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return addHwMesh(new THREE.Mesh(g, mat));
    };

    // Contoured neck-wrap + draped cape helper (preserving short/sport proportions while upgrading long hijabs & khimars)
    const buildNeckAndShoulderDrape = ({
      topFrontYFrac = -0.34,
      topSideYFrac = -0.26,
      topBackYFrac = -0.32,
      bottomFrontYFrac = -0.88,
      bottomBackYFrac = -0.92,
      topRxFrac = 0.26,
      topRzFrac = 0.27,
      flareXFrac = 0.86,
      flareZFrontFrac = 0.56,
      flareZBackFrac = 0.48,
      pleatAmpFrac = 0.014,
      mat = null,
    }) => {
      const targetFrontY = headH * bottomFrontYFrac * hwLengthSpec.dropScale;
      const targetBackY = headH * bottomBackYFrac * hwLengthSpec.dropScale;
      return buildLongIslamicCapeDrape({
        topFrontYFrac,
        topSideYFrac,
        topBackYFrac,
        targetFrontY: Math.min(headH * bottomFrontYFrac, targetFrontY),
        targetBackY: Math.min(headH * bottomBackYFrac, targetBackY),
        topRxFrac,
        topRzFrac,
        flareXFrac,
        flareZFrontFrac,
        flareZBackFrac,
        pleatAmpFrac,
        shoulderEaseFrac: 0.048,
        bustEaseFrac: 0.085,
        hemScoopFrac: 0.08,
        mat,
      });
    };

    const addCrossedShoulderScarf = (mat, asymSide = 1, bottomYFrac = -1.04) => {
      const scaledBottomY = headH * bottomYFrac * Math.max(0.92, hwLengthSpec.dropScale);
      const rawPts = [
        [-asymSide * headH * 0.25, -headH * 0.34, headH * 0.28],
        [0, -headH * 0.56, headH * 0.42],
        [asymSide * headH * 0.38, -headH * 0.64, headH * 0.30],
        [asymSide * headH * 0.46, lerp(-headH * 0.64, scaledBottomY, 0.55), -headH * 0.16],
        [asymSide * headH * 0.32, scaledBottomY, -headH * 0.44],
      ];
      const pts = rawPts.map(([px, py, pz], idxPt) => {
        const phiPt = Math.atan2(px, pz);
        const rad = Math.hypot(px, pz) || 1e-4;
        const minR = sampleTorsoClearance(py, phiPt, idxPt <= 2) + headH * 0.11;
        if (rad < minR) {
          const s = minR / rad;
          return new THREE.Vector3(px * s, py, pz * s);
        }
        return new THREE.Vector3(px, py, pz);
      });
      const curve = new THREE.CatmullRomCurve3(pts);
      const tGeo = new THREE.TubeGeometry(curve, 28, headH * 0.092, 12, false);
      const tp = tGeo.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const vx = tp.getX(i), vy = tp.getY(i), vz = tp.getZ(i);
        const f = clamp((headH * -0.34 - vy) / Math.max(0.05, headH * -0.34 - scaledBottomY), 0, 1);
        const cPt = curve.getPoint(f);
        let nx = cPt.x + (vx - cPt.x) * 1.32;
        let nz = cPt.z + (vz - cPt.z) * 0.48;
        const rad = Math.hypot(nx, nz) || 1e-4;
        const minR = sampleTorsoClearance(vy, Math.atan2(nx, nz), f < 0.42) + headH * 0.055;
        if (rad < minR) {
          const s = minR / rad;
          nx *= s;
          nz *= s;
        }
        tp.setXYZ(i, nx, vy, nz);
      }
      tGeo.computeVertexNormals();
      return addHwMesh(new THREE.Mesh(tGeo, mat));
    };

    const buildContouredBrowBand = (bandMat, { topYFrac = 0.228, botYFrac = 0.118, addRearTies = true } = {}) => {
      const U = 52, V = 6;
      const pos = [], uvs = [], idx = [];
      for (let iv = 0; iv <= V; iv++) {
        const v = iv / V;
        for (let iu = 0; iu <= U; iu++) {
          const u = iu / U;
          const phi = -Math.PI + u * 2 * Math.PI;
          const sinP = Math.sin(phi), cosP = Math.cos(phi);
          const faceW = smoothstep(-0.2, 0.65, cosP);
          const bandBot = lerp(0.02, botYFrac, faceW) * headH;
          const bandTop = lerp(0.10, topYFrac, faceW) * headH;
          const y = lerp(bandBot, bandTop, v);
          const theta = Math.asin(clamp(y / (headH * 0.56), -0.88, 0.88));
          const cosT = Math.cos(theta), sinT = Math.sin(theta);
          const pt = skullSurfPoint(cosT * sinP * headWidthScale, sinT, cosT * cosP * headDepthScale, 0.044);
          pos.push(pt[0], pt[1], pt[2]);
          uvs.push(u * 3.0, v * 0.6);
        }
      }
      const stride = U + 1;
      for (let iv = 0; iv < V; iv++) {
        for (let iu = 0; iu < U; iu++) {
          const a = iv * stride + iu, b = a + 1, c = (iv + 1) * stride + iu, d = c + 1;
          idx.push(a, b, d, a, d, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      addHwMesh(new THREE.Mesh(g, bandMat));

      if (addRearTies) {
        // Neat rear tie knot + flowing back ribbons
        const knot = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.042, 12, 10), bandMat);
        knot.scale.set(1.25, 0.85, 0.72);
        knot.position.set(0, headH * 0.055, -headH * 0.475);
        addHwMesh(knot);
        [-1, 1].forEach((s) => {
          const ribCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(s * headH * 0.025, headH * 0.05, -headH * 0.48),
            new THREE.Vector3(s * headH * 0.06, -headH * 0.28, -headH * 0.54),
            new THREE.Vector3(s * headH * 0.08, -headH * 0.64, -headH * 0.52),
          ]);
          const ribGeo = new THREE.TubeGeometry(ribCurve, 14, headH * 0.022, 8, false);
          ribGeo.scale(1.4, 1.0, 0.35);
          addHwMesh(new THREE.Mesh(ribGeo, bandMat));
        });
      }
    };

    const buildNiqabAssembly = ({
      mat,
      underMat,
      veilBottomTargetY = null,
      capeFrontY = null,
      capeBackY = null,
      backLayers = 1,
      eyeScreen = false,
      isHalfNiqab = false,
    }) => {
      const targets = getHijabDrapeTargets({
        stdFront: yChest - headH * 0.06,
        longFront: yUnderBust - headH * 0.18,
        extraFront: yWaist - headH * 0.24,
        stdBack: yChest - headH * 0.14,
        longBack: yUnderBust - headH * 0.26,
        extraBack: lerp(yWaist, yHip, 0.48),
      });
      const finCapeFrontY = capeFrontY != null ? capeFrontY : targets.frontY;
      const finCapeBackY = capeBackY != null ? capeBackY : targets.backY;
      const finVeilY = veilBottomTargetY != null
        ? veilBottomTargetY
        : lerp(yChest + headH * 0.08, finCapeFrontY + headH * 0.06, 0.82);

      // 1. Snug inner undercap + outer contoured hijab/khimar hood
      buildContouredUndercap(underMat, { frontYFrac: 0.242, cheekDrop: 0.14 });
      buildHijabHood({
        frontYFrac: isHalfNiqab ? 0.195 : 0.198,
        cheekDrop: 0.34,
        napeYFrac: -0.58,
        archLift: 0.015,
        crownLoft: 0.040,
        sideLoft: 0.048,
        backLoft: 0.074,
        backBunBoost: 0.13,
        pleatAmp: 0.010,
        mat,
      });

      // 2. Full torso-clearing Islamic cape drape
      buildLongIslamicCapeDrape({
        targetFrontY: finCapeFrontY,
        targetBackY: finCapeBackY,
        flareXFrac: isHalfNiqab ? 1.16 : 1.06,
        flareZFrontFrac: isHalfNiqab ? 0.68 : 0.64,
        flareZBackFrac: isHalfNiqab ? 0.64 : 0.60,
        pleatAmpFrac: 0.016,
        shoulderEaseFrac: 0.068,
        bustEaseFrac: 0.125,
        hemScoopFrac: isHalfNiqab ? 0.14 : 0.11,
        mat,
      });

      // 3. Optional cascading second back veil layer (2-Layer Gulf Niqab)
      if (backLayers >= 2) {
        const backTierMat = makeClothMat(hwColor, {
          roughness: Math.min(0.88, (hwFabricSpec.roughness ?? 0.65) + 0.04),
          sheen: Math.max(0.25, (hwFabricSpec.sheen ?? 0.45) * 0.9),
        });
        buildLongIslamicCapeDrape({
          topFrontYFrac: -0.28,
          topSideYFrac: -0.24,
          topBackYFrac: -0.26,
          targetFrontY: finCapeBackY * 0.72,
          targetBackY: lerp(-headH * 0.55, finCapeBackY, 0.74),
          flareXFrac: 1.10,
          flareZBackFrac: 0.68,
          pleatAmpFrac: 0.020,
          shoulderEaseFrac: 0.105,
          bustEaseFrac: 0.165,
          hemScoopFrac: 0.15,
          phiStart: Math.PI * 0.42,
          phiEnd: Math.PI * 1.58,
          mat: backTierMat,
        });
      }

      // 4. Forehead brow tie-band framing crisp eye aperture (skipped for khimar + half-niqab)
      const eyAnchor = headH * (kid ? 0.014 : 0.036);
      if (!isHalfNiqab) {
        buildContouredBrowBand(mat, {
          topYFrac: 0.222,
          botYFrac: kid ? 0.088 : 0.108,
          addRearTies: true,
        });
      }

      // 5. Anatomical infraorbital nasal-bridge & long chest facial veil
      const U = 36, V = 28;
      const pos = [], uvs = [], idx = [];
      const topCenterY = eyAnchor - headH * (kid ? 0.034 : 0.030);
      for (let iv = 0; iv <= V; iv++) {
        const v = iv / V;
        for (let iu = 0; iu <= U; iu++) {
          const u = iu / U;
          const phi = -0.92 + u * 1.84;
          const cosP = Math.cos(phi), sinP = Math.sin(phi);
          const cheekLift = headH * 0.014 * Math.pow(Math.abs(phi) / 0.92, 1.8);
          const yTop = topCenterY + cheekLift;
          const hemDrop = -headH * 0.095 * Math.pow(Math.max(0, cosP), 1.4) * smoothstep(0.60, 1.0, v);
          const y = lerp(yTop, finVeilY, v) + hemDrop;

          // Smooth nose-bridge projection at face -> long draped chest apron below chin
          const noseArc = v < 0.34 ? (1 - v / 0.34) * headH * 0.022 * Math.exp(-phi * phi * 5.0) : 0;
          const radHead = headH * (lerp(0.382, 0.455, smoothstep(0.0, 0.35, v)) + 0.025 * Math.cos(phi * 1.3));
          let x = sinP * radHead * lerp(0.86, 1.18, smoothstep(0.25, 1.0, v));
          let z = cosP * radHead + headH * lerp(0.036, 0.095, smoothstep(0.0, 0.42, v)) + noseArc;

          if (v > 0.22) {
            const bodyClear = sampleTorsoClearance(y, Math.atan2(x, z), false);
            const apronEase = headH * (0.095 + 0.085 * smoothstep(0.24, 0.88, v));
            const minR = bodyClear + apronEase;
            const curR = Math.hypot(x, z) || 1e-4;
            if (curR < minR) {
              const s = minR / curR;
              x *= s;
              z *= s;
            }
          }
          const veilPleat = headH * 0.011 * hwFabricSpec.pleatScale * Math.sin(phi * 9 + v * 1.6) * smoothstep(0.22, 0.92, v);
          z += veilPleat * Math.max(0.2, cosP);
          pos.push(x, y, z);
          uvs.push(u * 2.0, v * 2.5);
        }
      }
      const stride = U + 1;
      for (let iv = 0; iv < V; iv++) {
        for (let iu = 0; iu < U; iu++) {
          const a = iv * stride + iu, b = a + 1, c = (iv + 1) * stride + iu, d = c + 1;
          idx.push(a, b, d, a, d, c);
        }
      }
      const veilGeo = new THREE.BufferGeometry();
      veilGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      veilGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      veilGeo.setIndex(idx);
      veilGeo.computeVertexNormals();
      addHwMesh(new THREE.Mesh(veilGeo, mat));

      // 6. Optional Semi-Sheer Upper Eye Screen / Ghashwa overlay
      if (eyeScreen) {
        const ghashwaMat = makeClothMat(hwHex, {
          roughness: 0.56,
          sheen: 0.42,
          transparent: true,
          opacity: 0.44,
          depthWrite: false,
        });
        const gU = 28, gV = 12;
        const gPos = [], gUv = [], gIdx = [];
        for (let iv = 0; iv <= gV; iv++) {
          const v = iv / gV;
          const y = lerp(headH * 0.165, headH * -0.34, v);
          for (let iu = 0; iu <= gU; iu++) {
            const u = iu / gU;
            const phi = -0.84 + u * 1.68;
            const rad = headH * lerp(0.415, 0.475, v);
            const pleat = headH * 0.006 * Math.sin(phi * 14 + v * 2.0) * smoothstep(0.15, 0.9, v);
            gPos.push(
              Math.sin(phi) * rad * 0.90,
              y - headH * 0.025 * Math.cos(phi * 1.2) * v,
              Math.cos(phi) * rad + headH * (0.058 + 0.030 * v) + pleat
            );
            gUv.push(u * 2.0, v * 1.2);
          }
        }
        const gStride = gU + 1;
        for (let iv = 0; iv < gV; iv++) {
          for (let iu = 0; iu < gU; iu++) {
            const a = iv * gStride + iu, b = a + 1, c = (iv + 1) * gStride + iu, d = c + 1;
            gIdx.push(a, b, d, a, d, c);
          }
        }
        const gGeo = new THREE.BufferGeometry();
        gGeo.setAttribute("position", new THREE.Float32BufferAttribute(gPos, 3));
        gGeo.setAttribute("uv", new THREE.Float32BufferAttribute(gUv, 2));
        gGeo.setIndex(gIdx);
        gGeo.computeVertexNormals();
        const gMesh = new THREE.Mesh(gGeo, ghashwaMat);
        gMesh.name = "niqabEyeScreenMesh";
        gMesh.renderOrder = 2;
        addHwMesh(gMesh);
      }
    };

    const createShemaghPatternTexture = (accentHexInt, isDarkMode = false) => {
      if (typeof document === "undefined") return null;
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const accentCol = new THREE.Color(accentHexInt);
      const accentCss = "#" + accentCol.getHexString();
      const baseBg = isDarkMode ? "#e8eaee" : "#faf8f4";
      ctx.fillStyle = baseBg;
      ctx.fillRect(0, 0, 256, 256);

      // Authentic woven houndstooth / check geometric grid
      const step = 16;
      ctx.fillStyle = accentCss;
      for (let y = 0; y < 256; y += step) {
        for (let x = 0; x < 256; x += step) {
          if (((x / step) + (y / step)) % 2 === 0) {
            ctx.fillRect(x, y, step * 0.68, step * 0.28);
            ctx.fillRect(x, y, step * 0.28, step * 0.68);
            ctx.fillRect(x + step * 0.45, y + step * 0.45, step * 0.42, step * 0.42);
          } else {
            ctx.fillRect(x + 4, y + 4, step * 0.25, step * 0.25);
          }
        }
      }
      // Subtle woven border band along edges
      ctx.fillStyle = accentCss;
      ctx.fillRect(0, 232, 256, 12);
      ctx.fillRect(0, 248, 256, 4);

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3, 3);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const buildGulfHeadcloth = (mat, { patternColors = false, accentCol = null, dropBack = -0.96, widthFlare = 1.0 } = {}) => {
      const U = 64, V = 24;
      const pos = [], uvs = [], cols = [], idx = [];
      const baseWhite = new THREE.Color(0xfaf8f3);
      const patCol = accentCol ? new THREE.Color(accentCol) : hwColor;

      for (let iv = 0; iv <= V; iv++) {
        const v = iv / V; // 0 = crown top apex -> 1 = shoulder/back drape hem
        for (let iu = 0; iu <= U; iu++) {
          const u = iu / U;
          const phi = -Math.PI + u * 2 * Math.PI;
          const sinP = Math.sin(phi), cosP = Math.cos(phi);
          const isFrontFace = smoothstep(0.15, 0.72, cosP);

          if (v <= 0.48) {
            // Snug crown & brow peak curving backward over temples
            const vt = v / 0.48;
            const browPeakY = headH * 0.265;
            const backBaseY = -headH * 0.06;
            const rimY = lerp(backBaseY, browPeakY, smoothstep(-0.25, 0.55, cosP));
            const theta = lerp(Math.PI * 0.5, Math.asin(clamp(rimY / (headH * 0.52), -0.85, 0.85)), vt);
            const dx = Math.cos(theta) * sinP * headWidthScale;
            const dy = Math.sin(theta);
            const dz = Math.cos(theta) * cosP * headDepthScale;
            const pt = skullSurfPoint(dx, dy, dz, 0.022 + 0.018 * vt * Math.max(0, 0.3 - cosP));
            const frontBill = isFrontFace * smoothstep(0.65, 1.0, vt) * headH * 0.022;
            pos.push(pt[0], pt[1], pt[2] + frontBill);
          } else {
            // Draping cascade open over the face (|cosP| front split) and flowing over temples/shoulders/back
            const vd = (v - 0.48) / 0.52;
            const foldAngle = Math.sin(phi * 9 + vd * 1.4) * headH * 0.015 * smoothstep(0.1, 0.8, vd);
            // Push front-facing vertices cleanly outward behind cheekbones so face stays 100% open & unoccluded
            const safeSin = sinP === 0 ? 0.01 : sinP;
            const openXPush = isFrontFace * Math.sign(safeSin) * headH * lerp(0.14, 0.22, vd);
            const baseSpreadX = headH * lerp(0.41, 0.74 * widthFlare, Math.pow(vd, 0.9));
            const x = sinP * baseSpreadX + openXPush + foldAngle;
            const frontRimDrop = lerp(headH * 0.16, headH * (dropBack * 0.76), vd);
            const backHemDrop = lerp(-headH * 0.05, headH * dropBack, vd);
            const y = lerp(backHemDrop, frontRimDrop, smoothstep(0.1, 0.75, cosP));
            const zTop = lerp(-headH * 0.34, headH * 0.26, smoothstep(-0.4, 0.8, cosP));
            const zBot = cosP > 0 ? lerp(headH * 0.14, -headH * 0.06, vd) : -headH * (0.44 + 0.10 * vd);
            const z = lerp(zTop, zBot, vd) - foldAngle * 0.6;
            pos.push(x, y, z);
          }

          uvs.push(u * 2.0, v * 2.0);
          if (patternColors) {
            const checker = ((Math.floor(u * 24) + Math.floor(v * 20)) % 2 === 0);
            const c = checker ? patCol : baseWhite;
            cols.push(c.r, c.g, c.b);
          }
        }
      }
      const stride = U + 1;
      for (let iv = 0; iv < V; iv++) {
        for (let iu = 0; iu < U; iu++) {
          const a = iv * stride + iu, b = a + 1, c = (iv + 1) * stride + iu, d = c + 1;
          idx.push(a, b, d, a, d, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      if (patternColors) g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return addHwMesh(new THREE.Mesh(g, mat));
    };

    const addIqalCoil = () => {
      const iqalMat = lowPower
        ? new THREE.MeshPhongMaterial({ color: 0x111216, shininess: 22 })
        : new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.72, metalness: 0.05 });
      const cordMat = lowPower
        ? new THREE.MeshPhongMaterial({ color: 0x1b1d22, shininess: 28 })
        : new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.55, metalness: 0.18 });

      [
        { y: headH * 0.305, r: headH * 0.402, tube: headH * 0.032 },
        { y: headH * 0.365, r: headH * 0.388, tube: headH * 0.030 },
      ].forEach((ringSpec) => {
        const ringGeo = new THREE.TorusGeometry(ringSpec.r, ringSpec.tube, 14, 48);
        const rp = ringGeo.attributes.position;
        for (let i = 0; i < rp.count; i++) {
          const vx = rp.getX(i), vy = rp.getY(i), vz = rp.getZ(i);
          const ang = Math.atan2(vy, vx);
          const braidWave = 1 + 0.045 * Math.sin(ang * 28);
          rp.setXYZ(i, vx * headWidthScale * 1.15 * braidWave, vy * headDepthScale * 1.08 * braidWave, vz);
        }
        ringGeo.computeVertexNormals();
        const mesh = new THREE.Mesh(ringGeo, iqalMat);
        mesh.position.set(0, ringSpec.y, -headH * 0.012);
        mesh.rotation.x = Math.PI * 0.485;
        addHwMesh(mesh);
      });

      // Twin trailing Iqal back cords
      [-1, 1].forEach((s) => {
        const cordCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(s * headH * 0.03, headH * 0.32, -headH * 0.39),
          new THREE.Vector3(s * headH * 0.05, headH * 0.05, -headH * 0.44),
          new THREE.Vector3(s * headH * 0.06, -headH * 0.34, -headH * 0.43),
        ]);
        const cordGeo = new THREE.TubeGeometry(cordCurve, 14, headH * 0.010, 8, false);
        addHwMesh(new THREE.Mesh(cordGeo, cordMat));
      });
    };

    const addInnerTaqiyahCap = (capHex = 0xf8f7f3) => {
      const capMat = makeClothMat(capHex, { roughness: 0.78, sheen: 0.15, applyFabric: false });
      buildHijabHood({
        frontYFrac: 0.255,
        cheekDrop: 0.06,
        napeYFrac: -0.14,
        archLift: 0.004,
        crownLoft: 0.015,
        sideLoft: 0.014,
        backLoft: 0.016,
        backBunBoost: 0.0,
        pleatAmp: 0.002,
        mat: capMat,
      });
    };

    // ---- Dispatch Headwear Builder ----
    if (headwearSpec.id === "hijab_classic") {
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.18, applyFabric: false });
      const hijabMat = makeClothMat(hwHex);
      buildContouredUndercap(underMat, { frontYFrac: 0.245, cheekDrop: 0.12, backBunBoost: 0.06 });
      buildHijabHood({ frontYFrac: 0.218, cheekDrop: 0.34, napeYFrac: -0.54, archLift: 0.020, crownLoft: 0.036, sideLoft: 0.044, backLoft: 0.065, backBunBoost: 0.15, pleatAmp: 0.010, mat: hijabMat });
      buildNeckAndShoulderDrape({ bottomFrontYFrac: -0.94, bottomBackYFrac: -0.90, mat: hijabMat });
      addCrossedShoulderScarf(hijabMat, 1, -1.08);
    } else if (headwearSpec.id === "hijab_turkish") {
      const silkMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.78, sheen: 0.18, applyFabric: false });
      buildContouredUndercap(underMat, { frontYFrac: 0.246, cheekDrop: 0.12, backBunBoost: 0.05 });
      buildHijabHood({ frontYFrac: 0.222, cheekDrop: 0.35, napeYFrac: -0.50, archLift: 0.044, crownLoft: 0.038, sideLoft: 0.042, backLoft: 0.062, backBunBoost: 0.16, pleatAmp: 0.007, mat: silkMat });
      buildNeckAndShoulderDrape({ topFrontYFrac: -0.35, bottomFrontYFrac: -0.98, bottomBackYFrac: -0.84, flareXFrac: 0.82, flareZFrontFrac: 0.56, mat: silkMat });
    } else if (headwearSpec.id === "hijab_turban") {
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.18, applyFabric: false });
      const turbanMat = makeClothMat(hwHex);
      buildContouredUndercap(underMat, { frontYFrac: 0.240, cheekDrop: 0.10, napeYFrac: -0.20, backBunBoost: 0.08 });
      buildHijabHood({ frontYFrac: 0.215, cheekDrop: 0.11, napeYFrac: -0.24, archLift: 0.014, crownLoft: 0.048, sideLoft: 0.046, backLoft: 0.072, backBunBoost: 0.18, pleatAmp: 0.016, mat: turbanMat });
      [-1, 1].forEach((s) => {
        const pleatGeo = new THREE.TorusGeometry(headH * 0.385, headH * 0.044, 12, 36, Math.PI * 1.12);
        const pleat = new THREE.Mesh(pleatGeo, turbanMat);
        pleat.position.set(s * headH * 0.025, headH * 0.19, headH * 0.025);
        pleat.rotation.set(Math.PI * 0.42, s * 0.28, s * 0.20);
        addHwMesh(pleat);
      });
    } else if (headwearSpec.id === "hijab_shayla") {
      const shaylaMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.15, applyFabric: false });
      buildContouredUndercap(underMat, { frontYFrac: 0.246, cheekDrop: 0.10, backBunBoost: 0.05 });
      buildHijabHood({ frontYFrac: 0.220, cheekDrop: 0.24, napeYFrac: -0.62, archLift: 0.016, crownLoft: 0.036, sideLoft: 0.056, backLoft: 0.088, backBunBoost: 0.12, pleatAmp: 0.014, mat: shaylaMat });
      buildNeckAndShoulderDrape({ bottomFrontYFrac: -0.86, bottomBackYFrac: -1.04, flareXFrac: 0.94, flareZFrontFrac: 0.52, flareZBackFrac: 0.58, pleatAmpFrac: 0.018, mat: shaylaMat });
      addCrossedShoulderScarf(shaylaMat, -1, -1.20);
    } else if (headwearSpec.id === "hijab_khimar") {
      const khimarMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.15, applyFabric: false });
      buildContouredUndercap(underMat, { frontYFrac: 0.236, cheekDrop: 0.12, backBunBoost: 0.06 });
      buildHijabHood({ frontYFrac: 0.205, cheekDrop: 0.35, napeYFrac: -0.58, archLift: 0.018, crownLoft: 0.038, sideLoft: 0.050, backLoft: 0.075, backBunBoost: 0.14, pleatAmp: 0.011, mat: khimarMat });
      const targets = getHijabDrapeTargets({
        stdFront: yChest,
        longFront: yUnderBust - headH * 0.12,
        extraFront: yWaist - headH * 0.16,
        stdBack: yChest - headH * 0.10,
        longBack: yUnderBust - headH * 0.22,
        extraBack: lerp(yWaist, yHip, 0.36),
      });
      buildLongIslamicCapeDrape({
        targetFrontY: targets.frontY,
        targetBackY: targets.backY,
        flareXFrac: 1.08,
        flareZFrontFrac: 0.66,
        flareZBackFrac: 0.60,
        pleatAmpFrac: 0.016,
        hemScoopFrac: 0.12,
        mat: khimarMat,
      });
    } else if (headwearSpec.id === "hijab_long_draped") {
      const hijabMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.16, applyFabric: false });
      buildContouredUndercap(underMat, { frontYFrac: 0.244, cheekDrop: 0.14, backBunBoost: 0.07 });
      buildHijabHood({ frontYFrac: 0.214, cheekDrop: 0.34, napeYFrac: -0.60, archLift: 0.022, crownLoft: 0.040, sideLoft: 0.052, backLoft: 0.078, backBunBoost: 0.15, pleatAmp: 0.013, mat: hijabMat });
      buildLongIslamicCapeDrape({
        flareXFrac: 1.04,
        flareZFrontFrac: 0.64,
        flareZBackFrac: 0.60,
        pleatAmpFrac: 0.017,
        shoulderEaseFrac: 0.062,
        bustEaseFrac: 0.12,
        hemScoopFrac: 0.13,
        mat: hijabMat,
      });
      addCrossedShoulderScarf(hijabMat, 1, -1.52);
    } else if (headwearSpec.id === "hijab_long_khimar") {
      const khimarMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.15, applyFabric: false });
      buildContouredUndercap(underMat, { frontYFrac: 0.236, cheekDrop: 0.13, backBunBoost: 0.06 });
      buildHijabHood({ frontYFrac: 0.200, cheekDrop: 0.36, napeYFrac: -0.62, archLift: 0.016, crownLoft: 0.040, sideLoft: 0.056, backLoft: 0.084, backBunBoost: 0.15, pleatAmp: 0.013, mat: khimarMat });
      const targets = getHijabDrapeTargets({
        stdFront: yUnderBust + headH * 0.06,
        longFront: yUnderBust - headH * 0.22,
        extraFront: yWaist - headH * 0.28,
        stdBack: yUnderBust - headH * 0.04,
        longBack: yWaist - headH * 0.06,
        extraBack: lerp(yWaist, yHip, 0.56),
      });
      buildLongIslamicCapeDrape({
        targetFrontY: targets.frontY,
        targetBackY: targets.backY,
        flareXFrac: 1.18,
        flareZFrontFrac: 0.72,
        flareZBackFrac: 0.66,
        pleatAmpFrac: 0.019,
        shoulderEaseFrac: 0.075,
        bustEaseFrac: 0.145,
        hemScoopFrac: 0.16,
        mat: khimarMat,
      });
    } else if (headwearSpec.id === "hijab_french_jilbab") {
      const jilbabMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.78, sheen: 0.18, applyFabric: false });
      buildContouredUndercap(underMat, { frontYFrac: 0.240, cheekDrop: 0.12, backBunBoost: 0.05 });
      buildHijabHood({ frontYFrac: 0.208, cheekDrop: 0.35, napeYFrac: -0.64, archLift: 0.008, crownLoft: 0.038, sideLoft: 0.060, backLoft: 0.088, backBunBoost: 0.14, pleatAmp: 0.014, mat: jilbabMat });
      buildContouredBrowBand(jilbabMat, { topYFrac: 0.225, botYFrac: 0.145, addRearTies: true });
      const targets = getHijabDrapeTargets({
        stdFront: yUnderBust,
        longFront: yWaist - headH * 0.08,
        extraFront: lerp(yWaist, yHip, 0.35),
        stdBack: yUnderBust - headH * 0.08,
        longBack: yWaist - headH * 0.14,
        extraBack: lerp(yWaist, yHip, 0.58),
      });
      buildLongIslamicCapeDrape({
        topSideYFrac: -0.22,
        targetFrontY: targets.frontY,
        targetBackY: targets.backY,
        flareXFrac: 1.24,
        flareZFrontFrac: 0.72,
        flareZBackFrac: 0.68,
        pleatAmpFrac: 0.020,
        shoulderEaseFrac: 0.082,
        bustEaseFrac: 0.155,
        hemScoopFrac: 0.15,
        mat: jilbabMat,
      });
    } else if (headwearSpec.id === "hijab_long_shayla") {
      const shaylaMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.15, applyFabric: false });
      buildContouredUndercap(underMat, { frontYFrac: 0.246, cheekDrop: 0.11, backBunBoost: 0.06 });
      buildHijabHood({ frontYFrac: 0.218, cheekDrop: 0.26, napeYFrac: -0.64, archLift: 0.018, crownLoft: 0.040, sideLoft: 0.062, backLoft: 0.094, backBunBoost: 0.14, pleatAmp: 0.016, mat: shaylaMat });
      buildLongIslamicCapeDrape({
        flareXFrac: 1.08,
        flareZFrontFrac: 0.60,
        flareZBackFrac: 0.64,
        pleatAmpFrac: 0.021,
        shoulderEaseFrac: 0.065,
        bustEaseFrac: 0.125,
        hemScoopFrac: 0.13,
        mat: shaylaMat,
      });
      addCrossedShoulderScarf(shaylaMat, -1, -1.62);
      addCrossedShoulderScarf(shaylaMat, 1, -1.36);
    } else if (headwearSpec.id === "hijab_niqab") {
      const niqabMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.15, applyFabric: false });
      buildNiqabAssembly({
        mat: niqabMat,
        underMat,
        backLayers: 1,
        eyeScreen: hasEyeScreen,
      });
    } else if (headwearSpec.id === "niqab_long_saudi") {
      const niqabMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.15, applyFabric: false });
      const targets = getHijabDrapeTargets({
        stdFront: yUnderBust + headH * 0.06,
        longFront: yUnderBust - headH * 0.20,
        extraFront: yWaist - headH * 0.28,
        stdBack: yUnderBust - headH * 0.02,
        longBack: yWaist - headH * 0.08,
        extraBack: lerp(yWaist, yHip, 0.56),
      });
      buildNiqabAssembly({
        mat: niqabMat,
        underMat,
        capeFrontY: targets.frontY,
        capeBackY: targets.backY,
        veilBottomTargetY: targets.frontY + headH * 0.08,
        backLayers: 1,
        eyeScreen: hasEyeScreen,
      });
    } else if (headwearSpec.id === "niqab_long_layered") {
      const niqabMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.15, applyFabric: false });
      const targets = getHijabDrapeTargets({
        stdFront: yUnderBust,
        longFront: yWaist - headH * 0.06,
        extraFront: lerp(yWaist, yHip, 0.34),
        stdBack: yUnderBust - headH * 0.10,
        longBack: yWaist - headH * 0.14,
        extraBack: lerp(yWaist, yHip, 0.62),
      });
      buildNiqabAssembly({
        mat: niqabMat,
        underMat,
        capeFrontY: targets.frontY,
        capeBackY: targets.backY,
        veilBottomTargetY: targets.frontY + headH * 0.06,
        backLayers: 2,
        eyeScreen: hasEyeScreen,
      });
    } else if (headwearSpec.id === "niqab_khimar_long") {
      const niqabMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.15, applyFabric: false });
      const targets = getHijabDrapeTargets({
        stdFront: yUnderBust + headH * 0.04,
        longFront: yUnderBust - headH * 0.22,
        extraFront: yWaist - headH * 0.28,
        stdBack: yUnderBust - headH * 0.04,
        longBack: yWaist - headH * 0.10,
        extraBack: lerp(yWaist, yHip, 0.58),
      });
      buildNiqabAssembly({
        mat: niqabMat,
        underMat,
        capeFrontY: targets.frontY,
        capeBackY: targets.backY,
        veilBottomTargetY: lerp(yChest, targets.frontY, 0.62),
        backLayers: 1,
        eyeScreen: hasEyeScreen,
        isHalfNiqab: true,
      });
    } else if (headwearSpec.id === "niqab_eye_screen") {
      const niqabMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.80, sheen: 0.15, applyFabric: false });
      const targets = getHijabDrapeTargets({
        stdFront: yUnderBust,
        longFront: yWaist - headH * 0.08,
        extraFront: lerp(yWaist, yHip, 0.34),
        stdBack: yUnderBust - headH * 0.08,
        longBack: yWaist - headH * 0.14,
        extraBack: lerp(yWaist, yHip, 0.60),
      });
      buildNiqabAssembly({
        mat: niqabMat,
        underMat,
        capeFrontY: targets.frontY,
        capeBackY: targets.backY,
        veilBottomTargetY: targets.frontY + headH * 0.06,
        backLayers: 2,
        eyeScreen: hasEyeScreen,
      });
    } else if (headwearSpec.id === "hijab_sport") {
      const sportMat = makeClothMat(hwHex);
      const underMat = makeClothMat(undercapHex, { roughness: 0.65, sheen: 0.25, applyFabric: false });
      const pipingMat = makeClothMat(undercapHex, { roughness: 0.45, sheen: 0.4, applyFabric: false });
      buildContouredUndercap(underMat, { frontYFrac: 0.238, cheekDrop: 0.10, backBunBoost: 0.04 });
      buildHijabHood({ frontYFrac: 0.215, cheekDrop: 0.33, napeYFrac: -0.46, archLift: 0.008, crownLoft: 0.022, sideLoft: 0.024, backLoft: 0.034, backBunBoost: 0.08, pleatAmp: 0.002, mat: sportMat });
      buildNeckAndShoulderDrape({ topFrontYFrac: -0.34, bottomFrontYFrac: -0.72, bottomBackYFrac: -0.68, flareXFrac: 0.60, flareZFrontFrac: 0.44, flareZBackFrac: 0.40, pleatAmpFrac: 0.004, mat: sportMat });
      const pipeGeo = new THREE.TorusGeometry(headH * 0.355, headH * 0.010, 8, 36, Math.PI * 1.15);
      const pipe = new THREE.Mesh(pipeGeo, pipingMat);
      pipe.position.set(0, headH * 0.05, headH * 0.14);
      pipe.rotation.z = -0.075 * Math.PI;
      addHwMesh(pipe);
    } else if (headwearSpec.id === "ghutra_iqal") {
      addInnerTaqiyahCap(0xfbfaf6);
      const ghutraMat = makeClothMat(hwHex, { roughness: 0.62, sheen: 0.46 });
      buildGulfHeadcloth(ghutraMat, { patternColors: false, dropBack: -1.00, widthFlare: 1.0 });
      addIqalCoil();
    } else if (headwearSpec.id === "shemagh_iqal" || headwearSpec.id === "shemagh_black_iqal") {
      addInnerTaqiyahCap(0xf8f7f3);
      const isDark = headwearSpec.id === "shemagh_black_iqal";
      const shemaghTex = createShemaghPatternTexture(hwHex, isDark);
      const shemaghMat = shemaghTex
        ? makeClothMat(0xffffff, { map: shemaghTex, roughness: 0.72, sheen: 0.32 })
        : makeClothMat(0xffffff, { vertexColors: true, roughness: 0.72, sheen: 0.32 });
      buildGulfHeadcloth(shemaghMat, { patternColors: !shemaghTex, accentCol: hwHex, dropBack: -1.02, widthFlare: 1.04 });
      addIqalCoil();
    } else if (headwearSpec.id === "ghutra_hamdaniyah") {
      const hamdMat = makeClothMat(hwHex, { roughness: 0.60, sheen: 0.48 });
      buildHijabHood({ frontYFrac: 0.245, cheekDrop: 0.22, napeYFrac: -0.44, archLift: 0.012, crownLoft: 0.032, sideLoft: 0.044, backLoft: 0.058, backBunBoost: 0.04, pleatAmp: 0.013, mat: hamdMat });
      // Hamdaniyah layered brow-wrap bands + shoulder drape corner
      [-1, 1].forEach((s) => {
        const wrapGeo = new THREE.TorusGeometry(headH * 0.405, headH * 0.042, 12, 40, Math.PI * 1.25);
        const wrap = new THREE.Mesh(wrapGeo, hamdMat);
        wrap.position.set(0, headH * 0.24, -headH * 0.01);
        wrap.rotation.set(Math.PI * 0.45, s * 0.20, s * 0.16);
        addHwMesh(wrap);
      });
      addCrossedShoulderScarf(hamdMat, 1, -0.82);
    } else if (headwearSpec.id === "taqiyah") {
      const taqMat = makeClothMat(hwHex, { roughness: 0.68, sheen: 0.28 });
      buildHijabHood({
        frontYFrac: 0.235,
        cheekDrop: 0.04,
        napeYFrac: -0.05,
        archLift: 0.005,
        crownLoft: 0.022,
        sideLoft: 0.020,
        backLoft: 0.022,
        backBunBoost: 0.0,
        pleatAmp: 0.003,
        mat: taqMat,
      });
      const trimCol = hwColor.clone().lerp(new THREE.Color(0xc69a47), 0.55);
      const trimMat = makeClothMat(trimCol, { roughness: 0.45, sheen: 0.45 });
      const rimGeo = new THREE.TorusGeometry(headH * 0.390, headH * 0.014, 10, 44);
      const rp = rimGeo.attributes.position;
      for (let i = 0; i < rp.count; i++) {
        rp.setX(i, rp.getX(i) * headWidthScale * 1.12);
        rp.setY(i, rp.getY(i) * headDepthScale * 1.05);
      }
      rimGeo.computeVertexNormals();
      const rim = new THREE.Mesh(rimGeo, trimMat);
      rim.position.set(0, headH * 0.185, -headH * 0.012);
      rim.rotation.x = Math.PI * 0.485;
      addHwMesh(rim);
    } else if (headwearSpec.id === "shawl_wrap") {
      const shawlMat = makeClothMat(hwHex, { roughness: 0.78, sheen: 0.36 });
      const accentCol = hwColor.clone().multiplyScalar(0.76);
      const accentMat = makeClothMat(accentCol, { roughness: 0.80, sheen: 0.30 });
      buildHijabHood({ frontYFrac: 0.235, cheekDrop: 0.06, napeYFrac: -0.22, archLift: 0.012, crownLoft: 0.036, sideLoft: 0.040, backLoft: 0.048, backBunBoost: 0.0, pleatAmp: 0.014, mat: shawlMat });
      // Three layered coiled turban/shawl folds around the upper crown
      for (let k = 0; k < 3; k++) {
        const foldGeo = new THREE.TorusGeometry(headH * (0.415 + k * 0.006), headH * 0.044, 12, 42);
        const fp = foldGeo.attributes.position;
        for (let i = 0; i < fp.count; i++) {
          fp.setX(i, fp.getX(i) * headWidthScale * 1.18);
          fp.setY(i, fp.getY(i) * headDepthScale * 1.09);
        }
        foldGeo.computeVertexNormals();
        const fold = new THREE.Mesh(foldGeo, k === 1 ? accentMat : shawlMat);
        fold.position.set(0, headH * (0.21 + k * 0.065), -headH * 0.01);
        fold.rotation.set(Math.PI * 0.47, (k - 1) * 0.08, (k % 2 === 0 ? 1 : -1) * 0.06);
        addHwMesh(fold);
      }
      // Draped fringed shawl tail over shoulder & chest
      addCrossedShoulderScarf(shawlMat, 1, -1.06);
    } else if (headwearSpec.id === "fedora") {
      const feltMat = makeClothMat(hwHex, { roughness: 0.86, sheen: 0.22 });
      const bandCol = hwColor.clone().multiplyScalar(0.45);
      const bandMat = makeClothMat(bandCol, { roughness: 0.42, sheen: 0.65 });

      const crownGeo = new THREE.CylinderGeometry(headH * 0.31, headH * 0.405, headH * 0.42, 40, 12, false);
      const cp = crownGeo.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const vx = cp.getX(i), vy = cp.getY(i), vz = cp.getZ(i);
        const hNorm = (vy + headH * 0.21) / (headH * 0.42);
        const pinch = 1 - 0.22 * smoothstep(0.45, 1.0, hNorm) * Math.max(0, vz / (headH * 0.4));
        const topCrease = hNorm > 0.85 ? -headH * 0.055 * Math.exp(-((vx / (headH * 0.09)) ** 2)) : 0;
        cp.setXYZ(i, vx * headWidthScale * 1.18 * pinch, vy + topCrease, vz * headDepthScale * 1.12);
      }
      crownGeo.computeVertexNormals();
      const crown = new THREE.Mesh(crownGeo, feltMat);
      crown.position.set(0, headH * 0.44, -headH * 0.01);
      addHwMesh(crown);

      const bandGeo = new THREE.CylinderGeometry(headH * 0.398, headH * 0.412, headH * 0.075, 40, 1, true);
      const bp = bandGeo.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        bp.setX(i, bp.getX(i) * headWidthScale * 1.18);
        bp.setZ(i, bp.getZ(i) * headDepthScale * 1.12);
      }
      bandGeo.computeVertexNormals();
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(0, headH * 0.275, -headH * 0.01);
      addHwMesh(band);

      const brimGeo = new THREE.RingGeometry(headH * 0.38, headH * 0.69, 48, 4);
      brimGeo.rotateX(-Math.PI / 2);
      const brp = brimGeo.attributes.position;
      for (let i = 0; i < brp.count; i++) {
        const bx = brp.getX(i), bz = brp.getZ(i);
        const rad = Math.hypot(bx, bz) / (headH * 0.69);
        const snapDown = -headH * 0.045 * Math.max(0, bz / (headH * 0.5)) * smoothstep(0.45, 1.0, rad);
        const sideCurl = headH * 0.032 * Math.pow(Math.abs(bx) / (headH * 0.6), 1.6);
        brp.setXYZ(i, bx * headWidthScale * 1.24, snapDown + sideCurl, bz * headDepthScale * 1.18);
      }
      brimGeo.computeVertexNormals();
      const brim = new THREE.Mesh(brimGeo, feltMat);
      brim.position.set(0, headH * 0.24, -headH * 0.01);
      brim.rotation.x = 0.05;
      addHwMesh(brim);
    } else if (headwearSpec.id === "baseball_cap") {
      const capMat = makeClothMat(hwHex, { roughness: 0.72, sheen: 0.25 });
      buildHijabHood({
        frontYFrac: 0.25,
        cheekDrop: 0.04,
        napeYFrac: -0.06,
        archLift: 0.008,
        crownLoft: 0.032,
        sideLoft: 0.028,
        backLoft: 0.030,
        backBunBoost: 0.0,
        pleatAmp: 0.002,
        mat: capMat,
      });
      const btn = new THREE.Mesh(new THREE.SphereGeometry(headH * 0.034, 12, 10), capMat);
      btn.scale.set(1.0, 0.55, 1.0);
      btn.position.set(0, headH * 0.535, -headH * 0.01);
      addHwMesh(btn);
      // Curved forward visor bill
      const U = 28, V = 8;
      const pos = [], idx = [];
      for (let iv = 0; iv <= V; iv++) {
        const v = iv / V;
        for (let iu = 0; iu <= U; iu++) {
          const u = iu / U;
          const phi = -0.78 + u * 1.56;
          const r = headH * lerp(0.38, 0.72, v);
          const x = Math.sin(phi) * r * headWidthScale * 1.12;
          const y = headH * (0.21 - 0.055 * v - 0.035 * Math.pow(Math.abs(phi), 1.5) * v);
          const z = Math.cos(phi) * r * headDepthScale + headH * 0.025;
          pos.push(x, y, z);
        }
      }
      const stride = U + 1;
      for (let iv = 0; iv < V; iv++) {
        for (let iu = 0; iu < U; iu++) {
          const a = iv * stride + iu, b = a + 1, c = (iv + 1) * stride + iu, d = c + 1;
          idx.push(a, b, d, a, d, c);
        }
      }
      const visorGeo = new THREE.BufferGeometry();
      visorGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      visorGeo.setIndex(idx);
      visorGeo.computeVertexNormals();
      addHwMesh(new THREE.Mesh(visorGeo, capMat));
    } else if (headwearSpec.id === "beanie") {
      const knitMat = makeClothMat(hwHex, { roughness: 0.88, sheen: 0.18 });
      buildHijabHood({
        frontYFrac: 0.215,
        cheekDrop: 0.08,
        napeYFrac: -0.14,
        archLift: 0.008,
        crownLoft: 0.068,
        sideLoft: 0.042,
        backLoft: 0.048,
        backBunBoost: 0.02,
        pleatAmp: 0.012,
        mat: knitMat,
      });
      const cuffGeo = new THREE.TorusGeometry(headH * 0.405, headH * 0.048, 12, 44);
      const cfp = cuffGeo.attributes.position;
      for (let i = 0; i < cfp.count; i++) {
        const vx = cfp.getX(i), vy = cfp.getY(i), vz = cfp.getZ(i);
        const rib = 1 + 0.045 * Math.sin(Math.atan2(vy, vx) * 32);
        cfp.setXYZ(i, vx * headWidthScale * 1.18 * rib, vy * headDepthScale * 1.10 * rib, vz * 1.35);
      }
      cuffGeo.computeVertexNormals();
      const cuff = new THREE.Mesh(cuffGeo, knitMat);
      cuff.position.set(0, headH * 0.20, -headH * 0.012);
      cuff.rotation.x = Math.PI * 0.48;
      addHwMesh(cuff);
    } else if (headwearSpec.id === "beret") {
      const woolMat = makeClothMat(hwHex, { roughness: 0.82, sheen: 0.30 });
      const beretBandGeo = new THREE.TorusGeometry(headH * 0.388, headH * 0.026, 10, 42);
      const bbp = beretBandGeo.attributes.position;
      for (let i = 0; i < bbp.count; i++) {
        bbp.setX(i, bbp.getX(i) * headWidthScale * 1.15);
        bbp.setY(i, bbp.getY(i) * headDepthScale * 1.08);
      }
      beretBandGeo.computeVertexNormals();
      const band = new THREE.Mesh(beretBandGeo, woolMat);
      band.position.set(0, headH * 0.22, -headH * 0.012);
      band.rotation.set(Math.PI * 0.47, 0.12, -0.05);
      addHwMesh(band);

      const discGeo = new THREE.SphereGeometry(headH * 0.49, 32, 18);
      discGeo.scale(1.04, 0.34, 1.08);
      const disc = new THREE.Mesh(discGeo, woolMat);
      disc.position.set(headH * 0.06, headH * 0.38, -headH * 0.03);
      disc.rotation.set(-0.08, 0.0, -0.22);
      addHwMesh(disc);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(headH * 0.012, headH * 0.015, headH * 0.045, 8), woolMat);
      stem.position.set(headH * 0.11, headH * 0.54, -headH * 0.03);
      stem.rotation.z = -0.22;
      addHwMesh(stem);
    } else if (headwearSpec.id === "sun_hat") {
      const strawMat = makeClothMat(hwHex, { roughness: 0.84, sheen: 0.20 });
      const ribbonCol = hwColor.clone().multiplyScalar(0.38);
      const ribbonMat = makeClothMat(ribbonCol, { roughness: 0.38, sheen: 0.75 });
      const domeGeo = new THREE.SphereGeometry(headH * 0.405, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.52);
      domeGeo.scale(headWidthScale * 1.14, 0.88, headDepthScale * 1.08);
      const dome = new THREE.Mesh(domeGeo, strawMat);
      dome.position.set(0, headH * 0.21, -headH * 0.012);
      addHwMesh(dome);

      const ribGeo = new THREE.CylinderGeometry(headH * 0.398, headH * 0.408, headH * 0.068, 36, 1, true);
      const rp = ribGeo.attributes.position;
      for (let i = 0; i < rp.count; i++) {
        rp.setX(i, rp.getX(i) * headWidthScale * 1.14);
        rp.setZ(i, rp.getZ(i) * headDepthScale * 1.08);
      }
      ribGeo.computeVertexNormals();
      const rib = new THREE.Mesh(ribGeo, ribbonMat);
      rib.position.set(0, headH * 0.25, -headH * 0.012);
      addHwMesh(rib);

      const brimGeo = new THREE.RingGeometry(headH * 0.38, headH * 0.94, 52, 5);
      brimGeo.rotateX(-Math.PI / 2);
      const brp = brimGeo.attributes.position;
      for (let i = 0; i < brp.count; i++) {
        const bx = brp.getX(i), bz = brp.getZ(i);
        const rad = Math.hypot(bx, bz) / (headH * 0.94);
        const ang = Math.atan2(bz, bx);
        const wave = headH * 0.048 * Math.sin(ang * 3 + 0.4) * smoothstep(0.45, 1.0, rad);
        const droop = -headH * 0.065 * smoothstep(0.42, 1.0, rad);
        brp.setXYZ(i, bx * headWidthScale * 1.20, wave + droop, bz * headDepthScale * 1.14);
      }
      brimGeo.computeVertexNormals();
      const brim = new THREE.Mesh(brimGeo, strawMat);
      brim.position.set(0, headH * 0.22, -headH * 0.012);
      addHwMesh(brim);
    }
  }
  void hairMat;
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
    limbs.arm1.rotation.z = 0.175;
    limbs["arm-1"].rotation.z = -0.175;
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

    // Counter-swinging arms with phase-lagged humeral shoulder swing, subtle internal rotation & garment-safe abduction
    const armPhase = phase - 0.12;
    const sArm = Math.sin(armPhase);
    const armSwingAmp = strideAmp * (isWoman ? 0.62 : (isKid ? 0.66 : 0.68));
    const armLX = -sArm * armSwingAmp - 0.028 - 0.024 * Math.sin(2 * armPhase);
    const armRX = sArm * armSwingAmp - 0.028 + 0.024 * Math.sin(2 * armPhase);
    limbs.arm1.rotation.x = lerpAngle(limbs.arm1.rotation.x, armLX);
    limbs["arm-1"].rotation.x = lerpAngle(limbs["arm-1"].rotation.x, armRX);

    const baseAbduct = Math.max(0.095, minArmAbduct);
    const abductL = baseAbduct + 0.028 * Math.abs(sArm) + 0.012 * Math.max(0, armLX);
    const abductR = baseAbduct + 0.028 * Math.abs(sArm) + 0.012 * Math.max(0, armRX);
    limbs.arm1.rotation.z = lerpAngle(limbs.arm1.rotation.z, abductL);
    limbs["arm-1"].rotation.z = lerpAngle(limbs["arm-1"].rotation.z, -abductR);

    // Natural anatomical humeral internal/external rotation: arm curves gently medially on forward swing
    const humeralYawScale = isWoman ? 0.22 : 0.18;
    const armLY = armLX * humeralYawScale;
    const armRY = -armRX * humeralYawScale;
    limbs.arm1.rotation.y = lerpAngle(limbs.arm1.rotation.y || 0, armLY);
    limbs["arm-1"].rotation.y = lerpAngle(limbs["arm-1"].rotation.y || 0, armRY);

    if (limbs.elbow1 && limbs["elbow-1"]) {
      const elbL = -0.14 - Math.max(0, -armLX) * 0.58 - 0.035 * Math.abs(Math.sin(armPhase - 0.18));
      const elbR = -0.14 - Math.max(0, -armRX) * 0.58 - 0.035 * Math.abs(Math.sin(armPhase - 0.18));
      limbs.elbow1.rotation.x = lerpAngle(limbs.elbow1.rotation.x, elbL);
      limbs["elbow-1"].rotation.x = lerpAngle(limbs["elbow-1"].rotation.x, elbR);
      // Slight outward forearm carry when clearing flared skirts
      const elbowOut = Math.max(0, minArmAbduct - 0.11) * 0.35;
      limbs.elbow1.rotation.z = lerpAngle(limbs.elbow1.rotation.z || 0, elbowOut);
      limbs["elbow-1"].rotation.z = lerpAngle(limbs["elbow-1"].rotation.z || 0, -elbowOut);
    }

    if (limbs.hand1 && limbs["hand-1"]) {
      limbs.hand1.rotation.x = lerpAngle(limbs.hand1.rotation.x, armLX * 0.26 + 0.025 * Math.cos(armPhase));
      limbs["hand-1"].rotation.x = lerpAngle(limbs["hand-1"].rotation.x, armRX * 0.26 - 0.025 * Math.cos(armPhase));
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
      limbs.chest.rotation.z = lerpAngle(limbs.chest.rotation.z, -pelvRoll * 0.48);
      limbs.chest.rotation.y = lerpAngle(limbs.chest.rotation.y, -pelvYaw * 0.86);
      limbs.chest.rotation.x = lerpAngle(limbs.chest.rotation.x, 0.008 * Math.sin(2 * phase));
    }
    if (limbs.neck) {
      limbs.neck.rotation.y = lerpAngle(limbs.neck.rotation.y, pelvYaw * 0.26);
      limbs.neck.rotation.z = lerpAngle(limbs.neck.rotation.z, pelvRoll * 0.12);
    }
    if (limbs.head) {
      limbs.head.rotation.y = lerpAngle(limbs.head.rotation.y, pelvYaw * 0.20);
      limbs.head.rotation.z = lerpAngle(limbs.head.rotation.z, -pelvRoll * 0.10);
      limbs.head.rotation.x = lerpAngle(limbs.head.rotation.x, -0.008);
    }

    return { phase, stride: Math.sin(phase) * strideAmp, bobY: groundedBobY, swayX };
  }

  // Living idle stance: gentle respiratory breathing + subtle balance micro-sway
  const breath = reduceMotion ? 0 : Math.sin(time * 1.45);
  const idleSway = reduceMotion ? 0 : Math.sin(time * 0.72) * 0.004;
  const idleAbduct = Math.max(0.095, minArmAbduct) + (reduceMotion ? 0 : 0.005 * (breath * 0.5 + 0.5));
  const damp = blendAlpha >= 0.99 ? 1.0 : Math.min(1.0, Math.max(0.14, blendAlpha));

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
  limbs.arm1.rotation.y = dampTo(limbs.arm1.rotation.y || 0, reduceMotion ? 0 : -0.03);
  limbs["arm-1"].rotation.y = dampTo(limbs["arm-1"].rotation.y || 0, reduceMotion ? 0 : 0.03);
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
  if (srcGeo.attributes.color) {
    bakedGeo.setAttribute("color", srcGeo.attributes.color.clone());
  }
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
  const preset = options.mannequin || null;
  const resolvedMorph = options.morph || preset?.morph || null;
  const resolvedSkinColor = options.skinColor != null ? options.skinColor : preset?.skinColor;
  const resolvedHairColor = options.hairColor != null ? options.hairColor : preset?.hairColor;
  const resolvedHairStyle = options.hairStyle != null ? options.hairStyle : (preset?.hairStyle || null);
  const resolvedHairType = options.hairType || preset?.hairType || "straight";
  const resolvedHairLength = options.hairLength || preset?.hairLength || "natural";
  const resolvedHairHighlight = options.hairHighlight ?? preset?.hairHighlight ?? "none";
  const resolvedHeadwear = options.headwear || preset?.headwear || "none";
  const resolvedHeadwearColor = options.headwearColor ?? preset?.headwearColor ?? null;
  const resolvedHeadwearFabric = options.headwearFabric || preset?.headwearFabric || null;
  const resolvedHeadwearLength = options.headwearLength || preset?.headwearLength || null;
  const resolvedUndercapColor = options.undercapColor ?? options.undercapHex ?? preset?.undercapColor ?? preset?.undercapHex ?? null;
  const resolvedNiqabEyeScreen = options.niqabEyeScreen != null ? options.niqabEyeScreen : preset?.niqabEyeScreen;

  const dims = computeHumanBodyDims(category, measurementsOrDims, options.landmarks, resolvedMorph);
  const skinMat = options.skinMaterial || createHumanSkinMaterial(THREE, category, resolvedSkinColor, lowPower);

  const group = new THREE.Group();
  group.name = "avatar";

  const rig = createSkeletonRig(THREE, dims);
  const bodyGeo = buildWatertightBodyGeometry(THREE, category, dims, rig.landmarks, {
    collisionSafe: options.collisionSafe ?? Boolean(options.bakeStatic),
  });
  if (bodyGeo.attributes.color && skinMat && !skinMat.vertexColors) {
    skinMat.vertexColors = true;
    skinMat.needsUpdate = true;
  }

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
    resolvedHairColor,
    bodyGeo,
    rig.landmarks.headCenterY,
    lowPower,
    resolvedSkinColor,
    resolvedHairStyle,
    {
      hairType: resolvedHairType,
      hairLength: resolvedHairLength,
      hairHighlight: resolvedHairHighlight,
      headwear: resolvedHeadwear,
      headwearColor: resolvedHeadwearColor,
      headwearFabric: resolvedHeadwearFabric,
      headwearLength: resolvedHeadwearLength,
      undercapColor: resolvedUndercapColor,
      niqabEyeScreen: resolvedNiqabEyeScreen,
      headWidthScale: dims.headWidthScale,
      headDepthScale: dims.headDepthScale,
      dims,
      landmarks: rig.landmarks,
    }
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
      mannequinMeta: preset,
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
    mannequinMeta: preset,
  };
}
