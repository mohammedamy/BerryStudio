// Front/back torso sculpting for the female avatar — user-requested: "it
// should have a breast and a lower back so its front body differ
// significantly from back body." Before this, the torso was a single
// THREE.LatheGeometry (a surface of revolution) with a uniform Z flatten —
// by construction that's radially symmetric, so the front and back were
// IDENTICAL apart from two small spheres glued onto the front for a bust.
// Rotating the avatar 180° showed the same torso either way.
//
// A lathe can't express front/back asymmetry on its own (one profile,
// revolved uniformly), so this displaces the torso mesh's own vertices
// after the lathe is built: a breast bulge (front, two separate lobes with
// a flat "valley" between them — see the phi-domain reasoning below, not
// one central mound) and a lower-back curve (a concave lumbar dip above a
// convex glute swell, back only). The displacement is purely additive in Z
// (front/back depth), gated by smooth 0..1 windows in Y (how far up/down
// the torso a feature reaches) and phi (the lathe's own revolve angle —
// see torsoZBump's own header for the x=r*sin(phi), z=r*cos(phi)
// convention this all keys off), so every window tapers to exactly 0 well
// before it would visibly distort the torso's own silhouette outline
// (hip/waist/chest radius, still exactly torsoProfile()'s numbers).
//
// Shared by Avatar.jsx (which builds the actual displaced mesh) and
// collisionRig.js (which needs the exact same numbers to size a collision
// margin so the sculpted mesh can never poke through its own collision
// capsule — see femaleTorsoExtraRadius below) so the two can never drift
// out of sync with each other. js/three-view.js is a separate,
// independently-implemented port (this repo's established convention for
// that file — it's not an ES module cloth-lab can import) and carries its
// own hand-matched copy of these same numbers; that file has no physics
// collision system to keep in sync with (its garments are a fixed static
// shell, not a cloth sim), so it only needs the visual half of this.

// A raised-cosine bump: 1 at `center`, falling smoothly to 0 by
// `center +/- halfWidth`, exactly 0 beyond that. Used for every window
// below — Y falloff (how far a feature reaches up/down the torso) and,
// for the breast, the phi falloff of each individual lobe.
export function bumpWindow(x, center, halfWidth) {
  const d = Math.abs(x - center)
  return d >= halfWidth ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / halfWidth))
}

// dims -> the three named sculpt windows. Amplitudes are deliberately
// modest fractions of the body's own measured radii (not fixed constants)
// so the bump scales with the avatar's actual size, and were sized against
// js/three-view.js's static bodice/skirt garment shell specifically (the
// tightest-fitting, least-forgiving consumer of this mesh — cloth-lab's
// own collision system adjusts its margin automatically instead, see
// femaleTorsoExtraRadius, but both apps use the same numbers for one
// consistent silhouette).
export function femaleTorsoSculpt(dims) {
  const { hipY, span, chestR, waistR, hipR } = dims
  return {
    // Two lobes, not one central mound: phi0 is each lobe's own center
    // angle (radians either side of dead-center-front), phiHalfWidth is
    // narrower than phi0 so the two windows' zero-crossings meet (or pass)
    // before phi=0 — the "valley" between them is an exact, deliberate 0,
    // not an approximation (see torsoZBump's own test coverage).
    breast: { centerY: hipY + span * 0.72, halfWidth: span * 0.13, amplitude: chestR * 0.10, phi0: 0.5, phiHalfWidth: 0.42 },
    lumbar: { centerY: hipY + span * 0.38, halfWidth: span * 0.12, amplitude: waistR * 0.10 },
    glute: { centerY: hipY - span * 0.02, halfWidth: span * 0.10, amplitude: hipR * 0.14 },
  }
}

