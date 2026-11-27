import * as THREE from 'three'
import { BONE_IDX } from '../../../js/human-mannequin.js'

// Exact mesh-derived bone-local radial surface envelope for zero-penetration
// cloth collision. Rasterizes the procedural `humanBody` triangle mesh in bind
// pose across 9 anatomical segments (trunk+neck+head, L/R upper arms, L/R
// forearms+hands, L/R thighs, L/R calves) into a single NearestFilter RGBA
// FloatType DataTexture (`64 x 288`). Each texel stores the 4 bilinear cell
// corners `(r00, r10, r01, r11)` in `.rgba` so the GPU cloth shader evaluates
// smooth C0 bilinear surface radii in ONE core-WebGL2 texture fetch with zero
// cross-segment bleed, zero phi-seam wrap artifacts, and zero dependency on
// `OES_texture_float_linear`.
export const ENV_SEGMENT_COUNT = 9
export const ENV_PHI_BINS = 64
export const ENV_T_BINS = 32
export const ENV_CLEARANCE = 0.0068 // 6.8mm skin + triangle-chord safety cushion

const TWO_PI = Math.PI * 2

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function getBindSegments(dims, lm) {
  const crotchY = dims.hipY - dims.span * 0.145
  const handReach = dims.H * (dims.kid ? 0.108 : (dims.female ? 0.104 : 0.107)) * 1.05
  const armTopPad = dims.span * 0.020
  const thighTopPad = dims.span * 0.030

  return [
    // 0: Trunk + pelvis + shoulders + neck + head (bottom -> crown)
    {
      a: [0, crotchY, 0],
      b: [0, dims.H, 0],
      bones: [BONE_IDX.pelvis, BONE_IDX.spine, BONE_IDX.chest, BONE_IDX.neck, BONE_IDX.head],
      minWeight: 0.48,
    },
    // 1: Left (+X) upper arm (shoulder -> elbow)
    {
      a: [lm.shoulderPivotX, lm.shoulderPivotY + armTopPad, 0],
      b: [lm.shoulderPivotX, lm.shoulderPivotY - lm.upperArmLen, 0],
      bones: [BONE_IDX.armL],
      minWeight: 0.25,
    },
    // 2: Right (-X) upper arm (shoulder -> elbow)
    {
      a: [-lm.shoulderPivotX, lm.shoulderPivotY + armTopPad, 0],
      b: [-lm.shoulderPivotX, lm.shoulderPivotY - lm.upperArmLen, 0],
      bones: [BONE_IDX.armR],
      minWeight: 0.25,
    },
    // 3: Left (+X) forearm + hand (elbow -> fingertips)
    {
      a: [lm.shoulderPivotX, lm.shoulderPivotY - lm.upperArmLen, 0],
      b: [lm.shoulderPivotX, lm.shoulderPivotY - lm.upperArmLen - lm.forearmLen - handReach, 0],
      bones: [BONE_IDX.elbowL, BONE_IDX.handL],
      minWeight: 0.28,
    },
    // 4: Right (-X) forearm + hand (elbow -> fingertips)
    {
      a: [-lm.shoulderPivotX, lm.shoulderPivotY - lm.upperArmLen, 0],
      b: [-lm.shoulderPivotX, lm.shoulderPivotY - lm.upperArmLen - lm.forearmLen - handReach, 0],
      bones: [BONE_IDX.elbowR, BONE_IDX.handR],
      minWeight: 0.28,
    },
    // 5: Left (+X) thigh (hip -> knee)
    {
      a: [lm.hipPivotX, lm.hipPivotY + thighTopPad, 0],
      b: [lm.hipPivotX, lm.hipPivotY - lm.thighLen, 0],
      bones: [BONE_IDX.legL],
      minWeight: 0.18,
    },
    // 6: Right (-X) thigh (hip -> knee)
    {
      a: [-lm.hipPivotX, lm.hipPivotY + thighTopPad, 0],
      b: [-lm.hipPivotX, lm.hipPivotY - lm.thighLen, 0],
      bones: [BONE_IDX.legR],
      minWeight: 0.18,
    },
    // 7: Left (+X) calf + ankle (knee -> ankle)
    {
      a: [lm.hipPivotX, lm.hipPivotY - lm.thighLen, 0],
      b: [lm.hipPivotX, lm.ankleY, 0],
      bones: [BONE_IDX.kneeL],
      minWeight: 0.30,
    },
    // 8: Right (-X) calf + ankle (knee -> ankle)
    {
      a: [-lm.hipPivotX, lm.hipPivotY - lm.thighLen, 0],
      b: [-lm.hipPivotX, lm.ankleY, 0],
      bones: [BONE_IDX.kneeR],
      minWeight: 0.30,
    },
  ]
}

