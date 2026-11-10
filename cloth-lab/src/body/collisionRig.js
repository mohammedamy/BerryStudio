import * as THREE from 'three'
import { torsoProfile } from './computeBodyDims.js'
import { femaleTorsoExtraRadius, maleTorsoExtraRadius } from './torsoSculpt.js'

// Full-body, pose-synchronized tapered-capsule collision rig (up to 32
// primitives) matching the unified sculpted human mannequin (`Avatar.jsx` /
// `js/human-mannequin.js`).
//
// Invariants preserved for downstream consumers:
// - Primitives `0 .. torsoProfile(dims).length - 2` (the first 8 segments)
//   are ALWAYS the `torsoProfile` spine chain so `deriveMeshFitCollisionRig`
//   can measure & replace torso radii on external GLB avatars unchanged.
// - Subsequent primitives cover the neck, cranium, sloped clavicles/deltoids,
//   anterior bust/pectoral lobes, posterior gluteal lobes, groin saddle,
//   bilateral posed upper arms -> elbows -> forearms -> hands, and bilateral
//   posed thighs -> knees -> gastrocnemius calves -> ankles -> feet across
//   `standing`, `apose`, `tpose`, `contrapposto`, `seated`, and live `walk`.
export const MAX_COLLISION_CAPSULES = 32

// Outward cloth-thickness + triangle-chord sag clearance (6mm) so neither
// cloth particles nor stretched triangle edges ever graze or clip skin.
const SKIN_CLEARANCE = 0.006

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function rotZVec(x, y, z, theta) {
  const c = Math.cos(theta), s = Math.sin(theta)
  return [x * c - y * s, x * s + y * c, z]
}

function rotXVec(x, y, z, phi) {
  const c = Math.cos(phi), s = Math.sin(phi)
  return [x, y * c - z * s, y * s + z * c]
}

function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

/**
 * Analytically computes exact posed joint coordinates matching `js/human-mannequin.js`
 * (`createSkeletonRig` + `applyMannequinPose`) for any static pose (`standing`,
 * `apose`, `tpose`, `contrapposto`, `seated`). Shared by both `deriveCollisionRig`
 * and `pattern/placement.js` so sleeves, skirts, dresses, and trousers spawn
 * coaxially around the posed limbs at frame 0.
 *
 * Convention: `side = +1` is `+X` (`arm1` / `leg1` / `_r`), `side = -1` is `-X` (`arm-1` / `leg-1` / `_l`).
 */
