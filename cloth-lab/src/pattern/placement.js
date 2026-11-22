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

function computeSmoothedRowHalfWidths(positions2D, minY, panelHeightCm, cx) {
  const ROW_BINS = 14
  const binHalfW = new Float32Array(ROW_BINS)
  for (const [x, y] of positions2D) {
    const b = clamp(Math.floor(((y - minY) / panelHeightCm) * (ROW_BINS - 1)), 0, ROW_BINS - 1)
    const hw = Math.abs(x - cx)
    if (hw > binHalfW[b]) binHalfW[b] = hw
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let b = 0; b < ROW_BINS; b++) {
      if (binHalfW[b] <= 0) {
        const prev = b > 0 ? binHalfW[b - 1] : 0
        const next = b + 1 < ROW_BINS ? binHalfW[b + 1] : 0
        binHalfW[b] = prev > 0 && next > 0 ? 0.5 * (prev + next) : Math.max(prev, next)
      }
    }
  }
  const midIdx = Math.floor(ROW_BINS * 0.5)
  if (binHalfW[ROW_BINS - 4] >= binHalfW[midIdx] * 0.92) {
    for (let b = ROW_BINS - 3; b < ROW_BINS; b++) {
      if (binHalfW[b] < binHalfW[b - 1] * 0.88) binHalfW[b] = binHalfW[b - 1]
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(binHalfW)
    for (let b = 1; b < ROW_BINS - 1; b++) {
      next[b] = 0.25 * binHalfW[b - 1] + 0.5 * binHalfW[b] + 0.25 * binHalfW[b + 1]
    }
    binHalfW.set(next)
  }
  return binHalfW
}

function sampleRowHalfW(binHalfW, yCm, minY, panelHeightCm, fallback = 0) {
  if (!binHalfW) return fallback
  const bF = clamp(((yCm - minY) / Math.max(1e-4, panelHeightCm)) * (binHalfW.length - 1), 0, binHalfW.length - 1)
  const b0 = Math.floor(bF)
  const b1 = Math.min(binHalfW.length - 1, b0 + 1)
  return lerp(binHalfW[b0], binHalfW[b1], bF - b0)
}

function sampleFlaredSkirtRadius(rCurrent, dims, worldY, yCm, minY, panelHeightCm, binHalfW) {
  const rowHalfW = binHalfW ? sampleRowHalfW(binHalfW, yCm, minY, panelHeightCm, 0) : 0
  if (!binHalfW || worldY >= dims.hipY - dims.span * 0.04) {
    return { r: rCurrent, rowHalfW, startFlare: 0 }
  }
  const naturalR = cm(rowHalfW) / (Math.PI * 0.5 * 0.96)
  const dropFrac = clamp((dims.hipY - worldY) / Math.max(0.25, dims.legLen), 0, 1)
  const flareCeiling = dims.hipR * lerp(1.18, 1.52, smoothstep(0.05, 0.85, dropFrac))
  const targetR = Math.min(naturalR, flareCeiling)
  const startFlare = smoothstep(dims.hipY - dims.span * 0.04, dims.hipY - dims.span * 0.24, worldY)
  return { r: lerp(rCurrent, Math.max(rCurrent, targetR), startFlare), rowHalfW, startFlare }
}

function computeTopShoulderProfile(positions2D, minX, maxX, minY, cx, splitSide) {
  const BINS = 16
  const binTopY = new Float32Array(BINS).fill(Infinity)
  const spanX = Math.max(1e-4, splitSide !== 0 ? (maxX - minX) : Math.max(Math.abs(minX - cx), Math.abs(maxX - cx)))
  for (const [x, y] of positions2D) {
    const absX = Math.abs(x - cx)
    const b = clamp(Math.floor((absX / spanX) * (BINS - 1)), 0, BINS - 1)
    if (y < binTopY[b]) binTopY[b] = y
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let b = 0; b < BINS; b++) {
      if (!Number.isFinite(binTopY[b])) {
        const prev = b > 0 && Number.isFinite(binTopY[b - 1]) ? binTopY[b - 1] : Infinity
        const next = b + 1 < BINS && Number.isFinite(binTopY[b + 1]) ? binTopY[b + 1] : Infinity
        if (Number.isFinite(prev) && Number.isFinite(next)) binTopY[b] = 0.5 * (prev + next)
        else if (Number.isFinite(prev)) binTopY[b] = prev
        else if (Number.isFinite(next)) binTopY[b] = next
      }
    }
  }
  for (let b = 0; b < BINS; b++) {
    if (!Number.isFinite(binTopY[b])) binTopY[b] = minY
  }
  // Monotonic clamping prevents isolated deep V-neck inner vertices from pulling
  // adjacent shoulder-strap columns upward.
  return { binTopY, spanX }
}

function sampleTopShoulderY(profile, absX, fallbackY) {
  if (!profile) return fallbackY
  const { binTopY, spanX } = profile
  const f = clamp((absX / spanX) * (binTopY.length - 1), 0, binTopY.length - 1)
  const b0 = Math.floor(f)
  const b1 = Math.min(binTopY.length - 1, b0 + 1)
  return lerp(binTopY[b0], binTopY[b1], f - b0)
}