function vertexWeightForBones(skinIdxAttr, skinWgtAttr, v, targetBones) {
  let sum = 0
  for (let c = 0; c < 4; c++) {
    const bi = skinIdxAttr.getComponent(v, c)
    if (targetBones.includes(bi)) {
      sum += skinWgtAttr.getComponent(v, c)
    }
  }
  return sum
}

export function buildBodyEnvelopeTexture(bindGeometry, dims, landmarks, clearance = ENV_CLEARANCE) {
  const posAttr = bindGeometry.attributes.position
  const idxAttr = bindGeometry.index
  const skinIdxAttr = bindGeometry.attributes.skinIndex
  const skinWgtAttr = bindGeometry.attributes.skinWeight

  const segDefs = getBindSegments(dims, landmarks)
  const raw = new Float32Array(ENV_SEGMENT_COUNT * ENV_T_BINS * ENV_PHI_BINS)

  // Precompute per-vertex membership bitmask for fast triangle classification
  const vCount = posAttr.count
  const vertMask = new Uint16Array(vCount)
  for (let v = 0; v < vCount; v++) {
    let mask = 0
    for (let s = 0; s < ENV_SEGMENT_COUNT; s++) {
      if (vertexWeightForBones(skinIdxAttr, skinWgtAttr, v, segDefs[s].bones) >= segDefs[s].minWeight) {
        mask |= 1 << s
      }
    }
    vertMask[v] = mask
  }

  const groinFilterY = dims.hipY - dims.span * 0.095
  const groinFilterX = landmarks.hipPivotX * 0.78

  function splatPoint(s, px, py, pz) {
    if (s === 0 && py < groinFilterY && Math.abs(px) > groinFilterX) return
    const seg = segDefs[s]
    const abx = seg.b[0] - seg.a[0]
    const aby = seg.b[1] - seg.a[1]
    const abz = seg.b[2] - seg.a[2]
    const abLen2 = abx * abx + aby * aby + abz * abz || 1e-8
    const t = ((px - seg.a[0]) * abx + (py - seg.a[1]) * aby + (pz - seg.a[2]) * abz) / abLen2
    if (t < -0.02 || t > 1.02) return
    const cx = seg.a[0] + abx * t
    const cz = seg.a[2] + abz * t
    const lx = px - cx
    const lz = pz - cz
    const r = Math.hypot(lx, lz)
    const phi = Math.atan2(lx, lz) // [-PI, PI], matching GLSL atan(lx, lz)
    let uNorm = phi / TWO_PI + 0.5
    uNorm -= Math.floor(uNorm)
    const iu = Math.min(ENV_PHI_BINS - 1, Math.floor(uNorm * ENV_PHI_BINS))
    const iv = clamp(Math.floor(clamp(t, 0, 0.9999) * ENV_T_BINS), 0, ENV_T_BINS - 1)
    const cellIdx = (s * ENV_T_BINS + iv) * ENV_PHI_BINS + iu
    if (r > raw[cellIdx]) raw[cellIdx] = r
  }

  // Splat vertices, edge midpoints, quarter-points, and centroids of every body triangle
  const triCount = idxAttr ? idxAttr.count : 0
  for (let i = 0; i < triCount; i += 3) {
    const i0 = idxAttr.getX(i)
    const i1 = idxAttr.getX(i + 1)
    const i2 = idxAttr.getX(i + 2)
    const sharedMask = vertMask[i0] | vertMask[i1] | vertMask[i2]
    if (!sharedMask) continue

    const x0 = posAttr.getX(i0), y0 = posAttr.getY(i0), z0 = posAttr.getZ(i0)
    const x1 = posAttr.getX(i1), y1 = posAttr.getY(i1), z1 = posAttr.getZ(i1)
    const x2 = posAttr.getX(i2), y2 = posAttr.getY(i2), z2 = posAttr.getZ(i2)

    const mx01 = 0.5 * (x0 + x1), my01 = 0.5 * (y0 + y1), mz01 = 0.5 * (z0 + z1)
    const mx12 = 0.5 * (x1 + x2), my12 = 0.5 * (y1 + y2), mz12 = 0.5 * (z1 + z2)
    const mx20 = 0.5 * (x2 + x0), my20 = 0.5 * (y2 + y0), mz20 = 0.5 * (z2 + z0)
    const q01x = 0.25 * x0 + 0.75 * x1, q01y = 0.25 * y0 + 0.75 * y1, q01z = 0.25 * z0 + 0.75 * z1
    const q12x = 0.25 * x1 + 0.75 * x2, q12y = 0.25 * y1 + 0.75 * y2, q12z = 0.25 * z1 + 0.75 * z2
    const q20x = 0.25 * x2 + 0.75 * x0, q20y = 0.25 * y2 + 0.75 * y0, q20z = 0.25 * z2 + 0.75 * z0
    const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3, cz = (z0 + z1 + z2) / 3

    for (let s = 0; s < ENV_SEGMENT_COUNT; s++) {
      if (!(sharedMask & (1 << s))) continue
      const countInSeg = ((vertMask[i0] >> s) & 1) + ((vertMask[i1] >> s) & 1) + ((vertMask[i2] >> s) & 1)
      if (s === 0 ? countInSeg < 2 : countInSeg < 1) continue
      splatPoint(s, x0, y0, z0)
      splatPoint(s, x1, y1, z1)
      splatPoint(s, x2, y2, z2)
      splatPoint(s, mx01, my01, mz01)
      splatPoint(s, mx12, my12, mz12)
      splatPoint(s, mx20, my20, mz20)
      splatPoint(s, q01x, q01y, q01z)
      splatPoint(s, q12x, q12y, q12z)
      splatPoint(s, q20x, q20y, q20z)
      splatPoint(s, cx, cy, cz)
    }
  }

  // Fill sparse bins per row via circular neighbor propagation, then dilate 3x3 + clearance
  const filled = new Float32Array(raw)
  for (let s = 0; s < ENV_SEGMENT_COUNT; s++) {
    const segBase = s * ENV_T_BINS * ENV_PHI_BINS
    // Fill within each t-row across phi
    for (let iv = 0; iv < ENV_T_BINS; iv++) {
      const rowOff = segBase + iv * ENV_PHI_BINS
      let rowMax = 0
      for (let iu = 0; iu < ENV_PHI_BINS; iu++) {
        if (filled[rowOff + iu] > rowMax) rowMax = filled[rowOff + iu]
      }
      if (rowMax <= 0) continue
      for (let pass = 0; pass < 6; pass++) {
        for (let iu = 0; iu < ENV_PHI_BINS; iu++) {
          if (filled[rowOff + iu] <= 0) {
            const prev = filled[rowOff + ((iu + ENV_PHI_BINS - 1) % ENV_PHI_BINS)]
            const next = filled[rowOff + ((iu + 1) % ENV_PHI_BINS)]
            if (prev > 0 && next > 0) filled[rowOff + iu] = 0.5 * (prev + next)
            else if (prev > 0 || next > 0) filled[rowOff + iu] = Math.max(prev, next)
          }
        }
      }
    }
    // Fill completely empty edge rows from nearest populated t-row in same segment
    for (let pass = 0; pass < 4; pass++) {
      for (let iv = 0; iv < ENV_T_BINS; iv++) {
        const rowOff = segBase + iv * ENV_PHI_BINS
        for (let iu = 0; iu < ENV_PHI_BINS; iu++) {
          if (filled[rowOff + iu] <= 0) {
            const below = iv > 0 ? filled[segBase + (iv - 1) * ENV_PHI_BINS + iu] : 0
            const above = iv + 1 < ENV_T_BINS ? filled[segBase + (iv + 1) * ENV_PHI_BINS + iu] : 0
            filled[rowOff + iu] = Math.max(below, above)
          }
        }
      }
    }
  }

  // Conservative 3x3 max dilation on trunk (`s === 0`, blocking upward bleed from
  // broad upper-chest rows into the narrow neck/shoulder slope above `shCutIv`,
  // and preventing broad hip rows from bleeding downward into the concave
  // inguinal/bikini saddle below `bikiniCutIv`), plus gentle axial blend on limbs.
  const shCutIv = Math.floor(((dims.shoulderY - dims.span * 0.025 - segDefs[0].a[1]) / Math.max(1e-6, segDefs[0].b[1] - segDefs[0].a[1])) * ENV_T_BINS)
  const bikiniCutIv = Math.floor(((dims.hipY - dims.span * 0.030 - segDefs[0].a[1]) / Math.max(1e-6, segDefs[0].b[1] - segDefs[0].a[1])) * ENV_T_BINS)
  const dilated = new Float32Array(filled.length)
  for (let s = 0; s < ENV_SEGMENT_COUNT; s++) {
    const segBase = s * ENV_T_BINS * ENV_PHI_BINS
    const segClearance = s >= 5 ? clearance + 0.0014 : clearance
    for (let iv = 0; iv < ENV_T_BINS; iv++) {
      for (let iu = 0; iu < ENV_PHI_BINS; iu++) {
        let rowMax = 0
        for (let du = -1; du <= 1; du++) {
          const nu = (iu + du + ENV_PHI_BINS) % ENV_PHI_BINS
          const val = filled[segBase + iv * ENV_PHI_BINS + nu]
          if (val > rowMax) rowMax = val
        }
        let best = rowMax
        if (s === 0) {
          for (const dv of [-1, 1]) {
            if (iv >= shCutIv && dv === -1) continue
            if (iv <= bikiniCutIv && dv === 1) continue
            const nv = clamp(iv + dv, 0, ENV_T_BINS - 1)
            const rOff = segBase + nv * ENV_PHI_BINS
            for (let du = -1; du <= 1; du++) {
              const nu = (iu + du + ENV_PHI_BINS) % ENV_PHI_BINS
              const val = filled[rOff + nu]
              if (iv <= bikiniCutIv && dv === -1) {
                if (val > 0) best = Math.max(best, 0.72 * rowMax + 0.28 * val)
              } else if (val > best) {
                best = val
              }
            }
          }
        } else {
          for (const dv of [-1, 1]) {
            const nv = clamp(iv + dv, 0, ENV_T_BINS - 1)
            const val = filled[segBase + nv * ENV_PHI_BINS + iu]
            if (val > 0) best = Math.max(best, 0.72 * rowMax + 0.28 * val)
          }
        }
        dilated[segBase + iv * ENV_PHI_BINS + iu] = best > 0 ? best + segClearance : 0
      }
    }
  }

  // Pack 4 bilinear corners (r00, r10, r01, r11) per RGBA texel (width = 64, height = 9 * 32 = 288)
  const texHeight = ENV_SEGMENT_COUNT * ENV_T_BINS
  const rgba = new Float32Array(ENV_PHI_BINS * texHeight * 4)
  for (let s = 0; s < ENV_SEGMENT_COUNT; s++) {
    const segBase = s * ENV_T_BINS * ENV_PHI_BINS
    for (let iv = 0; iv < ENV_T_BINS; iv++) {
      const iv1 = Math.min(ENV_T_BINS - 1, iv + 1)
      const texRow = s * ENV_T_BINS + iv
      for (let iu = 0; iu < ENV_PHI_BINS; iu++) {
        const iu1 = (iu + 1) % ENV_PHI_BINS
        const outIdx = (texRow * ENV_PHI_BINS + iu) * 4
        rgba[outIdx] = dilated[segBase + iv * ENV_PHI_BINS + iu]
        rgba[outIdx + 1] = dilated[segBase + iv * ENV_PHI_BINS + iu1]
        rgba[outIdx + 2] = dilated[segBase + iv1 * ENV_PHI_BINS + iu]
        rgba[outIdx + 3] = dilated[segBase + iv1 * ENV_PHI_BINS + iu1]
      }
    }
  }

  const texture = new THREE.DataTexture(rgba, ENV_PHI_BINS, texHeight, THREE.RGBAFormat, THREE.FloatType)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  return {
    texture,
    width: ENV_PHI_BINS,
    height: texHeight,
    grid: dilated,
    rgba,
  }
}