export function computeMannequinPoseJoints(dims, pose = 'standing') {
  const { hipY, shoulderY, neckTopY, headH, span, shoulderHalf, hipR, armLen, upperR, H, female, kid } = dims
  const p = pose || 'standing'

  const waistY = hipY + span * 0.44
  const chestBoneY = hipY + span * 0.68
  const neckBaseY = shoulderY + span * 0.02
  const headCenterY = neckTopY + headH * 0.50

  const shoulderPivotY = shoulderY - span * 0.035
  const shoulderPivotX = shoulderHalf * 0.82
  const upperArmLen = armLen * 0.48
  const forearmLen = armLen * 0.46
  const wristR = upperR * (female ? 0.34 : 0.36)
  const handLen = wristR * 4.8

  const hipPivotY = hipY - span * 0.04
  const hipPivotX = hipR * (female ? 0.45 : 0.47)
  const ankleY = Math.max(0.054, H * 0.047)
  const totalLegSpan = Math.max(0.25, hipPivotY - ankleY)
  const thighLen = totalLegSpan * 0.53
  const calfLen = totalLegSpan * 0.47
  const footLen = clamp(H * (kid ? 0.148 : (female ? 0.142 : 0.150)), 0.17, 0.29)
  const footW = footLen * (female ? 0.37 : 0.39)

  let pelvisRotZ = 0, spineRotZ = 0, chestRotZ = 0, headRotZ = 0
  const armCfg = {
    1: { z: 0.095, elbowX: -0.11 },
    [-1]: { z: -0.095, elbowX: -0.11 },
  }
  const legCfg = {
    1: { x: 0, z: 0, kneeX: 0 },
    [-1]: { x: 0, z: 0, kneeX: 0 },
  }

  if (p === 'apose') {
    armCfg[1] = { z: 0.45, elbowX: -0.06 }
    armCfg[-1] = { z: -0.45, elbowX: -0.06 }
  } else if (p === 'tpose') {
    const tz = Math.PI / 2 - 0.04
    armCfg[1] = { z: tz, elbowX: 0 }
    armCfg[-1] = { z: -tz, elbowX: 0 }
  } else if (p === 'contrapposto') {
    pelvisRotZ = -0.045
    spineRotZ = 0.035
    chestRotZ = 0.025
    headRotZ = -0.015
    armCfg[1] = { z: 0.14, elbowX: -0.16 }
    armCfg[-1] = { z: -0.08, elbowX: -0.09 }
    legCfg[1] = { x: -0.08, z: 0.06, kneeX: 0.16 }
    legCfg[-1] = { x: 0, z: 0.03, kneeX: 0 }
  } else if (p === 'seated') {
    armCfg[1] = { z: 0.09, elbowX: -0.22 }
    armCfg[-1] = { z: -0.09, elbowX: -0.22 }
    legCfg[1] = { x: -Math.PI / 2, z: 0, kneeX: Math.PI / 2 }
    legCfg[-1] = { x: -Math.PI / 2, z: 0, kneeX: Math.PI / 2 }
  }

  const pelvisPos = [0, hipY, 0]
  const spineWorldZ = pelvisRotZ + spineRotZ
  const chestWorldZ = spineWorldZ + chestRotZ
  const headWorldZ = chestWorldZ + headRotZ

  const spinePos = add3(pelvisPos, rotZVec(0, waistY - hipY, 0, pelvisRotZ))
  const chestPos = add3(spinePos, rotZVec(0, chestBoneY - waistY, 0, spineWorldZ))
  const neckPos = add3(chestPos, rotZVec(0, neckBaseY - chestBoneY, 0, chestWorldZ))
  const headPos = add3(neckPos, rotZVec(0, headCenterY - neckBaseY, 0, chestWorldZ))
  const crownPos = add3(headPos, rotZVec(0, headH * 0.48, 0, headWorldZ))

  const arms = {}
  for (const side of [-1, 1]) {
    const shoulder = add3(chestPos, rotZVec(side * shoulderPivotX, shoulderPivotY - chestBoneY, 0, chestWorldZ))
    const totalArmZ = chestWorldZ + armCfg[side].z
    const upperVec = rotZVec(0, -upperArmLen, 0, totalArmZ)
    const elbow = add3(shoulder, upperVec)
    const foreLocal = rotXVec(0, -forearmLen, 0, armCfg[side].elbowX)
    const foreVec = rotZVec(foreLocal[0], foreLocal[1], foreLocal[2], totalArmZ)
    const wrist = add3(elbow, foreVec)
    const handLocal = rotXVec(0, -handLen, 0, armCfg[side].elbowX)
    const handVec = rotZVec(handLocal[0], handLocal[1], handLocal[2], totalArmZ)
    const handTip = add3(wrist, handVec)
    arms[side] = { shoulder, elbow, wrist, handTip, upperArmLen, forearmLen, wristR, handLen, totalArmZ, elbowX: armCfg[side].elbowX }
  }

  const legs = {}
  for (const side of [-1, 1]) {
    const hip = add3(pelvisPos, rotZVec(side * hipPivotX, hipPivotY - hipY, 0, pelvisRotZ))
    const legZ = pelvisRotZ + legCfg[side].z
    const legX = legCfg[side].x
    // Bone Euler order XYZ: local vector rotated by X then Z (when Y=0)
    const thighLocal = rotXVec(0, -thighLen, 0, legX)
    const thighVec = rotZVec(thighLocal[0], thighLocal[1], thighLocal[2], legZ)
    const knee = add3(hip, thighVec)

    const calfPitch = legX + legCfg[side].kneeX
    const calfLocal = rotXVec(0, -calfLen, 0, calfPitch)
    const calfVec = rotZVec(calfLocal[0], calfLocal[1], calfLocal[2], legZ)
    const ankle = add3(knee, calfVec)

    const heelLocal = rotXVec(0, -ankleY * 0.52, -footLen * 0.28, calfPitch)
    const toeLocal = rotXVec(0, -ankleY * 0.62, footLen * 0.62, calfPitch)
    const heel = add3(ankle, rotZVec(heelLocal[0], heelLocal[1], heelLocal[2], legZ))
    const toe = add3(ankle, rotZVec(toeLocal[0], toeLocal[1], toeLocal[2], legZ))
    legs[side] = { hip, knee, ankle, heel, toe, thighLen, calfLen, footLen, footW, hipPivotX }
  }

  return {
    pelvisPos,
    spinePos,
    chestPos,
    neckPos,
    headPos,
    crownPos,
    arms,
    legs,
    wristR,
    footW,
    hipPivotX,
    shoulderPivotX,
    shoulderPivotY,
  }
}