export function placeTorsoPanel(positions2D, dims, { zSign, easeFactor = 1.12, angleSpan = Math.PI * 0.94, pose = 'standing', splitSide = 0, princessSide = 0, hint = null } = {}) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const panelHeightCm = Math.max(1, maxY - minY)
  let topMinX = Infinity, topMaxX = -Infinity, botMinX = Infinity, botMaxX = -Infinity
  const topBandY = minY + Math.max(2.5, panelHeightCm * 0.16)
  for (const [x, y] of positions2D) {
    if (y <= topBandY) {
      if (x < topMinX) topMinX = x
      if (x > topMaxX) topMaxX = x
    }
    if (y >= maxY - 2.5) {
      if (x < botMinX) botMinX = x
      if (x > botMaxX) botMaxX = x
    }
  }
  const topSpan = Number.isFinite(topMaxX - topMinX) ? (topMaxX - topMinX) : (maxX - minX)
  const botSpan = Number.isFinite(botMaxX - botMinX) ? (botMaxX - botMinX) : (maxX - minX)
  const isLeotardFull = splitSide === 0
    && panelHeightCm > 46
    && (panelHeightCm / Math.max(0.2, dims.span * 100)) > 1.06
    && (panelHeightCm / Math.max(0.2, dims.span * 100)) < 1.52
    && botSpan < Math.max(1, maxX - minX) * 0.42
  const isLooseTorso = !isLeotardFull && panelHeightCm > 48 && (hint?.isLooseGarment || botSpan > Math.max(1, topSpan) * 1.18)
  const topWorldY = dims.shoulderY + dims.span * (isLeotardFull ? 0.026 : (dims.kid ? 0.036 : 0.024))
  const zScale = dims.female ? 0.78 : 0.82
  const cx = splitSide > 0
    ? (Number.isFinite(minX) ? minX : 0)
    : splitSide < 0
      ? (Number.isFinite(maxX) ? maxX : 0)
      : (minX < -1e-2 && maxX > 1e-2 && Math.abs(minX + maxX) < (maxX - minX) * 0.25)
        ? 0
        : (Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) / 2 : 0)
  const halfSpanCm = splitSide !== 0 ? Math.max(0, maxX - minX) : Math.max(0, (maxX - minX) * 0.5)
  const useRowWidth = !isLeotardFull && princessSide === 0
  const binHalfW = useRowWidth ? computeSmoothedRowHalfWidths(positions2D, minY, panelHeightCm, cx) : null
  const topProfile = computeTopShoulderProfile(positions2D, minX, maxX, minY, cx, splitSide)
  const maxDropCm = Math.max(20, (topWorldY - 0.025) * 100)
  const yScale = (Number.isFinite(maxY) && maxY > maxDropCm && minY >= -1)
    ? maxDropCm / Math.max(1e-4, maxY)
    : 1.0
  return positions2D.map(([xCm, yCm]) => {
    const rawWorldY = topWorldY - cm(yCm * yScale)
    const crotchFloorY = isLeotardFull ? (dims.hipY - dims.span * 0.188) : 0.02
    const worldYBase = Math.max(crotchFloorY, rawWorldY)
    const hipBlend = smoothstep(dims.hipY + dims.span * 0.12, dims.hipY - dims.span * 0.08, worldYBase)
    const hemFlare = isLooseTorso ? smoothstep(dims.hipY - dims.span * 0.32, 0.12, worldYBase) * 0.075 : 0
    const lowerEase = princessSide !== 0
      ? Math.max(easeFactor, lerp(easeFactor, 1.17, hipBlend))
      : (easeFactor + hemFlare)
    const rBody = radiusAtHeight(dims, worldYBase)
    const flared = sampleFlaredSkirtRadius(rBody * lowerEase, dims, worldYBase, yCm, minY, panelHeightCm, binHalfW)
    const r = flared.r
    const rowHalfW = Math.max(1e-2, flared.rowHalfW || halfSpanCm)
    const startFlare = flared.startFlare
    const effZScale = lerp(zScale, isLooseTorso ? 0.99 : 0.94, hipBlend)
    let theta
    if (princessSide !== 0) {
      const u = clamp((xCm - minX) / Math.max(1e-4, maxX - minX), 0, 1)
      const uLat = princessSide > 0 ? u : (1 - u)
      theta = princessSide * lerp(0.22 * Math.PI, 0.50 * Math.PI, uLat)
    } else {
      const rowCircMin = Math.max(cm(rowHalfW) * 1.06, Math.PI * r * (1 + effZScale) * 0.5)
      const flaredHalfCirc = Math.min(rowCircMin, Math.max(cm(rowHalfW) * (angleSpan / (Math.PI * 0.5)) * 0.98, cm(rowHalfW) * 1.04))
      const halfCirc = startFlare > 0 ? lerp(rowCircMin, flaredHalfCirc, startFlare) : rowCircMin
      theta = clamp((cm(xCm - cx) / Math.max(1e-4, halfCirc)) * angleSpan, -Math.PI * 0.50, Math.PI * 0.50)
    }
    const colTopY = sampleTopShoulderY(topProfile, Math.abs(xCm - cx), minY)
    const colIsUpperShoulder = smoothstep(13.5, 9.0, colTopY - minY)
    const dyFromShoulder = Math.max(0, yCm - colTopY)
    const shNearSeam = smoothstep(6.5, 0.0, dyFromShoulder) * colIsUpperShoulder
    const neckTheta = Math.asin(clamp((dims.neckR * 0.85) / Math.max(0.08, r), 0.08, 0.45))
    const shOutsideNeck = smoothstep(neckTheta * 0.72, neckTheta * 1.18, Math.abs(theta))
    const notCenterLine = smoothstep(0.8, 2.2, Math.abs(xCm - cx))
    const collarDropLift = Math.min(0.044, Math.max(0, colTopY - minY - 1.5) * 0.0055) * shNearSeam * notCenterLine
    const shSlope = smoothstep(0.14 * Math.PI, 0.46 * Math.PI, Math.abs(theta))
    const worldY = worldYBase + collarDropLift - dims.span * 0.030 * shNearSeam * shSlope
    const shWorldLift = smoothstep(dims.shoulderY - dims.span * 0.14, dims.shoulderY - dims.span * 0.015, worldY)
    const shArch = shNearSeam * shOutsideNeck * shWorldLift
    const excessRatio = isLooseTorso ? (cm(halfSpanCm) / Math.max(0.14, Math.PI * r * 0.5)) : 1.0
    const waveDrop = isLooseTorso ? smoothstep(dims.hipY + dims.span * 0.16, dims.hipY - dims.span * 0.45, worldYBase) : 0
    const zDrapeWave = excessRatio > 1.35
      ? (1 + 0.08 * Math.min(1.0, excessRatio - 1.35) * waveDrop * (0.5 - 0.5 * Math.cos(theta * 6.0)))
      : 1.0
    const x = r * Math.sin(theta)
    const zBase = zSign * r * effZScale * Math.cos(theta) * zDrapeWave
    // Pull inner top shoulder points (inside neckTheta on high-collar jackets/vests) toward
    // the neck-ring surface instead of leaving them out at full chest depth.
    const neckTuck = shNearSeam * shWorldLift * (1 - shOutsideNeck) * notCenterLine
    const neckGuardZ = zSign * Math.max(dims.neckR * 1.24, Math.sqrt(Math.max(0, Math.pow(dims.neckR * 1.22 + 0.012, 2) - x * x)))
    const zWithNeckTuck = lerp(zBase, neckGuardZ, neckTuck * 0.92)
    const z = zWithNeckTuck * lerp(1.0, 0.06, shArch)
    return applySeatedSkirtDrape(x, worldY, z, dims, zSign, pose)
  })
}

