import { computeMannequinPoseJoints } from '../body/collisionRig.js'

// Initial 3D placement heuristics — one per piece role, driven by the same
// computeBodyDims() + pose kinematics the sculpted human avatar uses so every
// piece starts cleanly OUTSIDE the posed body (torso, breasts/pecs, hips,
// bilateral thighs/calves, and posed upper arms/elbows/forearms) at frame 0.
const cm = (v) => v * 0.01
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

function smoothstep(edge0, edge1, x) {
  if (edge1 === edge0) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

// Bilateral outer leg-pair silhouette radius BELOW the hip. Both legs sit side
// by side at X = ±hipPivotX (~0.45*hipR) with radius `thighR`, reaching
// |X| = hipPivotX + thighR (~0.98*hipR) down the thighs and ~0.83*hipR at the
// knees/calves. Keeping `radiusBelowHip` outside that bilateral outer envelope
// prevents dresses, tunics, robes, and skirts from spawning inside the thighs.
export function radiusBelowHip(dims, worldY) {
  const { hipY, hipR, thighR, legLen, female } = dims
  const hipPivotX = hipR * (female ? 0.45 : 0.47)
  const outerThighR = Math.max(hipR * 0.96, hipPivotX + thighR * 1.02)
  const outerKneeR = Math.max(hipR * 0.82, hipPivotX + thighR * 0.72)
  const outerAnkleR = Math.max(thighR * 1.18, hipPivotX + thighR * 0.50)

  const yThigh = hipY - legLen * 0.28
  const yKnee = hipY - legLen * 0.56
  const yAnkle = hipY - legLen * 0.95

  if (worldY >= hipY) return hipR * 1.02
  if (worldY >= yThigh) return lerp(hipR * 1.02, outerThighR, (hipY - worldY) / Math.max(1e-4, hipY - yThigh))
  if (worldY >= yKnee) return lerp(outerThighR, outerKneeR, (yThigh - worldY) / Math.max(1e-4, yThigh - yKnee))
  if (worldY >= yAnkle) return lerp(outerKneeR, outerAnkleR, (yKnee - worldY) / Math.max(1e-4, yKnee - yAnkle))
  return outerAnkleR
}

export function radiusAtHeight(dims, worldY) {
  const { hipY, shoulderY, span, chestR, waistR, hipR, female, kid } = dims
  const yWaist = hipY + span * 0.44
  const yChest = hipY + span * 0.76
  const yShoulder = shoulderY - span * 0.03
  const hipEff = hipR * 1.02
  const chestEff = (!female && !kid) ? chestR * 1.06 : chestR * 1.02

  if (worldY <= hipY) return radiusBelowHip(dims, worldY)
  if (worldY <= yWaist) return lerp(hipEff, waistR, (worldY - hipY) / (yWaist - hipY))
  if (worldY <= yChest) return lerp(waistR, chestEff, (worldY - yWaist) / (yChest - yWaist))
  if (worldY <= yShoulder) return lerp(chestEff, chestEff * 0.96, (worldY - yChest) / (yShoulder - yChest))
  return chestEff * 0.92
}

// Curves lower skirt/dress hems forward over the lap & knees when `pose === 'seated'`
// so full-length dresses, skirts, thobes, and abayas start above the horizontal thighs
// instead of slicing vertically through them.
function applySeatedSkirtDrape(x, worldY, z, dims, zSign, pose) {
  if (pose !== 'seated' || worldY >= dims.hipY + 0.02) return [x, worldY, z]
  const hipPivotY = dims.hipY - dims.span * 0.04
  const ankleY = Math.max(0.054, dims.H * 0.047)
  const thighLen = Math.max(0.25, hipPivotY - ankleY) * 0.53
  const drop = (dims.hipY + 0.02) - worldY

  if (zSign >= 0) {
    const lapReach = Math.min(thighLen + dims.thighR * 0.55, drop)
    const shinDrop = Math.max(0, drop - thighLen)
    const lapY = hipPivotY + dims.thighR * 1.18 - shinDrop
    return [x, Math.max(worldY, lapY), z + lapReach]
  }
  // Back panel curves under the glutes and forward along the underside/sides of the lap
  const underHipY = hipPivotY - dims.thighR * 1.16
  if (worldY >= underHipY) return [x, worldY, z]
  const underDrop = underHipY - worldY
  const fwd = Math.min(thighLen * 0.92, underDrop)
  const shinDrop = Math.max(0, underDrop - thighLen * 0.92)
  return [x, underHipY - shinDrop, z + fwd]
}

export function placeTorsoPanel(positions2D, dims, { zSign, easeFactor = 1.12, angleSpan = Math.PI * 0.85, pose = 'standing' } = {}) {
  const topWorldY = dims.shoulderY - dims.span * 0.03
  const zScale = dims.female ? 0.78 : 0.82
  let minX = Infinity, maxX = -Infinity
  for (const [x] of positions2D) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  const cx = (minX < -1e-2 && maxX > 1e-2 && Math.abs(minX + maxX) < (maxX - minX) * 0.25)
    ? 0
    : (Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) / 2 : 0)
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const r = radiusAtHeight(dims, worldY) * easeFactor
    const hipBlend = smoothstep(dims.hipY + dims.span * 0.12, dims.hipY - dims.span * 0.08, worldY)
    const effZScale = lerp(zScale, 0.94, hipBlend)
    const halfCirc = Math.PI * r * (1 + effZScale) * 0.5
    const theta = clamp((cm(xCm - cx) / Math.max(1e-4, halfCirc)) * angleSpan, -Math.PI * 0.92, Math.PI * 0.92)
    const x = r * Math.sin(theta)
    const z = zSign * r * effZScale * Math.cos(theta)
    return applySeatedSkirtDrape(x, worldY, z, dims, zSign, pose)
  })
}

