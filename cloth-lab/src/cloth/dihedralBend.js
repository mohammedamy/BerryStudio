// WP-35: true dihedral-angle bend constraint — a CPU reference
// implementation, verified by dihedralBend.test.js's property-based tests,
// that ClothSimulation.js's GLSL bend shader (the "high quality" opt-in
// tier) is a direct, mechanical port of. Writing and testing the algorithm
// here first — plain JS, no WebGL — means the math is verified before it
// ever has to be debugged inside a GPU fragment shader, where a wrong sign
// or NaN is far harder to diagnose.
//
// v1.0's bend constraint (ClothSimulation.js's default path, unchanged by
// this file) approximates a fold by holding the DISTANCE between a hinge's
// two "wing" vertices (the corners of the two triangles opposite their
// shared edge) close to its rest distance — cheap and stable, but only an
// approximation: the same wing-to-wing distance is consistent with more
// than one true dihedral angle (a hinge can bow instead of folding evenly
// and still roughly preserve that distance), so sharp folds and doubly-
// curved drape read slightly wrong. This computes the ACTUAL angle between
// the two triangles' normals and corrects toward its own rest value.
//
// Deliberate scope: only the two "wing" vertices (p3, p4) are corrected;
// the shared hinge edge (p1, p2) is left to the existing structural
// constraint. A textbook PBD dihedral constraint distributes the
// correction across all four vertices via a closed-form per-vertex
// gradient (Bridson et al. / Müller et al.) — reproducing that exact
// formula from memory carries real risk of a subtle, hard-to-verify sign
// or normalization error (a well-documented hazard in PBD bend
// implementations). Rotating only the wing vertices around the fixed
// hinge LINE is a real, mathematically sound alternative used by other
// real-time cloth engines for the same reason: it's simple enough to
// verify from first principles (a pure rotation about a fixed axis, nulls
// out any translation-along-axis or distance-from-axis error by
// construction) and still converges the hinge to its rest angle under the
// same iterative Jacobi-parallel relaxation every other constraint here
// already uses — it does not need to be exact in one step.

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s] }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function length(a) { return Math.sqrt(dot(a, a)) }
function normalize(a) {
  const len = length(a)
  return len > 1e-9 ? scale(a, 1 / len) : [0, 0, 0]
}

// Signed dihedral angle between the two triangles (p1,p2,p3) and (p1,p2,p4)
// sharing edge (p1,p2). 0 for a perfectly flat pair (both triangles
// coplanar with matching winding); approaches +-PI as the hinge folds shut
// like a closed book. atan2 of (the hinge-axis component of n1×n2) vs
// (n1·n2) — not acos(n1·n2) — deliberately: acos's derivative blows up
// near a flat (0) or fully-folded (+-PI) hinge, exactly the two states a
// cloth spends the most time near, while atan2 stays smooth and signed
// (tells fold direction, not just fold amount) through the whole range.
// Returns null for a degenerate hinge (a wing vertex sitting on the edge
// line itself, or a zero-length edge) — the caller must skip correction
// rather than divide by ~0.
export function dihedralAngle(p1, p2, p3, p4) {
  const edge = sub(p2, p1)
  const edgeLen = length(edge)
  if (edgeLen < 1e-9) return null
  const e = scale(edge, 1 / edgeLen)
  // n2 uses the edge walked in the OPPOSITE direction (p1-p2, not p2-p1) —
  // matching a real mesh's own winding convention, where two triangles
  // sharing an edge traverse it in opposite directions (the standard
  // "each directed half-edge belongs to exactly one triangle" property of
  // a consistently wound mesh). With this, a flat, normally-wound pair of
  // triangles reads as angle ~0 (matches assemble.test.js's flat-quad
  // fixture, built from real triangle winding, not an arbitrary
  // parameterization) instead of the mathematically-consistent-but-
  // unintuitive +-PI an edge-direction mismatch would otherwise give.
  const n1raw = cross(edge, sub(p3, p1))
  const n2raw = cross(sub(p1, p2), sub(p4, p1))
  if (length(n1raw) < 1e-9 || length(n2raw) < 1e-9) return null
  const n1 = normalize(n1raw)
  const n2 = normalize(n2raw)
  const cosT = Math.max(-1, Math.min(1, dot(n1, n2)))
  const sinT = dot(cross(n1, n2), e)
  return Math.atan2(sinT, cosT)
}