function placeBriefPanel(positions2D, dims, { zSign, easeFactor = 1.032, pose = 'standing', hint = {} } = {}) {
  const zScale = dims.female ? 0.72 : 0.78
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const cx = (minX < -1e-2 && maxX > 1e-2 && Math.abs(minX + maxX) < (maxX - minX) * 0.25)
    ? 0
    : (Number.isFinite(minX) && Number.isFinite(maxX) ? 0.5 * (minX + maxX) : 0)

  const riseT = clamp(((hint.riseCm ?? 12) - 7) / 11, 0, 1)
  const hipHalfW = Math.max(1.0, maxX - cx)
  const sideSeamY = clamp(hint.sideSeamYCm ?? (minY + 5), minY + 1.5, maxY - 1.5)
  const crotchWorldY = dims.hipY - dims.span * 0.188
  const pelvisEase = (zSign < 0 ? 1.072 : 1.042) + Math.max(0, easeFactor - 1.16)
  const maxCrotchZ = dims.hipR * zScale * 0.42

  let waistTopHW = 1, sideCornerHW = 1
  for (const [x, y] of positions2D) {
    const hw = Math.abs(x - cx)
    if (y <= minY + 1.5 && hw > waistTopHW) waistTopHW = hw
    if (y >= sideSeamY - 0.8 && y <= sideSeamY + 0.8 && hw > sideCornerHW) sideCornerHW = hw
  }

  if (hint.hasBriefLeg) {
    const topWorldY = dims.hipY + dims.span * lerp(0.11, 0.28, riseT)
    const legDrop = clamp(0.205 + (cm(hint.legExtCm || 5) / Math.max(0.20, dims.span)) * 0.36, 0.215, 0.32)
    const hemWorldY = dims.hipY - dims.span * legDrop
    const inseamStartY = hint.crotchYCm ?? (sideSeamY - 3.0)
    const inseamHalfW = Math.max(2.0, hipHalfW * 0.26)
    const joints = computeMannequinPoseJoints(dims, pose)
    return positions2D.map(([xCm, yCm]) => {
      const vSide = clamp((yCm - minY) / Math.max(1e-4, sideSeamY - minY), 0, 1)
      const absX = Math.abs(xCm - cx)
      const isInseamArea = yCm >= inseamStartY - 0.5 && absX <= inseamHalfW
      const uInseam = isInseamArea
        ? clamp(1 - (yCm - inseamStartY) / Math.max(1e-4, sideSeamY - inseamStartY), 0, 1)
        : 0
      const rowBoundHW = yCm <= sideSeamY ? Math.max(waistTopHW, lerp(waistTopHW, sideCornerHW, vSide)) : hipHalfW
      const s = clamp((xCm - cx) / Math.max(0.5, rowBoundHW), -1, 1)
      const legSide = s >= 0 ? 1 : -1
      const uSide = Math.abs(s)

      const pelvY = lerp(topWorldY, hemWorldY, vSide)
      const rP = radiusAtHeight(dims, Math.max(dims.hipY - dims.span * 0.02, pelvY)) * pelvisEase
      const thetaP = s * Math.PI * 0.50
      const px = rP * Math.sin(thetaP)
      const pz = zSign * rP * zScale * Math.cos(thetaP)

      const leg = joints.legs[legSide]
      const tLeg = clamp((leg.hip[1] - pelvY) / Math.max(0.15, leg.hip[1] - leg.knee[1]), 0, 0.45)
      const legCenter = lerp3(leg.hip, leg.knee, tLeg)
      const rxT = Math.min(dims.thighR * 0.94, Math.abs(leg.hip[0]) * 0.92) * 1.028 + 0.003
      const rzT = dims.thighR * 0.96 * 1.028 + 0.003
      const uThigh = clamp((uSide - 0.14) / 0.86, 0, 1)
      const thetaT = (uThigh - 0.5) * Math.PI
      const tx = legCenter[0] + legSide * rxT * Math.sin(thetaT)
      const tz = legCenter[2] + zSign * rzT * Math.cos(thetaT)

      const bifurcate = smoothstep(0.42, 0.82, vSide) * smoothstep(0.06, 0.26, uSide)
      const bx = lerp(px, tx, bifurcate)
      const inseamPull = (!isInseamArea && uSide < 0.22 && yCm >= inseamStartY - 0.5)
        ? smoothstep(0.22, 0.04, uSide) * smoothstep(inseamStartY - 0.5, sideSeamY, yCm)
        : 0
      const bzRaw = lerp(pz, tz, bifurcate)
      const bz = lerp(bzRaw, zSign * 0.022, inseamPull * 0.72)
      const crotchPull = uInseam * smoothstep(0.15, 0.95, 1 - absX / Math.max(1e-4, inseamHalfW))
      const crotchX3D = clamp(cm(xCm - cx) * 0.95, -dims.hipR * 0.24, dims.hipR * 0.24)
      const crotchZ3D = zSign * maxCrotchZ
      return [
        lerp(bx, crotchX3D, crotchPull),
        lerp(pelvY, crotchWorldY, crotchPull),
        lerp(bz, crotchZ3D, crotchPull),
      ]
    })
  }

  const topWorldY = dims.hipY + dims.span * lerp(0.08, 0.28, riseT)
  const sideBotY = dims.hipY + dims.span * lerp(-0.02, 0.06, riseT)
  return positions2D.map(([xCm, yCm]) => {
    if (yCm <= sideSeamY + 1e-4) {
      const v = clamp((yCm - minY) / Math.max(1e-4, sideSeamY - minY), 0, 1)
      const worldY = lerp(topWorldY, sideBotY, v)
      const r = radiusAtHeight(dims, worldY) * pelvisEase
      const rowBoundHW = Math.max(waistTopHW, lerp(waistTopHW, sideCornerHW, v))
      const s = clamp((xCm - cx) / Math.max(0.5, rowBoundHW), -1, 1)
      const theta = s * Math.PI * 0.50
      return applySeatedSkirtDrape(r * Math.sin(theta), worldY, zSign * r * zScale * Math.cos(theta), dims, zSign, pose)
    }

    const u = clamp((yCm - sideSeamY) / Math.max(1e-4, maxY - sideSeamY), 0, 1)
    const xFrac = clamp((xCm - cx) / hipHalfW, -1, 1)
    const baseY = lerp(sideBotY, crotchWorldY, Math.sin(u * Math.PI * 0.5))
    const pelvR = radiusAtHeight(dims, Math.max(dims.hipY - dims.span * 0.02, baseY)) * pelvisEase
    const theta = xFrac * Math.PI * 0.50
    const pelvX = pelvR * Math.sin(theta)
    const pelvZ = zSign * pelvR * zScale * Math.cos(theta)
    const xBlend = smoothstep(0.22, 1.0, u)
    const zBlend = smoothstep(zSign < 0 ? 0.64 : 0.52, 1.0, u)
    const crotchX3D = clamp(cm(xCm - cx) * 0.95, -dims.hipR * 0.24, dims.hipR * 0.24)
    const crotchZ3D = zSign * maxCrotchZ
    return [
      lerp(pelvX, crotchX3D, xBlend),
      baseY,
      lerp(pelvZ, crotchZ3D, zBlend),
    ]
  })
}

