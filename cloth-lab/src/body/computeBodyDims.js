// Ported from the production app's js/three-view.js buildProcedural() —
// this is the single source of truth for body proportions that the avatar
// mesh, garment placement, and collision rig all derive from. Kept as a
// pure function (no Three.js/scene-graph side effects) so it's trivially
// reusable and testable outside a render loop.
//
// All lengths are meters (SI) — the whole app after this boundary stays in
// meters/kg/seconds so plain gravity (0,-9.81,0) applies with no hidden
// scale factor (a classic "cloth explodes / doesn't move" bug class).
const cm = (v) => v * 0.01
const radiusFromCirc = (circ) => cm(circ) / (2 * Math.PI)

export function computeBodyDims(measurements, category) {
  const m = measurements
  const female = category === 'women' || category === 'girls'
  const kid = category === 'girls' || category === 'boys'

  const H = cm(m.height)
  const headH = H * (kid ? 0.16 : 0.128)
  const neckTopY = H - headH
  const shoulderY = H * (kid ? 0.80 : 0.82)
  const hipY = H * (kid ? 0.47 : 0.52)

  let chestR = radiusFromCirc(m.chest)
  let waistR = radiusFromCirc(m.waist)
  let hipR = radiusFromCirc(m.hips)
  let shoulderHalf = cm(m.shoulder) / 2
  const neckR = radiusFromCirc(m.neck) * 0.85

  if (female) {
    waistR *= 0.86
    hipR *= 1.03
  } else {
    waistR *= 0.97
    shoulderHalf *= 1.07
    chestR *= 1.03
  }
  if (kid) {
    waistR = ((waistR + chestR) / 2) * 0.96
    hipR *= 0.97
    shoulderHalf *= 0.98
  }

  const span = shoulderY - hipY
  // WP-8.1: prefer the user's own sleeve/inseam measurements over the
  // height-fraction formula — two people the same height can have very
  // different limb proportions, and both are already-collected
  // measurements the formula was ignoring. Fall back to the formula only
  // when the measurement is missing/zero (an incomplete measurement set),
  // never silently substituting a formula value over a real one.
  const armLen = m.sleeve ? cm(m.sleeve) : H * (kid ? 0.40 : 0.44)
  const upperR = radiusFromCirc(m.bicep) * (female ? 0.9 : 1.0)
  const legLen = m.inseam ? cm(m.inseam) : hipY
  const thighR = radiusFromCirc(m.thigh) * (female ? 1.0 : 0.98)

  return {
    female, kid, H, headH, neckTopY, shoulderY, hipY, span,
    chestR, waistR, hipR, shoulderHalf, neckR, armLen, upperR, legLen, thighR,
  }
}

// Torso lathe profile (radius, y) pairs, revolved around the vertical axis —
// same curve buildProcedural() uses for the body mesh. Returned separately
// (rather than baked into computeBodyDims) since only the avatar mesh needs
// it — garment placement (pattern/placement.js) and collision
// (body/collisionRig.js) don't call this at all; they carry their OWN
// hardcoded copies of the same three load-bearing anchor heights (waist at
// `hipY + span*0.44`, chest at `hipY + span*0.76`, shoulder-base at
// `shoulderY - span*0.03` — grep those files for `0.44`/`0.76` to see every
// site). This curve got a real pass for a more human, less straight-
// segment silhouette (an actual waist-to-ribcage-to-bust S-curve instead of
// three lerped lines), but every one of those three anchor Y values —
// AND the exact scalar radius (waistR/chestR) at each — is kept byte-for-
// byte identical to before that pass specifically so it never drifts out
// of sync with those other files' own copies; only the curve BETWEEN the
// anchors changed.
//
// Capped at 9 points (8 lathe segments), not more: deriveCollisionRig()
// (body/collisionRig.js) builds ONE collision capsule per consecutive pair
// of these points, and its own MAX_COLLISION_CAPSULES (a hard GLSL
// uniform-array-size limit, not a soft budget) only leaves room for 8 of
// its 16 total capsules here once the neck/head/shoulders/arms/hip-thigh
// primitives it also builds are accounted for — confirmed by
// collisionRig.test.js's own "never exceeds MAX_COLLISION_CAPSULES" check,
// which is exactly what caught this the first time this profile grew past
// 9 points. 2 more points than the pre-this-pass 7 is still a real
// smoothing win (splits both the hip->waist and waist->chest jumps, the
// two biggest single-segment gaps in the original curve, into a two-stage
// taper instead of one straight lerp).
export function torsoProfile(dims) {
  const { hipR, waistR, chestR, neckR, hipY, shoulderY, span, female } = dims
  return [
    [hipR * 0.55, hipY - span * 0.16],
    [hipR * 0.98, hipY],
    [hipR, hipY + span * 0.05],
    [hipR * 0.94, hipY + span * 0.22], // hip->waist smoothing point
    [waistR, hipY + span * 0.44], // waist anchor — see this function's own header
    [waistR * 1.07, hipY + span * 0.58], // waist->chest smoothing point (ribcage flare)
    [chestR * (female ? 0.98 : 1.02), hipY + span * 0.76], // chest anchor — see this function's own header
    [chestR * (female ? 0.9 : 1.06), shoulderY - span * 0.03], // shoulder-base anchor — see this function's own header
    [neckR * 1.15, shoulderY + span * 0.02],
  ]
}