const _v = new THREE.Vector3()
function worldPos(bone, ox = 0, oy = 0, oz = 0) {
  return _v.set(ox, oy, oz).applyMatrix4(bone.matrixWorld).toArray()
}

/**
 * Extracts live world-space joint coordinates directly from a posed/animated
 * `js/human-mannequin.js` `limbs` rig (used by `Avatar.jsx` for both static
 * poses and real-time `walk` gait frames).
 */
export function extractPoseJointsFromLimbs(dims, limbs) {
  if (!limbs || !limbs.pelvis) return computeMannequinPoseJoints(dims, 'standing')
  const { headH, upperR, H, hipR, shoulderHalf, shoulderY, span, female, kid } = dims
  const wristR = upperR * (female ? 0.34 : 0.36)
  const handLen = wristR * 4.8
  const ankleY = Math.max(0.054, H * 0.047)
  const footLen = clamp(H * (kid ? 0.148 : (female ? 0.142 : 0.150)), 0.17, 0.29)
  const footW = footLen * (female ? 0.37 : 0.39)

  const pelvisPos = worldPos(limbs.pelvis)
  const spinePos = worldPos(limbs.spine)
  const chestPos = worldPos(limbs.chest)
  const neckPos = worldPos(limbs.neck)
  const headPos = worldPos(limbs.head)
  const crownPos = worldPos(limbs.head, 0, headH * 0.48, 0)

  const arms = {}
  for (const side of [-1, 1]) {
    const bArm = side > 0 ? limbs.arm1 : limbs['arm-1']
    const bElb = side > 0 ? limbs.elbow1 : limbs['elbow-1']
    const bHnd = side > 0 ? limbs.hand1 : limbs['hand-1']
    arms[side] = {
      shoulder: worldPos(bArm),
      elbow: worldPos(bElb),
      wrist: worldPos(bHnd),
      handTip: worldPos(bHnd, 0, -handLen, 0),
      wristR,
    }
  }

  const legs = {}
  for (const side of [-1, 1]) {
    const bLeg = side > 0 ? limbs.leg1 : limbs['leg-1']
    const bKne = side > 0 ? limbs.knee1 : limbs['knee-1']
    const bFot = side > 0 ? limbs.foot1 : limbs['foot-1']
    legs[side] = {
      hip: worldPos(bLeg),
      knee: worldPos(bKne),
      ankle: worldPos(bFot),
      heel: worldPos(bFot, 0, -ankleY * 0.52, -footLen * 0.28),
      toe: worldPos(bFot, 0, -ankleY * 0.62, footLen * 0.62),
      footW,
    }
  }

  return {
    pelvisPos,
    spinePos,
    chestPos,
    neckPos,
    headPos,
    crownPos,
    arms,
    legs,
    wristR,
    footW,
    hipPivotX: hipR * (female ? 0.45 : 0.47),
    shoulderPivotX: shoulderHalf * 0.82,
    shoulderPivotY: shoulderY - span * 0.035,
  }
}