export function placeHipPanel(positions2D, dims, { zSign, easeFactor = 1.16, angleSpan: _angleSpan = Math.PI * 0.85, pose = 'standing', hint = null } = {}) {
  if (hint?.isBrief) {
    return placeBriefPanel(positions2D, dims, { zSign, easeFactor, pose, hint })
  }
  const topWorldY = dims.hipY + dims.span * 0.44
  const zScale = dims.female ? 0.75 : 0.80
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const cx = (minX < -1e-2 && maxX > 1e-2 && Math.abs(minX + maxX) < (maxX - minX) * 0.25)
    ? 0
    : (Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) / 2 : 0)
  const halfSpanCm = Math.max(0, (maxX - minX) / 2)
  const panelHeightCm = Math.max(1, maxY - minY)
  let topMinX = Infinity, topMaxX = -Infinity, botMinX = Infinity, botMaxX = -Infinity
  const topBandY = minY + Math.max(2.0, panelHeightCm * 0.16)
  for (const [x, y] of positions2D) {
    if (y <= topBandY) { if (x < topMinX) topMinX = x; if (x > topMaxX) topMaxX = x }
    if (y >= maxY - 2.5) { if (x < botMinX) botMinX = x; if (x > botMaxX) botMaxX = x }
  }
  const topW = Number.isFinite(topMaxX - topMinX) ? (topMaxX - topMinX) : (maxX - minX)
  const botW = Number.isFinite(botMaxX - botMinX) ? (botMaxX - botMinX) : (maxX - minX)
  const isLooseSkirt = panelHeightCm > 38 && (hint?.isLooseGarment || botW > Math.max(1, topW) * 1.18)
  const isTube = Boolean(hint?.isSingleHipTube)
  const maxTheta = isTube ? Math.PI * 0.98 : Math.PI * 0.50
  const binHalfW = computeSmoothedRowHalfWidths(positions2D, minY, panelHeightCm, cx)
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const hemFlare = isLooseSkirt ? smoothstep(dims.hipY + dims.span * 0.10, 0.15, worldY) * 0.08 : 0
    const rBody = radiusAtHeight(dims, worldY)
    const { r, rowHalfW: flaredRowHW } = sampleFlaredSkirtRadius(rBody * (easeFactor + hemFlare), dims, worldY, yCm, minY, panelHeightCm, binHalfW)
    const rowHalfW = Math.max(1e-2, flaredRowHW || sampleRowHalfW(binHalfW, yCm, minY, panelHeightCm, halfSpanCm) || halfSpanCm)
    const hipBlend = smoothstep(dims.hipY + dims.span * 0.12, dims.hipY - dims.span * 0.08, worldY)
    const effZScale = lerp(zScale, 0.94, hipBlend)
    const theta = clamp(((xCm - cx) / rowHalfW) * maxTheta, -maxTheta, maxTheta)
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
export function placeLegPanel(positions2D, dims, { side, zSign, easeFactor = 1.15, pose = 'standing', hint = null } = {}) {
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

  // Detect the 2D crotch fork height (`crotchY2D`): prefer the importer-computed
  // `hint.crotchYCm` (exact mirrorSelf crotch point or medial-most outline vertex),
  // falling back to the maximum medial protrusion in `fracY ∈ [0.10, 0.48]` so
  // subdivided vertices down the inseam never pull the fork halfway to the knee.
  let crotchY2D = minY + totalH * 0.20
  if (Number.isFinite(hint?.crotchYCm)) {
    crotchY2D = clamp(minY + hint.crotchYCm, minY + totalH * 0.08, minY + totalH * 0.58)
  } else {
    let bestMedialScore = -Infinity
    for (const [x, y] of positions2D) {
      const fracY = (y - minY) / totalH
      if (fracY < 0.10 || fracY > 0.48) continue
      const medialScore = side > 0 ? -x : x
      if (medialScore > bestMedialScore) {
        bestMedialScore = medialScore
        crotchY2D = y
      }
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
  // 3-bin morphological outer envelope (preserve exact row 0 waist bounds so CF/CB fly/seat meets X=0)
  const binMinX = new Float32Array(BINS)
  const binMaxX = new Float32Array(BINS)
  for (let b = 0; b < BINS; b++) {
    const b0 = b === 0 ? 0 : Math.max(0, b - 1)
    const b1 = b === 0 ? 0 : Math.min(BINS - 1, b + 1)
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
    // and [crotchY2D, maxY] -> [crotchWorldY, ankleWorldY] bounded by the
    // physical 2D inseam reach so shorts stop on the thigh instead of stretching to the ankle.
    const crotchWorldY = dims.hipY - dims.span * 0.124
    const ankleWorldY = Math.max(0.055, dims.H * 0.052)
    const fullInseamWorld = Math.max(0.18, crotchWorldY - ankleWorldY)
    const legReachFrac = clamp(cm(legSpan2D) / fullInseamWorld, 0.08, 1.02)
    const isRise = yCm <= crotchY2D
    const riseFrac = clamp((yCm - minY) / riseSpan2D, 0, 1)
    const uLeg = isRise ? 0 : clamp((yCm - crotchY2D) / legSpan2D, 0, 1.0) * legReachFrac
    const baseWorldY = isRise
      ? lerp(waistWorldY, crotchWorldY, riseFrac)
      : lerp(crotchWorldY, ankleWorldY, uLeg)

    const legBlend = smoothstep(crotchY2D - riseSpan2D * 0.30, crotchY2D, yCm)

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
    const rxMedial = lerp(Math.max(0.012, hipAbsX - 0.008), Math.min(rxLateral * 0.94, Math.max(0.015, hipAbsX - 0.007)), thighTaper * inseamForkBlend)

    // Map medial panel edge (`0..0.44`) to inner-thigh inseam `[-PI/2, 0]`, keeping
    // outer panel `[0.44, 1]` over anterior and lateral thigh `[0, +PI/2]`.
    const uPivot = 0.44
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

export function placeSleeve(positions2D, dims, side /* -1 = left, +1 = right */, easeFactor = 1.15, pose = 'standing', tubeHalf = null, capOffsetCm = 0) {
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
    arm.shoulder[0] - side * dims.upperR * 0.06,
    arm.shoulder[1] + dims.span * 0.014,
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
    const alongArm = cm(yCm - minY + (capOffsetCm || 0))
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
    let alpha = s * Math.PI * 0.96
    if (tubeHalf === 'upper') {
      alpha = s * Math.PI * 0.54
    } else if (tubeHalf === 'under') {
      alpha = s < 0
        ? lerp(-Math.PI, -Math.PI * 0.54, -s)
        : lerp(Math.PI, Math.PI * 0.54, s)
    }
    // Taper the upper sleeve cap smoothly inward toward the shoulder seam (`capRoot`)
    // instead of sticking out horizontally past the deltoid cap and buckling upward.
    const uCap = smoothstep(0.0, Math.max(0.085, dims.armLen * 0.20), alongArm)
    const cosA = Math.cos(alpha)
    const capOutScale = cosA >= 0 ? lerp(0.18, 1.0, uCap) : lerp(0.42, 1.0, uCap)
    const capFrontScale = lerp(0.76, 1.0, uCap)
    const cOut = radius * cosA * capOutScale
    const cFront = -side * radius * Math.sin(alpha) * capFrontScale
    const crownLift = dims.upperR * 0.16 * (1 - uCap) * Math.max(0, cosA)
    return [
      center[0] + cOut * out[0] + cFront * front[0],
      center[1] + crownLift + cOut * out[1] + cFront * front[1],
      center[2] + cOut * out[2] + cFront * front[2],
    ]
  })
}

const GORE_ANGLE = Math.PI * 0.48
export function placeGorePanel(positions2D, dims, angleCenter, pose = 'standing', goreSpan = GORE_ANGLE) {
  const topWorldY = dims.hipY + dims.span * 0.44
  const zScale = dims.female ? 0.72 : 0.78
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const panelHeightCm = Math.max(1e-4, maxY - minY)
  const maxDropCm = Math.max(20, (topWorldY - 0.025) * 100)
  const yScale = (Number.isFinite(maxY) && maxY > maxDropCm && minY >= -1)
    ? maxDropCm / Math.max(1e-4, maxY)
    : 1.0
  const ROW_BINS = 14
  const binMinX = new Float32Array(ROW_BINS).fill(Infinity)
  const binMaxX = new Float32Array(ROW_BINS).fill(-Infinity)
  for (const [x, y] of positions2D) {
    const b = clamp(Math.floor(((y - minY) / panelHeightCm) * (ROW_BINS - 1)), 0, ROW_BINS - 1)
    if (x < binMinX[b]) binMinX[b] = x
    if (x > binMaxX[b]) binMaxX[b] = x
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let b = 0; b < ROW_BINS; b++) {
      if (!Number.isFinite(binMinX[b])) {
        const prev = b > 0 && Number.isFinite(binMinX[b - 1]) ? binMinX[b - 1] : minX
        const next = b + 1 < ROW_BINS && Number.isFinite(binMinX[b + 1]) ? binMinX[b + 1] : minX
        binMinX[b] = 0.5 * (prev + next)
      }
      if (!Number.isFinite(binMaxX[b])) {
        const prev = b > 0 && Number.isFinite(binMaxX[b - 1]) ? binMaxX[b - 1] : maxX
        const next = b + 1 < ROW_BINS && Number.isFinite(binMaxX[b + 1]) ? binMaxX[b + 1] : maxX
        binMaxX[b] = 0.5 * (prev + next)
      }
    }
  }
  const midIdx = Math.floor(ROW_BINS * 0.5)
  const midW = binMaxX[midIdx] - binMinX[midIdx]
  if ((binMaxX[ROW_BINS - 4] - binMinX[ROW_BINS - 4]) >= midW * 0.92) {
    for (let b = ROW_BINS - 3; b < ROW_BINS; b++) {
      const prevW = binMaxX[b - 1] - binMinX[b - 1]
      if ((binMaxX[b] - binMinX[b]) < prevW * 0.88) {
        binMinX[b] = binMinX[b - 1]
        binMaxX[b] = binMaxX[b - 1]
      }
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const nextMin = new Float32Array(binMinX)
    const nextMax = new Float32Array(binMaxX)
    for (let b = 1; b < ROW_BINS - 1; b++) {
      nextMin[b] = 0.25 * binMinX[b - 1] + 0.5 * binMinX[b] + 0.25 * binMinX[b + 1]
      nextMax[b] = 0.25 * binMaxX[b - 1] + 0.5 * binMaxX[b] + 0.25 * binMaxX[b + 1]
    }
    binMinX.set(nextMin)
    binMaxX.set(nextMax)
  }
  const hipEdgeR = radiusAtHeight(dims, dims.hipY) * 1.15
  const dropReach = Math.max(0.25, cm(panelHeightCm * yScale))
  return positions2D.map(([xCm, yCm]) => {
    const worldY = Math.max(0.02, topWorldY - cm(yCm * yScale))
    const r = worldY >= dims.hipY
      ? radiusAtHeight(dims, worldY) * 1.15
      : lerp(hipEdgeR, hipEdgeR * 1.55, smoothstep(0, 1, clamp((dims.hipY - worldY) / dropReach, 0, 1)))
    const hipBlend = smoothstep(dims.hipY + dims.span * 0.12, dims.hipY - dims.span * 0.08, worldY)
    const effZScale = lerp(zScale, 0.96, hipBlend)
    const bF = clamp(((yCm - minY) / panelHeightCm) * (ROW_BINS - 1), 0, ROW_BINS - 1)
    const b0 = Math.floor(bF)
    const b1 = Math.min(ROW_BINS - 1, b0 + 1)
    const rowMinX = lerp(binMinX[b0], binMinX[b1], bF - b0)
    const rowMaxX = lerp(binMaxX[b0], binMaxX[b1], bF - b0)
    const t = clamp((xCm - rowMinX) / Math.max(1e-4, rowMaxX - rowMinX), 0, 1)
    const theta = angleCenter + (t - 0.5) * goreSpan
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

export function placeAttachNeck(positions2D, dims, side = 0, neckKind = null) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const width = Math.max(1e-4, maxX - minX)
  const height = Math.max(1e-4, maxY - minY)
  const topWorldY = dims.shoulderY + dims.span * 0.016
  const yNeckBase = dims.shoulderY - dims.span * 0.020
  const yChestSlope = dims.shoulderY - dims.span * 0.18
  const torsoZScale = dims.female ? 0.80 : 0.82
  const cx = 0.5 * (minX + maxX)

  // Vertical lapel/placket facings drape cleanly along the front opening border
  if (neckKind === 'lapel-facing' || neckKind === 'placket-facing') {
    const s = side === 0 ? 1 : side
    return positions2D.map(([xCm, yCm]) => {
      const worldY = (dims.shoulderY - dims.span * 0.045) - cm(yCm - minY) * 0.68
      const isPlacket = neckKind === 'placket-facing'
      const torsoR = radiusAtHeight(dims, worldY) * (isPlacket ? 1.135 : 1.08) + (isPlacket ? 0.005 : 0)
      const u = s > 0 ? clamp((xCm - minX) / width, 0, 1) : clamp((maxX - xCm) / width, 0, 1)
      const phi = s * (isPlacket ? lerp(0.01 * Math.PI, 0.075 * Math.PI, u) : lerp(0.18 * Math.PI, 0.34 * Math.PI, u))
      const rOut = Math.max(dims.neckR * 1.30 / torsoZScale, torsoR)
      return [rOut * Math.sin(phi), worldY, rOut * torsoZScale * Math.cos(phi)]
    })
  }
  if (neckKind === 'yoke' && side === 0) {
    return positions2D.map(([xCm, yCm]) => {
      const worldY = (dims.shoulderY - dims.span * 0.048) - cm(yCm - minY) * 0.82
      const u = clamp((xCm - cx) / Math.max(1e-4, 0.5 * width), -1, 1)
      const phi = u * 0.42 * Math.PI
      const rOut = Math.max(dims.neckR * 1.35 / torsoZScale, radiusAtHeight(dims, worldY) * 1.145 + 0.006)
      return [rOut * Math.sin(phi), worldY, rOut * torsoZScale * Math.cos(phi)]
    })
  }

  // Tall notched / shawl blazer collars (`shawlCollar` / `undercollar` >= 12x12cm):
  // fold softly outward and downward onto the upper chest collar line rather than
  // standing straight up like a rigid cylinder around the neck.
  if (height > width * 1.35 || (neckKind === 'collar' && height > 12 && width > 12)) {
    const isTallStrip = height > width * 1.35
    const isOnePieceBackCollar = !isTallStrip || side === 0
    const s = side === 0 ? 1 : side
    return positions2D.map(([xCm, yCm]) => {
      const uY = clamp((yCm - minY) / height, 0, 1)
      const uX = clamp((xCm - minX) / width, 0, 1)
      const uArc = isTallStrip ? uY : uX
      const vBand = isTallStrip ? uX : uY
      const worldY = isOnePieceBackCollar
        ? lerp(dims.shoulderY + dims.span * 0.016, dims.shoulderY - dims.span * 0.050, vBand)
        : lerp(dims.shoulderY + dims.span * 0.012, dims.shoulderY - Math.min(cm(height) * 0.62, dims.span * 0.40), uArc)
      const phi = isOnePieceBackCollar
        ? (Math.PI + lerp(-0.72 * Math.PI, 0.72 * Math.PI, uArc))
        : (s * lerp(Math.PI, 0.20 * Math.PI, uArc))
      const torsoR = Math.max(dims.neckR * 1.38, radiusAtHeight(dims, worldY) * (isOnePieceBackCollar ? 1.245 : lerp(0.92, 1.16, uArc)))
      const rOut = Math.max(dims.neckR * 1.38, torsoR + vBand * 0.008)
      const effZScale = isOnePieceBackCollar ? lerp(0.90, torsoZScale, vBand) : lerp(0.92, torsoZScale, uArc)
      return [rOut * Math.sin(phi), worldY, rOut * effZScale * Math.cos(phi)]
    })
  }

  // Standard collars & neckbands: wrap from back of neck (`phi = PI`) symmetrically toward front throat
  const thetaCenter = side !== 0 ? side * Math.PI * 0.45 : Math.PI
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm - minY) * 0.56
    let r
    let effZScale
    if (worldY >= yNeckBase) {
      const tNeck = clamp((topWorldY - worldY) / Math.max(1e-6, topWorldY - yNeckBase), 0, 1)
      r = lerp(dims.neckR * 1.34, dims.neckR * 1.38, tNeck)
      effZScale = lerp(0.96, 0.90, tNeck)
    } else {
      const tSlope = clamp((yNeckBase - worldY) / Math.max(1e-6, yNeckBase - yChestSlope), 0, 1)
      const bustLift = (dims.female && !dims.kid)
        ? dims.chestR * 0.07 * Math.exp(-Math.pow((worldY - (dims.hipY + dims.span * 0.70)) / (dims.span * 0.15), 2))
        : 0
      const torsoR = radiusAtHeight(dims, worldY) * 1.16 + bustLift
      r = lerp(dims.neckR * 1.38, torsoR, tSlope)
      effZScale = lerp(0.90, torsoZScale, tSlope)
    }
    const rEff = r * (1 + effZScale) * 0.5
    const deltaPhi = clamp(cm(xCm - cx) / Math.max(0.05, rEff), -Math.PI * 0.78, Math.PI * 0.78)
    const phi = thetaCenter + deltaPhi
    const minR = (dims.neckR * 1.30) / Math.min(1, effZScale)
    const rOut = Math.max(minR, r + 0.004 * (Math.abs(deltaPhi) / Math.PI))
    return [rOut * Math.sin(phi), worldY, rOut * effZScale * Math.cos(phi)]
  })
}

export function placeAttachWaist(positions2D, dims, zSign = 1, pose = 'standing', foldAtBack = false, hint = null) {
  const isBriefWaist = hint?.briefRiseCm != null
  const riseT = isBriefWaist ? clamp((hint.briefRiseCm - 7) / 11, 0, 1) : 1
  const briefTopWorldY = dims.hipY + dims.span * lerp(hint?.hasBriefLeg ? 0.11 : 0.08, 0.28, riseT)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const topWorldY = isBriefWaist
    ? (hint?.sewnBriefWaist ? briefTopWorldY + cm(Math.max(0, maxY - minY)) : (briefTopWorldY + 0.002))
    : (dims.hipY + dims.span * 0.44)
  const zScale = dims.female ? 0.72 : 0.78
  const cx = bboxCenterX(positions2D)
  const halfW = Math.max(0, 0.5 * (maxX - minX))
  const panelHeightCm = Math.max(1, maxY - minY)
  const isPeplum = hint?.schemaRole === 'peplum-front' || hint?.schemaRole === 'peplum-back'
  const peplumBinHW = isPeplum ? computeSmoothedRowHalfWidths(positions2D, minY, panelHeightCm, cx) : null
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm - minY)
    // Keep 1.21 * zScale at waist (satisfying elliptical waist ring pin/test), then blend
    // to 1.135 * 0.94 below hipY so long peplums/overskirts (`womens_dress` `skirt_front`)
    // drape flush against `frontPanel` (1.13 * 0.94) instead of ballooning out in front.
    const hipBlend = smoothstep(dims.hipY + dims.span * 0.12, dims.hipY - dims.span * 0.08, worldY)
    const scaleFactor = isBriefWaist ? (hint?.sewnBriefWaist ? 1.028 : 1.036) : lerp(1.21, 1.135, hipBlend)
    const baseR = isBriefWaist
      ? (radiusAtHeight(dims, worldY) * scaleFactor)
      : (Math.max(dims.waistR * 0.96, radiusAtHeight(dims, worldY)) * scaleFactor)
    const effZScale = isBriefWaist ? zScale : lerp(zScale, 0.94, hipBlend)
    let x, z
    if (isBriefWaist && hint?.sewnBriefWaist && halfW > 1e-4) {
      // Unsewn-end-at-x=0 -> left hip (-PI/2), mid-front at u=0.25 (0), right hip at u=0.5 (+PI/2), mid-back at u=0.75 (PI)
      const u = clamp((xCm - minX) / (2 * halfW), 0, 1)
      const phi = (u - 0.25) * 2 * Math.PI
      x = baseR * Math.sin(phi)
      z = baseR * effZScale * Math.cos(phi)
    } else if (isBriefWaist && halfW > 1e-4) {
      const frac = clamp((xCm - cx) / halfW, -1, 1)
      const phi = frac * Math.PI * 0.995
      const rOut = baseR + 0.002
      x = rOut * Math.sin(phi)
      z = rOut * effZScale * Math.cos(phi)
    } else if (isPeplum && peplumBinHW) {
      const rowHW = Math.max(1e-2, sampleRowHalfW(peplumBinHW, yCm, minY, panelHeightCm, halfW))
      const phi = clamp(((xCm - cx) / rowHW) * Math.PI * 0.50, -Math.PI * 0.50, Math.PI * 0.50)
      x = baseR * Math.sin(phi)
      z = zSign * baseR * effZScale * Math.cos(phi)
    } else if (foldAtBack && halfW > 1e-4) {
      const frac = clamp(Math.abs(xCm - cx) / halfW, 0, 1)
      const phi = (xCm >= cx ? 1 : -1) * Math.PI * (1 - frac)
      const rOut = baseR + 0.003 * frac
      x = rOut * Math.sin(phi)
      z = rOut * effZScale * Math.cos(phi)
    } else {
      const rEff = baseR * (1 + effZScale) * 0.5
      const phi = clamp(cm(xCm - cx) / rEff, -Math.PI * 0.96, Math.PI * 0.96)
      const rOut = baseR + 0.006 + 0.003 * (Math.abs(phi) / Math.PI)
      x = rOut * Math.sin(phi)
      z = zSign * rOut * effZScale * Math.cos(phi)
    }
    return applySeatedSkirtDrape(x, worldY, z, dims, zSign, pose)
  })
}