export function placeHipPanel(positions2D, dims, { zSign, easeFactor = 1.16, angleSpan = Math.PI * 0.85, pose = 'standing' } = {}) {
  const topWorldY = dims.hipY + dims.span * 0.44
  const zScale = dims.female ? 0.75 : 0.80
  let minX = Infinity, maxX = -Infinity
  for (const [x] of positions2D) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  const cx = (minX < -1e-2 && maxX > 1e-2 && Math.abs(minX + maxX) < (maxX - minX) * 0.25)
    ? 0
    : (Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) / 2 : 0)
  const halfSpanCm = Math.max(0, (maxX - minX) / 2)
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const r = radiusAtHeight(dims, worldY) * easeFactor
    const hipBlend = smoothstep(dims.hipY + dims.span * 0.12, dims.hipY - dims.span * 0.08, worldY)
    const effZScale = lerp(zScale, 0.94, hipBlend)
    const halfCirc = Math.max(Math.PI * r * (1 + effZScale) * 0.5, cm(halfSpanCm) * 1.05)
    const theta = clamp((cm(xCm - cx) / Math.max(1e-4, halfCirc)) * angleSpan, -Math.PI * 0.92, Math.PI * 0.92)
    const x = r * Math.sin(theta)
    const z = zSign * r * effZScale * Math.cos(theta)
    return applySeatedSkirtDrape(x, worldY, z, dims, zSign, pose)
  })
}

