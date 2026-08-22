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
    // `leanOut` already carries the per-side sign (side * 0.12), and Math.sin
    // is odd, so Math.sin(leanOut) is itself already signed correctly per
    // side — multiplying by `side` again here squares it back to +1 and
    // cancels the sign, pushing BOTH arms toward the same absolute X
    // direction as you go down the arm instead of mirroring outward. That
    // left one side's sleeve curving in toward the torso/centerline instead
    // of hanging away from the body (reported: a sleeve visibly bending
    // toward the lower body while the actual arm underneath stays straight).
    const worldX = shoulderWorldX + alongArm * Math.sin(leanOut) + localX * Math.cos(leanOut)
    return [worldX, worldY, localZ]
  })
}

// Gore panel: a radial wedge placed at a FIXED angular slot around the hip/
// hem circumference (front centered at 0°, back at 180°, sides at ±90°),
// each spanning a fixed angular width — not chained to its neighbor gores'
// actual computed edges (see placement.js's own header comment: placement
// only needs to be close and non-overlapping, constraint relaxation does
// the rest). Four fixed slots because that's the real vocabulary every
// gored-skirt Fancy Collection design uses (front/back/side-left/side-
// right), not a generalized N-gore scheme — see pattern/roles.js.
const GORE_ANGLE = Math.PI * 0.42 // half-width per gore slot — 4 slots cover most of the circumference with small honest gaps, not full overlap
export function placeGorePanel(positions2D, dims, angleCenter) {
  const topWorldY = dims.hipY + dims.span * 0.44 // waist height, matches placeHipPanel's own anchor
  const xs = positions2D.map(([x]) => x)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const width = Math.max(1e-6, maxX - minX)
  const ys = positions2D.map(([, y]) => y)
  const hemReachCm = Math.max(1e-6, Math.max(...ys) - Math.min(...ys))
  const hipEdgeR = radiusAtHeight(dims, dims.hipY) * 1.1
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    // Above the hip, follow the body profile like any other panel. Below
    // it, radiusAtHeight collapses toward the (much narrower) thigh/leg
    // radius — right for a body-hugging panel, wrong for a gore, which is
    // cut wider toward its hem specifically so it flares AWAY from the
    // body once it hangs. Anchor at the hip radius and grow outward with
    // how far down the panel's own pattern reaches instead of tracking
    // the leg surface, or the hem ends up placed inside the leg mesh —
    // occluded and invisible, not just badly draped.
    const r = worldY >= dims.hipY
      ? radiusAtHeight(dims, worldY) * 1.1
      : lerp(hipEdgeR, hipEdgeR * 1.9, Math.min(1, (dims.hipY - worldY) / cm(hemReachCm)))
    const t = (xCm - minX) / width // 0..1 across the wedge's own width
    const theta = angleCenter + (t - 0.5) * GORE_ANGLE
    return [r * Math.sin(theta), worldY, r * Math.cos(theta)]
  })
}

// ---------------- WP-6 attachment placements ----------------
// These cover roles that get a reasonable position but no auto-seam this
// pass (collar/hood/cape/yoke/waistband/peplum/sash/godet/tier/pocket/
// facing/lining/cuff — see pattern/roles.js's own header comment for why).
// All are simple, closed-form functions of `dims` + a small per-role
// vertical/depth offset and a `side` for bilateral pieces (hood/godet) —
// deliberately not "walk the seam graph and align to a neighbor's computed
// edge," which would need a real rigid-alignment (Procrustes) solve for a
// benefit placement.js's own header comment already says isn't needed
// ("does not need to register with drafting precision").
const bboxCenterX = (positions2D) => {
  let minX = Infinity, maxX = -Infinity
  for (const [x] of positions2D) { if (x < minX) minX = x; if (x > maxX) maxX = x }
  return (minX + maxX) / 2
}

// Neckline-attached: collar/hood/cape/yoke — centered at the neck, small
// forward offset so it doesn't z-fight the bodice, hanging down over the
// piece's own local Y extent.
export function placeAttachNeck(positions2D, dims, side = 0) {
  const worldY = dims.shoulderY + dims.span * 0.02
  const cx = bboxCenterX(positions2D)
  const zOffset = 0.02
  return positions2D.map(([xCm, yCm]) => [
    cm(xCm - cx) + side * dims.shoulderHalf * 0.5,
    worldY - cm(yCm),
    zOffset,
  ])
}