export function placeAttachHem(positions2D, dims, side = 0, pose = 'standing', hint = null) {
  if (hint?.isLegOpeningElastic) {
    const sSide = side === 0 ? 1 : side
    let minX = Infinity, maxX = -Infinity, minY = Infinity
    for (const [x, y] of positions2D) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
    }
    const widthCm = Math.max(1e-4, maxX - minX)
    const topY = minY
    const zScale = dims.female ? 0.72 : 0.78
    const riseT = clamp(((hint.briefRiseCm ?? 12) - 7) / 11, 0, 1)
    const crotchWorldY = dims.hipY - dims.span * 0.188
    const maxCrotchZ = dims.hipR * zScale * 0.42

    if (hint.hasBriefLeg) {
      const legDrop = clamp(0.205 + (cm(hint.legExtCm || 5) / Math.max(0.20, dims.span)) * 0.36, 0.215, 0.32)
      const hemWorldY = dims.hipY - dims.span * legDrop
      const joints = computeMannequinPoseJoints(dims, pose)
      const leg = joints.legs[sSide]
      const tLeg = clamp((leg.hip[1] - hemWorldY) / Math.max(0.15, leg.hip[1] - leg.knee[1]), 0, 0.45)
      const legCenter = lerp3(leg.hip, leg.knee, tLeg)
      const rxT = Math.min(dims.thighR * 0.94, Math.abs(leg.hip[0]) * 0.92) * 1.028 + 0.003
      const rzT = dims.thighR * 0.96 * 1.028 + 0.003
      return positions2D.map(([xCm, yCm]) => {
        const uRaw = clamp((xCm - minX) / widthCm, 0, 1)
        const uAlong = sSide > 0 ? uRaw : 1 - uRaw
        // Wrap full 360 around thigh cuff: 0 = lateral outseam (+X), 0.25 = front, 0.5 = medial inseam, 0.75 = back, 1 = outseam
        const ang = uAlong * 2 * Math.PI
        const thetaT = Math.PI * 0.5 - ang
        const yOff = -cm(yCm - topY) * 0.75
        return [
          legCenter[0] + sSide * rxT * Math.sin(thetaT),
          hemWorldY + yOff,
          legCenter[2] + rzT * Math.cos(thetaT),
        ]
      })
    }

    const sideBotY = dims.hipY + dims.span * lerp(-0.02, 0.06, riseT)
    return positions2D.map(([xCm, yCm]) => {
      const uRaw = clamp((xCm - minX) / widthCm, 0, 1)
      const uAlong = sSide > 0 ? uRaw : 1 - uRaw
      const ang = uAlong * 2 * Math.PI
      const tCurve = 0.5 * (1 - Math.cos(ang))
      const yBase = lerp(sideBotY, crotchWorldY, Math.sin(tCurve * Math.PI * 0.5))
      const y = yBase - cm(yCm - topY) * 0.70
      const theta = (Math.pow(Math.max(0, 1 - tCurve), 1.35) * 0.86 + 0.14) * Math.PI * 0.5
      const zSignHem = Math.sin(ang) >= 0 ? 1 : -1
      const pelvR = radiusAtHeight(dims, Math.max(dims.hipY - dims.span * 0.02, yBase)) * (zSignHem < 0 ? 1.072 : 1.042)
      const zFade = smoothstep(0, 0.18, Math.abs(Math.sin(ang)))
      const xPelv = sSide * pelvR * Math.sin(theta)
      const zPelv = zSignHem * pelvR * zScale * Math.cos(theta) * zFade
      const xBlend = smoothstep(0.22, 1.0, tCurve)
      const zBlend = smoothstep(zSignHem < 0 ? 0.64 : 0.52, 1.0, tCurve)
      return [
        lerp(xPelv, sSide * dims.hipR * 0.14, xBlend),
        y,
        lerp(zPelv, zSignHem * maxCrotchZ * zFade, zBlend),
      ]
    })
  }

  if (hint?.isSkirtTier) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, y] of positions2D) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    const widthCm = Math.max(1e-4, maxX - minX)
    const heightCm = Math.max(4, maxY - minY)
    const tierIdx = hint.tierIndex ?? 0
    const tierHWorld = cm(heightCm) * 0.88
    const baseTopY = (dims.hipY + dims.span * 0.44) + (hint.hasUpperBodice ? 0.025 : 0)
    const tierTopY = baseTopY - tierIdx * tierHWorld * 0.78
    const zScale = dims.female ? 0.78 : 0.82
    return positions2D.map(([xCm, yCm]) => {
      const uX = clamp((xCm - minX) / widthCm, 0, 1)
      const uY = clamp((yCm - minY) / heightCm, 0, 1)
      const worldY = tierTopY - cm(yCm - minY) * 0.90
      const theta = (uX - 0.5) * 2 * Math.PI
      const effZ = lerp(zScale, 0.95, smoothstep(dims.hipY + dims.span * 0.10, dims.hipY - dims.span * 0.10, worldY))
      const rOut = Math.max(dims.waistR * 1.06, radiusAtHeight(dims, Math.max(dims.hipY, worldY))) * (1.16 + tierIdx * 0.07 + uY * 0.12)
      return applySeatedSkirtDrape(rOut * Math.sin(theta), worldY, rOut * effZ * Math.cos(theta), dims, Math.cos(theta) >= 0 ? 1 : -1, pose)
    })
  }

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

