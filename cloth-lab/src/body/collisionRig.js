import { torsoProfile } from './computeBodyDims.js'

// Tapered-capsule ("round cone": distance-to-segment + linearly-interpolated
// radius) collision primitives — a pure function of computeBodyDims()'s
// output, recomputed only when measurements/category change, never per-frame.
//
// Deliberately matches the VISIBLE Avatar.jsx mesh (same torsoProfile points,
// same neck/head/shoulder/arm placements), not the cloth-placement heuristic
// in pattern/placement.js — collision's job is "don't let cloth clip through
// what the user sees," and placement is already its own independent, looser
// approximation by design (see that file's own comment).
//
// `zScale` lets a primitive collide against an ELLIPTICAL cross-section
// instead of a circular one — the torso mesh itself is squashed in Z
// (Avatar.jsx: scale={[1,1,female?0.72:0.78]}) to read as flatter
// front-to-back than side-to-side, and skipping that in collision would push
// cloth out to a rounder silhouette than the avatar it's draped on.
//
// Arms are a SINGLE tapered segment (shoulder->wrist) rather than the visual
// mesh's 3 stacked capsules — that stacking is itself a "multi-segment hack"
// to fake a taper with a primitive that doesn't support one; collision can
// just use the taper directly, which is both simpler and smoother.
//
// Hip-to-thigh continuation, one exception to the "match the visible mesh"
// rule above: Avatar.jsx draws legs as two SEPARATE capsules (offset ±hipR*
// 0.5, narrow, one per leg) because that's what looks right to the eye. But
// a garment hem drapes around BOTH legs together as one merged outer
// silhouette, same as placement.js's placeHipPanel/radiusBelowHip already
// assumes for where a hip-panel piece (a skirt) gets placed — collide
// against the two separate leg meshes instead and most of a hem ring's
// circumference (front, back, the gap between the legs) has nothing nearby
// to collide with at all. Checked empirically: doing it that way first left
// 83-96% of the T-shirt's own particles uncollided even at its REST pose
// (before any physics), with the hem averaging a 5.8cm gap — and that hem
// already sits below the torso profile's lowest point regardless, which is
// what surfaced this: it free-fell from frame 1 with nothing to catch it,
// before any skirt-like garment existed to make the gap matter. So: one
// centered taper continuing straight down from the torso profile's own
// last point, all the way to thighR — not copying Avatar.jsx's leg meshes.
export function deriveCollisionRig(dims) {
  const { hipY, shoulderY, span, neckTopY, headH, neckR, shoulderHalf, chestR, upperR, armLen, hipR, legLen, thighR, female } = dims
  const zScale = female ? 0.72 : 0.78
  const primitives = []

  const profile = torsoProfile(dims)
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i]
    const [r1, y1] = profile[i + 1]
    primitives.push({ a: [0, y0, 0], b: [0, y1, 0], ra: r0, rb: r1, zScale })
  }

  const neckCenterY = (neckTopY + shoulderY) / 2
  const neckHalfLen = (headH * 0.35) / 2
  primitives.push({
    a: [0, neckCenterY - neckHalfLen, 0], b: [0, neckCenterY + neckHalfLen, 0],
    ra: neckR, rb: neckR, zScale: 1,
  })

  const headCenter = [0, neckTopY + headH * 0.5, 0]
  const headR = headH * 0.48
  primitives.push({ a: headCenter, b: headCenter, ra: headR, rb: headR, zScale: 1 })

  for (const side of [-1, 1]) {
    const shoulderCenter = [side * shoulderHalf * 0.9, shoulderY - span * 0.04, 0]
    primitives.push({ a: shoulderCenter, b: shoulderCenter, ra: chestR * 0.3, rb: chestR * 0.3, zScale: 1 })
  }

  for (const side of [-1, 1]) {
    const pivot = [side * shoulderHalf * 0.95, shoulderY - span * 0.04, 0]
    const theta = side * 0.08 // matches Avatar.jsx's arm group lean rotation
    const wrist = [
      pivot[0] + armLen * Math.sin(theta),
      pivot[1] - armLen * Math.cos(theta),
      pivot[2],
    ]
    primitives.push({ a: pivot, b: wrist, ra: upperR, rb: upperR * 0.55, zScale: 1 })
  }

  // Hip-to-thigh: centered on the body's own axis (X=0), continuing
  // directly from the torso profile's own last point — not two offset
  // per-leg cylinders, see the module comment above. Tapers on to thighR
  // (torsoProfile's own bottom radius, hipR*0.55, is already close to a
  // typical thighR, so this taper is gentle) then runs a flat cylinder
  // further down, giving a flared hip-panel garment (a skirt) real depth
  // to drape into rather than stopping right at the taper.
  const [hipBottomR, hipBottomY] = profile[0]
  const thighTopY = hipBottomY - legLen * 0.18
  const thighBottomY = hipBottomY - legLen * 0.5
  primitives.push({ a: [0, thighTopY, 0], b: [0, hipBottomY, 0], ra: thighR, rb: hipBottomR, zScale })
  primitives.push({ a: [0, thighBottomY, 0], b: [0, thighTopY, 0], ra: thighR, rb: thighR, zScale })

  return primitives
}

export const MAX_COLLISION_CAPSULES = 16