// Anatomical trouser panel placement (`boys_trousers` & all `trouserPanel` designs):
// - Above the crotch (`worldY > crotchY`), the four bilateral front/back panels
//   form a closed elliptical cylinder OUTSIDE the waist, abdomen, hips, and glutes,
//   with `mirrorSelf` fly/seat seams meeting at `X = 0` and outseams at `X = ±rx`.
// - Below the crotch, each panel bifurcates smoothly into a coaxial half-cylinder
//   centered on its own posed leg (`hip -> knee -> ankle`) with radius always
//   clearing the thigh, patella, and gastrocnemius calf belly, and medial inseam
//   staying strictly on its own side of `X = 0` so left/right legs never overlap.
export function placeLegPanel(positions2D, dims, { side, zSign, easeFactor = 1.15, pose = 'standing' } = {}) {
  if (!positions2D.length) return []
  const waistWorldY = dims.hipY + dims.span * 0.44
  const zScale = dims.female ? 0.72 : 0.78

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const totalH = Math.max(1e-4, maxY - minY)

  // Detect the 2D crotch fork height (`crotchY2D`): in every trouser block
  // (`boys_trousers`, `legPanel`, `trouserPanel`), the crotch fork is the
  // vertex at the extreme medial X (`minX` for side=+1, `maxX` for side=-1)
  // located in the upper half of the panel.
  let crotchY2D = minY + totalH * 0.20
  let bestMedialX = side > 0 ? Infinity : -Infinity
  for (const [x, y] of positions2D) {
    const fracY = (y - minY) / totalH
    if (fracY < 0.06 || fracY > 0.55) continue
    if ((side > 0 && x < bestMedialX - 0.1) || (side < 0 && x > bestMedialX + 0.1)) {
      bestMedialX = x
      crotchY2D = y
    }
  }
  const riseSpan2D = Math.max(1, crotchY2D - minY)
  const legSpan2D = Math.max(1, maxY - crotchY2D)

  // Build a morphologically dilated and smoothed per-row [rowMinX, rowMaxX]
  // envelope across 14 coarse vertical bins so interior Delaunay vertices never
  // cause sawtooth oscillations along the outseam or inseam.
  const BINS = 14
  const rawMinX = new Float32Array(BINS).fill(Infinity)
  const rawMaxX = new Float32Array(BINS).fill(-Infinity)
  for (const [x, y] of positions2D) {
    const b = clamp(Math.floor(((y - minY) / totalH) * (BINS - 1)), 0, BINS - 1)
    if (x < rawMinX[b]) rawMinX[b] = x
    if (x > rawMaxX[b]) rawMaxX[b] = x
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let b = 0; b < BINS; b++) {
      if (!Number.isFinite(rawMinX[b])) {
        const prev = b > 0 && Number.isFinite(rawMinX[b - 1]) ? rawMinX[b - 1] : minX
        const next = b + 1 < BINS && Number.isFinite(rawMinX[b + 1]) ? rawMinX[b + 1] : minX
        rawMinX[b] = 0.5 * (prev + next)
      }
      if (!Number.isFinite(rawMaxX[b])) {
        const prev = b > 0 && Number.isFinite(rawMaxX[b - 1]) ? rawMaxX[b - 1] : maxX
        const next = b + 1 < BINS && Number.isFinite(rawMaxX[b + 1]) ? rawMaxX[b + 1] : maxX
        rawMaxX[b] = 0.5 * (prev + next)
      }
    }
  }
  // 3-bin morphological outer envelope (prevents interior-only rows from dipping inward)
  const binMinX = new Float32Array(BINS)
  const binMaxX = new Float32Array(BINS)
  for (let b = 0; b < BINS; b++) {
    const b0 = Math.max(0, b - 1), b1 = Math.min(BINS - 1, b + 1)
    binMinX[b] = Math.min(rawMinX[b0], rawMinX[b], rawMinX[b1])
    binMaxX[b] = Math.max(rawMaxX[b0], rawMaxX[b], rawMaxX[b1])
  }
  for (let pass = 0; pass < 2; pass++) {
    const nextMin = new Float32Array(binMinX)
    const nextMax = new Float32Array(binMaxX)
    for (let b = 1; b < BINS - 1; b++) {
      nextMin[b] = 0.25 * binMinX[b - 1] + 0.5 * binMinX[b] + 0.25 * binMinX[b + 1]
      nextMax[b] = 0.25 * binMaxX[b - 1] + 0.5 * binMaxX[b] + 0.25 * binMaxX[b + 1]
    }
    binMinX.set(nextMin)
    binMaxX.set(nextMax)
  }

  const joints = computeMannequinPoseJoints(dims, pose)
  const leg = joints.legs[side]

  return positions2D.map(([xCm, yCm]) => {
    const bFloat = clamp(((yCm - minY) / totalH) * (BINS - 1), 0, BINS - 1)
    const b0 = Math.floor(bFloat)
    const b1 = Math.min(BINS - 1, b0 + 1)
    const bf = bFloat - b0
    const rMinX = lerp(binMinX[b0], binMinX[b1], bf)
    const rMaxX = lerp(binMaxX[b0], binMaxX[b1], bf)
    const rMidX = 0.5 * (rMinX + rMaxX)
    const rHalfW = Math.max(0.5, 0.5 * (rMaxX - rMinX))
    const s = clamp((xCm - rMidX) / rHalfW, -1, 1)
    // u = 0 at medial edge (fly/seat above crotch, inseam below crotch), u = 1 at lateral outseam
    const u = clamp(0.5 * (1 + s * side), 0, 1)

    // Map [minY, crotchY2D] -> [waistWorldY, crotchWorldY] (just below pelvis)
    // and [crotchY2D, maxY] -> [crotchWorldY, ankleWorldY]
    const crotchWorldY = dims.hipY - dims.span * 0.095
    const ankleWorldY = Math.max(0.055, dims.H * 0.052)
    const isRise = yCm <= crotchY2D
    const riseFrac = clamp((yCm - minY) / riseSpan2D, 0, 1)
    const uLeg = isRise ? 0 : clamp((yCm - crotchY2D) / legSpan2D, 0, 1.02)
    const baseWorldY = isRise
      ? lerp(waistWorldY, crotchWorldY, riseFrac)
      : lerp(crotchWorldY, ankleWorldY, uLeg)

    const legBlend = smoothstep(crotchY2D - riseSpan2D * 0.12, crotchY2D + legSpan2D * 0.08, yCm)

    const waistTap = smoothstep(dims.hipY + dims.span * 0.08, waistWorldY, baseWorldY)
    const rAtY = lerp(Math.max(dims.hipR * 1.02, radiusAtHeight(dims, Math.max(dims.hipY, baseWorldY))), dims.waistR, waistTap)
    const rxPelvis = rAtY * easeFactor * 1.02 + 0.006
    const rzPelvis = rAtY * easeFactor * (zSign < 0 ? zScale * 1.14 : zScale * 1.05) + 0.008

    const crotchStart = [
      leg.hip[0],
      crotchWorldY,
      leg.hip[2] + (pose === 'seated' ? Math.max(0, dims.hipY - crotchWorldY) : 0),
    ]
    const cLeg = uLeg <= 0.52
      ? lerp3(crotchStart, leg.knee, uLeg / 0.52)
      : lerp3(leg.knee, leg.ankle, (uLeg - 0.52) / 0.48)

    const rLeg = lerp(dims.thighR * 1.12, dims.thighR * 0.78, Math.min(1, uLeg)) * easeFactor
    const thighTaper = smoothstep(0.0, 0.28, uLeg)
    const rzLeg = lerp(rzPelvis, rLeg * 1.08 + 0.006, thighTaper)
    const hipAbsX = Math.abs(cLeg[0] - joints.pelvisPos[0])
    const rxLateral = lerp(Math.max(rLeg, rxPelvis - hipAbsX), rLeg * 1.06, thighTaper)
    const inseamForkBlend = smoothstep(0.0, 0.16, uLeg)
    const rxMedial = lerp(hipAbsX, Math.max(0.015, hipAbsX - 0.007), inseamForkBlend)

    // Map only the medial 22% (between body centerline X=0 and thigh center cLeg[0])
    // to the inner-thigh inseam [-PI/2, 0], keeping the outer 78% [uPivot, 1] aligned
    // over the anterior and lateral thigh [0, +PI/2] with zero sideways jump across crotchY2D.
    const uPivot = 0.22
    const thetaRise = u * (Math.PI * 0.5)
    const thetaLeg = u < uPivot
      ? lerp(-Math.PI * 0.5, 0, u / uPivot)
      : lerp(0, Math.PI * 0.5, (u - uPivot) / (1 - uPivot))
    const theta = lerp(thetaRise, thetaLeg, legBlend)
    const sinT = Math.sin(theta)
    const cosT = Math.cos(theta)

    const centerX = lerp(joints.pelvisPos[0], cLeg[0], legBlend)
    const centerY = isRise ? baseWorldY : cLeg[1]
    const centerZ = lerp(joints.pelvisPos[2], cLeg[2], legBlend)
    const rxPos = lerp(rxPelvis, rxLateral, legBlend)
    const x = centerX + side * (sinT >= 0 ? rxPos * sinT : rxMedial * sinT)
    const z = centerZ + zSign * lerp(rzPelvis, rzLeg, legBlend) * cosT
    return [x, centerY, z]
  })
}

