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

// WP-59: a trouser leg panel — half-tube wrap like placeTorsoPanel/
// placeHipPanel, but centered on the LEG's own axis (offset to its own
// side of the centerline, side * hipR * 0.55 — legs sit side-by-side, not
// stacked on the body centerline the way a torso/hip panel does) and
// tapered down the thigh (thighR at the waist down to thighR*0.4 at the
// hem) instead of following the body's own torso/hip radius profile.
// `js/fancy-patterns.js`'s trouserPanel() drafts ONE leg (from the waist
// down through the crotch-adjacent rise to the hem) meant to be cut 2,
// mirrored — the SAME "cut 2" convention placeSleeve's single arm shape
// already gets via bilateral duplication, reused here rather than
// inventing a second mechanism. Not the full legProfile() lathe curve
// (bicep/calf swell, knee pinch) — same reasoning placeSleeve gives for
// its own simplified linear taper: placement only needs to be close,
// non-self-intersecting and outward-facing, constraint relaxation does
// the rest once the sim is running.
export function placeLegPanel(positions2D, dims, { side, zSign, easeFactor = 1.15, angleSpan = Math.PI * 0.98 } = {}) {
  const waistWorldY = dims.hipY + dims.span * 0.44
  const waistWorldX = side * dims.hipR * 0.55
  const legPatternLen = dims.legLen + dims.span * 0.2 // rise (waist-to-crotch) + inseam, close enough for placement
  let minX = Infinity, maxX = -Infinity
  for (const [x] of positions2D) { if (x < minX) minX = x; if (x > maxX) maxX = x }
  const centerX = Number.isFinite(minX) ? (minX + maxX) / 2 : 0
  return positions2D.map(([xCm, yCm]) => {
    const alongLeg = cm(yCm)
    const t = Math.min(1, Math.max(0, alongLeg / legPatternLen))
    const r = lerp(dims.thighR, dims.thighR * 0.4, t) * easeFactor
    const halfCirc = Math.PI * r
    const theta = (cm(xCm - centerX) / halfCirc) * angleSpan
    const worldY = waistWorldY - alongLeg
    return [waistWorldX + r * Math.sin(theta), worldY, zSign * r * Math.cos(theta)]
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
      const worldX = shoulderWorldX + alongArm * Math.sin(leanOut) + localX * Math.cos(leanOut)
      return [worldX, worldY, localZ]
    })
  }
  // Real 2D sleeve piece: center of X (`capTop`) sits on the outer shoulder
  // (`+side * radius`), the front half (`capFront`) wraps across `+Z` toward
  // the front bodice armhole, the back half (`capBack`) wraps across `-Z`
  // toward the back bodice armhole, and the two long underarm seams meet at
  // the inner armpit (`-side * radius`) on both right (+1) and left (-1) arms.
  const cx = (minX + maxX) / 2
  const halfW = width / 2
  const shoulderWorldY = dims.shoulderY + dims.span * 0.01
  const shoulderWorldX = side * dims.shoulderHalf * 0.96
  const leanOut = side * 0.14
  return positions2D.map(([xCm, yCm]) => {
    const alongArm = cm(yCm - minY)
    const t = Math.min(1, Math.max(0, alongArm / dims.armLen))
    const radius = lerp(dims.upperR * 1.08, dims.upperR * 0.58, t) * easeFactor
    const s = Math.max(-1, Math.min(1, (xCm - cx) / halfW))
    const alpha = s * Math.PI * 0.96
    const localX = side * radius * Math.cos(alpha)
    const localZ = -side * radius * Math.sin(alpha)
    const worldY = shoulderWorldY - alongArm * Math.cos(leanOut)
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

// Neckline-attached: collar/hood/cape/yoke — wrapped cylindrically around
// the neck/collarbone outside the neck and upper-torso collision capsules so
// wide collars, capes, and yokes drape over the shoulders rather than
// spawning flat at z=0.02 inside the throat.
export function placeAttachNeck(positions2D, dims, side = 0) {
  const topWorldY = dims.shoulderY + dims.span * 0.025
  const yShoulder = dims.shoulderY - dims.span * 0.03
  const cx = bboxCenterX(positions2D)
  const thetaCenter = side * Math.PI * 0.45
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const baseR = worldY >= yShoulder
      ? lerp(dims.chestR * 1.16, dims.neckR * 1.35, Math.min(1, (worldY - yShoulder) / (topWorldY - yShoulder)))
      : radiusAtHeight(dims, worldY) * 1.18
    const r = Math.max(dims.neckR * 1.35, baseR)
    const phi = thetaCenter + cm(xCm - cx) / r
    const rOut = r + 0.006 * (Math.abs(phi) / Math.PI)
    return [rOut * Math.sin(phi), worldY, rOut * Math.cos(phi)]
  })
}

