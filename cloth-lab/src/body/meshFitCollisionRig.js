import * as THREE from 'three'
import { torsoProfile } from './computeBodyDims.js'
import { deriveCollisionRig } from './collisionRig.js'

// WP-8.3 (plan's own numbering: WP-8 item 3) — mesh-fit collision rig for a
// loaded GLB avatar: measure the ACTUAL mesh surface at known heights
// instead of trusting the same formula-derived taper every procedural
// avatar uses, so the collision capsules a real, arbitrarily-proportioned
// GLB body actually agrees with what's on screen.
//
// Scope, and why: THREE.Raycaster intersects a SkinnedMesh's BIND-POSE
// geometry transformed by matrixWorld — it does not run the vertex-shader
// skinning deformation on the CPU, so a raycast against a bone-POSED region
// gives the wrong (rest-pose) answer. reposeGLB.js's applyArmsDownRepose
// only ever rotates the arm bones (see its own header comment) — torso,
// hip, and leg geometry stays exactly in bind pose after normalization, so
// raycasting is reliable there and only there. This measures the
// TORSO/HIP cross-section (the region that actually matters for how a
// garment's bodice/waist/hip drapes) and leaves arms/neck/head/legs on the
// existing formula-derived primitives — an honest, documented split, not a
// silent gap: `deriveMeshFitCollisionRig`'s return always has the same
// primitive count/shape as `deriveCollisionRig`, just with the torso
// segment's radii replaced where a real measurement was found.
const RAY_SAMPLES = 12
const FAR_DISTANCE = 3 // meters — comfortably outside any human torso radius

// Casts `samples` rays around a horizontal ellipse (matching collisionRig's
// own zScale front/back squash convention) at world height `y`, toward the
// vertical center axis, and returns the MAX measured radius (the outward-
// facing surface, robust to casting through gaps like an open jacket
// front) — or null if nothing was hit at all (a height above the head, or
// through a real gap in the mesh, e.g. a legs-apart pose at crotch height).
export function measureMeshRadiusAtHeight(scene, y, zScale = 1, samples = RAY_SAMPLES) {
  const raycaster = new THREE.Raycaster()
  let maxR = null
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2
    const dirX = Math.sin(theta), dirZ = Math.cos(theta) * zScale
    const dirLen = Math.hypot(dirX, dirZ) || 1
    const originX = (dirX / dirLen) * FAR_DISTANCE, originZ = (dirZ / dirLen) * FAR_DISTANCE
    const origin = new THREE.Vector3(originX, y, originZ)
    const toCenter = new THREE.Vector3(-originX, 0, -originZ).normalize()
    raycaster.set(origin, toCenter)
    const hits = raycaster.intersectObject(scene, true)
    if (hits.length === 0) continue
    const r = FAR_DISTANCE - hits[0].distance
    if (r > 0 && (maxR === null || r > maxR)) maxR = r
  }
  return maxR
}

// Drop-in alternative to deriveCollisionRig: same {a,b,ra,rb,zScale}[]
// shape, torso-region radii replaced with real measurements where found.
// `formulaRig`/`formulaProfile` are both derivable from `dims` alone, but
// accepting them as params keeps this a pure function of its real inputs
// for testing (a mock scene + hand-built formula rig/profile) rather than
// needing a real GLTF scene graph in every test.
export function deriveMeshFitCollisionRig(scene, dims, { formulaRig = deriveCollisionRig(dims), formulaProfile = torsoProfile(dims) } = {}) {
  const zScale = dims.female ? 0.72 : 0.78
  // torsoProfile's own keypoints ARE the same (r, y) pairs deriveCollisionRig
  // chains into consecutive capsule segments for the torso — segment i of
  // the rig's first (formulaProfile.length - 1) primitives spans
  // formulaProfile[i] -> formulaProfile[i+1] (see deriveCollisionRig's own
  // construction loop), so replacing measured radii at those same keypoints
  // keeps every segment's fit consistent with its neighbors.
  const measuredR = formulaProfile.map(([, y]) => measureMeshRadiusAtHeight(scene, y, zScale))

  const rig = formulaRig.map((p) => ({ ...p }))
  for (let i = 0; i < formulaProfile.length - 1; i++) {
    const seg = rig[i]
    if (measuredR[i] !== null) seg.ra = measuredR[i]
    if (measuredR[i + 1] !== null) seg.rb = measuredR[i + 1]
  }
  return rig
}