export function placeSleeve(positions2D, dims, side /* -1 = left, +1 = right */, easeFactor = 1.15, pose = 'standing') {
  if (!positions2D.length) return []
  let minX = Infinity, maxX = -Infinity, minY = Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
  }
  const width = maxX - minX
  // 1D centerline samples (e.g. unit-test probes with constant X) keep the
  // direct arc-length wrap around the arm axis.
  if (!(width > 1e-6)) {
    const shoulderWorldY = dims.shoulderY - dims.span * 0.04
    const shoulderWorldX = side * dims.shoulderHalf * 0.95
    const leanOut = side * 0.12
    return positions2D.map(([xCm, yCm]) => {
      const alongArm = cm(yCm)
      const t = Math.min(1, alongArm / dims.armLen)
      const radius = lerp(dims.upperR, dims.upperR * 0.55, t) * easeFactor
      const circumference = 2 * Math.PI * radius
      const phi = (cm(xCm) / circumference) * 2 * Math.PI
      const localX = radius * Math.sin(phi)
      const localZ = radius * Math.cos(phi)
      const worldY = shoulderWorldY - alongArm * Math.cos(leanOut)
      const worldX = shoulderWorldX + alongArm * Math.sin(leanOut) + localX * Math.cos(leanOut)
      return [worldX, worldY, localZ]
    })
  }

  // Real 2D sleeve piece: wrapped coaxially around the posed shoulder -> elbow ->
  // forearm/wrist centerline (`standing` bent elbow, `apose`, `tpose`,
  // `contrapposto`, `seated`) so arms never poke out the front or top of sleeves!
  const cx = (minX + maxX) / 2
  const halfW = width / 2
  const joints = computeMannequinPoseJoints(dims, pose)
  const arm = joints.arms[side]

  const capRoot = [
    arm.shoulder[0] + side * dims.upperR * 0.10,
    arm.shoulder[1] + dims.span * 0.035,
    arm.shoulder[2],
  ]
  const upperSegLen = Math.hypot(
    arm.elbow[0] - capRoot[0],
    arm.elbow[1] - capRoot[1],
    arm.elbow[2] - capRoot[2],
  ) || (arm.upperArmLen + dims.span * 0.035)
  const foreSegLen = Math.hypot(
    arm.wrist[0] - arm.elbow[0],
    arm.wrist[1] - arm.elbow[1],
    arm.wrist[2] - arm.elbow[2],
  ) || arm.forearmLen

  const unitVec = (dx, dy, dz) => {
    const l = Math.hypot(dx, dy, dz) || 1
    return [dx / l, dy / l, dz / l]
  }
  const upperDir = unitVec(arm.elbow[0] - capRoot[0], arm.elbow[1] - capRoot[1], arm.elbow[2] - capRoot[2])
  const foreDir = unitVec(arm.wrist[0] - arm.elbow[0], arm.wrist[1] - arm.elbow[1], arm.wrist[2] - arm.elbow[2])

  function sleeveBasis(axisDir) {
    // Forward basis (+Z perpendicular to axisDir)
    let fx = -axisDir[0] * axisDir[2]
    let fy = -axisDir[1] * axisDir[2]
    let fz = 1 - axisDir[2] * axisDir[2]
    const fl = Math.hypot(fx, fy, fz) || 1
    fx /= fl; fy /= fl; fz /= fl
    // Outward basis = side * (fx,fy,fz) x axisDir (points toward +X for side=+1, -X for side=-1)
    let ox = side * (fy * axisDir[2] - fz * axisDir[1])
    let oy = side * (fz * axisDir[0] - fx * axisDir[2])
    let oz = side * (fx * axisDir[1] - fy * axisDir[0])
    const ol = Math.hypot(ox, oy, oz) || 1
    ox /= ol; oy /= ol; oz /= ol
    return { out: [ox, oy, oz], front: [fx, fy, fz] }
  }

  const upperBasis = sleeveBasis(upperDir)
  const foreBasis = sleeveBasis(foreDir)

  return positions2D.map(([xCm, yCm]) => {
    const alongArm = cm(yCm - minY)
    const t = clamp(alongArm / Math.max(dims.armLen, 0.2), 0, 1.15)
    const radius = lerp(dims.upperR * 1.16, dims.upperR * 0.74, Math.min(1, t)) * easeFactor + 0.005

    let center, out, front
    if (alongArm <= upperSegLen) {
      const u = alongArm / upperSegLen
      center = lerp3(capRoot, arm.elbow, u)
      const elbowBlend = smoothstep(0.75, 1.0, u) * 0.5
      out = unitVec(
        lerp(upperBasis.out[0], foreBasis.out[0], elbowBlend),
        lerp(upperBasis.out[1], foreBasis.out[1], elbowBlend),
        lerp(upperBasis.out[2], foreBasis.out[2], elbowBlend),
      )
      front = unitVec(
        lerp(upperBasis.front[0], foreBasis.front[0], elbowBlend),
        lerp(upperBasis.front[1], foreBasis.front[1], elbowBlend),
        lerp(upperBasis.front[2], foreBasis.front[2], elbowBlend),
      )
    } else {
      const fDist = alongArm - upperSegLen
      const u = fDist / foreSegLen
      center = lerp3(arm.elbow, arm.wrist, u)
      const elbowBlend = 0.5 + 0.5 * smoothstep(0.0, 0.25, u)
      out = unitVec(
        lerp(upperBasis.out[0], foreBasis.out[0], elbowBlend),
        lerp(upperBasis.out[1], foreBasis.out[1], elbowBlend),
        lerp(upperBasis.out[2], foreBasis.out[2], elbowBlend),
      )
      front = unitVec(
        lerp(upperBasis.front[0], foreBasis.front[0], elbowBlend),
        lerp(upperBasis.front[1], foreBasis.front[1], elbowBlend),
        lerp(upperBasis.front[2], foreBasis.front[2], elbowBlend),
      )
    }

    const s = clamp((xCm - cx) / halfW, -1, 1)
    const alpha = s * Math.PI * 0.96
    // At s=0 (capTop): cos(0)=1 -> outer shoulder (`Z = 0` at capRoot);
    // front cap wraps across +front (+Z); back cap wraps across -front (-Z).
    const cOut = radius * Math.cos(alpha)
    const cFront = -side * radius * Math.sin(alpha)
    return [
      center[0] + cOut * out[0] + cFront * front[0],
      center[1] + cOut * out[1] + cFront * front[1],
      center[2] + cOut * out[2] + cFront * front[2],
    ]
  })
}