export function deriveCollisionRig(dims, pose = 'standing', precomputedJoints = null) {
  const { hipY, shoulderY, span, headH, neckR, chestR, upperR, hipR, thighR, female, kid } = dims
  const zScale = female ? 0.72 : 0.78
  const primitives = []

  const joints = precomputedJoints || computeMannequinPoseJoints(dims, pose)
  const pelvDX = joints.pelvisPos[0]
  const pelvDY = joints.pelvisPos[1] - hipY
  const pelvDZ = joints.pelvisPos[2]
  const chestDX = joints.chestPos[0]
  const chestDZ = joints.chestPos[2]

  const extraRadiusAt = (y) => {
    const sculpt = kid ? 0 : (female ? femaleTorsoExtraRadius(y, dims, zScale) : maleTorsoExtraRadius(y, dims, zScale))
    // Account for male upper-chest latissimus V-taper (1.07x) and hip trochanter fullness (1.015x)
    const latMargin = (!female && !kid && y > hipY + span * 0.62) ? chestR * 0.05 : 0
    const hipMargin = (y < hipY + span * 0.08) ? hipR * 0.02 : 0
    return sculpt + latMargin + hipMargin + SKIN_CLEARANCE
  }

  // 0..7 (8 primitives): Torso spine chain (kept at indices 0..7 for deriveMeshFitCollisionRig)
  const profile = torsoProfile(dims)
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i]
    const [r1, y1] = profile[i + 1]
    const f0 = clamp((y0 - hipY) / Math.max(span, 0.1), 0, 1)
    const f1 = clamp((y1 - hipY) / Math.max(span, 0.1), 0, 1)
    const x0 = pelvDX * (1 - f0) + chestDX * f0
    const x1 = pelvDX * (1 - f1) + chestDX * f1
    const z0 = pelvDZ * (1 - f0) + chestDZ * f0
    const z1 = pelvDZ * (1 - f1) + chestDZ * f1
    primitives.push({
      a: [x0, y0 + pelvDY, z0],
      b: [x1, y1 + pelvDY, z1],
      ra: r0 + extraRadiusAt(y0),
      rb: r1 + extraRadiusAt(y1),
      zScale,
    })
  }

  // 8: Neck
  primitives.push({
    a: [chestDX, shoulderY - span * 0.02 + pelvDY, chestDZ],
    b: joints.headPos,
    ra: neckR * 1.08 + SKIN_CLEARANCE,
    rb: neckR * 1.02 + SKIN_CLEARANCE,
    zScale: 1,
  })

  // 9: Head & Cranium
  const jawPos = lerp3(joints.neckPos, joints.headPos, 0.55)
  primitives.push({
    a: [jawPos[0], jawPos[1], jawPos[2] + headH * 0.02],
    b: joints.crownPos,
    ra: headH * 0.39 + SKIN_CLEARANCE,
    rb: headH * 0.44 + SKIN_CLEARANCE,
    zScale: 1,
  })

  // 10, 11: Left & Right sloped clavicle-to-acromion shoulder bridges
  for (const side of [-1, 1]) {
    const innerClav = [
      joints.neckPos[0] + side * neckR * 0.80,
      shoulderY + span * 0.014 + pelvDY,
      joints.neckPos[2],
    ]
    const sh = joints.arms[side].shoulder
    const outerAcromion = [
      sh[0] + side * upperR * 0.16,
      sh[1] + upperR * 0.18,
      sh[2],
    ]
    primitives.push({
      a: innerClav,
      b: outerAcromion,
      ra: upperR * 0.96 + SKIN_CLEARANCE,
      rb: upperR * 1.05 + SKIN_CLEARANCE,
      zScale: 1,
    })
  }

  // 12, 13: Bilateral anterior bust / pectoral sculpt lobes
  const bustY = hipY + span * (female ? 0.715 : 0.74) + pelvDY
  const bustX = chestR * (female ? 0.43 : 0.44)
  const bustR = chestR * (female ? (kid ? 0.36 : 0.46) : (kid ? 0.34 : 0.40)) + SKIN_CLEARANCE
  const bustZ = chestR * zScale * (female ? (kid ? 0.58 : 0.68) : 0.60) + chestDZ
  for (const side of [-1, 1]) {
    const c = [chestDX + side * bustX, bustY, bustZ]
    primitives.push({ a: c, b: c, ra: bustR, rb: bustR, zScale: 1 })
  }

  // 14, 15: Bilateral posterior gluteal / trochanteric lobes + 16: Pelvic groin saddle
  const gluteY = hipY - span * 0.035 + pelvDY
  const gluteX = hipR * 0.42
  const gluteR = hipR * (female ? 0.54 : 0.51) + SKIN_CLEARANCE
  const gluteZ = -hipR * zScale * (female ? 0.48 : 0.44) + pelvDZ
  for (const side of [-1, 1]) {
    const g = [pelvDX + side * gluteX, gluteY, gluteZ]
    primitives.push({ a: g, b: g, ra: gluteR, rb: gluteR, zScale: 1 })
  }
  const pelvicSaddleY = hipY - span * 0.035 + pelvDY
  primitives.push({
    a: [pelvDX - joints.hipPivotX * 0.85, pelvicSaddleY, pelvDZ],
    b: [pelvDX + joints.hipPivotX * 0.85, pelvicSaddleY, pelvDZ],
    ra: hipR * zScale * 0.86 + SKIN_CLEARANCE,
    rb: hipR * zScale * 0.86 + SKIN_CLEARANCE,
    zScale: 1,
  })

  // 17..22: Pose-exact Bilateral Upper Arms, Forearms & Hands
  for (const side of [-1, 1]) {
    const arm = joints.arms[side]
    // Upper arm (shoulder -> elbow)
    primitives.push({
      a: arm.shoulder,
      b: arm.elbow,
      ra: upperR * 1.04 + SKIN_CLEARANCE,
      rb: upperR * 0.78 + SKIN_CLEARANCE,
      zScale: 1,
    })
    // Forearm (elbow -> wrist)
    primitives.push({
      a: arm.elbow,
      b: arm.wrist,
      ra: upperR * 0.80 + SKIN_CLEARANCE,
      rb: arm.wristR * 1.22 + SKIN_CLEARANCE,
      zScale: 1,
    })
    // Hand & fingers (wrist -> fingertips)
    primitives.push({
      a: arm.wrist,
      b: arm.handTip,
      ra: arm.wristR * 1.42 + SKIN_CLEARANCE,
      rb: arm.wristR * 1.12 + SKIN_CLEARANCE,
      zScale: 1,
    })
  }

  // 23..30: Pose-exact Bilateral Thighs, Upper Calves, Lower Shins & Feet
  const calfPeakScale = female ? 0.70 : (kid ? 0.67 : 0.73)
  for (const side of [-1, 1]) {
    const leg = joints.legs[side]
    const calfBelly = lerp3(leg.knee, leg.ankle, 0.36)
    // Thigh (hip -> knee)
    primitives.push({
      a: leg.hip,
      b: leg.knee,
      ra: thighR * 1.05 + SKIN_CLEARANCE,
      rb: thighR * 0.66 + SKIN_CLEARANCE,
      zScale: 1,
    })
    // Upper calf (knee -> gastrocnemius belly)
    primitives.push({
      a: leg.knee,
      b: calfBelly,
      ra: thighR * 0.70 + SKIN_CLEARANCE,
      rb: thighR * (calfPeakScale + 0.05) + SKIN_CLEARANCE,
      zScale: 1,
    })
    // Lower calf / shin (gastrocnemius belly -> ankle)
    primitives.push({
      a: calfBelly,
      b: leg.ankle,
      ra: thighR * (calfPeakScale + 0.05) + SKIN_CLEARANCE,
      rb: thighR * 0.48 + SKIN_CLEARANCE,
      zScale: 1,
    })
    // Foot (heel -> toe)
    primitives.push({
      a: leg.heel,
      b: leg.toe,
      ra: leg.footW * 0.46 + SKIN_CLEARANCE,
      rb: leg.footW * 0.44 + SKIN_CLEARANCE,
      zScale: 1,
    })
  }

  return primitives
}