export function placeAttachBody(positions2D, dims, zSign = 1, side = 0) {
  let minY = Infinity, maxY = -Infinity
  for (const [, y] of positions2D) { if (y < minY) minY = y; if (y > maxY) maxY = y }
  const isFullLining = (maxY - minY) > 25
  const isSingleBackCenter = zSign < 0 && side === 0
  const topWorldY = isFullLining
    ? (dims.shoulderY - dims.span * 0.035)
    : isSingleBackCenter
      ? (dims.shoulderY - dims.span * 0.06)
      : (dims.hipY + dims.span * 0.34)
  const zScale = dims.female ? 0.80 : 0.84
  const cx = bboxCenterX(positions2D)
  const effSide = (isFullLining || isSingleBackCenter) ? side : (side !== 0 ? side : 0.48)
  const thetaCenter = effSide * Math.PI * 0.40
  const scale = isFullLining ? 1.085 : 1.235
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm - minY)
    const baseR = Math.max(dims.chestR * 0.90, radiusAtHeight(dims, worldY)) * scale
    const rEff = baseR * (1 + zScale) * 0.5
    const phi = thetaCenter + cm(xCm - cx) / rEff
    const minR = (dims.neckR * 1.24) / zScale
    const rOut = Math.max(minR, baseR + 0.003 * (Math.abs(phi) / Math.PI))
    return [rOut * Math.sin(phi), worldY, zSign * rOut * zScale * Math.cos(phi)]
  })
}