const GORE_ANGLE = Math.PI * 0.42
export function placeGorePanel(positions2D, dims, angleCenter, pose = 'standing') {
  const topWorldY = dims.hipY + dims.span * 0.44
  const zScale = dims.female ? 0.72 : 0.78
  const xs = positions2D.map(([x]) => x)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const width = Math.max(1e-6, maxX - minX)
  const ys = positions2D.map(([, y]) => y)
  const hemReachCm = Math.max(1e-6, Math.max(...ys) - Math.min(...ys))
  const hipEdgeR = radiusAtHeight(dims, dims.hipY) * 1.15
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const r = worldY >= dims.hipY
      ? radiusAtHeight(dims, worldY) * 1.15
      : lerp(hipEdgeR, hipEdgeR * 1.65, Math.min(1, (dims.hipY - worldY) / cm(hemReachCm)))
    const hipBlend = smoothstep(dims.hipY + dims.span * 0.12, dims.hipY - dims.span * 0.08, worldY)
    const effZScale = lerp(zScale, 0.96, hipBlend)
    const t = (xCm - minX) / width
    const theta = angleCenter + (t - 0.5) * GORE_ANGLE
    const x = r * Math.sin(theta)
    const z = r * effZScale * Math.cos(theta)
    return applySeatedSkirtDrape(x, worldY, z, dims, Math.cos(angleCenter) >= 0 ? 1 : -1, pose)
  })
}