export function deriveCollisionRigFromLimbs(dims, limbs) {
  return deriveCollisionRig(dims, 'walk', extractPoseJointsFromLimbs(dims, limbs))
}

/**
 * Projects a CPU 3D point `[x, y, z]` outside every primitive of `collisionRig`
 * (used to guarantee initial rest & pinned particles never start inside the body).
 */
export function projectPointOutsideCapsules(p, collisionRig) {
  let px = p[0], py = p[1], pz = p[2]
  for (let i = 0; i < collisionRig.length; i++) {
    const cap = collisionRig[i]
    const abx = cap.b[0] - cap.a[0]
    const aby = cap.b[1] - cap.a[1]
    const abz = cap.b[2] - cap.a[2]
    const abLen2 = Math.max(abx * abx + aby * aby + abz * abz, 1e-8)
    const t = clamp(((px - cap.a[0]) * abx + (py - cap.a[1]) * aby + (pz - cap.a[2]) * abz) / abLen2, 0, 1)
    const cx = cap.a[0] + abx * t
    const cy = cap.a[1] + aby * t
    const cz = cap.a[2] + abz * t
    const ox = px - cx, oy = py - cy, oz = pz - cz
    const yWeight = (i === 0 && oy < 0) ? 5.5 : 1.0
    const dist = Math.hypot(ox, oy * yWeight, oz / cap.zScale)
    const r = cap.ra + (cap.rb - cap.ra) * t
    if (dist < r) {
      if (dist > 1e-6) {
        const scale = r / dist
        px = cx + ox * scale
        if (!(i === 0 && oy < 0)) py = cy + oy * scale
        pz = cz + oz * scale
      } else {
        pz = cz + r * cap.zScale
      }
    }
  }
  return [px, py, pz]
}