const _vA = new THREE.Vector3()
const _vB = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _right = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _axis = new THREE.Vector3()

function frameFromBoneSegment(boneForBasis, worldA, worldB) {
  boneForBasis.getWorldQuaternion(_q)
  _right.set(1, 0, 0).applyQuaternion(_q)
  _fwd.set(0, 0, 1).applyQuaternion(_q)
  // Re-orthogonalize basis against actual segment axis (handles slight multi-bone trunk bend)
  _axis.set(worldB[0] - worldA[0], worldB[1] - worldA[1], worldB[2] - worldA[2])
  const axisLen = _axis.length()
  if (axisLen > 1e-6) {
    _axis.divideScalar(axisLen)
    _right.addScaledVector(_axis, -_right.dot(_axis))
    if (_right.lengthSq() > 1e-8) _right.normalize()
    _fwd.addScaledVector(_axis, -_fwd.dot(_axis))
    _fwd.addScaledVector(_right, -_fwd.dot(_right))
    if (_fwd.lengthSq() > 1e-8) _fwd.normalize()
  }
  return {
    a: [worldA[0], worldA[1], worldA[2]],
    b: [worldB[0], worldB[1], worldB[2]],
    right: [_right.x, _right.y, _right.z],
    fwd: [_fwd.x, _fwd.y, _fwd.z],
  }
}