const bboxCenterX = (positions2D) => {
  let minX = Infinity, maxX = -Infinity
  for (const [x] of positions2D) { if (x < minX) minX = x; if (x > maxX) maxX = x }
  return (minX + maxX) / 2
}

export function placeAttachNeck(positions2D, dims, side = 0) {
  const topWorldY = dims.shoulderY + dims.span * 0.055
  const yNeckBase = dims.shoulderY - dims.span * 0.015
  const yChestSlope = dims.shoulderY - dims.span * 0.16
  const torsoZScale = dims.female ? 0.80 : 0.82
  const cx = bboxCenterX(positions2D)
  const thetaCenter = side * Math.PI * 0.45
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    let r
    let effZScale
    if (worldY >= yNeckBase) {
      const tNeck = clamp((topWorldY - worldY) / Math.max(1e-6, topWorldY - yNeckBase), 0, 1)
      r = lerp(dims.neckR * 1.28, dims.neckR * 1.36, tNeck)
      effZScale = lerp(0.96, 0.90, tNeck)
    } else {
      const tSlope = clamp((yNeckBase - worldY) / Math.max(1e-6, yNeckBase - yChestSlope), 0, 1)
      const bustLift = (dims.female && !dims.kid)
        ? dims.chestR * 0.07 * Math.exp(-Math.pow((worldY - (dims.hipY + dims.span * 0.70)) / (dims.span * 0.15), 2))
        : 0
      const torsoR = radiusAtHeight(dims, worldY) * 1.145 + bustLift
      r = lerp(dims.neckR * 1.36, torsoR, tSlope)
      effZScale = lerp(0.90, torsoZScale, tSlope)
    }
    const rEff = r * (1 + effZScale) * 0.5
    const phi = thetaCenter + cm(xCm - cx) / Math.max(0.05, rEff)
    const minR = (dims.neckR * 1.24) / Math.min(1, effZScale)
    const rOut = Math.max(minR, r + 0.004 * (Math.abs(phi) / Math.PI))
    return [rOut * Math.sin(phi), worldY, rOut * effZScale * Math.cos(phi)]
  })
}