const SHOULDER_PIN_RADIUS = 0.05

export function deriveShoulderPinSegments(dims) {
  const { shoulderHalf, shoulderY, span } = dims
  return [-1, 1].map((side) => ([
    [side * shoulderHalf * 0.15, shoulderY + span * 0.02, 0],
    [side * shoulderHalf * 0.90, shoulderY - span * 0.035, 0],
  ]))
}

function distToSegment(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]
  const abLen2 = abx * abx + aby * aby + abz * abz
  const t = abLen2 > 1e-10
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / abLen2))
    : 0
  const cx = a[0] + abx * t, cy = a[1] + aby * t, cz = a[2] + abz * t
  return Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz)
}

export function deriveShoulderPinMask(simRestPositions, simParticleCount, dims) {
  const segments = deriveShoulderPinSegments(dims)
  const mask = new Uint8Array(simParticleCount)
  for (let i = 0; i < simParticleCount; i++) {
    const p = [simRestPositions[i * 3], simRestPositions[i * 3 + 1], simRestPositions[i * 3 + 2] * 0.42]
    for (const [a, b] of segments) {
      if (distToSegment(p, a, b) < SHOULDER_PIN_RADIUS) { mask[i] = 1; break }
    }
  }
  return mask
}

const WAISTBAND_HEIGHT_TOLERANCE = 0.045
const WAISTBAND_RADIAL_TOLERANCE = 0.055

export function deriveWaistbandPinRing(dims) {
  const { hipY, span, waistR, female } = dims
  return { y: hipY + span * 0.44, r: waistR, zScale: female ? 0.72 : 0.78 }
}