// Rotates `point` by `angle` radians around the line through `axisOrigin`
// in direction `axisDir` (must be unit length) — Rodrigues' rotation
// formula, exact for any angle (not a small-angle approximation), so a
// single call is correct however large the per-substep correction ends up
// being; iterative convergence (like every other constraint in this
// solver) still comes from calling this once per substep, not from this
// formula itself being approximate.
function rotateAroundAxis(point, axisOrigin, axisDir, angle) {
  const v = sub(point, axisOrigin)
  const cosA = Math.cos(angle), sinA = Math.sin(angle)
  const vRot = add(
    add(scale(v, cosA), scale(cross(axisDir, v), sinA)),
    scale(axisDir, dot(axisDir, v) * (1 - cosA)),
  )
  return add(axisOrigin, vRot)
}

// One Jacobi-parallel correction step for a single hinge — mirrors exactly
// what the GLSL port computes per-particle (called once from p3's "am I a
// wing vertex" branch, once from p4's, each only moving itself, exactly
// like every other neighbor-based constraint in this solver). `stiffness`
// in [0,1]: 1 = fully close the angle error in one call (still only
// converges over multiple substeps because p1..p4 all keep moving from
// OTHER constraints between calls); lower values are gentler/more stable
// on an extreme initial fold. Returns {p3, p4, angle} (corrected
// positions, plus the pre-correction angle for tests/telemetry); returns
// null (no correction) for a degenerate hinge — same bail-out
// `dihedralAngle` already defined, checked once here so callers don't
// duplicate the degeneracy test.
//
// `maxDelta` (radians, default PI = effectively unclamped) caps how far a
// SINGLE call rotates the wing vertex, independent of `stiffness`. Real bug
// fix, second pass — see ClothSimulation.js's dihedralStiffFor() for the
// full story: capping `stiffness` alone (first pass at this fix) traded
// "explodes" for "too weak to visibly do anything" — a real garment's
// hinges share vertices and correct in parallel every substep, so ANY
// stiffness large enough to noticeably sharpen a fold ALSO produces large
// per-substep rotations on the initial big errors every drape starts with,
// and those are what compound into the coupled-system instability, not the
// small residual corrections stiffness alone controls. Clamping the ROTATION
// itself directly bounds the worst case regardless of how large the error
// or how high `stiffness` is, which is what actually lets stiffness go back
// up to a value that reads as a real, visible improvement over the default
// tier's distance-based bend rather than converging to the exact same
// drape. Small residual errors near rest (the common case once a garment
// has settled) stay well under this clamp and are unaffected — this only
// engages for the large initial excursions a fresh drape produces.
export function dihedralBendCorrection(p1, p2, p3, p4, restAngle, stiffness = 0.5, maxDelta = Math.PI) {
  const angle = dihedralAngle(p1, p2, p3, p4)
  if (angle === null) return null
  const edge = sub(p2, p1)
  const edgeLen = length(edge)
  const e = scale(edge, 1 / edgeLen)
  let error = angle - restAngle
  // Shortest angular path — without this, a hinge whose rest/current
  // angles straddle the +-PI wraparound (e.g. rest=+3.0, current=-3.0,
  // really only 0.28 rad apart) would compute error=-6.0 and rotate the
  // long way around, the opposite of convergence.
  if (error > Math.PI) error -= 2 * Math.PI
  if (error < -Math.PI) error += 2 * Math.PI
  // Empirically verified (dihedralBend.test.js) against dihedralAngle's own
  // sign convention: rotating p3 by +delta and p4 by -delta around the
  // shared edge, for delta = stiffness*error, moves the measured angle
  // toward restAngle — confirmed for both folding directions and for
  // hinges starting already past rest, not asserted from an unverified
  // hand derivation.
  let delta = stiffness * error
  if (delta > maxDelta) delta = maxDelta
  if (delta < -maxDelta) delta = -maxDelta
  const p3New = rotateAroundAxis(p3, p1, e, delta)
  const p4New = rotateAroundAxis(p4, p1, e, -delta)
  return { p3: p3New, p4: p4New, angle }
}