export function placeAttachWaist(positions2D, dims, zSign = 1, pose = 'standing') {
  const topWorldY = dims.hipY + dims.span * 0.44
  const zScale = dims.female ? 0.72 : 0.78
  const cx = bboxCenterX(positions2D)
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    // Keep 1.21 * zScale at waist (satisfying elliptical waist ring pin/test), then blend
    // to 1.135 * 0.94 below hipY so long peplums/overskirts (`womens_dress` `skirt_front`)
    // drape flush against `frontPanel` (1.13 * 0.94) instead of ballooning out in front.
    const hipBlend = smoothstep(dims.hipY + dims.span * 0.12, dims.hipY - dims.span * 0.08, worldY)
    const scaleFactor = lerp(1.21, 1.135, hipBlend)
    const baseR = Math.max(dims.waistR * 0.96, radiusAtHeight(dims, worldY)) * scaleFactor
    const effZScale = lerp(zScale, 0.94, hipBlend)
    const rEff = baseR * (1 + effZScale) * 0.5
    const phi = cm(xCm - cx) / rEff
    const rOut = baseR + 0.003 * (Math.abs(phi) / Math.PI)
    const x = rOut * Math.sin(phi)
    const z = zSign * rOut * effZScale * Math.cos(phi)
    return applySeatedSkirtDrape(x, worldY, z, dims, zSign, pose)
  })
}