export function placeAttachCrotch(positions2D, dims, hint = null) {
  const cx = bboxCenterX(positions2D)
  let minY = Infinity, maxY = -Infinity
  for (const [, y] of positions2D) { if (y < minY) minY = y; if (y > maxY) maxY = y }
  const h = Math.max(1e-4, maxY - minY)
  const saddleY = dims.hipY - dims.span * 0.188 + (hint?.layerOffset || 0)
  const zScale = dims.female ? 0.72 : 0.78
  const maxZ = dims.hipR * zScale * 0.42
  return positions2D.map(([xCm, yCm]) => {
    const u = (yCm - minY) / h // 0 front -> 0.5 saddle bottom -> 1 back
    const arch = Math.sin(Math.PI * u)
    const y = saddleY + (1 - arch) * dims.span * 0.010
    const z = lerp(maxZ, -maxZ, u)
    const x = clamp(cm(xCm - cx), -dims.hipR * 0.24, dims.hipR * 0.24)
    return [x, y, z]
  })
}

export function placeAttachWrist(positions2D, dims, side = 1, pose = 'standing') {
  const s = side === 0 ? 1 : side
  const cx = bboxCenterX(positions2D)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const widthCm = Math.max(12, maxX - minX)
  const bandH = cm(maxY - minY)
  const joints = computeMannequinPoseJoints(dims, pose)
  const arm = joints.arms[s]
  const dx = arm.wrist[0] - arm.elbow[0], dy = arm.wrist[1] - arm.elbow[1], dz = arm.wrist[2] - arm.elbow[2]
  const len = Math.hypot(dx, dy, dz) || 1
  const dir = [dx / len, dy / len, dz / len]
  let fx = -dir[0] * dir[2], fy = -dir[1] * dir[2], fz = 1 - dir[2] * dir[2]
  const fl = Math.hypot(fx, fy, fz) || 1
  fx /= fl; fy /= fl; fz /= fl
  let ox = s * (fy * dir[2] - fz * dir[1]), oy = s * (fz * dir[0] - fx * dir[2]), oz = s * (fx * dir[1] - fy * dir[0])
  const ol = Math.hypot(ox, oy, oz) || 1
  ox /= ol; oy /= ol; oz /= ol
  const cuffR = dims.upperR * 0.68 + 0.014
  return positions2D.map(([xCm, yCm]) => {
    const uFromBot = bandH * 0.78 - cm(yCm - minY)
    const cxPt = arm.wrist[0] - dir[0] * uFromBot
    const cyPt = arm.wrist[1] - dir[1] * uFromBot
    const czPt = arm.wrist[2] - dir[2] * uFromBot
    const alpha = clamp((xCm - cx) / Math.max(1e-4, 0.5 * widthCm), -1, 1) * Math.PI * 0.98
    const cOut = cuffR * Math.cos(alpha)
    const cFront = -s * cuffR * Math.sin(alpha)
    return [cxPt + cOut * ox + cFront * fx, cyPt + cOut * oy + cFront * fy, czPt + cOut * oz + cFront * fz]
  })
}

export function placeAttachHemBand(positions2D, dims, pose = 'standing') {
  const topWorldY = dims.hipY + dims.span * 0.10
  const zScale = dims.female ? 0.72 : 0.78
  const cx = bboxCenterX(positions2D)
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const rOut = Math.max(dims.waistR * 1.02, radiusAtHeight(dims, worldY)) * 1.16
    const rEff = rOut * (1 + zScale) * 0.5
    const phi = cm(xCm - cx) / Math.max(0.05, rEff)
    const x = rOut * Math.sin(phi)
    const z = rOut * zScale * Math.cos(phi)
    return applySeatedSkirtDrape(x, worldY, z, dims, Math.cos(phi) >= 0 ? 1 : -1, pose)
  })
}

export function placeAttachBust(positions2D, dims, side = 0) {
  const cx = bboxCenterX(positions2D)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const halfW = Math.max(1, 0.5 * (maxX - minX))
  const spanY = Math.max(1, maxY - minY)
  const underbustY = dims.hipY + dims.span * 0.60
  if (side === 0) {
    const topWorldY = dims.hipY + dims.span * 0.705
    const zScale = dims.female ? 0.80 : 0.82
    return positions2D.map(([xCm, yCm]) => {
      const uY = clamp((yCm - minY) / spanY, 0, 1)
      const worldY = lerp(topWorldY, underbustY, uY)
      const baseR = Math.max(dims.chestR * 0.96, radiusAtHeight(dims, worldY)) * 1.048
      const rEff = baseR * (1 + zScale) * 0.5
      const phi = cm(xCm - cx) / Math.max(0.05, rEff)
      return [baseR * Math.sin(phi), worldY, baseR * zScale * Math.cos(phi)]
    })
  }
  const topWorldY = Math.min(dims.hipY + dims.span * 0.795, underbustY + cm(spanY) * 0.85)
  const zScale = dims.female ? 0.82 : 0.82
  const thetaCenter = side * 0.42
  return positions2D.map(([xCm, yCm]) => {
    const uY = clamp((yCm - minY) / spanY, 0, 1)
    const worldY = lerp(topWorldY, underbustY - 0.002, uY)
    const uX = clamp((xCm - cx) / halfW, -1, 1)
    const cupDome = Math.sin(uY * Math.PI) * Math.cos(uX * Math.PI * 0.5)
    const baseR = Math.max(dims.chestR * 0.98, radiusAtHeight(dims, worldY)) * 1.052 + (dims.female ? 0.010 + 0.015 * cupDome : 0.005)
    const rEff = baseR * (1 + zScale) * 0.5
    const phi = thetaCenter + clamp(cm(xCm - cx) / Math.max(0.05, rEff), -0.45, 0.45)
    return [baseR * Math.sin(phi), worldY, baseR * zScale * Math.cos(phi)]
  })
}

