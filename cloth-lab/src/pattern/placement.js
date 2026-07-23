// Initial 3D placement heuristics — one per piece role, driven by the same
// computeBodyDims() output the avatar mesh uses. Placement only needs to be
// close, non-self-intersecting, and outward-facing: constraint relaxation
// (once the cloth sim is running) pulls welded seams the rest of the way
// together over the first several frames — it does not need to register
// with drafting precision.
const cm = (v) => v * 0.01
const lerp = (a, b, t) => a + (b - a) * t

// Body radius BELOW the hip (thigh region) — radiusAtHeight's own hip-and-up
// keypoints stop at the hip, so anything placed lower needs the profile to
// keep going down toward the thigh instead of assuming a flat hipR forever.
export function radiusBelowHip(dims, worldY) {
  const { hipY, hipR, thighR, legLen } = dims
  const yThigh = hipY - legLen * 0.15
  if (worldY >= hipY) return hipR
  if (worldY >= yThigh) return lerp(hipR, thighR, (hipY - worldY) / (hipY - yThigh))
  return thighR
}

// Body radius at a given world height (meters), interpolated between the
// same keypoints torsoProfile() lathes through, so placement and the visible
// avatar mesh always agree on "where the surface is." Delegates below the
// hip rather than assuming a flat hipR forever down — a garment's own hem
// can land there even when the garment itself is otherwise a torso panel
// (checked empirically: the T-shirt's hem does, for the default measurements
// here), and the real body (and collision rig) narrows sharply below the
// hip, not staying at full hipR — a flat assumption there placed the hem at
// nearly double the true collision radius, so it free-fell with nothing
// resting against it from frame 1.
export function radiusAtHeight(dims, worldY) {
  const { hipY, shoulderY, span, chestR, waistR, hipR } = dims
  const yWaist = hipY + span * 0.44
  const yChest = hipY + span * 0.76
  const yShoulder = shoulderY - span * 0.03
  if (worldY <= hipY) return radiusBelowHip(dims, worldY)
  if (worldY <= yWaist) return lerp(hipR, waistR, (worldY - hipY) / (yWaist - hipY))
  if (worldY <= yChest) return lerp(waistR, chestR, (worldY - yWaist) / (yChest - yWaist))
  if (worldY <= yShoulder) return lerp(chestR, chestR * 0.95, (worldY - yChest) / (yShoulder - yChest))
  return chestR * 0.9
}

// Front/back torso panels: cylindrical wrap. Local Y (cm, 0=shoulder,
// growing downward) maps to world height; local X (cm, center=0) maps to an
// angle around the torso's per-height radius, limited to a frontal (or
// back) arc rather than wrapping the full circumference.
export function placeTorsoPanel(positions2D, dims, { zSign, easeFactor = 1.1, angleSpan = Math.PI * 0.85 } = {}) {
  const topWorldY = dims.shoulderY - dims.span * 0.03
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const r = radiusAtHeight(dims, worldY) * easeFactor
    const halfCirc = Math.PI * r
    const theta = (cm(xCm) / halfCirc) * angleSpan
    return [r * Math.sin(theta), worldY, zSign * r * Math.cos(theta)]
  })
}

// Front/back hip-region panels (skirts, etc): same cylindrical-wrap idea as
// placeTorsoPanel, just anchored at the waist and extending DOWN through the
// hip into the thigh instead of anchored at the shoulder extending down
// through the chest. radiusAtHeight already delegates below the hip, so this
// needs no special-case branch of its own.
export function placeHipPanel(positions2D, dims, { zSign, easeFactor = 1.15, angleSpan = Math.PI * 0.85 } = {}) {
  const topWorldY = dims.hipY + dims.span * 0.44 // waist height — matches radiusAtHeight's own waist keypoint
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const r = radiusAtHeight(dims, worldY) * easeFactor
    const halfCirc = Math.PI * r
    const theta = (cm(xCm) / halfCirc) * angleSpan
    return [r * Math.sin(theta), worldY, zSign * r * Math.cos(theta)]
  })
}

// Sleeves: roll into a tube around the arm's long axis, hanging from the
// shoulder point at a slight outward lean (a fixed, simple rest pose). Radius
// TAPERS along the arm (upperR at the shoulder down to upperR*0.55 at the
// wrist) rather than staying constant — matching the arm collision capsule's
// own taper (collisionRig.js). A constant radius left a cuff placed far
// outside the true (narrower) arm surface there, the same "flat placement
// vs. tapered collision" mismatch the torso hem had.
export function placeSleeve(positions2D, dims, side /* -1 = left, +1 = right */, easeFactor = 1.15) {
  const shoulderWorldY = dims.shoulderY - dims.span * 0.04
  const shoulderWorldX = side * dims.shoulderHalf * 0.95
  const leanOut = side * 0.12 // radians, arm slightly away from torso
  return positions2D.map(([xCm, yCm]) => {
    const alongArm = cm(yCm)
    const t = Math.min(1, alongArm / dims.armLen)
    const radius = lerp(dims.upperR, dims.upperR * 0.55, t) * easeFactor
    const circumference = 2 * Math.PI * radius
    const phi = (cm(xCm) / circumference) * 2 * Math.PI
    const localX = radius * Math.sin(phi)
    const localZ = radius * Math.cos(phi)
    const worldY = shoulderWorldY - alongArm * Math.cos(leanOut)
    const worldX = shoulderWorldX + side * alongArm * Math.sin(leanOut) + localX * Math.cos(leanOut)
    return [worldX, worldY, localZ]
  })
}

// Dispatch by piece role + id (sleeveL/sleeveR need opposite `side`).
export function placePiece(triangulated, dims) {
  const { pieceId, role, positions2D } = triangulated
  if (role === 'frontPanel') return placeTorsoPanel(positions2D, dims, { zSign: 1 })
  if (role === 'backPanel') return placeTorsoPanel(positions2D, dims, { zSign: -1 })
  if (role === 'sleeve') return placeSleeve(positions2D, dims, pieceId.endsWith('L') ? -1 : 1)
  if (role === 'hipPanelFront') return placeHipPanel(positions2D, dims, { zSign: 1 })
  if (role === 'hipPanelBack') return placeHipPanel(positions2D, dims, { zSign: -1 })
  throw new Error(`placePiece: no placement heuristic for role "${role}"`)
}