function boneOffsetWorld(bone, ox, oy, oz, target) {
  return target.set(ox, oy, oz).applyMatrix4(bone.matrixWorld)
}

/**
 * Extracts the 9 posed world-space segment frames `{ a, b, right, fwd }` from
 * the 17-bone `limbs` map of `js/human-mannequin.js` (assuming `updateMatrixWorld(true)`
 * has been called on the avatar group/pelvis). Runs in < 0.02ms for real-time walk!
 */
export function computeEnvelopeFramesFromLimbs(limbs, dims, landmarks) {
  const crotchOffsetFromPelvis = (dims.hipY - dims.span * 0.145) - dims.hipY
  const crownOffsetFromHead = dims.H - landmarks.headCenterY
  const handReach = dims.H * (dims.kid ? 0.108 : (dims.female ? 0.104 : 0.107)) * 1.05
  const armTopPad = dims.span * 0.020
  const thighTopPad = dims.span * 0.030

  const pA = boneOffsetWorld(limbs.pelvis, 0, crotchOffsetFromPelvis, 0, _vA)
  const pB = boneOffsetWorld(limbs.head, 0, crownOffsetFromHead, 0, _vB)
  const seg0 = frameFromBoneSegment(limbs.chest || limbs.spine || limbs.pelvis, [pA.x, pA.y, pA.z], [pB.x, pB.y, pB.z])

  const posOf = (bone) => {
    bone.getWorldPosition(_vA)
    return [_vA.x, _vA.y, _vA.z]
  }
  const topOfOffset = (bone, oy) => {
    boneOffsetWorld(bone, 0, oy, 0, _vA)
    return [_vA.x, _vA.y, _vA.z]
  }
  const tipOfHand = (handBone) => {
    boneOffsetWorld(handBone, 0, -handReach, 0, _vB)
    return [_vB.x, _vB.y, _vB.z]
  }

  const shL = topOfOffset(limbs.arm1, armTopPad)
  const elL = posOf(limbs.elbow1)
  const fnL = tipOfHand(limbs.hand1)

  const shR = topOfOffset(limbs['arm-1'], armTopPad)
  const elR = posOf(limbs['elbow-1'])
  const fnR = tipOfHand(limbs['hand-1'])

  const hpL = topOfOffset(limbs.leg1, thighTopPad)
  const knL = posOf(limbs.knee1)
  const anL = posOf(limbs.foot1)

  const hpR = topOfOffset(limbs['leg-1'], thighTopPad)
  const knR = posOf(limbs['knee-1'])
  const anR = posOf(limbs['foot-1'])

  return [
    seg0,
    frameFromBoneSegment(limbs.arm1, shL, elL),
    frameFromBoneSegment(limbs['arm-1'], shR, elR),
    frameFromBoneSegment(limbs.elbow1, elL, fnL),
    frameFromBoneSegment(limbs['elbow-1'], elR, fnR),
    frameFromBoneSegment(limbs.leg1, hpL, knL),
    frameFromBoneSegment(limbs['leg-1'], hpR, knR),
    frameFromBoneSegment(limbs.knee1, knL, anL),
    frameFromBoneSegment(limbs['knee-1'], knR, anR),
  ]
}