// The Z displacement (meters) at a torso vertex's height `y` and lathe
// angle `phi` — apply this AFTER baking any Z flatten/squash into the
// vertex's own z (i.e. this is a real, already-in-real-space delta, not a
// pre-squash one that a later uniform scale would shrink). `phi` follows
// three.js's own LatheGeometry convention: x=r*sin(phi), z=r*cos(phi), so
// phi=0 is straight ahead (+Z, front), phi=+-PI/2 is the left/right side
// seam, phi=+-PI is straight back.
export function torsoZBump(y, phi, dims) {
  const { breast, lumbar, glute } = femaleTorsoSculpt(dims)
  let dz = 0
  // Breast: front z is positive, so pushing it further out (a real bulge)
  // is a positive delta. Each lobe is its own raised-cosine window in phi,
  // centered at +-phi0 — at phi=0 (dead center, the "cleavage" line) both
  // windows have already fallen to exactly 0, so the sculpted surface
  // reads as two separate forms, not a single central chest bump.
  const lobe = bumpWindow(phi, breast.phi0, breast.phiHalfWidth) + bumpWindow(phi, -breast.phi0, breast.phiHalfWidth)
  dz += breast.amplitude * bumpWindow(y, breast.centerY, breast.halfWidth) * lobe
  // Lower back: back z is negative, so "pull the surface toward the spine"
  // (lumbar concave) is a positive delta (less negative) and "push it
  // further back" (glute convex) is a negative delta (more negative).
  // Both centered on phi=PI (straight back), single-lobed — unlike the
  // breast, a low-poly stylized mannequin's back doesn't need two separate
  // cheeks to read as a real lower back/hip curve.
  const backWeight = Math.max(0, -Math.cos(phi)) // 1 at phi=PI, 0 at the side seams
  dz += lumbar.amplitude * bumpWindow(y, lumbar.centerY, lumbar.halfWidth) * backWeight
  dz -= glute.amplitude * bumpWindow(y, glute.centerY, glute.halfWidth) * backWeight
  return dz
}

// How much extra radius collisionRig.js's torso primitives need at height
// `y` (added to the plain torsoProfile() radius, before the elliptical
// zScale squash) so the collision capsule they describe never sits INSIDE
// the sculpted mesh above — i.e. so cloth resting exactly on the collision
// surface can never end up visibly clipping through the breast/glute
// bulge. The lumbar dip needs no margin at all (it moves the surface
// TOWARD the axis, the safe direction) and is left out of the max below.
//
// Computed by direct numeric search over sampled angles rather than a
// closed-form inequality: the breast's raised-cosine lobe and the ambient
// cos(phi) the ellipse itself follows have different curvature near their
// shared peak, so a formula solved only at the exact peak angle (phi0)
// undershoots slightly just off it (confirmed by hand before this was
// rewritten to sample instead: at phi0=0.5, phiHalfWidth=0.42, the
// peak-only formula left an ~0.5% shortfall right next to the peak).
// Sampling many angles and taking the max avoids relying on that
// assumption ever holding, and stays correct through any future retuning
// of femaleTorsoSculpt's own numbers without needing to re-derive anything
// by hand.
export function femaleTorsoExtraRadius(y, dims, zScale, samples = 96) {
  let maxExtra = 0
  for (let i = 0; i <= samples; i++) {
    const phi = -Math.PI + (2 * Math.PI * i) / samples
    const c = Math.cos(phi)
    if (Math.abs(c) < 1e-6) continue // side seam — z is ~0 regardless of radius, nothing to protect
    const dz = torsoZBump(y, phi, dims)
    if (dz === 0) continue
    // (r+e)*zScale*c must stay on the outward side of r*zScale*c + dz, for
    // whichever direction c pushes (c>0 front, c<0 back): e*zScale*c and
    // dz always share a sign by construction (breast only adds dz where
    // c>0, back features only where c<0), so dividing through is safe.
    const needed = dz / (zScale * c)
    if (needed > maxExtra) maxExtra = needed
  }
  return maxExtra * 1.03 // cushion for the gaps between sampled angles
}