// Waist-attached: waistband/peplum/sash — wrapped around the elliptical
// waist surface outside the collision capsule (and within the waist pin
// ring) so full-circumference waistbands and sashes hug the waist instead of
// spearing horizontally through the abdomen.
export function placeAttachWaist(positions2D, dims, zSign = 1) {
  const topWorldY = dims.hipY + dims.span * 0.44
  const zScale = dims.female ? 0.72 : 0.78
  const cx = bboxCenterX(positions2D)
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const baseR = Math.max(dims.waistR * 0.95, radiusAtHeight(dims, worldY)) * 1.18
    const rEff = baseR * (1 + zScale) * 0.5
    const phi = cm(xCm - cx) / rEff
    const rOut = baseR + 0.008 * (Math.abs(phi) / Math.PI)
    return [rOut * Math.sin(phi), worldY, zSign * rOut * zScale * Math.cos(phi)]
  })
}

// Hem-attached: godet/tier/elastic-band — wrapped outside the lower-hip/thigh
// surface rather than flat inside the leg collision capsule.
export function placeAttachHem(positions2D, dims, side = 0) {
  const topWorldY = dims.hipY - dims.legLen * 0.1
  const cx = bboxCenterX(positions2D)
  const thetaCenter = side * Math.PI * 0.35
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const r = Math.max(dims.hipR * 0.9, radiusAtHeight(dims, worldY)) * 1.2
    const phi = thetaCenter + cm(xCm - cx) / r
    const rOut = r + 0.006 * (Math.abs(phi) / Math.PI)
    return [rOut * Math.sin(phi), worldY, rOut * Math.cos(phi)]
  })
}

// Generic small body accessory: pocket/facing/lining/cuff/cup/gusset —
// wrapped outside the chest/ribcage collision surface (above the waist pin
// band so seamed accessories pull freely to their target edges).
export function placeAttachBody(positions2D, dims, zSign = 1) {
  const topWorldY = dims.hipY + dims.span * 0.62
  const cx = bboxCenterX(positions2D)
  return positions2D.map(([xCm, yCm]) => {
    const worldY = topWorldY - cm(yCm)
    const r = radiusAtHeight(dims, worldY) * 1.22
    const phi = cm(xCm - cx) / r
    const rOut = r + 0.006 * (Math.abs(phi) / Math.PI)
    return [rOut * Math.sin(phi), worldY, zSign * rOut * Math.cos(phi)]
  })
}

// Dispatch by piece role + id (sleeveL/sleeveR, and WP-6's bilateral-
// duplicated `_l`/`_r` suffixes, need opposite `side`). `*Back` variants of
// the attachment roles are distinct role strings (not a boolean field)
// specifically so triangulate.js's {pieceId,role,positions2D,...} shape
// (used unmodified) never needs a new field threaded through it.
export function placePiece(triangulated, dims) {
  const { pieceId, role, positions2D, placementHint } = triangulated
  const side = (pieceId.endsWith('L') || pieceId.endsWith('_l')) ? -1 : 1
  const attachSide = (pieceId.endsWith('L') || pieceId.endsWith('_l')) ? -1
    : (pieceId.endsWith('R') || pieceId.endsWith('_r')) ? 1 : 0
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
  if (role === 'legFront') return placeLegPanel(positions2D, dims, { side, zSign: 1, easeFactor: 1.15 })
  if (role === 'legBack') return placeLegPanel(positions2D, dims, { side, zSign: -1, easeFactor: 1.2 })
  if (role === 'goreFront') return placeGorePanel(positions2D, dims, 0)
  if (role === 'goreBack') return placeGorePanel(positions2D, dims, Math.PI)
  if (role === 'goreSideLeft') return placeGorePanel(positions2D, dims, -Math.PI / 2)
  if (role === 'goreSideRight') return placeGorePanel(positions2D, dims, Math.PI / 2)
  if (role === 'attachNeck') return placeAttachNeck(positions2D, dims, attachSide)
  if (role === 'attachWaist') return placeAttachWaist(positions2D, dims, 1)
  if (role === 'attachWaistBack') return placeAttachWaist(positions2D, dims, -1)
  if (role === 'attachHem') return placeAttachHem(positions2D, dims, attachSide)
  if (role === 'attachBody') return placeAttachBody(positions2D, dims, 1)
  if (role === 'attachBodyBack') return placeAttachBody(positions2D, dims, -1)
  throw new Error(`placePiece: no placement heuristic for role "${role}"`)
}
