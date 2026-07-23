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