// Arm/leg lathe profiles, in the limb's own LOCAL space (y=0 at the
// shoulder/hip pivot, decreasing downward toward the hand/ankle) — same
// revolve-a-curve technique as torsoProfile, used in place of Avatar.jsx's
// earlier 3-stacked-capsules-plus-a-ball-joint-sphere construction. That
// construction is exactly what an artist's wooden posing mannequin looks
// like (it's literally built the same way, for the same reason: cheap
// articulation) — a single continuously-tapered lathe mesh per limb has no
// joint seams to read as "toy" in the first place.
//
// A first pass kept this a smooth MONOTONIC taper (no bicep/calf bulge),
// on the theory that any bulge risked looking lumpy at this vertex budget.
// Revisited for a more human silhouette: a SUBTLE swell at the bicep/thigh
// and calf — still gentle (a few percent, not a bodybuilder curve) and
// still smoothly blended into the surrounding taper via extra lathe
// points either side of each swell, so there's no sharp radius jump for
// "lumpy" to actually mean. The elbow/knee themselves get a small pinch
// (the narrowest point on the whole limb) right where a real joint reads
// as narrower than the muscle above and below it.
export function armProfile(dims) {
  const { armLen, upperR } = dims
  return [
    // Wider than the arm's own taper for just this first point — reaches
    // into the torso's silhouette at the shoulder instead of abutting it,
    // closing the small gap a same-radius join left at the seam.
    [upperR * 1.4, 0],
    [upperR * 1.04, -armLen * 0.10], // bicep swell
    [upperR * 0.98, -armLen * 0.22],
    [upperR * 0.80, -armLen * 0.38],
    [upperR * 0.70, -armLen * 0.44], // elbow pinch
    [upperR * 0.64, -armLen * 0.52],
    [upperR * 0.54, -armLen * 0.66],
    [upperR * 0.44, -armLen * 0.82],
    [upperR * 0.36, -armLen * 0.94],
    [upperR * 0.32, -armLen * 1.0], // wrist — this exact Y is where the hand attaches, see Avatar.jsx
  ]
}

export function legProfile(dims) {
  const { legLen, thighR } = dims
  return [
    // Same reasoning as armProfile's first point: wider than the leg's own
    // taper so it reaches up into the hip/torso silhouette at the join.
    [thighR * 1.3, 0],
    [thighR * 0.98, -legLen * 0.12], // thigh swell
    [thighR * 0.86, -legLen * 0.28],
    [thighR * 0.64, -legLen * 0.46],
    [thighR * 0.56, -legLen * 0.52], // knee pinch
    [thighR * 0.62, -legLen * 0.60], // calf swell
    [thighR * 0.54, -legLen * 0.70],
    [thighR * 0.44, -legLen * 0.83],
    [thighR * 0.38, -legLen * 0.92], // ankle — this exact Y is where the foot attaches, see Avatar.jsx
  ]
}