export function placeAttachUnderbust(positions2D, dims, side = 0, hint = null) {
  const zScale = dims.female ? 0.76 : 0.80
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const widthCm = Math.max(1e-4, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  if (hint?.sewnSportBand) {
    const bandTopY = dims.hipY + dims.span * 0.575
    return positions2D.map(([xCm, yCm]) => {
      const u = clamp((xCm - minX) / widthCm, 0, 1)
      const phi = (u - 0.25) * 2 * Math.PI
      const worldY = bandTopY - cm(yCm - minY) * 0.85
      const baseR = Math.max(dims.waistR * 1.01, radiusAtHeight(dims, worldY)) * 1.036
      return [baseR * Math.sin(phi), worldY, baseR * zScale * Math.cos(phi)]
    })
  }
  const topWorldY = dims.hipY + dims.span * (side === 0 ? 0.625 : 0.655)
  const cx = 0.5 * (minX + maxX)
  const thetaCenter = side === 0 ? 0 : side * Math.PI * 0.64
  const vertScale = spanY > 9 ? 0.82 : 0.90
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm - minY) * vertScale
    const baseR = Math.max(dims.waistR * 1.00, radiusAtHeight(dims, worldY)) * 1.042
    const rEff = baseR * (1 + zScale) * 0.5
    const phi = thetaCenter + clamp(cm(xCm - cx) / Math.max(0.05, rEff), -0.62 * Math.PI, 0.62 * Math.PI)
    return [baseR * Math.sin(phi), worldY, baseR * zScale * Math.cos(phi)]
  })
}

export function placeAttachStrap(positions2D, dims, side = 1) {
  const s = side === 0 ? 1 : side
  const cx = bboxCenterX(positions2D)
  let minY = Infinity, maxY = -Infinity
  for (const [, y] of positions2D) { if (y < minY) minY = y; if (y > maxY) maxY = y }
  const h = Math.max(1e-4, maxY - minY)
  const frontY = dims.hipY + dims.span * 0.765
  const topY = dims.shoulderY + dims.span * (dims.kid ? 0.022 : 0.008)
  const backY = dims.hipY + dims.span * 0.640
  const strapXBase = s * clamp(dims.neckR * 1.55, dims.neckR * 1.35, dims.chestR * 0.52)
  return positions2D.map(([xCm, yCm]) => {
    const u = (yCm - minY) / h // 0 = front cup apex -> 0.5 = shoulder crest -> 1 = back band
    let y, z
    if (u <= 0.5) {
      const f = u / 0.5
      y = lerp(frontY, topY, f)
      z = lerp(dims.chestR * (dims.female ? 0.70 : 0.74), 0.004, Math.pow(f, 1.3))
    } else {
      const f = (u - 0.5) / 0.5
      y = lerp(topY, backY, f)
      z = lerp(0.004, -dims.chestR * 0.64, Math.pow(f, 0.77))
    }
    return [strapXBase + cm(xCm - cx), y, z]
  })
}

export function placePiece(triangulated, dims, pose = 'standing') {
  const { pieceId, role, positions2D, placementHint } = triangulated
  const side = (pieceId.endsWith('L') || pieceId.endsWith('_l')) ? -1 : 1
  const attachSide = (pieceId.endsWith('L') || pieceId.endsWith('_l')) ? -1
    : (pieceId.endsWith('R') || pieceId.endsWith('_r')) ? 1 : 0
  const siblingEase = (placementHint && typeof placementHint.index === 'number') ? placementHint.index * 0.095 : 0
  const splitSide = placementHint?.splitSide || 0
  const princessSide = placementHint?.princessSide || 0
  if (role === 'frontPanel') return placeTorsoPanel(positions2D, dims, { zSign: 1, easeFactor: 1.13 + siblingEase, pose, splitSide, princessSide, hint: placementHint })
  if (role === 'backPanel') return placeTorsoPanel(positions2D, dims, { zSign: -1, easeFactor: 1.13 + siblingEase, pose, splitSide, princessSide, hint: placementHint })
  if (role === 'sleeve') return placeSleeve(positions2D, dims, side, 1.15, pose, placementHint?.tubeHalf || null, placementHint?.capOffsetCm || 0)
  if (role === 'hipPanelFront') return placeHipPanel(positions2D, dims, { zSign: 1, easeFactor: 1.16 + siblingEase, pose, hint: placementHint })
  if (role === 'hipPanelBack') return placeHipPanel(positions2D, dims, { zSign: -1, easeFactor: 1.16 + siblingEase, pose, hint: placementHint })
  if (role === 'legFront') return placeLegPanel(positions2D, dims, { side, zSign: 1, easeFactor: 1.16, pose, hint: placementHint })
  if (role === 'legBack') return placeLegPanel(positions2D, dims, { side, zSign: -1, easeFactor: 1.20, pose, hint: placementHint })
  if (role === 'goreFront') return placeGorePanel(positions2D, dims, 0, pose, placementHint?.goreSpan || GORE_ANGLE)
  if (role === 'goreBack') return placeGorePanel(positions2D, dims, Math.PI, pose, placementHint?.goreSpan || GORE_ANGLE)
  if (role === 'goreSideLeft') return placeGorePanel(positions2D, dims, -Math.PI / 2, pose, placementHint?.goreSpan || GORE_ANGLE)
  if (role === 'goreSideRight') return placeGorePanel(positions2D, dims, Math.PI / 2, pose, placementHint?.goreSpan || GORE_ANGLE)
  if (role === 'attachNeck') return placeAttachNeck(positions2D, dims, attachSide, placementHint?.neckKind || null)
  if (role === 'attachWaist') return placeAttachWaist(positions2D, dims, 1, pose, Boolean(placementHint?.foldAtBack), placementHint)
  if (role === 'attachWaistBack') return placeAttachWaist(positions2D, dims, -1, pose, Boolean(placementHint?.foldAtBack), placementHint)
  if (role === 'attachHem') return placeAttachHem(positions2D, dims, attachSide, pose, placementHint)
  if (role === 'attachHemBand') return placeAttachHemBand(positions2D, dims, pose)
  if (role === 'attachCrotch') return placeAttachCrotch(positions2D, dims, placementHint)
  if (role === 'attachWrist') return placeAttachWrist(positions2D, dims, attachSide || 1, pose)
  if (role === 'attachBust') return placeAttachBust(positions2D, dims, attachSide)
  if (role === 'attachUnderbust') return placeAttachUnderbust(positions2D, dims, attachSide, placementHint)
  if (role === 'attachStrap') return placeAttachStrap(positions2D, dims, attachSide || 1)
  if (role === 'attachBody') return placeAttachBody(positions2D, dims, 1, attachSide)
  if (role === 'attachBodyBack') return placeAttachBody(positions2D, dims, -1, attachSide)
  throw new Error(`placePiece: no placement heuristic for role "${role}"`)
}