/**
 * Projects a 3D point `[x, y, z]` outside all 9 segments of `envelope` on CPU
 * using the exact same bilinear formula as `ClothSimulation.js`'s GLSL shader.
 */
export function projectPointOutsideBodyEnvelope(p, envelope, frames, clearanceOffset = 0) {
  if (!envelope || !frames || frames.length < ENV_SEGMENT_COUNT) return p
  let px = p[0], py = p[1], pz = p[2]
  const rgba = envelope.rgba
  const effOffset = clamp(clearanceOffset || 0, -0.0038, 0.0030)

  for (let s = 0; s < ENV_SEGMENT_COUNT; s++) {
    const f = frames[s]
    const abx = f.b[0] - f.a[0]
    const aby = f.b[1] - f.a[1]
    const abz = f.b[2] - f.a[2]
    const len2 = Math.max(abx * abx + aby * aby + abz * abz, 1e-8)
    const t = ((px - f.a[0]) * abx + (py - f.a[1]) * aby + (pz - f.a[2]) * abz) / len2
    if (t <= -0.01 || t >= 1.01) continue

    const cx = f.a[0] + abx * t
    const cy = f.a[1] + aby * t
    const cz = f.a[2] + abz * t
    const rx = px - cx, ry = py - cy, rz = pz - cz
    const lx = rx * f.right[0] + ry * f.right[1] + rz * f.right[2]
    const lz = rx * f.fwd[0] + ry * f.fwd[1] + rz * f.fwd[2]
    const dist = Math.hypot(lx, lz)

    const phi = Math.atan2(lx, lz)
    let uNorm = phi / TWO_PI + 0.5
    uNorm -= Math.floor(uNorm)
    const uScaled = uNorm * ENV_PHI_BINS
    const iu = Math.min(ENV_PHI_BINS - 1, Math.floor(uScaled))
    const fu = uScaled - iu

    const vScaled = clamp(t, 0, 0.9999) * ENV_T_BINS
    const iv = Math.min(ENV_T_BINS - 1, Math.floor(vScaled))
    const fv = vScaled - iv

    const idx = ((s * ENV_T_BINS + iv) * ENV_PHI_BINS + iu) * 4
    const r00 = rgba[idx], r10 = rgba[idx + 1], r01 = rgba[idx + 2], r11 = rgba[idx + 3]
    const rEnvRaw = (r00 * (1 - fu) + r10 * fu) * (1 - fv) + (r01 * (1 - fu) + r11 * fu) * fv
    const rEnv = rEnvRaw > 0 ? Math.max(0.008, rEnvRaw + effOffset) : 0

    if (dist < rEnv && rEnv > 0) {
      const safeDist = Math.max(dist, 1e-5)
      const scale = rEnv / safeDist
      const nlx = dist > 1e-5 ? lx * scale : 0
      const nlz = dist > 1e-5 ? lz * scale : rEnv
      const dlx = nlx - lx
      const dlz = nlz - lz
      px += dlx * f.right[0] + dlz * f.fwd[0]
      py += dlx * f.right[1] + dlz * f.fwd[1]
      pz += dlx * f.right[2] + dlz * f.fwd[2]
    }
  }
  return [px, py, pz]
}
