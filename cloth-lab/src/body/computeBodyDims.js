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
  const armLen = H * (kid ? 0.40 : 0.44)
  const upperR = radiusFromCirc(m.bicep) * (female ? 0.9 : 1.0)
  const legLen = hipY
  const thighR = radiusFromCirc(m.thigh) * (female ? 1.0 : 0.98)

  return {
    female, kid, H, headH, neckTopY, shoulderY, hipY, span,
    chestR, waistR, hipR, shoulderHalf, neckR, armLen, upperR, legLen, thighR,
  }
}

// Torso lathe profile (radius, y) pairs, revolved around the vertical axis —
// same curve buildProcedural() uses for the body mesh. Returned separately
// (rather than baked into computeBodyDims) since only the avatar mesh needs
// it — garment placement/collision only need the scalar dims above.
export function torsoProfile(dims) {
  const { hipR, waistR, chestR, neckR, hipY, shoulderY, span, female } = dims
  return [
    [hipR * 0.55, hipY - span * 0.16],
    [hipR * 0.98, hipY],
    [hipR, hipY + span * 0.06],
    [waistR, hipY + span * 0.44],
    [chestR * (female ? 0.98 : 1.02), hipY + span * 0.76],
    [chestR * (female ? 0.9 : 1.06), shoulderY - span * 0.03],
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
// joint seams to read as "toy" in the first place. Deliberately a smooth
// monotonic taper (no bicep/calf bulge) rather than a more anatomically
// exact curve — safe against looking lumpy at this low a vertex budget;
// smooth-but-simplified reads as more real than bumpy-but-ambitious does.
export function armProfile(dims) {
  const { armLen, upperR } = dims
  return [
    // Wider than the arm's own taper for just this first point — reaches
    // into the torso's silhouette at the shoulder instead of abutting it,
    // closing the small gap a same-radius join left at the seam.
    [upperR * 1.4, 0],
    [upperR * 0.94, -armLen * 0.18],
    [upperR * 0.80, -armLen * 0.38],
    [upperR * 0.66, -armLen * 0.58],
    [upperR * 0.50, -armLen * 0.80],
    [upperR * 0.40, -armLen * 0.94],
    [upperR * 0.32, -armLen * 1.0],
  ]
}

export function legProfile(dims) {
  const { legLen, thighR } = dims
  return [
    // Same reasoning as armProfile's first point: wider than the leg's own
    // taper so it reaches up into the hip/torso silhouette at the join.
    [thighR * 1.3, 0],
    [thighR * 0.92, -legLen * 0.16],
    [thighR * 0.70, -legLen * 0.42],
    [thighR * 0.60, -legLen * 0.50],
    [thighR * 0.48, -legLen * 0.68],
    [thighR * 0.40, -legLen * 0.85],
    [thighR * 0.36, -legLen * 0.92],
  ]
}