export function deriveWaistbandPinMask(simRestPositions, simParticleCount, dims) {
  const { y: waistY, r: waistR, zScale } = deriveWaistbandPinRing(dims)
  const mask = new Uint8Array(simParticleCount)
  for (let i = 0; i < simParticleCount; i++) {
    const px = simRestPositions[i * 3], py = simRestPositions[i * 3 + 1], pz = simRestPositions[i * 3 + 2]
    if (Math.abs(py - waistY) > WAISTBAND_HEIGHT_TOLERANCE) continue
    const pr = Math.hypot(px, pz / zScale)
    if (Math.abs(pr - waistR) < WAISTBAND_RADIAL_TOLERANCE) mask[i] = 1
  }
  return mask
}

const WAIST_OR_HEM_ATTACH_ROLES = new Set([
  'attachWaist', 'attachWaistBack', 'attachHem',
  'goreFront', 'goreBack', 'goreSideLeft', 'goreSideRight',
])

const LOWER_BODY_WAIST_PIN_ROLES = new Set([
  'hipPanelFront', 'hipPanelBack',
  'legFront', 'legBack',
  'goreFront', 'goreBack', 'goreSideLeft', 'goreSideRight',
  'attachWaist', 'attachWaistBack',
])

export function deriveGarmentPinMask(cloth, triangulatedPieces = [], dims) {
  const { simParticleCount, simRestPositions, renderTriangles, renderVertexToSimParticle, pieceOffset } = cloth
  const shoulderMask = deriveShoulderPinMask(simRestPositions, simParticleCount, dims)
  const waistbandMask = deriveWaistbandPinMask(simRestPositions, simParticleCount, dims)
  const mask = new Uint8Array(simParticleCount)
  for (let i = 0; i < simParticleCount; i++) {
    if (shoulderMask[i]) mask[i] = 1
  }

  // Only apply waistband ring pins to lower-body/waist roles (skirts, trousers,
  // gores, waistbands) so full-length dresses, shirts, and sleeves hang freely
  // from the shoulders without being pinched at the waist or inner elbows.
  if (Array.isArray(triangulatedPieces) && triangulatedPieces.length > 0 && pieceOffset && renderVertexToSimParticle) {
    for (const tp of triangulatedPieces) {
      if (!LOWER_BODY_WAIST_PIN_ROLES.has(tp.role)) continue
      const offset = pieceOffset[tp.pieceId]
      const pts = tp.positions2D
      if (offset == null || !pts) continue
      for (let localIdx = 0; localIdx < pts.length; localIdx++) {
        const sp = renderVertexToSimParticle[offset + localIdx]
        if (waistbandMask[sp]) mask[sp] = 1
      }
    }
  } else {
    for (let i = 0; i < simParticleCount; i++) {
      if (waistbandMask[i]) mask[i] = 1
    }
  }

  // Stage 2: Pin attachment bands for unsewn accessory/overlay roles so
  // collars, pockets, cuffs, waistbands, tiers, gores, and facings stay
  // stitched to their anatomical placement instead of falling or flapping.
  if (Array.isArray(triangulatedPieces) && pieceOffset && renderVertexToSimParticle) {
    for (const tp of triangulatedPieces) {
      const offset = pieceOffset[tp.pieceId]
      const pts = tp.positions2D
      if (offset == null || !pts || pts.length === 0) continue
      const { role } = tp
      if (
        role !== 'attachNeck' &&
        role !== 'attachBody' &&
        role !== 'attachBodyBack' &&
        !WAIST_OR_HEM_ATTACH_ROLES.has(role)
      ) continue

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const [x, y] of pts) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      const widthCm = Math.max(1e-6, maxX - minX)
      const heightCm = Math.max(1e-6, maxY - minY)

      for (let localIdx = 0; localIdx < pts.length; localIdx++) {
        const [xCm, yCm] = pts[localIdx]
        const sp = renderVertexToSimParticle[offset + localIdx]
        if (role === 'attachNeck') {
          const topBand = yCm <= minY + Math.max(2.0, heightCm * 0.25)
          const isPlacketOrFacing = widthCm <= 16 || heightCm / widthCm >= 2.2
          const compactStitch = (heightCm <= 18 || isPlacketOrFacing) && (
            yCm >= maxY - Math.max(1.6, heightCm * 0.16) ||
            xCm <= minX + Math.max(1.6, widthCm * 0.18) ||
            xCm >= maxX - Math.max(1.6, widthCm * 0.18)
          )
          if (topBand || compactStitch) mask[sp] = 1
        } else if (role === 'attachBody' || role === 'attachBodyBack') {
          const topBand = yCm <= minY + Math.max(2.0, heightCm * 0.22)
          const compactStitch = heightCm <= 28 && (
            yCm >= maxY - Math.max(1.8, heightCm * 0.20) ||
            xCm <= minX + Math.max(1.8, widthCm * 0.14) ||
            xCm >= maxX - Math.max(1.8, widthCm * 0.14)
          )
          if (topBand || compactStitch) mask[sp] = 1
        } else if (WAIST_OR_HEM_ATTACH_ROLES.has(role)) {
          const topBand = yCm <= minY + Math.max(2.0, heightCm * 0.16)
          const narrowBand = heightCm <= 12 && yCm >= maxY - Math.max(1.6, heightCm * 0.22)
          if (topBand || narrowBand) mask[sp] = 1
        }
      }
    }
  }

  // Stage 3: Connected-component safeguard — ensure every disconnected mesh
  // component has broad horizontal support along its top edge rather than
  // 0 pins (free-falling to the floor) or 1 corner pin (dangling like a ribbon).
  if (renderTriangles && renderVertexToSimParticle && simParticleCount > 0) {
    const parent = new Int32Array(simParticleCount)
    for (let i = 0; i < simParticleCount; i++) parent[i] = i
    const find = (x) => {
      let r = x
      while (parent[r] !== r) r = parent[r]
      let c = x
      while (c !== r) { const nxt = parent[c]; parent[c] = r; c = nxt }
      return r
    }
    const union = (a, b) => {
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent[ra] = rb
    }
    for (let t = 0; t < renderTriangles.length; t += 3) {
      const a = renderVertexToSimParticle[renderTriangles[t]]
      const b = renderVertexToSimParticle[renderTriangles[t + 1]]
      const c = renderVertexToSimParticle[renderTriangles[t + 2]]
      union(a, b)
      union(b, c)
    }

    const components = new Map()
    for (let i = 0; i < simParticleCount; i++) {
      const r = find(i)
      let list = components.get(r)
      if (!list) { list = []; components.set(r, list) }
      list.push(i)
    }

    for (const comp of components.values()) {
      let minY = Infinity, maxY = -Infinity
      for (const sp of comp) {
        const py = simRestPositions[sp * 3 + 1]
        if (py < minY) minY = py
        if (py > maxY) maxY = py
      }
      const spanY = Math.max(0, maxY - minY)
      const topProbeY = maxY - Math.max(0.03, spanY * 0.18)
      let topMinX = Infinity, topMaxX = -Infinity
      let pinnedCount = 0, pinnedMinX = Infinity, pinnedMaxX = -Infinity
      for (const sp of comp) {
        const px = simRestPositions[sp * 3]
        const py = simRestPositions[sp * 3 + 1]
        if (py >= topProbeY) {
          if (px < topMinX) topMinX = px
          if (px > topMaxX) topMaxX = px
        }
        if (mask[sp]) {
          pinnedCount++
          if (px < pinnedMinX) pinnedMinX = px
          if (px > pinnedMaxX) pinnedMaxX = px
        }
      }
      const topSpanX = Math.max(0, topMaxX - topMinX)
      const pinnedSpanX = pinnedCount > 1 ? (pinnedMaxX - pinnedMinX) : 0
      if (pinnedCount < 3 || (topSpanX > 0.04 && pinnedSpanX < topSpanX * 0.35)) {
        const pinBandY = maxY - Math.max(0.025, spanY * 0.14)
        for (const sp of comp) {
          if (simRestPositions[sp * 3 + 1] >= pinBandY) mask[sp] = 1
        }
      }
    }
  }

  return mask
}