// Waist-attached: waistband/peplum/sash — centered at the waist.
export function placeAttachWaist(positions2D, dims, zSign = 1) {
  const worldY = dims.hipY + dims.span * 0.44
  const cx = bboxCenterX(positions2D)
  return positions2D.map(([xCm, yCm]) => [cm(xCm - cx), worldY - cm(yCm), zSign * 0.02])
}

// Hem-attached: godet/tier — centered at the garment hem height, hanging down.
export function placeAttachHem(positions2D, dims, side = 0) {
  const worldY = dims.hipY - dims.legLen * 0.1
  const cx = bboxCenterX(positions2D)
  return positions2D.map(([xCm, yCm]) => [
    cm(xCm - cx) + side * dims.hipR * 0.6,
    worldY - cm(yCm),
    0.02,
  ])
}

// Generic small body accessory: pocket/facing/lining/cuff — placed near
// chest height, slightly recessed so linings sit behind the shell.
export function placeAttachBody(positions2D, dims, zSign = 1) {
  const worldY = dims.hipY + dims.span * 0.6
  const cx = bboxCenterX(positions2D)
  return positions2D.map(([xCm, yCm]) => [cm(xCm - cx), worldY - cm(yCm), zSign * 0.015])
}

// Dispatch by piece role + id (sleeveL/sleeveR, and WP-6's bilateral-
// duplicated `_l`/`_r` suffixes, need opposite `side`). `*Back` variants of
// the attachment roles are distinct role strings (not a boolean field)
// specifically so triangulate.js's {pieceId,role,positions2D,...} shape
// (used unmodified) never needs a new field threaded through it.
export function placePiece(triangulated, dims) {
  const { pieceId, role, positions2D, placementHint } = triangulated
  const side = (pieceId.endsWith('L') || pieceId.endsWith('_l')) ? -1 : 1
  // Same-slot siblings (importFromApp.js's placementHint: pieces the
  // importer recognized as e.g. "front" but had no way to tell apart —
  // see that file's own header on why it no longer just drops all but
  // the first one) get progressively more ease so they don't sit at the
  // exact same radius as each other. This isn't a real anatomical
  // placement — nothing here knows which panel actually belongs where —
  // it's just enough separation that every recognized piece is visible
  // (and individually selectable/seamable in the Seam editor) instead of
  // later ones being hidden exactly behind the first.
  const siblingEase = placementHint ? placementHint.index * 0.08 : 0
  if (role === 'frontPanel') return placeTorsoPanel(positions2D, dims, { zSign: 1, easeFactor: 1.1 + siblingEase })
  if (role === 'backPanel') return placeTorsoPanel(positions2D, dims, { zSign: -1, easeFactor: 1.1 + siblingEase })
  if (role === 'sleeve') return placeSleeve(positions2D, dims, side)
  if (role === 'hipPanelFront') return placeHipPanel(positions2D, dims, { zSign: 1, easeFactor: 1.15 + siblingEase })
  if (role === 'hipPanelBack') return placeHipPanel(positions2D, dims, { zSign: -1, easeFactor: 1.15 + siblingEase })
  if (role === 'goreFront') return placeGorePanel(positions2D, dims, 0)
  if (role === 'goreBack') return placeGorePanel(positions2D, dims, Math.PI)
  if (role === 'goreSideLeft') return placeGorePanel(positions2D, dims, -Math.PI / 2)
  if (role === 'goreSideRight') return placeGorePanel(positions2D, dims, Math.PI / 2)
  if (role === 'attachNeck') return placeAttachNeck(positions2D, dims, side)
  if (role === 'attachWaist') return placeAttachWaist(positions2D, dims, 1)
  if (role === 'attachWaistBack') return placeAttachWaist(positions2D, dims, -1)
  if (role === 'attachHem') return placeAttachHem(positions2D, dims, side)
  if (role === 'attachBody') return placeAttachBody(positions2D, dims, 1)
  if (role === 'attachBodyBack') return placeAttachBody(positions2D, dims, -1)
  throw new Error(`placePiece: no placement heuristic for role "${role}"`)
}