export function placeAttachHem(positions2D, dims, side = 0, pose = 'standing') {
  const topWorldY = dims.hipY - dims.legLen * 0.1
  const zScale = dims.female ? 0.78 : 0.82
  const cx = bboxCenterX(positions2D)
  const thetaCenter = side * Math.PI * 0.35
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const baseR = Math.max(dims.hipR * 0.95, radiusAtHeight(dims, worldY)) * 1.15
    const rEff = baseR * (1 + zScale) * 0.5
    const phi = thetaCenter + cm(xCm - cx) / rEff
    const minR = (dims.neckR * 1.24) / zScale
    const rOut = Math.max(minR, baseR + 0.004 * (Math.abs(phi) / Math.PI))
    return applySeatedSkirtDrape(rOut * Math.sin(phi), worldY, rOut * zScale * Math.cos(phi), dims, Math.cos(phi) >= 0 ? 1 : -1, pose)
  })
}

export function placeAttachBody(positions2D, dims, zSign = 1) {
  const topWorldY = dims.hipY + dims.span * 0.58
  const zScale = dims.female ? 0.80 : 0.84
  const cx = bboxCenterX(positions2D)
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const baseR = Math.max(dims.chestR * 0.94, radiusAtHeight(dims, worldY)) * 1.15
    const rEff = baseR * (1 + zScale) * 0.5
    const phi = cm(xCm - cx) / rEff
    const minR = (dims.neckR * 1.24) / zScale
    const rOut = Math.max(minR, baseR + 0.004 * (Math.abs(phi) / Math.PI))
    return [rOut * Math.sin(phi), worldY, zSign * rOut * zScale * Math.cos(phi)]
  })
}

export function placePiece(triangulated, dims, pose = 'standing') {
  const { pieceId, role, positions2D, placementHint } = triangulated
  const side = (pieceId.endsWith('L') || pieceId.endsWith('_l')) ? -1 : 1
  const attachSide = (pieceId.endsWith('L') || pieceId.endsWith('_l')) ? -1
    : (pieceId.endsWith('R') || pieceId.endsWith('_r')) ? 1 : 0
  const siblingEase = placementHint ? placementHint.index * 0.08 : 0
  if (role === 'frontPanel') return placeTorsoPanel(positions2D, dims, { zSign: 1, easeFactor: 1.13 + siblingEase, pose })
  if (role === 'backPanel') return placeTorsoPanel(positions2D, dims, { zSign: -1, easeFactor: 1.13 + siblingEase, pose })
  if (role === 'sleeve') return placeSleeve(positions2D, dims, side, 1.15, pose)
  if (role === 'hipPanelFront') return placeHipPanel(positions2D, dims, { zSign: 1, easeFactor: 1.16 + siblingEase, pose })
  if (role === 'hipPanelBack') return placeHipPanel(positions2D, dims, { zSign: -1, easeFactor: 1.16 + siblingEase, pose })
  if (role === 'legFront') return placeLegPanel(positions2D, dims, { side, zSign: 1, easeFactor: 1.16, pose })
  if (role === 'legBack') return placeLegPanel(positions2D, dims, { side, zSign: -1, easeFactor: 1.20, pose })
  if (role === 'goreFront') return placeGorePanel(positions2D, dims, 0, pose)
  if (role === 'goreBack') return placeGorePanel(positions2D, dims, Math.PI, pose)
  if (role === 'goreSideLeft') return placeGorePanel(positions2D, dims, -Math.PI / 2, pose)
  if (role === 'goreSideRight') return placeGorePanel(positions2D, dims, Math.PI / 2, pose)
  if (role === 'attachNeck') return placeAttachNeck(positions2D, dims, attachSide)
  if (role === 'attachWaist') return placeAttachWaist(positions2D, dims, 1, pose)
  if (role === 'attachWaistBack') return placeAttachWaist(positions2D, dims, -1, pose)
  if (role === 'attachHem') return placeAttachHem(positions2D, dims, attachSide, pose)
  if (role === 'attachBody') return placeAttachBody(positions2D, dims, 1)
  if (role === 'attachBodyBack') return placeAttachBody(positions2D, dims, -1)
  throw new Error(`placePiece: no placement heuristic for role "${role}"`)
}
