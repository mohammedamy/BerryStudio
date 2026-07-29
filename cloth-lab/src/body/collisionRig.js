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

// Shoulder-seam pin zone. Body collision only ever pushes fabric outward
// and damps sliding via friction — it can never fully arrest a slide (see
// ClothSimulation.js's collideCapsule comment), and right at the shoulder,
// where a garment's weight most needs to be caught, the surface curves
// steeply enough that gravity's pull is mostly ALONG it rather than into
// it, which starves the friction model's static budget at exactly the
// point it matters most. A real T-shirt doesn't stay up through friction —
// the shoulder SEAM is a hard structural anchor, stitched fabric that
// can't slide past that point without stretching. This derives the
// equivalent: a short line segment per side, from near the neckline to the
// shoulder/arm joint (the second endpoint matches deriveCollisionRig's own
// arm-capsule pivot exactly, so the pin zone and the visible joint agree).
// Any sim particle whose REST position lands within PIN_RADIUS of either
// segment should be held fixed — see ClothSimulation.js's existing
// (previously unused) `pinned` flag, and deriveShoulderPinMask below which
// turns this into the per-particle mask that flag consumes.
const SHOULDER_PIN_RADIUS = 0.05 // 5cm — wide enough to catch a small cluster, not just 1-2 isolated vertices (which pinned a sharp point rather than a soft anchored region)

export function deriveShoulderPinSegments(dims) {
  const { shoulderHalf, shoulderY, span } = dims
  return [-1, 1].map((side) => ([
    [side * shoulderHalf * 0.15, shoulderY + span * 0.02, 0],
    [side * shoulderHalf * 0.95, shoulderY - span * 0.04, 0],
  ]))
}

function distToSegment(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]
  const abLen2 = abx * abx + aby * aby + abz * abz
  const t = abLen2 > 1e-10
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / abLen2))
    : 0
  const cx = a[0] + abx * t, cy = a[1] + aby * t, cz = a[2] + abz * t
  return Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz)
}

// `simRestPositions`/`simParticleCount` come straight off assembleCloth's
// returned `cloth` object — purely geometric (rest position only), so this
// works unchanged for the default T-shirt, any bridge-imported garment, or
// a seam-authored one: a garment with no fabric near the shoulder (a
// skirt, an off-shoulder top) simply gets an all-zero mask, same
// friction-only behavior as before this fix.
export function deriveShoulderPinMask(simRestPositions, simParticleCount, dims) {
  const segments = deriveShoulderPinSegments(dims)
  const mask = new Uint8Array(simParticleCount)
  for (let i = 0; i < simParticleCount; i++) {
    const p = [simRestPositions[i * 3], simRestPositions[i * 3 + 1], simRestPositions[i * 3 + 2]]
    for (const [a, b] of segments) {
      if (distToSegment(p, a, b) < SHOULDER_PIN_RADIUS) { mask[i] = 1; break }
    }
  }
  return mask
}

// WP-7.5 waistband pin zone — same rationale as the shoulder pin above
// (friction alone can slow a slide but never fully arrest one; a fitted
// waistband is a hard structural anchor, elastic sewn to a fixed
// circumference, that a real garment can't slide down past), but the
// anchor geometry is a horizontal RING around the body rather than a short
// line segment per side, so this needs its own (cylindrical, not
// segment-distance) test rather than reusing distToSegment. Anchored at
// `hipY + span*0.44` — the same waist keypoint torsoProfile/placement.js's
// placeHipPanel/placeGorePanel already use, so the pin ring lines up with
// where a waistband/hip-panel piece actually gets placed.
const WAISTBAND_HEIGHT_TOLERANCE = 0.045 // 4.5cm vertical band
const WAISTBAND_RADIAL_TOLERANCE = 0.05 // 5cm outward from the body's own waist radius — catches a waistband/fitted-skirt-top's own particles without also grabbing loose torso fabric well clear of the surface

export function deriveWaistbandPinRing(dims) {
  const { hipY, span, waistR, female } = dims
  return { y: hipY + span * 0.44, r: waistR, zScale: female ? 0.72 : 0.78 }
}

// `simRestPositions`/`simParticleCount` come straight off assembleCloth's
// returned `cloth` object, same as deriveShoulderPinMask — a garment with
// no fabric near the waist (a top, a cape) simply gets an all-zero mask.
export function deriveWaistbandPinMask(simRestPositions, simParticleCount, dims) {
  const { y: waistY, r: waistR, zScale } = deriveWaistbandPinRing(dims)
  const mask = new Uint8Array(simParticleCount)
  for (let i = 0; i < simParticleCount; i++) {
    const px = simRestPositions[i * 3], py = simRestPositions[i * 3 + 1], pz = simRestPositions[i * 3 + 2]
    if (Math.abs(py - waistY) > WAISTBAND_HEIGHT_TOLERANCE) continue
    const pr = Math.hypot(px, pz / zScale) // unsquash Z the same way collideCapsule does, for an elliptical cross-section
    if (Math.abs(pr - waistR) < WAISTBAND_RADIAL_TOLERANCE) mask[i] = 1
  }
  return mask
}
